/**
 * 本地数据库层 - IndexedDB 封装
 * 替代 SQLite，实现完全离线的数据存储
 */
const DB = (() => {
  const DB_NAME = 'feipin_db';
  const DB_VERSION = 1;
  let dbInstance = null;

  const STORES = {
    categories: { keyPath: 'id', indexes: ['parent_id', 'sort_order'] },
    prices: { keyPath: 'id', indexes: ['category_id', 'source', 'recorded_at', 'region_code'] },
    crawler_configs: { keyPath: 'id', indexes: ['enabled'] },
    crawl_logs: { keyPath: 'id', indexes: ['crawled_at', 'website_name'] },
    ledger: { keyPath: 'id', indexes: ['type', 'category_id', 'recorded_at'] },
    alerts: { keyPath: 'id', indexes: ['is_active', 'category_id'] },
    regions: { keyPath: 'id', indexes: ['parent_id', 'level'] },
    favorites: { keyPath: 'id' },
    settings: { keyPath: 'key' },
  };

  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: config.keyPath });
            (config.indexes || []).forEach(idx => {
              store.createIndex(idx, idx, { unique: false });
            });
          }
        }
      };
    });
  }

  function getDB() {
    if (!dbInstance) throw new Error('DB not initialized. Call DB.init() first.');
    return dbInstance;
  }

  // 通用：批量写入
  function bulkPut(storeName, items) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve(items.length);
      tx.onerror = () => reject(tx.error);
    });
  }

  // 通用：获取全部
  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // 通用：按主键获取
  function get(storeName, key) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // 通用：写入单条
  function put(storeName, item) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }

  // 通用：删除
  function deleteItem(storeName, key) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // 通用：按索引查询
  function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // 清空某个 store
  function clear(storeName) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // 获取某品类最新价格
  async function getLatestPrice(categoryId, regionCode = 'default') {
    const all = await getByIndex('prices', 'category_id', categoryId);
    const filtered = all.filter(p => p.region_code === regionCode);
    if (filtered.length === 0) return null;
    filtered.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    return filtered[0];
  }

  // 获取某品类历史价格
  async function getPriceHistory(categoryId, days = 30, regionCode = 'default') {
    const all = await getByIndex('prices', 'category_id', categoryId);
    const filtered = all.filter(p => p.region_code === regionCode);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return filtered
      .filter(p => new Date(p.recorded_at) >= cutoff)
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  }

  // 设置项
  async function getSetting(key, defaultValue = null) {
    const result = await get('settings', key);
    return result ? result.value : defaultValue;
  }

  async function setSetting(key, value) {
    return put('settings', { key, value });
  }

  return {
    init, bulkPut, getAll, get, put, deleteItem, getByIndex, clear,
    getLatestPrice, getPriceHistory, getSetting, setSetting,
    STORES
  };
})();
