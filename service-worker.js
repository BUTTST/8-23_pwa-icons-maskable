const CACHE_NAME = 'subtitle-helper-v5';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/字幕稿-擷取工具_icon-48-maskable.png',
  './icons/字幕稿-擷取工具_icon-72-maskable.png',
  './icons/字幕稿-擷取工具_icon-96-maskable.png',
  './icons/字幕稿-擷取工具_icon-144-maskable.png',
  './icons/字幕稿-擷取工具_icon-192-maskable.png',
  './icons/字幕稿-擷取工具_icon-512-maskable.png'
];

// 安裝事件 - 緩存資源
self.addEventListener('install', (event) => {
  console.log('Service Worker 安裝中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('緩存已打開');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('所有資源已緩存');
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理舊緩存
self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('刪除舊緩存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 已激活');
      return self.clients.claim();
    })
  );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
  // 處理 Web Share Target API 請求
  if (event.request.method === 'POST' && event.request.url.includes('share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // 一般請求使用緩存優先策略
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果在緩存中找到，直接返回
        if (response) {
          return response;
        }

        // 否則從網路獲取
        return fetch(event.request).then((response) => {
          // 檢查是否為有效響應
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 複製響應
          const responseToCache = response.clone();

          // 添加到緩存
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // 如果是導航請求且離線，返回主頁面
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

// 處理 Web Share Target API
async function handleShareTarget(request) {
  console.log('處理分享目標請求');
  
  try {
    const formData = await request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';

    // 構建重定向URL，將分享的內容作為查詢參數
    const params = new URLSearchParams();
    if (url) params.append('url', url);
    else if (text) params.append('text', text);
    if (title) params.append('title', title);

    const redirectUrl = `./?${params.toString()}`;
    
    console.log('重定向到:', redirectUrl);

    // 返回重定向響應
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error('處理分享目標時出錯:', error);
    return Response.redirect('./', 302);
  }
}

// 監聽來自主線程的消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 處理推送通知（未來可能用到）
self.addEventListener('push', (event) => {
  console.log('收到推送消息:', event);
  
  const options = {
    body: event.data ? event.data.text() : '您有新的內容可以查看',
    icon: '/icons/字幕稿-擷取工具_icon-192-maskable.png',
    badge: '/icons/字幕稿-擷取工具_icon-96-maskable.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: '查看',
        icon: '/icons/字幕稿-擷取工具_icon-48-maskable.png'
      },
      {
        action: 'close',
        title: '關閉',
        icon: '/icons/字幕稿-擷取工具_icon-48-maskable.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('字幕稿助手', options)
  );
});

// 處理通知點擊
self.addEventListener('notificationclick', (event) => {
  console.log('通知被點擊:', event);
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});