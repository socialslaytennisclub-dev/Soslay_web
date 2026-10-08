"use client";

import Image from "next/image";
import { useState } from "react";
import { cx } from "@/lib/cx";
import type { CommunityPost } from "@/server/admin/types";
import { AdminIcon, type AdminIconName } from "../ui/AdminIcon";
import { Badge, type BadgeTone } from "../ui/AdminUI";
import styles from "./Content.module.css";

const KIND: Record<CommunityPost["kind"], { label: string; icon: AdminIconName; tone: BadgeTone }> = {
  testimonial: { label: "Testimoni", icon: "chat-circle-text", tone: "indigo" },
  instagram: { label: "Instagram", icon: "instagram-logo", tone: "pink" },
  threads: { label: "Threads", icon: "chat-circle-text", tone: "neutral" },
};

/** Tab Testimoni & IG: kurasi kutipan & post yang tampil di homepage. */
export function CommunityPosts({ initial }: { initial: CommunityPost[] }) {
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const shown = posts.filter((p) => filter === "all" || (filter === "visible") === p.visible);

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Testimoni & post komunitas</h2>
          <p className={styles.muted}>
            {posts.filter((p) => p.visible).length} tampil di homepage · perubahan masih demo (belum tersimpan)
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
                onClick={() => setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, visible: !x.visible } : x)))}
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
