# Sistem kasir — backend (Tahap 2: Multi-cabang)

Kelanjutan dari Tahap 1. Perubahan besar dari versi sebelumnya:

1. **PostgreSQL**, bukan SQLite — siap diakses banyak cabang sekaligus.
2. **Katalog terpusat, stok per cabang** — tabel `products` (nama/kategori/harga)
   dikontrol HQ; tabel `branch_stock` menyimpan stok masing-masing cabang secara
   independen.
3. **Offline-first & idempotent sync** — tiap transaksi punya
   `client_transaction_id` yang dibuat di perangkat kasir sendiri (bukan
   server). Ini yang membuat sinkronisasi ulang tidak pernah mencatat
   transaksi dobel, bahkan kalau jaringan retry berkali-kali.
4. **Transfer stok antar-cabang** — status `in_transit` → `completed`, stok
   cabang tujuan baru bertambah setelah dikonfirmasi diterima secara fisik.

Semua fitur di atas sudah diuji end-to-end: isolasi stok antar-cabang, retry
transaksi online, batch sync dengan salah satu item ditolak (tidak
menggagalkan yang lain), retry batch sync, transfer + konfirmasi + penolakan
double-receive, dan pembatasan role manager ke cabangnya sendiri.

## Menjalankan

Butuh **Node.js 22.5+** dan **PostgreSQL** (lokal atau cloud, mis. Supabase/RDS).

```bash
npm install
cp .env.example .env
# sunting .env, isi DATABASE_URL sesuai server Postgres Anda

npm run migrate   # buat skema + seed 2 cabang, 4 user, 5 produk
npm start         # server berjalan di http://localhost:4001
```

## Akun demo

| Username  | Password    | Role    | Cabang               |
|-----------|-------------|---------|----------------------|
| admin     | admin123    | admin   | semua cabang         |
| manager1  | manager123  | manager | Cabang Kelapa Gading |
| kasir1    | kasir123    | kasir   | Cabang Kelapa Gading |
| kasir2    | kasir123    | kasir   | Cabang Kemang        |

## Endpoint baru / berubah dari Tahap 1

| Method | Endpoint                  | Akses          | Keterangan |
|--------|---------------------------|----------------|------------|
| GET    | `/branch-stock`           | login          | stok + info produk untuk cabang sendiri (atau semua jika admin) |
| PUT    | `/branch-stock/:productId`| admin, manager | koreksi stok manual (stock opname) |
| POST   | `/orders`                 | login          | kini menerima `client_transaction_id` opsional untuk idempotency |
| POST   | `/sync/push`              | login          | kirim SEKALIGUS semua transaksi yang tertunda dari antrean offline |
| GET    | `/sync/pull`               | login          | tarik snapshot katalog + stok cabang untuk cache lokal |
| POST   | `/transfers`              | admin, manager | kirim stok ke cabang lain (langsung kurangi stok asal) |
| POST   | `/transfers/:id/receive`  | admin, manager | konfirmasi diterima (baru di sini stok tujuan bertambah) |
| GET    | `/transfers`              | login          | riwayat transfer |

## Demo offline-first

Simulasi nyata aplikasi kasir yang menyimpan transaksi ke antrean lokal
(SQLite lokal) saat internet toko putus, lalu mengirim semuanya sekaligus
begitu online kembali:

```bash
npm start                     # di satu terminal, biarkan berjalan
npm run demo:offline          # di terminal lain
```

Lihat `branch-client/offline-client.js` untuk memahami polanya — ini pola
yang sama yang perlu diterapkan di aplikasi kasir sungguhan (web/tablet)
menggunakan IndexedDB atau SQLite lokal di device.

### Kenapa `client_transaction_id` penting

Kalau ID transaksi dibuat oleh **server**, lalu koneksi putus tepat setelah
server berhasil menyimpan tapi sebelum respons sampai ke kasir, kasir akan
mengira transaksi gagal dan mengirim ulang — jadi tercatat dua kali. Karena
ID dibuat di **perangkat kasir** sejak awal dan disimpan `UNIQUE` di
database, pengiriman ulang selalu dikenali sebagai transaksi yang sama.

## Yang masih perlu ditambahkan sebelum produksi

- Payment gateway sungguhan (Midtrans/Xendit) — saat ini metode non-tunai
  hanya tercatat, belum benar-benar memproses uang.
- Halaman/alert untuk kasir & manajer meninjau transaksi yang `rejected`
  saat sync (misal karena stok sudah habis duluan dipakai transaksi lain).
- Rate limiting di endpoint login, dan refresh token (saat ini token 8 jam sekali habis, harus login ulang).
- Backup otomatis & strategi disaster recovery untuk database Postgres.

## Berikutnya: Tahap 3 — Operasional skala besar

Manajemen karyawan & shift, integrasi hardware (barcode scanner, printer,
EDC), program loyalty lintas cabang, dan promo terpusat.
