// node test/logic.test.js ― ルールエンジンのテスト（依存なし）
const L = require('../logic.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a) + ' (期待 ' + JSON.stringify(b) + ')'); }
const C = L.cid, R = { r: 0, b: 5, y: 2, g: 3, s: 4, o: 1, p: 6, w: 7 };   // 色の略記
const dice = (...ds) => { let i = 0; return () => (ds[i++ % ds.length] - 1) / 6 + 0.01; };   // 出目を決め打ちする乱数
// 場を指定して状態を作る（空き＝-1）
function state(n, grid, opts = {}) {
  const S = L.newGame(n, { rng: L.mulberry(1), start: 0 });
  L.startRound(S);
  S.grid = grid.concat(Array(16 - grid.length).fill(-1));
  if (opts.round) S.round = opts.round;
  (opts.cards || []).forEach((cs, p) => { S.P[p].cards = cs.slice(); });
  (opts.lucky || []).forEach((ls, p) => { S.P[p].lucky = ls.slice(); });
  const p = opts.p || 0; S.need = { kind: 'turn', p, rolls: 0, max: L.maxRolls(S.P[p]), die: null };
  return S;
}

console.log('■ カード構成');
{
  const d = L.fullDeck();
  eq(d.length, 48, '数字カード48枚');
  eq(new Set(d).size, 48, '全部ちがうカード');
  const byC = {}; d.forEach(id => { const k = L.col(id); byC[k] = (byC[k] || []).concat(L.val(id)); });
  eq(Object.keys(byC).length, 8, '8色');
  ok(Object.values(byC).every(v => JSON.stringify(v.sort()) === '[1,2,3,4,5,6]'), '各色に1〜6が1枚ずつ');
  eq(L.LUCKY_ALL.length, 12, 'おたすけ札12枚');
  L.LUCKY_TYPES.forEach(t => eq(L.LUCKY_ALL.filter(x => x === t).length, 2, `おたすけ札 ${t} は2枚`));
  const S = L.newGame(3, { rng: L.mulberry(2) });
  eq(S.ldeck.length, 12, 'ゲーム開始時のおたすけ札の山は12枚');
  L.startRound(S);
  eq(S.grid.filter(x => x >= 0).length, 16, '場は16枚（4×4）');
  eq(S.deck.length, 32, '残り32枚は山に');
  eq(S.round, 1, 'ラウンド1');
  ok(S.need.kind === 'turn' && S.need.max === 2 && S.need.rolls === 0, 'ふれるのは最大2回');
}

console.log('■ 取れるカード');
{
  const S = state(2, [C(R.r, 3), C(R.b, 3), C(R.y, 5), C(R.g, 1), C(R.g, 2)]);
  ok(L.takeError(S, 0, [0], 'die'), 'ふる前は取れない');
  ok(L.act(S, 0, { a: 'stop' }), 'ふる前はストップできない');
  eq(L.act(S, 0, { a: 'roll' }, dice(3)), null, 'ふる');
  eq(S.need.die, 3, '出目3');
  eq(L.takeError(S, 0, [0], 'die'), null, '赤3は取れる');
  eq(L.takeError(S, 0, [1], 'die'), null, '青3も取れる（色は自由）');
  ok(L.takeError(S, 0, [2], 'die'), '黄5は取れない');
  ok(L.takeError(S, 0, [3, 4], 'die'), '緑1+2（合計3）は「いろまとめ」なしでは取れない');
  ok(L.takeError(S, 0, [0, 1], 'die'), '2枚は取れない');
  ok(L.act(S, 0, { a: 'stop' }), '合うカードがあるとストップできない');
  eq(L.legalTakes(S, 0, 'die').length, 2, '取り方は2通り');
  eq(L.act(S, 0, { a: 'take', idxs: [1], via: 'die' }), null, '青3を取る');
  eq(S.P[0].cards, [C(R.b, 3)], '手元に青3');
  eq(S.grid[1], -1, '場から消える（補充なし）');
  eq(S.need.p, 1, '次の人の番');
  eq(S.need.die, null, '次の人はまだふっていない');
}
{
  const S = state(2, [C(R.r, 3), C(R.y, 5)]);
  L.act(S, 0, { a: 'roll' }, dice(5));
  eq(L.options(S, 0).die, true, '1回目の5は取れる');
  eq(L.act(S, 0, { a: 'roll' }, dice(4)), null, '気に入らなければふり直しOK');
  ok(L.takeError(S, 0, [1], 'die'), 'ふり直したら2回目の目を使う：前の5は使えない');
  ok(L.act(S, 0, { a: 'roll' }, dice(3)), '3回目はふれない');
  eq(L.options(S, 0), { roll: false, die: false, lo: false, hi: false, stop: true }, '4は場にない → ストップだけ');
}

console.log('■ おたすけ札');
{
  const S = state(2, [C(R.r, 2), C(R.b, 3), C(R.y, 6), C(R.g, 1)], { lucky: [['up', 'up', 'dn']] });
  L.act(S, 0, { a: 'roll' }, dice(4));
  eq(L.takeError(S, 0, [1], 'die'), null, '−1札1枚：出目4で3を取れる');
  ok(L.takeError(S, 0, [0], 'die'), '−1札1枚：2は取れない（−2まではできない）');
  eq(L.takeError(S, 0, [2], 'die'), null, '＋1札2枚：出目4で6を取れる（重ねがけ）');
  ok(L.takeError(S, 0, [3], 'die'), '1は取れない');
}
{
  const S = state(2, [C(R.g, 1), C(R.g, 2), C(R.g, 3), C(R.r, 5), C(R.b, 2)], { lucky: [['sum']] });
  L.act(S, 0, { a: 'roll' }, dice(5));
  eq(L.takeError(S, 0, [1, 2], 'die'), null, 'いろまとめ：緑2+3＝5で2枚取れる');
  eq(L.takeError(S, 0, [3], 'die'), null, 'いろまとめでも1枚取りはOK');
  ok(L.takeError(S, 0, [1, 4], 'die'), 'ちがう色はまとめられない（緑2+青2…合計4でもNG）');
  ok(L.takeError(S, 0, [0, 1, 2], 'die'), '緑1+2+3＝6は（いろまとめ1枚では）NG');
  eq(L.legalTakes(S, 0, 'die').length, 2, '取り方：緑2+3、赤5');
  L.act(S, 0, { a: 'take', idxs: [1, 2], via: 'die' });
  eq(S.P[0].cards.length, 2, '2枚もらった');
  eq(S.P[0].lucky, ['sum'], 'いろまとめは ずっと使える（なくならない）');
}
{
  const S = state(2, [C(R.y, 1), C(R.y, 2), C(R.y, 3), C(R.b, 4)], { lucky: [['sum', 'sum']] });
  L.act(S, 0, { a: 'roll' }, dice(5));
  eq(L.takeError(S, 0, [0, 1, 2], 'die'), null, 'いろまとめ2枚：合計±1もOK（公式の例：5で黄1・2・3）');
  eq(L.takeError(S, 0, [3], 'die'), null, 'いろまとめ2枚：1枚でも±1（5で4）');
}
{
  const S = state(2, [C(R.r, 2), C(R.b, 5), C(R.y, 6)], { lucky: [['lo', 'hi']] });
  eq(L.takeError(S, 0, [0], 'lo'), null, 'ちいさめ指名：ふらずに2を取れる');
  ok(L.takeError(S, 0, [1], 'lo'), 'ちいさめ指名：5はNG');
  eq(L.options(S, 0).hi, true, 'おおきめ指名も使える');
  L.act(S, 0, { a: 'roll' }, dice(1));
  eq(L.options(S, 0).stop, true, '出目1は場にない');
  eq(L.act(S, 0, { a: 'take', idxs: [2], via: 'hi' }), null, 'ふった後でも おおきめ指名で6を取れる');
  eq(S.P[0].lucky, ['lo'], '指名札は1回使うとなくなる');
  eq(S.lused, ['hi'], '使用済みに置かれる');
}
{
  const S = state(2, [C(R.r, 4), C(R.b, 1)], { lucky: [['lo', 'up']] });
  eq(L.takeError(S, 0, [0], 'lo'), null, '指名札は他の札と組み合わせOK：1・2・3＋1で4');
}
{
  const S = state(2, [C(R.r, 4)], { lucky: [['re']] });
  eq(S.need.max, 3, 'もう1回ダイス：3回ふれる');
  L.act(S, 0, { a: 'roll' }, dice(1)); L.act(S, 0, { a: 'roll' }, dice(2));
  eq(L.act(S, 0, { a: 'roll' }, dice(4)), null, '3回目');
  eq(L.options(S, 0).die, true, '3回目の4で取れる');
  ok(L.act(S, 0, { a: 'roll' }, dice(4)), '4回目はなし');
}

console.log('■ ラウンドの終わり（ストップ）');
{
  // P0: 赤6 青5 黄2 / P1: 赤1 緑4 緑3。場に残るのは 赤・緑 のカード
  const S = state(2, [C(R.r, 2), C(R.g, 6)], { cards: [[C(R.r, 6), C(R.b, 5), C(R.y, 2)], [C(R.r, 1), C(R.g, 4), C(R.g, 3)]], p: 1 });
  L.act(S, 1, { a: 'roll' }, dice(5)); L.act(S, 1, { a: 'roll' }, dice(5));
  eq(L.act(S, 1, { a: 'stop' }), null, '取れないのでストップ');
  eq(S.result.ender, 1, 'P1 が終わらせた');
  eq(S.P[0].cards.slice().sort((a, b) => a - b), [C(R.b, 5), C(R.y, 2)].sort((a, b) => a - b), 'P0：場に残った赤はふっとぶ');
  eq(S.P[1].cards, [], 'P1：赤・緑がふっとび、残りなし → 最大カードは捨てられない');
  eq(S.result.high[1], null, 'カードがなければ何も捨てない');
  eq(S.phase, 'exchange', 'おたすけ札の交換へ');
  eq(S.need, { kind: 'lucky', p: 0 }, 'P1は手元0枚なので交換できず、P0の番');
  eq(S.start, 1, '次のラウンドはストップした人から');
}
{
  const S = state(3, [C(R.p, 1)], { cards: [[C(R.r, 6), C(R.b, 6), C(R.y, 3), C(R.p, 6)], [], []] });
  L.act(S, 0, { a: 'roll' }, dice(2)); L.act(S, 0, { a: 'roll' }, dice(2)); L.act(S, 0, { a: 'stop' });
  eq(S.P[0].cards.length, 3, '紫6はふっとぶ（色を先に処理）');
  eq(S.need.kind, 'highest', '最大6が2枚 → どちらを捨てるか選ぶ');
  eq(S.need.opts.length, 2, '候補は赤6・青6');
  ok(L.act(S, 0, { a: 'highest', i: 2 }), '黄3は選べない');
  const blue = S.P[0].cards.indexOf(C(R.b, 6));
  eq(L.act(S, 0, { a: 'highest', i: blue }), null, '青6を選ぶ');
  eq(S.P[0].cards, [C(R.r, 6), C(R.y, 3)], '赤6と黄3が残る');
  eq(S.result.high[0], C(R.b, 6), '記録');
}
{
  // ラウンド1で取ったカードも、ラウンド2で同じ色が残ればふっとぶ
  const S = L.newGame(2, { rng: L.mulberry(3), start: 0 }); L.startRound(S);
  S.P[0].cards = [C(R.w, 6)]; S.P[1].cards = [C(R.s, 2)];
  S.grid = [C(R.w, 1)].concat(Array(15).fill(-1)); S.need = { kind: 'turn', p: 0, rolls: 0, max: 2, die: null };
  L.act(S, 0, { a: 'roll' }, dice(4)); L.act(S, 0, { a: 'roll' }, dice(4)); L.act(S, 0, { a: 'stop' });
  eq(S.P[0].cards, [], '前に取った茶6もふっとぶ（ストップ罰の前に色で処理）');
  eq(S.P[1].cards, [C(R.s, 2)], 'P1 の水色は無事');
}

console.log('■ ラウンドの終わり（場が空）');
{
  const S = state(3, [C(R.r, 3)], { cards: [[C(R.b, 6)], [C(R.y, 1)], []], p: 1 });
  L.act(S, 1, { a: 'roll' }, dice(3)); L.act(S, 1, { a: 'take', idxs: [0], via: 'die' });
  eq(S.result.emptied, true, '最後の1枚を取って場が空 → 終了');
  eq(S.result.lost, [[], [], []], 'ふっとぶ色はない');
  eq(S.result.high, [null, null, null], 'ストップ罰はない');
  eq(S.start, 2, '次は最後に取った人の次から');
  eq(S.need, { kind: 'lucky', p: 0 }, '交換は最後に取った人の次（P2：手元0枚でスキップ）→ P0');
  eq(L.act(S, 0, { a: 'lucky', i: 0 }), null, 'P0：青6と交換');
  eq(S.P[0].cards, [], '青6を出した');
  eq(S.P[0].lucky.length, 1, 'おたすけ札1枚');
  eq(S.ldeck.length, 11, '山は11枚');
  eq(S.need, { kind: 'lucky', p: 1 }, '次はP1');
  ok(L.act(S, 1, { a: 'lucky', i: 5 }), 'ないカードは出せない');
  eq(L.act(S, 1, { a: 'lucky', i: -1 }), null, 'P1：交換しない（任意）');
  eq(S.phase, 'roundEnd', 'ラウンド終了');
  eq(S.need, null, '交換は1人1回まで');
  L.nextRound(S);
  eq(S.round, 2, 'ラウンド2');
  eq(S.need.p, 2, 'P2 から');
  eq(S.grid.filter(x => x >= 0).length, 16, '新しい16枚');
}
{
  const S = state(2, [C(R.r, 3)], { cards: [[C(R.b, 6)], [C(R.y, 1)]] });
  S.ldeck = ['re']; S.P[0].cards = [C(R.b, 6)];
  L.act(S, 0, { a: 'roll' }, dice(3)); L.act(S, 0, { a: 'take', idxs: [0], via: 'die' });
  L.act(S, 1, { a: 'lucky', i: 0 });
  eq(S.phase, 'roundEnd', 'おたすけ札の山がなくなったら、それ以上は交換できない');
  L.nextRound(S);
  eq(S.P[1].lucky, ['re'], 'P1 は もう1回ダイス');
  eq(S.need.p, 1, '次のラウンドは最後に取った人の次（P1）');
  eq(S.need.max, 3, 'もらった札は次のラウンドからすぐ使える（3回ふれる）');
}

console.log('■ ゲームの終わり・得点・同点');
{
  const S = L.newGame(3, { rng: L.mulberry(4), start: 0 });
  L.startRound(S); S.phase = 'roundEnd'; L.nextRound(S); S.phase = 'roundEnd'; L.nextRound(S);
  eq(S.round, 3, 'ラウンド3');
  eq(S.deck.length, 0, '48枚＝16枚×3ラウンドで山はちょうど空');
  S.P[0].cards = [C(R.r, 6), C(R.b, 4)]; S.P[1].cards = [C(R.y, 5), C(R.g, 5)]; S.P[2].cards = [C(R.s, 1)];
  S.grid = [C(R.p, 3)].concat(Array(15).fill(-1)); S.need = { kind: 'turn', p: 2, rolls: 0, max: 2, die: null };
  L.act(S, 2, { a: 'roll' }, dice(1)); L.act(S, 2, { a: 'roll' }, dice(1)); L.act(S, 2, { a: 'stop' });
  eq(S.phase, 'over', '3ラウンドで終了（交換なし）');
  eq(S.scores, [10, 10, 0], '数字の合計（P2はストップ罰で水色1を失う）');
  eq(S.winners, [0, 1], '同点トップは全員勝ち');
}
{
  let ended = 0, okCount = 0;
  for (let i = 0; i < 300; i++) {
    const S = L.simGame(['weak', 'normal', 'strong', 'weak'].slice(0, 2 + i % 3), L.mulberry(100 + i));
    if (S.phase === 'over' && S.round === 3) ended++;
    const top = Math.max(...S.scores);
    if (JSON.stringify(S.winners) === JSON.stringify(S.scores.map((s, p) => s === top ? p : -1).filter(p => p >= 0)) && S.P.reduce((s, P) => s + P.cards.length, 0) + S.out.length === 48) okCount++;
  }
  eq(ended, 300, '300ゲームすべて3ラウンドで終了');
  eq(okCount, 300, '勝者判定とカードの枚数（48枚）がすべて正しい');
}

console.log('■ ふーさんの公平さ（見えない情報を使わない）');
{
  // 同じ盤面で「山札の並び」「おたすけ札の山の並び」だけを変えても、アストラウルトラの判断は変わらない
  let same = 0, N = 12;
  for (let i = 0; i < N; i++) {
    const S = L.newGame(3, { rng: L.mulberry(50 + i), start: 0 }); L.startRound(S);
    for (let k = 0; k < 4; k++) { const p = S.need.p; L.act(S, p, L.aiAct(S, p, 'strong', L.mulberry(k)), L.mulberry(9 + k)); if (S.phase !== 'play') break; }
    if (S.phase !== 'play') { same++; continue; }
    const p = S.need.p, A = JSON.parse(JSON.stringify(S)), B = JSON.parse(JSON.stringify(S));
    B.deck.reverse(); L.shuffle(B.deck, L.mulberry(77)); B.ldeck.reverse();
    const a1 = L.aiAct(A, p, 'ultra', L.mulberry(5), 40), a2 = L.aiAct(B, p, 'ultra', L.mulberry(5), 40);
    if (JSON.stringify(a1) === JSON.stringify(a2)) same++;
  }
  eq(same, N, 'アストラウルトラの判断は山札の並びに依存しない');
  const S = L.newGame(2, { rng: L.mulberry(8) }); L.startRound(S);
  const T = L.cloneForSim(S, null, false);
  eq(T.deck, S.deck.slice().sort((a, b) => a - b), '試し遊び用のコピーには山札の並びを渡さない（中身だけ）');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
