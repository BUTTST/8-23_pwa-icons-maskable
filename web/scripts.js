// 移除此重複定義
// const API_CONFIG = {
//     baseUrl: 'http://localhost:7860' // 開發環境，部署時修改
// };

// 直接使用全局的API_CONFIG變量

// DOM 元素 (移動到 init 函數中初始化)
let linkInput, fileInput, fileName, modelSelect, timestampCheckbox, transcribeButton,
    cookiesInput, outputText, performanceBox, totalTimeDisplay, wordCountDisplay,
    copyButton, txtButton, srtButton, vttButton, loadingOverlay, notification,
    uploadToggle, uploadContainer, historyContainer, clearAllHistoryButton, historyLimitSelect,
    cancelButton;

// 全局變數
let currentTranscription = '';
let hasTimestamps = false;
let abortController = null; // 用於取消轉譯請求

// IndexedDB constants
const DB_NAME = 'TranscriptionDB';
const DB_VERSION = 1;
const STORE_NAME = 'transcriptions';

// IndexedDB Service Module
const IndexedDBService = {
    async addTranscriptionRecord(record) {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getTranscriptionRecords(limit = 10) {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const records = [];
            const request = store.openCursor(null, 'prev'); // latest first
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && (limit === 0 || count < limit)) {
                    records.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(records);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    async deleteTranscriptionRecord(id) {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clearAllTranscriptionRecords() {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// Function to open IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject('Failed to open database');
        };
    });
}

// 轉譯主控制器
const TranscriptionController = {
    // 初始化函數
    init() {
        console.log('初始化轉譯控制器...');

        // 初始化 DOM 元素
        this.linkInput = document.getElementById('link-input');
        this.fileInput = document.getElementById('file-input');
        this.fileName = document.getElementById('file-name');
        this.modelSelect = document.getElementById('model-select');
        this.timestampCheckbox = document.getElementById('timestamp-checkbox');
        this.transcribeButton = document.getElementById('transcribe-button');
        this.cookiesInput = document.getElementById('cookies-input');
        this.outputText = document.getElementById('output-text');
        this.performanceBox = document.getElementById('performance-box');
        this.totalTimeDisplay = document.getElementById('total-time');
        this.wordCountDisplay = document.getElementById('word-count');
        this.copyButton = document.getElementById('copy-button');
        this.txtButton = document.getElementById('txt-button');
        this.srtButton = document.getElementById('srt-button');
        this.vttButton = document.getElementById('vtt-button');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.notification = document.getElementById('notification');
        this.uploadToggle = document.querySelector('.upload-toggle');
        this.uploadContainer = document.querySelector('.upload-container');
        this.historyContainer = document.getElementById('history-list');
        this.clearAllHistoryButton = document.getElementById('clear-all-history-btn');
        this.historyLimitSelect = document.getElementById('history-limit-select');
        this.cancelButton = document.getElementById('cancel-button');
        this.ccButton = document.getElementById('cc-button');

        // 檢查API配置
        const apiKey = localStorage.getItem('temp_api_key');
        console.log('API金鑰狀態:', apiKey ? '已設置' : '未設置');

        // 自動檢查API服務健康狀態
        this.checkApiHealth();

        // 載入歷史紀錄
        this.loadHistory();

        // 綁定界面事件
        this.bindUIEvents();

        // 處理快捷分享功能 - 檢查是否有分享的網址需要自動填寫
        this.handleSharedContent();

        // 初始化時禁用操作按鈕和取消按鈕
        this.disableActionButtons();
        this.cancelButton.disabled = true; // 確保初始禁用
    },
    
    // 處理快捷分享功能 - 自動填寫從分享獲得的網址
    handleSharedContent() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sharedUrl = urlParams.get('shared_url');
            const sharedTitle = urlParams.get('shared_title');
            
            if (sharedUrl) {
                console.log('檢測到快捷分享網址:', sharedUrl);
                
                // 清除地址欄中的查詢參數，避免重複處理
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // 將分享的網址自動填寫到輸入欄位
                this.linkInput.value = sharedUrl;
                
                // 為網址輸入框添加高亮效果，提示用戶已自動填寫
                this.linkInput.style.borderColor = '#22c55e'; // 綠色邊框
                this.linkInput.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.1)';
                
                // 顯示成功提示
                this.showNotification(
                    '已自動填寫分享的網址！您現在可以直接點擊「執行轉譯」或「抓取CC字幕」', 
                    'success',
                    5000 // 顯示5秒
                );
                
                // 3秒後移除高亮效果
                setTimeout(() => {
                    this.linkInput.style.borderColor = '';
                    this.linkInput.style.boxShadow = '';
                }, 3000);
                
                // 如果有標題資訊，也在控制台記錄
                if (sharedTitle && sharedTitle !== sharedUrl) {
                    console.log('分享標題:', sharedTitle);
                }
                
                // 滾動到輸入區域，確保用戶看到已填寫的內容
                this.linkInput.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // 聚焦到網址輸入框
                setTimeout(() => {
                    this.linkInput.focus();
                    this.linkInput.setSelectionRange(this.linkInput.value.length, this.linkInput.value.length);
                }, 500);
            }
        } catch (error) {
            console.error('處理快捷分享內容時發生錯誤:', error);
        }
    },
    
    // 檢查API健康狀態
    async checkApiHealth() {
        try {
            const status = await ApiService.checkHealth();
            if (status && status.ready) {
                console.log('✅ API服務正常運行');
                this.showNotification('API服務連接正常', 'success');
            } else {
                console.warn('⚠️ API服務可能不可用');
                this.showNotification('API服務可能不可用，請檢查設置', 'warning');
            }
        } catch (error) {
            console.error('API健康檢查失敗:', error);
            this.showNotification('無法連接到API服務', 'error');
        }
    },
    
    // 綁定UI事件
    bindUIEvents() {
        // 轉譯按鈕事件
        this.transcribeButton.addEventListener('click', async () => {
            this.startTranscription();
        });
        
        // 新增：取消按鈕事件
        this.cancelButton.addEventListener('click', () => this.cancelTranscription());

        // 新增：抓取 CC 字幕
        this.ccButton.addEventListener('click', async () => {
            try {
                this.transcribeButton.disabled = true;
                this.ccButton.disabled = true;
                this.outputText.value = '';
                this.loadingOverlay.style.display = 'flex';

                const input = await this.getInputLink();
                if (input.type !== 'link') {
                    throw new Error('請提供影片連結以抓取CC字幕');
                }

                const response = await fetch(ApiService.config.proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ApiService.config.apiKey}`
                    },
                    body: JSON.stringify({ action: 'fetch_captions', link: input.data })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API錯誤 (${response.status}): ${errorText}`);
                }

                const data = await response.json();
                const lang = data.language_code || 'unknown';
                const trackType = data.track_type || 'unknown';
                const text = data.text || '';
                this.outputText.value = `【CC字幕 - ${lang} / ${trackType}】\n\n${text}`;
                this.currentTranscription = this.outputText.value;
                this.hasTimestamps = false;
                this.enableActionButtons(true);

                await IndexedDBService.addTranscriptionRecord({
                    timestamp: new Date().toISOString(),
                    input: input.data,
                    model: 'CC',
                    timestampsEnabled: false,
                    transcription: this.outputText.value,
                    performance: { total_time: 0, word_count: (text || '').split(/\s+/).length }
                });
                this.loadHistory();
                this.showNotification('CC字幕抓取完成', 'success');
            } catch (e) {
                console.error('抓取CC字幕失敗', e);
                this.outputText.value = this.formatErrorMessage(e);
                this.enableActionButtons(false);
            } finally {
                this.loadingOverlay.style.display = 'none';
                this.transcribeButton.disabled = false;
                this.ccButton.disabled = false;
            }
        });

        // 更新文件名顯示事件
        this.fileInput.addEventListener('change', () => {
            if (this.fileInput.files.length > 0) {
                this.fileName.textContent = this.fileInput.files[0].name;
                this.linkInput.value = '';
            } else {
                this.fileName.textContent = '選擇檔案';
            }
        });

        // 切換上傳區域顯示/隱藏
        this.uploadToggle.addEventListener('click', () => {
            this.uploadContainer.classList.toggle('hidden');
            const icon = this.uploadToggle.querySelector('i');
            if (this.uploadContainer.classList.contains('hidden')) {
                icon.className = 'fas fa-chevron-down';
            } else {
                icon.className = 'fas fa-chevron-up';
            }
        });

        // 連結輸入處理 - 清空文件選擇
        this.linkInput.addEventListener('input', () => {
            if (this.linkInput.value.trim()) {
                this.fileInput.value = '';
                this.fileName.textContent = '選擇檔案';
            }
        });

        // 新增：一鍵清除歷史紀錄按鈕 (長按5秒，帶進度條)
        let clearHistoryTimer = null;
        let clearProgressInterval = null;
        const progressEl = this.clearAllHistoryButton.querySelector('.hold-progress');

        const resetProgress = () => {
            if (progressEl) progressEl.style.width = '0%';
            if (clearProgressInterval) clearInterval(clearProgressInterval);
            if (clearHistoryTimer) clearTimeout(clearHistoryTimer);
            clearProgressInterval = null;
            clearHistoryTimer = null;
        };

        this.clearAllHistoryButton.addEventListener('mousedown', () => {
            const holdMs = 5000;
            const start = Date.now();
            this.showNotification('長按以清除所有歷史紀錄...', 'info', holdMs);
            clearHistoryTimer = setTimeout(async () => {
                await IndexedDBService.clearAllTranscriptionRecords();
                this.loadHistory();
                this.showNotification('所有歷史紀錄已清除！', 'success');
                resetProgress();
            }, holdMs);

            clearProgressInterval = setInterval(() => {
                const elapsed = Date.now() - start;
                const percent = Math.min(100, (elapsed / holdMs) * 100);
                if (progressEl) progressEl.style.width = percent + '%';
                if (percent >= 100) {
                    clearInterval(clearProgressInterval);
                    clearProgressInterval = null;
                }
            }, 50);
        });
        ['mouseup','mouseleave'].forEach(evt => {
            this.clearAllHistoryButton.addEventListener(evt, () => {
                resetProgress();
            });
        });

        // 新增：歷史紀錄限制選擇器事件
        this.historyLimitSelect.addEventListener('change', () => this.loadHistory());

        // 複製按鈕點擊事件
        this.copyButton.addEventListener('click', () => {
            const textToCopy = (this.outputText && typeof this.outputText.value === 'string') ? this.outputText.value : '';
            if (textToCopy.trim().length > 0) {
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        this.showNotification('文本已複製到剪貼板！', 'success');
                    })
                    .catch(err => {
                        console.error('複製失敗:', err);
                        this.showNotification('複製到剪貼板失敗', 'error');
                    });
            } else {
                this.showNotification('輸出區目前沒有可複製的內容。', 'info');
            }
        });

        // 下載 TXT 格式
        this.txtButton.addEventListener('click', () => {
            this.downloadTranscription('txt');
        });

        // 下載 SRT 格式
        this.srtButton.addEventListener('click', () => {
            this.downloadTranscription('srt');
        });

        // 下載 VTT 格式
        this.vttButton.addEventListener('click', () => {
            this.downloadTranscription('vtt');
        });

        // 其他UI事件...
    },
    
    // 取消轉譯任務
    async cancelTranscription() {
        if (abortController) {
            // 觸發 AbortController 中止 Fetch 請求
            abortController.abort();
            console.log('本地 AbortController 已觸發中止。');

            // 如果已經有 job_id，則嘗試向 RunPod 發送取消請求
            if (this.currentJobId) {
                try {
                    await ApiService.cancelJob(this.currentJobId);
                    console.log(`RunPod 任務 ${this.currentJobId} 已請求取消。`);
                    this.showNotification('轉譯任務已向後端請求取消。', 'info');
                } catch (error) {
                    console.error('向後端請求取消任務失敗:', error);
                    this.showNotification(`請求取消任務失敗: ${error.message}`, 'error');
                }
            }
            
            // 更新 UI 狀態
            this.loadingOverlay.style.display = 'none';
            this.outputText.value = '轉譯已取消。您可以嘗試重新提交或上傳新的音訊檔。';
            this.cancelButton.disabled = true; // 取消後禁用按鈕
            this.transcribeButton.disabled = false; // 重新啟用執行按鈕
            this.currentJobId = null; // 清除當前任務ID
            abortController = null; // 清除 AbortController
            this.disableActionButtons(); // 禁用輸出按鈕

        } else {
            this.showNotification('沒有進行中的轉譯任務可取消。', 'info');
        }
    },

    // 開始轉譯流程
    async startTranscription() {
        // 禁用執行按鈕，啟用取消按鈕
        this.transcribeButton.disabled = true;
        this.cancelButton.disabled = false;
        this.disableActionButtons(); // 確保輸出按鈕禁用

        abortController = new AbortController();
        const signal = abortController.signal;

        // 清除之前的輸出
        this.outputText.value = "";
        this.performanceBox.innerHTML = "";
        this.totalTimeDisplay.textContent = "-";
        this.wordCountDisplay.textContent = "-";
        this.currentTranscription = '';
        this.hasTimestamps = false;

        try {
            // 顯示載入中
            this.loadingOverlay.style.display = 'flex';
            this.outputText.value = "準備處理您的請求...";
            
            // 1. 獲取輸入數據
            const input = await this.getInputLink();
            const modelType = this.modelSelect.value;
            const useTimestamps = this.timestampCheckbox.checked;
            const cookiesContent = (this.cookiesInput && typeof this.cookiesInput.value === 'string') ? this.cookiesInput.value.trim() : '';

            let jobResponse;

            // 檢查是連結還是檔案上傳
            if (input.type === 'file') {
                // 處理檔案上傳
                jobResponse = await ApiService.submitTranscriptionFile(input.data, input.name, modelType, useTimestamps, signal);
            } else {
                // 處理連結轉譯
                jobResponse = await ApiService.submitTranscriptionJob(input.data, modelType, useTimestamps, cookiesContent, signal);
            }

            this.currentJobId = jobResponse.id; // 保存任務ID，用於取消

            // 3. 輪詢任務結果
            this.outputText.value = "正在處理音訊，請稍候...\n\n任務ID: " + jobResponse.id;
            
            const result = await JobPoller.pollJobStatus(jobResponse.id, {
                onProgress: (data) => {
                    if (data.status === 'polling') {
                        this.outputText.value = `正在處理音訊，請稍候...\n\n任務ID: ${jobResponse.id}\n輪詢次數: ${data.attempt}/${data.maxAttempts}`;
                    } else if (data.status === 'IN_QUEUE' || data.status === 'IN_PROGRESS') {
                        this.outputText.value = `任務ID: ${jobResponse.id}\n狀態: ${data.status}\n輪詢次數: ${data.attempt}/${data.maxAttempts}\n\nRunPod 服務器正在處理中，請耐心等待...`;
                    }
                },
                signal: signal
            });
            
            // 4. 顯示結果
            this.outputText.value = result.text;
            this.updatePerformanceMetrics(result.metrics);
            
            // 保存當前轉譯結果
            this.currentTranscription = result.text;
            this.hasTimestamps = useTimestamps;
            
            // 將結果保存到IndexedDB
            await IndexedDBService.addTranscriptionRecord({
                timestamp: new Date().toISOString(),
                input: input.type === 'link' ? input.data : input.name,
                model: modelType,
                timestampsEnabled: useTimestamps,
                transcription: result.text,
                performance: result.metrics
            });
            this.loadHistory(); // 重新載入歷史紀錄

            // 顯示成功通知
            this.showNotification('轉譯完成！', 'success');
            this.enableActionButtons(true); // 轉譯完成後啟用所有輸出按鈕

        } catch (error) {
            // 處理任務取消，不顯示錯誤提示
            if (error.name === 'AbortError' || error.message === '任務已取消') {
                console.log('轉譯過程被用戶取消。');
                this.showNotification('轉譯任務已取消。', 'warning');
            } else {
                console.error('轉譯過程失敗:', error);
                this.outputText.value = this.formatErrorMessage(error);
                this.showNotification('轉譯失敗', 'error');
                this.enableActionButtons(false); // 轉譯失敗時，僅啟用複製按鈕
            }
        } finally {
            this.loadingOverlay.style.display = 'none';
            this.cancelButton.disabled = true; // 任務結束，禁用取消按鈕
            this.transcribeButton.disabled = false; // 重新啟用執行按鈕
            this.currentJobId = null; // 清除當前任務ID
            abortController = null; // 清除 AbortController
        }
    },
    
    // 獲取輸入連結或檔案數據
    async getInputLink() {
        const link = this.linkInput.value.trim();
        
        if (this.fileInput.files && this.fileInput.files.length > 0) {
            const file = this.fileInput.files[0];
            console.log('偵測到檔案上傳:', file.name);
            // 讀取檔案為 Base64
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    // 移除 Base64 前綴 (如 "data:audio/mpeg;base64,")
                    const base64Data = reader.result.split(',')[1];
                    resolve({ type: 'file', data: base64Data, name: file.name });
                };
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });
        }
        
        if (link) {
            return { type: 'link', data: link };
        }
        
        throw new Error('請提供影片連結或上傳音訊檔');
    },
    
    // 載入並顯示歷史紀錄
    async loadHistory() {
        const limit = parseInt(this.historyLimitSelect.value, 10);
        const records = await IndexedDBService.getTranscriptionRecords(limit);
        this.historyContainer.innerHTML = ''; // 清空現有列表
        
        if (records.length === 0) {
            this.historyContainer.innerHTML = '<p>沒有歷史紀錄。</p>';
            return;
        }
        
        records.forEach(record => {
            const recordElement = document.createElement('div');
            recordElement.className = 'history-record';
            recordElement.innerHTML = `
                <p><strong>輸入:</strong> ${record.input}</p>
                <p><strong>模型:</strong> ${record.model} ${record.timestampsEnabled ? '(帶時間戳)' : ''}</p>
                <p><strong>時間:</strong> ${new Date(record.timestamp).toLocaleString()}</p>
                <p class="transcription-preview">${record.transcription.substring(0, 100)}...</p>
                <div class="history-actions">
                    <button class="view-full-btn" data-id="${record.id}">查看完整結果</button>
                    <button class="delete-record-btn" data-id="${record.id}">刪除</button>
                </div>
            `;
            this.historyContainer.appendChild(recordElement);
        });
        
        // 綁定查看和刪除按鈕事件
        document.querySelectorAll('.view-full-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const id = parseInt(event.target.dataset.id);
                const records = await IndexedDBService.getTranscriptionRecords(0); // 獲取所有紀錄以查找
                const record = records.find(r => r.id === id);
                if (record) {
                    this.outputText.value = record.transcription;
                    this.updatePerformanceMetrics(record.performance);
                    this.currentTranscription = record.transcription;
                    this.hasTimestamps = record.timestampsEnabled;
                    this.showNotification('已載入歷史紀錄', 'info');
                    this.enableActionButtons(); // 載入歷史紀錄後啟用按鈕
                }
            });
        });

        document.querySelectorAll('.delete-record-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const id = parseInt(event.target.dataset.id);
                if (confirm('確定要刪除這條紀錄嗎？')) {
                    await IndexedDBService.deleteTranscriptionRecord(id);
                    this.loadHistory(); // 刷新列表
                    this.showNotification('紀錄已刪除', 'success');
                }
            });
        });
    },
    
    // 處理YouTube連結
    processYoutubeLink(link) {
        console.log('處理YouTube連結:', link);
        // 獲取YouTube ID (如果需要)
        return link;
    },
    
    // 更新性能指標
    updatePerformanceMetrics(metrics) {
        if (!metrics) return;
        
        try {
            this.totalTimeDisplay.textContent = `總時間: ${metrics.total_time || 0}秒`;
            this.wordCountDisplay.textContent = `字數: ${metrics.word_count || 0}`;
        } catch (error) {
            console.error('更新性能指標錯誤:', error);
        }
    },
    
    // 顯示通知
    showNotification(message, type = 'info', duration = 5000) {
        if (!this.notification) return;
        
        this.notification.textContent = message;
        this.notification.className = `notification ${type}`;
        this.notification.style.display = 'block';
        
        setTimeout(() => {
            this.notification.style.display = 'none';
        }, duration);
    },
    
    // 格式化錯誤消息
    formatErrorMessage(error) {
        const timestamp = new Date().toLocaleTimeString();
        let message = `操作失敗 [${timestamp}]\n`;
        
        // 添加上下文相關的提示
        if (error.message.includes('API金鑰未設置')) {
            message += '請點擊"設置API金鑰"按鈕設置您的API金鑰。';
        } else if (error.message.includes('輪詢超時')) {
            message += `輪詢超時：任務 ${this.currentJobId} 在 45 次嘗試後仍未完成\n\n`; // 使用全局jobId
            message += '可能原因:\n';
            message += '1. 服務器處理負載較高\n';
            message += '2. 影片過長或格式不支持\n';
            message += '建議選擇較短的視頻再次嘗試。';
        } else if (error.message.includes('無法連接')) {
            message += '請檢查您的網絡連接或API服務是否可用。';
        } else if (error.message.includes('任務已取消')) {
            message += '任務已取消，沒有結果。';
        } else if (error.message.includes('無法下載YouTube視頻')) {
            message += 'RunPod 服務器無法下載該 YouTube 視頻。可能原因：\n';
            message += '1. 視頻被限制或需要登入\n';
            message += '2. 視頻在您的地區不可用\n';
            message += '3. YouTube 可能檢測到自動下載並阻止了訪問\n';
            message += '4. RunPod 的網絡環境可能被 YouTube 限制\n\n';
            message += '建議嘗試：\n';
            message += '- 使用不同的視頻連結\n';
            message += '- 使用較短的 YouTube 短片\n';
            message += '- 直接上傳本地音頻文件';
        }
        else {
            message += `詳細錯誤: ${error.message}`;
        }
        
        return message;
    }
};

