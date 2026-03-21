# Changelog

## 2026-03-21

### Removed

- Seluruh integrasi Fonnte dari backend, admin area, dan konfigurasi runtime.
- Seluruh integrasi Moota dari Apps Script, Worker, admin area, dokumentasi, dan seed demo.
- Seluruh fitur affiliate dari backend, dashboard member, frontend checkout, propagasi query param, dan seed demo.
- Field `commission` dari schema produk demo dan generator seed.

### Changed

- Dashboard member difokuskan ulang ke produk aktif, riwayat pesanan, dan halaman informasi.
- Admin area hanya menampilkan konfigurasi yang masih aktif.
- Seed Google Sheets diregenerasi agar sesuai schema runtime baru.
- README diperbarui untuk alur checkout fisik manual via WhatsApp dan konfigurasi yang masih didukung.
- Invalidation cache kini memakai manifest versi per-tag (`settings`, `products`, `pages`, `orders`, `users`) agar perubahan admin lebih cepat terlihat di halaman live tanpa purge total.

### Notes

- Order fisik tetap memakai alur manual: simpan ke Google Sheets lalu lanjut ke WhatsApp admin.
- Cleanup key legacy di backend tetap dipertahankan untuk membantu migrasi data lama saat admin menyimpan settings baru.
