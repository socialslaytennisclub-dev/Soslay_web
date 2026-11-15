import type { ActionResult, ConfirmLinkResult } from "@/server/admin/actions/common";

/**
 * Jalankan aksi simpan tamu; bila nomornya milik member terdaftar (confirmLink), admin memastikan dulu orangnya
 * sama (salah ketik nomor bisa menautkan tamu ke member lain), lalu aksi diulang dengan linkMember = id member
 * (OK) / false (Cancel → tetap tamu). Dipakai pembayaran peserta activity & pembeli paket trip.
 */
export async function withMemberLinkConfirm(
  run: (linkMember?: string | false) => Promise<ActionResult | ConfirmLinkResult>,
  question: string,
): Promise<ActionResult> {
  const r = await run();
  if (r.ok || !("confirmLink" in r)) return r;
  const { memberId, name, memberCode } = r.confirmLink;
  const yes = window.confirm(`Nomor ini milik member ${name} (${memberCode}).\n\n${question}\nPilih Cancel untuk tetap menyimpan sebagai tamu.`);
  return run(yes ? memberId : false);
}
