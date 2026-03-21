# Removal Audit 2026-03-21

## Status

Audit ini dibuat sebelum eksekusi removal dan tetap disimpan sebagai catatan dependensi awal. Eksekusi penghapusan sudah diselesaikan dengan hasil utama berikut:

- backend `appscript.js` dan `_worker.js` sudah dibersihkan dari endpoint, helper, dan runtime path aktif untuk Fonnte, Moota, dan affiliate
- `admin-area.html` dan `dashboard.html` sudah direfactor agar hanya menampilkan alur yang masih dipakai
- generator seed dan file hasil generate sudah diregenerasi tanpa field `commission`, tanpa settings Moota/Fonnte, dan tanpa konten affiliate
- `README.md` dan `CHANGELOG.md` sudah diperbarui untuk mencerminkan arsitektur baru

## Scope

Penghapusan fitur dan integrasi berikut dari codebase:

- `fonnte_token`
- `moota_gas_url`
- `moota_token`
- seluruh alur, endpoint, helper, dan UI affiliate

## Backup

Backup kode yang terdampak dibuat di:

- `backups/remove-fonnte-moota-affiliate-20260321-152918/`

File yang dibackup:

- `appscript.js`
- `admin-area.html`
- `checkout.html`
- `dashboard.html`
- `p.html`
- `index.html`
- `login.html`
- `README.md`
- `demo-data/google-sheets-demo-seed.json`
- `scripts/generate-demo-seed.js`
- `_worker.js`
- `wrangler.jsonc`

## Dependency Map

### Backend

- `appscript.js`
  - settings masking masih memuat `fonnte_token`, `moota_gas_url`, `moota_token`
  - router `doPost` masih membuka action `import_moota_config`, `test_moota_config`, `save_affiliate_pixel`, `get_moota_logs`, `get_wa_logs`, `test_wa`, `test_moota_validation`, `test_moota_signature`
  - helper yang terdampak:
    - Moota: normalizer, validator, signature verifier, webhook handler, logs, tests
    - Fonnte: `sendWA`, `logWA_`, `testWADelivery`
    - affiliate: `getAffiliatePixel_`, `saveAffiliatePixel`, komisi/partner/upline logic
  - model data produk masih menyertakan `commission`
  - payload produk/detail/dashboard masih mengandung `total_komisi`, `partners`, `affiliate_pixels`, `upline_*`

### Frontend

- `admin-area.html`
  - field config `Fonnte Token`
  - panel `Moota Payment Gateway`
  - validasi dan test koneksi Moota
  - field produk `Komisi Affiliate`
- `dashboard.html`
  - banner partner/affiliate
  - saldo komisi, partner list, sponsor/upline
  - affiliate links, promo links, affiliate landing pages
  - pixel modal + action `save_affiliate_pixel`
- `checkout.html`
  - query param `ref` / `aff_id`
  - payload checkout masih mengirim `aff_id`
- `index.html`
  - propagasi `ref` / `aff_id` ke detail produk dan checkout
- `p.html`
  - capture affiliate ref ke `localStorage`
- `login.html`
  - bootstrap dashboard masih menyimpan `affiliate_pixels`

### Worker / Runtime

- `_worker.js`
  - route `/webhook/moota`
  - env dependency `MOOTA_GAS_URL`, `MOOTA_TOKEN`
  - Moota signature verification
- `wrangler.jsonc`
  - env vars `MOOTA_GAS_URL`, `MOOTA_TOKEN`

### Seed / Documentation

- `scripts/generate-demo-seed.js`
  - settings seed untuk `fonnte_token`, `moota_gas_url`, `moota_token`
  - header produk `commission`
  - konten affiliate demo
- `demo-data/google-sheets-demo-seed.json`
  - mirror dari data seed di atas
- `README.md`
  - dokumentasi Moota
  - technical notes Moota
  - troubleshooting Moota

## Cross-Module References

- `admin-area.html` -> `appscript.js`
  - `test_moota_config`
  - `update_settings`
  - `save_product`
- `dashboard.html` -> `appscript.js`
  - `get_dashboard_data`
  - `save_affiliate_pixel`
  - `get_pages`
- `checkout.html` / `index.html` / `p.html` -> `appscript.js`
  - affiliate ref propagation memengaruhi `get_product`, `create_order`, dan cache local browser
- `_worker.js` -> `appscript.js`
  - worker meneruskan webhook Moota ke Apps Script
- `wrangler.jsonc` -> `_worker.js`
  - runtime env untuk Moota
- `scripts/generate-demo-seed.js` -> `demo-data/google-sheets-demo-seed.json`
  - seed generator perlu dibersihkan dan lalu digenerate ulang
- source root -> `installer/`
  - mirror akan disinkronkan ulang dengan `npm run sync:installer`

## Planned Refactor

- hapus seluruh route, helper, dan config Moota/Fonnte/Affiliate
- rapikan payload dashboard/member area agar hanya menyisakan data account, order, produk, dan halaman
- hapus field `commission` dari admin produk dan seed demo
- hapus propagasi `ref`/`aff_id` di frontend
- sinkronkan mirror `installer/`
- update `README` dan tambah changelog removal