// 複製按鈕點擊事件 (現在作為 TranscriptionController 的內部函數)
// 下載 TXT 格式 (現在作為 TranscriptionController 的內部函數)
// 下載 SRT 格式 (現在作為 TranscriptionController 的內部函數)
// 下載 VTT 格式 (現在作為 TranscriptionController 的內部函數)
// 新增：下載轉譯內容函數到 TranscriptionController
TranscriptionController.downloadTranscription = async function(format) {
    try {
        this.loadingOverlay.style.display = 'flex'; // 顯示載入中
        
        // 呼叫 Vercel 代理的下載端點
        const response = await fetch(ApiService.config.proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ApiService.config.apiKey}`
            },
            body: JSON.stringify({
                action: 'download_file',
                text: this.currentTranscription,
                format: format,
                timestamps: this.hasTimestamps
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`下載檔案失敗 (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.file_content_base64 || !data.file_name) {
            throw new Error('後端返回的檔案數據無效');
        }
        
        // 將 Base64 內容解碼並創建 Blob
        const byteCharacters = atob(data.file_content_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'text/plain' }); // 可根據實際文件類型調整 MIME type
        
        // 創建下載連結並點擊
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = data.file_name; // 使用後端返回的檔案名稱
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification(`${format.toUpperCase()} 格式檔案下載成功`, 'success');
    } catch (error) {
        console.error('下載錯誤:', error);
        this.showNotification('下載檔案時發生錯誤', 'error');
    } finally {
        this.loadingOverlay.style.display = 'none';
    }
};

