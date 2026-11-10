/* game01 デジタルモック — UI v2
   ゲームは「meta＋エントリ列」で表し、状態は毎回 G.rebuild で再構築する（ローカル／オンライン共通）。
   ローカル＝1台でパス＆プレイ（ホットシート）。オンライン＝Firebaseでエントリ列を共有、座席ごとに操作権。 */
(function (G) {
  'use strict';
  const Net = G.Net;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) { if (v) el.addEventListener(k.slice(2), v); } else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); });
    return el;
  };
  const SAVE_KEY = 'game01_mock_v2';
  const ART_REAL = '../illustrations/', ART_PH = '../illustrations/placeholder/';
  function art(id, cls) {
    id = (G.ART_ALIAS && G.ART_ALIAS[id]) || id;
    const img = h('img', { class: 'art ' + (cls || ''), alt: '', loading: 'lazy', src: ART_REAL + id + '.png' });
    img.addEventListener('error', () => { if (img.dataset.ph) { img.remove(); return; } img.dataset.ph = '1'; img.src = ART_PH + id + '.svg'; });
    return img;
  }
  const SPECIES_ART = { wing: 'species_wing', arm: 'species_arm', ant: 'species_ant', manta: 'species_manta' };
  const RES_JP = { E: 'E', G: 'G', P: 'P', L: 'L', coop: '協調' };
  const ICO = { E: 'ico-e', G: 'ico-g', P: 'ico-pop', L: 'ico-life', coop: 'ico-coord', gem: 'ico-gem', W: 'ico-w', bless: 'ico-bless', trait: 'ico-trait', organ: 'ico-organ', breed: 'ico-breed', up: 'ico-up', rslot: 'ico-slot', eye: 'ico-eye', copy: 'ico-copy' };
  const ICO_JP = { E: 'エネルギー', G: '遺伝子', P: '個体数', L: '生命核', coop: '協調', gem: '痕跡', W: 'ワーカー', bless: '祝福', trait: '形質', organ: '器官', breed: '繁栄度', up: '進化', rslot: '資源枠', eye: '他者の最高Lv', copy: '模倣' };
  const ic = (k, n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic ' + k); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + (ICO[k] || 'ico-gem')); s.appendChild(u); const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = ICO_JP[k] || k; s.appendChild(t); if (n === undefined) return s; const f = document.createDocumentFragment(); f.appendChild(s); f.appendChild(document.createTextNode(String(n))); return f; };
  const icost = (txt) => { // "E5+G1" 等をアイコン化
    const frag = document.createDocumentFragment();
    String(txt).split(/\s*[+＋]\s*/).forEach((part, i) => { const m = part.match(/^([EGPL])(\d+)$/); if (i) frag.appendChild(document.createTextNode('+')); if (m) { frag.appendChild(ic(m[1])); frag.appendChild(document.createTextNode(m[2])); } else frag.appendChild(document.createTextNode(part)); });
    return frag;
  };

  // ---------- アイコン表示（2026-11-01 ユーザー要望：アクションの説明を文字でなくアイコンで。文字表示は残して切り替え） ----------
  // 「払うもの（赤地）→ 得るもの」の絵で表す。数値は文字表示と同じエンジンの値（見ている人の軽減後）から作る。対応の無い枠は文字表示のまま
  // 2026-11-05 画面の AI の読みの深さ：?depth=2（&beam=3）でビーム探索（R 内・自分の手だけ）。既定は 1 手読み＋ラウンド単位の計画（第53部：2 手で +10 点・1 手あたり約 0.3〜0.6 秒）
  { const q = new URLSearchParams(location.search); const d = parseInt(q.get('depth') || '', 10); if (G.Bot && d >= 1 && d <= 5) { G.Bot.BEAM.depth = d; G.Bot.BEAM.fromUrl = true; } const k = parseInt(q.get('beam') || '', 10); if (G.Bot && k >= 1 && k <= 8) G.Bot.BEAM.k = k; }
  const VIEW_KEY = 'g01_view';
  let viewMode = (() => { const q = new URLSearchParams(location.search).get('view'); if (q === 'icon' || q === 'text') return q; try { return localStorage.getItem(VIEW_KEY) === 'icon' ? 'icon' : 'text'; } catch (e) { return 'text'; } })();
  let legendOpen = true;
  // 2026-11-04 ユーザー要望：テストプレイ時に画面の配色を白（ライト）／黒（ダーク）で選べるように。ヘッダ右端とセットアップ画面で切り替え・端末に記憶・URL の ?theme=light|dark でも指定可（index.html で CSS 読み込み前に data-theme を付けてちらつきを防ぐ）
  const THEME_KEY = 'g01_theme';
  let themeMode = (() => { const q = new URLSearchParams(location.search).get('theme'); if (q === 'dark' || q === 'light') return q; try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })();
  const darkTheme = () => themeMode === 'dark';
  function applyTheme() { document.documentElement.setAttribute('data-theme', themeMode); }
  function setTheme(m) { themeMode = m; try { localStorage.setItem(THEME_KEY, m); } catch (e) { } applyTheme(); render(); }
  function themeToggle() { return h('span', { class: 'vtog ttog', title: '画面の配色（白／黒）を切り替える（この端末に記憶）' }, h('button', { class: themeMode === 'light' ? 'on' : '', onclick: () => setTheme('light') }, '白'), h('button', { class: themeMode === 'dark' ? 'on' : '', onclick: () => setTheme('dark') }, '黒')); }
  applyTheme();
  const iconView = () => viewMode === 'icon';
  function setView(m) { viewMode = m; try { localStorage.setItem(VIEW_KEY, m); } catch (e) { } render(); }
  const pc = (k, n, o) => h('span', { class: 'pc pk-' + k + (o && o.cost ? ' cost' : '') + (o && o.cls ? ' ' + o.cls : ''), title: (o && o.title) || ICO_JP[k] }, ic(k), n === undefined || n === null ? null : h('b', null, String(n)));
  const po = (s) => h('span', { class: 'po' }, s);
  const pbad = (s, title) => h('span', { class: 'pbad', title: title || null }, s);
  const pcost = (k, n, base) => pc(k, n, { cost: true, cls: base !== undefined && n !== base ? 'disc' : '', title: base !== undefined && n !== base ? `${ICO_JP[k]}（軽減後・基準 ${base}）` : ICO_JP[k] + 'を払う' });
  const coopBonus = () => pc('coop', '+', { cls: 'bonus', title: '協調ボーナス：協調の数に応じて、この枠の資源が増える' });
  function picto(id, p) {
    const R = G.RULESETS[st.rules || 'v1']; const vp = viewP(p); const sc = (n) => G.sc(st, n); const T = R.tribute || {}; const TS = T.slots || {};
    const resB = G.RES_SLOTS.includes(id) && R.coopMode !== 'spend' && (!R.coopBonusSlots || R.coopBonusSlots.includes(id)) ? [coopBonus()] : [];
    const massC = (k) => pcost('P', G.massCost(vp, k), k === 'MM' && R.mmCost ? R.mmCost : k === 'MS' && R.msCost ? R.msCost : R.massCost);
    const w = (R.gauge ? [] : [pc('W', null, { title: 'ワーカー必須（ATでは置けない）' })]);
    const bless = (k) => { const kk = k || 'G'; const vg = G.tribVg ? G.tribVg(st, kk) : 1, tr = G.tribReal ? G.tribReal(st, kk) : 0; const a = []; if (tr) a.push(pc('gem', '+' + tr)); if (vg) a.push(pc('bless', '+' + vg)); return a; }; // v3.67 祭壇＝祝福+2／T14（§16 M-a）＝痕跡と祝福の組み合わせ（配列で返す）
    switch (id) {
      case 'E5': return [pc('E', '+' + sc(5)), ...resB];
      case 'G3': return [pc('G', '+' + sc(3)), ...resB];
      case 'P8': return [pc('P', '+' + (R.p8 || 8)), ...resB];
      case 'ALL': return [pc('E', '+' + sc(2)), pc('G', '+' + sc(1)), pc('P', '+' + sc(4)), ...resB];
      case 'EG': return R.herd ? [pcost('P', R.herdCost || 6), po('→'), pc('E', '+' + sc(3)), pc('coop', '+' + (R.herdCoop || 1)), ...resB] : null;
      case 'GG': return R.herd ? [pcost('P', R.herdCost || 6), po('→'), pc('G', '+' + sc(2)), pc('coop', '+' + (R.herdCoop || 1)), ...resB] : null;
      case 'PB': return [pcost('G', G.pbCost(vp), sc(2)), po('→'), pc('P', '+' + G.pbGain(st)), ...(R.pbCoop ? [coopBonus()] : [])];
      case 'MB': return [massC('MB'), po('→'), pc('gem', '+1')];
      case 'MI': return R.miMaxCost ? [massC('MI'), po('→'), pc('trait', '×' + (R.miCount || 2), { title: `コストG${R.miMaxCost}以下の形質を異なる${R.miCount || 2}種` }), pbad('≤' + R.miMaxCost, `コストG${R.miMaxCost}以下`)] : null;
      case 'MS': return [massC('MS'), po('→'), pc('coop', '+' + (R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2)))];
      case 'MM': return [massC('MM'), po('→'), pc('E', '+' + (R.mmGain || sc(10))), pc('G', '+' + (R.mmGain || sc(10)))]; // T18：mmGain
      case 'TRT': return [pcost('G'), po('→'), pc('trait', '+1')];
      case 'TRT2': return [pcost('G'), pcost('E', st.round), po('→'), pc('trait', '+1')];
      case 'MIM': { const b = R.mimicCost || 4; return [pcost('G', G.gSlotCost(vp, b), b), po('→'), pc('copy', null, { title: '模倣：自分を含む誰かが到達済みの Lv2／Lv3★ の即時効果を1つ' }), pbad('Lv2/3★')]; }
      case 'EXP': { const b = R.expressCost || 10; return [pcost('G', G.gSlotCost(vp, b), b), po('→'), pc('gem', '+1')]; }
      case 'GEM': return T.flatG ? [pcost('G', sc(T.flatG)), po('→'), ...bless()] : null;
      case 'TE': return TS.TE ? [pcost('E', sc(TS.TE.E)), po('→'), ...bless()] : null;
      case 'TP': return TS.TP ? [pcost('P', sc(TS.TP.P)), po('→'), ...bless()] : null;
      case 'TR': return TS.TR ? [pcost('E', sc(TS.TR.E)), pcost('P', sc(TS.TR.P)), po('→'), pc('gem', '+1')] : null;
      case 'TO': return R.toLineage ? [pc('organ', '1', { title: '1 段目の定価で' }), po('→'), pc('organ', '×3', { title: '3 段目まで形成する' })] : [pc('organ', '0', { title: '器官1枚を無料（追随の代償なし）' }), po('+'), pc('organ', '½', { title: '同じ手番にもう1枚を半額' })];
      case 'TT': return TS.TT ? [pcost('G', sc(TS.TT.G || 0)), po('→'), pc('trait', '×' + (TS.TT.n || 2), { title: `形質を${TS.TT.n || 2}枚まで無料` })] : null;
      case 'TB': return TS.TB ? [pc('rslot', '1', { title: '資源枠1つを今すぐ実行（使用済みでも）' }), pbad('使用済みOK'), po('+'), pc('rslot', '×' + (TS.TB.mul || 2), { title: 'このラウンドの残りの手番、資源枠の獲得量が倍' })] : null;
      case 'TJ': return TS.TJ ? [pc('up', '×' + (TS.TJ.n || 2), { title: `進化を${TS.TJ.n || 2}回（同じでも別でも）` }), pc('E', '−' + sc(TS.TJ.disc || 0), { cls: 'minus', title: `合計コストから E${sc(TS.TJ.disc || 0)} 引く` })] : null;
      case 'BRD': { if (!R.coef2 || !R.breed.every(c => c === R.breed[0])) return null; const c = G.breedCost(vp); return [...w, pcost('P', c === null ? R.breed[0] : c, R.breed[0]), ...(R.breedL ? [po('/'), pcost('L', R.breedL)] : []), po('→'), pc('breed', '+1', { title: `繁栄度+1（全${R.breed.length}段）` })]; }
      case 'ORG': { const oc = R.organCost || G.ORGAN_COST; const es = oc.map(x => x[0]), gs = oc.map(x => x[1]); const rg = (a) => Math.min(...a) === Math.max(...a) ? String(a[0]) : `${Math.min(...a)}〜${Math.max(...a)}`; return [pcost('E', rg(es)), pcost('G', rg(gs)), po('→'), pc('organ', '+1'), ...(R.organSameEffect ? [pbad('代償+E' + sc(R.organLateFee || 1), '先駆より後に形成すると +E')] : [])]; }
      case 'SCAN': return [pcost('E', sc(5)), po('→'), pc('eye', 'Lv×' + sc(2), { title: `他プレイヤーの最高Lv×${sc(2)}の、そのトラックの資源` })];
      case 'ADP': return [...w, pcost('L', 1), po('→'), pc('up', '+1', { title: 'Lv1のトラックを1段' }), pbad('Lv1')];
      case 'CNV': return [[['E', 2], ['G', 1]], [['G', 2], ['E', 1]], [['P', 8], ['E', 3]], [['P', 8], ['G', 2]]].map(([[a, x], [b, y]]) => h('span', { class: 'pgrp' }, pcost(a, sc(x)), po('→'), pc(b, '+' + sc(y))));
      case 'RSV': return [pbad('無料'), po('→'), pc('E', '+' + (R.reserveE || 2)), po('/'), pc('G', '+' + (R.reserveG || 1))];
      case 'LCR': { const n = Math.max(1, R.lCrystal - (vp.crystalDiscL || 0)); return [pcost('L', n, R.lCrystal), po('→'), ...bless('L')]; }
      case 'CCR': { const n = Math.max(1, R.coopCrystal - (vp.crystalDiscC || 0)); return [pcost('coop', n, R.coopCrystal), po('→'), ...bless('coop')]; }
      case 'TRIB_E': return [pcost('E', sc(T.shared.E)), po('→'), ...bless()];
      case 'TRIB_P': return [pcost('P', sc(T.shared.P)), po('→'), ...bless()];
    }
    return null;
  }
  // 今実行したときの増減（previewGain）をアイコンで
  // pay＝支払いの P（淘汰）。「P-84 +18」のように支払いと戻りを分けて出す（2026-11-10 v3.93 ユーザー指摘：差し引きの -66 だと割引に見える）
  const gainStr = (d, pay) => { if (!pay) return G.gainText(d); const d2 = Object.assign({}, d); const back = (d.P || 0) + pay.P; delete d2.P; return [`P-${pay.P}${back ? (back > 0 ? '+' : '') + back : ''}`, G.gainText(d2)].filter(Boolean).join(' '); };
  function gainChips(d, pay) { const out = []; if (pay) { out.push(pc('P', '-' + pay.P, { cls: 'neg' })); const back = (d.P || 0) + pay.P; if (back) out.push(pc('P', (back > 0 ? '+' : '') + back, back < 0 ? { cls: 'neg' } : null)); } ['E', 'G', 'P', 'L', 'coop'].forEach(k => { if (pay && k === 'P') return; if (d[k]) out.push(pc(k, (d[k] > 0 ? '+' : '') + d[k], d[k] < 0 ? { cls: 'neg' } : null)); }); const gs = G.TRACKS.reduce((a, t) => a + (d['gem_' + t] || 0), 0); if (gs) out.push(pc('gem', '+' + gs)); if (d.gemsets) out.push(pc('bless', '+' + d.gemsets)); return out; }
  // 枠の中身：アイコン表示なら「名前（小）＋絵」、文字表示なら従来どおり。pid＝picto の識別子（slot id 以外の共用盤の枠は擬似 id）
  function slotBody(p, pid, name, text, d, pay) {
    const pic = iconView() ? picto(pid, p) : null; const gain = d ? gainStr(d, pay) : null;
    if (pic) return [h('span', { class: 'pname' }, name), h('span', { class: 'picto' }, pic), d && gain ? h('span', { class: 'picto pgain', title: '今実行すると：' + gain }, po('⇒'), gainChips(d, pay)) : null];
    return [h('b', null, name), h('small', null, typeof text === 'string' ? icost(text) : text), gain ? h('small', { class: 'gain' }, `→ ${gain}`) : null];
  }
  function viewToggle() {
    return h('span', { class: 'vtog', title: 'アクション（占有盤・共用盤）の表示を切り替える' }, h('button', { class: viewMode === 'text' ? 'on' : '', onclick: () => setView('text') }, '文字'), h('button', { class: viewMode === 'icon' ? 'on' : '', onclick: () => setView('icon') }, 'アイコン'));
  }
  function iconLegend() {
    const it = (k, n) => h('span', null, ic(k), n || ICO_JP[k]);
    return h('details', { class: 'plegend', open: legendOpen, ontoggle: (e) => { legendOpen = e.target.open; } }, h('summary', null, 'アイコンの見方'),
      ['E', 'G', 'P', 'L', 'coop', 'gem', 'bless', 'trait', 'organ', 'breed', 'up', 'rslot', 'eye', 'copy'].map(k => it(k)),
      h('span', null, h('span', { class: 'pc cost' }, h('b', null, '赤地')), '＝払う'), h('span', null, coopBonus(), '＝協調ボーナス'), h('span', null, h('span', { class: 'pc cost disc' }, h('b', null, '下線')), '＝軽減後'), h('span', null, po('⇒'), '＝今実行したときの増減'));
  }

  // ---------- ゲームモデル ----------
  let game = null; // { kind:'local'|'online', meta, entries } / { kind:'online', code }
  let st = null;   // 再構築した状態
  let logOpen = true; let tab = 'organ';
  const MENU_KEY = 'g01_menuOpen'; let menuOpen = false; try { menuOpen = localStorage.getItem(MENU_KEY) === '1'; } catch (e) { } // ヘッダのボタン群の開閉（2026-10-28 ユーザー要望：毎回は使わないので畳む。自分の資源をその位置に）
  function rebuildState() {
    if (!game) { st = null; return; }
    st = game.kind === 'online' ? Net.rebuild() : G.rebuild(game.meta, game.entries);
    if (st && st.rejected && st.rejected.length) console.warn('rejected entries', st.rejected);
  }
  function isOnline() { return game && game.kind === 'online'; }
  function isBot(pid) { const m = isOnline() ? Net.meta : (game && game.meta); return !!(m && m.bots && m.bots.includes(pid)); }
  function mine(pid) { if (isBot(pid)) return false; if (!isOnline()) return true; return Net.mySeats().includes(pid); }
  // この端末が操作する人間の席（1手戻すは、この席の直前の手まで戻す）
  function myHumanPids() { return st ? st.players.map(q => q.id).filter(pid => mine(pid)) : []; }
  const viewP = (p) => { if (!st || mine(p.id)) return p; const hs = myHumanPids(); return hs.length ? st.players[hs[0]] : p; }; // 2026-10-29：盤のコスト表示は「この端末で見ている人」の割引を反映する
  const ACT_JP = { lToRes: '生命核→資源', gather: '採集', burst: '急速形成', track: '進化', res: '資源獲得', organ: '器官形成', trait: '形質獲得', upgrade: '形質強化', mass: '淘汰', breed: '繁殖', gemset: '宝石セット', card: '個人カード', convert: '資源変換', reserve: '予備動員', scan: '探索', adapt: '適応進化', stAct: '器官アクション', resolve: '選択の解決', freeConv: '無料変換', species: '種族選択', startTrait: '初期形質', draft: 'ドラフト', cheat: 'デバッグ' };
  let seenUndo = null; // 了解済みの巻き戻し通知
  const leftTxt = (q) => G.RULESETS[st.rules || 'v1'].gauge ? `残${q.left.W + q.left.AT}` : `W${q.left.W}/AT${q.left.AT}`; // 係数ゲージ方式ではW/ATの区別なし
  // 他の参加者のアンドゥに自分の手が巻き込まれたときの通知（オンラインのみ。ローカルは同じ端末なので不要）
  function renderUndoNotice() {
    const u = st.undoInfo; if (!u || u.key === seenUndo || !isOnline() || u.uid === Net.uid) return null;
    const hit = u.removed.filter(x => x.pid !== undefined && mine(x.pid)); if (!hit.length) return null;
    const who = Object.values(Net.seats || {}).find(s => s && s.uid === u.uid); const by = who ? who.name : '他の参加者';
    return h('div', { class: 'banner warn' }, `${by} の${u.type === 'undo' ? '「1手戻す」' : '「ラウンド頭へ」'}により、あなたの行動が取り消されました：`,
      hit.map(x => `${st.players[x.pid].name}の${ACT_JP[x.type] || x.type}`).join('・'), '　', h('button', { class: 'primary', onclick: () => { seenUndo = u.key; render(); } }, '了解'));
  }
  let botTimer = null;
  function scheduleBot() {
    clearTimeout(botTimer); if (!st || st.ended) return;
    const fast = new URLSearchParams(location.search).get('auto');
    let pid = null;
    if (st.phase === 'play') pid = G.cur(st).id;
    else if (st.phase === 'setup') pid = st.setupStep === 'draft' ? st.setupOrder[st.setupIdx] : st.setupIdx;
    if (pid === null || !isBot(pid)) return;
    if (isOnline() && (!Net.meta || Net.meta.host !== Net.uid)) return; // オンラインではホスト端末がボットを動かす
    botTimer = setTimeout(() => {
      { const m = isOnline() ? Net.meta : (game && game.meta); if (G.Bot && !G.Bot.BEAM.fromUrl) G.Bot.BEAM.depth = (m && m.aiDepth >= 1 && m.aiDepth <= 5) ? m.aiDepth : 1; } // v3.64：セットアップの「AI の読み」（meta.aiDepth）。URL の ?depth= があればそちら
      let e = null;
      if (st.phase === 'setup') {
        // 2026-11-04 ユーザー要望：AI の初期選択（種族・九腕の開始形質）を固定（空いている先頭）でなくランダムに。シードと席から決める（同じシードなら同じ選択）
        const pickR = (arr, salt) => { let x = ((st.seed || 0) * 9301 + pid * 49297 + salt * 233) % 233280; x = (x * 9301 + 49297) % 233280; return arr[Math.floor(x / 233280 * arr.length)]; };
        if (st.setupStep === 'species') { const taken = st.players.map(q => q.species); const free = Object.keys(G.SPECIES).filter(k => !taken.includes(k)); e = { type: 'species', pid, species: pickR(free, 1) }; }
        else if (st.setupStep === 'armTrait') e = { type: 'startTrait', pid, trait: pickR(G.armTraitOptions(st), 2) };
        else if (st.setupStep === 'draft') { const need = G.handSize(st); e = { type: 'draft', pid, cards: st.shared.cardPool.slice(0, need) }; }
      } else e = G.Bot.choose(st, pid);
      if (!e) { toast('ボットが手詰まり', true); return; }
      submit(e);
    }, fast ? 0 : 500);
  }
  async function submit(entry) {
    try {
      if (st && st.phase === 'play' && !['undo', 'undoRound', 'undoOk', 'undoCancel'].includes(entry.type)) G.tryApply(st, entry);
      else if (st && st.phase === 'setup' && !['undo', 'undoRound'].includes(entry.type)) { const s = G.clone(st); s.history = []; G.applyEntry(s, entry); }
    } catch (e) { toast(e.message, true); return false; }
    if (isOnline()) { try { await Net.push(entry); } catch (e) { toast('送信失敗：' + e.message, true); return false; } }
    else { game.entries.push(entry); rebuildState(); autosave(); render(); }
    return true;
  }

  // ---------- モーダル／トースト ----------
  function ask(title, fields, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const back = $('#modal'); back.innerHTML = '';
      const form = h('form', { class: 'modal-box' }, h('h3', null, title));
      if (opts.note) form.appendChild(h('p', { class: 'note' }, opts.note));
      const inputs = {}, rows = {}, descs = {};
      const read = () => { const out = {}; fields.forEach(f => { const i = inputs[f.name]; out[f.name] = f.type === 'check' ? i.checked : f.type === 'number' ? parseInt(i.value || '0', 10) : f.type === 'multi' ? Array.from(i.selectedOptions).map(o => o.value) : i.value; }); return out; };
      // f.when(値) が偽の項目は隠す（値は既定のまま返す）。f.desc(値) は選んだ内容の説明を項目の下に出す。選択肢が「使わない」だけの生命核欄は出さない
      const refresh = () => { const v = read(); fields.forEach(f => { const trivial = f.name === 'useL' && f.type === 'select' && f.options.length <= 1; rows[f.name].style.display = trivial || (f.when && !f.when(v)) ? 'none' : ''; if (f.desc) descs[f.name].textContent = f.desc(v) || ''; }); };
      fields.forEach(f => {
        const row = h('label', { class: 'frow' }, h('span', null, f.label)); let inp;
        if (f.type === 'select') { inp = h('select', { name: f.name }); f.options.forEach(o => inp.appendChild(h('option', { value: o.value, selected: o.value === f.value, disabled: !!o.disabled }, o.label))); }
        else if (f.type === 'number') inp = h('input', { type: 'number', name: f.name, min: f.min ?? 0, max: f.max ?? 99, value: f.value ?? 0 });
        else if (f.type === 'check') inp = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
        else if (f.type === 'multi') { inp = h('select', { name: f.name, multiple: true, size: Math.min(8, Math.max(2, f.options.length)) }); f.options.forEach(o => inp.appendChild(h('option', { value: o.value }, o.label))); }
        else inp = h('input', { type: 'text', name: f.name, value: f.value || '' });
        inputs[f.name] = inp; row.appendChild(inp); if (f.hint) row.appendChild(h('small', null, f.hint)); if (f.desc) { descs[f.name] = h('small', { class: 'desc' }); row.appendChild(descs[f.name]); }
        rows[f.name] = row; form.appendChild(row); inp.addEventListener('change', refresh); inp.addEventListener('input', refresh);
      });
      refresh();
      const btns = h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, opts.okLabel || '実行'));
      if (opts.skipLabel) btns.appendChild(h('button', { type: 'button', onclick: () => { back.classList.remove('open'); resolve({ __skip: true }); } }, opts.skipLabel));
      if (!opts.noCancel) btns.appendChild(h('button', { type: 'button', onclick: () => { back.classList.remove('open'); resolve(null); } }, 'キャンセル'));
      form.appendChild(btns);
      form.addEventListener('submit', ev => { ev.preventDefault(); const out = read(); back.classList.remove('open'); resolve(out); });
      back.appendChild(form); back.classList.add('open'); const first = form.querySelector('select,input,button'); if (first) first.focus();
    });
  }
  function toast(msg, isErr) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 3000); }
  const lOpts = (p, res) => Array.from({ length: p.L + 1 }, (_, i) => ({ value: i, label: i === 0 ? '使わない' : `L${i}（=${res || 'E'}${i * (p.lValue || G.sc(st, 3))}）` }));
  const resSel = (name, label, value) => ({ type: 'select', name, label, value: value || 'E', options: [{ value: 'E', label: 'E' }, { value: 'G', label: 'G' }, { value: 'P', label: 'P' }] });
  // 選択中の形質の効果（先着なら強・後続なら弱）を項目の下に表示する
  const traitDesc = (p, name) => (v) => { const t = v[name]; if (!t || !G.TRAITS[t]) return ''; const c = G.traitCost(st, p, t); return `${c.strong ? '強' : '弱'}：${rtxt(G.traitText(st, t, c.strong))}`; }; // 2026-11-05 v3.63：弱は数値セットの文言（T10 weak2）を G.traitText で
  const traitSel = (p, name, label, filter) => ({ type: 'select', name, label, options: G.traitPool(st).filter(t => !G.trait(p, t) && (!filter || filter(t))).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（G${G.traitCost(st, p, t).G}）` })), desc: traitDesc(p, name) });
  // sel＝形質を選ぶ項目名。指定時はその項目で IM／DA を選んだときだけ表示する
  const selVal = (sel, v) => typeof sel === 'function' ? sel(v) : v[sel]; // sel＝項目名、または値を取り出す関数（traitPickSel の 'ID:S' から ID を取る等）
  const imSel = (sel) => Object.assign(resSel('res', '代謝亢進(IM)の資源'), sel ? { when: v => selVal(sel, v) === 'IM' } : {});
  const daSel = (sel) => Object.assign({ type: 'select', name: 'track', label: '適応効率(DA)のトラック', options: G.TRACKS.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }, sel ? { when: v => selVal(sel, v) === 'DA' } : {});
  // 割引付きの形質購入（遺伝子図書館・知性Lv3★の割引報酬）：traitChoice の数値セットでは強／弱を選べる（値＝'ID:S'／'ID:W'・表示は割引後の G）。2026-11-08 ユーザー指摘「遺伝子図書館で強弱を選べない」
  const traitPickSel = (p, disc) => {
    const choice = G.RULESETS[st.rules || 'v1'].traitChoice; const opts = [];
    G.traitPool(st).filter(t => !G.trait(p, t)).forEach(t => {
      const s = G.traitCost(st, p, t, disc);
      const gp = (c, weak) => { if (!disc || typeof disc !== 'number') return `G${c.G}`; const b = G.traitCost(st, p, t, 0, weak); return b.G > c.G ? `G${c.G}＝定価 G${b.G}−${b.G - c.G}` : `G${c.G}`; }; // 2026-11-09 v3.87（ユーザー指摘）：割引後の値段だと分かるように定価と割引を並べる（遺伝子図書館・報酬の割引）
      if (!choice) { opts.push({ value: t + ':' + (s.strong ? 'S' : 'W'), label: `${t} ${G.TRAITS[t].name}（${s.strong ? '強' : '弱'}・${gp(s)}）` }); return; }
      const w = G.traitCost(st, p, t, disc, true);
      if (s.strong) opts.push({ value: t + ':S', label: `${t} ${G.TRAITS[t].name} 強（${gp(s)}）` });
      opts.push({ value: t + ':W', label: `${t} ${G.TRAITS[t].name} 弱（${gp(w, true)}）` });
    });
    return { type: 'select', name: 'pick', label: '形質', options: opts, desc: (v) => { if (!v.pick) return ''; const [t, ver] = v.pick.split(':'); return `${ver === 'S' ? '強' : '弱'}：${rtxt(G.traitText(st, t, ver === 'S'))}`; } };
  };
  const pickId = (v) => (v.pick || '').split(':')[0];
  const pickArgs = (r) => { const [t, ver] = r.pick.split(':'); return { trait: t, weak: !!G.RULESETS[st.rules || 'v1'].traitChoice && ver === 'W' }; };

  // ---------- 画面：入口 ----------
  function render() {
    renderHeader();
    const root = $('#app'); root.innerHTML = '';
    setTimeout(scheduleBot, 0);
    if (!game) { root.appendChild(renderEntry()); return; }
    if (!st) { root.appendChild(h('div', { class: 'setup' }, '読み込み中…')); return; }
    if (st.phase === 'setup') { root.appendChild(renderSetup()); return; }
    if (st.phase === 'end') { root.appendChild(renderResult()); root.appendChild(renderLog()); return; }
    renderPlay(root);
  }

  function renderEntry() {
    const box = h('div', { class: 'setup' }, h('h2', null, 'game01 デジタルモック'));
    box.appendChild(h('p', { class: 'note' }, '1台で遊ぶ（パス＆プレイ・1人で複数人を回す検証も可）か、各自の端末から同じ卓に参加する（オンライン）かを選びます。'));
    box.appendChild(h('p', { class: 'note' }, '画面の配色：', themeToggle(), '　白（ライト）／黒（ダーク）。この端末に記憶され、ゲーム中もヘッダ右端で切り替えられます。'));
    box.appendChild(metaForm('ローカル（この端末だけ・パス＆プレイ）', '開始', async (meta) => { game = { kind: 'local', meta, entries: [] }; rebuildState(); autosave(); render(); }));
    const on = h('div', { class: 'sec' }, h('h3', null, 'オンライン（各自の端末から参加）'));
    if (!Net.init()) on.appendChild(h('p', { class: 'warn' }, Net.error + '。手順は README を参照。'));
    else {
      on.appendChild(metaForm('新しいルームを作る', 'ルーム作成', async (meta) => { try { const code = await Net.createRoom(meta); game = { kind: 'online', code }; bindNet(); toast('ルーム ' + code + ' を作成'); } catch (e) { toast(e.message, true); } }));
      const jf = h('form', { class: 'sec' }, h('label', { class: 'frow' }, h('span', null, 'ルームコード'), h('input', { type: 'text', name: 'code', placeholder: '例 ABC12', value: (localStorage.getItem('g01_room') || '') })), h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, '参加')));
      jf.querySelector('.mbtns').appendChild(h('button', { type: 'button', title: 'テストで作ったルームを消す（コードを知っていれば誰でも）', onclick: async () => { const code = new FormData(jf).get('code'); if (!confirm(`ルーム ${code} を削除しますか？（元に戻せません）`)) return; try { await Net.deleteRoom(code); toast('ルーム ' + code.toUpperCase() + ' を削除'); } catch (e) { toast(e.message, true); } } }, 'ルーム削除'));
      jf.addEventListener('submit', async ev => { ev.preventDefault(); try { const code = await Net.join(new FormData(jf).get('code')); game = { kind: 'online', code }; bindNet(); } catch (e) { toast(e.message, true); } });
      on.appendChild(jf);
    }
    box.appendChild(on);
    box.appendChild(h('div', { class: 'mbtns' }, h('button', { onclick: loadSave }, 'ローカルの保存データを読み込む'), h('button', { onclick: importJson }, 'JSONをインポート')));
    return box;
  }
  function metaForm(title, okLabel, onOk) {
    const form = h('form', { class: 'sec' }, h('h3', null, title));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '人数'), h('select', { name: 'n' }, h('option', { value: 3 }, '3人'), h('option', { value: 4, selected: true }, '4人'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'セットアップ'), h('select', { name: 'mode' }, h('option', { value: 'beginner' }, '初心者（器官の場を固定）'), h('option', { value: 'expert' }, '熟練者（器官の場を抽選）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'ルール数値'), h('select', { name: 'rules' }, h('option', { value: 'v1' }, '現行（進行2/3/5/8E・E収入3・宝石×10）'), h('option', { value: 't1' }, '仮値セットT1（進行3/5/8/13E・E収入2・宝石＝係数×2・形質協調3点・器官2点・体制15点・試作）'), h('option', { value: 't2' }, '仮値セットT2（基礎収入なし・進行3/5/8/13E・得点＝宝石×係数×2＋形質×宝石色数＋器官×協調＋体制15・係数ゲージ・形質買い替えなし・器官1R1人・代替払いなし・大量消費12/繁殖20,35・拡張x1込み・試作）'), h('option', { value: 't3' }, '仮値セットT3（T2＋トラックは収集物で自動進行〔Eでの進行も自由〕：緑＝器官3/6/9/12・青＝形質2/4/6/8・白＝協調2/4/6/8・赤＝P投入1/2/3/4。器官の場は8系統24枚・1R1人なし。得点＝宝石×係数×2＋体制15・試作）'), h('option', { value: 't4' }, '仮値セットT4（T3の土台を維持しP系コストを現行に戻す・社会トラック報酬から協調を外す・群体E/G＝P6で資源＋協調+1・大量消費(社会)+2・協調ボーナス上限+4・赤ゲート＝繁殖＋大量消費(身体)のみ・身体Lv5★の排他無視は1R1回・器官6系統18枚で各カード1R1人・知性Lv4＝形質-1・ゲート 緑3/6/9/12 青2/4/6/9 白2/4/6/8 赤1/2/3/4・試作）'), h('option', { value: 't5' }, '仮値セットT5（T4＋身体＝生命核軸：収入時に保有L1個につきE+1〔全員〕・身体はLを投入した回数1/2/3/4で上がり報酬はLの質〔利回りの資源選択・L+1・緊急発進の対象拡大・1L=E4/G4・利回り2倍〕・身体の大量消費軽減と排他無視は廃止・試作）'), h('option', { value: 't6' }, '仮値セットT6（T5＋全トラックLv6〔E21で宝石+1・終了時にその色の収集物3個につき祝福+1〕・宝石セット共用〔購入ごとに+5G〕・身体＝Lv2でL+1と結晶化〔L2→祝福〕解放／Lv4で痕跡／Lv4は5投入のうち1回が3個同時／E進行5/8/13/21・利回りR1〜3＝2・R4〜7＝1・繁殖変換はL3でも・協調8到達で係数+1・群れの結晶〔協調3→祝福〕・律動T1生命核版・大量消費(代謝)14・個人カードなし・試作）'), h('option', { value: 't7' }, '仮値セットT7（T6＋器官と形質の役割再編：器官＝代謝/転写/群心/脈動/促進/連結の6系統から4系統・3段階で育つ・4E+1G/6E+2G/9E+3G、形質＝突然変異12種〔群れ本能・長命・結晶体質・擬態・先見・適応放散ほか〕・Gのみ・能力ごとの値段・割引は転写系だけ・4/7枚目で係数+1・試作）'), h('option', { value: 't8' }, '仮値セットT8（T7の資源3倍：初期資源・枠の獲得量・コスト・利回り・大量消費・繁殖P150 等が3倍。協調ボーナス＝＋協調数・群心核＝ボーナス+1・2026-10-22）'), h('option', { value: 't10', selected: true }, '仮値セットT10（T8＋共用盤改訂・弱形質・E進行・知性/代謝Lv4・2026-11-05）'), h('option', { value: 't10s' }, '仮値セットT10・5ラウンド'), h('option', { value: 't11' }, '仮値セットT11（試作：T10 の資源1/3・協調2個ごとに+1・2026-11-05）'), h('option', { value: 't11s' }, '仮値セットT11・5ラウンド（試作）'), h('option', { value: 't8s' }, '仮値セットT8・5ラウンド（T8 と同じ数値で通常4＋神の到来1。試行・2026-10-30）'), h('option', { value: 't9' }, '仮値セットT9（資源1倍：協調は上限12・社会の自動進行 3/6/9/12・ボーナス＝協調3個につき+1・協調9で痕跡・2026-10-24）'))));
    { const rs = form.elements.rules; if (rs && G.RULES_VISIBLE) { G.RULES_VISIBLE.forEach(k => { if (![...rs.options].some(o => o.value === k)) rs.appendChild(h('option', { value: k }, G.RULESETS[k].name)); }); [...rs.options].forEach(o => { if (!G.RULES_VISIBLE.includes(o.value)) o.remove(); }); } } // 2026-11-07 ユーザー指示：T12 の追加と同時に過去の数値セットは画面の選択肢から隠す（?rules= と計測スクリプトからは使える）
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '拡張ルール'), h('select', { name: 'ext' }, h('option', { value: 'none' }, 'なし'), h('option', { value: 'x1' }, 'x1：形質購入2枠（割増＝ラウンド数のE）＋緊急発進の対象に形質＋協調発進（協調トークンで使用済み枠）＋大量消費(社会)協調+3・試作'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '資源スロット'), h('select', { name: 'slots' }, h('option', { value: 'v7' }, '現行（7スロット・各1人）'), h('option', { value: 'm4' }, '統合4（E系／G系／P系／全資源・各1人・試作）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'アンドゥ'), h('select', { name: 'undoMode' }, h('option', { value: 'free' }, '自由（誰でも即時）'), h('option', { value: 'approve' }, '承認（他の参加者全員のOK）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'シード'), h('input', { type: 'number', name: 'seed', value: Math.floor(Math.random() * 100000) })));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'AI の読み'), h('select', { name: 'aiDepth' }, h('option', { value: '1' }, '標準（1手読み＋ラウンドの計画・速い）'), h('option', { value: '2' }, '強い（2手のビーム探索・+10点程度・AI の手番が数秒かかる）')))); // 2026-11-05 v3.64：第53部の 2 手読みを画面で選べるように（URL の ?depth= があればそちらを優先）
    for (let i = 0; i < 4; i++) form.appendChild(h('label', { class: 'frow' }, h('span', null, `P${i + 1} 名前`), h('input', { type: 'text', name: 'name' + i, value: 'P' + (i + 1) }), h('small', null, h('label', { title: '簡易AIが操作（ソロ検証用）' }, h('input', { type: 'checkbox', name: 'bot' + i }), 'AI'))));
    form.appendChild(h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, okLabel)));
    form.addEventListener('submit', ev => { ev.preventDefault(); const fd = new FormData(form); rememberForm(form); const n = +fd.get('n'); const players = []; for (let i = 0; i < n; i++) players.push({ name: fd.get('name' + i) || 'P' + (i + 1), passive: true }); const bots = []; for (let i = 0; i < n; i++) if (fd.get('bot' + i) === 'on') bots.push(i); onOk({ seed: +fd.get('seed'), mode: fd.get('mode'), slots: fd.get('slots') || 'v7', rules: fd.get('rules') || 'v1', ext: fd.get('ext') || 'none', undoMode: fd.get('undoMode'), players, bots, aiDepth: +(fd.get('aiDepth') || 1) }); });
    restoreForm(form);
    return form;
  }
  // 前回の設定値（シード以外）を localStorage に残し、次回のフォームに引き継ぐ
  const META_KEY = 'g01_meta';
  function rememberForm(form) { try { const keep = {}; Array.from(form.elements).forEach(el => { if (el.name && el.name !== 'seed') keep[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); localStorage.setItem(META_KEY, JSON.stringify(keep)); } catch (e) { } }
  function restoreForm(form) {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { }
    if (!saved) { if (form.elements.rules) form.elements.rules.value = 't12'; if (form.elements.mode) form.elements.mode.value = 'expert'; return; } // 初回の既定＝T10・熟練者（2026-11-05 ユーザー指示：T8→T10。保存済みの端末は保存値を優先）
    Array.from(form.elements).forEach(el => { if (!el.name || !(el.name in saved)) return; if (el.type === 'checkbox') el.checked = !!saved[el.name]; else el.value = saved[el.name]; });
    if (form.elements.rules && !form.elements.rules.value && G.RULES_VISIBLE) form.elements.rules.value = G.RULES_VISIBLE[0]; // 保存値が隠したセット（T10 など）なら T12 に
  }
  function bindNet() { Net.onChange = () => { rebuildState(); render(); }; rebuildState(); render(); }

  // ---------- 画面：セットアップ ----------
  function renderSetup() {
    const box = h('div', { class: 'setup' }); const n = st.nPlayers;
    if (isOnline()) box.appendChild(renderSeats());
    if (st.setupStep === 'species') {
      const i = st.setupIdx; const pl = st.players[i];
      box.appendChild(h('h2', null, `種族選択：${pl.name}（${i + 1}/${n}）`));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      const taken = st.players.map(q => q.species);
      Object.keys(G.SPECIES).forEach(id => { const sp = G.speciesInfo(st, id); box.appendChild(h('button', { class: 'bigbtn withart', disabled: taken.includes(id), onclick: () => submit({ type: 'species', pid: i, species: id }) }, art(SPECIES_ART[id], 'portrait'), h('b', null, sp.name), h('em', { class: 'sptype' }, sp.type), h('span', null, `手番順${sp.order}・初期 E${sp.stock.E}/G${sp.stock.G}/P${sp.stock.P}${sp.L ? '/L' + sp.L : ''}`), h('small', { class: 'sphint' }, sp.hint), h('small', null, 'パッシブ：' + sp.passive))); });
    } else if (st.setupStep === 'armTrait') {
      const i = st.setupIdx; const pl = st.players[i];
      box.appendChild(h('h2', null, `${pl.name}（九腕知性体）：初期形質を1枚選択（G${G.RULESETS[st.rules || 'v1'].armTraitMax || 4}以下）`));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      G.armTraitOptions(st).forEach(t => box.appendChild(h('button', { class: 'bigbtn', onclick: () => submit({ type: 'startTrait', pid: i, trait: t }) }, h('b', null, `${t} ${G.TRAITS[t].name}`), h('small', null, rtxt(G.TRAITS[t].strong)))));  // 2026-10-28：{n} を規模に合わせる
    } else if (st.setupStep === 'draft') {
      const order = st.setupOrder; const i = order[st.setupIdx]; const pl = st.players[i]; const need = G.handSize(st);
      box.appendChild(h('h2', null, `個人アクションカードのドラフト：${pl.name}（${need}枚・残り${order.length - st.setupIdx}人）`));
      box.appendChild(h('p', { class: 'note' }, '種族選択の逆順で、必要枚数を一度に選びます。'));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      box.classList.add('wide');
      const chosen = new Set(); const sel = h('div', { class: 'cardgrid' });
      st.shared.cardPool.forEach(c => { const b = h('button', { class: 'cardbtn', onclick: () => { if (chosen.has(c)) { chosen.delete(c); b.classList.remove('sel'); } else if (chosen.size < need) { chosen.add(c); b.classList.add('sel'); } } }, art(c, 'small'), h('b', null, `${c} ${G.CARDS[c].name}`), h('small', null, G.CARDS[c].text)); sel.appendChild(b); });
      const pick = h('div', { class: 'panel' }, h('h3', null, `カードを${need}枚選択`), sel, h('button', { class: 'primary', onclick: () => submit({ type: 'draft', pid: i, cards: Array.from(chosen) }) }, '決定'));
      roMsg = 'ドラフト中（参照のみ）';
      box.appendChild(h('div', { class: 'grid draftgrid' },
        h('div', { class: 'col me' }, renderDraftMe(pl), pick),
        h('div', { class: 'col shared preview' }, renderTracks(pl, false), renderExcl(pl, false), renderShared(pl, false))));
      roMsg = '他プレイヤーの手番';
    }
    return box;
  }
  // ドラフト時の自分の状況（種族・資源・第1ラウンドの収入・手番順）
  function renderDraftMe(p) {
    const sp = G.SPECIES[p.species]; const inc = G.income(p);
    const box = h('div', { class: 'panel player p' + p.id }, h('div', { class: 'phead' }, art(SPECIES_ART[p.species], 'portrait'), h('h3', null, h('span', { class: 'mk p' + p.id }, p.id + 1), ` ${p.name}（${sp.name}）`, h('em', { class: 'sptype' }, sp.type))));
    box.appendChild(h('div', { class: 'res' }, ...['E', 'G', 'P', 'L'].map(k => h('span', { class: 'rbox r' + k, title: RES_JP[k] }, ic(k), h('b', null, String(p[k])), h('small', null, `+${k === 'L' ? 1 : inc[k]}/R`)))));
    box.appendChild(h('div', { class: 'note' }, `第1ラウンド開始時に E+${inc.E} G+${inc.G} P+${inc.P} L+1 を受け取ります`));
    const spi = G.speciesInfo(st, p.species); const st0 = [p.passive ? 'パッシブ：' + spi.passive : 'パッシブ無し'];
    G.TRACKS.forEach(t => { if (p.lv[t] > 1) st0.push(`${G.TRACK_INFO[t].name}Lv${p.lv[t]}`); });
    if (p.coop) st0.push(`協調${p.coop}`);
    if (p.traits.length) st0.push('形質 ' + p.traits.map(t => `${t.id} ${G.TRAITS[t.id].name}`).join('・'));
    box.appendChild(h('div', { class: 'note' }, st0.join('／')));
    box.appendChild(h('div', { class: 'note' }, spi.hint));
    const order = st.players.slice().sort((a, b) => G.SPECIES[b.species].order - G.SPECIES[a.species].order);
    box.appendChild(h('div', { class: 'note' }, '第1ラウンドの手番順：' + order.map(q => `${q.name}（${G.SPECIES[q.species].name}）`).join(' → ')));
    const done = st.players.filter(q => q.cards.length);
    if (done.length) box.appendChild(h('div', { class: 'note' }, '選択済み：' + done.map(q => `${q.name} ${q.cards.join('・')}`).join('／')));
    return box;
  }
  function renderSeats() {
    const box = h('div', { class: 'sec seats' }, h('h3', null, `ルーム ${game.code}　参加端末：${Net.seatUids().length}`));
    st.players.forEach((p, i) => {
      const s = Net.seats[i]; const isMe = s && s.uid === Net.uid;
      box.appendChild(h('div', { class: 'seat' }, h('span', { class: 'mk p' + i }, i + 1), ` ${p.name}：`, s ? (isMe ? '自分' : `他端末`) : '空席', ' ',
        !s ? h('button', { onclick: async () => { try { await Net.claimSeat(i, p.name); } catch (e) { toast(e.message, true); } } }, '着席') : isMe ? h('button', { onclick: () => Net.releaseSeat(i) }, '離席') : null));
    });
    box.appendChild(h('p', { class: 'note' }, '1人で複数席に着席すれば、1台で複数人分を回せます（検証用）。URLに ?room=コード を付けると直接参加できます。'));
    return box;
  }

  // ---------- 画面：プレイ ----------
  function renderPlay(root) {
    const p = G.cur(st); const can = mine(p.id);
    if (st.pendingUndo) root.appendChild(renderUndoBanner());
    const un = renderUndoNotice(); if (un) { root.appendChild(un); if (renderUndoNotice._toasted !== st.undoInfo.key) { renderUndoNotice._toasted = st.undoInfo.key; toast('あなたの行動が巻き戻されました', true); } }
    const grid = h('div', { class: 'grid' + (can ? '' : ' ro') });
    const tabs = h('div', { class: 'tabs' }, h('button', { class: tab === 'organ' ? 'on' : '', onclick: () => { tab = 'organ'; render(); } }, '器官の場'), h('button', { class: tab === 'trait' ? 'on' : '', onclick: () => { tab = 'trait'; render(); } }, '形質プール'));
    grid.appendChild(h('div', { class: 'col shared' }, renderTracks(p, can), renderExcl(p, can), renderShared(p, can), tabs, tab === 'organ' ? renderOrganField(p, can) : renderTraitPool(p, can)));
    grid.appendChild(h('div', { class: 'col me' }, renderPlayer(p, can), isOnline() ? renderSeatsMini() : null, renderOthers(p), renderLog()));
    root.appendChild(grid);
    const pend = p.pending[0];
    if (pend && can) handlePending(p, pend);
  }
  function renderHeader() {
    const hd = $('#hdr'); hd.innerHTML = '';
    hd.appendChild(h('a', { href: '../guide/', target: '_blank', rel: 'noopener', class: 'rulelink' }, 'ルール')); // 2026-10-28：「game01 モック」の表記は不要（1行に収める）
    if (!st || st.phase !== 'play') { if (game && isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code)); if (st && st.phase === 'end') hd.appendChild(h('span', { class: 'hbtns' }, h('button', { onclick: exportJson }, '保存(JSON)'), h('button', { onclick: exportCsv }, 'ログCSV'))); if (game) hd.appendChild(h('span', { class: 'hbtns' }, h('button', { onclick: quit }, '退出／新規'), game && isOnline() ? h('button', { onclick: deleteThisRoom }, 'ルーム削除') : null)); hd.appendChild(h('span', { class: 'hmenuwrap' }, h('small', { class: 'ver' }, 'v' + (G.VERSION || '')), themeToggle())); return; }
    hd.appendChild(h('span', { class: 'pill' }, `ラウンド ${st.round}/${G.RULESETS[st.rules || 'v1'].rounds || G.ROUNDS}`));
    if (isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code));
    // 版の小文字＋ボタン群の開閉「≡」は1行目の右端（2026-10-28 ユーザー要望：1行を占有させない）
    hd.appendChild(h('span', { class: 'hmenuwrap' }, h('small', { class: 'ver' }, 'v' + (G.VERSION || '')), themeToggle(), h('button', { class: 'hmenu', title: 'ボタン（戻す・保存・ログ・退出など）の表示／非表示', onclick: () => { menuOpen = !menuOpen; try { localStorage.setItem(MENU_KEY, menuOpen ? '1' : '0'); } catch (e) { } render(); } }, menuOpen ? '×' : '≡')));
    const to = h('span', { class: 'order' }, '手番順：');
    st.turnOrder.forEach((pid, i) => { const q = st.players[pid]; to.appendChild(h('span', { class: 'chip' + (i === st.cur ? ' now' : '') + (q.left.W + q.left.AT === 0 ? ' done' : '') }, h('span', { class: 'mk p' + q.id }, q.id + 1), `${q.name} ${leftTxt(q)}`)); });
    hd.appendChild(to);
    // 自分の資源（毎手番見るのでヘッダに常時表示）：この端末の人間席ごとに E/G/P/L/協調＋次の収入
    const hres = h('span', { class: 'hres' });
    myHumanPids().forEach(pid => { const q = st.players[pid]; const inc = G.income(q); const row = h('span', { class: 'hresp' }, h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1));
      ['E', 'G', 'P', 'L', 'coop'].forEach(k => row.appendChild(h('span', { class: 'hrb r' + k, title: k === 'coop' ? '協調' : RES_JP[k] + (k !== 'L' ? '　次の収入 +' + inc[k] : '　毎ラウンド+1') }, ic(k), h('b', null, String(q[k])), (k === 'L' || k === 'coop') ? null : h('small', null, `+${inc[k]}`))));
      // 2026-11-04 ユーザー要望：収集物（器官・形質・協調・L投入）の数と、次のゲート（Lv）までの不足数をヘッダに常時表示
      { const R = G.RULESETS[st.rules || 'v1']; const bodyL = R.bodyAxis === 'L';
        const items = [['metab', 'organ', q.organs.length, '器官'], ['intel', 'trait', q.traits.length, '形質'], ['social', null, null, '協調'], ['body', bodyL ? 'L' : 'P', bodyL ? (q.lInvested || 0) : (R.pInvKinds === 'bodyOnly' ? (q.pInvBody || 0) : (q.pInv || 0)), '投入']];
        items.forEach(([track, icon, n, label]) => { const gr = R.gates ? G.gateReq(q, track) : null; const gap = gr ? Math.max(0, gr.need - gr.have) : null; const nextLv = q.lv[track] + 1;
          const tip = `${label}（${G.TRACK_INFO[track].name}の素材）` + (gr ? `　次の Lv${nextLv} まで あと${gap}（必要${gr.need}・数えた分${gr.have}）` : `　Lv5 まで到達済み（臨界なし）`);
          if (track === 'social') { const el = row.querySelector('.hrb.rcoop'); if (el && gr) el.appendChild(h('small', { class: 'gap', title: tip }, `あと${gap}`)); return; }
          row.appendChild(h('span', { class: 'hrb rcol', title: tip }, icon ? ic(icon) : null, icon === 'L' || icon === 'P' ? h('small', null, '投入') : null, h('b', null, String(n)), gr ? h('small', { class: 'gap' }, `あと${gap}`) : h('small', null, '到達'))); }); }
      { const n6 = G.lv6Preview(st, q); if (q.lv && G.TRACKS.some(t => q.lv[t] >= 6)) row.appendChild(h('span', { class: 'hrb rconv', title: '神の裁定の見込み：Lv6 に達したトラックの素材3個につき祝福+1（身体＝払ったL・知性＝形質・社会＝協調・代謝＝器官）' }, h('small', null, '終了時'), h('b', null, '祝福+' + n6))); } // 案B：Lv6 の終了時換算を見える化
      hres.appendChild(row); });
    if (hres.childNodes.length) hd.appendChild(hres);
    const btns = h('span', { class: 'hbtns menu' + (menuOpen ? '' : ' hidden') });
    btns.appendChild(h('button', { title: '自分の直前の行動まで戻す（間にあるAI・他プレイヤーの行動も取り消される）', onclick: () => submit({ type: 'undo', pids: myHumanPids() }) }, '1手戻す'));
    btns.appendChild(h('button', { title: 'このラウンドの頭（収入直後）まで戻す', onclick: () => { if (confirm('ラウンドの頭まで戻しますか？')) submit({ type: 'undoRound' }); } }, 'ラウンド頭へ'));
    btns.appendChild(h('button', { onclick: () => { logOpen = !logOpen; render(); } }, logOpen ? 'ログを隠す' : 'ログ'));
    btns.appendChild(h('button', { onclick: exportJson }, '保存(JSON)'));
    btns.appendChild(h('button', { onclick: exportCsv }, 'ログCSV'));
    btns.appendChild(h('button', { title: '検証用：手番プレイヤーの資源を書き換える（ログに残ります）', onclick: debugPanel }, 'デバッグ'));
    btns.appendChild(h('button', { onclick: quit }, '退出／新規'));
    if (isOnline()) btns.appendChild(h('button', { title: 'このルームをサーバから削除して入口に戻る', onclick: deleteThisRoom }, 'ルーム削除'));
    hd.appendChild(btns);
    const curPid = G.cur(st).id;
    if (renderHeader._last !== undefined && renderHeader._last !== curPid) { toast(`${G.cur(st).name} の手番`); }
    renderHeader._last = curPid;
  }
  async function debugPanel() {
    if (!st || st.phase !== 'play') return; const p = G.cur(st);
    const r = await ask(`デバッグ：${p.name} の資源を設定`, [{ type: 'number', name: 'E', label: 'E', value: p.E, min: 0, max: 999 }, { type: 'number', name: 'G', label: 'G', value: p.G, min: 0, max: 999 }, { type: 'number', name: 'P', label: 'P', value: p.P, min: 0, max: 999 }, { type: 'number', name: 'L', label: 'L', value: p.L, min: 0, max: 7 }, { type: 'number', name: 'coop', label: '協調', value: p.coop, min: 0, max: 8 }], { note: 'テスト専用。ログに「[DEBUG]」として記録されます。' }); if (!r) return;
    submit({ pid: p.id, type: 'cheat', E: r.E, G: r.G, P: r.P, L: r.L, coop: r.coop });
  }
  function quit() { if (!confirm('この画面を閉じて入口に戻りますか？（ローカルの進行は自動保存されています）')) return; if (isOnline()) Net.leave(); game = null; st = null; render(); }
  async function deleteThisRoom() { if (!isOnline() || !confirm(`ルーム ${game.code} を削除しますか？（全員の進行が消えます・元に戻せません）`)) return; try { await Net.deleteRoom(game.code); game = null; st = null; toast('ルームを削除しました'); render(); } catch (e) { toast(e.message, true); } }
  function renderUndoBanner() {
    const u = st.pendingUndo; const isMine = u.uid === Net.uid; const oks = Net.oksFor(u.id);
    return h('div', { class: 'banner' }, `アンドゥ要求（${u.type === 'undo' ? '1手' : 'ラウンド頭'}）が承認待ち：承認 ${oks.length}/${Net.otherUids(u.uid).length}　`,
      !isMine && !oks.includes(Net.uid) ? h('button', { class: 'primary', onclick: () => submit({ type: 'undoOk', target: u.id }) }, '承認する') : null,
      isMine ? h('button', { onclick: () => submit({ type: 'undoCancel', target: u.id }) }, '取り下げる') : null);
  }
  function renderResult() {
    const box = h('div', { class: 'result' }, h('h2', null, '最終結果'));
    const RR = G.RULESETS[st.rules || 'v1']; const showDev = !!RR.devPt || RR.scoreMode === 'mult', showOrg = !!RR.organPt || RR.scoreMode === 'mult', showReg = !RR.noRegime && !!RR.regimePt; // 0 点の列は出さない
    const tb = h('table', null, h('tr', null, ...['順位', '名前', '合計', '痕跡', '祝福', RR.coef2 ? '繁栄度/成熟度' : '係数', '痕跡・祝福点', showDev ? '発展度' : null, showOrg ? '器官' : null, showReg ? '体制' : null].filter(Boolean).map(x => h('th', null, x))));
    st.result.forEach((r, i) => tb.appendChild(h('tr', null, ...[i + 1, r.name, r.total, r.real, r.vg, r.coef2 ? `×${r.cfB}/×${r.cfC}` : '×' + r.cf, r.core, showDev ? r.dev : null, showOrg ? (r.org || 0) : null, showReg ? r.reg : null].filter(x => x !== null).map(x => h('td', null, String(x))))));
    box.appendChild(tb);
    if (st.hist && st.hist.length) {
      const hb = h('div', { class: 'hist' }, h('h3', null, 'ラウンド推移（各ラウンド開始時の得点）'));
      const t2 = h('table', null, h('tr', null, h('th', null, 'R'), ...st.players.map(p => h('th', null, p.name))));
      st.hist.forEach(hh => t2.appendChild(h('tr', null, h('td', null, hh.label || ('R' + hh.round)), ...hh.rows.map(r => h('td', { title: `E${r.E} G${r.G} P${r.P}｜Lv${r.lv}｜痕跡${r.gems}＋祝福${r.vg}｜×${r.coef}` }, String(r.score))))));
      hb.appendChild(t2); hb.appendChild(chart(st.hist)); box.appendChild(hb);
    }
    return box;
  }
  function chart(hist) {
    const W = 720, H = 220, L = 40, B = 24; const svgNS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('class', 'chart'); s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const max = Math.max(50, ...hist.flatMap(hh => hh.rows.map(r => r.score))); const n = hist.length;
    const x = i => L + (W - L - 10) * (n > 1 ? i / (n - 1) : 0), y = v => H - B - (H - B - 10) * v / max;
    const colors = ['#e4b400', darkTheme() ? '#d0d4dc' : '#333', '#8e44ad', '#e67e22']; const gridLine = darkTheme() ? '#444' : '#eee';
    [0, 0.5, 1].forEach(f => { const ln = document.createElementNS(svgNS, 'line'); ln.setAttribute('x1', L); ln.setAttribute('x2', W - 10); ln.setAttribute('y1', y(max * f)); ln.setAttribute('y2', y(max * f)); ln.setAttribute('stroke', gridLine); s.appendChild(ln); const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', 2); tx.setAttribute('y', y(max * f) + 4); tx.setAttribute('font-size', '10'); tx.textContent = Math.round(max * f); s.appendChild(tx); });
    st.players.forEach((p, pi) => { const pl = document.createElementNS(svgNS, 'polyline'); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', colors[pi]); pl.setAttribute('stroke-width', '2'); pl.setAttribute('points', hist.map((hh, i) => `${x(i)},${y(hh.rows[pi].score)}`).join(' ')); s.appendChild(pl); const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', x(n - 1) - 30); tx.setAttribute('y', y(hist[n - 1].rows[pi].score) - 4); tx.setAttribute('font-size', '10'); tx.setAttribute('fill', colors[pi]); tx.textContent = p.name; s.appendChild(tx); });
    hist.forEach((hh, i) => { const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', x(i) - 6); tx.setAttribute('y', H - 8); tx.setAttribute('font-size', '10'); tx.textContent = hh.label || 'R' + hh.round; s.appendChild(tx); });
    return s;
  }

  // 事前判定：実行できるか（できなければ理由）
  function check(action) { try { G.tryApply(st, action); return null; } catch (e) { return e.message; } }
  function actBtn(attrs, reason, ...kids) { const b = h('button', attrs, ...kids); if (reason) { b.classList.add('na'); b.title = (b.title ? b.title + '\n' : '') + '× ' + reason; if (reason !== roMsg && !/の手番$/.test(reason)) b.addEventListener('click', () => toast('× ' + reason, true), true); } return b; } // 2026-11-06 ユーザー指摘（T10-H3）：スマホではツールチップが見えず「暗いだけで理由が分からない」→ v3.69 で枠内に常時表示 → 2026-11-07 ユーザー指摘「選択したときに見えればよい。常時は邪魔」：押したときにトーストで出す（押した後の処理〔緊急発進のダイアログ等〕はそのまま続く）

  // T4：社会トラック報酬から協調を外す（P／Wなし実行権）・知性Lv4＝形質-1
  const REW_SHORT_T4 = { social: { 2: 'P+{6}', 3: ['自由行動+1', 'P+{10}'], 4: '自由行動+1', 5: ['自由行動+2', '自由行動+1'] }, intel: { 4: '形質-{1}（恒久）' } };
  const REW_SHORT_T5_BODY = { 2: '産出 E/G選択', 3: ['L+1 緊急進出の対象拡大', 'L+1'], 4: '1L=E4/G4 産出P可', 5: ['産出×2 L+1', 'L+1'] };
  // 2026-10-28：短文は数値セットのフラグから組み立て、{n} で規模（T8＝×3）に合わせる（ツールチップの正本 G.trackRewardText と同じ内容）
  const REW_SHORT_T7_BODY = { 2: 'L+1 献上(生命核)解放', 3: ['1L=E{4}/G{4} L+1', '1L=E{4}/G{4}'], 4: '痕跡+1 産出×2', 5: ['1L=E{5}/G{5} L+1', 'L+1'] };
  const REW_SHORT_T7_INTEL = { 2: 'G+{3}', 3: ['模倣/発現を今すぐG0', '模倣/発現 G-{1}'], 4: '献上(遺伝子)何度でも', 5: ['常に強効果', 'G+{6}'] };
  function rewShort(t, l) { const R = G.RULESETS[st.rules || 'v1']; if (l === 6) return R.lv6First ? ['痕跡+1 祝福+1' + (R.lv6Convert ? ' ＋神の裁定' : ''), '痕跡+1' + (R.lv6Convert ? ' ＋神の裁定' : '')] : (R.lv6Convert ? '痕跡+1 ＋神の裁定' : '痕跡+1');
    if (R.bodyAxis === 'L' && t === 'body' && R.bodyRewards === 'P') { const b = Object.assign({}, REW_SHORT_T7_BODY); if (!(R.lCrystal && (R.lCrystalLv || 4) === 2)) b[2] = 'L+1'; if (!R.bodyLv4Gem) b[4] = '産出×2'; return b[l]; }
    if (R.bodyAxis === 'L' && t === 'body') { const b = { 2: ['産出 E/G選択', R.body2L ? 'L+1' : null, R.lCrystal && (R.lCrystalLv || 4) === 2 ? '結晶化解放' : null].filter(Boolean).join(' '), 4: [R.bodyLv4Gem ? '痕跡+1' : null, '1L=E4/G4 産出P可'].filter(Boolean).join(' '), 5: R.body5Coef ? ['係数+1 L+1', 'L+1'] : REW_SHORT_T5_BODY[5] }; return b[l] || REW_SHORT_T5_BODY[l] || REW_SHORT[t][l]; }
    if (R.intelRewards === 'learn' && t === 'intel' && REW_SHORT_T7_INTEL[l]) return REW_SHORT_T7_INTEL[l];
    if (R.intelRewards === 'trait' && t === 'intel' && REW_SHORT_T10_INTEL[l]) return REW_SHORT_T10_INTEL[l]; if (R.metab4 === 'special' && t === 'metab' && l === 4) return '特殊器官 1 枚'; if (R.metab4 === 'organNoG' && t === 'metab' && l === 4) return '器官のG・追随の代償なし'; // T10
    if (R.socialRewards === 'shield' && t === 'social') return REW_SHORT_T4.social[l] || REW_SHORT[t][l]; if (R.intel4 === 'traitDisc' && t === 'intel' && l === 4) return REW_SHORT_T4.intel[4]; return REW_SHORT[t][l]; }
  const REW_SHORT_T10_INTEL = { 2: 'G+{3}', 3: ['今すぐ形質 弱なら無料', '次の形質 -{3}G'], 4: '形質3枚ごと祝福+1', 5: ['常に強効果', 'G+{6}'] }; // T10（第58〜59部）// 2026-11-05：{n} で規模に合わせる（旧 'G+3' は T10 で G+9 なのに G+3 と表示・-9G／G+18 は T11〔×1〕で合わない）
  const REW_SHORT = {
    body:   { 2: 'P+8', 3: ['淘汰×1無料', 'P+15'], 4: '淘汰-5', 5: ['淘汰 排他無視+-5', '淘汰-5'] },
    intel:  { 2: 'G+3', 3: ['形質1枚 G-3', 'G+1/R'], 4: '追加行動×1 E半額', 5: ['形質-2・常に強', 'G+6'] },
    social: { 2: '協調+1', 3: ['協調+2', '協調+1 G+3'], 4: '自由行動+1', 5: ['協調+1 自由行動+2', '協調+1 自由行動+1'] },
    metab:  { 2: 'E収入+{1}', 3: ['E・G収入+{1}', 'E+{8}'], 4: 'E↔G無料変換', 5: ['収入全種+{2}', '収入全種+{1}'] },
  };
  let roMsg = '他プレイヤーの手番'; // 操作できないときの理由表示（ドラフト中の参照表示で差し替え）
  // 数値セットで変わる軽減値を表示文に反映（静的な説明文の -5／-6P／-8P／15/25 を差し替える）
  // 器官の効果文（倍化版の群心核は strongB/weakB を使う）
  const otxt = (o, strong) => { const R = G.RULESETS[st.rules || 'v1']; if (typeof o === 'string') o = G.organDef(st, o); const s = strong ? (R.hc3Bonus && o.strongB ? o.strongB : o.strong) : (R.hc3Bonus && o.weakB ? o.weakB : o.weak); return rtxt(s); }; // o＝定義 or 器官ID（T13 の第2版の効果文は organDef で差し替え）
  const chgBadge = () => null; // T13：変えた部分の目印（次の数値セットでは changed を外す）
  function rtxt(s) {
    if (!s) return s; const R = G.RULESETS[st.rules || 'v1']; s = G.txt(st, s);
    s = String(s).replace(/(大量消費|淘汰)-5/g, (m, w) => w + '-' + R.massDiscLv).replace(/排他無視\+-5/g, '排他無視+-' + R.massDiscLv).replace(/-6P/g, '-' + R.mcDisc + 'P').replace(/-8P/g, '-' + R.mbDisc + 'P');
    // 2026-11-04 ユーザー指摘：消費軽減（MC）は大量消費(代謝)には効かない（数値セットに mmCost があると代謝のコストは固定値＝軽減後の値より低い）。説明文に明記する
    // 2026-11-04 v3.59：消費軽減（MC）の既定文は freeOnce（強＝1回無料・弱＝恒久）。mcMode の無い数値セット（T7 以前）は旧文（強 恒久 −mcDisc・弱 1回 −mcDisc）に戻す
    if (R.mcMode !== 'freeOnce') { s = s.replace(/^淘汰コスト-\d+P（恒久）$/, `次の淘汰1回だけ-${R.mcDisc}P`).replace(/^次の淘汰1回を無料（コスト0）$/, `淘汰コスト-${R.mcDisc}P（恒久）`); } // 弱→強の順（強の変換結果を弱の正規表現が拾わないように）
    if (R.mmCost && !R.mcAfterCap && /^(淘汰コスト|次の淘汰1回だけ)-/.test(s)) s += '（代謝は対象外）'; // 固定コストが先の数値セットでは代謝に効かない
    return s;
  }
  function renderTracks(p, can) {
    const box = h('div', { class: 'panel tracksp' }, h('h3', null, '進化トラック', h('small', { class: 'sub' }, G.RULESETS[st.rules || 'v1'].gates ? '　素材（器官・形質・協調・投入）が矢印の数に達すると自動で上がる。Eでの進化（点線をクリック）も自由。★＝痕跡・先駆は強い報酬' : '　次の段（点線）をクリックで進化（ワーカー必須・排他なし）。★＝痕跡・先駆は強い報酬')));
    const lanes = h('div', { class: 'lanes' }); box.appendChild(lanes); // レーンだけ横スクロール（スマホ）
    G.TRACKS.forEach(t => {
      const info = G.TRACK_INFO[t]; const nxt = p.lv[t] + 1;
      const reason = can ? check({ pid: p.id, type: 'track', track: t, pay: 'E', useL: Math.min(p.L, 3) }) : roMsg;
      const lane = h('div', { class: 'lane lane-' + info.color });
      lane.appendChild(h('div', { class: 'lane-lbl' }, h('b', null, info.name), h('small', null, `素材：${G.gateLabel(st, t)}`)));
      const body = h('div', { class: 'lane-body' });
      const RS0 = G.RULESETS[st.rules || 'v1']; const maxLv = RS0.maxLv || 5;
      for (let l = 1; l <= maxLv; l++) {
        if (l > 1) { const RSx = RS0; const stepArr = ((t === 'body' && RSx.bodyStep) ? RSx.bodyStep : RSx.step).slice(); if (RSx.lv6E) stepArr[5] = RSx.lv6E; const gq0 = RSx.gates && RSx.gates[t][l] !== undefined; body.appendChild(h('div', { class: 'conn' }, h('span', null, '▶'), h('small', null, l === 6 && G.lv6CostText(st, t) ? G.lv6CostText(st, t) : `${stepArr[l - 1]}E`), gq0 ? h('small', { class: 'gate', title: `${G.gateLabel(st, t)}が${RSx.gates[t][l]}に達するとLv${l}へ自動で上がる${G.gateNote(st, t, l)}（Eを払って先に上がることもできる）` }, `${G.gateShort(st, t)}${RSx.gates[t][l]}${G.gateNote(st, t, l) ? '*' : ''}`) : (l === 6 ? (G.lv6CostText(st, t) ? h('small', { class: 'gate', title: `Lv6はそのトラックの資源（${G.lv6CostText(st, t)}）で払う（自動進化なし・先駆は痕跡+1と祝福+1）` }, 'トラックの資源') : h('small', { class: 'gate', title: 'Lv6はEでのみ上がる（自動進化なし・先駆なし）' }, 'Eのみ')) : null))); }
        const isNext = l === nxt; const cost = isNext ? G.stepCost(p, t) : null; const r0 = rewShort(t, l); const r = Array.isArray(r0) ? r0.map(rtxt) : rtxt(r0);
        const gq = G.RULESETS[st.rules || 'v1'].gates && l === nxt ? G.gateReq(p, t) : null;
        const node = h('div', { class: 'node' + (isNext ? ' next' : '') + (isNext && reason ? ' na' : '') + (l === 3 || l === 5 ? ' star' : ''), title: `Lv${l}：${rtxt(G.trackRewardText(st, t, l)) || '開始'}${isNext ? `\nコスト ${l === 6 && G.lv6CostText(st, t) ? G.lv6CostText(st, t) + '（そのトラックの資源で払う）' : 'E' + cost + (t === 'body' ? '／P' + cost * 3 : t === 'intel' ? '／G' + cost : '')}` : ''}${gq ? `\n${G.gateLabel(st, t)}が${gq.need}に達すると自動で上がる（現在${gq.have}）` : ''}${isNext && reason ? '\n× ' + reason : ''}`, onclick: isNext && can ? () => onTrack(p, t) : null });
        node.appendChild(h('div', { class: 'node-lv' }, `Lv${l}`, (l === 3 || l === 5 || l === 6) ? ic('gem') : null, l === 4 ? '↗' : ''));
        if (Array.isArray(r)) node.appendChild(h('div', { class: 'node-rew' }, h('span', { class: 'rs' }, '先駆 ' + r[0]), h('span', { class: 'rw' }, '追随 ' + r[1])));
        else if (r) node.appendChild(h('div', { class: 'node-rew' }, h('span', null, r)));
        else node.appendChild(h('div', { class: 'node-rew' }, h('span', null, 'START')));
        const mks = h('div', { class: 'node-mk' }); st.players.forEach(q => { if (q.lv[t] === l) mks.appendChild(h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1)); });
        if ((l === 3 || l === 5) && st.shared.firsts[t + l] !== undefined) mks.appendChild(h('small', { class: 'first' }, `先駆:${st.players[st.shared.firsts[t + l]].name}`));
        node.appendChild(mks);
        body.appendChild(node);
      }
      lane.appendChild(body); lanes.appendChild(lane);
    });
    if (!G.RULESETS[st.rules || 'v1'].noCombo) box.appendChild(h('p', { class: 'note' }, 'コンボ：' + G.comboNames(st).join('／') + '　（対応色の痕跡を揃えると祝福+1）'));
    return box;
  }

  const TIPS = {
    E5: '熱源吸収：+5E（協調ぶん+E）', EG: '群体同期：+2E＋個体数10ごとに+1E', G3: '配列解析：+3G', GG: '群体融合：+1G＋個体数10ごとに+1G', P8: '個体培養：+8P', ALL: '資源合成：+2E+1G+4P（協調ぶんは好きな資源）', PB: '自己複製：G2→P+10（協調対象外）',
    MB: '淘汰(身体)：P20→痕跡+1', MI: '淘汰(知性)：P20→G4以下の形質を異なる2種（排他不要）', MS: '淘汰(社会)：P20→協調+2', MM: '淘汰(代謝)：P20→E+10 G+10',
    TRT: '形質獲得：形質プールのカードをクリック。強化は取得済みカードをクリック', TRT2: '形質獲得（割増枠・拡張x1）：通常コストに加えてラウンド数ぶんのEを支払う。形質プールのカードをクリック', GEM: '宝石セット得点カード：G(10−形質数・下限5)→祝福+1（自分専用）',
    BRD: '繁殖：Pを払って繁栄度+1（段数とコストは数値セットによる。T6以降は生命核L3でも可）', ORG: '器官形成：器官の場のカードをクリック', SCAN: '探索：E5→他プレイヤーの最高Lv×2の資源（自分は除く）', ADP: '適応進化：生命核1→Lv1のトラックを+1（ワーカー必須）', CNV: '資源変換：E2→G1／G2→E1／P8→E3／P8→G2', RSV: '予備動員：無料でE+2またはG+1',
  };
  function slotButton(p, can, s, onclick, extra) {
    const used = (s.id === 'GEM' && G.RULESETS[st.rules || 'v1'].gemsetShared) ? undefined : G.slotUsedBy(st, s.id); // 共用の宝石セットは使用済み表示なし
    const reason = !can ? roMsg : (s.id === 'TRT' || s.id === 'TRT2' || s.id === 'ORG' || s.id === 'TRK') ? null : (s.id === 'RST' && !restoreCands(p).length) ? '復元できる形質がありません（他の人が強で取った形質がない）' : (s.id === 'AMP' && !amplifyCands(p).length) ? `増幅できる器官がありません（対象＝${G.ampTargetText(st)}。形成と同時の増幅は器官の場から）` : (s.id === 'BST' && !burstCands(p).length) ? '急速形成できる系統がありません（同じ系統で続けて形成できる器官が 2 枚以上ない）' : check(sample(p, s.id));
    const txt = G.slotText(st, s.id, viewP(p));
    // 獲得量プレビュー：今この枠を使うと実際にいくつ得られるか（協調ボーナス・群体のP・Pブースト等を含む）
    let d = null; if (can && !reason && (s.group === 'res' || s.group === 'mass' || s.id === 'GEM')) { d = G.previewGain(st, sample(p, s.id), s.id === 'MI' ? { noTraitFx: true } : null); }
    const pay = d && s.group === 'mass' && G.massCost(p, s.id) > 0 ? { P: G.massCost(p, s.id) } : null; // 2026-11-10 v3.93：淘汰は支払いと戻りを分けて表示
    const gain = d ? gainStr(d, pay) : null;
    const tip = (G.slotTip(st, s.id) || txt) + (gain ? `\n今実行すると：${gain}` : '');
    const body = slotBody(p, s.id, s.name, txt, d, pay);
    return actBtn({ class: 'slot' + (iconView() && body[0].className === 'pname' ? ' pic' : '') + (used !== undefined ? ' used' : ''), title: tip, onclick }, reason, ...body, used !== undefined ? h('em', null, h('span', { class: 'mk p' + used }, used + 1), ` ${st.players[used].name} 使用`) : null, extra || null);
  }
  function sample(p, id) { // 事前判定用の代表アクション
    const pid = p.id;
    if (G.RES_SLOTS.includes(id)) return { pid, type: 'res', slot: id, coopRes: 'E', useL: p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree, /* T18：useL＝緊急進出（空き枠で 3 倍）なので事前判定・見込みは通常の配置 */ bypassCoop: st.ext === 'x1' && p.coop >= (G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2) };
    if (id === 'PB') return { pid, type: 'res', slot: 'PB' };
    if (['MB', 'MI', 'MS', 'MM'].includes(id)) return { pid, type: 'mass', kind: id, traits: G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (G.RULESETS[st.rules || 'v1'].miMaxCost || 4) && !G.trait(p, t)).slice(0, G.RULESETS[st.rules || 'v1'].miCount || 2) };
    if (id === 'GEM') return { pid, type: 'gemset', useL: Math.min(p.L, 3) };
    if (id === 'MIM') { const o = G.mimicOptions(st, p); return { pid, type: 'mimic', effect: o.length ? o[0].id : 'intel2', useL: 0 }; }
    if (id === 'TE' || id === 'TP' || id === 'TR') return { pid, type: 'tributeSlot', slot: id, track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' };
    if (id === 'TO') { if (G.RULESETS[st.rules || 'v1'].toLineage) return { pid, type: 'tributeSlot', slot: id, lin: st.shared.lineages.find(l => G.lineageCount(p, l) < 3) || st.shared.lineages[0], useL: Math.min(p.L, 2), liRes: 'E', regimeRes: 'E' }; return { pid, type: 'tributeSlot', slot: id, organ: st.shared.organField.find(o => G.organCost(st, p, o)) || st.shared.organField[0], li2Res: 'E', li3Res: 'E', regimeRes: 'E' }; }
    if (id === 'TT') return { pid, type: 'tributeSlot', slot: id, traits: G.traitPool(st).filter(t => !G.trait(p, t)).slice(0, 1), useL: 0, res: 'E', track: 'intel' };
    if (id === 'TA') { const f = G.TRACKS.find(t => p.gems[t] > 0) || 'body'; return { pid, type: 'tributeSlot', slot: id, changes: [{ from: f, to: G.TRACKS.find(t => t !== f) }] }; }
    if (id === 'TB') return { pid, type: 'tributeSlot', slot: id, res: 'E5', coopRes: 'E' };
    if (id === 'TJ') { const ok = G.TRACKS.filter(t => G.stepCost(p, t) !== null); return { pid, type: 'tributeSlot', slot: id, tracks: [ok[0] || 'body', ok[1] || ok[0] || 'body'], useL: 0 }; }
    if (id === 'EXP') return { pid, type: 'express', track: 'body', useL: 0 };
    if (id === 'BRD') { const bl = G.RULESETS[st.rules || 'v1'].breedL; const c = G.breedCost(p); return { pid, type: 'breed', pay: (bl && c !== null && p.P < c && p.L >= bl) ? 'L' : 'P' }; } // L でも払える数値セットでは L を代表に
    if (id === 'SCAN') { const c = G.scanCandidates(st, p); return { pid, type: 'scan', target: c[0] || { pid: -1, track: 'body' }, useL: Math.min(p.L, 2) }; }
    if (id === 'ADP') { const l = G.TRACKS.find(t => p.lv[t] === 1); return { pid, type: 'adapt', track: l || 'body' }; }
    if (id === 'CNV') { const k = p.E >= 2 ? 'EG' : p.G >= 2 ? 'GE' : 'PE'; return { pid, type: 'convert', kind: k, n: 1 }; }
    if (id === 'RST') { const c = restoreCands(p); return { pid, type: 'restore', trait: c[0] || 'NC', useL: 0, res: 'E', track: 'intel' }; } // T10
    if (id === 'AMP') { const c = amplifyCands(p); return { pid, type: 'amplify', organ: c[0] || 'Mg1' }; }
    if (id === 'BST') { const c = burstCands(p); return { pid, type: 'burst', organs: c[0] || ['Mg1', 'Mg2'], useL: 0, liRes: 'E' }; } // T14 一気立て
    if (id === 'PASS') return { pid, type: 'pass' };
    if (id === 'GTH') return { pid, type: 'gather', res: 'E' };
    return { pid, type: 'reserve', res: 'E' };
  }
  function renderExcl(p, can) {
    const m4 = st.slotSet === 'm4';
    const x1 = st.ext === 'x1';
    const box = h('div', { class: 'panel excl' + (iconView() ? ' picmode' : '') }, h('h3', null, '占有盤', h('small', { class: 'sub' }, (m4 ? '　資源獲得は4枠（E系／G系／P系／全資源）・各枠1ラウンドに1人、枠内のどちらかを選ぶ。使用済み枠は生命核1の「緊急進出」で突破可（自己複製は不可）' : (G.RULESETS[st.rules || 'v1'].launchFree ? `　各スロットは1ラウンドに1人だけ。空いている資源枠は生命核1の「緊急進出」で獲得量${G.RULESETS[st.rules || 'v1'].launchFree}倍` : '　各スロットは1ラウンドに1人だけ。使用済みは生命核1の「緊急進出」で資源獲得スロットのみ突破可')) + (G.RULESETS[st.rules || 'v1'].traitShared ? '　【形質共用】形質獲得は排他なし（割増枠なし）。' + (G.RULESETS[st.rules || 'v1'].launchFree ? '使用済みの資源枠は協調進出（協調）で突破可。' : '使用済みの資源枠は緊急進出（L1）か協調進出（協調）で突破可。') + '群体同期／群体融合はPを払って資源＋協調+1' + (G.RULESETS[st.rules || 'v1'].bodyAxis === 'L' ? '　【生命核軸】収入時に保有L1個につきE+1。身体はLを投入した回数で上がる' : '') : x1 ? '　【拡張x1】形質獲得は2枠（割増枠＝ラウンド数ぶんのE追加）。使用済みの資源／形質枠は緊急進出（L1）か協調進出（協調）で突破可' : ''))));
    box.firstChild.appendChild(viewToggle()); if (iconView()) box.appendChild(iconLegend());
    const fv = G.RULESETS[st.rules || 'v1'].finalSlotVg, RNf = G.RULESETS[st.rules || 'v1'].rounds || G.ROUNDS, finalR = fv && st.round === RNf; // v3.55 祝福枠：最終ラウンドの資源枠
    const g1 = h('div', { class: 'sgroup' + (finalR ? ' god' : '') }, h('h4', null, (m4 ? '資源獲得（統合4・試作）' : '資源獲得') + (!fv ? '' : finalR ? `（最終ラウンド＝祝福枠：空いている枠にワーカーを置くと資源に加えて祝福+${fv.vg || 1}）` : `（最終ラウンド${RNf}は祝福枠＝空いている枠にワーカーを置くと祝福+${fv.vg || 1} も）`)));
    const bypassHint = () => { const w = [p.mimic && !(p.round && p.round.mimicUsed) ? (p.mimic === 'free' ? '擬態可（無償）' : `擬態可（E${G.sc(st, 3)}）`) : null, p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree ? '緊急進出可（L1）' : null, x1 && p.coop >= (G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2) ? `協調進出可（協調${G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2}）` : null].filter(Boolean); /* 2026-10-30：擬態が使えるときは選択前の枠にも表示 */ return w.length ? h('small', { class: 'bypass' }, w.join('・')) : null; };
    const resBtn = (s, used) => slotButton(p, can, s, () => onSlot(p, s.id), used !== undefined && G.RES_SLOTS.includes(s.id) ? bypassHint() : null);
    if (m4) Object.entries(G.RES_GROUPS).forEach(([gid, grp]) => { const used = st.shared.used[gid]; const gb = h('div', { class: 'merged' + (used !== undefined ? ' used' : '') }, h('h5', null, grp.name)); grp.slots.forEach(id => gb.appendChild(resBtn(G.SLOT_BY_ID[id], used))); g1.appendChild(gb); });
    else G.SLOTS.filter(s => s.group === 'res').forEach(s => g1.appendChild(resBtn(s, st.shared.used[s.id])));
    { const LF = G.RULESETS[st.rules || 'v1'].launchFree; if (LF) { const cands = launchCands(p); const reason = !can ? '他プレイヤーの手番' : p.L <= 0 ? '生命核がありません' : !cands.some(c => !c.ng) ? '緊急進出できる空き枠がありません' : null; g1.appendChild(actBtn({ class: 'launchbtn', onclick: () => onLaunch(p) }, reason, `緊急進出（生命核-1・空き枠の獲得量${LF}倍）`)); } } // 2026-11-10 ユーザー要望：枠ごとに置き方を聞かず、専用ボタンから空き枠を選ぶ
    const g2 = h('div', { class: 'sgroup' }, h('h4', null, (() => { const base = G.RULESETS[st.rules || 'v1'].massCost, mine = G.massCost(viewP(p), 'MI'); return `淘汰（P${mine !== base ? mine + '・軽減後' : base}）`; })()));
    G.SLOTS.filter(s => s.group === 'mass').forEach(s => g2.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))));
    { const T = G.RULESETS[st.rules || 'v1'].tribute; if (T) { const open = st.round >= (T.openRound || 6); const gt = h('div', { class: 'sgroup' + (open ? ' god' : '') }, h('b', { class: 'glabel' }, open ? '神の到来：恩寵枠（占有）' : `恩寵枠（ラウンド${T.openRound || 6}から・神の到来）`)); G.tribSlots(st).map(id => G.SLOT_BY_ID[id]).forEach(s => { if (open) gt.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))); else { const b = slotBody(p, s.id, s.name, G.slotText(st, s.id), null); gt.appendChild(h('button', { class: 'slot locked' + (b[0].className === 'pname' ? ' pic' : ''), disabled: true, title: G.slotTip(st, s.id) }, ...b)); } }); box.appendChild(gt); } }
    const g3 = h('div', { class: 'sgroup' }, h('h4', null, 'その他'));
    G.SLOTS.filter(s => s.group === 'oth' && (!s.ext || s.ext === st.ext) && (!s.rs || G.RULESETS[st.rules || 'v1'][s.rs]) && !(s.id === 'TRT2' && G.RULESETS[st.rules || 'v1'].traitShared) && !(s.id === 'GEM' && G.RULESETS[st.rules || 'v1'].gemsetShared)).forEach(s => g3.appendChild(slotButton(p, can, s, () => onSlot(p, s.id), G.slotUsedBy(st, s.id) !== undefined && G.bypassable(st, s.id) ? bypassHint() : null)));
    box.appendChild(g1); box.appendChild(g2); box.appendChild(g3); return box;
  }
  const restoreCands = (p) => G.traitPool(st).filter(t => st.shared.traitFirst[t] !== undefined && st.shared.traitFirst[t] !== p.id && !G.trait(p, t)); // T10 復元の候補
  const burstCands = (p) => { const B = G.RULESETS[st.rules || 'v1'].burst; if (!B) return []; const out = []; st.shared.lineages.forEach(lin => { const n = G.lineageCount(p, lin); const seq = [1, 2, 3].filter(t => t > n).map(t => lin + t).filter(id => st.shared.organField.includes(id)); for (let k = 2; k <= Math.min(seq.length, B.max || 3); k++) out.push(seq.slice(0, k)); }); return out; }; // T14 一気立ての候補（系統ごとに次の 2 枚・3 枚）
  const amplifyCands = (p) => p.organs.filter(o => G.ampOk(st, o.id, true) && !o.amp).map(o => o.id); // T10 増幅の候補（v3.66：未建造は「建造と同時に増幅」で扱うので、ここは持っている器官だけ。v3.65 の予約は engine に残すが画面からは外す）
  function renderShared(p, can) {
    const box = h('div', { class: 'panel shared2' + (iconView() ? ' picmode' : '') }, h('h3', null, '共用盤', h('small', { class: 'sub' }, '　何人でも・何回でも（ワーカーがある限り）')));
    const R6 = G.RULESETS[st.rules || 'v1'];
    const gTop = h('div', { class: 'sgroup' }, h('h4', null, '献上（共用・各自各品目1ラウンド1回）')); // 2026-10-28：早取りでない献上は共用盤の先頭にまとめる（ユーザー要望）
    if (!R6.tributeOnceGame) tributeButtons(p, can, false).forEach(b => gTop.appendChild(b)); // v3.68：祭壇（1 ゲーム 1 回・T10）は個人ボードの祭壇 3 マスへ移した（renderAltars）。旧数値セット（1R1回）だけ共用盤に残す
    const g = h('div', { class: 'sgroup' });
    { const Rc = G.RULESETS[st.rules || 'v1']; G.SLOTS.filter(s => ['trk', 'org', 'cu'].includes(s.group) && s.id !== 'TRK' && !(s.id === 'ADP' && Rc.noAdapt) && !(s.id === 'CNV' && Rc.noConvert) && !(s.id === 'RSV' && Rc.noReserve) && (!s.rs || Rc[s.rs])).forEach(s => g.appendChild(slotButton(p, can, s, () => onSlot(p, s.id)))); } // T10：資源変換・予備動員は撤去、復元・増幅・パスは rs で表示
    // v3.55：献上（エネルギー／個体数）は T8 では廃止（数値セットに shared が無ければ表示しない）
    if (R6.tribute && R6.tribute.shared) { const T = R6.tribute; const open = st.round >= (T.openRound || 6); ['E', 'P'].forEach(res => { const a = { pid: p.id, type: 'tribute', res }; const c = G.sc(st, T.shared[res]); const reason = !open ? `ラウンド${T.openRound || 6}から（神の到来）` : can ? check(a) : roMsg; gTop.appendChild(actBtn({ class: 'slot' + (open ? ' god' : ' locked') + (iconView() ? ' pic' : ''), title: `献上（${res === 'E' ? 'エネルギー' : '個体数'}）：${res}${c}を払って祝福+1。ラウンド${T.openRound || 6}から・共用・各自1ラウンド1回・ワーカー`, onclick: () => open && confirm(`献上（${res === 'E' ? 'エネルギー' : '個体数'}）：${res}${c}→祝福+1。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'TRIB_' + res, `献上（${res === 'E' ? 'エネルギー' : '個体数'}）`, `${res}${c} → 祝福+1`, null))); }); }
    if (gTop.childNodes.length > 1) box.appendChild(gTop); box.appendChild(g); return box;
  }
  // 献上（遺伝子・生命核・協調）のボタン。altar=true（T10 v3.68・tributeOnceGame）＝個人ボードの祭壇 3 マス：各祭壇は 1 ゲームに 1 回で、使った祭壇には自分のワーカーが乗る（engine の p.tribGame）。altar=false＝旧数値セットの共用盤（各品目 1R1回）
  function tributeButtons(p, can, altar) {
    const R6 = G.RULESETS[st.rules || 'v1']; const out = []; const place = R6.tributeOnceGame ? G.tribLimitText(st) : '共用' + (R6.tribute ? '・' + G.tribLimitText(st) : '');
    const usedAt = (key) => !!(p.tribGame && p.tribGame[key]);
    const fin = (key, b) => { if (altar) { b.classList.add('altar'); const nm = b.querySelector('b, .pname'); if (nm) nm.textContent = nm.textContent.replace('献上', '祭壇'); if (usedAt(key)) { b.classList.add('used'); b.appendChild(h('span', { class: 'aw', title: '使用済み：この祭壇にはあなたのワーカーが乗っています（各祭壇は 1 ゲームに 1 回）' }, h('span', { class: 'mk p' + p.id }, p.id + 1), ic('W'), '使用済み')); } else b.appendChild(h('span', { class: 'aw empty', title: 'まだ使っていない祭壇（ワーカーを 1 つ置いて献上）' }, h('span', { class: 'mk empty' }, ''), '空')); } out.push(b); };
    if (R6.gemsetShared) fin('G', slotButton(p, can, G.SLOT_BY_ID.GEM, () => onSlot(p, 'GEM')));
    if (R6.lCrystal) { const a = { pid: p.id, type: 'lCrystal' }; const reason = can ? check(a) : roMsg; const nL = Math.max(1, R6.lCrystal - (viewP(p).crystalDiscL || 0)); const nLt = nL !== R6.lCrystal ? `${nL}（結晶体質）` : String(nL); const vg = G.tribOutText(st, 'L'); fin('L', actBtn({ class: 'slot' + (iconView() ? ' pic' : ''), title: `献上（生命核）：生命核L${nLt}を払って${vg}。身体Lv${R6.lCrystalLv || 4}で解放・${place}・ワーカー。投入回数には数えない`, onclick: () => confirm(`献上（生命核）：L${Math.max(1, R6.lCrystal - (p.crystalDiscL || 0))}→${vg}。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'LCR', '献上（生命核）', `L${nLt} → ${vg}`, null))); }
    if (R6.coopCrystal) { const a = { pid: p.id, type: 'coopCrystal' }; const reason = can ? check(a) : roMsg; const nC = Math.max(1, R6.coopCrystal - (viewP(p).crystalDiscC || 0)); const nCt = nC !== R6.coopCrystal ? `${nC}（結晶体質）` : String(nC); const vg = G.tribOutText(st, 'coop'); fin('coop', actBtn({ class: 'slot' + (iconView() ? ' pic' : ''), title: `献上（協調）：協調${nCt}を払って${vg}。${place}・ワーカー`, onclick: () => confirm(`献上（協調）：協調${Math.max(1, R6.coopCrystal - (p.crystalDiscC || 0))}→${vg}。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'CCR', '献上（協調）', `協調${nCt} → ${vg}`, null))); }
    return out;
  }
  // v3.68：個人ボードの祭壇 3 マス（遺伝子・生命核・協調）。献上＝自分のワーカーを祭壇に置く表現（1 マス 1 個＝1 ゲームに 1 回・第66〜67部・ユーザー決定）
  function renderAltars(p, can) {
    const vg = G.tribOutText(st, 'G'), vgL = G.tribOutText(st, 'L'), vgC = G.tribOutText(st, 'coop'); const n = ['G', 'L', 'coop'].filter(k => p.tribGame && p.tribGame[k]).length;
    const row = h('div', { class: 'pbrow altars' }, h('b', { title: `祭壇：資源を捧げる（遺伝子＝${vg}／生命核＝${vgL}／協調＝${vgC}）。遺伝子・生命核・協調の 3 マスで、各祭壇は 1 ゲームに 1 回（使った祭壇には自分のワーカーが残る）。ワーカーを 1 つ使う` }, ic('bless'), '祭壇', h('small', { class: 'desc' }, `${n}/3`)));
    tributeButtons(p, can, true).forEach(b => row.appendChild(b));
    return row;
  }
  function renderOrganField(p, can) {
    const oex = G.RULESETS[st.rules || 'v1'].organExcl;
    const box = h('div', { class: 'panel' }, h('h3', null, `器官の場（${st.shared.lineages.map(l => G.LINEAGES[l]).join('・')}・${oex ? '各カード1ラウンド1人' : '排他なし'}）`, h('small', { class: 'sub' }, G.RULESETS[st.rules || 'v1'].organCumulative ? `　系統内は形態の順。カードの値段は定価（追随は代償込み）。前の段まで形成済みなら 1 つ前の段の定価を引いた差額で、（）に定価（急速形成は定価）。同系統 3 枚で系統完成（成熟度+1 は ${(G.RULESETS[st.rules || 'v1'].lineageCoefAt || []).join('・')} 系統目）` : '　系統内は形態の順。先駆＝強・追随＝弱（G0）。同系統3枚で成熟度+1')));
    const grid = h('div', { class: 'ogrid' });
    const sameEff = !!G.RULESETS[st.rules || 'v1'].organSameEffect;
    st.shared.organField.forEach(id => {
      const o = G.organDef(st, id); const c = G.organCost(st, p, id); const mine_ = G.organ(p, id); const first = st.shared.organFirst[id];
      const locked = !c && !mine_; // 階層順で未解放
      const reason = !can ? '他プレイヤーの手番' : mine_ ? null : locked ? '前の形態が必要' : check({ pid: p.id, type: 'organ', organ: id, useL: Math.min(p.L, 2), li2Res: 'E', li3Res: 'E', regimeRes: 'E' });
      const cl = mine_ ? null : G.organCost(st, p, id, true, true); // 2026-11-09 v3.88（ユーザー指摘）：順番待ちの段も急速形成の値段（定価）を出す。2026-11-10 v3.90（ユーザー指摘）：形成できるカードも同じ「定価＋追随の代償」に揃える（従来は代償なしの定価で、急速形成の合計と合わなかった）
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, cl ? (c && c.diff ? [icost(`E${c.E}${c.G ? '+G' + c.G : ''}`), h('small', null, '（', icost(`E${cl.E}${cl.G ? '+G' + cl.G : ''}`), '）')] : icost(`E${cl.E}${cl.G ? '+G' + cl.G : ''}`)) : (mine_ ? '形成済' : (['Ⅰ', 'Ⅱ', 'Ⅲ'][o.tier - 1] || ''))), h('span', { class: 'sw ' + (c ? (c.strong ? 'strong' : 'weak') : '') }, c ? (G.RULESETS[st.rules || 'v1'].organSameEffect ? (c.first ? '先駆' : '代償') : (c.strong ? '強' : '弱')) : `${G.LINEAGES[o.lin]}`));
      grid.appendChild(actBtn({ class: 'ocard' + (mine_ ? ' mine' : locked ? ' locked' : ''), title: `${id} ${o.name}（${G.LINEAGES[o.lin]}系 第 ${o.tier} 形態）\n${sameEff ? '効果：' + otxt(o, true) + '\n追随の代償は +' + G.sc(st, G.RULESETS[st.rules || 'v1'].organLateFee || 1) + 'E' : '強：' + otxt(o, true) + '\n弱：' + otxt(o, false)}`, onclick: () => onOrgan(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${o.name}`, chgBadge(id)), h('small', null, sameEff ? otxt(o, true) : `強：${otxt(o, true)}`), sameEff ? null : h('small', null, `弱：${otxt(o, false)}`),
        ownersRow(p, id, 'organ'), statusLine(mine_ ? 'ok' : locked ? 'lock' : reason && can ? 'no' : null, mine_ ? '形成済み' : locked ? '前の形態が必要' : reason)));
    });
    box.appendChild(grid);
    if (st.shared.special) box.appendChild(h('div', { class: 'owned' }, h('b', null, `特殊器官（代謝 Lv4 に達した順に 1 枚）残り ${st.shared.special.length}：`), ...st.shared.special.map(id => h('span', { class: 'tag', title: G.spText(G.RULESETS[st.rules || 'v1'], id) }, `${G.ORGANS[id].name}（${G.spText(G.RULESETS[st.rules || 'v1'], id)}）`)))); // T15
    return box;
  }
  // 所有トークン置き場：全プレイヤーぶんの枠を並べ、所有者の枠にマーカー（★＝強）。自分の枠は太枠
  function ownersRow(p, id, kind) {
    const own = (q) => kind === 'organ' ? G.organ(q, id) : G.trait(q, id);
    const names = st.players.filter(own).map(q => q.name).join('・');
    const row = h('div', { class: 'owners', title: '所有：' + (names || 'なし') });
    st.players.forEach(q => { const o = own(q); row.appendChild(h('span', { class: 'mk p' + q.id + (o ? '' : ' empty') + (q.id === p.id ? ' me' : ''), title: `${q.name}${o ? (o.strong ? '：強' : '：弱') : '：未取得'}` }, o ? (o.strong ? '★' : String(q.id + 1)) : '')); });
    return row;
  }
  // グレーの理由を一目で：ok＝取得済み（緑）／lock＝未解放（縞）／no＝今は不可（赤・理由つき）
  function statusLine(kind, text) { return kind ? h('small', { class: 'status ' + kind }, (kind === 'no' ? '× ' : '') + text) : null; }
  function renderTraitPool(p, can) {
    const noUp = G.RULESETS[st.rules || 'v1'].noUpgrade;
    const box = h('div', { class: 'panel' }, h('h3', null, `形質プール（${G.traitPool(st).length}種・獲得は${G.RULESETS[st.rules || 'v1'].traitShared ? '共用' : '占有'}）`, h('small', { class: 'sub' }, `　先駆＝強・追随＝弱（安い）。${(G.RULESETS[st.rules || 'v1'].traitCoef || [4, 8]).join('枚目・')}枚目で成熟度+1。` + (noUp ? '' : '取得済みをクリックで形質強化'))));
    const grid = h('div', { class: 'tgrid' });
    G.traitPool(st).forEach(id => {
      const t = G.TRAITS[id]; const c = G.traitCost(st, p, id); const mine_ = G.trait(p, id); const first = st.shared.traitFirst[id];
      const pl = traitPlan(p) || {}; const reason = !can ? '他プレイヤーの手番' : mine_ ? null : check(Object.assign({ pid: p.id, type: 'trait', trait: id, useL: Math.min(Math.max(0, p.L - (pl.bypassL ? 1 : 0)), 3), res: 'E', track: 'body' }, pl));
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, mine_ ? `取得済→交換` : [ic('G'), `${c.G}`, h('small', null, `（表示${G.baseTraitCost(st, id)}/${G.baseTraitCost(st, id, false)}）`)]), h('span', { class: 'sw ' + ((mine_ ? mine_.strong : c.strong) ? 'strong' : 'weak') }, mine_ ? (mine_.strong ? '強' : '弱') : G.RULESETS[st.rules || 'v1'].traitChoice ? (c.strong ? '強あり' : '弱のみ') : (c.strong ? '強' : '弱')));
      grid.appendChild(actBtn({ class: 'tcard' + (mine_ ? ' mine' : ''), title: `${id} ${t.name}\n強：${rtxt(G.traitText(st, id, true))}\n弱：${rtxt(G.traitText(st, id, false))}`, onclick: () => onTrait(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${t.name}`, chgBadge(id)), h('small', null, `強：${rtxt(G.traitText(st, id, true))}`), h('small', null, `弱：${rtxt(G.traitText(st, id, false))}`),
        ownersRow(p, id, 'trait'), statusLine(mine_ ? 'ok' : reason && can ? 'no' : null, mine_ ? (noUp ? '取得済み' : '取得済み（クリックで上位へ交換）') : reason)));
    });
    box.appendChild(grid); return box;
  }

  function renderPlayer(p, can) {
    const sp = G.SPECIES[p.species]; const sc = G.score(st, p); const inc = G.income(p);
    const box = h('div', { class: 'panel player p' + p.id }, h('div', { class: 'phead' }, art(SPECIES_ART[p.species] || 'species_wing', 'portrait'), h('h3', null, h('span', { class: 'mk p' + p.id }, p.id + 1), ` ${can ? '手番' : isBot(p.id) ? '手番（AI）' : '手番（他端末）'}：${p.name}（${sp.name}）`, h('small', { class: 'sub' }, `　残り ${p.lRemain} ラウンド`))));
    // ① 資源トラック（E/G/P）＋生命核
    box.appendChild(h('div', { class: 'res' }, ...['E', 'G', 'P', 'L'].map(k => h('span', { class: 'rbox r' + k, title: `${RES_JP[k]}${k !== 'L' ? '　次の収入 +' + inc[k] : (G.RULESETS[st.rules || 'v1'].lYield ? `　毎ラウンド+1・収入時に保有1個につき${G.RULESETS[st.rules || 'v1'].yieldRes === 'P' ? 'P' : 'E'}+${(G.RULESETS[st.rules || 'v1'].yieldByRound ? G.RULESETS[st.rules || 'v1'].yieldByRound[Math.min(7, st.round + 1)] : G.RULESETS[st.rules || 'v1'].lYield) + (p.yieldAdd || 0)}${p.yieldMul > 1 ? '×' + p.yieldMul : ''}（${p.lValue || 3}E/G代用・${G.RULESETS[st.rules || 'v1'].noAdapt ? '' : '適応進化・'}緊急進出${G.RULESETS[st.rules || 'v1'].breedL ? '・L繁殖' : ''}）` : '　毎ラウンド+1（E3/G3代用・適応進化・緊急進出）')}` }, ic(k), h('b', null, String(p[k])), k !== 'L' ? h('small', null, `+${inc[k]}/R`) : null))));
    box.appendChild(h('div', { class: 'note', title: inc.parts.join('\n') }, `次の収入 E+${inc.E} G+${inc.G} P+${inc.P} L+1（内訳はマウスで）`));
    // ② 5コマ（係数）＋強W置き場
    const gauge = G.RULESETS[st.rules || 'v1'].gauge;
    const tok = h('div', { class: 'pbrow' }, h('b', null, G.RULESETS[st.rules || 'v1'].coef2 ? '繁栄度・成熟度' : gauge ? 'ワーカー／係数' : 'ワーカー（係数）'));
    if (!G.RULESETS[st.rules || 'v1'].coef2) p.tokens.forEach((tk, i) => { /* 2026-10-30：T8（コマは全て同じ W・残数はヘッダに表示）ではコマの並びを出さない */ tok.appendChild(h('span', { class: 'tokc ' + tk, title: gauge ? 'ワーカー（全て同じ・何にでも使える）' : tk === 'AT' ? 'AT：進化・繁殖・適応進化には使えない' : tk === 'S' ? '強ワーカー（係数2）' : 'ワーカー（係数1）' }, ic('W'), tk === 'S' ? '強' : tk)); });
    const c2 = G.RULESETS[st.rules || 'v1'].coef2;
    if (c2) { const Rg = G.RULESETS[st.rules || 'v1']; const tc = Rg.traitCoef || [4, 8]; const kT = tc.filter(n => p.traits.length >= n).length; const lmax = (Rg.lineageCoefMax !== undefined ? Rg.lineageCoefMax : 2) + (p.lineageCoefAdd || 0); const kL = Math.max(0, (p.collectUps || 0) - kT); // 2026-11-05 v3.66：成熟度の内訳（形質 k/2・系統完成 m/2）を見せる（ユーザー質問「成熟度の上げ方は画面で分かるか」）
      tok.appendChild(h('span', { class: 'gauge', title: `繁栄度：繁殖（P${Rg.breed ? Rg.breed[0] : '?'}${Rg.breedL ? '／L' + Rg.breedL : ''}）で+1。痕跡に掛ける` }, '繁栄度', ...Array.from({ length: (c2.breedMax || 2) + 1 }, (_, i) => i).map(i => h('span', { class: 'gs' + (i <= (p.breedUps || 0) ? ' on' : '') }, '×' + ((c2.breedBase || 3) + i)))));
      tok.appendChild(h('span', { class: 'gauge', title: `成熟度：形質${tc.join('・')}枚目で+1（いま ${kT}/${tc.length}）、器官の系統完成（同じ系統3枚）で+1（${lmax}系統目まで・いま ${kL}/${lmax}。適応放散〔強〕で+1系統）。祝福に掛ける` }, '成熟度', ...[0, 1, 2, 3, 4].map(i => h('span', { class: 'gs' + (i <= (p.collectUps || 0) ? ' on' : '') }, '×' + ((c2.collectBase || 3) + i))), h('small', { class: 'desc' }, `形質${kT}/${tc.length}・系統${kL}/${lmax}`))); }
    else if (gauge) tok.appendChild(h('span', { class: 'gauge', title: '係数：繁殖・系統完成・形質4/8枚目で+1（上限×7）' }, ...[3, 4, 5, 6, 7].map(v => h('span', { class: 'gs' + (v <= G.coef(p) ? ' on' : '') }, '×' + v))));
    else tok.appendChild(h('span', { class: 'hl' }, `係数 ×${G.coef(p)}`));
    tok.appendChild(h('span', { title: 'このラウンドに置けるワーカーの残り' }, gauge ? `ワーカー残 ${p.left.W + p.left.AT}` : `ワーカー残 ${p.left.W}／AT${p.left.AT}`)); // 2026-11-05 ユーザー指摘：係数ゲージの横の「残 2」が何の残りか分からない→ワーカーの残数と明記
    if (p.shields) tok.appendChild(h('span', { class: 'hl' }, `自由行動 ${p.shields}`));
    box.appendChild(tok);
    // ③ 協調トラック 0-8
    const co = h('div', { class: 'pbrow', title: (() => { const RC = G.RULESETS[st.rules || 'v1']; return `協調：資源獲得スロットで得る資源+協調数${RC.coopMode === 'half' ? 'の半分（切り捨て）' : ''}${RC.coopBonusCap !== undefined ? `（上限+${RC.coopMode === 'half' ? Math.floor(RC.coopBonusCap / 2) : RC.coopBonusCap}）` : ''}。${st.ext === 'x1' ? '協調進出（2個で使用済み枠）。' : ''}${RC.coop8Coef ? (RC.coef2 ? '初めて8に達すると成熟度+1。' : '初めて8に達すると係数+1。') : RC.coop8Gem ? '初めて8に達すると痕跡+1。' : ''}${RC.coopCrystal ? `群れの結晶（${RC.coopCrystal}個→祝福+1）` : ''}`; })() }, h('b', null, ic('coop'), '協調'));
    for (let i = 0; i <= (G.RULESETS[st.rules || 'v1'].coopMax || G.COOP_MAX); i++) co.appendChild(h('span', { class: 'coopc' + (i === p.coop ? ' on' : '') }, String(i)));
    box.appendChild(co);
    // ④ 宝石カウンター
    const gm = h('div', { class: 'pbrow' }, h('b', null, ic('gem'), '痕跡・祝福'));
    if (G.RULESETS[st.rules || 'v1'].noCombo) { gm.appendChild(h('span', { class: 'gem gray', title: '痕跡（宇宙への影響）：終了時 痕跡×繁栄度' }, String(G.realGems(p)))); gm.appendChild(h('span', null, ` 祝福 ${G.virtualGems(st, p)}`, h('small', { title: '祝福（神の評価）：終了時 祝福×成熟度。献上・Lv6 先駆・神の裁定で得る' }, '（神の評価）'))); } // 2026-10-28 色の廃止：合計のみ
    else { G.TRACKS.forEach(t => gm.appendChild(h('span', { class: 'gem ' + G.TRACK_INFO[t].color, title: G.TRACK_INFO[t].name }, String(p.gems[t])))); gm.appendChild(h('span', null, ` 祝福 ${G.virtualGems(st, p)}（セット${p.gemsets}）`)); }
    box.appendChild(gm);
    if (G.RULESETS[st.rules || 'v1'].tributeOnceGame) box.appendChild(renderAltars(p, can)); // v3.68 祭壇 3 マス（T10）
    const scTitle = sc.mode === 'mult'
      ? `（痕跡${sc.real}＋祝福${sc.vg}）×${sc.gemPt}×係数${sc.cf}＝${sc.core}　形質${p.traits.length}枚×宝石の色数${Math.max(1, sc.colors)}＝${sc.dev}　器官${p.organs.length}枚×協調${Math.min(4, p.coop)}（上限4）＝${sc.org}　体制${sc.reg}`
      : sc.coef2 ? `痕跡${sc.real}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}繁栄度${sc.cfB}＋祝福${sc.vg}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}成熟度${sc.cfC}＝${sc.core}${sc.devPt ? `　発展度（形質${p.traits.length}＋協調${p.coop}）×${sc.devPt}` : ''}${sc.reg ? `　体制${sc.reg}` : ''}` : `（痕跡${sc.real}＋祝福${sc.vg}）×${sc.gemPt}×係数${sc.cf}＝${sc.core}　発展度（形質${p.traits.length}＋協調${p.coop}）×${sc.devPt}＝${sc.dev}${sc.organPt ? `　器官${p.organs.length}枚×${sc.organPt}＝${sc.org}` : ''}　体制${sc.reg}`;
    const scText = sc.mode === 'mult'
      ? ` ＝ 宝石${sc.core}（${sc.real}+${sc.vg}個×${sc.gemPt}×${sc.cf}）＋形質${sc.dev}（${p.traits.length}×色${Math.max(1, sc.colors)}）＋器官${sc.org}（${p.organs.length}×協調${Math.min(4, p.coop)}）＋体制${sc.reg}`
      : sc.coef2 ? ` ＝ ${sc.core}（痕跡${sc.real}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}${sc.cfB}＋祝福${sc.vg}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}${sc.cfC}）${sc.dev ? '＋発展度' + sc.dev : ''}${sc.reg ? '＋体制' + sc.reg : ''}` : ` ＝ 宝石${sc.core}（${sc.real}+${sc.vg}個×${sc.gemPt}×${sc.cf}）＋発展度${sc.dev}${sc.organPt ? '＋器官' + sc.org : ''}＋体制${sc.reg}`;
    box.appendChild(h('div', { class: 'score', title: scTitle }, h('b', null, `現在 ${sc.total} 点`), h('small', null, scText)));
    const flags = h('div', { class: 'stat' }, p.alwaysStrong ? h('span', { class: 'hl' }, '形質常に強') : null, p.ampReserve ? h('span', { class: 'hl', title: '増幅の予約：この器官を形成したときから効果2倍' }, `増幅予約 ${p.ampReserve}`) : null, p.dv3 ? h('span', { class: 'hl', title: '進化加速：三段進化（3 段分の E を合算して手番 1 つ）の残り回数' }, `三段進化 残${p.dv3}`) : null, p.freeConv ? h('span', { class: 'hl' }, '無料E↔G変換') : null, p.wild ? h('span', { class: 'hl' }, `ワイルド色 ${G.TRACK_INFO[p.wild].jp}`) : null);
    if (flags.childNodes.length) box.appendChild(flags);
    if (p.pending.length) box.appendChild(h('div', { class: 'banner small' }, pendingText(p.pending[0]), ' ', p.pending[0].type === 'bonusAction' && can ? h('button', { onclick: () => submit({ pid: p.id, type: 'resolve', skip: true }) }, '見送る') : null));
    // ⑤ 器官（系統ごと）・形質
    const byLin = {}; p.organs.forEach(o => { (byLin[G.ORGANS[o.id].lin] = byLin[G.ORGANS[o.id].lin] || []).push(o); });
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `器官 ${p.organs.length}枚：`), ...Object.entries(byLin).map(([lin, os]) => h('span', { class: 'lin' + (G.lineageDone(p, lin) ? ' done' : '') }, `${G.LINEAGES[lin]} `, ...os.map(o => h('span', { class: 'tag' + (o.strong ? ' strong' : ''), title: `${G.ORGANS[o.id].name}：${otxt(G.ORGANS[o.id], o.strong)}` }, `${o.id}${o.strong ? '強' : '弱'}`))))));
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `形質 ${p.traits.length}枚：`), ...p.traits.map(t => h('span', { class: 'tag' + (t.strong ? ' strong' : ''), title: `${G.TRAITS[t.id].name}：${rtxt(G.traitText(st, t.id, t.strong))}` }, `${t.id}${t.strong ? '強' : '弱'}${t.res ? '(' + t.res + ')' : ''}${t.track ? '(' + G.TRACK_INFO[t.track].jp + ')' : ''}`))));
    // ⑥ 個人カード置き場（カードなしの数値セットでは出さない）
    const cards = h('div', { class: 'cards' }, h('b', null, '個人カード（排他なし）：'));
    if (G.handSize(st) > 0) p.cards.forEach(c => { const reason = can ? check({ pid: p.id, type: 'card', card: c, choice: 'E' }) : '他プレイヤーの手番'; cards.appendChild(actBtn({ class: 'cardbtn', title: G.CARDS[c].text, onclick: () => onCard(p, c) }, reason, h('div', { class: 'hd' }, h('span', null, c), h('span', { class: 'sw' }, '個人')), art(c, 'small'), h('b', null, G.CARDS[c].name), h('small', null, G.CARDS[c].text))); });
    if (G.handSize(st) > 0) box.appendChild(cards);
    const stOrgs = p.organs.filter(o => o.id.startsWith('St'));
    if (stOrgs.length) { const sa = h('div', { class: 'cards' }, h('b', null, '器官アクション：')); stOrgs.forEach(o => { const reason = can ? check({ pid: p.id, type: 'stAct', organ: o.id, pe: o.id === 'St2' ? 0 : 2, pg: o.id === 'St2' ? 3 : 0 }) : '他プレイヤーの手番'; sa.appendChild(actBtn({ class: 'cardbtn', title: otxt(G.ORGANS[o.id], o.strong), onclick: () => onStAct(p, o) }, reason, h('b', null, `${o.id} ${G.ORGANS[o.id].name}`), h('small', null, otxt(G.ORGANS[o.id], o.strong)))); }); box.appendChild(sa); }
    const free = h('div', { class: 'free' }, h('b', null, '無料：'));
    if (p.freeConv || (G.organ(p, 'Fl3') && G.organ(p, 'Fl3').strong)) free.appendChild(h('button', { disabled: !can, onclick: () => onFreeConv(p) }, 'E↔G 1:1変換'));
    if (p.shields > 0) free.appendChild(h('button', { disabled: !can, onclick: () => onSlot(p, null, true) }, '自由行動（資源獲得スロット・手番消費なし）'));
    if (p.L > 0 && !G.RULESETS[st.rules || 'v1'].noLToRes) free.appendChild(h('button', { disabled: !can, title: '生命核を E か G に換える（手番消費なし・いつでも）。払った個数は身体の素材に数える', onclick: () => onLToRes(p) }, `生命核→資源（L1＝E/G${p.lValue || G.sc(st, 3)}）`)); // 2026-11-05 ユーザー要望：生命核の使用に制限を持たせない＝アクションの前でも資源に換えられる
    if (free.childNodes.length > 1) box.appendChild(free);
    return box;
  }
  function pendingText(pd) {
    return { specialOrgan: '代謝 Lv4：特殊器官を 1 枚選んでください', fkBreed: '孵化核：繁殖を 1 回（手番なし）行えます', lYield: '生命核の産出：受け取る資源を選んでください', cvIncome: '収斂膜：収入時の追加資源を選んでください', wildColor: '共鳴膜：ワイルド色を選んでください', reMilestone: '感応系：再発動する到達済み報酬を選んでください', freeMass: '身体Lv3★先駆：淘汰を1回無料で実行してください', rewardTrait: pd.freeMax ? (pd.weakOnly ? `転写体：弱の値段が G${pd.freeMax} 以下の形質1枚を弱で無料で取れます` : `全転写：G${pd.freeMax} 以下の形質1枚を無料で取れます`) : '知性Lv3★先駆：形質1枚を割引で獲得できます', bonusAction: '知性Lv4↗：追加アクションを今すぐ実行してください（排他なしアクション／Eコスト半額／ワーカー不要）。対象以外はグレー表示', flSwap: '収入時の転流：E↔Gを振替できます', dgBuy: 'ラウンド開始時：遺伝子図書館で形質1枚を割引で獲得できます（手番は消費しません）' }[pd.type] || pd.type;
  }
  function renderSeatsMini() { const box = h('div', { class: 'panel others' }, h('h3', null, `ルーム ${game.code}`)); st.players.forEach((p, i) => { const s = Net.seats[i]; box.appendChild(h('div', { class: 'orow' }, h('span', { class: 'mk p' + i }, i + 1), ` ${p.name}：${s ? (s.uid === Net.uid ? '自分' : '他端末') : '空席'} `, !s ? h('button', { onclick: () => Net.claimSeat(i, p.name).catch(e => toast(e.message, true)) }, '着席') : s.uid === Net.uid ? h('button', { onclick: () => Net.releaseSeat(i) }, '離席') : null)); }); return box; }
  const altarTxt = (q) => { if (!G.RULESETS[st.rules || 'v1'].tributeOnceGame) return ''; const u = [['G', '遺伝子'], ['L', '生命核'], ['coop', '協調']].filter(([k]) => q.tribGame && q.tribGame[k]).map(([, n]) => n); return `｜祭壇 ${u.length}/3${u.length ? '（' + u.join('・') + '）' : ''}`; }; // v3.68：他プレイヤーの祭壇の使用状況（ワーカーが乗っている祭壇）
  function renderOthers(p) {
    const box = h('div', { class: 'panel others' }, h('h3', null, '他プレイヤー'));
    st.players.filter(q => q.id !== p.id).forEach(q => box.appendChild(h('div', { class: 'orow' }, h('span', { class: 'mk p' + q.id }, q.id + 1), ' ', h('b', null, `${q.name}（${G.SPECIES[q.species].name}${isBot(q.id) ? '・AI' : ''}）`), ` ${G.score(st, q).total}点｜E${q.E} G${q.G} P${q.P} L${q.L}｜Lv ${G.TRACKS.map(t => q.lv[t]).join('/')}｜痕跡${G.realGems(q)}＋祝福${G.virtualGems(st, q)}｜×${G.coef(q)}｜形質${q.traits.length} 器官${q.organs.length} 協調${q.coop}｜${leftTxt(q)}${altarTxt(q)}`)));
    return box;
  }
  function renderLog() {
    if (!logOpen) return h('div');
    const box = h('div', { class: 'panel logp' }, h('h3', null, 'ログ'));
    const ul = h('div', { class: 'log' });
    st.log.slice(-120).reverse().forEach(l => ul.appendChild(h('div', { class: 'l ' + l.kind + (l.p !== null && l.p !== undefined ? ' p' + l.p : '') }, `R${l.r} ${l.msg}`)));
    box.appendChild(ul); return box;
  }

  // ---------- 操作 ----------
  async function onTrack(p, t) {
    const c = G.stepCost(p, t); if (c === null) return toast('最大Lvです', true);
    // 2026-11-05 ユーザー指摘：Lv6（その色の資源で払う）のダイアログが E63（＋生命核）などの通常の支払いを出していた。Lv6 は支払いが固定なので、その内容だけを示す（G の支払いは生命核で代用できる＝engine の payG）
    const d6 = p.lv[t] === 5 ? G.lv6PayDef(st, t) : null;
    const fields = d6
      ? [{ type: 'select', name: 'pay', label: '支払い', options: [{ value: 'E', label: `${G.lv6CostText(st, t)}（Lv6＝そのトラックの資源で払う）` }] }].concat(d6.G ? [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }] : d6.E ? [{ type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p, 'E') }] : []) // 2026-11-05 ユーザー指摘：代謝 Lv6（E90）で生命核の欄が出ず、知性 Lv6 の欄が「=E15」表示だった（engine は E・G とも代用可）
      : [{ type: 'select', name: 'pay', label: '支払い', options: [{ value: 'E', label: `E${c}（＋生命核）` }].concat(t === 'body' ? [{ value: 'P', label: `P${c * 3}（身体の代替払い）` }] : t === 'intel' ? [{ value: 'G', label: `G${c}（知性の代替払い）` }] : []).concat((G.RULESETS[st.rules || 'v1'].doubleStep && G.stepCostDouble(p, t) !== null) ? [{ value: 'E2', label: `E${G.stepCostDouble(p, t)}で二段進化（Lv${p.lv[t] + 2}へ・手番1つ）` }] : []).concat((p.dv3 > 0 && G.stepCostTriple(p, t) !== null) ? [{ value: 'E3', label: `E${G.stepCostTriple(p, t)}で三段進化（Lv${p.lv[t] + 3}へ・進化加速 残${p.dv3}）` }] : []) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }]; // T10 二段進行
    const r = await ask(`${G.TRACK_INFO[t].name} Lv${p.lv[t]}→${p.lv[t] + 1}`, fields, { note: `Lv${p.lv[t] + 1}の報酬：${rtxt(G.trackRewardText(st, t, p.lv[t] + 1))}` }); if (!r) return;
    if (r.pay === 'E2') return submit({ pid: p.id, type: 'track', track: t, pay: 'E', useL: +(r.useL || 0), steps: 2 }); // T10 二段進行
    if (r.pay === 'E3') return submit({ pid: p.id, type: 'track', track: t, pay: 'E', useL: +(r.useL || 0), steps: 3 }); // T14 三段進行（進化加速）
    submit({ pid: p.id, type: 'track', track: t, pay: r.pay, useL: +(r.useL || 0) });
  }
  // T18 緊急進出：空いている資源枠（自己複製を除く）を選んで、生命核 1 個で獲得量 launchFree 倍
  function launchCands(p) { return G.RES_SLOTS.filter(id => id !== 'PB' && G.slotUsedBy(st, id) === undefined).map(id => ({ id, ng: p.L > 0 ? check({ pid: p.id, type: 'res', slot: id, coopRes: 'E', useL: true }) : '生命核がありません' })); }
  async function onLaunch(p) {
    const RCm = G.RULESETS[st.rules || 'v1']; const cands = launchCands(p);
    const pv = (id) => { const d = G.previewGain(st, { pid: p.id, type: 'res', slot: id, coopRes: 'E', useL: true }); return d ? gainStr(d) : ''; };
    const opts = cands.map(c => ({ value: c.id, label: `${G.SLOT_BY_ID[c.id].name}（${c.ng ? '不可：' + c.ng : pv(c.id)}）`, disabled: !!c.ng }));
    const first = cands.find(c => !c.ng); if (!first) return toast('緊急進出できる空き枠がありません', true);
    const spendable = RCm.coopMode === 'spend' && p.coop >= 1;
    const r = await ask(`緊急進出（生命核-1・獲得量${RCm.launchFree}倍）`, [
      { type: 'select', name: 'slot', label: '空いている資源枠', value: first.id, options: opts, desc: v => (G.slotTip(st, v.slot) || G.slotText(st, v.slot, viewP(p)) || '').split(/。(使用済み|空いている枠)/)[0] },
      ...(spendable ? [{ type: 'check', name: 'coopSpend', label: `協調1個を払って この枠の資源+${RCm.coopSpendGain || 3}`, value: false }] : []),
      Object.assign(resSel('coopRes', RCm.coopMode === 'spend' ? '協調を払ったときの資源' : '協調ボーナスの資源'), { when: v => v.slot === 'ALL' && (p.coop > 0 && RCm.coopMode !== 'spend' || spendable) }),
    ], { note: `所持 L${p.L}。払った生命核は身体の投入に数えます。` }); if (!r) return;
    return submit({ pid: p.id, type: 'res', slot: r.slot, coopRes: r.coopRes || 'E', useL: true, coopSpend: !!r.coopSpend });
  }
  async function onSlot(p, id, shield) {
    if (shield) {
      // Wなし実行（社会性の権利）：資源獲得スロット1つ or 個人カード1枚。コマを置かないのでスロットを占有しない
      const opts = G.RES_SLOTS.map(s => ({ value: s, label: G.SLOT_BY_ID[s].name + (G.slotUsedBy(st, s) !== undefined ? '（使用済・不可）' : ''), disabled: G.slotUsedBy(st, s) !== undefined }))
        .concat(p.cards.map(c => ({ value: 'card:' + c, label: `個人カード ${c} ${G.CARDS[c].name}` })));
      const r = await ask((p.cards.length ? '自由行動：資源獲得スロット1つ または カード1枚（ワーカーを置かず・手番は消費しません）' : '自由行動：資源獲得スロット1つ（ワーカーを置かず・手番は消費しません）'), [
        { type: 'select', name: 'slot', label: '対象', options: opts, desc: v => v.slot && v.slot.startsWith('card:') ? G.CARDS[v.slot.slice(5)].text : ((G.slotTip(st, v.slot) || G.slotText(st, v.slot, viewP(p)) || TIPS[v.slot] || '').split('。使用済み')[0]) }, // 2026-11-06 ユーザー指摘（T10-H3）：TIPS は T4 の素の値（+3G）だった→数値セットの値（固定G強：G+9）
        Object.assign(resSel('coopRes', '協調ボーナスの資源（資源合成用）'), { when: v => v.slot === 'ALL' && p.coop > 0 }),
        { type: 'select', name: 'choice', label: 'カードJの変換', options: [{ value: 'E', label: 'E-2 → P+6' }, { value: 'G', label: 'G-1 → P+5' }], when: v => v.slot === 'card:J' },
      ]); if (!r) return;
      if (r.slot.startsWith('card:')) return submit({ pid: p.id, type: 'card', card: r.slot.slice(5), choice: r.choice, shield: true });
      return submit({ pid: p.id, type: 'res', slot: r.slot, coopRes: r.coopRes, shield: true });
    }
    const s = G.SLOT_BY_ID[id];
    if (s.group === 'res') {
      const used = G.slotUsedBy(st, id) !== undefined; const fields = [];
      if (id === 'PB') return confirm(`自己複製：G${G.pbCost(p)}→P+${G.pbGain(st)}。実行しますか？`) && submit({ pid: p.id, type: 'res', slot: 'PB' });
      const RCm = G.RULESETS[st.rules || 'v1']; const spendable = RCm.coopMode === 'spend' && p.coop >= 1;
      if (spendable) fields.push({ type: 'check', name: 'coopSpend', label: `協調1個を払って この枠の資源+${RCm.coopSpendGain || 3}`, value: false });
      if (id === 'ALL' && (p.coop > 0 && RCm.coopMode !== 'spend' || spendable)) fields.push(resSel('coopRes', RCm.coopMode === 'spend' ? '協調を払ったときの資源' : `協調ボーナスの資源`));
      if (used && G.RES_SLOTS.includes(id)) { const bf = bypassField(p); if (!bf) return toast(RCm.launchFree ? `使用済みです（協調${RCm.bypassCoopCost || 2}があれば協調進出ができます）` : '使用済みです（生命核があれば緊急進出、拡張x1なら協調で協調進出ができます）', true); fields.push(bf); }
      // T18（O-12）の緊急進出（空き枠・生命核 1 で 3 倍）は占有盤の専用ボタン（onLaunch）から。枠を押したときは聞かない（2026-11-10 ユーザー要望）
      if (!fields.length) return submit({ pid: p.id, type: 'res', slot: id });
      const r = await ask(s.name, fields, { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'res', slot: id, coopRes: r.coopRes, useL: r.bypass === 'L', bypassCoop: r.bypass === 'coop', bypassMimic: r.bypass === 'mimic', coopSpend: !!r.coopSpend });
    }
    if (id === 'BRD') { const R0 = G.RULESETS[st.rules || 'v1']; const c = G.breedCost(p); if (c === null) return toast('繁殖は上限です', true); const bl = R0.breedL; const cf = (k) => R0.coef2 ? '繁栄度×' + (G.coefB(p) + k) : '係数×' + (G.coef(p) + k);
      if (!bl) return confirm(`繁殖：P${c}を支払い${cf(1)}。実行しますか？`) && submit({ pid: p.id, type: 'breed' });
      if (R0.mbMode !== 'multi') { const r = await ask(`繁殖（${cf(1)}）`, [{ type: 'select', name: 'pay', label: '支払い', value: p.P >= c ? 'P' : 'L', options: [{ value: 'P', label: `個体数 P${c}` }, { value: 'L', label: `生命核 L${bl}（身体の投入回数に数える）` }] }]); if (!r) return; return submit({ pid: p.id, type: 'breed', pay: r.pay }); }
      // T14（第71部 §19 S-c）：P 払いの段と生命核払いの段を同時に（それぞれ 1 段・増殖暴走の強で 2 段）
      const mx = G.breedMaxN(p); const left = R0.breed.length - p.breed; const nOpts = (unit, have, each) => Array.from({ length: Math.min(mx, left) + 1 }, (_, i) => ({ value: String(i), label: i === 0 ? 'なし' : `${i} 段（${unit}${each * i}）`, disabled: have < each * i }));
      const r = await ask(`繁殖（あと ${left} 段・${cf(1)}〜）`, [{ type: 'select', name: 'nP', label: '個体数で', value: p.P >= c ? '1' : '0', options: nOpts('P', p.P, c) }, { type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: (p.P < c && p.L >= bl) ? '1' : '0', options: nOpts('L', p.L, bl) }], { note: `個体数と生命核の段を同時に行えます（それぞれ ${mx} 段まで${mx === 1 ? '・増殖暴走の強で 2 段' : ''}・合計はあと ${left} 段まで）` }); if (!r) return;
      return submit({ pid: p.id, type: 'breed', nP: +r.nP, nL: +r.nL }); }
    if (id === 'ORG') return toast('器官の場のカードをクリックしてください');
    if (id === 'TRT' || id === 'TRT2') return toast('形質プールのカードをクリックしてください（獲得枠はダイアログで選べます）');
    if (s.group === 'mass') {
      if (id === 'MI') { const RM = G.RULESETS[st.rules || 'v1']; const r = await ask(`淘汰(知性)：G${RM.miMaxCost || 4}以下の形質${RM.miMaxCost ? (RM.miCount || 1) + '種' : 'を異なる2種'}`, [{ type: 'multi', name: 'traits', label: `形質（${RM.miCount || 2}つまで。PC は Ctrl キーを押しながらクリック、スマホはタップで選択）`, options: G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RM.miMaxCost || 4) && !G.trait(p, t)).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}` })) }], { note: `コスト P${G.massCost(p, 'MI')}` }); if (!r) return; return submit({ pid: p.id, type: 'mass', kind: 'MI', traits: r.traits.slice(0, RM.miCount || 2) }); }
      const mc = G.massCost(p, id), floor = G.RULESETS[st.rules || 'v1'].massMin[id === 'MB' ? 'body' : 'other'];
      const usedM = G.slotUsedBy(st, id) !== undefined; const byL = usedM && G.bypassable(st, id, p) && p.L > 0;
      const bcC = G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2; const byC = usedM && !byL && G.coopBypassable(st, id, p) && p.coop >= bcC; // bypassCoopWide：使用済みの大量消費を協調発進で（緊急発進が使えるときはそちらを優先）
      return confirm(`${s.name}：P${mc}を支払います${mc === floor ? `（軽減後の下限P${floor}）` : ''}${byL ? '。使用済みのため緊急進出（生命核-1）で実行します' : byC ? `。使用済みのため協調進出（協調-${bcC}）で実行します` : ''}。実行しますか？`) && submit({ pid: p.id, type: 'mass', kind: id, bypassL: byL, bypassCoop: byC });
    }
    if (id === 'GEM') { const usedG = G.slotUsedBy(st, id) !== undefined; const byL = usedG && G.bypassable(st, id, p) && p.L > 0; const r = await ask(G.RULESETS[st.rules || 'v1'].tribute ? '献上（遺伝子）' : '宝石セット得点カード', [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: `コスト G${G.gemsetPrice(p)} → ${G.tribOutText(st, 'G')}（現在 ${p.gemsets}・${G.tribLimitText(st)}）${byL ? '／使用済みのため緊急進出（生命核-1）で実行' : ''}` }); if (!r) return; return submit({ pid: p.id, type: 'gemset', useL: +r.useL, bypassL: byL }); }
    if (id === 'TE' || id === 'TP') return confirm(`${G.SLOT_BY_ID[id].name}：${G.slotText(st, id)}。実行しますか？`) && submit({ pid: p.id, type: 'tributeSlot', slot: id });
    if (id === 'TO' && G.RULESETS[st.rules || 'v1'].toLineage) { const RT = G.RULESETS[st.rules || 'v1']; const ls = st.shared.lineages.filter(l => G.lineageCount(p, l) < 3); if (!ls.length) return toast('3 段目まで形成できる系統がありません', true); // T15：系統 1 つを 1 段目の定価で 3 段目まで
      const c1 = (l) => ((RT.organCostBy || {})[l] || RT.organCost || G.ORGAN_COST)[0]; const lab = (l) => { const n = G.lineageCount(p, l); const ids = [n + 1, n + 2, n + 3].filter(t => t <= 3).map(t => l + t); return `${G.LINEAGES[l]}：${ids.map(x => `${x} ${G.ORGANS[x].name}`).join(' → ')}（E${c1(l)[0]}+G${c1(l)[1]}）`; };
      const r = await ask('器官の恩寵：系統 1 つを 1 段目の定価で 3 段目まで', [{ type: 'select', name: 'lin', label: '系統', options: ls.map(l => ({ value: l, label: lab(l), disabled: p.G < c1(l)[1] || p.E + p.L * (p.lValue || G.sc(st, 3)) < c1(l)[0] })) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }, resSel('liRes', '連結の資源（好きな資源の器官のとき）')], { note: G.slotTip(st, id) }); if (!r) return;
      return submit({ pid: p.id, type: 'tributeSlot', slot: id, lin: r.lin, useL: +(r.useL || 0), liRes: r.liRes, regimeRes: 'E' }); }
    if (id === 'TO') { const bl = st.shared.organField.filter(o => G.organCost(st, p, o)); if (!bl.length) return toast('今形成できる器官がありません', true); const lab = (o) => `${o} ${G.ORGANS[o].name}（${otxt(G.ORGANS[o], true)}）`; const r = await ask('器官の恩寵：器官1枚を無料（＋もう1枚を半額）', [{ type: 'select', name: 'organ', label: '無料で形成', options: bl.map(o => ({ value: o, label: lab(o) })) }, { type: 'select', name: 'organ2', label: '半額で形成（任意）', options: [{ value: '', label: 'なし' }].concat(st.shared.organField.filter(o => !G.organ(p, o)).map(o => ({ value: o, label: lab(o) }))) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに（2枚目）', options: lOpts(p) }], { note: G.slotTip(st, id) + '。2枚目は1枚目を形成した後に形成できる物（同じ系統の次の段も可）' }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, organ: r.organ, organ2: r.organ2 || undefined, useL: +r.useL, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }); }
    if (id === 'TT') { const RT = G.RULESETS[st.rules || 'v1'].tribute.slots.TT; const un = G.traitPool(st).filter(t => !G.trait(p, t)); if (!un.length) return toast('取得できる形質がありません', true); const r = await ask(`形質の恩寵（G${G.sc(st, RT.G || 0)}）：形質${RT.n || 2}枚まで無料`, [{ type: 'multi', name: 'traits', label: `形質（${RT.n || 2}枚まで・Ctrlで複数選択）`, options: un.map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}${st.shared.traitFirst[t] === undefined ? '（強）' : '（弱）'}` })) }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, traits: r.traits, useL: +r.useL, res: 'E', track: 'intel' }); }
    if (id === 'TA') { const have = G.TRACKS.filter(t => p.gems[t] > 0); if (!have.length) return toast('替える宝石がありません', true); const col = (name, label) => ({ type: 'select', name, label, value: G.TRACKS.find(t => t !== have[0]), options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }); const r = await ask('錬金：宝石の色を2個まで替える', [{ type: 'select', name: 'f1', label: '1個目：替える宝石', options: have.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${p.gems[t]}個）` })) }, col('t1', '1個目：替えた後の色'), { type: 'select', name: 'f2', label: '2個目：替える宝石（任意）', options: [{ value: '', label: 'なし' }].concat(have.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${p.gems[t]}個）` }))) }, Object.assign(col('t2', '2個目：替えた後の色'), { when: v => !!v.f2 })], { note: `コンボ：${G.comboNames(st).join('／')}` }); if (!r) return; const ch = [{ from: r.f1, to: r.t1 }]; if (r.f2) ch.push({ from: r.f2, to: r.t2 }); return submit({ pid: p.id, type: 'tributeSlot', slot: id, changes: ch }); }
    if (id === 'TB') { const RB = G.RULESETS[st.rules || 'v1'].tribute.slots.TB; if (!RB.instant) return confirm(`神の加護：${G.slotText(st, id)}（協調ボーナスとコストはそのまま）。実行しますか？`) && submit({ pid: p.id, type: 'tributeSlot', slot: id }); const opts = G.RES_SLOTS.concat(['PB']).map(s => ({ value: s, label: G.SLOT_BY_ID[s].name + '：' + G.slotText(st, s) + (G.slotUsedBy(st, s) !== undefined ? '（使用済みでも可）' : '') })); const r = await ask('神の加護：資源枠1つを今すぐ（倍）＋残りの手番は資源枠が倍', [{ type: 'select', name: 'res', label: '今すぐ実行する資源枠', options: opts }, Object.assign(resSel('coopRes', '協調ボーナスの資源（資源合成用）'), { when: v => v.res === 'ALL' && p.coop > 0 })], { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, res: r.res, coopRes: r.coopRes }); }
    if (id === 'TJ') { const ok = G.TRACKS.filter(t => G.stepCost(p, t) !== null); if (!ok.length) return toast('進められるトラックがありません', true); const opt = ok.map(t => ({ value: t, label: `${G.TRACK_INFO[t].name}（Lv${p.lv[t]}→${p.lv[t] + 1}・${p.lv[t] === 5 && G.lv6CostText(st, t) ? G.lv6CostText(st, t) + '〔そのトラックの資源・割引なし〕' : 'E' + G.stepCost(p, t)}）` })); /* 2026-11-06 ユーザー指摘（T10-H3）：Lv5→6 を E63 と表示していた（実際の支払いは色別＝G42／協調8／L5／E90。stepCost は E 換算の目安） */ const r = await ask('跳躍：進化2回（ワーカー必須）', [{ type: 'select', name: 't1', label: '1回目', options: opt }, { type: 'select', name: 't2', label: '2回目（同じでも可・同じなら次の段の値段）', options: opt }, { type: 'select', name: 'useL', label: '生命核をEの代わりに（1回目）', options: lOpts(p) }], { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, tracks: [r.t1, r.t2], useL: +r.useL }); }
    if (id === 'TR') { const r = await ask('恩寵枠（宝石）：痕跡+1', [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }], { note: G.slotText(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, track: r.track }); }
    if (id === 'MIM') { const o = G.mimicOptions(st, p); if (!o.length) return toast('模倣できる !効果にまだ誰も到達していません（身体Lv2 の ◆L+1 は対象外）', true); const c = G.gSlotCost(p, G.RULESETS[st.rules || 'v1'].mimicCost || 4); const r = await ask(`模倣（G${c}）`, [{ type: 'select', name: 'effect', label: '到達済みの即時効果', options: o.map(e => ({ value: e.id, label: rtxt(e.label) })) }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }]); if (!r) return; return submit({ pid: p.id, type: 'mimic', effect: r.effect, useL: +r.useL }); }
    if (id === 'EXP') { const c = G.gSlotCost(p, G.RULESETS[st.rules || 'v1'].expressCost || 10); const bcE = G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2; const byCE = G.slotUsedBy(st, id) !== undefined && G.coopBypassable(st, id, p) && p.coop >= bcE; const r = await ask(`発現（G${c}）：痕跡+1${byCE ? `／使用済みのため協調進出（協調-${bcE}）で実行` : ''}`, (G.RULESETS[st.rules || 'v1'].noCombo ? [] : [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }]).concat([{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }])); if (!r) return; return submit({ pid: p.id, type: 'express', track: r.track || 'body', useL: +r.useL, bypassCoop: byCE }); } /* 2026-10-29 色の廃止：色の選択なし */
    if (id === 'SCAN') { const cands = G.scanCandidates(st, p); if (!cands.length) return toast('参照できる他プレイヤーがいません（全員Lv1）', true); const scanE = Math.max(G.sc(st, 1), G.sc(st, 5) - (p.scanDisc || 0)); const scanN = (c) => (G.TRACK_INFO[c.track].res === 'coop' && G.RULESETS[st.rules || 'v1'].scanCoop !== undefined) ? G.RULESETS[st.rules || 'v1'].scanCoop : c.lv * G.sc(st, 2); const r = await ask(`探索（E${scanE}）`, [{ type: 'select', name: 'tgt', label: '参照先', options: cands.map((c, i) => ({ value: i, label: `${st.players[c.pid].name} の ${G.TRACK_INFO[c.track].name} Lv${c.lv} → ${RES_JP[G.TRACK_INFO[c.track].res]}+${scanN(c)}` })) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }]); if (!r) return; return submit({ pid: p.id, type: 'scan', target: cands[+r.tgt], useL: +r.useL }); } // 2026-11-05 ユーザー指摘：E5・Lv×2 と基準単位のままだった（実際は E15・Lv×6）
    if (id === 'ADP') { const lows = G.TRACKS.filter(t => p.lv[t] === 1); if (!lows.length) return toast('Lv1のトラックがありません', true); const r = await ask('適応進化（生命核1・ワーカー必須）', [{ type: 'select', name: 'track', label: 'Lv1のトラック', options: lows.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }]); if (!r) return; return submit({ pid: p.id, type: 'adapt', track: r.track }); }
    if (id === 'CNV') { const r = await ask('資源変換（1アクション1種類）', [{ type: 'select', name: 'kind', label: '変換', options: [{ value: 'EG', label: `E${G.sc(st, 2)}→G${G.sc(st, 1)}` }, { value: 'GE', label: `G${G.sc(st, 2)}→E${G.sc(st, 1)}` }, { value: 'PE', label: `P${G.sc(st, 8)}→E${G.sc(st, 3)}` }, { value: 'PG', label: `P${G.sc(st, 8)}→G${G.sc(st, 2)}` }] }, { type: 'number', name: 'n', label: '回数', value: 1, min: 1, max: 20 }]); if (!r) return; return submit({ pid: p.id, type: 'convert', kind: r.kind, n: r.n }); }
    if (id === 'RST') { const c = restoreCands(p); if (!c.length) return toast('復元できる形質がありません（他の人が強で取った形質で、自分が持っていないもの）', true); const RT = G.RULESETS[st.rules || 'v1'];
      const opts = c.map(t => { const tw = (RT.traitCosts || {})[t] || G.TRAITS[t].cost; const g = G.traitCost(st, p, t, 0, true).G + Math.max(0, tw[0] - tw[1]); return { value: t, label: `${t} ${G.TRAITS[t].name}（G${g}＋E${RT.restore.E}）：${rtxt(G.traitText(st, t, true))}` }; });
      const r = await ask('復元：取られた強の形質を強の効果で取る（1人1回）', [{ type: 'select', name: 'trait', label: '形質', options: opts }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: G.slotTip(st, id) }); if (!r) return;
      return submit({ pid: p.id, type: 'restore', trait: r.trait, useL: +(r.useL || 0), res: 'E', track: 'intel' }); }
    if (id === 'BST') { const cs = burstCands(p); if (!cs.length) return toast('急速形成できる系統がありません（同じ系統で続けて形成できる器官が 2 枚以上ない）', true); // T14 一気立て
      const costOf = (seq) => { let e = 0, g = 0; const each = {}; const q = JSON.parse(JSON.stringify(p)); seq.forEach(id => { const c = G.organCost(st, q, id, true); if (c) { e += c.E; g += c.G; each[id] = `E${c.E}${c.G ? '+G' + c.G : ''}`; } q.organs.push({ id, strong: true }); }); return { e, g, each }; }; // 2026-11-10 v3.90（ユーザー指摘）：1 枚ごとの値段（追随の代償込み）も出す
      const r = await ask('急速形成：同じ系統の器官を形態の順に続けて形成（ワーカー 1）', [{ type: 'select', name: 'seq', label: '形成する器官', options: cs.map(seq => { const k = costOf(seq); return { value: seq.join(','), label: `${G.LINEAGES[G.ORGANS[seq[0]].lin]}：${seq.map(id => `${id} ${G.ORGANS[id].name} ${k.each[id] || ''}`).join(' → ')}（計 E${k.e}+G${k.g}）`, disabled: p.E + p.L * (p.lValue || G.sc(st, 3)) < k.e || p.G < k.g }; }) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }, { type: 'select', name: 'liRes', label: '連結の資源（好きな資源の器官のとき）', options: ['E', 'G', 'P'].map(v => ({ value: v, label: v })) }], { note: G.slotTip(st, id) + '。各器官の値段と追随の代償を払い、形成時の効果はそれぞれ発動します' }); if (!r) return;
      { const seq = r.seq.split(','), k = costOf(seq), lv = p.lValue || G.sc(st, 3); let uL = +(r.useL || 0); // 2026-11-09 ユーザー指摘：E が足りないとき 1 枚ぶんの不足が出ていた → 合計で判定し、生命核で足りるなら確認して使う（建造時に得る E も含めて試す）
        const tryL = (n) => { try { G.tryApply(st, { pid: p.id, type: 'burst', organs: seq, useL: n, liRes: r.liRes }); return true; } catch (e) { return false; } };
        if (!tryL(uL)) { let n = uL + 1; while (n <= p.L && !tryL(n)) n++; if (n <= p.L) { if (!confirm(`急速形成は合計 E${k.e}+G${k.g}（定価）。E が足りないので、生命核を ${n} 個（=E${n * lv}）使います。よろしいですか？`)) return; uL = n; } }
        return submit({ pid: p.id, type: 'burst', organs: seq, useL: uL, liRes: r.liRes }); } }
    if (id === 'AMP') { const c = amplifyCands(p); if (!c.length) return toast(`増幅できる器官がありません（${G.ampTargetText(st)}で未増幅のもの）`, true); const AM = G.RULESETS[st.rules || 'v1'].amplify;
      const r = await ask(`増幅（E${G.ampE(p)}・1人1回）：器官1つの効果を以後2倍`, [{ type: 'select', name: 'organ', label: '器官', options: c.map(o => ({ value: o, label: `${o} ${G.ORGANS[o].name}：${otxt(o, true)}` })) }], { note: G.slotTip(st, id) + '。まだ形成していない器官は、形成のダイアログで「形成と同時に増幅」を選べます（手番は形成の1つだけ）。' }); if (!r) return;
      return submit({ pid: p.id, type: 'amplify', organ: r.organ }); }
    if (id === 'PASS') { if (!confirm('パスします（何も得ず、ワーカーを1個使います）。置ける場所が無いときだけ使ってください。')) return; return submit({ pid: p.id, type: 'pass' }); }
    if (id === 'GTH') { const g = G.RULESETS[st.rules || 'v1'].gather || {}; const r = await ask('採集（弱い資源・手番1つ）', [{ type: 'select', name: 'res', label: '得るもの', options: [{ value: 'E', label: `エネルギー +${g.E}` }, { value: 'G', label: `遺伝子 +${g.G}` }, { value: 'P', label: `個体数 +${g.P}` }, { value: 'coop', label: `協調 +${g.coop}（P${g.coopCostP || 0} を払う）`, disabled: p.P < (g.coopCostP || 0) }] }], { note: '他に置ける場所が無いときの逃げ道です。資源枠より少ない量しか得られません（協調は群体枠と同じ P を払い、資源は付きません）。' }); if (!r) return; return submit({ pid: p.id, type: 'gather', res: r.res }); }
    if (id === 'RSV') { const RV = G.RULESETS[st.rules || 'v1']; const r = await ask('予備動員（無料）', [{ type: 'select', name: 'res', label: '獲得', options: [{ value: 'E', label: `E+${RV.reserveE || 2}` }, { value: 'G', label: `G+${RV.reserveG || 1}` }] }]); if (!r) return; return submit({ pid: p.id, type: 'reserve', res: r.res }); }
  }
  async function onOrgan(p, id) {
    const c = G.organCost(st, p, id); if (!c) return toast('今は形成できません（系統内は形態の順・形成済み）', true);
    const fields = [{ type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }];
    if (p.altFuel) fields.push({ type: 'select', name: 'payP', label: '代替燃料（EをPで払う）', options: [{ value: '', label: `Eで払う（E${c.E}）` }, { value: 'P', label: `Pで払う（P${G.altFuelP(p, c.E)}）${p.P < G.altFuelP(p, c.E) ? '・P不足' : ''}` }] }); // 第42部 N5
    { const R2 = G.RULESETS[st.rules || 'v1']; if (R2.organFx === 2) { if (G.ORGANS[id].lin === 'Li' && (R2.liRes || [])[G.ORGANS[id].tier - 1]) fields.push(resSel('li2Res', R2.liMode === 'lineage' ? (G.ORGANS[id].tier === 3 ? `${G.ORGANS[id].name}の資源（完成した系統 ${st.shared.lineages.filter(l => G.lineageDone(p, l)).length + 1}×${(R2.liPer || [])[2]}）` : `${G.ORGANS[id].name}の資源（+${(R2.liPer || [])[G.ORGANS[id].tier - 1]}）`) : `${G.ORGANS[id].name}の資源（器官 ${Math.min(R2.liCap || 99, p.organs.length + 1)} 枚×${(R2.liPer || [])[G.ORGANS[id].tier - 1]}）`)); } // T18：統合体＝完成した系統の数（この形成で連結が完成する分 +1） // T13 連結＝建造時に枚数ぶん
      else { if (G.organ(p, 'Li2')) fields.push(resSel('li2Res', '共役組織の資源'));
        if (G.organ(p, 'Li3') && G.lineageCount(p, G.ORGANS[id].lin) === 2) fields.push(resSel('li3Res', '統合体の資源（系統完成）')); } }
    const lins = new Set(p.organs.map(o => G.ORGANS[o.id].lin)); lins.add(G.ORGANS[id].lin); if (lins.size >= 4 && !p.regime) fields.push(resSel('regimeRes', '4 系統そろえた収入+1の資源'));
    { const AM = G.RULESETS[st.rules || 'v1'].amplify; if (AM && !(p.uses && p.uses.amplify) && !p.ampReserve && G.ampOk(st, id, false)) fields.push({ type: 'select', name: 'amp', label: '形成と同時に増幅', options: [{ value: '', label: 'しない' }, { value: '1', label: `する（+E${G.ampE(p)}・1人1回・この器官の効果が以後2倍）`, disabled: p.E < c.E + G.ampE(p) }] }); } // v3.66
    const r = await ask(`器官形成 ${id} ${G.ORGANS[id].name}`, fields, { note: `${c.diff ? `差額 E${c.E} G${c.G}（定価 E${c.list.E}+G${c.list.G} − 前の段 E${c.diff.E}+G${c.diff.G}${c.first ? '' : '・追随の代償込み'}）` : `コスト E${c.E}${c.G ? '+G' + c.G : ''}`}（${G.RULESETS[st.rules || 'v1'].organSameEffect ? (c.first ? '先駆' : '代償') : (c.strong ? '強' : '弱')}）：${otxt(id, c.strong)}` }); if (!r) return;
    submit({ pid: p.id, type: 'organ', organ: id, useL: r.payP === 'P' ? 0 : +r.useL, payP: r.payP === 'P', amp: r.amp === '1', li2Res: r.li2Res, li3Res: r.li3Res, regimeRes: r.regimeRes });
  }
  // 使用済み枠の突破手段（緊急発進＝L1／協調発進＝協調2・拡張x1）。手段が無ければ null
  function bypassField(p) {
    const o = [...(p.mimic && !p.round.mimicUsed ? [{ value: 'mimic', label: p.mimic === 'E3' ? `擬態（E${G.sc(st, 3)}）` : '擬態（無償）' }] : []), ...(p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree ? [{ value: 'L', label: '緊急進出（生命核-1）' }] : []), ...(st.ext === 'x1' && p.coop >= (G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2) ? [{ value: 'coop', label: `協調進出（協調-${G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2}）` }] : [])];
    return o.length ? { type: 'select', name: 'bypass', label: '使用済み枠の突破', options: o } : null;
  }
  // 形質購入に使う枠と突破手段の既定（通常枠→割増枠→緊急発進→協調発進）。拡張なしで通常枠が使用済みなら null
  function traitPlan(p) {
    if (G.RULESETS[st.rules || 'v1'].traitShared) return { slot: 'TRT' };
    const free = (s) => G.slotUsedBy(st, s) === undefined;
    if (free('TRT')) return { slot: 'TRT' };
    if (st.ext !== 'x1') return null;
    if (free('TRT2') && p.E >= st.round) return { slot: 'TRT2' };
    if (p.L > 0) return { slot: 'TRT', bypassL: true };
    if (p.coop >= (G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2)) return { slot: 'TRT', bypassCoop: true };
    return null;
  }
  function traitSlotFields(p) { // 拡張x1：購入枠の選択＋（使用済み枠なら）突破手段
    if (st.ext !== 'x1' || G.RULESETS[st.rules || 'v1'].traitShared) return [];
    const usedBy = (s) => { const u = G.slotUsedBy(st, s); return u === undefined ? '' : `（${st.players[u].name} 使用済み）`; };
    const pl = traitPlan(p) || { slot: 'TRT' };
    const f = [{ type: 'select', name: 'slot', label: '獲得枠', value: pl.slot, options: [{ value: 'TRT', label: '通常枠' + usedBy('TRT') }, { value: 'TRT2', label: `割増枠（＋E${st.round}）` + usedBy('TRT2') }] }];
    const bf = bypassField(p); if (bf) f.push(Object.assign(bf, { when: v => G.slotUsedBy(st, v.slot) !== undefined }));
    return f;
  }
  const slotArgs = (r) => { const slot = r.slot || 'TRT'; const used = G.slotUsedBy(st, slot) !== undefined; return { slot, bypassL: used && r.bypass === 'L', bypassCoop: used && r.bypass === 'coop' }; };
  async function onTrait(p, id) {
    if (G.trait(p, id)) {
      if (G.RULESETS[st.rules || 'v1'].noUpgrade) return toast('取得済みです（この数値セットでは強化はありません）');
      const from = id; const targets = G.TRAIT_ORDER.filter(t => !G.trait(p, t) && G.TRAITS[t].cost[0] > G.TRAITS[from].cost[0]);
      if (!targets.length) return toast('強化先がありません', true);
      const r = await ask(`形質強化：${from} を手放して上位へ`, [{ type: 'select', name: 'to', label: '上位形質', options: targets.map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（表示G${G.TRAITS[t].cost[0]}/${G.TRAITS[t].cost[1]}）` })), desc: traitDesc(p, 'to') }, ...traitSlotFields(p), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel('to'), daSel('to')], { note: 'コスト＝表示コストの差額＋G1（下限G1）。即時効果の形質は手放せません' }); if (!r) return;
      return submit(Object.assign({ pid: p.id, type: 'upgrade', from, to: r.to, useL: +r.useL, res: r.res, track: r.track }, slotArgs(r)));
    }
    const c = G.traitCost(st, p, id); const cw = G.traitCost(st, p, id, undefined, true); const choice = G.RULESETS[st.rules || 'v1'].traitChoice && c.strong;
    const r = await ask(`形質獲得 ${id} ${G.TRAITS[id].name}`, [...(choice ? [{ type: 'select', name: 'ver', label: '版', options: [{ value: 'S', label: `強（G${c.G}）：${rtxt(G.traitText(st, id, true))}` }, { value: 'W', label: `弱（G${cw.G}）：${rtxt(G.traitText(st, id, false))}` }] }] : []), ...traitSlotFields(p), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, ...(id === 'IM' ? [imSel()] : []), ...(id === 'DA' ? [daSel()] : [])], { note: `コスト G${c.G}（${c.strong ? '強' : '弱'}）：${rtxt(G.traitText(st, id, c.strong))}` }); if (!r) return; // 2026-11-05 v3.63：購入ダイアログの弱の文言も G.traitText（T10 の新効果が旧文のままだった）
    submit(Object.assign({ pid: p.id, type: 'trait', trait: id, useL: +r.useL, res: r.res, track: r.track, weak: choice && r.ver === 'W' }, slotArgs(r)));
  }
  async function onCard(p, c) {
    if (c === 'J') { const r = await ask('カードJ 資源→P変換', [{ type: 'select', name: 'choice', label: '変換', options: [{ value: 'E', label: 'E-2 → P+6' }, { value: 'G', label: 'G-1 → P+5' }] }]); if (!r) return; return submit({ pid: p.id, type: 'card', card: c, choice: r.choice }); }
    submit({ pid: p.id, type: 'card', card: c });
  }
  async function onStAct(p, o) {
    const strong = o.strong; const fields = [];
    if (o.id === 'St1') fields.push({ type: 'number', name: 'pe', label: `P→E（2:1・最大P${G.ST_CAPS.St1[strong ? 0 : 1]}）支払うP`, value: Math.min(p.P, G.ST_CAPS.St1[strong ? 0 : 1]), min: 2, max: 99 });
    if (o.id === 'St2') fields.push({ type: 'number', name: 'pg', label: `P→G（3:1・最大P${G.ST_CAPS.St2[strong ? 0 : 1]}）支払うP`, value: Math.min(p.P, G.ST_CAPS.St2[strong ? 0 : 1]), min: 3, max: 99 });
    if (o.id === 'St3') { fields.push({ type: 'number', name: 'pe', label: `P→E（2:1・最大P${G.ST_CAPS.St3[0]}）支払うP`, value: 0, min: 0, max: 99 }); fields.push({ type: 'number', name: 'pg', label: `P→G（3:1・最大P${G.ST_CAPS.St3[1]}）支払うP`, value: 0, min: 0, max: 99 }); }
    const r = await ask(`${o.id} ${G.ORGANS[o.id].name}`, fields, { note: otxt(o.id, strong) + '（端数は切り捨て）' }); if (!r) return;
    submit({ pid: p.id, type: 'stAct', organ: o.id, pe: r.pe | 0, pg: r.pg | 0 });
  }
  async function onLToRes(p) { const lv = p.lValue || G.sc(st, 3); const r = await ask('生命核→資源（手番消費なし）', [{ type: 'select', name: 'res', label: '換える先', options: [{ value: 'E', label: `エネルギー（L1＝E${lv}）` }, { value: 'G', label: `遺伝子（L1＝G${lv}）` }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: p.L }], { note: `所持 L${p.L}。払った個数は身体トラックの素材（投入）に数えます。` }); if (!r) return; submit({ pid: p.id, type: 'lToRes', res: r.res, n: r.n }); }
  async function onFreeConv(p) { const r = await ask('無料E↔G変換', [{ type: 'select', name: 'dir', label: '方向', options: [{ value: 'EG', label: 'E→G' }, { value: 'GE', label: 'G→E' }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: 99 }]); if (!r) return; submit({ pid: p.id, type: 'freeConv', dir: r.dir, n: r.n }); }

  let pendingBusy = false;
  async function handlePending(p, pd) {
    if (pendingBusy) return; pendingBusy = true;
    try { await handlePendingBody(p, pd); } finally { pendingBusy = false; } // 送信の完了（await）まで待ってから解放する（return submit(...) だと finally が先に走る）
    // 送信中の再描画は pendingBusy で弾かれるため、次の保留が残っていればここで描画し直して続きのダイアログを出す
    const q = st && st.players[p.id]; if (q && q.pending.length && st.phase === 'play' && G.cur(st).id === q.id) setTimeout(render, 0);
  }
  async function handlePendingBody(p, pd) {
    {
      if (pd.type === 'flSwap') {
        const r = await ask(`収入時の転流：E↔Gを最大${pd.max}振替（1:1）`, [{ type: 'select', name: 'dir', label: '方向', options: [{ value: 'EG', label: 'E→G' }, { value: 'GE', label: 'G→E' }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: pd.max }], { skipLabel: '振替しない', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', dir: r.dir, n: r.n });
      }
      if (pd.type === 'dgBuy') {
        const r = await ask(`ラウンド開始時：遺伝子図書館で形質1枚を-${pd.disc}Gで獲得`, [traitPickSel(p, pd.disc), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel(pickId), daSel(pickId)], { skipLabel: '買わない', noCancel: true, note: '手番（ワーカー）は消費しません。買っても買わなくても、この後ふつうに行動できます（残りワーカーはヘッダで確認できます）。' }); // 2026-11-05 ユーザーの疑問「手番を消費していた気がする」→ 手番の冒頭に挟まるだけで消費しない旨を明記
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit(Object.assign({ pid: p.id, type: 'resolve', useL: +r.useL, res: r.res, track: r.track }, pickArgs(r)));
      }
      if (pd.type === 'specialOrgan') { const ls = st.shared.special || []; const r = await ask('代謝 Lv4：残っている特殊器官から 1 枚取る（器官 1 枚に数える）', [{ type: 'select', name: 'organ', label: '特殊器官', options: ls.map(o => ({ value: o, label: `${G.ORGANS[o].name}：${G.spText(G.RULESETS[st.rules || 'v1'], o)}` })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', organ: r.organ }); } // T15
      if (pd.type === 'fkBreed') { const R0 = G.RULESETS[st.rules || 'v1']; const c = G.breedCost(p); if (c === null) return submit({ pid: p.id, type: 'resolve', skip: true }); const bl = R0.breedL || 0; const mx = G.breedMaxN(p); const left = R0.breed.length - p.breed; // T15 孵化核
        const nOpts = (unit, have, each) => Array.from({ length: Math.min(mx, left) + 1 }, (_, i) => ({ value: String(i), label: i === 0 ? 'なし' : `${i} 段（${unit}${each * i}）`, disabled: have < each * i }));
        const r = await ask('孵化核：繁殖を 1 回、手番なしで（支払いは通常）', [{ type: 'select', name: 'nP', label: '個体数で', value: p.P >= c ? '1' : '0', options: nOpts('P', p.P, c) }].concat(bl ? [{ type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: (p.P < c && p.L >= bl) ? '1' : '0', options: nOpts('L', p.L, bl) }] : []), {}); if (!r || r.__skip || (+r.nP + +(r.nL || 0)) === 0) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', nP: +r.nP, nL: +(r.nL || 0) }); }
      if (pd.type === 'freeMass') {
        const r = await ask('身体Lv3★先駆：淘汰を1回無料（排他無視）', [{ type: 'select', name: 'kind', label: '種類', options: ['MB', 'MI', 'MS', 'MM'].map(k => ({ value: k, label: G.SLOT_BY_ID[k].name + '：' + G.SLOT_BY_ID[k].text })) }, { type: 'multi', name: 'traits', label: '（知性のとき）G4以下の形質2種', options: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}` })) }], { noCancel: true });
        if (!r) return; return submit({ pid: p.id, type: 'resolve', kind: r.kind, traits: r.traits });
      }
      if (pd.type === 'rewardTrait') {
        if (pd.freeMax) { // T13 全転写：G15 以下の形質 1 枚を無料（強が残っていれば強）
          const RT = G.RULESETS[st.rules || 'v1']; const wo = !!pd.weakOnly; const opts = G.traitPool(st).filter(t => !G.trait(p, t) && ((RT.traitCosts || {})[t] || G.TRAITS[t].cost)[wo ? 1 : 0] <= pd.freeMax).map(t => { const s = G.traitCost(st, p, t); return { value: t, label: `${t} ${G.TRAITS[t].name}（${wo ? '弱' : s.strong ? '強' : '弱'}・無料）` }; }); // T14 転写体（weakOnly）＝弱の値段が G12 以下・弱で受け取る
          if (!opts.length) return submit({ pid: p.id, type: 'resolve', skip: true });
          const r = await ask(wo ? `転写体：弱の値段が G${pd.freeMax} 以下の形質 1 枚を弱で無料` : `全転写：G${pd.freeMax} 以下の形質 1 枚を無料で（強が残っていれば強）`, [{ type: 'select', name: 'trait', label: '形質', options: opts, desc: (v) => v.trait ? `${wo ? '弱' : G.traitCost(st, p, v.trait).strong ? '強' : '弱'}：${rtxt(G.traitText(st, v.trait, wo ? false : G.traitCost(st, p, v.trait).strong))}` : '' }], { skipLabel: '見送る', noCancel: true });
          if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', trait: r.trait, useL: 0, res: 'E', track: 'body' });
        }
        if (viewP(p).nextTraitFree) { // T10：弱なら無料・強は差額。2026-11-07 ユーザー指摘：弱が選択肢に無く（強の差額だけ）、表題も旧文「G-3」だった
          const opts = []; G.traitPool(st).filter(t => !G.trait(p, t)).forEach(t => { const s = G.traitCost(st, p, t), w = G.traitCost(st, p, t, undefined, true); if (s.strong) opts.push({ value: t + ':S', label: `${t} ${G.TRAITS[t].name} 強（G${s.G}）` }); opts.push({ value: t + ':W', label: `${t} ${G.TRAITS[t].name} 弱（G${w.G}）` }); });
          const r = await ask('知性Lv3★先駆：今すぐ形質1枚（弱なら無料・強は差額）', [{ type: 'select', name: 'pick', label: '形質', options: opts, desc: (v) => { if (!v.pick) return ''; const [t, ver] = v.pick.split(':'); return `${ver === 'S' ? '強' : '弱'}：${rtxt(G.traitText(st, t, ver === 'S'))}`; } }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { skipLabel: '見送る', noCancel: true });
          if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); const [t, ver] = r.pick.split(':'); return submit({ pid: p.id, type: 'resolve', trait: t, weak: ver === 'W', useL: +r.useL, res: 'E', track: 'body' });
        }
        const r = await ask(`知性Lv3★先駆：今すぐ形質1枚をG-${pd.disc}で獲得できます`, [traitPickSel(p, pd.disc), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel(pickId), daSel(pickId)], { skipLabel: '見送る', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit(Object.assign({ pid: p.id, type: 'resolve', useL: +r.useL, res: r.res, track: r.track }, pickArgs(r)));
      }
      if (pd.type === 'cvIncome') { const r = await ask(`収斂膜：好きな資源+${pd.n}`, [resSel('res', '資源')], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', res: r.res }); }
      if (pd.type === 'lYield') { const r = await ask(`生命核の産出：+${pd.n}（${pd.opts.join('/')} から選択）`, [{ type: 'select', name: 'res', label: '資源', options: pd.opts.map(k => ({ value: k, label: RES_JP[k] })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', res: r.res }); }
      if (pd.type === 'wildColor') { const r = await ask('共鳴膜：ワイルド扱いにする色（自分の2色コンボ判定）', [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', track: r.track }); }
      if (pd.type === 'reMilestone') { const ms = G.reachedMilestones(p); const r = await ask(`${G.ORGANS[pd.organ].name}：到達済み報酬を再発動（${pd.organ === 'Re3' && pd.strong ? '強版' : '弱版'}）`, [{ type: 'select', name: 'm', label: '報酬', options: ms.map((m, i) => ({ value: i, label: `${G.TRACK_INFO[m.track].name} Lv${m.lv}★：${G.TRACK_REWARDS[m.track][m.lv]}` })) }], { noCancel: true }); if (!r) return; const m = ms[+r.m]; return submit({ pid: p.id, type: 'resolve', track: m.track, lv: m.lv }); }
      if (pd.type === 'learn') { const o = G.mimicOptions(st, p); const noColor = !!G.RULESETS[st.rules || 'v1'].noCombo; const opts = (noColor ? ['body'] : G.TRACKS).map(t => ({ value: 'express:' + t, label: noColor ? '発現：痕跡+1' : `発現：${G.TRACK_INFO[t].jp}の痕跡+1` })).concat(o.map(e => ({ value: 'mimic:' + e.id, label: `模倣：${rtxt(e.label)}` }))); /* 2026-10-29 色の廃止：発現は1つ・{n} を展開 */ const r = await ask('知性Lv3★先駆・学習：G を払う先取り枠を今すぐ1回 G0 で（排他無視）', [{ type: 'select', name: 'pick', label: '効果', options: opts }], { skipLabel: '見送る' }); if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); const [k, v] = r.pick.split(':'); return submit(k === 'express' ? { pid: p.id, type: 'resolve', kind: 'express', track: v } : { pid: p.id, type: 'resolve', kind: 'mimic', effect: v }); }
      if (pd.type === 'bonusAction') { toast('知性Lv4↗：追加アクションを今すぐ選んでください（対象以外はグレー表示）'); }
    }
  }

  // ---------- 保存・書き出し ----------
  function autosave() { if (!game || isOnline()) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { } }
  function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return toast('保存データがありません', true); game = JSON.parse(s); rebuildState(); render(); } catch (e) { toast('読み込み失敗：' + e.message, true); } }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
  function exportJson() { if (!game) return; const data = isOnline() ? { kind: 'local', meta: Net.meta, entries: Net.entries } : game; download(`game01_${data.meta.seed}.json`, JSON.stringify(data, null, 1), 'application/json'); }
  function importJson() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then(t => { const d = JSON.parse(t); if (!d.meta || !d.entries) throw new Error('形式が違います'); game = { kind: 'local', meta: d.meta, entries: d.entries }; rebuildState(); autosave(); render(); }).catch(e => toast(e.message, true)); }; i.click(); }
  function exportCsv() {
    if (!st) return;
    const rows = [['round', 'player', 'msg']].concat(st.log.map(l => [l.r, l.p !== null && l.p !== undefined ? st.players[l.p].name : '', l.msg]));
    download(`game01_log_${st.seed}.csv`, '﻿' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv');
  }

  // ?demo=seed[&n=3] で自動セットアップ（ローカル・確認用）
  function demoGame(seed, n) {
    const q = new URLSearchParams(location.search); const bots = (q.get('bots') || '').split(',').filter(Boolean).map(Number);
    const meta = { seed, mode: q.get('mode') || 'expert', slots: q.get('slots') || 'v7', rules: q.get('rules') || (G.RULES_VISIBLE || ['t13'])[0], ext: q.get('ext') || 'x1', undoMode: 'free', players: Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), passive: true })), bots };
    const sps = ['wing', 'arm', 'ant', 'manta']; const entries = [];
    for (let i = 0; i < n; i++) { entries.push({ type: 'species', pid: i, species: sps[i] }); if (sps[i] === 'arm') entries.push({ type: 'startTrait', pid: i, trait: 'IG' }); }
    const hands = { 3: [['A', 'Q'], ['B', 'N'], ['H', 'T']], 4: [['A', 'Q', 'D'], ['B', 'N', 'S'], ['H', 'T', 'R'], ['C', 'K', 'I']] }[n];
    for (let i = n - 1; i >= 0; i--) entries.push({ type: 'draft', pid: i, cards: hands[i] });
    entries.push({ type: 'finish' });
    return { kind: 'local', meta, entries };
  }
  window.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search);
    if (q.get('demo')) { game = demoGame(+q.get('demo') || 1, +(q.get('n') || 4)); rebuildState(); render(); return; }
    if (q.get('room') && Net.init()) { Net.join(q.get('room')).then(code => { game = { kind: 'online', code }; bindNet(); }).catch(e => { toast(e.message, true); render(); }); return; }
    render();
  });
})(window.G1);
