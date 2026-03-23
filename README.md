# Zhost Installer Package

Folder ini adalah paket distribusi runtime yang dipakai untuk sistem katalog, checkout fisik sederhana, admin area, dan member area berbasis Google Sheets + Google Apps Script + Cloudflare.

## Isi Paket

- Frontend runtime: `index.html`, `checkout.html`, `login.html`, `dashboard.html`, `admin-area.html`, `p.html`, `tailwind.css`, `config.js`, `site.config.js`
- Gateway runtime: `_worker.js`, `_headers`, `_redirects`, `wrangler.jsonc`
- Backend deployable: `appscript.js`
- Utilitas user: `setup.js`, `validate-config.js`
- Seed demo: `demo-data/google-sheets-demo-seed.json`
- Metadata paket: `manifest.json`, `package.json`, `LICENSE.txt`

## Arsitektur Aktif

- Penyimpanan utama memakai Google Sheets.
- Backend bisnis berjalan di Google Apps Script melalui `appscript.js`.
- Endpoint publik diarahkan lewat Cloudflare Worker ke Apps Script.
- Checkout default memakai alur manual:
  - order disimpan ke sheet `Orders`
  - customer diarahkan ke WhatsApp admin
  - admin memverifikasi pembayaran dan mengubah status order dari area admin
- Upload aset opsional memakai ImageKit.

## Setup Cepat

1. Jalankan `node setup.js` untuk generate ulang `site.config.js` sesuai domain.
2. Siapkan Google Sheets dengan sheet minimal:
   - `Settings`
   - `Users`
   - `Orders`
   - `Access_Rules`
   - `Pages`
3. Buka `Extensions -> Apps Script`, lalu paste isi `appscript.js` ke project Apps Script online.
4. Deploy Apps Script sebagai `Web app`, lalu simpan URL `/exec`.
5. Edit `wrangler.jsonc` dan isi `APP_GAS_URL` dengan URL deploy Apps Script.
6. Jalankan `node validate-config.js`.
7. Deploy Cloudflare Worker / Pages dari folder ini.
8. Buka admin area dan isi branding, kontak, rekening transfer, serta ImageKit bila diperlukan.

## Script Properties

Script Properties yang masih relevan:

- `ik_private_key`
- `ADMIN_API_TOKEN`

Tidak ada lagi Script Properties untuk payment gateway legacy, Fonnte, atau affiliate.

## Schema Utama

### `Users`

Urutan kolom runtime:

- `user_id`
- `email`
- `password`
- `nama_lengkap`
- `role`
- `status`
- `tanggal_bergabung`
- `expired_at`

### `Orders`

Urutan kolom runtime:

- `timestamp`
- `nama`
- `email`
- `no_wa`
- `alamat`
- `detail_pesanan`
- `total_harga`
- `status_pembayaran`
- `bukti_transfer`

Flow checkout fisik mengandalkan field di atas untuk menyimpan order dan menampilkan riwayat member.

### `Access_Rules`

Kolom runtime aktif:

- `id`
- `title`
- `desc`
- `url`
- `harga`
- `status`
- `lp_url`
- `image_url`
- `pixel_id`
- `pixel_token`
- `pixel_test_code`

Field komisi affiliate sudah dihapus dari schema runtime aktif.

### `Pages`

Sheet `Pages` dipakai untuk landing page dan halaman informasi. Member area hanya menampilkan halaman yang tersedia; pengelolaan halaman dilakukan dari area admin.

## Konfigurasi Admin

Pengaturan yang aktif di admin area:

- Branding website
- Email kontak
- WhatsApp admin
- Informasi rekening transfer
- ImageKit public key, endpoint, dan private key
- Cloudflare cache config

Pengaturan lama untuk payment gateway legacy, Fonnte, dan affiliate sudah dihapus dari UI maupun backend.

## ImageKit

- Admin area menyediakan field public key, endpoint, dan private key.
- Tombol `Test Koneksi ImageKit` memvalidasi format kredensial dan koneksi sebelum disimpan.
- Private key disimpan di server melalui Script Properties.

