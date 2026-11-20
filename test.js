const E = require('./engine.js');

function mcChar(target, pity, g, c, cr, N) {
  const res = [];
  for (let t = 0; t < N; t++) {
    let p = pity, gg = g, cc = c, got = 0, pulls = 0;
    while (got < target) {
      p++; pulls++;
      if (Math.random() < E.charHazard(p)) {
        p = 0;
        if (gg) { got++; gg = false; }
        else if (cc >= 3 && cr[3] >= 1) { got++; cc = 1; }
        else if (Math.random() < 0.5) { got++; cc = Math.max(0, cc - 1); }
        else if (Math.random() < cr[cc]) { got++; cc = 1; }
        else { gg = true; cc = Math.min(3, cc + 1); }
      }
    }
    res.push(pulls);
  }
  return res;
}
// 武器池：兩把 UP (A 為目前定軌)、命定值、歪常駐的大保底、定軌策略
function mcWeap(o, N) {
  const res = [];
  const [ta, tb] = o.targets;
  for (let t = 0; t < N; t++) {
    let p = o.pity || 0, a = ta, b = tb, c = 'A', f = o.fate ? 1 : 0, g = o.guaranteed ? 1 : 0, pulls = 0;
    while (a + b > 0) {
      p++; pulls++;
      if (Math.random() < E.weaponHazard(p)) {
        p = 0;
        const d = E.weaponDecide(o.strategy || 'optimal', a, b, c, f, g);
        c = d.c; f = d.f;
        let x;
        if (f) x = c;
        else if (g) x = Math.random() < 0.5 ? 'A' : 'B';
        else { const r = Math.random(); x = r < 0.375 ? 'A' : r < 0.75 ? 'B' : 'S'; }
        if (x === 'A' && a > 0) a--;
        if (x === 'B' && b > 0) b--;
        f = x === c ? 0 : 1;
        g = x === 'S' ? 1 : 0;
      }
    }
    res.push(pulls);
  }
  return res;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.ceil(q * s.length) - 1]; };

// 捕獲明光的長期小保底勝率 (只看小保底，大保底不改計數)
function longRunWin(cr) {
  const step = (c) => {
    if (c >= 3 && cr[3] >= 1) return [[1, 1, 1]];
    const p = cr[c] || 0;
    return [[0.5, 1, Math.max(0, c - 1)], [0.5 * p, 1, 1], [0.5 * (1 - p), 0, Math.min(3, c + 1)]];
  };
  let pi = [1, 0, 0, 0];
  for (let it = 0; it < 5000; it++) {
    const nx = [0, 0, 0, 0];
    pi.forEach((w, c) => step(c).forEach(([p, , n]) => { nx[n] += w * p; }));
    pi = nx;
  }
  return pi.reduce((s, w, c) => s + w * step(c).reduce((t, [p, up]) => t + p * up, 0), 0);
}
for (const key of ['official', 'conservative', 'community', 'none']) {
  const cr = E.CR_PRESETS[key].cr;
  console.log('明光', key, 'cr', cr.map((x) => +x.toFixed(6)).join(', '), '長期小保底勝率', (longRunWin(cr) * 100).toFixed(4) + '%');
}
{
  const cr = E.CR_PRESETS.official.cr;
  console.log('official 計數 0 每顆小保底明光機率', (0.5 * cr[0] * 100).toFixed(4) + '% (官方 0.018%)');
}

