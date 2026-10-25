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

export type Segment = { id: string; name: string; count: number; query: MembersQuery; /** Disimpan tim (bisa dihapus). */ custom?: boolean };

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
  /** Rentang tanggal: "7" / "30" / "90" hari dari hari ini, atau "all". Default tab Mendatang = 30. */
  range?: "7" | "30" | "90" | "all";
  /** Urutan: jadwal sesi, judul, atau waktu dibuat. Kosong = default per tab. */
  sort?: SessionSort;
  dir?: "asc" | "desc";
};

export type SessionSort = "schedule" | "title" | "created";

export type SessionsResult = {
  items: SessionRow[];
  counts: { upcoming: number; completed: number; draft: number; archived: number };
  venues: string[];
  types: { slug: string; label: string }[];
  range: { from: string; to: string } | null;
  /** Urutan yang benar-benar dipakai (default per tab kalau query kosong). */
  sort: SessionSort;
  dir: "asc" | "desc";
};

export type SessionParticipant = {
  /** session_participants.id (import Kuyy); mode demo = id member. */
  id: string;
  /** Member Soslay yang cocok — null untuk tamu tanpa akun. */
  memberId: string | null;
  name: string;
  /** Username yang ditampilkan: member → username Soslay (Kuy ID di profilnya, bisa beda dengan
   *  username di file Kuyy); belum member → username Kuyy dari file (tidak ditampilkan di UI). */
  kuyId: string;
  /** ID Soslay (nomor member, mis. "SOS 0541 2610") — ID utama member; kosong untuk ghost. */
  memberCode: string;
  /** Belum member → ghost member; jumlah aktivitas Soslay yang sudah dia ikuti (termasuk sesi ini). */
  ghostActivities: number | null;
  /** Nomor WhatsApp tanpa +62/0 (dari Kuyy / profil) — untuk undangan daftar member. */
  phone: string;
  level: TennisLevel | null;
  payment: PaymentStatus;
  status: BookingStatus;
  source: "website" | "kuy" | "admin";
  checkedIn: boolean;
  guests: number;
};

export type SessionDetail = SessionRow & {
  description: string;
  /** Foto cover yang diupload (URL Storage) — null = pakai foto venue. */
  coverPath: string | null;
  court: string;
  courts: string[];
  pointsPerAttendance: number;
  visibility: "public" | "members" | "link";
  publishAt: string | null;
  /** Batas tampil di website (ISO) — null = sampai sesi mulai. */
  visibleUntil: string | null;
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
  play: SessionPlay;
  /** Member yang ditunjuk host khusus sesi ini (hak berakhir saat sesi diakhiri). */
  hosts: SessionHost[];
  matches: SessionMatch[];
  photos: SessionPhotos;
};

/** rotating = Rotating Partner (partner berganti tiap ronde, tim diseimbangkan per level). */
export type MatchFormat = "none" | "americano" | "rotating" | "round_robin" | "knockout";

export type SessionPlay = {
  matchFormat: MatchFormat;
  courtCount: number;
  roundCount: number;
  targetPoints: number;
  scoreEntry: "host" | "participants";
  /** Peringkat dari total poin atau jumlah menang. */
  leaderboardMode: "points" | "wins";
  showLeaderboard: boolean;
  liveStartedAt: string | null;
  endedAt: string | null;
};

/** Member yang jadi crew sesi: host (akses Panel Host) atau fotografer. */
export type SessionHost = { memberId: string; name: string; code: string; role: "host" | "photographer" };

/** Foto sesi: album Google Drive + 1 thumbnail, tampil di halaman Sesi Selesai member. */
export type SessionPhotos = { albumUrl: string; coverPath: string | null; count: number | null; postedAt: string | null };

/** Pemain = SessionParticipant.id. Skor null = belum dimainkan. */
export type SessionMatch = {
  /** session_matches.id — kosong untuk line-up yang belum disimpan. */
  id?: string;
  round: number;
  court: number;
  a: [string, string];
  b: [string, string];
  scoreA: number | null;
  scoreB: number | null;
};

/** Hasil baca XLSX Kuyy + kecocokan dengan member Soslay (preview sebelum impor). */
export type KuyImportPreviewRow = {
  regNo: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  level: TennisLevel | null;
  levelRaw: string;
  username: string;
  amount: number;
  paymentMethod: string;
  ticket: string;
  ticketPrice: number;
  skipReason: string | null;
  member: { id: string; name: string; code: string; username: string; by: "email" | "telepon" | "Kuy ID" } | null;
  /** Sudah ada di sesi ini (import sebelumnya) → akan diperbarui. */
  existing: boolean;
  /** Belum jadi member: "whatsapp" = bisa diundang daftar lewat link wa.me; "none" = tanpa nomor, tetap tamu. */
  invite: "whatsapp" | "none" | null;
  /** Belum member tapi sudah tercatat sebagai ghost dari aktivitas sebelumnya (jumlah aktivitasnya). */
  ghost: { activities: number } | null;
};

