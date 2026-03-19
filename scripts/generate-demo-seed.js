#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SEED = 20260319;
const OUTPUT_DIR = path.join(__dirname, "..", "demo-data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "google-sheets-demo-seed.json");
const BASE_NOW = new Date("2026-03-19T09:00:00.000Z");

const rand = mulberry32(SEED);

const firstNames = [
  "Aditya", "Aisyah", "Alif", "Amanda", "Ananda", "Andi", "Anisa", "Ardi", "Aulia", "Bagas",
  "Bima", "Cahya", "Citra", "Damar", "Dewi", "Dimas", "Eka", "Fajar", "Farah", "Fikri",
  "Gilang", "Hana", "Hanif", "Indra", "Intan", "Irfan", "Jihan", "Kevin", "Laras", "Lukman",
  "Mega", "Nadia", "Naufal", "Nisa", "Pratama", "Putri", "Rafi", "Rara", "Rizky", "Salsa",
  "Sarah", "Satria", "Shinta", "Sinta", "Teguh", "Tia", "Vina", "Wahyu", "Yogi", "Zahra"
];

const lastNames = [
  "Abdillah", "Akbar", "Anggraini", "Anjani", "Ariyanto", "Budiman", "Cahyadi", "Damayanti", "Firmansyah", "Gunawan",
  "Halim", "Haryanto", "Iskandar", "Kurniawan", "Lestari", "Mahardika", "Maulana", "Nugraha", "Permata", "Prasetyo",
  "Putra", "Rahmawati", "Ramadhan", "Saputra", "Setiawan", "Siregar", "Sofyan", "Sulistyo", "Utami", "Wibowo"
];

const domains = [
  "demo.zhost.id", "maildemo.id", "ruangusaha.id", "studiopromo.id", "marketlabs.id"
];

const streetNames = [
  "Mawar", "Melati", "Kenanga", "Flamboyan", "Pahlawan", "Diponegoro", "Gatot Subroto", "Sudirman",
  "Ahmad Yani", "Majapahit", "Pemuda", "Sisingamangaraja", "Merdeka", "Cendana", "Anggrek"
];

const cities = [
  { city: "Jakarta Selatan", province: "DKI Jakarta" },
  { city: "Bandung", province: "Jawa Barat" },
  { city: "Bekasi", province: "Jawa Barat" },
  { city: "Bogor", province: "Jawa Barat" },
  { city: "Depok", province: "Jawa Barat" },
  { city: "Semarang", province: "Jawa Tengah" },
  { city: "Yogyakarta", province: "DI Yogyakarta" },
  { city: "Surabaya", province: "Jawa Timur" },
  { city: "Malang", province: "Jawa Timur" },
  { city: "Denpasar", province: "Bali" },
  { city: "Makassar", province: "Sulawesi Selatan" },
  { city: "Medan", province: "Sumatera Utara" }
];

const productFamilies = [
  {
    category: "Hosting",
    serviceType: "subscription",
    prefix: "Cloud Hosting",
    audiences: ["UMKM", "Agency", "Kursus Online", "Brand Pribadi", "Landing Page"],
    focus: ["uptime tinggi", "deploy cepat", "backup otomatis", "SSL aktif", "isolasi resource"],
    min: 95000,
    max: 650000
  },
  {
    category: "Domain",
    serviceType: "digital",
    prefix: "Paket Domain",
    audiences: ["Startup", "Toko Online", "Kelas Berbayar", "Komunitas", "Personal Brand"],
    focus: ["registrasi cepat", "perpanjangan otomatis", "DNS fleksibel", "WHOIS guard", "setup nameserver"],
    min: 120000,
    max: 425000
  },
  {
    category: "VPS",
    serviceType: "subscription",
    prefix: "Managed VPS",
    audiences: ["Aplikasi Internal", "ERP", "Marketplace", "Portal Berita", "Automasi Bisnis"],
    focus: ["monitoring 24 jam", "setup firewall", "snapshot berkala", "hardening server", "patch rutin"],
    min: 385000,
    max: 2450000
  },
  {
    category: "Website",
    serviceType: "service",
    prefix: "Website Custom",
    audiences: ["Klinik", "Sekolah", "F&B", "Property", "Jasa Profesional"],
    focus: ["copywriting siap pakai", "halaman CTA", "optimasi mobile", "integrasi form", "analytics dasar"],
    min: 1800000,
    max: 8500000
  },
  {
    category: "SEO",
    serviceType: "service",
    prefix: "SEO Booster",
    audiences: ["Bisnis Lokal", "Blog Niche", "Portal Company", "Produk Digital", "Landing Affiliate"],
    focus: ["riset keyword", "audit teknis", "optimasi on-page", "schema markup", "tracking ranking"],
    min: 450000,
    max: 3650000
  },
  {
    category: "Maintenance",
    serviceType: "service",
    prefix: "Website Care",
    audiences: ["WooCommerce", "Company Profile", "Membership", "Portal Event", "Microsite Campaign"],
    focus: ["update plugin", "backup harian", "monitor error", "cek broken link", "laporan bulanan"],
    min: 275000,
    max: 1900000
  },
  {
    category: "Automation",
    serviceType: "service",
    prefix: "Workflow Automation",
    audiences: ["Sales Team", "Customer Service", "Finance", "HR", "Creator Economy"],
    focus: ["sinkron spreadsheet", "trigger WhatsApp", "notifikasi email", "dashboard internal", "quality control"],
    min: 950000,
    max: 6450000
  },
  {
    category: "Course",
    serviceType: "digital",
    prefix: "Kelas Intensif",
    audiences: ["Pemula", "Freelancer", "Admin Toko", "Affiliate", "Operator Sekolah"],
    focus: ["video on demand", "template siap pakai", "worksheet PDF", "group diskusi", "rekaman update"],
    min: 49000,
    max: 499000
  },
  {
    category: "Consulting",
    serviceType: "consulting",
    prefix: "Sesi Konsultasi",
    audiences: ["Founder", "Marketing Lead", "Tim IT", "Owner UMKM", "Tim Operasional"],
    focus: ["strategi 90 hari", "prioritas eksekusi", "review funnel", "roadmap teknis", "audit conversion"],
    min: 299000,
    max: 2400000
  }
];

const themeModes = ["light", "dark"];
const adminNote = "Kolom schema runtime lama dipertahankan di depan; kolom tambahan ada di belakang untuk relasi dan timestamp.";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function chance(probability) {
  return rand() < probability;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function roundCurrency(value) {
  return Math.round(value / 5000) * 5000;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function sha256Password(value) {
  return "sha256$" + crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function formatDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function formatDateTime(date) {
  return new Date(date).toISOString();
}

function shiftDate(baseDate, days, hours) {
  const next = new Date(baseDate);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(next.getUTCHours() + hours);
  return next;
}

function makePhone(index) {
  return "8" + pad(112000000 + index * 731, 9);
}

function makeAddress(index) {
  const cityInfo = cities[index % cities.length];
  const street = streetNames[index % streetNames.length];
  const block = randomInt(1, 19);
  const number = randomInt(1, 240);
  const rt = pad(randomInt(1, 9), 3);
  const rw = pad(randomInt(1, 9), 3);
  return {
    city: cityInfo.city,
    province: cityInfo.province,
    address: `Jl. ${street} No. ${number}, Blok ${block}, RT ${rt}/RW ${rw}, ${cityInfo.city}, ${cityInfo.province}`
  };
}

function makeHtmlContent(title, subtitle, ctaLabel, extra) {
  return [
    "<section class=\"lp-shell\">",
    `  <header><p class="eyebrow">Demo Landing Page</p><h1>${title}</h1><p>${subtitle}</p></header>`,
    "  <div class=\"benefits\">",
    "    <ul>",
    `      <li>Implementasi cepat dan terstruktur untuk ${extra}</li>`,
    "      <li>Checklist operasional dan panduan handoff singkat</li>",
    "      <li>Template follow-up dan pengukuran hasil mingguan</li>",
    "    </ul>",
    "  </div>",
    `  <footer><a href="#cta">${ctaLabel}</a></footer>`,
    "</section>"
  ].join("\n");
}

function buildUsers() {
  const headers = [
    "user_id",
    "email",
    "password",
    "nama_lengkap",
    "role",
    "status",
    "tanggal_bergabung",
    "expired_at",
    "created_at",
    "updated_at"
  ];

  const rows = [];
  const profiles = [];

  for (let i = 1; i <= 60; i += 1) {
    const first = firstNames[(i - 1) % firstNames.length];
    const last = lastNames[(i * 3) % lastNames.length];
    const domain = domains[(i - 1) % domains.length];
    const role =
      i <= 4 ? "admin" :
      i <= 10 ? "moderator" :
      i <= 28 ? "user" :
      "member";
    const status =
      role === "admin" ? "Active" :
      chance(0.72) ? "Active" :
      chance(0.55) ? "Trial" :
      chance(0.5) ? "Suspended" :
      "Inactive";

    const joinedAt = shiftDate(BASE_NOW, -randomInt(20, 540), -randomInt(1, 22));
    const updatedAt = shiftDate(joinedAt, randomInt(0, 90), randomInt(0, 12));
    const userId = `u-${100000 + i}`;
    const fullName = `${first} ${last}`;
    const email = `${slugify(fullName).replace(/-/g, ".")}.${pad(i, 2)}@${domain}`;
    const password = sha256Password(`DemoPass#${pad(i, 3)}`);
    const expiresAt =
      role === "admin" ? "-" :
      chance(0.5) ? "-" :
      formatDateOnly(shiftDate(updatedAt, randomInt(30, 360), 0));
    const addressInfo = makeAddress(i);
    const phone = makePhone(i);

    const row = [
      userId,
      email,
      password,
      fullName,
      role,
      status,
      formatDateOnly(joinedAt),
      expiresAt,
      formatDateTime(joinedAt),
      formatDateTime(updatedAt)
    ];

    rows.push(row);
    profiles.push({
      userId,
      email,
      name: fullName,
      role,
      status,
      phone,
      address: addressInfo.address,
      city: addressInfo.city,
      province: addressInfo.province
    });
  }

  rows[56][7] = null;
  rows[57][7] = "";
  rows[58][3] = "Nabila Putri Kirana Paramita Wijayakusuma Pradnyawati Kusumawardhani Santoso Rahardjo Nugroho untuk Validasi Panjang Nama Demo";
  rows[59][5] = "Inactive";
  rows[59][7] = formatDateOnly(shiftDate(BASE_NOW, -90, 0));

  return { headers, rows, profiles };
}

function buildProducts() {
  const headers = [
    "id",
    "title",
    "desc",
    "url",
    "harga",
    "status",
    "lp_url",
    "image_url",
    "pixel_id",
    "pixel_token",
    "pixel_test_code",
    "commission",
    "category",
    "service_type",
    "created_at",
    "updated_at"
  ];

  const rows = [];
  const records = [];

  for (let i = 1; i <= 72; i += 1) {
    const family = productFamilies[(i - 1) % productFamilies.length];
    const tier = pick(["Starter", "Growth", "Pro", "Scale", "Priority", "Enterprise"]);
    const audience = family.audiences[(i * 2) % family.audiences.length];
    const focus = family.focus[(i * 3) % family.focus.length];
    const suffix = ["01", "02", "03", "04", "05", "06", "07", "08"][Math.floor((i - 1) / productFamilies.length) % 8];
    const title = `${family.prefix} ${tier} ${suffix} untuk ${audience}`;
    const productSlug = slugify(title);
    const createdAt = shiftDate(BASE_NOW, -randomInt(10, 380), -randomInt(1, 18));
    const updatedAt = shiftDate(createdAt, randomInt(1, 70), randomInt(0, 14));
    const price = roundCurrency(randomInt(family.min, family.max));
    const commission = family.serviceType === "consulting"
      ? roundCurrency(price * (chance(0.3) ? 0 : (chance(0.5) ? 0.1 : 0.15)))
      : roundCurrency(price * (chance(0.2) ? 0 : (chance(0.5) ? 0.12 : 0.2)));
    const status =
      i % 9 === 0 ? "Inactive" :
      i % 11 === 0 ? "Draft" :
      "Active";

    const row = [
      `PRD-${pad(i, 4)}`,
      title,
      `${family.prefix} ini cocok untuk ${audience.toLowerCase()} dengan fokus ${focus}, onboarding singkat, dan dokumentasi yang mudah diteruskan ke tim internal.`,
      `https://demo.zhost.app/access/${productSlug}`,
      price,
      status,
      "",
      `https://picsum.photos/seed/${productSlug}/960/960`,
      chance(0.55) ? `PIX-${pad(100000 + i, 6)}` : "",
      chance(0.4) ? `token_${productSlug}_${pad(i, 2)}` : "",
      chance(0.3) ? `TEST${pad(7000 + i, 5)}` : "",
      commission,
      family.category,
      family.serviceType,
      formatDateTime(createdAt),
      formatDateTime(updatedAt)
    ];

    rows.push(row);
    records.push({
      id: row[0],
      title: row[1],
      harga: row[4],
      status: row[5],
      category: row[12],
      serviceType: row[13],
      createdAt: row[14],
      updatedAt: row[15]
    });
  }

  rows[4][2] = "";
  rows[10][7] = null;
  rows[22][1] = "Workflow Automation Enterprise 03 untuk Creator Economy dengan Integrasi Multichannel, Approval Bertingkat, dan SLA Prioritas";
  rows[36][6] = "";
  rows[51][2] = "Paket ini sengaja memiliki deskripsi sangat panjang untuk menguji validasi field maksimum. " +
    "Mencakup audit, implementasi, checklist launch, handover, library template, kontrol perubahan, " +
    "serta rekomendasi optimasi mingguan yang bisa dipakai tim operasional maupun marketing tanpa perlu menebak langkah berikutnya.";
  rows[63][4] = 0;
  rows[63][11] = 0;

  return { headers, rows, records };
}

function buildPages(products, users) {
  const headers = [
    "id",
    "slug",
    "title",
    "content",
    "status",
    "created_at",
    "owner_id",
    "meta_pixel_id",
    "meta_pixel_token",
    "meta_pixel_test_event",
    "theme_mode",
    "updated_at",
    "related_product_id"
  ];

  const rows = [];
  const records = [];
  const activeProducts = products.filter((product) => product.status === "Active");
  const nonAdminUsers = users.filter((user) => user.role !== "admin");

  for (let i = 0; i < 40; i += 1) {
    const product = activeProducts[i];
    const slug = `promo-${slugify(product.title).slice(0, 44)}-${pad(i + 1, 2)}`;
    const createdAt = shiftDate(product.createdAt, randomInt(0, 6), randomInt(0, 8));
    const updatedAt = shiftDate(createdAt, randomInt(1, 50), randomInt(0, 12));
    const row = [
      `PG-${pad(i + 1, 4)}`,
      slug,
      `Landing ${product.title}`,
      makeHtmlContent(product.title, `Halaman promosi untuk kategori ${product.category} dengan CTA yang langsung ke proses penawaran.`, "Minta Demo", product.category),
      i % 17 === 0 ? "Draft" : "Active",
      formatDateTime(createdAt),
      "ADMIN",
      chance(0.45) ? `META-${pad(20000 + i, 5)}` : "",
      chance(0.3) ? `meta_token_${slug}` : "",
      chance(0.25) ? `EVT-${pad(900 + i, 4)}` : "",
      themeModes[i % themeModes.length],
      formatDateTime(updatedAt),
      product.id
    ];
    rows.push(row);
    records.push({
      id: row[0],
      slug: row[1],
      ownerId: row[6],
      relatedProductId: row[12]
    });
  }

  for (let i = 0; i < 15; i += 1) {
    const owner = nonAdminUsers[i];
    const product = activeProducts[(i + 12) % activeProducts.length];
    const slug = `affiliate-${slugify(owner.name).slice(0, 28)}-${pad(i + 1, 2)}`;
    const createdAt = shiftDate(BASE_NOW, -randomInt(5, 120), -randomInt(1, 18));
    const updatedAt = shiftDate(createdAt, randomInt(0, 40), randomInt(0, 12));
    const row = [
      `PG-${pad(i + 41, 4)}`,
      slug,
      `LP Affiliate ${owner.name} - ${product.category}`,
      makeHtmlContent(
        `Promo ${product.title}`,
        `Template halaman milik ${owner.name} untuk kebutuhan affiliate dan follow up lead.`,
        "Lihat Penawaran",
        owner.city
      ),
      i % 8 === 0 ? "Inactive" : "Active",
      formatDateTime(createdAt),
      owner.userId,
      chance(0.35) ? `META-${pad(30000 + i, 5)}` : "",
      chance(0.25) ? `meta_token_${slug}` : "",
      chance(0.2) ? `EVT-${pad(1800 + i, 4)}` : "",
      themeModes[(i + 1) % themeModes.length],
      formatDateTime(updatedAt),
      product.id
    ];
    rows.push(row);
    records.push({
      id: row[0],
      slug: row[1],
      ownerId: row[6],
      relatedProductId: row[12]
    });
  }

  rows[7][8] = null;
  rows[12][3] = rows[12][3] + "\n<p>Catatan tambahan untuk pengujian field konten yang lebih panjang dan multi paragraf.</p>";
  rows[44][9] = "";

  return { headers, rows, records };
}

function attachLandingPages(productsRows, pagesRows) {
  const linkedPages = pagesRows.filter((row) => row[6] === "ADMIN" && row[4] === "Active");
  for (let i = 0; i < linkedPages.length; i += 1) {
    const page = linkedPages[i];
    const productId = page[12];
    const productRow = productsRows.find((row) => row[0] === productId);
    if (productRow) productRow[6] = `${page[1]}.html`;
  }
}

function buildOrders(users, products) {
  const headers = [
    "timestamp",
    "nama",
    "email",
    "no_wa",
    "alamat",
    "detail_pesanan",
    "total_harga",
    "status_pembayaran",
    "bukti_transfer",
    "user_id",
    "product_id",
    "quantity",
    "created_at",
    "updated_at"
  ];

  const rows = [];
  const buyers = users.filter((user) => user.role !== "admin");
  const orderProducts = products.filter((product) => product.status === "Active" && Number(product.harga || 0) > 0);

  for (let i = 1; i <= 84; i += 1) {
    const buyer = buyers[(i * 5) % buyers.length];
    const product = orderProducts[(i * 7) % orderProducts.length];
    const quantity = (i % 9 === 0) ? 3 : (i % 5 === 0 ? 2 : 1);
    const timestamp = shiftDate(BASE_NOW, -randomInt(1, 365), -randomInt(1, 22));
    const total = Number(product.harga) * quantity;
    const status =
      i % 7 === 0 ? "Batal" :
      i % 3 === 0 ? "Lunas" :
      "Pending";
    const updatedAt = shiftDate(timestamp, status === "Pending" ? randomInt(0, 3) : randomInt(1, 12), randomInt(0, 10));
    const proof =
      status === "Lunas" ? `https://cdn.demo.zhost.app/proofs/${formatDateOnly(timestamp)}-${slugify(product.id)}.jpg` :
      status === "Batal" ? "" :
      "";

    const row = [
      formatDateTime(timestamp),
      buyer.name,
      buyer.email,
      "'" + buyer.phone,
      buyer.address,
      `Produk: ${product.title} | Kategori: ${product.category} | Jumlah: ${quantity} | Harga: Rp ${Number(product.harga).toLocaleString("id-ID")}`,
      total,
      status,
      proof,
      buyer.userId,
      product.id,
      quantity,
      formatDateTime(timestamp),
      formatDateTime(updatedAt)
    ];

    rows.push(row);
  }

  rows[6][8] = null;
  rows[12][4] = rows[12][4] + ", Patokan rumah cat krem dekat minimarket 24 jam dan gang sebelah mushola dengan akses kurir motor.";
  rows[18][5] = rows[18][5] + " | Catatan: pelanggan meminta invoice terpisah dan konfirmasi setelah jam 19.30 WIB.";
  rows[41][8] = "";
  rows[73][5] = "Produk: " + products[1].title + " | Jumlah: 5 | Harga: Rp " + Number(products[1].harga).toLocaleString("id-ID") + " | Catatan: order batch untuk pengujian panjang maksimum pada detail transaksi demo.";

  return { headers, rows };
}

function buildSettings() {
  const headers = ["key", "value", "created_at", "updated_at"];
  const createdAt = formatDateTime(shiftDate(BASE_NOW, -120, 0));
  const updatedAt = formatDateTime(shiftDate(BASE_NOW, -2, 0));
  const rows = [
    ["site_name", "ZHOST Demo Commerce", createdAt, updatedAt],
    ["site_tagline", "Demo aplikasi penjualan produk, jasa, dan affiliate tools", createdAt, updatedAt],
    ["site_logo", "https://cdn.demo.zhost.app/assets/logo-demo.png", createdAt, updatedAt],
    ["site_favicon", "https://cdn.demo.zhost.app/assets/favicon-demo.png", createdAt, updatedAt],
    ["site_url", "https://demo.zhost.app", createdAt, updatedAt],
    ["wa_admin", "81290000001", createdAt, updatedAt],
    ["bank_name", "Bank Central Demo", createdAt, updatedAt],
    ["bank_norek", "1234567890123", createdAt, updatedAt],
    ["bank_owner", "PT ZHOST Demo Indonesia", createdAt, updatedAt],
    ["contact_email", "hello@demo.zhost.app", createdAt, updatedAt],
    ["support_email", "support@demo.zhost.app", createdAt, updatedAt],
    ["support_hours", "Senin-Sabtu 08:00-20:00 WIB", createdAt, updatedAt],
    ["fonnte_token", "", createdAt, updatedAt],
    ["moota_gas_url", "https://demo.zhost.app/webhook/moota", createdAt, updatedAt],
    ["moota_token", "", createdAt, updatedAt],
    ["ik_public_key", "public_demo_zhost_key", createdAt, updatedAt],
    ["ik_endpoint", "https://ik.imagekit.io/demo-zhost", createdAt, updatedAt],
    ["cf_zone_id", "", createdAt, updatedAt],
    ["cf_api_token", "", createdAt, updatedAt],
    ["hero_title", "Skala penjualan digital dan layanan Anda lebih rapi", createdAt, updatedAt],
    ["hero_subtitle", "Semua katalog, checkout, order tracking, dan halaman promo sudah siap untuk demo.", createdAt, updatedAt],
    ["seo_keywords", "hosting,vps,website,seo,automation,affiliate", createdAt, updatedAt],
    ["maintenance_mode", "false", createdAt, updatedAt],
    ["timezone", "Asia/Jakarta", createdAt, updatedAt]
  ];
  rows[17][1] = null;
  return { headers, rows };
}

function validateDataset(dataset) {
  const sheets = dataset.sheets;
  const counts = {};

  sheets.forEach((sheet) => {
    counts[sheet.name] = sheet.rows.length;
    sheet.rows.forEach((row, index) => {
      if (row.length !== sheet.headers.length) {
        throw new Error(`Sheet ${sheet.name} row ${index + 2} length mismatch.`);
      }
    });
  });

  if (counts.Users < 50 || counts.Users > 100) throw new Error("Users count must be 50-100.");
  if (counts.Access_Rules < 50 || counts.Access_Rules > 100) throw new Error("Access_Rules count must be 50-100.");
  if (counts.Orders < 50 || counts.Orders > 100) throw new Error("Orders count must be 50-100.");
  if (counts.Pages < 50 || counts.Pages > 100) throw new Error("Pages count must be 50-100.");

  const usersSheet = sheets.find((sheet) => sheet.name === "Users");
  const productsSheet = sheets.find((sheet) => sheet.name === "Access_Rules");
  const pagesSheet = sheets.find((sheet) => sheet.name === "Pages");
  const ordersSheet = sheets.find((sheet) => sheet.name === "Orders");

  const userMap = new Map(usersSheet.rows.map((row) => [row[0], row]));
  const userEmailMap = new Map(usersSheet.rows.map((row) => [String(row[1]).toLowerCase(), row[0]]));
  const productMap = new Map(productsSheet.rows.map((row) => [row[0], row]));
  const pageSlugSet = new Set(pagesSheet.rows.map((row) => row[1]));

  if (new Set(usersSheet.rows.map((row) => row[0])).size !== usersSheet.rows.length) throw new Error("Duplicate user_id detected.");
  if (new Set(usersSheet.rows.map((row) => row[1])).size !== usersSheet.rows.length) throw new Error("Duplicate email detected.");
  if (new Set(productsSheet.rows.map((row) => row[0])).size !== productsSheet.rows.length) throw new Error("Duplicate product id detected.");
  if (new Set(pagesSheet.rows.map((row) => row[1])).size !== pagesSheet.rows.length) throw new Error("Duplicate page slug detected.");

  const roles = new Set(usersSheet.rows.map((row) => row[4]));
  ["admin", "user", "moderator"].forEach((role) => {
    if (!roles.has(role)) throw new Error(`Required role missing: ${role}`);
  });

  ordersSheet.rows.forEach((row, index) => {
    const email = String(row[2] || "").toLowerCase();
    const userId = row[9];
    const productId = row[10];
    if (!userMap.has(userId)) throw new Error(`Order row ${index + 2} references unknown user_id ${userId}`);
    if (!productMap.has(productId)) throw new Error(`Order row ${index + 2} references unknown product_id ${productId}`);
    if (userEmailMap.get(email) !== userId) throw new Error(`Order row ${index + 2} email/user relation mismatch`);
  });

  pagesSheet.rows.forEach((row, index) => {
    const ownerId = row[6];
    const relatedProductId = row[12];
    if (ownerId !== "ADMIN" && !userMap.has(ownerId)) throw new Error(`Page row ${index + 2} references unknown owner_id ${ownerId}`);
    if (relatedProductId && !productMap.has(relatedProductId)) throw new Error(`Page row ${index + 2} references unknown product_id ${relatedProductId}`);
  });

  productsSheet.rows.forEach((row, index) => {
    const landing = row[6];
    if (landing) {
      const slug = String(landing).replace(/\.html$/i, "");
      if (!pageSlugSet.has(slug)) throw new Error(`Product row ${index + 2} references missing landing page slug ${slug}`);
    }
  });

  const nullExists = sheets.some((sheet) => sheet.rows.some((row) => row.includes(null)));
  const emptyStringExists = sheets.some((sheet) => sheet.rows.some((row) => row.includes("")));
  const longStringExists = sheets.some((sheet) => sheet.rows.some((row) => row.some((cell) => typeof cell === "string" && cell.length >= 120)));

  if (!nullExists) throw new Error("Expected at least one null edge case.");
  if (!emptyStringExists) throw new Error("Expected at least one empty string edge case.");
  if (!longStringExists) throw new Error("Expected at least one long-string edge case.");
}

function countEdgeCases(sheets) {
  const summary = {
    null_values: 0,
    empty_strings: 0,
    long_strings_ge_120: 0
  };

  sheets.forEach((sheet) => {
    sheet.rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell === null) summary.null_values += 1;
        if (cell === "") summary.empty_strings += 1;
        if (typeof cell === "string" && cell.length >= 120) summary.long_strings_ge_120 += 1;
      });
    });
  });

  return summary;
}