// 啟用操作按鈕 (作為 TranscriptionController 的方法)
TranscriptionController.enableActionButtons = function(isSuccess) {
    this.copyButton.disabled = false; // 無論成功或失敗，都啟用複製按鈕
    
    // 只有成功時才啟用下載按鈕
    this.txtButton.disabled = !isSuccess;
    this.srtButton.disabled = !isSuccess;
    this.vttButton.disabled = !isSuccess;
};

// 禁用操作按鈕 (作為 TranscriptionController 的方法)
TranscriptionController.disableActionButtons = function() {
    this.copyButton.disabled = true;
    this.txtButton.disabled = true;
    this.srtButton.disabled = true;
    this.vttButton.disabled = true;
};

// 轉譯YouTube連結
async function transcribeYouTubeLink() {
    // ... 確保不使用API金鑰 ...
}

// 更新輪詢函數的錯誤和超時處理
async function pollResult(jobId, retryCount = 0) {
    // 最多嘗試45次，每次間隔增加
    if (retryCount >= 45) {
        throw new Error('等待任務完成超時，請稍後再試');
    }
    
    try {
        // 更詳細的日誌
        console.log(`輪詢任務 #${retryCount+1}: ${jobId}`);
        document.getElementById('output-text').value = `正在處理音訊，請稍候...\n\n任務ID: ${jobId}\n輪詢次數: ${retryCount+1}/45`;
        
        // 確保URL格式正確
        const statusUrl = `https://api.runpod.ai/v2/2xi4wl5mf51083/status/${jobId}`;
        console.log(`輪詢任務狀態: ${statusUrl}`);
        
        // 使用更完整的錯誤處理
        const response = await fetch(statusUrl, {
            headers: {
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            }
        });
        
        // 檢查HTTP錯誤
        if (!response.ok) {
            const responseText = await response.text();
            console.error(`狀態查詢失敗: HTTP ${response.status}`, responseText);
            throw new Error(`狀態查詢失敗: ${response.status} - ${responseText}`);
        }
        
        // 處理響應
        const data = await response.json();
        console.log(`第${retryCount+1}次輪詢結果:`, data);
        
        // 完成處理
        if (data.status === 'COMPLETED') {
            console.log('輸出數據結構:', JSON.stringify(data, null, 2));
            
            // 嚴格檢查輸出格式
            if (!data.output) {
                throw new Error('收到完成狀態但缺少output欄位');
            }
            
            // 根據可能的回應結構提取文本
            let resultText = "";
            let metrics = { total_time: 0, word_count: 0 };
            
            try {
                if (typeof data.output === 'string') {
                    resultText = data.output;
                } else if (typeof data.output === 'object') {
                    // 處理各種可能的輸出格式
                    if (data.output.text) {
                        resultText = data.output.text;
                    } else if (data.output.transcription) {
                        resultText = data.output.transcription;
                    } else if (data.output.data && data.output.data.text) {
                        resultText = data.output.data.text;
                    } else {
                        resultText = JSON.stringify(data.output);
                    }
                }
                
                return { text: resultText, metrics: metrics };
            } catch (extractError) {
                console.error('結果提取錯誤:', extractError);
                throw new Error(`無法解析轉錄結果: ${extractError.message}`);
            }
        } else if (data.status === 'FAILED') {
            throw new Error(data.error || '轉錄失敗');
        } else if (data.status === 'IN_QUEUE' && retryCount > 10) {
            console.warn(`任務長時間在隊列中(${retryCount}次輪詢)，嘗試重新取得狀態...`);
            
            // 給使用者更新進度
            document.getElementById('output-text').value = 
                "任務在處理隊列中等待時間較長...\n" +
                "這可能是因為RunPod伺服器較忙，請耐心等待。\n\n" +
                `任務ID: ${jobId}\n輪詢次數: ${retryCount+1}/45\n\n` +
                "如果等待超過5分鐘仍無回應，可以嘗試重新提交。";
            
            // 超過20次輪詢時，建議用戶重新嘗試
            if (retryCount > 20) {
                throw new Error("任務等待時間過長，請嘗試重新提交或選擇較短的影片");
            }
        } else {
            // 修改等待時間策略，根據輪詢次數動態調整
            const waitTime = Math.min(3000 + (retryCount * 500), 10000); // 從3秒開始，最多增加到10秒
            console.log(`任務狀態: ${data.status}，等待 ${waitTime/1000} 秒後再次檢查...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return pollResult(jobId, retryCount + 1);
        }
    } catch (error) {
        console.error(`輪詢第 ${retryCount} 次失敗:`, error);
        
        // 特別處理YouTube錯誤
        if (error.message && (
            error.message.includes('YouTube') || 
            error.message.includes('HTTP Error 400') ||
            error.message.includes('HTTP Error 403') ||
            error.message.includes('Forbidden') ||
            error.message.includes('Precondition check failed')
        )) {
            console.error('YouTube下載失敗，詳細錯誤:', error);
            console.log('建議嘗試:');
            console.log('1. 使用另一個公開的YouTube視頻');
            console.log('2. 確認視頻不受地區限制或年齡限制');
            console.log('3. 確認RunPod網絡環境可以訪問YouTube');
            
            throw new Error(`無法下載YouTube視頻。可能原因：
1. 視頻可能被限制或需要登入
2. 視頻可能在您的地區不可用
3. YouTube可能檢測到自動下載並阻止了訪問
4. RunPod的網絡環境可能被YouTube限制

建議嘗試：
- 使用不同的視頻連結
- 使用較短的YouTube短片
- 直接上傳本地音頻文件`);
        }
        
        // 短暫等待後重試
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// 在scripts.js開頭添加測試函數
async function testRunPodConnection() {
    try {
        const response = await fetch(`https://api.runpod.ai/v2/2xi4wl5mf51083/health`, {
            headers: {
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            }
        });
        
        const data = await response.json();
        console.log('RunPod連接測試:', data);
        console.log('API金鑰長度:', API_CONFIG.apiKey?.length || 0);
        console.log('API端點:', API_CONFIG.baseUrl);
        return data;
    } catch (error) {
        console.error('連接測試失敗:', error);
        return null;
    }
}

