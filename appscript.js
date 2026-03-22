const ss = SpreadsheetApp.getActiveSpreadsheet();

/* =========================
   CONFIG.JS INTEGRATION
   (Server-side Configuration)
========================= */
const SCRIPT_CONFIG = {
  // SCRIPT_URL sengaja tidak di-hardcode untuk menghindari exposure endpoint di source.
  // Set via Script Properties: APP_SCRIPT_URL jika memang diperlukan.
  SCRIPT_URL: "",
  ENV: "production"
};

const DEMO_ADMIN_ACCOUNT = {
  id: "demo-admin",
  email: "admin@demo.com",
  password: "admindemo",
  name: "Demo Admin",
  role: "demo_admin",
  read_only: true
};
const ADMIN_SESSION_CACHE_PREFIX = "admin_session_";
const ADMIN_SESSION_STORE_PREFIX = "persist_admin_session_";
const ADMIN_SESSION_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEMO_MASK_VALUE = "\u2022\u2022\u2022\u2022";
const DEMO_MASK_VALUE_LONG = "\u2022\u2022\u2022\u2022\u2022\u2022";
const PHYSICAL_ORDER_HEADERS = ["timestamp", "nama", "email", "no_wa", "alamat", "detail_pesanan", "total_harga", "status_pembayaran", "bukti_transfer"];
const PHYSICAL_ORDER_STATUS_PENDING = "Pending";
const PHYSICAL_ORDER_STATUS_PAID = "Lunas";
const PHYSICAL_ORDER_STATUS_CANCELLED = "Batal";
const CACHE_MANIFEST_SCHEMA = 1;
const CACHE_MANIFEST_CACHE_KEY = "cache_manifest_v1";
const CACHE_MANIFEST_STORE_KEY = "cepat_cache_manifest_v1";
const CACHE_MANIFEST_CACHE_TTL_SECONDS = 5;
const CACHE_MANIFEST_POLL_SECONDS = 15;
const CACHE_MANIFEST_TAGS = ["settings", "products", "pages", "orders", "users"];
const PRODUCT_TITLE_MAX_LENGTH = 120;
const PRODUCT_DESC_MIN_LENGTH = 10;
const PRODUCT_DESC_MAX_LENGTH = 220;

function getScriptConfig(key) {
  try {
    const p = PropertiesService.getScriptProperties();
    const v = p.getProperty(String(key || ""));
    if (v !== null && v !== undefined && String(v) !== "") return String(v);
  } catch (e) {}
  return SCRIPT_CONFIG[key] || "";
}

function testConfiguration() {
  const url = getScriptConfig("SCRIPT_URL");
  return { status: "success", script_url_configured: !!url };
}

/* =========================
   UTIL / HARDENING HELPERS
========================= */
function jsonRes(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput("System API Ready!")
    .setMimeType(ContentService.MimeType.TEXT);
}

// CACHING WRAPPER
function getCachedData_(key, fetcherFn, expirationInSeconds = 600) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  const data = fetcherFn();
  if (data) {
    try {
      cache.put(key, JSON.stringify(data), expirationInSeconds);
    } catch (e) {
      // Data might be too large for cache (100KB limit)
      console.error("Cache Put Error for " + key + ": " + e.toString());
    }
  }
  return data;
}

function getSettingsMap_() {
  return getCachedData_("settings_map", () => {
    const s = ss.getSheetByName("Settings");
    if (!s) return {};
    const d = s.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < d.length; i++) {
      const k = String(d[i][0] || "").trim();
      if (k) map[k] = d[i][1];
    }
    return map;
  }, 1800); // Cache for 30 minutes
}

function normalizeCacheTagList_(input) {
  const valid = {};
  CACHE_MANIFEST_TAGS.forEach(function(tag) {
    valid[tag] = true;
  });
  const source = Array.isArray(input)
    ? input
    : (typeof input === "string" ? String(input).split(",") : []);
  const normalized = [];
  source.forEach(function(item) {
    const tag = String(item || "").trim().toLowerCase();
    if (!tag || !valid[tag]) return;
    if (normalized.indexOf(tag) === -1) normalized.push(tag);
  });
  return normalized;
}

function createDefaultCacheManifest_() {
  const now = Date.now();
  const versions = {};
  CACHE_MANIFEST_TAGS.forEach(function(tag) {
    versions[tag] = now;
  });
  return {
    schema: CACHE_MANIFEST_SCHEMA,
    updated_at: now,
    poll_seconds: CACHE_MANIFEST_POLL_SECONDS,
    versions: versions
  };
}

function normalizeCacheManifest_(raw) {
  const fallback = createDefaultCacheManifest_();
  const parsed = raw && typeof raw === "object" ? raw : {};
  const versions = {};
  CACHE_MANIFEST_TAGS.forEach(function(tag, index) {
    const candidate = Number(parsed.versions && parsed.versions[tag]);
    versions[tag] = isFinite(candidate) && candidate > 0
      ? candidate
      : (Number(fallback.updated_at || Date.now()) + index);
  });
  const maxVersion = Math.max.apply(null, CACHE_MANIFEST_TAGS.map(function(tag) {
    return Number(versions[tag] || 0);
  }).concat([0]));
  const parsedUpdatedAt = Number(parsed.updated_at || 0);
  const updatedAt = (isFinite(parsedUpdatedAt) && parsedUpdatedAt >= maxVersion)
    ? parsedUpdatedAt
    : Math.max(maxVersion, Number(fallback.updated_at || 0));
  return {
    schema: CACHE_MANIFEST_SCHEMA,
    updated_at: updatedAt,
    poll_seconds: CACHE_MANIFEST_POLL_SECONDS,
    versions: versions
  };
}

function writeCacheManifest_(manifest) {
  const normalized = normalizeCacheManifest_(manifest);
  try {
    PropertiesService.getScriptProperties().setProperty(CACHE_MANIFEST_STORE_KEY, JSON.stringify(normalized));
  } catch (e) { }
  invalidateCaches_([CACHE_MANIFEST_CACHE_KEY]);
  try {
    CacheService.getScriptCache().put(CACHE_MANIFEST_CACHE_KEY, JSON.stringify(normalized), CACHE_MANIFEST_CACHE_TTL_SECONDS);
  } catch (e) { }
  return normalized;
}

function getCacheManifest_() {
  try {
    const cached = CacheService.getScriptCache().get(CACHE_MANIFEST_CACHE_KEY);
    if (cached) {
      try { return normalizeCacheManifest_(JSON.parse(cached)); } catch (e) { }
    }
  } catch (e) { }

  try {
    const raw = PropertiesService.getScriptProperties().getProperty(CACHE_MANIFEST_STORE_KEY);
    if (raw) {
      const parsed = normalizeCacheManifest_(JSON.parse(raw));
      try {
        CacheService.getScriptCache().put(CACHE_MANIFEST_CACHE_KEY, JSON.stringify(parsed), CACHE_MANIFEST_CACHE_TTL_SECONDS);
      } catch (e) { }
      return parsed;
    }
  } catch (e) { }

  return writeCacheManifest_(createDefaultCacheManifest_());
}

function getCacheManifestSnapshot_(tags) {
  const manifest = getCacheManifest_();
  const requested = normalizeCacheTagList_(tags);
  const activeTags = requested.length ? requested : CACHE_MANIFEST_TAGS.slice();
  const versions = {};
  activeTags.forEach(function(tag) {
    versions[tag] = Number((manifest.versions && manifest.versions[tag]) || 0);
  });
  return {
    schema: CACHE_MANIFEST_SCHEMA,
    updated_at: Number(manifest.updated_at || 0),
    poll_seconds: CACHE_MANIFEST_POLL_SECONDS,
    tags: activeTags,
    versions: versions
  };
}

function touchCacheTags_(tags) {
  const targetTags = normalizeCacheTagList_(tags);
  if (!targetTags.length) return getCacheManifestSnapshot_();
  const manifest = getCacheManifest_();
  let nextVersion = Math.max(Number(manifest.updated_at || 0) + 1, Date.now());
  targetTags.forEach(function(tag) {
    manifest.versions[tag] = nextVersion;
    nextVersion += 1;
  });
  manifest.updated_at = nextVersion - 1;
  writeCacheManifest_(manifest);
  return getCacheManifestSnapshot_(targetTags);
}

function attachCacheManifest_(payload, tags) {
  if (!payload || typeof payload !== "object") return payload;
  payload.cache_manifest = getCacheManifestSnapshot_(tags);
  return payload;
}

