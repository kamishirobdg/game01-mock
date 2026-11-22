/* O-49（v3.126・第71部 §109）：効果の記号（アイコンの文法）。
   1 つの効果＝1 行：［いつ］［払う →］［得る］［／ごと］。いつ＝! 今すぐ 1 回（形成時・取得時）／手 毎回の収入／∞ 恒久／旗 ゲーム終了時（ラウンド終了は ∞ に「R 終了」の札）
   記号の並びは T32 の数値で書く（数値セットを変えたら test/fx.js が全文との食い違いを知らせる）。T32 以外の数値セットでは使わない（文字の表示のまま）
   書式（1 行＝空白区切りの語・行は ; で区切る）：
     +E6 得る（緑地・常に +）  +all4 全種  +any6 好きな資源  +cb3 協調ボーナス  +~投入:3 語で得る  +organ:×3 数の代わりの文字
     -P20 払う（赤地）  -organ:定価Ⅰ  > 矢印  ↓trait:G:6 軽減（対象の後に赤い値札［G ↓6］・対象は ~語 も・空なら札だけ）
     ?star↑ 条件（記号＋「：」）  /organ ごと（スラッシュ）  /L3  /star:Lv2〜  =trait1 ～として数える  @join! 行動（! で「手番なし」）
     #1/R 使う権利などの小さな札  x4 倍  ~語 短い語（4 字まで）  i:organ 記号だけ  … 書ききれない（マウスで全文）
     O-86：%launch できない（記号に赤い円と斜線を重ねる）  =先 ＝（先）  ?star↑ の ↑ は「するたび」の記号  始 いつ＝開始時 */
