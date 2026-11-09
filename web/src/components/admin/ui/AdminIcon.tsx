import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  Banknote,
  FileText,
  HandCoins,
  Landmark,
  Paperclip,
  PiggyBank,
  RefreshCw,
  Scale,
  Undo2,
  Wallet,
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
/** Logo Threads (Phosphor threads-logo, sama dengan ikon di website) — bentuk terisi, bukan garis. */
const Threads = createLucideIcon("threads", [["path", { d: "M17.4769 11.5922C17.1514 11.3472 16.8018 11.1361 16.4334 10.9622C16.0584 8.16 14.1834 7.27688 13.3303 7.01813C11.4759 6.45563 9.345 7.12969 8.37562 8.58375C8.32096 8.66574 8.28298 8.7577 8.26386 8.85437C8.24474 8.95104 8.24484 9.05054 8.26417 9.14717C8.3032 9.34232 8.41816 9.51398 8.58375 9.62438C8.74934 9.73477 8.95201 9.77486 9.14717 9.73583C9.2438 9.71651 9.33568 9.67834 9.41756 9.6235C9.49944 9.56867 9.56971 9.49824 9.62438 9.41625C10.2216 8.52 11.6869 8.08875 12.8953 8.45344C13.8281 8.73469 14.4722 9.41906 14.7844 10.4222C14.3119 10.3322 13.8319 10.2873 13.3509 10.2881C12.0459 10.2881 10.8244 10.6247 9.91312 11.235C8.84062 11.9597 8.25 13.0312 8.25 14.25C8.25 16.1794 9.73687 17.58 11.7853 17.58C12.3877 17.5759 12.9831 17.4509 13.5363 17.2124C14.0895 16.9739 14.5891 16.6268 15.0056 16.1916C15.6094 15.5634 16.3181 14.4703 16.4691 12.7134C16.5047 12.7378 16.5384 12.7631 16.5722 12.7884C17.52 13.5047 18 14.5013 18 15.75C18 17.565 16.0931 20.25 12 20.25C9.49406 20.25 7.73625 19.4391 6.62438 17.7712C5.71219 16.4062 5.25 14.4619 5.25 12C5.25 9.53812 5.71219 7.59375 6.62438 6.22875C7.73625 4.56094 9.49406 3.75 12 3.75C15.0872 3.75 17.0625 4.99219 18.0497 7.54875C18.0843 7.64172 18.137 7.7269 18.2048 7.79936C18.2725 7.87182 18.354 7.93012 18.4444 7.97088C18.5349 8.01165 18.6325 8.03406 18.7317 8.03683C18.8308 8.03959 18.9295 8.02266 19.0221 7.987C19.1147 7.95135 19.1993 7.89769 19.271 7.82912C19.3427 7.76055 19.4 7.67844 19.4398 7.58754C19.4795 7.49664 19.5008 7.39877 19.5025 7.29958C19.5041 7.20039 19.4861 7.10185 19.4494 7.00969C18.2513 3.89625 15.675 2.25 12 2.25C9 2.25 6.76781 3.30844 5.37563 5.39625C4.29656 7.01531 3.75 9.23625 3.75 12C3.75 14.7637 4.29656 16.9847 5.37563 18.6038C6.76781 20.6916 9 21.75 12 21.75C14.8191 21.75 16.5844 20.6737 17.5687 19.7719C18.7781 18.6637 19.5 17.1562 19.5 15.75C19.5 14.0306 18.8006 12.5925 17.4769 11.5922ZM13.9247 15.1547C13.6483 15.4446 13.3165 15.6762 12.9491 15.8356C12.5816 15.995 12.1859 16.0791 11.7853 16.0828C10.7719 16.0828 9.75 15.5203 9.75 14.2528C9.75 13.0687 10.875 11.7956 13.3509 11.7956C13.9085 11.7941 14.4636 11.8705 15 12.0225C15 13.3425 14.625 14.4244 13.9247 15.1519V15.1547Z", fill: "currentColor", stroke: "none", key: "th-logo" }]]);
const TikTok = createLucideIcon("tiktok", [["path", { d: "M9 12a4 4 0 1 0 4 4V2a5 5 0 0 0 5 5", key: "tt-note" }]]);
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
  "tiktok-logo": TikTok,
  "threads-logo": Threads,
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
  wallet: Wallet,
  money: Banknote,
  "arrows-left-right": ArrowLeftRight,
  paperclip: Paperclip,
  "file-text": FileText,
  "hand-coins": HandCoins,
  bank: Landmark,
  "piggy-bank": PiggyBank,
  scale: Scale,
  undo: Undo2,
  "arrows-clockwise": RefreshCw,
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