export type KuyImportPreview = { fileName: string; fileSize: number; eventTitle: string; rows: KuyImportPreviewRow[] };

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
  /** Draft berbeda dari versi yang tayang di website. */
  unpublished?: boolean;
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
  kind: "instagram" | "threads";
  text: string;
  handle: string;
  image?: string;
  visible: boolean;
};

/** Testimoni komunitas (Figma 09b–09f) — teks atau video pendek 9:16. */
export type AdminTestimonial = {
  id: string;
  kind: "text" | "video";
  name: string;
  /** "@anitya07" (tanpa @ di database juga diterima). */
  handle: string;
  quote: string;
  avatar: string | null;
  memberId: string | null;
  sortOrder: number;
  visible: boolean;
  videoUrl: string | null;
  videoPlatform: "instagram" | "tiktok" | "youtube" | "upload" | null;
  durationSeconds: number | null;
  createdAt: string;
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
  status: "draft" | "active" | "archived";
};

/** Form edit produk (products + product_images + product_variants). */
export type ProductForm = {
  id: string | null;
  slug: string;
  sku: string;
  name: string;
  /** Baris kecil di kartu Shop, mis. "Oversized fit T-shirt". */
  subtitle: string;
  category: "apparel" | "socks" | "pin" | "figure" | "racket" | "accessory";
  /** Atribut tetap (satu nilai) yang tampil sebagai pilihan di halaman produk. */
  fit: string;
  color: string;
  price: number;
  compareAtPrice: number | null;
  description: string;
  details: string[];
  material: string;
  status: "draft" | "active" | "archived";
  featured: boolean;
  sizeGuide: boolean;
  images: { path: string; alt: string; position: string }[];
  /** Foto kartu Shop (mockup lime). Kosong → foto pertama. */
  cardImage: string;
  /** Kunci pilihan varian ("size", "grip") — kosong = satu varian tanpa pilihan. */
  optionKey: string;
  variants: { value: string; stock: number }[];
};

/** Form edit venue (tabel venues). */
export type VenueForm = {
  id: string | null;
  slug: string;
  name: string;
  city: "Jakarta" | "Bali";
  area: string;
  type: string;
  address: string;
  mapsUrl: string;
  tagline: string;
  description: string;
  coverPath: string;
  heroPath: string;
  courts: string[];
  active: boolean;
  homepage: boolean;
};

/** Form edit member (tabel profiles) — nilai enum database apa adanya. */
export type MemberForm = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  birthDate: string;
  gender: "male" | "female" | "undisclosed" | "";
  kuyId: string;
  instagram: string;
  level: TennisLevel | "";
  playFrequency: string;
  playFormat: string;
  hand: string;
  playingSince: string;
  status: "active" | "suspended";
  pointsBalance: number;
};

// ── Slay Point & Reward ─────────────────────────────────────────────────────

export type RewardCategory = "merch" | "session" | "voucher" | "experience";
export type RedemptionStatus = "pending" | "approved" | "fulfilled" | "rejected";
export type PointsReason = "attendance" | "purchase" | "redeem" | "adjustment" | "bonus";

export type AdminReward = {
  id: string;
  name: string;
  description: string;
  category: RewardCategory;
  image: string | null;
  pointsCost: number;
  /** null = tanpa batas. */
  stock: number | null;
  minTier: Tier;
  active: boolean;
  /** Jumlah penukaran yang disetujui/selesai. */
  redeemed: number;
};

export type AdminRedemption = {
  code: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  memberTier: Tier;
  memberBalance: number;
  rewardName: string;
  rewardImage: string | null;
  points: number;
  status: RedemptionStatus;
  note: string;
  createdAt: string; // ISO
  handledAt: string | null;
  handledBy: string | null;
};

export type LedgerEntry = {
  id: string;
  at: string; // ISO
  memberId: string;
  memberName: string;
  memberTier: Tier;
  reason: PointsReason;
  note: string;
  delta: number;
  /** Saldo member setelah transaksi ini. */
  balanceAfter: number;
  by: string;
};

export type TierBenefits = { tier: Tier; label: string; minPoints: number; benefits: string[]; members: number };

export type BonusKey = "signup" | "birthday" | "referral" | "testimonial" | "streak";

/** app_settings "points_rules" (+ "rupiah_per_point"). Semua angka bebas, bilangan bulat ≥ 0. */
export type PointRules = {
  attendance: Record<string, number>;
  checkInOnly: boolean;
  rupiahPerPoint: number;
  discountedProducts: boolean;
  redeemDiscount: { enabled: boolean; rupiahPerPoint: number; maxPercent: number };
  bonuses: { key: BonusKey; points: number; enabled: boolean }[];
  expiry: { months: number; remind: boolean; tierKeeps: boolean };
};

export type PointsOverview = {
  circulating: number;
  redeemedThisMonth: number;
  redemptionsThisMonth: number;
  redemptionsDelta: number | null;
  activeRewards: number;
  lowStock: number;
  pending: number;
  pendingOverdue: number;
};

export type MemberChoice = { id: string; name: string; code: string; tier: Tier; balance: number };
