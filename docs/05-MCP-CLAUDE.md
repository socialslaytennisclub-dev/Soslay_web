# MCP Slay Club — import activity lewat Claude

Admin cukup chat ke Claude: kirim link event Kuyy + file export peserta (.xlsx). Claude membaca keduanya,
menunjukkan preview, lalu membuat activity + peserta di Slay Club. Aturannya sama persis dengan
**Activities → Import dari Kuyy** di admin.

Endpoint: `https://www.slayclub.id/api/mcp` (MCP Streamable HTTP, tanpa sesi).
Kode: `web/src/app/api/mcp/route.ts`, `web/src/server/mcp/*`.

## Alat (tools)

| Alat | Fungsi |
|---|---|
| `list_venues` | Daftar venue & tipe activity |
| `preview_activity_import` | Cek tanpa menyimpan: venue yang dipakai, member yang cocok, yang belum daftar (ghost), yang dilewati |
| `import_activity` | Buat activity + masukkan peserta (setelah admin setuju dengan preview) |

## Setup (sekali)

### 1. Buat kunci rahasia

Di Terminal:

```bash
openssl rand -hex 32
```

Simpan hasilnya — ini `MCP_TOKEN`. Siapa pun yang tahu kunci ini bisa membuat activity, jadi jangan dibagikan.

### 2. Isi Environment Variables di Vercel

Vercel → Project → Settings → Environment Variables (Production), lalu Redeploy:

| Nama | Isi | Type |
|---|---|---|
| `MCP_TOKEN` | hasil langkah 1 | Secret |
| `MCP_ACTOR_EMAIL` | email akun tim yang dipakai Claude, mis. email Super Admin | Plain |

`SUPABASE_SERVICE_ROLE_KEY` juga harus sudah terpasang (sudah dipakai fitur lain).

Semua tulisan lewat MCP tercatat atas nama akun `MCP_ACTOR_EMAIL` (Settings → Log aktivitas) dan memakai
izin role akun itu — akun itu wajib punya izin **edit Activities**. Kosongkan `MCP_TOKEN` untuk mematikan MCP.

### 3. Pasang connector di Claude

claude.ai (atau aplikasi Claude desktop) → **Settings → Connectors → Add custom connector**:

- Name: `Slay Club`
- URL: `https://www.slayclub.id/api/mcp?key=<MCP_TOKEN>`

Connector yang dipasang di claude.ai ikut muncul di aplikasi desktop dengan akun yang sama.

## Cara pakai

Di chat Claude (connector Slay Club aktif):

> Import event ini ke Slay Club: https://kuyy.app/a4bf7e06-… — file pesertanya terlampir.

Claude akan:
1. Membaca halaman event (judul, tanggal, jam, venue, harga, kuota, deskripsi) dan file peserta.
2. Memanggil `preview_activity_import` lalu menunjukkan ringkasan.
3. Setelah kamu bilang oke, memanggil `import_activity` dan memberi link activity di admin.

Catatan: Kuyy memblokir akses otomatis dari server. Kalau Claude tidak bisa membuka link Kuyy (mis. di
claude.ai web), pakai aplikasi Claude desktop / Claude in Chrome yang membuka halaman lewat browser, atau
tempel teks halaman event ke chat.

## Keamanan

- Kunci salah → ditolak (401). Kunci dibandingkan waktu-konstan; minimal 24 karakter.
- Ganti kunci: buat baru (langkah 1), ganti di Vercel + di URL connector, Redeploy.
- Kunci ada di URL connector (custom connector Claude tidak bisa mengirim header sendiri) → kunci ikut
  tercatat di log request Vercel. Batasi siapa yang bisa melihat log Vercel, jangan screenshot / bagikan URL
  itu, dan ganti kunci bila ada yang tidak berhak melihatnya. Klien yang bisa mengirim header (mis. Claude Code)
  sebaiknya memakai `Authorization: Bearer <MCP_TOKEN>` dengan URL tanpa `?key=`.
- Sebaiknya `MCP_ACTOR_EMAIL` = akun tim khusus untuk Claude (role dengan izin edit Activities saja), bukan
  akun pribadi Super Admin — sesi login & Log aktivitasnya jadi terpisah, dan kunci yang bocor hanya bisa
  menyentuh Activities.
