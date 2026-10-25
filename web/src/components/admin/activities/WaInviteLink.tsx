import { AdminIcon } from "../ui/AdminIcon";
import styles from "./Play.module.css";

/** "Undang Member via WA" (Figma ADM-10): buka WhatsApp ke nomor peserta dengan pesan undangan daftar. */
export function WaInviteLink({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a className={styles.waInvite} href={href} target="_blank" rel="noopener noreferrer">
      <AdminIcon name="whatsapp-logo" size={12} />
      Undang Member via WA
    </a>
  );
}
