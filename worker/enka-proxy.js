// Cloudflare Worker：Enka.Network API 的中繼 (Enka 沒有開 CORS，GitHub Pages 的網頁不能直接呼叫)
// 部署位置：https://enka-proxy.twl-benchen.workers.dev (Cloudflare 後台 Workers & Pages → enka-proxy)
// 修改後要到 Cloudflare 後台貼上並重新 Deploy，這個檔案只是備份
// 只允許自己的網站、只轉發 /uid/9 或 10 位數字 和 /ui/圖示名.png，並照 Enka 的要求帶自訂 User-Agent
// /ui/：分享圖要把聖遺物圖示畫進 canvas，圖片必須允許跨網域，Enka 的圖片如果沒有允許就走這裡
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

    const path = new URL(req.url).pathname;
    const ui = path.match(/^\/ui\/([A-Za-z0-9_]+)\.png$/);
    if (ui) {
      const r = await fetch(`https://enka.network/ui/${ui[1]}.png`, { headers: { 'User-Agent': 'genshin-wish (github.com/twl-Benchen)' } });
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
      });
    }

    const m = path.match(/^\/uid\/(\d{9,10})\/?$/);
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
