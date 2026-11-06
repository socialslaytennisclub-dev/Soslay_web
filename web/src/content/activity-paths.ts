/**
 * Path halaman per tipe aktivitas: /activity/<path>. Satu sumber untuk activityLandings,
 * activityTypeHref, dan redirect link lama /activity?type=… di next.config — file ini sengaja
 * tanpa import (next.config memuatnya langsung).
 */
export const ACTIVITY_PATHS = {
  "weekly-mabar": "mabar",
  "match-day": "event",
  "tennis-escape": "escape",
  "beginner-coaching": "coaching",
  social: "social",
} as const;
