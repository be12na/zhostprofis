## Database Migration Notes

File: `20260324_remove_stock_validation.sql`

Tujuan migrasi ini adalah membersihkan artefak validasi stok yang tidak lagi dipakai:

1. Drop check constraint terkait stok.
2. Drop trigger/function/procedure validasi stok.
3. Drop kolom stok/konfigurasi stok lama jika masih ada.

### Catatan penting

- Runtime utama proyek ini menggunakan Google Sheets + Apps Script, sehingga migrasi SQL bisa menjadi no-op pada deployment standar.
- Jalankan script SQL ini **hanya** pada deployment yang memang memiliki database relasional dan sebelumnya mengaktifkan validasi stok.
