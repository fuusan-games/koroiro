/* ころいろ：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, roundShownAt: 0, roundKey: '', endKey: '', sel: [], selK: -1, dieUntil: 0, peek: false, pickI: -1 };
function render(v) {
  lastView = v; window.__kr.view = v;
  BGM.want(v.phase === 'game' && v.g ? (v.g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase !== 'game') overlay('roundModal', false);
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
function lvSelect(c, lv) { return '<select data-c="' + c + '" class="' + (lv === 'ultra' ? 'ultra' : '') + '" aria-label="ふーさんの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you && s.name !== 'あなた' ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  var np = Math.max(v.opts.np, n);
  $('npSeg').innerHTML = [2, 3, 4].map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '人</button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  var owners = planOwners(v.seats, v.opts);
  $('cpuList').innerHTML = owners.map(function (o, c) {
    return '<div class="crow"><span class="av" style="background:' + (o.kind === 'cpu' ? '#c4581d' : '#2f6b4a') + '">' + (c + 1) + '</span><span class="nm">' + esc(o.name) + (o.kind === 'human' && o.sid === v.sid && o.name !== 'あなた' ? '（あなた）' : '') + '</span>' +
      (o.kind === 'cpu' ? (isHost ? lvSelect(c, o.lv) : '<span class="lv ' + o.lv + '">' + LV[o.lv] + '</span>') : '') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + (k === 'ultra' ? 'アストラ<br>ウルトラ😎' : LV[k]) + '</button>'; }).join('');
  var cpuN = owners.filter(function (o) { return o.kind === 'cpu'; }).length;
  $('lvAllBox').style.display = cpuN && isHost ? '' : 'none';
  $('seatHint').textContent = v.solo ? '' : '2〜4人で遊べます。空いた席は ふーさん🐻 が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1;
}

// ---------------- ゲーム画面 ----------------
function mySeat(v) { var me = -1; v.g.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === v.sid) me = i; }); return me; }
function dispName(o) { return o.kind === 'cpu' ? o.name + (o.lv === 'ultra' ? '😎' : '') : o.name; }
function nmP(g, p) { return esc(dispName(g.owners[p])); }
function riskOf(g, P) { var has = L.gridColors(g), s = 0; if (g.phase !== 'play') return 0; P.cards.forEach(function (id) { if (has[L.col(id)]) s += L.val(id); }); return s; }
function rowHtml(g, p, me) {
  var o = g.owners[p], P = g.P[p], nd = g.need, cls = 'pr', has = g.phase === 'play' ? L.gridColors(g) : [];
  if (nd && nd.p === p) cls += ' cur';
  if (p === me) cls += o.name === 'あなた' ? ' me noTag' : ' me';
  if (o.kind === 'cpu' && o.lv === 'ultra') cls += ' ultra';
  if (!o.connected) cls += ' off';
  var risk = riskOf(g, P), chips = P.cards.map(function (id) { return chipHtml(id, has[L.col(id)] ? 'risk' : ''); }).join('');
  var lks = P.lucky.map(function (t) { return luckyHtml(t); }).join('');
  return '<div class="' + cls + '" data-p="' + p + '"><div class="pi"><div class="pn">' + esc(dispName(o)) + '</div><div class="pt"><b>' + g.scores[p] + '</b>点' + (risk ? '<small>⚠️' + risk + '</small>' : '') + '</div></div>' +
    '<div class="pc">' + (chips || '<span class="none">まだカードなし</span>') + '</div>' + (lks ? '<div class="pl"><div class="lks">' + lks + '</div></div>' : '') + '</div>';
}
// 自分の番で取れるカード
function myInfo(v) {
  var g = v.g, me = mySeat(v), nd = g.need, P = me >= 0 ? g.P[me] : null;
  var r = { me: me, my: false, o: null, die: [], lo: [], hi: [], P: P };
  if (!nd || nd.kind !== 'turn' || g.phase !== 'play' || g.wait > 0 || nd.p !== me) return r;
  r.my = true; r.o = L.options(g, me);
  if (nd.die != null) r.die = L.legalTakes(g, me, 'die');
  if (L.cnt(P, 'lo')) r.lo = L.legalTakes(g, me, 'lo');
  if (L.cnt(P, 'hi')) r.hi = L.legalTakes(g, me, 'hi');
  return r;
}
function inSets(sets, i) { for (var k = 0; k < sets.length; k++) if (sets[k].indexOf(i) >= 0) return true; return false; }
function selVia(v, sel) {
  var g = v.g, me = mySeat(v); if (!sel.length) return null;
  var vs = ['die', 'lo', 'hi'];
  for (var k = 0; k < vs.length; k++) if (!L.takeError(g, me, sel, vs[k])) return vs[k];
  return null;
}
function rangeText(P, d) {
  var lo = d - L.cnt(P, 'dn'), hi = d + L.cnt(P, 'up'), e = L.cnt(P, 'sum') >= 2 ? 1 : 0;
  lo -= e; hi += e; var parts = [];
  for (var x = Math.max(1, lo); x <= hi; x++) parts.push(x);
  return { lo: lo, hi: hi, txt: lo === hi ? String(d) : Math.max(1, lo) + '〜' + hi, sum: L.cnt(P, 'sum') > 0 };
}
function renderBoard(v, mi) {
  var g = v.g, nd = g.need, html = '';
  var other = nd && nd.kind === 'turn' && nd.die != null && g.phase === 'play' && !mi.my ? L.legalTakes(g, nd.p, 'die') : [];
  for (var i = 0; i < 16; i++) {
    var id = g.grid[i];
    if (id < 0) { html += '<div class="slot" data-i="' + i + '"></div>'; continue; }
    var cls = 'slot';
    if (mi.my) {
      if (inSets(mi.die, i)) cls += ' ok'; else if (inSets(mi.lo, i) || inSets(mi.hi, i)) cls += ' ok2'; else if (nd.die != null) cls += ' dim';
      if (ui.sel.indexOf(i) >= 0) cls += ' sel';
    } else if (other.length && inSets(other, i)) cls += ' cand';
    html += '<div class="' + cls + '" data-i="' + i + '">' + cardHtml(id) + '</div>';
  }
  $('board').innerHTML = html;
  layoutBoard();
}
function layoutBoard() {
  var s = $('board').querySelector('.slot'); if (!s) return;
  var fs = Math.max(16, Math.min(s.clientHeight * 0.58, s.clientWidth * 0.5));
  $('board').style.setProperty('--fs', Math.round(fs) + 'px');
}
function renderDie(v, mi) {
  var g = v.g, nd = g.need, d = $('die');
  if (Date.now() < ui.dieUntil) return;
  var show = nd && nd.kind === 'turn' && nd.die != null ? nd.die : null;
  d.className = 'die' + (show ? '' : ' idle') + (show && g.phase === 'play' && !L.canTake(g, nd.p, 'die') ? ' nomatch' : '');
  d.innerHTML = dieFace(show);
}
function renderInfo(v, mi) {
  var g = v.g, nd = g.need, box = $('rinfo');
  if (!nd || nd.kind !== 'turn' || g.phase !== 'play') { box.innerHTML = g.phase === 'play' ? '' : '<div class="what">ラウンド' + g.round + ' 終了</div>'; return; }
  var P = g.P[nd.p], dots = '';
  for (var k = 0; k < nd.max; k++) dots += k < nd.rolls ? '●' : '○';
  var who = (nd.p === mi.me ? 'あなた' : nmP(g, nd.p)) + 'の番 <span class="dots">' + dots + '</span>', what;
  if (nd.die == null) what = nd.p === mi.me ? '🎲をふってね' : 'これからふります';
  else {
    var r = rangeText(P, nd.die), can = L.canTake(g, nd.p, 'die');
    what = '出目 <b>' + nd.die + '</b>' + (r.txt !== String(nd.die) ? ' → <b>' + r.txt + '</b> OK' : '') + (r.sum ? '（同じ色の合計も）' : '') + (can ? '' : ' <span style="color:var(--ng)">取れるカードなし！</span>');
  }
  box.innerHTML = '<div class="who">' + who + '</div><div class="what">' + what + '</div>';
}
function renderMyLucky(v, mi) {
  var g = v.g, P = mi.me >= 0 ? g.P[mi.me] : null;
  $('mylk').innerHTML = P ? P.lucky.map(function (t) { return luckyHtml(t, 'big', ' data-lk="' + t + '"'); }).join('') : '';
}
function paintButtons() {
  var v = lastView; if (!v || !v.g || v.phase !== 'game') return;
  var g = v.g, mi = myInfo(v), nd = g.need;
  var rb = $('rollBtn'), tb = $('takeBtn'), sb = $('stopBtn');
  $('ctrl').classList.toggle('wait', !mi.my);
  if (!mi.my) {
    rb.disabled = tb.disabled = true; sb.style.display = 'none';
    $('rollSub').textContent = ''; $('takeSub').textContent = ''; rb.firstChild.nodeValue = '🎲 ふる'; tb.firstChild.nodeValue = '✋ 取る';
  } else {
    var o = mi.o, left = nd.max - nd.rolls;
    rb.disabled = !o.roll || !!pending;
    rb.firstChild.nodeValue = nd.rolls ? '🎲 ふり直す' : '🎲 ふる';
    $('rollSub').textContent = o.roll ? 'あと' + left + '回' : 'もうふれない';
    var via = selVia(v, ui.sel);
    tb.disabled = !via || !!pending;
    tb.firstChild.nodeValue = via && via !== 'die' ? '🎟 指名で取る' : '✋ 取る';
    $('takeSub').textContent = via ? (via === 'die' ? ui.sel.map(function (i) { return COLS[L.col(g.grid[i])].s + L.val(g.grid[i]); }).join('+') : LK[via].n + 'を使う') : (nd.die == null ? (mi.lo.length || mi.hi.length ? '指名札でも取れる' : 'まずふってね') : (mi.die.length ? 'カードをタップ' : '取れるカードなし'));
    sb.style.display = o.stop && (o.roll || o.lo || o.hi) ? '' : 'none';
    sb.disabled = !!pending;
  }
  var st = '', cls = '';
  if (g.wait > 0) st = g.ultra ? '…なにかが 目覚めようとしている…' : 'まもなく開始…';
  else if (g.phase !== 'play') st = g.phase === 'over' ? '🎉 ゲーム終了！' : 'ラウンド' + g.round + ' 終了';
  else if (mi.my) {
    cls = 'mine'; var o2 = mi.o;
    if (nd.die == null) st = 'あなたの番！ 🎲をふってね' + (mi.lo.length || mi.hi.length ? '（指名札も使えます）' : '');
    else if (!o2.die && !o2.roll && !o2.lo && !o2.hi) st = '取れるカードがない… <b style="color:var(--ng)">ストップ！</b>';
    else if (!o2.die) st = '取れるカードがない！ ' + (o2.roll ? 'ふり直す？' : '') + (o2.lo || o2.hi ? ' 指名札で取る？' : '') + ' それともストップ？';
    else st = (L.cnt(mi.P, 'sum') ? '光っているカードをタップ（同じ色は何枚でも）→「取る」' : '光っているカードをタップ →「取る」') + (o2.roll ? '／ふり直しもOK' : '');
  } else if (nd && nd.kind === 'turn') {
    var ow = g.owners[nd.p];
    st = ow.kind === 'cpu' ? BEAR + ' ' + nmP(g, nd.p) + ' が考え中…' : nmP(g, nd.p) + ' の番です' + (ow.connected ? '' : '（切断中）');
  }
  $('status').innerHTML = st; $('status').className = 'status ' + cls;
}
function popText(text, cls) { var p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go ' + (cls || ''); }
function animDie(final, nomatch) {
  var d = $('die'), n = 0; ui.dieUntil = Date.now() + T.dice + 60;
  d.className = 'die rolling'; clearInterval(ui.dieT);
  ui.dieT = setInterval(function () {
    n++; d.innerHTML = dieFace(1 + Math.floor(Math.random() * 6));
    if (n * 70 >= T.dice) { clearInterval(ui.dieT); d.innerHTML = dieFace(final); d.className = 'die land' + (nomatch ? ' nomatch' : ''); }
  }, 70);
  sfx.dice();
}
// 取ったカードが手元へ飛んでいく
function flyCards(e) {
  var rects = [];
  (e.idxs || []).forEach(function (i, k) {
    var s = $('board').querySelector('.slot[data-i="' + i + '"] .cd'); if (!s) return;
    var r = s.getBoundingClientRect(), c = s.cloneNode(true); c.classList.add('fly');
    c.style.left = r.left + 'px'; c.style.top = r.top + 'px'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; c.style.setProperty('--fs', getComputedStyle($('board')).getPropertyValue('--fs'));
    document.body.appendChild(c); rects.push([c, r]);
  });
  setTimeout(function () {
    var row = $('players').querySelector('.pr[data-p="' + e.p + '"]'), t = row ? row.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    rects.forEach(function (x, k) {
      var c = x[0], r = x[1];
      c.style.transform = 'translate(' + (t.left + t.width / 2 - r.left - r.width / 2 + k * 14) + 'px,' + (t.top + t.height / 2 - r.top - r.height / 2) + 'px) scale(.3)'; c.style.opacity = '.2';
      setTimeout(function () { c.remove(); }, 650);
    });
    if (row) { row.classList.remove('gain'); void row.offsetWidth; row.classList.add('gain'); }
  }, 30);
}
function onEvent(v, e, me) {
  var g = v.g, o = e.p != null ? g.owners[e.p] : null, ultra = o && o.kind === 'cpu' && o.lv === 'ultra';
  if (e.kind === 'roll') {
    var P = g.P[e.p], ok = L.legalTakes({ phase: 'play', need: { kind: 'turn', p: e.p, die: e.d }, grid: g.grid, P: g.P }, e.p, 'die', e.d, 1).length > 0;
    if (g.k === e.id || g.phase === 'play') animDie(e.d, !ok);
  } else if (e.kind === 'take') {
    flyCards(e); sfx.card();
    if (e.via !== 'die') { popText('🎟 ' + LK[e.via].n + '！', 'info'); if (ultra) cutin(LK[e.via].n + ' 発動！', 'ここは指名の一手だクマ😎'); }
    else if (e.ids.length > 1) { popText('🧺 いろまとめ ×' + e.ids.length + '！', 'good'); if (ultra && e.ids.length >= 3) cutin('いろまとめ 発動！', '合計' + e.ids.reduce(function (s, id) { return s + L.val(id); }, 0) + '…計算どおりだクマ😎'); }
    var left = g.grid.filter(function (x) { return x >= 0; }).length;
    if (left && e.ids.length && !g.grid.some(function (x) { return x >= 0 && L.col(x) === L.col(e.ids[0]); })) setTimeout(function () { popText(COLS[L.col(e.ids[0])].s + ' ' + COLS[L.col(e.ids[0])].n + ' は場から消えた！', 'good'); }, 350);
  } else if (e.kind === 'stop') {
    popText(e.vol ? '✋ ストップ宣言！' : 'ストップ！ 取れるカードなし', 'bad');
    $('board').classList.remove('stopFx'); void $('board').offsetWidth; $('board').classList.add('stopFx'); sfx.bust();
    if (e.p === me) vibrate([60, 40, 120]);
    if (ultra && e.vol) cutin('ストップ宣言！', 'ここで幕引きだクマ😎');
  } else if (e.kind === 'end') { if (e.ender < 0) popText('場が空っぽ！ ラウンド終了', 'good'); }
  else if (e.kind === 'lucky') sfx.safe();
  else if (e.kind === 'round') { popText('ラウンド' + e.round + ' スタート！', 'info'); ui.sel = []; }
  if (g.need && g.need.kind === 'turn' && g.need.p === me && g.need.rolls === 0 && e.id === g.ev[g.ev.length - 1].id && e.kind !== 'round') sfx.turn();
}
function renderGame(v) {
  var g = v.g, me = mySeat(v), gk = v.code + ':' + v.gameNo;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0; ui.roundKey = ''; ui.sel = [];
    if (g.ultra && g.wait > 600) awaken();
  }
  if (ui.selK !== g.k) { ui.selK = g.k; ui.sel = ui.sel.filter(function (i) { return g.grid[i] >= 0; }); if (!(g.need && g.need.kind === 'turn' && g.need.p === me)) ui.sel = []; }
  var evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) ui.lastEv = evs[evs.length - 1].id;
  evs.forEach(function (e) { if (e.kind === 'take') onEvent(v, e, me); });   // 飛ぶ演出は、場を描きかえる前に
  $('phLabel').textContent = 'ラウンド' + g.round + '/3・場 ' + L.gridLeft(g) + '枚・おたすけ札 山' + g.lleft;
  $('players').innerHTML = g.owners.map(function (o, p) { return rowHtml(g, p, me); }).join('');
  var mi = myInfo(v);
  renderBoard(v, mi);
  evs.forEach(function (e) { if (e.kind !== 'take') onEvent(v, e, me); });
  renderDie(v, mi); renderInfo(v, mi); renderMyLucky(v, mi);
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble' + (o && o.lv === 'ultra' ? ' ultra' : ''); b.textContent = (o ? dispName(o) : '') + '「' + g.say.text + '」';
    var gw = document.querySelector('#game .gwrap'); gw.querySelectorAll('.bubble').forEach(function (x) { x.remove(); });
    b.style.top = ($('board').offsetTop + 4) + 'px'; gw.appendChild(b); setTimeout(function () { b.remove(); }, 3200);
  }
  paintButtons();
  var ended = g.phase !== 'play' && g.result;
  if (ended) {
    var rk = gk + ':' + g.round, dl = 1500 * (TURBO ? 0.2 : 1);
    if (ui.roundKey !== rk) { ui.roundKey = rk; ui.peek = false; ui.pickI = -1; ui.roundShownAt = Date.now() + dl; setTimeout(function () { if (lastView && lastView.phase === 'game') renderGame(lastView); }, dl + 50); }
    if (Date.now() >= ui.roundShownAt) { renderRound(v, g.result); overlay('roundModal', true); }
  } else if (ui.peek && g.results.length) { renderRound(v, g.results[g.results.length - 1]); overlay('roundModal', true); }
  else overlay('roundModal', false);
}
function renderRound(v, r) {
  var g = v.g, me = mySeat(v), nd = g.need, live = r === g.result && g.phase !== 'play';
  $('rdTitle').textContent = (g.phase === 'over' && live ? '🎉 最終ラウンドの結果' : 'ラウンド' + r.round + ' の結果');
  $('rdLeft').innerHTML = r.emptied ? '場のカードが ぜんぶ取られた！ ふっとぶ色はなし' : nmP(g, r.ender) + ' がストップ！ 場に残った色：' + r.left.map(function (id) { return chipHtml(id); }).join('') + '<br>→ この色の手元カードは ぜんぶ ふっとぶ💨';
  $('rdList').innerHTML = g.owners.map(function (o, p) {
    var P = g.P[p], lost = r.lost[p] || [], hi = r.high[p], ex = r.ex[p], after = r.after ? r.after[p] : g.scores[p];
    if (live) after = g.scores[p];
    var cs = '';
    if (lost.length) cs += '<span class="lab2">ふっとび💨</span>' + lost.map(function (id) { return chipHtml(id, 'lost'); }).join('');
    if (hi != null) cs += '<span class="lab2" style="margin-left:4px">ストップ罰</span>' + chipHtml(hi, 'lost hot');
    if (ex && ex.gave != null) cs += '<span class="lab2" style="margin-left:4px">交換</span>' + chipHtml(ex.gave, 'lost') + '→' + luckyHtml(ex.got);
    else if (ex && ex.skip) cs += '<span class="lab2" style="margin-left:4px">交換しない</span>';
    if (!cs) cs = '<span class="lab2">ふっとんだカードなし👍</span>';
    var lostPts = lost.reduce(function (s, id) { return s + L.val(id); }, 0) + (hi != null ? L.val(hi) : 0);
    return '<div class="rr"><div class="h"><span class="nm">' + esc(dispName(o)) + (p === me && o.name !== 'あなた' ? '（あなた）' : '') + '</span><span class="tot">' + after + '点' + (lostPts ? '<small>−' + lostPts + '</small>' : '') + '</span></div><div class="cs">' + cs + '</div></div>';
  }).join('');
  var act = '';
  if (live && nd && nd.kind === 'highest') {
    if (nd.p === me) act = '<div class="actbox"><h4>いちばん大きい数字を1枚すてます。どれにする？</h4><div class="pick">' + nd.opts.map(function (i) { return '<span class="chip pickable" data-hi="' + i + '" style="' + colStyle(L.col(g.P[me].cards[i])) + '"><i>' + COLS[L.col(g.P[me].cards[i])].s + '</i>' + L.val(g.P[me].cards[i]) + '</span>'; }).join('') + '</div></div>';
    else act = '<p class="mid" style="font-size:13px">' + nmP(g, nd.p) + ' が すてるカードを選んでいます…</p>';
  } else if (live && nd && nd.kind === 'lucky') {
    if (nd.p === me) {
      var P = g.P[me];
      act = '<div class="actbox"><h4>🍀 おたすけ札と交換する？</h4><p class="tdesc" style="font-size:12.5px;margin:0">手元のカードを1枚えらんでタップ → 「交換する」。（ふせた山から1枚もらえます）</p><div class="pick">' +
        P.cards.map(function (id, i) { return '<span class="chip pickable' + (ui.pickI === i ? ' on' : '') + '" data-ex="' + i + '" style="' + colStyle(L.col(id)) + '"><i>' + COLS[L.col(id)].s + '</i>' + L.val(id) + '</span>'; }).join('') +
        '</div><div class="row"><button class="btn" id="exNo">しない</button><button class="btn main" id="exYes"' + (ui.pickI >= 0 ? '' : ' disabled') + '>交換する</button></div>' + poolHtml(g) + '</div>';
    } else act = '<p class="mid" style="font-size:13px">🍀 ' + nmP(g, nd.p) + ' が おたすけ札と交換するか考え中…</p>' + poolHtml(g);
  }
  $('rdAct').innerHTML = act;
  // 自分の選ぶ番になったら、選ぶところが見えるように下までスクロール（小さい画面用）
  var myKey = live && nd && nd.p === me && (nd.kind === 'lucky' || nd.kind === 'highest') ? g.round + nd.kind : '';
  if (myKey && ui.rdScroll !== myKey) { var box = $('roundModal').querySelector('.card'); setTimeout(function () { box.scrollTop = box.scrollHeight; }, 30); }
  ui.rdScroll = myKey;
  var next = '';
  if (live && g.nextIn != null) next = g.phase === 'over' ? 'まもなく結果発表…' : '次のラウンドまで ' + Math.ceil(g.nextIn / 1000) + '秒';
  $('rdNext').textContent = next;
  $('rdGo').style.display = live && (g.phase === 'roundEnd' || g.phase === 'over') ? '' : 'none';
  $('rdGo').textContent = g.phase === 'over' ? '▶ 結果を見る' : '▶ 次のラウンドへ';
  $('rdClose').style.display = live ? 'none' : '';
}
function poolHtml(g) { return '<div class="pool">山の中身（' + g.lleft + '枚）：' + L.LUCKY_TYPES.filter(function (t) { return g.lpool[t]; }).map(function (t) { return luckyHtml(t) + '×' + g.lpool[t]; }).join(' ') + '</div>'; }
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var rows = g.owners.map(function (o, p) { return { o: o, p: p, sc: g.scores[p] }; }).sort(function (a, b) { return b.sc - a.sc; });
  var rank = 0, wins = g.winners || [];
  $('rankList').innerHTML = rows.map(function (r, i) {
    if (i === 0 || r.sc < rows[i - 1].sc) rank = i + 1;
    return '<div class="rk' + (rank === 1 ? ' first' : '') + '"><span class="md">' + (['🥇', '🥈', '🥉'][rank - 1] || rank) + '</span><span class="nm">' + esc(dispName(r.o)) +
      (r.o.kind === 'cpu' ? ' <span class="lv ' + r.o.lv + '" style="font-size:10px">' + LV[r.o.lv] + '</span>' : '') + (r.o.sid === v.sid && r.o.kind === 'human' && r.o.name !== 'あなた' ? '<small>あなた</small>' : '') +
      '<span class="cs">' + g.P[r.p].cards.map(function (id) { return chipHtml(id); }).join('') + '</span></span><span class="sc">' + r.sc + '</span></div>';
  }).join('');
  var w0 = g.owners[wins[0]], txt;
  if (wins.length > 1) txt = '🤝 ' + wins.map(function (p) { return esc(dispName(g.owners[p])); }).join('・') + ' の同点優勝！';
  else if (w0.kind === 'cpu') txt = BEAR + (w0.lv === 'ultra' ? '「出目の神は、ぼくに微笑んだクマ😎」' : '「ふーさんの勝ちクマ〜！」');
  else txt = '🎉 ' + esc(w0.name) + ' の勝ち！ ' + BEAR + '「まいったクマ〜」';
  $('rankList').innerHTML += '<p class="mid">' + txt + '</p>';
  $('histLine').innerHTML = (g.results || []).map(function (r) { return 'R' + r.round + '：' + r.after.join(' / '); }).join('　');
  $('leaveBtn2').textContent = host ? (host.room.solo ? '🚪 タイトルへ' : '🚪 部屋を閉じる') : '🚪 部屋を出る';
  var key = v.code + ':' + v.gameNo;
  if (ui.endKey !== key) { ui.endKey = key; confetti(70); sfx.win(); }
}
window.addEventListener('resize', function () { if (lastView && lastView.phase === 'game') layoutBoard(); });
