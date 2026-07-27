# Sistem Kasir — Toko Makmur Jaya

Monorepo untuk sistem kasir: backend multi-cabang (Tahap 2) + prototipe UI kasir.

```
pos-toko/
├── backend/          Express + PostgreSQL, multi-cabang, offline-sync, transfer stok
├── frontend/          Prototipe UI kasir (HTML/JS, satu file, tema "meja kasir malam")
├── docker-compose.yml Menjalankan backend + database sekaligus untuk pengembangan lokal
└── .github/workflows/ci.yml   Pipeline CI: uji otomatis + build image Docker
```

## ⚠️ Yang perlu diketahui sebelum push

**`frontend/index.html` BELUM tersambung ke `backend/`.** Frontend saat ini masih
prototipe sisi-klien yang menyimpan data lewat storage bawaan platform artifact
(bukan lewat API). Backend sudah lengkap dan teruji (lihat `backend/README.md`),
tapi keduanya belum "berbicara" satu sama lain. Kalau Anda ingin sistem yang
benar-benar end-to-end (kasir di frontend memanggil API backend sungguhan),
itu pekerjaan integrasi berikutnya — beri tahu saya kalau mau saya kerjakan.

Repo ini digabungkan supaya strukturnya rapi untuk di-push & di-deploy, bukan
berarti fitur end-to-end-nya sudah selesai.

## Menjalankan lokal (paling gampang: Docker)

Butuh Docker & Docker Compose terpasang.

```bash
git clone <url-repo-anda>
cd pos-toko
docker compose up --build
```

Ini akan:
1. Menyalakan PostgreSQL dan menyiapkan volume datanya.
2. Build image backend, migrasi skema + seed data, lalu start di `http://localhost:4001`.

Login demo: lihat `backend/README.md` (akun admin, manager, dan 2 kasir di 2 cabang berbeda).

Untuk membuka `frontend/index.html`: buka langsung filenya di browser (tidak perlu server, karena masih murni client-side).

## Menjalankan lokal tanpa Docker

Ikuti instruksi di `backend/README.md` (butuh Node.js 22.5+ dan PostgreSQL lokal/cloud).

## CI/CD

`.github/workflows/ci.yml` berjalan otomatis di setiap push/PR ke branch `main`:

1. **test-backend** — menyalakan PostgreSQL sungguhan sebagai service container,
   menjalankan migrasi, start server, lalu smoke test (`/health` dan login admin
   harus berhasil). Kalau ada bug yang bikin server gagal start atau login rusak,
   CI akan merah sebelum sempat merusak production.
2. **build-image** — memastikan `Dockerfile` backend benar-benar bisa di-build
   jadi image, baru lanjut kalau `test-backend` lulus.

### Menghubungkan ke git & GitHub Actions

```bash
cd pos-toko
git init
git add .
git commit -m "Initial commit: backend multi-cabang + prototipe frontend"
git branch -M main
git remote add origin <url-repo-github-anda>
git push -u origin main
```

Begitu di-push ke GitHub, workflow di `.github/workflows/ci.yml` otomatis jalan
di tab **Actions** — tidak perlu setup tambahan untuk bagian testing.

## Deploy ke production

CI di atas baru sampai tahap **build & test**, belum otomatis deploy ke server
manapun (sengaja, karena itu tergantung pilihan hosting Anda). Beberapa opsi
yang umum dipakai:

| Opsi | Cocok untuk | Catatan |
|---|---|---|
| **Railway / Render** | Paling cepat setup | Hubungkan repo GitHub, tambah service PostgreSQL, isi env var (`JWT_SECRET`, `DATABASE_URL` otomatis dari plugin DB-nya), deploy otomatis tiap push. |
| **Fly.io** | Butuh kontrol region (server dekat Jakarta) | Deploy pakai `fly deploy`, bisa pilih region Singapura biar latensi ke Jakarta rendah. |
| **VPS sendiri (mis. DigitalOcean/Biznet/Alibaba Cloud)** | Kontrol penuh, cocok untuk puluhan cabang jangka panjang | Pakai `docker-compose.yml` yang sudah ada, tambahkan reverse proxy (Caddy/Nginx) untuk HTTPS & domain. |

Untuk opsi mana pun: environment variable minimal yang wajib diisi adalah
`DATABASE_URL` dan `JWT_SECRET` (lihat `backend/.env.example`). **Jangan pernah
commit file `.env` sungguhan ke git** — `.gitignore` di repo ini sudah
mengecualikannya.

## Struktur lanjutan

- `backend/README.md` — detail endpoint API, akun demo, dan cara kerja offline-sync.
- Tahap berikutnya (belum ada di repo ini): integrasi frontend↔backend, manajemen
  karyawan/shift di sisi backend, integrasi payment gateway sungguhan, dan dashboard BI.
