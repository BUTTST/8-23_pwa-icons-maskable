# 添加 PWA Icons 圖標操作指南

這份指南將提供在您的 PWA 專案中添加應用程式圖標（Icons）的主要操作步驟。正確配置圖標是讓您的 PWA 在使用者裝置上顯示為原生應用程式的關鍵。

## 1. 準備圖示檔案 (Icons)

### 目的
提供不同尺寸的圖示，以確保在各種裝置和螢幕密度下都能清晰顯示。尤其「可遮罩圖示」能適應不同形狀的平台圖標（例如圓形、方形）。

### 操作
1.  **尺寸準備：** 準備一系列不同尺寸的 PNG 格式圖示，建議包含以下常見尺寸 (單位：像素)：`48x48`, `72x72`, `96x96`, `144x144`, `192x192`, `512x512`。
2.  **可遮罩圖示：** 針對 PWA，建議準備「可遮罩圖示」。這類圖示的核心內容應置於圖示的 80% 安全區域內，以確保在被不同形狀遮罩時，主要視覺元素不會被截斷。
3.  **檔案命名：** 建議以有意義的方式命名圖示檔案，例如 `icon-48x48.png` 或 `app-icon-192-maskable.png`。

### 檔案層級
在您的專案根目錄下，**新建一個名為 `icons` 的資料夾**。將所有準備好的圖示檔案都放置於此資料夾中。

```
您的專案根目錄/
├── index.html
├── manifest.json
├── service-worker.js
└── icons/
    ├── icon-48x48.png
    ├── icon-72x72.png
    └── ... (所有圖示檔案)
```

## 2. 建立 `manifest.json` 檔案

### 目的
`manifest.json` 是 PWA 的核心設定檔，它告訴瀏覽器和作業系統如何「安裝」和顯示您的應用程式，包括應用程式的名稱、主題顏色和最重要的圖示清單。

### 操作
1.  在您的專案根目錄下，**新建一個名為 `manifest.json` 的檔案**。
2.  **檔案內容：** 在 `manifest.json` 中，需要定義以下關鍵資訊：
    *   `name` 和 `short_name`：應用程式的完整名稱和簡短名稱。
    *   `description`：應用程式的簡要描述。
    *   `start_url`：應用程式啟動時的起始頁面（通常是 `.` 或 `/`）。
    *   `display`：應用程式的顯示模式（例如 `standalone`，使其看起來像一個獨立的應用程式）。
    *   `background_color` 和 `theme_color`：應用程式的背景色和主題色，用於瀏覽器介面和啟動畫面。
    *   `icons` 陣列：這是最重要的一項，用於列出您所有的圖示檔案。對於每個圖示，您需要指定其 `src` (路徑)、`sizes` (尺寸)、`type` (類型，例如 `image/png`)，以及 `purpose` (用途，例如 `maskable` 或 `any`)。**請注意：`src` 的路徑應該使用相對路徑 (例如 `"icons/icon-192.png"`)，避免使用絕對路徑 (例如 `"/icons/icon-192.png"`)，以確保在不同部署環境下 (例如 GitHub Pages) 都能正確找到檔案。**

### 檔案層級
`manifest.json` 檔案應直接放置在**專案的根目錄**下。

## 3. 在 `index.html` 中連結 `manifest.json`

### 目的
告知網頁瀏覽器您的應用程式有一個 PWA Manifest 檔案，以便瀏覽器能夠解析並啟用 PWA 功能。

### 操作
在您的主 HTML 檔案 (`index.html`) 的 `<head>` 標籤中，添加一個 `<link>` 標籤，指向您的 `manifest.json` 檔案。**同樣地，這裡也應該使用相對路徑。**

```html
<head>
    <!-- ... 其他 head 內容 ... -->
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#317EFB"/>
    <!-- ... 其他 head 內容 ... -->
</head>
```

### 檔案層級
`index.html` 檔案應直接放置在**專案的根目錄**下。

## 4. 建立並註冊 Service Worker (推薦)

### 目的
Service Worker 是 PWA 實現離線功能、快取資源和接收推播通知的關鍵。雖然它不直接影響圖示顯示，但對於提供完整的 PWA 體驗至關重要。

### 操作
1.  在您的專案根目錄下，**新建一個名為 `service-worker.js` 的檔案**。
2.  **檔案內容：** 在 Service Worker 中，您需要定義快取策略。這通常包括在 `install` 事件中快取重要的應用程式資源（例如 `index.html`, `manifest.json`, CSS 檔案, JS 檔案和所有的 `icons`），並在 `fetch` 事件中提供離線資源。**快取的所有路徑都應該使用相對路徑 (例如 `"./index.html"`)。**
3.  **註冊 Service Worker：** 在您的 `index.html` 或其他主要的 JavaScript 檔案中，添加程式碼來註冊 `service-worker.js`。**註冊時也務必使用相對路徑。**

### 檔案層級
`service-worker.js` 檔案應直接放置在**專案的根目錄**下。

## 總結

透過以上步驟，您的專案將具備 PWA 的基本架構，並且應用程式圖標將能正確顯示在支援 PWA 的裝置上。最核心的環節是 `manifest.json` 的正確配置以及所有圖示檔案的可用性。