// 在init函數中調用
(function init() {
    console.log('應用初始化中...');
    const apiKey = localStorage.getItem('temp_api_key');
    console.log('API金鑰狀態:', apiKey ? '已設置' : '未設置');
    
    // 添加自動連接測試
    testRunPodConnection().then(status => {
        if (status && status.ready) {
            console.log('✅ RunPod服務可用');
        } else {
            console.warn('⚠️ RunPod服務可能不可用，請檢查設置');
        }
    });
})();

// 更完善的錯誤處理函數
function handleApiError(error, context = '') {
    const timestamp = new Date().toISOString();
    const errorDetails = {
        timestamp,
        context,
        message: error.message,
        stack: error.stack
    };
    
    console.error('詳細錯誤信息:', JSON.stringify(errorDetails, null, 2));
    
    // 顯示更具描述性的錯誤訊息
    let userMessage = `操作失敗 [${timestamp}]\n`;
    
    if (error.message.includes('Cannot read properties')) {
        userMessage += '後端返回的資料格式不正確，可能是API版本不匹配。\n';
        userMessage += '建議檢查Docker映像版本與API請求格式是否一致。';
    } else if (error.message.includes('等待任務完成超時')) {
        userMessage += '任務處理時間過長。這可能是由於:\n';
        userMessage += '1. RunPod服務器負載過高\n';
        userMessage += '2. 輸入的媒體檔案過大\n';
        userMessage += '3. 請求格式不被後端識別\n';
        userMessage += '建議使用較短的YouTube片段再次嘗試。';
    }
    
    return userMessage;
}

