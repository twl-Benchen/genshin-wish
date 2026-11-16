/* 聖遺物重塑計算核心：瀏覽器 (window.ArtifactEngine) 與 Node (module.exports) 共用
 *
 * 模型 (詳見 HANDOFF.md 的「聖遺物重塑」一節)
 * - 四個副詞條各自從 1 次 (初始) 開始，升級跳的次數 n：初始 4 詞條 5 次，初始 3 詞條 4 次 (+4 新增的詞條也算 1 次)
 * - 一般強化每次四個詞條各 1/4
 * - 重塑保底 X：兩個選定詞條合計至少跳 X 次。前面完全隨機，只有剩下的次數等於還沒達成的保底次數時，
 *   才強制跳到兩個選定詞條之一 (各 1/2)
 * - 每次 (含初始) 的數值是四檔之一，各 1/4。遊戲內部取到小數點後兩位，畫面顯示時百分比四捨五入到小數點後一位，
 *   固定值四捨五入到整數。所以數值一律用「百分之一」的整數計算，避免浮點誤差
 */
(function (root) {
  // tiers：第七到第十檔的精確值 (乘 100 的整數)
  const STATS = [
    { id: 'hp',   name: '生命值',       pct: false, tiers: [20913, 23900, 26888, 29875] },
    { id: 'atk',  name: '攻擊力',       pct: false, tiers: [1362, 1556, 1751, 1945] },
    { id: 'def',  name: '防禦力',       pct: false, tiers: [1620, 1852, 2083, 2315] },
    { id: 'hpp',  name: '生命值%',      pct: true,  tiers: [408, 466, 525, 583] },
    { id: 'atkp', name: '攻擊力%',      pct: true,  tiers: [408, 466, 525, 583] },
    { id: 'defp', name: '防禦力%',      pct: true,  tiers: [510, 583, 656, 729] },
    { id: 'em',   name: '元素精通',     pct: false, tiers: [1632, 1865, 2098, 2331] },
    { id: 'er',   name: '元素充能效率', pct: true,  tiers: [453, 518, 583, 648] },
    { id: 'cr',   name: '暴擊率',       pct: true,  tiers: [272, 311, 350, 389] },
    { id: 'cd',   name: '暴擊傷害',     pct: true,  tiers: [544, 622, 699, 777] },
  ];
  const byId = Object.fromEntries(STATS.map(s => [s.id, s]));

  const upgrades = init => (init === 4 ? 5 : 4);

  /* 顯示值：精確值 (百分之一整數) → 畫面上的單位
   * 百分比用「十分之一 %」(46.62% → 466)，固定值用整數 (1792.5 → 1793)，都是四捨五入 */
  const toDisp = (statId, h) => (byId[statId].pct ? Math.round(h / 10) : Math.round(h / 100));
  const dispText = (statId, d) => (byId[statId].pct ? (d / 10).toFixed(1) + '%' : d.toLocaleString('en-US'));
  const fmtValue = (statId, h) => dispText(statId, toDisp(statId, h));

  /* 最終顯示值的分布 (Map：顯示值 → 機率)
   * jumps：升級跳的次數，init：初始那一檔 0..3，null 代表初始也是隨機 */
  const distCache = new Map();
  function valueDist(statId, jumps, init) {
    const key = statId + '|' + jumps + '|' + init;
    if (distCache.has(key)) return distCache.get(key);
    const t = byId[statId].tiers;
    let sums = new Map(init == null ? t.map(v => [v, 0.25]) : [[t[init], 1]]);
    for (let k = 0; k < jumps; k++) {
      const nx = new Map();
      sums.forEach((p, s) => t.forEach(v => nx.set(s + v, (nx.get(s + v) || 0) + p / 4)));
      sums = nx;
    }
    const out = new Map();
    sums.forEach((p, s) => { const d = toDisp(statId, s); out.set(d, (out.get(d) || 0) + p); });
    distCache.set(key, out);
    return out;
  }
  // 顯示值至少 target (畫面單位) 的機率
  function probAtLeast(statId, jumps, init, target) {
    let p = 0;
    valueDist(statId, jumps, init).forEach((q, d) => { if (d >= target) p += q; });
    return Math.min(1, p);
  }

  // 這一步是否被保底強制 (rem：剩下幾次，hits：選定詞條已中幾次)
  function isForced(X, hits, rem) {
    const need = Math.max(0, X - hits);
    return X > 0 && need > 0 && need >= rem;
  }

  /* 精確計算：列舉所有強化路徑 (最多 4^5 = 1024 條)
   * opts = { init: 3|4, guarantee: 0..4, locked: [i, j] 或 [],
   *          weight: counts => 這組次數下符合條件的機率 (0..1)，或 accept: counts => bool }
   * counts 是四個詞條的總次數 (含初始 1 次)
   * 回傳 { success, marginal[4][次數], comboDist[合計次數] } */
  function exact(opts) {
    const n = upgrades(opts.init);
    const lk = opts.locked && opts.locked.length === 2 ? opts.locked : [];
    const X = lk.length === 2 ? Math.min(opts.guarantee || 0, n) : 0;
    const weight = opts.weight || (opts.accept ? (c => (opts.accept(c) ? 1 : 0)) : (() => 1));
    const marginal = [0, 1, 2, 3].map(() => new Array(n + 2).fill(0));
    const comboDist = new Array(n + 3).fill(0);
    const c = [1, 1, 1, 1];
    let success = 0;
    (function rec(step, hits, p) {
      if (step === n) {
        for (let i = 0; i < 4; i++) marginal[i][c[i]] += p;
        if (lk.length === 2) comboDist[c[lk[0]] + c[lk[1]]] += p;
        success += p * weight(c);
        return;
      }
      if (isForced(X, hits, n - step)) {
        for (const j of lk) { c[j]++; rec(step + 1, hits + 1, p / 2); c[j]--; }
      } else {
        for (let j = 0; j < 4; j++) {
          c[j]++;
          rec(step + 1, hits + (X > 0 && lk.includes(j) ? 1 : 0), p / 4);
          c[j]--;
        }
      }
    })(0, 0, 1);
    return { success, marginal, comboDist };
  }

  // 抽一次強化會跳到哪個詞條 (rand 回傳 [0,1) 的亂數)
  function pickRoll(X, hits, rem, lk, rand) {
    const forced = isForced(X, hits, rem);
    const j = forced ? lk[rand() < 0.5 ? 0 : 1] : Math.floor(rand() * 4);
    return { j, forced };
  }

  // 只算次數的快速模擬一顆，回傳四個詞條的最終次數
  function simulateCounts(opts, rand) {
    rand = rand || Math.random;
    const n = upgrades(opts.init);
    const lk = opts.locked && opts.locked.length === 2 ? opts.locked : [];
    const X = lk.length === 2 ? Math.min(opts.guarantee || 0, n) : 0;
    const c = [1, 1, 1, 1];
    let hits = 0;
    for (let s = 0; s < n; s++) {
      const { j } = pickRoll(X, hits, n - s, lk, rand);
      c[j]++;
      if (X > 0 && lk.includes(j)) hits++;
    }
    return c;
  }

  // 隨機一檔的精確值 (百分之一整數)
  const rollValue = (statId, rand) => byId[statId].tiers[Math.floor((rand || Math.random)() * 4)];

  // 每顆成功機率 p，要重塑幾顆才有 prob 的機率至少成功一次
  function trialsFor(p, prob) {
    if (p <= 0) return Infinity;
    if (p >= prob || p >= 1) return 1;
    return Math.ceil(Math.log(1 - prob) / Math.log(1 - p) - 1e-9);
  }

  /* Enka.Network 的副詞條紀錄 (reliquary.appendPropIdList) 解碼
   * 每個 ID 是一次詞條 (初始那幾次和之後每次升級跳各一個)，照發生順序排列。
   * 五星 ID 格式是 501PPT：PP 是哪個詞條，T 是第幾檔 (1..4 = 第七到第十檔)，跟官方 affixes.json 核對過
   * level：reliquary.level (1..21，+20 是 21)
   * 回傳 { ok, init (初始詞條數), level (+0..+20), subs: [{ stat, initTier, rolls: [檔位...], total }] }，
   * subs 照第一次出現的順序 (初始 3 詞條時第 4 個就是 +4 新增的那個)。不是五星或看不懂的 ID 回傳 ok: false */
  const AFFIX_CODE = { '02': 'hp', '03': 'hpp', '05': 'atk', '06': 'atkp', '08': 'def', '09': 'defp', '20': 'cr', '22': 'cd', '23': 'er', '24': 'em' };
  function decodeAffix(raw) {
    const id = String(raw), stat = AFFIX_CODE[id.slice(3, 5)], tier = +id.slice(5) - 1;
    return id.length === 6 && id.startsWith('501') && stat && tier >= 0 && tier <= 3 ? { stat, tier } : null;
  }
  function parseRelic(ids, level) {
    const plus = Math.max(0, (level || 1) - 1);
    const subs = [];
    for (const raw of ids || []) {
      const a = decodeAffix(raw);
      if (!a) return { ok: false };
      const { stat, tier } = a;
      let s = subs.find(x => x.stat === stat);
      if (!s) { s = { stat, initTier: tier, rolls: [], total: 0 }; subs.push(s); }
      else s.rolls.push(tier);
      s.total += byId[stat].tiers[tier];
    }
    const init = (ids || []).length - Math.floor(plus / 4);
    if (subs.length < 3 || subs.length > 4 || init < 3 || init > 4) return { ok: false };
    // 初始 3 詞條時，+4 新增的詞條本身算初始那 1 次，不是升級跳
    return { ok: true, init, level: plus, subs };
  }

  /* 重塑方案：一顆 +20 五星聖遺物 (parseRelic 的結果) 重塑一次，達成目標的機率
   * goals：1 或 2 個 { stat, mode: 'val' 最後顯示值至少 target (畫面單位，見 toDisp) | 'cnt' 升級跳至少 n 次 }
   * 選定詞條：目標詞條；只有一個目標時，另一個選定詞條隨便挑 (四個詞條對稱，不影響目標的機率)
   * 初始那一檔重塑後保留 (見 HANDOFF.md 的待辦)
   * 回傳 { ok, p, avg (每個目標重塑後的平均顯示值), lock } 或 { ok: false, reason: 'missing' } */
  function reshapeOdds(parsed, goals, guarantee) {
    const idx = goals.map(g => parsed.subs.findIndex(s => s.stat === g.stat));
    if (!parsed.ok || parsed.subs.length !== 4) return { ok: false, reason: 'relic' };
    if (idx.some(i => i < 0)) return { ok: false, reason: 'missing' };
    const lock = [...new Set(idx)];
    for (let i = 0; lock.length < 2 && i < 4; i++) if (!lock.includes(i)) lock.push(i);
    const base = { init: parsed.init, guarantee, locked: lock.slice(0, 2) };
    const sub = k => parsed.subs[idx[k]];
    const cond = (k, c) => {
      const g = goals[k], j = c[idx[k]] - 1;
      return g.mode === 'cnt' ? (j >= g.n ? 1 : 0) : probAtLeast(sub(k).stat, j, sub(k).initTier, g.target);
    };
    const p = exact(Object.assign({}, base, { weight: c => goals.reduce((w, g, k) => w * cond(k, c), 1) })).success;
    const mean = (k, c) => { let m = 0; valueDist(sub(k).stat, c[idx[k]] - 1, sub(k).initTier).forEach((q, d) => { m += q * d; }); return m; };
    const avg = goals.map((g, k) => exact(Object.assign({}, base, { weight: c => mean(k, c) })).success);
    return { ok: true, p: Math.min(1, p), avg, lock: base.locked };
  }

  // 平均一跳 (四個檔位的平均，內部單位同 tiers)，「幾個詞條」都用這個當單位
  const avgRoll = stat => byId[stat].tiers.reduce((a, b) => a + b, 0) / 4;

  /* 角色卡上方的詞條數：每個副詞條的數值 ÷ 平均一跳，換成幾個詞條 (只算副詞條，主詞條不算)
   * subs：[{ stat, h }]，h 是內部單位 (百分之一，同 tiers)
   * base：{ hp, atk, def } 角色白字 (攻擊含武器基礎攻擊)。固定值先換成等效的百分比再算，併進對應的百分比詞條：
   *   攻擊 37 ÷ (白字 1063 × 攻擊% 平均一跳 4.955%) ≈ 0.70 詞條，算在攻擊 (atkp)；生命、防禦同理
   * 回傳 { 詞條 id: 詞條數 } */
  const FLAT_TO = { hp: 'hpp', atk: 'atkp', def: 'defp' };
  function rollCount(subs, base) {
    const out = {};
    (subs || []).forEach(({ stat, h }) => {
      if (!byId[stat] || !isFinite(h)) return;
      let id = stat, n;
      if (FLAT_TO[stat]) {
        id = FLAT_TO[stat];
        const b = base && +base[stat];
        if (!(b > 0)) return;
        n = (h / b) * 100 / avgRoll(id); // h / 100 是固定值，÷ 白字 × 100 是百分比，再 × 100 換成內部單位
      } else n = h / avgRoll(stat);
      out[id] = (out[id] || 0) + n;
    });
    return out;
  }

  /* 重塑划不划算 (角色聖遺物的重塑方案)
   * weight：詞條 → 2 (主要詞條)、1 (次要詞條)、0 (其他，包含攻擊、生命、防禦固定值)
   * 有效詞條數 = Σ 權重/2 × 數值 ÷ 平均一跳 (四個檔位的平均，約最高檔的 0.85；例如暴傷 7.77% ≈ 1.18 詞條)，含初始
   *   檔位比例第七到第十檔是 0.7、0.8、0.9、1.0 倍最高檔，所以每次是 RATIO / 85 個詞條
   * 重塑只重新分配升級跳、初始保留，結果比原本差可以不換，所以只算變好的部分。
   * mode：'count' 減少歪：有用詞條的升級跳 (主要算 1 次、次要算半次) 比原本多，而且升級跳的有效詞條數比原本高才算變好。
   *               次數沒有變多、只是檔位運氣比較好的不算，所以升級跳全在主要詞條時不可能變好，畫面顯示「沒有歪」
   *       'tier' 追提升 (沒指定時也是這個)：升級跳的有效詞條數比原本高就算變好，不設門檻，純檔位運氣也算。
   *               升級跳全在主要詞條而且都是最高檔時才不可能變好，畫面顯示「已經最好」
   * 兩個模式的提升幅度都照數值 (檔位) 算：同樣歪 1 次，其他升級跳檔位低的那件拿回來之後多得比較多。
   * 排序用「每次重塑平均多幾個」(exp = 變好機率 × 變好時平均多幾個) 除以每次用的啟聖之塵，也就是提升空間有多大又有多容易拿到。
   * 2026-11-16 以前追提升有 0.7 個有效詞條的門檻 (MIN_GAIN)、減少歪只看次數、排序用 1 ÷ 變好機率；
   * 門檻是手動訂的數字，最划算的那件會跟著門檻變，而且只看機率分不出歪 5 次和歪 4 次，所以改成現在這樣
   * 選定詞條是權重最高的兩個 (同權重照順序)，保底用一般重塑 (2 次)
   * 回傳 { ok, total (目前有效詞條數), pUp (每次重塑變好的機率), gain (變好時平均多幾個有效詞條，不可能變好時 0),
   *        exp (每次重塑平均多幾個有效詞條 = pUp × gain), tries (平均要重塑幾次，不可能變好時 Infinity), lock } */
  const RATIO = [70, 80, 90, 100];
  // 內部用整數：主要詞條每次 2 × RATIO，次要 1 × RATIO，有效詞條數 = 整數 ÷ UNIT
  const UNIT = 170; // 2 (主要詞條權重) × 85 (平均一跳的檔位比例)
  const upCache = new Map();
  // 主要詞條升級跳 jm 次、次要詞條 js 次時，升級跳有效詞條數 (× UNIT 的整數) 的分布
  function upDist(jm, js) {
    const key = jm + '|' + js;
    if (upCache.has(key)) return upCache.get(key);
    let d = new Map([[0, 1]]);
    const add = w => { const nx = new Map(); d.forEach((q, v) => RATIO.forEach(r => { const k = v + w * r; nx.set(k, (nx.get(k) || 0) + q / 4); })); d = nx; };
    for (let i = 0; i < jm; i++) add(2);
    for (let i = 0; i < js; i++) add(1);
    upCache.set(key, d);
    return d;
  }
  function reshapeValue(parsed, weight, guarantee, mode) {
    if (!parsed || !parsed.ok || parsed.subs.length !== 4) return { ok: false };
    const w = parsed.subs.map(s => weight[s.stat] || 0);
    if (!w.some(x => x > 0)) return { ok: false, reason: 'none' };
    const byCount = mode === 'count';
    // 現在升級跳的有效詞條數 (× UNIT)、初始那幾次的有效詞條數、有用詞條的升級跳次數 (主要 2、次要 1)
    const up = parsed.subs.reduce((a, s, i) => a + w[i] * s.rolls.reduce((b, t) => b + RATIO[t], 0), 0);
    const init = parsed.subs.reduce((a, s, i) => a + w[i] * RATIO[s.initTier], 0);
    const now = parsed.subs.reduce((a, s, i) => a + w[i] * s.rolls.length, 0);
    const lock = [0, 1, 2, 3].sort((a, b) => w[b] - w[a] || a - b).slice(0, 2).sort((a, b) => a - b);
    let pUp = 0, sum = 0;
    E_each({ init: parsed.init, guarantee: guarantee == null ? 2 : guarantee, locked: lock }, (c, p) => {
      let jm = 0, js = 0;
      c.forEach((n, i) => { if (w[i] === 2) jm += n - 1; else if (w[i] === 1) js += n - 1; });
      if (byCount && 2 * jm + js <= now) return;
      upDist(jm, js).forEach((q, v) => { if (v > up) { pUp += p * q; sum += p * q * (v - up); } });
    });
    pUp = Math.min(1, pUp);
    const can = pUp > 1e-12;
    return { ok: true, total: (init + up) / UNIT, pUp: can ? pUp : 0, gain: can ? sum / pUp / UNIT : 0, exp: can ? sum / UNIT : 0, tries: can ? 1 / pUp : Infinity, lock };
  }

  /* 重塑進度保底 (批量模擬用)：每用 1 個啟聖之塵累積 1 點，這次重塑讓進度滿 6 點時變成高階重塑 (保底 3 次)，
   * 第 3 次觸發改成諭告重塑 (保底 4 次)，所以是第 6、12 個塵高階，第 18 個諭告，之後重新循環。
   * st = { pts, highs } 會被更新，cost 是這次用幾個塵 (花、羽 1，沙、杯、冠 2)，回傳這次的保底次數 */
  function pityStep(st, cost) {
    st.pts += cost;
    if (st.pts < 6) return 2;
    st.pts -= 6;
    if (++st.highs >= 3) { st.highs = 0; return 4; }
    return 3;
  }

  // 列舉每一組最終次數 (含初始 1 次) 和它的機率
  function E_each(o, fn) {
    const n = upgrades(o.init), lk = o.locked, X = Math.min(o.guarantee || 0, n);
    const c = [1, 1, 1, 1];
    (function rec(step, hits, p) {
      if (step === n) { fn(c, p); return; }
      if (isForced(X, hits, n - step)) { for (const j of lk) { c[j]++; rec(step + 1, hits + 1, p / 2); c[j]--; } }
      else for (let j = 0; j < 4; j++) { c[j]++; rec(step + 1, hits + (X > 0 && lk.includes(j) ? 1 : 0), p / 4); c[j]--; }
    })(0, 0, 1);
  }

  /* 從「符合目標」的結果裡依機率抽一顆 (精確的條件抽樣，不用一直重試，機率再低也抽得到)
   * o：exact 的 opts (init, guarantee, locked)；cntOk(c)：次數條件 (最多跳幾次、合計) 符不符合
   * vals：四個 { stat, init (初始那一檔 0..3，null 隨機), target (數值目標，畫面單位，null 沒有) }
   * 1. 每組最終次數的權重 = 發生機率 × 每個數值目標達成的機率，依權重抽一組次數
   * 2. 每個詞條在這個次數下，從「達成數值目標」的檔位組合裡平均抽一組 (每組檔位組合的機率本來就一樣)
   * 回傳 { counts, vals (乘 100 的整數) }，不可能達成時回傳 null */
  function sampleSuccess(o, cntOk, vals, rand) {
    rand = rand || Math.random;
    const lk = o.locked && o.locked.length === 2 ? o.locked : [];
    const paths = []; let tot = 0;
    E_each({ init: o.init, guarantee: lk.length ? o.guarantee : 0, locked: lk }, (c, p) => {
      if (!cntOk(c)) return;
      let w = p;
      for (let i = 0; i < 4 && w > 0; i++) { const v = vals[i]; if (v.target != null) w *= probAtLeast(v.stat, c[i] - 1, v.init, v.target); }
      if (w > 0) { paths.push([c.slice(), w]); tot += w; }
    });
    if (!(tot > 0)) return null;
    let r = rand() * tot, pick = paths[paths.length - 1][0];
    for (const [c, w] of paths) { if ((r -= w) <= 0) { pick = c; break; } }
    const out = pick.map((cnt, i) => {
      const v = vals[i], t = byId[v.stat].tiers;
      const free = v.init == null ? cnt : cnt - 1, base = v.init == null ? 0 : t[v.init];
      if (v.target == null) { let h = base; for (let k = 0; k < free; k++) h += t[Math.floor(rand() * 4)]; return h; }
      // 列舉這個詞條所有檔位組合 (最多 4^6 = 4096 種)，只留達成目標的
      const ok = [];
      for (let m = 0; m < Math.pow(4, free); m++) {
        let h = base, x = m;
        for (let k = 0; k < free; k++) { h += t[x % 4]; x = Math.floor(x / 4); }
        if (toDisp(v.stat, h) >= v.target) ok.push(h);
      }
      return ok[Math.floor(rand() * ok.length)];
    });
    return { counts: pick, vals: out };
  }

  const api = { sampleSuccess, STATS, byId, upgrades, toDisp, dispText, fmtValue, valueDist, probAtLeast, isForced, exact, pickRoll, simulateCounts, rollValue, trialsFor, parseRelic, decodeAffix, reshapeOdds, reshapeValue, RATIO, UNIT, pityStep, avgRoll, rollCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtifactEngine = api;
})(typeof window !== 'undefined' ? window : this);
