const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

if (typeof Response === 'undefined' || typeof Request === 'undefined' || typeof Headers === 'undefined') {
  throw new Error('Node runtime harus menyediakan fetch API globals (Response/Request/Headers).');
}

class SharedStorage {
  constructor(seed) {
    this.map = new Map(Object.entries(seed || {}));
  }

  cloneData() {
    const out = {};
    this.map.forEach((value, key) => {
      out[key] = String(value);
    });
    return out;
  }
}

class StorageFacade {
  constructor(shared) {
    this.shared = shared;
  }

  get length() {
    return this.shared.map.size;
  }

  key(index) {
    return Array.from(this.shared.map.keys())[index] || null;
  }

  getItem(key) {
    return this.shared.map.has(String(key)) ? this.shared.map.get(String(key)) : null;
  }

  setItem(key, value) {
    this.shared.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.shared.map.delete(String(key));
  }

  clear() {
    this.shared.map.clear();
  }
}

function createSandbox(options) {
  const sharedLocal = options.sharedLocal || new SharedStorage();
  const sharedSession = options.sharedSession || new SharedStorage();
  const fetchLog = options.fetchLog || [];
  const manifestQueue = Array.isArray(options.manifestQueue) ? options.manifestQueue.slice() : [];
  const productQueue = Array.isArray(options.productQueue) ? options.productQueue.slice() : [];

  const listeners = {};
  const windowObj = {
    localStorage: new StorageFacade(sharedLocal),
    sessionStorage: new StorageFacade(sharedSession),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((fn) => fn !== handler);
    },
    dispatchEvent(event) {
      const list = listeners[event && event.type ? event.type : ''] || [];
      list.forEach((handler) => handler(event));
    }
  };

  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.globalThis = windowObj;
  windowObj.location = { hostname: 'example.com', protocol: 'https:' };
  windowObj.document = { visibilityState: 'visible' };
  windowObj.SITE_CONFIG = {
    ALLOWED_DOMAINS: ['example.com'],
    ALLOWED_SUBDOMAIN_SUFFIXES: [],
    ALLOW_LOCALHOST: false,
    ALLOW_PAGES_DEV: false
  };

  windowObj.atob = function(input) {
    return Buffer.from(String(input || ''), 'base64').toString('binary');
  };
  windowObj.btoa = function(input) {
    return Buffer.from(String(input || ''), 'binary').toString('base64');
  };

  windowObj.BroadcastChannel = class {
    constructor() {}
    addEventListener() {}
    postMessage() {}
    close() {}
  };

  const nativeFetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    fetchLog.push({ url, action: body.action || '', body });

    if (body.action === 'get_cache_manifest') {
      const manifest = manifestQueue.length ? manifestQueue.shift() : {
        schema: 1,
        updated_at: 100,
        poll_seconds: 15,
        versions: { settings: 100, products: 100, pages: 100, orders: 100, users: 100 }
      };
      return new Response(JSON.stringify({ status: 'success', data: manifest }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (body.action === 'get_product') {
      const product = productQueue.length ? productQueue.shift() : { id: body.id || 'P-1', title: 'Produk Default', harga: 1000 };
      return new Response(JSON.stringify({
        status: 'success',
        data: product,
        payment: {},
        cache_manifest: {
          schema: 1,
          updated_at: 100,
          poll_seconds: 15,
          versions: { settings: 100, products: 100, pages: 100, orders: 100, users: 100 }
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  windowObj.fetch = nativeFetch;
  windowObj.Response = Response;
  windowObj.Request = Request;
  windowObj.Headers = Headers;
  windowObj.AbortController = AbortController;
  windowObj.Promise = Promise;
  windowObj.Math = Math;
  windowObj.Date = Date;
  windowObj.JSON = JSON;
  windowObj.String = String;
  windowObj.Number = Number;
  windowObj.Array = Array;
  windowObj.Object = Object;
  windowObj.Map = Map;
  windowObj.Error = Error;

  const context = vm.createContext(windowObj);
  context.window = windowObj;
  context.self = windowObj;
  context.globalThis = windowObj;
  context.global = windowObj;
  context.location = windowObj.location;
  context.document = windowObj.document;
  context.SITE_CONFIG = windowObj.SITE_CONFIG;
  context.console = console;
  context.setTimeout = setTimeout;
  context.clearTimeout = clearTimeout;
  context.setInterval = setInterval;
  context.clearInterval = clearInterval;
  context.Response = Response;
  context.Request = Request;
  context.Headers = Headers;
  context.AbortController = AbortController;
  context.atob = windowObj.atob;
  context.btoa = windowObj.btoa;

  const configSource = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  vm.runInContext(configSource, context, { filename: 'config.js' });

  return {
    window: windowObj,
    sharedLocal,
    sharedSession,
    fetchLog
  };
}

async function testReadEntryTreatsOldManifestAsStale() {
  const sharedLocal = new SharedStorage({
    cepat_cache_manifest_v1: JSON.stringify({
      schema: 1,
      updated_at: 100,
      poll_seconds: 15,
      versions: { settings: 100, products: 100, pages: 100, orders: 100, users: 100 },
      fetched_at: 0
    })
  });
  const sandbox = createSandbox({ sharedLocal });
  sandbox.window.CEPAT_CACHE.writeEntry('catalog-entry', [{ id: 'P-1' }], { tags: ['products'], time: Date.now() });
  const entry = sandbox.window.CEPAT_CACHE.readEntry('catalog-entry', { tags: ['products'], maxAge: 60000 });
  assert.strictEqual(entry.missing, false, 'entry cache seharusnya ada');
  assert.strictEqual(entry.manifestFresh, false, 'manifest lama harus dianggap tidak fresh');
  assert.strictEqual(entry.stale, true, 'cache entry harus stale saat manifest terlalu tua');
}

async function testFetchRefreshesManifestBeforeUsingCacheableResponse() {
  const sharedLocal = new SharedStorage();

  const staleManifest = {
    schema: 1,
    updated_at: 100,
    poll_seconds: 15,
    versions: { settings: 100, products: 100, pages: 100, orders: 100, users: 100 }
  };

  const firstBoot = createSandbox({
    sharedLocal,
    manifestQueue: [staleManifest],
    productQueue: [{ id: 'P-1', title: 'Produk Lama', harga: 1000 }]
  });

  firstBoot.window.CEPAT_CACHE.applyManifest(Object.assign({}, staleManifest, { fetched_at: Date.now() }));
  const staleResponse = await firstBoot.window.fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_product', id: 'P-1' })
  });
  const stalePayload = await staleResponse.json();
  assert.strictEqual(stalePayload.data.title, 'Produk Lama', 'bootstrap awal harus menyimpan response lama');

  sharedLocal.map.set('cepat_cache_manifest_v1', JSON.stringify(Object.assign({}, staleManifest, { fetched_at: 0 })));

  const freshManifest = {
    schema: 1,
    updated_at: 200,
    poll_seconds: 15,
    versions: { settings: 200, products: 200, pages: 100, orders: 100, users: 100 }
  };

  const secondFetchLog = [];
  const secondBoot = createSandbox({
    sharedLocal,
    fetchLog: secondFetchLog,
    manifestQueue: [freshManifest],
    productQueue: [{ id: 'P-1', title: 'Produk Baru', harga: 2000 }]
  });

  const freshResponse = await secondBoot.window.fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_product', id: 'P-1' })
  });
  const freshPayload = await freshResponse.json();

  assert.strictEqual(freshPayload.data.title, 'Produk Baru', 'fetch harus melewati cache lama setelah manifest berubah');
  assert.strictEqual(secondFetchLog.filter((item) => item.action === 'get_cache_manifest').length, 1, 'manifest harus di-refresh lebih dulu');
  assert.strictEqual(secondFetchLog.filter((item) => item.action === 'get_product').length, 1, 'produk harus diambil ulang dengan key versi baru');
}

async function testWatchManifestReceivesImmediateInvalidation() {
  const sandbox = createSandbox({ sharedLocal: new SharedStorage() });
  const nextManifest = {
    schema: 1,
    updated_at: 300,
    poll_seconds: 15,
    versions: { settings: 100, products: 300, pages: 100, orders: 100, users: 100 }
  };

  let callbackCount = 0;
  let lastVersion = 0;
  const stop = sandbox.window.CEPAT_CACHE.watchManifest(function(manifest) {
    callbackCount += 1;
    lastVersion = Number(manifest && manifest.versions && manifest.versions.products || 0);
  }, { immediate: false, intervalMs: 60000 });

  sandbox.window.CEPAT_CACHE.applyManifest(nextManifest);
  stop();

  assert.strictEqual(callbackCount, 1, 'watchManifest harus diberi notifikasi segera saat manifest berubah');
  assert.strictEqual(lastVersion, 300, 'watchManifest harus menerima versi manifest terbaru');
}

async function main() {
  await testReadEntryTreatsOldManifestAsStale();
  await testFetchRefreshesManifestBeforeUsingCacheableResponse();
  await testWatchManifestReceivesImmediateInvalidation();
  console.log('cache runtime tests passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
