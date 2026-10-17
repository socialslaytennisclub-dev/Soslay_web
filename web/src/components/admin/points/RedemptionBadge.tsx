import { REDEMPTION_STATUS_LABEL } from "@/lib/admin-labels";
import type { RedemptionStatus } from "@/server/admin/types";
import { Badge, type BadgeTone } from "../ui/AdminUI";

const TONE: Record<RedemptionStatus, BadgeTone> = { pending: "indigo", approved: "blue", fulfilled: "lime", rejected: "pink" };

export function RedemptionBadge({ status }: { status: RedemptionStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {REDEMPTION_STATUS_LABEL[status]}
    </Badge>
  );
}
