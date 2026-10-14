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
  // 回傳 milestones[k-1][m] = 拿到第 k 隻、途中歪了 m 次的抽數分布 (trackMiss 為 false 時全部記在 m = 0)
  function chain(target, firstDraw, freshDraw, initState, step, keyOf, trackMiss) {
    const milestones = [];
    if (target <= 0) return milestones;
    let active = new Map();
    const init = Object.assign({}, initState, { m: 0 });
    active.set(keyOf(init) + '|0', { s: init, d: Float64Array.of(1), first: true });
    // 每輪讓所有狀態各出一隻五星
    for (let round = 0; active.size && round < 10 * target + 10; round++) {
      const next = new Map();
      for (const { s, d, first } of active.values()) {
        const nd = conv(d, first ? firstDraw : freshDraw);
        for (const o of step(s)) {
          if (o.p <= 0) continue;
          const ns = Object.assign({}, o.next, { got: s.got + (o.hit ? 1 : 0), m: s.m + (o.hit || !trackMiss ? 0 : 1) });
          if (o.hit) {
            const k = ns.got;
            const row = milestones[k - 1] || (milestones[k - 1] = []);
            row[ns.m] = addInto(row[ns.m] || new Float64Array(0), nd, o.p);
            if (k >= target) continue;
          }
          const key = keyOf(ns) + '|' + ns.m;
          const cur = next.get(key);
          if (cur) cur.d = addInto(cur.d, nd, o.p);
          else next.set(key, { s: ns, d: Float64Array.from(nd, (x) => x * o.p), first: false });
        }
      }
      active = next;
    }
    return milestones;
  }

  // 把「依歪的次數分開」的里程碑合併成單一分布
  function mergeMiss(milestones) {
    return milestones.map((row) => row.reduce((acc, d) => (d ? addInto(acc, d, 1) : acc), new Float64Array(0)));
  }

  // 捕獲明光：cr[c] = 計數為 c 時「本來會歪」轉為命中的機率
  const CR_PRESETS = {
    conservative: { cr: [0, 0, 0, 1], label: '保守：連歪 3 次後必中' },
    community: { cr: [0, 0, 0.5, 1], label: '社群推測：連歪 2 次後 75% 不歪' },
    none: { cr: [0, 0, 0, 0], label: '關閉 (5.0 前舊規則 50/50)' },
  };

  function characterMilestonesByMiss(opt, trackMiss) {
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
      (s) => s.got + '|' + (s.g ? 1 : 0) + '|' + s.c,
      trackMiss
    );
  }
  const characterMilestones = (opt) => mergeMiss(characterMilestonesByMiss(opt, false));

  // 武器池 (5.0 後命定值上限 1)：75% 為兩把 UP 之一，定軌那把 37.5%
  function weaponMilestonesByMiss(opt, trackMiss) {
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
      (s) => s.got + '|' + s.f,
      trackMiss
    );
  }
  const weaponMilestones = (opt) => mergeMiss(weaponMilestonesByMiss(opt, false));

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

  // ---- 星輝返還 ----
  // 官方：同一角色第 2~7 次獲得給命星與星輝 (四星 2、五星 10)，第 8 次起給 (四星 5、五星 25)
  // 四星、五星武器固定 2、10。第一次獲得角色不給星輝。
  const FOUR_RATE = { char: 0.13, weapon: 0.145 }; // 四星綜合機率
  // 四星組成：角色池 50% UP 角色 + 50% 常駐 (角色/武器約各半)；武器池 75% UP 武器 + 25% 常駐
  const FOUR_CHAR_SHARE = { char: 0.75, weapon: 0.125 };
  const STANDARD_5 = ['提納里', '夢見月瑞希', '琴', '莫娜', '刻晴', '迪希雅', '迪盧克', '七七'];

  // 第 q 次獲得同一隻五星角色返還的星輝
  function copyGlitter5(q) { return q <= 1 ? 0 : q <= 7 ? 10 : 25; }

  // 每抽平均從四星拿到的星輝 (c6 = 四星角色中已滿命的比例)
  function fourStarGlitterPerPull(pool, c6) {
    const share = FOUR_CHAR_SHARE[pool];
    return FOUR_RATE[pool] * (share * (2 + 3 * c6) + (1 - share) * 2);
  }

  // 第 l 次歪 (l 從 1 起) 的平均返還：常駐角色等機率出現，前 l-1 次歪會讓各角色的持有數增加
  // cons[i] = 目前命座 (-1 未持有，0~6)
  function lossGlitter(cons, l) {
    const K = cons.length;
    if (!K) return 0;
    const p = 1 / K;
    let total = 0;
    for (const c of cons) {
      const owned = Math.max(-1, Math.min(6, c | 0)) + 1; // 已持有的份數
      let binom = Math.pow(1 - p, l - 1); // h = 0
      for (let h = 0; h <= l - 1; h++) {
        total += p * binom * copyGlitter5(owned + h + 1);
        binom *= ((l - 1 - h) / (h + 1)) * (p / (1 - p));
      }
    }
    return total;
  }

  // 把抽數分布 (index = n) 換成實付抽數 a*n - b 的分布，非整數位置按距離拆給左右兩格，平均值不變
  function remapInto(out, d, a, b) {
    for (let n = 0; n < d.length; n++) {
      if (!d[n]) continue;
      const x = Math.max(0, a * n - b);
      const i = Math.floor(x), f = x - i;
      out[i] += d[n] * (1 - f);
      if (f > 0) out[i + 1] += d[n] * f;
    }
    return out;
  }
  function remapRow(row, a, bOf) {
    let len = 2;
    row.forEach((d) => { if (d) len = Math.max(len, d.length + 2); });
    const out = new Float64Array(len);
    row.forEach((d, m) => { if (d) remapInto(out, d, a, bOf(m)); });
    return out;
  }

  // 先抽角色、再抽武器；回傳各里程碑的累計分布
  // opt.refund = { c6: 0~1, standard: [命座...] } 時，另外算出扣掉星輝返還後的實付抽數分布 (net)
  function plan(opt) {
    const rf = opt.refund;
    const chM = characterMilestonesByMiss(opt.character, !!rf);
    const wpM = weaponMilestonesByMiss(opt.weapon, !!rf);
    const ch = mergeMiss(chM), wp = mergeMiss(wpM);
    const charFinal = ch.length ? ch[ch.length - 1] : Float64Array.of(1);
    const rows = [];
    ch.forEach((d, i) => rows.push({ kind: 'char', n: i + 1, dist: d }));
    wp.forEach((d, i) => rows.push({ kind: 'weapon', n: i + 1, dist: conv(charFinal, d) }));
    const total = rows.length ? rows[rows.length - 1].dist : Float64Array.of(1);
    if (!rf) return { rows, total };

    const c6 = Math.max(0, Math.min(1, +rf.c6 || 0));
    const cons = Array.isArray(rf.standard) ? rf.standard : [];
    const aC = 1 - fourStarGlitterPerPull('char', c6) / 5;
    const aW = 1 - fourStarGlitterPerPull('weapon', c6) / 5;
    const lossCum = [0];
    for (let l = 1; l <= 8; l++) lossCum[l] = lossCum[l - 1] + lossGlitter(cons, l);
    // 拿到第 k 隻 UP 前已入帳的 UP 返還 (UP 角色從未持有開始算)
    const upBefore = (k) => { let s = 0; for (let q = 1; q < k; q++) s += copyGlitter5(q); return s; };

    // 達成里程碑當下那顆五星的返還還沒拿到，不能拿來付這一抽，但可以拿去抽後面的武器
    const chNet = chM.map((row, i) => remapRow(row, aC, (m) => (upBefore(i + 1) + lossCum[m]) / 5));
    const K = chM.length;
    const charFinalNet = K ? remapRow(chM[K - 1], aC, (m) => (upBefore(K + 1) + lossCum[m]) / 5) : Float64Array.of(1);
    const wpNet = wpM.map((row, i) => remapRow(row, aW, (m) => (10 * (i + m)) / 5));
    let r = 0;
    chNet.forEach((d) => { rows[r++].net = d; });
    wpNet.forEach((d) => { rows[r++].net = conv(charFinalNet, d); });
    const totalNet = rows.length ? rows[rows.length - 1].net : Float64Array.of(1);
    return { rows, total, totalNet };
  }

  const api = {
    charHazard, weaponHazard, nextFiveStar, conv, characterMilestones, weaponMilestones, characterMilestonesByMiss, weaponMilestonesByMiss,
    stats, plan, CR_PRESETS, STANDARD_5, FOUR_RATE, fourStarGlitterPerPull, lossGlitter, copyGlitter5,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GachaEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
