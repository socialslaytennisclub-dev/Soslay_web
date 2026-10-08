import Image from "next/image";
import Link from "next/link";
import type { PhotoAlbum } from "@/server/admin/types";
import { AdminIcon } from "../ui/AdminIcon";
import { Badge } from "../ui/AdminUI";
import styles from "./Content.module.css";

const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });

/** Kartu album per sesi; album tanpa foto tampil sebagai slot upload. */
export function AlbumGrid({ albums }: { albums: PhotoAlbum[] }) {
  return (
    <ul className={styles.albums}>
      {albums.map((a) => (
        <li key={a.id}>
          <Link href={`/admin/activities/${a.sessionId}`} className={styles.album}>
            {a.status === "empty" ? (
              <span className={styles.albumEmpty} title="Upload aktif setelah Supabase Storage tersambung">
                <AdminIcon name="upload-simple" size={22} />
              </span>
            ) : (
              <span className={styles.albumCover}>
                <Image src={a.cover} alt="" fill sizes="(min-width: 1200px) 200px, (min-width: 640px) 33vw, 50vw" />
                <span className={styles.albumBadge}>
                  <Badge tone={a.status === "published" ? "lime" : "neutral"} dot>
                    {a.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </span>
              </span>
            )}
            <span className={styles.albumTitle}>{a.title}</span>
            <span className={styles.muted}>
              {day.format(new Date(a.date))} · {a.status === "empty" ? "belum upload" : `${a.photoCount} foto`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
