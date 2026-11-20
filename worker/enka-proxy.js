// Cloudflare Worker：Enka.Network API 的中繼 (Enka 沒有開 CORS，GitHub Pages 的網頁不能直接呼叫)
// 部署位置：https://enka-proxy.twl-benchen.workers.dev (Cloudflare 後台 Workers & Pages → enka-proxy)
// 修改後要到 Cloudflare 後台貼上並重新 Deploy，這個檔案只是備份
// 只接受自己網站來的請求 (Origin 不在 ALLOW 就回 403，不轉發給 Enka)，只轉發 /uid/9 或 10 位數字 和 /ui/圖示名.png，並照 Enka 的要求帶自訂 User-Agent
// /ui/：分享圖要把聖遺物圖示畫進 canvas，圖片必須允許跨網域，Enka 的圖片如果沒有允許就走這裡
// /gacha：期望抽數頁匯入祈願紀錄用，轉發到米哈遊的 getGachaLog (國際服 public-operation-hk4e-sg.hoyoverse.com，cn=1 時改國服)
const ALLOW = ['https://twl-benchen.github.io'];
const UA = 'genshin-wish (github.com/twl-Benchen)';
// /gacha 轉發時保留的參數，其他一律丟掉
const GACHA_KEYS = ['authkey', 'authkey_ver', 'sign_type', 'auth_appid', 'init_type', 'lang', 'game_biz', 'region', 'gacha_type', 'page', 'size', 'end_id'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    // 沒有 Origin (curl、伺服器程式) 或別的網站來的請求一律擋掉，避免別人借用這個中繼大量查詢，害自己的 User-Agent 被 Enka 限流
    if (!ALLOW.includes(origin)) return new Response('Forbidden', { status: 403 });
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors });

    const path = new URL(req.url).pathname;
    const ui = path.match(/^\/ui\/([A-Za-z0-9_]+)\.png$/);
    if (ui) {
      const r = await fetch(`https://enka.network/ui/${ui[1]}.png`, { headers: { 'User-Agent': UA } });
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' },
      });
    }

    // /gacha：期望抽數頁的「匯入祈願紀錄」，轉發一頁原神祈願紀錄 (米哈遊的 API 也沒有開 CORS)
    // 只轉發到固定的 getGachaLog，只帶白名單參數；網址裡有 authkey，所以不記錄、不快取
    if (path === '/gacha') {
      const q = new URL(req.url).searchParams;
      if (!q.get('authkey')) return new Response('缺少 authkey', { status: 400, headers: cors });
      if (!/^(301|302)$/.test(q.get('gacha_type') || '')) return new Response('gacha_type 只能是 301 或 302', { status: 400, headers: cors });
      const host = q.get('cn') === '1' ? 'public-operation-hk4e.mihoyo.com' : 'public-operation-hk4e-sg.hoyoverse.com';
      const out = new URL(`https://${host}/gacha_info/api/getGachaLog`);
      for (const k of GACHA_KEYS) { const v = q.get(k); if (v != null) out.searchParams.set(k, v); }
      const r = await fetch(out.toString(), { headers: { 'User-Agent': UA } });
      return new Response(await r.text(), {
        status: r.status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const m = path.match(/^\/uid\/(\d{9,10})\/?$/);
    if (!m) return new Response('用法：/uid/你的UID', { status: 400, headers: cors });

    const r = await fetch(`https://enka.network/api/uid/${m[1]}/`, { headers: { 'User-Agent': UA } });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};