function getCacheManifestPublic_(d) {
  return {
    status: "success",
    data: getCacheManifestSnapshot_(d && d.tags)
  };
}
function getCfgFrom_(cfg, name) {
  return (cfg && cfg[name] !== undefined && cfg[name] !== null) ? cfg[name] : "";
}
function mustSheet_(name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Sheet "${name}" tidak ditemukan`);
  return sh;
}
function toNumberSafe_(v) {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return isFinite(n) ? n : 0;
}
function toISODate_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function normalizeOrderHeaderKey_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureOrdersSheetStructure_() {
  const sh = mustSheet_("Orders");
  const requiredCols = PHYSICAL_ORDER_HEADERS.length;
  if (sh.getMaxColumns() < requiredCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), requiredCols - sh.getMaxColumns());
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, requiredCols).setValues([PHYSICAL_ORDER_HEADERS]);
    sh.setFrozenRows(1);
    return sh;
  }

  const currentHeaders = sh.getRange(1, 1, 1, requiredCols).getValues()[0];
  const normalizedCurrent = currentHeaders.map(normalizeOrderHeaderKey_);
  const normalizedExpected = PHYSICAL_ORDER_HEADERS.map(normalizeOrderHeaderKey_);
  const hasDataRows = sh.getLastRow() > 1;
  const matchesExpected = normalizedExpected.every(function(key, index) {
    return normalizedCurrent[index] === key;
  });

  if (!matchesExpected && !hasDataRows) {
    sh.getRange(1, 1, 1, requiredCols).setValues([PHYSICAL_ORDER_HEADERS]);
  }
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  return sh;
}

function sanitizeOrderText_(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeProductText_(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateProductText_(label, value, options) {
  const cfg = options && typeof options === "object" ? options : {};
  const normalized = normalizeProductText_(value);
  const min = Math.max(0, Number(cfg.min || 0));
  const max = Math.max(0, Number(cfg.max || 0));

  if (cfg.required && !normalized) throw new Error(label + " wajib diisi");
  if (!normalized) return normalized;
  if (/[<>]/.test(String(value || ""))) {
    throw new Error(label + " tidak boleh mengandung tag HTML atau karakter < >");
  }
  if (min && normalized.length < min) {
    throw new Error(label + " minimal " + min + " karakter");
  }
  if (max && normalized.length > max) {
    throw new Error(label + " maksimal " + max + " karakter");
  }
  return normalized;
}

function normalizeProductPayload_(input) {
  const source = input && typeof input === "object" ? input : {};
  const status = String(source.status || "Active").trim() || "Active";
  const normalized = {
    id: normalizeProductText_(source.id),
    title: validateProductText_("Nama Produk", source.title, { required: true, min: 3, max: PRODUCT_TITLE_MAX_LENGTH }),
    desc: validateProductText_("Deskripsi Singkat", source.desc, { required: true, min: PRODUCT_DESC_MIN_LENGTH, max: PRODUCT_DESC_MAX_LENGTH }),
    url: normalizeProductText_(source.url),
    harga: Math.max(0, toNumberSafe_(source.harga)),
    status: status,
    lp_url: normalizeProductText_(source.lp_url),
    image_url: sanitizeAssetUrl_(source.image_url),
    pixel_id: normalizeProductText_(source.pixel_id),
    pixel_token: normalizeProductText_(source.pixel_token),
    pixel_test_code: normalizeProductText_(source.pixel_test_code)
  };
  if (!normalized.id) throw new Error("ID Produk wajib diisi");
  if (!normalized.url) throw new Error("URL Referensi Produk wajib diisi");
  if (!normalized.lp_url) throw new Error("URL Landing Page wajib diisi");
  return normalized;
}

function mapProductRowToObject_(row) {
  const source = Array.isArray(row) ? row : [];
  return {
    id: normalizeProductText_(source[0]),
    title: normalizeProductText_(source[1]),
    desc: normalizeProductText_(source[2]),
    url: normalizeProductText_(source[3]),
    harga: toNumberSafe_(source[4]),
    lp_url: normalizeProductText_(source[6]),
    image_url: sanitizeAssetUrl_(source[7]),
    pixel_id: normalizeProductText_(source[8]),
    pixel_token: normalizeProductText_(source[9]),
    pixel_test_code: normalizeProductText_(source[10])
  };
}

function normalizeAdminProductRows_(rows) {
  return (Array.isArray(rows) ? rows : []).map(function(row) {
    const source = Array.isArray(row) ? row.slice() : [];
    source[0] = normalizeProductText_(source[0]);
    source[1] = normalizeProductText_(source[1]);
    source[2] = normalizeProductText_(source[2]);
    source[3] = normalizeProductText_(source[3]);
    source[6] = normalizeProductText_(source[6]);
    source[7] = sanitizeAssetUrl_(source[7]);
    source[8] = normalizeProductText_(source[8]);
    source[9] = normalizeProductText_(source[9]);
    source[10] = normalizeProductText_(source[10]);
    return source;
  });
}

function normalizeOrderStatus_(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return PHYSICAL_ORDER_STATUS_PENDING;
  if (raw === "lunas" || raw === "paid" || raw === "dibayar") return PHYSICAL_ORDER_STATUS_PAID;
  if (raw === "batal" || raw === "cancelled" || raw === "canceled") return PHYSICAL_ORDER_STATUS_CANCELLED;
  return PHYSICAL_ORDER_STATUS_PENDING;
}

function isPaidOrderStatus_(value) {
  return normalizeOrderStatus_(value) === PHYSICAL_ORDER_STATUS_PAID;
}

function toCurrencyLabel_(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function buildPhysicalOrderDetail_(data) {
  const productId = sanitizeOrderText_(data && (data.id_produk || data.product_id || data.product_id_value));
  const productName = sanitizeOrderText_(data && (data.nama_produk || data.product_name || data.produk));
  const quantity = Math.max(1, Number(data && (data.jumlah || data.qty || data.quantity || 1) || 1));
  const unitPrice = Math.max(0, toNumberSafe_(data && (data.harga_satuan !== undefined ? data.harga_satuan : data.harga)));
  const segments = [];
  if (productId) segments.push("ID: " + productId);
  if (productName) segments.push("Produk: " + productName);
  segments.push("Jumlah: " + quantity);
  segments.push("Harga: " + toCurrencyLabel_(unitPrice));
  return segments.join(" | ");
}

function extractPhysicalOrderProductId_(detail) {
  const match = String(detail || "").match(/(?:^|\|)\s*ID:\s*([^|]+)/i);
  return match && match[1] ? sanitizeOrderText_(match[1]) : "";
}

function extractPhysicalOrderProductName_(detail) {
  const match = String(detail || "").match(/(?:^|\|)\s*Produk:\s*([^|]+)/i);
  return match && match[1] ? sanitizeOrderText_(match[1]) : "";
}

function buildPhysicalOrderReference_(timestamp) {
  const raw = String(timestamp || "").replace(/[^0-9]/g, "");
  const compact = raw ? raw.substring(0, 14) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");
  return "ORD-" + compact;
}

function buildWhatsAppApiUrl_(target, message) {
  const phone = normalizePhone_(target);
  return "https://api.whatsapp.com/send?phone=62" + phone + "&text=" + encodeURIComponent(String(message || ""));
}

function normalizeStoredWhatsApp_(value) {
  let wa = String(value || "").trim();
  if (wa.charAt(0) === "'") wa = wa.substring(1);
  return wa;
}

function getPhysicalOrderRows_() {
  const sh = ensureOrdersSheetStructure_();
  const lastRow = sh.getLastRow();
  if (lastRow <= 1) return [];
  return sh.getRange(2, 1, lastRow - 1, PHYSICAL_ORDER_HEADERS.length).getValues();
}

function physicalOrderRowToAdminRow_(row) {
  const source = Array.isArray(row) ? row : [];
  const timestamp = String(source[0] || "").trim();
  return [
    timestamp,
    timestamp,
    String(source[1] || "").trim(),
    String(source[2] || "").trim().toLowerCase(),
    normalizeStoredWhatsApp_(source[3]),
    String(source[4] || "").trim(),
    String(source[5] || "").trim(),
    toNumberSafe_(source[6]),
    normalizeOrderStatus_(source[7]),
    String(source[8] || "").trim()
  ];
}

function getPhysicalOrderAdminRows_() {
  return getPhysicalOrderRows_().map(physicalOrderRowToAdminRow_);
}

function findPhysicalOrderIndexById_(rows, id) {
  const target = String(id || "").trim();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === target) return i;
  }
  return -1;
}

function getSecret_(name, cfg) {
  const k = String(name || "").trim();
  if (!k) return "";
  try {
    const p = PropertiesService.getScriptProperties();
    const v = p.getProperty(k);
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  } catch (e) {}
  return String(getCfgFrom_(cfg || getSettingsMap_(), k) || "").trim();
}

function isDebugAllowed_() {
  try {
    const p = PropertiesService.getScriptProperties();
    return String(p.getProperty("DEBUG_MODE") || "false").toLowerCase() === "true";
  } catch (e) {
    return false;
  }
}

function hashPassword_(plain) {
  const input = String(plain || "");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  const hex = digest.map(function(b){
    const v = (b < 0 ? b + 256 : b);
    return ("0" + v.toString(16)).slice(-2);
  }).join("");
  return "sha256$" + hex;
}

function verifyPassword_(input, stored) {
  const inStr = String(input || "");
  const st = String(stored || "").trim();
  if (!st) return false;
  if (st.indexOf("sha256$") === 0) return hashPassword_(inStr) === st;
  return inStr === st;
}

function isDemoAdminRole_(role) {
  return String(role || "").trim().toLowerCase() === "demo_admin";
}

function getAdminSessionToken_(data) {
  const source = data || {};
  return String(
    source.auth_session_token ||
    source.admin_session_token ||
    source.session_token ||
    ""
  ).trim();
}

function createAdminSession_(sessionData) {
  const issuedAt = Date.now();
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const session = Object.assign({
    id: "",
    email: "",
    name: "Admin",
    role: "admin",
    read_only: false,
    demo_mode: false,
    issued_at: issuedAt,
    expires_at: 0
  }, sessionData || {});
  const serialized = JSON.stringify(session);
  CacheService.getScriptCache().put(ADMIN_SESSION_CACHE_PREFIX + token, serialized, ADMIN_SESSION_CACHE_TTL_SECONDS);
  try {
    PropertiesService.getScriptProperties().setProperty(ADMIN_SESSION_STORE_PREFIX + token, serialized);
  } catch (e) {}
  return {
    token: token,
    expires_at: session.expires_at,
    session: session
  };
}

function deleteAdminSession_(token) {
  const key = String(token || "").trim();
  if (!key) return false;
  try {
    CacheService.getScriptCache().remove(ADMIN_SESSION_CACHE_PREFIX + key);
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().deleteProperty(ADMIN_SESSION_STORE_PREFIX + key);
  } catch (e) {}
  return true;
}

function getAdminSession_(token) {
  const key = String(token || "").trim();
  if (!key) return null;
  let cached = CacheService.getScriptCache().get(ADMIN_SESSION_CACHE_PREFIX + key);
  if (!cached) {
    try {
      cached = PropertiesService.getScriptProperties().getProperty(ADMIN_SESSION_STORE_PREFIX + key);
      if (cached) CacheService.getScriptCache().put(ADMIN_SESSION_CACHE_PREFIX + key, cached, ADMIN_SESSION_CACHE_TTL_SECONDS);
    } catch (e) {
      cached = null;
    }
  }
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch (e) {
    return null;
  }
}

function validateAdminSessionAccess_(session, options) {
  const opts = options || {};
  const actionName = String(opts.actionName || "aksi admin").trim();
  const allowDemo = opts.allowDemo !== false;
  const allowedRoles = Array.isArray(opts.allowedRoles) && opts.allowedRoles.length
    ? opts.allowedRoles.map(function(role) { return String(role || "").trim().toLowerCase(); })
    : ["admin", "demo_admin"];
  if (!session || typeof session !== "object") {
    throw new Error("Sesi admin tidak valid. Silakan login ulang.");
  }
  const role = String(session.role || "").trim().toLowerCase();
  if (!role || allowedRoles.indexOf(role) === -1) {
    throw new Error("Akses admin ditolak untuk aksi " + actionName + ".");
  }
  if (!allowDemo && isDemoAdminRole_(role)) {
    throw new Error("Mode demo admin hanya dapat melihat data. Aksi " + actionName + " dinonaktifkan.");
  }
  return session;
}

function requireAdminSession_(data, options) {
  const token = getAdminSessionToken_(data);
  if (!token) throw new Error("Sesi admin tidak ditemukan. Silakan login ulang.");
  const session = getAdminSession_(token);
  if (!session) throw new Error("Sesi admin berakhir. Silakan login ulang.");
  return validateAdminSessionAccess_(session, options);
}

function assertNonDemoAdminMutationIfPresent_(data, actionName) {
  const token = getAdminSessionToken_(data);
  if (!token) return null;
  return requireAdminSession_(data, { allowDemo: false, actionName: actionName });
}

function adminLogout(d) {
  try {
    deleteAdminSession_(getAdminSessionToken_(d));
    return { status: "success", message: "Logout berhasil" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function maskDemoValue_(value, opts) {
  const options = opts || {};
  if (options.blank) return "";
  if (options.currency) return DEMO_MASK_VALUE_LONG;
  if (options.email) return "demo@" + DEMO_MASK_VALUE;
  if (options.slug) return DEMO_MASK_VALUE.toLowerCase();
  if (options.short) return "\u2022\u2022\u2022";
  return DEMO_MASK_VALUE;
}

function maskDemoOrderRow_(row) {
  const source = Array.isArray(row) ? row : [];
  return [
    maskDemoValue_(source[0], { short: true }),
    maskDemoValue_(source[1], { short: true }),
    maskDemoValue_(source[2]),
    maskDemoValue_(source[3], { email: true }),
    maskDemoValue_(source[4], { short: true }),
    maskDemoValue_(source[5]),
    maskDemoValue_(source[6]),
    maskDemoValue_(source[7], { currency: true }),
    maskDemoValue_(source[8], { short: true }),
    maskDemoValue_(source[9], { short: true })
  ];
}

function maskDemoUserRow_(row) {
  const source = Array.isArray(row) ? row : [];
  return [
    maskDemoValue_(source[0], { short: true }),
    maskDemoValue_(source[1], { email: true }),
    maskDemoValue_(source[2]),
    maskDemoValue_(source[3]),
    maskDemoValue_(source[4], { short: true }),
    maskDemoValue_(source[5], { short: true }),
    maskDemoValue_(source[6], { short: true }),
    maskDemoValue_(source[7], { short: true })
  ];
}

function maskDemoProductRow_(row) {
  const source = Array.isArray(row) ? row : [];
  return [
    maskDemoValue_(source[0], { short: true }),
    maskDemoValue_(source[1]),
    maskDemoValue_(source[2]),
    "",
    maskDemoValue_(source[4], { currency: true }),
    maskDemoValue_(source[5], { short: true }),
    "",
    "",
    "",
    "",
    "",
    maskDemoValue_(source[11], { currency: true })
  ];
}

function maskDemoPageRow_(row) {
  const source = Array.isArray(row) ? row : [];
  return [
    maskDemoValue_(source[0], { short: true }),
    maskDemoValue_(source[1], { slug: true }),
    maskDemoValue_(source[2]),
    "",
    maskDemoValue_(source[4], { short: true }),
    maskDemoValue_(source[5], { short: true }),
    maskDemoValue_(source[6], { short: true }),
    "",
    "",
    "",
    maskDemoValue_(source[10], { short: true })
  ];
}

function maskDemoSettings_(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return Object.assign({}, source, {
    site_name: DEMO_MASK_VALUE,
    site_tagline: DEMO_MASK_VALUE,
    site_logo: "",
    site_favicon: "",
    contact_email: maskDemoValue_(source.contact_email, { email: true }),
    wa_admin: DEMO_MASK_VALUE,
    ik_public_key: "",
    ik_endpoint: DEMO_MASK_VALUE,
    ik_private_key: "",
    ik_private_key_configured: false,
    cf_zone_id: DEMO_MASK_VALUE,
    cf_api_token: ""
  });
}

function maskAdminDataForDemo_(payload, session) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    status: "success",
    demo_mode: true,
    read_only: true,
    role: session && session.role ? session.role : DEMO_ADMIN_ACCOUNT.role,
    session_expires_at: session && session.expires_at ? session.expires_at : 0,
    stats: {
      users: DEMO_MASK_VALUE,
      orders: DEMO_MASK_VALUE,
      rev: DEMO_MASK_VALUE_LONG
    },
    orders: (source.orders || []).map(maskDemoOrderRow_),
    products: (source.products || []).map(maskDemoProductRow_),
    pages: (source.pages || []).map(maskDemoPageRow_),
    settings: maskDemoSettings_(source.settings || {}),
    users: (source.users || []).map(maskDemoUserRow_),
    has_more_orders: !!source.has_more_orders,
    has_more_users: !!source.has_more_users
  };
}

function sanitizeAssetUrl_(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^data:image\//i.test(value)) return value;
  if (value.charAt(0) === "/") return value;
  if (!/^https?:\/\//i.test(value)) return "";

  const match = value.match(/^https?:\/\/([^\/?#]+)/i);
  const host = match && match[1] ? String(match[1]).toLowerCase() : "";
  if (!host) return "";

  if (
    host === "example.com" ||
    host === "example.org" ||
    host === "example.net" ||
    /(^|\.)example\.(com|org|net)$/i.test(host)
  ) {
    return "";
  }

  return value;
}

function normalizeImageKitEndpoint_(raw) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  return value;
}

function isValidImageKitPublicKey_(value) {
  return /^public_[A-Za-z0-9+/=._-]+$/.test(String(value || "").trim());
}

function isValidImageKitPrivateKey_(value) {
  return /^private_[A-Za-z0-9+/=._-]+$/.test(String(value || "").trim());
}

function isValidImageKitEndpoint_(value) {
  const endpoint = normalizeImageKitEndpoint_(value);
  if (!endpoint) return false;
  if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(endpoint)) return false;
  if (/[?#]/.test(endpoint)) return false;
  return true;
}

function resolveImageKitConfig_(data, cfg) {
  const payload = data || {};
  return {
    publicKey: String((payload.ik_public_key !== undefined ? payload.ik_public_key : getCfgFrom_(cfg, "ik_public_key")) || "").trim(),
    endpoint: normalizeImageKitEndpoint_(payload.ik_endpoint !== undefined ? payload.ik_endpoint : getCfgFrom_(cfg, "ik_endpoint")),
    privateKey: String((payload.ik_private_key !== undefined ? payload.ik_private_key : getSecret_("ik_private_key", cfg)) || "").trim()
  };
}

function validateImageKitConfigFormat_(ikCfg, opts) {
  const options = opts || {};
  const errors = [];
  const requirePublic = options.requirePublic !== false;
  const requireEndpoint = options.requireEndpoint !== false;
  const requirePrivate = options.requirePrivate !== false;

  if (requirePublic && !ikCfg.publicKey) errors.push("ImageKit public key wajib diisi.");
  if (requirePublic && ikCfg.publicKey && !isValidImageKitPublicKey_(ikCfg.publicKey)) {
    errors.push("Format ImageKit public key tidak valid. Harus diawali dengan 'public_'.");
  }

  if (requireEndpoint && !ikCfg.endpoint) errors.push("ImageKit URL endpoint wajib diisi.");
  if (requireEndpoint && ikCfg.endpoint && !isValidImageKitEndpoint_(ikCfg.endpoint)) {
    errors.push("Format ImageKit URL endpoint tidak valid. Gunakan URL HTTPS seperti https://ik.imagekit.io/nama-endpoint");
  }

  if (requirePrivate && !ikCfg.privateKey) errors.push("ImageKit private key wajib diisi.");
  if (requirePrivate && ikCfg.privateKey && !isValidImageKitPrivateKey_(ikCfg.privateKey)) {
    errors.push("Format ImageKit private key tidak valid. Harus diawali dengan 'private_'.");
  }

  return errors;
}

function inferImageKitEndpointFromUrl_(fileUrl) {
  const value = String(fileUrl || "").trim();
  if (!value) return "";
  const match = value.match(/^https:\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (!match) return "";
  const host = String(match[1] || "").toLowerCase();
  const path = String(match[2] || "");
  if (!host) return "";
  if (host === "ik.imagekit.io") {
    const firstSegment = path.split("/").filter(Boolean)[0] || "";
    if (firstSegment) return "https://ik.imagekit.io/" + firstSegment;
  }
  return "https://" + host;
}

function fetchImageKitFiles_(privateKey, limit) {
  try {
    const authHeader = "Basic " + Utilities.base64Encode(String(privateKey || "").trim() + ":");
    const url = "https://api.imagekit.io/v1/files?sort=DESC_CREATED&limit=" + Number(limit || 20);
    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": authHeader },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (code >= 200 && code < 300 && Array.isArray(data)) {
      return { ok: true, files: data };
    }

    let message = "Gagal terhubung ke ImageKit.";
    if (code === 401) {
      message = "Autentikasi ImageKit gagal. Periksa private key Anda.";
    } else if (data && data.message) {
      message = "ImageKit error: " + data.message;
    } else if (text) {
      message = "ImageKit error HTTP " + code + ": " + String(text).substring(0, 200);
    }

    return { ok: false, code: code, message: message };
  } catch (e) {
    return { ok: false, code: 0, message: "Koneksi ke ImageKit gagal: " + e.toString() };
  }
}

function assertPrivilegedAction_(data, cfg) {
  if (isDebugAllowed_()) return true;
  const supplied = String((data && data.admin_token) || "").trim();
  const expected = getSecret_("ADMIN_API_TOKEN", cfg || getSettingsMap_());
  if (expected && supplied === expected) return true;
  throw new Error("Unauthorized diagnostic action");
}

/* =========================
   LEGACY getCfg (kept)
   (masih bisa dipakai, tapi lebih lambat)
========================= */
function getCfg(name) {
  try {
    const s = ss.getSheetByName("Settings");
    const d = s.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]).trim() === name) return d[i][1];
    }
  } catch (e) { return ""; }
  return "";
}



/* =========================
   WEBHOOK ENTRYPOINT
========================= */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonRes({ status: "error", message: "No data" });
    }

    const cfg = getSettingsMap_();
    let data = null;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonRes({ status: "error", message: "Invalid JSON format" });
    }

    if (!data || Array.isArray(data)) {
      return jsonRes({ status: "error", message: "Payload tidak valid" });
    }

    const action = data.action;
    switch (action) {
      case "get_cache_manifest": return jsonRes(getCacheManifestPublic_(data));
      case "get_global_settings": return jsonRes(getGlobalSettings(cfg));
      case "get_product": return jsonRes(getProductDetail(data, cfg));
      case "get_products": return jsonRes(getProducts(data, cfg));
      case "create_order": return jsonRes(createOrder(data, cfg));
      case "update_order_status": return jsonRes(updateOrderStatus(data, cfg));
      case "login": return jsonRes(loginUser(data));
      case "login_and_dashboard": return jsonRes(loginAndDashboard(data));
      case "get_page_content": return jsonRes(getPageContent(data));
      case "get_pages": return jsonRes(getAllPages(data));
      case "admin_login": return jsonRes(adminLogin(data));
      case "admin_logout": return jsonRes(adminLogout(data));
      case "get_admin_data": return jsonRes(getAdminData(data, cfg));
      case "save_product": return jsonRes(saveProduct(data));
      case "save_page": return jsonRes(savePage(data));
      case "update_settings": return jsonRes(updateSettings(data));
      case "get_ik_auth": return jsonRes(getImageKitAuth(data, cfg));
      case "get_media_files": return jsonRes(getIkFiles(data, cfg));
      case "test_ik_config": return jsonRes(testImageKitConfig(data, cfg));
      case "purge_cf_cache": return jsonRes(purgeCFCache(data, cfg));
      case "change_password": return jsonRes(changeUserPassword(data));
      case "update_profile": return jsonRes(updateUserProfile(data));
      case "forgot_password": return jsonRes(forgotPassword(data));
      case "get_dashboard_data": return jsonRes(getDashboardData(data));
      case "delete_order": return jsonRes(deleteOrder(data));
      case "delete_product": return jsonRes(deleteProduct(data));
      case "delete_page": return jsonRes(deletePage(data));
      case "check_slug": return jsonRes(checkSlug(data));
      case "get_admin_orders": return jsonRes(getAdminOrders(data));
      case "get_admin_users": return jsonRes(getAdminUsers(data));
      case "get_email_logs":
      case "test_email":
      case "get_system_health":
      case "get_email_quota":
      case "debug_login":
      case "test_auth":
      case "test_demo_admin_security":
      case "purge_sync_logs":
      case "audit_sync_logs_cleanup":
        assertPrivilegedAction_(data, cfg);
        if (action === "get_email_logs") return jsonRes(getEmailLogs_());
        if (action === "test_email") return jsonRes(testEmailDelivery(data));
        if (action === "get_system_health") return jsonRes(getSystemHealth());
        if (action === "get_email_quota") return jsonRes(getEmailQuotaStatus());
        if (action === "debug_login") return jsonRes(debugLogin(data));
        if (action === "test_auth") return jsonRes(runAuthTests());
        if (action === "test_demo_admin_security") return jsonRes(runDemoAdminSecurityTests());
        if (action === "purge_sync_logs") return jsonRes(purgeSyncLogsArtifacts_(false, data));
        if (action === "audit_sync_logs_cleanup") return jsonRes(purgeSyncLogsArtifacts_(true, data));
        return jsonRes({ status: "error", message: "Unsupported privileged action" });
      default:
        return jsonRes({ status: "error", message: "Aksi tidak terdaftar: " + (action || "unknown") });
    }
  } catch (err) {
    return jsonRes({ status: "error", message: err.toString() });
  }
}

function getGlobalSettings(cfg) {
  cfg = cfg || getSettingsMap_();
  return attachCacheManifest_({
    status: "success",
    data: {
      site_name: getCfgFrom_(cfg, "site_name") || "Sistem Premium",
      site_tagline: getCfgFrom_(cfg, "site_tagline") || "Katalog produk fisik terpercaya untuk kebutuhan harian Anda",
      site_favicon: sanitizeAssetUrl_(getCfgFrom_(cfg, "site_favicon") || ""),
      site_logo: sanitizeAssetUrl_(getCfgFrom_(cfg, "site_logo") || ""),
      contact_email: getCfgFrom_(cfg, "contact_email") || "",
      wa_admin: getCfgFrom_(cfg, "wa_admin") || ""
    }
  }, ["settings"]);
}

function purgeCFCache(d, cfg) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "purge_cf_cache" });
    cfg = cfg || getSettingsMap_();
    const zoneId = getSecret_("cf_zone_id", cfg);
    const token = getSecret_("cf_api_token", cfg);
    if (!zoneId || !token) return { status: "error", message: "Konfigurasi Cloudflare belum disetting!" };

    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify({ purge_everything: true }),
      muteHttpExceptions: true
    };

    const res = UrlFetchApp.fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, options);
    const body = JSON.parse(res.getContentText());

    if (body && body.success) {
      return { status: "success", message: "🚀 Cache Berhasil Dibersihkan!" };
    }
    const msg = (body && body.errors && body.errors.length) ? JSON.stringify(body.errors) : "Cloudflare Error";
    return { status: "error", message: msg };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getIkFiles(d, cfg) {
  const session = requireAdminSession_(d, { allowDemo: true, actionName: "get_media_files" });
  if (isDemoAdminRole_(session.role)) {
    return { status: "success", files: [], message: "Mode demo menyembunyikan data media." };
  }
  cfg = cfg || getSettingsMap_();
  const ikCfg = resolveImageKitConfig_({}, cfg);
  const errors = validateImageKitConfigFormat_(ikCfg, { requirePublic: false, requireEndpoint: false, requirePrivate: true });
  if (errors.length) return { status: "error", message: errors[0] };

  const result = fetchImageKitFiles_(ikCfg.privateKey, 20);
  if (!result.ok) return { status: "error", message: result.message };

  const files = result.files.map(function(f) {
    return {
      name: f.name,
      url: f.url,
      thumbnail: f.thumbnailUrl || f.url,
      fileId: f.fileId,
      type: f.fileType
    };
  });
  return { status: "success", files: files };
}

/* =========================
   LOGGING HELPERS
========================= */
function logEmail_(status, to, subject, detail) {
  try {
    let s = ss.getSheetByName("Email_Logs");
    if (!s) {
      s = ss.insertSheet("Email_Logs");
      s.appendRow(["Timestamp", "Status", "To", "Subject", "Detail"]);
      s.setFrozenRows(1);
    }
    s.appendRow([new Date(), status, to, subject, String(detail).substring(0, 500)]);
    // Auto-trim: keep max 500 rows
    if (s.getLastRow() > 500) s.deleteRows(2, s.getLastRow() - 500);
  } catch (e) {
    Logger.log("logEmail_ error: " + e);
  }
}

function invalidateCaches_(keys) {
  try {
    const cache = CacheService.getScriptCache();
    (keys || []).forEach(k => {
      try { cache.remove(String(k)); } catch (e) { }
    });
  } catch (e) { }
}

function referencesSyncLogs_(text) {
  return /(^|[^a-z0-9])sync[_\s]?logs([^a-z0-9]|$)/i.test(String(text || ""));
}

function normalizeEmailSafe_(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSyncLogsBackup_(sheet, report) {
  const backupName = "Sync_Logs_Backup_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  const backupSs = SpreadsheetApp.create(backupName);
  const manifest = backupSs.getSheetByName("Sheet1") || backupSs.getSheets()[0];
  manifest.setName("Manifest");
  manifest.clear();
  manifest.appendRow(["Section", "Key", "Value"]);
  manifest.appendRow(["summary", "source_spreadsheet_id", ss.getId()]);
  manifest.appendRow(["summary", "source_spreadsheet_name", ss.getName()]);
  manifest.appendRow(["summary", "generated_at", new Date().toISOString()]);
  manifest.appendRow(["summary", "sheet_found", String(!!sheet)]);
  manifest.appendRow(["summary", "formulas_detected", String(report.formulas_detected || 0)]);
  manifest.appendRow(["summary", "protections_detected", String(report.protections_removed || 0)]);
  manifest.appendRow(["summary", "metadata_detected", String(report.metadata_removed || 0)]);

  if (sheet) {
    const copied = sheet.copyTo(backupSs);
    copied.setName("Sync_Logs");
  }

  const rows = [];
  (report.formula_locations || []).forEach(function (item) {
    rows.push(["formula", item.sheet + "!" + item.cell, item.formula]);
  });
  (report.named_ranges_removed || []).forEach(function (name) {
    rows.push(["named_range", name, "removed"]);
  });
  (report.triggers_removed || []).forEach(function (item) {
    rows.push(["trigger", item.handler, item.event_type]);
  });
  (report.script_properties_removed || []).forEach(function (name) {
    rows.push(["script_property", name, "removed"]);
  });
  (report.permission_snapshot || []).forEach(function (item) {
    rows.push(["permission", item.role, item.email]);
  });
  (report.notes || []).forEach(function (note, idx) {
    rows.push(["note", String(idx + 1), note]);
  });

  if (rows.length > 0) {
    manifest.getRange(2 + 7, 1, rows.length, 3).setValues(rows);
  }

  const sheets = backupSs.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === "Sheet1" && sheets.length > 1) {
      backupSs.deleteSheet(sheets[i]);
      break;
    }
  }

  return {
    id: backupSs.getId(),
    url: backupSs.getUrl(),
    name: backupSs.getName()
  };
}

function captureFilePermissions_() {
  const snapshot = [];
  try {
    const file = DriveApp.getFileById(ss.getId());
    const owner = file.getOwner();
    if (owner) snapshot.push({ role: "owner", email: normalizeEmailSafe_(owner.getEmail()) });
    file.getEditors().forEach(function (user) {
      snapshot.push({ role: "editor", email: normalizeEmailSafe_(user.getEmail()) });
    });
    file.getViewers().forEach(function (user) {
      snapshot.push({ role: "viewer", email: normalizeEmailSafe_(user.getEmail()) });
    });
  } catch (e) { }
  return snapshot.filter(function (item) { return !!item.email; });
}

function revokeFilePermissions_(options, report, dryRun) {
  const cfg = options || {};
  const shouldRevoke = !!cfg.revoke_file_access;
  report.permission_snapshot = captureFilePermissions_();
  if (!shouldRevoke) {
    report.notes.push("Spreadsheet-wide Drive sharing tidak diubah otomatis. Set revoke_file_access=true dan kirim revoke_access_emails jika memang ingin mencabut akses file.");
    return;
  }

  const revokeList = Array.isArray(cfg.revoke_access_emails) ? cfg.revoke_access_emails.map(normalizeEmailSafe_).filter(Boolean) : [];
  const keepList = Array.isArray(cfg.keep_access_emails) ? cfg.keep_access_emails.map(normalizeEmailSafe_).filter(Boolean) : [];
  if (revokeList.length === 0) {
    report.notes.push("revoke_file_access=true tapi revoke_access_emails kosong, jadi tidak ada akses file yang dicabut.");
    return;
  }

  try {
    const file = DriveApp.getFileById(ss.getId());
    const ownerEmail = normalizeEmailSafe_(file.getOwner() && file.getOwner().getEmail());
    revokeList.forEach(function (email) {
      if (!email || email === ownerEmail || keepList.indexOf(email) !== -1) return;
      report.permissions_revoked.push(email);
      if (dryRun) return;
      try { file.removeEditor(email); } catch (e) { }
      try { file.removeViewer(email); } catch (e) { }
    });
  } catch (e) {
    report.notes.push("Gagal memproses revokasi akses file: " + String(e));
  }
}

function purgeSyncLogsArtifacts_(dryRun, options) {
  try {
    const cfg = options || {};
    const runMode = dryRun ? "dry_run" : "delete";
    const report = {
      status: "success",
      mode: runMode,
      sheet_found: false,
      sheet_deleted: false,
      formulas_replaced: 0,
      formulas_detected: 0,
      formula_locations: [],
      named_ranges_removed: [],
      protections_removed: 0,
      triggers_removed: [],
      script_properties_removed: [],
      metadata_removed: 0,
      permissions_revoked: [],
      permission_snapshot: [],
      backup_created: false,
      backup_id: "",
      backup_url: "",
      notes: []
    };

    const sheet = ss.getSheetByName("Sync_Logs");
    report.sheet_found = !!sheet;

    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      const sh = sheets[i];
      const range = sh.getDataRange();
      if (!range) continue;
      const formulas = range.getFormulas();
      const values = range.getValues();
      for (let r = 0; r < formulas.length; r++) {
        for (let c = 0; c < formulas[r].length; c++) {
          const f = String(formulas[r][c] || "").trim();
          if (!f || !referencesSyncLogs_(f)) continue;
          report.formulas_detected++;
          if (report.formula_locations.length < 100) {
            report.formula_locations.push({
              sheet: sh.getName(),
              cell: range.getCell(r + 1, c + 1).getA1Notation(),
              formula: f.substring(0, 200)
            });
          }
          if (!dryRun) {
            range.getCell(r + 1, c + 1).setValue(values[r][c]);
            report.formulas_replaced++;
          }
        }
      }
    }

    const namedRanges = ss.getNamedRanges();
    for (let i = 0; i < namedRanges.length; i++) {
      const nr = namedRanges[i];
      let targetSheet = "";
      try { targetSheet = nr.getRange().getSheet().getName(); } catch (e) { }
      const matched = referencesSyncLogs_(nr.getName()) || referencesSyncLogs_(targetSheet);
      if (!matched) continue;
      report.named_ranges_removed.push(nr.getName());
      if (!dryRun) nr.remove();
    }

    const metadataItems = ss.getDeveloperMetadata();
    for (let i = 0; i < metadataItems.length; i++) {
      const md = metadataItems[i];
      const mk = String(md.getKey() || "");
      const mv = String(md.getValue() || "");
      if (!referencesSyncLogs_(mk) && !referencesSyncLogs_(mv)) continue;
      if (!dryRun) md.remove();
      report.metadata_removed++;
    }

    if (sheet) {
      const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      for (let i = 0; i < sheetProtections.length; i++) {
        if (!dryRun) sheetProtections[i].remove();
        report.protections_removed++;
      }
      const rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
      for (let i = 0; i < rangeProtections.length; i++) {
        if (!dryRun) rangeProtections[i].remove();
        report.protections_removed++;
      }
    }

    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i];
      const handler = String(t.getHandlerFunction() || "");
      if (!/(sync[_\s-]?logs?|sync[_\s-]?state|cepat[_\s-]?sync)/i.test(handler)) continue;
      report.triggers_removed.push({
        handler: handler,
        event_type: String(t.getEventType())
      });
      if (!dryRun) ScriptApp.deleteTrigger(t);
    }

    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    Object.keys(allProps).forEach(function (k) {
      const key = String(k || "");
      const val = String(allProps[k] || "");
      if (!referencesSyncLogs_(key) && !referencesSyncLogs_(val) && !/sync_state|cepat_sync/i.test(key)) return;
      report.script_properties_removed.push(key);
      if (!dryRun) props.deleteProperty(key);
    });

    revokeFilePermissions_(cfg, report, dryRun);

    if (!dryRun && cfg.create_backup !== false) {
      const backup = buildSyncLogsBackup_(sheet, report);
      report.backup_created = true;
      report.backup_id = backup.id;
      report.backup_url = backup.url;
      report.notes.push("Backup rollback dibuat di spreadsheet terpisah: " + backup.name);
    }

    if (sheet && !dryRun) {
      if (ss.getSheets().length === 1) {
        ss.insertSheet("System_Main");
        report.notes.push("Sync_Logs adalah sheet terakhir, dibuat sheet pengganti 'System_Main' sebelum delete.");
      }
      ss.deleteSheet(sheet);
      report.sheet_deleted = true;
    }

    if (!sheet) report.notes.push("Sheet Sync_Logs tidak ditemukan.");
    if (dryRun) report.notes.push("Dry run aktif: tidak ada perubahan yang ditulis.");
    return report;
  } catch (e) {
    return { status: "error", message: String(e) };
  }
}

/* =========================
   NOTIFICATIONS
========================= */

/**
 * Normalize Indonesian phone number for Fonnte API.
 * Strips non-digits, handles +62/62/0 prefix variations.
 * Returns clean number like "81234567890" (without country code prefix).
 */
function normalizePhone_(raw) {
  if (!raw) return "";
  // Remove all non-digit characters (+, -, spaces, parens, etc)
  let num = String(raw).replace(/[^0-9]/g, "");
  // Handle country code prefix
  if (num.startsWith("620")) num = num.substring(3); // 6208xxx → 8xxx
  else if (num.startsWith("62")) num = num.substring(2); // 628xxx → 8xxx
  // Remove leading 0 if present
  if (num.startsWith("0")) num = num.substring(1); // 08xxx → 8xxx
  return num;
}

function sendEmail(target, subject, body, cfg) {
  if (!target) return { success: false, reason: "no_target" };
  cfg = cfg || getSettingsMap_();
  const remaining = MailApp.getRemainingDailyQuota();
  if (remaining <= 0) {
    logEmail_("QUOTA_EXCEEDED", target, subject, "Daily email quota exceeded (remaining: " + remaining + ")");
    return { success: false, reason: "quota_exceeded" };
  }
  const senderName = getCfgFrom_(cfg, "site_name") || "Admin Sistem";
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      MailApp.sendEmail({ to: target, subject: subject, htmlBody: body, name: senderName });
      logEmail_("SENT", target, subject, "OK (attempt " + attempt + ", quota left: " + (remaining - 1) + ")");
      return { success: true };
    } catch (e) {
      Logger.log("sendEmail attempt " + attempt + " failed: " + e);
      if (attempt < MAX_RETRIES) {
        Utilities.sleep(1000 * attempt);
      } else {
        logEmail_("FAILED", target, subject, e.toString());
        return { success: false, reason: e.toString() };
      }
    }
  }
}

function getEmailQuotaStatus() {
  const remaining = MailApp.getRemainingDailyQuota();
  return { status: "success", remaining: remaining, limit: 100, warning: remaining < 10 };
}

/* =========================
   CREATE ORDER (ANGKA UNIK + WHITE-LABEL + AFFILIATE)
========================= */
function getProductDetail(d, cfg) {
  try {
    cfg = cfg || getSettingsMap_();
    const rules = getCachedData_("access_rules", function() {
      return mustSheet_("Access_Rules").getDataRange().getValues();
    }, 3600);
    const pId = normalizeProductText_(d.id || d.product_id || "");
    let productData = null;
    for (let i = 1; i < rules.length; i++) {
      if (normalizeProductText_(rules[i][0]) === pId && String(rules[i][5]).trim() === "Active") {
        productData = mapProductRowToObject_(rules[i]);
        break;
      }
    }
    if (!productData) return { status: "error", message: "Produk tidak ditemukan" };
    return attachCacheManifest_({
      status: "success",
      data: productData,
      payment: {
        bank_name: getCfgFrom_(cfg, "bank_name"),
        bank_norek: getCfgFrom_(cfg, "bank_norek"),
        bank_owner: getCfgFrom_(cfg, "bank_owner"),
        wa_admin: getCfgFrom_(cfg, "wa_admin")
      }
    }, ["products", "settings"]);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getProducts(d, cfg, cachedOrders) {
  cfg = cfg || getSettingsMap_();
  const rules = getCachedData_("access_rules", function() {
    return mustSheet_("Access_Rules").getDataRange().getValues();
  }, 3600);
  const orders = Array.isArray(cachedOrders) ? cachedOrders : getPhysicalOrderRows_();
  const users = mustSheet_("Users").getDataRange().getValues();
  let email = String(d.email || "").trim().toLowerCase();
  const cacheTags = (email || d.target_user_id) ? ["products", "orders", "users"] : ["products"];
  let targetMode = false;
  if (d.target_user_id) {
    targetMode = true;
    const targetUserId = String(d.target_user_id).trim();
    for (let i = 1; i < users.length; i++) {
      if (String(users[i][0]) === targetUserId) {
        email = String(users[i][1] || "").trim().toLowerCase();
        break;
      }
    }
  }
  const purchasedIds = {};
  const purchasedNames = {};
  if (email) {
    orders.forEach(function(row) {
      const rowEmail = String(row[2] || "").trim().toLowerCase();
      if (rowEmail !== email || !isPaidOrderStatus_(row[7])) return;
      const detail = String(row[5] || "");
      const productId = extractPhysicalOrderProductId_(detail);
      const productName = extractPhysicalOrderProductName_(detail);
      if (productId) purchasedIds[productId] = true;
      if (productName) purchasedNames[String(productName).toLowerCase()] = true;
    });
  }
  const owned = [];
  const available = [];
  for (let i = 1; i < rules.length; i++) {
    if (String(rules[i][5]).trim() !== "Active") continue;
    const normalizedProduct = mapProductRowToObject_(rules[i]);
    const productId = normalizedProduct.id;
    const title = normalizedProduct.title;
    const hasAccess = !!(purchasedIds[productId] || purchasedNames[String(title).toLowerCase()]);
    const product = Object.assign({}, normalizedProduct, {
      url: hasAccess ? normalizedProduct.url : "#",
      access: hasAccess
    });
    if (targetMode) {
      if (hasAccess) available.push(product);
    } else if (hasAccess && email) {
      owned.push(product);
    } else {
      available.push(product);
    }
  }
  return attachCacheManifest_({ status: "success", owned: owned, available: available }, cacheTags);
}

function getDashboardData(d) {
  try {
    const cfg = getSettingsMap_();
    const email = String(d.email || "").trim().toLowerCase();
    const users = mustSheet_("Users").getDataRange().getValues();
    const orders = getPhysicalOrderRows_();
    let userId = "";
    let userNama = "";
    for (let i = 1; i < users.length; i++) {
      if (String(users[i][1] || "").trim().toLowerCase() === email) {
        userId = String(users[i][0] || "").trim();
        userNama = String(users[i][3] || "").trim();
        break;
      }
    }
    const productsData = getProducts(d, cfg, orders);
    const globalPages = getAllPages(Object.assign({}, d, { owner_id: "" }));
    const myPages = userId ? getAllPages(Object.assign({}, d, { owner_id: userId, only_mine: true })) : { data: [] };
    const myOrders = orders.filter(function(row) {
      return String(row[2] || "").trim().toLowerCase() === email;
    }).slice().reverse().map(function(row) {
      return {
        timestamp: String(row[0] || "").trim(),
        nama: String(row[1] || "").trim(),
        email: String(row[2] || "").trim(),
        no_wa: normalizeStoredWhatsApp_(row[3]),
        alamat: String(row[4] || "").trim(),
        detail_pesanan: String(row[5] || "").trim(),
        total_harga: toNumberSafe_(row[6]),
        status_pembayaran: normalizeOrderStatus_(row[7]),
        bukti_transfer: String(row[8] || "").trim()
      };
    });
    return attachCacheManifest_({
      status: "success",
      data: {
        user: { id: userId, nama: userNama },
        settings: {
          site_name: getCfgFrom_(cfg, "site_name"),
          site_logo: sanitizeAssetUrl_(getCfgFrom_(cfg, "site_logo")),
          site_favicon: sanitizeAssetUrl_(getCfgFrom_(cfg, "site_favicon")),
          wa_admin: getCfgFrom_(cfg, "wa_admin")
        },
        products: productsData,
        pages: globalPages.data || [],
        my_pages: myPages.data || [],
        orders: myOrders
      }
    }, ["settings", "products", "pages", "orders", "users"]);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function loginUser(d) {
  const u = mustSheet_("Users").getDataRange().getValues();
  const e = String(d.email || "").trim().toLowerCase();
  const inputPass = String(d.password || "").trim();

  if (!e || !inputPass) {
    return { status: "error", message: "Email dan password wajib diisi." };
  }

  for (let i = 1; i < u.length; i++) {
    if (String(u[i][1]).trim().toLowerCase() === e) {
      const storedPass = String(u[i][2]).trim();
      if (verifyPassword_(inputPass, storedPass)) {
        return { status: "success", data: { id: u[i][0], nama: u[i][3], email: u[i][1], role: String(u[i][4] || "member") } };
      }
      return { status: "error", message: "Password salah. Silakan cek kembali." };
    }
  }
  return { status: "error", message: "Gagal Login: Email tidak ditemukan." };
}

function loginAndDashboard(d) {
  const loginResult = loginUser(d);
  if (loginResult.status !== "success") return loginResult;

  const email = String((loginResult.data && loginResult.data.email) || d.email || "").trim().toLowerCase();
  const dashboardResult = getDashboardData({ email: email });

  if (dashboardResult.status !== "success") {
    return {
      status: "success",
      data: loginResult.data,
      dashboard: null,
      warning: dashboardResult.message || "Dashboard bootstrap gagal dimuat."
    };
  }

  return {
    status: "success",
    data: loginResult.data,
    dashboard: Object.assign({}, dashboardResult.data, {
      cache_manifest: dashboardResult.cache_manifest || getCacheManifestSnapshot_(["settings", "products", "pages", "orders", "users"])
    })
  };
}

function getPageContent(d) {
  try {
    const r = mustSheet_("Pages").getDataRange().getValues();
    for (let i = 1; i < r.length; i++) {
      if (String(r[i][1]) === String(d.slug)) {
          return attachCacheManifest_({ 
              status: "success", 
              title: r[i][2], 
              content: r[i][3],
              pixel_id: r[i][7] || "",
              pixel_token: r[i][8] || "",
              pixel_test_code: r[i][9] || "",
              theme_mode: r[i][10] || "light"
          }, ["pages"]);
      }
    }
    return { status: "error" };
  } catch (e) {
    return { status: "error" };
  }
}

function getAllPages(d) {
  try {
    const r = mustSheet_("Pages").getDataRange().getValues();
    const data = [];
    const filterOwner = String(d.owner_id || "").trim();
    const onlyMine = d.only_mine === true;

    for (let i = 1; i < r.length; i++) {
      if (String(r[i][4]) === "Active") {
        // Kolom 7 (index 6) adalah Owner ID. Jika kosong, anggap milik ADMIN (Global)
        const pageOwner = String(r[i][6] || "ADMIN").trim(); 

        if (onlyMine) {
            // Mode "Halaman Saya": Hanya tampilkan milik user ini
            if (pageOwner === filterOwner) data.push(r[i]);
        } else {
            // Mode default: tampilkan halaman global milik ADMIN
            if (pageOwner === "ADMIN") data.push(r[i]);
        }
      }
    }
    return attachCacheManifest_({ status: "success", data: data }, ["pages"]);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function adminLogin(d) {
  const e = String(d.email || "").trim().toLowerCase();
  const inputPass = String(d.password || "").trim();

  if (!e || !inputPass) {
    return { status: "error", message: "Email dan password wajib diisi." };
  }

  if (e === DEMO_ADMIN_ACCOUNT.email && inputPass === DEMO_ADMIN_ACCOUNT.password) {
    const demoSession = createAdminSession_({
      id: DEMO_ADMIN_ACCOUNT.id,
      email: DEMO_ADMIN_ACCOUNT.email,
      name: DEMO_ADMIN_ACCOUNT.name,
      role: DEMO_ADMIN_ACCOUNT.role,
      read_only: true,
      demo_mode: true
    });
    return {
      status: "success",
      data: {
        id: DEMO_ADMIN_ACCOUNT.id,
        nama: DEMO_ADMIN_ACCOUNT.name,
        email: DEMO_ADMIN_ACCOUNT.email,
        role: DEMO_ADMIN_ACCOUNT.role,
        read_only: true,
        demo_mode: true,
        session_token: demoSession.token,
        expires_at: demoSession.expires_at
      }
    };
  }

  const u = mustSheet_("Users").getDataRange().getValues();

  for (let i = 1; i < u.length; i++) {
    if (String(u[i][1]).trim().toLowerCase() === e) {
      const storedPass = String(u[i][2]).trim();
      const role = String(u[i][4]).trim().toLowerCase();

      if (verifyPassword_(inputPass, storedPass) && role === "admin") {
        const session = createAdminSession_({
          id: String(u[i][0] || ""),
          email: e,
          name: String(u[i][3] || "Admin"),
          role: "admin",
          read_only: false,
          demo_mode: false
        });
        return {
          status: "success",
          data: {
            id: String(u[i][0] || ""),
            nama: String(u[i][3] || "Admin"),
            email: e,
            role: "admin",
            read_only: false,
            demo_mode: false,
            session_token: session.token,
            expires_at: session.expires_at
          }
        };
      }

      if (verifyPassword_(inputPass, storedPass) && role !== "admin") {
        return { status: "error", message: "Akun ditemukan tapi bukan admin. Role: " + u[i][4] };
      }

      return { status: "error", message: "Password salah. Silakan cek kembali." };
    }
  }

  return { status: "error", message: "Email " + e + " tidak ditemukan di database." };
}

/* =========================
   DIAGNOSTIC: Debug Login Data
========================= */
function debugLogin(d) {
  try {
    const u = mustSheet_("Users").getDataRange().getValues();
    const targetEmail = String(d.email || "").trim().toLowerCase();
    const inputPass = String(d.password || "");
    const results = [];

    for (let i = 1; i < u.length; i++) {
      const rawEmail = u[i][1];
      const rawPass = u[i][2];
      const rawRole = u[i][4];
      const emailStr = String(rawEmail);
      const passStr = String(rawPass);
      const roleStr = String(rawRole);

      if (emailStr.trim().toLowerCase() === targetEmail || !targetEmail) {
        // Get charCodes of password to detect hidden characters
        const passChars = [];
        for (let c = 0; c < passStr.length; c++) {
          passChars.push({ char: passStr[c], code: passStr.charCodeAt(c) });
        }

        const inputChars = [];
        for (let c = 0; c < inputPass.length; c++) {
          inputChars.push({ char: inputPass[c], code: inputPass.charCodeAt(c) });
        }

        results.push({
          row: i + 1,
          email: { raw: emailStr, trimmed: emailStr.trim(), type: typeof rawEmail, length: emailStr.length, trimmed_length: emailStr.trim().length },
          password: { raw_length: passStr.length, trimmed: passStr.trim(), trimmed_length: passStr.trim().length, type: typeof rawPass, charCodes: passChars },
          input_password: { raw: inputPass, trimmed: inputPass.trim(), length: inputPass.length, charCodes: inputChars },
          password_match: { raw: passStr === inputPass, trimmed: passStr.trim() === inputPass.trim() },
          role: { raw: roleStr, trimmed: roleStr.trim(), lowercase: roleStr.trim().toLowerCase(), type: typeof rawRole, is_admin: roleStr.trim().toLowerCase() === "admin" }
        });
      }
    }

    return { status: "success", data: results, total_users: u.length - 1 };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* =========================
   UNIT TESTS: Authentication
========================= */
function runAuthTests() {
  const results = [];
  const u = mustSheet_("Users").getDataRange().getValues();

  // Test 1: Users sheet has data
  results.push({ test: "Users sheet exists and has data", pass: u.length > 1, detail: "Rows: " + u.length });

  // Test 2: Header structure
  const expectedHeaders = ["user_id", "email", "password", "nama_lengkap", "role"];
  const headers = u[0].map(h => String(h).trim().toLowerCase());
  const headerMatch = expectedHeaders.every(h => headers.includes(h));
  results.push({ test: "Headers match expected structure", pass: headerMatch, detail: "Found: " + headers.slice(0, 5).join(", ") });

  // Test 3: Find admin user
  let adminRow = null;
  for (let i = 1; i < u.length; i++) {
    if (String(u[i][4]).trim().toLowerCase() === "admin") {
      adminRow = { index: i, email: String(u[i][1]), pass: String(u[i][2]), name: String(u[i][3]), role: String(u[i][4]) };
      break;
    }
  }
  results.push({ test: "Admin user exists in Users sheet", pass: !!adminRow, detail: adminRow ? "Email: " + adminRow.email : "No admin found" });

  if (adminRow) {
    // Test 4: Admin password has no hidden characters
    const passStr = adminRow.pass;
    const hasHidden = passStr.length !== passStr.trim().length;
    results.push({ test: "Admin password has no trailing/leading spaces", pass: !hasHidden, 
      detail: "Raw length: " + passStr.length + ", Trimmed: " + passStr.trim().length });

    // Test 5: Admin email has no hidden characters
    const emailStr = adminRow.email;
    const emailHasHidden = emailStr.length !== emailStr.trim().length;
    results.push({ test: "Admin email has no trailing/leading spaces", pass: !emailHasHidden,
      detail: "Raw length: " + emailStr.length + ", Trimmed: " + emailStr.trim().length });

    // Test 6: loginUser works for admin (should succeed — tests email+pass)
    const loginResult = loginUser({ email: adminRow.email.trim(), password: adminRow.pass.trim() });
    results.push({ test: "loginUser() succeeds for admin credentials", pass: loginResult.status === "success",
      detail: JSON.stringify(loginResult) });

    // Test 7: adminLogin works for admin (should succeed — tests email+pass+role)
    const adminResult = adminLogin({ email: adminRow.email.trim(), password: adminRow.pass.trim() });
    results.push({ test: "adminLogin() succeeds for admin credentials", pass: adminResult.status === "success",
      detail: JSON.stringify(adminResult) });
  }

  // Test 8: Find member user
  let memberRow = null;
  for (let i = 1; i < u.length; i++) {
    if (String(u[i][4]).trim().toLowerCase() === "member") {
      memberRow = { index: i, email: String(u[i][1]), pass: String(u[i][2]), name: String(u[i][3]), role: String(u[i][4]) };
      break;
    }
  }

  if (memberRow) {
    // Test 9: loginUser works for member
    const memberResult = loginUser({ email: memberRow.email.trim(), password: memberRow.pass.trim() });
    results.push({ test: "loginUser() succeeds for member credentials", pass: memberResult.status === "success",
      detail: JSON.stringify(memberResult) });

    // Test 10: adminLogin rejects member (should fail — not admin role)
    const memberAdminResult = adminLogin({ email: memberRow.email.trim(), password: memberRow.pass.trim() });
    results.push({ test: "adminLogin() correctly rejects member user", pass: memberAdminResult.status === "error",
      detail: JSON.stringify(memberAdminResult) });
  }

  // Test 11: Empty credentials rejected
  const emptyResult = adminLogin({ email: "", password: "" });
  results.push({ test: "adminLogin() rejects empty credentials", pass: emptyResult.status === "error",
    detail: emptyResult.message });

  // Test 12: Demo admin login works
  const demoLoginResult = adminLogin({ email: DEMO_ADMIN_ACCOUNT.email, password: DEMO_ADMIN_ACCOUNT.password });
  results.push({ test: "adminLogin() succeeds for demo admin credentials", pass: demoLoginResult.status === "success" && isDemoAdminRole_(demoLoginResult.data && demoLoginResult.data.role),
    detail: JSON.stringify(demoLoginResult) });

  // Test 12: Wrong password rejected
  if (adminRow) {
    const wrongPassResult = adminLogin({ email: adminRow.email, password: "wrongpass123" });
    results.push({ test: "adminLogin() rejects wrong password", pass: wrongPassResult.status === "error",
      detail: wrongPassResult.message });
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  return { status: "success", summary: passed + " passed, " + failed + " failed, " + results.length + " total", tests: results };
}

function runDemoAdminSecurityTests() {
  const demoLogin = adminLogin({ email: DEMO_ADMIN_ACCOUNT.email, password: DEMO_ADMIN_ACCOUNT.password });
  const demoToken = demoLogin && demoLogin.data ? demoLogin.data.session_token : "";
  const demoSession = demoToken ? getAdminSession_(demoToken) : null;
  const sampleData = {
    status: "success",
    stats: { users: 10, orders: 15, rev: 2500000 },
    orders: [["2026-03-19T10:00:00.000Z", "2026-03-19T10:00:00.000Z", "Andi", "user@example.com", "08123", "Jl. Mawar No. 1, Jakarta", "Produk: Produk A | Jumlah: 1 | Harga: Rp 149.654", 149654, "Pending", ""]],
    products: [["PRD-1", "Produk A", "Deskripsi", "https://example.com", 149654, "Active", "", "https://example.com/img.jpg", "", "", "", 0]],
    pages: [["PG-1", "landing", "Landing Page", "<h1>Hi</h1>", "Active", "2026-03-19", "ADMIN", "", "", "", "light"]],
    settings: { site_name: "Kelas Jagoan", contact_email: "admin@example.com", bank_name: "Bank Demo" },
    users: [["u-001", "member@example.com", "sha256$abc", "Member Satu", "member", "Active", "2026-03-19", "-"]],
    has_more_orders: false,
    has_more_users: false
  };
  const masked = maskAdminDataForDemo_(sampleData, demoSession || { role: DEMO_ADMIN_ACCOUNT.role, expires_at: Date.now() + 1000 });

  const cases = [
    {
      test: "Demo admin login berhasil",
      pass: demoLogin.status === "success" && isDemoAdminRole_(demoLogin.data && demoLogin.data.role),
      actual: demoLogin
    },
    {
      test: "Demo admin mendapatkan session token",
      pass: !!demoToken && !!demoSession,
      actual: { token_exists: !!demoToken, session_exists: !!demoSession }
    },
    {
      test: "Middleware mengizinkan demo admin untuk read-only access",
      pass: (function() {
        try {
          return !!validateAdminSessionAccess_({ role: "demo_admin" }, { allowDemo: true, actionName: "get_admin_data" });
        } catch (e) {
          return false;
        }
      })(),
      actual: "allowDemo=true"
    },
    {
      test: "Middleware memblokir demo admin untuk aksi mutasi",
      pass: (function() {
        try {
          validateAdminSessionAccess_({ role: "demo_admin" }, { allowDemo: false, actionName: "save_product" });
          return false;
        } catch (e) {
          return String(e).indexOf("Mode demo admin hanya dapat melihat data") !== -1;
        }
      })(),
      actual: "allowDemo=false"
    },
    {
      test: "Masking admin data menyembunyikan nilai order",
      pass: masked.orders[0][0] !== sampleData.orders[0][0] && masked.orders[0][1] !== sampleData.orders[0][1],
      actual: masked.orders[0]
    },
    {
      test: "Masking admin data menandai response sebagai demo mode",
      pass: masked.demo_mode === true && masked.read_only === true,
      actual: { demo_mode: masked.demo_mode, read_only: masked.read_only }
    },
    {
      test: "Password demo admin yang salah ditolak",
      pass: adminLogin({ email: DEMO_ADMIN_ACCOUNT.email, password: "salahdemo" }).status === "error",
      actual: adminLogin({ email: DEMO_ADMIN_ACCOUNT.email, password: "salahdemo" })
    }
  ].map(function(item) {
    return {
      test: item.test,
      pass: !!item.pass,
      actual: item.actual
    };
  });

  const passed = cases.filter(function(item) { return item.pass; }).length;
  const failed = cases.length - passed;

  return {
    status: "success",
    summary: passed + " passed, " + failed + " failed, " + cases.length + " total",
    tests: cases
  };
}

function saveProduct(d) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "save_product" });
    const s = mustSheet_("Access_Rules");
    const requiredCols = 11;
    if (s.getMaxColumns() < requiredCols) s.insertColumnsAfter(s.getMaxColumns(), requiredCols - s.getMaxColumns());
    const product = normalizeProductPayload_(d);
    const dataRow = [product.id, product.title, product.desc, product.url, product.harga, product.status, product.lp_url, product.image_url, product.pixel_id, product.pixel_token, product.pixel_test_code];
    const isEdit = String(d.is_edit) === "true";
    if (isEdit) {
      const rows = s.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === product.id) {
          s.getRange(i + 1, 1, 1, requiredCols).setValues([dataRow]);
          invalidateCaches_(["access_rules"]);
          return { status: "success", cache_manifest: touchCacheTags_(["products"]) };
        }
      }
      return { status: "error", message: "ID Produk tidak ditemukan untuk diedit" };
    }
    const rows = s.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === product.id) {
        return { status: "error", message: "ID Produk sudah digunakan. Mohon refresh halaman." };
      }
    }
    s.appendRow(dataRow);
    invalidateCaches_(["access_rules"]);
    return { status: "success", cache_manifest: touchCacheTags_(["products"]) };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function deleteProduct(d) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "delete_product" });
    const s = mustSheet_("Access_Rules");
    const r = s.getDataRange().getValues();
    const id = String(d.id).trim();

    for (let i = 1; i < r.length; i++) {
      if (String(r[i][0]).trim() === id) {
        s.deleteRow(i + 1);
        invalidateCaches_(["access_rules"]);
        return { status: "success", message: "Produk berhasil dihapus", cache_manifest: touchCacheTags_(["products"]) };
      }
    }
    return { status: "error", message: "ID Produk tidak ditemukan" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function savePage(d) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "save_page" });
    const s = mustSheet_("Pages");
    const isEdit = String(d.is_edit) === "true";
    const ownerId = String(d.owner_id || "ADMIN").trim(); // Default ke ADMIN
    const slug = String(d.slug).trim();
    const id = String(d.id).trim();

    const r = s.getDataRange().getValues();

    // 1. Cek Unik Slug (Global Check)
    for (let i = 1; i < r.length; i++) {
        const rowSlug = String(r[i][1]).trim();
        const rowId = String(r[i][0]).trim();
        
        if (rowSlug === slug) {
            // Jika slug sama, pastikan ini adalah halaman yang sama (sedang diedit)
            // Jika ID beda, berarti slug sudah dipakai orang lain
            if (isEdit && rowId === id) {
                // Ini halaman kita sendiri, lanjut
            } else {
                return { status: "error", message: "Slug URL sudah digunakan. Pilih slug lain." };
            }
        }
    }

    // Check if columns exist
    const maxCols = s.getMaxColumns();
    if (maxCols < 11) s.insertColumnsAfter(maxCols, 11 - maxCols);

    if (isEdit) {
      for (let i = 1; i < r.length; i++) {
        if (String(r[i][0]).trim() === id) {
          // Hanya izinkan edit jika owner cocok (atau admin bisa edit semua)
          const existingOwner = String(r[i][6] || "ADMIN").trim();
          
           if (existingOwner !== ownerId && ownerId !== "ADMIN") { 
              return { status: "error", message: "Anda tidak memiliki izin mengedit halaman ini." };
           }

          s.getRange(i + 1, 1, 1, 4).setValues([[d.id, slug, d.title, d.content]]);
          // Update Meta Pixel Columns (Col 8, 9, 10) + Theme Mode (Col 11)
          s.getRange(i + 1, 8, 1, 4).setValues([[d.meta_pixel_id || "", d.meta_pixel_token || "", d.meta_pixel_test_event || "", d.theme_mode || "light"]]);
          return { status: "success", cache_manifest: touchCacheTags_(["pages"]) };
        }
      }
      return { status: "error", message: "ID Halaman tidak ditemukan" };
    } else {
      const newId = "PG-" + Date.now();
      // Tambahkan Owner ID di kolom ke-7 (index 6) + Meta Pixel (7,8,9) + Theme Mode (10)
      s.appendRow([newId, slug, d.title, d.content, "Active", toISODate_(), ownerId, d.meta_pixel_id || "", d.meta_pixel_token || "", d.meta_pixel_test_event || "", d.theme_mode || "light"]);
      return { status: "success", cache_manifest: touchCacheTags_(["pages"]) };
    }
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function deletePage(d) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "delete_page" });
    const s = mustSheet_("Pages");
    const id = String(d.id).trim();
    const ownerId = String(d.owner_id || "ADMIN").trim();

    const r = s.getDataRange().getValues();
    for (let i = 1; i < r.length; i++) {
      if (String(r[i][0]).trim() === id) {
        // Security Check: Only Owner or Admin can delete
        const pageOwner = String(r[i][6] || "ADMIN").trim();
        if (pageOwner !== ownerId && ownerId !== "ADMIN") {
            return { status: "error", message: "Anda tidak memiliki izin menghapus halaman ini." };
        }
        
        s.deleteRow(i + 1);
        return { status: "success", message: "Halaman berhasil dihapus", cache_manifest: touchCacheTags_(["pages"]) };
      }
    }
    return { status: "error", message: "ID Halaman tidak ditemukan" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function checkSlug(d) {
  try {
    const s = mustSheet_("Pages");
    const slug = String(d.slug).trim();
    const excludeId = String(d.exclude_id || "").trim(); // For edit mode
    
    const r = s.getDataRange().getValues();
    for (let i = 1; i < r.length; i++) {
      const rowSlug = String(r[i][1]).trim();
      const rowId = String(r[i][0]).trim();
      
      if (rowSlug === slug) {
          if (excludeId && rowId === excludeId) {
              // Same page, it's fine
          } else {
              return { status: "success", available: false, message: "Slug URL sudah digunakan" };
          }
      }
    }
    return { status: "success", available: true, message: "Slug URL tersedia" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getRetiredSettingsKeys_() {
  return [
    ["fon", "nte_token"].join(""),
    ["moo", "ta_gas_url"].join(""),
    ["moo", "ta_token"].join(""),
    ["moo", "ta_secret"].join("")
  ];
}

function toKeyLookup_(list) {
  const source = Array.isArray(list) ? list : [];
  const lookup = {};
  source.forEach(function(key) {
    lookup[String(key || "").trim()] = true;
  });
  return lookup;
}

function updateSettings(d) {
  requireAdminSession_(d, { allowDemo: false, actionName: "update_settings" });
  const payload = Object.assign({}, (d && d.payload && typeof d.payload === "object") ? d.payload : {});
  const s = mustSheet_("Settings");
  const deprecatedKeys = toKeyLookup_(getRetiredSettingsKeys_());
  const propertyOnlyKeys = { ik_private_key: true };
  const props = PropertiesService.getScriptProperties();
  Object.keys(deprecatedKeys).forEach(function(key) {
    try { props.deleteProperty(key); } catch (e) {}
  });
  const rows = s.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    const key = String(rows[i][0] || "").trim();
    if (deprecatedKeys[key]) s.deleteRow(i + 1);
  }
  let freshRows = s.getDataRange().getValues();
  for (let key in payload) {
    if (deprecatedKeys[key]) continue;
    let nextValue = payload[key];
    if (key === "site_logo" || key === "site_favicon") nextValue = sanitizeAssetUrl_(nextValue);
    const storeInPropertiesOnly = !!propertyOnlyKeys[key];
    if (storeInPropertiesOnly) {
      nextValue = String(nextValue || "").trim();
      if (nextValue) props.setProperty(key, nextValue);
      else props.deleteProperty(key);
    }
    let found = false;
    for (let i = 1; i < freshRows.length; i++) {
      if (String(freshRows[i][0] || "") === key) {
        s.getRange(i + 1, 2).setValue(storeInPropertiesOnly ? "" : nextValue);
        found = true;
        break;
      }
    }
    if (!found && !storeInPropertiesOnly) {
      s.appendRow([key, nextValue]);
      freshRows = s.getDataRange().getValues();
    }
  }
  invalidateCaches_(["settings_map"]);
  return { status: "success", cache_manifest: touchCacheTags_(["settings"]) };
}

function testImageKitConfig(d, cfg) {
  requireAdminSession_(d, { allowDemo: false, actionName: "test_ik_config" });
  cfg = cfg || getSettingsMap_();
  const ikCfg = resolveImageKitConfig_(d, cfg);
  const errors = validateImageKitConfigFormat_(ikCfg, { requireEndpoint: false });
  if (errors.length) {
    return { status: "error", message: errors[0], errors: errors };
  }

  const result = fetchImageKitFiles_(ikCfg.privateKey, 1);
  if (!result.ok) return { status: "error", message: result.message };

  const sampleFile = result.files.length ? result.files[0] : null;
  const sampleUrl = sampleFile ? String(sampleFile.url || "") : "";
  const inferredEndpoint = inferImageKitEndpointFromUrl_(sampleUrl);
  const warnings = [];

  if (!ikCfg.endpoint && inferredEndpoint) {
    warnings.push("URL endpoint berhasil dideteksi otomatis dari file yang ada di akun.");
  } else if (ikCfg.endpoint && inferredEndpoint && sampleUrl && sampleUrl.indexOf(ikCfg.endpoint) !== 0) {
    warnings.push("URL endpoint yang diisi tidak cocok dengan contoh URL file di akun. Periksa kembali URL endpoint ImageKit Anda.");
  }

  return {
    status: "success",
    message: "Koneksi ImageKit berhasil.",
    endpoint: ikCfg.endpoint || inferredEndpoint,
    inferred_endpoint: inferredEndpoint,
    sample_file_url: sampleUrl,
    warnings: warnings
  };
}

function getImageKitAuth(d, cfg) {
  requireAdminSession_(d, { allowDemo: false, actionName: "get_ik_auth" });
  cfg = cfg || getSettingsMap_();
  const ikCfg = resolveImageKitConfig_(d, cfg);
  const errors = validateImageKitConfigFormat_(ikCfg, { requirePublic: false, requireEndpoint: false, requirePrivate: true });
  if (errors.length) return { status: "error", message: errors[0] };

  const t = Utilities.getUuid();
  const exp = Math.floor(Date.now() / 1000) + 2400;
  const toSign = t + exp;

  const sig = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, toSign, ikCfg.privateKey)
    .map(b => ("0" + (b & 255).toString(16)).slice(-2))
    .join("");

  return { status: "success", token: t, expire: exp, signature: sig };
}

/* =========================
   CHANGE PASSWORD
========================= */
function changeUserPassword(d) {
  try {
    const s = mustSheet_("Users");
    const r = s.getDataRange().getValues();
    const email = String(d.email).trim().toLowerCase();
    const oldPass = String(d.old_password);
    const newPass = String(d.new_password);

    for (let i = 1; i < r.length; i++) {
      if (String(r[i][1]).trim().toLowerCase() === email) {
        if (verifyPassword_(oldPass, String(r[i][2] || ""))) {
          s.getRange(i + 1, 3).setValue(hashPassword_(newPass));
          return { status: "success", message: "Password berhasil diubah" };
        } else {
          return { status: "error", message: "Password lama salah!" };
        }
      }
    }
    return { status: "error", message: "Email pengguna tidak ditemukan." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* =========================
   UPDATE PROFILE (NAMA & EMAIL)
========================= */
function pancinganIzin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) ss.getName();
  MailApp.getRemainingDailyQuota();
  try {
    UrlFetchApp.fetch("https://google.com");
  } catch (e) {
    // Ignore fetch errors
  }
  Logger.log("Pancingan sukses! Izin berhasil di-refresh.");
}

/* =========================
   AUTO-PAYMENT SYSTEM (MOOTA WEBHOOK)
========================= */
function forgotPassword(d) {
  try {
    const s = mustSheet_("Users");
    const r = s.getDataRange().getValues();
    const email = String(d.email).trim().toLowerCase();
    const cfg = getSettingsMap_();
    const siteName = getCfgFrom_(cfg, "site_name") || "Sistem Premium";
    
    let found = false;
    let nama = "";
    let rowIndex = -1;
    let tempPass = "";
    
    for (let i = 1; i < r.length; i++) {
      if (String(r[i][1]).trim().toLowerCase() === email) {
        rowIndex = i + 1;
        nama = r[i][3];
        found = true;
        break;
      }
    }
    
    if (found) {
        // Send Email
        const subject = `Lupa Password - ${siteName}`;
        tempPass = Math.random().toString(36).slice(-10);
        s.getRange(rowIndex, 3).setValue(hashPassword_(tempPass));

        const body = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h3>Halo ${nama},</h3>
            <p>Anda meminta reset password akun.</p>
            <p>Password sementara Anda adalah:</p>
            <p><strong>Email:</strong> ${email}<br>
            <strong>Password Sementara:</strong> ${tempPass}</p>
            <p>Silakan login kembali lalu segera ganti password Anda.</p>
            <br>
            <p>Salam,<br>Tim ${siteName}</p>
          </div>
        `;
        
        sendEmail(email, subject, body, cfg);
        return { status: "success", message: "Password telah dikirim ke email anda." };
    }
    
    return { status: "error", message: "Email tidak ditemukan." };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/* =========================
   PAGINATION ACTIONS
========================= */
function getAdminUsers(d) {
  try {
    const session = requireAdminSession_(d, { allowDemo: true, actionName: "get_admin_users" });
    const page = Number(d.page) || 1;
    const limit = Number(d.limit) || 20;
    const u = mustSheet_("Users").getDataRange().getValues();
    const data = u.slice(1).reverse();
    const start = (page - 1) * limit;
    const end = start + limit;
    
    const response = {
      status: "success",
      data: data.slice(start, end),
      has_more: data.length > end
    };
    if (isDemoAdminRole_(session.role)) {
      response.data = response.data.map(maskDemoUserRow_);
      response.demo_mode = true;
      response.read_only = true;
    }
    return attachCacheManifest_(response, ["users"]);
  } catch(e) {
    return { status: "error", message: e.toString() };
  }
}

