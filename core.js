/* ころいろ：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、サイコロ・山札・進行・ふーさん🐻の思考はホストが行います。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.KR;
var Q = new URLSearchParams(location.search);
var CFG = window.KR_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'koroiro-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [60, 120], off: 1200, forced: 400, roundEnd: 1500, awaken: 2500, k: 0.2, dice: 160 } : { cpu: [650, 1200], off: 8000, forced: 2200, roundEnd: 9000, awaken: 7500, k: 1, dice: 750 };
var MAX_HUMANS = 4, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var BEAR = '🐻', CPU_BASE = 'ふーさん' + BEAR;
// 8色：色だけでなく「形」でも区別できるように
var COLS = [
  { n: 'あか', c: '#e03131', s: '●' }, { n: 'オレンジ', c: '#f08c00', s: '▲' }, { n: 'きいろ', c: '#f5c400', s: '★', dk: 1 }, { n: 'みどり', c: '#2f9e44', s: '◆' },
  { n: 'みずいろ', c: '#11a3bd', s: '✿' }, { n: 'あお', c: '#1c5fd6', s: '■' }, { n: 'むらさき', c: '#8e44ad', s: '♥' }, { n: 'ちゃいろ', c: '#8d5a3b', s: '♣' }
];
var LK = {
  up: { i: '＋1', n: 'のびのび＋1', d: 'ずっと使える。出目を＋1してもいい（2枚なら＋2まで）' },
  dn: { i: '−1', n: 'ちぢみ−1', d: 'ずっと使える。出目を−1してもいい（2枚なら−2まで）' },
  re: { i: '🎲＋', n: 'もう1回ダイス', d: 'ずっと使える。ふれる回数が1回ふえる（ふつうは2回まで）' },
  sum: { i: '🧺', n: 'いろまとめ', d: 'ずっと使える。同じ色のカードを何枚でも、数字の合計が出目になるように取れる（2枚あれば合計±1もOK）' },
  lo: { i: '1·2·3', n: 'ちいさめ指名', d: '1回だけ。ふらずに（ふった後でもOK）1・2・3のカードを1枚取れる' },
  hi: { i: '4·5·6', n: 'おおきめ指名', d: '1回だけ。ふらずに（ふった後でもOK）4・5・6のカードを1枚取れる' }
};
var LS_ID = 'kr-client-id', LS_NAME = 'kr-name', LS_HOST = 'kr-host-room', SS_CLIENT = 'kr-joined', LS_SOUND = 'kr-sound-off';
// 画面間で共有する状態
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- カード・札・サイコロの見た目 ----------
function colStyle(c) { var o = COLS[c]; return '--cc:' + o.c + ';--ct:' + (o.dk ? '#4a3800' : '#fff'); }
function cardHtml(id, cls, attrs) {
  var c = L.col(id), v = L.val(id);
  return '<div class="cd' + (cls ? ' ' + cls : '') + '" style="' + colStyle(c) + '"' + (attrs || '') + '><i>' + COLS[c].s + '</i><b>' + v + '</b></div>';
}
function chipHtml(id, cls) { var c = L.col(id); return '<span class="chip' + (cls ? ' ' + cls : '') + '" style="' + colStyle(c) + '"><i>' + COLS[c].s + '</i>' + L.val(id) + '</span>'; }
function luckyHtml(t, cls, attrs) { return '<span class="lk lk-' + t + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + LK[t].i + '</span>'; }
var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieFace(n) { var h = ''; for (var i = 0; i < 9; i++) h += '<i' + (n && PIPS[n].indexOf(i) >= 0 ? ' class="on"' : '') + '></i>'; return h; }

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
$('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
['rulesModal', 'menuModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('rulesList').innerHTML = [
  'カードは <b>8色 × 数字1〜6</b> の<b>48枚</b>（各1枚）。全部で<b>3ラウンド</b>。ラウンドのはじめに山から<b>16枚</b>を表向きで<b>4×4</b>にならべます（ラウンド中は補充なし）。',
  '自分の番：🎲を<b>ふる</b> → 出た目と<b>同じ数字のカードを1枚</b>取って、自分の前に置きます（色は自由）。目が気に入らなければ<b>1回だけふり直し</b>OK。ただし、ふり直したら<b>その目を使う</b>しかありません。',
  '出た目のカードが場に1枚もないと…<b style="color:var(--ng)">ストップ！</b> その人の番でラウンド終了。（場が空っぽになったときも終了）',
  'ラウンド終了：<b>場に残っている色</b>と同じ色のカードは、<b>全員</b>、手元から<b>ぜんぶ ふっとびます</b>💨（前のラウンドで取ったカードも！）',
  'さらに、ストップした人は、残ったカードのうち<b>いちばん大きい数字</b>を1枚すてます（同じ数字が何枚かあれば選べる）。',
  'おたすけ札：ストップした人から順に（場が空になったときは最後に取った人の次から）、手元の数字カード<b>1枚</b>をすてて、おたすけ札（ふせた山の上）を<b>1枚</b>もらえます（したい人だけ）。次のラウンドから使えます。',
  luckyHtml('up') + luckyHtml('dn') + luckyHtml('re') + luckyHtml('sum') + ' は<b>ずっと使える</b>札、' + luckyHtml('lo') + luckyHtml('hi') + ' は<b>1回だけ</b>の札（各2枚・全12枚）。何枚でも組み合わせてOK。<br>' +
    ['up', 'dn', 're', 'sum', 'lo', 'hi'].map(function (t) { return luckyHtml(t) + '<b>' + LK[t].n + '</b>：' + LK[t].d; }).join('<br>'),
  '次のラウンドは、ストップした人（場が空になったときは最後に取った人の次）から。手元のカードはそのまま持ち越し。',
  '3ラウンド後、手元に残った<b>カードの数字の合計</b>がいちばん大きい人の勝ち！ 同点なら<b>全員勝ち</b>。',
  'コツ：場に<b>少ししか残っていない色</b>を集めると守りやすい。ストップすると大きいカードを失うので、ふり直しは慎重に。',
  '2〜4人。空いた席は <b>ふーさん🐻</b>（弱い／普通／強い／アストラウルトラ😎）。ふーさんは<b>見えている情報だけ</b>で考えます（山札の並びや未来のサイコロは見ません）。'
].map(function (t) { return '<li>' + t + '</li>'; }).join('');
$('titleFan').innerHTML = cardHtml(L.cid(0, 6)) + cardHtml(L.cid(2, 3)) + '<span class="bear">🐻</span>' + '<div class="die big land">' + dieFace(5) + '</div>' + cardHtml(L.cid(5, 1));
