/**
 * Tipe data admin — cermin dari tabel/view di supabase/migrations (profiles, member_stats,
 * sessions + session_fill, bookings, orders, …). UI admin hanya bergantung pada tipe ini,
 * jadi sumber datanya (demo ↔ Supabase) bisa diganti tanpa menyentuh komponen.
 */

export type Tier = "basic" | "silver" | "gold" | "platinum";
export type MemberStatus = "active" | "inactive" | "suspended";
export type TennisLevel = "beginner" | "beginner_intermediate" | "intermediate" | "intermediate_advanced" | "advanced";
export type BookingStatus = "registered" | "waitlisted" | "cancelled" | "attended" | "no_show";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type OrderStatus = "pending" | "processing" | "shipped" | "completed" | "cancelled";

/** Baris tabel Members (profiles ⨝ member_stats). */
export type MemberListItem = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  kuyId: string;
  instagram: string;
  city: string;
  level: TennisLevel;
  tier: Tier;
  status: MemberStatus;
  joinedAt: string; // ISO
  sessionsAttended: number;
  pointsBalance: number;
  lastPlayedAt: string | null;
  /** Untuk filter "Minat" & segmen. */
  lookingFor: string[];
  eventTypes: string[];
  playFrequency: string;
};

export type MemberTimelineItem = {
  kind: "booking" | "attended" | "purchase" | "tier" | "no_show" | "profile";
  title: string;
  detail: string;
  at: string;
  badge: { label: string; tone: "lime" | "indigo" | "neutral" | "pink" };
};

export type MemberBookingRow = {
  sessionTitle: string;
  venueName: string;
  startsAt: string;
  payment: PaymentStatus;
  status: BookingStatus;
};

export type MemberNote = { id: string; author: string; body: string; at: string };

export type MemberDetail = MemberListItem & {
  phone: string;
  birthDate: string | null;
  gender: "male" | "female" | "undisclosed";
  reclubId: string | null;
  playFormat: string;
  hand: string;
  playingSince: string;
  hoursPlayed: number;
  attendanceRate: number;
  totalSpent: number;
  pointsEarned: number;
  timeline: MemberTimelineItem[];
  bookings: MemberBookingRow[];
  notes: MemberNote[];
};

export type MembersQuery = {
  tab?: "all" | "active" | "new" | "inactive";
  q?: string;
  tier?: Tier;
  level?: TennisLevel;
  city?: string;
  frequency?: string;
  interest?: string;
  sort?: "name" | "points" | "last_played" | "joined";
  dir?: "asc" | "desc";
  page?: number;
};

export type MembersResult = {
  items: MemberListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: { all: number; active: number; new: number; inactive: number };
  cities: string[];
};

export type Segment = { id: string; name: string; count: number; query: MembersQuery };

export type UpcomingSession = {
  id: string;
  title: string;
  venueName: string;
  startsAt: string;
  capacity: number;
  booked: number;
};

export type OrderRow = {
  code: string;
  customer: string;
  items: string;
  total: number;
  payment: PaymentStatus;
  status: OrderStatus;
  placedAt: string;
};

export type OverviewData = {
  generatedAt: string;
  kpis: {
    activeMembers: number;
    activeMembersDelta: number; // persen vs bulan lalu
    newMembersThisMonth: number;
    bookingsThisWeek: number;
    bookingsDelta: number;
    capacityFilled: number; // persen
    salesThisMonth: number;
    salesDelta: number;
    ordersThisMonth: number;
    attendanceRate: number;
    attendanceDelta: number;
    noShowsThisWeek: number;
  };
  weeklyBookings: { weekStart: string; count: number }[];
  upcomingSessions: UpcomingSession[];
  upcomingCount: number;
  newestMembers: MemberListItem[];
  tierDistribution: { tier: Tier; count: number }[];
  levelDistribution: { level: TennisLevel; count: number }[];
  recentOrders: OrderRow[];
  ordersToProcess: number;
  topProducts: { name: string; image: string; sold: number; revenue: number }[];
};

// ── Activities (sessions ⨝ venues ⨝ session_fill) ───────────────────────────
export type SessionStatus = "draft" | "published" | "cancelled" | "completed";
/** Status tampilan di tabel Activities (diturunkan dari status + isi + publish_at). */
export type SessionDisplayStatus = "draft" | "scheduled" | "published" | "almost_full" | "full" | "completed" | "cancelled";

export type SessionRow = {
  id: string;
  title: string;
  typeSlug: string;
  typeLabel: string;
  image: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueCity: string;
  venueType: string;
  capacity: number;
  booked: number;
  waitlisted: number;
  price: number;
  status: SessionStatus;
  displayStatus: SessionDisplayStatus;
};

export type SessionsQuery = {
  tab?: "upcoming" | "completed" | "draft" | "archived";
  q?: string;
  type?: string;
  venue?: string;
  city?: string;
  /** Rentang tanggal: "7" / "30" / "90" hari dari hari ini, atau "all". Default tab Mendatang = 30. */
  range?: "7" | "30" | "90" | "all";
};

export type SessionsResult = {
  items: SessionRow[];
  counts: { upcoming: number; completed: number; draft: number; archived: number };
  venues: string[];
  types: { slug: string; label: string }[];
  range: { from: string; to: string } | null;
};

