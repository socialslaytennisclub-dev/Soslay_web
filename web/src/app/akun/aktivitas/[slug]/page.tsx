import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DETAIL_TABS, SessionDetail, type DetailTab } from "@/components/member/SessionDetail/SessionDetail";
import { getMySessionDetail } from "@/server/member/session-detail";

export async function generateMetadata({ params }: PageProps<"/akun/aktivitas/[slug]">): Promise<Metadata> {
  const detail = await getMySessionDetail((await params).slug);
  return { title: `${detail?.title ?? "Detail sesi"} — SOSLAY` };
}

/** Detail sesi peserta (Figma UIF-06): info, e-ticket & QR check-in, peserta, live, leaderboard, ronde. */
export default async function MemberSessionPage({ params, searchParams }: PageProps<"/akun/aktivitas/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const detail = await getMySessionDetail(slug);
  // Bukan peserta sesi ini (atau sesinya tidak ada) → 404, tanpa membocorkan bahwa sesinya ada.
  if (!detail) notFound();
  const tab = DETAIL_TABS.find((t) => t.key === query.tab)?.key ?? "info";
  return <SessionDetail detail={detail} tab={tab as DetailTab} />;
}
