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
  /** `tone` 0–2 = warna avatar tetap per member (dihitung di database; id member tidak dikirim ke publik). */
  members: { tone: number; first_name: string; instagram: string | null }[];
};

const TONES: AvatarTone[] = ["lime", "pink", "indigo"];


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
      return { handle, initial: (m.first_name || handle.replace(/^@/, "")).charAt(0).toUpperCase(), tone: TONES[m.tone % TONES.length] ?? TONES[0] };
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