const N = 300000;
const cases = [
  { name: '角色 1 隻 全新', t: 1, pity: 0, g: false, c: 0 },
  { name: '角色 7 隻 (C6)', t: 7, pity: 0, g: false, c: 0 },
  { name: '角色 2 隻 墊50 大保底 明光2', t: 2, pity: 50, g: true, c: 2 },
];
for (const cs of cases) {
  for (const key of ['official', 'conservative', 'community']) {
    const cr = E.CR_PRESETS[key].cr;
    const ms = E.characterMilestones({ target: cs.t, pity: cs.pity, guaranteed: cs.g, radiance: cs.c, cr });
    const st = E.stats(ms[ms.length - 1]);
    const mc = mcChar(cs.t, cs.pity, cs.g, cs.c, cr, N);
    console.log(cs.name, key, '| exact', st.mean.toFixed(2), st.p50, st.p90, 'sum', st.total.toFixed(6),
      '| MC', mean(mc).toFixed(2), pct(mc, 0.5), pct(mc, 0.9));
  }
}
const weaponCases = [
  { name: '武器 1 把 全新', targets: [1, 0], pity: 0 },
  { name: '武器 5 把 全新', targets: [5, 0], pity: 0 },
  { name: '武器 1 把 墊40 命定值1', targets: [1, 0], pity: 40, fate: 1 },
  { name: '武器 1 把 上期歪常駐 (大保底、命定值0)', targets: [1, 0], pity: 0, guaranteed: 1 },
  { name: '兩把各 1 最佳策略', targets: [1, 1], pity: 0, strategy: 'optimal' },
  { name: '兩把各 1 缺得多', targets: [1, 1], pity: 0, strategy: 'more' },
  { name: '兩把各 1 分開抽', targets: [1, 1], pity: 0, strategy: 'separate' },
  { name: '兩把 3+2 墊20 命定值1 大保底 最佳', targets: [3, 2], pity: 20, fate: 1, guaranteed: 1, strategy: 'optimal' },
  { name: '兩把 1+3 最佳 (先改定軌另一把)', targets: [1, 3], pity: 0, strategy: 'optimal' },
];
for (const cs of weaponCases) {
  const ms = E.weaponMilestones(cs);
  const st = E.stats(ms[ms.length - 1]);
  const mc = mcWeap(cs, N);
  console.log(cs.name, '| exact', st.mean.toFixed(2), st.p50, st.p90, 'max', st.max, 'sum', st.total.toFixed(6),
    '| MC', mean(mc).toFixed(2), pct(mc, 0.5), pct(mc, 0.9), 'max', mc.reduce((x, y) => Math.max(x, y), 0));
}
// 影片 (一棵平衡樹) 的數值：兩把各 1，從零開始、歪常駐後
{
  const v0 = E.weaponAdvice([1, 1], 0, 0), v1 = E.weaponAdvice([1, 1], 1, 1);
  console.log('影片 1+1 從零 最佳', v0.expected.optimal, '(2.5625) 一般', v0.expected.separate, '(2.640625)',
    '| 歪常駐後 繼續抽', v1.keep, '(2.625) 重新定軌', v1.best, '(2.3125) 建議', v1.action);
  for (const n of [1, 2, 3, 5]) {
    const v = E.weaponAdvice([n, n], 0, 0).expected;
    console.log(`  ${n}+${n} 最佳 ${v.optimal.toFixed(4)} 缺得多 ${v.more.toFixed(4)} (省 ${((1 - v.optimal / v.more) * 100).toFixed(1)}%) 分開抽 ${v.separate.toFixed(4)} (省 ${((1 - v.optimal / v.separate) * 100).toFixed(1)}%)`);
  }
}
// 單一五星期望
const one = E.stats(E.nextFiveStar(E.charHazard, 90, 0));
const onew = E.stats(E.nextFiveStar(E.weaponHazard, 80, 0));
console.log('角色池每隻五星期望', one.mean.toFixed(3), '武器池', onew.mean.toFixed(3), '武器最多', onew.max, '抽');
const t0 = Date.now();
const pl = E.plan({ character: { target: 7, pity: 0, guaranteed: false, radiance: 0 }, weapon: { target: 5, pity: 0, fate: 0 } });
console.log('C6R5 plan', E.stats(pl.total).mean.toFixed(1), 'ms', Date.now() - t0);
{
  const t1 = Date.now();
  const big = E.plan({ character: { targets: [7, 7], pity: 0, radiance: 0 }, weapon: { targets: [5, 5], pity: 0 }, refund: { c6: 0.5, standard: [0, 0, 0, 0, 0, 0, 0, 0] } });
  console.log('雙滿命 + 兩把精5 含返還 plan', E.stats(big.total).mean.toFixed(1), 'ms', Date.now() - t1);
}

