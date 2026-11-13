import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/checkout/OrderView";
import { getMyMember } from "@/server/member/profile";
import { getCheckoutContext, getMyOrder } from "@/server/shop/orders";

export const metadata: Metadata = { title: "Pesanan — SOSLAY" };

/** Halaman pesanan member: pembayaran, upload bukti, status verifikasi & pengiriman (Figma 05–07, 06a). */
export default async function OrderPage({ params }: PageProps<"/akun/pesanan/[code]">) {
  const { code } = await params;
  const [order, me] = await Promise.all([getMyOrder(decodeURIComponent(code)), getMyMember()]);
  if (!order) notFound();
  const pickupSessions = order.method === "pickup" ? (await getCheckoutContext()).pickupSessions : [];
  return <OrderView order={order} pickupSessions={pickupSessions} memberName={me?.profile.fullName || order.recipient.name} />;
}
