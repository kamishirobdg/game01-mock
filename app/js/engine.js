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
    const rules = G.RULESETS[opts.rules] ? opts.rules : 'v1';
    const st = {
      version: 1,
      seed: opts.seed | 0, rngState: opts.seed | 0,
      mode: opts.mode || 'expert',
      slotSet: opts.slots === 'm4' ? 'm4' : 'v7', // 資源獲得スロット：v7=現行7／m4=統合4（試作）
      rules, // ルールセット：v1=現行／t1・t2=仮値セット（試作）
      ext: (opts.ext === 'x1' || G.RULESETS[rules].x1) ? 'x1' : 'none', // 拡張：none=現行／x1=形質2枠＋緊急/協調発進＋社会+3（試作。T2は常に込み）
      nPlayers: opts.players.length,
      round: 0, phase: 'setup', setupStep: 'species', setupIdx: 0,
      turnOrder: [], cur: 0,
      shared: { used: {}, organUsed: {}, firsts: {}, traitFirst: {}, organFirst: {}, combos: { two: [], three: [] }, organField: G.ORGAN_FIELD.slice(), lineages: ['Li', 'Tr', 'Fl', 'Rh'], cardPool: G.CARD_ORDER.slice() },
      players: [], log: [], history: [], roundStart: null, ended: false, result: null,
    };
    opts.players.forEach((p, i) => {
      st.players.push({
        id: i, name: p.name || ('P' + (i + 1)), species: null, passive: p.passive !== false, rules: st.rules,
        E: 0, G: 0, P: 0, L: 0, lRemain: G.RULESETS[rules].rounds || G.ROUNDS,
        lv: (() => { const l0 = G.RULESETS[rules].lv0 ? 0 : 1; return { body: l0, intel: l0, social: l0, metab: l0 }; })(), // 試作 lv0：全トラックLv0スタート（6段）
        gems: { body: 0, intel: 0, social: 0, metab: 0 },
        traits: [], organs: [], cards: [], coop: 0, breed: 0, upgrades: 0, pInv: 0, // pInv＝個体数の投入回数（繁殖変換＋大量消費。T3の身体トラック条件）
        tokens: G.RULESETS[rules].gauge ? ['W', 'W', 'W', 'W', 'W'] : ['W', 'W', 'W', 'AT', 'AT'], left: { W: 0, AT: 0 }, // 係数ゲージ方式ではAT/強Wなし（係数は p.upgrades）
        shields: 0, gemsets: 0, inc: { E: 0, G: 0, P: 0 }, regime: false,
        massDisc: 0, traitDisc: 0, alwaysStrong: false, freeConv: false,
        next: { body: 0, intel: 0, any: 0, mass: 0 }, // 次の1回限りの軽減
        flags: { strong: {} }, // strong[track+lv]=true 先着で強を得たか
        round: { firstDone: false, dgUsed: false, flUsed: false, bonus: false, rh3Used: false },
        uses: { li1: 0, tr1: 0, rh1: 0, rh3: 0, ca1: 0, ca2: 0 }, // 弱版の回数カウント
        scanDisc: 0, cv2Granted: 0, wild: null, st3Used: false,
        lInvested: 0, lValue: 3, yieldPick: null, yieldMul: 1, bypassWide: false, // T5：生命核軸（投入回数・1Lの価値・利回りの資源選択・利回り倍率・緊急発進の対象拡大）
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
    if (G.RULESETS[rules].organLineages === 8) { st.shared.lineages = G.LINEAGE_TYPE.cumulative.concat(G.LINEAGE_TYPE.functional); st.shared.organField = st.shared.lineages.flatMap(l => [1, 2, 3].map(t => l + t)); } // T3：全8系統24枚
    if (G.RULESETS[rules].organLineages === 6) { const cum = shuffle(st, G.LINEAGE_TYPE.cumulative).slice(0, 3), fun = shuffle(st, G.LINEAGE_TYPE.functional).slice(0, 3); st.shared.lineages = cum.concat(fun); st.shared.organField = st.shared.lineages.flatMap(l => [1, 2, 3].map(t => l + t)); } // T4：累積3＋機能3＝18枚
    log(st, null, `ゲーム開始（${st.nPlayers}人・${st.mode === 'beginner' ? '初心者' : '熟練者'}セットアップ・${G.SLOT_SET_NAME[st.slotSet]}・ルール${G.RULESETS[st.rules].name}・拡張${G.EXT_NAME[st.ext]}・seed ${st.seed}）`);
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
      if (spId === 'wing') { if (RS(p).lv0) advanceTrack(st, p, 'body', '種族パッシブ'); advanceTrack(st, p, 'body', '種族パッシブ'); } // Lv2到達扱い＝Lv2報酬（P+8）も得る（lv0 では 0→2）
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
      if (st.setupIdx >= st.nPlayers) { if (handSize(st) === 0) { st.setupStep = 'ready'; finishSetup(st); return; } st.setupStep = 'draft'; st.setupOrder = st.players.map(p => p.id).reverse(); st.setupIdx = 0; }
      else st.setupStep = 'species';
    } else if (st.setupStep === 'draft') {
      st.setupIdx += 1;
      if (st.setupIdx >= st.setupOrder.length) { st.setupStep = 'ready'; finishSetup(st); }
    }
  }
  function handSize(st) { return RS(st).noCards ? 0 : G.HAND_SIZE[st.nPlayers]; } // 試作 noCards：個人カードなし（ドラフト省略）
  function chooseStartTrait(st, pid, tid) { // 九腕知性体
    const p = P(st, pid); const t = G.TRAITS[tid];
    if (t.cost[0] > 4) throw new Error('コストG4以下の形質のみ');
    if (p.species !== 'arm') throw new Error('九腕知性体のみ');
    giveTrait(st, p, tid, true, 'passive');
    if (st.phase === 'setup' && st.setupStep === 'armTrait') advanceSetup(st);
  }
  function draftCards(st, pid, ids) {
    const p = P(st, pid); const need = handSize(st);
    if (ids.length !== need) throw new Error(`${need}枚選んでください`);
    ids.forEach(id => { const k = st.shared.cardPool.indexOf(id); if (k < 0) throw new Error('そのカードは選べません'); st.shared.cardPool.splice(k, 1); });
    p.cards = ids.slice();
    log(st, pid, `${p.name} が個人カード ${ids.join('・')} をドラフト`);
    if (st.phase === 'setup' && st.setupStep === 'draft') advanceSetup(st);
  }
  function finishSetup(st) {
    if (st.phase !== 'setup') return; // 既に開始済み（ドラフト完了時に自動開始するため 'finish' エントリは冪等）
    if (st.players.some(p => !p.species || p.cards.length !== handSize(st))) throw new Error('セットアップが完了していません');
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
    st.shared.used = {}; st.shared.organUsed = {};
    st.players.forEach(p => {
      // 収入
      p._round = st.round; const inc = income(p); // 利回りは受け取る前の保有Lで計算（p._round＝これから始まるラウンド番号。yieldByRound 用）
      p.lRemain -= 1; p.L += 1;
      p.E += inc.E; p.G += inc.G; p.P += inc.P;
      if (inc.lyield && p.yieldPick) p.pending.push({ type: 'lYield', n: inc.lyield, opts: p.yieldPick });
      // トークン
      p.left = { W: p.tokens.filter(t => t !== 'AT').length, AT: p.tokens.filter(t => t === 'AT').length };
      p.round = { firstDone: false, rh3Used: false }; p.st3Used = false;
      log(st, p.id, `収入 E+${inc.E} G+${inc.G} P+${inc.P} L+1（${inc.parts.join('・')}）`);
      const cv1 = organ(p, 'Cv1'); if (cv1) { const n = Math.floor(p.organs.length / (cv1.strong ? 2 : 3)); if (n > 0) p.pending.push({ type: 'cvIncome', n }); }
      const flMax = flSwapMax(p); if (flMax) p.pending.push({ type: 'flSwap', max: flMax });
      if (trait(p, 'DG')) p.pending.push({ type: 'dgBuy', disc: (trait(p, 'DG').strong ? 2 : 1) + (RS(p).traitGateBoost ? 1 : 0) });
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
    add('基礎', RS(p).incE, RS(p).incG, RS(p).incP);
    add('恒久(種族/体制)', p.inc.E, p.inc.G, p.inc.P);
    if (p.lv.metab >= 2) add('代謝Lv2', 1, 0, 0);
    if (p.lv.metab >= 3 && p.flags.strong['metab3']) add('代謝Lv3強', 1, 1, 0);
    if (p.lv.intel >= 3 && !p.flags.strong['intel3']) add('知性Lv3弱', 0, 1, 0);
    if (p.lv.metab >= 5) { const k = p.flags.strong['metab5'] ? 2 : 1; add('代謝Lv5', k, k, k); }
    const cv3 = organ(p, 'Cv3'); if (cv3) { const n = p.organs.length; const k = cv3.strong ? (n >= 9 ? 2 : n >= 6 ? 1 : 0) : (n >= 7 ? 1 : 0); add('極相体', k, k, k); }
    if (RS(p).lYield) { const rate = RS(p).yieldByRound ? (RS(p).yieldByRound[Math.min(RS(p).yieldByRound.length - 1, (p._round || 0) + 1)] || 0) : RS(p).lYield; const n = p.L * (rate + (p.yieldAdd || 0)) * (p.yieldMul || 1); if (n > 0) { inc.lyield = n; if (p.yieldPick) inc.parts.push(`生命核利回り ${n}（資源を選択）`); else add('生命核利回り', n, 0, 0); } } // T5（yieldByRound＝次ラウンド番号で引く）
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
    const lv = p.lv[track]; if (lv >= (RS(p).maxLv || 5)) return null;
    if (lv === 4 && RS(p).lv5G) { const g = gateReq(p, track); if (g && g.have >= g.need) return 0; } // 試作 lv5G：ゲート充足ならEは不要（Gのみ）
    const base = (track === 'body' && RS(p).bodyStep) ? RS(p).bodyStep[lv] : RS(p).step[lv]; let d = 0; // 試作 bodyStep：身体だけ別のコスト表
    if (track === 'body') { if (trait(p, 'DB') && trait(p, 'DB').strong) d += 2; d += p.next.body; }
    if (track === 'intel') { if (trait(p, 'DI') && trait(p, 'DI').strong) d += 2; d += p.next.intel; }
    const dv = trait(p, 'DV'); if (dv) d += dv.strong ? 2 : 1;
    const xd = trait(p, 'XD'); if (xd) d += xd.strong ? 3 : 2; // 試作 上位形質・適応爆発
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
    let [e, g] = (RS(p).organCost || G.ORGAN_COST)[n]; if (!strong) g = 0;
    if (RS(p).organEscalate) e += Math.floor(p.organs.length / RS(p).organEscalate); // T4：所持器官数が増えるほど建造コスト+1E（N枚ごと）
    const ca1 = organ(p, 'Ca1'); if (ca1 && (ca1.strong || p.uses.ca1 < 3)) e -= 1;
    const ca3 = organ(p, 'Ca3'); if (ca3) e -= ca3.strong ? 2 : 1;
    e = Math.max(1, e);
    e = applyRh2(p, e);
    return { E: e, G: g, strong };
  }
  function traitCost(st, p, tid, viaReward) {
    const t = G.TRAITS[tid];
    const strong = st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id || p.alwaysStrong;
    const tw = RS(p).traitCostTweak ? { DV: [6, 5], DG: [5, 4], MB: [5, 4] }[tid] : null; // 試作 traitCostTweak
    let c = (tw || t.cost)[strong ? 0 : 1];
    c -= p.traitDisc;
    const tr1 = organ(p, 'Tr1'); if (tr1 && (tr1.strong || p.uses.tr1 < 3)) c -= 1;
    const tr2 = organ(p, 'Tr2'); if (tr2) c -= tr2.strong ? 2 : 1;
    const tr3 = organ(p, 'Tr3'); if (tr3) c -= tr3.strong ? 3 : 2;
    if (viaReward) c -= viaReward;
    const floor = RS(p).traitHalfFloor ? Math.max(1, ceilHalf(t.cost[strong ? 0 : 1])) : 1; // 試作 traitHalfFloor：元コストの半分（切上）を下回らない
    return { G: Math.max(floor, c), strong };
  }
  function massCost(p, kind) {
    const R = RS(p); let c = R.massCost;
    const mc = trait(p, 'MC'); if (mc && mc.strong) c -= R.mcDisc; c -= p.next.mass;
    if (kind === 'MB') { c -= p.massDisc; const mb = trait(p, 'MB'); if (mb) c -= R.mbDisc; return Math.max(R.massMin.body, c); }
    if (kind === 'MM' && R.mmCost) return Math.max(R.massMin.other, Math.min(c, R.mmCost)); // 試作 mmCost
    if (kind === 'MS' && R.msCost) return Math.max(R.massMin.other, Math.min(c, R.msCost)); // 試作 msCost
    return Math.max(R.massMin.other, c);
  }
  // T3：トラックの次のLvに必要な収集物（gates）。無ければ null
  function gateCount(p, track) {
    let n = track === 'metab' ? p.organs.length : track === 'intel' ? p.traits.length : track === 'social' ? p.coop : RS(p).bodyAxis === 'L' ? (p.lInvested || 0) : (RS(p).pInvKinds === 'bodyOnly' ? (p.pInvBody || 0) : (p.pInv || 0));
    if (RS(p).traitGateBoost) { // 試作：割引系形質を収集の加速に（強＝+1・弱＝0。DVは全色・強+1／弱は身体と知性のみ）
      const b = (id) => { const t = trait(p, id); return t ? (t.strong ? 1 : 0) : 0; };
      if (track === 'body') n += b('DB'); if (track === 'intel') n += b('DI');
      const da = trait(p, 'DA'); if (da && da.strong && da.track === track) n += 1;
      const dv = trait(p, 'DV'); if (dv) { if (dv.strong) n += 1; else if (track === 'body' || track === 'intel') n += 1; }
    }
    return n;
  }
  function gateLabel(st, t) { return t === 'body' && RS(st).bodyAxis === 'L' ? G.GATE_LABEL_L : G.GATE_LABEL[t]; }
  function gateNote(st, t, lv) { const R = RS(st); return (t === 'body' && lv === 4 && R.bodyAxis === 'L' && R.bodyBulkLv4) ? `（うち1回は${R.bodyBulkLv4}個を同時に投入）` : ''; } // 身体Lv4の一括投入条件の注記
  function gateShort(st, t) { return t === 'body' && RS(st).bodyAxis === 'L' ? G.GATE_SHORT_L : G.GATE_SHORT[t]; }
  function investL(p, st) { if (RS(p).bodyAxis !== 'L') return; const r = p._round || 0; if (RS(p).lInvPerRound) { if (p._lInvRound === r) { p.lInvestedRaw = (p.lInvestedRaw || 0) + 1; return; } p._lInvRound = r; } p.lInvested = (p.lInvested || 0) + 1; if (RS(p).investPrepay) { const RN = RS(p).rounds || G.ROUNDS; const e = Math.max(0, RN - r); if (e > 0) { p.E += e; p._prepay = (p._prepay || 0) + e; } } } // 投入回数（lInvPerRound＝1R1回だけ加算／investPrepay＝残R数ぶんのE即時）
  function gateReq(p, track) { const g = RS(p).gates; if (!g) return null; const next = p.lv[track] + 1; if (next > 5) return null; return { need: g[track][next], have: gateCount(p, track) }; }
  // T3：収集物の数で「到達済みとみなす段」（autoLv）。この段までは自動で上がる。Eでの進行は制限なし（v3.16で先買い1段の制限を撤廃）
  function autoLv(p, track) { const g = RS(p).gates; if (!g) return null; const have = gateCount(p, track); const cap = RS(p).lv5G ? 4 : 5; let l = RS(p).lv0 ? 0 : 1; while (l < cap && have >= g[track][l + 1]) { if (track === 'body' && l === 3 && RS(p).bodyBulkLv4 && !p.lBulk) break; l++; } return l; } // 試作 bodyBulkLv4：身体Lv4は「2個以上を同時投入」した経験が要る
  // 報酬の連鎖（協調+1→社会 等）も拾うため、安定するまで繰り返す
  function syncGates(st, p) {
    if (!RS(p).gates) return;
    for (let guard = 0; guard < 20; guard++) {
      const t = G.TRACKS.find(tr => p.lv[tr] < autoLv(p, tr));
      if (!t) break;
      advanceTrack(st, p, t, `${gateLabel(st, t)}${gateCount(p, t)}で自動進行`);
    }
  }
  function breedCost(p) { if (p.breed >= 2) return null; const mb = trait(p, 'MB'); const c = RS(p).breed[p.breed]; return mb && mb.strong ? Math.ceil(c / 2) : c; }
  function gemsetPrice(p) { return Math.max(G.GEMSET_FLOOR, G.GEMSET_BASE - p.traits.length - (RS(p).gemsetCoopDisc ? Math.floor(p.coop / 2) : 0)) + (RS(p).gemsetEscalate ? RS(p).gemsetEscalate * p.gemsets : 0); } // 試作 gemsetEscalate：購入ごとに+N／gemsetCoopDisc：−協調÷2
  function pbCost(p) { const tr3 = organ(p, 'Tr3'); return Math.max(1, 2 - (tr3 ? (tr3.strong ? 3 : 2) : 0)); }

  // ---------- 支払い ----------
  // pay: {E:n} を E と L（1L=3E）で支払う。useL = 使うL個数
  function payE(p, amount, useL) {
    useL = useL | 0;
    if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const lv = p.lValue || 3; const covered = useL * lv; const needE = Math.max(0, amount - covered);
    if (p.E < needE) throw new Error(`エネルギーが足りません（必要E${amount}・所持E${p.E}${p.L ? `・生命核1=E${lv}で補えます` : ''}）`);
    p.E -= needE; p.L -= useL; if (useL > 0) investL(p, null); if (RS(p).bodyBulkLv4 && useL >= RS(p).bodyBulkLv4) p.lBulk = true;
    return { E: needE, L: useL };
  }
  function payG(p, amount, useL) {
    useL = useL | 0; if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const lv = p.lValue || 3; const needG = Math.max(0, amount - useL * lv); if (p.G < needG) throw new Error(`遺伝子が足りません（必要G${amount}・所持G${p.G}${p.L ? `・生命核1=G${lv}で補えます` : ''}）`);
    p.G -= needG; p.L -= useL; if (useL > 0) investL(p, null); if (RS(p).bodyBulkLv4 && useL >= RS(p).bodyBulkLv4) p.lBulk = true; return { G: needG, L: useL };
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
    if (opt.bodyMass && p.flags.strong['body5'] && RS(p).bodyAxis !== 'L') { if (RS(p).body5Once) { if (p.round.mbBypass) throw new Error('身体Lv5★の排他無視はこの数値セットでは1ラウンド1回です'); p.round.mbBypass = true; } return { bypass: 'body5' }; }
    if (!p.round.firstDone) { const o = organ(p, 'Rh3'); if (o && (o.strong || p.uses.rh3 < 3)) { if (!o.strong) p.uses.rh3 += 1; return { bypass: 'Rh3' }; } }
    // 突破できるスロット：資源獲得（現行）＋形質購入2枠（拡張x1）。手段＝緊急発進（L1）／協調発進（協調2個・拡張x1）
    const byp = bypassable(st, slotId, p);
    if (opt.useL && byp) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; investL(p, null); return { bypass: 'L' }; }
    if (opt.useCoop && byp && st.ext === 'x1') { if (p.coop < 2) throw new Error('協調トークンが2個ありません'); p.coop -= 2; return { bypass: 'coop' }; }
    const ways = byp ? [p.L > 0 ? '緊急発進＝生命核1' : null, st.ext === 'x1' && p.coop >= 2 ? '協調発進＝協調2' : null].filter(Boolean) : [];
    throw new Error(`このスロットは今ラウンド ${P(st, st.shared.used[key]).name} が使用済みです${byp ? (ways.length ? `（${ways.join('／')}で使えます）` : '（生命核があれば緊急発進で使えます）') : '（次のラウンドまで待ってください）'}`);
  }
  function bypassable(st, slotId, p) { if (G.RES_SLOTS.includes(slotId) || (st.ext === 'x1' && G.TRAIT_SLOTS.includes(slotId))) return true; if (p && p.bypassWide) { const s = G.SLOT_BY_ID[slotId]; return !!s && (s.group === 'mass' || slotId === 'GEM' || G.TRAIT_SLOTS.includes(slotId)); } return false; } // T5 身体Lv3★強：緊急発進の対象に大量消費・宝石セット・形質購入
  const bypassDesc = (b) => b === 'L' ? '緊急発進（L-1）' : b === 'coop' ? '協調発進（協調-2）' : `排他突破（${b}）`;
  // コマを置かない実行（Wなし実行）用：使用可否だけ判定し、使用済みにはしない
  function peekSlot(st, p, slotId, opt) {
    opt = opt || {};
    const key = usedKey(st, slotId);
    if (st.shared.used[key] === undefined) return { bypass: null };
    if (opt.useL && G.RES_SLOTS.includes(slotId)) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; investL(p, null); return { bypass: 'L' }; }
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
    if (st.round >= (RS(st).rounds || G.ROUNDS)) { endGame(st); return; }
    startRound(st);
  }

  // ---------- 効果適用 ----------
  function gainRes(p, res, n) { if (res === 'coop') { p.coop = Math.min(G.COOP_MAX, p.coop + n); if (p.coop >= 8 && !p._coop8) { p._coop8 = true; p._coop8Due = true; } } else p[res] += n; } // _coop8Due：協調8初到達の報酬を apply 後に処理（試作 coop8Gem／coop8Coef）
  function addUpgrade(st, p, why) {
    if (p.upgrades >= 4) { log(st, p.id, `（係数は上限×7のため ${why} の+1は無効）`); return; }
    if (!RS(p).gauge) { // コマ方式：AT→W→強W に置き換える（係数ゲージ方式ではコマは触らない）
      const i = p.tokens.indexOf('AT');
      if (i >= 0) { p.tokens[i] = 'W'; p.left.W += 1; p.left.AT = Math.max(0, p.left.AT - 0); // 活性化：今Rの残トークンは AT→W に読み替え
        // 残っていたATを1つWへ振替
        if (p.left.AT > 0) { p.left.AT -= 1; } else { p.left.W -= 1; } // 活性化は未使用ATがあれば振替、なければ使用済み扱い
      } else { const j = p.tokens.indexOf('W'); if (j >= 0) p.tokens[j] = 'S'; }
    }
    p.upgrades += 1;
    log(st, p.id, `${p.name}：${why} → 係数 ×${coef(p)}`);
  }
  function addGem(st, p, track, n, why) { p.gems[track] += n; log(st, p.id, `${p.name}：${G.TRACK_INFO[track].jp}宝石+${n}（${why}）`, 'gem'); }

  function advanceTrack(st, p, track, why) {
    if (p.lv[track] >= (RS(p).maxLv || 5)) return false;
    p.lv[track] += 1; const lv = p.lv[track];
    if (lv === 6) { addGem(st, p, track, 1, `${G.TRACK_INFO[track].name} Lv6`); log(st, p.id, `${p.name}：${G.TRACK_INFO[track].name} Lv6（${why}）`); return true; } // 試作 maxLv=6：Lv6 は宝石+1のみ（先着なし・固有報酬なし）
    let strong = false;
    if (lv === 3 || lv === 5) {
      const key = track + lv;
      if (st.shared.firsts[key] === undefined) { st.shared.firsts[key] = p.id; strong = true; }
      // JI/JB 弱：Lv5★で必ず強効果
      if (lv === 5 && !strong) { const t = trait(p, track === 'intel' ? 'JI' : 'JB'); if (t && !t.strong) strong = true; }
      p.flags.strong[key] = strong;
      if (track === 'body' && RS(p).bodyCoef) { addUpgrade(st, p, `身体適応 Lv${lv}★（係数軸）`); if (lv === 5 && strong) { p.P += 10; log(st, p.id, `${p.name}：先着ボーナス P+10`); } } // 試作 bodyCoef：身体は宝石でなく係数の軸
      else { addGem(st, p, track, 1, `${G.TRACK_INFO[track].name} Lv${lv}★${strong ? '・先着' : ''}`); if (lv === 5 && strong) addGem(st, p, track, 1, '先着ボーナス'); }
    }
    log(st, p.id, `${p.name}：${G.TRACK_INFO[track].name} Lv${lv}（${why}）`);
    applyReward(st, p, track, lv, strong, false);
    return true;
  }
  // 固有報酬。temp=true は感応T1弱の「恒久効果は一時扱い」
  function applyReward(st, p, track, lv, strong, temp) {
    if (track === 'body' && RS(p).bodyAxis === 'L') { // T5：身体＝生命核軸（宝石・係数・大量消費の軽減は持たない）
      if (lv === 2) { p.yieldPick = ['E', 'G']; if (RS(p).body2L) p.L += 1; if (RS(p).body2Gem) addGem(st, p, 'body', 1, '身体適応 Lv2（生命核軸）'); if (RS(p).lValueLv2) p.lValue = Math.max(p.lValue || 3, 4); }
      if (lv === 3) { p.L += 1; if (strong) { if (RS(p).body3YieldAdd) p.yieldAdd = (p.yieldAdd || 0) + 1; else p.bypassWide = true; } }
      if (lv === 4) { p.lValue = Math.max(p.lValue || 3, 4); p.yieldPick = ['E', 'G', 'P']; if (RS(p).bodyLv4Gem) addGem(st, p, 'body', 1, '身体適応 Lv4（生命核軸）'); }
      if (lv === 5) { p.L += 1; if (strong) { if (RS(p).body5Coef) addUpgrade(st, p, '身体適応 Lv5★（生命核軸）'); else p.yieldMul = 2; } }
    } else if (track === 'body') {
      if (lv === 2) p.P += 8;
      if (lv === 3) { if (strong) p.pending.push({ type: 'freeMass' }); else p.P += 15; }
      if (lv === 4) p.massDisc += RS(p).massDiscLv;
      if (lv === 5) p.massDisc += RS(p).massDiscLv;
    }
    if (track === 'intel') {
      if (lv === 2) p.G += 3;
      if (lv === 3) { if (strong) p.pending.push({ type: 'rewardTrait', disc: 3 }); else if (temp) p.G += 1; /* 弱の恒久G+1/Rは income() で参照 */ }
      if (lv === 4) { if (RS(p).intel4 === 'traitDisc') { if (!temp) p.traitDisc += 1; } else p.pending.push({ type: 'bonusAction' }); }
      if (lv === 5) { if (strong) { p.traitDisc = 2; p.alwaysStrong = true; } else p.G += 6; }
    }
    if (track === 'social') {
      if (RS(p).socialRewards === 'shield') { // T4：協調を報酬から外す（自己参照の解消）
        if (lv === 2) p.P += 6;
        if (lv === 3) { if (strong) p.shields += 1; else p.P += 10; }
        if (lv === 4) { p.shields += 1; if (RS(p).social4Gem) addGem(st, p, 'social', 1, '社会性 Lv4（協調軸）'); }
        if (lv === 5) p.shields += strong ? 2 : 1;
      } else {
        if (lv === 2) gainRes(p, 'coop', 1);
        if (lv === 3) { if (strong) gainRes(p, 'coop', 2); else { gainRes(p, 'coop', 1); p.G += 3; } }
        if (lv === 4) p.shields += 1;
        if (lv === 5) { gainRes(p, 'coop', 1); p.shields += strong ? 2 : 1; }
      }
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
      if (tid === 'DB') p.next.body += 2; if (tid === 'DI') p.next.intel += 2; if (tid === 'MC') p.next.mass += RS(p).mcDisc; if (tid === 'DA') p.next.any += 1;
    }
    const jmax = RS(p).jumpMaxLv || 99; // 試作 jumpMaxLv：跳躍で上がれる上限（Lv6 は飛び越えない）
    if (tid === 'JI') { if (p.lv.intel < jmax) advanceTrack(st, p, 'intel', '知的跳躍'); if (strong && p.lv.intel < jmax) advanceTrack(st, p, 'intel', '知的跳躍'); }
    if (tid === 'JB') { if (p.lv.body < jmax) advanceTrack(st, p, 'body', '身体覚醒'); if (strong && p.lv.body < jmax) advanceTrack(st, p, 'body', '身体覚醒'); }
    const n = p.traits.length; if ((RS(p).traitCoef || [4, 8]).includes(n)) addUpgrade(st, p, `形質${n}枚目`);
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
    if (RS(p).herd && (a.slot === 'EG' || a.slot === 'GG') && p.P < (RS(p).herdCost || 6)) throw new Error(`個体数が足りません（群体はP${RS(p).herdCost || 6}を払い資源＋協調+1）`);
    // Wなし実行はコマを置かないのでスロットを占有しない（使用済みにしない）。既に使用済みのスロットは不可（緊急発進との併用は可）
    const cl = a.shield ? peekSlot(st, p, a.slot, { useL: a.useL }) : claimSlot(st, p, a.slot, { useL: a.useL, useCoop: a.bypassCoop });
    if (cl.bypass === 'coop' && RS(p).bypassCoopFull) cb = p.coop; // 協調2を払った後の協調数ぶん（試作 bypassCoopFull）
    if (a.shield) p.shields -= 1; else tok = useToken(p, false);
    const pt = Math.floor(p.P / 10);
    const desc = [];
    const cbBase = RS(p).coopBonusCap !== undefined ? Math.min(p.coop, RS(p).coopBonusCap) : p.coop; // 協調ボーナス（T4は上限+4）
    let cb = cbBase; // bypassCoopFull：協調発進で使った枠は上限なし（claimSlot 後に差し替え）
    const coopTo = (res) => { if (cb > 0) { gainRes(p, res, cb); desc.push(`協調+${cb}${res}`); } };
    const herd = !!RS(p).herd, hc = RS(p).herdCost || 6; // T4：群体E/G＝Pを払って資源＋協調+1
    if (a.slot === 'E5') { p.E += 5; coopTo('E'); desc.unshift('固定E強 +5E'); }
    const hcp = RS(p).herdCoop || 1; // 試作 herdCoop
    if (a.slot === 'EG') { if (herd) { p.P -= hc; p.E += 3; gainRes(p, 'coop', hcp); coopTo('E'); desc.unshift(`群体E P${hc}→E+3・協調+${hcp}`); } else { p.E += 2 + pt; coopTo('E'); desc.unshift(`群体E +${2 + pt}E`); } }
    if (a.slot === 'G3') { p.G += 3; coopTo('G'); desc.unshift('固定G強 +3G'); }
    if (a.slot === 'GG') { if (herd) { p.P -= hc; p.G += 2; gainRes(p, 'coop', hcp); coopTo('G'); desc.unshift(`群体G P${hc}→G+2・協調+${hcp}`); } else { p.G += 1 + pt; coopTo('G'); desc.unshift(`群体G +${1 + pt}G`); } }
    if (a.slot === 'P8') { const n8 = RS(p).p8 || 8; p.P += n8; coopTo('P'); desc.unshift(`P増加 +${n8}P`); }
    if (a.slot === 'ALL') { p.E += 2; p.G += 1; p.P += 4; coopTo(a.coopRes || 'E'); desc.unshift('全資源 +2E+1G+4P'); }
    if (a.slot === 'PB') { const c = pbCost(p); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; p.P += 10; desc.unshift(`Pブースト G${c}→P+10`); }
    if (cl.bypass) desc.push(bypassDesc(cl.bypass));
    if (a.shield) desc.push('Wなし実行');
    afterAction(st, p, desc.join('・'), !a.shield);
    return !a.shield;
  };

  // トラック進行： {track, pay:'E'|'P'|'G', useL, bonus}
  ACTIONS.track = (st, p, a) => {
    const c = stepCost(p, a.track, a.bonus); if (c === null) throw new Error('Lv5です');
    if (a.track === 'body' && RS(p).bodyNoE && p.lv.body < 5) throw new Error('この数値セットでは身体は生命核の投入でのみ上がります（Lv6はEで可）'); // 試作 bodyNoE
    const g5 = (p.lv[a.track] === 4 && RS(p).lv5G) ? RS(p).lv5G : (p.lv[a.track] === 5 && RS(p).lv6G) ? RS(p).lv6G : 0; if (g5 && p.G < g5) throw new Error(`Lv${p.lv[a.track] + 1}に入るには遺伝子G${g5}が必要です`); // 試作 lv5G／lv6G（Lv6はE＋Gの両方）
    if (!a.bonus) useToken(p, true);
    let paid;
    if ((a.pay === 'P' || a.pay === 'G') && RS(p).noAlt) throw new Error('この数値セットでは代替払い（P／G）はありません');
    if (a.pay === 'P') { if (a.track !== 'body') throw new Error('Pで払えるのは身体のみ'); if (p.P < c * 3) throw new Error('Pが足りません'); p.P -= c * 3; paid = `P${c * 3}`; }
    else if (a.pay === 'G') { if (a.track !== 'intel') throw new Error('Gで払えるのは知性のみ'); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; paid = `G${c}`; }
    else { const r = payE(p, c, a.useL); paid = `E${r.E}${r.L ? '+L' + r.L : ''}`; }
    if (g5) { p.G -= g5; paid += `+G${g5}`; }
    consumeNext(p, a.track);
    { const ca2 = organ(p, 'Ca2'); if (ca2 && !ca2.strong && p.uses.ca2 < 3) p.uses.ca2 += 1; }
    afterAction(st, p, `${G.TRACK_INFO[a.track].name}を進行（${paid}${a.bonus ? '・追加アクション半額' : ''}）`, !a.bonus);
    advanceTrack(st, p, a.track, '進行');
    return !a.bonus;
  };

  // 繁殖変換： {bonus}
  ACTIONS.breed = (st, p, a) => {
    const c = breedCost(p); if (c === null) throw new Error('繁殖は×5が上限');
    if (!RS(p).gauge && !p.tokens.includes('AT')) throw new Error('活性化できる追加コマ（AT）がありません');
    const eAlt = a.pay === 'E' && RS(p).breedE ? RS(p).breedE[p.breed] : null; // 試作 breedE：Eでも払える
    const lAlt = a.pay === 'L' && RS(p).breedL ? RS(p).breedL : null; // 試作 breedL：生命核でも払える（投入回数に数える）
    if (lAlt !== null) { if (p.L < lAlt) throw new Error(`生命核が足りません（必要L${lAlt}）`); } else if (eAlt !== null) { if (p.E < eAlt) throw new Error(`エネルギーが足りません（必要E${eAlt}）`); } else if (p.P < c) throw new Error(`個体数が足りません（必要P${c}・所持P${p.P}）`);
    if (!a.bonus) useToken(p, true);
    if (lAlt !== null) { p.L -= lAlt; investL(p, st); if (RS(p).bodyBulkLv4 && lAlt >= RS(p).bodyBulkLv4) p.lBulk = true; } else if (eAlt !== null) p.E -= eAlt; else { p.P -= c; p.pInv = (p.pInv || 0) + 1; p.pInvBody = (p.pInvBody || 0) + 1; }
    p.breed += 1;
    afterAction(st, p, `繁殖変換（${lAlt !== null ? 'L' + lAlt : eAlt !== null ? 'E' + eAlt : 'P' + c}）`, !a.bonus);
    addUpgrade(st, p, `繁殖×${3 + p.breed}`);
    return !a.bonus;
  };

  // 器官建造： {organ, useL, li2Res, li3Res, bonus}
  ACTIONS.organ = (st, p, a) => {
    const c = organCost(st, p, a.organ); if (!c) throw new Error('その器官は今は建造できません（系統内は階層順）');
    if (organ(p, a.organ)) throw new Error('建造済みです');
    if (RS(st).organExcl) { const u = st.shared.organUsed[a.organ]; if (u !== undefined && u !== p.id) throw new Error(`このカードは今ラウンド ${P(st, u).name} が建造しました（1ラウンド1人）`); }
    let e = c.E; if (a.bonus) e = ceilHalf(e);
    if (!a.bonus) useToken(p, false);
    const r = payE(p, e, a.useL); if (c.G) { if (p.G < c.G) throw new Error('Gが足りません'); p.G -= c.G; }
    if (c.strong) st.shared.organFirst[a.organ] = p.id;
    { const ca1 = organ(p, 'Ca1'); if (ca1 && !ca1.strong && p.uses.ca1 < 3) p.uses.ca1 += 1; }
    // 建造前の連結効果（既存の器官が反応）
    const li1 = organ(p, 'Li1'); if (li1) { if (li1.strong) p.E += 1; else if (p.uses.li1 < 3) { p.uses.li1 += 1; p.E += 1; } }
    const li2 = organ(p, 'Li2'); if (li2) gainRes(p, a.li2Res || 'E', li2.strong ? 2 : 1);
    p.organs.push({ id: a.organ, strong: c.strong }); if (RS(st).organExcl) st.shared.organUsed[a.organ] = p.id;
    if (a.organ === 'Rh1' && RS(p).rhLife) { p.L += 1; if (c.strong) p.lValue = (p.lValue || 3) + 1; log(st, p.id, `${p.name}：先導（生命核版）で L+1${c.strong ? '・1Lの価値+1' : ''}`); } // 試作 rhLife
    afterAction(st, p, `器官 ${a.organ} ${G.ORGANS[a.organ].name} を建造（${c.strong ? '強' : '弱'}・E${r.E}${r.L ? '+L' + r.L : ''}${c.G ? '+G' + c.G : ''}）`, !a.bonus);
    const lin = G.ORGANS[a.organ].lin;
    if (lineageCount(p, lin) === 3) {
      const done = st.shared.lineages.filter(l => lineageCount(p, l) === 3).length; // 完成済み系統数（今回を含む）
      if (RS(p).lineageCoefMax !== undefined && done > RS(p).lineageCoefMax) log(st, p.id, `${p.name}：${G.LINEAGES[lin]}系統完成（係数+1は${RS(p).lineageCoefMax}系統目まで・今回は無し）`); else addUpgrade(st, p, `${G.LINEAGES[lin]}系統完成`);
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
    let byp = null;
    const lm = (!a.free && a.kind === 'MB' && a.pay === 'L' && RS(p).massL) ? RS(p).massL : null; // 試作 massL：大量消費(身体)を生命核でも
    if (lm !== null) { if (p.L < lm) throw new Error(`生命核が足りません（必要L${lm}）`); byp = claimSlot(st, p, a.kind, { bodyMass: true, useL: a.bypassL }).bypass; useToken(p, false); p.L -= lm; investL(p, st); if (RS(p).bodyBulkLv4 && lm >= RS(p).bodyBulkLv4) p.lBulk = true; }
    else if (!a.free) { if (p.P < c) throw new Error(`個体数が足りません（必要P${c}・所持P${p.P}）`); byp = claimSlot(st, p, a.kind, { bodyMass: a.kind === 'MB', useL: a.bypassL }).bypass; useToken(p, false); p.P -= c; p.next.mass = 0; }
    const desc = `${G.SLOT_BY_ID[a.kind].name}（${a.free ? '無料・報酬' : lm !== null ? 'L' + lm : 'P' + c}）${byp ? '・' + bypassDesc(byp) : ''}`;
    afterAction(st, p, desc, !a.free);
    if (a.kind === 'MB') addGem(st, p, 'body', 1, '大量消費');
    if (a.kind === 'MS') { gainRes(p, 'coop', RS(p).msCoop !== undefined ? RS(p).msCoop : (st.ext === 'x1' ? 3 : 2)); if (RS(p).msGem) addGem(st, p, 'social', 1, '大量消費(社会)'); }
    p.pInv = (p.pInv || 0) + 1; if (a.kind === 'MB') p.pInvBody = (p.pInvBody || 0) + 1;
    if (a.kind === 'MM') { p.E += 10; p.G += 10; }
    if (a.kind === 'MI') {
      const ids = (a.traits || []).slice(0, 2);
      ids.forEach(t => { if (G.TRAITS[t].cost[0] > 4) throw new Error('G4以下の形質のみ'); });
      if (ids.length === 2 && ids[0] === ids[1]) throw new Error('異なる2種');
      ids.forEach(t => giveTrait(st, p, t, false, '大量消費(知性)'));
    }
    return !a.free;
  };

  // 形質購入枠の確保（拡張x1：slot='TRT2'＝割増枠＝ラウンド数ぶんのEを追加で支払う／bypassL・bypassCoop＝使用済み枠の突破）
  function claimTraitSlot(st, p, a) {
    if (RS(p).traitShared) { if (a.slot === 'TRT2') throw new Error('この数値セットでは形質購入は共用（割増枠なし）です'); return ''; } // T4：形質購入は排他なし
    const slot = a.slot === 'TRT2' ? 'TRT2' : 'TRT';
    if (slot === 'TRT2' && st.ext !== 'x1') throw new Error('割増枠は拡張ルールでのみ使えます');
    const extra = slot === 'TRT2' ? st.round : 0;
    if (p.E < extra) throw new Error(`割増枠はラウンド数ぶんのE（E${extra}）が必要です`);
    const cl = claimSlot(st, p, slot, { useL: a.bypassL, useCoop: a.bypassCoop });
    p.E -= extra;
    return (extra ? `・割増枠E${extra}` : '') + (cl.bypass ? '・' + bypassDesc(cl.bypass) : '');
  }
  // 形質購入： {trait, useL, res, track, viaDG, viaReward, slot, bypassL, bypassCoop}
  ACTIONS.trait = (st, p, a) => {
    let disc = 0, tok = true, how = '';
    if (a.viaDG) { disc = a.viaDG; tok = false; }
    else if (a.viaReward) { disc = a.viaReward; tok = false; }
    else { how = claimTraitSlot(st, p, a); useToken(p, false); }
    const c = traitCost(st, p, a.trait, disc);
    const r = payG(p, c.G, a.useL);
    const tr1 = organ(p, 'Tr1'); if (tr1 && !tr1.strong && p.uses.tr1 < 3) p.uses.tr1 += 1;
    afterAction(st, p, `形質購入 ${a.trait}（G${r.G}${r.L ? '+L' + r.L : ''}${a.viaDG ? '・遺伝子図書館' : a.viaReward ? '・報酬' : ''}${how}）`, tok);
    giveTrait(st, p, a.trait, false, '購入', { res: a.res, track: a.track });
    return tok;
  };

  // 形質アップグレード： {from, to, useL, res, track}
  ACTIONS.upgrade = (st, p, a) => {
    if (RS(st).noUpgrade) throw new Error('この数値セットでは形質の買い替え（アップグレード）はありません');
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
    const how = claimTraitSlot(st, p, a); useToken(p, false);
    removeTrait(st, p, a.from);
    const r = payG(p, c, a.useL);
    afterAction(st, p, `形質アップグレード ${a.from}→${a.to}（G${r.G}${r.L ? '+L' + r.L : ''}${how}）`, true);
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
    const c = gemsetPrice(p); const cl = RS(p).gemsetShared ? { bypass: null } : claimSlot(st, p, 'GEM', { useL: a.bypassL }); useToken(p, false);
    const r = payG(p, c, a.useL); p.gemsets += 1;
    afterAction(st, p, `宝石セット得点カード購入（G${r.G}${r.L ? '+L' + r.L : ''}${cl.bypass ? '・' + bypassDesc(cl.bypass) : ''}）→ 仮想宝石 ${p.gemsets}`, true);
    return true;
  };

  // 環境スキャン： {target:{pid, track}, useL, bonus}
  ACTIONS.scan = (st, p, a) => {
    const cands = scanCandidates(st, p); if (!cands.length) throw new Error('参照できる他プレイヤーがいません（全員Lv1）');
    const t = cands.find(c => c.pid === a.target.pid && c.track === a.target.track); if (!t) throw new Error('その対象は最高Lvではありません');
    let e = Math.max(1, 5 - p.scanDisc); if (a.bonus) e = ceilHalf(e); e = applyRh2(p, e);
    if (!a.bonus) useToken(p, false);
    const r = payE(p, e, a.useL);
    const res = G.TRACK_INFO[t.track].res; let n = t.lv * 2; if (res === 'coop' && RS(p).scanCoop !== undefined) n = RS(p).scanCoop; // T4：協調は白ゲートの収集物なので参照では+1のみ
    gainRes(p, res, n);
    afterAction(st, p, `環境スキャン（E${r.E}${r.L ? '+L' + r.L : ''}）→ ${P(st, t.pid).name}の${G.TRACK_INFO[t.track].name}Lv${t.lv}参照：${res}+${n}`, !a.bonus);
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
    const base = RS(p).lv0 ? 0 : 1; const lows = G.TRACKS.filter(t => p.lv[t] === base); if (!lows.length) throw new Error(`Lv${base}のトラックがありません`);
    if (!lows.includes(a.track)) throw new Error('Lv1のトラックを選んでください');
    useToken(p, true); p.L -= 1; investL(p, null);
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
    if (RS(p).cardBoost) ['E', 'G', 'P'].forEach(k => { const v = p[k] - before[k]; if (v > 0) p[k] += Math.ceil(v * (RS(p).cardBoost - 1)); }); // 試作 cardBoost：獲得量×倍率（切上）
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

  // 試作 coopCrystal：共用アクション「群れの結晶」＝協調 N → 仮想宝石+1（排他なし・W）
  ACTIONS.coopCrystal = (st, p, a) => {
    const n = RS(p).coopCrystal; if (!n) throw new Error('この数値セットに群れの結晶はありません');
    if (p.coop < n) throw new Error(`協調トークンが足りません（必要${n}）`);
    useToken(p, false); p.coop -= n; p.gemsets += 1;
    afterAction(st, p, `群れの結晶（協調${n}）→ 仮想宝石 ${p.gemsets}`, true); return true;
  };
  // T6 S3：結晶化（生命核）＝身体Lv4で解放。L N個 → 仮想宝石+1（排他なし・W・投入回数には数えない）
  ACTIONS.lCrystal = (st, p, a) => {
    let n = RS(p).lCrystal; if (!n) throw new Error('この数値セットに結晶化（生命核）はありません');
    if (RS(p).crystalLv4Rate && p.lv.body >= 4) n = RS(p).crystalLv4Rate; // 試作 crystalLv4Rate
    const unlock = RS(p).lCrystalLv || 4; if (p.lv.body < unlock) throw new Error(`結晶化は身体Lv${unlock}で解放されます`); // 試作 lCrystalLv
    if (p.L < n) throw new Error(`生命核が足りません（必要L${n}）`);
    useToken(p, false); p.L -= n; p.gemsets += 1; const ce = RS(p).crystalE || 0; if (ce) p.E += ce;
    afterAction(st, p, `結晶化（生命核L${n}）→ 仮想宝石 ${p.gemsets}${ce ? '・E+' + ce : ''}`, true); return true;
  };
  // 試作 crystal：共用アクション「結晶化」＝E または G を払って仮想宝石+1（排他なし・W）
  ACTIONS.crystal = (st, p, a) => {
    const cfg = RS(p).crystal; if (!cfg) throw new Error('この数値セットに結晶化はありません');
    const res = a.res === 'G' ? 'G' : 'E'; const c = cfg[res]; if (!c) throw new Error('その資源では結晶化できません');
    if (p[res] < c) throw new Error(`${res}が足りません（必要${res}${c}）`);
    useToken(p, false); p[res] -= c; p.gemsets += 1;
    afterAction(st, p, `結晶化（${res}${c}）→ 仮想宝石 ${p.gemsets}`, true); return true;
  };
  // 試作 premium：上位形質の購入（G。排他なし・W。形質として数える）
  ACTIONS.premium = (st, p, a) => {
    if (!RS(p).premium) throw new Error('この数値セットに上位形質はありません');
    const t = G.TRAITS[a.trait]; if (!t || !t.premium) throw new Error('上位形質ではありません');
    if (trait(p, a.trait)) throw new Error('取得済みです');
    const strong = st.shared.traitFirst[a.trait] === undefined || st.shared.traitFirst[a.trait] === p.id || p.alwaysStrong;
    const tone = !!RS(p).premiumTone; // 試作 premiumTone：控えめ版（コスト+2・結晶核は強弱とも仮想宝石+1・超進化は係数でなく仮想宝石+1）
    const c = Math.max(1, t.cost[strong ? 0 : 1] + (tone ? 2 : 0) - p.traitDisc);
    useToken(p, false); const r = payG(p, c, a.useL);
    if (st.shared.traitFirst[a.trait] === undefined) st.shared.traitFirst[a.trait] = p.id;
    p.traits.push({ id: a.trait, strong });
    if (a.trait === 'XA') p.gemsets += (strong && !tone) ? 2 : 1;
    if (a.trait === 'XB') { if (strong && !tone) addUpgrade(st, p, '超進化'); else p.gemsets += 1; }
    if (a.trait === 'XC') { p.inc.E += strong ? 3 : 2; p.inc.G += strong ? 2 : 1; }
    // XD は stepCost で参照
    afterAction(st, p, `上位形質 ${a.trait} ${t.name}（${strong ? '強' : '弱'}・G${r.G}${r.L ? '+L' + r.L : ''}）`, true);
    const n = p.traits.length; if ((RS(p).traitCoef || [4, 8]).includes(n)) addUpgrade(st, p, `形質${n}枚目`);
    return true;
  };
  ACTIONS.cheat = (st, p, a) => { ['E', 'G', 'P', 'L'].forEach(k => { if (typeof a[k] === 'number') p[k] = Math.max(0, a[k]); }); if (typeof a.coop === 'number') p.coop = Math.min(G.COOP_MAX, Math.max(0, a.coop)); log(st, p.id, `[DEBUG] ${p.name} の資源を設定 E${p.E} G${p.G} P${p.P} L${p.L} 協調${p.coop}`); return false; };

  // 無料アクション（トークン・手番を消費しない）
  ACTIONS.gToE = (st, p, a) => { // 試作 gToE：いつでも G→E（無料・手番消費なし）。レートは RS.gToE=[G, E]
    const r = RS(p).gToE; if (!r) throw new Error('この数値セットにG→E変換はありません');
    const n = Math.max(1, a.n | 0); if (p.G < r[0] * n) throw new Error('Gが足りません');
    p.G -= r[0] * n; p.E += r[1] * n; log(st, p.id, `${p.name}：G→E変換 G${r[0] * n}→E${r[1] * n}`); return false;
  };
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
    if (pd.type === 'lYield') { const r = a.res || 'E'; if (!pd.opts.includes(r)) throw new Error(`利回りで選べる資源は ${pd.opts.join('/')} です`); p.pending.shift(); gainRes(p, r, pd.n); log(st, p.id, `${p.name}：生命核利回り ${r}+${pd.n}`); return false; }
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
  const BONUS_OK = { track: 1, breed: 1, organ: 1, scan: 1, convert: 1, reserve: 1, card: 1, stAct: 1, crystal: 1, premium: 1, lCrystal: 1, coopCrystal: 1 };
  function apply(st, action) {
    if (st.ended) throw new Error('ゲームは終了しています');
    const pid = action.pid; assertTurn(st, pid); const p = P(st, pid);
    const pd = p.pending[0]; let viaBonus = false;
    if (pd && action.type !== 'resolve' && action.type !== 'freeConv' && action.type !== 'gToE' && action.type !== 'cheat') {
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
      if (p._coop8Due) { p._coop8Due = false; if (RS(p).coop8Gem) addGem(st, p, 'social', 1, '協調8到達'); if (RS(p).coop8Coef) addUpgrade(st, p, '協調8到達'); }
      syncGates(st, p);
      if (viaBonus) { const i = p.pending.findIndex(x => x.type === 'bonusAction'); if (i >= 0) p.pending.splice(i, 1); }
      if (consumed !== false || action.type === 'resolve' || viaBonus) advanceTurn(st); // 追加アクション（知性Lv4↗）を実行したら手番は次へ（本体のアクションで既にトークンを消費している）
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
    const eff = []; let st = replay(eff); let pendingUndo = null; const rejected = []; let undoInfo = null;
    const canUndo = (e) => { if (meta.undoMode !== 'approve') return true; const need = opts.otherUids ? opts.otherUids(e.uid) : []; const oks = opts.oks ? opts.oks(e.id) : []; return need.every(u => oks.includes(u)); };
    entries.forEach((e, idx) => {
      if (e.type === 'undo' || e.type === 'undoRound') {
        if (!canUndo(e)) { pendingUndo = e; return; }
        const removed = [];
        if (e.type === 'undo') {
          // pids 指定あり＝要求者の（人間の）席。直前の自分の手まで戻す（間にある AI・他プレイヤーの手も取り消す）。自分の手が無ければ何も戻さない
          const pids = Array.isArray(e.pids) && e.pids.length ? e.pids : null;
          while (eff.length && eff[eff.length - 1].type !== 'finish') { const x = eff.pop(); removed.unshift(x); if (!pids || pids.includes(x.pid)) break; }
          if (pids && !removed.some(x => pids.includes(x.pid))) { removed.forEach(x => eff.push(x)); removed.length = 0; }
        } else { const rs = st.roundStarts.length ? st.roundStarts[st.roundStarts.length - 1] : 0; const cut = Math.min(eff.length, rs); removed.push(...eff.slice(cut)); eff.length = cut; }
        undoInfo = { key: e.id || ('local' + idx), uid: e.uid, type: e.type, removed: removed.map(x => ({ pid: x.pid, type: x.type })) };
        st = replay(eff); pendingUndo = null; return;
      }
      if (e.type === 'undoOk' || e.type === 'undoCancel' || e.type === 'chat' || e.type === 'seat') { if (e.type === 'undoCancel') pendingUndo = null; return; }
      try { applyEntry(st, e); eff.push(e); if (st.round > (st.roundStarts.length ? st._lr || 0 : 0)) { if (!st.roundStarts.length || st.roundStarts[st.roundStarts.length - 1] !== eff.length) { if (st.round > (st._lr || 0)) st.roundStarts.push(eff.length); } } st._lr = st.round; }
      catch (err) { rejected.push({ entry: e, error: err.message }); }
    });
    st.pendingUndo = pendingUndo; st.rejected = rejected; st.effective = eff.length; st.undoInfo = undoInfo; // undoInfo＝直近に成立したアンドゥ（巻き込まれた手の通知用）
    return st;
  }
  function tryApply(st, action) { const lg = st.log, hist = st.history; st.log = []; st.history = []; const s = clone(st); st.log = lg; st.history = hist; apply(s, action); return s; }

  // ---------- 得点 ----------
  function virtualGems(st, p) {
    let n = p.gemsets;
    const le = RS(st).lEndGem; if (le && st.ended) n += Math.min(le.max, Math.floor(p.L / le.per)); // T6 S2：終了時、保有L per個につき仮想宝石+1（上限）
    const cv = RS(st).lv6Convert; if (cv && st.ended) { const cnt = { body: RS(st).lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: p.traits.length, social: p.coop, metab: p.organs.length }; const by = RS(st).lv6ConvertBy || {}; G.TRACKS.forEach(t => { if (p.lv[t] >= 6) n += Math.floor(cnt[t] / (by[t] || cv)); }); } // T6 L6-A：Lv6 の色は収集物 cv 個につき仮想宝石+1（lv6ConvertBy で色別に変更可）
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
    const R = RS(st); const colors = G.TRACKS.filter(t => p.gems[t] > 0).length;
    const core = (real + vg) * R.gemPt * cf, reg = p.regime ? R.regimePt : 0;
    let dev, org;
    if (R.scoreMode === 'mult') { dev = p.traits.length * Math.max(1, colors); org = p.organs.length * Math.min(4, p.coop); } // 掛け算：形質×宝石色数（1〜4）・器官×協調（上限4）
    else { dev = (p.traits.length + p.coop) * R.devPt; org = p.organs.length * R.organPt; }
    return { total: core + dev + org + reg, core, dev, org, reg, real, vg, cf, colors, mode: R.scoreMode, gemPt: R.gemPt, devPt: R.devPt, organPt: R.organPt, tie: [real, p.traits.length + p.coop, p.E + p.G + p.P] };
  }
  function endGame(st) {
    st.ended = true; st.phase = 'end';
    st.hist = st.hist || []; st.hist.push({ round: st.round + 1, label: '終了', rows: st.players.map(p => summaryRow(st, p)) });
    const rows = st.players.map(p => Object.assign({ pid: p.id, name: p.name }, score(st, p)));
    rows.sort((a, b) => b.total - a.total || b.tie[0] - a.tie[0] || b.tie[1] - a.tie[1] || b.tie[2] - a.tie[2]);
    st.result = rows;
    log(st, null, '=== ゲーム終了 ===', 'round');
    rows.forEach((r, i) => log(st, r.pid, `${i + 1}位 ${r.name}：${r.total}点（宝石${r.real}+仮想${r.vg} ×${r.gemPt}×${r.cf}＝${r.core}／発展度${r.dev}${r.organPt || r.mode === 'mult' ? '／器官' + r.org : ''}／体制${r.reg}）`, 'gem'));
  }

  // ---------- 獲得量プレビュー（UI用）：アクションを試し打ちして資源の差分を返す。実行不可なら null ----------
  function previewGain(st, action) {
    let s2; try { s2 = tryApply(st, action); } catch (e) { return null; }
    const a = st.players[action.pid], b = s2.players[action.pid]; const d = {};
    ['E', 'G', 'P', 'L', 'coop', 'gemsets'].forEach(k => { const v = (b[k] || 0) - (a[k] || 0); if (v) d[k] = v; });
    G.TRACKS.forEach(t => { const v = b.gems[t] - a.gems[t]; if (v) d['gem_' + t] = v; });
    return d;
  }
  function gainText(d) {
    if (!d) return '';
    const jp = { E: 'E', G: 'G', P: 'P', L: '生命核', coop: '協調', gemsets: '仮想宝石' };
    const parts = Object.entries(d).filter(([k]) => !k.startsWith('gem_')).map(([k, v]) => `${jp[k] || k}${v > 0 ? '+' : ''}${v}`);
    G.TRACKS.forEach(t => { if (d['gem_' + t]) parts.push(`${G.TRACK_INFO[t].jp}宝石+${d['gem_' + t]}`); });
    return parts.join(' ');
  }
  // 数値セット連動の説明文（ツールチップ用。静的な TIPS の代わり）
  function slotTip(st, id) {
    const R = RS(st); const cb = R.coopBonusCap !== undefined ? `協調ボーナス＝＋協調数（上限+${R.coopBonusCap}）` : '協調ボーナス＝＋協調数';
    const byp = `使用済みは緊急発進（生命核1）${st.ext === 'x1' ? '・協調発進（協調2）' : ''}で突破可`;
    const m = {
      E5: `固定E強：E+5。${cb}。${byp}`, G3: `固定G強：G+3。${cb}。${byp}`, P8: `P増加：P+${R.p8 || 8}。${cb}。${byp}`,
      EG: R.herd ? `群体E：P${R.herdCost || 6}を払って E+3＋協調+${R.herdCoop || 1}。${cb}。${byp}` : `群体E：E+2＋P10ごとに+1E。${cb}。${byp}`,
      GG: R.herd ? `群体G：P${R.herdCost || 6}を払って G+2＋協調+${R.herdCoop || 1}。${cb}。${byp}` : `群体G：G+1＋P10ごとに+1G。${cb}。${byp}`,
      ALL: `全資源獲得：E+2 G+1 P+4。${cb}（資源を選ぶ）。${byp}`, PB: `Pブースト購入：G${G.GEMSET_FLOOR ? 2 : 2}→P+10（全翻訳で割引）。緊急発進の対象外`,
      MB: `大量消費(身体)：P${R.massCost}（下限${R.massMin.body}）→赤宝石+1。${R.bodyAxis === 'L' ? '誰でもP→宝石の出口' : '身体Lv4/5で軽減'}`,
      MI: `大量消費(知性)：P${R.massCost}→G4以下の形質を異なる2種（無料）`, MS: `大量消費(社会)：P${R.msCost || R.massCost}→協調+${R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2)}`, MM: `大量消費(代謝)：P${R.mmCost || R.massCost}→E+10 G+10`,
      TRT: R.traitShared ? '形質購入：共用（排他なし）。形質プールのカードをクリック。先着＝強・後続＝弱。' + (R.traitHalfFloor ? 'コストの下限＝元コストの半分（切上）' : '') : '形質購入：形質プールのカードをクリック（1ラウンド1人）',
      TRT2: `形質購入（割増枠）：通常コスト＋E${st.round}`, GEM: `宝石セット：G(10−形質数・下限5${R.gemsetEscalate ? '・購入ごとに+' + R.gemsetEscalate : ''})→仮想宝石+1（自分専用）${R.gemsetShared ? '。共用（排他なし）' : '。1ラウンド1人'}`,
      BRD: `繁殖変換：P${R.breed[0]}→×4／P${R.breed[1]}→×5${R.breedL ? `。生命核L${R.breedL}でも払える（身体の投入回数に数える）` : ''}。係数の上限×7`,
      ORG: `器官建造：器官の場のカードをクリック。コスト${(R.organCost || G.ORGAN_COST).map(c => c[0] + 'E+' + c[1] + 'G').join('／')}（弱はG0${R.organEscalate ? '・所持' + R.organEscalate + '枚ごとに+1E' : ''}）${R.organExcl ? '・各カード1ラウンド1人' : ''}`,
      SCAN: `環境スキャン：E5→他プレイヤーの最高Lv×2の資源（身体=P／知性=G／社会=協調${R.scanCoop !== undefined ? '〔+' + R.scanCoop + 'のみ〕' : ''}／代謝=E）`,
      ADP: `適応進化：生命核1→Lv1のトラックを+1（W必須）${R.bodyAxis === 'L' ? '。身体の投入回数に数える' : ''}`, CNV: '資源変換：E2→G1／G2→E1／P8→E3／P8→G2（1アクション1種類・回数自由）', RSV: '予備動員：無料で E+2 または G+1',
    };
    return m[id] || (G.SLOT_BY_ID[id] ? G.SLOT_BY_ID[id].text : '');
  }

  // ---------- 表示文（数値セット連動） ----------
  function slotText(st, id) {
    const R = RS(st); const s = G.SLOT_BY_ID[id]; if (!s) return '';
    if (id === 'MB') return `P${R.massCost} → 赤宝石+1`;
    if (id === 'MI') return `P${R.massCost} → G4以下の形質を異なる2種`;
    if (id === 'MS') return `P${R.msCost || R.massCost} → 協調+${R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2)}`;
    if (id === 'MM') return `P${R.mmCost || R.massCost} → E+10 G+10`;
    if (id === 'GEM') return `G(10−形質数・下限5${R.gemsetEscalate ? '・購入ごとに+' + R.gemsetEscalate : ''}) → 仮想宝石+1${R.gemsetShared ? '（共用）' : ''}`;
    if (id === 'BRD') return `P${R.breed[0]}→×4 / P${R.breed[1]}→×5${R.breedL ? `（または生命核L${R.breedL}）` : ''}（W必須）`;
    if (id === 'TRK') return `${R.step.slice(1).join('/')}E（W必須）`;
    if (id === 'EG' && R.herd) return `P${R.herdCost || 6} → +3E ＋ 協調+1`;
    if (id === 'GG' && R.herd) return `P${R.herdCost || 6} → +2G ＋ 協調+1`;
    if (id === 'TRT2') return `通常コスト＋E${st.round}（ラウンド数）`;
    if (id === 'TRT' && R.traitShared) return 'Gを払い形質を取得（共用・排他なし）';
    if (id === 'ORG') { const oc = R.organCost || G.ORGAN_COST; return oc.map(([e, g]) => `${e}E+${g}G`).join(' / ') + '（弱はG0' + (R.organEscalate ? `・所持${R.organEscalate}枚ごとに+1E` : '') + '）'; }
    return s.text;
  }
  function trackRewardText(st, track, lv) {
    const R = RS(st);
    if (lv === 6) return `${G.TRACK_INFO[track].jp}宝石+1（先着なし）${R.lv6Convert ? `＋終了時、${G.GATE_SHORT_L && track === 'body' && R.bodyAxis === 'L' ? '保有L' : G.GATE_SHORT[track]}${R.lv6Convert}個につき仮想宝石+1` : ''}`;
    if (R.bodyAxis === 'L' && track === 'body') { // T5/T6：生命核軸の身体（フラグで文を組み立てる）
      const t2 = ['利回りの資源をLごとにE/Gから選べる']; if (R.body2L) t2.push('今すぐL+1'); if (R.body2Gem) t2.push('赤宝石+1'); if (R.lCrystal && (R.lCrystalLv || 4) === 2) t2.push(`結晶化（L${R.lCrystal}→仮想宝石+1・排他なし）を解放`);
      const t4 = []; if (R.bodyLv4Gem) t4.push('赤宝石+1'); t4.push('1L＝E4／G4', '利回りでPも選べる'); if (R.lCrystal && (R.lCrystalLv || 4) === 4) t4.push(`結晶化（L${R.lCrystal}→仮想宝石+1）を解放`);
      const m = { 2: t2.join('＋'), 3: `強：今すぐL+1＋${R.body3YieldAdd ? '利回り+1/L' : '緊急発進の対象に形質購入・宝石セット・大量消費を追加'}／弱：今すぐL+1`, 4: t4.join('＋'), 5: `強：${R.body5Coef ? '係数+1' : '利回りが保有L1個につき2'}＋今すぐL+1／弱：今すぐL+1` };
      if (m[lv]) return m[lv];
    }
    let s = G.TRACK_REWARDS[track][lv];
    if (R.socialRewards === 'shield' && track === 'social' && G.TRACK_REWARDS_T4.social[lv]) s = G.TRACK_REWARDS_T4.social[lv];
    if (R.intel4 === 'traitDisc' && track === 'intel' && lv === 4) s = G.TRACK_REWARDS_T4.intel[4];
    if (R.bodyAxis === 'L' && track === 'body' && G.TRACK_REWARDS_T5_BODY[lv]) s = G.TRACK_REWARDS_T5_BODY[lv];
    if (R.bodyAxis === 'L' && track === 'body' && lv === 4 && R.bodyLv4Gem && R.lCrystal) s = G.TRACK_REWARDS_T6_BODY4;
    return s;
  }

  // ---------- 状況照会（UI用） ----------
  function availability(st, p) {
    const out = {};
    G.SLOTS.forEach(s => { const u = slotUsedBy(st, s.id); out[s.id] = { used: u !== undefined, usedBy: u }; });
    return out;
  }
  function summaryRow(st, p) { return { round: st.round, name: p.name, E: p.E, G: p.G, P: p.P, L: p.L, lv: G.TRACKS.map(t => p.lv[t]).join('/'), gems: realGems(p), vg: virtualGems(st, p), coef: coef(p), traits: p.traits.length, organs: p.organs.length, coop: p.coop, score: score(st, p).total }; }

  Object.assign(G, { handSize, slotText, slotTip, previewGain, gainText, trackRewardText, gateLabel, gateShort, gateNote, applyEntry, rebuild, tryApply, flSwapMax, reachedMilestones, newGame, chooseSpecies, chooseStartTrait, draftCards, finishSetup, apply, undo, undoRound, score, realGems, coef, virtualGems, stepCost, organCost, traitCost, massCost, breedCost, gemsetPrice, pbCost, scanCandidates, income, availability, slotUsedBy, bypassable, gateReq, autoLv, summaryRow, comboNames, organ, trait, lineageCount, cur, P, clone });
})((typeof window !== 'undefined' ? window : globalThis).G1 = (typeof window !== 'undefined' ? window : globalThis).G1 || {});
