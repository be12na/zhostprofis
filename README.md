# Zhost Installer Package

Folder ini adalah paket distribusi user yang sudah dipangkas dari file development.

## Isi Paket

- File frontend runtime: HTML, CSS, `config.js`, `site.config.js`
- File gateway runtime: `_worker.js`, `_headers`, `_redirects`, `wrangler.jsonc`
- File backend deployable: `appscript.js`
- Utilitas user: `setup.js`, `validate-config.js`
- Metadata paket: `manifest.json`, `package.json`, `LICENSE.txt`

## Cara Pakai

1. Buka folder ini.
2. Jalankan `node setup.js` untuk generate ulang `site.config.js` sesuai domain user.
3. Buat Database Google Sheets dan GAS
4. Edit `wrangler.jsonc` dan isi `APP_GAS_URL` dengan URL deploy Google Apps Script.
4. Jalankan `node validate-config.js`.
5. Deploy ke Github dan Cloudflare Pages dari folder ini.
6. Buka Google Sheets, lalu paste `appscript.js` ke Apps Script editor dan deploy sebagai Web App.

## Checklist Setup User Baru

1. Siapkan Google Sheets utama beserta sheet minimal: `Settings`, `Users`, `Orders`, `Access_Rules`, dan `Pages`.
2. Buka `Extensions` -> `Apps Script`, lalu paste isi [appscript.js](/d:/kelasjagoan3/appscript.js) ke project Apps Script online.
3. Deploy Apps Script sebagai `Web app`, lalu simpan URL `/exec` hasil deploy untuk dipakai di Worker.
4. Buka `Project Settings` di Apps Script online, lalu isi `Script Properties` minimal berikut:
   - `ik_private_key`: jika memakai ImageKit
   - `ADMIN_API_TOKEN`: jika ingin memakai action diagnostic privileged dari admin area
5. Edit `wrangler.jsonc`, lalu isi minimal:
   - `APP_GAS_URL`: URL `/exec` Apps Script
6. Deploy Cloudflare Worker / Pages dari folder ini.
7. Buka admin area, isi branding, WhatsApp admin, rekening transfer, dan integrasi lain yang dibutuhkan.
8. Jalankan test internal yang dibutuhkan sebelum sistem dipakai live. Konfigurasi Moota sekarang opsional dan tidak dipakai oleh flow checkout fisik default.

## Users Sheet Schema

- Runtime saat ini mengharapkan sheet `Users` memakai urutan kolom: `user_id`, `email`, `password`, `nama_lengkap`, `role`, `status`, `tanggal_bergabung`, `expired_at`.
- Flow pembuatan user baru sudah otomatis menulis kolom `role`, `status`, `tanggal_bergabung`, dan `expired_at` dengan format yang benar sejak awal.
- Tombol legacy `Sinkronisasi Kolom Users` sudah dihapus dari admin area karena hanya berfungsi sebagai helper repair satu kali untuk template lama dan bukan bagian dari workflow operasional normal.
- Jika Anda mengimpor spreadsheet dari template sangat lama, pastikan kolom `E:H` di sheet `Users` sudah berisi `role`, `status`, `tanggal_bergabung`, dan `expired_at` sebelum sistem dipakai live.

## Orders Sheet Schema

- Flow checkout fisik sekarang mengandalkan sheet `Orders` dengan urutan kolom: `timestamp`, `nama`, `email`, `no_wa`, `alamat`, `detail_pesanan`, `total_harga`, `status_pembayaran`, `bukti_transfer`.
- Checkout frontend akan menyimpan order ke Google Sheets lebih dulu, lalu mengarahkan customer ke WhatsApp API untuk konfirmasi manual ke admin.
- Pastikan `Settings` berisi `wa_admin`, `bank_name`, `bank_norek`, dan `bank_owner` agar checkout menampilkan rekening tujuan transfer dengan benar.

## Sinkronisasi Installer

- Folder `installer/` diabaikan Git lewat `.gitignore`, jadi tidak akan ter-track atau ikut ke push.
- Jalankan `npm run sync:installer:start` untuk menyalakan watcher background yang otomatis menyinkronkan perubahan dari folder utama ke `installer/`.
- Jalankan `npm run sync:installer:status` untuk mengecek apakah watcher otomatis sedang aktif.
- Jalankan `npm run sync:installer:stop` untuk mematikan watcher background.
- Jalankan `npm run sync:installer` atau `npm run prepare:installer` jika ingin memaksa sinkronisasi satu kali.
- Log detail perubahan ditulis ke `installer/.sync-meta/sync.log` dan output watcher background disimpan di `installer/.sync-meta/watcher-output.log`.
- Format log sinkronisasi adalah `timestamp | add/modify/delete | path`, contoh: `2026-03-19T18:51:40.730Z | modify | appscript.js`.
- Jika melakukan sinkronisasi manual, pastikan file runtime yang berubah ikut dicopy ke `installer/`, minimal: `README.md`, `appscript.js`, `_worker.js`, `wrangler.jsonc`, dan file admin/frontend terkait jika ada perubahan UI.

