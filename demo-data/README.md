## Demo Seed

File utama ada di `demo-data/google-sheets-demo-seed.json` dan digenerate ulang lewat:

```bash
node scripts/generate-demo-seed.js
```

Catatan format:

- Kolom runtime yang saat ini dipakai `appscript.js` tetap diletakkan di depan agar kompatibel dengan schema sheet aktif.
- Kolom tambahan seperti `created_at`, `updated_at`, `user_id`, `product_id`, `category`, dan `related_product_id` ditaruh di belakang untuk kebutuhan demo, relasi, dan validasi.
- Status transaksi memakai nilai runtime aktif: `Pending`, `Lunas`, dan `Batal`.
  Mapping demo: `pending -> Pending`, `completed -> Lunas`, `cancelled -> Batal`.

Sheet yang disiapkan:

- `Settings`
- `Users`
- `Orders`
- `Access_Rules`
- `Pages`

Tabel utama (`Users`, `Orders`, `Access_Rules`, `Pages`) masing-masing berisi 50-100 entri dengan variasi realistis dan edge cases terkontrol.
