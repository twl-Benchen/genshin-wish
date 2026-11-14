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

  /* 重塑划不划算 (角色展示的重塑方案)：只看升級跳落在哪些詞條，不看檔位
   * weight：詞條 → 2 (主要詞條)、1 (次要詞條)、0 (其他，包含攻擊、生命、防禦固定值)
   * 有效詞條數 = Σ 權重/2 × 次數 (含初始)。重塑只重新分配升級跳、初始保留，
   * 重塑「變好」= 升級跳的有效詞條數比原本多 (結果不好可以不換)，大約需要幾次 = 1 / 變好機率 (幾何分布的期望值)
   * 選定詞條是權重最高的兩個 (同權重照順序)，保底用一般重塑 (2 次)
   * 回傳 { ok, total (目前有效詞條數), pUp (每次重塑變好的機率), tries (平均要重塑幾次，不可能變好時 Infinity), lock } */
  function reshapeValue(parsed, weight, guarantee) {
    if (!parsed || !parsed.ok || parsed.subs.length !== 4) return { ok: false };
    const w = parsed.subs.map(s => weight[s.stat] || 0);
    if (!w.some(x => x > 0)) return { ok: false, reason: 'none' };
    const now = parsed.subs.reduce((a, s, i) => a + w[i] * s.rolls.length, 0);
    const total = parsed.subs.reduce((a, s, i) => a + w[i] * (1 + s.rolls.length), 0) / 2;
    const lock = [0, 1, 2, 3].sort((a, b) => w[b] - w[a] || a - b).slice(0, 2).sort((a, b) => a - b);
    let pUp = 0;
    E_each({ init: parsed.init, guarantee: guarantee == null ? 2 : guarantee, locked: lock }, (c, p) => {
      if (c.reduce((a, n, i) => a + w[i] * (n - 1), 0) > now) pUp += p;
    });
    pUp = Math.min(1, pUp);
    return { ok: true, total, pUp, tries: pUp > 1e-12 ? 1 / pUp : Infinity, lock };
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

  const api = { STATS, byId, upgrades, toDisp, dispText, fmtValue, valueDist, probAtLeast, isForced, exact, pickRoll, simulateCounts, rollValue, trialsFor, parseRelic, decodeAffix, reshapeOdds, reshapeValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtifactEngine = api;
})(typeof window !== 'undefined' ? window : this);