## Branding Asset Fallback

- Admin area sekarang mengabaikan URL branding placeholder seperti `assets.example.com` agar tidak memicu error DNS di browser.
- Jika logo atau favicon eksternal tidak valid atau gagal dimuat, admin area otomatis memakai ikon bawaan sebagai fallback.
- Saat menyimpan branding, URL `site_logo` dan `site_favicon` yang tidak valid akan dibersihkan sebelum disimpan ke Settings.

## SEO Homepage

- Homepage sekarang memakai fallback meta tag statis + generator SEO dinamis yang membaca hero content, tagline, dan katalog produk.
- Fallback Open Graph image ada di [assets/seo/og-default.png](/d:/kelasjagoan3/assets/seo/og-default.png) dengan target `1200x630` dan ukuran di bawah `1MB`.
- Jalankan `npm run validate:seo` untuk audit lokal setelah mengubah copy homepage atau struktur katalog.
- Lihat panduan maintenance lengkap di [SEO_MAINTENANCE.md](/d:/kelasjagoan3/SEO_MAINTENANCE.md).

## ImageKit Configuration

- Pengaturan ImageKit kini bisa diisi langsung dari admin area melalui 3 field terpisah: public key, URL endpoint, dan private key.
- Tombol "Test Koneksi ImageKit" akan memvalidasi format kredensial dan mencoba koneksi ke ImageKit sebelum konfigurasi disimpan.
- Private key disimpan di server via Script Properties agar tidak perlu dikelola langsung di Google Sheets.

## Moota Configuration

- Pengaturan Moota kini disederhanakan menjadi hanya 2 field wajib di admin area: `Webhook URL` dan `Secret Token`.
- `Webhook URL` wajib berupa URL `https://` tanpa query string.
- `Secret Token` wajib minimal 8 karakter alphanumeric, dan dipakai untuk verifikasi signature HMAC SHA-256 dari payload webhook Moota.
- Secret Token disimpan di server via Script Properties agar tidak terekspos sebagai nilai mentah di Google Sheets.
- Tombol `Test Koneksi Moota` akan mengirim webhook simulasi ke URL yang dikonfigurasi untuk memverifikasi format URL, Secret Token, signature, dan kesiapan endpoint sebelum konfigurasi disimpan.
- Untuk integrasi API, backend menerima payload `action: "import_moota_config"` atau `action: "update_settings"` dengan key `moota_gas_url` dan `moota_token`.

## Moota User Guide

- Isi `Webhook URL` dengan endpoint publik HTTPS yang menerima webhook Moota, misalnya `https://domainanda.com/webhook/moota`.
- Jangan arahkan webhook langsung ke URL `script.google.com` atau `script.googleusercontent.com`, karena Google Apps Script tidak menerima custom header `Signature` secara langsung.
- Isi `Secret Token` dengan secret yang sama persis dengan secret yang dipakai saat menghitung signature webhook di sisi Moota.
- Secret yang sama wajib ada di 3 tempat: dashboard Moota, `MOOTA_TOKEN` di Worker, dan `moota_token` pada Script Properties Apps Script.
- Klik `Test Koneksi Moota` sampai status berhasil, lalu simpan pengaturan lewat `Update API Sistem`.
- Jika memakai Google Apps Script di belakang Cloudflare Worker, arahkan webhook Moota ke endpoint Worker agar header `Signature` bisa diteruskan ke Apps Script.

## Moota Technical Notes

- Moota mengirim webhook `POST` dengan payload berbentuk array JSON dan header `Signature`.
- Signature diverifikasi dengan rumus `hash_hmac('sha256', payload_json, secret_token)`.
- Sistem menerima signature dari query param `moota_signature` atau `signature` setelah diteruskan oleh Cloudflare Worker/proxy.
- Signature yang masuk dinormalisasi terlebih dahulu, termasuk dukungan format `sha256=<hex>` dan variasi huruf besar-kecil.
- Apps Script tidak menerima custom header mentah dari webhook eksternal, sehingga proxy seperti Cloudflare Worker perlu meneruskan header `Signature` ke query param `moota_signature` atau `signature`.
- Unit test validasi backend tersedia lewat action privileged `test_moota_validation`.
- Unit test signature tersedia lewat action privileged `test_moota_signature`.

