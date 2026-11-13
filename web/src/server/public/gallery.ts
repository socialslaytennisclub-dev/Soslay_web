import "server-only";
import { photosForVenue, type AvatarTone, type GalleryPhoto } from "@/content/gallery";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Galeri "Moments from past sessions" di halaman venue: foto yang diunggah admin (Konten & Galeri)
 * untuk activity di venue ini, beserta member ter-tag. Mode demo → foto contoh content/gallery.
 */

type Row = {
  id: string;
  path: string;
  caption: string | null;
  taken_on: string;
  session_title: string;
  members: { id: string; first_name: string; instagram: string | null }[];
};

const TONES: AvatarTone[] = ["lime", "pink", "indigo"];

/** Warna avatar tetap per member (dari id), jadi sama di semua foto. */
function toneOf(id: string): AvatarTone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export async function getVenueGallery(venueSlug: string, venueName: string): Promise<GalleryPhoto[]> {
  if (!isSupabaseConfigured) return photosForVenue(venueSlug);
  const { data, error } = await createSupabasePublicClient().rpc("venue_gallery", { p_venue_slug: venueSlug, p_limit: 60 });
  if (error) {
    // Mis. migrasi galeri (venue_gallery) belum dijalankan → tetap tampilkan foto bawaan venue, bukan galeri kosong.
    console.error("[gallery] gagal memuat galeri venue:", error.message);
    return photosForVenue(venueSlug);
  }
  return ((data ?? []) as Row[]).map((r) => {
    const members = r.members.map((m) => {
      const handle = m.instagram ? `@${m.instagram.replace(/^@/, "")}` : m.first_name;
      return { handle, initial: (m.first_name || handle.replace(/^@/, "")).charAt(0).toUpperCase(), tone: toneOf(m.id) };
    });
    return {
      id: r.id,
      venueSlug,
      src: r.path,
      position: "50% 50%",
      alt: `${r.session_title} at ${venueName}${members.length ? ` with ${members.map((m) => m.handle).join(", ")}` : ""}`,
      date: r.taken_on,
      members,
      caption: r.caption ?? "",
    };
  });
}
