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
