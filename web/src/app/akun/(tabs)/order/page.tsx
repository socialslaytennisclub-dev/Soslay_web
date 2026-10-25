import type { Metadata } from "next";
import { CartOrder } from "@/components/member/CartOrder/CartOrder";
import { TabPanel } from "@/components/member/TabPanel/TabPanel";

export const metadata: Metadata = { title: "Order — SOSLAY" };

/** Tab Order = keranjang (Figma 25:2087). */
export default function OrderPage() {
  return (
    <TabPanel label="Order">
      <CartOrder />
    </TabPanel>
  );
}
