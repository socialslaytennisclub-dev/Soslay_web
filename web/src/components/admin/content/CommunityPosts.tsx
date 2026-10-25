"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { cx } from "@/lib/cx";
import { setInstagramPostVisible } from "@/server/admin/actions/content";
import type { CommunityPost } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { Badge, type BadgeTone } from "../ui/AdminUI";
import styles from "./Content.module.css";
import { toast } from "../ui/Toaster";

const KIND: Record<CommunityPost["kind"], { label: string; icon: AdminIconName; tone: BadgeTone }> = {
  instagram: { label: "Instagram", icon: "instagram-logo", tone: "pink" },
  threads: { label: "Threads", icon: "chat-circle-text", tone: "neutral" },
};

/** Tab Testimoni & IG: post Instagram & Threads di feed "See You on the Court!" homepage. */
export function CommunityPosts({ initial }: { initial: CommunityPost[] }) {
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [pending, startToggle] = useTransition();

  const toggle = (p: CommunityPost) => {
    const next = !p.visible;
    const apply = (visible: boolean) => setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, visible } : x)));
    apply(next);
    startToggle(async () => {
      const result = await setInstagramPostVisible(p.handle, next);
      if (!result.ok) apply(!next);
      toast.result(result);
    });
  };
  const shown = posts.filter((p) => filter === "all" || (filter === "visible") === p.visible);

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Post Instagram & Threads</h2>
          <p className={styles.muted}>
            {posts.filter((p) => p.visible).length} tampil di homepage · langsung tersimpan
          </p>
        </div>
        <div className={styles.filterPills} role="group" aria-label="Filter">
          {(
            [
              ["all", "Semua"],
              ["visible", "Tampil"],
              ["hidden", "Disembunyikan"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} className={cx(styles.pill, filter === value && styles.pillOn)} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <ul className={styles.posts}>
        {shown.map((p) => {
          const kind = KIND[p.kind];
          return (
            <li key={p.id} className={cx(styles.post, !p.visible && styles.sectionOff)}>
              {p.image ? (
                <span className={styles.postImage}>
                  <Image src={p.image} alt="" fill sizes="64px" />
                </span>
              ) : (
                <span className={cx(styles.postImage, styles.postQuote)}>
                  <AdminIcon name={kind.icon} size={20} />
                </span>
              )}
              <span className={styles.postText}>
                <span className={styles.postMeta}>
                  <Badge tone={kind.tone}>{kind.label}</Badge>
                  <span className={styles.sectionName}>{p.handle}</span>
                </span>
                <span className={styles.postQuoteText}>“{p.text}”</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={p.visible}
                aria-label={`Tampilkan post ${p.handle}`}
                className={cx(styles.switch, p.visible && styles.switchOn)}
                disabled={pending}
                onClick={() => toggle(p)}
              >
                <span />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
