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

// 11. Enka 副詞條 ID 解碼：五星 40 個 ID 都要跟官方 affixes.json 一致 (詞條、檔位、數值)
{
  const D = require('./enka-data.js');
  const PROP = { hp: 2, hpp: 3, atk: 5, atkp: 6, def: 8, defp: 9, cr: 20, cd: 22, er: 23, em: 28 };
  let bad = 0;
  for (const [id, [prop, pos, val]] of Object.entries(D.affix5)) {
    const s = E.decodeAffix(id);
    const want = s && Math.round(val * (E.byId[s.stat].pct ? 10000 : 100));
    if (!s || PROP[s.stat] !== prop || s.tier !== pos - 1 || E.byId[s.stat].tiers[pos - 1] !== want) { bad++; console.log('  不一致', id, prop, pos, val); }
  }
  eq('Enka 五星副詞條 ID 解碼 (不一致的數量)', bad, 0);
  // 使用者實際的魈 (UID 900211203)：死之羽 (EQUIP_NECKLACE) 初始 3 詞條，攻擊力% 是 +4 新增的
  const plume = E.parseRelic([501224, 501202, 501234, 501061, 501222, 501202, 501203, 501221], 21);
  eq('死之羽 初始詞條數', plume.init, 3);
  eq('死之羽 詞條順序', plume.subs.map(x => x.stat).join(','), 'cd,cr,er,atkp');
  eq('死之羽 暴擊傷害顯示值', E.fmtValue('cd', plume.subs[0].total), '19.4%');
  eq('死之羽 暴擊傷害升級跳次數', plume.subs[0].rolls.length, 2);
  const sands = E.parseRelic([501231, 501204, 501222, 501023, 501223, 501224, 501224, 501222, 501231], 21);
  eq('時之沙 初始詞條數', sands.init, 4);
  eq('時之沙 暴擊傷害 35.0%', E.fmtValue('cd', sands.subs[2].total), '35.0%');
  eq('時之沙 暴擊傷害升級跳 4 次', sands.subs[2].rolls.length, 4);
  eq('時之沙 生命值 269', E.fmtValue('hp', sands.subs[3].total), '269');
}

// 12. 重塑方案 (reshapeOdds)
{
  const flower = E.parseRelic([501203, 501064, 501232, 501221, 501232, 501224, 501201, 501203, 501223], 21);
  eq('重塑方案 升級跳至少 0 次 → 100%', E.reshapeOdds(flower, [{ stat: 'cd', mode: 'cnt', n: 0 }], 2).p, 1);
  eq('重塑方案 沒有這個詞條', E.reshapeOdds(flower, [{ stat: 'em', mode: 'cnt', n: 1 }], 2).reason, 'missing');
  // 單一目標跟直接用 exact 算的一樣：暴傷 (第 4 個詞條) 選定，升級跳至少 2 次
  const want = E.exact({ init: 4, guarantee: 2, locked: [3, 0], accept: c => c[3] - 1 >= 2 }).success;
  check('重塑方案 暴傷至少跳 2 次 = exact', E.reshapeOdds(flower, [{ stat: 'cd', mode: 'cnt', n: 2 }], 2).p, want);
  // 數值目標 vs 蒙地卡羅：雙暴同時選定，暴擊至少 10.0%、暴傷至少 20.0%，初始那一檔保留
  const goals = [{ stat: 'cr', mode: 'val', target: 100 }, { stat: 'cd', mode: 'val', target: 200 }];
  const r = E.reshapeOdds(flower, goals, 2);
  const o = { init: 4, guarantee: 2, locked: r.lock };
  let ok = 0, sumCd = 0;
  for (let t = 0; t < T; t++) {
    const c = E.simulateCounts(o);
    let h0 = E.byId.cr.tiers[flower.subs[0].initTier], h3 = E.byId.cd.tiers[flower.subs[3].initTier];
    for (let k = 1; k < c[0]; k++) h0 += E.rollValue('cr');
    for (let k = 1; k < c[3]; k++) h3 += E.rollValue('cd');
    if (E.toDisp('cr', h0) >= 100 && E.toDisp('cd', h3) >= 200) ok++;
    sumCd += E.toDisp('cd', h3);
  }
  check('重塑方案 雙暴數值 蒙地卡羅比對', ok / T, r.p, 0.004);
  check('重塑方案 暴傷平均顯示值 蒙地卡羅比對', sumCd / T / 1000, r.avg[1] / 1000, 0.0005);
}

