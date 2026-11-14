// 聖遺物重塑：驗證案例 + 精確計算 vs 蒙地卡羅比對
// 執行：node test-artifact.js
const E = require('./artifact-engine.js');

let fail = 0;
function check(name, got, want, tol = 1e-9) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}：${(got * 100).toFixed(4)}% (預期 ${(want * 100).toFixed(4)}%)`);
}

// 1. 初始 3 詞條，保底 4 次，兩個選定詞條各 1 到 5 次 → 100%
check('初始3 保底4 選定各1到5次',
  E.exact({ init: 3, guarantee: 4, locked: [0, 1], accept: c => c[0] <= 5 && c[1] <= 5 }).success, 1);

// 2. 初始 4 詞條，保底 2 次，選定合計多跳 3 次以上 → 50% (保底不影響 3 次以上)
check('初始4 保底2 選定合計多跳>=3',
  E.exact({ init: 4, guarantee: 2, locked: [0, 1], accept: c => c[0] + c[1] - 2 >= 3 }).success, 0.5);

// 3. 初始 4 詞條，不選定，兩個詞條合計多跳 2 次以上 → 1 - (1+5)/32 = 81.25%
check('初始4 不選定 兩詞條合計多跳>=2',
  E.exact({ init: 4, guarantee: 0, locked: [0, 1], accept: c => c[0] + c[1] - 2 >= 2 }).success, 0.8125);

// 4. 初始 4 詞條，保底 2 次，選定合計多跳剛好 2 次 → P(Binom(5,1/2) <= 2) = 50%
check('初始4 保底2 選定合計多跳剛好2',
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

// 7. 顯示值：遊戲取到小數點後兩位，畫面四捨五入 (使用者提供的檔位表)
const disp = (id, h) => E.fmtValue(id, h);
const eq = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}：${got} (預期 ${want})`); };
eq('暴擊傷害最低檔', disp('cd', 544), '5.4%');
eq('暴擊傷害全跳最高檔 7.77% × 6', disp('cd', 777 * 6), '46.6%');
eq('攻擊力最低檔', disp('atk', 1362), '14');
eq('生命值全跳最高檔 298.75 × 6', disp('hp', 29875 * 6), '1,793');
eq('暴擊傷害 5.44 + 5.44 + 6.22', disp('cd', 544 + 544 + 622), '17.1%');

// 8. 數值機率
check('暴擊傷害跳 5 次、初始隨機，到 46.6% (全部最高檔)', E.probAtLeast('cd', 5, null, 466), Math.pow(0.25, 6));
check('暴擊率跳 0 次、初始第十檔，到 3.9%', E.probAtLeast('cr', 0, 3, 39), 1);
check('暴擊率跳 1 次、初始第七檔，到 6.6% (只有 2.72 + 3.89 = 6.61)', E.probAtLeast('cr', 1, 0, 66), 0.25);
check('暴擊率跳 1 次、初始第七檔，到 5.8% (2.72 + 3.11 = 5.83 起)', E.probAtLeast('cr', 1, 0, 58), 0.75);
let tot = 0; E.valueDist('hp', 4, null).forEach(p => { tot += p; });
check('數值分布總和', tot, 1);

// 9. 數值條件 精確 vs 蒙地卡羅：初始 4 詞條，保底 2 次，暴擊率 (0) 與暴擊傷害 (1) 選定，暴傷至少 20%、暴擊至少 7%
{
  const ids = ['cr', 'cd'], tgt = [70, 200];
  const o = { init: 4, guarantee: 2, locked: [0, 1],
    weight: c => E.probAtLeast('cr', c[0] - 1, null, 70) * E.probAtLeast('cd', c[1] - 1, null, 200) };
  const want = E.exact(o).success;
  let ok = 0;
  for (let t = 0; t < T; t++) {
    const c = E.simulateCounts(o);
    let good = true;
    for (let i = 0; i < 2; i++) {
      let h = 0;
      for (let k = 0; k < c[i]; k++) h += E.rollValue(ids[i]);
      if (E.toDisp(ids[i], h) < tgt[i]) good = false;
    }
    if (good) ok++;
  }
  check('數值條件 蒙地卡羅比對', ok / T, want, 0.004);
}

// 10. 八成機率要重塑幾顆
eq('成功率 50%，八成要幾顆', E.trialsFor(0.5, 0.8), 3);
eq('成功率 80%，八成要幾顆', E.trialsFor(0.8, 0.8), 1);
eq('成功率 10%，八成要幾顆', E.trialsFor(0.1, 0.8), 16);

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