/* =========================
   PHYSICAL CHECKOUT OVERRIDES
========================= */
function createOrder(d, cfg) {
  try {
    assertNonDemoAdminMutationIfPresent_(d, "create_order");
    cfg = cfg || getSettingsMap_();

    const oS = ensureOrdersSheetStructure_();
    const timestamp = new Date().toISOString();
    const orderRef = buildPhysicalOrderReference_(timestamp);
    const nama = sanitizeOrderText_(d.nama);
    const emailRaw = String(d.email || "").trim().toLowerCase();
    const email = emailRaw;
    const whatsapp = normalizePhone_(d.whatsapp || d.no_wa || "");
    const alamat = String(d.alamat || d.alamat_pengiriman || "").trim();
    const productName = sanitizeOrderText_(d.nama_produk || d.product_name || d.produk);
    const quantity = Math.max(1, Number(d.jumlah || d.qty || d.quantity || 1));
    const unitPrice = Math.max(0, toNumberSafe_(d.harga_satuan !== undefined ? d.harga_satuan : d.harga));
    const detailPesanan = sanitizeOrderText_(d.detail_pesanan) || buildPhysicalOrderDetail_({
      id_produk: d.id_produk || d.product_id || "",
      nama_produk: productName,
      jumlah: quantity,
      harga_satuan: unitPrice
    });
    const totalHarga = Math.max(0, toNumberSafe_(d.total_harga || (quantity * unitPrice)));
    const statusPembayaran = normalizeOrderStatus_(d.status || d.status_pembayaran);
    const buktiTransfer = String(d.bukti_transfer || "").trim();
    const siteName = getCfgFrom_(cfg, "site_name") || "Admin";
    const adminWA = getCfgFrom_(cfg, "wa_admin") || "";
    const bankName = String(getCfgFrom_(cfg, "bank_name") || "").trim();
    const bankNorek = String(getCfgFrom_(cfg, "bank_norek") || "").trim();
    const bankOwner = String(getCfgFrom_(cfg, "bank_owner") || "").trim();

    if (nama.length < 3) return { status: "error", message: "Nama lengkap wajib diisi minimal 3 karakter." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Alamat email tidak valid." };
    if (!whatsapp || whatsapp.length < 9) return { status: "error", message: "Nomor WhatsApp tidak valid." };
    if (alamat.length < 10) return { status: "error", message: "Alamat pengiriman wajib diisi lengkap." };
    if (!productName && !detailPesanan) return { status: "error", message: "Detail pesanan tidak ditemukan." };
    if (quantity < 1) return { status: "error", message: "Jumlah pesanan minimal 1." };
    if (unitPrice <= 0 && totalHarga <= 0) return { status: "error", message: "Harga produk tidak valid." };
    if (!adminWA) return { status: "error", message: "Nomor WhatsApp admin belum dikonfigurasi." };

    oS.appendRow([
      timestamp,
      nama,
      email,
      "'" + whatsapp,
      alamat,
      detailPesanan,
      totalHarga,
      statusPembayaran,
      buktiTransfer
    ]);
    const waLines = [
      "Halo " + siteName + ",",
      "",
      "Saya ingin checkout produk fisik via WhatsApp dengan detail berikut:",
      "",
      "Kode Order: " + orderRef,
      "Nama Customer: " + nama,
      "WhatsApp: +62" + whatsapp,
      "Produk: " + productName,
      "Jumlah: " + quantity,
      "Harga Satuan: " + toCurrencyLabel_(unitPrice),
      "Total Produk: " + toCurrencyLabel_(totalHarga),
      "Alamat Pengiriman: " + alamat,
      "Detail Pesanan: " + detailPesanan,
      "Status Pesanan: Menunggu konfirmasi admin"
    ];
    if (email) waLines.splice(5, 0, "Email: " + email);
    waLines.push("");
    waLines.push("Mohon info konfirmasi stok, ongkir, dan langkah pembayaran berikutnya. Terima kasih.");

    const waMessage = waLines.join("\n");
    const redirectUrl = buildWhatsAppApiUrl_(adminWA, waMessage);

    return {
      status: "success",
      order_id: timestamp,
      order_ref: orderRef,
      redirect_url: redirectUrl,
      whatsapp_url: redirectUrl,
      whatsapp_message: waMessage,
      order: {
        timestamp: timestamp,
        nama: nama,
        email: email,
        no_wa: whatsapp,
        alamat: alamat,
        detail_pesanan: detailPesanan,
        total_harga: totalHarga,
        status_pembayaran: statusPembayaran,
        bukti_transfer: buktiTransfer
      },
      payment: {
        bank_name: bankName,
        bank_norek: bankNorek,
        bank_owner: bankOwner,
        wa_admin: adminWA
      },
      cache_manifest: touchCacheTags_(["orders"])
    };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function updateOrderStatus(d, cfg) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "update_order_status" });
    cfg = cfg || getSettingsMap_();
    const s = ensureOrdersSheetStructure_();
    const rows = getPhysicalOrderRows_();
    const idx = findPhysicalOrderIndexById_(rows, d.id);
    if (idx === -1) return { status: "error", message: "Order tidak ditemukan." };

    const rowNumber = idx + 2;
    const requestedStatus = Object.prototype.hasOwnProperty.call(d, "status")
      ? d.status
      : (Object.prototype.hasOwnProperty.call(d, "status_pembayaran") ? d.status_pembayaran : PHYSICAL_ORDER_STATUS_PAID);
    const nextStatus = normalizeOrderStatus_(requestedStatus);
    s.getRange(rowNumber, 8).setValue(nextStatus);
    if (Object.prototype.hasOwnProperty.call(d, "bukti_transfer")) {
      s.getRange(rowNumber, 9).setValue(String(d.bukti_transfer || "").trim());
    }
    const freshRow = s.getRange(rowNumber, 1, 1, PHYSICAL_ORDER_HEADERS.length).getValues()[0];
    return {
      status: "success",
      message: "Status pembayaran berhasil diperbarui.",
      data: physicalOrderRowToAdminRow_(freshRow),
      cache_manifest: touchCacheTags_(["orders"])
    };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function deleteOrder(d) {
  try {
    requireAdminSession_(d, { allowDemo: false, actionName: "delete_order" });
    const s = ensureOrdersSheetStructure_();
    const rows = getPhysicalOrderRows_();
    const idx = findPhysicalOrderIndexById_(rows, d.id);
    if (idx === -1) return { status: "error", message: "Order tidak ditemukan." };
    s.deleteRow(idx + 2);
    return { status: "success", message: "Order berhasil dihapus.", cache_manifest: touchCacheTags_(["orders"]) };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getAdminData(d, cfg) {
  try {
    const session = requireAdminSession_(d, { allowDemo: true, actionName: "get_admin_data" });
    cfg = cfg || getSettingsMap_();
    const orders = getPhysicalOrderAdminRows_().reverse();
    const users = mustSheet_("Users").getDataRange().getValues();
    const settingsRows = mustSheet_("Settings").getDataRange().getValues();
    const products = mustSheet_("Access_Rules").getDataRange().getValues();
    const pages = mustSheet_("Pages").getDataRange().getValues();
    const deprecatedKeys = toKeyLookup_(getRetiredSettingsKeys_());
    let rev = 0;
    orders.forEach(function(order) {
      if (isPaidOrderStatus_(order[8])) rev += toNumberSafe_(order[7]);
    });
    const settings = {};
    for (let i = 1; i < settingsRows.length; i++) {
      const key = String(settingsRows[i][0] || "").trim();
      if (!key || deprecatedKeys[key]) continue;
      settings[key] = settingsRows[i][1];
    }
    settings.ik_private_key = "";
    settings.ik_private_key_configured = !!getSecret_("ik_private_key", cfg);
    const result = {
      status: "success",
      demo_mode: false,
      read_only: false,
      role: session.role,
      session_expires_at: session.expires_at,
      stats: { users: users.length - 1, orders: orders.length, rev: rev },
      orders: orders.slice(0, 20),
      products: normalizeAdminProductRows_(products.slice(1)),
      pages: pages.slice(1),
      settings: settings,
      users: users.slice(1).reverse().slice(0, 20),
      has_more_orders: orders.length > 20,
      has_more_users: (users.length - 1) > 20
    };
    if (isDemoAdminRole_(session.role)) return attachCacheManifest_(maskAdminDataForDemo_(result, session), ["settings", "products", "pages", "orders", "users"]);
    return attachCacheManifest_(result, ["settings", "products", "pages", "orders", "users"]);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getAdminOrders(d) {
  try {
    const session = requireAdminSession_(d, { allowDemo: true, actionName: "get_admin_orders" });
    const page = Number(d.page) || 1;
    const limit = Number(d.limit) || 20;
    const search = String(d.search || "").trim().toLowerCase();
    let data = getPhysicalOrderAdminRows_().reverse();

    if (search) {
      data = data.filter(function(row) {
        return row.some(function(cell, index) {
          if (index === 7) return false;
          return String(cell || "").toLowerCase().indexOf(search) !== -1;
        });
      });
    }

    const start = (page - 1) * limit;
    const end = start + limit;
    const response = {
      status: "success",
      data: data.slice(start, end),
      has_more: data.length > end
    };
    if (isDemoAdminRole_(session.role)) {
      response.data = response.data.map(maskDemoOrderRow_);
      response.demo_mode = true;
      response.read_only = true;
    }
    return attachCacheManifest_(response, ["orders"]);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function updateUserProfile(d) {
  try {
    const s = mustSheet_("Users");
    const r = s.getDataRange().getValues();
    const currentEmail = String(d.email || "").trim().toLowerCase();
    const newName = String(d.new_name || "").trim();
    const newEmail = String(d.new_email || "").trim().toLowerCase();
    const password = String(d.password || "");

    if (!newName || !newEmail) return { status: "error", message: "Nama dan Email baru wajib diisi." };

    let userRowIndex = -1;
    for (let i = 1; i < r.length; i++) {
      const rowEmail = String(r[i][1] || "").trim().toLowerCase();
      if (rowEmail === currentEmail) {
        if (!verifyPassword_(password, String(r[i][2] || ""))) return { status: "error", message: "Password salah!" };
        userRowIndex = i + 1;
      }
      if (rowEmail === newEmail && rowEmail !== currentEmail) {
        return { status: "error", message: "Email baru sudah digunakan oleh pengguna lain." };
      }
    }

    if (userRowIndex === -1) return { status: "error", message: "Pengguna tidak ditemukan." };

    s.getRange(userRowIndex, 2).setValue(newEmail);
    s.getRange(userRowIndex, 4).setValue(newName);

    const oS = ensureOrdersSheetStructure_();
    const orderRows = getPhysicalOrderRows_();
    for (let j = 0; j < orderRows.length; j++) {
      if (String(orderRows[j][2] || "").trim().toLowerCase() === currentEmail) {
        oS.getRange(j + 2, 2).setValue(newName);
        oS.getRange(j + 2, 3).setValue(newEmail);
      }
    }
    return { status: "success", message: "Profil berhasil diperbarui", new_email: newEmail, new_name: newName, cache_manifest: touchCacheTags_(["users", "orders"]) };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getEmailLogs_() {
  try {
    const s = ss.getSheetByName("Email_Logs");
    if (!s || s.getLastRow() <= 1) return { status: "success", data: [], message: "No email logs yet" };
    const data = s.getDataRange().getValues();
    return { status: "success", data: data.slice(1).reverse().slice(0, 50) };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function testEmailDelivery(d) {
  try {
    const email = String(d.email || "").trim();
    if (!email) return { status: "error", message: "Email target wajib diisi" };
    
    const cfg = getSettingsMap_();
    const siteName = getCfgFrom_(cfg, "site_name") || "Sistem Premium";
    
    const testHtml = '<div style="font-family: sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">' +
      '<h2 style="color: #4f46e5;">✅ Test Email Berhasil!</h2>' +
      '<p>Ini adalah email test dari sistem <b>' + siteName + '</b>.</p>' +
      '<p><b>Waktu:</b> ' + new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + '</p>' +
      '<p><b>Quota Tersisa:</b> ' + MailApp.getRemainingDailyQuota() + ' email</p>' +
      '<p>Jika Anda menerima email ini, berarti sistem email berfungsi normal.</p>' +
      '</div>';
    
    const result = sendEmail(email, "[TEST] Email Test - " + siteName, testHtml, cfg);
    return { status: "success", message: "Test email sent", result: result };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

function getSystemHealth() {
  try {
    const emailQuota = MailApp.getRemainingDailyQuota();
    const orders = getPhysicalOrderRows_();
    let pendingCount = 0;
    let oldPendingCount = 0;
    orders.forEach(function(row) {
      if (!isPaidOrderStatus_(row[7])) {
        pendingCount += 1;
        const dt = new Date(String(row[0] || ""));
        if (!isNaN(dt.getTime()) && (Date.now() - dt.getTime()) / 36e5 > 72) oldPendingCount += 1;
      }
    });
    let emailLogCount = 0;
    let emailFailCount = 0;
    const emailSheet = ss.getSheetByName("Email_Logs");
    if (emailSheet && emailSheet.getLastRow() > 1) {
      const emailLogs = emailSheet.getDataRange().getValues();
      emailLogCount = emailLogs.length - 1;
      for (let i = 1; i < emailLogs.length; i++) {
        const status = String(emailLogs[i][1] || "");
        if (status === "FAILED" || status === "QUOTA_EXCEEDED") emailFailCount += 1;
      }
    }
    return {
      status: "success",
      health: {
        email: {
          quota_remaining: emailQuota,
          quota_warning: emailQuota < 10,
          total_logs: emailLogCount,
          failed_count: emailFailCount
        },
        orders: {
          pending_count: pendingCount,
          stale_pending: oldPendingCount
        },
        integrations: {
          checkout_flow: "manual_whatsapp",
          payment_confirmation: "manual"
        }
      }
    };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}
