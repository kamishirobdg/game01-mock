/* game01 デジタルモック — ゲームエンジン（UI非依存・node でも動く）
   状態はプレーンなJSON。アクションは apply(state, action) で適用し、適用前に snapshot を積む。 */
(function (G) {
  'use strict';

  // ---------- 乱数（シード付き・状態に保存） ----------
  function rngNext(st) {
    // mulberry32
    let t = (st.rngState += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const RS = (x) => G.RULESETS[(x && x.rules) || 'v1']; // st または player からルールセットを引く
  function shuffle(st, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rngNext(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ceilHalf(n) { return Math.ceil(n / 2); }

  // ---------- 初期化 ----------
  function newGame(opts) {
    const st = {
      version: 1,
      seed: opts.seed | 0, rngState: opts.seed | 0,
      mode: opts.mode || 'expert',
      slotSet: opts.slots === 'm4' ? 'm4' : 'v7', // 資源獲得スロット：v7=現行7／m4=統合4（試作）
      rules: G.RULESETS[opts.rules] ? opts.rules : 'v1', // ルールセット：v1=現行／t1=仮値セット（試作）
      nPlayers: opts.players.length,
      round: 0, phase: 'setup', setupStep: 'species', setupIdx: 0,
      turnOrder: [], cur: 0,
      shared: { used: {}, firsts: {}, traitFirst: {}, organFirst: {}, combos: { two: [], three: [] }, organField: G.ORGAN_FIELD.slice(), lineages: ['Li', 'Tr', 'Fl', 'Rh'], cardPool: G.CARD_ORDER.slice() },
      players: [], log: [], history: [], roundStart: null, ended: false, result: null,
    };
    opts.players.forEach((p, i) => {
      st.players.push({
        id: i, name: p.name || ('P' + (i + 1)), species: null, passive: p.passive !== false, rules: st.rules,
        E: 0, G: 0, P: 0, L: 0, lRemain: G.ROUNDS,
        lv: { body: 1, intel: 1, social: 1, metab: 1 },
        gems: { body: 0, intel: 0, social: 0, metab: 0 },
        traits: [], organs: [], cards: [], coop: 0, breed: 0, upgrades: 0,
        tokens: ['W', 'W', 'W', 'AT', 'AT'], left: { W: 0, AT: 0 },
        shields: 0, gemsets: 0, inc: { E: 0, G: 0, P: 0 }, regime: false,
        massDisc: 0, traitDisc: 0, alwaysStrong: false, freeConv: false,
        next: { body: 0, intel: 0, any: 0, mass: 0 }, // 次の1回限りの軽減
        flags: { strong: {} }, // strong[track+lv]=true 先着で強を得たか
        round: { firstDone: false, dgUsed: false, flUsed: false, bonus: false, rh3Used: false },
        uses: { li1: 0, tr1: 0, rh1: 0, rh3: 0, ca1: 0, ca2: 0 }, // 弱版の回数カウント
        scanDisc: 0, cv2Granted: 0, wild: null, st3Used: false,
        pending: [], // 即時に解決すべき選択（free mass 等）
      });
    });
    // コンボ
    if (st.mode === 'beginner') { st.shared.combos.two = G.BEGINNER_COMBOS.two.slice(); st.shared.combos.three = G.BEGINNER_COMBOS.three.slice(); }
    else {
      st.shared.combos.two = shuffle(st, [0, 1, 2, 3, 4, 5]).slice(0, 4).sort(); st.shared.combos.three = shuffle(st, [0, 1, 2, 3]).slice(0, 2).sort();
      const cum = shuffle(st, G.LINEAGE_TYPE.cumulative).slice(0, 2), fun = shuffle(st, G.LINEAGE_TYPE.functional).slice(0, 2);
      st.shared.lineages = cum.concat(fun); st.shared.organField = st.shared.lineages.flatMap(l => [1, 2, 3].map(t => l + t));
    }
    log(st, null, `ゲーム開始（${st.nPlayers}人・${st.mode === 'beginner' ? '初心者' : '熟練者'}セットアップ・${G.SLOT_SET_NAME[st.slotSet]}・ルール${G.RULESETS[st.rules].name}・seed ${st.seed}）`);
    log(st, null, 'コンボ：' + comboNames(st).join('／'));
    log(st, null, '器官の場：' + st.shared.lineages.map(l => G.LINEAGES[l]).join('・'));
    return st;
  }
  function comboNames(st) {
    const n = t => G.TRACK_INFO[t].jp;
    return st.shared.combos.two.map(i => G.COMBOS2[i].map(n).join('+')).concat(st.shared.combos.three.map(i => G.COMBOS3[i].map(n).join('+')));
  }

  function log(st, pid, msg, kind) { st.log.push({ r: st.round, p: pid, msg, kind: kind || 'info' }); }
  function P(st, pid) { return st.players[pid]; }
  function cur(st) { return st.players[st.turnOrder[st.cur]]; }

  // ---------- セットアップ ----------
  function chooseSpecies(st, pid, spId) {
    const p = P(st, pid), sp = G.SPECIES[spId];
    if (st.players.some(q => q.species === spId)) throw new Error('その種族は選択済みです');
    p.species = spId; p.E = sp.stock.E; p.G = sp.stock.G; p.P = sp.stock.P;
    if (p.passive) {
      if (spId === 'wing') p.lv.body = 2;
      if (spId === 'ant') p.coop = 1;
      if (spId === 'manta') { p.P += 10; p.inc.E += 1; }
      // arm: 形質1枚は setup の別ステップで選ぶ
    }
    log(st, pid, `${p.name} が ${sp.name} を選択（${p.passive ? 'パッシブ有' : 'パッシブ無'}）`);
    if (spId === 'arm' && p.passive) st.setupStep = 'armTrait'; else advanceSetup(st);
  }
  // セットアップの進行：種族選択（手番順1→n）→ 九腕の初期形質 → ドラフト（逆順）→ 開始
  function advanceSetup(st) {
    if (st.setupStep === 'species' || st.setupStep === 'armTrait') {
      st.setupIdx += 1;
      if (st.setupIdx >= st.nPlayers) { st.setupStep = 'draft'; st.setupOrder = st.players.map(p => p.id).reverse(); st.setupIdx = 0; }
      else st.setupStep = 'species';
    } else if (st.setupStep === 'draft') {
      st.setupIdx += 1;
      if (st.setupIdx >= st.setupOrder.length) { st.setupStep = 'ready'; finishSetup(st); }
    }
  }
  function chooseStartTrait(st, pid, tid) { // 九腕知性体
    const p = P(st, pid); const t = G.TRAITS[tid];
    if (t.cost[0] > 4) throw new Error('コストG4以下の形質のみ');
    if (p.species !== 'arm') throw new Error('九腕知性体のみ');
    giveTrait(st, p, tid, true, 'passive');
    if (st.phase === 'setup' && st.setupStep === 'armTrait') advanceSetup(st);
  }
  function draftCards(st, pid, ids) {
    const p = P(st, pid); const need = G.HAND_SIZE[st.nPlayers];
    if (ids.length !== need) throw new Error(`${need}枚選んでください`);
    ids.forEach(id => { const k = st.shared.cardPool.indexOf(id); if (k < 0) throw new Error('そのカードは選べません'); st.shared.cardPool.splice(k, 1); });
    p.cards = ids.slice();
    log(st, pid, `${p.name} が個人カード ${ids.join('・')} をドラフト`);
    if (st.phase === 'setup' && st.setupStep === 'draft') advanceSetup(st);
  }
  function finishSetup(st) {
    if (st.phase !== 'setup') return; // 既に開始済み（ドラフト完了時に自動開始するため 'finish' エントリは冪等）
    if (st.players.some(p => !p.species || p.cards.length !== G.HAND_SIZE[st.nPlayers])) throw new Error('セットアップが完了していません');
    // 第1Rの手番順＝手番値の大きい順（同値はランダム）
    const ps = st.players.map(p => ({ id: p.id, o: G.SPECIES[p.species].order, r: rngNext(st) }));
    ps.sort((a, b) => b.o - a.o || a.r - b.r);
    st.turnOrder = ps.map(x => x.id);
    st.phase = 'play';
    startRound(st);
  }

  // ---------- ラウンド ----------
  function startRound(st) {
    st.round += 1;
    if (st.round > 1) {
      // 実宝石の少ない順（同数は前R維持＝安定ソート）
      const order = st.turnOrder.slice();
      order.sort((a, b) => realGems(P(st, a)) - realGems(P(st, b)));
      st.turnOrder = order;
      // 律動T1：整列後の手番が遅い者から順に1つ前へ
      for (let i = st.turnOrder.length - 1; i >= 1; i--) {
        const p = P(st, st.turnOrder[i]); const o = organ(p, 'Rh1');
        if (!o) continue;
        if (!o.strong) { if (p.uses.rh1 >= 3) continue; p.uses.rh1 += 1; }
        [st.turnOrder[i - 1], st.turnOrder[i]] = [st.turnOrder[i], st.turnOrder[i - 1]];
        log(st, p.id, `${p.name}：先導で手番を1つ前へ`);
      }
    }
    st.cur = 0;
    st.shared.used = {};
    st.players.forEach(p => {
      // 収入
      p.lRemain -= 1; p.L += 1;
      const inc = income(p);
      p.E += inc.E; p.G += inc.G; p.P += inc.P;
      // トークン
      p.left = { W: p.tokens.filter(t => t !== 'AT').length, AT: p.tokens.filter(t => t === 'AT').length };
      p.round = { firstDone: false, rh3Used: false }; p.st3Used = false;
      log(st, p.id, `収入 E+${inc.E} G+${inc.G} P+${inc.P} L+1（${inc.parts.join('・')}）`);
      const cv1 = organ(p, 'Cv1'); if (cv1) { const n = Math.floor(p.organs.length / (cv1.strong ? 2 : 3)); if (n > 0) p.pending.push({ type: 'cvIncome', n }); }
      const flMax = flSwapMax(p); if (flMax) p.pending.push({ type: 'flSwap', max: flMax });
      if (trait(p, 'DG')) p.pending.push({ type: 'dgBuy', disc: trait(p, 'DG').strong ? 2 : 1 });
    });
    log(st, null, `=== ラウンド ${st.round} 開始（手番順：${st.turnOrder.map(i => P(st, i).name).join('→')}）===`, 'round');
    st.hist = st.hist || []; st.hist.push({ round: st.round, rows: st.players.map(p => summaryRow(st, p)) });
    st.roundStart = null; // ラウンド頭へ戻すのはエントリ列の再構築（rebuild）で行う
  }
  function flSwapMax(p) {
    const f1 = organ(p, 'Fl1'), f2 = organ(p, 'Fl2'), f3 = organ(p, 'Fl3');
    let max = 0; if (f1) max = Math.max(max, f1.strong ? 3 : 2); if (f2) max = Math.max(max, f2.strong ? 5 : 4); if (f3 && !f3.strong) max = 99;
    return max;
  }
  function income(p) {
    const inc = { E: 0, G: 0, P: 0, parts: [] };
    const add = (label, e, g, pp) => { if (!e && !g && !pp) return; inc.E += e; inc.G += g; inc.P += pp; inc.parts.push(`${label}${e ? ' E+' + e : ''}${g ? ' G+' + g : ''}${pp ? ' P+' + pp : ''}`); };
    add('基礎', RS(p).incE, G.BASE_INCOME.G, G.BASE_INCOME.P);
    add('恒久(種族/体制)', p.inc.E, p.inc.G, p.inc.P);
    if (p.lv.metab >= 2) add('代謝Lv2', 1, 0, 0);
    if (p.lv.metab >= 3 && p.flags.strong['metab3']) add('代謝Lv3強', 1, 1, 0);
    if (p.lv.intel >= 3 && !p.flags.strong['intel3']) add('知性Lv3弱', 0, 1, 0);
    if (p.lv.metab >= 5) { const k = p.flags.strong['metab5'] ? 2 : 1; add('代謝Lv5', k, k, k); }
    const cv3 = organ(p, 'Cv3'); if (cv3) { const n = p.organs.length; const k = cv3.strong ? (n >= 9 ? 2 : n >= 6 ? 1 : 0) : (n >= 7 ? 1 : 0); add('極相体', k, k, k); }
    p.traits.forEach(t => {
      if (t.id === 'IE' && t.strong) add('IE', 2, 0, 0);
      if (t.id === 'IG' && t.strong) add('IG', 0, 1, 0);
      if (t.id === 'IP' && t.strong) add('IP', 0, 0, 3);
      if (t.id === 'IB' && t.strong) add('IB', 1, 1, 0);
      if (t.id === 'IM') { const k = t.strong ? 3 : 2; add('IM', t.res === 'E' ? k : 0, t.res === 'G' ? k : 0, t.res === 'P' ? k : 0); }
    });
    return inc;
  }
  function realGems(p) { return p.gems.body + p.gems.intel + p.gems.social + p.gems.metab; }
  function coef(p) { return 3 + Math.min(4, p.upgrades); }
  function organ(p, id) { return p.organs.find(o => o.id === id); }
  function trait(p, id) { return p.traits.find(t => t.id === id); }
  function lineageCount(p, lin) { return p.organs.filter(o => G.ORGANS[o.id].lin === lin).length; }

  // ---------- コスト計算 ----------
  function stepCost(p, track, forBonus) {
    const lv = p.lv[track]; if (lv >= 5) return null;
    const base = RS(p).step[lv]; let d = 0;
    if (track === 'body') { if (trait(p, 'DB') && trait(p, 'DB').strong) d += 2; d += p.next.body; }
    if (track === 'intel') { if (trait(p, 'DI') && trait(p, 'DI').strong) d += 2; d += p.next.intel; }
    const dv = trait(p, 'DV'); if (dv) d += dv.strong ? 2 : 1;
    const da = trait(p, 'DA'); if (da && da.strong && da.track === track) d += 1;
    d += p.next.any;
    const ca2 = organ(p, 'Ca2'); if (ca2 && (ca2.strong || p.uses.ca2 < 3)) d += 1;
    const ca3 = organ(p, 'Ca3'); if (ca3) d += ca3.strong ? 2 : 1;
    let c = Math.max(ceilHalf(base), base - d);
    c = applyRh2(p, c);
    if (forBonus) c = ceilHalf(c);
    return c;
  }
  function applyRh2(p, c) {
    if (p.round.firstDone) return c;
    const o = organ(p, 'Rh2'); if (!o) return c;
    return Math.max(1, c - (o.strong ? 3 : 1));
  }
  function organCost(st, p, oid) {
    const lin = G.ORGANS[oid].lin; const n = lineageCount(p, lin);
    const tier = G.ORGANS[oid].tier; if (tier !== n + 1) return null; // 階層順に建造
    const strong = st.shared.organFirst[oid] === undefined || st.shared.organFirst[oid] === p.id;
    let [e, g] = G.ORGAN_COST[n]; if (!strong) g = 0;
    const ca1 = organ(p, 'Ca1'); if (ca1 && (ca1.strong || p.uses.ca1 < 3)) e -= 1;
    const ca3 = organ(p, 'Ca3'); if (ca3) e -= ca3.strong ? 2 : 1;
    e = Math.max(1, e);
    e = applyRh2(p, e);
    return { E: e, G: g, strong };
  }
  function traitCost(st, p, tid, viaReward) {
    const t = G.TRAITS[tid];
    const strong = st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id || p.alwaysStrong;
    let c = t.cost[strong ? 0 : 1];
    c -= p.traitDisc;
    const tr1 = organ(p, 'Tr1'); if (tr1 && (tr1.strong || p.uses.tr1 < 3)) c -= 1;
    const tr2 = organ(p, 'Tr2'); if (tr2) c -= tr2.strong ? 2 : 1;
    const tr3 = organ(p, 'Tr3'); if (tr3) c -= tr3.strong ? 3 : 2;
    if (viaReward) c -= viaReward;
    return { G: Math.max(1, c), strong };
  }
  function massCost(p, kind) {
    let c = G.MASS_COST;
    const mc = trait(p, 'MC'); if (mc && mc.strong) c -= 6; c -= p.next.mass;
    if (kind === 'MB') { c -= p.massDisc; const mb = trait(p, 'MB'); if (mb) c -= 8; return Math.max(G.MASS_MIN.body, c); }
    return Math.max(G.MASS_MIN.other, c);
  }
  function breedCost(p) { if (p.breed >= 2) return null; const mb = trait(p, 'MB'); const c = G.BREED_COST[p.breed]; return mb && mb.strong ? c / 2 : c; }
  function gemsetPrice(p) { return Math.max(G.GEMSET_FLOOR, G.GEMSET_BASE - p.traits.length); }
  function pbCost(p) { const tr3 = organ(p, 'Tr3'); return Math.max(1, 2 - (tr3 ? (tr3.strong ? 3 : 2) : 0)); }

  // ---------- 支払い ----------
  // pay: {E:n} を E と L（1L=3E）で支払う。useL = 使うL個数
  function payE(p, amount, useL) {
    useL = useL | 0;
    if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const covered = useL * 3; const needE = Math.max(0, amount - covered);
    if (p.E < needE) throw new Error(`エネルギーが足りません（必要E${amount}・所持E${p.E}${p.L ? '・生命核1=E3で補えます' : ''}）`);
    p.E -= needE; p.L -= useL;
    return { E: needE, L: useL };
  }
  function payG(p, amount, useL) {
    useL = useL | 0; if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const needG = Math.max(0, amount - useL * 3); if (p.G < needG) throw new Error(`遺伝子が足りません（必要G${amount}・所持G${p.G}${p.L ? '・生命核1=G3で補えます' : ''}）`);
    p.G -= needG; p.L -= useL; return { G: needG, L: useL };
  }

  // ---------- 共通：アクション開始・終了 ----------
  function assertTurn(st, pid) { if (st.phase !== 'play') throw new Error('プレイ中ではありません'); if (cur(st).id !== pid) throw new Error('手番ではありません'); }
  function useToken(p, needW) {
    if (needW) { if (p.left.W <= 0) throw new Error(`ワーカー（W）が必要です（残りW0${p.left.AT ? '・ATは資源獲得・器官建造・大量消費・形質購入・個人カード等に使えます' : ''}）`); p.left.W -= 1; return 'W'; }
    if (p.left.AT > 0) { p.left.AT -= 1; return 'AT'; }
    if (p.left.W > 0) { p.left.W -= 1; return 'W'; }
    throw new Error('このラウンドのトークンを使い切っています');
  }
  // 早取り排他のキー：統合4ではグループ（RE/RG/RP/RA）単位、現行はスロット単位
  function usedKey(st, slotId) { return st.slotSet === 'm4' && G.RES_GROUP_OF[slotId] ? G.RES_GROUP_OF[slotId] : slotId; }
  function slotUsedBy(st, slotId) { return st.shared.used[usedKey(st, slotId)]; }
  function claimSlot(st, p, slotId, opt) {
    opt = opt || {};
    const s = G.SLOT_BY_ID[slotId];
    if (!s.excl) return { bypass: null };
    const key = usedKey(st, slotId);
    if (st.shared.used[key] === undefined) { st.shared.used[key] = p.id; return { bypass: null }; }
    // 使用済み：突破手段
    if (opt.bodyMass && p.flags.strong['body5']) return { bypass: 'body5' };
    if (!p.round.firstDone) { const o = organ(p, 'Rh3'); if (o && (o.strong || p.uses.rh3 < 3)) { if (!o.strong) p.uses.rh3 += 1; return { bypass: 'Rh3' }; } }
    if (opt.useL && G.RES_SLOTS.includes(slotId)) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; return { bypass: 'L' }; }
    throw new Error(`このスロットは今ラウンド ${P(st, st.shared.used[key]).name} が使用済みです${G.RES_SLOTS.includes(slotId) ? (p.L > 0 ? '（緊急発進＝生命核1で使えます）' : '（生命核があれば緊急発進で使えます）') : '（次のラウンドまで待ってください）'}`);
  }
  // コマを置かない実行（Wなし実行）用：使用可否だけ判定し、使用済みにはしない
  function peekSlot(st, p, slotId, opt) {
    opt = opt || {};
    const key = usedKey(st, slotId);
    if (st.shared.used[key] === undefined) return { bypass: null };
    if (opt.useL && G.RES_SLOTS.includes(slotId)) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; return { bypass: 'L' }; }
    throw new Error(`このスロットは今ラウンド ${P(st, st.shared.used[key]).name} が使用済みです（Wなし実行でも不可${p.L > 0 ? '・緊急発進＝生命核1で使えます' : ''}）`);
  }
  function afterAction(st, p, desc, tokenUsed) {
    p.round.firstDone = true;
    if (tokenUsed) log(st, p.id, `${p.name}：${desc}`, 'act'); else log(st, p.id, `${p.name}：${desc}（トークン消費なし）`, 'act');
  }
  function advanceTurn(st) {
    // pending がある間は手番を進めない
    const c = cur(st); if (c.pending.length) return;
    // 次の手番：トークンが残っている次のプレイヤー
    const n = st.turnOrder.length;
    for (let k = 1; k <= n; k++) {
      const i = (st.cur + k) % n; const p = P(st, st.turnOrder[i]);
      if (p.left.W + p.left.AT > 0 || p.pending.length) { st.cur = i; return; }
    }
    // 全員使い切り → ラウンド終了
    if (st.round >= G.ROUNDS) { endGame(st); return; }
    startRound(st);
  }

  // ---------- 効果適用 ----------
  function gainRes(p, res, n) { if (res === 'coop') p.coop = Math.min(G.COOP_MAX, p.coop + n); else p[res] += n; }
  function addUpgrade(st, p, why) {
    if (p.upgrades >= 4) { log(st, p.id, `（係数は上限×7のため ${why} の+1は無効）`); return; }
    const i = p.tokens.indexOf('AT');
    if (i >= 0) { p.tokens[i] = 'W'; p.left.W += 1; p.left.AT = Math.max(0, p.left.AT - 0); // 活性化：今Rの残トークンは AT→W に読み替え
      // 残っていたATを1つWへ振替
      if (p.left.AT > 0) { p.left.AT -= 1; } else { p.left.W -= 1; } // 活性化は未使用ATがあれば振替、なければ使用済み扱い
    } else { const j = p.tokens.indexOf('W'); if (j >= 0) p.tokens[j] = 'S'; }
    p.upgrades += 1;
    log(st, p.id, `${p.name}：${why} → 係数 ×${coef(p)}`);
  }
  function addGem(st, p, track, n, why) { p.gems[track] += n; log(st, p.id, `${p.name}：${G.TRACK_INFO[track].jp}宝石+${n}（${why}）`, 'gem'); }

  function advanceTrack(st, p, track, why) {
    if (p.lv[track] >= 5) return false;
    p.lv[track] += 1; const lv = p.lv[track];
    let strong = false;
    if (lv === 3 || lv === 5) {
      const key = track + lv;
      if (st.shared.firsts[key] === undefined) { st.shared.firsts[key] = p.id; strong = true; }
      // JI/JB 弱：Lv5★で必ず強効果
      if (lv === 5 && !strong) { const t = trait(p, track === 'intel' ? 'JI' : 'JB'); if (t && !t.strong) strong = true; }
      p.flags.strong[key] = strong;
      addGem(st, p, track, 1, `${G.TRACK_INFO[track].name} Lv${lv}★${strong ? '・先着' : ''}`);
      if (lv === 5 && strong) addGem(st, p, track, 1, '先着ボーナス');
    }
    log(st, p.id, `${p.name}：${G.TRACK_INFO[track].name} Lv${lv}（${why}）`);
    applyReward(st, p, track, lv, strong, false);
    return true;
  }
  // 固有報酬。temp=true は感応T1弱の「恒久効果は一時扱い」
  function applyReward(st, p, track, lv, strong, temp) {
    if (track === 'body') {
      if (lv === 2) p.P += 8;
      if (lv === 3) { if (strong) p.pending.push({ type: 'freeMass' }); else p.P += 15; }
      if (lv === 4) p.massDisc += 5;
      if (lv === 5) p.massDisc += 5;
    }
    if (track === 'intel') {
      if (lv === 2) p.G += 3;
      if (lv === 3) { if (strong) p.pending.push({ type: 'rewardTrait', disc: 3 }); else if (temp) p.G += 1; /* 弱の恒久G+1/Rは income() で参照 */ }
      if (lv === 4) p.pending.push({ type: 'bonusAction' });
      if (lv === 5) { if (strong) { p.traitDisc = 2; p.alwaysStrong = true; } else p.G += 6; }
    }
    if (track === 'social') {
      if (lv === 2) gainRes(p, 'coop', 1);
      if (lv === 3) { if (strong) gainRes(p, 'coop', 2); else { gainRes(p, 'coop', 1); p.G += 3; } }
      if (lv === 4) p.shields += 1;
      if (lv === 5) { gainRes(p, 'coop', 1); p.shields += strong ? 2 : 1; }
    }
    if (track === 'metab') {
      if (lv === 3) { if (strong) { if (temp) { p.E += 1; p.G += 1; } else p.inc.E += 0; /* 強の恒久E+1 G+1は income() で参照 */ } else p.E += 8; }
      if (lv === 4) p.freeConv = true;
      if (lv === 5 && temp) { const k = strong ? 2 : 1; p.E += k; p.G += k; p.P += k; }
    }
  }
  function reachedMilestones(p) { const out = []; G.TRACKS.forEach(t => { [3, 5].forEach(lv => { if (p.lv[t] >= lv) out.push({ track: t, lv }); }); }); return out; }

  function giveTrait(st, p, tid, forceStrong, how, opt) {
    opt = opt || {};
    const t = G.TRAITS[tid];
    if (trait(p, tid)) throw new Error('同じ形質は1枚まで');
    let strong = forceStrong || st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id || p.alwaysStrong;
    if (st.shared.traitFirst[tid] === undefined) st.shared.traitFirst[tid] = p.id;
    const rec = { id: tid, strong };
    if (tid === 'IM') rec.res = opt.res || 'E';
    if (tid === 'DA' && strong) rec.track = opt.track || 'body';
    p.traits.push(rec);
    log(st, p.id, `${p.name}：形質 ${tid} ${t.name}（${strong ? '強' : '弱'}・${how}）`);
    // 即時効果
    if (!strong) {
      if (tid === 'IE') p.E += 6; if (tid === 'IG') p.G += 3; if (tid === 'IP') p.P += 9; if (tid === 'IB') { p.E += 3; p.G += 3; }
      if (tid === 'DB') p.next.body += 2; if (tid === 'DI') p.next.intel += 2; if (tid === 'MC') p.next.mass += 6; if (tid === 'DA') p.next.any += 1;
    }
    if (tid === 'JI') { advanceTrack(st, p, 'intel', '知的跳躍'); if (strong) advanceTrack(st, p, 'intel', '知的跳躍'); }
    if (tid === 'JB') { advanceTrack(st, p, 'body', '身体覚醒'); if (strong) advanceTrack(st, p, 'body', '身体覚醒'); }
    const n = p.traits.length; if (n === 4 || n === 8) addUpgrade(st, p, `形質${n}枚目`);
  }
  function removeTrait(st, p, tid) {
    const i = p.traits.findIndex(t => t.id === tid); if (i < 0) throw new Error('その形質を持っていません');
    const t = p.traits[i]; const def = G.TRAITS[tid];
    if (def.instant || (!t.strong && !def.permWeak)) throw new Error('効果を使い切った形質は手放せません');
    p.traits.splice(i, 1);
  }
  function consumeNext(p, track) { // 「次の1回」軽減の消費
    if (track === 'body') p.next.body = 0; if (track === 'intel') p.next.intel = 0; p.next.any = 0;
  }

  // ---------- アクション実装 ----------
  const ACTIONS = {};

  // 資源獲得スロット： params {slot, coopRes(ALL用), useL, shield}
  ACTIONS.res = (st, p, a) => {
    const s = G.SLOT_BY_ID[a.slot]; if (s.group !== 'res') throw new Error('資源スロットではありません');
    let tok = null;
    if (a.shield) { if (p.shields <= 0) throw new Error('Wなし実行権がありません'); if (a.slot === 'PB') throw new Error('Pブーストは対象外'); }
    // Wなし実行はコマを置かないのでスロットを占有しない（使用済みにしない）。既に使用済みのスロットは不可（緊急発進との併用は可）
    const cl = a.shield ? peekSlot(st, p, a.slot, { useL: a.useL }) : claimSlot(st, p, a.slot, { useL: a.useL });
    if (a.shield) p.shields -= 1; else tok = useToken(p, false);
    const pt = Math.floor(p.P / 10);
    const desc = [];
    const coopTo = (res) => { if (p.coop > 0) { gainRes(p, res, p.coop); desc.push(`協調+${p.coop}${res}`); } };
    if (a.slot === 'E5') { p.E += 5; coopTo('E'); desc.unshift('固定E強 +5E'); }
    if (a.slot === 'EG') { p.E += 2 + pt; coopTo('E'); desc.unshift(`群体E +${2 + pt}E`); }
    if (a.slot === 'G3') { p.G += 3; coopTo('G'); desc.unshift('固定G強 +3G'); }
    if (a.slot === 'GG') { p.G += 1 + pt; coopTo('G'); desc.unshift(`群体G +${1 + pt}G`); }
    if (a.slot === 'P8') { p.P += 8; coopTo('P'); desc.unshift('P増加 +8P'); }
    if (a.slot === 'ALL') { p.E += 2; p.G += 1; p.P += 4; coopTo(a.coopRes || 'E'); desc.unshift('全資源 +2E+1G+4P'); }
    if (a.slot === 'PB') { const c = pbCost(p); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; p.P += 10; desc.unshift(`Pブースト G${c}→P+10`); }
    if (cl.bypass) desc.push(cl.bypass === 'L' ? '緊急発進（L-1）' : `排他突破（${cl.bypass}）`);
    if (a.shield) desc.push('Wなし実行');
    afterAction(st, p, desc.join('・'), !a.shield);
    return !a.shield;
  };

  // トラック進行： {track, pay:'E'|'P'|'G', useL, bonus}
  ACTIONS.track = (st, p, a) => {
    const c = stepCost(p, a.track, a.bonus); if (c === null) throw new Error('Lv5です');
    if (!a.bonus) useToken(p, true);
    let paid;
    if (a.pay === 'P') { if (a.track !== 'body') throw new Error('Pで払えるのは身体のみ'); if (p.P < c * 3) throw new Error('Pが足りません'); p.P -= c * 3; paid = `P${c * 3}`; }
    else if (a.pay === 'G') { if (a.track !== 'intel') throw new Error('Gで払えるのは知性のみ'); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; paid = `G${c}`; }
    else { const r = payE(p, c, a.useL); paid = `E${r.E}${r.L ? '+L' + r.L : ''}`; }
    consumeNext(p, a.track);
    { const ca2 = organ(p, 'Ca2'); if (ca2 && !ca2.strong && p.uses.ca2 < 3) p.uses.ca2 += 1; }
    afterAction(st, p, `${G.TRACK_INFO[a.track].name}を進行（${paid}${a.bonus ? '・追加アクション半額' : ''}）`, !a.bonus);
    advanceTrack(st, p, a.track, '進行');
    return !a.bonus;
  };

  // 繁殖変換： {bonus}
  ACTIONS.breed = (st, p, a) => {
    const c = breedCost(p); if (c === null) throw new Error('繁殖は×5が上限');
    if (!p.tokens.includes('AT')) throw new Error('活性化できる追加コマ（AT）がありません');
    if (p.P < c) throw new Error(`個体数が足りません（必要P${c}・所持P${p.P}）`);
    if (!a.bonus) useToken(p, true);
    p.P -= c; p.breed += 1;
    afterAction(st, p, `繁殖変換（P${c}）`, !a.bonus);
    addUpgrade(st, p, `繁殖×${3 + p.breed}`);
    return !a.bonus;
  };

  // 器官建造： {organ, useL, li2Res, li3Res, bonus}
  ACTIONS.organ = (st, p, a) => {
    const c = organCost(st, p, a.organ); if (!c) throw new Error('その器官は今は建造できません（系統内は階層順）');
    if (organ(p, a.organ)) throw new Error('建造済みです');
    let e = c.E; if (a.bonus) e = ceilHalf(e);
    if (!a.bonus) useToken(p, false);
    const r = payE(p, e, a.useL); if (c.G) { if (p.G < c.G) throw new Error('Gが足りません'); p.G -= c.G; }
    if (c.strong) st.shared.organFirst[a.organ] = p.id;
    { const ca1 = organ(p, 'Ca1'); if (ca1 && !ca1.strong && p.uses.ca1 < 3) p.uses.ca1 += 1; }
    // 建造前の連結効果（既存の器官が反応）
    const li1 = organ(p, 'Li1'); if (li1) { if (li1.strong) p.E += 1; else if (p.uses.li1 < 3) { p.uses.li1 += 1; p.E += 1; } }
    const li2 = organ(p, 'Li2'); if (li2) gainRes(p, a.li2Res || 'E', li2.strong ? 2 : 1);
    p.organs.push({ id: a.organ, strong: c.strong });
    afterAction(st, p, `器官 ${a.organ} ${G.ORGANS[a.organ].name} を建造（${c.strong ? '強' : '弱'}・E${r.E}${r.L ? '+L' + r.L : ''}${c.G ? '+G' + c.G : ''}）`, !a.bonus);
    const lin = G.ORGANS[a.organ].lin;
    if (lineageCount(p, lin) === 3) {
      addUpgrade(st, p, `${G.LINEAGES[lin]}系統完成`);
      const li3 = organ(p, 'Li3'); if (li3) gainRes(p, a.li3Res || 'E', li3.strong ? 5 : 3);
    }
    const lins = new Set(p.organs.map(o => G.ORGANS[o.id].lin));
    if (lins.size >= 4 && !p.regime) { p.regime = true; p.inc[a.regimeRes || 'E'] += 1; log(st, p.id, `${p.name}：体制完成（収入+1・終了時+${RS(st).regimePt}点）`); }
    // 収斂T2：3/6/9枚（弱4枚ごと）で協調+1（遡って算入）
    const cv2 = organ(p, 'Cv2'); if (cv2) { const step = cv2.strong ? 3 : 4; const due = Math.floor(p.organs.length / step); while (p.cv2Granted < due) { p.cv2Granted += 1; gainRes(p, 'coop', 1); log(st, p.id, `${p.name}：群心器で協調+1`); } }
    // 感応系：建造時の再発動／ワイルド色
    if (a.organ === 'Re1' || a.organ === 'Re3') { const reached = reachedMilestones(p); if (reached.length) p.pending.push({ type: 'reMilestone', organ: a.organ, strong: c.strong }); else log(st, p.id, `${p.name}：再発動できる到達済み報酬がありません`); }
    if (a.organ === 'Re2' && c.strong) p.pending.push({ type: 'wildColor' });
    return !a.bonus;
  };

  // 大量消費： {kind:'MB'|'MI'|'MS'|'MM', traits:[2], free}
  ACTIONS.mass = (st, p, a) => {
    const c = a.free ? 0 : massCost(p, a.kind);
    if (!a.free) { if (p.P < c) throw new Error(`個体数が足りません（必要P${c}・所持P${p.P}）`); claimSlot(st, p, a.kind, { bodyMass: a.kind === 'MB' }); useToken(p, false); p.P -= c; p.next.mass = 0; }
    const desc = `${G.SLOT_BY_ID[a.kind].name}（${a.free ? '無料・報酬' : 'P' + c}）`;
    afterAction(st, p, desc, !a.free);
    if (a.kind === 'MB') addGem(st, p, 'body', 1, '大量消費');
    if (a.kind === 'MS') gainRes(p, 'coop', 2);
    if (a.kind === 'MM') { p.E += 10; p.G += 10; }
    if (a.kind === 'MI') {
      const ids = (a.traits || []).slice(0, 2);
      ids.forEach(t => { if (G.TRAITS[t].cost[0] > 4) throw new Error('G4以下の形質のみ'); });
      if (ids.length === 2 && ids[0] === ids[1]) throw new Error('異なる2種');
      ids.forEach(t => giveTrait(st, p, t, false, '大量消費(知性)'));
    }
    return !a.free;
  };

  // 形質購入： {trait, useL, res, track, viaDG, viaReward}
  ACTIONS.trait = (st, p, a) => {
    let disc = 0, tok = true;
    if (a.viaDG) { disc = a.viaDG; tok = false; }
    else if (a.viaReward) { disc = a.viaReward; tok = false; }
    else { claimSlot(st, p, 'TRT'); useToken(p, false); }
    const c = traitCost(st, p, a.trait, disc);
    const r = payG(p, c.G, a.useL);
    const tr1 = organ(p, 'Tr1'); if (tr1 && !tr1.strong && p.uses.tr1 < 3) p.uses.tr1 += 1;
    afterAction(st, p, `形質購入 ${a.trait}（G${r.G}${r.L ? '+L' + r.L : ''}${a.viaDG ? '・遺伝子図書館' : a.viaReward ? '・報酬' : ''}）`, tok);
    giveTrait(st, p, a.trait, false, '購入', { res: a.res, track: a.track });
    return tok;
  };

  // 形質アップグレード： {from, to, useL, res, track}
  ACTIONS.upgrade = (st, p, a) => {
    const from = trait(p, a.from); if (!from) throw new Error('手放す形質を持っていません');
    const defF = G.TRAITS[a.from], defT = G.TRAITS[a.to];
    if (trait(p, a.to)) throw new Error('取得済みの形質へはアップグレードできません');
    const toStrong = st.shared.traitFirst[a.to] === undefined || st.shared.traitFirst[a.to] === p.id || p.alwaysStrong;
    const dispTo = defT.cost[toStrong ? 0 : 1], dispFrom = defF.cost[from.strong ? 0 : 1];
    if (dispTo <= dispFrom) throw new Error('コストの高い形質へのみ');
    let c = dispTo - dispFrom + 1;
    const tr2 = organ(p, 'Tr2'); if (tr2) c -= tr2.strong ? 2 : 1;
    const tr3 = organ(p, 'Tr3'); if (tr3) c -= tr3.strong ? 3 : 2;
    c = Math.max(1, c);
    claimSlot(st, p, 'TRT'); useToken(p, false);
    removeTrait(st, p, a.from);
    const r = payG(p, c, a.useL);
    afterAction(st, p, `形質アップグレード ${a.from}→${a.to}（G${r.G}${r.L ? '+L' + r.L : ''}）`, true);
    // 枚数不変なので係数判定を避ける：一時的に枚数を保つ
    const n0 = p.traits.length;
    giveTraitNoCount(st, p, a.to, '購入(アップグレード)', { res: a.res, track: a.track });
    return true;
  };
  function giveTraitNoCount(st, p, tid, how, opt) {
    // giveTrait と同じだが 4/8 枚目判定をしない（アップグレードは枚数不変）
    const save = p.traits.length; giveTrait(st, p, tid, false, how, opt);
  }

  // 宝石セット： {useL}
  ACTIONS.gemset = (st, p, a) => {
    const c = gemsetPrice(p); claimSlot(st, p, 'GEM'); useToken(p, false);
    const r = payG(p, c, a.useL); p.gemsets += 1;
    afterAction(st, p, `宝石セット得点カード購入（G${r.G}${r.L ? '+L' + r.L : ''}）→ 仮想宝石 ${p.gemsets}`, true);
    return true;
  };

  // 環境スキャン： {target:{pid, track}, useL, bonus}
  ACTIONS.scan = (st, p, a) => {
    const cands = scanCandidates(st, p); if (!cands.length) throw new Error('参照できる他プレイヤーがいません（全員Lv1）');
    const t = cands.find(c => c.pid === a.target.pid && c.track === a.target.track); if (!t) throw new Error('その対象は最高Lvではありません');
    let e = Math.max(1, 5 - p.scanDisc); if (a.bonus) e = ceilHalf(e); e = applyRh2(p, e);
    if (!a.bonus) useToken(p, false);
    const r = payE(p, e, a.useL);
    const res = G.TRACK_INFO[t.track].res; gainRes(p, res, t.lv * 2);
    afterAction(st, p, `環境スキャン（E${r.E}${r.L ? '+L' + r.L : ''}）→ ${P(st, t.pid).name}の${G.TRACK_INFO[t.track].name}Lv${t.lv}参照：${res}+${t.lv * 2}`, !a.bonus);
    return !a.bonus;
  };
  function scanCandidates(st, p) {
    let max = 1; const out = [];
    st.players.forEach(q => { if (q.id === p.id) return; G.TRACKS.forEach(t => { if (q.lv[t] > max) max = q.lv[t]; }); });
    if (max <= 1) return [];
    st.players.forEach(q => { if (q.id === p.id) return; G.TRACKS.forEach(t => { if (q.lv[t] === max) out.push({ pid: q.id, track: t, lv: max }); }); });
    return out;
  }

  // 適応進化： {track}
  ACTIONS.adapt = (st, p, a) => {
    if (p.L <= 0) throw new Error('生命核がありません');
    const lows = G.TRACKS.filter(t => p.lv[t] === 1); if (!lows.length) throw new Error('Lv1のトラックがありません');
    if (!lows.includes(a.track)) throw new Error('Lv1のトラックを選んでください');
    useToken(p, true); p.L -= 1;
    afterAction(st, p, `適応進化（L1）`, true);
    advanceTrack(st, p, a.track, '適応進化');
    return true;
  };

  // 資源変換： {kind:'EG'|'GE'|'PE'|'PG', n, bonus}
  ACTIONS.convert = (st, p, a) => {
    const n = Math.max(1, a.n | 0);
    const tbl = { EG: ['E', 2, 'G', 1], GE: ['G', 2, 'E', 1], PE: ['P', 8, 'E', 3], PG: ['P', 8, 'G', 2] }[a.kind];
    if (!tbl) throw new Error('変換種別が不正');
    let need = tbl[1] * n;
    if (a.kind === 'EG') { const ca3 = organ(p, 'Ca3'); if (ca3) need = Math.max(n, need - (ca3.strong ? 2 : 1)); }
    if (p[tbl[0]] < need) throw new Error(`${tbl[0]}が足りません`);
    if (!a.bonus) useToken(p, false);
    p[tbl[0]] -= need; p[tbl[2]] += tbl[3] * n;
    afterAction(st, p, `資源変換 ${tbl[0]}${need}→${tbl[2]}${tbl[3] * n}`, !a.bonus);
    return !a.bonus;
  };

  // 予備動員： {res:'E'|'G', bonus}
  ACTIONS.reserve = (st, p, a) => {
    if (!a.bonus) useToken(p, false);
    if (a.res === 'G') p.G += 1; else p.E += 2;
    afterAction(st, p, `予備動員（${a.res === 'G' ? 'G+1' : 'E+2'}）`, !a.bonus);
    return !a.bonus;
  };

  // 個人カード： {card, choice, bonus, shield}  shield＝Wなし実行（社会性の権利・コマを置かず手番も消費しない）
  ACTIONS.card = (st, p, a) => {
    if (!p.cards.includes(a.card)) throw new Error('そのカードを持っていません');
    if (a.shield) { if (p.shields <= 0) throw new Error('Wなし実行権がありません'); if (a.bonus) throw new Error('追加アクション中はWなし実行できません'); }
    const c = a.card; const pt = Math.floor(p.P / 20); let desc = '';
    const before = { E: p.E, G: p.G, P: p.P };
    if (c === 'F' || c === 'G') { if (p.P < 5) throw new Error('Pが足りません'); }
    if (c === 'J') { if (a.choice === 'G') { if (p.G < 1) throw new Error('Gが足りません'); } else if (p.E < 2) throw new Error('Eが足りません'); }
    if (c === 'P') { if (p.E < 3) throw new Error('Eが足りません'); }
    if (a.shield) p.shields -= 1; else if (!a.bonus) useToken(p, false);
    switch (c) {
      case 'A': p.E += 3; break; case 'B': p.G += 2; break; case 'C': p.E += 2; p.G += 1; break;
      case 'D': p.E += 2 + Math.min(3, pt); break; case 'E': p.G += 1 + Math.min(3, pt); break;
      case 'F': p.P -= 5; p.E += 3; break; case 'G': p.P -= 5; p.G += 2; break; case 'H': p.P += 5; break;
      case 'I': p.E += 1; p.G += 1; p.P += 2; break;
      case 'J': if (a.choice === 'G') { p.G -= 1; p.P += 5; } else { p.E -= 2; p.P += 6; } break;
      case 'K': p.E += 2 + p.coop; break; case 'L': p.P += 3 + realGems(p) * 2; break;
      case 'M': p.E += 1 + Math.min(5, p.traits.length); break; case 'N': p.G += 1 + p.lv.intel; break;
      case 'O': { const e = p.E; p.E = 0; p.P += e * 2; break; }
      case 'P': p.E -= 3; p.G += 2; break; case 'Q': p.E += 1; p.G += 1; break;
      case 'R': p.P += 3 + pt; break; case 'S': p.G += p.lv.intel <= 2 ? 3 : 1; break;
      case 'T': p.P += p.breed >= 1 ? 10 : 6; break;
    }
    const d = ['E', 'G', 'P'].map(k => { const v = p[k] - before[k]; return v ? `${k}${v > 0 ? '+' : ''}${v}` : null; }).filter(Boolean).join(' ');
    afterAction(st, p, `カード${c} ${G.CARDS[c].name}（${d}）${a.shield ? '・Wなし実行' : ''}`, !a.bonus && !a.shield);
    return !a.bonus && !a.shield;
  };

  // 応力系：器官アクション {organ:'St1'|'St2'|'St3', pe:n(P), pg:n(P), bonus}
  ACTIONS.stAct = (st, p, a) => {
    const o = organ(p, a.organ); if (!o) throw new Error('その器官を持っていません');
    if (a.organ === 'St1') { const cap = G.ST_CAPS.St1[o.strong ? 0 : 1]; const n = Math.min(cap, (a.pe | 0) - ((a.pe | 0) % 2)); if (n < 2) throw new Error('P2以上'); if (p.P < n) throw new Error('Pが足りません'); if (!a.bonus) useToken(p, false); p.P -= n; p.E += n / 2; afterAction(st, p, `放出腺 P${n}→E${n / 2}`, !a.bonus); return !a.bonus; }
    if (a.organ === 'St2') { const cap = G.ST_CAPS.St2[o.strong ? 0 : 1]; const n = Math.min(cap, (a.pg | 0) - ((a.pg | 0) % 3)); if (n < 3) throw new Error('P3以上'); if (p.P < n) throw new Error('Pが足りません'); if (!a.bonus) useToken(p, false); p.P -= n; p.G += n / 3; afterAction(st, p, `爆発腔 P${n}→G${n / 3}`, !a.bonus); return !a.bonus; }
    // St3
    const pe = Math.min(G.ST_CAPS.St3[0], (a.pe | 0) - ((a.pe | 0) % 2)), pg = Math.min(G.ST_CAPS.St3[1], (a.pg | 0) - ((a.pg | 0) % 3));
    if (pe + pg <= 0) throw new Error('変換量を指定してください'); if (p.P < pe + pg) throw new Error('Pが足りません');
    const free = o.strong; if (free && p.st3Used) throw new Error('臨界炉（強）は1ラウンド1回');
    if (!free && !a.bonus) useToken(p, false); if (free) p.st3Used = true;
    p.P -= pe + pg; p.E += pe / 2; p.G += pg / 3;
    afterAction(st, p, `臨界炉 P${pe + pg}→E${pe / 2} G${pg / 3}${free ? '（トークン不要）' : ''}`, !free && !a.bonus);
    return !free && !a.bonus;
  };

  ACTIONS.cheat = (st, p, a) => { ['E', 'G', 'P', 'L'].forEach(k => { if (typeof a[k] === 'number') p[k] = Math.max(0, a[k]); }); if (typeof a.coop === 'number') p.coop = Math.min(G.COOP_MAX, Math.max(0, a.coop)); log(st, p.id, `[DEBUG] ${p.name} の資源を設定 E${p.E} G${p.G} P${p.P} L${p.L} 協調${p.coop}`); return false; };

  // 無料アクション（トークン・手番を消費しない）
  ACTIONS.freeConv = (st, p, a) => { // 代謝Lv4 / 万象炉強
    const fl3 = organ(p, 'Fl3');
    if (!p.freeConv && !(fl3 && fl3.strong)) throw new Error('無料変換の権利がありません');
    const n = Math.max(1, a.n | 0);
    if (a.dir === 'EG') { if (p.E < n) throw new Error('Eが足りません'); p.E -= n; p.G += n; } else { if (p.G < n) throw new Error('Gが足りません'); p.G -= n; p.E += n; }
    log(st, p.id, `${p.name}：無料変換 ${a.dir === 'EG' ? 'E→G' : 'G→E'} ${n}`); return false;
  };
  function doFlSwap(st, p, a, max) { // 転流（収入時の振替・保留経由のみ）
    const n = Math.max(1, Math.min(max, a.n | 0));
    if (a.dir === 'EG') { if (p.E < n) throw new Error('Eが足りません'); p.E -= n; p.G += n; } else { if (p.G < n) throw new Error('Gが足りません'); p.G -= n; p.E += n; }
    log(st, p.id, `${p.name}：転流（収入時）で振替 ${a.dir === 'EG' ? 'E→G' : 'G→E'} ${n}`);
  }

  // pending 解決
  ACTIONS.resolve = (st, p, a) => {
    const pd = p.pending[0]; if (!pd) throw new Error('解決すべき選択がありません');
    if (pd.type === 'freeMass') { p.pending.shift(); ACTIONS.mass(st, p, { kind: a.kind, traits: a.traits, free: true }); return false; }
    if (pd.type === 'rewardTrait') { p.pending.shift(); if (a.skip) { log(st, p.id, `${p.name}：報酬の形質購入を見送り`); return false; } ACTIONS.trait(st, p, { trait: a.trait, useL: a.useL, res: a.res, track: a.track, viaReward: pd.disc }); return false; }
    if (pd.type === 'bonusAction') { if (!a.skip) throw new Error('追加アクションは対象アクションを直接実行してください'); p.pending.shift(); log(st, p.id, `${p.name}：追加アクションを見送り`); return false; }
    if (pd.type === 'flSwap') { p.pending.shift(); if (a.skip) return false; doFlSwap(st, p, a, pd.max); return false; }
    if (pd.type === 'cvIncome') { p.pending.shift(); const r = a.res || 'E'; gainRes(p, r, pd.n); log(st, p.id, `${p.name}：収斂膜で${r}+${pd.n}`); return false; }
    if (pd.type === 'wildColor') { p.pending.shift(); if (!G.TRACKS.includes(a.track)) throw new Error('色を選んでください'); p.wild = a.track; log(st, p.id, `${p.name}：共鳴膜のワイルド色＝${G.TRACK_INFO[a.track].jp}`); return false; }
    if (pd.type === 'reMilestone') {
      const ok = reachedMilestones(p).some(m => m.track === a.track && m.lv === a.lv); if (!ok) throw new Error('到達済みの報酬を選んでください');
      p.pending.shift();
      const strongVer = pd.organ === 'Re3' && pd.strong; const temp = pd.organ === 'Re1' && !pd.strong;
      applyReward(st, p, a.track, a.lv, strongVer, temp || (pd.organ === 'Re3' && !pd.strong));
      if (pd.organ === 'Re3') p.scanDisc += pd.strong ? 2 : 1;
      log(st, p.id, `${p.name}：${G.ORGANS[pd.organ].name}で ${G.TRACK_INFO[a.track].name}Lv${a.lv} の${strongVer ? '強' : '弱'}版を再発動`);
      return false;
    }
    if (pd.type === 'dgBuy') { p.pending.shift(); if (a.skip) return false; ACTIONS.trait(st, p, { trait: a.trait, useL: a.useL, res: a.res, track: a.track, viaDG: pd.disc }); return false; }
    throw new Error('不明な保留');
  };

  // ---------- 公開API ----------
  const BONUS_OK = { track: 1, breed: 1, organ: 1, scan: 1, convert: 1, reserve: 1, card: 1, stAct: 1 };
  function apply(st, action) {
    if (st.ended) throw new Error('ゲームは終了しています');
    const pid = action.pid; assertTurn(st, pid); const p = P(st, pid);
    const pd = p.pending[0]; let viaBonus = false;
    if (pd && action.type !== 'resolve' && action.type !== 'freeConv' && action.type !== 'cheat') {
      if (pd.type === 'bonusAction' && BONUS_OK[action.type]) { action = Object.assign({}, action, { bonus: true }); viaBonus = true; }
      else throw new Error(pd.type === 'bonusAction' ? '追加アクション（排他なしアクション・個人カード）を今すぐ実行するか見送ってください' : '先に保留中の選択（収入時の振替・遺伝子図書館・報酬）を解決してください');
    }
    // 例外時の巻き戻し用スナップショット（log/history/roundStart は複製しない）
    const lg = st.log, hist = st.history, rs = st.roundStart, logLen = lg.length;
    st.log = []; st.history = []; st.roundStart = null;
    const snap = clone(st);
    st.log = lg; st.history = hist; st.roundStart = rs;
    try {
      const consumed = ACTIONS[action.type](st, p, action);
      if (viaBonus) { const i = p.pending.findIndex(x => x.type === 'bonusAction'); if (i >= 0) p.pending.splice(i, 1); }
      if (consumed !== false || action.type === 'resolve') advanceTurn(st);
      else if (!p.pending.length && p.left.W + p.left.AT === 0) advanceTurn(st);
      return st;
    } catch (e) { Object.assign(st, snap, { log: lg, history: hist, roundStart: rs }); lg.length = logLen; throw e; }
  }
  function stripHistory(st) { const h = st.history; st.history = []; const c = clone(st); st.history = h; return c; }
  function undo() { throw new Error('アンドゥはエントリ列（rebuild）で行います'); }
  function undoRound() { throw new Error('アンドゥはエントリ列（rebuild）で行います'); }

  // ---------- エントリ列（セットアップ＋アクション＋アンドゥ）からの再構築 ----------
  function applyEntry(st, e) {
    switch (e.type) {
      case 'species': chooseSpecies(st, e.pid, e.species); return;
      case 'startTrait': chooseStartTrait(st, e.pid, e.trait); return;
      case 'draft': draftCards(st, e.pid, e.cards); return;
      case 'finish': finishSetup(st); return;
      default: apply(st, e);
    }
  }
  // meta.undoMode: 'free'（誰でも即時）／'approve'（他の参加者全員の undoOk で成立）
  // opts.otherUids(uid) => そのuid以外の参加者uid一覧。opts.oks(entryId) => そのアンドゥ要求に対する承認uid一覧
  function rebuild(meta, entries, opts) {
    opts = opts || {};
    const replay = (list) => {
      const s = newGame(meta); s.roundStarts = []; let lastRound = 0;
      list.forEach((x, i) => { applyEntry(s, x); if (s.round > lastRound) { s.roundStarts.push(i + 1); lastRound = s.round; } });
      return s;
    };
    const eff = []; let st = replay(eff); let pendingUndo = null; const rejected = [];
    const canUndo = (e) => { if (meta.undoMode !== 'approve') return true; const need = opts.otherUids ? opts.otherUids(e.uid) : []; const oks = opts.oks ? opts.oks(e.id) : []; return need.every(u => oks.includes(u)); };
    for (const e of entries) {
      if (e.type === 'undo' || e.type === 'undoRound') {
        if (!canUndo(e)) { pendingUndo = e; continue; }
        if (e.type === 'undo') { if (eff.length && eff[eff.length - 1].type !== 'finish') eff.pop(); }
        else { const rs = st.roundStarts.length ? st.roundStarts[st.roundStarts.length - 1] : 0; eff.length = Math.min(eff.length, rs); }
        st = replay(eff); pendingUndo = null; continue;
      }
      if (e.type === 'undoOk' || e.type === 'undoCancel' || e.type === 'chat' || e.type === 'seat') { if (e.type === 'undoCancel') pendingUndo = null; continue; }
      try { applyEntry(st, e); eff.push(e); if (st.round > (st.roundStarts.length ? st._lr || 0 : 0)) { if (!st.roundStarts.length || st.roundStarts[st.roundStarts.length - 1] !== eff.length) { if (st.round > (st._lr || 0)) st.roundStarts.push(eff.length); } } st._lr = st.round; }
      catch (err) { rejected.push({ entry: e, error: err.message }); }
    }
    st.pendingUndo = pendingUndo; st.rejected = rejected; st.effective = eff.length;
    return st;
  }
  function tryApply(st, action) { const lg = st.log, hist = st.history; st.log = []; st.history = []; const s = clone(st); st.log = lg; st.history = hist; apply(s, action); return s; }

  // ---------- 得点 ----------
  function virtualGems(st, p) {
    let n = p.gemsets;
    const re2 = organ(p, 'Re2'); let wildLeft = re2 ? (re2.strong ? 99 : 1) : 0;
    st.shared.combos.two.forEach(i => {
      const c = G.COMBOS2[i];
      if (c.every(t => p.gems[t] > 0)) { n += 1; return; }
      if (wildLeft > 0 && re2) { const missing = c.filter(t => p.gems[t] === 0); if (missing.length === 1 && (re2.strong ? missing[0] === p.wild : true)) { n += 1; wildLeft -= 1; } }
    });
    st.shared.combos.three.forEach(i => { if (G.COMBOS3[i].every(t => p.gems[t] > 0)) n += 1; });
    return n;
  }
  function score(st, p) {
    const real = realGems(p), vg = virtualGems(st, p), cf = coef(p);
    const R = RS(st);
    const core = (real + vg) * R.gemPt * cf, dev = (p.traits.length + p.coop) * R.devPt, org = p.organs.length * R.organPt, reg = p.regime ? R.regimePt : 0;
    return { total: core + dev + org + reg, core, dev, org, reg, real, vg, cf, gemPt: R.gemPt, devPt: R.devPt, organPt: R.organPt, tie: [real, p.traits.length + p.coop, p.E + p.G + p.P] };
  }
  function endGame(st) {
    st.ended = true; st.phase = 'end';
    st.hist = st.hist || []; st.hist.push({ round: st.round + 1, label: '終了', rows: st.players.map(p => summaryRow(st, p)) });
    const rows = st.players.map(p => Object.assign({ pid: p.id, name: p.name }, score(st, p)));
    rows.sort((a, b) => b.total - a.total || b.tie[0] - a.tie[0] || b.tie[1] - a.tie[1] || b.tie[2] - a.tie[2]);
    st.result = rows;
    log(st, null, '=== ゲーム終了 ===', 'round');
    rows.forEach((r, i) => log(st, r.pid, `${i + 1}位 ${r.name}：${r.total}点（宝石${r.real}+仮想${r.vg} ×${r.gemPt}×${r.cf}＝${r.core}／発展度${r.dev}${r.organPt ? '／器官' + r.org : ''}／体制${r.reg}）`, 'gem'));
  }

  // ---------- 状況照会（UI用） ----------
  function availability(st, p) {
    const out = {};
    G.SLOTS.forEach(s => { const u = slotUsedBy(st, s.id); out[s.id] = { used: u !== undefined, usedBy: u }; });
    return out;
  }
  function summaryRow(st, p) { return { round: st.round, name: p.name, E: p.E, G: p.G, P: p.P, L: p.L, lv: G.TRACKS.map(t => p.lv[t]).join('/'), gems: realGems(p), vg: virtualGems(st, p), coef: coef(p), traits: p.traits.length, organs: p.organs.length, coop: p.coop, score: score(st, p).total }; }

  Object.assign(G, { applyEntry, rebuild, tryApply, flSwapMax, reachedMilestones, newGame, chooseSpecies, chooseStartTrait, draftCards, finishSetup, apply, undo, undoRound, score, realGems, coef, virtualGems, stepCost, organCost, traitCost, massCost, breedCost, gemsetPrice, pbCost, scanCandidates, income, availability, slotUsedBy, summaryRow, comboNames, organ, trait, lineageCount, cur, P, clone });
})((typeof window !== 'undefined' ? window : globalThis).G1 = (typeof window !== 'undefined' ? window : globalThis).G1 || {});