// ---- 星輝返還：逐抽模擬四星 (含四星保底)、常駐角色命座、星輝餘額，跟引擎的實付抽數比對 ----
function four(pool, n) {
  if (pool === 'char') return n <= 8 ? 0.051 : n === 9 ? 0.561 : 1;
  return n <= 7 ? 0.06 : n === 8 ? 0.66 : n === 9 ? 0.96 : 1;
}
function mcRefund(o, N) {
  const cr = E.CR_PRESETS.official.cr;
  const res = [], raw = [];
  let fours = 0, allPulls = 0;
  for (let t = 0; t < N; t++) {
    const cons = o.standard.map((c) => c + 1); // 持有份數
    let glitter = 0, paid = 0, pulls = 0;
    const pull = () => {
      if (glitter >= 5) glitter -= 5; else paid++;
      pulls++;
    };
    const fourStar = (pool) => {
      fours++;
      const isChar = Math.random() < (pool === 'char' ? 0.75 : 0.125);
      glitter += isChar && Math.random() < o.c6 ? 5 : 2;
    };
    // 角色池
    let p = 0, p4 = 0, g = false, c = 0, got = 0;
    const seq = o.charSeq || 'c'.repeat(o.ct); // 第幾隻 UP 是哪一隻角色
    const copies = { c: 0, d: 0 };
    while (got < o.ct) {
      pull(); p++; p4++;
      if (Math.random() < E.charHazard(p)) {
        p = 0;
        let hit;
        if (g) { hit = true; g = false; }
        else if (c >= 3) { hit = true; c = 1; }
        else if (Math.random() < 0.5) { hit = true; c = Math.max(0, c - 1); }
        else if (Math.random() < cr[c]) { hit = true; c = 1; }
        else { hit = false; g = true; c = Math.min(3, c + 1); }
        if (hit) { const who = seq[got]; got++; copies[who]++; glitter += E.copyGlitter5(copies[who]); }
        else { const i = Math.floor(Math.random() * cons.length); cons[i]++; glitter += E.copyGlitter5(cons[i]); }
      } else if (Math.random() < four('char', p4)) { p4 = 0; fourStar('char'); }
    }
    // 武器池 (兩把 UP、大保底、最佳策略)
    p = 0; p4 = 0;
    let wa = o.wt, wb = o.wt2 || 0, wc = 'A', wf = 0, wg = 0;
    while (wa + wb > 0) {
      pull(); p++; p4++;
      if (Math.random() < E.weaponHazard(p)) {
        p = 0; glitter += 10;
        const d = E.weaponDecide('optimal', wa, wb, wc, wf, wg);
        wc = d.c; wf = d.f;
        let x;
        if (wf) x = wc;
        else if (wg) x = Math.random() < 0.5 ? 'A' : 'B';
        else { const r = Math.random(); x = r < 0.375 ? 'A' : r < 0.75 ? 'B' : 'S'; }
        if (x === 'A' && wa > 0) wa--;
        if (x === 'B' && wb > 0) wb--;
        wf = x === wc ? 0 : 1; wg = x === 'S' ? 1 : 0;
      } else if (Math.random() < four('weapon', p4)) { p4 = 0; fourStar('weapon'); }
    }
    allPulls += pulls;
    res.push(paid); raw.push(pulls);
  }
  return { res, raw, fourRate: fours / allPulls };
}
const refundCases = [
  { name: '角色 1 隻 四星滿命 0%', ct: 1, wt: 0, c6: 0, standard: [-1, -1, 0, 0, 0, 0, 0, 0] },
  { name: '角色 7 隻 四星滿命 50%', ct: 7, wt: 0, c6: 0.5, standard: [0, 1, 2, 6, -1, 3, 6, 0] },
  { name: '滿命精5 四星滿命 100% 常駐全滿', ct: 7, wt: 5, c6: 1, standard: [6, 6, 6, 6, 6, 6, 6, 6] },
  { name: '兩隻角色 2+1 (順序 cdc) 加兩把武器 1+1', ct: 3, charSeq: 'cdc', wt: 1, wt2: 1, c6: 0.25, standard: [0, 0, 0, 0, 0, 0, 0, 0] },
];
for (const cs of refundCases) {
  const seq = cs.charSeq || 'c'.repeat(cs.ct);
  const pl = E.plan({
    character: { targets: [seq.split('c').length - 1, seq.split('d').length - 1], pity: 0, guaranteed: false, radiance: 0 },
    weapon: { targets: [cs.wt, cs.wt2 || 0], pity: 0, fate: 0 },
    refund: { c6: cs.c6, standard: cs.standard },
    order: seq,
  });
  const sn = E.stats(pl.totalNet), sr = E.stats(pl.total);
  const mc = mcRefund(cs, 100000);
  console.log('返還', cs.name, '| exact 總抽', sr.mean.toFixed(2), '實付', sn.mean.toFixed(2), sn.p50, sn.p90,
    '| MC 總抽', mean(mc.raw).toFixed(2), '實付', mean(mc.res).toFixed(2), pct(mc.res, 0.5), pct(mc.res, 0.9), '四星率', (mc.fourRate * 100).toFixed(2) + '%');
}

// ---- 自訂抽的順序：最後一列的總分布不受順序影響，先抽的武器里程碑等於單抽武器 ----
{
  const base = { character: { targets: [2, 1], pity: 10, guaranteed: false, radiance: 1 }, weapon: { targets: [1, 1], pity: 5, fate: 0 }, refund: { c6: 0.5, standard: [0, 1, 2, 6, -1, 3, 6, 0] } };
  const a = E.plan(base), b = E.plan(Object.assign({}, base, { order: 'wcwdc' }));
  const w1 = E.stats(E.weaponMilestones(base.weapon)[0]).mean;
  console.log('順序', a.order, '→', b.order,
    '| 總抽', E.stats(a.total).mean.toFixed(3), E.stats(b.total).mean.toFixed(3),
    '| 實付', E.stats(a.totalNet).mean.toFixed(3), E.stats(b.totalNet).mean.toFixed(3),
    '| 先抽武器第 1 把', E.stats(b.rows[0].dist).mean.toFixed(3), '單算', w1.toFixed(3));
}

