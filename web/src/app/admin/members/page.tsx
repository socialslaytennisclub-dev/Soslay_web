import type { Metadata } from "next";
import Link from "next/link";
import { MembersFilters } from "@/components/admin/members/MembersFilters";
import { MembersTable } from "@/components/admin/members/MembersTable";
import styles from "@/components/admin/members/Members.module.css";
import { AdminTopbar } from "@/components/admin/shell/AdminTopbar";
import { AdminIcon } from "@/components/admin/ui/AdminIcon";
import { AdminButton } from "@/components/admin/ui/AdminUI";
import { cx } from "@/lib/cx";
import { membersHref, parseMembersQuery } from "@/server/admin/query";
import { listMembers, listSegments } from "@/server/admin/repo";
import type { MembersQuery } from "@/server/admin/types";
import pageStyles from "../page.module.css";

export const metadata: Metadata = { title: "Members" };

/** Admin / 02 Members (Figma 25:3767). Semua filter, sort & halaman ada di URL. */
export default async function AdminMembersPage({ searchParams }: PageProps<"/admin/members">) {
  const query = parseMembersQuery(await searchParams);
  const [result, segments] = await Promise.all([listMembers(query), listSegments()]);

  const tabs: { value: NonNullable<MembersQuery["tab"]>; label: string; count: number }[] = [
    { value: "all", label: "Semua", count: result.counts.all },
    { value: "active", label: "Aktif", count: result.counts.active },
    { value: "new", label: "Baru", count: result.counts.new },
    { value: "inactive", label: "Tidak aktif", count: result.counts.inactive },
  ];

  const sortHref = (key: "name" | "points" | "last_played") =>
    membersHref(query, { sort: key, dir: query.sort === key && query.dir === "desc" ? "asc" : key === "name" ? "asc" : "desc", page: 1 });

  const from = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const to = Math.min(result.page * result.pageSize, result.total);
  const pages = pageWindow(result.page, result.pageCount);
  const exportParams = membersHref(query, { page: 1 }).split("?")[1] ?? "";

  return (
    <>
      <AdminTopbar breadcrumb="CRM / Members" title="Members" />
      <div className={pageStyles.content}>
        <div className={styles.toolbar}>
          <nav className={styles.tabs} aria-label="Status member">
            {tabs.map((tab) => (
              <Link
                key={tab.value}
                href={membersHref({ ...query, tab: tab.value, page: 1 })}
                className={cx(styles.tab, query.tab === tab.value && styles.tabActive)}
                aria-current={query.tab === tab.value ? "page" : undefined}
              >
                {tab.label}
                <span className={styles.tabCount}>{tab.count.toLocaleString("id-ID")}</span>
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            <AdminButton href={`/admin/members/export${exportParams ? `?${exportParams}` : ""}`} icon="download-simple" prefetch={false}>
              Export CSV
            </AdminButton>
            <AdminButton variant="primary" icon="user-plus" disabled title="Aktif setelah database Supabase tersambung">
              Tambah member
            </AdminButton>
          </div>
        </div>

        <div className={styles.segments}>
          <span className={styles.segmentsLabel}>Segmen tersimpan</span>
          {segments.map((segment) => (
            <Link key={segment.id} href={membersHref({ ...segment.query, page: 1 })} className={styles.segment}>
              <AdminIcon name="funnel-simple" size={14} />
              {segment.name}
              <span className={styles.segmentCount}>{segment.count}</span>
            </Link>
          ))}
          <span className={styles.saveSegment} title="Aktif setelah database Supabase tersambung">
            <AdminIcon name="plus-bold" size={12} />
            Simpan segmen
          </span>
        </div>

        <section className={styles.panel} aria-label="Daftar member">
          <MembersFilters cities={result.cities} />
          <MembersTable
            items={result.items}
            sort={query.sort ?? "last_played"}
            dir={query.dir ?? "desc"}
            sortHrefs={{ name: sortHref("name"), points: sortHref("points"), last_played: sortHref("last_played") }}
          />
          <div className={styles.pagination}>
            <p className={styles.pageInfo}>
              Menampilkan {from}–{to} dari {result.total.toLocaleString("id-ID")} member
            </p>
            <nav className={styles.pages} aria-label="Halaman">
              <Link href={membersHref(query, { page: result.page - 1 })} className={cx(styles.pageLink, result.page <= 1 && styles.pageDisabled)} aria-label="Sebelumnya">
                <AdminIcon name="caret-left" size={14} />
              </Link>
              {pages.map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className={styles.ellipsis}>
                    …
                  </span>
                ) : (
                  <Link key={p} href={membersHref(query, { page: p })} className={cx(styles.pageLink, p === result.page && styles.pageActive)} aria-current={p === result.page ? "page" : undefined}>
                    {p}
                  </Link>
                ),
              )}
              <Link href={membersHref(query, { page: result.page + 1 })} className={cx(styles.pageLink, result.page >= result.pageCount && styles.pageDisabled)} aria-label="Berikutnya">
                <AdminIcon name="caret-right" size={14} />
              </Link>
            </nav>
          </div>
        </section>
      </div>
    </>
  );
}

/** 1 2 3 … 54 (selalu tampilkan halaman pertama, terakhir, dan sekitar halaman aktif). */
function pageWindow(page: number, count: number): (number | "…")[] {
  const set = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  if (page <= 3) [2, 3].forEach((p) => p <= count && set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["…", p] as const) : [p]));
}
