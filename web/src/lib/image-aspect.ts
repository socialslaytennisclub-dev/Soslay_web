/**
 * Rasio foto (lebar / tinggi) — satu sumber untuk tampilan di website dan crop saat admin / member
 * mengupload, supaya hasil crop pas dengan bingkai yang menampilkannya.
 */
export const IMAGE_ASPECT = {
  /** VenueCard (homepage & halaman Venue) — Figma 633×371. */
  venueCover: 633 / 371,
  /** Banner detail venue (PageHero desktop) — Figma 1312×560. */
  venueHero: 1312 / 560,
  /** SocialPostCard (post IG / TikTok / Threads) — Figma 313×391. */
  communityPost: 313 / 391,
  /** Cover activity. */
  sessionCover: 4 / 3,
  /** Thumbnail foto sesi. */
  sessionPhoto: 16 / 9,
  /** Foto profil member (tampil bulat). */
  avatar: 1,
} as const;
