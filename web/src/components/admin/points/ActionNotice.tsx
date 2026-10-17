import { cx } from "@/lib/cx";
import settingsStyles from "../settings/Settings.module.css";

export type Notice = { text: string; error?: boolean } | null;

/** Pesan hasil server action (sukses / error) di bawah form. */
export function ActionNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={cx(settingsStyles.notice, notice.error && settingsStyles.noticeError)} role={notice.error ? "alert" : "status"}>
      {notice.text}
    </p>
  );
}
