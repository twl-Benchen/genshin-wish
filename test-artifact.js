// 聖遺物定軌：驗證案例 + 精確計算 vs 蒙地卡羅比對
// 執行：node test-artifact.js
const E = require('./artifact-engine.js');

let fail = 0;
function check(name, got, want, tol = 1e-9) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}：${(got * 100).toFixed(4)}% (預期 ${(want * 100).toFixed(4)}%)`);
}

// 1. 初始 3 詞條，保底 4 次，兩個定軌詞條各 1 到 5 次 → 100%
check('初始3 保底4 定軌各1到5次',
  E.exact({ init: 3, guarantee: 4, locked: [0, 1], accept: c => c[0] <= 5 && c[1] <= 5 }).success, 1);

// 2. 初始 4 詞條，保底 2 次，定軌合計多跳 3 次以上 → 50% (保底不影響 3 次以上)
check('初始4 保底2 定軌合計多跳>=3',
  E.exact({ init: 4, guarantee: 2, locked: [0, 1], accept: c => c[0] + c[1] - 2 >= 3 }).success, 0.5);

// 3. 初始 4 詞條，不定軌，兩個詞條合計多跳 2 次以上 → 1 - (1+5)/32 = 81.25%
check('初始4 不定軌 兩詞條合計多跳>=2',
  E.exact({ init: 4, guarantee: 0, locked: [0, 1], accept: c => c[0] + c[1] - 2 >= 2 }).success, 0.8125);

// 4. 初始 4 詞條，保底 2 次，定軌合計多跳剛好 2 次 → P(Binom(5,1/2) <= 2) = 50%
check('初始4 保底2 定軌合計多跳剛好2',
  E.exact({ init: 4, guarantee: 2, locked: [0, 1], accept: c => c[0] + c[1] - 2 === 2 }).success, 0.5);

// 5. 機率總和為 1
const all = E.exact({ init: 4, guarantee: 3, locked: [1, 2], accept: () => true });
check('機率總和', all.success, 1);

// 6. 精確 vs 蒙地卡羅 (30 萬次)
const cases = [
  { init: 4, guarantee: 0, locked: [0, 1], accept: c => c[0] >= 2 && c[1] >= 3 },
  { init: 4, guarantee: 3, locked: [0, 1], accept: c => c[0] >= 3 && c[2] <= 1 },
  { init: 3, guarantee: 2, locked: [2, 3], accept: c => c[2] + c[3] >= 5 },
  { init: 4, guarantee: 4, locked: [0, 3], accept: c => c[0] >= 2 && c[3] >= 2 },
];
const T = 300000;
cases.forEach((o, k) => {
  const want = E.exact(o).success;
  let ok = 0;
  for (let t = 0; t < T; t++) if (o.accept(E.simulateCounts(o))) ok++;
  check(`蒙地卡羅比對 #${k + 1}`, ok / T, want, 0.004);
});

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
