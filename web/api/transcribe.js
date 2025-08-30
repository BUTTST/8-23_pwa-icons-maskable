export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, ...data } = req.body;

    const RUNPOD_API_ENDPOINT_BASE = process.env.RUNPOD_API_ENDPOINT; // Should be https://api.runpod.ai/v2/{endpoint_id}
    const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

    if (!RUNPOD_API_ENDPOINT_BASE || !RUNPOD_API_KEY) {
        console.error("RunPod API Endpoint or Key is not configured.");
        return res.status(500).json({ error: 'Server configuration error: RunPod API credentials missing.' });
    }

    // RapidAPI 設定（從 Notebook 轉為環境變數，避免硬編碼）
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // 例：f89f95249amsh...（由使用者在 Vercel 設定）
    const RAPIDAPI_HOST = 'youtube-captions-transcript-subtitles-video-combiner.p.rapidapi.com';

    let targetUrl;
    let fetchOptions;

    // The base URL should not contain /run or /status
    const baseUrl = RUNPOD_API_ENDPOINT_BASE.replace(/\/run$/, '');

    if (action === 'get_job_status') {
        const { job_id } = data;
        if (!job_id) {
            return res.status(400).json({ error: 'job_id is required for get_job_status action' });
        }
        targetUrl = `${baseUrl}/status/${job_id}`;
        fetchOptions = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${RUNPOD_API_KEY}`,
            },
        };
    } else if (action === 'cancel_job') {
        const { job_id } = data;
        if (!job_id) {
            return res.status(400).json({ error: 'job_id is required for cancel_job action' });
        }
        targetUrl = `${baseUrl}/stop/${job_id}`;
        fetchOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RUNPOD_API_KEY}`,
                'Content-Type': 'application/json', // POST請求通常需要Content-Type
            },
            // RunPod 的 /stop 端點通常不需要請求體，但為了避免問題，可以發送一個空物件或包含 job_id 的物件
            body: JSON.stringify({}), // 這裡發送一個空物件，實際取消是通過URL中的job_id
        };
    } else if (action === 'fetch_captions') {
        // 從 RapidAPI 取得可用字幕，優先選擇作者上傳(manual) 其後才是自動(auto)
        try {
            if (!RAPIDAPI_KEY) {
                return res.status(500).json({ error: 'Server configuration error: RAPIDAPI_KEY missing.' });
            }
            const { link } = data;
            if (!link) {
                return res.status(400).json({ error: 'link is required for fetch_captions action' });
            }

            // 1) 解析 video_id（簡化處理）
            const idMatch = link.match(/(?:v=|youtu\.be\/)([\w\-]{11})/);
            const videoId = idMatch ? idMatch[1] : null;
            if (!videoId) {
                return res.status(400).json({ error: 'Invalid YouTube link, cannot extract video id.' });
            }

            // 2) 取得所有語言清單
            const listUrl = `https://${RAPIDAPI_HOST}/language-list/${videoId}`;
            const listResp = await fetch(listUrl, {
                method: 'GET',
                headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST }
            });
            if (!listResp.ok) {
                const t = await listResp.text();
                return res.status(listResp.status).json({ error: `language-list error: ${t}` });
            }
            const tracks = await listResp.json();
            if (!Array.isArray(tracks) || tracks.length === 0) {
                return res.status(404).json({ error: 'No captions available for this video.' });
            }

            // 選擇策略：優先作者(manual: auto-generated==0) 其次 auto-generated==1
            let chosen = tracks.find(t => t['auto-generated'] === 0) || tracks[0];
            const isManual = chosen['auto-generated'] === 0;
            const langCode = chosen['languageCode'] || 'unknown';

            // 3) 下載字幕 JSON
            const prefer = isManual ? 'manual' : 'auto';
            const dlUrl = `https://${RAPIDAPI_HOST}/download-json/${videoId}?lang=${encodeURIComponent(langCode)}&prefer=${prefer}`;
            const dlResp = await fetch(dlUrl, {
                method: 'GET',
                headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST }
            });
            if (!dlResp.ok) {
                const t = await dlResp.text();
                return res.status(dlResp.status).json({ error: `download-json error: ${t}` });
            }
            const dlData = await dlResp.json();
            const captions = Array.isArray(dlData) ? dlData : (dlData.captions || []);
            const lines = captions.map(item => (item && item.text ? String(item.text).trim() : '')).filter(Boolean);
            const text = lines.join('\n');

            return res.status(200).json({
                text,
                language_code: langCode,
                track_type: isManual ? 'manual' : 'auto'
            });
        } catch (e) {
            console.error('fetch_captions error:', e);
            return res.status(500).json({ error: String(e.message || e) });
        }
    } else {
        // For actions like 'transcribe_link', 'transcribe_file', 'download_file'
        targetUrl = `${baseUrl}/run`;
        fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RUNPOD_API_KEY}`,
            },
            body: JSON.stringify({ input: { action, ...data } }),
        };
    }

    try {
        const runpodResponse = await fetch(targetUrl, fetchOptions);

        if (!runpodResponse.ok) {
            const errorText = await runpodResponse.text();
            console.error(`RunPod API Error: ${runpodResponse.status} - ${errorText}`);
            return res.status(runpodResponse.status).json({ error: `RunPod API Error: ${errorText}` });
        }

        const result = await runpodResponse.json();
        return res.status(200).json(result);

    } catch (error) {
        console.error(`Error calling RunPod API at ${targetUrl}:`, error);
        return res.status(500).json({ error: 'Failed to communicate with transcription service.' });
    }
}
