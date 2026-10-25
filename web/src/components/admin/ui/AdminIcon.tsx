import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Coins,
  Copy,
  createLucideIcon,
  Crown,
  Download,
  Ellipsis,
  EllipsisVertical,
  Eye,
  Globe,
  GripVertical,
  Image,
  Images,
  Key,
  LayoutGrid,
  Link,
  List,
  ListFilter,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  MessageSquareText,
  NotebookPen,
  Package,
  PanelsTopLeft,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Shuffle,
  Sparkles,
  Monitor,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Type,
  Upload,
  User,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./AdminUI.module.css";

// Lucide tidak menyediakan logo brand & bola tenis → digambar dengan gaya Lucide (grid 24, stroke).
const Instagram = createLucideIcon("instagram", [
  ["rect", { width: "20", height: "20", x: "2", y: "2", rx: "5", ry: "5", key: "ig-frame" }],
  ["path", { d: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z", key: "ig-lens" }],
  ["line", { x1: "17.5", x2: "17.51", y1: "6.5", y2: "6.5", key: "ig-dot" }],
]);
/** Badge member terverifikasi (Figma: seal-check) — bentuk BadgeCheck Lucide, diisi + centang putih. */
const VerifiedBadge = createLucideIcon("verified-badge", [
  [
    "path",
    {
      d: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
      fill: "currentColor",
      key: "vb-seal",
    },
  ],
  ["path", { d: "m9 12 2 2 4-4", stroke: "#fff", key: "vb-check" }],
]);
const TennisBall = createLucideIcon("tennis-ball", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "tb-ball" }],
  ["path", { d: "M6 4.6a10 10 0 0 1 0 14.8", key: "tb-seam-left" }],
  ["path", { d: "M18 4.6a10 10 0 0 0 0 14.8", key: "tb-seam-right" }],
]);

/**
 * Ikon admin = Lucide (lucide.dev). Nama tetap nama lama (dari Figma "_ikon admin") supaya
 * pemanggil tidak berubah; akhiran "-bold" = garis lebih tebal. Warna = currentColor.
 */
const ICONS = {
  "squares-four": LayoutGrid,
  "users-three": Users,
  user: User,
  "calendar-dots": CalendarDays,
  "map-pin": MapPin,
  "t-shirt": Shirt,
  receipt: Receipt,
  layout: PanelsTopLeft,
  images: Images,
  "gear-six": Settings,
  "magnifying-glass": Search,
  "bell-simple": Bell,
  "funnel-simple": ListFilter,
  "download-simple": Download,
  "caret-down": ChevronDown,
  "caret-right": ChevronRight,
  "caret-left": ChevronLeft,
  "pencil-simple": Pencil,
  eye: Eye,
  "upload-simple": Upload,
  "dots-six-vertical": GripVertical,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  clock: Clock,
  "whatsapp-logo": MessageCircle,
  "instagram-logo": Instagram,
  "envelope-simple": Mail,
  phone: Phone,
  image: Image,
  tag: Tag,
  "sign-out": LogOut,
  star: Star,
  x: X,
  coins: Coins,
  "shopping-bag-open": ShoppingBag,
  "tennis-ball": TennisBall,
  verified: VerifiedBadge,
  "qr-code": QrCode,
  copy: Copy,
  trash: Trash2,
  "arrows-down-up": ArrowUpDown,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  shuffle: Shuffle,
  sparkle: Sparkles,
  monitor: Monitor,
  "crown-simple": Crown,
  package: Package,
  truck: Truck,
  "link-simple": Link,
  "globe-simple": Globe,
  question: CircleHelp,
  "arrow-up-right": ArrowUpRight,
  "check-circle": CircleCheck,
  "warning-circle": CircleAlert,
  "note-pencil": NotebookPen,
  "user-plus": UserPlus,
  "calendar-plus": CalendarPlus,
  "sliders-horizontal": SlidersHorizontal,
  "text-t": Type,
  "list-bullets": List,
  "map-trifold": Map,
  storefront: Store,
  "chat-circle-text": MessageSquareText,
  "shield-check": ShieldCheck,
  key: Key,
  "plus-bold": Plus,
  "check-bold": Check,
  "dots-three-bold": Ellipsis,
  "dots-three-vertical-bold": EllipsisVertical,
} satisfies Record<string, LucideIcon>;

export type AdminIconName = keyof typeof ICONS;

type AdminIconProps = { name: AdminIconName; size?: number; label?: string; className?: string };

export function AdminIcon({ name, size = 20, label, className }: AdminIconProps) {
  const Icon = ICONS[name];
  return (
    // Pembungkus <span> dipertahankan: CSS admin memosisikan ikon lewat selector "> span".
    <span
      className={cx(styles.icon, className)}
      style={{ "--icon-size": `${size}px` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon size={size} strokeWidth={name.endsWith("-bold") ? 2.5 : 1.75} aria-hidden />
    </span>
  );
}