// ---- 兩隻角色：總抽數只看總共幾隻 UP ----
{
  const a = E.plan({ character: { targets: [2, 1], pity: 30, radiance: 1 }, weapon: { targets: [0, 0] } });
  const b = E.plan({ character: { target: 3, pity: 30, radiance: 1 }, weapon: { target: 0 } });
  console.log('角色 2+1 vs 3 隻', E.stats(a.total).mean.toFixed(4), E.stats(b.total).mean.toFixed(4), '列', a.rows.map((r) => r.who + r.n).join(' '));
}

// ---- 匯入祈願紀錄：墊抽、大保底、明光計數推算 ----
{
  const assert = require('assert');
  const row = (name, rank, time) => ({ name, rank_type: String(rank), time });
  const fill = (n, time) => Array.from({ length: n }, () => row('黎明神劍', 3, time));
  // 新到舊：最新 12 抽沒出金，再來是歪了的琴
  const char = [...fill(12, '2026-11-20 10:00:00'), row('琴', 5, '2026-11-01 10:00:00'), ...fill(50, '2026-10-01 10:00:00'),
    row('芙寧娜', 5, '2026-09-01 10:00:00'), ...fill(70, '2026-08-01 10:00:00'), row('那維萊特', 5, '2026-07-01 10:00:00'),
    ...fill(5, '2026-06-01 10:00:00'), row('迪盧克', 5, '2026-05-01 10:00:00')];
  // 舊到新：迪盧克 (歪)、那維萊特 (大保底)、芙寧娜、琴 (歪)
  const r = E.analyzeGachaLog(char, null).char;
  assert.strictEqual(r.pity, 12);
  assert.strictEqual(r.guaranteed, true);
  assert.deepStrictEqual([r.radianceSure, r.radianceRange], [false, [1, 2]]);
  // 連歪三次 (中間都是大保底) 之後，第三次歪完計數一定是 3，不受起點影響
  // 舊到新：歪 → 大保底 UP，重複三輪，計數一定到 3
  const lose3 = [];
  for (let k = 1; k <= 3; k++) lose3.push(row('琴', 5, `2026-0${k}-01 10:00:00`), row('芙寧娜', 5, `2026-0${k}-15 10:00:00`));
  lose3.reverse();
  const r3 = E.analyzeGachaLog(lose3, null).char;
  console.log('匯入 連歪', r3.radiance, r3.radianceSure, r3.radianceRange);
  assert.strictEqual(r3.radiance, 3);
  assert.strictEqual(r3.radianceSure, true);
  // 再多一顆 UP：計數 3 必定觸發，回到 1
  const r4 = E.analyzeGachaLog([row('芙寧娜', 5, '2026-06-01 10:00:00'), ...lose3], null).char;
  assert.deepStrictEqual([r4.radiance, r4.radianceSure, r4.guaranteed], [1, true, false]);
  // 武器：最新一把是常駐 → 大保底
  const wp = [...fill(7, '2026-11-20 10:00:00'), row('天空之刃', 5, '2026-11-10 10:00:00'), ...fill(3, '2026-11-01 10:00:00')];
  const w = E.analyzeGachaLog(null, wp, { today: '2026-11-21' }).weapon;
  assert.deepStrictEqual([w.pity, w.guaranteed, w.daysAgo], [7, true, 11]);
  // 沒有五星：墊抽就是全部筆數
  assert.strictEqual(E.analyzeGachaLog(fill(33, '2026-11-01'), null).char.pity, 33);
  // 網址解析
  const p = E.parseGachaUrl('複製 https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?win_mode=fullscreen&authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&gacha_id=x&lang=zh-tw&region=os_cht&authkey=ab%2Bc%3D&game_biz=hk4e_global#/log 結束');
  assert.deepStrictEqual(p.params, { authkey: 'ab+c=', authkey_ver: '1', sign_type: '2', game_biz: 'hk4e_global', region: 'os_cht' });
  assert.strictEqual(p.cn, false);
  assert.strictEqual(E.parseGachaUrl('https://example.com/?a=1'), null);
  console.log('匯入祈願紀錄 測試通過', r.pity, r.guaranteed, r.radiance, r.radianceSure);
}
