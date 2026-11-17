/* O-49（v3.126・第71部 §109）：効果の記号（アイコンの文法）。
   1 つの効果＝1 行：［いつ］［払う →］［得る］［／ごと］。いつ＝! 今すぐ 1 回（形成時・取得時）／手 毎回の収入／∞ 恒久／旗 ゲーム終了時（ラウンド終了は ∞ に「R 終了」の札）
   記号の並びは T32 の数値で書く（数値セットを変えたら test/fx.js が全文との食い違いを知らせる）。T32 以外の数値セットでは使わない（文字の表示のまま）
   書式（1 行＝空白区切りの語・行は ; で区切る）：
     +E6 得る（緑地・常に +）  +all4 全種  +any6 好きな資源  +cb3 協調ボーナス  +~投入:3 語で得る  +organ:×3 数の代わりの文字
     -P20 払う（赤地）  -organ:定価Ⅰ  > 矢印  ↓trait:G:6 軽減（対象の後に赤い値札［G ↓6］・対象は ~語 も・空なら札だけ）
     ?star↑ 条件（記号＋「：」）  /organ ごと（スラッシュ）  /L3  /star:Lv2〜  =trait1 ～として数える  @join! 行動（! で「手番なし」）
     #1/R 使う権利などの小さな札  x4 倍  ~語 短い語（4 字まで）  i:organ 記号だけ  … 書ききれない（マウスで全文） */