// 添加重試與嘗試不同格式的功能
async function transcribeWithRetry(audioData, modelType, attempts = 0) {
    if (attempts >= 2) {
        throw new Error('多次嘗試後仍無法完成轉錄');
    }
    
    try {
        // 嘗試不同請求格式
        const formatOptions = [
            // 格式1
            {
                input: {
                    audio: audioData,
                    model: modelType,
                    language: "auto"
                }
            },
            // 格式2
            {
                input: {
                    source_url: audioData,
                    model_type: modelType,
                    language_code: "auto"
                }
            }
        ];
        
        const requestData = formatOptions[attempts];
        console.log(`嘗試格式 ${attempts+1}:`, JSON.stringify(requestData, null, 2));
        
        // 其他代碼保持不變...
    } catch (error) {
        // 重試其他格式
        console.warn(`格式 ${attempts+1} 失敗，嘗試其他格式...`);
        return transcribeWithRetry(audioData, modelType, attempts + 1);
    }
}

// 新增測試函數用於診斷
async function testDirectApiCall() {
    try {
        // 使用一個非常短的影片進行測試
        const testUrl = "https://www.youtube.com/shorts/JdUjciCnS6g";
        
        // 嘗試最小化的請求體
        const testRequest = {
            input: {
                source_url: testUrl,
                model: "tiny", // 最小的模型以便快速測試
                language: "auto"
            }
        };
        
        console.log('發送測試請求:', testRequest);
        
        // 發送請求
        const response = await fetch(API_CONFIG.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify(testRequest)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API返回錯誤 ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('測試請求回應:', result);
        
        if (result.id) {
            console.log('測試任務已提交，開始輪詢...');
            
            // 手動輪詢一次
            const statusResponse = await fetch(`https://api.runpod.ai/v2/2xi4wl5mf51083/status/${result.id}`, {
                headers: {
                    'Authorization': `Bearer ${API_CONFIG.apiKey}`
                }
            });
            
            const statusResult = await statusResponse.json();
            console.log('首次狀態檢查:', statusResult);
            
            return {
                success: true,
                message: `測試請求成功，任務ID: ${result.id}，狀態: ${statusResult.status}`
            };
        }
        
        return { 
            success: true, 
            message: '測試請求已發送，但未收到任務ID' 
        };
    } catch (error) {
        console.error('測試請求失敗:', error);
        return {
            success: false,
            message: `測試失敗: ${error.message}`
        };
    }
}

// 添加到scripts.js底部
async function testRunpodApi() {
    try {
        // 基本連接測試
        const healthResponse = await fetch(`https://api.runpod.ai/v2/2xi4wl5mf51083/health`, {
            headers: {
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            }
        });
        
        console.log('健康檢查狀態:', healthResponse.status);
        console.log('健康檢查結果:', await healthResponse.json());
        
        // 發送極簡測試請求
        const testResponse = await fetch(API_CONFIG.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                input: {
                    link: "https://www.youtube.com/shorts/JdUjciCnS6g",
                    model: "tiny"
                }
            })
        });
        
        console.log('測試請求狀態:', testResponse.status);
        const result = await testResponse.json();
        console.log('測試請求結果:', result);
        
        if (result.id) {
            console.log('成功獲取任務ID，開始檢查任務狀態');
            
            // 等待3秒
            await new Promise(r => setTimeout(r, 3000));
            
            // 檢查任務狀態
            const statusResponse = await fetch(`https://api.runpod.ai/v2/2xi4wl5mf51083/status/${result.id}`, {
                headers: {
                    'Authorization': `Bearer ${API_CONFIG.apiKey}`
                }
            });
            
            console.log('狀態檢查結果:', await statusResponse.json());
        }
        
        return "API測試完成，請檢查控制台日誌";
    } catch (error) {
        console.error('API測試失敗:', error);
        return `API測試失敗: ${error.message}`;
    }
}

