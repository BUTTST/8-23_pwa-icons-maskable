// 字幕稿助手 - 主要應用邏輯
class SubtitleHelper {
  constructor() {
    this.db = null;
    this.init();
  }

  // 初始化應用
  async init() {
    await this.initDB();
    this.initUI();
    this.registerServiceWorker();
    this.handleInstallPrompt();
    this.handleSharedContent();
    this.loadLinks();
  }

  // 初始化 IndexedDB
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SubtitleHelperDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 創建連結存儲
        if (!db.objectStoreNames.contains('links')) {
          const linkStore = db.createObjectStore('links', { keyPath: 'id', autoIncrement: true });
          linkStore.createIndex('url', 'url', { unique: true });
          linkStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // 初始化UI事件
  initUI() {
    const addLinkBtn = document.getElementById('add-link-btn');
    const addBtn = document.getElementById('add-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const urlInput = document.getElementById('url-input');
    const manualAdd = document.getElementById('manual-add');

    addLinkBtn.addEventListener('click', () => {
      manualAdd.style.display = manualAdd.style.display === 'none' ? 'block' : 'none';
      if (manualAdd.style.display !== 'none') {
        urlInput.focus();
      }
    });

    cancelBtn.addEventListener('click', () => {
      manualAdd.style.display = 'none';
      urlInput.value = '';
      this.setAddStatus('');
    });

    addBtn.addEventListener('click', () => this.addLink());
    
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addLink();
      }
    });
  }

  // 註冊 Service Worker
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        console.log('Service Worker 註冊成功:', registration);
      } catch (error) {
        console.error('Service Worker 註冊失敗:', error);
      }
    }
  }

  // 處理安裝提示
  handleInstallPrompt() {
    const installBtn = document.getElementById('install-btn');
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('安裝結果:', outcome);
        deferredPrompt = null;
        installBtn.style.display = 'none';
      }
    });
  }

  // 處理分享內容 (Web Share Target API)
  handleSharedContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedUrl = urlParams.get('url') || urlParams.get('text');
    
    if (sharedUrl) {
      const extractedUrl = this.extractUrlFromText(sharedUrl);
      if (extractedUrl) {
        this.addLink(extractedUrl, true);
        // 清除URL參數
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  // 從文本中提取URL
  extractUrlFromText(text) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  }

  // 添加連結
  async addLink(url = null, fromShare = false) {
    const urlInput = document.getElementById('url-input');
    const targetUrl = url || urlInput.value.trim();
    
    if (!targetUrl) {
      this.setAddStatus('請輸入連結');
      return;
    }

    if (!this.isValidUrl(targetUrl)) {
      this.setAddStatus('請輸入有效的連結');
      return;
    }

    this.setAddStatus('正在處理...');

    try {
      const linkData = {
        url: targetUrl,
        title: '',
        thumbnail: '',
        provider: this.detectProvider(targetUrl),
        timestamp: Date.now()
      };

      // 嘗試獲取元資料
      try {
        const metadata = await this.fetchMetadata(targetUrl);
        linkData.title = metadata.title || targetUrl;
        linkData.thumbnail = metadata.thumbnail || this.generateThumbnail(targetUrl, linkData.provider);
      } catch (error) {
        console.warn('無法獲取元資料:', error);
        linkData.title = targetUrl;
        linkData.thumbnail = this.generateThumbnail(targetUrl, linkData.provider);
      }

      await this.saveLink(linkData);
      
      if (!fromShare) {
        urlInput.value = '';
        document.getElementById('manual-add').style.display = 'none';
      }
      
      this.setAddStatus(fromShare ? '已從分享添加連結！' : '連結已添加！');
      setTimeout(() => this.setAddStatus(''), 3000);
      
      this.loadLinks();
    } catch (error) {
      this.setAddStatus('添加失敗: ' + error.message);
    }
  }

  // 驗證URL
  isValidUrl(string) {
    try {
      const url = new URL(string);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  // 檢測提供者
  detectProvider(url) {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.replace(/^www\./, '');
      
      if (/(youtube\.com|youtu\.be)$/i.test(host)) return 'youtube';
      if (/tiktok\.com$/i.test(host)) return 'tiktok';
      if (/douyin\.com$/i.test(host)) return 'douyin';
      if (/bilibili\.com$/i.test(host)) return 'bilibili';
      
      return 'other';
    } catch {
      return 'other';
    }
  }

  // 獲取元資料
  async fetchMetadata(url) {
    // 由於CORS限制，這裡使用簡單的方法生成縮圖和標題
    const provider = this.detectProvider(url);
    let title = url;
    let thumbnail = '';

    if (provider === 'youtube') {
      const videoId = this.extractYouTubeId(url);
      if (videoId) {
        title = `YouTube 影片 - ${videoId}`;
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
    } else if (provider === 'tiktok') {
      title = 'TikTok 影片';
    } else if (provider === 'douyin') {
      title = '抖音影片';
    }

    return { title, thumbnail };
  }

  // 提取YouTube影片ID
  extractYouTubeId(url) {
    try {
      const urlObj = new URL(url);
      
      if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.slice(1);
      }
      
      if (urlObj.hostname.includes('youtube.com')) {
        if (urlObj.pathname.startsWith('/shorts/')) {
          return urlObj.pathname.split('/')[2];
        }
        return urlObj.searchParams.get('v');
      }
      
      return null;
    } catch {
      return null;
    }
  }

  // 生成縮圖
  generateThumbnail(url, provider) {
    if (provider === 'youtube') {
      const videoId = this.extractYouTubeId(url);
      if (videoId) {
        return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
    }
    
    // 默認縮圖
    return `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12" width="160" height="80">
        <rect width="100%" height="100%" fill="#e5e7eb"/>
        <text x="12" y="7" text-anchor="middle" fill="#6b7280" font-size="3">${provider.toUpperCase()}</text>
      </svg>
    `)}`;
  }

  // 保存連結到 IndexedDB
  async saveLink(linkData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['links'], 'readwrite');
      const store = transaction.objectStore('links');
      
      // 檢查是否已存在相同URL
      const urlIndex = store.index('url');
      const checkRequest = urlIndex.get(linkData.url);
      
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          reject(new Error('此連結已存在'));
          return;
        }
        
        const addRequest = store.add(linkData);
        addRequest.onsuccess = () => resolve(addRequest.result);
        addRequest.onerror = () => reject(addRequest.error);
      };
      
      checkRequest.onerror = () => reject(checkRequest.error);
    });
  }

  // 載入所有連結
  async loadLinks() {
    try {
      const links = await this.getAllLinks();
      this.renderLinks(links);
      this.updateStatus(links.length);
    } catch (error) {
      console.error('載入連結失敗:', error);
    }
  }

  // 獲取所有連結
  async getAllLinks() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['links'], 'readonly');
      const store = transaction.objectStore('links');
      const index = store.index('timestamp');
      const request = index.getAll();
      
      request.onsuccess = () => {
        // 按時間戳降序排列（最新的在前）
        const links = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(links);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // 渲染連結列表
  renderLinks(links) {
    const linksContainer = document.getElementById('links');
    const emptyState = document.getElementById('empty-state');
    
    linksContainer.innerHTML = '';
    
    if (links.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    
    links.forEach(link => {
      const linkElement = this.createLinkElement(link);
      linksContainer.appendChild(linkElement);
    });
  }

  // 創建連結元素
  createLinkElement(link) {
    const template = document.getElementById('link-template');
    const element = template.content.cloneNode(true);
    
    const card = element.querySelector('.link-card');
    const img = element.querySelector('.thumb-img');
    const title = element.querySelector('.link-title');
    const url = element.querySelector('.link-url');
    const time = element.querySelector('.link-time');
    const viewBtn = element.querySelector('.view-btn');
    const deleteBtn = element.querySelector('.delete-btn');
    
    img.src = link.thumbnail;
    img.onerror = () => {
      img.src = this.generateThumbnail(link.url, link.provider);
    };
    
    title.textContent = link.title;
    title.href = link.url;
    url.textContent = link.url;
    time.textContent = this.formatTime(link.timestamp);
    
    viewBtn.addEventListener('click', () => {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    });
    
    deleteBtn.addEventListener('click', () => {
      if (confirm('確定要刪除這個連結嗎？')) {
        this.deleteLink(link.id);
      }
    });
    
    return element;
  }

  // 刪除連結
  async deleteLink(id) {
    try {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['links'], 'readwrite');
        const store = transaction.objectStore('links');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      this.loadLinks();
    } catch (error) {
      console.error('刪除連結失敗:', error);
      alert('刪除失敗，請重試');
    }
  }

  // 格式化時間
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分鐘內
      return '剛剛';
    } else if (diff < 3600000) { // 1小時內
      return `${Math.floor(diff / 60000)} 分鐘前`;
    } else if (diff < 86400000) { // 1天內
      return `${Math.floor(diff / 3600000)} 小時前`;
    } else {
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  // 更新狀態
  updateStatus(count) {
    const countElement = document.getElementById('count');
    countElement.textContent = count;
  }

  // 設置添加狀態
  setAddStatus(message) {
    const statusElement = document.getElementById('add-status');
    statusElement.textContent = message;
  }
}

// 當頁面載入完成時初始化應用
document.addEventListener('DOMContentLoaded', () => {
  new SubtitleHelper();
});