(function () {
  'use strict';
  const G = globalThis.G1; if (!G) return;
  const SETS = ['t33']; // O-51（v3.128）：T33 の数値で書く（T32 以前は文字の表示）
  const ORGAN = {
    Mg1: '手 +E6', Mg2: '! +E6 ; 手 +E3 +G3', Mg3: '手 +all4 ; ∞ =organ1',
    Tl1: '! +G6 ; ∞ ↓trait:G:6', Tl2: '! +G9 ; ! @trait! #弱 #無料 … ; ∞ ↓trait:G:9', Tl3: '! @trait! #無料 … ; ∞ ↓trait:G:12',
    Hc1: '! +coop2', Hc2: '! +coop1 ; ∞ ?~群体 +coop1', Hc3: '∞ +cb3 ; ! @join!',
    Pu1: '手 +P15', Pu2: '手 +P25', Pu3: '∞ i:launch x4',
    Li1: '! +E6', Li2: '! +any6', Li3: '! +any12 /~完成系統 …',
    Fk1: '手 +P12', Fk2: '! +P24 ; 手 +P12', Fk3: '! @breed! … ; 手 +P12',
    Nv1: '∞ =trait1', Nv2: '∞ =trait1 ; 手 +G6', Nv3: '∞ =trait2 ; ! +bless1',
    Pr1: '∞ ?star↑ +E6', Pr2: '手 +P6 /star:Lv2〜', Pr3: '! @star! …',
    Lm1: '手 +G6', Lm2: '! +bless2', Lm3: '! +gem1 +bless2',
    SpE: '手 +E4 /organ', SpG: '手 +G3 /organ', SpP: '手 +P8 /organ', SpC: '手 +coop1', SpM: '手 +E2 +G1 /organ',
  };
  const TRAIT = { // [強, 弱]
    NC: ['! +coop2', '! +coop1 +P9'], NL: ['! +L2', '! +L1 +E9'],
    MC: ['∞ ~淘汰 #無料 #次の1回', '∞ ↓~淘汰:P:18'], DG: ['∞ ↓trait:G:6 #1/R', '∞ ↓trait:G:4 #1/R'],
    NB: ['∞ ↓~祭壇:L:1 …', '∞ ↓~祭壇:L:1'], MB: ['∞ i:breed ~2段同時 … ; ∞ ↓~身体淘汰:P:24', '∞ ↓breed:P:15 #各段 ; ∞ ↓~身体淘汰:P:12'],
    NF: ['∞ ~★報酬 ~追随も強 …', '∞ ~★報酬 ~追随も強 #1回 …'], DV: ['∞ i:up ~三段 #2回 …', '∞ i:up ~三段 #1回 …'],
    NM: ['∞ @rslot #使用済み #1/R …', '∞ -E6 > @rslot #使用済み #1/R …'], JI: ['∞ =trait4 …', '∞ =trait3 …'],
    JB: ['! +~投入:3 … ; ! +gem1', '! +~投入:2 …'], NP: ['∞ #R終了 -E1 > +P3 #≤E10', '∞ #R終了 -E1 > +P2 #≤E10'],
    JS: ['! @star! ~1.5倍 … ; ! +gem1', '! @star! ~1.5倍 …'],
  };
  const L6 = (x) => '! +gem2 (先 +gem1 +bless1 ) ; 旗 ' + x; // O-52：先駆と追随を 1 行に（基本＝追随・（先 …）＝先駆ならさらに得るぶん）
  const TRACK = { // Lv → 文字列（先駆・追随で同じ）か [強（先駆）, 弱（追随）]
    body: { 2: '! +L1', 3: '! +L1 (先 +P30 )', 4: '! +gem1 ; 手 i:L ~産出 x2', 5: '! +L1 +P20 (先 +P40 )', 6: L6('+bless1 /L3') },
    intel: { 2: '! +G9', 3: ['! @trait! #弱は無料 …', '! i:trait ~弱→強 #1枚 …'], 4: '! +bless1 /trait3', 5: '! i:trait ~弱→強 #2枚 … (先 #+1枚 ∞ i:trait ~常に強 )', 6: L6('+bless1 /trait3 …') },
    social: { 2: '! +P18', 3: ['! @join!', '! +P30'], 4: '! @join!', 5: '! @join! (先 x2 )', 6: L6('+bless3') },
    metab: { 2: '手 +E3', 3: ['手 +E4 +G4', '! +E24'], 4: '! @organ! ~特殊', 5: '手 +all5 (先 +all5 )', 6: L6('+bless1 /organ3') },
  };
  const TRIB = {
    TO: '! -organ:定価Ⅰ > +organ:×3 …', TB: '! @rslot #使用済みOK … ; ∞ i:rslot x2 #このR', TJ: '! i:up x2 ↓:E:24',
    TAL: '! ~祭壇 ↓::½ …', TLF: '! +L3', TBR: '! i:breed ↓::½ …',
  };
  const on = (st) => !!st && SETS.includes(st.rules || 'v1');
  const R_ = (st) => G.RULESETS[st.rules || 'v1'];
  const split = (s) => String(s).split(';').map(x => x.trim()).filter(Boolean);

  // 全文（画面の文字表示と同じ文。ui.js の rtxt もこれを使う）
  function txt(st, s) {
    if (!s) return s; const R = R_(st); s = G.txt(st, s);
    s = String(s).replace(/(大量消費|淘汰)-5/g, (m, w) => w + '-' + R.massDiscLv).replace(/排他無視\+-5/g, '排他無視+-' + R.massDiscLv).replace(/-6P/g, '-' + R.mcDisc + 'P').replace(/-8P/g, '-' + R.mbDisc + 'P');
    if (R.mcMode !== 'freeOnce') { s = s.replace(/^淘汰コスト-\d+P（恒久）$/, `次の淘汰1回だけ-${R.mcDisc}P`).replace(/^次の淘汰1回を無料（コスト0）$/, `淘汰コスト-${R.mcDisc}P（恒久）`); }
    if (R.mmCost && !R.mcAfterCap && /^(淘汰コスト|次の淘汰1回だけ)-/.test(s)) s += '（代謝は対象外）';
    return s;
  }
  function organFull(st, id, strong) { const R = R_(st); if (G.ORGANS[id] && G.ORGANS[id].special) return txt(st, G.spText(R, id)); const o = G.organDef(st, id); const s = strong === false ? (R.hc3Bonus && o.weakB ? o.weakB : o.weak) : (R.hc3Bonus && o.strongB ? o.strongB : o.strong); return txt(st, s); }
  function traitFull(st, id, strong) { return txt(st, G.traitText(st, id, strong)); }
  function trackFull(st, t, l) { return txt(st, G.trackRewardText(st, t, l)); }
  // 記号の並び（行の配列）。無いときは null（文字の表示のまま）
  function lines(st, kind, id, which) {
    if (!on(st)) return null; let s = null;
    if (kind === 'organ') s = ORGAN[id];
    else if (kind === 'trait') { const a = TRAIT[id]; s = a ? a[which === 'w' ? 1 : 0] : null; }
    else if (kind === 'track') { const [t, l] = id; const x = TRACK[t] && TRACK[t][l]; s = Array.isArray(x) ? x[which === 'w' ? 1 : 0] : x; }
    else if (kind === 'trib') s = TRIB[id];
    return s ? split(s) : null;
  }
  const trackSplit = (st, t, l) => on(st) && Array.isArray(TRACK[t] && TRACK[t][l]);

  // ---------- 描画（ブラウザのみ） ----------
  const ICO = { E: 'ico-e', G: 'ico-g', P: 'ico-pop', L: 'ico-life', coop: 'ico-coord', gem: 'ico-gem', W: 'ico-w', bless: 'ico-bless', trait: 'ico-trait', organ: 'ico-organ', breed: 'ico-breed', up: 'ico-up', rslot: 'ico-slot', star: 'ico-star', join: 'ico-join', launch: 'ico-launch', any: 'ico-any' };
  const JP = { E: 'エネルギー', G: '遺伝子', P: '個体数', L: '生命核', coop: '協調', gem: '痕跡', W: 'ワーカー', bless: '祝福', trait: '形質', organ: '器官', breed: '繁殖', up: '進化', rslot: '資源枠', star: '星海開拓', join: '合流進出', launch: '緊急進出', any: '好きな資源', all: '全種（E・G・P）', cb: '協調ボーナス' };
  const WHEN = { '!': ['now', '今すぐ 1 回（形成時・取得時・到達時）'], '手': ['inc', '毎回の収入'], '∞': ['perm', '恒久（持っているあいだずっと）'], '旗': ['end', 'ゲーム終了時'] };
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, ...kids) { const e = document.createElement(tag); if (cls) e.className = cls; kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); }); return e; }
  function ic(k) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic ' + k); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + (ICO[k] || 'ico-gem')); s.appendChild(u); const t = document.createElementNS(NS, 'title'); t.textContent = JP[k] || k; s.appendChild(t); return s; }
  const isKey = (k) => !!ICO[k];
  const target = (k) => k.startsWith('~') ? el('span', 'fxword', k.slice(1)) : isKey(k) ? ic(k) : null;
  function whenBadge(w) { const [c, t] = WHEN[w]; const b = el('span', 'fxw w-' + c); b.title = t; if (w === '手') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'wi'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#ico-income'); s.appendChild(u); b.appendChild(s); } else if (w === '旗') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'wi'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#ico-flag'); s.appendChild(u); b.appendChild(s); } else b.appendChild(document.createTextNode(w)); return b; }
  function chip(cls, k, n) { // k＝記号キー or ~語
    const c = el('span', 'pc ' + cls); if (k === 'all') { c.title = JP.all; ['E', 'G', 'P'].forEach(x => c.appendChild(ic(x))); } else if (k === 'cb') { c.className = 'pc bonus cbper'; c.title = JP.cb; c.appendChild(ic('coop')); } /* O-51：協調ボーナスは点線・地なし */ else if (k.startsWith('~')) c.appendChild(el('span', 'fxword', k.slice(1))); else { c.title = JP[k] || k; c.appendChild(ic(k)); }
    if (n !== '') c.appendChild(el('b', null, n)); return c; }
  function token(tk) {
    if (tk === '>') return el('span', 'po', '→');
    if (tk === '…') { const m = el('span', 'fxmore', '…'); m.title = 'ほかにも条件あり（マウスで全文）'; return m; }
    if (tk[0] === '#') return el('span', 'pbad', tk.slice(1).replace('R終了', 'R 終了'));
    if (/^x\d+$/.test(tk)) return el('span', 'fxmul', '×' + tk.slice(1));
    if (tk.startsWith('i:')) return ic(tk.slice(2));
    if (tk[0] === '~') return el('span', 'fxword', tk.slice(1));
    if (tk[0] === '+' || tk[0] === '-') { const body = tk.slice(1); let k, n; const m = body.match(/^(~[^:]+|[a-zA-Z]+):(.+)$/) || body.match(/^([a-zA-Z]+)(\d+|½)$/); if (m) { k = m[1]; n = m[2]; } else { k = body; n = ''; } return tk[0] === '+' ? chip('gain', k, /^[\d½]/.test(n) ? '+' + n : n) : chip('cost', k, n); }
    if (tk[0] === '↓') { const [t, k, n] = tk.slice(1).split(':'); const f = document.createDocumentFragment(); const tg = t ? target(t) : null; if (tg) f.appendChild(tg); const tag = el('span', 'pc cost ptag'); tag.title = '軽減'; if (k) tag.appendChild(ic(k)); tag.appendChild(el('span', 'dn', '↓')); tag.appendChild(el('b', null, n)); f.appendChild(tag); return f; }
    if (tk[0] === '?') { const m = tk.slice(1).match(/^(~[^↑]+|[a-zA-Z]+)(.*)$/); const f = el('span', 'fxcond'); f.appendChild(target(m[1])); if (m[2]) f.appendChild(document.createTextNode(m[2])); f.appendChild(document.createTextNode('：')); return f; }
    if (tk[0] === '/') { const m = tk.slice(1).match(/^(~.+|[a-zA-Z]+)(\d*)(?::(.+))?$/); const f = el('span', 'fxper', '／'); f.appendChild(target(m[1])); if (m[2]) f.appendChild(document.createTextNode(m[2])); if (m[3]) f.appendChild(el('small', null, m[3])); f.title = 'ごと'; return f; }
    if (tk[0] === '=') { const m = tk.slice(1).match(/^([a-zA-Z]+)(\d*)$/); const f = el('span', 'fxeq', '＝'); f.appendChild(ic(m[1])); if (m[2]) f.appendChild(el('b', null, m[2])); f.title = '～として数える'; return f; }
    if (tk[0] === '@') { const free = tk.endsWith('!'); const k = tk.slice(1).replace(/!$/, ''); const f = el('span', 'fxact'); f.title = JP[k] + (free ? '（手番なし＝コマを使わない）' : ''); f.appendChild(ic(k)); if (free) f.appendChild(noTurn()); return f; }
    if (WHEN[tk]) return whenBadge(tk);
    return document.createTextNode(tk);
  }
  // O-52：「手番なし」＝コマ（ワーカー）の絵に赤い斜線の丸（字なし）
  function noTurn() { const w = el('span', 'fxnoturn'); w.title = '手番なし（コマを使わない）'; w.appendChild(ic('W')); const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'nt'); s.setAttribute('viewBox', '0 0 16 16'); s.innerHTML = '<circle cx="8" cy="8" r="6.6" fill="none" stroke="#d63b2f" stroke-width="1.8"/><line x1="3.4" y1="12.6" x2="12.6" y2="3.4" stroke="#d63b2f" stroke-width="1.8"/>'; w.appendChild(s); return w; }
  function closeFirst(g) { /* O-52：かっこは中身の最初と最後の記号にくっつけて折り返す（かっこだけが 1 行に残らない） */
    const it = g.items, nw = () => el('span', 'fxnw'); if (!it.length) return; const a = nw(); a.appendChild(el('span', 'fxpar', '(先')); a.appendChild(it[0]); g.appendChild(a);
    for (let k = 1; k < it.length - 1; k++) g.appendChild(it[k]);
    const z = it.length > 1 ? nw() : a; if (it.length > 1) { z.appendChild(it[it.length - 1]); g.appendChild(z); } z.appendChild(el('span', 'fxpar', ')')); }
  function line(s, full) { const tks = s.split(/\s+/).filter(Boolean); const d = el('div', 'fxl'); if (full) d.title = full; let i = 0; if (WHEN[tks[0]]) { d.appendChild(whenBadge(tks[0])); i = 1; } else d.appendChild(el('span', 'fxw w-none')); const b = el('span', 'fxt'); let grp = null; for (; i < tks.length; i++) { if (tks[i] === '(先') { grp = el('span', 'fxfirst'); grp.title = '先駆なら、さらに得るぶん'; grp.items = []; b.appendChild(grp); continue; } if (tks[i] === ')' && grp) { closeFirst(grp); grp = null; continue; } if (grp) grp.items.push(token(tks[i])); else b.appendChild(token(tks[i])); } if (grp) closeFirst(grp); d.appendChild(b); return d; } // O-52：(先 … ) ＝先駆の上乗せ
  // lines → 要素。label＝行頭の札（強・弱・先駆・追随）
  function render(ls, full, label) { const d = el('div', 'fx'); ls.forEach((s, i) => { const l = line(s, full); if (label && i === 0) l.insertBefore(el('span', 'fxlab', label), l.firstChild); else if (label) l.insertBefore(el('span', 'fxlab blank'), l.firstChild); d.appendChild(l); }); return d; }

  // O-51：協調ボーナス＝［資源 +1／協調］（点線・地なし・小さめ）／自己複製の［P +5／身体 Lv］
  function cbPer(k, title) { const c = el('span', 'pc bonus cbper'); c.title = title || '協調ボーナス：協調 1 つにつき、この枠の資源 +1'; c.appendChild(ic(k)); c.appendChild(el('b', null, '+1')); const f = el('span', 'fxper', '／'); f.appendChild(ic('coop')); c.appendChild(f); return c; }
  function perChip(k, n, word, title) { const c = el('span', 'pc bonus cbper'); if (title) c.title = title; c.appendChild(ic(k)); c.appendChild(el('b', null, n)); c.appendChild(el('span', 'fxper', '／', el('span', 'fxword', word))); return c; }
  // 記号の一覧（凡例）
  function legend() {
    const d = el('div', 'fxlegend');
    const row = (sym, txt) => el('div', 'fxlr', el('span', 'fxls', sym), el('span', 'fxld', txt));
    const L = (s) => line(s, null);
    d.appendChild(el('h4', null, 'いつ'));
    Object.keys(WHEN).forEach(w => d.appendChild(row(whenBadge(w), WHEN[w][1] + (w === '∞' ? '。ラウンド終了時の効果は「R 終了」の札' : ''))));
    d.appendChild(el('h4', null, '並び'));
    [['手 +E6', '得る（緑地・いつも ＋）'], ['! -P20 > +gem1', '払う（赤地）→ 得る'], ['∞ ↓trait:G:6', '軽減：対象の後に赤い値札（G が 6 安い）'], ['∞ ?star↑ +E6', '条件：記号＋「：」（星海開拓を 1 段上げるたび E+6）'], ['手 +E4 /organ', 'ごと：スラッシュ（器官 1 枚につき）'], ['∞ =trait1', '～として数える（形質 1 枚）'], ['! @join!', '手番なし（コマに赤い斜線）で行う行動・無料で取る'], ['∞ #1/R', '使う権利（1/R＝1 ラウンド 1 回・×3・次の 1 回 など）'], ['∞ i:launch x4', '倍'], ['∞ =trait4 …', '書ききれない：マウスを当てると全文'], ['! +L1 (先 +P30 )', '（先 …）＝先駆ならさらに得るぶん（★の段・Lv6）']].forEach(([s, t]) => d.appendChild(row(L(s), t)));
    d.appendChild(el('h4', null, '記号'));
    const g = el('div', 'fxlicons'); ['E', 'G', 'P', 'L', 'coop', 'gem', 'bless', 'trait', 'organ', 'breed', 'up', 'rslot', 'star', 'join', 'launch', 'any'].forEach(k => g.appendChild(el('span', null, ic(k), JP[k]))); g.appendChild(el('span', null, chip('gain', 'all', '+4'), '全種')); g.appendChild(el('span', null, cbPer('E'), '協調ボーナス（協調 1 つにつき +1）')); g.appendChild(el('span', null, chip('gain', 'cb', '+3'), '協調ボーナスに +3（群心核）')); d.appendChild(g);
    return d;
  }

  // 星海開拓の段：額（赤地）→ 痕跡、先駆の選択肢、Lv6 の先着・後着・神の裁定。withCost＝この局の額（無ければ「額」の語）
  function star(st, lv, withCost) {
    const R = R_(st), S = R.star; if (!on(st) || !S) return null; const c = withCost && st.shared && st.shared.starCards ? G.starCost(st, lv) : null;
    const pay = c ? Object.keys(c).filter(k => c[k]).map(k => '-' + k + c[k]).join(' ') : '~額'; const ct = c ? G.starCostText(c) : `額（${G.STAR_CARD_NAME}の 2 種）`;
    const top = G.starTop(st, lv), LG = R.lv6Gems || { first: 1, later: 1 }, SJ = S.top && S.top.judge, g = G.starGem(st, lv), F = G.starFirstDef(st, lv), fg = F ? G.starFirstGem(st, lv) : 0;
    const full = `${ct}を払う` + (top ? `。先着 痕跡+${LG.first}＋祝福+1／後着 痕跡+${LG.later}${SJ ? `。終了時 祝福+${SJ}（神の裁定・Lv6 の人みな）` : ''}` : ` → 痕跡+${g}${F ? `。先駆は 痕跡+${fg}${F.pros !== undefined ? ` か 痕跡+${F.pros}・繁栄度+1` : ''}` : ''}`);
    const parts = top ? [{ lines: ['! ' + pay] }, { first: true, lines: ['! +gem' + LG.later + ' (先 ' + (LG.first - LG.later > 0 ? '+gem' + (LG.first - LG.later) + ' ' : '') + '+bless1 )'] }].concat(SJ ? [{ lines: ['旗 +bless' + SJ] }] : []) // O-52：Lv6 は 4 本と同じ形（後着が基本・（先 …）＝先着の上乗せ）
      : [{ lines: ['! ' + pay + ' > +gem' + g] }].concat(F ? [{ label: '先駆', first: true, lines: ['! +gem' + fg + (F.pros !== undefined ? ' ~か ' + (F.pros ? '+gem' + F.pros + ' ' : '') + '+breed1' : '')] }] : []);
    return { parts, full, top: !!top, star: !!(F || top) };
  }
  // 一覧（ガイドの「カードの記号一覧」・テスト）：T32 の器官・特殊器官・形質・トラックの報酬・恩寵枠
  function all(st) {
    const out = [], R = R_(st);
    (R.organSet || []).forEach(l => [1, 2, 3].forEach(t => { const id = l + t; out.push({ group: '器官（' + G.LINEAGES[l] + '）', id, name: G.ORGANS[id].name, lines: lines(st, 'organ', id), full: organFull(st, id) }); }));
    ['SpE', 'SpG', 'SpP', 'SpC', 'SpM'].forEach(id => out.push({ group: '特殊器官', id, name: G.ORGANS[id].name, lines: lines(st, 'organ', id), full: organFull(st, id) }));
    (R.traitPool || []).forEach(id => ['s', 'w'].forEach(w => out.push({ group: '形質', id, name: G.TRAITS[id].name, label: w === 's' ? '強' : '弱', lines: lines(st, 'trait', id, w), full: traitFull(st, id, w === 's') })));
    G.TRACKS.forEach(t => { for (let l = 2; l <= 6; l++) { const nm = G.TRACK_INFO[t].name + ' Lv' + l + (l === 3 || l === 5 ? '★' : ''); const full = trackFull(st, t, l); if (trackSplit(st, t, l)) ['s', 'w'].forEach(w => out.push({ group: '進化トラック', id: t + l, name: nm, label: l === 6 ? (w === 's' ? '先駆' : '追随') : (w === 's' ? '強' : '弱'), lines: lines(st, 'track', [t, l], w), full })); else out.push({ group: '進化トラック', id: t + l, name: nm, lines: lines(st, 'track', [t, l]), full }); } });
    if (R.star && R.star.lv1) for (let lv = 1; lv <= G.STAR_MAX; lv++) { const x = star(st, lv, false); x.parts.forEach(pt => out.push({ group: '進化トラック', id: 'star' + lv, name: G.STAR_NAME + ' ' + G.starLvText(st, lv) + (x.star ? '★' : ''), label: pt.label, lines: pt.lines, full: x.full })); }
    ((R.tribute && R.tribute.pool) || []).forEach(id => out.push({ group: '恩寵枠', id, name: G.SLOT_BY_ID[id].name, lines: lines(st, 'trib', id), full: G.slotText(st, id) }));
    return out;
  }
  G.FX = { SETS, ORGAN, TRAIT, TRACK, TRIB, on, txt, organFull, traitFull, trackFull, lines, trackSplit, star, render, line, legend, all, ic, WHEN, cbPer, perChip };
})();