## Moota Troubleshooting

- Jika user baru bingung mencari `Script Properties`, bukanya lewat `Google Sheets -> Extensions -> Apps Script -> Project Settings -> Script properties`.
- Jika muncul `Link webhook Moota wajib diisi.`, isi endpoint publik HTTPS terlebih dahulu.
- Jika muncul `Format link webhook Moota tidak valid.`, pastikan URL dimulai dengan `https://` dan tidak mengandung query string.
- Jika muncul `Link webhook Moota tidak boleh langsung ke Google Apps Script...`, ganti URL webhook publik Anda ke endpoint Cloudflare Worker atau proxy yang meneruskan header `Signature`.
- Jika muncul `Secret Token Moota wajib diisi.`, isi secret yang dipakai untuk membuat signature webhook.
- Jika muncul `Format Secret Token Moota tidak valid.`, gunakan minimal 8 karakter alphanumeric tanpa spasi atau simbol.
- Jika muncul `Missing Signature`, cek tiga hal ini:
- `Moota_Logs` harus berisi event `SIGNATURE_MISSING` beserta `source`, `forwarded_by_worker`, dan `worker_saw_signature`.
- Pastikan webhook Moota mengarah ke endpoint Worker/proxy, bukan ke Apps Script langsung.
- Pastikan Worker menerima header `Signature`, lalu meneruskannya ke query param `moota_signature`.
- Baca field `reason` pada event `SIGNATURE_MISSING`:
- `direct_apps_script_url`: webhook masih diarahkan ke URL Google Apps Script.
- `worker_not_detected`: request yang sampai ke Apps Script tidak tampak berasal dari Worker/proxy yang terbaru.
- `worker_missing_signature_header`: Worker menerima request, tetapi header `Signature` memang tidak ada saat masuk dari Moota.
- `signature_not_forwarded`: Worker melihat request, tetapi signature tidak berhasil diteruskan ke Apps Script.
- Jika muncul `Invalid Signature`, pastikan `Secret Token` sama persis dengan secret di dashboard Moota dan payload JSON tidak dimodifikasi sebelum diverifikasi.
- Jika Worker membalas `Invalid Signature at Worker`, berarti secret di dashboard Moota tidak cocok dengan `MOOTA_TOKEN` pada konfigurasi Worker.
- Jika Apps Script membalas `Signature sudah lolos verifikasi di Worker...`, berarti secret di Worker cocok dengan Moota, tetapi `moota_token` di Apps Script / Script Properties masih berbeda.
- Jika webhook tidak memproses order, cek sheet `Moota_Logs` untuk melihat apakah nominal transfer tidak cocok dengan order pending.

## Demo Admin Mode

- Sistem menyediakan akun demo admin read-only:
  - Email: `admin@demo.com`
  - Password: `admindemo`
- Demo admin diarahkan ke dashboard admin biasa, tetapi semua data sensitif disamarkan dengan simbol dan seluruh aksi perubahan dinonaktifkan.
- Session demo admin otomatis berakhir setelah 15 menit.
- Demo admin tidak dapat memakai endpoint admin yang mengubah data seperti `save_product`, `save_page`, `update_settings`, `update_order_status`, `purge_cf_cache`, dan endpoint admin mutatif lainnya.
- Jika user demo mencoba melakukan aksi, UI akan menampilkan notifikasi bahwa mode demo hanya untuk melihat data.

## Worker Request Audit

- Dashboard monitoring request budget sekarang tersedia di tab `Settings` pada admin area lewat endpoint `/__worker_metrics`.
- Jalankan `npm run audit:worker` untuk simulasi konsumsi request terhadap limit 100.000 request/hari.
- Laporan audit lengkap, daftar endpoint prioritas, metrik before-after, dan SOP scaling ada di `AUDIT_CLOUDFLARE_WORKERS.md`.

## Dependency Runtime

Tidak ada dependency runtime lokal. Paket ini berjalan sebagai bundle statis + Apps Script + Cloudflare Worker.

## Catatan

- Paket ini tidak menyertakan test files, tools internal, atau dokumentasi internal tim.
- `appscript.js` tetap disertakan karena Google Apps Script memerlukan file JS deployable secara langsung.
- Lihat `manifest.json` untuk daftar file yang dibawa paket ini.

