// Cloudflare Worker：Enka.Network API 的中繼 (Enka 沒有開 CORS，GitHub Pages 的網頁不能直接呼叫)
// 部署位置：https://enka-proxy.twl-benchen.workers.dev (Cloudflare 後台 Workers & Pages → enka-proxy)
// 修改後要到 Cloudflare 後台貼上並重新 Deploy，這個檔案只是備份
// 只允許自己的網站、只轉發 /uid/9 或 10 位數字，並照 Enka 的要求帶自訂 User-Agent
const ALLOW = ['https://twl-benchen.github.io'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOW.includes(origin) ? origin : ALLOW[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const m = new URL(req.url).pathname.match(/^\/uid\/(\d{9,10})\/?$/);
    if (!m) return new Response('用法：/uid/你的UID', { status: 400, headers: cors });

    const r = await fetch(`https://enka.network/api/uid/${m[1]}/`, {
      headers: { 'User-Agent': 'genshin-wish (github.com/twl-Benchen)' },
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};
