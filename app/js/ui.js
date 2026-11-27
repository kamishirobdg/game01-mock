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
  const ART_MISS = new Map(); // O-126（デザイン）：絵が無かった ID を覚え（1＝本番の絵が無い・2＝仮の絵も無い）、描き直しのたびに 404 → 差し替えを待たない（その間 紋と種族の絵が一瞬消えていた）
  function art(id, cls) {
    id = (G.ART_ALIAS && G.ART_ALIAS[id]) || id;
    const miss = ART_MISS.get(id) || 0;
    if (miss === 2) { const d = h('div', { class: 'art noart ' + (cls || '') }); queueMicrotask(() => { if (!d.closest('.ocard, .tcard')) d.remove(); }); return d; }
    const img = h('img', { class: 'art ' + (cls || ''), alt: '', decoding: 'sync', src: miss ? ART_PH + id + '.svg' : ART_REAL + id + '.png' });
    if (miss) img.dataset.ph = '1';
    img.addEventListener('error', () => { if (img.dataset.ph) { ART_MISS.set(id, 2); if (img.closest('.ocard, .tcard')) img.replaceWith(h('div', { class: 'art noart ' + (cls || '') })); else img.remove(); return; } /* O-48：器官・形質のカードは絵が無くても同じ枠を残し、カードの高さをそろえる */ ART_MISS.set(id, 1); img.dataset.ph = '1'; img.src = ART_PH + id + '.svg'; });
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
  let viewMode = (() => { const q = new URLSearchParams(location.search).get('view'); if (q === 'icon' || q === 'text') return q; try { return localStorage.getItem(VIEW_KEY) === 'text' ? 'text' : 'icon'; } catch (e) { return 'icon'; } /* O-49：既定はアイコン */ })();
  let legendOpen = true;
  // 2026-11-04 ユーザー要望：テストプレイ時に画面の配色を白（ライト）／黒（ダーク）で選べるように。ヘッダ右端とセットアップ画面で切り替え・端末に記憶・URL の ?theme=light|dark でも指定可（index.html で CSS 読み込み前に data-theme を付けてちらつきを防ぐ）
  const THEME_KEY = 'g01_theme';
  let themeMode = (() => { const q = new URLSearchParams(location.search).get('theme'); if (q === 'dark' || q === 'light') return q; try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })();
  const darkTheme = () => themeMode === 'dark';
  function applyTheme() { document.documentElement.setAttribute('data-theme', themeMode); }
  function setTheme(m) { themeMode = m; try { localStorage.setItem(THEME_KEY, m); } catch (e) { } applyTheme(); render(); }
  function themeToggle() { return h('span', { class: 'vtog ttog', title: '画面の配色（白／黒）を切り替える（この端末に記憶）' }, h('button', { class: themeMode === 'light' ? 'on' : '', onclick: () => setTheme('light') }, '白'), h('button', { class: themeMode === 'dark' ? 'on' : '', onclick: () => setTheme('dark') }, '黒')); }
  applyTheme();
  const boardOn = () => !!(window.G1Board && window.G1Board.on()); // O-57：盤の表示（js/board.js）
  const iconView = () => viewMode === 'icon' || boardOn(); // 盤は記号の表示で描く
  function setView(m) { viewMode = m; try { localStorage.setItem(VIEW_KEY, m); } catch (e) { } render(); }
  const pc = (k, n, o) => h('span', { class: 'pc pk-' + k + (o && o.cost ? ' cost' : '') + (o && o.cls ? ' ' + o.cls : '') + (!(o && (o.cost || o.cls)) && /^\+/.test(String(n === undefined || n === null ? '' : n)) ? ' gain' : ''), /* O-49：得る＝緑地 */ title: (o && o.title) || ICO_JP[k] }, ic(k), n === undefined || n === null ? null : h('b', null, String(n)));
  const po = (s) => h('span', { class: 'po' }, s);
  const pbad = (s, title) => h('span', { class: 'pbad', title: title || null }, s);
  const pcost = (k, n, base) => pc(k, n, { cost: true, cls: base !== undefined && n !== base ? 'disc' : '', title: base !== undefined && n !== base ? `${ICO_JP[k]}（軽減後・基準 ${base}）` : ICO_JP[k] + 'を払う' });
  const coopBonus = () => pc('coop', '+', { cls: 'bonus', title: '協調加算：協調の数に応じて、この枠の資源が増える' });
  const fxOn = () => iconView() && !!G.FX && G.FX.on(st); // O-49：効果の記号（T32 のアイコン表示）
  // 星海の段（O-49）：記号の組み立ては fx.js（ガイドの一覧と同じ）。先駆・先着が決まった段はその人の名前
  function starFx(lv, fb, fTxt) { const x = G.FX.star(st, lv, true); return h('div', { class: 'fxstack' }, ...x.parts.flatMap(pt => pt.first && fb !== undefined ? (x.top ? [G.FX.render(pt.lines, x.full, null), h('small', { class: 'first' }, fTxt)] : [h('small', { class: 'first' }, fTxt)]) : [G.FX.render(pt.lines, x.full, pt.label ? pt.label[0] : null)])); }
  // O-86：種族の能力＝［開始時］＋中身（全文はマウス）
  function spFx(id) { if (!fxOn()) return null; const sp = G.speciesInfo(st, id), R = G.RULESETS[st.rules || 'v1'], mod = (R.speciesMod || {})[id] || {}; const s = id === 'wing' ? '始 i:up.body ~Lv2' : id === 'arm' ? (R.armTraitMax ? `始 $0 i:trait ≤G${R.armTraitMax}` : null) : id === 'ant' ? `始 +coop${mod.coop !== undefined ? mod.coop : 1}` : id === 'manta' && /^初期資源/.test(sp.passive) ? `始 +E${sp.stock.E} +G${sp.stock.G} +P${sp.stock.P}` : null; return s ? h('span', { class: 'spfx' }, G.FX.render([s], '特性：' + sp.passive)) : null; }
  function picto(id, p) {
    const R = G.RULESETS[st.rules || 'v1']; const vp = viewP(p); const sc = (n) => G.sc(st, n); const T = R.tribute || {}; const TS = T.slots || {};
    const CBK = { E5: 'E', G3: 'G', P8: 'P', ALL: 'any', EG: 'E', GG: 'G' }; const cbNew = !!(G.FX && G.FX.on(st)); // O-51（T33）：協調加算＝［資源 +1／協調］
    const resB = G.RES_SLOTS.includes(id) && R.coopMode !== 'spend' && (!R.coopBonusSlots || R.coopBonusSlots.includes(id)) ? [cbNew ? G.FX.cbPer(CBK[id] || 'any') : coopBonus()] : [];
    const massC = (k) => pcost('P', G.massCost(vp, k), k === 'MM' && R.mmCost ? R.mmCost : k === 'MS' && R.msCost ? R.msCost : R.massCost);
    const mret = () => { if (cbNew && R.lvTimes && R.massRetMetab) return [po('＋'), G.FX.perLv('P', '+' + R.massRetMetab, 'metab', `実行したあと P が返る（${G.retForm(st)}・いまは代謝 Lv${vp.lv.metab} で P+${G.massRet(vp)}）`)]; /* O-86：Lv 1 つにつき */ const r = G.massRet(vp); return r ? [po('＋'), pc('P', '+' + r, { cls: 'bonus', title: `実行したあと P+${r} が返る（${G.retForm(st)}・代謝 Lv${vp.lv.metab}）` })] : []; }; // O-37：淘汰 4 種のあと返る P（0 のときは出さない）
    const w = (R.gauge ? [] : [pc('W', null, { title: 'ワーカー必須（ATでは置けない）' })]);
    const bless = (k) => { const kk = k || 'G'; const vg = G.tribVg ? G.tribVg(st, kk) : 1, tr = G.tribReal ? G.tribReal(st, kk) : 0; const a = []; if (tr) a.push(pc('gem', '+' + tr)); if (vg) a.push(pc('bless', '+' + vg)); return a; }; // v3.67 祭壇＝祝福+2／T14（§16 M-a）＝痕跡と祝福の組み合わせ（配列で返す）
    if (/^TRL_/.test(id) && R.trial) { const r = +id.slice(4); const k = st.shared.trials[r - 1]; return [pcost(k, G.trialCost(st, r)), po('→'), pc('gem', '+' + G.trialGem(st, r))]; } // T24（O-20）：試練
    if (/^ALT_/.test(id) && R.altar) { const k = id.slice(4); const c = G.altarCost(vp, k), nv = G.altarNextVg(vp); const done = vp.tribGame && vp.tribGame[k]; const rL = !done && R.altarDouble && R.altarDouble.repeatL && vp.round && (vp.round.altarN || 0) > 0 ? R.altarDouble.repeatL : 0; return [pcost(k, c, R.altar.cost[k]), ...(rL ? [po('＋'), pc('L', rL, { cost: true, title: `このラウンド 2 回目以降の祭壇の手は生命核${rL}を足す` })] : []), ...(done ? [] : [po('→'), pc('bless', '+' + nv)])]; } // O-44（T31）repeatL // T23（O-19）：祭壇の払い口
    { const fl = G.FX && G.FX.lines(st, 'trib', id); if (fl) return [G.FX.render(fl, G.slotTip(st, id) || G.slotText(st, id))]; } // O-49：恩寵枠（T32）は効果の記号の並び
    switch (id) {
      case 'E5': return [pc('E', '+' + G.slotAmt(st, 'E5').E), ...resB]; // T19 #6：slotAmt
      case 'G3': return [pc('G', '+' + G.slotAmt(st, 'G3').G), ...resB];
      case 'P8': return [pc('P', '+' + (R.p8 || 8)), ...resB];
      case 'ALL': { const a = G.slotAmt(st, 'ALL'); return [pc('E', '+' + a.E), pc('G', '+' + a.G), pc('P', '+' + a.P), ...resB]; }
      case 'EG': return R.herd ? [pcost('P', R.herdCost || 6), po('→'), pc('E', '+' + G.slotAmt(st, 'EG').E), pc('coop', '+' + (R.herdCoop || 1), cbNew ? { cls: 'big' } : null), ...resB] : null; // O-51：資源獲得の枠では協調 +1 の札を一回り大きく
      case 'GG': return R.herd ? [pcost('P', R.herdCost || 6), po('→'), pc('G', '+' + G.slotAmt(st, 'GG').G), pc('coop', '+' + (R.herdCoop || 1), cbNew ? { cls: 'big' } : null), ...resB] : null;
      case 'PB': if (R.pbG === 0) return R.pbBodyLv && G.FX ? [pc('P', '+' + G.pbBase(st)), G.FX.perLv('P', '+' + R.pbBodyLv, 'body', `身体 Lv 1 つにつき P+${R.pbBodyLv}（緊急進出・協調進出・神の加護でも倍にならない）`)] : [pc('P', '+' + G.pbGain(st))]; // O-51（T33）：［P +25］［P +5／身体 Lv］ return [pcost('G', G.pbCost(vp), sc(2)), po('→'), pc('P', '+' + G.pbGain(st)), ...(R.pbCoop ? [coopBonus()] : [])]; // O-50：緊急進出の特記（P+120）は消す（T32 で自己複製もほかの資源枠と同じく対象）
      case 'MB': return [massC('MB'), po('→'), ...(R.massBodyL ? [pc('L', '+' + R.massBodyL)] : []), pc('gem', '+' + (R.massBodyGem || 1)), ...mret()]; // O-76（T42）massBodyGem・O-83（T45）massBodyL
      case 'MI': return R.miMaxCost ? [massC('MI'), po('→'), pc('trait', '×' + (R.miCount || 2), { title: `コストG${R.miMaxCost}以下の形質を異なる${R.miCount || 2}種` }), pbad('≤' + R.miMaxCost, `コストG${R.miMaxCost}以下`), ...mret()] : null;
      case 'MS': return [massC('MS'), po('→'), pc('coop', '+' + (R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2))), ...mret()];
      case 'MM': { if (cbNew && R.mmLv && R.lvTimes && !R.mmLvMetab) { const b = R.mmGain || sc(10), k = R.mmLv, g0 = G.mmGainOf(vp); return [massC('MM'), po('→'), pc('E', '+' + (b - k)), G.FX.perLv('E', '+' + k, 'body', `身体 Lv 1 つにつき E+${k}（いまは E+${g0.E}）`), pc('G', '+' + (b - k)), G.FX.perLv('G', '+' + k, 'intel', `知性 Lv 1 つにつき G+${k}（いまは G+${g0.G}）`), ...mret()]; } /* O-86 */ const g = (R.mmLv || R.mmLvMetab) ? G.mmGainOf(vp) : { E: R.mmGain || sc(10), G: R.mmGain || sc(10) }; return [massC('MM'), po('→'), pc('E', '+' + g.E, R.mmLv ? { title: `${G.mmForm(st).E}（身体 Lv${vp.lv.body}）` } : null), pc('G', '+' + g.G, R.mmLv ? { title: `${G.mmForm(st).G}（知性 Lv${vp.lv.intel}）` } : null), ...mret()]; } // T18：mmGain／O-37：mmLv＝いまの自分の量
      case 'BST': return R.burst && cbNew ? [G.FX.ic('rapid'), pc('organ', '2〜' + (R.burst.max || 3), { title: `同じ系統の器官を 2〜${R.burst.max || 3} 枚、形態の順に続けて形成` })] : null; // O-86
      case 'GTH': { const g = R.gather; if (!g || !cbNew) return null; const OR = () => G.FX.ic('or'); return [G.FX.ic('gather'), pc('E', '+' + g.E), OR(), pc('G', '+' + g.G), OR(), pc('P', '+' + g.P), ...(g.coop ? [OR(), ...(g.coopCostP ? [pcost('P', g.coopCostP), po('→')] : []), pc('coop', '+' + g.coop)] : [])]; } // O-86：どれか 1 つ（間に［か］）
      case 'TRT': return [pcost('G'), po('→'), pc('trait', '+1')];
      case 'TRT2': return [pcost('G'), pcost('E', st.round), po('→'), pc('trait', '+1')];
      case 'MIM': { const b = R.mimicCost || 4; return [pcost('G', G.gSlotCost(vp, b), b), po('→'), pc('copy', null, { title: '模倣：自分を含む誰かが到達済みの Lv2／Lv3★ の即時効果を1つ' }), pbad('Lv2/3★')]; }
      case 'EXP': { const b = R.expressCost || 10; return [pcost('G', G.gSlotCost(vp, b), b), po('→'), pc('gem', '+1')]; }
      case 'GEM': return T.flatG ? [pcost('G', sc(T.flatG)), po('→'), ...bless()] : null;
      case 'TE': return TS.TE ? [pcost('E', sc(TS.TE.E)), po('→'), ...bless()] : null;
      case 'TP': return TS.TP ? [pcost('P', sc(TS.TP.P)), po('→'), ...bless()] : null;
      case 'TR': return TS.TR ? [pcost('E', sc(TS.TR.E)), pcost('P', sc(TS.TR.P)), po('→'), pc('gem', '+1')] : null;
      case 'TO': return R.toLineage ? [pc('organ', '1', { title: '1 段目の定価で' }), po('→'), pc('organ', '×3', { title: '3 段目まで形成する' })] : [pc('organ', '0', { title: '器官1枚を無料' + (R.organLateFee === 0 ? '' : '（追随の代償なし）') }), po('+'), pc('organ', '½', { title: '同じ手番にもう1枚を半額' })];
      case 'TT': return TS.TT ? [pcost('G', sc(TS.TT.G || 0)), po('→'), pc('trait', '×' + (TS.TT.n || 2), { title: `形質を${TS.TT.n || 2}枚まで無料` })] : null;
      case 'TB': return TS.TB ? [pc('rslot', '1', { title: '資源枠1つを今すぐ実行（使用済みでも）' }), pbad('使用済みOK')].concat(TS.TB.instantVg && R.finalSlotVg ? [pc('bless', '+1', { title: '今すぐの 1 回にも最終ラウンドの祝福+1' })] : [], [po('+'), pc('rslot', '×' + (TS.TB.mul || 2), { title: `このラウンドの残りの手番、資源枠の獲得量が${TS.TB.mul || 2}倍` })]) : null;
      case 'TAL': return TS.TAL ? [pc('bless', '½', { title: G.slotText(st, 'TAL') })].concat(TS.TAL.pair ? [pbad('2 口まで')] : []) : null; // T32（O-47）・T39（O-68）：2 口まで
      case 'TST': return TS.TST ? [pbad('条件 1 種', G.slotTip(st, 'TST')), po('→'), h('span', { class: 'pc pk-star gain', title: G.slotTip(st, 'TST') }, G.FX ? G.FX.ic('star') : ic('up'), h('b', null, '+1'))] : null; // T49（O-91）星の恩寵
      case 'TCU': return TS.TCU ? [pcost('P', TS.TCU.P || 100), po('→'), h('span', { class: 'pc pk-cull', title: G.slotTip(st, 'TCU') }, G.FX ? G.FX.ic('cull') : ic('up'), h('b', null, '×' + (TS.TCU.n || 2)))] : null; // T49（O-91）淘汰の恩寵
      case 'TLF': return TS.TLF ? [pc('L', '+' + (TS.TLF.L || 3), { title: '生命核+' + (TS.TLF.L || 3) })] : null;
      case 'TBR': { if (!TS.TBR) return null; const b = R.breedTrib || { num: 1, den: 2 }; return b.both ? [pcost('P', G.breedTribCost(R, 'P', 0)), po('/'), pcost('L', G.breedTribCost(R, 'L')), po('→'), pc('breed', '+2', { title: G.slotText(st, 'TBR') })] : [pc('breed', '½', { title: G.slotText(st, 'TBR') })]; } // T37（O-65）：両方払えるときは額と 2 段
      case 'TJ': return TS.TJ ? [pc('up', '×' + (TS.TJ.n || 2), { title: `進化を${TS.TJ.n || 2}回（同じでも別でも）` }), pc('E', '−' + sc(TS.TJ.disc || 0), { cls: 'minus', title: `E で払う分から E${sc(TS.TJ.disc || 0)} 引く` })] : null;
      case 'BRD': { if (!R.coef2 || !R.breed.every(c => c === R.breed[0])) return null; const c = G.breedCost(vp); return [...w, pcost('P', c === null ? R.breed[0] : c, R.breed[0]), ...(R.breedL ? [po('/'), pcost('L', R.breedL)] : []), po('→'), pc('breed', '+1', { title: `繁栄度+1（全${R.breed.length}段）` })]; }
      case 'ORG': { const oc = R.organCost || G.ORGAN_COST; const es = oc.map(x => x[0]), gs = oc.map(x => x[1]); const rg = (a) => Math.min(...a) === Math.max(...a) ? String(a[0]) : `${Math.min(...a)}〜${Math.max(...a)}`; return [pcost('E', rg(es)), pcost('G', rg(gs)), po('→'), pc('organ', '+1'), ...(R.organSameEffect && R.organLateFee !== 0 ? [pbad('代償+E' + sc(R.organLateFee || 1), '先駆より後に形成すると +E')] : [])]; } // T25（O-23）：後追い料なし（`|| 1` では 0 が 1 に戻る）
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
  // O-61（§114）：一覧の画面の実物に効果の記号と同じ絵を小さく添える（淘汰の枠＝そのトラックの色・群体同期／融合の枠・祭壇・特殊器官の見出し・投入）。盤では .pname の中は出ない（盤の記号は board.css）
  const GATE_IC = { body: 'invest', intel: 'trait', social: 'coop', metab: 'organ' }; // O-86：進化の段の間の素材の記号
  const OBJ_IC = { MB: 'cull.body', MI: 'cull.intel', MS: 'cull.social', MM: 'cull.metab', EG: 'herd', GG: 'herd' };
  const objIc = (k) => { if (!k || !G.FX || !G.FX.ic) return null; const s = G.FX.ic(k); s.classList.add('objic'); return s; };
  function slotBody(p, pid, name, text, d, pay) {
    const pic = iconView() ? picto(pid, p) : null; const gain = d ? gainStr(d, pay) : null;
    if (pic) return [h('span', { class: 'pname' }, objIc(OBJ_IC[pid]), name), h('span', { class: 'picto' }, pic), d && gain ? h('span', { class: 'picto pgain', title: '今実行すると：' + gain }, po('⇒'), gainChips(d, pay)) : null];
    return [h('b', null, objIc(OBJ_IC[pid]), name), h('small', null, typeof text === 'string' ? icost(text) : text), gain ? h('small', { class: 'gain' }, `→ ${gain}`) : null];
  }
  function viewToggle() {
    return h('span', { class: 'skintog viewtog' }, h('span', { class: 'vtog', title: 'アクション・カード・トラックの表示（文字／記号）を切り替える' }, h('button', { class: viewMode === 'text' ? 'on' : '', onclick: () => setView('text') }, '文字'), h('button', { class: viewMode === 'icon' ? 'on' : '', onclick: () => setView('icon') }, 'アイコン')));
  }
  // O-59：表示の切り替え（見た目・表示・文字／アイコン・白／黒）をまとめ、「画面」のボタン 1 つで出す／隠す（開閉は端末に記憶・既定＝携帯幅は隠す／PC 幅は出す）
  const DISP_KEY = 'g01_disp'; let dispOpen = (() => { try { const v = localStorage.getItem(DISP_KEY); if (v === '1' || v === '0') return v === '1'; } catch (e) { } return window.innerWidth > 600; })();
  function dispGroup(play) {
    const btn = h('button', { class: 'dispbtn' + (dispOpen ? ' on' : ''), title: '表示の切り替え（見た目・表示・文字／アイコン・白／黒）を出す／隠す', onclick: () => { dispOpen = !dispOpen; try { localStorage.setItem(DISP_KEY, dispOpen ? '1' : '0'); } catch (e) { } render(); } }, '画面');
    if (!dispOpen) return [btn];
    return [h('span', { class: 'dispgrp' }, window.G1Skin ? window.G1Skin.toggle(render) : null, play && window.G1Board ? window.G1Board.toggle(render) : null, play ? viewToggle() : null, themeToggle()), btn];
  }
  function iconLegend() {
    const it = (k, n) => h('span', null, ic(k), n || ICO_JP[k]);
    return h('details', { class: 'plegend', open: legendOpen, ontoggle: (e) => { legendOpen = e.target.open; } }, h('summary', null, 'アイコンの見方'),
      ['E', 'G', 'P', 'L', 'coop', 'gem', 'bless', 'trait', 'organ', 'breed', 'up', 'rslot', 'eye', 'copy'].map(k => it(k)),
      h('span', null, h('span', { class: 'pc cost' }, h('b', null, '赤地')), '＝払う'), h('span', null, G.FX && G.FX.on(st) ? G.FX.cbPer('E') : coopBonus(), '＝協調加算'), h('span', null, h('span', { class: 'pc cost disc' }, h('b', null, '下線')), '＝軽減後'), h('span', null, po('⇒'), '＝今実行したときの増減'));
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
  let thinking = null; // O-121：最終ラウンドを読んでいる途中（{ st, it }）。同じ局面のまま再描画されたら続ける
  function scheduleBot() {
    if (thinking && thinking.st === st) return; thinking = null;
    clearTimeout(botTimer); if (!st || st.ended) return;
    const fast = new URLSearchParams(location.search).get('auto');
    let pid = null;
    if (st.phase === 'play') pid = G.cur(st).id;
    else if (st.phase === 'setup') pid = st.setupStep === 'draft' ? st.setupOrder[st.setupIdx] : st.setupIdx;
    if (pid === null || !isBot(pid)) return;
    if (isOnline() && (!Net.meta || Net.meta.host !== Net.uid)) return; // オンラインではホスト端末がボットを動かす
    botTimer = setTimeout(() => {
      { const m = isOnline() ? Net.meta : (game && game.meta); if (G.Bot && !G.Bot.BEAM.fromUrl) G.Bot.BEAM.depth = (m && m.aiDepth >= 1 && m.aiDepth <= 5) ? m.aiDepth : 1; if (G.Bot) { G.Bot.BEAM.final = !!(m && m.aiFinal); let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e2) { } G.Bot.BEAM.budget = coarse ? 5000 : 3000; } } // O-121：meta.aiFinal＝最強（最終ラウンドを最終得点で読む） // v3.64：セットアップの「AI の読み」（meta.aiDepth）。URL の ?depth= があればそちら
      let e = null;
      if (st.phase === 'setup') {
        // 2026-11-04 ユーザー要望：AI の初期選択（種族・九腕の開始形質）を固定（空いている先頭）でなくランダムに。シードと席から決める（同じシードなら同じ選択）
        const pickR = (arr, salt) => { let x = ((st.seed || 0) * 9301 + pid * 49297 + salt * 233) % 233280; x = (x * 9301 + 49297) % 233280; return arr[Math.floor(x / 233280 * arr.length)]; };
        if (st.setupStep === 'species') { const taken = st.players.map(q => q.species); const free = Object.keys(G.SPECIES).filter(k => !taken.includes(k)); e = { type: 'species', pid, species: pickR(free, 1) }; }
        else if (st.setupStep === 'armTrait') e = { type: 'startTrait', pid, trait: pickR(G.armTraitOptions(st), 2) };
        else if (st.setupStep === 'draft') { const need = G.handSize(st); e = { type: 'draft', pid, cards: st.shared.cardPool.slice(0, need) }; }
      } else if (G.Bot.BEAM.final) { // O-121：最強＝全席 greedy の 2 手読み・最終ラウンドは打ち切りで読む（少しずつ進めて画面を固めない）
        if (G.Bot.finalOn(st, pid)) { const th = thinking = { st, it: G.Bot.finalGen(st, pid) }; const step = () => { if (thinking !== th || st !== th.st) return; let r; const until = Date.now() + 40; do { r = th.it.next(); } while (!r.done && Date.now() < until); if (!r.done) { botTimer = setTimeout(step, 0); return; } thinking = null; if (!r.value) { toast('ボットが手詰まり', true); return; } submit(r.value); }; step(); return; }
        e = G.Bot.choose(st, pid, 'greedy');
      } else e = G.Bot.choose(st, pid);
      if (!e) { toast('ボットが手詰まり', true); return; }
      submit(e);
    }, fast ? 0 : 500);
  }
  async function submit(entry) {
    entry = noSub(entry); if (entry && entry.at === undefined) entry = Object.assign({}, entry, { at: Date.now() }); // O-48：各手の時刻（CSV・JSON に残す）
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
    if (G.RULESETS[st.rules || 'v1'].noLSub) fields = fields.filter(f => !(f.name === 'useL' && /の代わりに/.test(f.label || ''))).map(f => f.options ? Object.assign({}, f, { options: f.options.map(o => o && typeof o.label === 'string' && o.label.includes('（＋生命核）') ? Object.assign({}, o, { label: o.label.replace('（＋生命核）', '') }) : o) }) : f); // T22（O-18）：代用払いなしでは「生命核を E／G の代わりに」の欄を出さない
    return new Promise((resolve, reject) => {
      const back = $('#modal'); back.innerHTML = '';
      const form = h('form', { class: 'modal-box' + (opts.cls ? ' ' + opts.cls : '') }, h('h3', null, title));
      if (opts.note) form.appendChild(h('p', { class: 'note' }, opts.note));
      const inputs = {}, rows = {}, descs = {};
      const read = () => { const out = {}; fields.forEach(f => { const i = inputs[f.name]; out[f.name] = f.type === 'check' ? i.checked : f.type === 'number' ? parseInt(i.value || '0', 10) : f.type === 'multi' ? Array.from(i.selectedOptions).map(o => o.value) : i.value; }); return out; };
      // f.when(値) が偽の項目は隠す（値は既定のまま返す）。f.desc(値) は選んだ内容の説明を項目の下に出す。選択肢が「使わない」だけの生命核欄は出さない
      const hEl = opts.act ? h('p', { class: 'dlghint' }) : null; const updHint = (v) => { if (!hEl) return; let n = null; if (hintOn) { try { n = hintPts(opts.act(v)); } catch (e) { n = null; } } hEl.textContent = n > 0 ? `+${n}点` : ''; hEl.style.display = n > 0 ? '' : 'none'; }; // O-122
      const refresh = () => { const v = read(); updHint(v); fields.forEach(f => { const trivial = f.name === 'useL' && f.type === 'select' && f.options.length <= 1; rows[f.name].style.display = trivial || (f.when && !f.when(v)) ? 'none' : ''; if (f.descEl) descs[f.name].style.display = rows[f.name].style.display; if (f.desc) descs[f.name].textContent = f.desc(v) || ''; if (f.descEl) descs[f.name].replaceChildren(f.descEl(v) || ''); }); /* O-97：descEl＝選んだ内容の説明を要素で */ if (opts.maxCheck) { const cs = fields.filter(f => f.type === 'check').map(f => inputs[f.name]); const full = cs.filter(i => i.checked).length >= opts.maxCheck; cs.forEach(i => { i.disabled = full && !i.checked; }); } }; // T31（O-44）：opts.maxCheck＝チェックはその数で止まる
      fields.forEach(f => {
        const row = h('label', { class: 'frow' }, h('span', null, f.label)); let inp;
        if (f.type === 'select') { inp = h('select', { name: f.name }); f.options.forEach(o => inp.appendChild(h('option', { value: o.value, selected: o.value === f.value, disabled: !!o.disabled }, o.label))); }
        else if (f.type === 'number') inp = h('input', { type: 'number', name: f.name, min: f.min ?? 0, max: f.max ?? 99, value: f.value ?? 0 });
        else if (f.type === 'check') inp = h('input', { type: 'checkbox', name: f.name, checked: !!f.value });
        else if (f.type === 'multi') { inp = h('select', { name: f.name, multiple: true, size: Math.min(8, Math.max(2, f.options.length)) }); f.options.forEach(o => inp.appendChild(h('option', { value: o.value }, o.label))); }
        else inp = h('input', { type: 'text', name: f.name, value: f.value || '' });
        inputs[f.name] = inp; row.appendChild(inp); if (f.hint) row.appendChild(h('small', null, f.hint)); if (f.desc) { descs[f.name] = h('small', { class: 'desc' }); row.appendChild(descs[f.name]); } if (f.descEl) descs[f.name] = h('div', { class: 'desc descel' }); /* O-97 の直し（2026-11-24 ユーザー「キャンセルがきかないことがある」）：一覧は label の外に置く（label の中だと一覧を触るたび選択欄が反応し、携帯では選択の画面が開いて次のキャンセルが空振りする） */
        rows[f.name] = row; form.appendChild(row); if (f.descEl) form.appendChild(descs[f.name]); inp.addEventListener('change', refresh); inp.addEventListener('input', refresh);
      });
      refresh();
      if (hEl) form.appendChild(hEl);
      const btns = h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, opts.okLabel || '実行'));
      if (opts.skipLabel) btns.appendChild(h('button', { type: 'button', onclick: () => { back.classList.remove('open'); resolve({ __skip: true }); } }, opts.skipLabel));
      if (!opts.noCancel) btns.appendChild(h('button', { type: 'button', onclick: () => { back.classList.remove('open'); resolve(null); } }, 'キャンセル'));
      if (inPending && dlgUndo()) btns.appendChild(hintBtn(() => refresh())); // O-122
      if (inPending && dlgUndo()) btns.appendChild(h('button', { type: 'button', title: 'この選択のもとになった自分の手の前まで戻す（間にある AI・他プレイヤーの手も取り消される）', onclick: () => { back.classList.remove('open'); reject(UNDO_REQ); } }, '1手戻す'));
      form.appendChild(btns);
      form.addEventListener('submit', ev => { ev.preventDefault(); const out = read(); back.classList.remove('open'); resolve(out); });
      back.appendChild(form); back.classList.add('open'); const first = form.querySelector('select,input,button'); if (first) first.focus();
    });
  }
  // O-95：行動の確認はブラウザの confirm でなくアプリの中の枠で（見出し＝「：」の前・文＝残り・「実行しますか？」は枠のボタンに任せる）
  async function okAsk(msg, title, act) { const m = String(msg).replace(/。?実行しますか？$/, ''); const i = m.indexOf('：'); const cut = !title && i > 0 && i < 24; return !!(await ask(title || (cut ? m.slice(0, i) : '確認'), [], { note: cut ? m.slice(i + 1) : m, act: act ? () => act : null })); } // O-122：act＝ヒントの点を出す手
  // O-95：払う物 → 得る物（今の額）。実行した結果（tryApply）との差から出す。payP＝先に払う P（あとで返る P と分けるため）
  function payGainText(p, a, payP) {
    let s2; try { s2 = G.tryApply(st, a); } catch (e) { return null; }
    const q = s2.players[p.id], JP = { E: 'E', G: 'G', P: 'P', L: '生命核', coop: '協調', gemsets: '祝福' }, pay = [], gain = [];
    if (payP) pay.push(`P${payP}`);
    ['E', 'G', 'P', 'L', 'coop', 'gemsets'].forEach(k => { const v = (q[k] || 0) - (p[k] || 0) + (k === 'P' ? (payP || 0) : 0); if (v < 0) pay.push(`${JP[k]}${-v}`); else if (v > 0) gain.push(`${JP[k]}+${v}${k === 'P' && payP ? '（返り）' : ''}`); });
    const gs = G.TRACKS.reduce((x, t) => x + (q.gems[t] || 0) - (p.gems[t] || 0), 0); if (gs > 0) gain.push(`痕跡+${gs}`);
    G.TRACKS.forEach(t => { if (q.lv[t] > p.lv[t]) gain.push(`${G.TRACK_INFO[t].jp} Lv${p.lv[t]}→${q.lv[t]}`); });
    q.traits.forEach(t => { if (!G.trait(p, t.id)) gain.push(`${G.TRAITS[t.id].name}${t.strong ? '強' : '弱'}`); });
    q.pending.slice(p.pending.length).forEach(x => { if (x.type === 'cvIncome') gain.push(`好きな資源+${x.n}（${x.src || '収斂膜'}）`); });
    return `払う：${pay.join('・') || 'なし'} → 得る：${gain.join('・') || 'なし'}`;
  }
  function toast(msg, isErr) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 3000); }
  const lOpts = (p, res) => Array.from({ length: p.L + 1 }, (_, i) => ({ value: i, label: i === 0 ? '使わない' : `L${i}（=${res || 'E'}${i * (p.lValue || G.sc(st, 3))}）` }));
  const resSel = (name, label, value) => ({ type: 'select', name, label, value: value || 'E', options: [{ value: 'E', label: 'E' }, { value: 'G', label: 'G' }, { value: 'P', label: 'P' }] });
  // 選択中の形質の効果（先着なら強・後続なら弱）を項目の下に表示する
  const traitDesc = (p, name) => (v) => { const t = v[name]; if (!t || !G.TRAITS[t]) return ''; const c = G.traitCost(st, p, t); return `${c.strong ? '強' : '弱'}：${rtxt(G.traitText(st, t, c.strong))}`; }; // 2026-11-05 v3.63：弱は数値セットの文言（T10 weak2）を G.traitText で
  const traitSel = (p, name, label, filter) => ({ type: 'select', name, label, options: G.traitPoolView(st).filter(t => !G.trait(p, t) && (!filter || filter(t))).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（G${G.traitCost(st, p, t).G}）` })), desc: traitDesc(p, name) });
  // sel＝形質を選ぶ項目名。指定時はその項目で IM／DA を選んだときだけ表示する
  const selVal = (sel, v) => typeof sel === 'function' ? sel(v) : v[sel]; // sel＝項目名、または値を取り出す関数（traitPickSel の 'ID:S' から ID を取る等）
  const imSel = (sel) => Object.assign(resSel('res', '代謝亢進(IM)の資源'), sel ? { when: v => selVal(sel, v) === 'IM' } : {});
  const daSel = (sel) => Object.assign({ type: 'select', name: 'track', label: '適応効率(DA)のトラック', options: G.TRACKS.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }, sel ? { when: v => selVal(sel, v) === 'DA' } : {});
  // 割引付きの形質購入（遺伝記憶・知性Lv3★の割引報酬）：traitChoice の数値セットでは強／弱を選べる（値＝'ID:S'／'ID:W'・表示は割引後の G）。2026-11-08 ユーザー指摘「遺伝記憶で強弱を選べない」
  const traitPickSel = (p, disc) => {
    const choice = G.RULESETS[st.rules || 'v1'].traitChoice; const opts = [];
    G.traitPoolView(st).filter(t => !G.trait(p, t)).forEach(t => {
      const s = G.traitCost(st, p, t, disc);
      const gp = (c, weak) => { if (!disc || typeof disc !== 'number') return `G${c.G}`; const b = G.traitCost(st, p, t, 0, weak); return b.G > c.G ? `G${c.G}＝定価 G${b.G}−${b.G - c.G}` : `G${c.G}`; }; // 2026-11-09 v3.87（ユーザー指摘）：割引後の値段だと分かるように定価と割引を並べる（遺伝記憶・報酬の割引）
      if (!choice) { opts.push({ value: t + ':' + (s.strong ? 'S' : 'W'), label: `${t} ${G.TRAITS[t].name}（${s.strong ? '強' : '弱'}・${gp(s)}）` }); return; }
      const w = G.traitCost(st, p, t, disc, true);
      if (s.strong) opts.push({ value: t + ':S', label: `${t} ${G.TRAITS[t].name} 強（${gp(s)}）` });
      opts.push({ value: t + ':W', label: `${t} ${G.TRAITS[t].name} 弱（${gp(w, true)}）` });
    });
    return { type: 'select', name: 'pick', label: '形質', options: opts, desc: (v) => { if (!v.pick) return ''; const [t, ver] = v.pick.split(':'); return `${ver === 'S' ? '強' : '弱'}：${rtxt(G.traitText(st, t, ver === 'S'))}`; } };
  };
  const pickId = (v) => (v.pick || '').split(':')[0];
  // 淘汰(知性)の形質の選択（O-72・2026-11-20 ユーザー「選択できるように」「選択の時点で強があるか分かるように」）：traitChoice では 'ID:S'／'ID:W'・強が取られている形質は弱だけ
  const miOpts = (p, ids) => { const choice = G.RULESETS[st.rules || 'v1'].traitChoice; const out = []; ids.forEach(t => { const s = G.traitCost(st, p, t).strong, nm = `${t} ${G.TRAITS[t].name}`; if (!choice) { out.push({ value: t + ':' + (s ? 'S' : 'W'), label: `${nm}（${s ? '強' : '弱'}）` }); return; } if (s) out.push({ value: t + ':S', label: `${nm} 強` }); out.push({ value: t + ':W', label: s ? `${nm} 弱` : `${nm} 弱（強はほかの人が取得）` }); }); return out; };
  const miParse = (vals) => { const ps = (vals || []).map(v => v.split(':')); const traits = ps.map(x => x[0]); if (new Set(traits).size !== traits.length) { toast('同じ形質の強と弱は一緒に選べません', true); return null; } return { traits, weak: ps.filter(x => x[1] === 'W').map(x => x[0]) }; };
  const pickArgs = (r) => { const [t, ver] = r.pick.split(':'); return { trait: t, weak: !!G.RULESETS[st.rules || 'v1'].traitChoice && ver === 'W' }; };

  // ---------- 画面：入口 ----------
  function render() {
    hideOTip(); // O-103
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
    box.appendChild(h('p', { class: 'note' }, '画面の配色：', themeToggle(), '　白（ライト）／黒（ダーク）。この端末に記憶され、ゲーム中もヘッダの「画面」から切り替えられます。'));
    box.appendChild(metaForm('ローカル（この端末だけ・パス＆プレイ）', '開始', async (meta) => { meta = Object.assign({}, meta, { startedAt: Date.now() }); game = { kind: 'local', meta, entries: [] }; rebuildState(); autosave(); render(); }));
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
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'セットアップ'), h('select', { name: 'mode' }, h('option', { value: 'beginner' }, '初心者（器官の場を固定）'), h('option', { value: 'expert' }, '熟練者'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'ルール数値'), h('select', { name: 'rules' }, h('option', { value: 'v1' }, '現行（進行2/3/5/8E・E収入3・宝石×10）'), h('option', { value: 't1' }, '仮値セットT1（進行3/5/8/13E・E収入2・宝石＝係数×2・形質協調3点・器官2点・体制15点・試作）'), h('option', { value: 't2' }, '仮値セットT2（基礎収入なし・進行3/5/8/13E・得点＝宝石×係数×2＋形質×宝石色数＋器官×協調＋体制15・係数ゲージ・形質買い替えなし・器官1R1人・代替払いなし・大量消費12/繁殖20,35・拡張x1込み・試作）'), h('option', { value: 't3' }, '仮値セットT3（T2＋トラックは収集物で自動進行〔Eでの進行も自由〕：緑＝器官3/6/9/12・青＝形質2/4/6/8・白＝協調2/4/6/8・赤＝P投入1/2/3/4。器官の場は8系統24枚・1R1人なし。得点＝宝石×係数×2＋体制15・試作）'), h('option', { value: 't4' }, '仮値セットT4（T3の土台を維持しP系コストを現行に戻す・社会トラック報酬から協調を外す・群体E/G＝P6で資源＋協調+1・大量消費(社会)+2・協調加算上限+4・赤ゲート＝繁殖＋大量消費(身体)のみ・身体Lv5★の排他無視は1R1回・器官6系統18枚で各カード1R1人・知性Lv4＝形質-1・ゲート 緑3/6/9/12 青2/4/6/9 白2/4/6/8 赤1/2/3/4・試作）'), h('option', { value: 't5' }, '仮値セットT5（T4＋身体＝生命核軸：収入時に保有L1個につきE+1〔全員〕・身体はLを投入した回数1/2/3/4で上がり報酬はLの質〔利回りの資源選択・L+1・緊急発進の対象拡大・1L=E4/G4・利回り2倍〕・身体の大量消費軽減と排他無視は廃止・試作）'), h('option', { value: 't6' }, '仮値セットT6（T5＋全トラックLv6〔E21で宝石+1・終了時にその色の収集物3個につき祝福+1〕・宝石セット共用〔購入ごとに+5G〕・身体＝Lv2でL+1と結晶化〔L2→祝福〕解放／Lv4で痕跡／Lv4は5投入のうち1回が3個同時／E進行5/8/13/21・利回りR1〜3＝2・R4〜7＝1・繁殖変換はL3でも・協調8到達で係数+1・群れの結晶〔協調3→祝福〕・律動T1生命核版・大量消費(代謝)14・個人カードなし・試作）'), h('option', { value: 't7' }, '仮値セットT7（T6＋器官と形質の役割再編：器官＝代謝/転写/群心/脈動/促進/連結の6系統から4系統・3段階で育つ・4E+1G/6E+2G/9E+3G、形質＝突然変異12種〔群居・長命・献身・擬態・先見・適応放散ほか〕・Gのみ・能力ごとの値段・割引は転写系だけ・4/7枚目で係数+1・試作）'), h('option', { value: 't8' }, '仮値セットT8（T7の資源3倍：初期資源・枠の獲得量・コスト・利回り・大量消費・繁殖P150 等が3倍。協調加算＝＋協調数・群心核＝ボーナス+1・2026-10-22）'), h('option', { value: 't10', selected: true }, '仮値セットT10（T8＋共用盤改訂・弱形質・E進行・知性/代謝Lv4・2026-11-05）'), h('option', { value: 't10s' }, '仮値セットT10・5ラウンド'), h('option', { value: 't11' }, '仮値セットT11（試作：T10 の資源1/3・協調2個ごとに+1・2026-11-05）'), h('option', { value: 't11s' }, '仮値セットT11・5ラウンド（試作）'), h('option', { value: 't8s' }, '仮値セットT8・5ラウンド（T8 と同じ数値で通常4＋神の到来1。試行・2026-10-30）'), h('option', { value: 't9' }, '仮値セットT9（資源1倍：協調は上限12・社会の自動進行 3/6/9/12・ボーナス＝協調3個につき+1・協調9で痕跡・2026-10-24）'))));
    { const rs = form.elements.rules; if (rs && G.RULES_VISIBLE) { G.RULES_VISIBLE.forEach(k => { if (![...rs.options].some(o => o.value === k)) rs.appendChild(h('option', { value: k }, G.RULESETS[k].name)); }); [...rs.options].forEach(o => { if (!G.RULES_VISIBLE.includes(o.value)) o.remove(); }); } } // 2026-11-07 ユーザー指示：T12 の追加と同時に過去の数値セットは画面の選択肢から隠す（?rules= と計測スクリプトからは使える）
    { const om = h('label', { class: 'frow' }, h('span', null, '器官の場'), h('select', { name: 'organMode' }, h('option', { value: 'draw' }, '抽選'), h('option', { value: 'pick' }, '選ぶ'))); const og = h('div', { class: 'frow orgpick', style: 'flex-wrap:wrap' }); form.appendChild(om); form.appendChild(og); // O-77：熟練者のときだけ・選ぶなら数値セットの全系統から organPick 個
      const sync = () => { const R = G.RULESETS[form.elements.rules.value] || {}; const ex = form.elements.mode.value === 'expert' && !!R.organSet; om.style.display = ex ? '' : 'none'; const pick = ex && form.elements.organMode.value === 'pick'; og.style.display = pick ? '' : 'none'; const keep = new Set([...og.querySelectorAll('input:checked')].map(i => i.value)); if (og.dataset.rules !== form.elements.rules.value) { og.innerHTML = ''; og.dataset.rules = form.elements.rules.value; og.appendChild(h('span', null, `系統（${R.organPick || 4} つ）`)); (R.organSet || []).forEach(l => og.appendChild(h('label', null, h('input', { type: 'checkbox', name: 'org_' + l, value: l, checked: keep.has(l) || undefined }), G.LINEAGES[l]))); } };
      form._orgSync = sync; ['mode', 'organMode', 'rules'].forEach(k => setTimeout(() => form.elements[k] && form.elements[k].addEventListener('change', sync), 0)); }
    { const orw = h('label', { class: 'frow' }, h('span', null, 'ラウンドの神託'), h('select', { name: 'oracleOn' }, h('option', { value: '1', selected: true }, '入れる'), h('option', { value: '0' }, '入れない'))); form.appendChild(orw); const osync = () => { const R = G.RULESETS[form.elements.rules.value] || {}; orw.style.display = R.oracle ? '' : 'none'; }; form._oraSync = osync; setTimeout(() => { if (form.elements.rules) form.elements.rules.addEventListener('change', osync); if (form.elements.mode) form.elements.mode.addEventListener('change', () => { form.elements.oracleOn.value = form.elements.mode.value === 'beginner' ? '0' : '1'; }); }, 0); } // T51（O-99）・O-101：神託の切り替え（神託のある数値セットだけ）。既定＝熟練者は入れる・初心者は入れない（セットアップを替えると既定に戻る）
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '拡張ルール'), h('select', { name: 'ext' }, h('option', { value: 'none' }, 'なし'), h('option', { value: 'x1' }, 'x1：形質購入2枠（割増＝ラウンド数のE）＋緊急発進の対象に形質＋協調発進（協調トークンで使用済み枠）＋大量消費(社会)協調+3・試作'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '資源スロット'), h('select', { name: 'slots' }, h('option', { value: 'v7' }, '現行（7スロット・各1人）'), h('option', { value: 'm4' }, '統合4（E系／G系／P系／全資源・各1人・試作）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'アンドゥ'), h('select', { name: 'undoMode' }, h('option', { value: 'free' }, '自由（誰でも即時）'), h('option', { value: 'approve' }, '承認（他の参加者全員のOK）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'シード'), h('input', { type: 'number', name: 'seed', value: Math.floor(Math.random() * 100000) })));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'AI の読み'), h('select', { name: 'aiDepth' }, h('option', { value: '1' }, '標準（1手読み＋ラウンドの計画・速い）'), h('option', { value: '2' }, '強い（2手のビーム探索・+10点程度・AI の手番が数秒かかる）'), h('option', { value: 'final', selected: true }, '最強（強いに加えて、最終ラウンドは最後まで打ってみて最終得点で選ぶ・AI の手番が数秒かかる）')))); // O-121：最強を既定に // 2026-11-05 v3.64：第53部の 2 手読みを画面で選べるように（URL の ?depth= があればそちらを優先）
    for (let i = 0; i < 4; i++) form.appendChild(h('label', { class: 'frow' }, h('span', null, `P${i + 1} 名前`), h('input', { type: 'text', name: 'name' + i, value: 'P' + (i + 1), maxlength: NAME_MAX }), h('small', null, h('label', { title: '簡易AIが操作（ソロ検証用）' }, h('input', { type: 'checkbox', name: 'bot' + i }), 'AI'))));
    form.appendChild(h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, okLabel)));
    form.addEventListener('submit', ev => { ev.preventDefault(); const fd = new FormData(form); let organs; { const R = G.RULESETS[fd.get('rules')] || {}; if (fd.get('mode') === 'expert' && R.organSet && fd.get('organMode') === 'pick') { organs = R.organSet.filter(l => fd.get('org_' + l) === l); if (organs.length !== (R.organPick || 4)) return toast(`器官の場は ${R.organPick || 4} 系統を選んでください（今 ${organs.length}）`, true); } } rememberForm(form); const n = +fd.get('n'); const players = []; for (let i = 0; i < n; i++) players.push({ name: cleanName(fd.get('name' + i)) || 'P' + (i + 1), passive: true }); const bots = []; for (let i = 0; i < n; i++) if (fd.get('bot' + i) === 'on') bots.push(i); onOk({ seed: +fd.get('seed'), mode: fd.get('mode'), slots: fd.get('slots') || 'v7', rules: fd.get('rules') || (G.RULES_VISIBLE || ['v1'])[0], ext: fd.get('ext') || 'none', undoMode: fd.get('undoMode'), players, bots, aiDepth: fd.get('aiDepth') === 'final' ? 2 : +(fd.get('aiDepth') || 1), ...(fd.get('aiDepth') === 'final' ? { aiFinal: true } : {}), ...(organs ? { organs } : {}), ...((G.RULESETS[fd.get('rules')] || {}).oracle && fd.get('oracleOn') === '1' ? { oracle: true } : {}) }); });
    if (form._orgSync) form._orgSync(); restoreForm(form); if (form._oraSync) form._oraSync(); { let sv = {}; try { sv = JSON.parse(localStorage.getItem(META_KEY) || 'null') || {}; } catch (e) { } if (!('oracleOn' in sv) && form.elements.oracleOn) form.elements.oracleOn.value = form.elements.mode.value === 'beginner' ? '0' : '1'; } // O-101：覚えた値が無ければセットアップで既定
    { const qr = new URLSearchParams(location.search).get('rules'), rs = form.elements.rules; if (qr && G.RULESETS[qr] && rs) { if (![...rs.options].some(o => o.value === qr)) rs.appendChild(h('option', { value: qr }, G.RULESETS[qr].name)); rs.value = qr; } }
    if (form._orgSync) { form._orgSync(); try { const sv = JSON.parse(localStorage.getItem(META_KEY) || 'null') || {}; form.querySelectorAll('.orgpick input').forEach(i => { if (i.name in sv) i.checked = !!sv[i.name]; }); } catch (e) { } } // O-20：隠しセット（T24 など）は ?rules= のときだけ選択肢に足す
    return form;
  }
  // 前回の設定値（シード以外）を localStorage に残し、次回のフォームに引き継ぐ
  const META_KEY = 'g01_meta';
  function rememberForm(form) { try { const keep = {}; Array.from(form.elements).forEach(el => { if (el.name && el.name !== 'seed') keep[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); localStorage.setItem(META_KEY, JSON.stringify(keep)); } catch (e) { } }
  function restoreForm(form) {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { }
    if (!saved) { if (form.elements.rules) form.elements.rules.value = (G.RULES_VISIBLE || ['t12'])[0]; if (form.elements.mode) form.elements.mode.value = 'expert'; return; } // v3.105（O-22 で発見）：初回は既定の数値セット（旧は 't12' 固定＝選択肢から外れて空になり、v1 で始まっていた） // 初回の既定＝T10・熟練者（2026-11-05 ユーザー指示：T8→T10。保存済みの端末は保存値を優先）
    Array.from(form.elements).forEach(el => { if (!el.name || !(el.name in saved)) return; if (el.type === 'checkbox') el.checked = !!saved[el.name]; else el.value = saved[el.name]; });
    if (form.elements.rules && !form.elements.rules.value && G.RULES_VISIBLE) form.elements.rules.value = G.RULES_VISIBLE[0]; // 保存値が隠したセット（T10 など）なら T12 に
  }
  function inviteUrl() { return location.origin + location.pathname + '?room=' + (game && game.code || ''); }
  function bindNet() { Net.onChange = () => { rebuildState(); render(); }; try { const q = new URLSearchParams(location.search); if (q.get('room') !== game.code) { q.set('room', game.code); history.replaceState(null, '', location.pathname + '?' + q.toString()); } } catch (e) { } rebuildState(); render(); } // O-48：アドレスに ?room= を付ける（再読み込みでそのまま戻れる）

  // ---------- 画面：セットアップ ----------
  function renderSetup() {
    const box = h('div', { class: 'setup' }); const n = st.nPlayers;
    if (isOnline()) box.appendChild(renderSeats());
    if (st.setupStep === 'species') {
      const i = st.setupIdx; const pl = st.players[i];
      box.appendChild(h('h2', null, `種族選択：${pl.name}（${i + 1}/${n}）`));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      const taken = st.players.map(q => q.species);
      Object.keys(G.SPECIES).forEach(id => { const sp = G.speciesInfo(st, id); box.appendChild(h('button', { class: 'bigbtn withart', disabled: taken.includes(id), onclick: () => submit({ type: 'species', pid: i, species: id }) }, art(SPECIES_ART[id], 'portrait'), h('b', null, sp.name), h('em', { class: 'sptype' }, sp.type), h('span', null, sp.gem !== null ? [pc('gem', String(sp.gem), { title: `初期の痕跡 ${sp.gem}` }), sp.bless ? pc('bless', String(sp.bless), { title: `初期の祝福 ${sp.bless}` }) : null, `・初期 E${sp.stock.E}/G${sp.stock.G}/P${sp.stock.P}${sp.L ? '/L' + sp.L : ''}`] : `手番順${sp.order}・初期 E${sp.stock.E}/G${sp.stock.G}/P${sp.stock.P}${sp.L ? '/L' + sp.L : ''}`) /* O-78（T43）：手番値の代わりに初期の痕跡 */, h('small', { class: 'sphint' }, sp.hint), spFx(id) || h('small', null, '特性：' + sp.passive))); });
    } else if (st.setupStep === 'armTrait') {
      const i = st.setupIdx; const pl = st.players[i];
      box.appendChild(h('h2', null, `${pl.name}（九腕知性体）：初期形質を1枚選択（G${G.RULESETS[st.rules || 'v1'].armTraitMax || 4}以下）`));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      G.traitSortView(st, G.armTraitOptions(st)).forEach(t => box.appendChild(h('button', { class: 'bigbtn', onclick: () => submit({ type: 'startTrait', pid: i, trait: t }) }, h('b', null, `${t} ${G.TRAITS[t].name}`), h('small', null, rtxt(G.TRAITS[t].strong)))));  // 2026-10-28：{n} を規模に合わせる
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
    const spi = G.speciesInfo(st, p.species); const st0 = [p.passive ? '特性：' + spi.passive : '特性なし']; const spf = p.passive ? spFx(p.species) : null; if (spf) st0.shift(); // O-86
    G.TRACKS.forEach(t => { if (p.lv[t] > 1) st0.push(`${G.TRACK_INFO[t].name}Lv${p.lv[t]}`); });
    if (p.coop) st0.push(`協調${p.coop}`);
    if (p.traits.length) st0.push('形質 ' + p.traits.map(t => `${t.id} ${G.TRAITS[t.id].name}`).join('・'));
    box.appendChild(h('div', { class: 'note' }, spf, spf && st0.length ? '／' : null, st0.join('／')));
    box.appendChild(h('div', { class: 'note' }, spi.hint));
    const order = G.RULESETS[st.rules || 'v1'].turnOrder === 'gemsDesc' ? st.players.slice().sort((a, b) => G.realGems(b) - G.realGems(a) || (b.gemsets || 0) - (a.gemsets || 0) || G.SPECIES[b.species].order - G.SPECIES[a.species].order) : st.players.slice().sort((a, b) => G.SPECIES[b.species].order - G.SPECIES[a.species].order); // O-78（T43）：痕跡の多い順
    box.appendChild(h('div', { class: 'note' }, '第1ラウンドの手番順：' + order.map(q => `${q.name}（${G.SPECIES[q.species].name}）`).join(' → ')));
    const done = st.players.filter(q => q.cards.length);
    if (done.length) box.appendChild(h('div', { class: 'note' }, '選択済み：' + done.map(q => `${q.name} ${q.cards.join('・')}`).join('／')));
    return box;
  }
  function renderSeats() {
    const box = h('div', { class: 'sec seats' }, h('h3', null, `ルーム ${game.code}　参加端末：${Net.seatUids().length}`));
    box.appendChild(nameRow()); // O-50：部屋に入るときの名前（着席の前に入れる・あとから変えられる）
    st.players.forEach((p, i) => {
      const s = Net.seats[i]; const isMe = s && s.uid === Net.uid;
      box.appendChild(h('div', { class: 'seat' }, h('span', { class: 'mk p' + i }, i + 1), ` ${p.name}：`, isBot(i) ? 'AI' : s ? (isMe ? '自分' : `他端末`) : '空席', ' ',
        isBot(i) ? null : !s ? h('button', { onclick: async () => { try { await Net.claimSeat(i, myName()); } catch (e) { toast(e.message, true); } } }, '着席') : isMe ? h('button', { onclick: () => Net.releaseSeat(i) }, '離席') : null));
    });
    { const url = inviteUrl(); const inp = h('input', { type: 'text', readonly: true, value: url, class: 'invite', onclick: (ev) => ev.target.select() }); // O-48：友人に送る URL
      box.appendChild(h('div', { class: 'frow' }, h('span', null, '招待 URL'), inp, h('button', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('URL をコピーしました'); } catch (e) { inp.select(); toast('URL を選択しました（コピーしてください）'); } } }, 'コピー'))); }
    box.appendChild(h('p', { class: 'note' }, 'この URL を送ると、相手はそのまま参加できます。各自が自分の席に「着席」してください（1 人で複数席に着けば 1 台で複数人分も回せます）。'));
    return box;
  }

  // ---------- 画面：プレイ ----------
  function renderPlay(root) {
    const p = G.cur(st); const can = mine(p.id);
    if (st.pendingUndo) root.appendChild(renderUndoBanner());
    const un = renderUndoNotice(); if (un) { root.appendChild(un); if (renderUndoNotice._toasted !== st.undoInfo.key) { renderUndoNotice._toasted = st.undoInfo.key; toast('あなたの行動が巻き戻されました', true); } }
    const grid = h('div', { class: 'grid' + (can ? '' : ' ro') });
    const tabs = h('div', { class: 'tabs' }, h('button', { class: tab === 'organ' ? 'on' : '', onclick: () => { tab = 'organ'; render(); } }, '器官の場'), h('button', { class: tab === 'trait' ? 'on' : '', onclick: () => { tab = 'trait'; render(); } }, '形質プール'));
    { const colS = h('div', { class: 'col shared' }, renderRoundTrack(), renderTracks(p, can), renderExcl(p, can), renderShared(p, can), tabs, (tab === 'organ' || boardOn()) ? renderOrganField(p, can) : null, (tab !== 'organ' || boardOn()) ? renderTraitPool(p, can) : null); grid.appendChild(boardOn() ? h('div', { class: 'bdscroll' }, colS) : colS); } // O-57：盤では器官の場と形質プールを両方出す // O-59：盤は横に送れる枠に入れる
    grid.appendChild(h('div', { class: 'col me' }, renderPlayer(p, can), isOnline() ? renderSeatsMini() : null, renderOthers(p), renderLog()));
    root.appendChild(grid);
    const pend = p.pending[0];
    if (pend && can) handlePending(p, pend);
  }
  // O-48：ヘッダの資源＝オンラインは自分の席だけ／ローカルで人が複数いるときは手番の人だけ
  function headerPids() { const hs = myHumanPids(); if (isOnline() || hs.length <= 1 || !st || st.phase !== 'play') return hs; const c = G.cur(st).id; return hs.includes(c) ? [c] : []; }
  // O-48：自分の番の知らせ（消えない帯・タブの題の印）と直前の手（ほかの人・AI の最後の 1 手）
  const BASE_TITLE = document.title; let peekPid = null; // O-52：手番順の札で選んだほかの人（資源の行を出す・1 度に 1 人）
  function myTurnNow() { return !!(st && st.phase === 'play' && !st.ended && mine(G.cur(st).id)); }
  function lastOtherMove() {
    if (!st || st.phase !== 'play') return null; const me = isOnline() ? myHumanPids() : [G.cur(st).id];
    for (let i = st.log.length - 1; i >= 0; i--) { const l = st.log[i]; if (l.kind === 'act' && l.p !== null && l.p !== undefined && !me.includes(l.p)) return Object.assign({ i }, l); if (l.kind === 'round') break; }
    return null;
  }
  // O-50：経過＝自分の前回の手（行動）から今までの手。行動・手番を使わない行動・自動で上がった進化・ラウンドの区切り。収入などは載せない
  function sinceRows() {
    if (!st || st.phase !== 'play') return null; const c = G.cur(st).id;
    const me = isOnline() ? myHumanPids() : (mine(c) ? [c] : myHumanPids());
    let start = -1; for (let i = st.log.length - 1; i >= 0 && me.length; i--) { const l = st.log[i]; if (l.kind === 'act' && me.includes(l.p)) { start = i; break; } }
    if (start < 0) { for (let i = st.log.length - 1; i >= 0; i--) if (st.log[i].kind === 'round') { start = i; if (me.length) { const f = st.log.findIndex(l => l.kind === 'round'); if (f >= 0) start = f; } break; } } // まだ自分の手がない＝対局の最初から（見ているだけの人は今のラウンドから）
    if (start < 0) return null; const rows = [];
    for (let i = start; i < st.log.length; i++) {
      const l = st.log[i]; if (l.kind === 'round') { rows.push({ round: l.r }); continue; } if (l.p === null || l.p === undefined) continue;
      const nm = st.players[l.p].name + '：'; if (!l.msg.startsWith(nm)) continue; const body = l.msg.slice(nm.length);
      if (l.kind === 'act') rows.push({ p: l.p, msg: body, mine: i === start });
      else if (l.kind === 'info' && /^(身体|知性|社会|代謝|星海) Lv\d+（.*自動進化）/.test(body)) rows.push({ p: l.p, msg: body.replace(/（.*で自動進化）/, '（自動進化）'), sub: true });
      else if (l.kind === 'info' && /合流進出|手番なし/.test(body)) rows.push({ p: l.p, msg: body, sub: true });
    }
    return rows;
  }
  function entrySlot(e) { if (!e) return null; if (e.type === 'res' || e.type === 'tributeSlot') return e.slot; if (e.type === 'mass') return e.kind; if (e.type === 'organ') return 'OC_' + e.organ; if (e.type === 'trait') return 'TC_' + e.trait; const m = { breed: 'BRD', burst: 'BST', gather: 'GTH' }; if (e.type === 'track') return 'TRK_' + (e.track || 'body'); if (e.type === 'altar') return 'ALT_' + e.res; return m[e.type] || null; }
  let lastSeen = { key: null, t: 0 };
  function turnBar() {
    const mt = myTurnNow(); document.title = (mt ? '● ' : '') + BASE_TITLE;
    const lm = lastOtherMove(); const out = h('div', { class: 'turnbar' + (mt ? ' mine' : '') });
    if (mt) { const q = G.cur(st); const hs = myHumanPids(); out.appendChild(h('b', null, hs.length > 1 && !isOnline() ? `${q.name} の番です` : 'あなたの番です')); }
    else if (st && st.phase === 'play' && !st.ended && isOnline()) { const q = G.cur(st); const s = Net.seats[q.id]; out.appendChild(h('span', { class: 'waitmv' }, h('span', { class: 'mk p' + q.id }, q.id + 1), ` ${q.name} の番${isBot(q.id) ? '（AI）' : s ? '' : '（空席）'}を待っています`)); } // O-48：ほかの人の番の間も誰を待っているかを出す
    { const rows = sinceRows(); if (rows && rows.some(r => !r.round)) { const box = h('div', { class: 'since' }); rows.forEach(r => box.appendChild(r.round ? h('div', { class: 'sv rd' }, `ラウンド ${r.round}`) : h('div', { class: 'sv' + (r.sub ? ' sub' : '') + (r.mine ? ' me' : '') }, h('span', { class: 'mk p' + r.p }, r.p + 1), h('b', null, st.players[r.p].name), ' ' + r.msg))); out.appendChild(box); setTimeout(() => { box.scrollTop = box.scrollHeight; }, 0); } } // O-50：自分の前回の手番から今までの手（「直前：」の 1 行を置き換え）
    if (lm) {
      const key = lm.i + ':' + st.log.length; if (lastSeen.key !== lm.i) { lastSeen = { key: lm.i, t: Date.now() }; setTimeout(() => { if (lastSeen.key === lm.i) markLastSlot(null); }, 4000); }
      const ents = isOnline() ? (Net.entries || []) : (game.entries || []); let e = null; for (let i = ents.length - 1; i >= 0; i--) { const x = ents[i]; if (x.pid === lm.p && !['undo', 'undoRound', 'undoOk', 'undoCancel', 'resolve'].includes(x.type)) { e = x; break; } }
      if (Date.now() - lastSeen.t < 4000) setTimeout(() => markLastSlot(entrySlot(e)), 0); }
    return out.childNodes.length ? out : null;
  }
  function markLastSlot(id) { document.querySelectorAll('.lastmove').forEach(x => x.classList.remove('lastmove')); if (id) document.querySelectorAll(`[data-slot="${id}"]`).forEach(x => x.classList.add('lastmove')); }
  // O-48：ほかの人の個人ボードを見るだけの形で開く
  // O-49：記号の一覧（凡例）。カードごとの一覧はガイドの「カードの記号一覧」
  function showLegend() { const back = $('#modal'); back.innerHTML = ''; const close = () => { back.classList.remove('open'); back.onclick = null; }; const box = h('div', { class: 'modal-box fxmodal' }, h('h3', null, '記号の一覧'), G.FX.legend(), h('p', { class: 'note' }, '記号にマウスを当てると全文。', h('a', { href: '../guide/symbols.html', target: '_blank', rel: 'noopener' }, 'カードの記号一覧'), '（全カード・報酬）'), h('div', { class: 'mbtns' }, h('button', { type: 'button', class: 'primary', onclick: close }, '閉じる'))); back.appendChild(box); back.classList.add('open'); back.onclick = (ev) => { if (ev.target === back) close(); }; }
  function showBoard(q) { const back = $('#modal'); back.innerHTML = ''; const box = h('div', { class: 'modal-box boardview' }, h('h3', null, `${q.name} の個人ボード（見るだけ）`), h('div', { class: 'preview' }, renderPlayer(q, false)), h('div', { class: 'mbtns' }, h('button', { type: 'button', class: 'primary', onclick: () => { back.classList.remove('open'); back.onclick = null; } }, '閉じる'))); back.appendChild(box); back.classList.add('open'); back.onclick = (ev) => { if (ev.target === back) { back.classList.remove('open'); back.onclick = null; } }; }
  function renderHeader() {
    const hd = $('#hdr'); hd.innerHTML = ''; if (!st || st.phase !== 'play') document.title = BASE_TITLE; // O-48：自分の番の印は対局中だけ
    hd.appendChild(h('a', { href: '../guide/', target: '_blank', rel: 'noopener', class: 'rulelink' }, 'ルール')); // 2026-10-28：「game01 モック」の表記は不要（1行に収める）
    if (!st || st.phase !== 'play') { if (game && isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code)); if (st && st.phase === 'end') hd.appendChild(h('span', { class: 'hbtns' }, h('button', { onclick: exportJson }, '保存(JSON)'), h('button', { onclick: exportCsv }, 'ログCSV'))); if (game) hd.appendChild(h('span', { class: 'hbtns' }, h('button', { onclick: quit }, '退出／新規'), game && isOnline() ? h('button', { onclick: deleteThisRoom }, 'ルーム削除') : null)); hd.appendChild(h('span', { class: 'hmenuwrap' }, ...dispGroup(false), h('small', { class: 'ver' }, 'v' + (G.VERSION || '')))); return; }
    { const O = st.shared && st.shared.oracle, oc = O && G.oracleCard(st) ? G.RULESETS[st.rules || 'v1'].oracle.cards[G.oracleCard(st)].text : null; hd.appendChild(h('span', { class: 'pill rpill', title: O ? 'ラウンドの神託：' + O.map((k, i) => `R${i + 1}　${G.oracleLabel(G.RULESETS[st.rules || 'v1'].oracle.cards[k])}`).join('／') : null }, `ラウンド ${st.round}/${G.RULESETS[st.rules || 'v1'].rounds || G.ROUNDS}`, oc ? h('small', { class: 'rorc', 'data-otip': fxOn() && G.FX && G.FX.lines(st, 'oracle', G.oracleCard(st)) ? `R${st.round}　${G.oracleLabel(G.RULESETS[st.rules || 'v1'].oracle.cards[G.oracleCard(st)])}` : null }, '・神託：', ...(fxOn() && G.FX && G.FX.lines(st, 'oracle', G.oracleCard(st)) ? [G.FX.render(G.FX.lines(st, 'oracle', G.oracleCard(st)), oc)] : [oc])) : null)); } // T51（O-99）：今のラウンドの神託（盤の画面でも見えるようにヘッダに 1 行）
    if (isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code));
    // 版の小文字＋ボタン群の開閉「≡」は1行目の右端（2026-10-28 ユーザー要望：1行を占有させない）
    hd.appendChild(h('span', { class: 'hmenuwrap' }, ...dispGroup(true), h('small', { class: 'ver' }, 'v' + (G.VERSION || '')), G.FX && G.FX.on(st) ? h('button', { class: 'fxbtn', title: '効果の記号（いつ・得る・払う・軽減など）の見方', onclick: showLegend }, '記号の一覧') : null, h('button', { class: 'hmenu', title: 'ボタン（戻す・保存・ログ・退出など）の表示／非表示', onclick: () => { menuOpen = !menuOpen; try { localStorage.setItem(MENU_KEY, menuOpen ? '1' : '0'); } catch (e) { } render(); } }, menuOpen ? '×' : '≡')));
    const to = h('span', { class: 'order', title: G.RULESETS[st.rules || 'v1'].turnOrder === 'gemsDesc' ? '手番順：ラウンドの始めに痕跡の多い順（同数は祝福の多い順・それも同じなら前のラウンドの順）' : '手番順：ラウンド2から痕跡の少ない順' }, fxOn() && G.RULESETS[st.rules || 'v1'].turnOrder === 'gemsDesc' ? h('span', { class: 'ordic' }, G.FX.ic('order'), G.FX.ic('gem'), '：') : '手番順：'); // O-86：痕跡の多い順
    { const hp0 = headerPids(); if (peekPid !== null && (!st.players[peekPid] || hp0.includes(peekPid))) peekPid = null;
      st.turnOrder.forEach((pid, i) => { const q = st.players[pid]; const other = !hp0.includes(pid); to.appendChild(h('span', { class: 'chip' + (i === st.cur ? ' now' : '') + (q.left.W + q.left.AT === 0 ? ' done' : '') + (other ? ' tap' : '') + (peekPid === pid ? ' peek' : ''), title: other ? (peekPid === pid ? 'もう一度押すと資源の行を閉じる' : '押すとこの人の資源を自分の資源の下に出す') : null, onclick: other ? () => { peekPid = peekPid === pid ? null : pid; render(); } : null }, h('span', { class: 'mk p' + q.id }, q.id + 1), `${q.name} ${leftTxt(q)}`)); }); } // O-52：ほかの人の札を押すとその人の資源の行
    hd.appendChild(to);
    { const tb = turnBar(); if (tb) hd.appendChild(tb); } // O-48：自分の番の帯・直前の手
    // 自分の資源（毎手番見るのでヘッダに常時表示）：この端末の人間席ごとに E/G/P/L/協調＋次の収入
    const hres = h('span', { class: 'hres' });
    { const hp = headerPids(); (peekPid !== null ? [peekPid] : []).concat(hp).forEach(pid => { const q = st.players[pid]; const inc = G.income(q); const isPeek = !hp.includes(pid); const row = h('span', { class: 'hresp' + (isPeek ? ' peek' : '') }, h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1), isPeek ? h('b', { class: 'pkname' }, q.name) : null);
      ['E', 'G', 'P', 'L', 'coop'].forEach(k => row.appendChild(h('span', { class: 'hrb r' + k, title: k === 'coop' ? '協調' : RES_JP[k] + (k !== 'L' ? '　次の収入 +' + inc[k] : '　毎ラウンド+1') }, ic(k), h('b', null, String(q[k])), (k === 'L' || k === 'coop') ? null : h('small', null, `+${inc[k]}`))));
      // 2026-11-04 ユーザー要望：収集物（器官・形質・協調・L投入）の数と、次のゲート（Lv）までの不足数をヘッダに常時表示
      { const R = G.RULESETS[st.rules || 'v1']; const bodyL = R.bodyAxis === 'L';
        const items = [['metab', 'organ', q.organs.length, '器官'], ['intel', 'trait', q.traits.length, '形質'], ['social', null, null, '協調'], ['body', bodyL ? 'L' : 'P', bodyL ? (q.lInvested || 0) : (R.pInvKinds === 'bodyOnly' ? (q.pInvBody || 0) : (q.pInv || 0)), '投入']];
        items.forEach(([track, icon, n, label]) => { const gr = R.gates ? G.gateReq(q, track) : null; const gap = gr ? Math.max(0, gr.need - gr.have) : null; const nextLv = q.lv[track] + 1;
          const tip = `${label}（${G.TRACK_INFO[track].name}の素材）` + (gr ? `　次の Lv${nextLv} まで あと${gap}（必要${gr.need}・数えた分${gr.have}）` : `　Lv5 まで到達済み（臨界なし）`);
          if (track === 'social') { const el = row.querySelector('.hrb.rcoop'); if (el && gr) el.appendChild(h('small', { class: 'gap', title: tip }, `あと${gap}`)); return; }
          row.appendChild(h('span', { class: 'hrb rcol', title: tip }, icon ? ic(icon) : null, icon === 'L' || icon === 'P' ? h('small', null, objIc('invest'), '投入') : null, h('b', null, String(n)), (() => { const ex = (track === 'metab' || track === 'intel') ? G.gateCount(q, track) - n : 0; return ex > 0 ? h('small', { title: '呼吸核・神経など「1 枚ぶんとして数える」分' }, `(+${ex})`) : null; })(), gr ? h('small', { class: 'gap' }, `あと${gap}`) : h('small', null, '到達'))); }); }
      { const n6 = G.lv6Preview(st, q); if (q.lv && G.TRACKS.some(t => q.lv[t] >= 6)) row.appendChild(h('span', { class: 'hrb rconv', title: '神の裁定の見込み：Lv6 に達したトラックの素材3個につき祝福+1（身体＝払ったL・知性＝形質・社会＝協調・代謝＝器官）' }, h('small', null, '終了時'), h('b', null, '祝福+' + n6))); } // 案B：Lv6 の終了時換算を見える化
      hres.appendChild(row); }); }
    if (hres.childNodes.length) hd.appendChild(hres);
    const btns = h('span', { class: 'hbtns menu' + (menuOpen ? '' : ' hidden') });
    btns.appendChild(hintBtn()); // O-122
    btns.appendChild(h('button', { title: '自分の直前の行動まで戻す（間にあるAI・他プレイヤーの行動も取り消される）', onclick: () => submit(undoEntry()) }, '1手戻す'));
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
  function quit() { if (!confirm('この画面を閉じて入口に戻りますか？（ローカルの進行は自動保存されています）')) return; if (isOnline()) { Net.leave(); try { const q = new URLSearchParams(location.search); q.delete('room'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) { } } game = null; st = null; render(); }
  async function deleteThisRoom() { if (!isOnline() || !confirm(`ルーム ${game.code} を削除しますか？（全員の進行が消えます・元に戻せません）`)) return; try { await Net.deleteRoom(game.code); game = null; st = null; toast('ルームを削除しました'); render(); } catch (e) { toast(e.message, true); } }
  function renderUndoBanner() {
    const u = st.pendingUndo; const isMine = u.uid === Net.uid; const oks = Net.oksFor(u.id);
    return h('div', { class: 'banner' }, `アンドゥ要求（${u.type === 'undo' ? '1手' : 'ラウンド頭'}）が承認待ち：承認 ${oks.length}/${Net.otherUids(u.uid).length}　`,
      !isMine && !oks.includes(Net.uid) ? h('button', { class: 'primary', onclick: () => submit({ type: 'undoOk', target: u.id }) }, '承認する') : null,
      isMine ? h('button', { onclick: () => submit({ type: 'undoCancel', target: u.id }) }, '取り下げる') : null);
  }
  function renderResult() {
    const box = h('div', { class: 'result' }, h('h2', null, '最終結果'));
    const RR = G.RULESETS[st.rules || 'v1']; const showDev = !!RR.devPt || RR.scoreMode === 'mult', showOrg = !!RR.organPt || RR.scoreMode === 'mult', showReg = !RR.noRegime && !!RR.regimePt; const showStar = !!(RR.star && st.shared.starCards); // 0 点の列は出さない
    const tb = h('table', null, h('tr', null, ...['順位', '名前', '合計', '痕跡', '祝福', RR.coef2 ? '繁栄度/成熟度' : '係数', '痕跡・祝福点', showDev ? '発展度' : null, showOrg ? '器官' : null, showReg ? '体制' : null, showStar ? G.STAR_NAME : null].filter(Boolean).map(x => h('th', null, x))));
    st.result.forEach((r, i) => tb.appendChild(h('tr', null, ...[i + 1, r.name, r.total, r.real, r.vg, r.coef2 ? `×${r.cfB}/×${r.cfC}` : '×' + r.cf, r.core, showDev ? r.dev : null, showOrg ? (r.org || 0) : null, showReg ? r.reg : null, showStar ? (q => `${RR.star.lv1 ? G.starLvText(st, q.star | 0) : (q.star | 0) + ' 段'}・痕跡${q.starGem || 0}${q.starPros ? '・繁栄度+' + q.starPros : ''}`)(st.players[r.pid]) : null].filter(x => x !== null).map(x => h('td', null, String(x))))));
    box.appendChild(tb);
    if (st.hist && st.hist.length) {
      const hb = h('div', { class: 'hist' }, h('h3', null, 'ラウンド推移（各ラウンド開始時の得点）'));
      const t2 = h('table', null, h('tr', null, h('th', null, 'R'), ...st.players.map(p => h('th', null, p.name))));
      st.hist.forEach(hh => t2.appendChild(h('tr', null, h('td', null, hh.label || ('R' + hh.round)), ...hh.rows.map(r => h('td', { title: `E${r.E} G${r.G} P${r.P}｜Lv${r.lv}｜痕跡${r.gems}＋祝福${r.vg}｜×${r.coef}` }, String(r.score), r.carry ? h('small', { class: 'carry' }, `持ち越し E${r.carry.E} G${r.carry.G} P${r.carry.P} L${r.carry.L}`) : null))))); // O-120：前のラウンドの終わりに残った資源（収入の前）
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
  const noSub = a => (a && a.useL && a.type !== 'res' && G.RULESETS[st.rules || 'v1'].noLSub) ? Object.assign({}, a, { useL: 0 }) : a; // T22（v3.101・ユーザー指摘）：代用払いなしでは事前判定・実行とも生命核の代用を外す（器官カードに「生命核は E の代わりに払えません」が出ていた）
  function check(action) { try { G.tryApply(st, noSub(action)); return null; } catch (e) { return e.message; } }
  function actBtn(attrs, reason, ...kids) { const b = h('button', attrs, ...kids); if (reason) { b.classList.add('na'); b.title = (b.title ? b.title + '\n' : '') + '× ' + reason; if (reason !== roMsg && !/の手番$/.test(reason)) b.addEventListener('click', () => toast('× ' + reason, true), true); } return b; } // 2026-11-06 ユーザー指摘（T10-H3）：スマホではツールチップが見えず「暗いだけで理由が分からない」→ v3.69 で枠内に常時表示 → 2026-11-07 ユーザー指摘「選択したときに見えればよい。常時は邪魔」：押したときにトーストで出す（押した後の処理〔緊急発進のダイアログ等〕はそのまま続く）

  // T4：社会トラック報酬から協調を外す（P／Wなし実行権）・知性Lv4＝形質-1
  const REW_SHORT_T4 = { social: { 2: 'P+{6}', 3: ['自由行動+1', 'P+{10}'], 4: '自由行動+1', 5: ['自由行動+2', '自由行動+1'] }, intel: { 4: '形質-{1}（恒久）' } };
  const REW_SHORT_T5_BODY = { 2: '産出 E/G選択', 3: ['L+1 緊急進出の対象拡大', 'L+1'], 4: '1L=E4/G4 産出P可', 5: ['産出×2 L+1', 'L+1'] };
  // 2026-10-28：短文は数値セットのフラグから組み立て、{n} で規模（T8＝×3）に合わせる（ツールチップの正本 G.trackRewardText と同じ内容）
  const REW_SHORT_T7_BODY = { 2: 'L+1 献上(生命核)解放', 3: ['1L=E{4}/G{4} L+1', '1L=E{4}/G{4}'], 4: '痕跡+1 産出×2', 5: ['1L=E{5}/G{5} L+1', 'L+1'] };
  const REW_SHORT_T7_INTEL = { 2: 'G+{3}', 3: ['模倣/発現を今すぐG0', '模倣/発現 G-{1}'], 4: '献上(遺伝子)何度でも', 5: ['常に強効果', 'G+{6}'] };
  function rewShort(t, l) { const R = G.RULESETS[st.rules || 'v1']; if (l === 6) return R.lv6First ? [`痕跡+${R.lv6Gems ? R.lv6Gems.first : 1}・祝福+1`, `痕跡+${R.lv6Gems ? R.lv6Gems.later : 1}（祝福なし）`].concat(R.lv6Convert ? ['終了時 神の裁定（Lv6 の全員）'] : []) : /* O-129：先駆・追随・終了時を別の行に */ (R.lv6Convert ? '痕跡+1 ＋神の裁定' : '痕跡+1');
    if (R.bodyAxis === 'L' && t === 'body' && R.bodyRewards === 'P' && R.bodyStar && R.bodyStar[l]) { const f = x => ['L+' + (x.L || 0), x.P ? 'P+' + x.P : null].filter(Boolean).join(' '); return [f(R.bodyStar[l].s), f(R.bodyStar[l].w)]; } // T22（O-18）
    if (R.bodyAxis === 'L' && t === 'body' && R.bodyRewards === 'P') { const b = Object.assign({}, REW_SHORT_T7_BODY); if (!((R.lCrystal || R.altar) && (R.lCrystalLv || 4) === 2)) b[2] = 'L+1'; else if (R.altar) b[2] = 'L+1 祭壇(生命核)解放'; /* O-40 */ if (!R.bodyLv4Gem) b[4] = '産出×2'; return b[l]; }
    if (R.bodyAxis === 'L' && t === 'body') { const b = { 2: ['産出 E/G選択', R.body2L ? 'L+1' : null, R.lCrystal && (R.lCrystalLv || 4) === 2 ? '結晶化解放' : null].filter(Boolean).join(' '), 4: [R.bodyLv4Gem ? '痕跡+1' : null, '1L=E4/G4 産出P可'].filter(Boolean).join(' '), 5: R.body5Coef ? ['係数+1 L+1', 'L+1'] : REW_SHORT_T5_BODY[5] }; return b[l] || REW_SHORT_T5_BODY[l] || REW_SHORT[t][l]; }
    if (R.intelRewards === 'learn' && t === 'intel' && REW_SHORT_T7_INTEL[l]) return REW_SHORT_T7_INTEL[l];
    if (R.intelFlip && t === 'intel' && (l === 3 || l === 5)) return l === 3 ? [REW_SHORT_T10_INTEL[3][0], '弱の形質1枚を強に'] : [R.flip5sMax ? `弱の形質${R.flip5sMax}枚まで強に・常に強` : '弱の形質を全部強に・常に強', '弱の形質2枚まで強に']; // O-37（T30）／T31（O-44）：flip5sMax
    if (R.intelRewards === 'trait' && t === 'intel' && REW_SHORT_T10_INTEL[l]) return REW_SHORT_T10_INTEL[l]; if (R.metab4 === 'special' && t === 'metab' && l === 4) return '特殊器官 1 枚'; if (R.metab4 === 'organNoG' && t === 'metab' && l === 4) return R.organLateFee === 0 ? '器官のGなし' : '器官のG・追随の代償なし'; // T10
    if (R.joinNow && t === 'social' && l === 3) { const s3 = REW_SHORT_T4.social[3]; return R.socialRewards === 'shield' ? ['合流進出×1', s3[1]] : REW_SHORT[t][l]; } // 2026-11-11 ユーザー指摘（T20-H1）：Lv3★ 強が「自由行動+1」のまま
    if (R.joinNow && t === 'social' && (l === 4 || l === 5)) return { 4: '合流進出×1', 5: R.socialRewards === 'shield' ? (R.social5Res ? [`合流進出×1 好きな資源+${R.social5Res}`, '合流進出×1'] : ['合流進出×2', '合流進出×1']) : ['協調+1 合流進出×2', '協調+1 合流進出×1'] }[l]; // T19 #1。O-33（v3.116）：shield の世界は協調+1 なし
    if (R.metab3Inc !== undefined && t === 'metab' && l === 3) return [`E・G収入+${R.metab3Inc}`, REW_SHORT.metab[3][1]]; // T29（O-30 ③）
    if (R.metab5Inc && t === 'metab' && l === 5) return [`収入全種+${R.metab5Inc[0]}`, `収入全種+${R.metab5Inc[1]}`]; // T19 #4
    if (R.socialRewards === 'shield' && t === 'social') return REW_SHORT_T4.social[l] || REW_SHORT[t][l]; if (R.intel4 === 'traitDisc' && t === 'intel' && l === 4) return REW_SHORT_T4.intel[4]; return REW_SHORT[t][l]; }
  const REW_SHORT_T10_INTEL = { 2: 'G+{3}', 3: ['今すぐ形質 弱なら無料', '次の形質 -{3}G'], 4: '形質3枚ごと祝福+1', 5: ['常に強効果', 'G+{6}'] }; // T10（第58〜59部）// 2026-11-05：{n} で規模に合わせる（旧 'G+3' は T10 で G+9 なのに G+3 と表示・-9G／G+18 は T11〔×1〕で合わない）
  const REW_SHORT = {
    body:   { 2: 'P+8', 3: ['淘汰×1無料', 'P+15'], 4: '淘汰-5', 5: ['淘汰 排他無視+-5', '淘汰-5'] },
    intel:  { 2: 'G+3', 3: ['形質1枚 G-3', 'G+1/R'], 4: '追加行動×1 E半額', 5: ['形質-2・常に強', 'G+6'] },
    social: { 2: '協調+1', 3: ['協調+2', '協調+1 G+3'], 4: '自由行動+1', 5: ['協調+1 自由行動+2', '協調+1 自由行動+1'] },
    metab:  { 2: 'E収入+{1}', 3: ['E・G収入+{1}', 'E+{8}'], 4: 'E↔G無料変換', 5: ['収入全種+{2}', '収入全種+{1}'] },
  };
  // O-122：ヒント＝その手を打った直後に自分の点がいくつ増えるか（既定は隠す・端末ごとに覚える）
  const HINT_KEY = 'g01_hint'; let hintOn = false; try { hintOn = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { }
  function setHint(v) { hintOn = v; try { localStorage.setItem(HINT_KEY, v ? '1' : '0'); } catch (e) { } }
  function hintBtn(onToggle) { return h('button', { type: 'button', class: 'hint' + (hintOn ? ' on' : ''), 'aria-pressed': hintOn ? 'true' : 'false', title: 'その手で増える点の見込みを出す／隠す', onclick: (ev) => { setHint(!hintOn); if (onToggle) { ev.currentTarget.classList.toggle('on', hintOn); ev.currentTarget.setAttribute('aria-pressed', hintOn ? 'true' : 'false'); onToggle(); } else render(); } }, 'ヒント'); }
  function hintPts(a) { if (!a || !st || st.phase !== 'play' || st.ended || !mine(a.pid) || G.cur(st).id !== a.pid) return null; let s2; try { s2 = G.tryApply(st, noSub(a)); } catch (e) { return null; } return G.score(s2, s2.players[a.pid]).total - G.score(st, st.players[a.pid]).total; }
  const hintEl = (n) => n > 0 ? h('b', { class: 'hintpt' }, `+${n}点`) : null;
  function hintAct(p, id) { // 枠のヒントに使う手＝sample。繁殖は打てる段数ぶん・祭壇の恩寵（2 口）は払える最多の口
    const R0 = G.RULESETS[st.rules || 'v1'];
    if (id === 'BRD' && R0.breedL && R0.mbMode === 'multi') { const c = G.breedCost(p); if (c === null) return null; const mx = G.breedMaxN(p), left = G.breedLeft(p), bl = R0.breedL; let best = null, bv = -1; for (let nP = 0; nP <= Math.min(mx, left); nP++) for (let nL = 0; nL <= Math.min(mx, left - nP); nL++) { if (!nP && !nL) continue; const a = { pid: p.id, type: 'breed', nP, nL }; const v = hintPts(a); if (v !== null && v > bv) { bv = v; best = a; } } void bl; return best; }
    if (id === 'TAL' && (R0.tribute && (R0.tribute.slots.TAL || {}).pair)) { const ks = G.ALTAR_KEYS.filter(k => G.altarHalfCost(p, k) !== null && p[k] >= G.altarHalfCost(p, k)); let best = null, bv = -1; const D = R0.altarDouble; const tryA = (a) => { const v = hintPts(a); if (v !== null && v > bv) { bv = v; best = a; } }; ks.forEach(k => tryA({ pid: p.id, type: 'tributeSlot', slot: id, res: k })); if (D) ks.forEach((k, i) => ks.slice(i + 1).forEach(k2 => { if (D.adjacent && !G.altarAdj(k, k2)) return; tryA({ pid: p.id, type: 'tributeSlot', slot: id, res: k, res2: k2 }); })); return best; }
    return sample(p, id);
  }
  let roMsg = '他プレイヤーの手番'; // 操作できないときの理由表示（ドラフト中の参照表示で差し替え）
  // 数値セットで変わる軽減値を表示文に反映（静的な説明文の -5／-6P／-8P／15/25 を差し替える）
  // 器官の効果文（倍化版の群心核は strongB/weakB を使う）
  const otxt = (o, strong) => { const R = G.RULESETS[st.rules || 'v1']; const sid = typeof o === 'string' ? o : Object.keys(G.ORGANS).find(k => G.ORGANS[k] === o || (o && G.ORGANS[k].name === o.name && G.ORGANS[k].lin === o.lin && G.ORGANS[k].tier === o.tier)); if (sid && G.ORGANS[sid].special) return rtxt(G.spText(R, sid)); /* O-46：特殊器官は数値セットの差し替え文（交信腔・循環腔など） */ if (typeof o === 'string') o = G.organDef(st, o); const s = strong ? (R.hc3Bonus && o.strongB ? o.strongB : o.strong) : (R.hc3Bonus && o.weakB ? o.weakB : o.weak); return rtxt(s); }; // o＝定義 or 器官ID（T13 の第2版の効果文は organDef で差し替え）
  const chgBadge = () => null; // T13：変えた部分の目印（次の数値セットでは changed を外す）
  function rtxt(s) { return G.FX ? G.FX.txt(st, s) : s; } // O-49：全文の差し替えは fx.js（ガイドの「カードの記号一覧」と同じ文）
  // O-37（T30）：身体・知性・代謝のトラックが淘汰に効く分（1 段ごとに E+5／G+5／P+5）
  function massTip(p, t) { const R = G.RULESETS[st.rules || 'v1'], vp = viewP(p), lv = vp.lv[t]; if (t === 'body' && R.mmLv) return `淘汰（代謝）の獲得 ${G.mmForm(st).E}（いま Lv${lv}＝E${G.mmGainOf(vp).E}）`; if (t === 'intel' && R.mmLv) return `淘汰（代謝）の獲得 ${G.mmForm(st).G}（いま Lv${lv}＝G${G.mmGainOf(vp).G}）`; if (t === 'metab' && R.massRetMetab) return `淘汰 4 種を実行したあと P が${G.retForm(st)} 返る（いま Lv${lv}＝P+${G.massRet(vp)}）`; return null; }
  // O-70（2026-11-19 ユーザー「PC 表示時、ラウンド表記がわかりやすいところにない」）：ラウンドの列＝共用の場の先頭（盤では中央の上）。今のラウンドを光らせ、恩寵枠が開くラウンドは金の縁
  function renderRoundTrack() {
    const R = G.RULESETS[st.rules || 'v1'], RN = R.rounds || G.ROUNDS, T = R.tribute, OR = T ? (T.openRound || 6) : 99;
    return h('div', { class: 'rtrack', title: `ラウンド ${st.round}/${RN}${OR <= RN ? `（ラウンド${OR}から恩寵枠）` : ''}` }, objIc('round'), ...Array.from({ length: RN }, (_, i) => i + 1).map(r => h('span', { class: 'rp' + (r < st.round ? ' past' : r === st.round ? ' now' : '') + (r >= OR ? ' god' : '') }, String(r))));
  }
  // T51（O-99）：ラウンドの神託（R1〜R4 に 1 枚ずつ・今のラウンドを目立たせる）。盤の画面の置き場は O-100（デザイン）
  function renderOracle() { const O = st.shared && st.shared.oracle; if (!O || !O.length) return null; const C = G.RULESETS[st.rules || 'v1'].oracle.cards; return h('div', { class: 'oracle', title: 'ラウンドの神託：そのラウンドの間、全員に効く（当たるたびに受け取る）' }, ...O.map((k, i) => { const fl = fxOn() && G.FX && G.FX.lines(st, 'oracle', k); return h('div', { class: 'orc' + (fl ? ' orfx' : '') + (i + 1 < st.round ? ' past' : i + 1 === st.round ? ' now' : ''), title: fl ? `R${i + 1}　${G.oracleLabel(C[k])}` : null, 'data-otip': fl ? `R${i + 1}　${G.oracleLabel(C[k])}` : null }, h('b', null, `R${i + 1}`), fl ? G.FX.render(fl, C[k].text) : `：${C[k].text}`); })); } // O-99 の 2 段目：アイコンの表示では記号（文はホバー）
  // O-101：恩寵の場所の「神託／恩寵」の切り替え（一覧と盤で共通の 1 つ・見ている人ごと・ログと保存には入れない）。oracleFaceSel＝選んだ面と、選んだときの区切り（神託のラウンド中＝'early'／神託の後〔R5〕＝'late'）。区切りが変わったら自動（R1〜R4＝神託・R5 以降＝恩寵）に戻る
  let oracleFaceSel = null;
  const oraclePhase = () => { const O = st && st.shared && st.shared.oracle; return O && st.round > O.length ? 'late' : 'early'; };
  function oracleFace() { const O = st && st.shared && st.shared.oracle; if (!O || !O.length) return null; if (oracleFaceSel && oracleFaceSel.phase === oraclePhase()) return oracleFaceSel.face; return oraclePhase() === 'late' ? 'grace' : 'oracle'; } // 'oracle'＝神託の面／'grace'＝恩寵の面／null＝神託の無い卓（切り替えなし）
  function setOracleFace(face) { if (face !== 'oracle' && face !== 'grace') return; oracleFaceSel = { face, phase: oraclePhase() }; render(); }
  function oracleToggle() { const f = oracleFace(); if (!f) return null; return h('span', { class: 'oratog' }, ...[['oracle', '神託'], ['grace', '恩寵']].map(([k, t]) => h('button', { type: 'button', class: f === k ? 'on' : '', 'aria-pressed': f === k ? 'true' : 'false', onclick: (ev) => { ev.stopPropagation(); setOracleFace(k); } }, t))); }
  G.oracleFace = oracleFace; G.setOracleFace = setOracleFace; G.oracleToggle = oracleToggle; G.renderOracle = renderOracle;
  // O-103：神託の札（記号）をタップ／クリックすると説明文の吹き出し（data-otip を持つ要素・同時に 1 つ・同じ札かほかの所をタップで閉じる・描き直し／スクロールでも閉じる）
  let otipEl = null, otipAt = null;
  function hideOTip() { if (otipEl) otipEl.remove(); otipEl = null; otipAt = null; }
  function showOTip(a) {
    hideOTip(); const b = document.createElement('div'); b.className = 'otip'; b.setAttribute('role', 'tooltip'); b.textContent = a.getAttribute('data-otip'); document.body.appendChild(b);
    const r = a.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, w = b.offsetWidth, hh = b.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8)); const below = r.bottom + 6 + hh <= vh - 8 || r.top - 6 - hh < 8;
    b.style.left = left + 'px'; b.style.top = (below ? r.bottom + 6 : r.top - 6 - hh) + 'px'; otipEl = b; otipAt = a;
  }
  document.addEventListener('click', (ev) => { const a = ev.target && ev.target.closest ? ev.target.closest('[data-otip]') : null; if (a) { ev.stopPropagation(); if (otipAt === a) hideOTip(); else showOTip(a); return; } if (otipEl && !(ev.target && ev.target.closest && ev.target.closest('.otip'))) hideOTip(); }, true);
  window.addEventListener('scroll', hideOTip, true); window.addEventListener('resize', hideOTip);
  G.hideOTip = hideOTip; // O-103：盤の側（デザイン）から閉じる口 // O-101：盤の側（デザイン・O-100）から使う口
  function renderTracks(p, can) {
    const box = h('div', { class: 'panel tracksp' }, h('h3', { title: G.RULESETS[st.rules || 'v1'].gates ? '素材（器官・形質・協調・投入）が矢印の数に達すると自動で上がる。Eでの進化（点線をクリック）も自由。★＝痕跡・先駆は強い報酬' : '次の段（点線）をクリックで進化（ワーカー必須・排他なし）。★＝痕跡・先駆は強い報酬' }, '進化トラック')) // O-66：見出しの補足は title へ);
    const lanes = h('div', { class: 'lanes' }); box.appendChild(lanes); // レーンだけ横スクロール（スマホ）
    G.TRACKS.forEach(t => {
      const info = G.TRACK_INFO[t]; const nxt = p.lv[t] + 1;
      const reason = can ? check({ pid: p.id, type: 'track', track: t, pay: 'E', useL: Math.min(p.L, 3) }) : roMsg;
      const lane = h('div', { class: 'lane lane-' + info.color, 'data-slot': 'TRK_' + t });
      lane.appendChild(h('div', { class: 'lane-lbl', title: [`素材：${G.gateLabel(st, t)}`, massTip(p, t)].filter(Boolean).join('\n') }, h('b', null, info.name)));
      const body = h('div', { class: 'lane-body' });
      const RS0 = G.RULESETS[st.rules || 'v1']; const maxLv = RS0.maxLv || 5; const hereLv = viewP(p).lv[t]; // O-134（デザイン）：この端末で見ている人のいる段に here（枠ごと強調・css）
      for (let l = 1; l <= maxLv; l++) {
        if (l > 1) { const RSx = RS0; const stepArr = ((t === 'body' && RSx.bodyStep) ? RSx.bodyStep : RSx.step).slice(); if (RSx.lv6E) stepArr[5] = RSx.lv6E; const gq0 = RSx.gates && RSx.gates[t][l] !== undefined; body.appendChild(h('div', { class: 'conn' }, h('span', null, '▶'), (l === 6 && G.lv6CostText(st, t) && fxOn() ? h('span', { class: 'fxsep', title: `Lv6はそのトラックの資源（${G.lv6CostText(st, t)}）で払う` }, ...Object.entries(G.lv6PayDef(st, t) || {}).filter(([k, v]) => v && ['E', 'G', 'L', 'coop'].includes(k)).map(([k, v]) => pcost(k, v))) : l === 6 && G.lv6CostText(st, t) ? h('small', { title: `Lv6はそのトラックの資源（${G.lv6CostText(st, t)}）で払う（自動進化なし・${RS0.lv6Gems ? `先駆は痕跡+${RS0.lv6Gems.first}と祝福+1・追随は痕跡+${RS0.lv6Gems.later}` : '先駆は痕跡+1と祝福+1'}）` }, G.lv6CostText(st, t)) : fxOn() ? pcost('E', stepArr[l - 1]) : h('small', null, `${stepArr[l - 1]}E`)), gq0 ? h('small', { class: 'gate' + (fxOn() ? ' fxgate' : ''), title: `${G.gateLabel(st, t)}が${RSx.gates[t][l]}に達するとLv${l}へ自動で上がる${G.gateNote(st, t, l)}（Eを払って先に上がることもできる）` }, ...(fxOn() ? [G.FX.ic(GATE_IC[t]), `${RSx.gates[t][l]}${G.gateNote(st, t, l) ? '*' : ''}`] : [`${G.gateShort(st, t)}${RSx.gates[t][l]}${G.gateNote(st, t, l) ? '*' : ''}`])) : (l === 6 ? (G.lv6CostText(st, t) ? null : h('small', { class: 'gate', title: 'Lv6はEでのみ上がる（自動進化なし・先駆なし）' }, 'Eのみ')) : null))); }
        const isNext = l === nxt; const cost = isNext ? G.stepCost(p, t) : null; const r0 = rewShort(t, l); const r = Array.isArray(r0) ? r0.map(rtxt) : rtxt(r0);
        const gq = G.RULESETS[st.rules || 'v1'].gates && l === nxt ? G.gateReq(p, t) : null;
        const node = h('div', { class: 'node' + (isNext ? ' next' : '') + (isNext && reason ? ' na' : '') + (l === 3 || l === 5 ? ' star' : '') + (l === hereLv ? ' here' : ''), title: `Lv${l}：${rtxt(G.trackRewardText(st, t, l)) || '開始'}${isNext ? `\nコスト ${l === 6 && G.lv6CostText(st, t) ? G.lv6CostText(st, t) + '（そのトラックの資源で払う）' : 'E' + cost + (t === 'body' ? '／P' + cost * 3 : t === 'intel' ? '／G' + cost : '')}` : ''}${gq ? `\n${G.gateLabel(st, t)}が${gq.need}に達すると自動で上がる（現在${gq.have}）` : ''}${isNext && reason ? '\n× ' + reason : ''}`, onclick: isNext && can ? () => onTrack(p, t) : null });
        node.appendChild(h('div', { class: 'node-lv' }, `Lv${l}`, (l === 3 || l === 5 || l === 6) ? ic('gem') : null)); // O-60：Lv4 の「↗」（廃止した越境効果の名残）は消した
        const fxl = fxOn() && l > 1 ? G.FX.lines(st, 'track', [t, l], 's') : null; const fxf = fxl ? rtxt(G.trackRewardText(st, t, l)) : null; // O-49：アイコン表示は効果の記号（先駆・追随は札）
        if (fxl) node.appendChild(h('div', { class: 'node-rew fxrew' }, ...(G.FX.trackSplit(st, t, l) ? [G.FX.render(fxl, fxf, '先'), G.FX.render(G.FX.lines(st, 'track', [t, l], 'w'), fxf, '追')] : [G.FX.render(fxl, fxf)])));
        else if (Array.isArray(r)) node.appendChild(h('div', { class: 'node-rew' }, h('span', { class: 'rs' }, '先駆 ' + r[0]), h('span', { class: 'rw' }, '追随 ' + r[1]), r[2] ? h('span', { class: 'rw' }, r[2]) : null));
        else if (r) node.appendChild(h('div', { class: 'node-rew' }, h('span', null, r)));
        else node.appendChild(h('div', { class: 'node-rew' })); // O-66：Lv1 の「START」は書かない
        const mks = h('div', { class: 'node-mk' }); st.players.forEach(q => { if (q.lv[t] === l) mks.appendChild(h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1)); });
        if ((l === 3 || l === 5) && st.shared.firsts[t + l] !== undefined) mks.appendChild(h('small', { class: 'first' }, `先駆:${st.players[st.shared.firsts[t + l]].name}`));
        node.appendChild(mks);
        body.appendChild(node);
      }
      lane.appendChild(body); lanes.appendChild(lane);
    });
    { const RS1 = G.RULESETS[st.rules || 'v1']; if (RS1.star && st.shared.starCards) lanes.appendChild(renderStar(p, can)); } // v3.114（2026-11-15 ユーザー指示）：星海は進化トラックの 5 段目（画面の位置だけ。ルール上の置き場所は共用盤のまま）
    if (!G.RULESETS[st.rules || 'v1'].noCombo) box.appendChild(h('p', { class: 'note' }, 'コンボ：' + G.comboNames(st).join('／') + '　（対応色の痕跡を揃えると祝福+1）'));
    return box;
  }

  const TIPS = {
    E5: '熱源吸収：+5E（協調ぶん+E）', EG: '群体同期：+2E＋個体数10ごとに+1E', G3: '配列解析：+3G', GG: '群体融合：+1G＋個体数10ごとに+1G', P8: '個体培養：+8P', ALL: '資源合成：+2E+1G+4P（協調ぶんは好きな資源）', PB: '自己複製：G2→P+10（協調対象外）',
    MB: '淘汰(身体)：P を払って痕跡（額と量は数値セットの値）', MI: '淘汰(知性)：P20→G4以下の形質を異なる2種（排他不要）', MS: '淘汰(社会)：P20→協調+2', MM: '淘汰(代謝)：P20→E+10 G+10',
    TRT: '形質獲得：形質プールのカードをクリック。強化は取得済みカードをクリック', TRT2: '形質獲得（割増枠・拡張x1）：通常コストに加えてラウンド数ぶんのEを支払う。形質プールのカードをクリック', GEM: '宝石セット得点カード：G(10−形質数・下限5)→祝福+1（自分専用）',
    BRD: '繁殖：Pを払って繁栄度+1（段数とコストは数値セットによる。T6以降は生命核L3でも可）', ORG: '器官形成：器官の場のカードをクリック', SCAN: '探索：E5→他プレイヤーの最高Lv×2の資源（自分は除く）', ADP: '適応進化：生命核1→Lv1のトラックを+1（ワーカー必須）', CNV: '資源変換：E2→G1／G2→E1／P8→E3／P8→G2', RSV: '予備動員：無料でE+2またはG+1',
  };
  function slotButton(p, can, s, onclick, extra) {
    const used = (s.id === 'GEM' && G.RULESETS[st.rules || 'v1'].gemsetShared) ? undefined : G.slotUsedBy(st, s.id); // 共用の宝石セットは使用済み表示なし
    const reason = !can ? roMsg : (s.id === 'TRT' || s.id === 'TRT2' || s.id === 'ORG' || s.id === 'TRK') ? null : (s.id === 'RST' && !restoreCands(p).length) ? '復元できる形質がありません（他の人が強で取った形質がない）' : (s.id === 'AMP' && !amplifyCands(p).length) ? `増幅できる器官がありません（対象＝${G.ampTargetText(st)}。形成と同時の増幅は器官の場から）` : (s.id === 'BST' && !burstCands(p).length) ? '急速形成できる系統がありません（同じ系統で続けて形成できる器官が 2 枚以上ない）' : check(sample(p, s.id));
    const RCb = G.RULESETS[st.rules || 'v1'], CBT = { E5: '+1E', G3: '+1G', P8: '+1P', ALL: '好きな資源 +1', EG: '+1E', GG: '+1G' }; // O-55：文字の表示にも協調加算（アイコンの点線の札と同じ）
    const txt = G.slotText(st, s.id, viewP(p)) + (CBT[s.id] && G.RES_SLOTS.includes(s.id) && RCb.coopMode !== 'spend' && (!RCb.coopBonusSlots || RCb.coopBonusSlots.includes(s.id)) ? `（${CBT[s.id]}／協調）` : '');
    // 獲得量プレビュー：今この枠を使うと実際にいくつ得られるか（協調加算・群体のP・Pブースト等を含む）
    let d = null; if (can && !reason && (s.group === 'res' || s.group === 'mass' || s.id === 'GEM')) { d = G.previewGain(st, sample(p, s.id), s.id === 'MI' ? { noTraitFx: true } : null); }
    const pay = d && s.group === 'mass' && G.massCost(p, s.id) > 0 ? { P: G.massCost(p, s.id) } : null; // 2026-11-10 v3.93：淘汰は支払いと戻りを分けて表示
    const gain = d ? gainStr(d, pay) : null;
    const vq = viewP(p), R9 = G.RULESETS[st.rules || 'v1']; let mine = ''; // O-37（T30）：いまの自分の淘汰（代謝）の獲得量と内訳・淘汰 4 種のあと返る P
    if (s.id === 'MM' && R9.mmLv) { const g = G.mmGainOf(vq); mine += `\nいまの獲得量：E${g.E}＋G${g.G}（身体 Lv${vq.lv.body}・知性 Lv${vq.lv.intel}）`; }
    if (['MB', 'MI', 'MS', 'MM'].includes(s.id) && G.massRet(vq)) mine += `\nいま返る P：+${G.massRet(vq)}（代謝 Lv${vq.lv.metab}）`;
    const tip = (G.slotTip(st, s.id) || txt) + mine + (gain ? `\n今実行すると：${gain}` : '');
    const body = slotBody(p, s.id, slotName(s), txt, d, pay);
    if (iconView() && (s.id === 'BST' || s.id === 'GTH') && body[0].className !== 'pname') body[1] = null; // O-66：記号の表示では説明文を書かない（名前と title で足りる）
    const hp = hintOn && can && !reason ? hintPts(hintAct(p, s.id)) : null; // O-122
    return actBtn({ class: 'slot' + (iconView() && body[0].className === 'pname' ? ' pic' : '') + (used !== undefined ? ' used' : ''), title: tip, onclick, 'data-slot': s.id }, reason, body[0], body[1], h('span', { class: 'sfoot' }, body[2] || null, used !== undefined ? h('em', null, h('span', { class: 'mk p' + used }, used + 1), ` ${st.players[used].name} 使用`, ...(st.shared.used[s.id + '#2'] !== undefined ? [' ', h('span', { class: 'mk p' + st.shared.used[s.id + '#2'] }, st.shared.used[s.id + '#2'] + 1), ` ${st.players[st.shared.used[s.id + '#2']].name} 2 人目`] : [])) : null, extra || null), hintEl(hp)); // O-44（T31）：淘汰の 2 人目／O-48：3 行目（結果・使用済み・補足）を 1 つの段にまとめて行の位置をそろえる
  }
  // O-44（T31）：淘汰の 2 人目。ふつうに打てない使用済みの淘汰で、2 人目に入れるときだけ second を付ける（払いは協調を優先・払えなければ生命核）
  function massSecondOk(p, id) { const ms = G.RULESETS[st.rules || 'v1'].massSecond; const u = G.slotUsedBy(st, id); return !!ms && u !== undefined && u !== p.id && st.shared.used[id + '#2'] === undefined; }
  function massSecondPays(p) { const ms = G.RULESETS[st.rules || 'v1'].massSecond; if (!ms) return []; if (ms.pay !== 'either') return [ms.pay]; return ['coop', 'L'].filter(k => p[k] >= (k === 'coop' ? G.coopCost(p, ms.coop, 'second') : ms[k])); } // T51（O-99）共生・寄生腺
  function massSecondArgs(p, id, a) { if (!massSecondOk(p, id) || !check(a)) return a; const pays = massSecondPays(p); return Object.assign({}, a, { second: true }, G.RULESETS[st.rules || 'v1'].massSecond.pay === 'either' ? { secondPay: pays[0] || 'coop' } : {}); }
  function massSecondField(p) { const ms = G.RULESETS[st.rules || 'v1'].massSecond; if (!ms || ms.pay !== 'either') return null; const pays = massSecondPays(p); return { type: 'select', name: 'secondPay', label: '2 人目の払い', value: pays[0], options: [{ value: 'coop', label: `協調${G.coopCost(p, ms.coop, 'second')}`, disabled: p.coop < G.coopCost(p, ms.coop, 'second') }, { value: 'L', label: `生命核${ms.L}（投入に数える）`, disabled: p.L < ms.L }] }; }
  function slotName(s) { return G.RULESETS[st.rules || 'v1'].noUpgrade ? s.name.replace('／形質強化', '') : s.name; } // O-45：形質強化のないセット（T2 以降）では枠の名前を「形質獲得」だけに
  function sample(p, id) { // 事前判定用の代表アクション
    const pid = p.id;
    if (G.RES_SLOTS.includes(id)) return { pid, type: 'res', slot: id, coopRes: 'E', useL: p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree, /* T18：useL＝緊急進出（空き枠で 3 倍）なので事前判定・見込みは通常の配置 */ bypassCoop: st.ext === 'x1' && p.coop >= G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass') };
    if (id === 'PB') return { pid, type: 'res', slot: 'PB' };
    if (['MB', 'MI', 'MS', 'MM'].includes(id)) { const a = { pid, type: 'mass', kind: id, traits: G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (G.RULESETS[st.rules || 'v1'].miMaxCost || 4) && !G.trait(p, t)).slice(0, G.RULESETS[st.rules || 'v1'].miCount || 2) }; return massSecondArgs(p, id, a); }
    if (id === 'GEM') return { pid, type: 'gemset', useL: G.RULESETS[st.rules || 'v1'].noLTribute ? 0 : Math.min(p.L, 3) };
    if (id === 'MIM') { const o = G.mimicOptions(st, p); return { pid, type: 'mimic', effect: o.length ? o[0].id : 'intel2', useL: 0 }; }
    if (id === 'TE' || id === 'TP' || id === 'TR') return { pid, type: 'tributeSlot', slot: id, track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' };
    if (id === 'TO') { if (G.RULESETS[st.rules || 'v1'].toLineage) return { pid, type: 'tributeSlot', slot: id, lin: st.shared.lineages.find(l => G.lineageCount(p, l) < 3) || st.shared.lineages[0], useL: Math.min(p.L, 2), liRes: 'E', regimeRes: 'E' }; return { pid, type: 'tributeSlot', slot: id, organ: st.shared.organField.find(o => G.organCost(st, p, o)) || st.shared.organField[0], li2Res: 'E', li3Res: 'E', regimeRes: 'E' }; }
    if (id === 'TT') return { pid, type: 'tributeSlot', slot: id, traits: G.traitPool(st).filter(t => !G.trait(p, t)).slice(0, 1), useL: 0, res: 'E', track: 'intel' };
    if (id === 'TA') { const f = G.TRACKS.find(t => p.gems[t] > 0) || 'body'; return { pid, type: 'tributeSlot', slot: id, changes: [{ from: f, to: G.TRACKS.find(t => t !== f) }] }; }
    if (id === 'TB') return { pid, type: 'tributeSlot', slot: id, res: 'E5', coopRes: 'E' };
    if (id === 'TAL') return { pid, type: 'tributeSlot', slot: id, res: G.ALTAR_KEYS.find(k => G.altarHalfCost(p, k) !== null && p[k] >= G.altarHalfCost(p, k)) || G.ALTAR_KEYS.find(k => G.altarHalfCost(p, k) !== null) || 'E' }; // T32（O-47）
    if (id === 'TLF') return { pid, type: 'tributeSlot', slot: id };
    if (id === 'TST') { const lv = (p.star | 0) + 1; const c = G.starOn(st) && lv <= G.STAR_MAX ? G.starCost(st, lv) : {}; return { pid, type: 'tributeSlot', slot: id, res: Object.keys(c).find(k => p[k] >= c[k]) || Object.keys(c)[0] || 'E' }; } // T49（O-91）
    if (id === 'TCU') return { pid, type: 'tributeSlot', slot: id, kinds: ['MS', 'MM'] };
    if (id === 'TBR' && (G.RULESETS[st.rules || 'v1'].breedTrib || {}).normal) { const cL = G.breedHalfCost(p, 'L'); const mx = G.breedTribMax(p), left = G.breedLeft(p); let nP = 0; while (nP < mx && nP < left && p.P >= G.breedTribP(p, nP + 1)) nP++; let nL = 0; while (cL !== null && nL < mx && nP + nL < left && p.L >= cL * (nL + 1)) nL++; return { pid, type: 'tributeSlot', slot: id, nP: nP || (nL ? 0 : 1), nL }; } // T38（O-67）
    if (id === 'TBR' && (G.RULESETS[st.rules || 'v1'].breedTrib || {}).both) { const cP = G.breedHalfCost(p, 'P'), cL = G.breedHalfCost(p, 'L'); const nP = cP !== null && p.P >= cP ? 1 : 0; const nL = cL !== null && p.L >= cL && (!nP || G.breedLeft(p) >= 2) ? 1 : 0; return { pid, type: 'tributeSlot', slot: id, nP: nP || (nL ? 0 : 1), nL }; } // T37（O-65）
    if (id === 'TBR') return { pid, type: 'tributeSlot', slot: id, pay: G.breedHalfCost(p, 'P') !== null && p.P >= G.breedHalfCost(p, 'P') ? 'P' : 'L' };
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
  function coreSpecies() { const q = st && st.phase === 'play' && !st.ended ? G.cur(st) : null; if (!q || !q.species) return null; const sp = G.speciesInfo(st, q.species); return h('div', { class: 'coresp p' + q.id, title: `手番：${q.name}（${sp.name}）` }, art(SPECIES_ART[q.species] || 'species_wing', 'portrait'), h('span', { class: 'cname' }, h('span', { class: 'mk p' + q.id }, q.id + 1), sp.name)); } // O-82：表示は盤の画面だけ（board.css）
  function renderExcl(p, can) {
    const m4 = st.slotSet === 'm4';
    const x1 = st.ext === 'x1';
    const box = h('div', { class: 'panel excl' + (iconView() ? ' picmode' : '') }, h('h3', { title: ((m4 ? '　資源獲得は4枠（E系／G系／P系／全資源）・各枠1ラウンドに1人、枠内のどちらかを選ぶ。使用済み枠は生命核1の「緊急進出」で突破可（自己複製は不可）' : (G.RULESETS[st.rules || 'v1'].launchFree ? `　各スロットは1ラウンドに1人だけ。空いている資源枠は生命核1の「緊急進出」で獲得量${G.RULESETS[st.rules || 'v1'].launchFree}倍` : '　各スロットは1ラウンドに1人だけ。使用済みは生命核1の「緊急進出」で資源獲得スロットのみ突破可')) + (G.RULESETS[st.rules || 'v1'].traitShared ? '　【形質共用】形質獲得は排他なし（割増枠なし）。' + (G.RULESETS[st.rules || 'v1'].launchFree ? '使用済みの資源枠は協調進出（協調）で突破可。' : '使用済みの資源枠は緊急進出（L1）か協調進出（協調）で突破可。') + '群体同期／群体融合はPを払って資源＋協調+1' + (G.RULESETS[st.rules || 'v1'].bodyAxis === 'L' ? '　【生命核軸】収入時に保有L1個につきE+1。身体はLを投入した回数で上がる' : '') : x1 ? '　【拡張x1】形質獲得は2枠（割増枠＝ラウンド数ぶんのE追加）。使用済みの資源／形質枠は緊急進出（L1）か協調進出（協調）で突破可' : '')).replace(/^　/, '').replace(/　/g, '\n') }, '占有盤')); // O-66：見出しの補足は title へ
    if (iconView()) box.appendChild(iconLegend()); // O-59：文字／アイコンの切り替えはヘッダの表示のまとまりへ
    const fv = G.RULESETS[st.rules || 'v1'].finalSlotVg, RNf = G.RULESETS[st.rules || 'v1'].rounds || G.ROUNDS, finalR = fv && st.round === RNf; // v3.55 祝福枠：最終ラウンドの資源枠
    const g1 = h('div', { class: 'sgroup' + (finalR ? ' god' : '') }, h('h4', { title: !fv ? null : finalR ? `最終ラウンド＝祝福枠：空いている枠にワーカーを置くと資源に加えて祝福+${fv.vg || 1}` : `最終ラウンド${RNf}は祝福枠＝空いている枠にワーカーを置くと祝福+${fv.vg || 1} も` }, (m4 ? '資源獲得（統合4・試作）' : '資源獲得') + (finalR && !fxOn() ? '・祝福枠' : ''), finalR && fxOn() ? h('span', { class: 'fxfinal' }, h('span', { class: 'fxcond' }, G.FX.ic('lastround'), '：'), G.FX.ic('rslot'), po('→'), pc('bless', '+' + (fv.vg || 1))) : null)); // O-86
    const bypassFx = () => { const RB = G.RULESETS[st.rules || 'v1'], cc = G.coopCost(p, RB.bypassCoopCost || 2, 'bypass'), lock = p.round && p.round.boostLock && ((RB.tribute || {}).slots || {}).TB && RB.tribute.slots.TB.lockBypass; const w = [p.mimic && !(p.round && p.round.mimicUsed) ? (p.mimic === 'free' ? '擬態可（無償）' : `擬態可（E${G.mimicCostE(p)}）`) : null, p.L > 0 && !RB.launchFree ? '緊急進出可（L1）' : null, x1 && p.coop >= cc ? (lock ? G.FX.banned('coopadv') : h('span', { class: 'fxsep', title: `協調進出：協調${cc}を払って使用済みの枠に置く` }, pcost('coop', cc), po('→'), G.FX.ic('coopadv'))) : null].filter(Boolean); return w.length ? h('small', { class: 'bypass fxbyp' }, ...w) : null; }; // O-86
    const bypassHint = () => { if (fxOn()) return bypassFx(); const w = [p.mimic && !(p.round && p.round.mimicUsed) ? (p.mimic === 'free' ? '擬態可（無償）' : `擬態可（E${G.mimicCostE(p)}）`) : null, p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree ? '緊急進出可（L1）' : null, x1 && p.coop >= G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass') ? `協調進出可（協調${G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass')}）` : null].filter(Boolean); /* 2026-10-30：擬態が使えるときは選択前の枠にも表示 */ return w.length ? h('small', { class: 'bypass' }, w.join('・')) : null; };
    const resBtn = (s, used) => slotButton(p, can, s, () => onSlot(p, s.id), used !== undefined && (G.RES_SLOTS.includes(s.id) || (s.id === 'PB' && G.RULESETS[st.rules || 'v1'].pbCoopBypass)) ? bypassHint() : null);
    if (m4) Object.entries(G.RES_GROUPS).forEach(([gid, grp]) => { const used = st.shared.used[gid]; const gb = h('div', { class: 'merged' + (used !== undefined ? ' used' : '') }, h('h5', null, grp.name)); grp.slots.forEach(id => gb.appendChild(resBtn(G.SLOT_BY_ID[id], used))); g1.appendChild(gb); });
    else { const RO = ['E5', 'EG', 'G3', 'GG', 'P8', 'PB', 'ALL']; G.SLOTS.filter(s => s.group === 'res').sort((a, b) => (RO.indexOf(a.id) + 1 || 99) - (RO.indexOf(b.id) + 1 || 99)).forEach(s => g1.appendChild(resBtn(s, st.shared.used[s.id]))); } // O-73：盤と同じ並び（種類ごと・2 列で E／G／P／資源合成と緊急進出の行）
    { const LF = G.RULESETS[st.rules || 'v1'].launchFree; if (LF) { const cands = launchCands(p); const reason = !can ? '他プレイヤーの手番' : p.round && p.round.boostLock ? '神の加護を取ったこのラウンドは緊急進出できません' : p.L <= 0 && G.ngCost(p) === null ? '生命核がありません' : !cands.some(c => !c.ng) ? '緊急進出できる空き枠がありません' : null; g1.appendChild(actBtn({ class: 'slot launchbtn' + (iconView() ? ' pic' : ''), title: `緊急進出：空いている資源枠にワーカーを置くとき、生命核1個を払って獲得量${LF}倍${G.ngCost(p) !== null ? `（犠牲：生命核の代わりに P${G.ngCost(p)} も・1 ラウンドに 1 回）` : ''}`, onclick: () => onLaunch(p) }, reason, iconView() ? h('span', { class: 'pname' }, '緊急進出') : h('b', null, '緊急進出'), iconView() ? h('span', { class: 'picto' }, p.round && p.round.boostLock && fxOn() ? G.FX.banned('launch') : null, pcost('L', 1), po('→'), pc('rslot', '×' + LF, { title: `空き枠の獲得量${LF}倍` })) : h('small', null, `生命核1 → 空き枠の獲得量${LF}倍`), h('span', { class: 'sfoot' }))); } } // 2026-11-10 ユーザー要望：枠ごとに置き方を聞かず、専用ボタンから空き枠を選ぶ
    const g2 = h('div', { class: 'sgroup' }, (() => { const base = G.RULESETS[st.rules || 'v1'].massCost, mine = G.massCost(viewP(p), 'MI'); return h('h4', { title: `淘汰：個体数 ${mine !== base ? mine + '（軽減後）' : base} を払う` }, '淘汰'); })());
    const massSecondHint = (id) => { const ms = G.RULESETS[st.rules || 'v1'].massSecond; if (!fxOn() || !ms || ms.pay !== 'either' || G.slotUsedBy(st, id) === undefined || st.shared.used[id + '#2'] !== undefined) return null; return h('small', { class: 'bypass fxbyp', title: `2 人目として入れる（P に加えて協調${G.coopCost(p, ms.coop, 'second')} か 生命核${ms.L}）` }, pcost('coop', G.coopCost(p, ms.coop, 'second')), G.FX.ic('or'), pcost('L', ms.L)); }; // O-86
    G.SLOTS.filter(s => s.group === 'mass').forEach(s => g2.appendChild(slotButton(p, can, s, () => onSlot(p, s.id), massSecondHint(s.id))));
    { const T = G.RULESETS[st.rules || 'v1'].tribute; if (T) { const open = st.round >= (T.openRound || 6); const gt = h('div', { class: 'sgroup' + (open ? ' god' : '') }, h('b', { class: 'glabel', title: open ? '神の到来：恩寵枠（占有）' : `恩寵枠：ラウンド${T.openRound || 6}から（神の到来）` }, oracleFace() === 'oracle' ? '神託' : '恩寵枠', oracleToggle())); if (oracleFace() === 'oracle') { gt.classList.add('oraface'); gt.appendChild(renderOracle()); } /* O-101：神託の面＝恩寵の場所に 4 枚 */ else G.tribSlots(st).map(id => G.SLOT_BY_ID[id]).forEach(s => { if (open) gt.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))); else { const b = slotBody(p, s.id, s.name, G.slotText(st, s.id), null); gt.appendChild(h('button', { class: 'slot locked' + (b[0].className === 'pname' ? ' pic' : ''), disabled: true, title: G.slotTip(st, s.id) }, ...b)); } }); box.appendChild(gt); } }
    const g3 = h('div', { class: 'sgroup' }, h('h4', null, 'その他'));
    G.SLOTS.filter(s => s.group === 'oth' && (!s.ext || s.ext === st.ext) && (!s.rs || G.RULESETS[st.rules || 'v1'][s.rs]) && !(s.id === 'TRT2' && G.RULESETS[st.rules || 'v1'].traitShared) && !(s.id === 'TRT' && G.RULESETS[st.rules || 'v1'].traitShared) && !(s.id === 'GEM' && G.RULESETS[st.rules || 'v1'].gemsetShared)).forEach(s => g3.appendChild(slotButton(p, can, s, () => onSlot(p, s.id), G.slotUsedBy(st, s.id) !== undefined && G.bypassable(st, s.id) ? bypassHint() : null)));
    box.appendChild(g1); box.appendChild(g2); if (g3.childNodes.length > 1) box.appendChild(g3); { const cs = coreSpecies(); if (cs) box.appendChild(cs); } return box; // O-52／O-82：盤の中央（生命核の内側）に手番の人の種族：中身が無ければ「その他」ごと消す
  }
  const restoreCands = (p) => G.traitPool(st).filter(t => st.shared.traitFirst[t] !== undefined && st.shared.traitFirst[t] !== p.id && !G.trait(p, t)); // T10 復元の候補
  const burstCands = (p) => { const B = G.RULESETS[st.rules || 'v1'].burst; if (!B) return []; const out = []; st.shared.lineages.forEach(lin => { const n = G.lineageCount(p, lin); const seq = [1, 2, 3].filter(t => t > n).map(t => lin + t).filter(id => st.shared.organField.includes(id)); for (let k = 2; k <= Math.min(seq.length, B.max || 3); k++) out.push(seq.slice(0, k)); }); return out; }; // T14 一気立ての候補（系統ごとに次の 2 枚・3 枚）
  const burstCost = (p, seq) => { let e = 0, g = 0; const each = {}, cs = {}; const q = JSON.parse(JSON.stringify(p)); const fd = !!G.RULESETS[st.rules || 'v1'].burstFirstDiff; seq.forEach((id, i) => { const c = G.organCost(st, q, id, !(fd && !i)); /* O-62（T34）：1 枚目は通常どおり */ if (c) { e += c.E; g += c.G; each[id] = `E${c.E}${c.G ? '+G' + c.G : ''}`; cs[id] = c; } q.organs.push({ id, strong: true }); }); return { e, g, each, cs }; }; // 2026-11-10 v3.90（ユーザー指摘）：1 枚ごとの値段（追随の代償込み・T25 は代償なし）も出す
  const burstTo = (p, id) => burstCands(p).find(q => q[q.length - 1] === id) || null; // そのカードで終わる急速形成の並び
  const amplifyCands = (p) => p.organs.filter(o => G.ampOk(st, o.id, true) && !o.amp).map(o => o.id); // T10 増幅の候補（v3.66：未建造は「建造と同時に増幅」で扱うので、ここは持っている器官だけ。v3.65 の予約は engine に残すが画面からは外す）
  function renderShared(p, can) {
    const box = h('div', { class: 'panel shared2' + (iconView() ? ' picmode' : '') }, h('h3', { title: '何人でも・何回でも（ワーカーがある限り）' }, '共用盤'));
    const R6 = G.RULESETS[st.rules || 'v1'];
    const gTop = h('div', { class: 'sgroup' }, h('h4', null, '献上（共用・各自各品目1ラウンド1回）')); // 2026-10-28：早取りでない献上は共用盤の先頭にまとめる（ユーザー要望）
    if (!R6.tributeOnceGame) tributeButtons(p, can, false).forEach(b => gTop.appendChild(b)); // v3.68：祭壇（1 ゲーム 1 回・T10）は個人ボードの祭壇 3 マスへ移した（renderAltars）。旧数値セット（1R1回）だけ共用盤に残す
    const g = h('div', { class: 'sgroup' });
    { const Rc = G.RULESETS[st.rules || 'v1']; G.SLOTS.filter(s => ['trk', 'org', 'cu'].includes(s.group) && s.id !== 'TRK' && !(s.id === 'ADP' && Rc.noAdapt) && !(s.id === 'SCAN' && Rc.noScan) && !(s.id === 'CNV' && Rc.noConvert) && !(s.id === 'RSV' && Rc.noReserve) && (!s.rs || Rc[s.rs])).forEach(s => g.appendChild(slotButton(p, can, s, () => onSlot(p, s.id)))); if (Rc.traitShared) { const s = G.SLOT_BY_ID.TRT; g.insertBefore(slotButton(p, can, s, () => onSlot(p, s.id)), g.children[1] || null); } } // O-52：形質獲得（共用＝T29 から）は共用盤へ // T10：資源変換・予備動員は撤去、復元・増幅・パスは rs で表示
    // v3.55：献上（エネルギー／個体数）は T8 では廃止（数値セットに shared が無ければ表示しない）
    if (R6.tribute && R6.tribute.shared) { const T = R6.tribute; const open = st.round >= (T.openRound || 6); ['E', 'P'].forEach(res => { const a = { pid: p.id, type: 'tribute', res }; const c = G.sc(st, T.shared[res]); const reason = !open ? `ラウンド${T.openRound || 6}から（神の到来）` : can ? check(a) : roMsg; gTop.appendChild(actBtn({ class: 'slot' + (open ? ' god' : ' locked') + (iconView() ? ' pic' : ''), title: `献上（${res === 'E' ? 'エネルギー' : '個体数'}）：${res}${c}を払って祝福+1。ラウンド${T.openRound || 6}から・共用・各自1ラウンド1回・ワーカー`, onclick: async () => open && await okAsk(`献上（${res === 'E' ? 'エネルギー' : '個体数'}）：${res}${c}→祝福+1。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'TRIB_' + res, `献上（${res === 'E' ? 'エネルギー' : '個体数'}）`, `${res}${c} → 祝福+1`, null))); }); }
    if (R6.trial && st.shared.trials) box.appendChild(renderTrials(p, can)); // T24（O-20）：試練（?rules=t24）
    // v3.114：星海は renderTracks（進化トラックの 5 段目）へ移した
    if (gTop.childNodes.length > 1) box.appendChild(gTop); box.appendChild(g); return box;
  }
  // T25（O-23・第71部 §71〜§75）：星海＝進化で進める 5 本目のトラック。各段＝条件カードの額（2 種）・痕跡・3／5 段目の先駆・各自のコマ。次の段をクリックで進化
  function renderStar(p, can) {
    const R = G.RULESETS[st.rules || 'v1']; const S = R.star; const my = p.star | 0; const vs = viewP(p).star | 0; // O-134：見ている人のいる段に here
    const LT = lv => G.starLvText(st, lv), LG = R.lv6Gems || { first: 1, later: 1 }, SJ = S.top && S.top.judge;
    const gt = h('div', { class: 'lane lane-star', 'data-slot': 'TRK_star' }, h('div', { class: 'lane-lbl', title: S.lv1 ? `進化で進める 5 本目のトラック（Lv1〜Lv6・全員 Lv1 から）。1 段＝着く Lv の${G.STAR_CARD_NAME}の額（2 種とも払う・割引なし）。二段進化・三段進化は Lv5 まで（Lv6 は 1 段の進化か進化の恩寵で）。${Object.keys(S.first || {}).map(l => LT(+l)).join('・')} に最初に着いた人は痕跡 +1 か繁栄度 +1 を選ぶ。Lv6 は着いたとき 先駆（最初に着いた 1 人）＝痕跡+${LG.first}・祝福+1／追随（2 人目から・全員）＝痕跡+${LG.later}（祝福なし）${SJ ? `。終了時（着いた順に関係なく Lv6 の全員）：祝福+${SJ}（神の裁定）` : ''}` : `進化で進める 5 本目のトラック。1 段＝着く段の${G.STAR_CARD_NAME}の額（2 種とも払う・割引なし）。二段進化・三段進化・進化の恩寵も使える。3・5 段目に最初に着いた人は痕跡 +1 か繁栄度 +1 を選ぶ` }, h('b', null, G.STAR_NAME)));
    const row = h('div', { class: 'lane-body starrow' });
    if (S.lv1) { const mk0 = st.players.filter(q => (q.star | 0) === 0); const b0 = h('div', { class: 'slot starstep' + (my > 0 ? ' past' : '') + (vs === 0 ? ' here' : ''), title: `${G.STAR_NAME} Lv1：開始` }, h('b', { class: 'pname' }, 'Lv1')); if (mk0.length) b0.appendChild(h('span', { class: 'tw' }, ...mk0.map(q => h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1)))); row.appendChild(b0); } // T26（O-26）：Lv1 の開始マス
    for (let lv = 1; lv <= G.STAR_MAX; lv++) { const k = st.shared.starCards[lv - 1]; const c = G.starCost(st, lv); const ct = G.starCostText(c); const g = G.starGem(st, lv); const F = G.starFirstDef(st, lv); const fb = st.shared.starFirst[lv];
      const isNext = lv === my + 1; const top = G.starTop(st, lv); const reason = !isNext ? (lv <= my ? '到達済み' : `${LT(my + 1)}から順に`) : can ? check({ pid: p.id, type: 'track', track: 'star' }) : roMsg;
      const fTxt = top ? (fb !== undefined ? `先駆：${st.players[fb].name}` : `先駆 痕跡+${LG.first}・祝福+1`) : F ? (fb !== undefined ? `先駆：${st.players[fb].name}` : `先駆 痕跡+${G.starFirstGem(st, lv)}${F.pros !== undefined ? `／痕跡+${F.pros}・繁栄度+1` : ''}`) : ''; const gT = top ? `追随 痕跡+${LG.later}（祝福なし）` : `痕跡+${g}`; const jT = top && SJ ? `終了時 祝福+${SJ}（神の裁定）` : ''; /* O-28：Lv6 の欄は 先着／後着／神の裁定 を別の行に（4 本の Lv6 と同じく先着が上・裁定は Lv6 の人みな） */
      const b = actBtn({ class: 'slot starstep' + (isNext ? ' now' : lv <= my ? ' past' : ' later') + (F ? ' star' : '') + (vs === lv ? ' here' : ''), title: `${G.STAR_NAME} ${LT(lv)}（${G.starCardName(st, k)}）：${ct}${top ? `\n${fTxt}\n${gT}${jT ? `\n${jT}（着いた順に関係なく Lv6 の全員）` : ''}` : ` → ${gT}${F ? '\n' + fTxt : ''}`}`, onclick: () => isNext && onStar(p) }, reason,
        h('b', { class: 'pname' }, `${S.lv1 ? LT(lv) : lv}${F ? '★' : ''}`) /* O-130：★は Lv3・Lv5 だけ（Lv6 は 4 本と同じく★なし） */, ...(fxOn() ? [starFx(lv, fb, fTxt)] : [h('small', null, ct), ...(top ? [h('small', { class: 'first' }, fTxt), h('small', null, gT), jT ? h('small', null, jT) : null] : [h('small', null, gT), F ? h('small', { class: 'first' }, fTxt) : null])]));
      const mk = st.players.filter(q => (q.star | 0) === lv); if (mk.length) b.appendChild(h('span', { class: 'tw' }, ...mk.map(q => h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1))));
      if (S.lv1) row.appendChild(h('div', { class: 'conn' })); row.appendChild(b); } // O-48：ほかの 4 本と同じ幅の矢印の列を置き、マスの列を縦にそろえる
    gt.appendChild(row); return gt;
  }
  // 星海の進化ダイアログ：1 段／二段／三段・先駆の段では痕跡か繁栄度かを選ぶ
  async function onStar(p) {
    const R = G.RULESETS[st.rules || 'v1']; const s0 = p.star | 0; const LT = lv => G.starLvText(st, lv), sp = R.star.lv1 ? ' ' : ''; if (s0 >= G.STAR_MAX) return toast(`${G.STAR_NAME}は ${LT(G.STAR_MAX)}${sp}です`, true);
    const opt = []; [1, 2, 3].forEach(n => { if (s0 + n > G.STAR_MAX || (n > 1 && R.star.top && s0 + n >= G.STAR_MAX && !G.multiTop(p)) || (n === 2 && !R.doubleStep) || (n === 3 && !G.can3(p))) return; const plan = G.starPlan(st, p, s0, n); opt.push({ value: String(n), label: `${n === 1 ? '' : n === 2 ? '二段進化：' : '三段進化：'}${plan.map(x => G.starCostText(x.c)).join('・')}（${LT(s0 + n)}${sp}へ${n === 3 && !G.dvPerm(p) ? '・突然変異 残' + p.dv3 : ''}）` }); }); // O-76（T42）：突然変異（回数なし）の持ち主は最上段にも
    const fields = [{ type: 'select', name: 'n', label: '進め方', options: opt }];
    Object.keys(R.star.first || {}).map(Number).forEach(lv => { if (lv > s0 && G.starProsOk(st, p, lv)) { const F = G.starFirstDef(st, lv); fields.push({ type: 'select', name: 'f' + lv, label: `${LT(lv)}${sp}の先駆`, options: [{ value: 'gem', label: `痕跡+${G.starFirstGem(st, lv)}` }, { value: 'pros', label: `痕跡+${F.pros}・繁栄度+1（×${G.coefB(p)}→×${G.coefB(p) + 1}）` }], when: v => +v.n >= lv - s0 }); } });
    const r = await ask(R.star.lv1 ? `${G.STAR_NAME} ${LT(s0)}→${LT(s0 + 1)}` : `${G.STAR_NAME} ${s0}→${s0 + 1} 段目`, fields); if (!r) return;
    const n = +r.n; const pros = Object.keys(R.star.first || {}).map(Number).filter(lv => lv > s0 && lv <= s0 + n && r['f' + lv] === 'pros');
    submit({ pid: p.id, type: 'track', track: 'star', steps: n, pros: pros.length ? pros : undefined });
  }
  // T24（O-20・第71部 §65）：試練 R1〜R5。いまの R の 1 枚だけ打てる・打った人のコマ・過ぎた R は打てない
  function renderTrials(p, can) {
    const gt = h('div', { class: 'sgroup trials' }, h('h4', { title: 'ラウンドごとに 1 枚。そのラウンドのあいだだけ、ワーカー 1 つと額を払って痕跡を得る（割引・献身なし。過ぎた試練は打てない）' }, '試練（いまのラウンドだけ・1 人 1 回）'));
    st.shared.trials.forEach((k, i) => { const r = i + 1; const jp = G.ALTAR_JP[k], c = G.trialCost(st, r), g = G.trialGem(st, r); const ct = (k === 'coop' ? '協調' : k) + c; const nm = `R${r} 試練（${jp}）`;
      const by = (st.shared.trialBy || {})[r] || []; const now = r === st.round, past = r < st.round;
      const reason = past ? `R${r} の試練は終わりました` : !now ? `R${r} に打てます` : can ? check({ pid: p.id, type: 'trial' }) : roMsg;
      const b = actBtn({ class: 'slot trial' + (now ? ' now' : past ? ' past' : ' later') + (iconView() ? ' pic' : ''), title: `${nm}：${ct} → 痕跡+${g}`, onclick: async () => now && await okAsk(`試練（${jp}）：${ct} → 痕跡+${g}。実行しますか？`) && submit({ pid: p.id, type: 'trial' }) }, reason, ...slotBody(p, 'TRL_' + r, nm, `${ct} → 痕跡+${g}`, null));
      if (by.length) b.appendChild(h('span', { class: 'tw' }, ...by.map(id => h('span', { class: 'mk p' + id, title: st.players[id].name }, id + 1))));
      gt.appendChild(b); });
    return gt;
  }
  // 献上（遺伝子・生命核・協調）のボタン。altar=true（T10 v3.68・tributeOnceGame）＝個人ボードの祭壇 3 マス：各祭壇は 1 ゲームに 1 回で、使った祭壇には自分のワーカーが乗る（engine の p.tribGame）。altar=false＝旧数値セットの共用盤（各品目 1R1回）
  // O-44（T31）altarDouble：祭壇の 2 個目（別の払い口）を選べる。repeatL＝同じ R の自分の 2 回目以降の祭壇の手は生命核を足す
  async function altarClick(p, k, a, nm, ct, nv) {
    const R = G.RULESETS[st.rules || 'v1'], D = R.altarDouble; const rL = D && D.repeatL && (p.round.altarN || 0) > 0 ? D.repeatL : 0; const xT = rL ? `＋生命核${rL}（このラウンド ${p.round.altarN + 1} 回目）` : '';
    if (!D) return await okAsk(`${nm}：${ct} → 祝福+${nv}（${G.altarCount(p) + 1} 個目）。実行しますか？`, null, a) && submit(a);
    const ks = G.ALTAR_KEYS.filter(k2 => k2 !== k && !(p.tribGame && p.tribGame[k2]) && R.altar.cost[k2] !== undefined); const nv2 = R.altar.vg[G.altarCount(p) + 1] || 0;
    const r = await ask(`${nm}：${ct}${xT} → 祝福+${nv}${D.adjacent ? '（2 個目は隣の払い口だけ）' : ''}`, [{ type: 'select', name: 'res2', label: '2 個目', value: '', options: [{ value: '', label: 'なし' }].concat(ks.map(k2 => { if (D.adjacent && !G.altarAdj(k, k2)) return { value: k2, label: `祭壇（${G.ALTAR_JP[k2]}）（隣でない）`, disabled: true }; const ng = check(Object.assign({}, a, { res2: k2 })); return { value: k2, label: `祭壇（${G.ALTAR_JP[k2]}）${k2 === 'coop' ? '協調' : k2}${G.altarCost(p, k2)} → 祝福+${nv2}${ng ? '（不可）' : ''}`, disabled: !!ng }; })) }], { act: v => v.res2 ? Object.assign({}, a, { res2: v.res2 }) : a }); if (!r) return; // O-122
    return submit(r.res2 ? Object.assign({}, a, { res2: r.res2 }) : a); }
  function tributeButtons(p, can, altar) {
    const R6 = G.RULESETS[st.rules || 'v1']; const out = []; const place = R6.tributeOnceGame ? G.tribLimitText(st) : '共用' + (R6.tribute ? '・' + G.tribLimitText(st) : '');
    const usedAt = (key) => !!(p.tribGame && p.tribGame[key]);
    const fin = (key, b) => { if (altar) { b.classList.add('altar'); const nm = b.querySelector('b, .pname'); if (nm) nm.remove(); /* O-66：行の見出しが「祭壇」なので各口の名前は書かない（払う記号で分かる・名前は title） */ if (usedAt(key)) { b.classList.add('used'); b.appendChild(h('span', { class: 'aw', title: '使用済み：この祭壇にはあなたのワーカーが乗っています（各祭壇は 1 ゲームに 1 回）' }, h('span', { class: 'mk p' + p.id }, p.id + 1), ic('W'), '使用済み')); } else b.appendChild(h('span', { class: 'aw empty', title: R6.altar ? 'まだ使っていない祭壇（ワーカーを 1 つ置いて捧げる）' : 'まだ使っていない祭壇（ワーカーを 1 つ置いて献上）' }, h('span', { class: 'mk empty' }, ''))); } out.push(b); }; // O-66：点線の丸で空きと分かるので「空」は書かない
    if (R6.altar) { const vp = viewP(p); const nv = G.altarNextVg(vp); G.ALTAR_KEYS.forEach(k => { const a = { pid: p.id, type: 'altar', res: k }; const reason = can ? check(a) : roMsg; const c = G.altarCost(vp, k); const jp = G.ALTAR_JP[k]; const ct = (k === 'coop' ? '協調' : k) + c + (c !== R6.altar.cost[k] ? '（献身）' : ''); const nm = `祭壇（${jp}）`; const done = usedAt(k); const rL = !done && R6.altarDouble && R6.altarDouble.repeatL && vp.round && (vp.round.altarN || 0) > 0 ? R6.altarDouble.repeatL : 0; const ctx = ct + (rL ? `＋生命核${rL}` : ''); // O-40／O-44（T31）
        fin(k, actBtn({ class: 'slot' + (iconView() ? ' pic' : ''), 'data-slot': 'ALT_' + k, title: `${nm}：${ct}${k === 'L' && (R6.lCrystalLv || 4) > 1 ? `・身体Lv${R6.lCrystalLv || 4}で解放` : ''}`, onclick: () => altarClick(p, k, a, nm, ct, nv) }, reason, ...slotBody(p, 'ALT_' + k, nm, done ? ct : `${ctx} → 祝福+${nv}`, null), hintOn && can && !reason ? hintEl(hintPts(a)) : null)); }); /* O-122：祭壇は 1 口の見込み */ return out; } // T23（O-19）：祭壇＝払い口 5 つ（報酬は何個目かで決まる）
    if (R6.gemsetShared) fin('G', slotButton(p, can, G.SLOT_BY_ID.GEM, () => onSlot(p, 'GEM')));
    if (R6.lCrystal) { const a = { pid: p.id, type: 'lCrystal' }; const reason = can ? check(a) : roMsg; const nL = Math.max(1, R6.lCrystal - (viewP(p).crystalDiscL || 0)); const nLt = nL !== R6.lCrystal ? `${nL}（献身）` : String(nL); const vg = G.tribOutText(st, 'L'); fin('L', actBtn({ class: 'slot' + (iconView() ? ' pic' : ''), title: `献上（生命核）：生命核L${nLt}を払って${vg}。身体Lv${R6.lCrystalLv || 4}で解放・${place}・ワーカー。投入回数には数えない`, onclick: async () => await okAsk(`献上（生命核）：L${Math.max(1, R6.lCrystal - (p.crystalDiscL || 0))}→${vg}。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'LCR', '献上（生命核）', `L${nLt} → ${vg}`, null))); }
    if (R6.coopCrystal) { const a = { pid: p.id, type: 'coopCrystal' }; const reason = can ? check(a) : roMsg; const nC = Math.max(1, R6.coopCrystal - (viewP(p).crystalDiscC || 0)); const nCt = nC !== R6.coopCrystal ? `${nC}（献身）` : String(nC); const vg = G.tribOutText(st, 'coop'); fin('coop', actBtn({ class: 'slot' + (iconView() ? ' pic' : ''), title: `献上（協調）：協調${nCt}を払って${vg}。${place}・ワーカー`, onclick: async () => await okAsk(`献上（協調）：協調${Math.max(1, R6.coopCrystal - (p.crystalDiscC || 0))}→${vg}。実行しますか？`) && submit(a) }, reason, ...slotBody(p, 'CCR', '献上（協調）', `協調${nCt} → ${vg}`, null))); }
    return out;
  }
  // v3.68：個人ボードの祭壇 3 マス（遺伝子・生命核・協調）。献上＝自分のワーカーを祭壇に置く表現（1 マス 1 個＝1 ゲームに 1 回・第66〜67部・ユーザー決定）
  function renderAltars(p, can) {
    { const RA = G.RULESETS[st.rules || 'v1'].altar; if (RA) { const n = G.altarCount(p), nv = G.altarNextVg(p); const row = h('div', { class: 'pbrow altars' }, h('b', { title: `祭壇：払い口 5 つ（各 1 ゲームに 1 回・ワーカー 1${G.RULESETS[st.rules || 'v1'].altarDouble ? `・1 手で${G.RULESETS[st.rules || 'v1'].altarDouble.adjacent ? '隣り合う ' : ' '}2 つまで` : ''}）。報酬は何個目かで 祝福${RA.vg.map(x => '+' + x).join('／')}` }, ic('bless'), '祭壇', fxOn() && (G.RULESETS[st.rules || 'v1'].altarDouble || {}).adjacent ? h('span', { class: 'fxsep', title: '1 手で隣り合う 2 口まで' }, G.FX.ic('adj')) : null, h('small', { class: 'desc' }, `${n}/${G.ALTAR_KEYS.length}${nv ? `・次 祝福+${nv}` : ''}`))); tributeButtons(p, can, true).forEach(b => row.appendChild(b)); return row; } } // T23（O-19）
    const vg = G.tribOutText(st, 'G'), vgL = G.tribOutText(st, 'L'), vgC = G.tribOutText(st, 'coop'); const n = ['G', 'L', 'coop'].filter(k => p.tribGame && p.tribGame[k]).length;
    const row = h('div', { class: 'pbrow altars' }, h('b', { title: `祭壇：資源を捧げる（遺伝子＝${vg}／生命核＝${vgL}／協調＝${vgC}）。遺伝子・生命核・協調の 3 マスで、各祭壇は 1 ゲームに 1 回（使った祭壇には自分のワーカーが残る）。ワーカーを 1 つ使う` }, ic('bless'), '祭壇', h('small', { class: 'desc' }, `${n}/3`)));
    tributeButtons(p, can, true).forEach(b => row.appendChild(b));
    return row;
  }
  function renderOrganField(p, can) {
    const oex = G.RULESETS[st.rules || 'v1'].organExcl;
    const box = h('div', { class: 'panel' }, h('h3', { title: `${st.shared.lineages.map(l => G.LINEAGES[l]).join('・')}・${oex ? '各カード1ラウンド1人' : '排他なし'}\n` + G.noLateTxt(st, G.RULESETS[st.rules || 'v1'].organCumulative ? `　系統内は形態の順。カードの値段は定価（追随は代償込み）。前の段まで形成済みなら 1 つ前の段の定価を引いた差額で、（）に定価（${G.RULESETS[st.rules || 'v1'].burstFirstDiff ? '急速形成は 1 枚目だけ差額・2 枚目から定価' : '急速形成は定価'}）。同系統 3 枚で系統完成（成熟度+1 は ${(G.RULESETS[st.rules || 'v1'].lineageCoefAt || []).join('・')} 系統目）` : '　系統内は形態の順。先駆＝強・追随＝弱（G0）。同系統3枚で成熟度+1').replace(/^　/, '') }, '器官の場')); // O-66：見出しの補足は title へ
    const grid = h('div', { class: 'ogrid ofield' }); box.classList.add('ofieldp'); // O-52：1 行は 3 の倍数（9・6・3 枚）
    const sameEff = !!G.RULESETS[st.rules || 'v1'].organSameEffect;
    st.shared.organField.forEach(id => {
      const o = G.organDef(st, id); const c = G.organCost(st, p, id); const mine_ = G.organ(p, id); const first = st.shared.organFirst[id]; const noLate = G.RULESETS[st.rules || 'v1'].organLateFee === 0; // T25（O-23）：後追い料なし＝先駆／代償の札を出さない
      const bseq = !c && !mine_ ? burstTo(p, id) : null; // O-57（2026-11-18 ユーザー）：順番待ちの段は、そのカードまで続けて形成する急速形成を始められる
      const bk = bseq && burstCost(p, bseq);
      const locked = !c && !mine_ && !bseq; // 階層順で未解放
      const reason = !can ? '他プレイヤーの手番' : mine_ ? null : locked ? '前の形態が必要' : bseq ? (check({ pid: p.id, type: 'burst', organs: bseq, useL: 0, liRes: 'E' }) && check({ pid: p.id, type: 'burst', organs: bseq, useL: p.L, liRes: 'E' })) : check({ pid: p.id, type: 'organ', organ: id, useL: Math.min(p.L, 2), li2Res: 'E', li3Res: 'E', regimeRes: 'E' });
      const cl = mine_ ? null : G.organCost(st, p, id, true, true); // 2026-11-09 v3.88（ユーザー指摘）：順番待ちの段も急速形成の値段（定価）を出す。2026-11-10 v3.90（ユーザー指摘）：形成できるカードも同じ「定価＋追随の代償」に揃える（従来は代償なしの定価で、急速形成の合計と合わなかった）
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, cl ? (c && c.diff ? [icost(`E${c.E}${c.G ? '+G' + c.G : ''}`), h('small', null, '（', icost(`E${cl.E}${cl.G ? '+G' + cl.G : ''}`), '）')] : icost(`E${cl.E}${cl.G ? '+G' + cl.G : ''}`)) : (mine_ ? '形成済' : (['Ⅰ', 'Ⅱ', 'Ⅲ'][o.tier - 1] || ''))), h('span', { class: 'sw ' + (c ? (c.strong ? 'strong' : 'weak') : '') }, c ? (G.RULESETS[st.rules || 'v1'].organSameEffect ? (noLate ? G.LINEAGES[o.lin] : c.first ? '先駆' : '代償') : (c.strong ? '強' : '弱')) : `${G.LINEAGES[o.lin]}`));
      grid.appendChild(actBtn({ class: 'ocard' + (mine_ ? ' mine' : locked ? ' locked' : ''), 'data-slot': 'OC_' + id, title: `${id} ${o.name}（${G.LINEAGES[o.lin]}系 第 ${o.tier} 形態）\n${sameEff ? '効果：' + otxt(o, true) + (noLate ? '' : '\n追随の代償は +' + G.sc(st, G.RULESETS[st.rules || 'v1'].organLateFee || 1) + 'E') : '強：' + otxt(o, true) + '\n弱：' + otxt(o, false)}${bseq ? `\n急速形成：${bseq.join(' → ')}　計 E${bk.e}+G${bk.g}` : ''}`, onclick: () => bseq ? openBurst(p, id) : onOrgan(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${o.name}`, chgBadge(id)), ...(fxOn() && G.FX.lines(st, 'organ', id) && sameEff ? [G.FX.render(G.FX.lines(st, 'organ', id), otxt(o, true))] : [h('small', null, sameEff ? otxt(o, true) : `強：${otxt(o, true)}`), sameEff ? null : h('small', null, `弱：${otxt(o, false)}`)]), // O-49：アイコン表示は効果の記号
        ownersRow(p, id, 'organ'), statusLine(mine_ ? 'ok' : locked ? 'lock' : reason && can ? 'no' : bseq ? 'lock' : null, mine_ ? '形成済み' : locked ? '前の形態が必要' : reason && can ? reason : bseq ? '急速形成' : reason)));
    });
    box.appendChild(grid);
    if (st.shared.special) box.appendChild(h('div', { class: 'owned' }, h('b', null, objIc('sporgan'), `特殊器官（代謝 Lv4 に達した順に 1 枚）残り ${st.shared.special.length}：`), ...st.shared.special.map(id => fxOn() && G.FX.lines(st, 'organ', id) ? h('span', { class: 'tag fxtag', title: G.spText(G.RULESETS[st.rules || 'v1'], id) }, G.ORGANS[id].name, G.FX.render(G.FX.lines(st, 'organ', id), G.spText(G.RULESETS[st.rules || 'v1'], id))) : h('span', { class: 'tag', title: G.spText(G.RULESETS[st.rules || 'v1'], id) }, `${G.ORGANS[id].name}（${G.spText(G.RULESETS[st.rules || 'v1'], id)}）`)))); // T15
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
  function statusLine(kind, text) { if (kind === 'no') return null; /* O-66：今は不可の理由はカードの title と押したときの知らせに出す（赤い行は書かない） */ return kind ? h('small', { class: 'status ' + kind }, (kind === 'no' ? '× ' : '') + text) : null; }
  function renderTraitPool(p, can) {
    const noUp = G.RULESETS[st.rules || 'v1'].noUpgrade;
    const box = h('div', { class: 'panel' }, h('h3', { title: `${G.traitPool(st).length}種・獲得は${G.RULESETS[st.rules || 'v1'].traitShared ? '共用' : '占有'}\n先駆＝強・追随＝弱（安い）。${(G.RULESETS[st.rules || 'v1'].traitCoef || [4, 8]).join('枚目・')}枚目で成熟度+1。` + (noUp ? '' : '取得済みをクリックで形質強化') }, '形質プール')); // O-66：見出しの補足は title へ
    const grid = h('div', { class: 'tgrid' });
    G.traitPoolView(st).forEach(id => {
      const t = G.TRAITS[id]; const c = G.traitCost(st, p, id); const mine_ = G.trait(p, id); const first = st.shared.traitFirst[id];
      const pl = traitPlan(p) || {}; const reason = !can ? '他プレイヤーの手番' : mine_ ? null : check(Object.assign({ pid: p.id, type: 'trait', trait: id, useL: Math.min(Math.max(0, p.L - (pl.bypassL ? 1 : 0)), 3), res: 'E', track: 'body' }, pl));
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, mine_ ? (noUp ? '取得済' : `取得済→交換`) : (() => { const cw = G.traitCost(st, p, id, 0, 'force'); return [h('span', { class: 'tcs' + (c.strong ? '' : ' na'), title: c.strong ? `強の値段（いま払う額）` : '強は取れない（ほかの人が先に強で取得）' }, h('span', { class: 'tl' }, '強'), ic('G'), c.strong ? `${c.G}` : '―'), h('span', { class: 'tcw', title: '弱の値段（いま払う額）' }, h('span', { class: 'tl' }, '弱'), ic('G'), `${cw.G}`)]; })()), h('span', { class: 'sw ' + ((mine_ ? mine_.strong : c.strong) ? 'strong' : 'weak') }, mine_ ? (mine_.strong ? '強' : '弱') : G.RULESETS[st.rules || 'v1'].traitChoice ? (c.strong ? '強あり' : '弱のみ') : (c.strong ? '強' : '弱')));
      grid.appendChild(actBtn({ class: 'tcard' + (mine_ ? ' mine' : ''), 'data-slot': 'TC_' + id, title: `${id} ${t.name}\n強：${rtxt(G.traitText(st, id, true))}\n弱：${rtxt(G.traitText(st, id, false))}`, onclick: () => onTrait(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${t.name}`, chgBadge(id)), ...(fxOn() && G.FX.lines(st, 'trait', id, 's') ? [G.FX.render(G.FX.lines(st, 'trait', id, 's'), rtxt(G.traitText(st, id, true)), '強'), G.FX.render(G.FX.lines(st, 'trait', id, 'w'), rtxt(G.traitText(st, id, false)), '弱')] : [h('small', null, `強：${rtxt(G.traitText(st, id, true))}`), h('small', null, `弱：${rtxt(G.traitText(st, id, false))}`)]), // O-49
        ownersRow(p, id, 'trait'), statusLine(mine_ ? 'ok' : reason && can ? 'no' : null, mine_ ? (noUp ? '取得済み' : '取得済み（クリックで上位へ交換）') : reason)));
    });
    box.appendChild(grid); return box;
  }

  function renderPlayer(p, can) {
    const sp = G.SPECIES[p.species]; const sc = G.score(st, p); const inc = G.income(p);
    const box = h('div', { class: 'panel player p' + p.id }, h('div', { class: 'phead' }, art(SPECIES_ART[p.species] || 'species_wing', 'portrait'), h('h3', null, h('span', { class: 'mk p' + p.id }, p.id + 1), ` ${p.id !== G.cur(st).id ? '' : (can ? '手番' : isBot(p.id) ? '手番（AI）' : '手番（他端末）') + '：'}${p.name}（${sp.name}）`, h('small', { class: 'sub' }, `　残り ${p.lRemain} ラウンド`))));
    // ① 資源トラック（E/G/P）＋生命核
    box.appendChild(h('div', { class: 'res' }, ...['E', 'G', 'P', 'L'].map(k => h('span', { class: 'rbox r' + k, title: `${RES_JP[k]}${k !== 'L' ? '　次の収入 +' + inc[k] : (G.RULESETS[st.rules || 'v1'].lYield ? `　毎ラウンド+1・収入時に保有1個につき${G.RULESETS[st.rules || 'v1'].yieldRes === 'P' ? 'P' : 'E'}+${(G.RULESETS[st.rules || 'v1'].yieldByRound ? G.RULESETS[st.rules || 'v1'].yieldByRound[Math.min(7, st.round + 1)] : G.RULESETS[st.rules || 'v1'].lYield) + (p.yieldAdd || 0)}${p.yieldMul > 1 ? '×' + p.yieldMul : ''}（${G.RULESETS[st.rules || 'v1'].noLSub ? '' : `${p.lValue || 3}E/G代用・`}${G.RULESETS[st.rules || 'v1'].noAdapt ? '' : '適応進化・'}緊急進出${G.RULESETS[st.rules || 'v1'].breedL ? '・L繁殖' : ''}）` : '　毎ラウンド+1（E3/G3代用・適応進化・緊急進出）')}` }, ic(k), h('b', null, String(p[k])), k !== 'L' ? h('small', null, `+${inc[k]}/R`) : null))));
    box.appendChild(h('div', { class: 'note', title: inc.parts.join('\n') }, `次の収入 E+${inc.E} G+${inc.G} P+${inc.P} L+1`)); // O-66：内訳は title（「マウスで」は書かない）
    // ② 5コマ（係数）＋強W置き場
    const gauge = G.RULESETS[st.rules || 'v1'].gauge;
    const tok = h('div', { class: 'pbrow' }, G.RULESETS[st.rules || 'v1'].coef2 ? null : h('b', null, gauge ? 'ワーカー／係数' : 'ワーカー（係数）')); // O-66：繁栄度・成熟度はゲージに名前があるので行の見出しは書かない
    if (!G.RULESETS[st.rules || 'v1'].coef2) p.tokens.forEach((tk, i) => { /* 2026-10-30：T8（コマは全て同じ W・残数はヘッダに表示）ではコマの並びを出さない */ tok.appendChild(h('span', { class: 'tokc ' + tk, title: gauge ? 'ワーカー（全て同じ・何にでも使える）' : tk === 'AT' ? 'AT：進化・繁殖・適応進化には使えない' : tk === 'S' ? '強ワーカー（係数2）' : 'ワーカー（係数1）' }, ic('W'), tk === 'S' ? '強' : tk)); });
    const c2 = G.RULESETS[st.rules || 'v1'].coef2;
    if (c2) { const Rg = G.RULESETS[st.rules || 'v1']; const tc = Rg.traitCoef || [4, 8]; const nT = G.traitCountC(p); const nL = st.shared.lineages.filter(l => G.lineageDone(p, l)).length; const lAt = Rg.lineageCoefAt || Array.from({ length: (Rg.lineageCoefMax !== undefined ? Rg.lineageCoefMax : 2) + (p.lineageCoefAdd || 0) }, (_, i) => i + 1); const full = (p.collectUps || 0) >= (c2.collectMax || 4); const nx = (n, at) => { const x = at.find(t => t > n); return full || x === undefined ? `${n}済` : `${n}/${x}`; }; // 2026-11-05 v3.66：成熟度の内訳を見せる（ユーザー質問「成熟度の上げ方は画面で分かるか」）／O-96：形質・系統とも「今の数／次に上がる数」（形質は知的跳躍・神経を含めた枚数）・上がりきったら「済」
      tok.appendChild(h('span', { class: 'gauge', title: `繁栄度：繁殖（P${Rg.breed ? Rg.breed[0] : '?'}${Rg.breedL ? '／L' + Rg.breedL : ''}）で+1。痕跡に掛ける` }, '繁栄度', ...Array.from({ length: (c2.breedMax || 2) + 1 }, (_, i) => i).map(i => h('span', { class: 'gs' + (i <= (p.breedUps || 0) ? ' on' : '') }, '×' + ((c2.breedBase || 3) + i)))));
      tok.appendChild(h('span', { class: 'gauge', title: `成熟度：形質${tc.join('・')}枚目で+1（いま ${nT} 枚${nT !== p.traits.length ? '・知的跳躍や神経を含む' : ''}）、器官の系統完成（同じ系統3枚）で+1（${lAt.join('・')}系統目・いま ${nL} 系統${Rg.lineageCoefAt ? '' : '。適応放散〔強〕で+1系統'}）。上限×${(c2.collectBase || 3) + (c2.collectMax || 4)}。祝福に掛ける` }, '成熟度', ...[0, 1, 2, 3, 4].map(i => h('span', { class: 'gs' + (i <= (p.collectUps || 0) ? ' on' : '') }, '×' + ((c2.collectBase || 3) + i))), h('small', { class: 'desc' }, `形質${nx(nT, tc)}・系統${nx(nL, lAt)}`))); }
    else if (gauge) tok.appendChild(h('span', { class: 'gauge', title: '係数：繁殖・系統完成・形質4/8枚目で+1（上限×7）' }, ...[3, 4, 5, 6, 7].map(v => h('span', { class: 'gs' + (v <= G.coef(p) ? ' on' : '') }, '×' + v))));
    else tok.appendChild(h('span', { class: 'hl' }, `係数 ×${G.coef(p)}`));
    tok.appendChild(h('span', { title: 'このラウンドに置けるワーカーの残り' }, gauge ? `ワーカー残 ${p.left.W + p.left.AT}` : `ワーカー残 ${p.left.W}／AT${p.left.AT}`)); // 2026-11-05 ユーザー指摘：係数ゲージの横の「残 2」が何の残りか分からない→ワーカーの残数と明記
    if (p.shields) tok.appendChild(h('span', { class: 'hl' }, `自由行動 ${p.shields}`));
    box.appendChild(tok);
    // ③ 協調トラック 0-8
    const co = h('div', { class: 'pbrow', title: (() => { const RC = G.RULESETS[st.rules || 'v1']; return `協調：資源獲得スロットで得る資源+協調数${RC.coopMode === 'half' ? 'の半分（切り捨て）' : ''}${RC.coopBonusCap !== undefined ? `（上限+${RC.coopMode === 'half' ? Math.floor(RC.coopBonusCap / 2) : RC.coopBonusCap}）` : ''}。${st.ext === 'x1' ? '協調進出（2個で使用済み枠）。' : ''}${RC.coop8Coef ? (RC.coef2 ? '初めて8に達すると成熟度+1。' : '初めて8に達すると係数+1。') : RC.coop8Gem ? '初めて8に達すると痕跡+1。' : ''}${RC.coopCrystal ? `群れの結晶（${RC.coopCrystal}個→祝福+1）` : ''}`; })() }, h('b', null, ic('coop'), '協調'));
    for (let i = 0; i <= (G.RULESETS[st.rules || 'v1'].coopMax || G.COOP_MAX); i++) co.appendChild(h('span', { class: 'coopc' + (i === p.coop ? ' on' : '') }, String(i)));
    { const RC = G.RULESETS[st.rules || 'v1']; if (fxOn() && RC.coop8Gem) { const n8 = RC.coopGemAt || 8; co.appendChild(h('span', { class: 'coop8', title: `協調が初めて ${n8} に達すると痕跡+1` }, h('span', { class: 'fxcond' }, ic('coop'), String(n8), '：'), pc('gem', '+1'))); } } // O-86
    box.appendChild(co);
    // ④ 宝石カウンター
    const gm = h('div', { class: 'pbrow' }, h('b', null, ic('gem'), '痕跡')); // O-66：祝福は右に名前があるので見出しは「痕跡」だけ
    if (G.RULESETS[st.rules || 'v1'].noCombo) { gm.appendChild(h('span', { class: 'gem gray', title: '痕跡（宇宙への影響）：終了時 痕跡×繁栄度' }, String(G.realGems(p)))); gm.appendChild(h('span', { title: (G.RULESETS[st.rules || 'v1'].altar ? '祝福（神の評価）：終了時 祝福×成熟度。祭壇・Lv6 先駆・神の裁定で得る' : '祝福（神の評価）：終了時 祝福×成熟度。献上・Lv6 先駆・神の裁定で得る') }, ` 祝福 ${G.virtualGems(st, p)}`)); } // O-66：「（神の評価）」は title へ // 2026-10-28 色の廃止：合計のみ
    else { G.TRACKS.forEach(t => gm.appendChild(h('span', { class: 'gem ' + G.TRACK_INFO[t].color, title: G.TRACK_INFO[t].name }, String(p.gems[t])))); gm.appendChild(h('span', null, ` 祝福 ${G.virtualGems(st, p)}（セット${p.gemsets}）`)); }
    box.appendChild(gm);
    if (G.RULESETS[st.rules || 'v1'].tributeOnceGame) box.appendChild(renderAltars(p, can)); // v3.68 祭壇 3 マス（T10）
    const scTitle = sc.mode === 'mult'
      ? `（痕跡${sc.real}＋祝福${sc.vg}）×${sc.gemPt}×係数${sc.cf}＝${sc.core}　形質${p.traits.length}枚×宝石の色数${Math.max(1, sc.colors)}＝${sc.dev}　器官${p.organs.length}枚×協調${Math.min(4, p.coop)}（上限4）＝${sc.org}　体制${sc.reg}`
      : sc.coef2 ? `痕跡${sc.real}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}繁栄度${sc.cfB}＋祝福${sc.vg}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}成熟度${sc.cfC}＝${sc.core}${sc.devPt ? `　発展度（形質${p.traits.length}＋協調${p.coop}）×${sc.devPt}` : ''}${sc.reg ? `　体制${sc.reg}` : ''}` : `（痕跡${sc.real}＋祝福${sc.vg}）×${sc.gemPt}×係数${sc.cf}＝${sc.core}　発展度（形質${p.traits.length}＋協調${p.coop}）×${sc.devPt}＝${sc.dev}${sc.organPt ? `　器官${p.organs.length}枚×${sc.organPt}＝${sc.org}` : ''}　体制${sc.reg}`;
    const scText = sc.mode === 'mult'
      ? ` ＝ 宝石${sc.core}（${sc.real}+${sc.vg}個×${sc.gemPt}×${sc.cf}）＋形質${sc.dev}（${p.traits.length}×色${Math.max(1, sc.colors)}）＋器官${sc.org}（${p.organs.length}×協調${Math.min(4, p.coop)}）＋体制${sc.reg}`
      : sc.coef2 ? ` ＝ ${sc.core}（痕跡${sc.real}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}${sc.cfB}＋祝福${sc.vg}×${sc.gemPt !== 1 ? sc.gemPt + '×' : ''}${sc.cfC}）${sc.dev ? '＋発展度' + sc.dev : ''}${sc.reg ? '＋体制' + sc.reg : ''}` : ` ＝ 宝石${sc.core}（${sc.real}+${sc.vg}個×${sc.gemPt}×${sc.cf}）＋発展度${sc.dev}${sc.organPt ? '＋器官' + sc.org : ''}＋体制${sc.reg}`;
    box.appendChild(h('div', { class: 'score', title: scTitle }, h('b', null, `現在 ${sc.total} 点`))); void scText; // O-66：点数の式は title（scTitle）だけ
    const flags = h('div', { class: 'stat' }, p.alwaysStrong ? h('span', { class: 'hl' }, '形質常に強') : null, p.ampReserve ? h('span', { class: 'hl', title: '増幅の予約：この器官を形成したときから効果2倍' }, `増幅予約 ${p.ampReserve}`) : null, p.dv3 ? h('span', { class: 'hl', title: '突然変異：三段進化（3 段分の E を合算して手番 1 つ）の残り回数' }, `三段進化 残${p.dv3}`) : null, p.freeConv ? h('span', { class: 'hl' }, '無料E↔G変換') : null, p.wild ? h('span', { class: 'hl' }, `ワイルド色 ${G.TRACK_INFO[p.wild].jp}`) : null);
    if (flags.childNodes.length) box.appendChild(flags);
    if (p.pending.length) box.appendChild(h('div', { class: 'banner small' }, pendingText(p.pending[0]), ' ', p.pending[0].type === 'bonusAction' && can ? h('button', { onclick: () => submit({ pid: p.id, type: 'resolve', skip: true }) }, '見送る') : null));
    // ⑤ 器官（系統ごと）・形質
    const byLin = {}; p.organs.forEach(o => { (byLin[G.ORGANS[o.id].lin] = byLin[G.ORGANS[o.id].lin] || []).push(o); });
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `器官 ${p.organs.length}枚：`), ...Object.entries(byLin).map(([lin, os]) => h('span', { class: 'lin' + (G.lineageDone(p, lin) ? ' done' : '') }, `${G.LINEAGES[lin]} `, ...os.map(o => h('span', { class: 'tag' + (o.strong ? ' strong' : ''), title: `${G.ORGANS[o.id].name}：${otxt(o.id, o.strong)}` }, `${o.id}${o.strong ? '強' : '弱'}`))))));
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `形質 ${p.traits.length}枚：`), ...p.traits.map(t => h('span', { class: 'tag' + (t.strong ? ' strong' : ''), title: `${G.TRAITS[t.id].name}：${rtxt(G.traitText(st, t.id, t.strong))}` }, `${t.id}${t.strong ? '強' : '弱'}${t.res ? '(' + t.res + ')' : ''}${t.track ? '(' + G.TRACK_INFO[t.track].jp + ')' : ''}`))));
    // ⑥ 個人カード置き場（カードなしの数値セットでは出さない）
    const cards = h('div', { class: 'cards' }, h('b', null, '個人カード（排他なし）：'));
    if (G.handSize(st) > 0) p.cards.forEach(c => { const reason = can ? check({ pid: p.id, type: 'card', card: c, choice: 'E' }) : '他プレイヤーの手番'; cards.appendChild(actBtn({ class: 'cardbtn', title: G.CARDS[c].text, onclick: () => onCard(p, c) }, reason, h('div', { class: 'hd' }, h('span', null, c), h('span', { class: 'sw' }, '個人')), art(c, 'small'), h('b', null, G.CARDS[c].name), h('small', null, G.CARDS[c].text))); });
    if (G.handSize(st) > 0) box.appendChild(cards);
    const stOrgs = p.organs.filter(o => o.id.startsWith('St'));
    if (stOrgs.length) { const sa = h('div', { class: 'cards' }, h('b', null, '器官アクション：')); stOrgs.forEach(o => { const reason = can ? check({ pid: p.id, type: 'stAct', organ: o.id, pe: o.id === 'St2' ? 0 : 2, pg: o.id === 'St2' ? 3 : 0 }) : '他プレイヤーの手番'; sa.appendChild(actBtn({ class: 'cardbtn', title: otxt(o.id, o.strong), onclick: () => onStAct(p, o) }, reason, h('b', null, `${o.id} ${G.ORGANS[o.id].name}`), h('small', null, otxt(o.id, o.strong)))); }); box.appendChild(sa); }
    const free = h('div', { class: 'free' }, h('b', null, '無料：'));
    if (p.freeConv || (G.organ(p, 'Fl3') && G.organ(p, 'Fl3').strong)) free.appendChild(h('button', { disabled: !can, onclick: () => onFreeConv(p) }, 'E↔G 1:1変換'));
    if (p.shields > 0) free.appendChild(h('button', { disabled: !can, onclick: () => onSlot(p, null, true) }, '自由行動（資源獲得スロット・手番消費なし）'));
    if (p.L > 0 && !G.RULESETS[st.rules || 'v1'].noLToRes) free.appendChild(h('button', { disabled: !can, title: '生命核を E か G に換える（手番消費なし・いつでも）。払った個数は身体の素材に数える', onclick: () => onLToRes(p) }, `生命核→資源（L1＝E/G${p.lValue || G.sc(st, 3)}）`)); // 2026-11-05 ユーザー要望：生命核の使用に制限を持たせない＝アクションの前でも資源に換えられる
    if (free.childNodes.length > 1) box.appendChild(free);
    return box;
  }
  function pendingText(pd) {
    return { diIncome: '消化：P を払うか選んでください', specialOrgan: '代謝 Lv4：特殊器官を 1 枚選んでください', fkBreed: '孵化核：繁殖を 1 回（手番なし）行えます', starJump: `${G.STAR_JUMP_NAME}：${G.STAR_NAME}を 1 段進められます（片方を 1.5 倍払い）`, prStar: `${pd.src || '遊泳核'}：${G.STAR_NAME}の進化を 1 回（手番なし）行えます`, prJump: `遊泳核：${G.STAR_NAME}を 1 段進められます（片方を 1.5 倍払い・手番なし）`, lYield: '生命核の産出：受け取る資源を選んでください', foresee: pd.track ? `先見：${G.TRACK_INFO[pd.track].name} Lv${pd.lv}★ の報酬を強・弱から選んでください` : '', /* T53（O-137） */ cvIncome: pd.src ? `${pd.src}：好きな資源+${pd.n}（E・G・P）を選んでください` : '収斂膜：収入時の追加資源を選んでください', wildColor: '共鳴膜：ワイルド色を選んでください', reMilestone: '感応系：再発動する到達済み報酬を選んでください', freeMass: '身体Lv3★先駆：淘汰を1回無料で実行してください', rewardTrait: pd.freeMax ? (pd.weakOnly ? `転写腺：弱の値段が G${pd.freeMax} 以下の形質1枚を弱で無料で取れます` : `転写核：G${pd.freeMax} 以下の形質1枚を無料で取れます`) : '知性Lv3★先駆：形質1枚を割引で獲得できます', bonusAction: '知性Lv4：追加アクションを今すぐ実行してください（排他なしアクション／Eコスト半額／ワーカー不要）。対象以外はグレー表示', flSwap: '収入時の転流：E↔Gを振替できます', dgBuy: 'ラウンド開始時：遺伝記憶で形質1枚を割引で獲得できます（手番は消費しません）', join: `合流進出：資源枠を 1 つ使えます（残り ${pd.n} 回・見送ると消えます）`, flip: `${{ '3w': '知性 Lv3★ 弱', '5w': '知性 Lv5★ 弱', '5s': '知性 Lv5★ 強' }[pd.src] || '知性'}：${pd.n >= 99 ? '弱の形質を好きなだけ強に裏返せます' : pd.n === 1 ? `弱の形質 1 枚を強に裏返すか${pd.g ? ` G+${pd.g} か` : ''}を選んでください` : `弱の形質を ${pd.n} 枚まで強に裏返せます${pd.g ? `（裏返さない 1 枚につき G+${pd.g}）` : ''}`}`, learn: '知性 Lv3★：学習を選んでください', mutate: '知性 Lv4：変異（形質の入れ替え）を選んでください' }[pd.type] || '選択を解決してください'; // O-95：英字の種類名（flip など）をそのまま出さない
  }
  function renderSeatsMini() { const box = h('div', { class: 'panel others seatsmini' }, h('h3', null, `ルーム ${game.code}`)); st.players.forEach((p, i) => { const s = Net.seats[i]; box.appendChild(h('div', { class: 'orow' }, h('span', { class: 'mk p' + i }, i + 1), ` ${p.name}：${isBot(i) ? 'AI' : s ? (s.uid === Net.uid ? '自分' : '他端末') : '空席'} `, isBot(i) ? null : !s ? h('button', { onclick: () => Net.claimSeat(i, p.name).catch(e => toast(e.message, true)) }, '着席') : s.uid === Net.uid ? h('button', { onclick: () => Net.releaseSeat(i) }, '離席') : null)); }); box.appendChild(nameRow()); return box; }
  // O-50：名前（ネット対戦）。この端末に記憶し、着席中の自分の席にも反映する（あとから変えられる）
  const NAME_MAX = 8, NAME_KEY = 'g01_name';
  function cleanName(s) { return Array.from(String(s || '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join(''); }
  function myName() { try { return cleanName(localStorage.getItem(NAME_KEY)); } catch (e) { return ''; } }
  function nameRow() {
    const inp = h('input', { type: 'text', maxlength: NAME_MAX, value: myName(), placeholder: 'P1〜P4' });
    const save = async () => { const v = cleanName(inp.value); try { localStorage.setItem(NAME_KEY, v); } catch (e) { } try { await Promise.all(Net.mySeats().map(i => Net.setSeatName(i, v))); toast(v ? `名前：${v}` : '名前を消しました'); } catch (e) { toast(e.message, true); } };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
    return h('div', { class: 'frow namerow' }, h('span', null, '名前'), inp, h('button', { type: 'button', onclick: save }, '変更'));
  }
  const altarTxt = (q) => { if (G.RULESETS[st.rules || 'v1'].altar) { const u = G.ALTAR_KEYS.filter(k => q.tribGame && q.tribGame[k]).map(k => G.ALTAR_JP[k]); return `｜祭壇 ${u.length}/${G.ALTAR_KEYS.length}${u.length ? '（' + u.join('・') + '）' : ''}`; } if (!G.RULESETS[st.rules || 'v1'].tributeOnceGame) return ''; const u = [['G', '遺伝子'], ['L', '生命核'], ['coop', '協調']].filter(([k]) => q.tribGame && q.tribGame[k]).map(([, n]) => n); return `｜祭壇 ${u.length}/3${u.length ? '（' + u.join('・') + '）' : ''}`; }; // v3.68：他プレイヤーの祭壇の使用状況（ワーカーが乗っている祭壇）
  function renderOthers(p) {
    const box = h('div', { class: 'panel others' }, h('h3', null, '他プレイヤー'));
    st.players.filter(q => q.id !== p.id).forEach(q => box.appendChild(h('div', { class: 'orow', title: '押すとこの人の個人ボードを開く', onclick: () => showBoard(q) }, h('span', { class: 'mk p' + q.id }, q.id + 1), ' ', h('b', null, `${q.name}（${G.SPECIES[q.species].name}${isBot(q.id) ? '・AI' : ''}）`), ` ${G.score(st, q).total}点｜E${q.E} G${q.G} P${q.P} L${q.L}｜Lv ${G.TRACKS.map(t => q.lv[t]).join('/')}｜痕跡${G.realGems(q)}＋祝福${G.virtualGems(st, q)}｜×${G.coef(q)}｜形質${q.traits.length} 器官${q.organs.length} 協調${q.coop}｜${leftTxt(q)}${altarTxt(q)}`)));
    return box;
  }
  function renderLog() {
    if (!logOpen) return h('div');
    const box = h('div', { class: 'panel logp' }, h('h3', null, 'ログ'));
    const ul = h('div', { class: 'log' });
    st.log.slice(-120).reverse().forEach(l => ul.appendChild(h('div', { class: 'l ' + l.kind + (l.p !== null && l.p !== undefined ? ' p' + l.p : '') }, `R${l.r} ${l.msg}`, l.d > 0 ? h('b', { class: 'lgain' }, ` +${l.d}点`) : null))); // O-120：その手で点が増えたときだけ
    box.appendChild(ul); return box;
  }

  // ---------- 操作 ----------
  async function onTrack(p, t) {
    const c = G.stepCost(p, t); if (c === null) return toast('最大Lvです', true);
    // 2026-11-05 ユーザー指摘：Lv6（その色の資源で払う）のダイアログが E63（＋生命核）などの通常の支払いを出していた。Lv6 は支払いが固定なので、その内容だけを示す（G の支払いは生命核で代用できる＝engine の payG）
    const d6 = p.lv[t] === 5 ? G.lv6PayDef(st, t) : null;
    const fields = d6
      ? [{ type: 'select', name: 'pay', label: '支払い', options: [{ value: 'E', label: `${G.lv6CostText(st, t)}（Lv6＝そのトラックの資源で払う）` }] }].concat(d6.G ? [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }] : d6.E ? [{ type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p, 'E') }] : []) // 2026-11-05 ユーザー指摘：代謝 Lv6（E90）で生命核の欄が出ず、知性 Lv6 の欄が「=E15」表示だった（engine は E・G とも代用可）
      : [{ type: 'select', name: 'pay', label: '支払い', options: [{ value: 'E', label: `E${c}（＋生命核）` }].concat(G.RULESETS[st.rules || 'v1'].noAlt ? [] : t === 'body' ? [{ value: 'P', label: `P${c * 3}（身体の代替払い）` }] : t === 'intel' ? [{ value: 'G', label: `G${c}（知性の代替払い）` }] : []) /* 2026-11-11 ユーザー指摘（T20-H1）：noAlt の数値セットでは engine が断るので選択肢に出さない */.concat((G.RULESETS[st.rules || 'v1'].doubleStep && G.stepCostDouble(p, t) !== null) ? [{ value: 'E2', label: `E${G.stepCostDouble(p, t)}${p.lv[t] + 2 === 6 ? '＋' + G.lv6CostText(st, t) : ''}で二段進化（Lv${p.lv[t] + 2}へ・手番1つ）` }] : []).concat((G.can3(p) && G.stepCostTriple(p, t) !== null) ? [{ value: 'E3', label: `E${G.stepCostTriple(p, t)}${p.lv[t] + 3 === 6 ? '＋' + G.lv6CostText(st, t) : ''}で三段進化（Lv${p.lv[t] + 3}へ${G.dvPerm(p) ? '・手番1つ' : `・突然変異 残${p.dv3}`}）` }] : []) /* O-76（T42）：Lv6 に入る二段・三段は Lv6 の払い（そのトラックの資源）を足して見せる */ }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }]; // T10 二段進行
    const trA = (r) => r.pay === 'E2' || r.pay === 'E3' ? { pid: p.id, type: 'track', track: t, pay: 'E', useL: +(r.useL || 0), steps: r.pay === 'E2' ? 2 : 3 } : { pid: p.id, type: 'track', track: t, pay: r.pay, useL: +(r.useL || 0) }; // O-122
    const r = await ask(`${G.TRACK_INFO[t].name} Lv${p.lv[t]}→${p.lv[t] + 1}`, fields, { note: `Lv${p.lv[t] + 1}の報酬：${rtxt(G.trackRewardText(st, t, p.lv[t] + 1))}`, act: trA }); if (!r) return;
    if (r.pay === 'E2') return submit({ pid: p.id, type: 'track', track: t, pay: 'E', useL: +(r.useL || 0), steps: 2 }); // T10 二段進行
    if (r.pay === 'E3') return submit({ pid: p.id, type: 'track', track: t, pay: 'E', useL: +(r.useL || 0), steps: 3 }); // T14 三段進行（突然変異）
    submit({ pid: p.id, type: 'track', track: t, pay: r.pay, useL: +(r.useL || 0) });
  }
  // T18 緊急進出：空いている資源枠（自己複製を除く）を選んで、生命核 1 個で獲得量 launchFree 倍
  function launchCands(p) { return G.RES_SLOTS.concat(G.RULESETS[st.rules || 'v1'].pbLaunch ? ['PB'] : []).filter(id => G.slotUsedBy(st, id) === undefined).map(id => { const a = { pid: p.id, type: 'res', slot: id, coopRes: 'E', useL: true }; const ngL = p.L > 0 ? check(a) : '生命核がありません'; const ngP = G.ngCost(p) !== null ? check(Object.assign({}, a, { launchP: true })) : ngL; return { id, ng: ngL && ngP ? ngL : null, okL: !ngL, okP: G.ngCost(p) !== null && !ngP }; }); } // T49（O-91）犠牲：P でも打てる枠は選べる
  async function onLaunch(p) {
    const RCm = G.RULESETS[st.rules || 'v1']; const cands = launchCands(p);
    const pv = (id) => { const d = G.previewGain(st, Object.assign({ pid: p.id, type: 'res', slot: id, coopRes: 'E', useL: true }, p.L <= 0 && G.ngCost(p) !== null ? { launchP: true } : {})); return d ? gainStr(d) : ''; }; // T49（O-91）：生命核 0 で犠牲を持つときは P 払いの見込み
    const opts = cands.map(c => ({ value: c.id, label: `${G.SLOT_BY_ID[c.id].name}（${c.ng ? '不可：' + c.ng : pv(c.id)}）`, disabled: !!c.ng }));
    const first = cands.find(c => !c.ng); if (!first) return toast('緊急進出できる空き枠がありません', true);
    const spendable = RCm.coopMode === 'spend' && p.coop >= 1;
    const nc = G.ngCost(p); // T49（O-91）犠牲：生命核の代わりに P（1 ラウンドに 1 回）
    const r = await ask(`緊急進出（生命核-1${nc !== null ? ` か P${nc}` : ''}・獲得量${RCm.launchFree}倍）`, [
      { type: 'select', name: 'slot', label: '空いている資源枠', value: first.id, options: opts, desc: v => (G.slotTip(st, v.slot) || G.slotText(st, v.slot, viewP(p)) || '').split(/。(使用済み|空いている枠)/)[0] },
      ...(nc !== null ? [{ type: 'select', name: 'pay', label: '払い方', value: p.L > 0 ? 'L' : 'P', options: [{ value: 'L', label: `生命核 1（所持 ${p.L}）`, disabled: p.L <= 0 }, { value: 'P', label: `P${nc}（犠牲・所持 P${p.P}）`, disabled: p.P < nc }] }] : []),
      ...(spendable ? [{ type: 'check', name: 'coopSpend', label: `協調1個を払って この枠の資源+${RCm.coopSpendGain || 3}`, value: false }] : []),
      Object.assign(resSel('coopRes', RCm.coopMode === 'spend' ? '協調を払ったときの資源' : '協調加算の資源'), { when: v => v.slot === 'ALL' && (p.coop > 0 && RCm.coopMode !== 'spend' || spendable) }),
    ], { note: `所持 L${p.L}。払った生命核は身体の投入に数えます。` }); if (!r) return;
    return submit(Object.assign({ pid: p.id, type: 'res', slot: r.slot, coopRes: r.coopRes || 'E', useL: true, coopSpend: !!r.coopSpend }, r.pay === 'P' ? { launchP: true } : {}));
  }
  async function onSlot(p, id, shield) {
    if (shield) {
      // Wなし実行（社会性の権利）：資源獲得スロット1つ or 個人カード1枚。コマを置かないのでスロットを占有しない
      const opts = G.RES_SLOTS.map(s => ({ value: s, label: G.SLOT_BY_ID[s].name + (G.slotUsedBy(st, s) !== undefined ? '（使用済・不可）' : ''), disabled: G.slotUsedBy(st, s) !== undefined }))
        .concat(p.cards.map(c => ({ value: 'card:' + c, label: `個人カード ${c} ${G.CARDS[c].name}` })));
      const r = await ask((p.cards.length ? '自由行動：資源獲得スロット1つ または カード1枚（ワーカーを置かず・手番は消費しません）' : '自由行動：資源獲得スロット1つ（ワーカーを置かず・手番は消費しません）'), [
        { type: 'select', name: 'slot', label: '対象', options: opts, desc: v => v.slot && v.slot.startsWith('card:') ? G.CARDS[v.slot.slice(5)].text : ((G.slotTip(st, v.slot) || G.slotText(st, v.slot, viewP(p)) || TIPS[v.slot] || '').split('。使用済み')[0]) }, // 2026-11-06 ユーザー指摘（T10-H3）：TIPS は T4 の素の値（+3G）だった→数値セットの値（固定G強：G+9）
        Object.assign(resSel('coopRes', '協調加算の資源（資源合成用）'), { when: v => v.slot === 'ALL' && p.coop > 0 }),
        { type: 'select', name: 'choice', label: 'カードJの変換', options: [{ value: 'E', label: 'E-2 → P+6' }, { value: 'G', label: 'G-1 → P+5' }], when: v => v.slot === 'card:J' },
      ]); if (!r) return;
      if (r.slot.startsWith('card:')) return submit({ pid: p.id, type: 'card', card: r.slot.slice(5), choice: r.choice, shield: true });
      return submit({ pid: p.id, type: 'res', slot: r.slot, coopRes: r.coopRes, shield: true });
    }
    const s = G.SLOT_BY_ID[id];
    if (s.group === 'res') {
      const used = G.slotUsedBy(st, id) !== undefined; const fields = []; const RCp = G.RULESETS[st.rules || 'v1'];
      if (id === 'PB' && !(used && RCp.pbCoopBypass)) return await okAsk(G.pbCost(p) ? `自己複製：G${G.pbCost(p)}→P+${G.pbGain(p)}。実行しますか？` : `自己複製：P+${G.pbGain(p)}。実行しますか？`) && submit({ pid: p.id, type: 'res', slot: 'PB' }); // O-51（T33）：使用済みの自己複製は協調進出を選べる
      const RCm = G.RULESETS[st.rules || 'v1']; const spendable = RCm.coopMode === 'spend' && p.coop >= 1;
      if (spendable) fields.push({ type: 'check', name: 'coopSpend', label: `協調1個を払って この枠の資源+${RCm.coopSpendGain || 3}`, value: false });
      if (id === 'ALL' && (p.coop > 0 && RCm.coopMode !== 'spend' || spendable)) fields.push(resSel('coopRes', RCm.coopMode === 'spend' ? '協調を払ったときの資源' : `協調加算の資源`));
      if (used && (G.RES_SLOTS.includes(id) || (id === 'PB' && RCm.pbCoopBypass))) { const bf = bypassField(p); if (!bf && p.round && p.round.boostLock) return toast('使用済みです（神の加護を取ったこのラウンドは協調進出できません）', true); if (!bf) return toast(RCm.launchFree ? `使用済みです（協調${G.coopCost(p, RCm.bypassCoopCost || 2, 'bypass')}があれば協調進出ができます）` : '使用済みです（生命核があれば緊急進出、拡張x1なら協調で協調進出ができます）', true); fields.push(bf); }
      // T18（O-12）の緊急進出（空き枠・生命核 1 で 3 倍）は占有盤の専用ボタン（onLaunch）から。枠を押したときは聞かない（2026-11-10 ユーザー要望）
      if (!fields.length) return submit({ pid: p.id, type: 'res', slot: id });
      const resA = (r) => ({ pid: p.id, type: 'res', slot: id, coopRes: r.coopRes, useL: r.bypass === 'L', bypassCoop: r.bypass === 'coop', bypassMimic: r.bypass === 'mimic', coopSpend: !!r.coopSpend });
      const r = await ask(s.name, fields, { note: G.slotTip(st, id), act: resA }); if (!r) return; return submit(resA(r));
    }
    if (id === 'BRD') { const R0 = G.RULESETS[st.rules || 'v1']; const c = G.breedCost(p); if (c === null) return toast('繁殖は上限です', true); const bl = R0.breedL; const cf = (k) => R0.coef2 ? '繁栄度×' + (G.coefB(p) + k) : '係数×' + (G.coef(p) + k);
      if (!bl) return await okAsk(`繁殖：P${c}を支払い${cf(1)}。実行しますか？`, null, { pid: p.id, type: 'breed' }) && submit({ pid: p.id, type: 'breed' });
      if (R0.mbMode !== 'multi') { const r = await ask(`繁殖（${cf(1)}）`, [{ type: 'select', name: 'pay', label: '支払い', value: p.P >= c ? 'P' : 'L', options: [{ value: 'P', label: `個体数 P${c}` }, { value: 'L', label: `生命核 L${bl}（身体の投入回数に数える）` }] }], { act: v => ({ pid: p.id, type: 'breed', pay: v.pay }) }); if (!r) return; return submit({ pid: p.id, type: 'breed', pay: r.pay }); }
      // T14（第71部 §19 S-c）：P 払いの段と生命核払いの段を同時に（それぞれ 1 段・増殖暴走の強で 2 段）
      const mx = G.breedMaxN(p); const left = G.breedLeft(p); const nOpts = (unit, have, each) => Array.from({ length: Math.min(mx, left) + 1 }, (_, i) => ({ value: String(i), label: i === 0 ? 'なし' : `${i} 段（${unit}${each * i}）`, disabled: have < each * i }));
      const r = await ask(`繁殖（あと ${left} 段・${cf(1)}〜）`, [{ type: 'select', name: 'nP', label: '個体数で', value: p.P >= c ? '1' : '0', options: nOpts('P', p.P, c) }, { type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: (p.P < c && p.L >= bl) ? '1' : '0', options: nOpts('L', p.L, bl) }], { note: `個体数と生命核の段を同時に行えます（それぞれ ${mx} 段まで${mx === 1 ? '・増殖暴走の強で 2 段' : ''}・合計はあと ${left} 段まで）`, act: v => ({ pid: p.id, type: 'breed', nP: +v.nP, nL: +v.nL }) }); if (!r) return;
      return submit({ pid: p.id, type: 'breed', nP: +r.nP, nL: +r.nL }); }
    if (id === 'ORG') return toast('器官の場のカードをクリックしてください');
    if (id === 'TRT' || id === 'TRT2') return toast('形質プールのカードをクリックしてください（獲得枠はダイアログで選べます）');
    if (s.group === 'mass') {
      const sec = massSecondArgs(p, id, { pid: p.id, type: 'mass', kind: id, traits: sample(p, id).traits }).second; const secF = sec ? massSecondField(p) : null; const secA = (r) => sec ? Object.assign({ second: true }, r && r.secondPay ? { secondPay: r.secondPay } : {}) : {}; const secN = sec ? '・使用済みなので 2 人目として入る' : ''; // O-44（T31）
      if (id === 'MI') { const RM = G.RULESETS[st.rules || 'v1']; const r = await ask(`淘汰(知性)：G${RM.miMaxCost || 4}以下の形質${RM.miMaxCost ? (RM.miCount || 1) + '種' : 'を異なる2種'}`, [{ type: 'multi', name: 'traits', label: `形質（${RM.miCount || 2}つまで。PC は Ctrl キーを押しながらクリック、スマホはタップで選択）`, options: miOpts(p, G.traitPoolView(st).filter(t => G.baseTraitCost(st, t) <= (RM.miMaxCost || 4) && !G.trait(p, t))) }].concat(secF ? [secF] : []), { note: (payGainText(p, Object.assign({ pid: p.id, type: 'mass', kind: 'MI', traits: [] }, secA()), G.massCost(p, 'MI')) || `払う：P${G.massCost(p, 'MI')}`) + '・選んだ形質' + (sec ? '（使用済みなので 2 人目として入る）' : '') }); if (!r) return; const mp = miParse(r.traits.slice(0, RM.miCount || 2)); if (!mp) return; return submit(Object.assign({ pid: p.id, type: 'mass', kind: 'MI', traits: mp.traits, weak: mp.weak }, secA(r))); }
      if (sec) { const mc2 = G.massCost(p, id); if (secF) { const r = await ask(`${s.name}（使用済みなので 2 人目として入る）`, [Object.assign({}, secF, { desc: v => payGainText(p, Object.assign({ pid: p.id, type: 'mass', kind: id }, secA({ secondPay: v.secondPay })), mc2) || '' })]); if (!r) return; return submit(Object.assign({ pid: p.id, type: 'mass', kind: id }, secA(r))); } const ms = G.RULESETS[st.rules || 'v1'].massSecond; void ms; const a2 = Object.assign({ pid: p.id, type: 'mass', kind: id }, secA()); { const why = check(a2); if (why) return toast('× ' + why, true); } return await okAsk((payGainText(p, a2, mc2) || `払う：P${mc2}`) + '（使用済みなので 2 人目として入る）', s.name) && submit(a2); }
      const mc = G.massCost(p, id), floor = G.RULESETS[st.rules || 'v1'].massMin[id === 'MB' ? 'body' : 'other'];
      const usedM = G.slotUsedBy(st, id) !== undefined; const byL = usedM && G.bypassable(st, id, p) && p.L > 0;
      const bcC = G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass'); const byC = usedM && !byL && G.coopBypassable(st, id, p) && p.coop >= bcC; // bypassCoopWide：使用済みの大量消費を協調発進で（緊急発進が使えるときはそちらを優先）
      const aM = { pid: p.id, type: 'mass', kind: id, bypassL: byL, bypassCoop: byC }; { const why = check(aM); if (why) return toast('× ' + why, true); } return await okAsk((payGainText(p, aM, mc) || `払う：P${mc}`) + (mc === floor ? `（P は軽減後の下限 P${floor}）` : '') + (byL ? '（使用済みのため緊急進出）' : byC ? '（使用済みのため協調進出）' : ''), s.name, aM) && submit(aM); // O-95：払う物 → 得る物を今の額で
    }
    if (id === 'GEM') { const usedG = G.slotUsedBy(st, id) !== undefined; const byL = usedG && G.bypassable(st, id, p) && p.L > 0; const r = await ask(G.RULESETS[st.rules || 'v1'].tribute ? '献上（遺伝子）' : '宝石セット得点カード', (G.RULESETS[st.rules || 'v1'].noLTribute ? [] : [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }]), { note: `コスト G${G.gemsetPrice(p)} → ${G.tribOutText(st, 'G')}（現在 ${p.gemsets}・${G.tribLimitText(st)}）${byL ? '／使用済みのため緊急進出（生命核-1）で実行' : ''}` }); if (!r) return; return submit({ pid: p.id, type: 'gemset', useL: +r.useL, bypassL: byL }); }
    if (id === 'TE' || id === 'TP') return await okAsk(`${G.SLOT_BY_ID[id].name}：${G.slotText(st, id)}。実行しますか？`, null, { pid: p.id, type: 'tributeSlot', slot: id }) && submit({ pid: p.id, type: 'tributeSlot', slot: id });
    if (id === 'TO' && G.RULESETS[st.rules || 'v1'].toLineage) { const RT = G.RULESETS[st.rules || 'v1']; const ls = st.shared.lineages.filter(l => G.lineageCount(p, l) < 3); if (!ls.length) return toast('3 段目まで形成できる系統がありません', true); // T15：系統 1 つを 1 段目の定価で 3 段目まで
      const c1 = (l) => ((RT.organCostBy || {})[l] || RT.organCost || G.ORGAN_COST)[0]; const lab = (l) => { const n = G.lineageCount(p, l); const ids = [n + 1, n + 2, n + 3].filter(t => t <= 3).map(t => l + t); return `${G.LINEAGES[l]}：${ids.map(x => `${x} ${G.ORGANS[x].name}`).join(' → ')}（E${c1(l)[0]}+G${c1(l)[1]}）`; };
      const r = await ask('器官の恩寵：系統 1 つを 1 段目の定価で 3 段目まで', [{ type: 'select', name: 'lin', label: '系統', options: ls.map(l => ({ value: l, label: lab(l), disabled: p.G < c1(l)[1] || p.E + p.L * (p.lValue || G.sc(st, 3)) < c1(l)[0] })) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }, resSel('liRes', '連結の資源（好きな資源の器官のとき）')], { note: G.slotTip(st, id) }); if (!r) return;
      return submit({ pid: p.id, type: 'tributeSlot', slot: id, lin: r.lin, useL: +(r.useL || 0), liRes: r.liRes, regimeRes: 'E' }); }
    if (id === 'TO') { const bl = st.shared.organField.filter(o => G.organCost(st, p, o)); if (!bl.length) return toast('今形成できる器官がありません', true); const lab = (o) => `${o} ${G.ORGANS[o].name}（${otxt(o, true)}）`; const r = await ask('器官の恩寵：器官1枚を無料（＋もう1枚を半額）', [{ type: 'select', name: 'organ', label: '無料で形成', options: bl.map(o => ({ value: o, label: lab(o) })) }, { type: 'select', name: 'organ2', label: '半額で形成（任意）', options: [{ value: '', label: 'なし' }].concat(st.shared.organField.filter(o => !G.organ(p, o)).map(o => ({ value: o, label: lab(o) }))) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに（2枚目）', options: lOpts(p) }], { note: G.slotTip(st, id) + '。2枚目は1枚目を形成した後に形成できる物（同じ系統の次の段も可）' }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, organ: r.organ, organ2: r.organ2 || undefined, useL: +r.useL, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }); }
    if (id === 'TT') { const RT = G.RULESETS[st.rules || 'v1'].tribute.slots.TT; const un = G.traitPoolView(st).filter(t => !G.trait(p, t)); if (!un.length) return toast('取得できる形質がありません', true); const r = await ask(`形質の恩寵（G${G.sc(st, RT.G || 0)}）：形質${RT.n || 2}枚まで無料`, [{ type: 'multi', name: 'traits', label: `形質（${RT.n || 2}枚まで・Ctrlで複数選択）`, options: un.map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}${st.shared.traitFirst[t] === undefined ? '（強）' : '（弱）'}` })) }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, traits: r.traits, useL: +r.useL, res: 'E', track: 'intel' }); }
    if (id === 'TA') { const have = G.TRACKS.filter(t => p.gems[t] > 0); if (!have.length) return toast('替える宝石がありません', true); const col = (name, label) => ({ type: 'select', name, label, value: G.TRACKS.find(t => t !== have[0]), options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }); const r = await ask('錬金：宝石の色を2個まで替える', [{ type: 'select', name: 'f1', label: '1個目：替える宝石', options: have.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${p.gems[t]}個）` })) }, col('t1', '1個目：替えた後の色'), { type: 'select', name: 'f2', label: '2個目：替える宝石（任意）', options: [{ value: '', label: 'なし' }].concat(have.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${p.gems[t]}個）` }))) }, Object.assign(col('t2', '2個目：替えた後の色'), { when: v => !!v.f2 })], { note: `コンボ：${G.comboNames(st).join('／')}` }); if (!r) return; const ch = [{ from: r.f1, to: r.t1 }]; if (r.f2) ch.push({ from: r.f2, to: r.t2 }); return submit({ pid: p.id, type: 'tributeSlot', slot: id, changes: ch }); }
    if (id === 'TB') { const RB = G.RULESETS[st.rules || 'v1'].tribute.slots.TB; if (!RB.instant) return await okAsk(`神の加護：${G.slotText(st, id)}（協調加算とコストはそのまま）。実行しますか？`) && submit({ pid: p.id, type: 'tributeSlot', slot: id }); const opts = G.RES_SLOTS.concat(['PB']).map(s => ({ value: s, label: G.SLOT_BY_ID[s].name + '：' + G.slotText(st, s) + (G.slotUsedBy(st, s) !== undefined ? '（使用済みでも可）' : '') })); const r = await ask(`神の加護：資源枠1つを今すぐ（${RB.mul || 2}倍${RB.instantVg ? '＋祝福' : ''}）＋残りの手番は資源枠が${RB.mul || 2}倍`, [{ type: 'select', name: 'res', label: '今すぐ実行する資源枠', options: opts }, Object.assign(resSel('coopRes', '協調加算の資源（資源合成用）'), { when: v => v.res === 'ALL' && p.coop > 0 })], { note: G.slotTip(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, res: r.res, coopRes: r.coopRes }); }
    if (id === 'TAL' && (G.RULESETS[st.rules || 'v1'].tribute.slots.TAL || {}).pair) { const R0 = G.RULESETS[st.rules || 'v1'], D = R0.altarDouble; const ks = G.ALTAR_KEYS.filter(k => G.altarHalfCost(p, k) !== null); if (!ks.length) return toast('まだ払っていない払い口がありません', true); const n0 = G.altarCount(p); const vgs = R0.altar.vg; // T39（O-68）祭壇の恩寵：通常の祭壇の手と同じ口数（隣り合う 2 口まで）を半額
      const jp = k => (k === 'coop' ? '協調' : k === 'L' ? '生命核' : k) + G.altarHalfCost(p, k); const opts = []; ks.forEach(k => opts.push({ value: k, label: `${jp(k)} → 祝福+${vgs[n0] || 0}`, disabled: p[k] < G.altarHalfCost(p, k) }));
      if (D) ks.forEach((k, i) => ks.slice(i + 1).forEach(k2 => { if (D.adjacent && !G.altarAdj(k, k2)) return; opts.push({ value: k + '+' + k2, label: `${jp(k)}＋${jp(k2)} → 祝福+${vgs[n0] || 0}＋${vgs[n0 + 1] || 0}`, disabled: p[k] < G.altarHalfCost(p, k) || p[k2] < G.altarHalfCost(p, k2) }); }));
      opts.forEach(o => { if (o.disabled) o.label += '（足りません）'; }); const best = opts.slice().reverse().find(o => !o.disabled);
      const talA = (v) => { const [a1, a2] = String(v.res).split('+'); return Object.assign({ pid: p.id, type: 'tributeSlot', slot: id, res: a1 }, a2 ? { res2: a2 } : {}); };
      const r = await ask('祭壇の恩寵：祭壇の手を 1 回・半額で', [{ type: 'select', name: 'res', label: '払い口', value: (best || opts[0]).value, options: opts }], { note: G.slotTip(st, id), act: talA }); if (!r) return; const [k1, k2] = String(r.res).split('+');
      return submit(Object.assign({ pid: p.id, type: 'tributeSlot', slot: id, res: k1 }, k2 ? { res2: k2 } : {})); }
    if (id === 'TAL') { const ks = G.ALTAR_KEYS.filter(k => G.altarHalfCost(p, k) !== null); if (!ks.length) return toast('まだ払っていない払い口がありません', true); const nth = G.altarCount(p) + 1; const vg = (G.RULESETS[st.rules || 'v1'].altar.vg || [])[nth - 1] || 0; // T32（O-47）祭壇の恩寵
      const r = await ask('祭壇の恩寵：払い口 1 つを半額で', [{ type: 'select', name: 'res', label: '払い口', value: ks.find(k => p[k] >= G.altarHalfCost(p, k)) || ks[0], options: ks.map(k => ({ value: k, label: `${G.ALTAR_JP[k]} ${G.altarHalfCost(p, k)}${p[k] < G.altarHalfCost(p, k) ? '（足りません）' : ''}`, disabled: p[k] < G.altarHalfCost(p, k) })) }], { note: `${nth} 個目の祝福+${vg}`, act: v => ({ pid: p.id, type: 'tributeSlot', slot: id, res: v.res }) }); if (!r) return;
      return submit({ pid: p.id, type: 'tributeSlot', slot: id, res: r.res }); }
    if (id === 'TST') { const lv = (p.star | 0) + 1; if (!G.starOn(st) || lv > G.STAR_MAX) return toast(`${G.STAR_NAME}は最上段です`, true); const c = G.starCost(st, lv); const RJ = k => k === 'coop' ? '協調' : k === 'L' ? '生命核' : k; const ks = Object.keys(c); // T49（O-91）星の恩寵
      const fields = [{ type: 'select', name: 'res', label: `払う 1 種（${G.starLvText(st, lv)} の${G.STAR_CARD_NAME} ${G.starCostText(c)} のうち）`, value: ks.find(k => p[k] >= c[k]) || ks[0], options: ks.map(k => ({ value: k, label: `${RJ(k)}${c[k]}${p[k] < c[k] ? '（足りません）' : ''}`, disabled: p[k] < c[k] })) }];
      if (G.starProsOk(st, p, lv)) fields.push({ type: 'select', name: 'f', label: `${G.starLvText(st, lv)} の先駆`, options: [{ value: 'gem', label: `痕跡+${G.starFirstGem(st, lv)}` }, { value: 'pros', label: `痕跡+${G.starFirstDef(st, lv).pros}・繁栄度+1（×${G.coefB(p)}→×${G.coefB(p) + 1}）` }] });
      const r = await ask(`星の恩寵：${G.STAR_NAME} ${G.starLvText(st, lv - 1)}→${G.starLvText(st, lv)}`, fields, { note: G.slotTip(st, id), act: v => ({ pid: p.id, type: 'tributeSlot', slot: id, res: v.res, pros: v.f === 'pros' ? [lv] : undefined }) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, res: r.res, pros: r.f === 'pros' ? [lv] : undefined }); }
    if (id === 'TCU') { const RC = G.RULESETS[st.rules || 'v1'].tribute.slots.TCU; const ks = ['MB', 'MI', 'MS', 'MM']; const ko = ks.map(k => ({ value: k, label: G.SLOT_BY_ID[k].name + '：' + G.slotText(st, k) })); const RM = G.RULESETS[st.rules || 'v1']; // T49（O-91）淘汰の恩寵
      const r = await ask(`淘汰の恩寵：P${RC.P || 100} で異なる淘汰 ${RC.n || 2} 種`, [{ type: 'select', name: 'k1', label: '1 種目', value: 'MS', options: ko }, { type: 'select', name: 'k2', label: '2 種目', value: 'MM', options: ko }, { type: 'multi', name: 'traits', label: `（淘汰(知性)を選んだとき）G${RM.miMaxCost || 4} 以下の形質`, options: miOpts(p, G.traitSortView(st, G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RM.miMaxCost || 4) && !G.trait(p, t)))), when: v => v.k1 === 'MI' || v.k2 === 'MI' }], { note: G.slotTip(st, id) }); if (!r) return;
      if (r.k1 === r.k2) return toast('別々の淘汰を選んでください', true); const mp = (r.k1 === 'MI' || r.k2 === 'MI') ? miParse(r.traits) : { traits: [], weak: [] }; if (!mp) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, kinds: [r.k1, r.k2], traits: mp.traits, weak: mp.weak }); }
    if (id === 'TLF') return await okAsk(`命の恩寵：${G.slotText(st, id)}。実行しますか？`, null, { pid: p.id, type: 'tributeSlot', slot: id }) && submit({ pid: p.id, type: 'tributeSlot', slot: id });
    if (id === 'TBR' && (G.RULESETS[st.rules || 'v1'].breedTrib || {}).normal) { const R0 = G.RULESETS[st.rules || 'v1']; const cL = G.breedHalfCost(p, 'L'); if (G.breedHalfCost(p, 'P') === null) return toast('繁殖は上限です', true); const left = G.breedLeft(p), mx = G.breedTribMax(p); // T38（O-67）：通常の繁殖と同じ形（強の持ち主は 2 段ずつ選べる・額は 2/3 後）
      const opP = [{ value: '0', label: 'なし' }]; for (let k = 1; k <= Math.min(mx, left); k++) { const c = G.breedTribP(p, k); opP.push({ value: String(k), label: `${k} 段（P${c}）`, disabled: p.P < c }); }
      const opL = [{ value: '0', label: 'なし' }]; if (cL !== null) for (let k = 1; k <= Math.min(mx, left); k++) opL.push({ value: String(k), label: `${k} 段（生命核${cL * k}）`, disabled: p.L < cL * k });
      const dP = opP.filter(o => o.value !== '0' && !o.disabled).length, dL = Math.max(0, Math.min(opL.filter(o => o.value !== '0' && !o.disabled).length, left - dP));
      const r = await ask(`繁殖の恩寵：繁殖を${G.breedTribJp(R0)}${/\d$/.test(G.breedTribJp(R0)) ? ' ' : ''}で（あと ${left} 段）`, [{ type: 'select', name: 'nP', label: '個体数で', value: String(dP || (dL ? 0 : 1)), options: opP }].concat(cL !== null ? [{ type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: String(dL), options: opL }] : []), { act: v => ({ pid: p.id, type: 'tributeSlot', slot: id, nP: +v.nP, nL: +(v.nL || 0) }), note: (() => { const mb = (p.traits || []).find(t => t.id === 'MB'); if (!mb) return G.slotTip(st, 'TBR'); const c1 = G.breedTribP(p, 1), c0 = G.breedTribCost(R0, 'P', p.breed); const ex = [mx > 1 ? `P の段・生命核の段それぞれ ${mx} 段まで` : '', c1 !== c0 ? `P の 1 段は P${c1}（割引後の ${G.breedTribJp(R0).replace(/^額の /, '')}）` : ''].filter(Boolean).join('・'); return ex ? [G.slotTip(st, 'TBR'), h('br'), `増殖暴走の${mb.strong ? '強' : '弱'}：${ex}`] : G.slotTip(st, 'TBR'); })() }); // O-75（2026-11-20 ユーザー）：増殖暴走の例外は持ち主だけ 1 行
      if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, nP: +r.nP, nL: +(r.nL || 0) }); }
    if (id === 'TBR' && (G.RULESETS[st.rules || 'v1'].breedTrib || {}).both) { const R0 = G.RULESETS[st.rules || 'v1']; const cP = G.breedHalfCost(p, 'P'), cL = G.breedHalfCost(p, 'L'); if (cP === null) return toast('繁殖は上限です', true); const left = G.breedLeft(p); // T37（O-65）：通常の繁殖と同じ形（P の段・生命核の段を別々に）
      const r = await ask(`繁殖の恩寵：繁殖を${G.breedTribJp(R0)}${/\d$/.test(G.breedTribJp(R0)) ? ' ' : ''}で（あと ${left} 段）`, [{ type: 'select', name: 'nP', label: '個体数で', value: p.P >= cP ? '1' : '0', options: [{ value: '0', label: 'なし' }, { value: '1', label: `1 段（P${cP}）`, disabled: p.P < cP }] }].concat(cL !== null ? [{ type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: p.L >= cL && (p.P < cP || left >= 2) ? '1' : '0', options: [{ value: '0', label: 'なし' }, { value: '1', label: `1 段（生命核${cL}）`, disabled: p.L < cL }] }] : []), { note: `${G.slotTip(st, id)}${left < 2 ? '（あと 1 段なので片方だけ）' : ''}` }); if (!r) return;
      return submit({ pid: p.id, type: 'tributeSlot', slot: id, nP: +r.nP, nL: +(r.nL || 0) }); }
    if (id === 'TBR') { const cP = G.breedHalfCost(p, 'P'), cL = G.breedHalfCost(p, 'L'); if (cP === null) return toast('繁殖は上限です', true); const opts = [{ value: 'P', label: `P${cP}`, disabled: p.P < cP }].concat(cL !== null ? [{ value: 'L', label: `生命核${cL}`, disabled: p.L < cL }] : []);
      const r = await ask('繁殖の恩寵：繁殖 1 段を半額で', [{ type: 'select', name: 'pay', label: '払い', value: (opts.find(o => !o.disabled) || opts[0]).value, options: opts }], { note: G.slotTip(st, id), act: v => ({ pid: p.id, type: 'tributeSlot', slot: id, pay: v.pay }) }); if (!r) return;
      return submit({ pid: p.id, type: 'tributeSlot', slot: id, pay: r.pay }); }
    if (id === 'TJ') { const ok = G.TRACKS.filter(t => G.stepCost(p, t) !== null); const s0 = p.star | 0; const starOk = G.starOn(st) && s0 < G.STAR_MAX; if (!ok.length && !starOk) return toast('進められるトラックがありません', true); const opt = ok.map(t => ({ value: t, label: `${G.TRACK_INFO[t].name}（Lv${p.lv[t]}→${p.lv[t] + 1}・${p.lv[t] === 5 && G.lv6CostText(st, t) ? G.lv6CostText(st, t) + ((G.lv6PayDef(st, t) || {}).E ? '〔割引は E の分だけ〕' : '〔割引なし〕') : 'E' + G.stepCost(p, t)}）` })); if (starOk) opt.push({ value: 'star', label: `${G.STAR_NAME}（${G.RULESETS[st.rules || 'v1'].star.lv1 ? `${G.starLvText(st, s0)}→${G.starLvText(st, s0 + 1)}` : `${s0}→${s0 + 1} 段目`}・${G.starCostText(G.starCost(st, s0 + 1))}${s0 + 2 <= G.STAR_MAX ? `／2 回目なら ${G.starCostText(G.starCost(st, s0 + 2))}` : ''}${G.starCost(st, s0 + 1).E ? '' : '〔割引は E の分だけ〕'}）` }); /* T25（O-23）：星海も跳躍の対象 */ const FL = starOk ? Object.keys(G.RULESETS[st.rules || 'v1'].star.first || {}).map(Number) : []; const proF = FL.filter(lv => lv > s0 && lv <= s0 + 2 && G.starProsOk(st, p, lv)).map(lv => ({ type: 'select', name: 'f' + lv, label: `${G.STAR_NAME} ${G.starLvText(st, lv)}${G.RULESETS[st.rules || 'v1'].star.lv1 ? ' ' : ''}の先駆（着いたとき）`, options: [{ value: 'gem', label: `痕跡+${G.starFirstGem(st, lv)}` }, { value: 'pros', label: `痕跡+${G.starFirstDef(st, lv).pros}・繁栄度+1` }], when: v => [v.t1, v.t2].filter(t => t === 'star').length >= lv - s0 })); /* 2026-11-06 ユーザー指摘（T10-H3）：Lv5→6 を E63 と表示していた（実際の支払いは色別＝G42／協調8／L5／E90。stepCost は E 換算の目安） */ const r = await ask('進化の恩寵：進化2回（ワーカー必須）', [{ type: 'select', name: 't1', label: '1回目', options: opt }, { type: 'select', name: 't2', label: '2回目（同じでも可・同じなら次の段の値段）', options: opt }, { type: 'select', name: 'useL', label: '生命核をEの代わりに（1回目）', options: lOpts(p) }].concat(proF), { note: G.slotTip(st, id) }); if (!r) return; const ns = [r.t1, r.t2].filter(t => t === 'star').length; if (s0 + ns > G.STAR_MAX) return toast(`${G.STAR_NAME}は ${G.starLvText(st, G.STAR_MAX)}${G.RULESETS[st.rules || 'v1'].star.lv1 ? ' ' : ''}までです`, true); const pros = FL.filter(lv => lv > s0 && lv <= s0 + ns && r['f' + lv] === 'pros'); return submit({ pid: p.id, type: 'tributeSlot', slot: id, tracks: [r.t1, r.t2], useL: +r.useL, pros: pros.length ? pros : undefined }); }
    if (id === 'TR') { const r = await ask('恩寵枠（宝石）：痕跡+1', [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }], { note: G.slotText(st, id) }); if (!r) return; return submit({ pid: p.id, type: 'tributeSlot', slot: id, track: r.track }); }
    if (id === 'MIM') { const o = G.mimicOptions(st, p); if (!o.length) return toast('模倣できる !効果にまだ誰も到達していません（身体Lv2 の ◆L+1 は対象外）', true); const c = G.gSlotCost(p, G.RULESETS[st.rules || 'v1'].mimicCost || 4); const r = await ask(`模倣（G${c}）`, [{ type: 'select', name: 'effect', label: '到達済みの即時効果', options: o.map(e => ({ value: e.id, label: rtxt(e.label) })) }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }]); if (!r) return; return submit({ pid: p.id, type: 'mimic', effect: r.effect, useL: +r.useL }); }
    if (id === 'EXP') { const c = G.gSlotCost(p, G.RULESETS[st.rules || 'v1'].expressCost || 10); const bcE = G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass'); const byCE = G.slotUsedBy(st, id) !== undefined && G.coopBypassable(st, id, p) && p.coop >= bcE; const r = await ask(`発現（G${c}）：痕跡+1${byCE ? `／使用済みのため協調進出（協調-${bcE}）で実行` : ''}`, (G.RULESETS[st.rules || 'v1'].noCombo ? [] : [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }]).concat([{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }])); if (!r) return; return submit({ pid: p.id, type: 'express', track: r.track || 'body', useL: +r.useL, bypassCoop: byCE }); } /* 2026-10-29 色の廃止：色の選択なし */
    if (id === 'SCAN') { const cands = G.scanCandidates(st, p); if (!cands.length) return toast('参照できる他プレイヤーがいません（全員Lv1）', true); const scanE = Math.max(G.sc(st, 1), G.sc(st, 5) - (p.scanDisc || 0)); const scanN = (c) => (G.TRACK_INFO[c.track].res === 'coop' && G.RULESETS[st.rules || 'v1'].scanCoop !== undefined) ? G.RULESETS[st.rules || 'v1'].scanCoop : c.lv * G.sc(st, 2); const r = await ask(`探索（E${scanE}）`, [{ type: 'select', name: 'tgt', label: '参照先', options: cands.map((c, i) => ({ value: i, label: `${st.players[c.pid].name} の ${G.TRACK_INFO[c.track].name} Lv${c.lv} → ${RES_JP[G.TRACK_INFO[c.track].res]}+${scanN(c)}` })) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }]); if (!r) return; return submit({ pid: p.id, type: 'scan', target: cands[+r.tgt], useL: +r.useL }); } // 2026-11-05 ユーザー指摘：E5・Lv×2 と基準単位のままだった（実際は E15・Lv×6）
    if (id === 'ADP') { const lows = G.TRACKS.filter(t => p.lv[t] === 1); if (!lows.length) return toast('Lv1のトラックがありません', true); const r = await ask('適応進化（生命核1・ワーカー必須）', [{ type: 'select', name: 'track', label: 'Lv1のトラック', options: lows.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }]); if (!r) return; return submit({ pid: p.id, type: 'adapt', track: r.track }); }
    if (id === 'CNV') { const r = await ask('資源変換（1アクション1種類）', [{ type: 'select', name: 'kind', label: '変換', options: [{ value: 'EG', label: `E${G.sc(st, 2)}→G${G.sc(st, 1)}` }, { value: 'GE', label: `G${G.sc(st, 2)}→E${G.sc(st, 1)}` }, { value: 'PE', label: `P${G.sc(st, 8)}→E${G.sc(st, 3)}` }, { value: 'PG', label: `P${G.sc(st, 8)}→G${G.sc(st, 2)}` }] }, { type: 'number', name: 'n', label: '回数', value: 1, min: 1, max: 20 }]); if (!r) return; return submit({ pid: p.id, type: 'convert', kind: r.kind, n: r.n }); }
    if (id === 'RST') { const c = restoreCands(p); if (!c.length) return toast('復元できる形質がありません（他の人が強で取った形質で、自分が持っていないもの）', true); const RT = G.RULESETS[st.rules || 'v1'];
      const opts = G.traitSortView(st, c).map(t => { const tw = (RT.traitCosts || {})[t] || G.TRAITS[t].cost; const g = G.traitCost(st, p, t, 0, true).G + Math.max(0, tw[0] - tw[1]); return { value: t, label: `${t} ${G.TRAITS[t].name}（G${g}＋E${RT.restore.E}）：${rtxt(G.traitText(st, t, true))}` }; });
      const r = await ask('復元：取られた強の形質を強の効果で取る（1人1回）', [{ type: 'select', name: 'trait', label: '形質', options: opts }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: G.slotTip(st, id) }); if (!r) return;
      return submit({ pid: p.id, type: 'restore', trait: r.trait, useL: +(r.useL || 0), res: 'E', track: 'intel' }); }
    if (id === 'BST') return openBurst(p); // T14 一気立て（O-57：器官の場の順番待ちのカードからも開く）
    if (id === 'AMP') { const c = amplifyCands(p); if (!c.length) return toast(`増幅できる器官がありません（${G.ampTargetText(st)}で未増幅のもの）`, true); const AM = G.RULESETS[st.rules || 'v1'].amplify;
      const r = await ask(`増幅（E${G.ampE(p)}・1人1回）：器官1つの効果を以後2倍`, [{ type: 'select', name: 'organ', label: '器官', options: c.map(o => ({ value: o, label: `${o} ${G.ORGANS[o].name}：${otxt(o, true)}` })) }], { note: G.slotTip(st, id) + '。まだ形成していない器官は、形成のダイアログで「形成と同時に増幅」を選べます（手番は形成の1つだけ）。' }); if (!r) return;
      return submit({ pid: p.id, type: 'amplify', organ: r.organ }); }
    if (id === 'PASS') { if (!await okAsk('パスします（何も得ず、ワーカーを1個使います）。置ける場所が無いときだけ使ってください。')) return; return submit({ pid: p.id, type: 'pass' }); }
    if (id === 'GTH') { const g = G.RULESETS[st.rules || 'v1'].gather || {}; const r = await ask('採集（弱い資源・手番1つ）', [{ type: 'select', name: 'res', label: '得るもの', options: [{ value: 'E', label: `エネルギー +${g.E}` }, { value: 'G', label: `遺伝子 +${g.G}` }, { value: 'P', label: `個体数 +${g.P}` }, { value: 'coop', label: `協調 +${g.coop}（P${g.coopCostP || 0} を払う）`, disabled: p.P < (g.coopCostP || 0) }] }], { note: '他に置ける場所が無いときの逃げ道です。資源枠より少ない量しか得られません（協調は群体枠と同じ P を払い、資源は付きません）。' }); if (!r) return; return submit({ pid: p.id, type: 'gather', res: r.res }); }
    if (id === 'RSV') { const RV = G.RULESETS[st.rules || 'v1']; const r = await ask('予備動員（無料）', [{ type: 'select', name: 'res', label: '獲得', options: [{ value: 'E', label: `E+${RV.reserveE || 2}` }, { value: 'G', label: `G+${RV.reserveG || 1}` }] }]); if (!r) return; return submit({ pid: p.id, type: 'reserve', res: r.res }); }
  }
  // O-97：急速形成で形成する器官を 1 枚ずつ（名前・この手で払う額・効果＝記号の行＋全文）
  function burstList(p, val) { if (!val) return null; const seq = val.split(','), k = burstCost(p, seq), R = G.RULESETS[st.rules || 'v1'], fd = !!R.burstFirstDiff, same = !!R.organSameEffect;
    const box = h('div', { class: 'burstlist' }); seq.forEach((id, i) => { const o = G.ORGANS[id], c = k.cs[id]; const strong = c ? c.strong : true; const tx = otxt(id, same ? true : strong); const ls = fxOn() && G.FX.lines(st, 'organ', id);
      box.appendChild(h('div', { class: 'bitem' }, h('div', { class: 'bhd' }, h('b', null, `${i + 1}. ${id} ${o.name}`), ' ', icost(k.each[id] || ''), c && c.diff && fd && !i ? h('small', null, '（差額）') : null, same ? null : h('small', null, strong ? '（強）' : '（弱）')), ls ? G.FX.render(ls, tx) : null, h('small', { class: 'btx' }, tx))); });
    box.appendChild(h('div', { class: 'bsum' }, '合計 ', icost(`E${k.e}${k.g ? '+G' + k.g : ''}`))); return box; }
  // O-97：形成する中に好きな資源を選ぶ器官があるときだけ、実行の後に資源を選ぶ（E／G／P で結果が変わるかを試して決める）。null＝キャンセル
  async function burstResAsk(p, seq, uL) { const R = G.RULESETS[st.rules || 'v1']; const tr = (x, n) => { try { return G.tryApply(st, { pid: p.id, type: 'burst', organs: seq, useL: n, liRes: x }).players[p.id]; } catch (e) { return null; } }; let res = {}; for (let n = uL; n <= p.L; n++) { res = {}; ['E', 'G', 'P'].forEach(x => { const q = tr(x, n); if (q) res[x] = q; }); if (Object.keys(res).length === 3) break; } /* 生命核の数をそろえて比べる（足りない資源の選び方は外す） */
    const ks = Object.keys(res); if (ks.length < 2) return 'E'; const amt = (x) => { const y = ks.find(z => z !== x); return res[x][x] - res[y][x]; }; if (!ks.some(x => amt(x) > 0)) return 'E';
    const who = seq.filter(id => G.ORGANS[id].lin === 'Li' && (R.organFx !== 2 || (R.liRes || [])[G.ORGANS[id].tier - 1])).concat(R.organFx !== 2 ? ['Li2', 'Li3'].filter(id => G.organ(p, id)) : []);
    const r = await ask(who.length ? who.map(id => G.ORGANS[id].name).join('・') + 'の資源' : '資源を選ぶ', [{ type: 'select', name: 'liRes', label: '資源', value: 'E', options: ks.map(x => ({ value: x, label: `${x}+${amt(x)}` })) }]); return r ? r.liRes : null; }
  // 急速形成のダイアログ（急速形成の枠／O-57 2026-11-18：器官の場の順番待ちのカード＝pre はそのカードで終わる並びを選んだ状態で開く）
  async function openBurst(p, pre) { const cs = burstCands(p); if (!cs.length) return toast('急速形成できる系統がありません（同じ系統で続けて形成できる器官が 2 枚以上ない）', true);
      const r = await ask('急速形成（ワーカー 1）', [{ type: 'select', name: 'seq', label: '形成する器官', descEl: v => burstList(p, v.seq), value: pre ? (cs.find(q => q[q.length - 1] === pre) || []).join(',') : undefined, options: cs.map(seq => { const k = burstCost(p, seq); return { value: seq.join(','), label: `${G.LINEAGES[G.ORGANS[seq[0]].lin]}：${seq.map(id => `${id} ${G.ORGANS[id].name} ${k.each[id] || ''}`).join(' → ')}（計 E${k.e}+G${k.g}）`, disabled: p.E + p.L * (p.lValue || G.sc(st, 3)) < k.e || p.G < k.g }; }) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }], { cls: 'burstmodal', note: G.noLateTxt(st, `同じ系統の器官を 2〜${(G.RULESETS[st.rules || 'v1'].burst || {}).max || 3} 枚、形態の順に続けて形成。各器官の値段と追随の代償を払い、形成時の効果はそれぞれ発動`) }); if (!r) return; /* O-97：冒頭の文を短く・1 枚ずつの額と効果は下の一覧に・「連結の資源」は要るときだけ実行の後に */
      { const seq = r.seq.split(','), k = burstCost(p, seq), lv = p.lValue || G.sc(st, 3); let uL = +(r.useL || 0); const liRes = await burstResAsk(p, seq, uL); if (liRes === null) return openBurst(p, seq[seq.length - 1]); r.liRes = liRes; // 2026-11-09 ユーザー指摘：E が足りないとき 1 枚ぶんの不足が出ていた → 合計で判定し、生命核で足りるなら確認して使う（建造時に得る E も含めて試す）
        const tryL = (n) => { try { G.tryApply(st, { pid: p.id, type: 'burst', organs: seq, useL: n, liRes: r.liRes }); return true; } catch (e) { return false; } };
        if (!tryL(uL)) { let n = uL + 1; while (n <= p.L && !tryL(n)) n++; if (n <= p.L) { if (!await okAsk(`急速形成は合計 E${k.e}+G${k.g}${G.RULESETS[st.rules || 'v1'].burstFirstDiff ? '' : '（定価）'}。E が足りないので、生命核を ${n} 個（=E${n * lv}）使います。よろしいですか？`)) return; uL = n; } }
        return submit({ pid: p.id, type: 'burst', organs: seq, useL: uL, liRes: r.liRes }); }
  }
  async function onOrgan(p, id) {
    const c = G.organCost(st, p, id); if (!c) return toast('今は形成できません（系統内は形態の順・形成済み）', true);
    const fields = [{ type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }];
    if (p.altFuel) fields.push({ type: 'select', name: 'payP', label: '代替燃料（EをPで払う）', options: [{ value: '', label: `Eで払う（E${c.E}）` }, { value: 'P', label: `Pで払う（P${G.altFuelP(p, c.E)}）${p.P < G.altFuelP(p, c.E) ? '・P不足' : ''}` }] }); // 第42部 N5
    { const R2 = G.RULESETS[st.rules || 'v1']; if (R2.organFx === 2) { if (G.ORGANS[id].lin === 'Li' && (R2.liRes || [])[G.ORGANS[id].tier - 1]) fields.push(resSel('li2Res', R2.liMode === 'lineage' ? (G.ORGANS[id].tier === 3 ? `${G.ORGANS[id].name}の資源（完成した系統 ${st.shared.lineages.filter(l => G.lineageDone(p, l)).length + 1}×${(R2.liPer || [])[2]}）` : `${G.ORGANS[id].name}の資源（+${(R2.liPer || [])[G.ORGANS[id].tier - 1]}）`) : `${G.ORGANS[id].name}の資源（器官 ${Math.min(R2.liCap || 99, p.organs.length + 1)} 枚×${(R2.liPer || [])[G.ORGANS[id].tier - 1]}）`)); } // T18：連結核＝完成した系統の数（この形成で連結が完成する分 +1） // T13 連結＝建造時に枚数ぶん
      else { if (G.organ(p, 'Li2')) fields.push(resSel('li2Res', '連結網の資源'));
        if (G.organ(p, 'Li3') && G.lineageCount(p, G.ORGANS[id].lin) === 2) fields.push(resSel('li3Res', '連結核の資源（系統完成）')); } }
    const lins = new Set(p.organs.map(o => G.ORGANS[o.id].lin)); lins.add(G.ORGANS[id].lin); if (lins.size >= 4 && !p.regime) fields.push(resSel('regimeRes', '4 系統そろえた収入+1の資源'));
    { const AM = G.RULESETS[st.rules || 'v1'].amplify; if (AM && !(p.uses && p.uses.amplify) && !p.ampReserve && G.ampOk(st, id, false)) fields.push({ type: 'select', name: 'amp', label: '形成と同時に増幅', options: [{ value: '', label: 'しない' }, { value: '1', label: `する（+E${G.ampE(p)}・1人1回・この器官の効果が以後2倍）`, disabled: p.E < c.E + G.ampE(p) }] }); } // v3.66
    const incTxt = (() => { { const RI = G.RULESETS[st.rules || 'v1']; if (!RI.incNow || RI.noIncNowOrg) return ''; } const q = G.clone(p); q.organs.push({ id, strong: c.strong }); const v = G.income(q).by[G.ORGANS[id].lin === 'Fk' ? 'org:Fk' : 'org:' + id]; return v ? `形成時に収入 1 回：${[v.E ? 'E+' + v.E : '', v.G ? 'G+' + v.G : '', v.P ? 'P+' + v.P : '', v.coop ? '協調+' + v.coop : ''].filter(Boolean).join(' ')}。` : ''; })(); // T19（O-13 #3）の見込み
    const r = await ask(`器官形成 ${id} ${G.ORGANS[id].name}`, fields, { act: v => ({ pid: p.id, type: 'organ', organ: id, useL: v.payP === 'P' ? 0 : +v.useL, payP: v.payP === 'P', amp: v.amp === '1', li2Res: v.li2Res, li3Res: v.li3Res, regimeRes: v.regimeRes }), note: incTxt + `${c.diff ? `差額 E${c.E} G${c.G}（定価 E${c.list.E}+G${c.list.G} − 前の段 E${c.diff.E}+G${c.diff.G}${c.first || G.RULESETS[st.rules || 'v1'].organLateFee === 0 ? '' : '・追随の代償込み'}）` : `コスト E${c.E}${c.G ? '+G' + c.G : ''}`}${G.RULESETS[st.rules || 'v1'].organSameEffect ? (G.RULESETS[st.rules || 'v1'].organLateFee === 0 ? '' : c.first ? '（先駆）' : '（代償）') : (c.strong ? '（強）' : '（弱）')}：${otxt(id, c.strong)}` }); if (!r) return;
    submit({ pid: p.id, type: 'organ', organ: id, useL: r.payP === 'P' ? 0 : +r.useL, payP: r.payP === 'P', amp: r.amp === '1', li2Res: r.li2Res, li3Res: r.li3Res, regimeRes: r.regimeRes });
  }
  // 使用済み枠の突破手段（緊急発進＝L1／協調発進＝協調2・拡張x1）。手段が無ければ null
  function bypassField(p) {
    const o = [...(p.mimic && !p.round.mimicUsed && !(p.round && p.round.boostLock && G.RULESETS[st.rules || 'v1'].nmMul) ? [{ value: 'mimic', label: (p.mimic !== 'free' ? `擬態（E${G.mimicCostE(p)}）` : '擬態（無償）') + (G.RULESETS[st.rules || 'v1'].nmMul ? `・獲得量${G.RULESETS[st.rules || 'v1'].nmMul}倍` : '') }] : []), ...(p.L > 0 && !G.RULESETS[st.rules || 'v1'].launchFree && !(p.round && p.round.boostLock) ? [{ value: 'L', label: '緊急進出（生命核-1）' }] : []), ...(st.ext === 'x1' && !(p.round && p.round.boostLock) && p.coop >= G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass') ? [{ value: 'coop', label: `協調進出（協調-${G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass')}）` }] : [])];
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
    if (p.coop >= G.coopCost(p, G.RULESETS[st.rules || 'v1'].bypassCoopCost || 2, 'bypass')) return { slot: 'TRT', bypassCoop: true };
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
      const from = id; const targets = G.traitSortView(st, G.TRAIT_ORDER.filter(t => !G.trait(p, t) && G.TRAITS[t].cost[0] > G.TRAITS[from].cost[0]));
      if (!targets.length) return toast('強化先がありません', true);
      const r = await ask(`形質強化：${from} を手放して上位へ`, [{ type: 'select', name: 'to', label: '上位形質', options: targets.map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（表示G${G.TRAITS[t].cost[0]}/${G.TRAITS[t].cost[1]}）` })), desc: traitDesc(p, 'to') }, ...traitSlotFields(p), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel('to'), daSel('to')], { note: 'コスト＝表示コストの差額＋G1（下限G1）。即時効果の形質は手放せません' }); if (!r) return;
      return submit(Object.assign({ pid: p.id, type: 'upgrade', from, to: r.to, useL: +r.useL, res: r.res, track: r.track }, slotArgs(r)));
    }
    const c = G.traitCost(st, p, id); const cw = G.traitCost(st, p, id, undefined, true); const choice = G.RULESETS[st.rules || 'v1'].traitChoice && c.strong;
    const r = await ask(`形質獲得 ${id} ${G.TRAITS[id].name}`, [...(choice ? [{ type: 'select', name: 'ver', label: '版', options: [{ value: 'S', label: `強（G${c.G}）：${rtxt(G.traitText(st, id, true))}` }, { value: 'W', label: `弱（G${cw.G}）：${rtxt(G.traitText(st, id, false))}` }] }] : []), ...traitSlotFields(p), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, ...(id === 'IM' ? [imSel()] : []), ...(id === 'DA' ? [daSel()] : [])], { note: `コスト G${c.G}（${c.strong ? '強' : '弱'}）：${rtxt(G.traitText(st, id, c.strong))}`, act: v => Object.assign({ pid: p.id, type: 'trait', trait: id, useL: +v.useL, res: v.res, track: v.track, weak: choice && v.ver === 'W' }, slotArgs(v)) }); if (!r) return; // 2026-11-05 v3.63：購入ダイアログの弱の文言も G.traitText（T10 の新効果が旧文のままだった）
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
  // O-40：ローカル・自由のときは、選択のダイアログにも「1手戻す」を出す（押すとダイアログを閉じ、その選択のもとになった自分の手の前まで戻る）
  const UNDO_REQ = { undo: true }; let inPending = false;
  const wholeUndo = () => !isOnline() && !!game && (game.meta || {}).undoMode !== 'approve';
  const dlgUndo = () => !!game && (((isOnline() ? Net.meta : game.meta) || {}).undoMode) !== 'approve'; // v3.157：選択のダイアログの「1手戻す」はオンラインでもアンドゥ自由なら出す（承認モードは今のまま）
  const undoEntry = () => wholeUndo() ? { type: 'undo', pids: myHumanPids(), whole: true } : { type: 'undo', pids: myHumanPids() };
  async function handlePending(p, pd) {
    if (pendingBusy) return; pendingBusy = true; let undone = false;
    try { inPending = true; await handlePendingBody(p, pd); } catch (e) { if (e !== UNDO_REQ) { toast('選択の画面を出せませんでした：' + e.message, true); throw e; } undone = true; } finally { pendingBusy = false; inPending = false; } // O-95：選択の画面の不具合を黙って止めない
    if (undone) { await submit({ type: 'undo', pids: myHumanPids(), whole: true }); return; } /* ダイアログからは選択のもとになった手とまとめて戻す（オンラインも同じ） */ // 送信の完了（await）まで待ってから解放する（return submit(...) だと finally が先に走る）
    // 送信中の再描画は pendingBusy で弾かれるため、次の保留が残っていればここで描画し直して続きのダイアログを出す
    const q = st && st.players[p.id]; if (q && q.pending.length && st.phase === 'play' && G.cur(st).id === q.id) setTimeout(render, 0);
  }
  async function handlePendingBody(p, pd) {
    {
      if (pd.type === 'flSwap') {
        const r = await ask(`収入時の転流：E↔Gを最大${pd.max}振替（1:1）`, [{ type: 'select', name: 'dir', label: '方向', options: [{ value: 'EG', label: 'E→G' }, { value: 'GE', label: 'G→E' }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: pd.max }], { skipLabel: '振替しない', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', dir: r.dir, n: r.n });
      }
      if (pd.type === 'flip') { // O-37（T30）：知性 Lv3★ 弱（1 枚）／Lv5★ 弱（2 枚まで）／Lv5★ 強（好きなだけ）で弱の形質を強に裏返す。裏返さない 1 枚につき G+pd.g（好きなだけの段は G なし）
        const ids = G.flippable(p); const src = { '3w': '知性 Lv3★ 弱', '5w': '知性 Lv5★ 弱', '5s': '知性 Lv5★ 強' }[pd.src] || '知性'; const all = pd.n >= 99;
        const fx = (t) => `弱：${rtxt(G.traitText(st, t, false))} → 強：${rtxt(G.traitText(st, t, true))}`; const R30 = G.RULESETS[st.rules || 'v1']; const lab = (t) => `${t} ${G.TRAITS[t].name}` + (t === 'MC' && R30.mcMode === 'freeOnce' && !R30.mcStrongPerm ? `（毎回 P−${R30.mcDiscWeak !== undefined ? R30.mcDiscWeak : R30.mcDisc} → 次の 1 回だけ無料）` : ''); /* O-42：耐性は裏返すと恒久の割引が消える */ const gTxt = (k) => !all && pd.g && k > 0 ? `G+${k * pd.g}` : ''; // O-95：gTxt の定義が行末のコメントに入っていて、1 枚の裏返し（知性 Lv3★ 弱）の選択が ReferenceError で出なかった
        const note = `${all ? '持っている弱の形質を好きなだけ' : `弱の形質を ${pd.n} 枚まで`}強に裏返す。${all || !pd.g ? '' : `裏返さない 1 枚につき G+${pd.g}。`}群居・長命・星渡は対象外。得たときの資源・痕跡は受け取り直さない`;
        if (pd.n === 1) { const r = await ask(`${src}：弱の形質を強に裏返す`, [{ type: 'select', name: 't', label: '形質', options: ids.map(t => ({ value: t, label: lab(t) })).concat([{ value: '', label: `裏返さない（${gTxt(1) || 'なし'}）` }]), desc: v => v.t ? fx(v.t) : '' }], { noCancel: true, note }); if (!r) return; return submit({ pid: p.id, type: 'resolve', traits: r.t ? [r.t] : [] }); }
        for (;;) { const r = await ask(`${src}：弱の形質を強に裏返す（${all ? '好きなだけ' : pd.n + ' 枚まで'}）`, ids.map(t => ({ type: 'check', name: t, label: lab(t), value: all || ids.length <= pd.n, hint: fx(t) })), { noCancel: true, note, okLabel: '裏返す', maxCheck: all ? 0 : pd.n });
          if (!r) return; const pick = ids.filter(t => r[t]); if (pick.length > pd.n) { toast(`裏返せるのは ${pd.n} 枚までです`, true); continue; }
          return submit({ pid: p.id, type: 'resolve', traits: pick }); }
      }
      if (pd.type === 'dgBuy') {
        const r = await ask(`ラウンド開始時：遺伝記憶で形質1枚を-${pd.disc}Gで獲得`, [traitPickSel(p, pd.disc), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel(pickId), daSel(pickId)], { skipLabel: '買わない', noCancel: true, note: '手番（ワーカー）は消費しません。買っても買わなくても、この後ふつうに行動できます（残りワーカーはヘッダで確認できます）。' }); // 2026-11-05 ユーザーの疑問「手番を消費していた気がする」→ 手番の冒頭に挟まるだけで消費しない旨を明記
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit(Object.assign({ pid: p.id, type: 'resolve', useL: +r.useL, res: r.res, track: r.track }, pickArgs(r)));
      }
      if (pd.type === 'specialOrgan') { const ls = st.shared.special || []; const r = await ask('代謝 Lv4：残っている特殊器官から 1 枚取る（器官 1 枚に数える）', [{ type: 'select', name: 'organ', label: '特殊器官', options: ls.map(o => ({ value: o, label: `${G.ORGANS[o].name}：${G.spText(G.RULESETS[st.rules || 'v1'], o)}` })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', organ: r.organ }); } // T15
      if (pd.type === 'starJump' || pd.type === 'prJump') { const NMJ = pd.type === 'prJump' ? '遊泳核' : G.STAR_JUMP_NAME; const lv = G.starJumpLv(st, p); /* O-76（T42）prJump＝遊泳核（星渡と同じ払い方） */ const os = G.starJumpOpts(st, p); if (!lv || !os.length) return submit({ pid: p.id, type: 'resolve', skip: true }); const c = G.starCost(st, lv); const RJ = r => r === 'coop' ? '協調' : r === 'L' ? '生命核' : r; // T27（O-27）：星渡の片方払い
        const fields = [{ type: 'select', name: 'res', label: `払う 1 種（${G.starLvText(st, lv)} の額 ${G.starCostText(c)} の片方を 1.5 倍）`, options: Object.keys(c).map(r => ({ value: r, label: `${RJ(r)}${G.starJumpCost(st, p, r)}`, disabled: p[r] < G.starJumpCost(st, p, r) })).concat([{ value: 'skip', label: '進めない' }]) }];
        if (G.starProsOk(st, p, lv)) fields.push({ type: 'select', name: 'f', label: `${G.starLvText(st, lv)} の先駆`, options: [{ value: 'gem', label: `痕跡+${G.starFirstGem(st, lv)}` }, { value: 'pros', label: `痕跡+${G.starFirstDef(st, lv).pros}・繁栄度+1（×${G.coefB(p)}→×${G.coefB(p) + 1}）` }], when: v => v.res !== 'skip' });
        const r = await ask(`${NMJ}：${G.STAR_NAME} ${G.starLvText(st, lv - 1)}→${G.starLvText(st, lv)}`, fields, {}); if (!r || r.__skip || r.res === 'skip') return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', res: r.res, pros: r.f === 'pros' ? [lv] : undefined }); }
      if (pd.type === 'prStar') { const R0 = G.RULESETS[st.rules || 'v1']; const s0 = p.star | 0; const LT = lv => G.starLvText(st, lv); const opt = []; [1, 2].forEach(n => { if (s0 + n > G.STAR_MAX || (n > 1 && R0.star.top && s0 + n >= G.STAR_MAX && !G.multiTop(p)) || (n === 2 && !R0.doubleStep)) return; const plan = G.starPlan(st, p, s0, n); const tot = {}; plan.forEach(x => Object.keys(x.c).forEach(k => { tot[k] = (tot[k] || 0) + x.c[k]; })); opt.push({ value: String(n), label: `${n === 2 ? '二段進化：' : ''}${plan.map(x => G.starCostText(x.c)).join('・')}（${LT(s0 + n)} へ）`, disabled: Object.keys(tot).some(k => p[k] < tot[k]) }); }); opt.push({ value: '0', label: '進めない' }); // T27（O-27）：遊泳核
        const fields = [{ type: 'select', name: 'n', label: '進め方（手番なし・額は払う）', options: opt }]; Object.keys(R0.star.first || {}).map(Number).forEach(lv => { if (lv > s0 && lv <= s0 + 2 && G.starProsOk(st, p, lv)) fields.push({ type: 'select', name: 'f' + lv, label: `${LT(lv)} の先駆`, options: [{ value: 'gem', label: `痕跡+${G.starFirstGem(st, lv)}` }, { value: 'pros', label: `痕跡+${G.starFirstDef(st, lv).pros}・繁栄度+1` }], when: v => +v.n >= lv - s0 }); });
        const r = await ask(`${pd.src || '遊泳核'}：${G.STAR_NAME}の進化（手番なし）`, fields, {}); /* O-76（T42）：遊泳腺 */ if (!r || r.__skip || r.n === '0') return submit({ pid: p.id, type: 'resolve', skip: true }); const n = +r.n; const pros = Object.keys(R0.star.first || {}).map(Number).filter(lv => lv > s0 && lv <= s0 + n && r['f' + lv] === 'pros'); return submit({ pid: p.id, type: 'resolve', steps: n, pros: pros.length ? pros : undefined }); }
      if (pd.type === 'fkBreed') { const R0 = G.RULESETS[st.rules || 'v1']; const c = G.breedCost(p); if (c === null) return submit({ pid: p.id, type: 'resolve', skip: true }); const bl = R0.breedL || 0; const mx = G.breedMaxN(p); const left = R0.breed.length - p.breed; // T15 孵化核
        const nOpts = (unit, have, each) => Array.from({ length: Math.min(mx, left) + 1 }, (_, i) => ({ value: String(i), label: i === 0 ? 'なし' : `${i} 段（${unit}${each * i}）`, disabled: have < each * i }));
        const r = await ask('孵化核：繁殖を 1 回、手番なしで（支払いは通常）', [{ type: 'select', name: 'nP', label: '個体数で', value: p.P >= c ? '1' : '0', options: nOpts('P', p.P, c) }].concat(bl ? [{ type: 'select', name: 'nL', label: '生命核で（身体の投入回数に数える）', value: (p.P < c && p.L >= bl) ? '1' : '0', options: nOpts('L', p.L, bl) }] : []), {}); if (!r || r.__skip || (+r.nP + +(r.nL || 0)) === 0) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', nP: +r.nP, nL: +(r.nL || 0) }); }
      if (pd.type === 'freeMass') {
        const r = await ask('身体Lv3★先駆：淘汰を1回無料（排他無視）', [{ type: 'select', name: 'kind', label: '種類', options: ['MB', 'MI', 'MS', 'MM'].map(k => ({ value: k, label: G.SLOT_BY_ID[k].name + '：' + G.SLOT_BY_ID[k].text })) }, { type: 'multi', name: 'traits', label: '（知性のとき）G4以下の形質2種', options: miOpts(p, G.traitSortView(st, G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)))) }], { noCancel: true });
        if (!r) return; const mp = r.kind === 'MI' ? miParse(r.traits) : { traits: [], weak: [] }; if (!mp) return; return submit({ pid: p.id, type: 'resolve', kind: r.kind, traits: mp.traits, weak: mp.weak });
      }
      if (pd.type === 'rewardTrait') {
        if (pd.freeMax) { // T13 転写核：G15 以下の形質 1 枚を無料（強が残っていれば強）
          const RT = G.RULESETS[st.rules || 'v1']; const wo = !!pd.weakOnly; const opts = G.traitPoolView(st).filter(t => !G.trait(p, t) && ((RT.traitCosts || {})[t] || G.TRAITS[t].cost)[wo ? 1 : 0] <= pd.freeMax).map(t => { const s = G.traitCost(st, p, t); return { value: t, label: `${t} ${G.TRAITS[t].name}（${wo ? '弱' : s.strong ? '強' : '弱'}・無料）` }; }); // T14 転写腺（weakOnly）＝弱の値段が G12 以下・弱で受け取る
          if (!opts.length) return submit({ pid: p.id, type: 'resolve', skip: true });
          const r = await ask(wo ? `転写腺：弱の値段が G${pd.freeMax} 以下の形質 1 枚を弱で無料` : `転写核：G${pd.freeMax} 以下の形質 1 枚を無料で（強が残っていれば強）`, [{ type: 'select', name: 'trait', label: '形質', options: opts, desc: (v) => v.trait ? `${wo ? '弱' : G.traitCost(st, p, v.trait).strong ? '強' : '弱'}：${rtxt(G.traitText(st, v.trait, wo ? false : G.traitCost(st, p, v.trait).strong))}` : '' }], { skipLabel: '見送る', noCancel: true });
          if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', trait: r.trait, useL: 0, res: 'E', track: 'body' });
        }
        if (viewP(p).nextTraitFree) { // T10：弱なら無料・強は差額。2026-11-07 ユーザー指摘：弱が選択肢に無く（強の差額だけ）、表題も旧文「G-3」だった
          const opts = []; G.traitPoolView(st).filter(t => !G.trait(p, t)).forEach(t => { const s = G.traitCost(st, p, t), w = G.traitCost(st, p, t, undefined, true); if (s.strong) opts.push({ value: t + ':S', label: `${t} ${G.TRAITS[t].name} 強（G${s.G}）` }); opts.push({ value: t + ':W', label: `${t} ${G.TRAITS[t].name} 弱（G${w.G}）` }); });
          const r = await ask('知性Lv3★先駆：今すぐ形質1枚（弱なら無料・強は差額）', [{ type: 'select', name: 'pick', label: '形質', options: opts, desc: (v) => { if (!v.pick) return ''; const [t, ver] = v.pick.split(':'); return `${ver === 'S' ? '強' : '弱'}：${rtxt(G.traitText(st, t, ver === 'S'))}`; } }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { skipLabel: '見送る', noCancel: true });
          if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); const [t, ver] = r.pick.split(':'); return submit({ pid: p.id, type: 'resolve', trait: t, weak: ver === 'W', useL: +r.useL, res: 'E', track: 'body' });
        }
        const r = await ask(`知性Lv3★先駆：今すぐ形質1枚をG-${pd.disc}で獲得できます`, [traitPickSel(p, pd.disc), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel(pickId), daSel(pickId)], { skipLabel: '見送る', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit(Object.assign({ pid: p.id, type: 'resolve', useL: +r.useL, res: r.res, track: r.track }, pickArgs(r)));
      }
      if (pd.type === 'join') { // T19（O-13 #2）合流進出：得たその場で資源枠を 1 つ（使用済みも自己複製も可・占有しない・見送ると消える）
        const slots = G.RES_SLOTS.concat(['PB']); const pv = (id) => { const d = G.previewGain(st, { pid: p.id, type: 'resolve', slot: id, coopRes: 'E' }); return d ? gainStr(d) : null; };
        const opts = slots.map(id => { const g = pv(id); return { value: id, label: `${G.SLOT_BY_ID[id].name}（${g === null ? '不可' : g}）${G.slotUsedBy(st, id) !== undefined ? '・使用済み' : ''}`, disabled: g === null }; });
        const first = opts.find(o => !o.disabled); if (!first) return submit({ pid: p.id, type: 'resolve', skip: true });
        const r = await ask(`合流進出（${pd.src || ''}・残り ${pd.n} 回）`, [{ type: 'select', name: 'slot', label: '資源枠', value: first.value, options: opts }, Object.assign(resSel('coopRes', '協調加算の資源'), { when: v => v.slot === 'ALL' && p.coop > 0 })], { skipLabel: '見送る（消える）', noCancel: true, note: 'ワーカーを置かず・手番を使わず・枠を占有しない。協調加算あり' });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', slot: r.slot, coopRes: r.coopRes || 'E' }); }
      if (pd.type === 'diIncome') { const D = G.RULESETS[st.rules || 'v1'].diPay; const f = []; if (G.organ(p, 'Di1')) f.push({ type: 'check', name: 'e', label: `消化膜：P${D.Di1.P} → E+${D.Di1.E}`, value: false }); if (G.organ(p, 'Di2')) f.push({ type: 'check', name: 'g', label: `消化腺：P${D.Di2.P} → G+${D.Di2.G}`, value: false }); // T49（O-91）消化：収入を受け取ったあとに払うか選ぶ
        const r = await ask('消化：P を払うか選ぶ', f, { noCancel: true, okLabel: '決める', note: `所持 P${p.P}（払わなくてもよい）` }); if (!r) return; if ((r.e ? D.Di1.P : 0) + (r.g ? D.Di2.P : 0) > p.P) { toast('個体数が足りません', true); return; } return submit({ pid: p.id, type: 'resolve', e: !!r.e, g: !!r.g }); }
      if (pd.type === 'molt') { const M = G.RULESETS[st.rules || 'v1'].nwMolt; const mx = Math.min(pd.max, Math.floor(p.E / M.E)); const opts = Array.from({ length: mx + 1 }, (_, i) => ({ value: String(i), label: i ? `${i} 回（E${i * M.E} → 痕跡+${i}）` : '払わない' })); const r = await ask(`脱皮：E${M.E} を払うごとに 痕跡+1（${pd.max} 回まで）`, [{ type: 'select', name: 'n', label: '回数', value: String(mx), options: opts }], { noCancel: true, okLabel: '決める', note: `所持 E${p.E}（あとからは払えません）` }); if (!r) return; return submit({ pid: p.id, type: 'resolve', n: +r.n }); } // T51（O-99）脱皮
      if (pd.type === 'foresee') { const f = G.trackRewardText(st, pd.track, pd.lv), m = f.match(/^強：(.*)／弱：(.*)$/) || [null, '強の報酬', '弱の報酬']; const r = await ask(`先見：${G.TRACK_INFO[pd.track].name} Lv${pd.lv}★ の報酬`, [{ type: 'select', name: 'pick', label: '報酬', value: 's', options: [{ value: 's', label: `強：${rtxt(m[1])}` }, { value: 'w', label: `弱：${rtxt(m[2])}` }] }], { noCancel: true, okLabel: '受け取る' }); if (!r) return; return submit({ pid: p.id, type: 'resolve', pick: r.pick }); } // T53（O-137）先見：強・弱の報酬を選ぶ
      if (pd.type === 'cvIncome') { const r = await ask(`${pd.src || '収斂膜'}：好きな資源+${pd.n}`, [resSel('res', '資源')], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', res: r.res }); }
      if (pd.type === 'lYield') { const r = await ask(`生命核の産出：+${pd.n}（${pd.opts.join('/')} から選択）`, [{ type: 'select', name: 'res', label: '資源', options: pd.opts.map(k => ({ value: k, label: RES_JP[k] })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', res: r.res }); }
      if (pd.type === 'wildColor') { const r = await ask('共鳴膜：ワイルド扱いにする色（自分の2色コンボ判定）', [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', track: r.track }); }
      if (pd.type === 'reMilestone') { const ms = G.reachedMilestones(p); const r = await ask(`${G.ORGANS[pd.organ].name}：到達済み報酬を再発動（${pd.organ === 'Re3' && pd.strong ? '強版' : '弱版'}）`, [{ type: 'select', name: 'm', label: '報酬', options: ms.map((m, i) => ({ value: i, label: `${G.TRACK_INFO[m.track].name} Lv${m.lv}★：${G.TRACK_REWARDS[m.track][m.lv]}` })) }], { noCancel: true }); if (!r) return; const m = ms[+r.m]; return submit({ pid: p.id, type: 'resolve', track: m.track, lv: m.lv }); }
      if (pd.type === 'learn') { const o = G.mimicOptions(st, p); const noColor = !!G.RULESETS[st.rules || 'v1'].noCombo; const opts = (noColor ? ['body'] : G.TRACKS).map(t => ({ value: 'express:' + t, label: noColor ? '発現：痕跡+1' : `発現：${G.TRACK_INFO[t].jp}の痕跡+1` })).concat(o.map(e => ({ value: 'mimic:' + e.id, label: `模倣：${rtxt(e.label)}` }))); /* 2026-10-29 色の廃止：発現は1つ・{n} を展開 */ const r = await ask('知性Lv3★先駆・学習：G を払う先取り枠を今すぐ1回 G0 で（排他無視）', [{ type: 'select', name: 'pick', label: '効果', options: opts }], { skipLabel: '見送る' }); if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); const [k, v] = r.pick.split(':'); return submit(k === 'express' ? { pid: p.id, type: 'resolve', kind: 'express', track: v } : { pid: p.id, type: 'resolve', kind: 'mimic', effect: v }); }
      if (pd.type === 'bonusAction') { toast('知性Lv4：追加アクションを今すぐ選んでください（対象以外はグレー表示）'); }
    }
  }

  // ---------- 保存・書き出し ----------
  function autosave() { if (!game || isOnline()) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { } }
  function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return toast('保存データがありません', true); game = JSON.parse(s); rebuildState(); render(); } catch (e) { toast('読み込み失敗：' + e.message, true); } }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
  function exportJson() { if (!game) return; const data = isOnline() ? { kind: 'local', meta: Net.metaNamed(), entries: Net.entries } : game; /* O-50：席の名前を入れた meta */ download(`game01_${data.meta.seed}.json`, JSON.stringify(data, null, 1), 'application/json'); }
  function importJson() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then(t => { const d = JSON.parse(t); if (!d.meta || !d.entries) throw new Error('形式が違います'); game = { kind: 'local', meta: d.meta, entries: d.entries }; rebuildState(); autosave(); render(); }).catch(e => toast(e.message, true)); }; i.click(); }
  function exportCsv() {
    if (!st) return;
    const tf = (t) => { if (!t) return ''; const d = new Date(t), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }; // O-48：時刻の列（各手の時刻）・開始と終了の行
    const ents = isOnline() ? (Net.entries || []) : (game.entries || []); const ts = ents.map(e => e.at).filter(Boolean); const t0 = (game.meta && game.meta.startedAt) || (isOnline() && Net.meta && (Net.meta.startedAt || Net.meta.createdAt)) || ts[0], t1 = st.ended ? ts[ts.length - 1] : null;
    const sx = (l) => { const v = l.s; return v ? [v.t, l.d !== undefined ? l.d : '', v.E, v.G, v.P, v.L, v.g, v.v, v.pr, v.ma] : ['', '', '', '', '', '', '', '', '', '']; }; // O-120：行の人の手の後の点と資源（列は右に足す）
    const rows = [['round', 'player', 'msg', 'time', '点', '増えた点', 'E', 'G', 'P', '生命核', '痕跡', '祝福', '繁栄度', '成熟度'], ['', '', 'ゲーム開始', tf(t0)].concat(sx({}))].concat(st.log.map(l => [l.r, l.p !== null && l.p !== undefined ? st.players[l.p].name : '', l.msg, tf(l.t)].concat(sx(l))), st.ended ? [['', '', 'ゲーム終了', tf(t1)].concat(sx({}))] : []);
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