// API服務模塊 - 集中管理所有API相關功能
const ApiService = {
    // 取得API配置
    config: {
        // 所有API請求都將通過 Vercel Serverless Function 代理
        proxyUrl: '/api/transcribe',
        
        // 安全地獲取API金鑰
        get apiKey() {
            const key = localStorage.getItem('temp_api_key');
            if (!key) {
                console.warn('API金鑰未設置');
                return '';
            }
            return key;
        }
    },
    
    // 檢查API服務健康狀態
    async checkHealth() {
        console.log('檢查API服務健康狀態...');
        try {
            const response = await fetch(this.config.proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check_health' }),
            });
            
            if (!response.ok) {
                throw new Error(`健康檢查失敗: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('API健康狀態:', data);
            return data;
        } catch (error) {
            console.error('健康檢查錯誤:', error);
            throw error;
        }
    },
    
    // 修正後的提交轉譯任務函數 (連結)
    async submitTranscriptionJob(link, modelType, useTimestamps, cookies, signal) {
        console.log('提交轉譯任務...');
        
        // 檢查API金鑰
        if (!this.config.apiKey) {
            throw new Error('API金鑰未設置，請先設置API金鑰');
        }
        
        // 構建請求數據
        const requestData = {
            action: 'transcribe_link',
            link: link,
            model: modelType,
            timestamps: useTimestamps,
            cookies: cookies // 新增
        };
        
        console.log('請求數據:', JSON.stringify(requestData, null, 2));
        
        try {
            const response = await fetch(this.config.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestData),
                signal: signal // 添加 AbortController signal
            });
            
            console.log('API響應狀態:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API錯誤 (${response.status}): ${errorText}`);
            }
            
            const data = await response.json();
            console.log('任務提交響應:', data);
            
            // 確認回應中包含任務ID
            if (!data.id) {
                throw new Error('API響應中缺少任務ID');
            }
            
            return data;
        } catch (error) {
            console.error('提交任務失敗:', error);
            throw error;
        }
    },
    
    // 提交轉譯任務函數 (檔案上傳)
    async submitTranscriptionFile(fileData, fileName, modelType, useTimestamps, signal) {
        console.log('提交檔案轉譯任務...');
        
        if (!this.config.apiKey) {
            throw new Error('API金鑰未設置，請先設置API金鑰');
        }
        
        const requestData = {
            action: 'transcribe_file',
            file_data: fileData, // Base64 編碼的檔案數據
            file_name: fileName,
            model: modelType,
            timestamps: useTimestamps
        };

        console.log('請求數據 (檔案):', { action: requestData.action, file_name: requestData.file_name, model: requestData.model, timestamps: requestData.timestamps });

        try {
            const response = await fetch(this.config.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestData),
                signal: signal // 添加 AbortController signal
            });

            console.log('API響應狀態 (檔案):', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API錯誤 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            console.log('任務提交響應 (檔案):', data);

            if (!data.id) {
                throw new Error('API響應中缺少任務ID');
            }

            return data;
        } catch (error) {
            console.error('提交檔案任務失敗:', error);
            throw error;
        }
    },

    // 獲取任務狀態
    async getJobStatus(jobId, signal) {
        if (!jobId) {
            throw new Error('需要提供任務ID');
        }
        
        try {
            const requestData = {
                action: 'get_job_status',
                job_id: jobId
            };
            console.log('檢查任務狀態請求:', requestData);
            
            const response = await fetch(this.config.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestData),
                signal: signal
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`狀態檢查失敗 (${response.status}): ${errorText}`);
            }
            
            const data = await response.json();
            console.log(`任務 ${jobId} 狀態:`, data);
            
            // RunPod 回應的狀態可能在 output 字段中，需要處理
            if (data && data.output) {
                // 如果 output 是一個物件，且包含 status 字段，則使用它
                if (typeof data.output === 'object' && data.output.status) {
                    return data.output;
                } else if (data.status) { // 否則使用頂層 status
                    return data;
                } else { // 處理 RunPod 的直接輸出（completed job）
                    return { status: 'COMPLETED', output: data.output, error: data.error };
                }
            }
            
            return data; // 如果沒有 output 字段，直接返回原始數據

        } catch (error) {
            console.error(`檢查任務 ${jobId} 狀態失敗:`, error);
            throw error;
        }
    },

    // 取消任務
    async cancelJob(jobId) {
        if (!jobId) {
            throw new Error('需要提供任務ID以取消');
        }
        console.log(`正在請求取消任務: ${jobId}`);
        try {
            const requestData = {
                action: 'cancel_job',
                job_id: jobId
            };
            const response = await fetch(this.config.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestData)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`取消任務失敗 (${response.status}): ${errorText}`);
            }
            const data = await response.json();
            console.log(`任務 ${jobId} 取消響應:`, data);
            return data;
        } catch (error) {
            console.error(`取消任務 ${jobId} 失敗:`, error);
            throw error;
        }
    },

    // 抽取YouTube視頻ID的輔助函數 (此函數不再被直接使用，但保留)
    extractYouTubeID(url) {
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : null;
    }
};

