// ふーさん同士の自動対戦。 node test/sim.js [games=1000] [seed=7]
const L = require('../logic.js');
const N = +(process.argv[2] || 1000), SEED = +(process.argv[3] || 7);
const LV = ['weak', 'normal', 'strong', 'ultra'], JP = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ' };
const rng = L.mulberry(SEED);
let games = 0, maxTurns = 0;
function play(levels, start) {
  const S = L.simGame(levels, rng, { start }); games++;
  if (S.phase !== 'over' || S.round !== 3) throw new Error('bad end');
  const total = S.P.reduce((s, P) => s + P.cards.length, 0) + S.out.length;
  if (total !== 48) throw new Error('card count mismatch ' + total);
  return S;
}
// 2人戦：勝ち=1、引き分け=0.5
function pair(a, b, n) {
  let wa = 0, wb = 0, d = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const S = play([a, b], i % 2);
    sa += S.scores[0]; sb += S.scores[1];
    if (S.winners.length > 1) d++; else if (S.winners[0] === 0) wa++; else wb++;
  }
  return { wa, wb, d, rate: (wa + d / 2) / n, sa: sa / n, sb: sb / n };
}
const t0 = Date.now();
const nU = Math.max(100, Math.round(N / 2));
for (let i = 0; i < LV.length; i++) for (let j = i + 1; j < LV.length; j++) {
  const n = LV[j] === 'ultra' ? nU : N, r = pair(LV[j], LV[i], n);
  console.log(`${JP[LV[j]]} vs ${JP[LV[i]]}: ${r.wa}勝 ${r.wb}敗 ${r.d}分  勝率${(100 * r.rate).toFixed(1)}%  平均点 ${r.sa.toFixed(1)} : ${r.sb.toFixed(1)}  (${n}戦)`);
}
// 4人戦（全レベル1人ずつ・席を回す）。同点トップは等分
const w4 = { weak: 0, normal: 0, strong: 0, ultra: 0 }, n4 = nU;
for (let i = 0; i < n4; i++) {
  const seats = LV.slice(i % 4).concat(LV.slice(0, i % 4));
  const S = play(seats, i % 4);
  S.winners.forEach(p => { w4[seats[p]] += 1 / S.winners.length; });
}
console.log(`4人戦（各レベル1人, ${n4}戦）: ` + LV.map(l => `${JP[l]} ${(100 * w4[l] / n4).toFixed(1)}%`).join(' / '));
// 3人戦：アストラウルトラ1 vs 強い2
let u3 = 0; const n3 = nU;
for (let i = 0; i < n3; i++) { const seats = ['strong', 'strong', 'strong']; seats[i % 3] = 'ultra'; const S = play(seats, 0); S.winners.forEach(p => { if (seats[p] === 'ultra') u3 += 1 / S.winners.length; }); }
console.log(`3人戦 アストラウルトラ1 vs 強い2: アストラ勝率 ${(100 * u3 / n3).toFixed(1)}%（公平なら33.3%）`);
console.log(`(${games} games, no crash, every game ended after 3 rounds with 48 cards accounted for, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
