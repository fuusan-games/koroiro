// E2E: ころいろ — solo vs ふーさん at 390×844 and 375×667, then host + guest over real PeerJS cloud signaling (local STUN workaround).
// usage: node test/stun-server.js <box-ip> 3478 &  python3 -m http.server 8811 &  node test/e2e.js <box-ip> 8811
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8811;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__kr.view && JSON.parse(JSON.stringify(window.__kr.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__kr.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const ctl = ['rollBtn', 'takeBtn'].map(id => document.getElementById(id).getBoundingClientRect());
      const slot = document.querySelector('#board .slot'), sl = slot ? slot.getBoundingClientRect() : { width: 0, height: 0 };
      const board = document.getElementById('board').getBoundingClientRect();
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY: scrollY, fab: !!fr, hits, inGame: document.body.classList.contains('in-game'),
        ctlBottom: Math.max(ctl[0].bottom, ctl[1].bottom), ctlH: Math.min(ctl[0].height, ctl[1].height), vh: innerHeight, slotW: sl.width, slotH: sl.height, boardBottom: board.bottom, ctlTop: Math.min(ctl[0].top, ctl[1].top) };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.ctlBottom > r.vh + 0.5 || r.ctlH < 48) fail(`[${tag}] controls off-screen/small ${JSON.stringify(r)}`);
      if (r.slotH < 44 || r.slotW < 60) fail(`[${tag}] board cards too small ${r.slotW}x${r.slotH}`);
      if (r.boardBottom > r.ctlTop) fail(`[${tag}] board overlaps controls`);
    }
    return r;
  }
  // 自分の番を本物のタップで進める（ふる → 光ったカードをタップ → 取る／ふり直し／指名札／ストップ、交換・最大カード選び）
  async function humanTurns(p, who, n, shots) {
    let done = 0, kinds = {};
    while (done < n) {
      await p.waitForFunction(() => { const v = window.__kr.view; if (!v || v.phase !== 'game') return true; const g = v.g, me = mySeat(v), nd = g.need;
        if (!nd || nd.p !== me || g.wait > 0) return false;
        if (nd.kind === 'turn') return g.phase === 'play' && !document.getElementById('rollBtn').disabled || document.querySelector('#board .slot.ok') || document.querySelector('#board .slot.ok2') || document.getElementById('stopBtn').style.display !== 'none';
        return document.getElementById('roundModal').classList.contains('active') && !!document.querySelector('#rdAct [data-ex], #rdAct [data-hi]'); }, null, { timeout: 90000 });
      const s = await p.evaluate(() => { const v = window.__kr.view; if (v.phase !== 'game') return null; const g = v.g; return { kind: g.need.kind, die: g.need.die, k: g.k,
        ok: !!document.querySelector('#board .slot.ok'), ok2: !!document.querySelector('#board .slot.ok2'), roll: !document.getElementById('rollBtn').disabled, stop: document.getElementById('stopBtn').style.display !== 'none' }; });
      if (!s) { await sleep(300); continue; }
      if (s.kind === 'lucky') {
        await p.tap('#rdAct [data-ex]'); if (shots && !kinds.lucky) await p.screenshot({ path: SS + shots + '_exchange.png' });
        await p.tap('#exYes'); kinds.lucky = 1;
      } else if (s.kind === 'highest') { await p.tap('#rdAct [data-hi]'); kinds.highest = 1; }
      else if (s.die == null && s.roll) { await p.tap('#rollBtn'); kinds.roll = 1; }
      else if (s.ok) {
        await p.tap('#board .slot.ok'); await sleep(80);
        if (shots && !kinds.take) { await p.evaluate(() => document.getAnimations().forEach(a => { try { if (isFinite(a.effect.getComputedTiming().endTime)) a.finish(); } catch (e) {} })); await p.screenshot({ path: SS + shots + '_select.png' }); }
        await p.tap('#takeBtn'); kinds.take = 1;
      }
      else if (s.roll) { await p.tap('#rollBtn'); kinds.reroll = 1; }
      else if (s.ok2) { await p.tap('#board .slot.ok2'); await p.tap('#takeBtn'); kinds.once = 1; }
      else if (s.stop) { await p.tap('#stopBtn'); await p.tap('#cfYes'); kinds.stop = 1; }
      else { await sleep(200); continue; }
      await p.waitForFunction(k => { const v = window.__kr.view; return !v.g || v.g.k !== k; }, s.k, { timeout: 10000 }).catch(() => fail(`[${who}] tap had no effect (${JSON.stringify(s)})`));
      done++;
    }
    ok(`[${who}] ${n} actions by real taps (${Object.keys(kinds).join('／')})`);
  }

  // ================= 1) solo, 390×844, ?from=portal, アストラウルトラ =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    let L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.tap('#npSeg button[data-v="3"]');
    await p.selectOption('select[data-c="1"]', 'ultra'); await p.selectOption('select[data-c="2"]', 'strong');
    await waitV(p, "v.opts.lv[1] === 'ultra' && v.opts.np === 3");
    await p.screenshot({ path: SS + 'lobby_solo.png' });
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 });
    const dur = await p.evaluate(() => { const a = document.getAnimations().filter(a => a.effect && a.effect.target && (a.effect.target.id === 'awaken' || a.effect.target.closest && a.effect.target.closest('#awaken'))); return Math.max.apply(null, a.map(x => x.effect.getComputedTiming().endTime)); });
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => ({ title: document.querySelector('.aw-title b').textContent, parts: document.querySelectorAll('#awParts i').length, bgm: window.__kr.bgm() }));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (dur < 6500 || dur > 8000) fail('awakening length ' + dur); else ok(`「${aw.title}」 cinematic ${(dur / 1000).toFixed(1)}s, ${aw.parts} particles; BGM waits (cur=${aw.bgm.cur}, wanted=${aw.bgm.wanted})`);
    if (aw.bgm.cur) fail('BGM should wait for the cinematic');
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 8000); await sleep(1500);
    const b = await p.evaluate(() => ({ s: window.__kr.bgm(), lv: window.__kr.bgmLevel() }));
    if (b.s.cur !== 'epic' || !(b.lv > 0.002)) fail('epic BGM not playing ' + JSON.stringify(b)); else ok(`「最終決戦」BGM playing after awakening (level ${b.lv.toFixed(3)})`);
    if (!(await p.$('.pr.ultra'))) fail('ultra row aura missing'); else ok('アストラウルトラ row has the aura border');
    await layout(p, 'game390');
    await humanTurns(p, 'solo390', 8, 'solo');
    await p.evaluate(() => window.__kr.cutin('ストップ宣言！', 'テスト')); await sleep(120);
    if (!(await p.$('#cutin.on')) || !(await p.$('#game.quake'))) fail('ultra cut-in not shown'); else ok('ultra cut-in (flash + band + lightning + shake) renders');
    await sleep(1700);
    // illegal tap: a non-lit card shows a hint and does nothing
    // gameplay screenshot once players hold several cards
    await p.evaluate(() => { window.__kr.autoplay = true; });
    await p.waitForFunction(() => { const v = window.__kr.view; return v.phase !== 'game' || (v.g.phase === 'play' && v.g.P.reduce((s, P) => s + P.cards.length, 0) >= 7 && v.g.need.die != null && !document.getElementById('roundModal').classList.contains('active')); }, null, { timeout: 120000 });
    await p.evaluate(() => { window.__kr.autoplay = false; }); await sleep(300);
    await p.evaluate(() => document.getAnimations().forEach(a => { try { if (isFinite(a.effect.getComputedTiming().endTime)) a.finish(); } catch (e) {} }));
    await p.screenshot({ path: SS + 'gameplay.png' }); await layout(p, 'gameplay390');
    await p.evaluate(() => { window.__kr.autoplay = true; });
    await p.waitForFunction(() => { const v = window.__kr.view; return v.phase !== 'game' || document.getElementById('roundModal').classList.contains('active'); }, null, { timeout: 120000 });
    await sleep(300); await p.screenshot({ path: SS + 'round_result.png' });
    const t0 = Date.now();
    await waitV(p, 'v.phase === "end"', 300000).catch(() => {});
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      ok(`solo 390×844 game finished (${((Date.now() - t0) / 1000).toFixed(0)}s after round modal): rounds ${v.g.round}, scores ${v.g.owners.map((o, i) => o.name.replace('ふーさん🐻', 'ふー') + (o.lv ? '(' + o.lv + ')' : '') + ' ' + v.g.scores[i]).join(' / ')}, winners ${JSON.stringify(v.g.winners)}`);
      if (v.g.round !== 3) fail('should end after 3 rounds');
      if ((await p.$$('#rankList .rk')).length !== 3) fail('rank list should show 3 rows');
      await sleep(400); await p.screenshot({ path: SS + 'result.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen, no overlap');
    }
    await p.context().close();
  }

  // ================= 2) solo, 375×667 (iPhone SE size), 4 players =================
  {
    const p = await phone('solo375', 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby375');
    await p.tap('#npSeg button[data-v="4"]'); await p.tap('#lvAllSeg button[data-v="strong"]');
    await waitV(p, 'v.opts.np === 4');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await layout(p, 'game375');
    await humanTurns(p, 'solo375', 4);
    // menu → rules → close (reachable during play), hub reachable from menu
    await p.tap('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.tap('#menuRules'); await sleep(100);
    if (!hub || !(await p.isVisible('#rulesModal'))) fail('⋯ menu: rules / ひろば not reachable'); else ok('⋯ menu has 🏠 ひろばへ and あそびかた during play');
    await p.screenshot({ path: SS + 'rules_375.png' }); await p.tap('#rulesClose');
    // ラウンド終わりの交換（おたすけ札）を本物のタップで
    await p.evaluate(() => { window.__kr.autoplay = true; });
    const gotEx = await p.waitForFunction(() => { const v = window.__kr.view, g = v.g; if (!g || v.phase !== 'game') return 'end';
      if (g.need && g.need.p === mySeat(v) && g.need.kind === 'lucky') { window.__kr.autoplay = false; return 'ex'; } return false; }, null, { timeout: 120000, polling: 20 }).then(h => h.jsonValue()).catch(() => null);
    await p.evaluate(() => { window.__kr.autoplay = false; });
    if (gotEx === 'ex') {
      await p.waitForSelector('#rdAct [data-ex]', { timeout: 8000 });
      const nLk = await p.evaluate(() => window.__kr.view.g.P[mySeat(window.__kr.view)].lucky.length);
      await p.tap('#rdAct [data-ex]'); await sleep(100); await p.screenshot({ path: SS + 'exchange_375.png' }); await p.tap('#exYes');
      await p.waitForFunction(n => { const v = window.__kr.view; return v.g.P[mySeat(v)].lucky.length === n + 1; }, nLk, { timeout: 8000 })
        .then(() => ok('round-end exchange: tapped a card → got an おたすけ札'), () => fail('exchange tap did not give a lucky card'));
      await layout(p, 'exchange375');
    } else fail('never reached my exchange (' + gotEx + ')');
    await p.evaluate(() => { window.__kr.autoplay = true; });
    let sampled = 0; const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const v = await view(p); if (v.phase === 'end') break;
      if (v.phase === 'game' && sampled < 6) { await layout(p, 'game375-sample'); sampled++; if (sampled === 3) await p.screenshot({ path: SS + 'gameplay_375.png' }); }
      await sleep(2000);
    }
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 375 game did not finish');
    else ok(`solo 375×667 4-player game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: scores ${v.g.scores.join(' / ')} (layout sampled ${sampled}×: no page scroll, board+controls on screen, hub hidden)`);
    await layout(p, 'result375');
    await p.context().close();
  }

  // ================= 3) online: host + guest over PeerJS cloud =================
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) { fail('room could not be created (signaling blocked?)'); }
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      const qr = await host.$('#qr svg'); if (!qr) fail('QR code missing'); else ok('invite QR code shown');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="2"]', 'ultra');
      await waitV(guest, "v.opts.np === 3 && v.opts.lv[2] === 'ultra'");
      const cl = await guest.textContent('#cpuList'); if (!/アストラウルトラ/.test(cl)) fail('guest lobby does not show ふーさん level'); else ok('guest lobby shows ふーさん🐻 = アストラウルトラ😎');
      await host.screenshot({ path: SS + 'lobby_online.png' });
      await host.tap('#startBtn');
      await guest.waitForSelector('#awaken.on', { timeout: 10000 }).then(() => ok('覚醒 cinematic plays on the guest too'), () => fail('no cinematic on guest'));
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      await Promise.all([[guest, 'guest', 5, 'guest'], [host, 'host', 4, null]].map(async ([p, who, n, sh]) => { await humanTurns(p, who, n, sh); await p.evaluate(() => { window.__kr.autoplay = true; }); }));
      await host.evaluate(() => { window.__kr.autoplay = false; }); await guest.evaluate(() => { window.__kr.autoplay = false; });
      await sleep(600);
      const hv = await view(host), gv = await view(guest);
      if (JSON.stringify(hv.g.grid) !== JSON.stringify(gv.g.grid) || JSON.stringify(hv.g.scores) !== JSON.stringify(gv.g.scores)) fail('host/guest out of sync'); else ok('host and guest views in sync (grid + scores)');
      await guest.screenshot({ path: SS + 'online_guest.png' });
      // out-of-turn action is ignored
      await waitV(host, 'v.g.need && v.g.need.p !== 1 && v.g.phase === "play"', 30000).catch(() => {});
      const before = await view(host);
      if (before.g.need && before.g.need.p !== 1) {
        await guest.evaluate(() => window.__kr.act('roll')); await sleep(400);
        const after = await view(host);
        const rolledBy = after.g.ev.filter(e => e.id > before.g.k && e.kind === 'roll' && e.p === 1).length;
        if (rolledBy) fail('out-of-turn roll accepted'); else ok('out-of-turn action is ignored by the host');
      }
      await host.evaluate(() => { window.__kr.autoplay = true; }); await guest.evaluate(() => { window.__kr.autoplay = true; });
      const t0 = Date.now();
      await waitV(guest, 'v.phase === "end"', 300000).catch(() => {});
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: scores ${eh.g.scores.join(' / ')}`);
        if (JSON.stringify(eh.g.scores) !== JSON.stringify(ev.g.scores)) fail('final scores differ host/guest');
        await guest.screenshot({ path: SS + 'result_online_guest.png' });
      }
      await host.evaluate(() => { window.__kr.autoplay = false; }); await guest.evaluate(() => { window.__kr.autoplay = false; });
      // 「ロビーに戻りたい」 → host 中断
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      const clear = async p => { for (let i = 0; i < 20; i++) { if (await p.$('#awaken.on')) await p.tap('#awaken').catch(() => {}); else break; await sleep(200); } };
      await clear(guest); await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr="abort"]', { timeout: 10000 }); await clear(host); await host.tap('#lobbyReqBar button[data-lr="abort"]'); await host.tap('#cfYes');
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      // reconnect by nickname mid-game
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game"', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