// 任務輪詢模塊 - 處理長時間運行的任務
const JobPoller = {
    // 輪詢任務狀態，使用指數退避策略
    async pollJobStatus(jobId, options = {}) {
        const defaults = {
            maxRetries: 45,                    // 最大重試次數  
            initialInterval: 3000,             // 初始間隔(毫秒)
            maxInterval: 15000,                // 最大間隔(毫秒)
            backoffFactor: 1.5,                // 退避因子
            onProgress: (status, attempt) => {}, // 進度回調函數
            signal: null // 新增 AbortController signal
        };
        
        const config = { ...defaults, ...options };
        let attempt = 0;
        let interval = config.initialInterval;
        
        while (attempt < config.maxRetries) {
            // 檢查是否已取消
            if (config.signal && config.signal.aborted) {
                console.log('輪詢因取消而中止');
                throw new Error('任務已取消');
            }

            attempt++;
            
            try {
                // 回調函數更新進度
                config.onProgress({ status: 'polling', attempt, maxAttempts: config.maxRetries });
                
                // 獲取任務狀態
                const jobStatus = await ApiService.getJobStatus(jobId, config.signal);
                
                // 根據任務狀態處理
                if (jobStatus.status === 'COMPLETED') {
                    console.log('任務完成:', jobStatus);
                    return this.processCompletedJob(jobStatus);
                } else if (jobStatus.status === 'FAILED') {
                    console.error('任務失敗:', jobStatus);
                    throw new Error(jobStatus.error || '任務處理失敗');
                } else if (jobStatus.status === 'IN_QUEUE') {
                    if (attempt > 10) {
                        console.warn(`任務在隊列中等待較長時間 (${attempt}/${config.maxRetries})`);
                    }
                }
                
                // 計算下一次等待時間
                interval = Math.min(interval * config.backoffFactor, config.maxInterval);
                console.log(`任務狀態: ${jobStatus.status}，等待 ${interval/1000} 秒後重試...`);
                
                // 等待下一次輪詢
                await new Promise(resolve => setTimeout(resolve, interval));
            } catch (error) {
                // 檢查是否是取消錯誤
                if (error.name === 'AbortError') {
                    console.log('輪詢被 AbortController 取消');
                    throw error; // 重新拋出，讓上層處理取消邏輯
                }

                console.error(`輪詢第 ${attempt} 次失敗:`, error);
                
                // 特別處理YouTube錯誤
                if (error.message && (
                    error.message.includes('YouTube') || 
                    error.message.includes('HTTP Error 400') ||
                    error.message.includes('HTTP Error 403') ||
                    error.message.includes('Forbidden') ||
                    error.message.includes('Precondition check failed')
                )) {
                    console.error('YouTube下載失敗，詳細錯誤:', error);
                    console.log('建議嘗試:');
                    console.log('1. 使用另一個公開的YouTube視頻');
                    console.log('2. 確認視頻不受地區限制或年齡限制');
                    console.log('3. 確認RunPod網絡環境可以訪問YouTube');
                    
                    throw new Error(`無法下載YouTube視頻。可能原因：
1. 視頻可能被限制或需要登入
2. 視頻可能在您的地區不可用
3. YouTube可能檢測到自動下載並阻止了訪問
4. RunPod的網絡環境可能被YouTube限制

建議嘗試：
- 使用不同的視頻連結
- 使用較短的YouTube短片
- 直接上傳本地音頻文件`);
                }
                
                // 短暫等待後重試
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // 超過重試次數
        throw new Error(`輪詢超時：任務 ${jobId} 在 ${config.maxRetries} 次嘗試後仍未完成`);
    },
    
    // 處理已完成的任務結果
    processCompletedJob(jobStatus) {
        // 確保輸出存在
        if (!jobStatus.output) {
            throw new Error('任務完成但缺少輸出數據');
        }
        
        // 解析輸出數據
        try {
            let transcription = '';
            let performance = {};
            
            // 處理各種可能的輸出格式
            if (typeof jobStatus.output === 'string') {
                transcription = jobStatus.output;
            } else if (typeof jobStatus.output === 'object') {
                // 處理標準格式
                transcription = jobStatus.output.transcription || 
                               jobStatus.output.text || 
                               JSON.stringify(jobStatus.output);
                
                // 提取性能指標
                performance = jobStatus.output.performance || 
                             jobStatus.output.metrics || 
                             {};
            }
            
            return {
                text: transcription,
                metrics: performance
            };
        } catch (error) {
            console.error('處理任務結果失敗:', error);
            throw new Error(`無法解析轉譯結果: ${error.message}`);
        }
    }
};

// 頁面加載時初始化應用
document.addEventListener('DOMContentLoaded', () => {
    // 初始化轉譯控制器
    TranscriptionController.init();
    
    // 檢查是否在開發環境中，添加調試功能
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        initDebugTools();
    }
    
    // 首次載入時禁用按鈕，直到有內容生成
    // 這裡不再需要 disableActionButtons()，因為 init() 中已經調用了
});

// 初始化調試工具
function initDebugTools() {
    console.log('初始化調試工具...');
    
    // 添加調試面板到頁面
    const debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.innerHTML = `
        <h3>調試工具</h3>
        <button id="test-health-btn">檢查API健康狀態</button>
        <button id="test-sample-btn">測試樣本視頻</button>
        <pre id="debug-output"></pre>
    `;
    document.body.appendChild(debugPanel);
    
    // 綁定調試按鈕事件
    document.getElementById('test-health-btn').addEventListener('click', async () => {
        const output = document.getElementById('debug-output');
        output.textContent = '檢查API健康狀態...';
        
        try {
            const status = await ApiService.checkHealth();
            output.textContent = JSON.stringify(status, null, 2);
        } catch (error) {
            output.textContent = `錯誤: ${error.message}`;
        }
    });
    
    document.getElementById('test-sample-btn').addEventListener('click', () => {
        document.getElementById('link-input').value = 'https://www.youtube.com/shorts/JdUjciCnS6g';
        document.getElementById('model-select').value = 'tiny';
        document.getElementById('transcribe-button').click();
    });
}

// 全域錯誤處理
window.addEventListener('error', (event) => {
    console.error('全域錯誤:', event.error);
    
    // 向用戶顯示友好的錯誤消息
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = '發生意外錯誤，請刷新頁面重試';
        notification.className = 'notification error';
        notification.style.display = 'block';
    }
});

// 處理未捕獲的Promise錯誤
window.addEventListener('unhandledrejection', (event) => {
    console.error('未處理的Promise錯誤:', event.reason);
});

// 添加不同的測試視頻函數
function addTestVideos() {
    // 添加測試按鈕到頁面
    const testPanel = document.createElement('div');
    testPanel.className = 'test-panel';
    testPanel.innerHTML = `
        <h4>測試視頻</h4>
        <button class="test-btn" data-url="https://www.youtube.com/shorts/JdUjciCnS6g">測試短片 1</button>
        <button class="test-btn" data-url="https://www.youtube.com/shorts/VXpBBmoHMgs">測試短片 2</button>
        <button class="test-btn" data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ">測試普通視頻</button>
    `;
    document.body.appendChild(testPanel);
    
    // 綁定測試按鈕事件
    document.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('link-input').value = btn.getAttribute('data-url');
            document.getElementById('model-select').value = 'tiny';
            document.getElementById('transcribe-button').click();
        });
    });
} 