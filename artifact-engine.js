/* 聖遺物定軌計算核心：瀏覽器 (window.ArtifactEngine) 與 Node (module.exports) 共用
 *
 * 模型 (詳見 HANDOFF.md 的「聖遺物定軌」一節)
 * - 四個副詞條各自從 1 次 (初始) 開始，強化次數 n：初始 4 詞條 5 次，初始 3 詞條 4 次 (+4 新增的詞條也算 1 次)
 * - 一般強化每次四個詞條各 1/4
 * - 定軌保底 X：兩個定軌詞條合計至少跳 X 次。前面完全隨機，只有剩下的次數等於還沒達成的保底次數時，
 *   才強制跳到兩個定軌詞條之一 (各 1/2)
 */
(function (root) {
  const STATS = [
    { id: 'hp',   name: '生命值',       max: 298.75, pct: false },
    { id: 'atk',  name: '攻擊力',       max: 19.45,  pct: false },
    { id: 'def',  name: '防禦力',       max: 23.15,  pct: false },
    { id: 'hpp',  name: '生命值%',      max: 5.83,   pct: true },
    { id: 'atkp', name: '攻擊力%',      max: 5.83,   pct: true },
    { id: 'defp', name: '防禦力%',      max: 7.29,   pct: true },
    { id: 'em',   name: '元素精通',     max: 23.31,  pct: false },
    { id: 'er',   name: '元素充能效率', max: 6.48,   pct: true },
    { id: 'cr',   name: '暴擊率',       max: 3.89,   pct: true },
    { id: 'cd',   name: '暴擊傷害',     max: 7.77,   pct: true },
  ];
  const TIERS = [0.7, 0.8, 0.9, 1.0];

  const upgrades = init => (init === 4 ? 5 : 4);

  // 這一步是否被保底強制 (rem：剩下幾次，hits：定軌詞條已中幾次)
  function isForced(X, hits, rem) {
    const need = Math.max(0, X - hits);
    return X > 0 && need > 0 && need >= rem;
  }

  /* 精確計算：列舉所有強化路徑 (最多 4^5 = 1024 條)
   * opts = { init: 3|4, guarantee: 0..4, locked: [i, j] 或 [], accept: counts => bool }
   * 回傳 { success, marginal[4][次數], comboDist[合計次數] } */
  function exact(opts) {
    const n = upgrades(opts.init);
    const lk = opts.locked && opts.locked.length === 2 ? opts.locked : [];
    const X = lk.length === 2 ? Math.min(opts.guarantee || 0, n) : 0;
    const accept = opts.accept || (() => true);
    const marginal = [0, 1, 2, 3].map(() => new Array(n + 2).fill(0));
    const comboDist = new Array(n + 3).fill(0);
    const c = [1, 1, 1, 1];
    let success = 0;
    (function rec(step, hits, p) {
      if (step === n) {
        for (let i = 0; i < 4; i++) marginal[i][c[i]] += p;
        if (lk.length === 2) comboDist[c[lk[0]] + c[lk[1]]] += p;
        if (accept(c)) success += p;
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

  const rollValue = (statId, rand) => {
    const s = STATS.find(x => x.id === statId);
    return s.max * TIERS[Math.floor((rand || Math.random)() * 4)];
  };

  const api = { STATS, TIERS, upgrades, isForced, exact, pickRoll, simulateCounts, rollValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtifactEngine = api;
})(typeof window !== 'undefined' ? window : this);
