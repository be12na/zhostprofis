# Changelog

## 2026-03-22

### Changed

- Runtime cache client sekarang menganggap manifest lokal lebih tua dari 5 detik sebagai stale signal, sehingga halaman live tidak lagi terlalu cepat percaya pada cache browser lama setelah reload.
- Invalidation manifest sekarang dibroadcast lintas-tab lewat `localStorage` dan `BroadcastChannel`, sehingga tab publik, checkout, dashboard, dan akses bisa refresh lebih cepat setelah admin mengubah data.
- Ditambahkan regression test `scripts/test-cache-runtime.js` untuk memverifikasi refresh manifest sebelum cacheable fetch, stale detection saat manifest tua, dan reaksi watcher tanpa menunggu interval poll.

## 2026-03-21

### Removed

- Seluruh integrasi Fonnte dari backend, admin area, dan konfigurasi runtime.
- Seluruh integrasi payment gateway legacy dari Apps Script, Worker, admin area, dokumentasi, dan seed demo.
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
