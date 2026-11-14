import type { Metadata } from "next";
import { MyOrdersList } from "@/components/checkout/MyOrdersList";
import { CartOrder } from "@/components/member/CartOrder/CartOrder";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";
import { listMyOrders } from "@/server/shop/orders";

export const metadata: Metadata = { title: "Order — SOSLAY" };

/** Tab Order = keranjang (Figma 25:2087) + daftar pesanan dengan status (checkout & bayar transfer). */
export default async function OrderPage() {
  const orders = await listMyOrders();
  return (
    <TabPanel label="Order">
      <CartOrder />
      <MyOrdersList orders={orders} />
    </TabPanel>
  );
}
