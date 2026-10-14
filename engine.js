// 原神抽卡精確分布引擎 (馬可夫鏈 + 卷積，不用隨機模擬)
(function (root) {
  'use strict';

  // 角色池：1~73 抽 0.6%，74 抽起每抽 +6%，90 抽必出
  function charHazard(n) {
    if (n <= 73) return 0.006;
    if (n >= 90) return 1;
    return 0.006 + 0.06 * (n - 73);
  }
  // 武器池：1~62 抽 0.7%，63~73 抽每抽 +7%，74 抽起每抽 +3.5%，80 抽必出
  function weaponHazard(n) {
    if (n <= 62) return 0.007;
    if (n >= 80) return 1;
    if (n <= 73) return 0.007 + 0.07 * (n - 62);
    return 0.777 + 0.035 * (n - 73);
  }

  // 已墊 pity 抽後，「再抽幾抽出下一隻五星」的分布 (index = 抽數)
  function nextFiveStar(hazard, hardPity, pity) {
    pity = Math.max(0, Math.min(pity | 0, hardPity - 1));
    const out = new Float64Array(hardPity - pity + 1);
    let survive = 1;
    for (let k = 1; pity + k <= hardPity; k++) {
      const h = Math.min(1, hazard(pity + k));
      out[k] = survive * h;
      survive *= 1 - h;
    }
    return out;
  }

  function conv(a, b) {
    const out = new Float64Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) {
      const ai = a[i];
      if (ai === 0) continue;
      for (let j = 0; j < b.length; j++) out[i + j] += ai * b[j];
    }
    return out;
  }

  function addInto(target, src, w) {
    if (target.length < src.length) {
      const t = new Float64Array(src.length);
      t.set(target);
      target = t;
    }
    for (let i = 0; i < src.length; i++) target[i] += src[i] * w;
    return target;
  }

  // 通用：依「每次出五星時的狀態轉移」算出拿到第 1..target 隻目標的抽數分布
  // step(state) => [{p, hit:boolean, next:state}]
  function chain(target, firstDraw, freshDraw, initState, step, keyOf) {
    const milestones = [];
    if (target <= 0) return milestones;
    let active = new Map();
    active.set(keyOf(initState), { s: initState, d: Float64Array.of(1), first: true });
    // 每輪讓所有狀態各出一隻五星
    for (let round = 0; active.size && round < 10 * target + 10; round++) {
      const next = new Map();
      for (const { s, d, first } of active.values()) {
        const nd = conv(d, first ? firstDraw : freshDraw);
        for (const o of step(s)) {
          if (o.p <= 0) continue;
          const ns = Object.assign({}, o.next, { got: s.got + (o.hit ? 1 : 0) });
          if (o.hit) {
            const k = ns.got;
            milestones[k - 1] = addInto(milestones[k - 1] || new Float64Array(0), nd, o.p);
            if (k >= target) continue;
          }
          const key = keyOf(ns);
          const cur = next.get(key);
          if (cur) cur.d = addInto(cur.d, nd, o.p);
          else next.set(key, { s: ns, d: Float64Array.from(nd, (x) => x * o.p), first: false });
        }
      }
      active = next;
    }
    return milestones;
  }

  // 捕獲明光：cr[c] = 計數為 c 時「本來會歪」轉為命中的機率
  const CR_PRESETS = {
    conservative: { cr: [0, 0, 0, 1], label: '保守：連歪 3 次後必中' },
    community: { cr: [0, 0, 0.5, 1], label: '社群推測：連歪 2 次後 75% 不歪' },
    none: { cr: [0, 0, 0, 0], label: '關閉 (5.0 前舊規則 50/50)' },
  };

  function characterMilestones(opt) {
    const cr = opt.cr || CR_PRESETS.conservative.cr;
    const init = { got: 0, g: !!opt.guaranteed, c: Math.max(0, Math.min(3, opt.radiance | 0)) };
    return chain(
      opt.target | 0,
      nextFiveStar(charHazard, 90, opt.pity | 0),
      nextFiveStar(charHazard, 90, 0),
      init,
      (s) => {
        if (s.g) return [{ p: 1, hit: true, next: { g: false, c: s.c } }];
        const pc = cr[s.c] || 0;
        return [
          { p: 0.5, hit: true, next: { g: false, c: Math.max(0, s.c - 1) } },
          { p: 0.5 * pc, hit: true, next: { g: false, c: 1 } },
          { p: 0.5 * (1 - pc), hit: false, next: { g: true, c: Math.min(3, s.c + 1) } },
        ];
      },
      (s) => s.got + '|' + (s.g ? 1 : 0) + '|' + s.c
    );
  }

  // 武器池 (5.0 後命定值上限 1)：75% 為兩把 UP 之一，定軌那把 37.5%
  function weaponMilestones(opt) {
    const init = { got: 0, f: opt.fate ? 1 : 0 };
    return chain(
      opt.target | 0,
      nextFiveStar(weaponHazard, 80, opt.pity | 0),
      nextFiveStar(weaponHazard, 80, 0),
      init,
      (s) => s.f
        ? [{ p: 1, hit: true, next: { f: 0 } }]
        : [
            { p: 0.375, hit: true, next: { f: 0 } },
            { p: 0.625, hit: false, next: { f: 1 } },
          ],
      (s) => s.got + '|' + s.f
    );
  }

  function stats(d) {
    let mean = 0, total = 0;
    for (let i = 0; i < d.length; i++) { mean += i * d[i]; total += d[i]; }
    const cdf = new Float64Array(d.length);
    let acc = 0;
    for (let i = 0; i < d.length; i++) { acc += d[i]; cdf[i] = acc; }
    const q = (p) => { for (let i = 0; i < cdf.length; i++) if (cdf[i] >= p - 1e-12) return i; return cdf.length - 1; };
    let max = d.length - 1;
    while (max > 0 && d[max] < 1e-15) max--;
    let min = 0;
    while (min < max && d[min] < 1e-15) min++;
    return {
      mean, total, cdf, min, max,
      p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p99: q(0.99),
      within: (n) => (n < 0 ? 0 : n >= cdf.length ? 1 : cdf[n]),
    };
  }

  // 先抽角色、再抽武器；回傳各里程碑的累計分布
  function plan(opt) {
    const ch = characterMilestones(opt.character);
    const wp = weaponMilestones(opt.weapon);
    const charFinal = ch.length ? ch[ch.length - 1] : Float64Array.of(1);
    const rows = [];
    ch.forEach((d, i) => rows.push({ kind: 'char', n: i + 1, dist: d }));
    wp.forEach((d, i) => rows.push({ kind: 'weapon', n: i + 1, dist: conv(charFinal, d) }));
    const total = rows.length ? rows[rows.length - 1].dist : Float64Array.of(1);
    return { rows, total };
  }

  const api = { charHazard, weaponHazard, nextFiveStar, conv, characterMilestones, weaponMilestones, stats, plan, CR_PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GachaEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