## Demo Admin Mode

Akun demo admin read-only:

- Email: `admin@demo.com`
- Password: `admindemo`

Karakteristik mode demo:

- data sensitif disamarkan
- seluruh aksi perubahan dinonaktifkan
- sesi tetap aktif sampai logout manual

## Cache Runtime

Layer cache aktif di runtime saat ini:

- Browser HTTP cache melalui header `Cache-Control` dari Cloudflare Worker untuk HTML, JS, CSS, dan aset statis.
- Browser storage cache melalui `window.CEPAT_CACHE` (`localStorage` / `sessionStorage`) untuk action read-only dan bootstrap halaman.
- CDN / edge cache melalui `caches.default` di Cloudflare Worker untuk aset statis dan action API publik yang aman dicache.
- Server-side cache melalui Google Apps Script `CacheService` untuk `settings_map`, `access_rules`, session admin, dan manifest versi cache.
- Tidak ada Redis, Memcached, atau object cache eksternal lain di runtime aktif ini.

TTL dan invalidation yang direkomendasikan / aktif:

- Manifest versi cache: memory 5 detik, polling browser 15 detik.
- Manifest lokal yang lebih tua dari 5 detik kini dianggap provisional, sehingga halaman akan refresh manifest dulu sebelum mempercayai cache read-only lama.
- Invalidation manifest kini disiarkan lintas-tab via `localStorage` + `BroadcastChannel`, jadi tab live yang sedang terbuka bisa bereaksi tanpa menunggu poll berikutnya.
- `get_global_settings`: browser storage 1 jam, edge 300 detik, tapi key cache ikut versi `settings`.
- `get_products` / `get_product`: browser storage 60 detik, edge 60 detik, key cache ikut versi `products` dan konteks order bila relevan.
- `get_page_content`: browser storage 60 detik, halaman `p.html` menyimpan shell cache 5 menit, key cache ikut versi `pages`.
- `get_pages`: browser storage 120 detik, edge 120 detik, key cache ikut versi `pages`.
- Dashboard member: browser storage 45 detik dan ikut versi `settings`, `products`, `pages`, `orders`, `users`.
- Akses produk / verifikasi member: browser storage 60 detik dan ikut versi `products`, `orders`, `users`.
- Checkout detail produk: browser storage 5 menit dan ikut versi `products` + `settings`.

Invalidation selektif dilakukan otomatis saat action berikut berjalan:

- `save_product`, `delete_product` -> bump tag `products`
- `save_page`, `delete_page` -> bump tag `pages`
- `update_settings` -> bump tag `settings`
- `create_order`, `update_order_status`, `delete_order` -> bump tag `orders`
- `update_profile` -> bump tag `users` + `orders`

Dengan pola ini, cache lama tidak perlu dipurge total. Key cache baru otomatis terbit saat manifest berubah, sehingga halaman live bisa melihat perubahan dalam hitungan detik tanpa menunggu TTL lama habis.

## Seed Demo

Seed demo terbaru tersedia di:

- `demo-data/google-sheets-demo-seed.json`

Generate ulang seed dengan:

```bash
node scripts/generate-demo-seed.js
```

Seed saat ini sudah dibersihkan dari:

- setting payment gateway legacy dan Fonnte
- field `commission`
- konten dan slug affiliate

## Sinkronisasi Installer

- Jalankan `npm run sync:installer` untuk sinkronisasi satu kali ke folder `installer/`.
- Jalankan `npm run prepare:installer` bila ingin menyiapkan paket installer lengkap.
- Log sinkronisasi ada di `installer/.sync-meta/`.

## Validasi

Perintah yang umum dipakai setelah perubahan:

```bash
node validate-config.js
npm run validate
npm run validate:seo
npm run audit:worker
```

## Catatan Penghapusan Fitur

Fitur berikut sudah dipensiunkan dari runtime aktif:

- integrasi Fonnte
- integrasi payment gateway legacy
- seluruh fitur affiliate

Lihat `CHANGELOG.md` untuk detail perubahan penghapusan fitur legacy.
