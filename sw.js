/**
 * Service Worker - 离线缓存
 * 缓存所有静态资源，断网时仍可使用
 */
const CACHE_NAME = 'feipin-v1.0.2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/seed-data.js',
  './js/crawler.js',
  './js/charts.js',
  './js/export.js',
  './js/app.js',
  './manifest.json',
  './data/crawler-rules.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 预缓存资源');
        return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { mode: 'no-cors' })));
      })
      .catch(err => console.warn('[SW] 预缓存部分失败:', err))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先，网络后备
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 爬虫请求不走缓存（需要实时数据）
  const url = new URL(event.request.url);
  const isCrawlerRequest = url.hostname.includes('allorigins.win') ||
                           url.hostname.includes('corsproxy.io') ||
                           url.hostname.includes('codetabs.com') ||
                           url.hostname.includes('feipinzhijia.com') ||
                           url.hostname.includes('feijiu.com') ||
                           url.hostname.includes('91zaisheng.com');

  if (isCrawlerRequest) {
    // 爬虫请求：网络优先，不缓存
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // crawler-rules.json 走网络优先，确保总是获取最新规则文件
  if (url.pathname.endsWith('crawler-rules.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(c => c || new Response('{}', { status: 200 })))
    );
    return;
  }

  // 其他请求：缓存优先
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // 后台更新缓存
          fetch(event.request).then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
          }).catch(() => {});
          return cached;
        }

        // 缓存没有，走网络
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => {
            // 网络也失败，返回离线页面
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// 接收消息
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
