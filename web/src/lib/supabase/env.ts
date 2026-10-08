/**
 * Konfigurasi Supabase dari environment. Selama `.env.local` belum diisi, website & admin
 * berjalan dengan data demo (lihat src/server/admin/demo-data.ts) — tidak ada yang error.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Nama baru di dashboard Supabase = PUBLISHABLE_KEY; ANON_KEY tetap didukung.
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
