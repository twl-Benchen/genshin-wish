// 原神抽卡精確分布引擎 (馬可夫鏈 + 卷積，不用隨機模擬)
(function (root) {
  'use strict';

  // 角色池：1~73 抽 0.6%，74 抽起每抽 +6%，90 抽必出
  function charHazard(n) {
    if (n <= 73) return 0.006;
    if (n >= 90) return 1;
    return 0.006 + 0.06 * (n - 73);
  }
  // 武器池：1~62 抽 0.7%，63 抽起每抽 +7%，第 77 抽達 100% (官方標示 80 抽保底，實際 77 抽就必出)
  const WEAPON_HARD = 77;
  function weaponHazard(n) {
    if (n <= 62) return 0.007;
    return Math.min(1, 0.007 + 0.07 * (n - 62));
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

  // 角色目標：targets = [角色一幾隻, 角色二幾隻]。兩個角色活動祈願共享墊抽、大保底與明光計數，
  // 每次拿到 UP 都可以選在哪個祈願抽，所以總抽數只跟「總共要幾隻 UP」有關
  function characterTargets(opt) {
    if (Array.isArray(opt.targets)) return [Math.max(0, opt.targets[0] | 0), Math.max(0, opt.targets[1] | 0)];
    return [Math.max(0, opt.target | 0), 0];
  }

  function characterMilestonesByMiss(opt, trackMiss) {
    const cr = opt.cr || CR_PRESETS.conservative.cr;
    const init = { got: 0, g: !!opt.guaranteed, c: Math.max(0, Math.min(3, opt.radiance | 0)) };
    const [t1, t2] = characterTargets(opt);
    return chain(
      t1 + t2,
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

  // ---- 武器活動祈願 ----
  // 兩把 UP 武器 A (目前定軌的那把) 與 B (另一把)。每出一把五星：
  //   命定值 f = 1：必定是定軌那把
  //   大保底 g = 1 (上一把五星是常駐)：A、B 各 50%
  //   都沒有：A 37.5%、B 37.5%、常駐 25% (歪常駐後 g = 1)
  // 抽到的不是定軌那把 (另一把 UP 或常駐)，命定值變 1；抽到定軌那把，命定值歸 0。
  // 每出一把五星之前都可以換定軌或取消再重新定軌，兩種操作都會讓命定值歸 0，大保底不受影響。
  // 命定值在這期武器池結束時歸 0，大保底會跨期保留。
  function weaponOutcomes(c, f, g) {
    if (f) return [[1, c]];
    if (g) return [[0.5, 'A'], [0.5, 'B']];
    return [[0.375, 'A'], [0.375, 'B'], [0.25, 'S']];
  }
  function weaponAfter(a, b, c, x) {
    const hit = (x === 'A' && a > 0) || (x === 'B' && b > 0);
    return {
      a: a - (x === 'A' && a > 0 ? 1 : 0), b: b - (x === 'B' && b > 0 ? 1 : 0),
      c, f: x === c ? 0 : 1, g: x === 'S' ? 1 : 0, hit,
    };
  }
  // 出下一把五星前能做的選擇：維持現狀、定軌 A (命定值歸 0)、定軌 B (命定值歸 0)
  function weaponOptions(c, f) {
    const out = [{ c, f }];
    if (f || c !== 'A') out.push({ c: 'A', f: 0 });
    if (f || c !== 'B') out.push({ c: 'B', f: 0 });
    return out;
  }

  // 最佳策略：V(a, b, c, f, g) = 還要幾把五星才能湊齊 A a 把、B b 把的最小期望。
  // 每把五星的抽數獨立同分布，所以期望五星數最小，期望抽數也最小。
  const weaponV = new Map();
  const vKey = (a, b, c, f, g) => a + ',' + b + ',' + c + ',' + f + ',' + g;
  function weaponQ(a, b, c, f, g, d) {
    let q = 1;
    for (const [p, x] of weaponOutcomes(d.c, d.f, g)) {
      const n = weaponAfter(a, b, d.c, x);
      q += p * weaponValue(n.a, n.b, n.c, n.f, n.g);
    }
    return q;
  }
  function solveLayer(a, b) {
    // 同一層 (a, b 不變) 的狀態互相轉移，用值迭代求解；轉到較低層的值已經算好
    const states = [];
    for (const c of ['A', 'B']) for (const f of [0, 1]) for (const g of [0, 1]) states.push([c, f, g]);
    states.forEach(([c, f, g]) => weaponV.set(vKey(a, b, c, f, g), 0));
    for (let it = 0; it < 500; it++) {
      let delta = 0;
      for (const [c, f, g] of states) {
        let best = Infinity;
        for (const d of weaponOptions(c, f)) best = Math.min(best, weaponQ(a, b, c, f, g, d));
        const k = vKey(a, b, c, f, g);
        delta = Math.max(delta, Math.abs(best - weaponV.get(k)));
        weaponV.set(k, best);
      }
      if (delta < 1e-13) break;
    }
  }
  function weaponValue(a, b, c, f, g) {
    if (a <= 0 && b <= 0) return 0;
    const k = vKey(a, b, c, f, g);
    if (!weaponV.has(k)) solveLayer(a, b);
    return weaponV.get(k);
  }

  // 依策略決定這把五星前要不要換定軌
  // optimal：最佳策略 (動態規劃)
  // more：定軌缺得多的那把，沒有命定值時才換，從不重設命定值
  // separate：分開抽，定軌一把抽滿再換另一把
  const WEAPON_STRATEGIES = ['optimal', 'more', 'separate'];
  function weaponDecide(strategy, a, b, c, f, g) {
    const need = (x) => (x === 'A' ? a : b);
    const o = c === 'A' ? 'B' : 'A';
    if (strategy === 'separate' || strategy === 'more') {
      if (need(c) === 0) return need(o) > 0 ? { c: o, f: 0 } : { c, f };
      if (strategy === 'more' && !f && need(o) > need(c)) return { c: o, f: 0 };
      return { c, f };
    }
    const opts = weaponOptions(c, f);
    let best = opts[0], bq = weaponQ(a, b, c, f, g, opts[0]);
    for (let i = 1; i < opts.length; i++) {
      const q = weaponQ(a, b, c, f, g, opts[i]);
      if (q < bq - 1e-9) { best = opts[i]; bq = q; } // 一樣好時維持現狀，少一次操作
    }
    return best;
  }

  // 依策略算某個狀態還要幾把五星的期望 (用來比較抽法)
  const policyV = { more: new Map(), separate: new Map() };
  function weaponExpected(strategy, a, b, c, f, g) {
    if (!policyV[strategy]) return weaponValue(a, b, c, f, g);
    if (a <= 0 && b <= 0) return 0;
    const memo = policyV[strategy];
    const k = vKey(a, b, c, f, g);
    if (memo.has(k)) return memo.get(k);
    // 固定策略：同一層的狀態互相轉移，直接迭代；轉到較低層就遞迴
    const layer = [];
    for (const cc of ['A', 'B']) for (const ff of [0, 1]) for (const gg of [0, 1]) layer.push([cc, ff, gg]);
    const val = new Map(layer.map(([cc, ff, gg]) => [vKey(a, b, cc, ff, gg), 0]));
    for (let it = 0; it < 500; it++) {
      let delta = 0;
      for (const [cc, ff, gg] of layer) {
        const d = weaponDecide(strategy, a, b, cc, ff, gg);
        let q = 1;
        for (const [p, x] of weaponOutcomes(d.c, d.f, gg)) {
          const n = weaponAfter(a, b, d.c, x);
          q += p * (n.a === a && n.b === b ? val.get(vKey(a, b, n.c, n.f, n.g)) : weaponExpected(strategy, n.a, n.b, n.c, n.f, n.g));
        }
        const kk = vKey(a, b, cc, ff, gg);
        delta = Math.max(delta, Math.abs(q - val.get(kk)));
        val.set(kk, q);
      }
      if (delta < 1e-13) break;
    }
    val.forEach((v, kk) => memo.set(kk, v));
    return memo.get(k);
  }

  // 目前這一步的最佳做法：維持、取消再重新定軌同一把、或改定軌另一把
  // targets = [A 要幾把, B 要幾把]，A 是目前定軌的那把。回傳各抽法還要幾把五星的期望
  function weaponAdvice(targets, fate, guaranteed) {
    const a = Math.max(0, targets[0] | 0), b = Math.max(0, targets[1] | 0);
    const f = fate ? 1 : 0, g = guaranteed ? 1 : 0;
    if (a + b === 0) return null;
    const keepQ = weaponQ(a, b, 'A', f, g, { c: 'A', f });
    const d = weaponDecide('optimal', a, b, 'A', f, g);
    const bestQ = weaponQ(a, b, 'A', f, g, d);
    const action = d.c === 'B' ? 'switch' : d.f !== f ? 'reset' : 'keep';
    const expected = {};
    WEAPON_STRATEGIES.forEach((s) => { expected[s] = weaponExpected(s, a, b, 'A', f, g); });
    return { action, keep: keepQ, best: bestQ, expected };
  }

  function weaponTargets(opt) {
    if (Array.isArray(opt.targets)) return [Math.max(0, opt.targets[0] | 0), Math.max(0, opt.targets[1] | 0)];
    return [Math.max(0, opt.target | 0), 0];
  }

  // 武器池里程碑：第 k 把「還需要的」UP 武器 (A 或 B 任一) 到手時的抽數分布
  function weaponMilestonesByMiss(opt, trackMiss) {
    const [a0, b0] = weaponTargets(opt);
    const strategy = WEAPON_STRATEGIES.includes(opt.strategy) ? opt.strategy : 'optimal';
    const init = { got: 0, a: a0, b: b0, c: 'A', f: opt.fate ? 1 : 0, g: opt.guaranteed ? 1 : 0 };
    return chain(
      a0 + b0,
      nextFiveStar(weaponHazard, 80, opt.pity | 0),
      nextFiveStar(weaponHazard, 80, 0),
      init,
      (s) => {
        const d = weaponDecide(strategy, s.a, s.b, s.c, s.f, s.g);
        return weaponOutcomes(d.c, d.f, s.g).map(([p, x]) => {
          const n = weaponAfter(s.a, s.b, d.c, x);
          return { p, hit: n.hit, next: { a: n.a, b: n.b, c: n.c, f: n.f, g: n.g } };
        });
      },
      (s) => vKey(s.a, s.b, s.c, s.f, s.g),
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

  // 依抽的順序回傳各里程碑的累計分布
  // opt.order = 'c' (角色一)、'd' (角色二)、'w' (武器) 組成的字串或陣列 (例如 'ccdwc')，省略時照角色一、角色二、武器
  // 兩個卡池的保底互不影響，所以「拿到 a 隻角色、b 把武器」的總抽數 = 角色 a 隻的抽數 + 武器 b 把的抽數，直接卷積
  // 武器的里程碑是「第 k 把還需要的 UP 武器」，兩把都要時先到手的是哪一把由運氣決定，所以不分 A、B
  // opt.refund = { c6: 0~1, standard: [命座...] } 時，另外算出扣掉星輝返還後的實付抽數分布 (net)
  function normalizeOrder(order, C1, W, C2) {
    C2 = C2 | 0;
    const want = { c: C1 | 0, d: C2, w: W | 0 };
    const have = { c: 0, d: 0, w: 0 };
    const seq = [];
    for (const k of order || []) if (want[k] != null && have[k] < want[k]) { seq.push(k); have[k]++; }
    for (const k of ['c', 'd', 'w']) while (have[k] < want[k]) { seq.push(k); have[k]++; }
    return seq;
  }

  function plan(opt) {
    const rf = opt.refund;
    const [t1, t2] = characterTargets(opt.character);
    const chM = characterMilestonesByMiss(opt.character, !!rf);
    const wpM = weaponMilestonesByMiss(opt.weapon, !!rf);
    const one = Float64Array.of(1);
    const chRaw = [one].concat(mergeMiss(chM)), wpRaw = [one].concat(mergeMiss(wpM));
    const order = normalizeOrder(opt.order, t1, wpM.length, t2);
    // 第 j 隻 UP 角色是誰：照順序裡的 c、d 分配，返還要分開算各自的第幾次獲得
    const charSeq = order.filter((k) => k !== 'w');
    const copyNo = [];
    const seen = { c: 0, d: 0 };
    charSeq.forEach((k) => { seen[k]++; copyNo.push(seen[k]); });

    let chExcl, chFull, wpExcl, wpFull;
    if (rf) {
      const c6 = Math.max(0, Math.min(1, +rf.c6 || 0));
      const cons = Array.isArray(rf.standard) ? rf.standard : [];
      const aC = 1 - fourStarGlitterPerPull('char', c6) / 5;
      const aW = 1 - fourStarGlitterPerPull('weapon', c6) / 5;
      const lossCum = [0];
      for (let l = 1; l <= 8; l++) lossCum[l] = lossCum[l - 1] + lossGlitter(cons, l);
      // 拿到第 k 隻 UP 前已入帳的 UP 返還 (兩隻 UP 角色都從未持有開始算，各自計第幾次獲得)
      const upBefore = (k) => { let s = 0; for (let q = 1; q < k && q <= copyNo.length; q++) s += copyGlitter5(copyNo[q - 1]); return s; };
      // excl：達成當下那顆五星的返還還沒拿到，不能付自己這一抽；full：已入帳，可以拿去抽另一個卡池
      chExcl = [one].concat(chM.map((row, i) => remapRow(row, aC, (m) => (upBefore(i + 1) + lossCum[m]) / 5)));
      chFull = [one].concat(chM.map((row, i) => remapRow(row, aC, (m) => (upBefore(i + 2) + lossCum[m]) / 5)));
      wpExcl = [one].concat(wpM.map((row, i) => remapRow(row, aW, (m) => (10 * (i + m)) / 5)));
      wpFull = [one].concat(wpM.map((row, i) => remapRow(row, aW, (m) => (10 * (i + 1 + m)) / 5)));
    }

    const rows = [];
    let a = 0, b = 0;
    const per = { c: 0, d: 0 };
    for (const k of order) {
      const isChar = k !== 'w';
      if (isChar) { a++; per[k]++; } else b++;
      const row = { kind: isChar ? 'char' : 'weapon', who: k, n: isChar ? per[k] : b, chars: a, weapons: b };
      row.dist = a && b ? conv(chRaw[a], wpRaw[b]) : a ? chRaw[a] : wpRaw[b];
      if (rf) row.net = isChar ? conv(chExcl[a], wpFull[b]) : conv(chFull[a], wpExcl[b]);
      rows.push(row);
    }
    const last = rows[rows.length - 1];
    const total = last ? last.dist : one;
    if (!rf) return { rows, total, order: order.join('') };
    return { rows, total, totalNet: last ? last.net : one, order: order.join('') };
  }

  const api = {
    charHazard, weaponHazard, WEAPON_HARD, nextFiveStar, conv, characterMilestones, weaponMilestones, characterMilestonesByMiss, weaponMilestonesByMiss,
    stats, plan, normalizeOrder, CR_PRESETS, STANDARD_5, FOUR_RATE, fourStarGlitterPerPull, lossGlitter, copyGlitter5,
    weaponOutcomes, weaponAfter, weaponDecide, weaponValue, weaponExpected, weaponAdvice, WEAPON_STRATEGIES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GachaEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