(function () {
  'use strict';
  const G = globalThis.G1; if (!G) return;
  const SETS = ['t33', 't34', 't35', 't36', 't37', 't37h', 't38', 't39', 't40', 't41', 't42', 't43', 't44', 't45', 't46', 't47', 't48', 't49']; // O-51（v3.128）：T33 の数値で書く（T32 以前は文字の表示）・O-62（v3.142）：T34 は T33 と同じ数値・v3.159：T38（v3.158 で抜けていた）・T39
  const ORGAN = {
    Mg1: '手 +E6', Mg2: '! +E6 ; 手 +E3 +G3', Mg3: '手 +all4 ; ∞ =organ1',
    Tl1: '! +G6 ; ∞ ↓trait:G:6', Tl2: '! +G9 ; ! @traitw! $0 … ; ∞ ↓trait:G:9', Tl3: '! @trait! $0 … ; ∞ ↓trait:G:12',
    Hc1: '! +coop2', Hc2: '! +coop1 ; ∞ ?herd +coop1', Hc3: '∞ +cb3 ; ! @join!',
    Pu1: '手 +P15', Pu2: '手 +P25', Pu3: '∞ i:launch x4',
    Li1: '! +E6', Li2: '! +any6', Li3: '! +any12 /lineage …',
    Fk1: '手 +P12', Fk2: '! +P24 ; 手 +P12', Fk3: '! @breed! … ; 手 +P12',
    Nv1: '∞ =trait1', Nv2: '∞ =trait1 ; 手 +G6', Nv3: '∞ =trait2 ; ! +bless1',
    Pr1: '∞ ?star↑ +E6', Pr2: '手 +P6 /star:Lv2〜', Pr3: '! @star! …',
    Lm1: '手 +G6', Lm2: '! +bless2', Lm3: '! +gem1 +bless2',
    Sv1: '手 +G4', Sv2: '手 +E9', Sv3: '手 +any12', // T44（O-79）
    Di1: '手 -P10 > +E12', Di2: '手 -P10 > +G8', Di3: '∞ ?cull↑ +any9', Yr1: '手 +E2 /round', Yr2: '! +G6 ; 手 +G1 /round', Yr3: '! +any6 /round', // T49（O-91）：消化・年輪
    SpE: '手 +E4 /organ', SpG: '手 +G3 /organ', SpP: '手 +P8 /organ', SpC: '手 +coop1', SpM: '手 +E2 +G1 /organ',
  };
  const TRAIT = { // [強, 弱]
    NC: ['! +coop2', '! +coop1 +P9'], NL: ['! +L2', '! +L1 +E9'],
    MC: ['∞ i:cull $0 ^1', '∞ ↓cull:P:18'], DG: ['∞ ↓trait:G:6 1/R', '∞ ↓trait:G:4 1/R'],
    NB: ['∞ ↓altar:L:1 -L > i:invest', '∞ ↓altar:L:1'], MB: ['∞ i:breed i:breed … ; ∞ ↓cull.body:P:24', '∞ ↓breed:P:15 … ; ∞ ↓cull.body:P:12'],
    NF: ['∞ i:starstep i:follow =先 …', '∞ i:starstep i:follow =先 ^1 …'], DV: ['∞ i:up i:up i:up ^2 …', '∞ i:up i:up i:up ^1 …'],
    NM: ['∞ @usedslot 1/R …', '∞ -E6 > @usedslot 1/R …'], JI: ['∞ =trait4 …', '∞ =trait3 …'],
    JB: ['! +invest3 … ; ! +gem1', '! +invest2 …'], NP: ['∞ i:roundend -E1 > +P3 ≤E10', '∞ i:roundend -E1 > +P2 ≤E10'],
    JS: ['! @star! x1.5 … ; ! +gem1', '! @star! x1.5 …'],
    ND: ['∞ ↓organ:E:5', '∞ ↓organ:E:3'], NH: ['手 ?empty +E6 +G6 +P6 …', '手 ?empty +E4 +G4 +P4 …'], NK: ['! @join! +coop2', '! @join!'], NZ: ['! +gem2', '! +gem1'], NY: ['手 +E5 +G5 +P5 /breed …', '手 +E3 +G3 +P3 /breed …'], // T47（O-88）：結実＝繁殖の段ごと（星海の先駆の繁栄度は数えない＝…）
    NG: ['∞ -P50 > i:launch 1/R', '∞ -P60 > i:launch 1/R'], NO: ['∞ ↓altar:E:½ ↓:G:½ ↓:P:½', '∞ ↓altar:P:½'], NU: ['∞ ?usedslot↑ +any6 …', '∞ ?usedslot↑ +any4 …'], NV: ['! +bless1 /organ3 ≤bless3', '! +bless1 /organ4 ≤bless2'], NT: ['∞ ?up↑ +bless2 …', '∞ ?up↑ +bless1 …'], // T49（O-91）：互恵の「その枠の資源」・頂の「Lv6」は今ある絵が無いので any／進化と …
    // T44（O-79）：渇望は記号で書ききれない（…＋全文）
  };
  const L6 = (x) => '! +gem2 (先 +gem1 +bless1 ) ; 旗 ' + x; // O-52：先駆と追随を 1 行に（基本＝追随・（先 …）＝先駆ならさらに得るぶん）
  const TRACK = { // Lv → 文字列（先駆・追随で同じ）か [強（先駆）, 弱（追随）]
    body: { 2: '! +L1', 3: '! +L1 (先 +P30 )', 4: '! +gem1 ; 手 i:L > i:P x2', 5: '! +L1 +P20 (先 +P40 )', 6: L6('+bless1 /invest3') },
    intel: { 2: '! +G9', 3: ['! @traitw! $0 …', '! i:flip i:or +G9'], 4: '! +bless1 /trait3', 5: '! i:flip x2 i:or +G9 … (先 +1 ∞ i:trait =traits )', 6: L6('+bless1 /trait3 …') },
    social: { 2: '! +P18', 3: ['! @join!', '! +P30'], 4: '! @join!', 5: '! @join! (先 x2 )', 6: L6('+bless3') },
    metab: { 2: '手 +E3', 3: ['手 +E4 +G4', '! +E24'], 4: '! @sporgan!', 5: '手 +all5 (先 +all5 )', 6: L6('+bless1 /organ3') },
  };
  const TRIB = {
    TO: '! -organ i:form1 > +organ i:form1 i:form2 i:form3 …', TB: '! @rslot! i:usedslot … ; ∞ i:rslot x2 i:round', TJ: '! i:up x2 ↓:E:24',
    TAL: '! ↓altar::½ …', TLF: '! +L3', TBR: '! i:breed ↓::½ …',
    TST: '! @star ↓::½ …', TCU: '! -P100 > i:cull i:cull …', // T49（O-91）：星の恩寵（条件 2 種のうち 1 種だけ＝今ある絵が無いので半額の札と …）・淘汰の恩寵（異なる 2 種）
  };
  // O-76（T42）：数値セットごとの差し替え（無いものは上の表のまま）
  const OV0 = { t42: { organ: { Fk3: '! +P30 ; ! @breed! … ; 手 +P12', Pr1: '∞ ?star↑ +any9', Pr2: '! @star! …', Pr3: '! @star! x1.5 …' }, trait: { NP: ['∞ i:roundend +P2 /E ≤E10', '∞ i:roundend +P1 /E ≤E10'], DV: ['∞ i:up i:up i:up …', '∞ i:up i:up …'] }, track: { social: { 5: ['! @join! +any12', '! @join!'] } } } };
  const OV = Object.assign({}, OV0, { t43: OV0.t42, t44: OV0.t42, t45: OV0.t42, t46: OV0.t42, t47: OV0.t42, t48: Object.assign({}, OV0.t42, { trait: Object.assign({}, OV0.t42.trait, { NY: ['手 +E5 +G5 +P5 /breed', '手 +E3 +G3 +P3 /breed'] }) }) }); // T48（O-90）：結実＝繁栄度の段ごと（書ききれない但し書きが無いので … なし） // O-78：T43 は T42 と同じ記号
  OV.t49 = OV.t48; // T49（O-91）：T48 と同じ差し替え
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
    const ov = OV[st.rules || 'v1'] || {};
    if (kind === 'organ') s = (ov.organ || {})[id] || ORGAN[id];
    else if (kind === 'trait') { const a = (ov.trait || {})[id] || TRAIT[id]; s = a ? a[which === 'w' ? 1 : 0] : null; }
    else if (kind === 'track') { const [t, l] = id; const ox = ((ov.track || {})[t] || {})[l]; const x = ox !== undefined ? ox : TRACK[t] && TRACK[t][l]; s = Array.isArray(x) ? x[which === 'w' ? 1 : 0] : x; }
    else if (kind === 'trib') { const R = R_(st); const TS = (R.tribute || {}).slots || {}; s = id === 'TBR' && (R.breedTrib || {}).both ? `! -P${G.breedTribCost(R, 'P', 0)} > i:breed ; ! -L${G.breedTribCost(R, 'L')} > i:breed …` : id === 'TAL' && (TS.TAL || {}).pair ? '! i:altar x2 i:adj ↓::½ …' : id === 'TB' && TS.TB ? `! @rslot! i:usedslot${TS.TB.instantVg && R.finalSlotVg ? ' +bless1' : ''} … ; ∞ i:rslot x${TS.TB.mul || 2} i:round${TS.TB.lockBypass ? ' %launch %coopadv' : ''}` : id === 'TJ' && TS.TJ ? `! i:up x${TS.TJ.n || 2} ↓:E:${G.sc(st, TS.TJ.disc || 0)}` : TRIB[id]; } // T39（O-68）：祭壇の恩寵 2 口・加護の倍率と祝福・跳躍の値引きは数値セットから // T37（O-65）：P の段・生命核の段（両方で 2 段）
    return s ? split(s) : null;
  }
  const trackSplit = (st, t, l) => { if (!on(st)) return false; const ox = (((OV[st.rules || 'v1'] || {}).track || {})[t] || {})[l]; return Array.isArray(ox !== undefined ? ox : TRACK[t] && TRACK[t][l]); };

  // ---------- 描画（ブラウザのみ） ----------
  const ICO = { E: 'ico-e', G: 'ico-g', P: 'ico-pop', L: 'ico-life', coop: 'ico-coord', gem: 'ico-gem', W: 'ico-w', bless: 'ico-bless', trait: 'ico-trait', organ: 'ico-organ', breed: 'ico-breed', up: 'ico-up', rslot: 'ico-slot', star: 'ico-star', join: 'ico-join', launch: 'ico-launch', any: 'ico-any',
    cull: 'ico-cull', altar: 'ico-altar', sporgan: 'ico-sporgan', herd: 'ico-herd', invest: 'ico-invest', lineage: 'ico-lineage', traitw: 'ico-traitw', traits: 'ico-traits', flip: 'ico-flip', round: 'ico-round', roundend: 'ico-roundend', usedslot: 'ico-usedslot', pros: 'ico-breed',
    or: 'ico-or', empty: 'ico-zero', follow: 'ico-follow', starstep: 'ico-starstep', adj: 'ico-adj', ban: 'ico-ban', lastround: 'ico-lastround', everyone: 'ico-all', coopadv: 'ico-coopadv', rapid: 'ico-rapid', gather: 'ico-gather', perlv: 'ico-perlv', form1: 'ico-form1', form2: 'ico-form2', form3: 'ico-form3', order: 'ico-order', start: 'ico-start', each: 'ico-each' }; // O-86：O-85 の絵（icons.js） // O-61：字の札の代わりの記号（絵はデザイン・icons.js）。pros＝繁栄度（繁殖と同じ絵）
  const JP = { E: 'エネルギー', G: '遺伝子', P: '個体数', L: '生命核', coop: '協調', gem: '痕跡', W: 'ワーカー', bless: '祝福', trait: '形質', organ: '器官', breed: '繁殖', up: '進化', rslot: '資源枠', star: '星海開拓', join: '合流進出', launch: '緊急進出', any: '好きな資源', all: '全種（E・G・P）', cb: '協調ボーナス',
    cull: '淘汰', altar: '祭壇', sporgan: '特殊器官', herd: '群体の枠', invest: '投入', lineage: '完成した系統', traitw: '弱の形質', traits: '強の形質', flip: '裏返す', round: 'ラウンド', roundend: 'ラウンド終了', usedslot: '使用済みの枠', pros: '繁栄度',
    or: 'か', empty: '手持ちが 0', follow: '追随', starstep: '★の段', adj: '隣り合う', ban: 'できない', lastround: '最終ラウンド', everyone: '全員', coopadv: '協調進出', rapid: '急速形成', gather: '採集', perlv: 'Lv 1 つにつき', form1: '形態Ⅰ', form2: '形態Ⅱ', form3: '形態Ⅲ', order: '手番順', start: '開始時', each: '〜するたび' };
  // O-61（§114）：新しい記号の説明（ヒント・記号の一覧・ガイド・早見表で同じ文）
  const HINT = { cull: '淘汰のアクション（色つきはそのトラックの淘汰）', altar: '祭壇の払い口', sporgan: '特殊器官（代謝 Lv4 に達した順に 1 枚）', herd: '資源獲得の枠の群体同期・群体融合', invest: '生命核の投入', lineage: '第 3 形態までそろえた器官の系統', traitw: '形質の弱い面', traits: '形質の強い面', flip: '弱で持っている形質を強に裏返す', round: '1／ラウンド＝ラウンドに 1 回・終わりの印つき＝ラウンド終了時・単独＝このラウンドの間', roundend: 'ラウンド終了時', usedslot: 'ほかの人のコマが置かれた資源獲得の枠', pros: '繁栄度 +1（繁殖 1 段と同じく得点の倍率が上がる）', zero: '無料', ticket: 'ゲーム中に使える回数（使い切り）',
    or: 'どちらか選ぶ（2 つの並びの間）', empty: '手持ちが 0 の資源（条件の中）', follow: '追随（先駆のあとに着いた人）', starstep: '★の段（Lv3★・Lv5★＝強い報酬の段）', adj: '隣り合う（祭壇の払い口）', ban: 'できない（記号に重ねる）', lastround: '最終ラウンド（条件の中）', everyone: '全員（当てはまる人みな）', coopadv: '協調進出（協調を払って使用済みの資源枠に置く）', rapid: '急速形成（同じ系統の器官を 2〜3 枚続けて形成）', gather: '採集（E・G・P・協調のどれかを少し得る）', perlv: 'トラックの Lv 1 つにつき（色はそのトラック）', form: '器官の形態Ⅰ・Ⅱ・Ⅲ（何段目の器官か）', form1: '器官の形態Ⅰ（1 段目）', form2: '器官の形態Ⅱ（2 段目）', form3: '器官の形態Ⅲ（3 段目）', order: '手番順', start: '開始時（ゲームの始めから）', each: '〜するたび（条件の中）' };
  const TRK = { body: '身体', intel: '知性', social: '社会', metab: '代謝' };
  const WHEN = { '!': ['now', '今すぐ 1 回（形成時・取得時・到達時）'], '手': ['inc', '毎回の収入'], '∞': ['perm', '恒久（持っているあいだずっと）'], '旗': ['end', 'ゲーム終了時'], '始': ['start', '開始時（ゲームの始めから）'] }; // O-86：5 つ目＝開始時（種族の能力）
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, ...kids) { const e = document.createElement(tag); if (cls) e.className = cls; kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); }); return e; }
  function ic(k) { const [b, tr] = String(k).split('.'); const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic ' + b + (tr ? ' trk-' + tr : '')); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + (ICO[b] || 'ico-gem')); s.appendChild(u); const t = document.createElementNS(NS, 'title'); t.textContent = tr && TRK[tr] ? JP[b] + '(' + TRK[tr] + ')' : (JP[b] || b) + (HINT[b] ? '：' + HINT[b] : ''); s.appendChild(t); return s; } // O-61：cull.body＝そのトラックの色の淘汰
  const isKey = (k) => !!ICO[String(k).split('.')[0]];
  const target = (k) => k.startsWith('~') ? el('span', 'fxword', k.slice(1)) : isKey(k) ? ic(k) : null;
  function whenBadge(w) { const [c, t] = WHEN[w]; const b = el('span', 'fxw w-' + c); b.title = t; if (w === '手') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'wi'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#ico-income'); s.appendChild(u); b.appendChild(s); } else if (w === '旗' || w === '始') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'wi'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', w === '始' ? '#ico-start' : '#ico-flag'); s.appendChild(u); b.appendChild(s); } else b.appendChild(document.createTextNode(w)); return b; }
  function chip(cls, k, n) { // k＝記号キー or ~語
    const c = el('span', 'pc ' + cls); if (k === 'all') { c.title = JP.all; ['E', 'G', 'P'].forEach(x => c.appendChild(ic(x))); } else if (k === 'cb') { c.className = 'pc bonus cbper'; c.title = JP.cb; c.appendChild(ic('coop')); } /* O-51：協調ボーナスは点線・地なし */ else if (k.startsWith('~')) c.appendChild(el('span', 'fxword', k.slice(1))); else { c.title = JP[k] || k; c.appendChild(ic(k)); }
    if (n !== '') c.appendChild(el('b', null, n)); return c; }
  function token(tk) {
    if (tk === '>') return el('span', 'po', '→');
    if (tk === '…') { const m = el('span', 'fxmore', '…'); m.title = 'ほかにも条件あり（マウスで全文）'; return m; }
    if (tk[0] === '#') return el('span', 'pbad', tk.slice(1).replace('R終了', 'R 終了'));
    if (/^x[\d.]+$/.test(tk)) return el('span', 'fxmul', '×' + tk.slice(1));
    if (/^\+\d+$/.test(tk)) return el('span', 'fxmul', tk); // O-61：+1（枚数の上乗せ）
    if (tk === '$0') { const z = el('span', 'pc cost ptag fxzero'); z.title = '値札 0：' + HINT.zero; z.appendChild(el('b', null, '0')); return z; } // O-61：無料＝値札に 0
    if (tk[0] === '^') { const z = el('span', 'fxtk'); z.title = '回数 ' + tk.slice(1) + '：' + HINT.ticket; const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'tk'); s.setAttribute('viewBox', '0 0 20 16'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#ico-ticket'); s.appendChild(u); z.appendChild(s); z.appendChild(el('b', null, tk.slice(1))); return z; } // O-61：回数＝切符に数字
    { const m = tk.match(/^(\d+)\/R$/); if (m) { const f = el('span', 'fxper fxround', m[1] + '／'); f.appendChild(ic('round')); f.title = 'ラウンドに ' + m[1] + ' 回'; return f; } } // O-61：1／［ラウンド］
    { const m = tk.match(/^≤([A-Za-z]+)(\d+)$/); if (m) { const f = el('span', 'fxcond fxle'); f.appendChild(ic(m[1])); f.appendChild(document.createTextNode('≤' + m[2])); f.title = JP[m[1]] + ' ' + m[2] + ' まで'; return f; } } // O-61：［E］≤10
    if (tk.startsWith('i:')) return ic(tk.slice(2));
    if (tk[0] === '%') return banned(tk.slice(1)); // O-86：できない＝記号に赤い円と斜線
    if (tk === '=先') { const f = el('span', 'fxeq', '＝'); f.appendChild(el('span', 'fxfirst', el('span', 'fxpar', '先'))); f.title = '先駆と同じ（強い報酬）'; return f; } // O-86：［追随］＝（先）
    if (tk[0] === '~') return el('span', 'fxword', tk.slice(1));
    if (tk[0] === '+' || tk[0] === '-') { const body = tk.slice(1); let k, n; const m = body.match(/^(~[^:]+|[a-zA-Z]+):(.+)$/) || body.match(/^([a-zA-Z]+)(\d+|½)$/); if (m) { k = m[1]; n = m[2]; } else { k = body; n = ''; } return tk[0] === '+' ? chip('gain', k, /^[\d½]/.test(n) ? '+' + n : n) : chip('cost', k, n); }
    if (tk[0] === '↓') { const [t, k, n] = tk.slice(1).split(':'); const f = document.createDocumentFragment(); const tg = t ? target(t) : null; if (tg) f.appendChild(tg); const tag = el('span', 'pc cost ptag'); tag.title = '軽減'; if (k) tag.appendChild(ic(k)); tag.appendChild(el('span', 'dn', '↓')); tag.appendChild(el('b', null, n)); f.appendChild(tag); return f; }
    if (tk[0] === '?') { const m = tk.slice(1).match(/^(~[^↑]+|[a-zA-Z]+)(.*)$/); const f = el('span', 'fxcond'); f.appendChild(target(m[1])); if (m[2] === '↑') f.appendChild(ic('each')); else if (m[2]) f.appendChild(document.createTextNode(m[2])); f.appendChild(document.createTextNode('：')); return f; } // O-86：↑＝するたび
    if (tk[0] === '/') { const m = tk.slice(1).match(/^(~.+|[a-zA-Z]+)(\d*)(?::(.+))?$/); const f = el('span', 'fxper', '／'); f.appendChild(target(m[1])); if (m[2]) f.appendChild(document.createTextNode(m[2])); if (m[3]) f.appendChild(el('small', null, m[3])); f.title = 'ごと'; return f; }
    if (tk[0] === '=') { const m = tk.slice(1).match(/^([a-zA-Z]+)(\d*)$/); const f = el('span', 'fxeq', '＝'); f.appendChild(ic(m[1])); if (m[2]) f.appendChild(el('b', null, m[2])); f.title = '～として数える'; return f; }
    if (tk[0] === '@') { const free = tk.endsWith('!'); const k = tk.slice(1).replace(/!$/, ''); const f = el('span', 'fxact'); f.title = JP[k] + (free ? '（手番なし＝コマを使わない）' : ''); f.appendChild(ic(k)); if (free) f.appendChild(noTurn()); return f; }
    if (WHEN[tk]) return whenBadge(tk);
    return document.createTextNode(tk);
  }
  // O-52：「手番なし」＝コマ（ワーカー）の絵に赤い斜線の丸（字なし）
  function noTurn() { const w = el('span', 'fxnoturn'); w.title = '手番なし（コマを使わない）'; w.appendChild(ic('W')); const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'nt'); s.setAttribute('viewBox', '0 0 16 16'); s.innerHTML = '<circle cx="8" cy="8" r="6.6" fill="none" stroke="#d63b2f" stroke-width="1.8"/><line x1="3.4" y1="12.6" x2="12.6" y2="3.4" stroke="#d63b2f" stroke-width="1.8"/>'; w.appendChild(s); return w; }
  // O-86：できない＝記号に赤い円と斜線を重ねる（ico-ban）
  function banned(k) { const w = el('span', 'fxban'); w.title = (JP[String(k).split('.')[0]] || k) + 'はできない'; w.appendChild(ic(k)); const b = ic('ban'); b.classList.add('ov'); w.appendChild(b); return w; }
  function closeFirst(g) { /* O-52：かっこは中身の最初と最後の記号にくっつけて折り返す（かっこだけが 1 行に残らない） */
    const it = g.items, nw = () => el('span', 'fxnw'); if (!it.length) return; const a = nw(); a.appendChild(el('span', 'fxpar', '(先')); a.appendChild(it[0]); g.appendChild(a);
    for (let k = 1; k < it.length - 1; k++) g.appendChild(it[k]);
    const z = it.length > 1 ? nw() : a; if (it.length > 1) { z.appendChild(it[it.length - 1]); g.appendChild(z); } z.appendChild(el('span', 'fxpar', ')')); }
  function line(s, full) { const tks = s.split(/\s+/).filter(Boolean); const d = el('div', 'fxl'); if (full) d.title = full; let i = 0; if (WHEN[tks[0]]) { d.appendChild(whenBadge(tks[0])); i = 1; } else d.appendChild(el('span', 'fxw w-none')); const b = el('span', 'fxt'); let grp = null; for (; i < tks.length; i++) { if (tks[i] === '(先') { grp = el('span', 'fxfirst'); grp.title = '先駆なら、さらに得るぶん'; grp.items = []; b.appendChild(grp); continue; } if (tks[i] === ')' && grp) { closeFirst(grp); grp = null; continue; } if (grp) grp.items.push(token(tks[i])); else b.appendChild(token(tks[i])); } if (grp) closeFirst(grp); d.appendChild(b); return d; } // O-52：(先 … ) ＝先駆の上乗せ
  // lines → 要素。label＝行頭の札（強・弱・先駆・追随）
  function render(ls, full, label) { const d = el('div', 'fx'); ls.forEach((s, i) => { const l = line(s, full); if (label && i === 0) l.insertBefore(el('span', 'fxlab', label), l.firstChild); else if (label) l.insertBefore(el('span', 'fxlab blank'), l.firstChild); d.appendChild(l); }); return d; }

  // O-51：協調ボーナス＝［資源 +1／協調］（点線・地なし・小さめ）／自己複製の［P +5／身体 Lv］
  function cbPer(k, title) { const c = el('span', 'pc bonus cbper'); c.title = title || '協調ボーナス：協調 1 つにつき、この枠の資源 +1'; c.appendChild(ic(k)); c.appendChild(el('b', null, '+1')); const f = el('span', 'fxper', '／'); f.appendChild(ic('coop')); c.appendChild(f); return c; }
  function perLv(k, n, tr, title) { const c = el('span', 'pc bonus cbper'); if (title) c.title = title; c.appendChild(ic(k)); c.appendChild(el('b', null, n)); const f = el('span', 'fxper', '／'); f.appendChild(ic('perlv.' + tr)); c.appendChild(f); return c; } // O-86：［P +5／Lv(身体)］
  function perChip(k, n, word, title) { const c = el('span', 'pc bonus cbper'); if (title) c.title = title; c.appendChild(ic(k)); c.appendChild(el('b', null, n)); c.appendChild(el('span', 'fxper', '／', el('span', 'fxword', word))); return c; }
  // O-61（§114）：補足の記号（記号の一覧・ガイド・早見表で同じ並びと文）
  const EXTRA = [['i:cull i:cull.body i:cull.intel i:cull.social i:cull.metab', HINT.cull], ['i:altar', HINT.altar], ['i:sporgan', HINT.sporgan], ['i:herd', HINT.herd], ['i:invest', HINT.invest], ['i:lineage', HINT.lineage], ['i:traitw', HINT.traitw], ['i:traits', HINT.traits], ['i:flip', HINT.flip], ['1/R i:round i:roundend', 'ラウンド：' + HINT.round], ['^1', '回数：' + HINT.ticket], ['i:usedslot', HINT.usedslot], ['$0', '値札 0：' + HINT.zero], ['+pros1', HINT.pros],
    ['i:or', 'か：' + HINT.or], ['i:empty', HINT.empty], ['i:starstep', HINT.starstep], ['i:follow =先', HINT.follow + '＝（先）＝先駆と同じ'], ['i:adj', HINT.adj], ['%launch %coopadv', HINT.ban + '（緊急進出・協調進出はできない）'], ['i:lastround', HINT.lastround], ['i:everyone', HINT.everyone], ['i:coopadv', HINT.coopadv], ['i:rapid', HINT.rapid], ['i:gather', HINT.gather], ['i:perlv.body i:perlv.intel i:perlv.social i:perlv.metab', HINT.perlv], ['i:form1 i:form2 i:form3', HINT.form], ['i:order', HINT.order], ['i:each', HINT.each]]; // O-86
  // 記号の一覧（凡例）
  function legend() {
    const d = el('div', 'fxlegend');
    const row = (sym, txt) => el('div', 'fxlr', el('span', 'fxls', sym), el('span', 'fxld', txt));
    const L = (s) => line(s, null);
    d.appendChild(el('h4', null, 'いつ'));
    Object.keys(WHEN).forEach(w => d.appendChild(row(whenBadge(w), WHEN[w][1] + (w === '∞' ? '。ラウンド終了時の効果はラウンド終了の記号' : ''))));
    d.appendChild(el('h4', null, '並び'));
    [['手 +E6', '得る（緑地・いつも ＋）'], ['! -P20 > +gem1', '払う（赤地）→ 得る'], ['∞ ↓trait:G:6', '軽減：対象の後に赤い値札（G が 6 安い）'], ['∞ ?star↑ +E6', '条件：記号＋「：」（星海開拓を 1 段上げるたび E+6）'], ['手 +E4 /organ', 'ごと：スラッシュ（器官 1 枚につき）'], ['∞ =trait1', '～として数える（形質 1 枚）'], ['! @join!', '手番なし（コマに赤い斜線）で行う行動・無料で取る'], ['∞ i:launch x4', '倍'], ['∞ =trait4 …', '書ききれない：マウスを当てると全文'], ['! +L1 (先 +P30 )', '（先 …）＝先駆ならさらに得るぶん（★の段・Lv6）']].forEach(([s, t]) => d.appendChild(row(L(s), t)));
    d.appendChild(el('h4', null, '記号'));
    const g = el('div', 'fxlicons'); ['E', 'G', 'P', 'L', 'coop', 'gem', 'bless', 'trait', 'organ', 'breed', 'up', 'rslot', 'star', 'join', 'launch', 'any'].forEach(k => g.appendChild(el('span', null, ic(k), JP[k]))); g.appendChild(el('span', null, chip('gain', 'all', '+4'), '全種')); g.appendChild(el('span', null, cbPer('E'), '協調ボーナス（協調 1 つにつき +1）')); g.appendChild(el('span', null, chip('gain', 'cb', '+3'), '協調ボーナスに +3（群心核）')); d.appendChild(g);
    d.appendChild(el('h4', null, '補足の記号')); EXTRA.forEach(([s, t]) => d.appendChild(row(L(s), t))); // O-61
    return d;
  }

  // 星海開拓の段：額（赤地）→ 痕跡、先駆の選択肢、Lv6 の先着・後着・神の裁定。withCost＝この局の額（無ければ「額」の語）
  function star(st, lv, withCost) {
    const R = R_(st), S = R.star; if (!on(st) || !S) return null; const c = withCost && st.shared && st.shared.starCards ? G.starCost(st, lv) : null;
    const pay = c ? Object.keys(c).filter(k => c[k]).map(k => '-' + k + c[k]).join(' ') : '~額'; const ct = c ? G.starCostText(c) : `額（${G.STAR_CARD_NAME}の 2 種）`;
    const top = G.starTop(st, lv), LG = R.lv6Gems || { first: 1, later: 1 }, SJ = S.top && S.top.judge, g = G.starGem(st, lv), F = G.starFirstDef(st, lv), fg = F ? G.starFirstGem(st, lv) : 0;
    const full = `${ct}を払う` + (top ? `。先着 痕跡+${LG.first}＋祝福+1／後着 痕跡+${LG.later}${SJ ? `。終了時 祝福+${SJ}（神の裁定・Lv6 の人みな）` : ''}` : ` → 痕跡+${g}${F ? `。先駆は 痕跡+${fg}${F.pros !== undefined ? ` か 痕跡+${F.pros}・繁栄度+1` : ''}` : ''}`);
    const parts = top ? [{ lines: ['! ' + pay] }, { first: true, lines: ['! +gem' + LG.later + ' (先 ' + (LG.first - LG.later > 0 ? '+gem' + (LG.first - LG.later) + ' ' : '') + '+bless1 )'] }].concat(SJ ? [{ lines: ['旗 i:everyone +bless' + SJ] }] : []) // O-52：Lv6 は 4 本と同じ形（後着が基本・（先 …）＝先着の上乗せ）
      : [{ lines: ['! ' + pay + ' > +gem' + g] }].concat(F ? [{ label: '先駆', first: true, lines: ['! +gem' + fg + (F.pros !== undefined ? ' i:or ' + (F.pros ? '+gem' + F.pros + ' ' : '') + '+pros1' : '')] }] : []);
    return { parts, full, top: !!top, star: !!(F || top) };
  }
  // 一覧（ガイドの「カードの記号一覧」・テスト）：T32 の器官・特殊器官・形質・トラックの報酬・恩寵枠
  function all(st) {
    const out = [], R = R_(st);
    (R.organSet || []).forEach(l => [1, 2, 3].forEach(t => { const id = l + t; out.push({ group: '器官（' + G.LINEAGES[l] + '）', id, name: G.ORGANS[id].name, lines: lines(st, 'organ', id), full: organFull(st, id) }); }));
    ['SpE', 'SpG', 'SpP', 'SpC', 'SpM'].forEach(id => out.push({ group: '特殊器官', id, name: G.ORGANS[id].name, lines: lines(st, 'organ', id), full: organFull(st, id) }));
    (R.traitPool ? G.traitSortView(st, R.traitPool) : []).forEach(id => ['s', 'w'].forEach(w => out.push({ group: '形質', id, name: G.TRAITS[id].name, label: w === 's' ? '強' : '弱', lines: lines(st, 'trait', id, w), full: traitFull(st, id, w === 's') })));
    G.TRACKS.forEach(t => { for (let l = 2; l <= 6; l++) { const nm = G.TRACK_INFO[t].name + ' Lv' + l + (l === 3 || l === 5 ? '★' : ''); const full = trackFull(st, t, l); if (trackSplit(st, t, l)) ['s', 'w'].forEach(w => out.push({ group: '進化トラック', id: t + l, name: nm, label: l === 6 ? (w === 's' ? '先駆' : '追随') : (w === 's' ? '強' : '弱'), lines: lines(st, 'track', [t, l], w), full })); else out.push({ group: '進化トラック', id: t + l, name: nm, lines: lines(st, 'track', [t, l]), full }); } });
    if (R.star && R.star.lv1) for (let lv = 1; lv <= G.STAR_MAX; lv++) { const x = star(st, lv, false); x.parts.forEach(pt => out.push({ group: '進化トラック', id: 'star' + lv, name: G.STAR_NAME + ' ' + G.starLvText(st, lv) + (x.star ? '★' : ''), label: pt.label, lines: pt.lines, full: x.full })); }
    ((R.tribute && R.tribute.pool) || []).forEach(id => out.push({ group: '恩寵枠', id, name: G.SLOT_BY_ID[id].name, lines: lines(st, 'trib', id), full: G.slotText(st, id) }));
    return out;
  }
  G.FX = { SETS, ORGAN, TRAIT, TRACK, TRIB, EXTRA, HINT, JP, on, txt, organFull, traitFull, trackFull, lines, trackSplit, star, render, line, legend, all, ic, WHEN, cbPer, perChip, perLv, banned };
})();
