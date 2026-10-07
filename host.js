/* ころいろ：ホスト側のゲーム進行（authoritative）。サイコロ・山札・進行・ふーさん🐻の思考はここ */
'use strict';
var LINES = {
  roll: { weak: ['えいっ🎲', 'ころころ〜🎲'], normal: ['ふるクマ！🎲', 'いい目、出てクマ〜🎲'], strong: ['ここは{n}がほしいクマ🎲', 'ふるクマ🎲'], ultra: ['サイコロよ、ぼくに従うクマ😎🎲', '確率の海へ…😎🎲'] },
  reroll: { weak: ['もういっかい！'], normal: ['うーん、ふり直すクマ！'], strong: ['この目はイマイチ…ふり直すクマ'], ultra: ['期待値はふり直しを指しているクマ😎', 'この目は計算外だクマ😎'] },
  take: { weak: ['これ、もらうクマ〜', 'わーい！'], normal: ['これにするクマ！', 'いただきクマ'], strong: ['この色で守るクマ', '{c}を取っておくクマ'], ultra: ['{c}…読みどおりだクマ😎', 'フッ…ここしかないクマ😎'] },
  sum: ['いろまとめ発動クマ！🧺', 'まとめて いただきクマ🧺'],
  once: ['指名札を使うクマ🎟', 'ここで指名するクマ！🎟'],
  stop: { weak: ['クマ〜〜っ！？ 取れないクマ…'], normal: ['あちゃ〜、ストップだクマ…'], strong: ['うぐっ…出なかったクマ'], ultra: ['ば、ばかな…😎💦', 'フッ…ここで幕引きだクマ😎'] },
  stopBy: ['ここで終わらせるクマ！✋', 'ストップ宣言クマ✋'],
  lucky: ['おたすけ札、もらうクマ🍀', '交換するクマ🍀'],
  sad: ['ぼくのカードが〜💦', 'ふっとんだクマ…💨']
};
function hostId(code) { return ID_PREFIX + code; }
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', opts: { np: solo ? 3 : 4, lv: ['normal', 'normal', 'normal', 'normal'] }, nextSid: 2, gameNo: 0,
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (resumeRoom && resumeRoom.G) { resumeRoom.G.cpuAt = 0; resumeRoom.G.nextAt = 0; }
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 80);
}
// 席：人間が参加順に前から。残りは ふーさん
function planOwners(seats, opts) {
  var np = Math.min(4, Math.max(opts.np, seats.length, 2)), out = [];
  for (var i = 0; i < np; i++) { var h = seats[i]; out.push(h ? { kind: 'human', sid: h.sid, name: h.name } : { kind: 'cpu', lv: opts.lv[i] || 'normal', name: '' }); }
  var cpus = out.filter(function (o) { return o.kind === 'cpu'; });
  cpus.forEach(function (o, i) { o.name = cpus.length > 1 ? CPU_BASE + (i + 1) : CPU_BASE; });
  return out;
}
function hostStartGame() {
  var R = host.room;
  if (!R.seats.length) return;
  R.gameNo++; R.lobbyReq = null;
  var owners = planOwners(R.seats, R.opts), ultra = owners.some(function (o) { return o.kind === 'cpu' && o.lv === 'ultra'; });
  var S = L.newGame(owners.length);
  L.startRound(S);
  R.G = { S: S, owners: owners, ultra: ultra, startAt: Date.now() + (ultra ? T.awaken : 600), started: false, cpuAt: 0, nextAt: 0, roundEndAt: 0, say: null, seenEv: S.evId };
  R.phase = 'game';
  hostBroadcast();
}
function say(p, text) { var G = host.room.G; G.say = { id: (G.say ? G.say.id : 0) + 1, p: p, text: text }; }
function lvOf(p) { var o = host.room.G.owners[p]; return o && o.kind === 'cpu' ? o.lv : null; }
// 新しく起きた出来事に ふーさんがひとこと
function afterEvents() {
  var G = host.room.G, S = G.S;
  S.ev.forEach(function (e) {
    if (e.id <= G.seenEv) return;
    G.seenEv = e.id;
    var lv = e.p != null ? lvOf(e.p) : null;
    if (e.kind === 'roll' && lv) {
      if (e.n > 1) say(e.p, pick(LINES.reroll[lv]));
      else if (Math.random() < 0.35) say(e.p, fill(pick(LINES.roll[lv]), { n: 1 + Math.floor(Math.random() * 6) }));
    } else if (e.kind === 'take' && lv) {
      if (e.via !== 'die') say(e.p, pick(LINES.once));
      else if (e.ids.length > 1) say(e.p, pick(LINES.sum));
      else if (Math.random() < 0.3) say(e.p, fill(pick(LINES.take[lv]), { c: COLS[L.col(e.ids[0])].n }));
    } else if (e.kind === 'stop' && lv) say(e.p, pick(e.vol ? LINES.stopBy : LINES.stop[lv]));
    else if (e.kind === 'lucky' && lv && Math.random() < 0.6) say(e.p, pick(LINES.lucky));
    else if (e.kind === 'end') {
      var r = S.result; if (r) r.lost.forEach(function (ls, q) { if (lvOf(q) && ls.length >= 2 && Math.random() < 0.7) say(q, pick(LINES.sad)); });
    }
  });
}
function delayFor() {
  var G = host.room.G, S = G.S, e = S.ev[S.ev.length - 1], d = 700;
  if (!e) return 500;
  if (e.kind === 'roll') d = T.dice / T.k + 650;
  else if (e.kind === 'take') d = e.ids.length > 1 || e.via !== 'die' ? 1300 : 950;
  else if (e.kind === 'stop' || e.kind === 'end' || e.kind === 'high') d = 2600;
  else if (e.kind === 'lucky' || e.kind === 'noLucky') d = 900;
  else if (e.kind === 'round') d = 1200;
  return d * T.k;
}
function applyAct(p, a) {
  var G = host.room.G, S = G.S;
  var vol = a.a === 'stop' && S.need && S.need.kind === 'turn' && S.need.rolls < S.need.max;
  var err = L.act(S, p, a); if (err) return err;
  if (vol) { var e = S.ev[S.ev.length - 1]; if (e && e.kind === 'stop') e.vol = true; }   // ふり直せるのに、あえてストップ
  afterEvents(); G.nextAt = Date.now() + delayFor(); G.cpuAt = 0;
  if (S.phase === 'roundEnd' || S.phase === 'over') G.roundEndAt = Date.now() + T.roundEnd;
  hostBroadcast(); return null;
}
function hostAction(sid, m) {
  var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
  var S = G.S, nd = S.need;
  if (Date.now() < G.startAt || !nd) return null;
  var o = G.owners[nd.p];
  if (!o || o.kind !== 'human' || o.sid !== sid) return 'あなたの番ではありません';
  var a = { a: String(m.a) };
  if (m.a === 'take') { a.idxs = Array.isArray(m.v && m.v.idxs) ? m.v.idxs.map(Number) : []; a.via = ['die', 'lo', 'hi'].indexOf(m.v && m.v.via) >= 0 ? m.v.via : 'die'; }
  if (m.a === 'highest' || m.a === 'lucky') a.i = +m.v;
  return applyAct(nd.p, a);
}
// 人間の番で「ストップ」しか選べないとき（ふり直しも指名札もない）は、少し待って自動で進める
function onlyStop(S, p) { var o = L.options(S, p); return S.need.kind === 'turn' && o.stop && !o.roll && !o.lo && !o.hi; }
function hostTick() {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  if (now < G.startAt) return;
  if (!G.started) { G.started = true; G.nextAt = now + 300; hostBroadcast(); return; }
  var S = G.S;
  if (S.need) {
    var p = S.need.p, o = G.owners[p], seat = o.kind === 'human' ? seatBySid(o.sid) : null;
    var proxy = o.kind === 'human' && seat && seat.kind === 'remote' && !seat.connected;
    var forced = o.kind === 'human' && onlyStop(S, p);
    if (o.kind !== 'cpu' && !proxy && !forced) { G.cpuAt = 0; return; }
    if (now < G.nextAt) return;
    if (!G.cpuAt) { G.cpuAt = now + (o.kind === 'cpu' ? rand(T.cpu) * (S.need.kind === 'lucky' ? 0.7 : 1) : forced ? T.forced : T.off); return; }
    if (now < G.cpuAt) return;
    G.cpuAt = 0;
    if (forced) { applyAct(p, { a: 'stop' }); return; }
    if (proxy) toastAll(BEAR + ' 切断中の ' + seat.name + ' のかわりに ふーさんが選びました');
    var a = L.aiAct(S, p, o.kind === 'cpu' ? o.lv : 'normal');
    if (applyAct(p, a)) applyAct(p, { a: 'stop' });
    return;
  }
  if (S.phase === 'roundEnd' || S.phase === 'over') {
    if (!G.roundEndAt) G.roundEndAt = now + T.roundEnd;
    if (now >= G.roundEndAt) {
      G.roundEndAt = 0;
      if (S.phase === 'over') R.phase = 'end';
      else { L.nextRound(S); G.nextAt = now + 900 * T.k; afterEvents(); }
      hostBroadcast();
    } else if (now - (G.tickAt || 0) > 1000) { G.tickAt = now; hostBroadcast(); }
  }
}
function luckyPool(S) {   // おたすけ札の山に残っている内訳（全員の札・使用済みは見えているので公開情報）
  var c = {}; L.LUCKY_TYPES.forEach(function (t) { c[t] = 0; }); S.ldeck.forEach(function (t) { c[t]++; }); return c;
}
function viewFor(sid) {
  var R = host.room, G = R.G, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: { np: R.opts.np, lv: R.opts.lv.slice() },
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !G) return v;
  var S = G.S;
  v.g = { n: S.n, round: S.round, phase: S.phase, grid: S.grid, P: S.P, scores: S.P.map(L.score), start: S.start, last: S.last, k: S.evId,
    owners: G.owners.map(function (o) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { kind: o.kind, sid: o.sid, name: o.name, lv: o.lv, connected: !s || s.kind !== 'remote' || s.connected }; }),
    need: S.need, deck: S.deck.length, lpool: luckyPool(S), lleft: S.ldeck.length, lused: S.lused,
    ev: S.ev.slice(-10), result: S.result, results: S.results, winners: S.winners, ultra: G.ultra, wait: Math.max(0, G.startAt - now), say: G.say,
    nextIn: G.roundEndAt ? Math.max(0, G.roundEndAt - now) : null };
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() { var now = Date.now(); if (now - saveT < 700 && host.room.phase === 'game') return; saveT = now; try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: now })); } catch (e) {} }
