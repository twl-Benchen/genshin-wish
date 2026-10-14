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
        else if (Math.random() < 0.5) { got++; cc = Math.max(0, cc - 1); }
        else if (Math.random() < cr[cc]) { got++; cc = 1; }
        else { gg = true; cc = Math.min(3, cc + 1); }
      }
    }
    res.push(pulls);
  }
  return res;
}
function mcWeap(target, pity, f, N) {
  const res = [];
  for (let t = 0; t < N; t++) {
    let p = pity, ff = f, got = 0, pulls = 0;
    while (got < target) {
      p++; pulls++;
      if (Math.random() < E.weaponHazard(p)) {
        p = 0;
        if (ff) { got++; ff = 0; }
        else if (Math.random() < 0.375) got++;
        else ff = 1;
      }
    }
    res.push(pulls);
  }
  return res;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.ceil(q * s.length) - 1]; };

const N = 300000;
const cases = [
  { name: '角色 1 隻 全新', t: 1, pity: 0, g: false, c: 0 },
  { name: '角色 7 隻 (C6)', t: 7, pity: 0, g: false, c: 0 },
  { name: '角色 2 隻 墊50 大保底 明光2', t: 2, pity: 50, g: true, c: 2 },
];
for (const cs of cases) {
  for (const key of ['conservative', 'community']) {
    const cr = E.CR_PRESETS[key].cr;
    const ms = E.characterMilestones({ target: cs.t, pity: cs.pity, guaranteed: cs.g, radiance: cs.c, cr });
    const st = E.stats(ms[ms.length - 1]);
    const mc = mcChar(cs.t, cs.pity, cs.g, cs.c, cr, N);
    console.log(cs.name, key, '| exact', st.mean.toFixed(2), st.p50, st.p90, 'sum', st.total.toFixed(6),
      '| MC', mean(mc).toFixed(2), pct(mc, 0.5), pct(mc, 0.9));
  }
}
for (const [t, pity, f] of [[1, 0, 0], [5, 0, 0], [1, 40, 1]]) {
  const ms = E.weaponMilestones({ target: t, pity, fate: f });
  const st = E.stats(ms[ms.length - 1]);
  const mc = mcWeap(t, pity, f, N);
  console.log('武器', t, pity, f, '| exact', st.mean.toFixed(2), st.p50, st.p90, 'max', st.max, 'sum', st.total.toFixed(6),
    '| MC', mean(mc).toFixed(2), pct(mc, 0.5), pct(mc, 0.9));
}
// 單一五星期望
const one = E.stats(E.nextFiveStar(E.charHazard, 90, 0));
const onew = E.stats(E.nextFiveStar(E.weaponHazard, 80, 0));
console.log('角色池每隻五星期望', one.mean.toFixed(3), '武器池', onew.mean.toFixed(3));
const t0 = Date.now();
const pl = E.plan({ character: { target: 7, pity: 0, guaranteed: false, radiance: 0 }, weapon: { target: 5, pity: 0, fate: 0 } });
console.log('C6R5 plan', E.stats(pl.total).mean.toFixed(1), 'ms', Date.now() - t0);

// ---- 星輝返還：逐抽模擬四星 (含四星保底)、常駐角色命座、星輝餘額，跟引擎的實付抽數比對 ----
function four(pool, n) {
  if (pool === 'char') return n <= 8 ? 0.051 : n === 9 ? 0.561 : 1;
  return n <= 7 ? 0.06 : n === 8 ? 0.66 : n === 9 ? 0.96 : 1;
}
function mcRefund(o, N) {
  const cr = E.CR_PRESETS.conservative.cr;
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
    let p = 0, p4 = 0, g = false, c = 0, got = 0, up = 0;
    while (got < o.ct) {
      pull(); p++; p4++;
      if (Math.random() < E.charHazard(p)) {
        p = 0;
        let hit;
        if (g) { hit = true; g = false; }
        else if (Math.random() < 0.5) { hit = true; c = Math.max(0, c - 1); }
        else if (Math.random() < cr[c]) { hit = true; c = 1; }
        else { hit = false; g = true; c = Math.min(3, c + 1); }
        if (hit) { got++; up++; glitter += E.copyGlitter5(up); }
        else { const i = Math.floor(Math.random() * cons.length); cons[i]++; glitter += E.copyGlitter5(cons[i]); }
      } else if (Math.random() < four('char', p4)) { p4 = 0; fourStar('char'); }
    }
    // 武器池
    p = 0; p4 = 0; let f = 0; got = 0;
    while (got < o.wt) {
      pull(); p++; p4++;
      if (Math.random() < E.weaponHazard(p)) {
        p = 0; glitter += 10;
        if (f || Math.random() < 0.375) { got++; f = 0; } else f = 1;
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
];
for (const cs of refundCases) {
  const pl = E.plan({
    character: { target: cs.ct, pity: 0, guaranteed: false, radiance: 0 },
    weapon: { target: cs.wt, pity: 0, fate: 0 },
    refund: { c6: cs.c6, standard: cs.standard },
  });
  const sn = E.stats(pl.totalNet), sr = E.stats(pl.total);
  const mc = mcRefund(cs, 100000);
  console.log('返還', cs.name, '| exact 總抽', sr.mean.toFixed(2), '實付', sn.mean.toFixed(2), sn.p50, sn.p90,
    '| MC 總抽', mean(mc.raw).toFixed(2), '實付', mean(mc.res).toFixed(2), pct(mc.res, 0.5), pct(mc.res, 0.9), '四星率', (mc.fourRate * 100).toFixed(2) + '%');
}

// ---- 自訂抽的順序：最後一列的總分布不受順序影響，先抽的武器里程碑等於單抽武器 ----
{
  const base = { character: { target: 3, pity: 10, guaranteed: false, radiance: 1 }, weapon: { target: 2, pity: 5, fate: 0 }, refund: { c6: 0.5, standard: [0, 1, 2, 6, -1, 3, 6, 0] } };
  const a = E.plan(base), b = E.plan(Object.assign({}, base, { order: 'wcwcc' }));
  const w1 = E.stats(E.weaponMilestones(base.weapon)[0]).mean;
  console.log('順序', a.order, '→', b.order,
    '| 總抽', E.stats(a.total).mean.toFixed(3), E.stats(b.total).mean.toFixed(3),
    '| 實付', E.stats(a.totalNet).mean.toFixed(3), E.stats(b.totalNet).mean.toFixed(3),
    '| 先抽武器第 1 把', E.stats(b.rows[0].dist).mean.toFixed(3), '單算', w1.toFixed(3));
}
