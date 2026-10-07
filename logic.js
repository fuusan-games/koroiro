/* ころいろ — ルールエンジンと ふーさん🐻AI（ブラウザ / Node 共通・DOM非依存）
 * 公式ルール準拠（RULES_NOTES.md 参照）
 *   数字カード48枚＝8色×1〜6（各1枚）／おたすけ札12枚＝6種×2枚／サイコロ1個／全3ラウンド
 * カード表現：数字カードは整数 id（0〜47）。色 = floor(id/6)（0〜7）、数字 = id%6+1
 *   おたすけ札：'up'(+1) 'dn'(−1) 're'(もう1回ふれる) 'sum'(同じ色まとめ) … ずっと使える
 *               'lo'(1・2・3を指名) 'hi'(4・5・6を指名) … 1回だけ
 * 進め方：S = newGame(n) → startRound(S) → S.need に act(S,p,action) … → phase 'roundEnd' → nextRound(S) … → 'over'
 */
(function (root) {
  'use strict';
  var NC = 8, GRID = 16, ROUNDS = 3;
  var LUCKY_ALL = ['up', 'up', 'dn', 'dn', 're', 're', 'sum', 'sum', 'lo', 'lo', 'hi', 'hi'];
  var LUCKY_TYPES = ['up', 'dn', 're', 'sum', 'lo', 'hi'];
  var ONCE = { lo: [1, 2, 3], hi: [4, 5, 6] };
  function col(id) { return (id / 6) | 0; }
  function val(id) { return id % 6 + 1; }
  function cid(c, v) { return c * 6 + v - 1; }
  function fullDeck() { var d = []; for (var i = 0; i < 48; i++) d.push(i); return d; }
  function shuffle(a, rng) { rng = rng || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function cnt(P, t) { var k = 0; for (var i = 0; i < P.lucky.length; i++) if (P.lucky[i] === t) k++; return k; }
  function maxRolls(P) { return 2 + cnt(P, 're'); }
  function score(P) { var s = 0; for (var i = 0; i < P.cards.length; i++) s += val(P.cards[i]); return s; }
  function sortCards(a) { return a.sort(function (x, y) { return col(x) - col(y) || val(x) - val(y); }); }
  function gridColors(S) { var has = []; for (var c = 0; c < NC; c++) has.push(false); S.grid.forEach(function (id) { if (id >= 0) has[col(id)] = true; }); return has; }
  function gridLeft(S) { var k = 0; for (var i = 0; i < GRID; i++) if (S.grid[i] >= 0) k++; return k; }

  // ---------------------------------------------------------------- ゲーム
  function newGame(n, opts) {
    opts = opts || {}; var rng = opts.rng || Math.random;
    var S = { n: n, round: 0, deck: shuffle(fullDeck(), rng), ldeck: shuffle(LUCKY_ALL.slice(), rng), grid: [], P: [], start: opts.start != null ? opts.start : Math.floor(rng() * n),
      turn: -1, need: null, phase: 'idle', ev: [], evId: 0, out: [], lused: [], last: -1, result: null, results: [], winners: null, scores: [] };
    for (var p = 0; p < n; p++) { S.P.push({ cards: [], lucky: [] }); S.scores.push(0); }
    return S;
  }
  function pushEv(S, e) { if (S.sim) return e; e.id = ++S.evId; S.ev.push(e); if (S.ev.length > 14) S.ev.shift(); return e; }
  function startRound(S) {
    S.round++; S.grid = [];
    for (var i = 0; i < GRID; i++) S.grid.push(S.deck.length ? S.deck.pop() : -1);
    S.last = -1; S.result = null; S.phase = 'play';
    pushEv(S, { kind: 'round', round: S.round, start: S.start });
    newTurn(S, S.start);
  }
  function newTurn(S, p) { S.turn = p; S.need = { kind: 'turn', p: p, rolls: 0, max: maxRolls(S.P[p]), die: null }; }

  // ---- 取れるかどうか ----
  // 出目 v（またはおたすけ札で指名した数）に対して、合計 total を取ってよいか
  function totalOk(P, v, total) {
    var e = cnt(P, 'sum') >= 2 ? 1 : 0;
    return total >= v - cnt(P, 'dn') - e && total <= v + cnt(P, 'up') + e;
  }
  function viaValues(S, p, via) {
    var P = S.P[p], nd = S.need;
    if (via === 'die') return nd && nd.die != null ? [nd.die] : [];
    if (via === 'lo' || via === 'hi') return cnt(P, via) ? ONCE[via] : [];
    return [];
  }
  // idxs: 場（4×4）の位置の配列。エラー文字列 or null
  function takeError(S, p, idxs, via) {
    var nd = S.need, P = S.P[p];
    if (S.phase !== 'play' || !nd || nd.kind !== 'turn' || nd.p !== p) return 'あなたの番ではありません';
    if (!Array.isArray(idxs) || !idxs.length || idxs.length > GRID) return 'カードを選んでね';
    var seen = {}, total = 0, c0 = -1;
    for (var i = 0; i < idxs.length; i++) {
      var k = idxs[i];
      if (typeof k !== 'number' || k < 0 || k >= GRID || k !== (k | 0) || seen[k] || S.grid[k] < 0) return 'そのカードは取れません';
      seen[k] = 1; total += val(S.grid[k]);
      if (c0 < 0) c0 = col(S.grid[k]); else if (col(S.grid[k]) !== c0) return '2枚以上取るときは同じ色だけです';
    }
    if (idxs.length > 1 && !cnt(P, 'sum')) return '2枚以上取るには「いろまとめ」札が必要です';
    var vs = viaValues(S, p, via);
    if (!vs.length) return via === 'die' ? 'まずサイコロをふってね' : 'その札を持っていません';
    for (var j = 0; j < vs.length; j++) if (totalOk(P, vs[j], total)) return null;
    return '出目と合わないカードです';
  }
  // 取り方の一覧（場の位置の配列の配列）。via: 'die' / 'lo' / 'hi'、vOverride で出目を仮定
  function legalTakes(S, p, via, vOverride, limit) {
    var P = S.P[p], vs = vOverride != null ? [vOverride] : viaValues(S, p, via), out = [];
    if (!vs.length) return out;
    var multi = cnt(P, 'sum') > 0, byC = [];
    for (var c = 0; c < NC; c++) byC.push([]);
    for (var i = 0; i < GRID; i++) if (S.grid[i] >= 0) byC[col(S.grid[i])].push(i);
    function ok(t) { for (var j = 0; j < vs.length; j++) if (totalOk(P, vs[j], t)) return true; return false; }
    for (c = 0; c < NC; c++) {
      var L = byC[c], m = L.length; if (!m) continue;
      if (!multi) { for (i = 0; i < m; i++) if (ok(val(S.grid[L[i]]))) { out.push([L[i]]); if (limit && out.length >= limit) return out; } continue; }
      for (var mask = 1; mask < (1 << m); mask++) {
        var t = 0, set = [];
        for (i = 0; i < m; i++) if (mask & (1 << i)) { t += val(S.grid[L[i]]); set.push(L[i]); }
        if (ok(t)) { out.push(set); if (limit && out.length >= limit) return out; }
      }
    }
    return out;
  }
  function canTake(S, p, via) { return legalTakes(S, p, via, null, 1).length > 0; }
  // いまの手番でできること
  function options(S, p) {
    var nd = S.need, o = { roll: false, die: false, lo: false, hi: false, stop: false };
    if (S.phase !== 'play' || !nd || nd.kind !== 'turn' || nd.p !== p) return o;
    o.roll = nd.rolls < nd.max;
    o.die = nd.die != null && canTake(S, p, 'die');
    o.lo = canTake(S, p, 'lo'); o.hi = canTake(S, p, 'hi');
    o.stop = nd.die != null && !o.die;
    return o;
  }

  // ---- 行動 ----
  function act(S, p, a, rng) {
    rng = rng || Math.random;
    var nd = S.need; if (!a || !nd || nd.p !== p) return 'あなたの番ではありません';
    var P = S.P[p];
    if (nd.kind === 'turn' && S.phase === 'play') {
      if (a.a === 'roll') {
        if (nd.rolls >= nd.max) return 'もうふれません';
        nd.rolls++; nd.die = 1 + Math.floor(rng() * 6);
        pushEv(S, { kind: 'roll', p: p, d: nd.die, n: nd.rolls, max: nd.max });
        return null;
      }
      if (a.a === 'take') {
        var via = a.via || 'die', err = takeError(S, p, a.idxs, via); if (err) return err;
        var ids = a.idxs.map(function (k) { var id = S.grid[k]; S.grid[k] = -1; return id; });
        ids.forEach(function (id) { P.cards.push(id); }); sortCards(P.cards);
        if (via !== 'die') { P.lucky.splice(P.lucky.indexOf(via), 1); S.lused.push(via); }
        pushEv(S, { kind: 'take', p: p, ids: ids, idxs: a.idxs.slice(), via: via, die: nd.die });
        S.last = p;
        if (!gridLeft(S)) endRound(S, -1); else newTurn(S, (p + 1) % S.n);
        return null;
      }
      if (a.a === 'stop') {
        if (nd.die == null) return 'まずサイコロをふってね';
        if (canTake(S, p, 'die')) return '出目に合うカードがあるので、取ってください';
        pushEv(S, { kind: 'stop', p: p, d: nd.die });
        endRound(S, p); return null;
      }
      return 'その操作はできません';
    }
    if (nd.kind === 'highest' && a.a === 'highest') {
      if (nd.opts.indexOf(a.i) < 0) return 'そのカードは選べません';
      removeHighest(S, p, a.i); afterHighest(S); return null;
    }
    if (nd.kind === 'lucky' && a.a === 'lucky') {
      if (a.i === -1 || a.i == null) { S.result.ex[p] = { skip: true }; pushEv(S, { kind: 'noLucky', p: p }); nextExchange(S); return null; }
      if (typeof a.i !== 'number' || a.i < 0 || a.i >= P.cards.length || !S.ldeck.length) return 'そのカードは選べません';
      var gave = P.cards.splice(a.i, 1)[0], got = S.ldeck.pop();
      S.out.push(gave); P.lucky.push(got);
      S.result.ex[p] = { gave: gave, got: got };
      pushEv(S, { kind: 'lucky', p: p, gave: gave, got: got });
      nextExchange(S); return null;
    }
    return 'いまはその操作はできません';
  }

  // ---- ラウンドの終わり ----
  // ender: サイコロの目に合うカードがなくて終わらせた人（場が空になって終わったときは −1）
  function endRound(S, ender) {
    S.phase = 'scoring'; S.need = null;
    var has = gridColors(S), left = S.grid.filter(function (id) { return id >= 0; });
    var res = { round: S.round, ender: ender, emptied: ender < 0, left: left, lost: [], high: [], ex: [], before: S.P.map(score), after: null };
    S.P.forEach(function (P, p) {
      var keep = [], lost = [];
      P.cards.forEach(function (id) { (has[col(id)] ? lost : keep).push(id); });
      P.cards = keep; res.lost.push(lost); res.high.push(null); res.ex.push(null);
      lost.forEach(function (id) { S.out.push(id); });
    });
    left.forEach(function (id) { S.out.push(id); });
    S.grid = S.grid.map(function () { return -1; });
    S.result = res;
    pushEv(S, { kind: 'end', ender: ender, round: S.round });
    if (ender >= 0 && S.P[ender].cards.length) {
      var opts = highestOpts(S.P[ender]);
      if (opts.length === 1 || S.sim) { removeHighest(S, ender, opts.length === 1 ? opts[0] : aiHighest(S, ender)); return afterHighest(S); }
      S.need = { kind: 'highest', p: ender, opts: opts };
      return;
    }
    afterHighest(S);
  }
  function highestOpts(P) { var m = 0, o = []; P.cards.forEach(function (id) { m = Math.max(m, val(id)); }); P.cards.forEach(function (id, i) { if (val(id) === m) o.push(i); }); return o; }
  function removeHighest(S, p, i) {
    var id = S.P[p].cards.splice(i, 1)[0]; S.out.push(id); S.result.high[p] = id;
    pushEv(S, { kind: 'high', p: p, id: id });
  }
  function afterHighest(S) {
    var res = S.result;
    S.start = res.ender >= 0 ? res.ender : (S.last + 1) % S.n;   // 次のラウンドの最初の手番
    res.after = S.P.map(score);
    if (S.sim === 'round') { S.phase = 'simEnd'; S.need = null; return; }
    if (S.round >= ROUNDS) return finish(S);
    S.phase = 'exchange'; S.exQ = [];
    for (var k = 0; k < S.n; k++) S.exQ.push((S.start + k) % S.n);
    nextExchange(S);
  }
  // おたすけ札：ラウンドを終わらせた人（場が空なら最後に取った人の次）から順に、手元の数字カード1枚と交換できる
  function nextExchange(S) {
    while (S.exQ.length) {
      var p = S.exQ.shift();
      if (S.P[p].cards.length && S.ldeck.length) { S.need = { kind: 'lucky', p: p }; return; }
      S.result.ex[p] = { none: true };
    }
    S.need = null; S.phase = 'roundEnd'; S.result.after = S.P.map(score);
    if (!S.sim) S.results.push(S.result);
    pushEv(S, { kind: 'roundEnd', round: S.round });
  }
  function nextRound(S) { if (S.phase !== 'roundEnd') return false; startRound(S); return true; }
  function finish(S) {
    S.need = null; S.phase = 'over'; S.scores = S.P.map(score);
    var top = Math.max.apply(null, S.scores);
    S.winners = []; S.scores.forEach(function (s, p) { if (s === top) S.winners.push(p); });   // 同点は全員勝ち（公式）
    if (!S.sim) S.results.push(S.result);
    pushEv(S, { kind: 'over', winners: S.winners.slice() });
  }

  // ================================================================ ふーさん🐻 AI
  // 公平：見えている情報（場・全員の手元・使用済みカード・サイコロの目）だけを使う。
  //   山札の「順番」・おたすけ札の山の順番・未来のサイコロは使わない（山札の中身の内訳は、出たカードから数えれば分かるので使ってよい）
  var CL = [1, 0.81, 0.59, 0.35, 0.19, 0.13, 0.05];    // 新しい場で、ある色が k 枚のときに最後までに取り切られる確率（シミュレーションで調整）
  var LVAL = { up: 1.4, dn: 1.1, re: 1.6, sum: 0.9, lo: 1.5, hi: 2.0 };   // おたすけ札1枚の価値（1ラウンドあたり／1回札は合計）
  function choose(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  function hyp(N, K, nn, k) { return choose(K, k) * choose(N - K, nn - k) / choose(N, nn); }
  // 色ごとの「未来のラウンドを生き残る確率」。smart=true なら山札の中身（＝まだ出ていないカード）を数える
  function futTable(S, smart) {
    var L = ROUNDS - S.round, F = [];
    if (L <= 0) { for (var c = 0; c < NC; c++) F.push(1); return F; }
    var dc = []; for (c = 0; c < NC; c++) dc.push(0);
    S.deck.forEach(function (id) { dc[col(id)]++; });
    var D = S.deck.length;
    for (c = 0; c < NC; c++) {
      if (!smart) { F.push(L === 1 ? 0.5 : 0.15); continue; }
      var K = dc[c], f;
      if (L === 1 || D <= GRID) f = CL[Math.min(6, K)];
      else { f = 0; for (var k = 0; k <= Math.min(K, GRID); k++) f += hyp(D, K, GRID, k) * CL[Math.min(6, k)] * CL[Math.min(6, K - k)]; }
      F.push(f);
    }
    return F;
  }
  // ラウンド中：残り m 枚の場で、ある色の k 枚が取り切られる確率（おおまかな式）
  function clr(k, m) { if (k <= 0) return 1; var pc = Math.max(0.04, Math.min(0.92, (m - 4.2) / m)); return Math.pow(pc, k) * (m >= 12 ? 1 : 0.95); }
  function ctx(S, p, smart, lam, Fpre) {
    var F = Fpre || futTable(S, smart), k = [], mine = [], opp = [], m = gridLeft(S), n = S.n;
    for (var c = 0; c < NC; c++) { k.push(0); mine.push(0); opp.push(0); }
    S.grid.forEach(function (id) { if (id >= 0) k[col(id)]++; });
    S.P.forEach(function (P, q) { P.cards.forEach(function (id) { if (q === p) mine[col(id)] += val(id); else opp[col(id)] += val(id) / (n - 1); }); });
    return { F: F, k: k, mine: mine, opp: opp, m: m, lam: lam == null ? 1 : lam };
  }
  function takeScore(S, X, idxs) {
    var c = col(S.grid[idxs[0]]), v = 0; idxs.forEach(function (i) { v += val(S.grid[i]); });
    var k0 = X.k[c], k1 = k0 - idxs.length, m0 = X.m, m1 = m0 - idxs.length;
    var c0 = clr(k0, m0), c1 = clr(k1, m1), F = X.F[c];
    return (v * c1 + X.mine[c] * (c1 - c0)) * F - X.lam * X.opp[c] * (c1 - c0) * F;
  }
  // いまラウンドが終わったら（自分が終わらせる場合）どれだけ得か（続けた場合との差）
  function stopScore(S, p, X) {
    var has = gridColors(S), d = [];
    S.P.forEach(function (P, q) {
      var now = 0, cont = 0, hi = 0, hiF = 0;
      P.cards.forEach(function (id) {
        var c = col(id), f = X.F[c];
        cont += val(id) * (has[c] ? clr(X.k[c], X.m) : 1) * f;
        if (!has[c]) { now += val(id) * f; if (val(id) > hi || (val(id) === hi && f < hiF)) { hi = val(id); hiF = f; } }
      });
      if (q === p) now -= hi * hiF;
      d.push(now - cont);
    });
    var o = 0; d.forEach(function (x, q) { if (q !== p) o += x / (S.n - 1); });
    return d[p] - X.lam * o;
  }
  function bestTake(S, p, X, via, v) {
    var L = legalTakes(S, p, via, v), best = null, bs = -1e9;
    for (var i = 0; i < L.length; i++) { var s = takeScore(S, X, L[i]); if (s > bs) { bs = s; best = L[i]; } }
    return { idxs: best, s: bs };
  }
  function onceCost(S, t) { return (LVAL[t] || 1.5) * (S.round < ROUNDS ? 1 : 0.5); }
  // 強い：期待値で「取る／ふり直す／指名札／ストップ」を比べる
  function strongTurn(S, p, X, allowStop) {
    var nd = S.need, P = S.P[p], b = [], i;
    for (var d = 1; d <= 6; d++) b.push(bestTake(S, p, X, 'die', d));
    var once = { s: -1e9 };
    ['lo', 'hi'].forEach(function (t) { if (cnt(P, t)) { var r = bestTake(S, p, X, t); if (r.idxs && r.s - onceCost(S, t) > once.s) once = { idxs: r.idxs, s: r.s - onceCost(S, t), via: t }; } });
    var st = stopScore(S, p, X);
    function W(d, r) {   // 目 d が出て、あと r 回ふれるときの価値
      var bb = b[d - 1].idxs ? b[d - 1].s : -1e9, w = Math.max(bb, once.s);
      if (r > 0) w = Math.max(w, V(r));
      if (!b[d - 1].idxs) w = Math.max(w, r > 0 && !allowStop ? -1e9 : st);
      return w;
    }
    var memo = {};
    function V(r) { if (memo[r] != null) return memo[r]; var s = 0; for (var d = 1; d <= 6; d++) s += W(d, r - 1); return (memo[r] = s / 6); }
    var left = nd.max - nd.rolls;
    if (nd.die == null) {
      if (once.idxs && once.s > V(left)) return { a: 'take', idxs: once.idxs, via: once.via };
      return { a: 'roll' };
    }
    var cur = b[nd.die - 1], opts = [];
    if (cur.idxs) opts.push([cur.s, { a: 'take', idxs: cur.idxs, via: 'die' }]);
    if (once.idxs) opts.push([once.s, { a: 'take', idxs: once.idxs, via: once.via }]);
    if (left > 0) opts.push([V(left), { a: 'roll' }]);
    if (!cur.idxs && (allowStop || left === 0)) opts.push([st, { a: 'stop' }]);
    opts.sort(function (x, y) { return y[0] - x[0]; });
    return opts.length ? opts[0][1] : { a: 'stop' };
  }
  // 速い方針（モンテカルロの先読み用）：合えば一番よいカード、合わなければふり直し
  function quickTurn(S, p, X) {
    var nd = S.need, P = S.P[p];
    if (nd.die == null) return { a: 'roll' };
    var r = bestTake(S, p, X, 'die');
    if (r.idxs) {
      if (r.s < 0.6 && nd.rolls < nd.max && X.m > 8) return { a: 'roll' };
      return { a: 'take', idxs: r.idxs, via: 'die' };
    }
    if (nd.rolls < nd.max) return { a: 'roll' };
    var o = null; ['lo', 'hi'].forEach(function (t) { if (!o && cnt(P, t)) { var q = bestTake(S, p, X, t); if (q.idxs) o = { a: 'take', idxs: q.idxs, via: t }; } });
    return o || { a: 'stop' };
  }
  function weakTurn(S, p, rng) {
    var nd = S.need, P = S.P[p];
    if (nd.die == null) return { a: 'roll' };
    var all = legalTakes(S, p, 'die'), L = all.filter(function (x) { return x.length === 1; });
    if (!L.length) L = all;
    if (L.length) { if (rng() < 0.5) L.sort(function (a, b) { return val(S.grid[b[0]]) - val(S.grid[a[0]]); }); else shuffle(L, rng); return { a: 'take', idxs: L[0], via: 'die' }; }
    if (nd.rolls < nd.max) return { a: 'roll' };
    var o = null; ['lo', 'hi'].forEach(function (t) { if (!o && cnt(P, t)) { var q = legalTakes(S, p, t, null, 1); if (q.length) o = { a: 'take', idxs: q[0], via: t }; } });
    return o || { a: 'stop' };
  }
  function normalTurn(S, p, rng) {
    var X = ctx(S, p, false, 0), nd = S.need, P = S.P[p];
    if (nd.die == null) return { a: 'roll' };
    var r = bestTake(S, p, X, 'die');
    if (r.idxs) { if (rng() < 0.15) { var L = legalTakes(S, p, 'die'); return { a: 'take', idxs: L[Math.floor(rng() * L.length)], via: 'die' }; } return { a: 'take', idxs: r.idxs, via: 'die' }; }
    if (nd.rolls < nd.max) return { a: 'roll' };
    var o = null; ['lo', 'hi'].forEach(function (t) { if (!o && cnt(P, t)) { var q = bestTake(S, p, X, t); if (q.idxs) o = { a: 'take', idxs: q.idxs, via: t }; } });
    return o || { a: 'stop' };
  }
  // ---- アストラウルトラ：候補ごとに、ラウンドの終わりまで何十回も試しに遊んで比べる（モンテカルロ）
  // 試しの中のサイコロは毎回あたらしく作る乱数（本物の未来の目は誰にも分からない）。山札の並びはコピーしない。
  function cloneForSim(S, rr, full) {
    // 山札の「並び」はコピーしない：中身（出ていないカードの内訳）だけを取り、試しのたびに乱数で並べ直す
    var deck = S.deck.slice().sort(function (a, b) { return a - b; }), lpool = S.ldeck.slice().sort();
    if (rr) { shuffle(deck, rr); shuffle(lpool, rr); }
    return { n: S.n, round: S.round, deck: deck, ldeck: lpool, grid: S.grid.slice(), P: S.P.map(function (P) { return { cards: P.cards.slice(), lucky: P.lucky.slice() }; }),
      start: S.start, turn: S.turn, need: S.need ? JSON.parse(JSON.stringify(S.need)) : null, phase: S.phase, ev: [], evId: 0, out: [], lused: S.lused.slice(), last: S.last, result: null, results: [], sim: full ? 'full' : 'round', exQ: S.exQ ? S.exQ.slice() : [] };
  }
  function evalEnd(S, p, F) {
    var L = ROUNDS - S.round, vals = S.P.map(function (P) {
      var s = 0; P.cards.forEach(function (id) { s += val(id) * (L > 0 ? F[col(id)] : 1); });
      if (L > 0) P.lucky.forEach(function (t) { s += t === 'lo' || t === 'hi' ? LVAL[t] * 0.8 : LVAL[t] * L * 0.8; });
      return s;
    });
    var mx = -1e9, sum = 0; vals.forEach(function (x, q) { if (q !== p) { mx = Math.max(mx, x); sum += x; } });
    return vals[p] - 0.7 * mx - 0.3 * sum / (S.n - 1);
  }
  function rollout(T, p, F, rng) {
    var guard = 0;
    while (T.phase === 'play' && guard++ < 200) {
      var q = T.need.p, X = ctx(T, q, true, 1, F);
      var a = ULTRA.roll === 'quick' ? quickTurn(T, q, X) : strongTurn(T, q, X, false);
      if (act(T, q, a, rng)) act(T, q, { a: 'stop' }, rng);
    }
    return evalEnd(T, p, F);
  }
  // ゲームの最後まで試しに遊ぶ（未来のラウンドの場は、出ていないカードを乱数で並べ直して作る）
  function rolloutFull(T, p, F, rng) {
    var guard = 0, Fr = T.round;
    while (T.phase !== 'over' && guard++ < 600) {
      if (T.phase === 'roundEnd') { startRound(T); continue; }
      var nd = T.need; if (!nd) break;
      var q = nd.p;
      if (nd.kind === 'lucky') { act(T, q, quickLucky(T, q), rng); continue; }
      if (nd.kind === 'highest') { act(T, q, { a: 'highest', i: nd.opts[0] }, rng); continue; }
      if (T.round !== Fr) { F = futTable(T, true); Fr = T.round; }
      var a = quickTurn(T, q, ctx(T, q, true, 1, F));
      if (act(T, q, a, rng)) act(T, q, { a: 'stop' }, rng);
    }
    var sc = T.P.map(score), mx = -1e9, sum = 0;
    sc.forEach(function (x, q) { if (q !== p) { mx = Math.max(mx, x); sum += x; } });
    var d = sc[p] - mx;
    return (d > 0 ? 1 : d === 0 ? 0.5 : 0) * ULTRA.win + (sc[p] - 0.7 * mx - 0.3 * sum / (T.n - 1)) * 0.1;
  }
  function quickLucky(T, p) {
    var P = T.P[p]; if (!P.cards.length) return { a: 'lucky', i: -1 };
    var bi = 0; P.cards.forEach(function (id, i) { if (val(id) < val(P.cards[bi])) bi = i; });
    return { a: 'lucky', i: bi };
  }
  function ultraTurn(S, p, rng, budget) {
    var nd = S.need, P = S.P[p], X = ctx(S, p, true, 1), F = X.F, cands = [];
    function add(a, h) { cands.push({ a: a, h: h }); }
    var o = options(S, p);
    if (ULTRA.mode === 'strong' || (ULTRA.r3 && S.round < 3)) return strongTurn(S, p, X, false);
    if (o.roll && ULTRA.roll2) add({ a: 'roll' }, 0);
    if (o.stop && ULTRA.stop) add({ a: 'stop' }, stopScore(S, p, X));
    if (!ULTRA.roll2 || !ULTRA.stop) { var sg = strongTurn(S, p, X, false); if (sg.a !== 'take') return sg; }
    ['die', 'lo', 'hi'].forEach(function (via) {
      if (via === 'die' && nd.die == null) return;
      if (via !== 'die' && !o[via]) return;
      legalTakes(S, p, via).forEach(function (idxs) { add({ a: 'take', idxs: idxs, via: via }, takeScore(S, X, idxs) - (via === 'die' ? 0 : onceCost(S, via))); });
    });
    if (cands.length === 1) return cands[0].a;
    var takes = cands.filter(function (c) { return c.a.a === 'take'; }).sort(function (a, b) { return b.h - a.h; }).slice(0, ULTRA.top);
    cands = cands.filter(function (c) { return c.a.a !== 'take'; }).concat(takes);
    if (cands.length === 1) return cands[0].a;
    // 基本は「強い」と同じ手。試し遊び（同じ乱数の組で比べる）で、はっきり上回る手があったときだけ乗り換える
    var base = strongTurn(S, p, X, false), bkey = JSON.stringify(base), hasBase = false;
    cands.forEach(function (c) { if (JSON.stringify(c.a) === bkey) { hasBase = true; c.base = true; } });
    if (!hasBase) cands.push({ a: base, base: true });
    var R = budget || ULTRA.R, seeds = [];
    for (var r = 0; r < R; r++) seeds.push((rng() * 4294967296) >>> 0);
    cands.forEach(function (c) {
      c.xs = [];
      for (var r = 0; r < R; r++) {
        var rr = mulberry(seeds[r]), T = cloneForSim(S, ULTRA.full ? rr : null, ULTRA.full);
        if (act(T, p, c.a, rr)) { c.bad = true; break; }
        c.xs.push(ULTRA.full ? rolloutFull(T, p, F, rr) : rollout(T, p, F, rr));
      }
    });
    var B = cands.filter(function (c) { return c.base; })[0], best = B, bz = 0;
    cands.forEach(function (c) {
      if (c === B || c.bad) return;
      var m = 0, q = 0, n = c.xs.length;
      for (var r = 0; r < n; r++) { var d = c.xs[r] - B.xs[r]; m += d; q += d * d; }
      m /= n; var sd = Math.sqrt(Math.max(1e-12, q / n - m * m)), z = m / (sd / Math.sqrt(n));
      if (z > ULTRA.z && z > bz) { bz = z; best = c; }
    });
    return best.a;
  }
  // 調整結果（test/sim.js）：試し遊び120回・上位4手＋ふり直し＋ストップを比較、z>2 のときだけ「強い」の手から乗り換え
  var ULTRA = { R: 120, top: 4, roll: 'strong', mode: 'mc', r3: false, roll2: true, stop: true, full: true, win: 1, z: 2 };
  function aiHighest(S, p) {
    var opts = highestOpts(S.P[p]), F = futTable(S, true), best = opts[0];
    opts.forEach(function (i) { if (F[col(S.P[p].cards[i])] < F[col(S.P[p].cards[best])]) best = i; });
    return best;
  }
  function luckyEV(S, smart) {
    var L = ROUNDS - S.round; if (L <= 0) return 0;
    // 山の中身＝12枚から、見えている札（全員の手元＋使用済み）を引いたもの
    var pool = LUCKY_ALL.slice();
    S.P.forEach(function (P) { P.lucky.forEach(function (t) { pool.splice(pool.indexOf(t), 1); }); });
    S.lused.forEach(function (t) { var i = pool.indexOf(t); if (i >= 0) pool.splice(i, 1); });
    if (!smart || !pool.length) pool = LUCKY_ALL;
    var s = 0; pool.forEach(function (t) { s += t === 'lo' || t === 'hi' ? LVAL[t] : LVAL[t] * L; });
    return s / pool.length;
  }
  function aiLucky(S, p, lv, rng) {
    var P = S.P[p]; if (!P.cards.length || !S.ldeck.length) return { a: 'lucky', i: -1 };
    if (lv === 'weak') return rng() < 0.4 ? { a: 'lucky', i: Math.floor(rng() * P.cards.length) } : { a: 'lucky', i: -1 };
    var smart = lv === 'ultra', F = futTable(S, smart || lv === 'strong'), bi = 0, bv = 1e9;
    P.cards.forEach(function (id, i) { var v = val(id) * F[col(id)]; if (v < bv) { bv = v; bi = i; } });
    if (lv === 'normal') return val(P.cards[bi]) <= 2 ? { a: 'lucky', i: bi } : { a: 'lucky', i: -1 };
    if (lv === 'ultra') return { a: 'lucky', i: bi };   // シミュレーションでは「毎回交換」がいちばん勝率が高い
    return luckyEV(S, smart) > bv + 0.3 ? { a: 'lucky', i: bi } : { a: 'lucky', i: -1 };
  }
  // 公開：今の need に対する ふーさんの行動
  function aiAct(S, p, lv, rng, budget) {
    rng = rng || Math.random;
    var nd = S.need; if (!nd || nd.p !== p) return null;
    if (nd.kind === 'highest') return { a: 'highest', i: lv === 'weak' ? nd.opts[0] : aiHighest(S, p) };
    if (nd.kind === 'lucky') return aiLucky(S, p, lv, rng);
    if (lv === 'weak') return weakTurn(S, p, rng);
    if (lv === 'normal') return normalTurn(S, p, rng);
    if (lv === 'strong') return strongTurn(S, p, ctx(S, p, false, 1), false);
    return ultraTurn(S, p, rng, budget);
  }
  // テスト・シミュレーション用：最後まで自動で遊ぶ
  function simGame(levels, rng, opts) {
    opts = opts || {}; rng = rng || Math.random;
    var S = newGame(levels.length, { rng: rng, start: opts.start }); startRound(S);
    var guard = 0;
    while (S.phase !== 'over' && guard++ < 5000) {
      if (S.phase === 'roundEnd') { nextRound(S); continue; }
      var p = S.need.p, a = aiAct(S, p, levels[p], rng, opts.budget), err = act(S, p, a, rng);
      if (err) throw new Error('AI illegal move (' + levels[p] + '): ' + err + ' ' + JSON.stringify(a));
    }
    if (S.phase !== 'over') throw new Error('game did not end');
    return S;
  }

  var api = { NC: NC, GRID: GRID, ROUNDS: ROUNDS, LUCKY_ALL: LUCKY_ALL, LUCKY_TYPES: LUCKY_TYPES, ONCE: ONCE, col: col, val: val, cid: cid, fullDeck: fullDeck, shuffle: shuffle, mulberry: mulberry,
    cnt: cnt, maxRolls: maxRolls, score: score, gridColors: gridColors, gridLeft: gridLeft, newGame: newGame, startRound: startRound, nextRound: nextRound,
    totalOk: totalOk, takeError: takeError, legalTakes: legalTakes, canTake: canTake, options: options, act: act, aiAct: aiAct, simGame: simGame, futTable: futTable, cloneForSim: cloneForSim,
    _tune: { CL: CL, LVAL: LVAL, ULTRA: ULTRA }, _ai: { strongTurn: strongTurn, quickTurn: quickTurn, ultraTurn: ultraTurn, ctx: ctx, aiLucky: aiLucky, aiHighest: aiHighest, stopScore: stopScore, takeScore: takeScore, evalEnd: evalEnd, rollout: rollout } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KR = api;
})(this);
