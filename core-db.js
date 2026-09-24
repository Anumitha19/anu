// IndexedDB wrapper + settings. Every mini-app stores its data through this module.
// To give a new mini-app its own storage, add a store to STORES and bump DB_VERSION.
const DB_NAME = 'anu-db';
const DB_VERSION = 1;

export const STORES = {
  kaasuTx:    { keyPath: 'id',    indexes: [['date', 'date']] },
  kaasuNotes: { keyPath: 'month' },
  journal:    { keyPath: 'id',    indexes: [['createdAt', 'createdAt']] },
  dumplings:  { keyPath: 'date' },
  areas:      { keyPath: 'id' },
  goals:      { keyPath: 'id',    indexes: [['areaId', 'areaId']] },
  habits:     { keyPath: 'id' },
  habitLogs:  { keyPath: 'id',    indexes: [['date', 'date'], ['habitId', 'habitId']] },
  settings:   { keyPath: 'key' }
};

let dbPromise;
export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const [name, cfg] of Object.entries(STORES)) {
          if (!d.objectStoreNames.contains(name)) {
            const s = d.createObjectStore(name, { keyPath: cfg.keyPath });
            (cfg.indexes || []).forEach(([n, p]) => s.createIndex(n, p));
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database is blocked by another ANU tab.'));
    });
  }
  return dbPromise;
}

// Run a request inside one transaction; resolve when the transaction commits.
async function run(names, mode, fn) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(names, mode);
    let result;
    try { result = fn(t); } catch (e) { try { t.abort(); } catch {} reject(e); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

export const db = {
  all: (n) => run(n, 'readonly', (t) => t.objectStore(n).getAll()),
  get: (n, k) => run(n, 'readonly', (t) => t.objectStore(n).get(k)),
  put: async (n, v) => { await run(n, 'readwrite', (t) => t.objectStore(n).put(v)); return v; },
  del: (n, k) => run(n, 'readwrite', (t) => { t.objectStore(n).delete(k); }),
  clear: (n) => run(n, 'readwrite', (t) => { t.objectStore(n).clear(); }),
  range: (n, index, lo, hi) => run(n, 'readonly', (t) => t.objectStore(n).index(index).getAll(IDBKeyRange.bound(lo, hi))),
  byIndex: (n, index, val) => run(n, 'readonly', (t) => t.objectStore(n).index(index).getAll(IDBKeyRange.only(val))),
  // delete several keys in one go
  delMany: (n, keys) => run(n, 'readwrite', (t) => { const s = t.objectStore(n); keys.forEach((k) => s.delete(k)); }),
  putMany: (n, vals) => run(n, 'readwrite', (t) => { const s = t.objectStore(n); vals.forEach((v) => s.put(v)); }),
  // one atomic transaction over many stores (used by restore)
  batch: (names, fn) => run(names, 'readwrite', (t) => { fn((n) => t.objectStore(n)); })
};

// Small settings store, cached in memory so it can be read synchronously.
export const settings = {
  cache: {},
  async load() {
    const rows = await db.all('settings');
    this.cache = {};
    rows.forEach((r) => { this.cache[r.key] = r.value; });
  },
  get(key, fallback) { return key in this.cache ? this.cache[key] : fallback; },
  async set(key, value) { this.cache[key] = value; await db.put('settings', { key, value }); },
  async remove(key) { delete this.cache[key]; await db.del('settings', key); }
};

export async function askPersistentStorage() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