function main() {
  const users = buildUsers();
  const products = buildProducts();
  const pages = buildPages(products.records, users.profiles);
  attachLandingPages(products.rows, pages.rows);
  const orders = buildOrders(users.profiles, products.records);
  const settings = buildSettings();

  const sheets = [
    { name: "Settings", headers: settings.headers, rows: settings.rows },
    { name: "Users", headers: users.headers, rows: users.rows },
    { name: "Orders", headers: orders.headers, rows: orders.rows },
    { name: "Access_Rules", headers: products.headers, rows: products.rows },
    { name: "Pages", headers: pages.headers, rows: pages.rows }
  ];

  const dataset = {
    metadata: {
      generated_at: new Date().toISOString(),
      generator: "scripts/generate-demo-seed.js",
      format: "json",
      target: "Google Sheets / demo database import",
      deterministic_seed: SEED,
      notes: [
        adminNote,
        "Status transaksi runtime aktif menggunakan Pending, Lunas, dan Batal agar tetap kompatibel dengan appscript.js.",
        "Kolom tambahan seperti user_id, product_id, category, created_at, dan updated_at ditambahkan setelah kolom runtime aktif."
      ],
      status_mapping: {
        pending: "Pending",
        completed: "Lunas",
        cancelled: "Batal"
      },
      counts: Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet.rows.length])),
      edge_case_summary: countEdgeCases(sheets)
    },
    sheets
  };

  validateDataset(dataset);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataset, null, 2) + "\n", "utf8");

  console.log("Demo seed generated:");
  console.log(`- Output : ${OUTPUT_FILE}`);
  console.log(`- Seed   : ${SEED}`);
  sheets.forEach((sheet) => {
    console.log(`- ${sheet.name}: ${sheet.rows.length} rows`);
  });
}

main();