export type SessionParticipant = {
  memberId: string;
  name: string;
  handle: string;
  level: TennisLevel;
  payment: PaymentStatus;
  status: BookingStatus;
  source: "website" | "kuy" | "admin";
  checkedIn: boolean;
  guests: number;
};

export type SessionDetail = SessionRow & {
  description: string;
  court: string;
  courts: string[];
  pointsPerAttendance: number;
  visibility: "public" | "members" | "link";
  publishAt: string | null;
  waitlistEnabled: boolean;
  membersOnly: boolean;
  showOnHomepage: boolean;
  recommendedLevels: TennisLevel[];
  repeatWeekly: boolean;
  kuyUrl: string;
  crew: { name: string; role: "Host" | "Coach" | "Fotografer" }[];
  participants: SessionParticipant[];
  paid: number;
  checkedIn: number;
};

// ── Orders ──────────────────────────────────────────────────────────────────

export type OrdersTab = "all" | "to_process" | "shipped" | "completed" | "cancelled";

export type OrdersQuery = { tab?: OrdersTab; q?: string; payment?: PaymentStatus; month?: string; order?: string };

export type OrderListItem = {
  code: string;
  memberId: string;
  customer: string;
  image: string;
  summary: string;
  total: number;
  payment: PaymentStatus;
  status: OrderStatus;
  placedAt: string;
};

export type OrderDetail = OrderListItem & {
  channel: "Website" | "Kuy";
  paymentMethod: string;
  customerTier: Tier;
  customerPhone: string;
  previousOrders: number;
  items: { name: string; variant: string; image: string; price: number; quantity: number }[];
  subtotal: number;
  shippingCost: number;
  pointsDiscount: number;
  grandTotal: number;
  address: string;
  courier: string;
  trackingNumber: string | null;
};

export type OrdersResult = {
  items: OrderListItem[];
  counts: Record<OrdersTab, number>;
  months: { value: string; label: string }[];
  kpis: {
    toProcess: number;
    overdue: number;
    inTransit: number;
    completedThisMonth: number;
    revenueThisMonth: number;
    revenueDelta: number;
    monthLabel: string;
    prevMonthLabel: string;
  };
};

// ── Konten & Galeri ─────────────────────────────────────────────────────────

export type ContentSection = {
  key: string;
  name: string;
  icon: string;
  summary: string;
  enabled: boolean;
  title: string;
  description: string;
  /** Batas karakter deskripsi di form. */
  maxLength: number;
  cta?: { label: string; href: string };
  image?: string;
  overlay?: boolean;
  /** Isi section diambil otomatis dari modul lain. */
  source?: { label: string; href: string };
  scheduleNote?: string;
};

export type PhotoAlbum = {
  id: string;
  sessionId: string;
  title: string;
  venueName: string;
  date: string;
  photoCount: number;
  cover: string;
  status: "published" | "draft" | "empty";
};

export type CommunityPost = {
  id: string;
  kind: "testimonial" | "instagram" | "threads";
  text: string;
  handle: string;
  image?: string;
  visible: boolean;
};

export type SitePage = { path: string; name: string; description: string; updatedAt: string; updatedBy: string };

// ── Settings & Roles ────────────────────────────────────────────────────────

export type AdminModule = "overview" | "members" | "activities" | "venues" | "products" | "orders" | "content" | "settings";
export type ModuleAccess = "edit" | "view" | "none";

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | "disabled";
  lastActiveAt: string | null;
};

export type RolePermissions = { name: string; isSystem: boolean; access: Record<AdminModule, ModuleAccess> };

export type Integration = {
  key: string;
  label: string;
  description: string;
  status: "connected" | "disconnected" | "needs_reauth";
  lastSyncAt: string | null;
};

export type AuditEntry = { actor: string; action: string; at: string };

export type AppSettings = {
  clubName: string;
  contactEmail: string;
  whatsapp: string;
  timezone: string;
  monthlySessionTarget: number;
  rupiahPerPoint: number;
  annualTargets: { sessions: number; hours: number; venues: number };
  tiers: { tier: Tier; label: string; minPoints: number }[];
  paymentMethods: { key: string; label: string; enabled: boolean; fee: string }[];
  bookingPaymentDeadlineHours: number;
  notifications: { key: string; label: string; hint: string; channel: string; enabled: boolean }[];
};

// ── Venues & Products ───────────────────────────────────────────────────────

export type AdminVenue = {
  slug: string;
  name: string;
  city: string;
  type: string;
  image: string;
  courts: number;
  sessionsThisMonth: number;
  /** Persen kursi terisi bulan ini; null kalau belum ada sesi. */
  occupancy: number | null;
  sessionsTotal: number;
  visible: boolean;
  note?: string;
};

export type StockState = "ok" | "low" | "out";

export type AdminProduct = {
  slug: string;
  sku: string;
  name: string;
  category: string;
  categoryLabel: string;
  image: string;
  variants: string[];
  price: number;
  compareAtPrice?: number;
  stock: number;
  stockState: StockState;
  sold: number;
  visible: boolean;
};
