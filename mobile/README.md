# SOSLAY — app iOS (Expo)

App rekam video tenis + skor live, satu database Supabase dengan www.slayclub.id.

**v1 berisi:** login/daftar (otomatis jadi member Social Slay, tier + Slay Point di Beranda), tab Activity dengan skor live, Rekam video (tersimpan di galeri HP saja, tidak diunggah), dan mengaitkan video ke activity.

Data activity, skor, dan tautan video di v1 masih tersimpan di HP. Sinkron ke akun menyusul (rancangan tabel di `supabase-draft.sql`, **belum** dijalankan).

## Menjalankan di Mac + iPhone

1. Pasang **Node.js 22 LTS** (nodejs.org) di Mac, dan app **Expo Go** dari App Store di iPhone.
2. Di Terminal:
   ```bash
   cd soslay_web/mobile
   npm install
   cp .env.example .env
   ```
3. Buka `.env`, isi `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dengan nilai yang sama seperti di `web/.env.local`. **Jangan** pakai service role key.
4. Jalankan:
   ```bash
   npx expo start
   ```
5. Pastikan iPhone dan Mac di Wi-Fi yang sama, lalu scan QR di Terminal pakai kamera iPhone → terbuka di Expo Go.
   Kalau tidak tersambung, pakai `npx expo start --tunnel`.

Rekam video butuh iPhone asli (simulator tidak punya kamera).

## Perintah lain

- `npm run typecheck` — cek TypeScript
- `npm test` — unit test logika skor tenis

## Berikutnya

- Potong otomatis (deteksi objek di HP) butuh *development build* (`npx expo run:ios` atau EAS Build), tidak bisa di Expo Go.
- SOSLAY Pro Rp20.000/bulan via Apple In-App Purchase, Sign in with Apple, sinkron activity ke server, skor host Social Slay.
