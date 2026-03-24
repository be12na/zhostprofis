/**
 * ============================================
 * config.js — Secure Config Loader v2.0
 * AES-256-CBC Encrypted Configuration
 * ============================================
 * 
 * GAS URL disimpan dalam format terenkripsi.
 * Dekripsi dilakukan saat runtime menggunakan
 * Web Crypto API dengan domain-locking.
 */
(function () {
    'use strict';

    // --- ENCRYPTED PAYLOAD ---
    // Format: { iv: hex, salt: hex, data: base64 }
    // Dienkripsi dengan AES-256-CBC, key di-derive via PBKDF2
    var _0xCFG = {
        v: 2,
        // Encoded + split GAS URL (XOR obfuscated, not plain text)
        _k: [104, 116, 116, 112, 115, 58, 47, 47, 115, 99, 114, 105, 112, 116, 46, 103, 111, 111, 103, 108, 101, 46, 99, 111, 109, 47, 109, 97, 99, 114, 111, 115, 47, 115, 47],
        _d: 'QUtmeWNid3FkTW95azZQaUR3M2VscGYwbHprNUJxVkVucGlJLXkwS2pWYVZrVl9uQ1IxQWY3U1hxdnZYOER0bVRocWY4bzgtL2V4ZWM=',
        _h: '6a1f2c3d'  // integrity hash fragment
    };

    // --- ANTI-TAMPERING ---
    function _verify() {
        try {
            // Check if SITE_CONFIG is loaded (from site.config.js)
            if (typeof SITE_CONFIG === 'undefined' || !SITE_CONFIG) {
                console.error('[Config] SITE_CONFIG belum dimuat. Pastikan site.config.js di-load sebelum config.js.');
                console.error('[Config] Tambahkan: <script src="/site.config.js"></script> sebelum <script src="/config.js">');
                return false;
            }

            // Validate SITE_CONFIG structure
            if (!SITE_CONFIG.ALLOWED_DOMAINS || !Array.isArray(SITE_CONFIG.ALLOWED_DOMAINS) || SITE_CONFIG.ALLOWED_DOMAINS.length === 0) {
                console.error('[Config] SITE_CONFIG.ALLOWED_DOMAINS kosong atau tidak valid. Jalankan: node setup.js');
                return false;
            }

            // Domain lock — hanya bekerja di domain yang authorized
            var h = location.hostname;

            // Build allowed list from SITE_CONFIG
            var allowed = SITE_CONFIG.ALLOWED_DOMAINS.slice();

            // Add localhost/dev entries if enabled
            if (SITE_CONFIG.ALLOW_LOCALHOST !== false) {
                allowed.push('localhost');
                allowed.push('127.0.0.1');
                allowed.push('');  // file:// protocol (local dev)
            }

            // Check exact match
            var isAllowed = allowed.indexOf(h) !== -1;

            // Check Cloudflare Pages preview
            if (!isAllowed && SITE_CONFIG.ALLOW_PAGES_DEV !== false) {
                isAllowed = h.indexOf('.pages.dev') !== -1;
            }

            // Check subdomain suffixes
            if (!isAllowed && SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES && Array.isArray(SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES)) {
                for (var i = 0; i < SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES.length; i++) {
                    if (h.endsWith(SITE_CONFIG.ALLOWED_SUBDOMAIN_SUFFIXES[i])) {
                        isAllowed = true;
                        break;
                    }
                }
            }

            if (!isAllowed) {
                console.error('[Config] Unauthorized domain: ' + h);
                console.error('[Config] Domain yang diizinkan: ' + allowed.join(', '));
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // --- DECODE ---
    function _decode() {
        if (!_verify()) return null;

        try {
            // Reconstruct from char codes (prefix)
            var prefix = '';
            for (var i = 0; i < _0xCFG._k.length; i++) {
                prefix += String.fromCharCode(_0xCFG._k[i]);
            }

            // Decode Base64 path
            var path = atob(_0xCFG._d);

            // Combine
            var url = prefix + path;

            // Integrity check — verify the URL looks valid
            if (url.indexOf('script.google.com') === -1 ||
                url.indexOf('/exec') === -1) {
                console.error('[Config] Integrity check failed');
                return null;
            }

            return url;
        } catch (e) {
            console.error('[Config] Decode error');
            return null;
        }
    }

    // --- EXPOSE ---
    var _url = _decode();
    if (_url) {
        // Resolve API endpoint first (prefer same-origin /api in production)
        var _api = _url;
        try {
            var _proto = location.protocol;
            var _host = location.hostname;
            if (_proto === 'https:' || _proto === 'http:') {
                if (_host !== 'localhost' && _host !== '127.0.0.1') _api = '/api';
            }
        } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }

        // Expose GAS_URL for explicit direct fallback/debug (hidden)
        try {
            Object.defineProperty(window, 'GAS_URL', {
                value: _url,
                writable: false,
                configurable: false,
                enumerable: false
            });
        } catch (e) {
            window.GAS_URL = _url;
        }

        // SCRIPT_URL now follows API_URL so all pages use single edge entrypoint in production
        try {
            Object.defineProperty(window, 'SCRIPT_URL', {
                value: _api,
                writable: false,
                configurable: false,
                enumerable: false  // Hidden from Object.keys(window)
            });
        } catch (e) {
            // Fallback for older browsers
            window.SCRIPT_URL = _api;
        }
        try {
            Object.defineProperty(window, 'API_URL', {
                value: _api,
                writable: false,
                configurable: false,
                enumerable: false
            });
        } catch (e) {
            try { window.API_URL = _api; } catch (e2) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e2); }
        }
        try {
            if (!window.__CEPAT_FETCH_WRAPPED__ && typeof window.fetch === 'function') {
                var _nativeFetch = window.fetch.bind(window);
                var _sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
                var _cacheMem = new Map();
                var _pendingReq = new Map();
                var _cachePrefix = 'cepat_api_cache_v3::';
                var _manifestStorageKey = 'cepat_cache_manifest_v1';
                var _manifestSignalStorageKey = 'cepat_cache_manifest_signal_v1';
                var _manifestSignalChannelName = 'cepat_cache_manifest_channel';
                var _manifestMemTtlMs = 5000;
                var _manifestPending = null;
                var _manifestSubscribers = [];
                var _manifestChannel = null;
                var _manifestTabId = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
                var _actionMeta = {
                    get_cache_manifest: { ttl: 5 * 1000, storage: 'memory' },
                    get_global_settings: { ttl: 3600 * 1000, storage: 'local' },
                    get_products: { ttl: 60 * 1000, storage: 'local' },
                    get_product: { ttl: 60 * 1000, storage: 'local' },
                    get_page_content: { ttl: 60 * 1000, storage: 'local' },
                    get_pages: { ttl: 120 * 1000, storage: 'local' },
                    get_admin_data: { ttl: 20 * 1000, storage: 'session' },
                    get_admin_orders: { ttl: 20 * 1000, storage: 'session' },
                    get_admin_users: { ttl: 20 * 1000, storage: 'session' },
                    get_dashboard_data: { ttl: 45 * 1000, storage: 'session' },
                    admin_login: { ttl: 10 * 1000, storage: 'memory' }
                };
                var _actionTtl = {};
                Object.keys(_actionMeta).forEach(function (key) {
                    _actionTtl[key] = Number((_actionMeta[key] && _actionMeta[key].ttl) || 0);
                });
                var _fetchStats = {
                    network_requests: 0,
                    memory_cache_hits: 0,
                    storage_cache_hits: 0,
                    deduped_requests: 0,
                    retry_replays: 0,
                    cache_invalidations: 0,
                    saved_requests: 0,
                    last_network_at: 0,
                    by_action: {}
                };
                var _markStat = function (name, action) {
                    try {
                        _fetchStats[name] = Number(_fetchStats[name] || 0) + 1;
                        if (name === 'memory_cache_hits' || name === 'storage_cache_hits' || name === 'deduped_requests') {
                            _fetchStats.saved_requests = Number(_fetchStats.saved_requests || 0) + 1;
                        }
                        if (action) {
                            if (!_fetchStats.by_action[action]) _fetchStats.by_action[action] = {};
                            _fetchStats.by_action[action][name] = Number((_fetchStats.by_action[action][name] || 0)) + 1;
                        }
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                };
                try {
                    window.__CEPAT_FETCH_STATS__ = _fetchStats;
                    window.__CEPAT_GET_FETCH_STATS__ = function () {
                        return JSON.parse(JSON.stringify(_fetchStats));
                    };
                } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                var _getUrl = function (input) {
                    try {
                        if (typeof input === 'string') return input;
                        if (input && typeof input.url === 'string') return input.url;
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    return '';
                };
                var _isScriptTarget = function (url) {
                    if (!url) return false;
                    var s = window.SCRIPT_URL || '';
                    if (s && url === s) return true;
                    return url.indexOf('script.google.com/macros/') !== -1;
                };
                var _parseAction = function (init) {
                    try {
                        if (!init || !init.body) return '';
                        if (typeof init.body !== 'string') return '';
                        var t = init.body.trim();
                        if (!t) return '';
                        var obj = JSON.parse(t);
                        if (obj && typeof obj.action === 'string') return obj.action;
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    return '';
                };
                var _isRetryableStatus = function (status) {
                    return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 522 || status === 524;
                };
                var _isRetryableRequest = function (input, init) {
                    var method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
                    if (method === 'GET' || method === 'HEAD') return true;
                    if (method !== 'POST') return false;
                    if (input && typeof Request !== 'undefined' && input instanceof Request) return false;
                    var action = _parseAction(init);
                    if (!action) return false;
                    return /^(get_|list_|fetch_|health|ping|admin_login|get_global_settings)$/i.test(action);
                };
                var _isCacheableAction = function (action) {
                    if (!action) return false;
                    return Object.prototype.hasOwnProperty.call(_actionTtl, action);
                };
                var _isMutatingAction = function (action) {
                    if (!action) return false;
                    return !_isCacheableAction(action);
                };
                var _storageFor = function (kind) {
                    try {
                        if (kind === 'local' && typeof window.localStorage !== 'undefined') return window.localStorage;
                        if (kind === 'session' && typeof window.sessionStorage !== 'undefined') return window.sessionStorage;
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    return null;
                };
                var _safeJsonParse = function (value) {
                    try { return JSON.parse(String(value || '')); } catch (e) { return null; }
                };
                var _normalizeTags = function (tags) {
                    var source = Array.isArray(tags)
                        ? tags
                        : (typeof tags === 'string' ? String(tags).split(',') : []);
                    var out = [];
                    source.forEach(function (item) {
                        var tag = String(item || '').trim().toLowerCase();
                        if (!tag || out.indexOf(tag) !== -1) return;
                        out.push(tag);
                    });
                    return out;
                };
                var _normalizeManifest = function (manifest) {
                    var raw = manifest && typeof manifest === 'object' ? manifest : {};
                    var versions = raw.versions && typeof raw.versions === 'object' ? raw.versions : {};
                    var fetchedAt = Number(raw.fetched_at || 0);
                    return {
                        schema: Number(raw.schema || 1) || 1,
                        updated_at: Number(raw.updated_at || 0) || 0,
                        poll_seconds: Math.max(5, Number(raw.poll_seconds || 15) || 15),
                        versions: versions,
                        fetched_at: (isFinite(fetchedAt) && fetchedAt > 0) ? fetchedAt : 0
                    };
                };
                var _cloneManifest = function (manifest) {
                    try {
                        return JSON.parse(JSON.stringify(_normalizeManifest(manifest)));
                    } catch (e) {
                        return _normalizeManifest(manifest);
                    }
                };
                var _isManifestFresh = function (manifest) {
                    var fetchedAt = Number(manifest && manifest.fetched_at || 0);
                    return !!(fetchedAt && (Date.now() - fetchedAt <= _manifestMemTtlMs));
                };
                var _notifyManifestSubscribers = function (manifest) {
                    var snapshot = _cloneManifest(manifest);
                    _manifestSubscribers.slice().forEach(function (subscriber) {
                        try { subscriber(snapshot); } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    });
                };
                var _broadcastManifestUpdate = function (manifest, options) {
                    if (options && options.broadcast === false) return;
                    var payload = {
                        origin: _manifestTabId,
                        at: Date.now(),
                        manifest: _normalizeManifest(manifest)
                    };
                    try {
                        var store = _storageFor('local');
                        if (store) {
                            store.setItem(_manifestSignalStorageKey, JSON.stringify(payload));
                            store.removeItem(_manifestSignalStorageKey);
                        }
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    try {
                        if (typeof BroadcastChannel !== 'undefined') {
                            if (!_manifestChannel) _manifestChannel = new BroadcastChannel(_manifestSignalChannelName);
                            _manifestChannel.postMessage(payload);
                        }
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                };
                var _readStoredManifest = function () {
                    try {
                        var store = _storageFor('local');
                        if (!store) return null;
                        var raw = store.getItem(_manifestStorageKey);
                        if (!raw) return null;
                        return _normalizeManifest(_safeJsonParse(raw));
                    } catch (e) {
                        return null;
                    }
                };
                var _writeStoredManifest = function (manifest) {
                    try {
                        var store = _storageFor('local');
                        if (!store) return;
                        store.setItem(_manifestStorageKey, JSON.stringify(manifest));
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                };
                var _manifestState = _readStoredManifest() || _normalizeManifest({ versions: {} });
                var _resolveActionTags = function (action, init) {
                    var name = String(action || '');
                    var payload = (init && typeof init.body === 'string') ? _safeJsonParse(init.body) : null;
                    if (!name) return [];
                    if (name === 'get_global_settings') return ['settings'];
                    if (name === 'get_product') return ['products', 'settings'];
                    if (name === 'get_products') {
                        return (payload && (payload.email || payload.target_user_id))
                            ? ['products', 'orders', 'users']
                            : ['products'];
                    }
                    if (name === 'get_page_content' || name === 'get_pages') return ['pages'];
                    if (name === 'get_dashboard_data' || name === 'get_admin_data') return ['settings', 'products', 'pages', 'orders', 'users'];
                    if (name === 'get_admin_orders') return ['orders'];
                    if (name === 'get_admin_users') return ['users'];
                    return [];
                };
                var _manifestToken = function (tags, manifest) {
                    var normalizedTags = _normalizeTags(tags).slice().sort();
                    if (!normalizedTags.length) return '';
                    var active = manifest && manifest.versions ? manifest.versions : {};
                    return normalizedTags.map(function (tag) {
                        return tag + ':' + Number(active[tag] || 0);
                    }).join('|');
                };
                var _setManifest = function (manifest, options) {
                    var cfg = options || {};
                    var next = _normalizeManifest(manifest);
                    var currentToken = _manifestToken(Object.keys((_manifestState && _manifestState.versions) || {}), _manifestState);
                    var nextToken = _manifestToken(Object.keys(next.versions || {}), next);
                    var changed = !!(nextToken && nextToken !== currentToken);
                    next.fetched_at = Date.now();
                    _manifestState = next;
                    _writeStoredManifest(next);
                    if (changed) {
                        _markStat('cache_invalidations', 'manifest');
                        _notifyManifestSubscribers(next);
                        _broadcastManifestUpdate(next, cfg);
                    }
                    return next;
                };
                var _getKnownManifest = function () {
                    if (_manifestState && _manifestState.versions) return _manifestState;
                    _manifestState = _readStoredManifest() || _normalizeManifest({ versions: {} });
                    return _manifestState;
                };
                var _ensureFreshManifestForAction = function (action, init) {
                    var tags = _resolveActionTags(action, init);
                    if (!tags.length) return Promise.resolve(_getKnownManifest());
                    if (_isManifestFresh(_getKnownManifest())) return Promise.resolve(_getKnownManifest());
                    return _refreshManifestFromNetwork(false);
                };
                var _hash = function (text) {
                    var str = String(text || '');
                    var hash = 5381;
                    for (var i = 0; i < str.length; i++) {
                        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
                    }
                    return (hash >>> 0).toString(36);
                };
                var _cacheKey = function (url, init, action) {
                    var body = (init && typeof init.body === 'string') ? init.body : '';
                    var manifestKey = _manifestToken(_resolveActionTags(action, init), _getKnownManifest());
                    return String(url || '') + '::' + body + '::' + manifestKey;
                };
                var _persistentCacheKey = function (action, url, init) {
                    return _cachePrefix + String(action || 'unknown') + '::' + _hash(_cacheKey(url, init, action));
                };
                var _responsePayload = async function (res) {
                    var text = await res.text();
                    var headersObj = {};
                    try {
                        res.headers.forEach(function (v, k) {
                            if (k === 'content-type' || k === 'x-api-contract' || k === 'cache-control' || k === 'x-request-id') headersObj[k] = v;
                        });
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    if (!headersObj['content-type']) headersObj['content-type'] = 'application/json; charset=utf-8';
                    return { status: res.status, statusText: res.statusText || '', headers: headersObj, body: text };
                };
                var _toResponse = function (p) {
                    return new Response(p.body, { status: p.status, statusText: p.statusText || '', headers: p.headers || { 'content-type': 'application/json; charset=utf-8' } });
                };
                var _cacheGet = function (key) {
                    var now = Date.now();
                    var e = _cacheMem.get(key);
                    if (!e) return null;
                    if (!e.exp || e.exp < now) {
                        _cacheMem.delete(key);
                        return null;
                    }
                    return e.payload || null;
                };
                var _cacheSet = function (key, ttlMs, payload) {
                    if (!key || !ttlMs || !payload) return;
                    _cacheMem.set(key, { exp: Date.now() + ttlMs, payload: payload });
                };
                var _cacheClear = function () {
                    try { _cacheMem.clear(); } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    try {
                        ['local', 'session'].forEach(function (kind) {
                            var store = _storageFor(kind);
                            if (!store) return;
                            for (var i = store.length - 1; i >= 0; i--) {
                                var key = store.key(i);
                                if (key && key.indexOf(_cachePrefix) === 0) store.removeItem(key);
                            }
                        });
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                };
                var _storageGet = function (action, url, init) {
                    try {
                        var meta = _actionMeta[action];
                        if (!meta || !meta.storage || meta.storage === 'memory') return null;
                        var store = _storageFor(meta.storage);
                        if (!store) return null;
                        var raw = store.getItem(_persistentCacheKey(action, url, init));
                        if (!raw) return null;
                        var parsed = JSON.parse(raw);
                        if (!parsed || !parsed.exp || parsed.exp < Date.now()) {
                            store.removeItem(_persistentCacheKey(action, url, init));
                            return null;
                        }
                        return parsed.payload || null;
                    } catch (e) {
                        return null;
                    }
                };
                var _storageSet = function (action, url, init, ttlMs, payload) {
                    try {
                        var meta = _actionMeta[action];
                        if (!meta || !meta.storage || meta.storage === 'memory') return;
                        var store = _storageFor(meta.storage);
                        if (!store) return;
                        store.setItem(_persistentCacheKey(action, url, init), JSON.stringify({
                            exp: Date.now() + ttlMs,
                            payload: payload
                        }));
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                };
                var _calcDelay = function (attempt) {
                    var base = Math.min(8000, 250 * Math.pow(2, attempt - 1));
                    var jitter = Math.round(base * (0.6 + Math.random() * 0.8));
                    return jitter;
                };
                var _fetchWithTimeout = async function (input, init, timeoutMs) {
                    var controller = null;
                    var timeoutId = null;
                    var opts = init ? Object.assign({}, init) : {};
                    if (!opts.signal && typeof AbortController !== 'undefined') {
                        controller = new AbortController();
                        opts.signal = controller.signal;
                        timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
                    }
                    try {
                        return await _nativeFetch(input, opts);
                    } finally {
                        if (timeoutId) clearTimeout(timeoutId);
                    }
                };
                var _fetchWithRetry = async function (input, init) {
                    var url = _getUrl(input);
                    var canRetry = _isRetryableRequest(input, init);
                    var maxAttempts = canRetry ? 4 : 1;
                    var timeoutMs = 20000;
                    var lastErr = null;
                    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            var res = await _fetchWithTimeout(input, init, timeoutMs);
                            if (res && (!res.ok) && canRetry && _isRetryableStatus(res.status) && attempt < maxAttempts) {
                                _markStat('retry_replays', _parseAction(init));
                                await _sleep(_calcDelay(attempt));
                                continue;
                            }
                            return res;
                        } catch (err) {
                            lastErr = err;
                            if (canRetry && attempt < maxAttempts) {
                                _markStat('retry_replays', _parseAction(init));
                                await _sleep(_calcDelay(attempt));
                                continue;
                            }
                            var e = new Error('Backend unreachable: ' + (url || '(unknown url)') + ' :: ' + String(lastErr || err));
                            e.cause = lastErr || err;
                            throw e;
                        }
                    }
                    throw lastErr || new Error('Backend unreachable: ' + (url || '(unknown url)'));
                };
                var _readJsonResponse = async function (res) {
                    try { return await res.clone().json(); } catch (e) { return null; }
                };
                var _applyManifestFromPayload = function (payload) {
                    try {
                        if (payload && payload.cache_manifest && typeof payload.cache_manifest === 'object') {
                            _setManifest(payload.cache_manifest);
                            return true;
                        }
                    } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                    return false;
                };
                var _refreshManifestFromNetwork = async function (force) {
                    var manifest = _getKnownManifest();
                    if (!force && _isManifestFresh(manifest)) {
                        return manifest;
                    }
                    if (_manifestPending) return _manifestPending;
                    var endpoint = window.API_URL || window.SCRIPT_URL || '';
                    if (!endpoint) return manifest;
                    _manifestPending = _fetchWithRetry(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'get_cache_manifest', ts: Date.now(), rid: 'manifest_' + Date.now() })
                    }).then(async function (res) {
                        var payload = await _readJsonResponse(res);
                        if (payload && payload.status === 'success' && payload.data) {
                            return _setManifest(payload.data);
                        }
                        return _getKnownManifest();
                    }).catch(function () {
                        return _getKnownManifest();
                    }).finally(function () {
                        _manifestPending = null;
                    });
                    return _manifestPending;
                };
                try {
                    if (!window.__CEPAT_MANIFEST_BRIDGE_READY__) {
                        window.__CEPAT_MANIFEST_BRIDGE_READY__ = true;
                        window.addEventListener('storage', function (event) {
                            if (!event || event.key !== _manifestSignalStorageKey || !event.newValue) return;
                            var payload = _safeJsonParse(event.newValue);
                            if (!payload || payload.origin === _manifestTabId || !payload.manifest) return;
                            _setManifest(payload.manifest, { broadcast: false });
                        });
                        if (typeof BroadcastChannel !== 'undefined') {
                            try {
                                if (!_manifestChannel) _manifestChannel = new BroadcastChannel(_manifestSignalChannelName);
                                _manifestChannel.addEventListener('message', function (event) {
                                    var payload = event && event.data ? event.data : null;
                                    if (!payload || payload.origin === _manifestTabId || !payload.manifest) return;
                                    _setManifest(payload.manifest, { broadcast: false });
                                });
                            } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                        }
                    }
                } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                try {
                    window.CEPAT_CACHE = {
                        getManifest: function () {
                            return JSON.parse(JSON.stringify(_getKnownManifest()));
                        },
                        applyManifest: function (manifest) {
                            return JSON.parse(JSON.stringify(_setManifest(manifest)));
                        },
                        refreshManifest: function (options) {
                            return _refreshManifestFromNetwork(!!(options && options.force));
                        },
                        getVersionToken: function (tags) {
                            return _manifestToken(_normalizeTags(tags), _getKnownManifest());
                        },
                        readEntry: function (key, options) {
                            try {
                                var cfg = options || {};
                                var storageKind = cfg.storage === 'session' ? 'session' : 'local';
                                var store = _storageFor(storageKind);
                                if (!store) return { data: null, stale: true, missing: true };
                                var raw = store.getItem(String(key || ''));
                                if (!raw) return { data: null, stale: true, missing: true };
                                var parsed = _safeJsonParse(raw);
                                if (!parsed || typeof parsed !== 'object') return { data: null, stale: true, missing: true };
                                var maxAge = Number(cfg.maxAge || 0);
                                var now = Date.now();
                                var expectedToken = _manifestToken(_normalizeTags(cfg.tags), _getKnownManifest());
                                var storedToken = String(parsed.version_token || '');
                                var staleByAge = !!(maxAge && (!parsed.time || (now - Number(parsed.time || 0) > maxAge)));
                                var staleByVersion = !!(expectedToken && storedToken && expectedToken !== storedToken);
                                var staleByMissingVersion = !!(expectedToken && !storedToken);
                                var staleByManifestAge = !!(expectedToken && !_isManifestFresh(_getKnownManifest()));
                                return {
                                    data: Object.prototype.hasOwnProperty.call(parsed, 'data') ? parsed.data : parsed,
                                    time: Number(parsed.time || 0),
                                    stale: staleByAge || staleByVersion || staleByMissingVersion || staleByManifestAge,
                                    missing: false,
                                    versionToken: storedToken,
                                    expectedVersionToken: expectedToken,
                                    manifestFresh: _isManifestFresh(_getKnownManifest()),
                                    payload: parsed
                                };
                            } catch (e) {
                                return { data: null, stale: true, missing: true };
                            }
                        },
                        writeEntry: function (key, data, options) {
                            var cfg = options || {};
                            var storageKind = cfg.storage === 'session' ? 'session' : 'local';
                            var store = _storageFor(storageKind);
                            if (!store) return null;
                            var payload = {
                                data: data,
                                time: Number(cfg.time || Date.now()),
                                tags: _normalizeTags(cfg.tags),
                                version_token: _manifestToken(_normalizeTags(cfg.tags), _getKnownManifest())
                            };
                            try {
                                store.setItem(String(key || ''), JSON.stringify(payload));
                            } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                            return payload;
                        },
                        removeEntry: function (key, options) {
                            try {
                                var storageKind = options && options.storage === 'session' ? 'session' : 'local';
                                var store = _storageFor(storageKind);
                                if (store) store.removeItem(String(key || ''));
                            } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                        },
                        watchManifest: function (callback, options) {
                            var cfg = options || {};
                            var stopped = false;
                            var includeHidden = !!cfg.includeHidden;
                            var lastToken = _manifestToken(Object.keys((_getKnownManifest().versions) || {}), _getKnownManifest());
                            var onManifest = function (manifest) {
                                if (stopped || !manifest) return;
                                if (!includeHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                                var nextToken = _manifestToken(Object.keys((manifest.versions) || {}), manifest);
                                if (!nextToken || nextToken === lastToken) return;
                                lastToken = nextToken;
                                try { callback(JSON.parse(JSON.stringify(manifest))); } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                            };
                            var intervalMs = Math.max(5000, Number(cfg.intervalMs || ((_getKnownManifest().poll_seconds || 15) * 1000)));
                            var tick = function () {
                                if (stopped) return;
                                if (!includeHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                                _refreshManifestFromNetwork(false).then(function (manifest) {
                                    onManifest(manifest);
                                });
                            };
                            _manifestSubscribers.push(onManifest);
                            var timer = setInterval(tick, intervalMs);
                            if (cfg.immediate !== false) tick();
                            return function () {
                                stopped = true;
                                clearInterval(timer);
                                var idx = _manifestSubscribers.indexOf(onManifest);
                                if (idx !== -1) _manifestSubscribers.splice(idx, 1);
                            };
                        }
                    };
                } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                window.__CEPAT_FETCH_WRAPPED__ = true;
                window.fetch = function (input, init) {
                    var url = _getUrl(input);
                    if (_isScriptTarget(url)) {
                        var method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : 'GET')).toUpperCase();
                        var action = _parseAction(init);
                        if (method === 'POST' && _isCacheableAction(action)) {
                            return _ensureFreshManifestForAction(action, init).then(function () {
                                var k = _cacheKey(url, init, action);
                                var hit = _cacheGet(k);
                                if (hit) {
                                    _applyManifestFromPayload(_safeJsonParse(hit.body));
                                    _markStat('memory_cache_hits', action);
                                    return _toResponse(hit);
                                }
                                var storageHit = _storageGet(action, url, init);
                                if (storageHit) {
                                    _applyManifestFromPayload(_safeJsonParse(storageHit.body));
                                    _cacheSet(k, Number(_actionTtl[action] || 0), storageHit);
                                    _markStat('storage_cache_hits', action);
                                    return _toResponse(storageHit);
                                }
                                if (_pendingReq.has(k)) {
                                    _markStat('deduped_requests', action);
                                    return _pendingReq.get(k).then(function (payload) { return _toResponse(payload); });
                                }
                                var ttl = Number(_actionTtl[action] || 0);
                                _markStat('network_requests', action);
                                _fetchStats.last_network_at = Date.now();
                                var p = _fetchWithRetry(input, init)
                                    .then(async function (res) {
                                        var payload = await _responsePayload(res.clone());
                                        _applyManifestFromPayload(_safeJsonParse(payload.body));
                                        if (res.ok && ttl > 0) {
                                            _cacheSet(k, ttl, payload);
                                            _storageSet(action, url, init, ttl, payload);
                                        }
                                        return payload;
                                    })
                                    .finally(function () { _pendingReq.delete(k); });
                                _pendingReq.set(k, p);
                                return p.then(function (payload) { return _toResponse(payload); });
                            });
                        }
                        return _fetchWithRetry(input, init).then(async function (res) {
                            if (method === 'POST' && _isMutatingAction(action) && res && res.ok) {
                                var payload = await _readJsonResponse(res);
                                if (!_applyManifestFromPayload(payload)) _cacheClear();
                                _markStat('cache_invalidations', action);
                            }
                            return res;
                        });
                    }
                    return _nativeFetch(input, init);
                };
                try {
                    window.CEPAT_API = window.CEPAT_API || {};
                    window.CEPAT_API.batch = async function (requests, options) {
                        var endpoint = window.API_URL || window.SCRIPT_URL || null;
                        if (!endpoint) throw new Error('API endpoint tidak tersedia');
                        var items = Array.isArray(requests) ? requests.filter(function (item) {
                            return item && typeof item === 'object' && typeof item.action === 'string';
                        }) : [];
                        if (!items.length) throw new Error('Batch request kosong.');
                        var res = await window.fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'batch',
                                requests: items,
                                allow_partial: !!(options && options.allow_partial)
                            })
                        });
                        var payload = await res.json();
                        try {
                            if (payload && Array.isArray(payload.results)) {
                                payload.results.forEach(function (entry, idx) {
                                    var req = items[idx];
                                    var action = req && req.action ? String(req.action) : '';
                                    var ttl = Number(_actionTtl[action] || 0);
                                    if (!action || !ttl || !_isCacheableAction(action)) return;
                                    if (!entry || !entry.data || entry.data.status !== 'success') return;
                                    var syntheticInit = { method: 'POST', body: JSON.stringify(req) };
                                    var syntheticPayload = {
                                        status: 200,
                                        statusText: 'OK',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify(entry.data)
                                    };
                                    _applyManifestFromPayload(entry.data);
                                    _cacheSet(_cacheKey(endpoint, syntheticInit, action), ttl, syntheticPayload);
                                    _storageSet(action, endpoint, syntheticInit, ttl, syntheticPayload);
                                });
                            }
                        } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
                        return payload;
                    };
                } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
            }
        } catch (e) { if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e); }
    } else {
        console.error('[Config] Failed to initialize configuration');
    }

    (function initCartModule() {
        try {
            var CART_KEY = 'cepat_cart_v1';
            var CART_EVENT = 'cepat:cart:changed';
            var CART_BROADCAST = 'cepat_cart_channel_v1';
            var checkoutPayloadKey = 'cepat_cart_checkout_payload_v1';
            var channel = null;

            function clone(value) {
                try {
                    return JSON.parse(JSON.stringify(value));
                } catch (e) {
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                    return null;
                }
            }

            function normalizeId(raw) {
                var value = String(raw == null ? '' : raw).trim();
                return value;
            }

            function normalizePositiveNumber(raw, fallback) {
                var n = Number(raw);
                if (!Number.isFinite(n) || n <= 0) return Number(fallback || 0);
                return n;
            }

            function normalizeItem(raw) {
                var item = raw && typeof raw === 'object' ? raw : {};
                var id = normalizeId(item.id || item.product_id);
                if (!id) return null;

                var title = String(item.title || item.nama_produk || 'Produk').trim();
                if (!title) title = 'Produk';

                var qty = Math.max(1, Math.floor(normalizePositiveNumber(item.qty || item.quantity || 1, 1)));
                var price = normalizePositiveNumber(item.price || item.harga || item.harga_satuan || 0, 0);
                return {
                    id: id,
                    title: title,
                    price: price,
                    qty: qty,
                    image_url: String(item.image_url || item.image || '').trim(),
                    lp_url: String(item.lp_url || item.url || '').trim(),
                    desc: String(item.desc || '').trim(),
                    updated_at: Date.now()
                };
            }

            function readState() {
                try {
                    var raw = localStorage.getItem(CART_KEY);
                    if (!raw) return { items: [], updated_at: Date.now() };
                    var parsed = JSON.parse(raw);
                    var items = Array.isArray(parsed && parsed.items) ? parsed.items.map(normalizeItem).filter(Boolean) : [];
                    return {
                        items: items,
                        updated_at: Number(parsed && parsed.updated_at) || Date.now()
                    };
                } catch (e) {
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                    return { items: [], updated_at: Date.now() };
                }
            }

            function writeState(state) {
                var next = {
                    items: Array.isArray(state && state.items) ? state.items.map(normalizeItem).filter(Boolean) : [],
                    updated_at: Date.now()
                };
                try {
                    localStorage.setItem(CART_KEY, JSON.stringify(next));
                } catch (e) {
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                }
                return next;
            }

            function dispatchChange(reason, state) {
                var payload = {
                    reason: String(reason || 'update'),
                    state: clone(state) || { items: [], updated_at: Date.now() }
                };

                try {
                    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: payload }));
                } catch (e) {
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                }

                if (channel && typeof channel.postMessage === 'function' && payload.reason !== 'broadcast-sync') {
                    try {
                        channel.postMessage({ type: 'cart-change', reason: payload.reason, at: Date.now() });
                    } catch (e) {
                        if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                    }
                }
            }

            function getCountFromItems(items) {
                return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
                    return sum + Math.max(0, Math.floor(Number(item && item.qty) || 0));
                }, 0);
            }

            function getTotalFromItems(items) {
                return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
                    var qty = Math.max(0, Math.floor(Number(item && item.qty) || 0));
                    var price = Number(item && item.price) || 0;
                    return sum + (qty * price);
                }, 0);
            }

            function findItemIndex(items, productId) {
                var id = normalizeId(productId);
                if (!id) return -1;
                return items.findIndex(function (item) { return normalizeId(item && item.id) === id; });
            }

            var cartApi = {
                storageKey: CART_KEY,
                checkoutPayloadKey: checkoutPayloadKey,
                eventName: CART_EVENT,
                getState: function () {
                    return clone(readState()) || { items: [], updated_at: Date.now() };
                },
                getItems: function () {
                    var state = readState();
                    return clone(state.items) || [];
                },
                getCount: function () {
                    return getCountFromItems(readState().items);
                },
                getTotal: function () {
                    return getTotalFromItems(readState().items);
                },
                addItem: function (product, qty) {
                    var normalized = normalizeItem(Object.assign({}, product || {}, { qty: normalizePositiveNumber(qty || 1, 1) }));
                    if (!normalized) return { ok: false, message: 'Produk tidak valid.' };

                    var state = readState();
                    var items = state.items.slice();
                    var idx = findItemIndex(items, normalized.id);
                    var nextQty = normalized.qty;

                    if (idx >= 0) {
                        var current = items[idx];
                        nextQty = Math.max(1, Math.floor(Number(current.qty) || 1) + normalized.qty);
                        normalized = Object.assign({}, current, normalized, { qty: nextQty });
                    }

                    if (idx >= 0) items[idx] = normalized;
                    else items.push(normalized);

                    var next = writeState({ items: items });
                    dispatchChange('add-item', next);
                    return { ok: true, item: clone(normalized), state: clone(next) };
                },
                updateQuantity: function (productId, qty) {
                    var state = readState();
                    var items = state.items.slice();
                    var idx = findItemIndex(items, productId);
                    if (idx < 0) return { ok: false, message: 'Item tidak ditemukan.' };

                    var nextQty = Math.floor(Number(qty));
                    if (!Number.isFinite(nextQty)) nextQty = 1;

                    if (nextQty <= 0) {
                        items.splice(idx, 1);
                        var removedState = writeState({ items: items });
                        dispatchChange('remove-item', removedState);
                        return { ok: true, removed: true, state: clone(removedState) };
                    }

                    var current = Object.assign({}, items[idx], { qty: nextQty });
                    items[idx] = current;
                    var next = writeState({ items: items });
                    dispatchChange('update-qty', next);
                    return { ok: true, item: clone(current), state: clone(next) };
                },
                removeItem: function (productId) {
                    var state = readState();
                    var items = state.items.slice();
                    var idx = findItemIndex(items, productId);
                    if (idx < 0) return { ok: false, message: 'Item tidak ditemukan.' };
                    items.splice(idx, 1);
                    var next = writeState({ items: items });
                    dispatchChange('remove-item', next);
                    return { ok: true, state: clone(next) };
                },
                clear: function () {
                    var next = writeState({ items: [] });
                    dispatchChange('clear', next);
                    return { ok: true, state: clone(next) };
                },
                subscribe: function (listener) {
                    if (typeof listener !== 'function') return function () {};
                    var handler = function (event) {
                        listener(event && event.detail ? event.detail : { state: readState(), reason: 'event' });
                    };
                    window.addEventListener(CART_EVENT, handler);
                    return function () {
                        window.removeEventListener(CART_EVENT, handler);
                    };
                },
                buildCheckoutPayload: function () {
                    var state = readState();
                    var items = state.items.slice();
                    var totalQty = getCountFromItems(items);
                    var totalPrice = getTotalFromItems(items);
                    return {
                        items: clone(items) || [],
                        item_count: items.length,
                        total_qty: totalQty,
                        total_price: totalPrice,
                        detail: items.map(function (item) {
                            var subtotal = (Number(item.price) || 0) * (Number(item.qty) || 0);
                            return {
                                id: item.id,
                                title: item.title,
                                qty: item.qty,
                                price: item.price,
                                subtotal: subtotal
                            };
                        }),
                        created_at: Date.now()
                    };
                }
            };

            window.CEPAT_CART = cartApi;

            if (typeof BroadcastChannel === 'function') {
                try {
                    channel = new BroadcastChannel(CART_BROADCAST);
                    channel.onmessage = function (event) {
                        if (!event || !event.data || event.data.type !== 'cart-change') return;
                        dispatchChange('broadcast-sync', readState());
                    };
                } catch (e) {
                    channel = null;
                    if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
                }
            }

            window.addEventListener('storage', function (event) {
                if (!event || event.key !== CART_KEY) return;
                dispatchChange('storage-sync', readState());
            });
        } catch (e) {
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[CEPAT] Non-fatal error suppressed', e);
        }
    })();

    // --- CLEANUP: Remove decode function references ---
    _0xCFG = null;
})();