// 13. 重塑划不划算 (reshapeValue)：只看升級跳的次數落在哪
{
  // 使用者的魈 (UID 900211203)，主要詞條：暴擊、暴傷、充能、攻擊%
  const W = { cr: 2, cd: 2, er: 2, atkp: 2 };
  const P = ids => E.parseRelic(ids, 21);
  const xiao = {
    生之花: P([501203, 501064, 501232, 501221, 501232, 501224, 501201, 501203, 501223]),
    死之羽: P([501224, 501202, 501234, 501061, 501222, 501202, 501203, 501221]),
    時之沙: P([501231, 501204, 501222, 501023, 501223, 501224, 501224, 501222, 501231]),
    空之杯: P([501202, 501222, 501234, 501053, 501221, 501204, 501224, 501054, 501203]),
    理之冠: P([501063, 501201, 501032, 501232, 501202, 501063, 501062, 501061, 501203]),
  };
  // 每件都跟蒙地卡羅比對：變好 = 升級跳的有效詞條數 (含檔位) 比原本至少多 0.7 個
  for (const k of Object.keys(xiao)) {
    const pr = xiao[k], r = E.reshapeValue(pr, W, 2);
    const w = pr.subs.map(s => W[s.stat] || 0);
    const up0 = pr.subs.reduce((a, s, i) => a + w[i] * s.rolls.reduce((b, t) => b + E.RATIO[t], 0), 0);
    let ok = 0;
    for (let t = 0; t < 100000; t++) {
      const c = E.simulateCounts({ init: pr.init, guarantee: 2, locked: r.lock });
      let v = 0;
      c.forEach((n, i) => { for (let j = 1; j < n; j++) v += w[i] * E.RATIO[Math.floor(Math.random() * 4)]; });
      if (v - up0 >= E.MIN_GAIN) ok++;
    }
    check(`魈 ${k} 重塑變好機率 蒙地卡羅比對`, ok / 100000, r.pUp, 0.006);
  }
  // 使用者的例子：主要詞條雙暴，A (暴擊 1、暴傷 4，升級跳全在主要) 重塑不會變好，B (暴擊 2、暴傷 1、次要 1、沒用 1) 會
  const A = { ok: true, init: 4, level: 20, subs: [{ stat: 'cr', initTier: 3, rolls: [3] }, { stat: 'cd', initTier: 3, rolls: [3, 3, 3, 3] }, { stat: 'hp', initTier: 3, rolls: [] }, { stat: 'def', initTier: 3, rolls: [] }] };
  const B = { ok: true, init: 4, level: 20, subs: [{ stat: 'cr', initTier: 3, rolls: [3, 3] }, { stat: 'cd', initTier: 3, rolls: [3] }, { stat: 'atkp', initTier: 3, rolls: [3] }, { stat: 'hp', initTier: 3, rolls: [3] }] };
  const WA = { cr: 2, cd: 2, atkp: 1 };
  eq('例子 A 主要詞條全滿而且都是最高檔，重塑不會變好', E.reshapeValue(A, WA, 2).pUp, 0);
  eq('例子 B 重塑有機會變好', E.reshapeValue(B, WA, 2).pUp > 0, true);
  eq('沒有主要或次要詞條', E.reshapeValue(xiao.生之花, { em: 2 }, 2).reason, 'none');
}

// 14. 不歪模式 (只看次數) 與重塑進度保底
{
  const W = { cr: 2, cd: 2, er: 2, atkp: 2 };
  const P = ids => E.parseRelic(ids, 21);
  eq('不歪 魈 死之羽 升級跳全在主要詞條 → 0', E.reshapeValue(P([501224, 501202, 501234, 501061, 501222, 501202, 501203, 501221]), W, 2, 'count').pUp, 0);
  const cup = E.reshapeValue(P([501202, 501222, 501234, 501053, 501221, 501204, 501224, 501054, 501203]), W, 2, 'count');
  check('不歪 魈 空之杯 (攻擊歪一次) 變好 = 5 次都不落在攻擊', cup.pUp, 0.25);
  eq('不歪 魈 空之杯 有效詞條數', cup.total, 7);
  const seq = cost => { const st = { pts: 0, highs: 0 }, out = []; for (let i = 0; i < 18 / cost; i++) out.push(E.pityStep(st, cost)); return out.join(''); };
  eq('進度保底 每次 1 個：第 6、12 個高階，第 18 個諭告', seq(1), '222223222223222224');
  eq('進度保底 每次 2 個：第 3、6 次高階，第 9 次諭告', seq(2), '223223224');
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
