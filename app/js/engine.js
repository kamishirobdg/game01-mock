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
  // 資源の規模（R.scale・既定1）：エンジン内の資源の数値は全て sc() を通す（資源量の一括調整用。L・協調・収集物の個数は対象外）
  const sc = (x, n) => Math.round(n * (RS(x).scale || 1));
  // 表示文の {n} を規模に合わせて置換（データ側の効果文・報酬文で使う）
  function txt(x, s) { if (s === null || s === undefined) return s; const R = RS(x); const k = R.scale || 1; return String(s).replace(/\{(?:(\w+):)?(\d+)\}/g, (m, key, n) => String(key && R[key] !== undefined ? R[key] : Math.round(+n * k))); } // {n}＝規模に合わせる／{key:n}＝数値セットに key があればその絶対値
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
        uses: { li1: 0, tr1: 0, rh1: 0, rh3: 0, ca1: 0, ca2: 0, restore: 0, amplify: 0 }, // 弱版の回数カウント／T10 復元・増幅（1人1回）
        scanDisc: 0, cv2Granted: 0, wild: null, st3Used: false,
        lInvested: 0, lValue: 3 * (G.RULESETS[rules].scale || 1), yieldPick: null, /* 2026-11-05 v3.64 修正：1L の代用価値は基準単位 3 を数値セットの倍率で（T8／T10＝E9／G9・T11＝3）。T8 以降ずっと 3 のままで、文書（guide・value_scale＝1L＝E9）と食い違い、身体 Lv3★ で 3→12 に跳んでいた */ yieldMul: 1, bypassWide: false, // T5：生命核軸（投入回数・1Lの価値・利回りの資源選択・利回り倍率・緊急発進の対象拡大）
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
    if (G.RULESETS[rules].organSet) { const R7 = G.RULESETS[rules]; st.shared.lineages = st.mode === 'beginner' ? R7.organSetBeginner.slice() : shuffle(st, R7.organSet).slice(0, R7.organPick); st.shared.organField = st.shared.lineages.flatMap(l => [1, 2, 3].map(t => l + t)); } // T7：6系統から4系統
    if (G.RULESETS[rules].metab4 === 'special') st.shared.special = (G.RULESETS[rules].specialOrgans || []).slice(); // T15：代謝 Lv4 の特殊器官（場に 5 枚・先着で 1 枚ずつ取る）
    if (G.RULESETS[rules].organLineages === 6) { const cum = shuffle(st, G.LINEAGE_TYPE.cumulative).slice(0, 3), fun = shuffle(st, G.LINEAGE_TYPE.functional).slice(0, 3); st.shared.lineages = cum.concat(fun); st.shared.organField = st.shared.lineages.flatMap(l => [1, 2, 3].map(t => l + t)); } // T4：累積3＋機能3＝18枚
    log(st, null, `ゲーム開始（${st.nPlayers}人・${st.mode === 'beginner' ? '初心者' : '熟練者'}セットアップ・${G.SLOT_SET_NAME[st.slotSet]}・ルール${G.RULESETS[st.rules].name}・拡張${G.EXT_NAME[st.ext]}・seed ${st.seed}）`);
    if (G.RULESETS[rules].noCombo) { st.shared.combos.two = []; st.shared.combos.three = []; } else log(st, null, 'コンボ：' + comboNames(st).join('／')); // 2026-10-28 noCombo：コンボ廃止
    log(st, null, '器官の場：' + st.shared.lineages.map(l => G.LINEAGES[l]).join('・'));
    { const T7 = G.RULESETS[rules].tribute; if (T7 && T7.pool) { st.shared.tribSlots = shuffle(st, T7.pool).slice(0, T7.pick || 3); log(st, null, `恩寵枠（ラウンド${T7.openRound || 6}の神の到来で開く）：` + st.shared.tribSlots.map(id => G.SLOT_BY_ID[id].name).join('・')); } } // 第35部：候補から抽選
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
    const mod = (RS(p).speciesMod || {})[spId] || {}; // 試作 speciesMod：{ stock:{E,G,P}, L, coop, mantaP, mantaIncE }
    const stock = mod.stock || sp.stock;
    p.species = spId; p.E = stock.E; p.G = stock.G; p.P = stock.P; if (mod.L) p.L += mod.L; if (mod.shields) p.shields += mod.shields; // 試作 speciesMod.shields：Wなし実行権
    if (p.passive) {
      if (spId === 'wing') { if (RS(p).lv0) advanceTrack(st, p, 'body', '種族パッシブ'); advanceTrack(st, p, 'body', '種族パッシブ'); if (mod.wingInv) { p.lInvested = (p.lInvested || 0) + mod.wingInv; } } // 試作 speciesMod.wing.wingInv：開始時に L の投入回数を持つ // Lv2到達扱い＝Lv2報酬（P+8）も得る（lv0 では 0→2）
      if (spId === 'ant') p.coop = mod.coop !== undefined ? mod.coop : 1;
      p.coopGained = p.coop; // 初期協調も累計に含める（coopGateTotal）
      if (spId === 'manta') { p.P += mod.mantaP !== undefined ? mod.mantaP : 10; p.inc.E += mod.mantaIncE !== undefined ? mod.mantaIncE : 1; }
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
  function traitPool(st) { return RS(st).traitPool || G.TRAIT_ORDER; }
  function baseTraitCost(st, tid, strong) { const tc = (RS(st).traitCosts || {})[tid]; return (tc || G.TRAITS[tid].cost)[strong === false ? 1 : 0]; }
  function armTraitOptions(st) { const mx = RS(st).armTraitMax || 4; return traitPool(st).filter(t => baseTraitCost(st, t) <= mx && !(RS(st).armNoInstant && G.TRAITS[t].instant)); } // armNoInstant：即時効果（群れ本能・長命・跳躍）は初期形質にしない
  function chooseStartTrait(st, pid, tid) { // 九腕知性体
    const p = P(st, pid); const t = G.TRAITS[tid];
    if (!armTraitOptions(st).includes(tid)) throw new Error(`コストG${RS(st).armTraitMax || 4}以下の形質のみ`);
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
    st.players.forEach(p => syncGates(st, p)); // 初期の収集物（協調2・形質など）でゲートを満たしていれば開始前に上げる
    st.phase = 'play';
    startRound(st);
  }

  // ---------- ラウンド ----------
  function startRound(st) {
    st.round += 1;
    if (st.round > 1) {
      // 痕跡の少ない順（同数は前R維持＝安定ソート）
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
      if (p.spore) { const cap = RS(p).sporeCap || sc(p, 3); const use = Math.min(p.E, cap); if (use > 0) { p.E -= use; p.P += use * p.spore; log(st, p.id, `${p.name}：胞子 E${use}→P${use * p.spore}（前ラウンドの残り）`); } } // 第42部 N9 胞子（強 E1→P3／弱 E1→P2・上限 sporeCap）
      // 収入
      p._round = st.round; // p._round＝これから始まるラウンド番号（yieldByRound 用）
      if (RS(p).yieldAfterL) { p.lRemain -= 1; p.L += 1; } // 試作 yieldAfterL（2026-11-05 ユーザー提案）：L を先に受け取ってから利回り（受け取った L も利回りに数える）
      const inc = income(p, { atIncome: true }); // 既定＝利回りは受け取る前の保有 L で計算（T5 以来）
      if (!RS(p).yieldAfterL) { p.lRemain -= 1; p.L += 1; }
      p.E += inc.E; p.G += inc.G; p.P += inc.P; if (inc.coop) gainRes(p, 'coop', inc.coop);
      if (inc.lyield && p.yieldPick) p.pending.push({ type: 'lYield', n: inc.lyield, opts: p.yieldPick });
      // トークン
      p.left = { W: p.tokens.filter(t => t !== 'AT').length, AT: p.tokens.filter(t => t === 'AT').length };
      p.round = { firstDone: false, rh3Used: false, trib: {} }; p.st3Used = false;
      log(st, p.id, `収入 E+${inc.E} G+${inc.G} P+${inc.P}${inc.coop ? ' 協調+' + inc.coop : ''} L+1（${inc.parts.join('・')}）`);
      const cv1 = organ(p, 'Cv1'); if (cv1) { const n = Math.floor(p.organs.length / (cv1.strong ? 2 : 3)); if (n > 0) p.pending.push({ type: 'cvIncome', n }); }
      const flMax = flSwapMax(p); if (flMax) p.pending.push({ type: 'flSwap', max: flMax });
      if (trait(p, 'DG')) p.pending.push({ type: 'dgBuy', disc: RS(p).dgDisc ? RS(p).dgDisc[trait(p, 'DG').strong ? 0 : 1] : sc(p, (trait(p, 'DG').strong ? 2 : 1) + (RS(p).traitGateBoost ? 1 : 0)) });
      p.pending.forEach(x => { x.pre = true; }); // 2026-11-05 v3.63：収入時の保留（利回り選択・収斂膜・転流・遺伝子図書館）は「手番前」の解決＝解決しても手番は進めない（apply）。従来は resolve のたびに advanceTurn され、最初の手番が飛ばされていた（ユーザー指摘）
    });
    log(st, null, `=== ラウンド ${st.round} 開始（手番順：${st.turnOrder.map(i => P(st, i).name).join('→')}）===`, 'round');
    st.turnOrder.forEach(i => { const p = P(st, i); const n0 = p.pending.length; if (p._coop8Due) { p._coop8Due = false; if (RS(p).coop8Gem) addGem(st, p, 'social', 1, `協調${RS(p).coopGemAt || 8}到達`); if (RS(p).coop8Coef) addUpgrade(st, p, '協調8到達'); } syncGates(st, p); p.pending.slice(n0).forEach(x => { x.pre = true; }); }); // 2026-11-10 v3.90（ユーザー指摘）：収入の協調（連絡腺・協調の収入）でゲートに達しても自動進化が次の行動まで遅れていた → 収入の直後に手番順で判定（先駆も手番順）。派生した保留（報酬の形質など）は手番前
    st.hist = st.hist || []; st.hist.push({ round: st.round, rows: st.players.map(p => summaryRow(st, p)) });
    st.roundStart = null; // ラウンド頭へ戻すのはエントリ列の再構築（rebuild）で行う
  }
  function flSwapMax(p) {
    const f1 = organ(p, 'Fl1'), f2 = organ(p, 'Fl2'), f3 = organ(p, 'Fl3');
    let max = 0; if (f1) max = Math.max(max, f1.strong ? 3 : 2); if (f2) max = Math.max(max, f2.strong ? 5 : 4); if (f3 && !f3.strong) max = 99;
    return max;
  }
  function income(p, o) { // o.atIncome＝収入処理の本番（yieldAfterL では L 受け取り済み）。それ以外＝画面・AI の「次の収入」の見込み
    const inc = { E: 0, G: 0, P: 0, parts: [] }; const Ln = p.L + (RS(p).yieldAfterL && !(o && o.atIncome) ? 1 : 0); // 利回りに数える L
    const add = (label, e, g, pp) => { if (!e && !g && !pp) return; inc.E += e; inc.G += g; inc.P += pp; inc.parts.push(`${label}${e ? ' E+' + e : ''}${g ? ' G+' + g : ''}${pp ? ' P+' + pp : ''}`); };
    add('基礎', RS(p).incE, RS(p).incG, RS(p).incP);
    add('恒久(種族/体制)', p.inc.E, p.inc.G, p.inc.P);
    if (p.lv.metab >= 2) add('代謝Lv2', sc(p, 1), 0, 0);
    if (p.lv.metab >= 3 && p.flags.strong['metab3']) add('代謝Lv3強', sc(p, 1), sc(p, 1), 0);
    if (p.lv.intel >= 3 && !p.flags.strong['intel3'] && RS(p).intelRewards !== 'trait') add('知性Lv3弱', 0, sc(p, 1), 0); // T10 以降（intelRewards:'trait'）の弱は「次の形質 -9G」だけ＝収入なし（O-01）
    if (p.lv.metab >= 5) { const k = sc(p, p.flags.strong['metab5'] ? 2 : 1); add('代謝Lv5', k, k, k); }
    const cv3 = organ(p, 'Cv3'); if (cv3) { const n = p.organs.length; const k = sc(p, cv3.strong ? (n >= 9 ? 2 : n >= 6 ? 1 : 0) : (n >= 7 ? 1 : 0)); add('極相体', k, k, k); }
    { const m1 = organ(p, 'Mg1'), m2 = organ(p, 'Mg2'), m3 = organ(p, 'Mg3'); if (m1) add('代謝膜', sc(p, m1.strong ? 2 : 1) * (m1.amp ? 2 : 1), 0, 0); if (m2) add('代謝腺', sc(p, m2.strong ? 1 : 0) * (m2.amp ? 2 : 1), sc(p, 1) * (m2.amp ? 2 : 1), 0); if (m3) { const k3 = (RS(p).mg3Inc !== undefined ? RS(p).mg3Inc : sc(p, 1)) * (m3.amp ? 2 : 1); add('代謝核', k3, k3, RS(p).mg3NoP ? 0 : k3); } } // T7 代謝系（mg3NoP＝試作：代謝核の収入から P を外す）
    if (RS(p).lYield) { const rate = RS(p).yieldByRound ? (RS(p).yieldByRound[Math.min(RS(p).yieldByRound.length - 1, (p._round || 0) + 1)] || 0) : RS(p).lYield; const n = Ln * (rate + (p.yieldAdd || 0)) * (p.yieldMul || 1); if (n > 0) { if (RS(p).yieldRes === 'P') add('生命核の産出', 0, 0, n); else { inc.lyield = n; if (p.yieldPick) inc.parts.push(`生命核の産出 ${n}（資源を選択）`); else add('生命核の産出', n, 0, 0); } } } // T5（yieldByRound＝次ラウンド番号で引く）／T7試作 yieldRes='P'
    { const R5 = RS(p); // T15：新系統の収入・特殊器官（器官の枚数は特殊器官自身も数える）
      const fk = lineageCount(p, 'Fk'); if (fk && R5.fkInc) add('孵化', 0, 0, fk * R5.fkInc);
      if (organ(p, 'Nv2') && R5.nv2Inc) add('神経網', 0, R5.nv2Inc, 0); if (organ(p, 'Lm1') && R5.lm1Inc) add('発光点', 0, R5.lm1Inc, 0);
      if (R5.spInc) p.organs.forEach(o => { const v = R5.spInc[o.id]; if (!v) return; const n = p.organs.length; if (v.coopFlat) { inc.coop = (inc.coop || 0) + v.coopFlat; inc.parts.push(`${G.ORGANS[o.id].name} 協調+${v.coopFlat}`); } if (v.coop) { const k = Math.floor(n * v.coop); if (k) { inc.coop = (inc.coop || 0) + k; inc.parts.push(`${G.ORGANS[o.id].name} 協調+${k}`); } } if (v.E || v.G || v.P) add(G.ORGANS[o.id].name, (v.E || 0) * n, (v.G || 0) * n, (v.P || 0) * n); }); }
    p.traits.forEach(t => {
      if (t.id === 'IE' && t.strong) add('IE', sc(p, 2), 0, 0);
      if (t.id === 'IG' && t.strong) add('IG', 0, sc(p, 1), 0);
      if (t.id === 'IP' && t.strong) add('IP', 0, 0, sc(p, 3));
      if (t.id === 'IB' && t.strong) add('IB', sc(p, 1), sc(p, 1), 0);
      if (t.id === 'IM') { const k = sc(p, t.strong ? 3 : 2); add('IM', t.res === 'E' ? k : 0, t.res === 'G' ? k : 0, t.res === 'P' ? k : 0); }
    });
    return inc;
  }
  function realGems(p) { return p.gems.body + p.gems.intel + p.gems.social + p.gems.metab; }
  function coef(p) { return 3 + Math.min(4, p.upgrades); }
  // C2 試作：2本係数。繁栄度＝breedBase＋繁殖の段数／成熟度＝collectBase＋収集系の+1（上限 collectMax）
  function coefB(p) { const c2 = RS(p).coef2; return c2 ? (c2.breedBase || 3) + Math.min(c2.breedMax || 2, p.breedUps || 0) : coef(p); }
  function coefC(p) { const c2 = RS(p).coef2; return c2 ? (c2.collectBase || 3) + Math.min(c2.collectMax || 4, p.collectUps || 0) : coef(p); }
  function organ(p, id) { return p.organs.find(o => o.id === id); }
  // T13（第70部 §6・organFx 2）：促進＝E／G の支払い割引（系統内の最大値・増幅で 2 倍）。kind＝'E'（進行・器官・スキャン・復元・増幅）／'G'（形質・器官）
  function cxDisc(p, kind) { const CD = RS(p).cxDisc; if (!CD || RS(p).organFx !== 2) return 0; let m = 0; p.organs.forEach(o => { const d = G.ORGANS[o.id]; if (d && d.lin === 'Cx') m = Math.max(m, ((CD[d.tier - 1] || [0, 0])[kind === 'G' ? 1 : 0] || 0) * (o.amp ? 2 : 1)); }); return m; }
  function restoreE(p) { const RT = RS(p).restore || {}; return Math.max(0, (RT.E || 0) - cxDisc(p, 'E')); } // T13 促進の割引込みの復元 E
  function ampE(p) { const AM = RS(p).amplify || {}; return Math.max(0, (AM.E || 0) - cxDisc(p, 'E')); } // T13 促進の割引込みの増幅 E
  function nrTwoHas(p, l) { return p.nrTwoLin === l || (p.nrTwoLins || []).includes(l); } // 2 枚で完成した系統（nrTwoLin＝T13 の旧記録・nrTwoLins＝T14）
  function nrTwoLeft(p) { return p.nrTwo ? Math.max(0, (p.nrTwoMax || 1) - (p.nrTwoLins || []).length - (p.nrTwoLin ? 1 : 0)) : 0; } // 適応放散で 2 枚完成できる残り系統数
  function lineageDone(p, l) { return lineageCount(p, l) >= 3 || nrTwoHas(p, l); } // T13 適応放散（強）＝2 枚で完成した系統（nrTwoLin）も完成扱い
  function linMax(p, lin, strongV, weakV) { let m = 0; p.organs.forEach(o => { const d = G.ORGANS[o.id]; if (d && d.lin === lin) m = Math.max(m, (o.strong ? strongV : weakV)[d.tier - 1] * (o.amp ? 2 : 1)); }); return m; } // o.amp＝T10 増幅（効果2倍） // 系統内の最大段の値（T7）
  function trait(p, id) { return p.traits.find(t => t.id === id); }
  function traitText(st, tid, strong) { const t = G.TRAITS[tid]; if (!t) return ''; if (strong) { const LS = RS(st).leapStrong; if (LS === 'res' && t.strongRes) return t.strongRes; if (LS === 'gate' && t.strongGate) return t.strongGate; if (LS === 'cap4' && t.strongCap) return t.strongCap; if (LS === 'gem' && t.strongGem) return t.strongGem; if (RS(st).nrTwoN && t.strongTwo2) return t.strongTwo2; if (RS(st).nrMode === 'two' && t.strongTwo) return t.strongTwo; if (RS(st).dvMode === 'triple' && t.strongTriple) return t.strongTriple; if (RS(st).mbMode === 'multi' && t.strongMulti) return t.strongMulti; return t.strong; } if (RS(st).nrTwoN && t.weakTwo) return t.weakTwo; if (RS(st).dvMode === 'triple' && t.weakTriple) return t.weakTriple; return (RS(st).weakTraits2 && t.weak2) ? t.weak2 : t.weak; } // T14：strongGem（跳躍＝痕跡+1）／strongTwo2・weakTwo（適応放散 2 系統／1 系統）／strongTriple・weakTriple（三段進行）／strongMulti（繁殖の同時払い） // T10：弱の新効果文（weak2）
  function lineageCount(p, lin) { return p.organs.filter(o => G.ORGANS[o.id].lin === lin).length; }
  function traitCountC(p) { return p.traits.length + (RS(p).nvTrait ? lineageCount(p, 'Nv') : 0); } // T15 神経：知性のゲート・形質 3／6 枚目の成熟度に数える枚数（他の「形質の枚数」には数えない）

  // ---------- コスト計算 ----------
  // 案B（第40部・2026-10-28）：Lv6 はその色の資源で払う。lv6Pay = { body:{L:n}, intel:{G:n}, social:{coop:n}, metab:{E:n} }（数値セットの絶対値）
  function lv6PayDef(x, track) { const d = RS(x).lv6Pay; return d && d[track] ? d[track] : null; }
  function lv6PayE(p, track) { const d = lv6PayDef(p, track); if (!d) return 0; return (d.E || 0) + Math.round((d.G || 0) * 1.5) + (d.L || 0) * (p.lValue || sc(p, 3)) + (d.coop || 0) * sc(p, 1); } // E 換算の目安（物差し：G1＝1.5E・L1＝代用額・協調1≈E1×倍率）
  function lv6CostText(x, track) { const d = lv6PayDef(x, track); if (!d) return ''; return [d.E ? `E${d.E}` : null, d.G ? `G${d.G}` : null, d.L ? `L${d.L}` : null, d.coop ? `協調${d.coop}` : null].filter(Boolean).join('+'); }
  function lv6PayNow(st, p, track, useL, discE) { // 支払いを実行して表示文を返す（discE＝跳躍の割引を E の部分にだけ適用）
    const d = lv6PayDef(p, track); const parts = [];
    if (d.L) { if (p.L < d.L) throw new Error(`Lv6には生命核L${d.L}が必要です`); p.L -= d.L; investL(p, st, d.L); parts.push(`L${d.L}`); }
    if (d.G) { const r = payG(p, d.G, useL); parts.push(`G${r.G}${r.L ? '+L' + r.L : ''}`); }
    if (d.coop) { if (p.coop < d.coop) throw new Error(`Lv6には協調${d.coop}が必要です`); p.coop -= d.coop; parts.push(`協調${d.coop}`); }
    if (d.E) { const e = Math.max(0, d.E - (discE || 0)); const r = payE(p, e, useL); parts.push(`E${r.E}${r.L ? '+L' + r.L : ''}`); }
    return parts.join('+');
  }
  function lv6N(st, t, cnt, by, cv) { const fx = RS(st).lv6Fixed; return fx && fx[t] !== undefined ? fx[t] : Math.floor(cnt[t] / (by[t] || cv)); } // T18（O-12）：lv6Fixed＝色ごとの固定の祝福（社会 3）
  function lv6Preview(st, p) { const cv = RS(st).lv6Convert; if (!cv) return 0; const cnt = { body: RS(st).lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: Math.max(0, p.traits.length - 3 * (p.intel4VgN || 0)), social: p.coop, metab: p.organs.length }; const by = RS(st).lv6ConvertBy || {}; let n = 0; G.TRACKS.forEach(t => { if (p.lv[t] >= 6 && !(RS(st).lv6RealTracks || []).includes(t)) n += lv6N(st, t, cnt, by, cv); }); return n; } // 終了時換算の見込み（画面用）
  function stepCostTriple(p, track) { const lv0 = p.lv[track]; if (lv0 >= 3) return null; let sum = 0; for (let i = 0; i < 3; i++) { p.lv[track] = lv0 + i; const c = stepCost(p, track); if (c === null) { p.lv[track] = lv0; return null; } sum += c; } p.lv[track] = lv0; return sum; } // T14 三段進行（進化加速）：3 段分の E の合計（Lv5 まで）
  function stepCostDouble(p, track) { const lv0 = p.lv[track]; if (lv0 >= 4) return null; const c1 = stepCost(p, track); if (c1 === null) return null; p.lv[track] = lv0 + 1; const c2 = stepCost(p, track); p.lv[track] = lv0; return c2 === null ? null : c1 + c2 + (RS(p).doubleStepFee || 0); } // doubleStepFee＝二段進行の追加コスト（試作・既定 0） // T10 二段進行の合計 E
  function stepCost(p, track, forBonus) {
    const lv = p.lv[track]; if (lv >= (RS(p).maxLv || 5)) return null;
    if (lv === 4 && RS(p).lv5G) { const g = gateReq(p, track); if (g && g.have >= g.need) return 0; } // 試作 lv5G：ゲート充足ならEは不要（Gのみ）
    let base = (track === 'body' && RS(p).bodyStep) ? RS(p).bodyStep[lv] : RS(p).step[lv]; let d = 0; // 試作 bodyStep：身体だけ別のコスト表
    if (lv === 5 && RS(p).lv6E) base = RS(p).lv6E; // 試作 lv6E：Lv6 のEコストを全トラック統一
    if (lv === 5 && lv6PayDef(p, track)) return lv6PayE(p, track); // 案B：Lv6 は色別コスト。ここでは E 換算の目安を返す（支払いは lv6PayNow）
    if (track === 'body') { if (trait(p, 'DB') && trait(p, 'DB').strong) d += sc(p, 2); d += p.next.body; }
    if (track === 'intel') { if (trait(p, 'DI') && trait(p, 'DI').strong) d += sc(p, 2); d += p.next.intel; }
    const dv = trait(p, 'DV'); if (dv && RS(p).dvMode !== 'triple') d += RS(p).dvDisc ? RS(p).dvDisc[dv.strong ? 0 : 1] : sc(p, dv.strong ? 2 : 1); // T10 dvDisc＝[強, 弱] の絶対値／T14（dvMode 'triple'）は割引なし＝三段進行
    const xd = trait(p, 'XD'); if (xd) d += sc(p, xd.strong ? 3 : 2); // 試作 上位形質・適応爆発
    const da = trait(p, 'DA'); if (da && da.strong && da.track === track) d += sc(p, 1);
    d += p.next.any;
    const ca2 = organ(p, 'Ca2'); if (ca2 && (ca2.strong || p.uses.ca2 < 3)) d += sc(p, 1);
    const ca3 = organ(p, 'Ca3'); if (ca3) d += sc(p, ca3.strong ? 2 : 1);
    d += RS(p).organFx === 2 ? cxDisc(p, 'E') : sc(p, linMax(p, 'Cx', [1, 2, 3], [1, 1, 2])); // T7 促進系／T13 促進＝E の支払い割引
    let c = Math.max(ceilHalf(base), base - d);
    c = applyRh2(p, c);
    return c;
  }
  function applyRh2(p, c) {
    if (p.round.firstDone) return c;
    const o = organ(p, 'Rh2'); if (!o) return c;
    return Math.max(sc(p, 1), c - sc(p, o.strong ? 3 : 1));
  }
  function altFuelP(p, e) { const r = p.altFuel; if (!r) return null; return Math.ceil((e * r[0]) / r[1]); } // 代替燃料：E e ぶんを P で払うときの必要 P（切り上げ）
  function organCost(st, p, oid, full, anyTier) { // full＝定価（一気立て・T15 の差額払いを使わない）／anyTier＝まだ順番が来ていない上の段も、急速形成で建てるときの値段を返す（表示用・2026-11-09 v3.88）
    const lin = G.ORGANS[oid].lin; const tier = G.ORGANS[oid].tier; const n0 = lineageCount(p, lin);
    if (tier !== n0 + 1 && !(anyTier && tier > n0)) return null; const n = tier - 1; // 階層順に建造
    const first = st.shared.organFirst[oid] === undefined || st.shared.organFirst[oid] === p.id;
    const strong = RS(p).organSameEffect ? true : first; // 試作 organSameEffect：後続も同じ効果（先着の差は値段だけ）
    const ctab = ((RS(p).organCostBy || {})[lin] || RS(p).organCost || G.ORGAN_COST); let [e, g] = ctab[n]; const list = { E: e, G: g }; let diff = null; if (RS(p).organCumulative && n > 0 && !full) { diff = { E: ctab[n - 1][0], G: ctab[n - 1][1] }; e -= diff.E; g = Math.max(0, g - diff.G); } // T15 差額払い：1 つ前の段の定価（E・G とも）を引く（一気立て＝full は引かない）
    if (!first) { if (RS(p).organSameEffect) { if (!p.organNoG) e += sc(p, RS(p).organLateFee || 1); } else g = 0; } if (p.organNoG) g = 0; // T10 代謝 Lv4：G なし＋後追い料なし // organCostBy：系統別のコスト表／organLateFee：後追い料（基準単位）
    if (RS(p).organEscalate) e += Math.floor(p.organs.length / RS(p).organEscalate); // T4：所持器官数が増えるほど建造コスト+1E（N枚ごと）
    const ca1 = organ(p, 'Ca1'); if (ca1 && (ca1.strong || p.uses.ca1 < 3)) e -= sc(p, 1);
    const ca3 = organ(p, 'Ca3'); if (ca3) e -= sc(p, ca3.strong ? 2 : 1);
    if (p.symbiosis && st.players.some(q => q.id !== p.id && q.organs.some(o => G.ORGANS[o.id].lin === lin))) g = p.symbiosis === 'free' ? 0 : Math.max(0, g - sc(p, 1)); // 第42部 N8 共生：他者が同系統を持っていれば G なし（弱は G-1）
    if (RS(p).organFx === 2) { e -= cxDisc(p, 'E'); g = Math.max(0, g - cxDisc(p, 'G')); } // T13 促進
    e = Math.max(sc(p, 1), e);
    e = applyRh2(p, e);
    return { E: e, G: g, strong, first, list, diff };
  }
  function traitCost(st, p, tid, viaReward, wantWeak) {
    const t = G.TRAITS[tid];
    const strong = ((RS(p).traitChoice && wantWeak) || wantWeak === 'force') ? false : (st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id || p.alwaysStrong); // traitChoice：弱を選べる
    const tw = (RS(p).traitCosts || {})[tid] || (RS(p).traitCostTweak ? { DV: [6, 5], DG: [5, 4], MB: [5, 4] }[tid] : null); // T7 traitCosts／試作 traitCostTweak
    let c = (tw || t.cost)[strong ? 0 : 1]; if (RS(p).traitCostMul) c = Math.ceil(c * RS(p).traitCostMul); // 試作 traitCostMul
    c -= p.traitDisc;
    const tr1 = organ(p, 'Tr1'); if (tr1 && (tr1.strong || p.uses.tr1 < 3)) c -= sc(p, 1);
    const tr2 = organ(p, 'Tr2'); if (tr2) c -= sc(p, tr2.strong ? 2 : 1);
    const tr3 = organ(p, 'Tr3'); if (tr3) c -= sc(p, tr3.strong ? 3 : 2);
    c -= sc(p, linMax(p, 'Tl', [2, 3, 4], [1, 2, 3])); // T7 転写系：系統内の最大値
    if (RS(p).organFx === 2) c -= cxDisc(p, 'G'); // T13 促進＝G の支払い割引
    if (viaReward === 'free') return { G: 0, strong }; // T13 全転写：形質 1 枚無料
    if (viaReward) c -= viaReward;
    if (p.nextTraitDisc) c -= p.nextTraitDisc; // T10 知性 Lv3★ 弱：次の形質 -9G
    if (p.nextTraitFree) { const bs = (tw || t.cost); return { G: strong ? Math.max(0, bs[0] - bs[1]) : 0, strong }; } // T10 知性 Lv3★ 強：次の形質は弱なら無料・強は差額
    const floor = RS(p).traitHalfFloor ? Math.max(1, ceilHalf(Math.ceil(t.cost[strong ? 0 : 1] * (RS(p).traitCostMul || 1)))) : sc(p, 1); // 試作 traitHalfFloor：元コストの半分（切上）を下回らない
    return { G: Math.max(floor, c), strong };
  }
  function massCost(p, kind) {
    const R = RS(p); let c = R.massCost;
    const mc = trait(p, 'MC');
    // 2026-11-04 試作 mcMode='freeOnce'（ユーザー案）：強＝次の大量消費1回を無料（コスト0）・弱＝常時 −mcDiscWeak（無指定なら mcDisc）。既定（未指定）は従来＝強 恒久 −mcDisc・弱 1回 −mcDisc（p.next.mass）
    const freeOnce = R.mcMode === 'freeOnce'; const mcFree = !!(mc && freeOnce && mc.strong && p.mcFree);
    const disc = freeOnce ? (mc && !mc.strong ? (R.mcDiscWeak !== undefined ? R.mcDiscWeak : R.mcDisc) : 0) : (mc && mc.strong ? R.mcDisc : 0);
    const sub = disc + p.next.mass; const after = !!R.mcAfterCap; // 2026-11-04 試作 mcAfterCap：軽減を代謝/社会の固定コスト（mmCost/msCost）の後に引く＝代謝にも効く（既定は固定コストが先＝代謝は実質対象外）
    if (!after) c -= sub;
    if (kind === 'MB') { c -= p.massDisc; const mb = trait(p, 'MB'); if (mb) c -= (mb.strong || R.mbDiscWeak === undefined) ? R.mbDisc : R.mbDiscWeak; if (after) c -= sub; return mcFree ? 0 : Math.max(R.massMin.body, c); }
    if (kind === 'MM' && R.mmCost) c = Math.min(c, R.mmCost); // 試作 mmCost
    if (kind === 'MS' && R.msCost) c = Math.min(c, R.msCost); // 試作 msCost
    if (after) c -= sub;
    return mcFree ? 0 : Math.max(R.massMin.other, c);
  }
  // T3：トラックの次のLvに必要な収集物（gates）。無ければ null
  function gateCount(p, track) {
    let n = track === 'metab' ? p.organs.length : track === 'intel' ? traitCountC(p) : track === 'social' ? (RS(p).coopGateTotal ? (p.coopGained || 0) : p.coop) : RS(p).bodyAxis === 'L' ? (p.lInvested || 0) : (RS(p).pInvKinds === 'bodyOnly' ? (p.pInvBody || 0) : (p.pInv || 0));
    if (p.gateBonus && p.gateBonus[track]) n += p.gateBonus[track]; // T7 器官T3の強：ゲート+1
    if (RS(p).traitGateBoost) { // 試作：割引系形質を収集の加速に（強＝+1・弱＝0。DVは全色・強+1／弱は身体と知性のみ）
      const b = (id) => { const t = trait(p, id); return t ? (t.strong ? 1 : 0) : 0; };
      if (track === 'body') n += b('DB'); if (track === 'intel') n += b('DI');
      const da = trait(p, 'DA'); if (da && da.strong && da.track === track) n += 1;
      const dv = trait(p, 'DV'); if (dv) { if (dv.strong) n += 1; else if (track === 'body' || track === 'intel') n += 1; }
    }
    return n;
  }
  function gateLabel(st, t) { return t === 'body' && RS(st).bodyAxis === 'L' ? (RS(st).noAdapt ? G.GATE_LABEL_L.replace('・適応進化', '').replace('（支払い・緊急進出）', `（支払い・緊急進出${RS(st).breedL ? '・繁殖' : ''}）`) : G.GATE_LABEL_L) : G.GATE_LABEL[t]; }
  function gateNote(st, t, lv) { const R = RS(st); return (t === 'body' && lv === 4 && R.bodyAxis === 'L' && R.bodyBulkLv4) ? `（うち1回は${R.bodyBulkLv4}個を同時に投入）` : ''; } // 身体Lv4の一括投入条件の注記
  function gateShort(st, t) { return t === 'body' && RS(st).bodyAxis === 'L' ? G.GATE_SHORT_L : G.GATE_SHORT[t]; }
  function investL(p, st, n) { if (RS(p).bodyAxis !== 'L') return; const k = RS(p).lInvestByCount ? Math.max(1, n || 1) : 1; const r = p._round || 0; if (RS(p).lInvPerRound) { if (p._lInvRound === r) { p.lInvestedRaw = (p.lInvestedRaw || 0) + k; return; } p._lInvRound = r; } p.lInvested = (p.lInvested || 0) + k; if (RS(p).investPrepay) { const RN = RS(p).rounds || G.ROUNDS; const e = Math.max(0, RN - r); if (e > 0) { p.E += e; p._prepay = (p._prepay || 0) + e; } } } // 投入回数（lInvPerRound＝1R1回だけ加算／investPrepay＝残R数ぶんのE即時）
  function gateReq(p, track) { const g = RS(p).gates; if (!g) return null; const next = p.lv[track] + 1; if (next > 5) return null; return { need: g[track][next], have: gateCount(p, track) }; }
  // T3：収集物の数で「到達済みとみなす段」（autoLv）。この段までは自動で上がる。Eでの進行は制限なし（v3.16で先買い1段の制限を撤廃）
  function autoLv(p, track) { const g = RS(p).gates; if (!g) return null; const have = gateCount(p, track); const cap = RS(p).lv5G ? 4 : 5; let l = RS(p).lv0 ? 0 : 1; while (l < cap && have >= g[track][l + 1]) { if (track === 'body' && l === 3 && RS(p).bodyBulkLv4 && !p.lBulk) break; l++; } return l; } // 試作 bodyBulkLv4：身体Lv4は「2個以上を同時投入」した経験が要る
  // 報酬の連鎖（協調+1→社会 等）も拾うため、安定するまで繰り返す
  function syncGates(st, p) {
    if (!RS(p).gates) return;
    for (let guard = 0; guard < 20; guard++) {
      const t = G.TRACKS.find(tr => p.lv[tr] < autoLv(p, tr));
      if (!t) break;
      advanceTrack(st, p, t, `${gateLabel(st, t)}${gateCount(p, t)}で自動進化`);
    }
  }
  function tribVg(p, k) { const t = RS(p).tributeVg; return t && typeof t === 'object' ? (t[k] !== undefined ? t[k] : 1) : (t || 1); }
  function tribReal(p, k) { const t = RS(p).tributeReal; return t ? (t[k] || 0) : 0; } // 試作 tributeReal（第71部 §16）：祭壇の品目ごとの痕跡数 {G,L,coop}。祝福の数は tributeVg の品目別の値（0 も可）
  function tribOut(st, p, k, track, label) { const vg = tribVg(p, k), tr = tribReal(p, k); p.gemsets += vg; if (tr) addGem(st, p, track, tr, `献上（${label}）`); return '→ ' + [vg ? `祝福 ${p.gemsets}` : '', tr ? `痕跡+${tr}` : ''].filter(Boolean).join('・'); } // tributeVg：献上1回の祝福数（T10 は v3.67 から 2＝祭壇）
  // v3.70 増幅の対象（第68部・ユーザー決定）：amplify.lins（系統）＋ amplify.organs（個別）。buildOnly＝建造時効果の器官（建造と同時の増幅だけ）。未設定＝代謝・転写・促進
  function ampOk(x, oid, built) { const AM = RS(x).amplify; if (!AM) return false; const d = G.ORGANS[oid]; if (!d) return false; if (built && (AM.buildOnly || []).includes(oid)) return false; return (AM.lins || ['Mg', 'Tl', 'Cx']).includes(d.lin) || (AM.organs || []).includes(oid); }
  function ampTargetText(x) { const AM = RS(x).amplify || {}; const lins = (AM.lins || ['Mg', 'Tl', 'Cx']).map(l => G.LINEAGES[l]).join('・'); const os = (AM.organs || []).map(id => G.ORGANS[id].name).join('・'); const bo = (AM.buildOnly || []).map(id => G.ORGANS[id].name).join('・'); return os ? `${lins}の器官と${os}。数の効果だけ2倍${bo ? '・' + bo + 'は形成と同時のみ' : ''}` : lins; }
  function tribOutText(x, k) { const vg = tribVg(x, k), tr = tribReal(x, k); const a = []; if (tr) a.push(`痕跡+${tr}`); if (vg) a.push(`祝福+${vg}`); return a.join('・') || '—'; } // T14（第71部 §16 M-a）：祭壇の出力の表示（遺伝子＝痕跡+1・祝福+1／生命核＝痕跡+2／協調＝祝福+2）
  function tribLimitText(x) { return RS(x).tributeOnceGame ? '個人ボードの祭壇・1ゲームに1回' : '各自1ラウンド1回'; } // v3.67 祭壇（第67部 案 B）
  function breedCost(p) { if (p.breed >= RS(p).breed.length) return null; const mb = trait(p, 'MB'); const c = RS(p).breed[p.breed]; if (mb && !mb.strong && RS(p).mbBreedDiscWeak !== undefined) return Math.max(sc(p, 10), c - RS(p).mbBreedDiscWeak); return mb && mb.strong ? (RS(p).mbMode === 'multi' ? c : RS(p).mbBreedDisc !== undefined ? Math.max(sc(p, 10), c - sc(p, RS(p).mbBreedDisc)) : Math.ceil(c / 2)) : c; } // mbMode 'multi'（T14）：強の割引なし（代わりに同時払い 2 段ずつ）
  function breedMaxN(p) { const mb = trait(p, 'MB'); return RS(p).mbMode === 'multi' && mb && mb.strong ? (RS(p).mbBreedN || 2) : 1; } // T14 繁殖変換：P 払い・L 払いそれぞれの上限段数（増殖暴走の強で 2） // mbBreedDisc：増殖暴走の強＝各段 -N（旧は半減） // 段数＝breed 配列の長さ（C2 で上限を伸ばす試作）
  function gemsetPrice(p) { const T = RS(p).tribute; if (T && T.flatG) return sc(p, T.flatG); return sc(p, Math.max(G.GEMSET_FLOOR, G.GEMSET_BASE - p.traits.length - (RS(p).gemsetCoopDisc ? Math.floor(p.coop / 2) : 0))) + (RS(p).gemsetEscalate && !p.gemsetNoEsc ? RS(p).gemsetEscalate * p.gemsets : 0); } // tribute.flatG：献上（遺伝子）は定額 // 試作 gemsetEscalate：購入ごとに+N／gemsetCoopDisc：−協調÷2
  function pbGain(x) { const v = RS(x).pbGain; return v !== undefined ? v : sc(x, 10); } // pbGain：Pブーストの獲得量（数値セットの絶対値。未指定は P10×倍率）
  function pbCost(p) { const tr3 = organ(p, 'Tr3'); return Math.max(sc(p, 1), sc(p, 2) - (tr3 ? sc(p, tr3.strong ? 3 : 2) : 0)); }

  // ---------- 支払い ----------
  // pay: {E:n} を E と L（1L=3E）で支払う。useL = 使うL個数
  function payE(p, amount, useL) {
    useL = useL | 0;
    if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const lv = p.lValue || sc(p, 3); const covered = useL * lv; const needE = Math.max(0, amount - covered);
    if (p.E < needE) throw new Error(`エネルギーが足りません（必要E${amount}・所持E${p.E}${p.L ? `・生命核1=E${lv}で補えます` : ''}）`);
    p.E -= needE; p.L -= useL; if (useL > 0) investL(p, null, useL); if (RS(p).bodyBulkLv4 && useL >= RS(p).bodyBulkLv4) p.lBulk = true;
    return { E: needE, L: useL };
  }
  function payG(p, amount, useL) {
    useL = useL | 0; if (useL > p.L) throw new Error(`生命核が足りません（指定L${useL}・所持L${p.L}）`);
    const lv = p.lValue || sc(p, 3); const needG = Math.max(0, amount - useL * lv); if (p.G < needG) throw new Error(`遺伝子が足りません（必要G${amount}・所持G${p.G}${p.L ? `・生命核1=G${lv}で補えます` : ''}）`);
    p.G -= needG; p.L -= useL; if (useL > 0) investL(p, null, useL); if (RS(p).bodyBulkLv4 && useL >= RS(p).bodyBulkLv4) p.lBulk = true; return { G: needG, L: useL };
  }

  // ---------- 共通：アクション開始・終了 ----------
  function assertTurn(st, pid) { if (st.phase !== 'play') throw new Error('プレイ中ではありません'); if (cur(st).id !== pid) throw new Error('手番ではありません'); }
  function useToken(p, needW) {
    if (needW) { if (p.left.W <= 0) throw new Error(`ワーカーが必要です（残りワーカー0${p.left.AT ? '・ATは資源獲得・器官形成・淘汰・形質獲得等に使えます' : ''}）`); p.left.W -= 1; return 'W'; }
    if (p.left.AT > 0) { p.left.AT -= 1; return 'AT'; }
    if (p.left.W > 0) { p.left.W -= 1; return 'W'; }
    throw new Error('このラウンドのワーカーを使い切っています');
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
    if (opt.mimic && G.RES_SLOTS.includes(slotId) && p.mimic) { if (p.round.mimicUsed) throw new Error('擬態は1ラウンド1回です'); if (p.mimic !== 'free') { const me = sc(p, parseInt(String(p.mimic).slice(1), 10) || 3); if (p.E < me) throw new Error(`擬態（弱）にはE${me}が必要です`); p.E -= me; } p.round.mimicUsed = true; return { bypass: 'mimic' }; } // T7 擬態
    const bypL = byp && !RS(p).launchFree; // T18（O-12）：使用済みの枠への緊急進出は廃止（後乗りは協調進出だけ）
    if (opt.useL && bypL) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; investL(p, null); return { bypass: 'L' }; }
    const bypC = byp || coopBypassable(st, slotId, p); // 試作 bypassCoopWide：協調発進は大量消費・発現の枠も突破できる（緊急発進の対象は変えない）
    if (opt.useCoop && bypC && st.ext === 'x1') { const bc = RS(p).bypassCoopCost || 2; if (p.coop < bc) throw new Error(`協調が${bc}個ありません`); p.coop -= bc; return { bypass: 'coop' }; }
    const bc0 = RS(p).bypassCoopCost || 2; const ways = [bypL && p.L > 0 ? '緊急進出＝生命核1' : null, bypC && st.ext === 'x1' && p.coop >= bc0 ? `協調進出＝協調${bc0}` : null].filter(Boolean);
    throw new Error(`このスロットは今ラウンド ${P(st, st.shared.used[key]).name} が使用済みです${bypC ? (ways.length ? `（${ways.join('／')}で使えます）` : bypL ? '（生命核があれば緊急進出で使えます）' : `（協調${bc0}があれば協調進出で使えます）`) : '（次のラウンドまで待ってください）'}`);
  }
  // 試作 bypassCoopWide（2026-10-26・第39部）：協調発進の突破対象に大量消費4枠と発現を加える（拡張x1）。緊急発進（L）の対象は bypassable のまま
  function coopBypassable(st, slotId, p) { if (!(RS(p).bypassCoopWide && st.ext === 'x1')) return false; const s = G.SLOT_BY_ID[slotId]; return !!s && (s.group === 'mass' || slotId === 'EXP'); }
  function bypassable(st, slotId, p) { if (G.RES_SLOTS.includes(slotId) || slotId === 'PB' || (st.ext === 'x1' && G.TRAIT_SLOTS.includes(slotId))) return true; /* 2026-11-05 ユーザー指示：Pブースト購入も緊急発進（L1）・協調発進の対象に（Wなし実行・祝福枠の扱いは従来どおり） */ if (p && p.bypassWide) { const s = G.SLOT_BY_ID[slotId]; return !!s && (s.group === 'mass' || slotId === 'GEM' || G.TRAIT_SLOTS.includes(slotId)); } return false; } // T5 身体Lv3★強：緊急発進の対象に大量消費・宝石セット・形質購入
  const bypassDesc = (b) => b === 'L' ? '緊急進出（L-1）' : b === 'coop' ? '協調進出' : b === 'mimic' ? '擬態' : `排他突破（${b}）`;
  // コマを置かない実行（Wなし実行）用：使用可否だけ判定し、使用済みにはしない
  function peekSlot(st, p, slotId, opt) {
    opt = opt || {};
    const key = usedKey(st, slotId);
    if (st.shared.used[key] === undefined) return { bypass: null };
    if (opt.useL && G.RES_SLOTS.includes(slotId) && !RS(p).launchFree) { if (p.L <= 0) throw new Error('生命核がありません'); p.L -= 1; investL(p, null); return { bypass: 'L' }; }
    throw new Error(`このスロットは今ラウンド ${P(st, st.shared.used[key]).name} が使用済みです（自由行動でも不可${p.L > 0 && !RS(p).launchFree ? '・緊急進出＝生命核1で使えます' : ''}）`);
  }
  function afterAction(st, p, desc, tokenUsed) {
    p.round.firstDone = true;
    if (tokenUsed) log(st, p.id, `${p.name}：${desc}`, 'act'); else log(st, p.id, `${p.name}：${desc}（ワーカー消費なし）`, 'act');
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
  function gainRes(p, res, n) { if (res === 'coop') { const before = p.coop; p.coop = Math.min(RS(p).coopMax || G.COOP_MAX, p.coop + n); p.coopGained = (p.coopGained || 0) + (p.coop - before); if ((RS(p).coopGateTotal ? p.coopGained : p.coop) >= (RS(p).coopGemAt || 8) && !p._coop8) { p._coop8 = true; p._coop8Due = true; } } else p[res] += n; } // 試作 coopGateTotal（第39部）：社会の収集物と痕跡の到達判定を「受け取った協調の累計」（払っても減らない＝生命核の投入と同じ数え方）に // _coop8Due：協調8初到達の報酬を apply 後に処理（試作 coop8Gem／coop8Coef）
  function addUpgrade(st, p, why) {
    const c2 = RS(p).coef2;
    if (c2) { // C2：繁殖は繁栄度へ、それ以外は成熟度へ（コマは触らない）
      const isB = /繁殖/.test(why);
      if (isB) { p.breedUps = (p.breedUps || 0) + 1; log(st, p.id, `${p.name}：${why} → 繁栄度 ×${coefB(p)}`); }
      else { if ((p.collectUps || 0) >= (c2.collectMax || 4)) { log(st, p.id, `（成熟度は上限×${(c2.collectBase || 3) + (c2.collectMax || 4)}のため ${why} の+1は無効）`); return; } p.collectUps = (p.collectUps || 0) + 1; log(st, p.id, `${p.name}：${why} → 成熟度 ×${coefC(p)}`); }
      p.upgrades += 1; return;
    }
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
  function addGem(st, p, track, n, why) { p.gems[track] += n; log(st, p.id, `${p.name}：痕跡+${n}（${why}）`, 'gem'); } // 2026-10-28 色の廃止：表示は「痕跡」。内部では得た経路（track）だけ記録

  function advanceTrack(st, p, track, why) {
    if (p.lv[track] >= (RS(p).maxLv || 5)) return false;
    p.lv[track] += 1; const lv = p.lv[track];
    if (lv === 6) { // 案B（lv6First）：先着＝痕跡+1＋祝福+1／後着＝痕跡+1。lv6First なしなら宝石+1 のみ（先着なし）
      const key = track + 6; let first = false; if (RS(p).lv6First && st.shared.firsts[key] === undefined) { st.shared.firsts[key] = p.id; first = true; }
      addGem(st, p, track, 1, `${G.TRACK_INFO[track].name} Lv6${first ? '・先駆' : ''}`); if (first || RS(p).lv6AllVg) { p.gemsets += 1; log(st, p.id, `${p.name}：祝福+1（${G.TRACK_INFO[track].name} Lv6${first ? ' 先駆ボーナス' : '（lv6AllVg）'}）→ 祝福 ${p.gemsets}`); } // 試作 lv6AllVg（第41部）：後着も祝福+1
      log(st, p.id, `${p.name}：${G.TRACK_INFO[track].name} Lv6（${why}）`); return true; }
    let strong = false;
    if (lv === 3 || lv === 5) {
      const key = track + lv;
      const viaJump = RS(p).jumpNoFirst && (why === '知的跳躍' || why === '身体覚醒'); // 試作 jumpNoFirst（第40部 K2）：跳躍形質で着いた★は先着を取らず後着扱い（宝石は得る・先着ボーナスと強効果なし・先着は次に自力で着いた人のもの）
      let isFirst = false; if (!viaJump && st.shared.firsts[key] === undefined) { st.shared.firsts[key] = p.id; strong = true; isFirst = true; }
      if (RS(p).paidStrong && /進行|^進化$|自動進化|跳躍|覚醒/.test(why)) strong = true; // T10（第59部）：自分で払って上げた段（E 進行・跳躍形質・恩寵枠の跳躍）は★なら後着でも強の報酬（痕跡の先着ボーナスは先着のみ＝firstBonusStrict）
      // JI/JB 弱：Lv5★で必ず強効果（jumpNoFirst では跳躍で着いた段には適用しない。T10 paidStrong では不要）
      if (lv === 5 && !strong && !viaJump && !RS(p).paidStrong) { const t = trait(p, track === 'intel' ? 'JI' : 'JB'); if (t && !t.strong) strong = true; }
      if (!strong && p.foresight && (p.foresight === 'all' || lv === 5 || p.foresight === 'once')) { strong = true; if (p.foresight === 'once') p.foresight = null; } // T7 先見（T10 の弱＝どちらか1回）
      p.flags.strong[key] = strong;
      if (track === 'body' && RS(p).bodyCoef) { addUpgrade(st, p, `身体 Lv${lv}★（係数軸）`); if (lv === 5 && strong) { p.P += sc(p, 10); log(st, p.id, `${p.name}：先駆ボーナス P+${sc(p, 10)}`); } } // 試作 bodyCoef：身体は宝石でなく係数の軸
      else { const bonus = RS(p).firstBonusStrict ? isFirst : strong; addGem(st, p, track, 1, `${G.TRACK_INFO[track].name} Lv${lv}★${bonus ? '・先駆' : strong ? '・強' : ''}`); if ((lv === 5 || (lv === 3 && RS(p).lv3FirstBonus)) && bonus) addGem(st, p, track, 1, '先駆ボーナス'); } // 試作 lv3FirstBonus（第71部 §17）：Lv3★ も先着は +1（先着 2／後着 1）
    }
    log(st, p.id, `${p.name}：${G.TRACK_INFO[track].name} Lv${lv}（${why}）`);
    applyReward(st, p, track, lv, strong, false);
    return true;
  }
  // 固有報酬。temp=true は感応T1弱の「恒久効果は一時扱い」
  function applyReward(st, p, track, lv, strong, temp) {
    if (track === 'body' && RS(p).bodyAxis === 'L' && RS(p).bodyRewards === 'P') { // T7試作：利回りがPの世界の身体報酬（序中盤の投入で後のLの価値を上げる）
      if (lv === 2) { if (RS(p).body2L) p.L += 1; }
      if (lv === 3) { p.lValue = Math.max(p.lValue || sc(p, 3), sc(p, 4)); if (strong) p.L += 1; }
      if (lv === 4) { if (RS(p).bodyLv4Gem) addGem(st, p, 'body', 1, '身体 Lv4（生命核軸）'); p.yieldMul = 2; }
      if (lv === 5) { p.L += 1; if (strong) p.lValue = Math.max(p.lValue || sc(p, 3), sc(p, 5)); }
    } else if (track === 'body' && RS(p).bodyAxis === 'L') { // T5：身体＝生命核軸（宝石・係数・大量消費の軽減は持たない）
      if (lv === 2) { p.yieldPick = ['E', 'G']; if (RS(p).body2L) p.L += 1; if (RS(p).body2Gem) addGem(st, p, 'body', 1, '身体 Lv2（生命核軸）'); if (RS(p).lValueLv2) p.lValue = Math.max(p.lValue || 3, 4); }
      if (lv === 3) { p.L += 1; if (strong) { if (RS(p).body3YieldAdd) p.yieldAdd = (p.yieldAdd || 0) + 1; else p.bypassWide = true; } }
      if (lv === 4) { p.lValue = Math.max(p.lValue || sc(p, 3), sc(p, 4)); p.yieldPick = ['E', 'G', 'P']; if (RS(p).bodyLv4Gem) addGem(st, p, 'body', 1, '身体 Lv4（生命核軸）'); }
      if (lv === 5) { p.L += 1; if (strong) { if (RS(p).body5Coef) addUpgrade(st, p, '身体 Lv5★（生命核軸）'); else p.yieldMul = 2; } }
    } else if (track === 'body') {
      if (lv === 2) p.P += sc(p, 8);
      if (lv === 3) { if (strong) p.pending.push({ type: 'freeMass' }); else p.P += sc(p, 15); }
      if (lv === 4) p.massDisc += RS(p).massDiscLv;
      if (lv === 5) p.massDisc += RS(p).massDiscLv;
    }
    if (track === 'intel') {
      if (lv === 2) p.G += sc(p, 3);
      if (lv === 3 && RS(p).intelRewards !== 'learn') { if (strong) p.pending.push({ type: 'rewardTrait', disc: sc(p, 3) }); else if (temp) p.G += sc(p, 1); /* 弱の恒久G+1/Rは income() で参照 */ }
      if (RS(p).intelRewards === 'learn') { // T7 第21部：学習／研究／洞察（形質の割引なし）
        if (lv === 3) { if (strong) p.pending.push({ type: 'learn' }); else if (!temp) p.gSlotDisc = (p.gSlotDisc || 0) + sc(p, 1); }
        if (lv === 4) { if (!temp) p.gemsetNoEsc = true; }
        if (lv === 5) { if (strong) p.alwaysStrong = true; else p.G += sc(p, 6); }
      } else if (RS(p).intelRewards === 'trait') { // T10（第58〜59部）：Lv3★ 強＝次の形質1枚を弱なら無料（強は差額）／弱＝次の形質 -9G、Lv4＝形質3枚ごとに祝福+1（即時・Lv6 換算と重ねない）、Lv5★＝T7 と同じ
        if (lv === 3) { if (strong) p.nextTraitFree = true; else if (!temp) p.nextTraitDisc = (p.nextTraitDisc || 0) + sc(p, 3); }
        if (lv === 4 && !temp) { p.intel4Vg = true; const k = Math.floor(p.traits.length / 3) - (p.intel4VgN || 0); if (k > 0) { p.gemsets += k; p.intel4VgN = (p.intel4VgN || 0) + k; log(st, p.id, `${p.name}：祝福+${k}（知性 Lv4：形質${p.traits.length}枚）→ 祝福 ${p.gemsets}`); } }
        if (lv === 5) { if (strong) p.alwaysStrong = true; else p.G += sc(p, 6); }
      } else {
      if (lv === 4) { if (RS(p).intel4 === 'traitDisc') { if (!temp) p.traitDisc += sc(p, 1); } else p.pending.push({ type: 'bonusAction' }); }
      if (lv === 5) { if (strong) { p.traitDisc = sc(p, 2); p.alwaysStrong = true; } else p.G += sc(p, 6); }
      }
    }
    if (track === 'social') {
      if (RS(p).socialRewards === 'shield') { // T4：協調を報酬から外す（自己参照の解消）
        if (lv === 2) p.P += sc(p, 6);
        if (lv === 3) { if (strong) p.shields += 1; else p.P += sc(p, 10); }
        if (lv === 4) { p.shields += 1; if (RS(p).social4Gem) addGem(st, p, 'social', 1, '社会 Lv4（協調軸）'); }
        if (lv === 5) p.shields += strong ? 2 : 1;
      } else {
        if (lv === 2) gainRes(p, 'coop', 1);
        if (lv === 3) { if (strong) gainRes(p, 'coop', 2); else { gainRes(p, 'coop', 1); p.G += sc(p, 3); } }
        if (lv === 4) p.shields += 1;
        if (lv === 5) { gainRes(p, 'coop', 1); p.shields += strong ? 2 : 1; }
      }
    }
    if (track === 'metab') {
      if (lv === 3) { if (strong) { if (temp) { p.E += sc(p, 1); p.G += sc(p, 1); } else p.inc.E += 0; /* 強の恒久E+1 G+1は income() で参照 */ } else p.E += sc(p, 8); }
      if (lv === 4) { if (RS(p).metab4 === 'organNoG') p.organNoG = true; else if (RS(p).metab4 === 'special') { if (!temp && (st.shared.special || []).length) p.pending.push({ type: 'specialOrgan' }); else if (!temp) log(st, p.id, `${p.name}：特殊器官は場に残っていません`); } else p.freeConv = true; } // T15：特殊器官を 1 枚取る // T10：無料変換を撤去 → 器官の G なし＋後追い料なし
      if (lv === 5 && temp) { const k = strong ? 2 : 1; p.E += k; p.G += k; p.P += k; }
    }
  }
  function reachedMilestones(p) { const out = []; G.TRACKS.forEach(t => { [3, 5].forEach(lv => { if (p.lv[t] >= lv) out.push({ track: t, lv }); }); }); return out; }

  function giveTrait(st, p, tid, forceStrong, how, opt) {
    opt = opt || {};
    const t = G.TRAITS[tid];
    if (trait(p, tid)) throw new Error('同じ形質は1枚まで');
    let strong = forceStrong || st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id || p.alwaysStrong;
    if (RS(p).traitChoice && opt.weak && !forceStrong) strong = false; // 弱を選んだ（強は残る）
    if (st.shared.traitFirst[tid] === undefined && (strong || !RS(p).traitChoice)) st.shared.traitFirst[tid] = p.id; // traitChoice では強を取った人だけ記録
    const rec = { id: tid, strong };
    if (tid === 'IM') rec.res = opt.res || 'E';
    if (tid === 'DA' && strong) rec.track = opt.track || 'body';
    p.traits.push(rec);
    log(st, p.id, `${p.name}：形質 ${tid} ${t.name}（${strong ? '強' : '弱'}・${how}）`);
    // 即時効果（st._noTraitFx＝枠の見込み表示用。淘汰(知性)はどの形質を選ぶか決まっていないので、形質の効果は数えず枚数だけ数える・2026-11-10 v3.93 ユーザー指摘）
    if (!st._noTraitFx) {
    if (!strong) {
      if (tid === 'IE') p.E += sc(p, 6); if (tid === 'IG') p.G += sc(p, 3); if (tid === 'IP') p.P += sc(p, 9); if (tid === 'IB') { p.E += sc(p, 3); p.G += sc(p, 3); }
      if (tid === 'DB') p.next.body += 2; if (tid === 'DI') p.next.intel += 2; if (tid === 'MC' && RS(p).mcMode !== 'freeOnce') p.next.mass += RS(p).mcDisc; if (tid === 'DA') p.next.any += 1;
    }
    if (tid === 'MC' && strong && RS(p).mcMode === 'freeOnce') p.mcFree = (p.mcFree || 0) + 1; // 試作 mcMode='freeOnce'：強＝次の大量消費1回を無料
    if (tid === 'NC') { gainRes(p, 'coop', (RS(p).ncCoop || [3, 2])[strong ? 0 : 1]); if (!strong && RS(p).weakTraits2) p.P += sc(p, 3); } // T10 弱：協調+1＋P+9
    if (tid === 'NB') { p.crystalDiscL = 1; p.crystalDiscC = (strong && RS(p).nbCoopDisc !== false) ? 1 : 0; if (strong && RS(p).nbCrystalInvest) p.crystalInvest = true; } // nbCrystalInvest：強は献上（生命核）で払った L も身体の収集物に数える（2026-10-25 案2） // nbCoopDisc=false：群れの結晶側の割引なし
    if (tid === 'NM') p.mimic = strong ? 'free' : (RS(p).weakTraits2 ? 'E2' : 'E3'); // T10 弱：E6
    if (tid === 'NL') { p.L += strong ? 2 : 1; if (!strong && RS(p).weakTraits2) p.E += sc(p, 3); } // T10 弱：L+1＋E+9
    if (tid === 'NF') p.foresight = strong ? 'all' : (RS(p).weakTraits2 ? 'once' : 'lv5'); // T10 弱：どちらか1回
    if (tid === 'NR') { const N2 = RS(p).nrTwoN; const nmax = N2 ? N2[strong ? 0 : 1] : (strong && RS(p).nrMode === 'two' ? 1 : 0); // T13：強＝2 枚で完成 1 系統／T14（nrTwoN [2,1]）：強 2 系統・弱 1 系統
      if (nmax) { p.nrTwo = true; p.nrTwoMax = nmax; p.nrTwoLins = p.nrTwoLins || []; // 取得時に 2 枚の系統があれば即時に完成（残り系統数まで）
        st.shared.lineages.filter(l => lineageCount(p, l) === 2 && !lineageDone(p, l)).forEach(l => { if (!nrTwoLeft(p)) return; p.nrTwoLins.push(l); const done = st.shared.lineages.filter(x => lineageDone(p, x)).length; if (RS(p).lineageCoefMax !== undefined && done > RS(p).lineageCoefMax) log(st, p.id, `${p.name}：適応放散で${G.LINEAGES[l]}系統完成（成熟度+1は${RS(p).lineageCoefMax}系統目まで・今回は無し）`); else addUpgrade(st, p, `${G.LINEAGES[l]}系統完成（適応放散・2 枚）`); }); }
      else if (strong) p.lineageCoefAdd = 1; else p.lineageE3 = true; }
    if (tid === 'DV' && RS(p).dvTriple) p.dv3 = (p.dv3 || 0) + RS(p).dvTriple[strong ? 0 : 1]; // T14（第71部 §9 D-a）：三段進行の回数（強 2・弱 1）
    if (tid === 'NE') p.altFuel = strong ? [1, 1] : [5, 3]; // 第42部 N5（2026-10-30 ユーザー採用：強 E1＝P1／弱 E3＝P5。[P, E] の比）
    if (tid === 'NS') p.symbiosis = strong ? 'free' : 'disc'; // 第42部 N8
    if (tid === 'NP') p.spore = strong ? 3 : 2; // 第42部 N9
    const jmax = RS(p).jumpMaxLv || 99; // 試作 jumpMaxLv：跳躍で上がれる上限（Lv6 は飛び越えない）
    // 試作 leapStrong（第68部・2026-11-06 ユーザー所見「JI/JB の強は人が使うと強すぎる」）：'res'＝強は +1 段＋色の資源（JI G+{3}／JB L+1）／'cap4'＝強の 2 段目は Lv4 を超えない（Lv3→5 の跳躍を止める）。未設定＝現行（+2 段）
    const LS = RS(p).leapStrong; const leap2 = (track) => strong && p.lv[track] < jmax && (LS !== 'res') && (LS !== 'gate') && (LS !== 'gem') && !(LS === 'cap4' && p.lv[track] >= 4); // 'gem'（T14・第71部 §12 J-d）＝強は +1 段＋痕跡+1
    if (tid === 'JI') { if (p.lv.intel < jmax) advanceTrack(st, p, 'intel', '知的跳躍'); if (leap2('intel')) advanceTrack(st, p, 'intel', '知的跳躍'); if (strong && LS === 'res') { p.G += sc(p, 3); log(st, p.id, `${p.name}：知的跳躍（強）G+${sc(p, 3)}`); } if (strong && LS === 'gate') { p.gateBonus = p.gateBonus || {}; p.gateBonus.intel = (p.gateBonus.intel || 0) + 1; log(st, p.id, `${p.name}：知的跳躍（強）知性の臨界+1`); } if (strong && LS === 'gem') addGem(st, p, 'intel', 1, '知的跳躍（強）'); } // T12（第69部 3a）：強＝+1 段＋ゲート+1
    if (tid === 'JB') { if (p.lv.body < jmax) advanceTrack(st, p, 'body', '身体覚醒'); if (leap2('body')) advanceTrack(st, p, 'body', '身体覚醒'); if (strong && LS === 'res') { p.L += 1; log(st, p.id, `${p.name}：身体覚醒（強）L+1`); } if (strong && LS === 'gate') { p.gateBonus = p.gateBonus || {}; p.gateBonus.body = (p.gateBonus.body || 0) + 1; log(st, p.id, `${p.name}：身体覚醒（強）身体の臨界+1`); } if (strong && LS === 'gem') addGem(st, p, 'body', 1, '身体覚醒（強）'); }
    }
    const n = traitCountC(p); if ((RS(p).traitCoef || [4, 8]).includes(n)) addUpgrade(st, p, `形質${n}枚目`);
    if (p.intel4Vg) { const k = Math.floor(n / 3) - (p.intel4VgN || 0); if (k > 0) { p.gemsets += k; p.intel4VgN = (p.intel4VgN || 0) + k; log(st, p.id, `${p.name}：祝福+${k}（知性 Lv4：形質${n}枚目）→ 祝福 ${p.gemsets}`); } } // T10 知性 Lv4。2026-11-10 v3.94 O-11：形質の取得で Lv4 に上がった（跳躍）とき、到達時の一括（枚数÷3）とこの「3 の倍数枚目 +1」が同じ枚数で二重に入っていた → 受け取り済みの回数（intel4VgN）との差だけ渡す
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
    if (a.shield) { if (p.shields <= 0) throw new Error('自由行動がありません'); if (a.slot === 'PB') throw new Error('自己複製は対象外'); }
    if (RS(p).herd && (a.slot === 'EG' || a.slot === 'GG') && p.P < (RS(p).herdCost || 6)) throw new Error(`個体数が足りません（群体はP${RS(p).herdCost || 6}を払い資源＋協調+1）`);
    // Wなし実行はコマを置かないのでスロットを占有しない（使用済みにしない）。既に使用済みのスロットは不可（緊急発進との併用は可）
    const LF = RS(p).launchFree; // T18（O-12・第71部 §38 U7）：緊急進出＝空いている資源枠にワーカーを置くとき、生命核 1 個で獲得量 LF 倍（自己複製・自由行動・神の加護の即時枠は対象外）
    if (LF && a.useL) { if (a.slot === 'PB') throw new Error('緊急進出は自己複製には使えません'); if (a.shield || a.viaBoost) throw new Error('緊急進出はワーカーを置くときだけ使えます'); if (p.L <= 0) throw new Error('生命核がありません'); if (st.shared.used[usedKey(st, a.slot)] !== undefined) throw new Error('緊急進出は空いている資源枠にだけ使えます（使用済みの枠は協調進出）'); }
    const cl = a.viaBoost ? { bypass: null } : a.shield ? peekSlot(st, p, a.slot, { useL: LF ? false : a.useL }) : claimSlot(st, p, a.slot, { useL: LF ? false : a.useL, useCoop: a.bypassCoop, mimic: a.bypassMimic });
    const launch = !!(LF && a.useL); if (launch) { p.L -= 1; investL(p, st, 1); } // viaBoost：神の加護の即時枠（コマ不要・占有しない・使用済みでも可）
    if (a.viaBoost) { /* コマ不要 */ } else if (a.shield) p.shields -= 1; else tok = useToken(p, false);
    const fv = RS(p).finalSlotVg; const finalR = st.round === (RS(p).rounds || G.ROUNDS); // 試作 finalSlotVg（第49部）：最終ラウンドの資源枠で祝福。{mode:'choice'（資源の代わりに祝福）|'add'（資源に加えて祝福）, vg:1}
    if (a.vg) { if (!(fv && fv.mode === 'choice' && finalR)) throw new Error('最終ラウンドの資源枠でだけ祝福を選べます'); if (a.slot === 'PB') throw new Error('自己複製は対象外'); if (fv.noBypass && (cl.bypass || a.shield || a.viaBoost)) throw new Error('最終Rの祝福は空いている枠にワーカーを置いたときだけ'); if (fv.once && p.round.finVgUsed) throw new Error('最終Rの祝福は各自1回'); p.round.finVgUsed = true; p.gemsets += fv.vg || 1; afterAction(st, p, `${G.SLOT_BY_ID[a.slot].name}（最終R：資源の代わりに祝福+${fv.vg || 1}）→ 祝福 ${p.gemsets}${cl.bypass ? '・' + bypassDesc(cl.bypass) : ''}`, !a.shield && !a.viaBoost); return !a.shield && !a.viaBoost; }
    const lm = (RS(p).launchMul && (cl.bypass === 'L' || cl.bypass === 'coop') && G.RES_SLOTS.includes(a.slot)) ? RS(p).launchMul : 1; // T12（第69部 K1）：緊急発進・協調発進で使った資源枠は獲得量 2 倍（Pブーストは対象外・協調ボーナスは通常）
    const pt = Math.floor(p.P / sc(p, 10)); const bm = launch ? LF : (p.round.resBoost || 1) * lm; // T18：緊急進出の 3 倍は神の加護の 2 倍と重ねない // 第35部 神の加護：このラウンドの残り、資源枠の獲得量が倍（協調ボーナス・コストはそのまま）
    const desc = [];
    const cbBase = RS(p).coopBonusCap !== undefined ? Math.min(p.coop, RS(p).coopBonusCap + (p.coopCapAdd || 0)) : p.coop; // 協調ボーナス（T4は上限+4・T7 群心核で上限+）
    let cb = cbBase; if (cl.bypass === 'coop' && RS(p).bypassCoopFull) cb = p.coop; // bypassCoopFull：協調発進で使った枠は上限なし
    const cm = RS(p).coopMode; let spend = 0;
    if (cm === 'tier') cb = p.coop >= 8 ? 3 : p.coop >= 4 ? 2 : p.coop >= 1 ? 1 : 0; // K1 段階制
    if (cm === 'half') cb = p.coopRoundUp ? Math.ceil(cb / 2) : Math.floor(cb / 2);
    if (cm === 'third') cb = RS(p).coopThirdRound ? Math.floor((cb + 1) / 3) : Math.floor(cb / 3); // T9：協調3個につき+1（切り捨て＝印 3・6・9・12／coopThirdRound＝四捨五入＝印 2・5・8・11）
    if (p.coopBonusAdd && p.coop > 0) cb += p.coopBonusAdd; // 群心核（hc3Bonus）：協調を持っていればボーナス+N // 資源全体を倍にした場合の近似（協調ボーナスの相対価値を半分・切り捨て）
    if (RS(p).coopBonusSlots && !RS(p).coopBonusSlots.includes(a.slot)) cb = 0; // K2 ボーナスが付く枠を絞る
    if (cm === 'spend') { cb = 0; if (a.coopSpend && a.slot !== 'PB') { if (p.coop < 1) throw new Error('協調がありません'); p.coop -= 1; spend = RS(p).coopSpendGain || 3; } } // K3 消費型（協調の減少は収集物の数にも反映される）
    const coopTo = (res) => { if (cb > 0) { gainRes(p, res, cb); desc.push(`協調+${cb}${res}`); } if (spend > 0) { gainRes(p, res, spend); desc.push(`協調消費 ${res}+${spend}`); spend = 0; } };
    const herd = !!RS(p).herd, hc = RS(p).herdCost || 6; // T4：群体E/G＝Pを払って資源＋協調+1
    if (a.slot === 'E5') { p.E += sc(p, 5) * bm; coopTo('E'); desc.unshift(`熱源吸収 +${sc(p, 5) * bm}E`); }
    const hcp = (RS(p).herdCoop || 1) + (p.herdCoopAdd || 0); // 試作 herdCoop／T7 群心網
    if (a.slot === 'EG') { if (herd) { p.P -= hc; p.E += sc(p, 3) * bm; gainRes(p, 'coop', hcp); coopTo('E'); desc.unshift(`群体同期 P${hc}→E+${sc(p, 3) * bm}・協調+${hcp}`); } else { p.E += sc(p, 2 + pt) * bm; coopTo('E'); desc.unshift(`群体同期 +${sc(p, 2 + pt) * bm}E`); } }
    if (a.slot === 'G3') { p.G += sc(p, 3) * bm; coopTo('G'); desc.unshift(`配列解析 +${sc(p, 3) * bm}G`); }
    if (a.slot === 'GG') { if (herd) { p.P -= hc; p.G += sc(p, 2) * bm; gainRes(p, 'coop', hcp); coopTo('G'); desc.unshift(`群体融合 P${hc}→G+${sc(p, 2) * bm}・協調+${hcp}`); } else { p.G += sc(p, 1 + pt) * bm; coopTo('G'); desc.unshift(`群体融合 +${sc(p, 1 + pt) * bm}G`); } }
    if (a.slot === 'P8') { const n8 = (RS(p).p8 || 8) * bm; p.P += n8; coopTo('P'); desc.unshift(`個体培養 +${n8}P`); }
    if (a.slot === 'ALL') { p.E += sc(p, 2) * bm; p.G += sc(p, 1) * bm; p.P += sc(p, 4) * bm; coopTo(a.coopRes || 'E'); desc.unshift(`資源合成 +${sc(p, 2) * bm}E+${sc(p, 1) * bm}G+${sc(p, 4) * bm}P`); }
    if (a.slot === 'PB') { const c = pbCost(p); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; p.P += pbGain(p) * bm; if (RS(p).pbCoop) coopTo('P'); desc.unshift(`自己複製 G${c}→P+${pbGain(p) * bm}`); } // 試作 pbCoop：Pブーストも協調ボーナスの対象
    if ((p.round.resBoost || 1) > 1 && !launch) desc.push('神の加護：倍'); if (lm > 1) desc.push(`進出：獲得量${lm}倍`); if (launch) desc.push(`緊急進出（L-1）：獲得量${LF}倍`);
    if (fv && fv.mode === 'add' && finalR && !a.viaBoost && !(fv.noBypass && (cl.bypass || a.shield)) && !(fv.once && p.round.finVgUsed)) { p.round.finVgUsed = true; p.gemsets += fv.vg || 1; desc.push(`最終R：祝福+${fv.vg || 1}（祝福 ${p.gemsets}）`); } // 試作 finalSlotVg add
    if (cl.bypass) desc.push(bypassDesc(cl.bypass));
    if (a.shield) desc.push('自由行動'); if (a.viaBoost) desc.push('神の加護の即時枠');
    afterAction(st, p, desc.join('・'), !a.shield && !a.viaBoost);
    return !a.shield && !a.viaBoost;
  };

  // トラック進行： {track, pay:'E'|'P'|'G', useL, bonus}
  ACTIONS.track = (st, p, a) => {
    const c = stepCost(p, a.track, a.bonus); if (c === null) throw new Error('Lv5です');
    if (a.steps === 2) { // T10（第58部 §4-1）二段進行：E 進行は 2 段まとめて払える（手番 1 つ・Lv6 には入らない・E 払いのみ）
      if (!RS(p).doubleStep) throw new Error('この数値セットに二段進化はありません'); if (a.bonus) throw new Error('追加アクションでは二段進化できません');
      const lv0 = p.lv[a.track]; if (lv0 >= 4) throw new Error('二段進化は Lv5 までです'); if (a.pay && a.pay !== 'E') throw new Error('二段進化は E 払いのみです');
      const c2 = stepCostDouble(p, a.track); if (c2 === null) throw new Error('二段進化できません');
      useToken(p, true); const r = payE(p, c2, a.useL); consumeNext(p, a.track);
      afterAction(st, p, `${G.TRACK_INFO[a.track].name}を二段進化（E${r.E}${r.L ? '+L' + r.L : ''}）`, true);
      advanceTrack(st, p, a.track, '進化'); advanceTrack(st, p, a.track, '進化'); return true; }
    if (a.steps === 3) { // T14（第71部 §9 D-a）三段進行：進化加速の回数（強 2・弱 1）を 1 つ使い、3 段分の E を合算して手番 1 つ（Lv5 まで・E 払いのみ・自力扱い）
      if (!(p.dv3 > 0)) throw new Error('三段進化は進化加速の回数が残っているときだけです'); if (a.bonus) throw new Error('追加アクションでは三段進化できません');
      if (p.lv[a.track] >= 3) throw new Error('三段進化は Lv5 までです'); if (a.pay && a.pay !== 'E') throw new Error('三段進化は E 払いのみです');
      const c3 = stepCostTriple(p, a.track); if (c3 === null) throw new Error('三段進化できません');
      useToken(p, true); const r = payE(p, c3, a.useL); consumeNext(p, a.track); p.dv3 -= 1;
      afterAction(st, p, `${G.TRACK_INFO[a.track].name}を三段進化（E${r.E}${r.L ? '+L' + r.L : ''}・進化加速 残${p.dv3}）`, true);
      advanceTrack(st, p, a.track, '進化'); advanceTrack(st, p, a.track, '進化'); advanceTrack(st, p, a.track, '進化'); return true; }
    if (a.track === 'body' && RS(p).bodyNoE && p.lv.body < 5) throw new Error('この数値セットでは身体は生命核の投入でのみ上がります（Lv6はEで可）'); // 試作 bodyNoE
    const g5 = (p.lv[a.track] === 4 && RS(p).lv5G) ? RS(p).lv5G : (p.lv[a.track] === 5 && RS(p).lv6G) ? RS(p).lv6G : 0; if (g5 && p.G < g5) throw new Error(`Lv${p.lv[a.track] + 1}に入るには遺伝子G${g5}が必要です`); // 試作 lv5G／lv6G（Lv6はE＋Gの両方）
    if (!a.bonus) useToken(p, true);
    let paid;
    if ((a.pay === 'P' || a.pay === 'G') && RS(p).noAlt) throw new Error('この数値セットでは代替払い（P／G）はありません');
    if (p.lv[a.track] === 5 && lv6PayDef(p, a.track)) paid = lv6PayNow(st, p, a.track, a.useL, 0); // 案B：Lv6 はその色の資源で払う（P/G 代替払いは不可）
    else if (a.pay === 'P') { if (a.track !== 'body') throw new Error('Pで払えるのは身体のみ'); if (p.P < c * 3) throw new Error('Pが足りません'); p.P -= c * 3; paid = `P${c * 3}`; }
    else if (a.pay === 'G') { if (a.track !== 'intel') throw new Error('Gで払えるのは知性のみ'); if (p.G < c) throw new Error('Gが足りません'); p.G -= c; paid = `G${c}`; }
    else { const r = payE(p, c, a.useL); paid = `E${r.E}${r.L ? '+L' + r.L : ''}`; }
    if (g5) { p.G -= g5; paid += `+G${g5}`; }
    consumeNext(p, a.track);
    { const ca2 = organ(p, 'Ca2'); if (ca2 && !ca2.strong && p.uses.ca2 < 3) p.uses.ca2 += 1; }
    afterAction(st, p, `${G.TRACK_INFO[a.track].name}を進化（${paid}${a.bonus ? '・追加アクション' : ''}）`, !a.bonus);
    advanceTrack(st, p, a.track, '進化');
    return !a.bonus;
  };

  // 繁殖変換： {nP, nL, bonus}（旧形式 {pay:'P'|'L'|'E'} も受ける）。T14（第71部 §19 S-c）：P 払いの段と L 払いの段を同時に行える（それぞれ 1 段・増殖暴走の強で 2 段）。旧セットは 1 段ずつ
  ACTIONS.breed = (st, p, a) => {
    const R = RS(p); const multi = R.mbMode === 'multi';
    if (!R.gauge && !p.tokens.includes('AT')) throw new Error('活性化できる追加ワーカー（AT）がありません');
    if (a.pay === 'E') { // 試作 breedE：Eでも払える（旧）
      const c = breedCost(p); if (c === null) throw new Error('繁殖は上限です'); const eAlt = R.breedE ? R.breedE[p.breed] : null; if (eAlt === null) throw new Error('この数値セットでは E で繁殖できません');
      if (p.E < eAlt) throw new Error(`エネルギーが足りません（必要E${eAlt}）`); if (!a.bonus) useToken(p, true); p.E -= eAlt; p.breed += 1;
      afterAction(st, p, `繁殖（E${eAlt}）`, !a.bonus); addUpgrade(st, p, `繁殖×${3 + p.breed}`); return !a.bonus; }
    let nP, nL; if (a.nP !== undefined || a.nL !== undefined) { nP = a.nP | 0; nL = a.nL | 0; } else { nP = a.pay === 'L' ? 0 : 1; nL = a.pay === 'L' ? 1 : 0; }
    const total = nP + nL; if (total < 1) throw new Error('繁殖：段数を選んでください');
    const left = R.breed.length - p.breed; if (left <= 0) throw new Error('繁殖は上限です'); if (total > left) throw new Error(`繁殖はあと ${left} 段です`);
    if (nL && !R.breedL) throw new Error('この数値セットでは生命核で繁殖できません');
    if (!multi && total > 1) throw new Error('繁殖は 1 段ずつです');
    const mx = breedMaxN(p); if (nP > mx || nL > mx) throw new Error(`繁殖：P 払い・生命核払いはそれぞれ ${mx} 段まで${mx === 1 && multi ? '（増殖暴走の強で 2 段）' : ''}`);
    let costP = 0; { const b0 = p.breed; for (let i = 0; i < nP; i++) { costP += breedCost(p); p.breed += 1; } p.breed = b0; } const costL = nL * (R.breedL || 0);
    if (p.P < costP) throw new Error(`個体数が足りません（必要P${costP}・所持P${p.P}）`); if (p.L < costL) throw new Error(`生命核が足りません（必要L${costL}）`);
    if (!a.bonus) useToken(p, true);
    if (nP) { p.P -= costP; p.pInv = (p.pInv || 0) + nP; p.pInvBody = (p.pInvBody || 0) + nP; }
    if (nL) { p.L -= costL; for (let i = 0; i < nL; i++) investL(p, st, R.breedL); if (R.bodyBulkLv4 && R.breedL >= R.bodyBulkLv4) p.lBulk = true; }
    const b1 = p.breed; p.breed += total;
    afterAction(st, p, `繁殖（${[nP ? `P${costP}${nP > 1 ? '×' + nP + '段' : ''}` : '', nL ? `L${costL}${nL > 1 ? '×' + nL + '段' : ''}` : ''].filter(Boolean).join('＋')}）`, !a.bonus);
    for (let i = 1; i <= total; i++) addUpgrade(st, p, `繁殖×${3 + b1 + i}`);
    return !a.bonus;
  };

  // 器官建造： {organ, useL, li2Res, li3Res, bonus}
  ACTIONS.organ = (st, p, a) => doOrgan(st, p, a, null);
  // 一気立て（T14・第71部 §7・§14・ユーザー決定「制限なし」）： {organs:[id,...]（同じ系統・階層順・2〜max 枚）, useL, liRes}。各々の値段・後追い料・建造時効果あり。W は 1 個（1 枚目で使用）
  ACTIONS.burst = (st, p, a) => {
    const B = RS(p).burst; if (!B) throw new Error('この数値セットに急速形成はありません'); const mx = B.max || 3;
    const ids = a.organs || []; if (ids.length < 2) throw new Error('急速形成は 2 枚以上を続けて形成します'); if (ids.length > mx) throw new Error(`急速形成は ${mx} 枚までです`);
    if (ids.some(id => !G.ORGANS[id])) throw new Error('器官が不正です'); const lin = G.ORGANS[ids[0]].lin; if (ids.some(id => G.ORGANS[id].lin !== lin)) throw new Error('急速形成は同じ系統の器官だけです');
    for (let i = 1; i < ids.length; i++) if (G.ORGANS[ids[i]].tier !== G.ORGANS[ids[i - 1]].tier + 1) throw new Error('急速形成は系統内の形態の順に続けます');
    if (ids.some(id => !st.shared.organField.includes(id))) throw new Error('器官の場にない器官です'); if (a.bonus) throw new Error('追加アクションでは急速形成できません');
    if (B.perGame && (p.uses.burst || 0) >= B.perGame) throw new Error(`急速形成は 1 人 ${B.perGame} 回です`); if (B.perRound && (p.round.burst || 0) >= B.perRound) throw new Error(`急速形成は 1 ラウンド ${B.perRound} 回です`); // 計測用の回数制限（既定なし）
    p.uses.burst = (p.uses.burst || 0) + 1; p.round.burst = (p.round.burst || 0) + 1;
    let useL = a.useL | 0; const e0 = p.E, g0 = p.G, L0 = useL; let totE = 0, totG = 0; { const q = clone(p); ids.forEach(id => { const c = organCost(st, q, id, true); if (c) { totE += c.E; totG += c.G; q.organs.push({ id, strong: true }); } }); } // 2026-11-09 ユーザー指摘：不足のメッセージが 1 枚ぶんの値段だった → 合計で出す
    let at = ids[0]; try { ids.forEach((id, i) => { at = id; const c = organCost(st, p, id, true); if (!c) throw new Error(`${id} は今は形成できません（系統内は形態の順）`); const lk = Math.min(useL, Math.ceil(Math.max(0, c.E - p.E) / (p.lValue || sc(p, 3)))); useL -= lk; doOrgan(st, p, { organ: id, useL: lk, li2Res: a.liRes || a.li2Res, liRes: a.liRes, li3Res: a.liRes || a.li3Res, full: true }, i ? 'chain' : null); }); }
    catch (e) { if (!/が足りません/.test(e.message)) throw e; const lv = p.lValue || sc(p, 3); throw new Error(`急速形成（${ids.join('→')}）は合計 E${totE}+G${totG}（定価）。所持 E${e0}・G${g0}${L0 ? `＋生命核${L0}（=E${L0 * lv}）` : ''}では ${at} の形成で${/遺伝子/.test(e.message) ? 'G' : 'E'}が足りません${!/遺伝子/.test(e.message) && p.L > L0 ? `（生命核1=E${lv}で補えます）` : ''}`); }
    log(st, p.id, `${p.name}：急速形成（${G.LINEAGES[lin]}系統 ${ids.length} 枚・ワーカー 1）`);
    return true;
  };
  // mode：null＝通常／'free'＝無料（恩寵枠・器官の恩寵の1枚目。コマは呼び出し側が使用済み）／'half'＝半額（同・2枚目。コマ不要）
  function doOrgan(st, p, a, mode) {
    const c = organCost(st, p, a.organ, !!a.full); if (!c) throw new Error('その器官は今は形成できません（系統内は形態の順）');
    if (organ(p, a.organ)) throw new Error('形成済みです');
    if (RS(st).organExcl) { const u = st.shared.organUsed[a.organ]; if (u !== undefined && u !== p.id) throw new Error(`このカードは今ラウンド ${P(st, u).name} が形成しました（1ラウンド1人）`); }
    let e = c.E, g = c.G; if (mode === 'free' || mode === 'freeChain') { e = 0; g = 0; } else if (mode === 'half') { e = ceilHalf(e); g = ceilHalf(g); } // 'freeChain'＝T15 器官の恩寵の 2 枚目以降（無料・コマ不要）。追加アクションの E 半額は削除（O-03）
    if (a.payP) { if (!p.altFuel) throw new Error('代替燃料がありません'); const need = altFuelP(p, e); if (p.P < need) throw new Error(`Pが足りません（E${e}＝P${need}）`); }
    if (!a.bonus && !mode) useToken(p, false);
    if (a.payP) { const need = altFuelP(p, e); p.P -= need; log(st, p.id, `${p.name}：代替燃料でE${e}ぶんをP${need}で支払い`); e = 0; } // 第42部 N5 代替燃料（強 E1＝P1／弱 E1＝P2）
    const r = payE(p, e, a.useL); if (g) { if (p.G < g) throw new Error('Gが足りません'); p.G -= g; }
    let ampE = 0; if (a.amp) { const AM = RS(p).amplify; if (!AM) throw new Error('この数値セットに増幅はありません'); if (p.uses.amplify >= 1) throw new Error('増幅は1人1回です'); if (!ampOk(p, a.organ, false)) throw new Error(`増幅できるのは${ampTargetText(p)}の器官です`); ampE = G.ampE(p); if (p.E < ampE) throw new Error(`エネルギーが足りません（増幅の E${ampE}）`); p.E -= ampE; p.uses.amplify += 1; } // 2026-11-05 v3.66 ユーザー提案：建造と同時に増幅（+E24・手番は建造の 1 つだけ）
    if (c.first) st.shared.organFirst[a.organ] = p.id;
    { const ca1 = organ(p, 'Ca1'); if (ca1 && !ca1.strong && p.uses.ca1 < 3) p.uses.ca1 += 1; }
    // 建造前の連結効果（既存の器官が反応）
    if (RS(p).organFx !== 2) { const li1 = organ(p, 'Li1'); if (li1) p.E += sc(p, li1.strong ? 2 : 1) * (li1.amp ? 2 : 1); // 2026-10-22 弱も恒久（E+1）・v3.70 増幅で 2 倍
      const li2 = organ(p, 'Li2'); if (li2) gainRes(p, a.li2Res || 'E', sc(p, li2.strong ? 3 : 2) * (li2.amp ? 2 : 1)); } // T13（organFx 2）では連結は建造時だけの効果（下）
    { const amp = p.ampReserve === a.organ || !!a.amp; p.organs.push(amp ? { id: a.organ, strong: c.strong, amp: true } : { id: a.organ, strong: c.strong }); if (p.ampReserve === a.organ) { p.ampReserve = null; log(st, p.id, `${p.name}：${a.organ} は増幅の予約により効果2倍`); } else if (a.amp) log(st, p.id, `${p.name}：${a.organ} を形成と同時に増幅（E${ampE}）→ 効果2倍`); } if (RS(st).organExcl) st.shared.organUsed[a.organ] = p.id; // v3.65 増幅の予約
    { const gb = (t) => { p.gateBonus = p.gateBonus || {}; p.gateBonus[t] = (p.gateBonus[t] || 0) + 1; }; const o = a.organ, sg = c.strong; const am = p.organs[p.organs.length - 1].amp ? 2 : 1; // T7 器官の建造時効果（v3.70：建造と同時の増幅なら数の効果 2 倍）
      if (o === 'Hc1') gainRes(p, 'coop', (RS(p).hc1Coop || [2, 1])[sg ? 0 : 1] * am); if (o === 'Hc2') p.herdCoopAdd = (sg ? 2 : 1) * am; if (o === 'Hc3') { if (RS(p).hc3Bonus) p.coopBonusAdd = (p.coopBonusAdd || 0) + sc(p, RS(p).hc3Bonus); else if (RS(p).hc3RoundUp) p.coopRoundUp = true; else p.coopCapAdd = sg ? 2 : 1; if (sg && !RS(p).noOrganGate) gb('social'); if (RS(p).hc3Shield) { p.shields += RS(p).hc3Shield; log(st, p.id, `${p.name}：群心核で自由行動+${RS(p).hc3Shield}`); } } // T14（第71部 §11 H3-e）：ゲート+1 の代わりに建造時 Wなし実行権+1
      if (o === 'Pu1') p.L += am; if (o === 'Pu2') p.yieldAdd = (p.yieldAdd || 0) + sc(p, 1) * am; if (o === 'Pu3') { p.lValue = Math.max(p.lValue || sc(p, 3), sc(p, RS(p).pu3Rate || 4)); if (sg && !RS(p).noOrganGate) gb('body'); if (RS(p).pu3L) { p.L += RS(p).pu3L * am; log(st, p.id, `${p.name}：脈動核で 生命核+${RS(p).pu3L * am}`); } } // T14（第71部 §11 P3-a）：建造時 L+1 ＋ 1L＝18（pu3Rate 6）
      if (o === 'Mg3' && sg && !RS(p).mg3NoGate) gb('metab'); if (o === 'Tl3' && sg && (RS(p).tlGateTier || 3) === 3) gb('intel'); // mg3NoGate＝試作：代謝核のゲート+1なし／tlGateTier＝T13 では知性のゲート+1 を 2 段目に
      if (RS(p).organFx === 2) { const R2 = RS(p), d = G.ORGANS[o]; // T13（第70部 §6）：器官効果の第2版＝建造時の効果（数の効果は建造と同時の増幅で 2 倍）
        if (d.lin === 'Li') { const lm2 = R2.liMode === 'lineage'; const n = lm2 ? (d.tier === 3 ? st.shared.lineages.filter(l => lineageDone(p, l)).length : 1) : Math.min(R2.liCap || 99, p.organs.length); const per = (R2.liPer || [0, 0, 0])[d.tier - 1] || 0; const res = (R2.liRes || [])[d.tier - 1] ? (a.liRes || a.li2Res || 'E') : 'E'; const k = per * n; if (k) { gainRes(p, res, k); log(st, p.id, `${p.name}：${d.name}で ${res}+${k}（${lm2 ? (d.tier === 3 ? `完成した系統 ${n}×${per}` : '形成時') : `器官 ${n} 枚×${per}`}）`); } } // T18（O-12）liMode 'lineage'：結合膜・共役組織は固定、統合体は完成した系統 1 つにつき（連結自身を含む）
        if (d.lin === 'Tl') { const gk = ((R2.tlBuild || [])[d.tier - 1] || 0) * am; if (gk) { p.G += gk; log(st, p.id, `${p.name}：${d.name}で G+${gk}`); } if (sg && d.tier === (R2.tlGateTier || 3) && d.tier !== 3 && !R2.noOrganGate) gb('intel'); if (d.tier === 2 && R2.tlFreeTier2) p.pending.push({ type: 'rewardTrait', freeMax: R2.tlFreeTier2, weakOnly: true }); if (d.tier === 3 && R2.tlFreeMax) p.pending.push({ type: 'rewardTrait', freeMax: R2.tlFreeMax }); } // T14（第71部 §11 T2-c）：転写体＝弱の形質 1 枚を無料（弱の値段 G12 以下）
        if (o === 'Hc2' && R2.hc2Coop) gainRes(p, 'coop', R2.hc2Coop * am);
        if (o === 'Mg2' && R2.mg2Build) { p.E += R2.mg2Build * am; log(st, p.id, `${p.name}：代謝腺で E+${R2.mg2Build * am}`); }
        if (o === 'Pu2' && R2.pu2L) p.L += R2.pu2L * am; } }
    { const R5 = RS(p), o = a.organ; // T15（第71部 §25・§26）：新系統の建造時効果
      if (o === 'Fk2' && R5.fk2Build) { p.P += R5.fk2Build; log(st, p.id, `${p.name}：孵化腺で P+${R5.fk2Build}`); }
      if (o === 'Fk3') p.pending.push({ type: 'fkBreed' });
      if (G.ORGANS[o].lin === 'Nv' && R5.nvTrait) { const n = traitCountC(p); if ((R5.traitCoef || [4, 8]).includes(n)) addUpgrade(st, p, `形質${n}枚目（神経を含む）`); }
      if (o === 'Nv3' && R5.nv3Vg) { p.gemsets += R5.nv3Vg; log(st, p.id, `${p.name}：神経核で 祝福+${R5.nv3Vg} → 祝福 ${p.gemsets}`); }
      if (o === 'Lm2' && R5.lm2Vg) { p.gemsets += R5.lm2Vg; log(st, p.id, `${p.name}：発光腺で 祝福+${R5.lm2Vg} → 祝福 ${p.gemsets}`); }
      if (o === 'Lm3') { if (R5.lm3Real) addGem(st, p, 'metab', R5.lm3Real, '発光核'); if (R5.lm3Vg) { p.gemsets += R5.lm3Vg; log(st, p.id, `${p.name}：発光核で 祝福+${R5.lm3Vg} → 祝福 ${p.gemsets}`); } } }
    if (a.organ === 'Rh1' && RS(p).rhLife) { p.L += 1; if (c.strong) p.lValue = (p.lValue || sc(p, 3)) + sc(p, 1); log(st, p.id, `${p.name}：先導（生命核版）で L+1${c.strong ? '・1Lの価値+1' : ''}`); } // 試作 rhLife
    afterAction(st, p, `${mode === 'free' || mode === 'freeChain' ? '恩寵枠（器官の恩寵）：' : mode === 'half' ? '恩寵枠（器官の恩寵・半額）：' : mode === 'chain' ? '急速形成：器官 ' : '器官 '}${a.organ} ${G.ORGANS[a.organ].name} を形成（${RS(st).organSameEffect ? '' : c.strong ? '強・' : '弱・'}E${r.E}${r.L ? '+L' + r.L : ''}${g ? '+G' + g : ''}${c.diff && !mode ? `・差額＝定価 E${c.list.E}+G${c.list.G} から前の段 E${c.diff.E}+G${c.diff.G} を引く` : ''}）`, !a.bonus && mode !== 'half' && mode !== 'chain' && mode !== 'freeChain'); // mode 'chain'＝一気立ての 2 枚目以降（コマは 1 枚目で使用済み）
    const lin = G.ORGANS[a.organ].lin; const cnt = lineageCount(p, lin);
    let complete = cnt === 3 && !nrTwoHas(p, lin); // T13 適応放散（強）で 2 枚完成済みの系統は 3 枚目で再完成しない
    if (!complete && cnt === 2 && nrTwoLeft(p)) { complete = true; p.nrTwoLins = p.nrTwoLins || []; p.nrTwoLins.push(lin); log(st, p.id, `${p.name}：適応放散で${G.LINEAGES[lin]}系統は 2 枚で完成`); } // T14：強 2 系統・弱 1 系統まで
    if (complete) {
      const done = st.shared.lineages.filter(l => lineageDone(p, l)).length; // 完成済み系統数（今回を含む）
      if (p.lineageE3) { p.E += sc(p, 3); log(st, p.id, `${p.name}：適応放散（弱）で E+${sc(p, 3)}`); }
      if (RS(p).lineageCoefAt) { if (RS(p).lineageCoefAt.includes(done)) addUpgrade(st, p, `${G.LINEAGES[lin]}系統完成（${done}系統目）`); else log(st, p.id, `${p.name}：${G.LINEAGES[lin]}系統完成（${done}系統目・成熟度+1は ${RS(p).lineageCoefAt.join('・')} 系統目だけ）`); } // T15 係数 B
      else if (RS(p).lineageCoefMax !== undefined && done > RS(p).lineageCoefMax + (p.lineageCoefAdd || 0)) log(st, p.id, `${p.name}：${G.LINEAGES[lin]}系統完成（成熟度+1は${RS(p).lineageCoefMax}系統目まで・今回は無し）`); else addUpgrade(st, p, `${G.LINEAGES[lin]}系統完成`);
      if (RS(p).organFx !== 2) { const li3 = organ(p, 'Li3'); if (li3) gainRes(p, a.li3Res || 'E', sc(p, li3.strong ? 6 : 4) * (li3.amp ? 2 : 1)); }
    }
    const lins = new Set(p.organs.map(o => G.ORGANS[o.id].lin));
    if (!RS(st).noRegime && lins.size >= 4 && !p.regime) { p.regime = true; p.inc[a.regimeRes || 'E'] += 1; log(st, p.id, `${p.name}：体制完成（収入+1・終了時+${RS(st).regimePt}点）`); }
    // 収斂T2：3/6/9枚（弱4枚ごと）で協調+1（遡って算入）
    const cv2 = organ(p, 'Cv2'); if (cv2) { const step = cv2.strong ? 3 : 4; const due = Math.floor(p.organs.length / step); while (p.cv2Granted < due) { p.cv2Granted += 1; gainRes(p, 'coop', 1); log(st, p.id, `${p.name}：群心器で協調+1`); } }
    // 感応系：建造時の再発動／ワイルド色
    if (a.organ === 'Re1' || a.organ === 'Re3') { const reached = reachedMilestones(p); if (reached.length) p.pending.push({ type: 'reMilestone', organ: a.organ, strong: c.strong }); else log(st, p.id, `${p.name}：再発動できる到達済み報酬がありません`); }
    if (a.organ === 'Re2' && c.strong) p.pending.push({ type: 'wildColor' });
    return !a.bonus;
  }

  // 大量消費： {kind:'MB'|'MI'|'MS'|'MM', traits:[2], free}
  ACTIONS.mass = (st, p, a) => {
    const c = a.free ? 0 : massCost(p, a.kind);
    let byp = null;
    const lm = (!a.free && a.kind === 'MB' && a.pay === 'L' && RS(p).massL) ? RS(p).massL : null; // 試作 massL：大量消費(身体)を生命核でも
    if (lm !== null) { if (p.L < lm) throw new Error(`生命核が足りません（必要L${lm}）`); byp = claimSlot(st, p, a.kind, { bodyMass: true, useL: a.bypassL, useCoop: a.bypassCoop }).bypass; useToken(p, false); p.L -= lm; investL(p, st, lm); if (RS(p).bodyBulkLv4 && lm >= RS(p).bodyBulkLv4) p.lBulk = true; }
    else if (!a.free) { if (p.P < c) throw new Error(`個体数が足りません（必要P${c}・所持P${p.P}）`); byp = claimSlot(st, p, a.kind, { bodyMass: a.kind === 'MB', useL: a.bypassL, useCoop: a.bypassCoop }).bypass; useToken(p, false); p.P -= c; p.next.mass = 0; if (p.mcFree && RS(p).mcMode === 'freeOnce' && c === 0) p.mcFree -= 1; }
    const desc = `${G.SLOT_BY_ID[a.kind].name}（${a.free ? '無料・報酬' : lm !== null ? 'L' + lm : 'P' + c}）${byp ? '・' + bypassDesc(byp) : ''}`;
    afterAction(st, p, desc, !a.free);
    if (a.kind === 'MB') { if (RS(p).massBodyVirtual) { p.gemsets += 1; log(st, p.id, `${p.name}：淘汰(身体)→ 祝福 ${p.gemsets}`); } else addGem(st, p, 'body', 1, '淘汰'); } // massBodyVirtual：C2 の手当て(a)
    if (a.kind === 'MS') { gainRes(p, 'coop', RS(p).msCoop !== undefined ? RS(p).msCoop : (st.ext === 'x1' ? 3 : 2)); if (RS(p).msGem) addGem(st, p, 'social', 1, '淘汰(社会)'); }
    p.pInv = (p.pInv || 0) + 1; if (a.kind === 'MB') p.pInvBody = (p.pInvBody || 0) + 1;
    if (a.kind === 'MM') { const mg = RS(p).mmGain || sc(p, 10); p.E += mg; p.G += mg; } // T18：mmGain＝E/G の量（既定 E30+G30）
    if (a.kind === 'MI') {
      const ids = (a.traits || []).slice(0, RS(p).miCount || 2); const mx = RS(p).miMaxCost || 4;
      ids.forEach(t => { if (!traitPool(st).includes(t) || baseTraitCost(st, t) > mx) throw new Error(`G${mx}以下の形質のみ`); });
      if (ids.length === 2 && ids[0] === ids[1]) throw new Error('異なる2種');
      ids.forEach(t => giveTrait(st, p, t, false, '淘汰(知性)'));
    }
    return !a.free;
  };

  // 形質購入枠の確保（拡張x1：slot='TRT2'＝割増枠＝ラウンド数ぶんのEを追加で支払う／bypassL・bypassCoop＝使用済み枠の突破）
  function claimTraitSlot(st, p, a) {
    if (RS(p).traitShared) { if (a.slot === 'TRT2') throw new Error('この数値セットでは形質獲得は共用（割増枠なし）です'); return ''; } // T4：形質購入は排他なし
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
    if (!traitPool(st).includes(a.trait)) throw new Error('この数値セットの形質プールにありません');
    let disc = 0, tok = true, how = '';
    if (a.viaDG) { disc = a.viaDG; tok = false; }
    else if (a.viaReward) { disc = a.viaReward; tok = false; }
    else { how = claimTraitSlot(st, p, a); useToken(p, false); }
    const c = traitCost(st, p, a.trait, disc, a.weak);
    const r = payG(p, c.G, a.useL);
    if (p.nextTraitFree) p.nextTraitFree = false; else if (p.nextTraitDisc) p.nextTraitDisc = 0; // T10 知性 Lv3★ の「次の形質」を消費
    const tr1 = organ(p, 'Tr1'); if (tr1 && !tr1.strong && p.uses.tr1 < 3) p.uses.tr1 += 1;
    const fd = p.round.firstDone; afterAction(st, p, `形質獲得 ${a.trait}（G${r.G}${r.L ? '+L' + r.L : ''}${a.viaDG ? '・遺伝子図書館' : a.viaReward ? '・報酬' : ''}${how}）`, tok); if (a.viaDG) p.round.firstDone = fd; // v3.63：遺伝子図書館の手番前購入は脈動系（Rh2／Rh3）の「初手」に数えない
    giveTrait(st, p, a.trait, false, '獲得', { res: a.res, track: a.track, weak: !!a.weak });
    return tok;
  };

  // 形質アップグレード： {from, to, useL, res, track}
  ACTIONS.upgrade = (st, p, a) => {
    if (RS(st).noUpgrade) throw new Error('この数値セットでは形質強化はありません');
    const from = trait(p, a.from); if (!from) throw new Error('手放す形質を持っていません');
    const defF = G.TRAITS[a.from], defT = G.TRAITS[a.to];
    if (trait(p, a.to)) throw new Error('取得済みの形質へは強化できません');
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
    afterAction(st, p, `形質強化 ${a.from}→${a.to}（G${r.G}${r.L ? '+L' + r.L : ''}${how}）`, true);
    // 枚数不変なので係数判定を避ける：一時的に枚数を保つ
    const n0 = p.traits.length;
    giveTraitNoCount(st, p, a.to, '強化', { res: a.res, track: a.track });
    return true;
  };
  function giveTraitNoCount(st, p, tid, how, opt) {
    // giveTrait と同じだが 4/8 枚目判定をしない（アップグレードは枚数不変）
    const save = p.traits.length; giveTrait(st, p, tid, false, how, opt);
  }

  // 宝石セット： {useL}
  ACTIONS.gemset = (st, p, a) => {
    const bk = a.bulk && RS(p).tributeBulk; if (a.bulk && !bk) throw new Error('この数値セットにまとめ献上はありません'); // 試作 tributeBulk（第48部）：{mult, vg}＝コスト×mult で祝福 vg
    const c = bk ? Math.ceil(gemsetPrice(p) * bk.mult) : gemsetPrice(p); const cl = RS(p).gemsetShared ? { bypass: null } : claimSlot(st, p, 'GEM', { useL: a.bypassL }); tribOnce(st, p, 'G', '遺伝子'); useToken(p, false);
    const r = payG(p, c, a.useL); const outG = bk ? (p.gemsets += bk.vg, `→ 祝福 ${p.gemsets}`) : tribOut(st, p, 'G', 'intel', '遺伝子'); if (bk) log(st, p.id, `${p.name}：まとめ献上（遺伝子）→ 祝福+${bk.vg}`); // 試作 tributeVg（第47部）：献上1回の祝福数（数値＝全品目／{G,L,coop,E,P}＝品目別）
    afterAction(st, p, `献上（遺伝子G${r.G}${r.L ? '+L' + r.L : ''}${cl.bypass ? '・' + bypassDesc(cl.bypass) : ''}）${outG}`, true);
    return true;
  };

  // 環境スキャン： {target:{pid, track}, useL, bonus}
  ACTIONS.scan = (st, p, a) => {
    const cands = scanCandidates(st, p); if (!cands.length) throw new Error('参照できる他プレイヤーがいません（全員Lv1）');
    const t = cands.find(c => c.pid === a.target.pid && c.track === a.target.track); if (!t) throw new Error('その対象は最高Lvではありません');
    let e = Math.max(sc(p, 1), sc(p, 5) - p.scanDisc - cxDisc(p, 'E')); e = applyRh2(p, e); // T13 促進の割引
    if (!a.bonus) useToken(p, false);
    const r = payE(p, e, a.useL);
    const res = G.TRACK_INFO[t.track].res; let n = t.lv * sc(p, 2); if (res === 'coop' && RS(p).scanCoop !== undefined) n = RS(p).scanCoop; // T4：協調は白ゲートの収集物なので参照では+1のみ
    gainRes(p, res, n);
    afterAction(st, p, `探索（E${r.E}${r.L ? '+L' + r.L : ''}）→ ${P(st, t.pid).name}の${G.TRACK_INFO[t.track].name}Lv${t.lv}参照：${res}+${n}`, !a.bonus);
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
    if (RS(p).noAdapt) throw new Error('この数値セットに適応進化はありません');
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
    if (RS(p).noConvert) throw new Error('この数値セットに資源変換はありません');
    const n = Math.max(1, a.n | 0);
    const tbl0 = { EG: ['E', 2, 'G', 1], GE: ['G', 2, 'E', 1], PE: ['P', 8, 'E', 3], PG: ['P', 8, 'G', 2] }[a.kind]; const tbl = tbl0 && [tbl0[0], sc(p, tbl0[1]), tbl0[2], sc(p, tbl0[3])];
    if (!tbl) throw new Error('変換種別が不正');
    let need = tbl[1] * n;
    if (a.kind === 'EG') { const ca3 = organ(p, 'Ca3'); if (ca3) need = Math.max(sc(p, n), need - sc(p, ca3.strong ? 2 : 1)); }
    if (p[tbl[0]] < need) throw new Error(`${tbl[0]}が足りません`);
    if (!a.bonus) useToken(p, false);
    p[tbl[0]] -= need; p[tbl[2]] += tbl[3] * n;
    afterAction(st, p, `資源変換 ${tbl[0]}${need}→${tbl[2]}${tbl[3] * n}`, !a.bonus);
    return !a.bonus;
  };

  // 予備動員： {res:'E'|'G', bonus}
  // T10（第59部）：パス（置ける場所が無いときの逃げ道・何も得ない）／復元／増幅
  ACTIONS.gather = (st, p, a) => { // 2026-11-05 v3.65 採集：E／G／P／協調 のどれか 1 つを少し得る（パスの置き換え・手番 1 つ）
    const GT = RS(p).gather; if (!GT) throw new Error('この数値セットに採集はありません');
    const res = ['E', 'G', 'P', 'coop'].includes(a.res) ? a.res : 'E'; const n = GT[res] || 0; if (n <= 0) throw new Error('その資源は採集できません');
    const cp = res === 'coop' ? (GT.coopCostP || 0) : 0; if (cp && p.P < cp) throw new Error(`個体数が足りません（協調の採集は P${cp}）`); // coopCostP＝協調を選ぶときに払う P（無料だと AI が 14 回/戦 使う＝第65部）
    useToken(p, false); if (cp) p.P -= cp; gainRes(p, res, n); afterAction(st, p, `採集 ${res === 'coop' ? '協調' : res}+${n}${cp ? `（P${cp}）` : ''}`, true); return true;
  };
  ACTIONS.pass = (st, p, a) => { if (!RS(p).noReserve) throw new Error('この数値セットにパスはありません（予備動員を使ってください）'); useToken(p, false); afterAction(st, p, 'パス', true); return true; };
  ACTIONS.restore = (st, p, a) => {
    const RT = RS(p).restore; if (!RT) throw new Error('この数値セットに復元はありません');
    if (p.uses.restore >= 1) throw new Error('復元は1人1回です');
    const tid = a.trait; if (!traitPool(st).includes(tid)) throw new Error('この数値セットの形質プールにありません');
    if (trait(p, tid)) throw new Error('同じ形質は1枚まで');
    if (st.shared.traitFirst[tid] === undefined || st.shared.traitFirst[tid] === p.id) throw new Error('復元できるのは他の人が強で取った形質だけです');
    const t = G.TRAITS[tid]; const tw = (RS(p).traitCosts || {})[tid] || t.cost; const weakNow = traitCost(st, p, tid, 0, true).G; const cG = weakNow + Math.max(0, tw[0] - tw[1]); // 弱の現在値＋強と弱の差額＝割引込みの強の値段
    const cE = restoreE(p); if (p.E < cE) throw new Error(`エネルギーが足りません（必要E${cE}）`); // T13 促進の割引込み
    useToken(p, false); const r = payG(p, cG, a.useL); p.E -= cE; p.uses.restore += 1;
    afterAction(st, p, `復元 ${tid}（G${r.G}${r.L ? '+L' + r.L : ''}+E${cE}）`, true);
    giveTrait(st, p, tid, true, '復元', { res: a.res, track: a.track });
    return true;
  };
  ACTIONS.amplify = (st, p, a) => {
    const AM = RS(p).amplify; if (!AM) throw new Error('この数値セットに増幅はありません');
    if (p.uses.amplify >= 1) throw new Error('増幅は1人1回です');
    const o = p.organs.find(x => x.id === a.organ);
    if (!ampOk(p, a.organ, !!o)) throw new Error(`増幅できるのは${ampTargetText(p)}の器官です`);
    const cE = ampE(p); if (p.E < cE) throw new Error(`エネルギーが足りません（必要E${cE}）`); // T13 促進の割引込み
    if (o) { if (o.amp) throw new Error('その器官は増幅済みです'); useToken(p, false); p.E -= cE; o.amp = true; p.uses.amplify += 1; if (o.id === 'Hc2') p.herdCoopAdd = (p.herdCoopAdd || 0) + (o.strong ? 2 : 1); if (o.id === 'Pu2') p.yieldAdd = (p.yieldAdd || 0) + sc(p, 1); /* v3.70：恒久効果の器官は増幅時に加算 */ afterAction(st, p, `増幅 ${o.id} ${G.ORGANS[o.id].name}（E${cE}）→ 効果2倍`, true); }
    else { // 2026-11-05 v3.65 ユーザー要望：まだ建てていない（今から建造できる）器官も対象に＝予約して、建造したときから 2 倍
      if (!st.shared.organField.includes(a.organ) || !organCost(st, p, a.organ)) throw new Error('その器官はいま形成できません（場にあり、系統の順番が来ているものだけ）');
      useToken(p, false); p.E -= cE; p.ampReserve = a.organ; p.uses.amplify += 1; afterAction(st, p, `増幅 ${a.organ} ${G.ORGANS[a.organ].name}（E${cE}・未形成）→ 形成したときから効果2倍`, true); }
    return true;
  };
  ACTIONS.reserve = (st, p, a) => {
    if (RS(p).noReserve) throw new Error('この数値セットに予備動員はありません（パスを使ってください）');
    if (!a.bonus) useToken(p, false);
    const rE = RS(p).reserveE || 2, rG = RS(p).reserveG || 1; if (a.res === 'G') p.G += rG; else p.E += rE;
    afterAction(st, p, `予備動員（${a.res === 'G' ? 'G+' + rG : 'E+' + rE}）`, !a.bonus);
    return !a.bonus;
  };

  // 個人カード： {card, choice, bonus, shield}  shield＝Wなし実行（社会性の権利・コマを置かず手番も消費しない）
  ACTIONS.card = (st, p, a) => {
    if (!p.cards.includes(a.card)) throw new Error('そのカードを持っていません');
    if (a.shield) { if (p.shields <= 0) throw new Error('自由行動がありません'); if (a.bonus) throw new Error('追加アクション中は自由行動できません'); }
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
    afterAction(st, p, `カード${c} ${G.CARDS[c].name}（${d}）${a.shield ? '・自由行動' : ''}`, !a.bonus && !a.shield);
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
    afterAction(st, p, `臨界炉 P${pe + pg}→E${pe / 2} G${pg / 3}${free ? '（ワーカー不要）' : ''}`, !free && !a.bonus);
    return !free && !a.bonus;
  };

  // 試作 coopCrystal：共用アクション「群れの結晶」＝協調 N → 祝福+1（排他なし・W）
  ACTIONS.coopCrystal = (st, p, a) => {
    let n = RS(p).coopCrystal; if (!n) throw new Error('この数値セットに群れの結晶はありません'); n = Math.max(1, n - (p.crystalDiscC || 0)); // T7 結晶体質
    if (p.coop < n) throw new Error(`協調が足りません（必要${n}）`);
    tribOnce(st, p, 'coop', '協調'); useToken(p, false); p.coop -= n; const outC = tribOut(st, p, 'coop', 'social', '協調');
    afterAction(st, p, `献上（協調${n}）${outC}`, true); return true;
  };
  // T6 S3：結晶化（生命核）＝身体Lv4で解放。L N個 → 祝福+1（排他なし・W・投入回数には数えない）
  ACTIONS.lCrystal = (st, p, a) => {
    let n = RS(p).lCrystal; if (!n) throw new Error('この数値セットに結晶化（生命核）はありません');
    if (RS(p).crystalLv4Rate && p.lv.body >= 4) n = RS(p).crystalLv4Rate; // 試作 crystalLv4Rate
    n = Math.max(1, n - (p.crystalDiscL || 0)); // T7 結晶体質
    const unlock = RS(p).lCrystalLv || 4; if (p.lv.body < unlock) throw new Error(`献上（生命核）は身体Lv${unlock}で解放されます`); // 試作 lCrystalLv
    if (p.L < n) throw new Error(`生命核が足りません（必要L${n}）`);
    tribOnce(st, p, 'L', '生命核'); useToken(p, false); p.L -= n; if (p.crystalInvest) investL(p, st, n); const ce = RS(p).crystalE || 0; if (ce) p.E += ce;
    if (RS(p).lCrystalReal) { addGem(st, p, 'body', 1, '献上'); afterAction(st, p, `献上（生命核L${n}）→ 痕跡+1${ce ? '・E+' + ce : ''}`, true); return true; } // 試作 lCrystalReal：生命核ルート固有の痕跡
    const outL = tribOut(st, p, 'L', 'body', '生命核');
    afterAction(st, p, `献上（生命核L${n}）${outL}${ce ? '・E+' + ce : ''}`, true); return true;
  };
  // 試作 crystal：共用アクション「結晶化」＝E または G を払って祝福+1（排他なし・W）
  ACTIONS.crystal = (st, p, a) => {
    const cfg = RS(p).crystal; if (!cfg) throw new Error('この数値セットに結晶化はありません');
    const res = a.res === 'G' ? 'G' : 'E'; const c = cfg[res]; if (!c) throw new Error('その資源では結晶化できません');
    if (p[res] < c) throw new Error(`${res}が足りません（必要${res}${c}）`);
    useToken(p, false); p[res] -= c; p.gemsets += 1;
    afterAction(st, p, `結晶化（${res}${c}）→ 祝福 ${p.gemsets}`, true); return true;
  };
  // T7 第21部：G を払う先取り枠。模倣 {effect, useL, free}／発現 {track, useL, free}。free＝知性Lv3★学習（枠・トークン・Gを使わない）
  function mimicOptions(st, p) { if (!RS(st).gSlots) return []; return G.MIMIC_EFFECTS.filter(e => st.players.some(q => q.lv[e.track] >= e.lv)); }
  function gSlotCost(p, base) { return Math.max(0, base - (p.gSlotDisc || 0)); }
  ACTIONS.mimic = (st, p, a) => {
    if (!RS(p).gSlots) throw new Error('この数値セットに模倣はありません');
    const e = mimicOptions(st, p).find(x => x.id === a.effect); if (!e) throw new Error('模倣できる !効果にまだ誰も到達していません（Lv2 の身体＝◆L+1 は対象外）');
    let paid = '';
    if (!a.free) { claimSlot(st, p, 'MIM', {}); useToken(p, false); const r = payG(p, gSlotCost(p, RS(p).mimicCost || 4), a.useL); paid = `G${r.G}${r.L ? '+L' + r.L : ''}`; }
    if (e.id === 'intel2') p.G += sc(p, 3); if (e.id === 'social2') p.P += sc(p, 6); if (e.id === 'social3s') p.shields += 1; if (e.id === 'social3w') p.P += sc(p, 10); if (e.id === 'metab3w') p.E += sc(p, 8);
    afterAction(st, p, `模倣（${a.free ? '学習・G0' : paid}）→ ${txt(st, e.label)}`, !a.free); return !a.free;
  };
  ACTIONS.express = (st, p, a) => {
    if (!RS(p).gSlots) throw new Error('この数値セットに発現はありません');
    if (!G.TRACKS.includes(a.track)) throw new Error('色を選んでください');
    let paid = '';
    if (!a.free) { const cl = claimSlot(st, p, 'EXP', { useCoop: a.bypassCoop }); useToken(p, false); const r = payG(p, gSlotCost(p, RS(p).expressCost || 10), a.useL); paid = `G${r.G}${r.L ? '+L' + r.L : ''}${cl.bypass ? '・' + bypassDesc(cl.bypass) : ''}`; }
    addGem(st, p, a.track, 1, '発現');
    afterAction(st, p, `発現（${a.free ? '学習・G0' : paid}）→ 痕跡+1`, !a.free); return !a.free;
  };
  // 献上（第33部）：共用の換金は各品目1ラウンド1回（献上表に自分のコマ）。研究（gemsetNoEsc）は遺伝子の行だけ回数制限なし
  function tribOnce(st, p, key, label) { const T = RS(p).tribute; if (!T || !T.onceEach || RS(p).tributeNoLimit) return; /* 試作 tributeNoLimit（2026-11-05 ユーザー質問「献上は 1R1回に限定する必要があるか」の計測用・既定 無効） */ if (key === 'G' && p.gemsetNoEsc) return;
    if (RS(p).tributeOnceGame) { p.tribGame = p.tribGame || {}; if (p.tribGame[key]) throw new Error(`献上（${label}）は使用済みです（祭壇は 1 ゲームに 1 回）`); p.tribGame[key] = true; return; } // 試作 tributeOnceGame（第67部）：祭壇＝各品目 1 ゲーム 1 回
    p.round.trib = p.round.trib || {}; if (p.round.trib[key]) throw new Error(`献上（${label}）はこのラウンドに使用済みです（1ラウンド1回）`); p.round.trib[key] = true; }
  function tribOpen(st, p) { const T = RS(p).tribute; if (!T) throw new Error('この数値セットに献上はありません'); if (st.round < (T.openRound || 6)) throw new Error(`この献上はラウンド${T.openRound || 6}から（神の到来）`); return T; }
  // 試作 tributeAll（第48部）：全種の資源（E・G・P〔・L〕）をまとめて払い、大きめの祝福。{E,G,P,L?,vg}（E/G/P は規模前の値）・献上と同じ開始R・各自1R1回
  ACTIONS.tributeAll = (st, p, a) => {
    const A = RS(p).tributeAll; if (!A) throw new Error('この数値セットに全資源の献上はありません'); const T = tribOpen(st, p);
    const need = { E: sc(p, A.E || 0), G: sc(p, A.G || 0), P: sc(p, A.P || 0), L: A.L || 0 };
    ['E', 'G', 'P', 'L'].forEach(r => { if (p[r] < need[r]) throw new Error(`${r}が足りません（必要${r}${need[r]}）`); });
    tribOnce(st, p, 'all', '全資源'); useToken(p, false); ['E', 'G', 'P', 'L'].forEach(r => { p[r] -= need[r]; }); p.gemsets += A.vg;
    afterAction(st, p, `献上（全資源 E${need.E}+G${need.G}+P${need.P}${need.L ? '+L' + need.L : ''}）→ 祝福 ${p.gemsets}（+${A.vg}）`, true); return true;
  };
  // 共用の献上（エネルギー／個体数）： {res:'E'|'P'}
  ACTIONS.tribute = (st, p, a) => {
    const T = tribOpen(st, p); if (!T.shared) throw new Error('この数値セットに献上（エネルギー／個体数）はありません（最終ラウンドの祝福枠に一本化）'); const res = a.res === 'P' ? 'P' : 'E'; const bk = a.bulk && RS(p).tributeBulk; if (a.bulk && !bk) throw new Error('この数値セットにまとめ献上はありません'); const c = bk ? Math.ceil(sc(p, T.shared[res]) * bk.mult) : sc(p, T.shared[res]);
    if (p[res] < c) throw new Error(`${res === 'E' ? 'エネルギー' : '個体数'}が足りません（必要${res}${c}）`);
    tribOnce(st, p, res, res === 'E' ? 'エネルギー' : '個体数'); useToken(p, false); p[res] -= c; p.gemsets += bk ? bk.vg : tribVg(p, res); if (bk) log(st, p.id, `${p.name}：まとめ献上（${res}）→ 祝福+${bk.vg}`);
    afterAction(st, p, `献上（${res === 'E' ? 'エネルギー' : '個体数'}${c}）→ 祝福 ${p.gemsets}`, true); return true;
  };
  // 早取りの恩寵枠（第33部 TE/TP/TR＝点数化・第35部 TO/TT/TA/TB/TJ＝多彩な一手）： {slot, track | organ, organ2 | traits[], weak{} | changes[{from,to}] | tracks[]}
  function tribSlots(st) { const T = RS(st).tribute; if (!T) return []; return st.shared.tribSlots || Object.keys(T.slots || {}); } // この卓で開いている恩寵枠（pool から抽選した分。pool が無ければ全部）
  ACTIONS.tributeSlot = (st, p, a) => {
    const T = tribOpen(st, p); const def = (T.slots || {})[a.slot]; if (!def || !tribSlots(st).includes(a.slot)) throw new Error('この卓にその恩寵枠はありません');
    const name = G.SLOT_BY_ID[a.slot].name;
    if (!def.kind) { // 点数化（旧枠）：E／P→祝福、E+P→痕跡
      const ce = def.E ? sc(p, def.E) : 0, cp = def.P ? sc(p, def.P) : 0;
      if (p.E < ce) throw new Error(`エネルギーが足りません（必要E${ce}）`); if (p.P < cp) throw new Error(`個体数が足りません（必要P${cp}）`);
      if (def.real && !G.TRACKS.includes(a.track)) throw new Error('色を選んでください');
      claimSlot(st, p, a.slot, {}); useToken(p, false); p.E -= ce; p.P -= cp;
      if (def.real) { addGem(st, p, a.track, 1, '恩寵枠'); afterAction(st, p, `恩寵枠（E${ce}+P${cp}）→ 痕跡+1`, true); }
      else { p.gemsets += 1; afterAction(st, p, `恩寵枠（${ce ? 'E' + ce : 'P' + cp}）→ 祝福 ${p.gemsets}`, true); }
      return true;
    }
    if (def.kind === 'organ' && RS(p).toLineage) { // T15（第71部 §26）：系統 1 つを 1 段目の定価 1 回で 3 段目まで（後追い料なし・建造時効果あり・既に 1〜2 枚持つ系統にも）
      const lin = a.lin || (a.organ && G.ORGANS[a.organ] ? G.ORGANS[a.organ].lin : null); if (!lin || !st.shared.lineages.includes(lin)) throw new Error('系統を選んでください');
      const have = lineageCount(p, lin); if (have >= 3) throw new Error('その系統は 3 段目まで形成済みです');
      const ids = [have + 1, have + 2, have + 3].filter(t => t <= 3).map(t => lin + t); if (ids.some(id => !st.shared.organField.includes(id))) throw new Error('器官の場にない器官です');
      const [e1, g1] = ((RS(p).organCostBy || {})[lin] || RS(p).organCost || G.ORGAN_COST)[0];
      if (p.G < g1) throw new Error(`Gが足りません（G${g1}）`);
      claimSlot(st, p, a.slot, {}); useToken(p, false); const r = payE(p, e1, a.useL); p.G -= g1;
      log(st, p.id, `${p.name}：器官の恩寵（${G.LINEAGES[lin]}・1 段目の定価 E${r.E}${r.L ? '+L' + r.L : ''}+G${g1}）で ${ids.join('・')} を形成`);
      ids.forEach((id, i) => doOrgan(st, p, { organ: id, li2Res: a.liRes || a.li2Res, liRes: a.liRes, li3Res: a.liRes || a.li3Res, regimeRes: a.regimeRes }, i ? 'freeChain' : 'free'));
      return true;
    }
    if (def.kind === 'organ') { // 器官の恩寵：器官1枚を無料（後追い料なし）＋同じ手番にもう1枚を半額
      if (!organCost(st, p, a.organ)) throw new Error('その器官は今は形成できません（系統内は形態の順・形成済み）');
      claimSlot(st, p, a.slot, {}); useToken(p, false);
      doOrgan(st, p, { organ: a.organ, li2Res: a.li2Res, li3Res: a.li3Res, regimeRes: a.regimeRes }, 'free');
      if (a.organ2) { if (!def.half) throw new Error('2枚目はありません'); if (!organCost(st, p, a.organ2)) throw new Error('2枚目の器官は今は形成できません（系統内は形態の順・形成済み）'); doOrgan(st, p, { organ: a.organ2, useL: a.useL, li2Res: a.li2Res, li3Res: a.li3Res, regimeRes: a.regimeRes }, 'half'); }
      return true;
    }
    if (def.kind === 'trait') { // 形質の恩寵：G を払って形質を n 枚まで無料（強が残っていれば強）
      const ids = (a.traits || []).slice(0, def.n || 2); if (!ids.length) throw new Error('形質を選んでください'); if (new Set(ids).size !== ids.length) throw new Error('同じ形質は1枚まで');
      ids.forEach(t => { if (!traitPool(st).includes(t)) throw new Error('この数値セットの形質プールにありません'); if (trait(p, t)) throw new Error(`${t} は取得済みです`); });
      const c = sc(p, def.G || 0); claimSlot(st, p, a.slot, {}); useToken(p, false); const r = payG(p, c, a.useL);
      afterAction(st, p, `恩寵枠（${name}）G${r.G}${r.L ? '+L' + r.L : ''}：${ids.map(t => t + ' ' + G.TRAITS[t].name).join('・')} を無料で取得`, true);
      ids.forEach(t => giveTrait(st, p, t, false, name, { res: a.res || 'E', track: a.track || 'intel', weak: !!((a.weak || {})[t]) }));
      return true;
    }
    if (def.kind === 'alchemy') { // 錬金：痕跡の色を n 個まで替える
      const ch = (a.changes || []).slice(0, def.n || 2); if (!ch.length) throw new Error('替える宝石を選んでください');
      ch.forEach(x => { if (!G.TRACKS.includes(x.from) || !G.TRACKS.includes(x.to) || x.from === x.to) throw new Error('色の指定が不正です'); });
      claimSlot(st, p, a.slot, {}); useToken(p, false); const parts = [];
      ch.forEach(x => { if (p.gems[x.from] < 1) throw new Error(`痕跡がありません`); p.gems[x.from] -= 1; p.gems[x.to] += 1; parts.push(`${G.TRACK_INFO[x.from].jp}→${G.TRACK_INFO[x.to].jp}`); });
      afterAction(st, p, `恩寵枠（${name}）：宝石の色替え ${parts.join('・')}`, true); return true;
    }
    if (def.kind === 'boost') { // 神の加護：このラウンドの残りの手番、資源枠の獲得量が倍（p.round はラウンド開始でリセット）
      if (def.instant && a.res) { const s2 = G.SLOT_BY_ID[a.res]; if (!s2 || s2.group !== 'res') throw new Error('資源枠を選んでください'); }
      claimSlot(st, p, a.slot, {}); useToken(p, false); p.round.resBoost = def.mul || 2;
      afterAction(st, p, `恩寵枠（${name}）：このラウンドの残り、資源枠の獲得量が${def.mul || 2}倍`, true);
      if (def.instant && a.res) ACTIONS.res(st, p, { slot: a.res, coopRes: a.coopRes || 'E', viaBoost: true }); // 即時の資源枠（使用済みでも可・占有しない）
      return true;
    }
    if (def.kind === 'leap') { // 跳躍：トラック進行を n 回（同じでも別でも）・合計コストから −disc（W必須。2回目は1回目を進めた後の Lv の値段）
      const n = def.n || 2; const ts = (a.tracks || []).slice(0, n); if (ts.length !== n) throw new Error(`進めるトラックを${n}つ選んでください（同じでも可）`);
      ts.forEach(t => { if (!G.TRACKS.includes(t)) throw new Error('トラックが不正です'); });
      claimSlot(st, p, a.slot, {}); useToken(p, true);
      let d = sc(p, def.disc || 0); const paid = []; const lv0 = Object.assign({}, p.lv);
      try {
        ts.forEach((t, i) => {
          const c = stepCost(p, t); if (c === null) throw new Error(`${G.TRACK_INFO[t].name}はこれ以上進めません`);
          if (t === 'body' && RS(p).bodyNoE && p.lv.body < 5) throw new Error('身体は生命核の投入でのみ上がります');
          const g5 = (p.lv[t] === 4 && RS(p).lv5G) ? RS(p).lv5G : (p.lv[t] === 5 && RS(p).lv6G) ? RS(p).lv6G : 0; if (g5 && p.G < g5) throw new Error(`Lv${p.lv[t] + 1}に入るには遺伝子G${g5}が必要です`);
          if (p.lv[t] === 5 && lv6PayDef(p, t)) { const e0 = (lv6PayDef(p, t).E || 0); const useD = Math.min(d, e0); d -= useD; const txt = lv6PayNow(st, p, t, i === 0 ? a.useL : 0, useD); consumeNext(p, t); p.lv[t] += 1; paid.push(`${G.TRACK_INFO[t].name} Lv6（${txt}）`); return; } // 案B：Lv6 は色別コスト（割引は E の部分にだけ効く）
          const pay = Math.max(0, c - d); d -= (c - pay); const r = payE(p, pay, i === 0 ? a.useL : 0); if (g5) p.G -= g5; consumeNext(p, t);
          p.lv[t] += 1; paid.push(`${G.TRACK_INFO[t].name} Lv${p.lv[t]}（E${r.E}${r.L ? '+L' + r.L : ''}${g5 ? '+G' + g5 : ''}）`);
        });
      } finally { Object.assign(p.lv, lv0); } // 本番の進行は advanceTrack（報酬・先着の処理）
      afterAction(st, p, `恩寵枠（${name}）：${paid.join('・')}・割引E${sc(p, def.disc || 0)}`, true);
      ts.forEach(t => advanceTrack(st, p, t, name));
      return true;
    }
    throw new Error('恩寵枠の種別が不正です');
  };
  // 試作 premium：上位形質の購入（G。排他なし・W。形質として数える）
  ACTIONS.premium = (st, p, a) => {
    if (!RS(p).premium) throw new Error('この数値セットに上位形質はありません');
    const t = G.TRAITS[a.trait]; if (!t || !t.premium) throw new Error('上位形質ではありません');
    if (trait(p, a.trait)) throw new Error('取得済みです');
    const strong = st.shared.traitFirst[a.trait] === undefined || st.shared.traitFirst[a.trait] === p.id || p.alwaysStrong;
    const tone = !!RS(p).premiumTone; // 試作 premiumTone：控えめ版（コスト+2・結晶核は強弱とも祝福+1・超進化は係数でなく祝福+1）
    const c = Math.max(1, t.cost[strong ? 0 : 1] + (tone ? 2 : 0) - p.traitDisc);
    useToken(p, false); const r = payG(p, c, a.useL);
    if (st.shared.traitFirst[a.trait] === undefined) st.shared.traitFirst[a.trait] = p.id;
    p.traits.push({ id: a.trait, strong });
    if (a.trait === 'XA') p.gemsets += (strong && !tone) ? 2 : 1;
    if (a.trait === 'XB') { if (strong && !tone) addUpgrade(st, p, '超進化'); else p.gemsets += 1; }
    if (a.trait === 'XC') { p.inc.E += strong ? 3 : 2; p.inc.G += strong ? 2 : 1; }
    // XD は stepCost で参照
    afterAction(st, p, `上位形質 ${a.trait} ${t.name}（${strong ? '強' : '弱'}・G${r.G}${r.L ? '+L' + r.L : ''}）`, true);
    const n = traitCountC(p); if ((RS(p).traitCoef || [4, 8]).includes(n)) addUpgrade(st, p, `形質${n}枚目`);
    return true;
  };
  ACTIONS.cheat = (st, p, a) => { ['E', 'G', 'P', 'L'].forEach(k => { if (typeof a[k] === 'number') p[k] = Math.max(0, a[k]); }); if (typeof a.coop === 'number') p.coop = Math.min(G.COOP_MAX, Math.max(0, a.coop)); log(st, p.id, `[DEBUG] ${p.name} の資源を設定 E${p.E} G${p.G} P${p.P} L${p.L} 協調${p.coop}`); return false; };

  // 無料アクション（トークン・手番を消費しない）
  ACTIONS.gToE = (st, p, a) => { // 試作 gToE：いつでも G→E（無料・手番消費なし）。レートは RS.gToE=[G, E]
    const r = RS(p).gToE; if (!r) throw new Error('この数値セットにG→E変換はありません');
    const n = Math.max(1, a.n | 0); if (p.G < r[0] * n) throw new Error('Gが足りません');
    p.G -= r[0] * n; p.E += r[1] * n; log(st, p.id, `${p.name}：G→E変換 G${r[0] * n}→E${r[1] * n}`); return false;
  };
  ACTIONS.lToRes = (st, p, a) => { // 2026-11-05 v3.64 ユーザー要望：生命核はいつでも資源に換えられる（手番消費なし・アクションの前でも可）。1L＝E／G lValue（身体 Lv3★ で 12・Lv5★ 強で 15）。払った個数は身体の収集物に数える（代用払いと同じ）
    if (RS(p).noLToRes) throw new Error('この数値セットに生命核→資源はありません（T18 で廃止・代用払いは使えます）');
    const n = Math.max(1, a.n | 0); if (n > p.L) throw new Error(`生命核が足りません（指定L${n}・所持L${p.L}）`); const res = a.res === 'G' ? 'G' : 'E'; const lv = p.lValue || sc(p, 3);
    p.L -= n; p[res] += n * lv; investL(p, st, n); if (RS(p).bodyBulkLv4 && n >= RS(p).bodyBulkLv4) p.lBulk = true;
    log(st, p.id, `${p.name}：生命核→資源 L${n}→${res}${n * lv}（手番消費なし）`); return false;
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
    if (pd.type === 'rewardTrait') { p.pending.shift(); if (a.skip) { if (!pd.freeMax) p.nextTraitFree = false; log(st, p.id, `${p.name}：報酬の形質獲得を見送り`); return false; } // 2026-11-10 v3.89（ユーザー指示）：知性 Lv3★ の「弱なら無料・強は差額」は見送ると消える（次の形質へ持ち越さない＝管理が大変） if (pd.freeMax) { const tw = (RS(p).traitCosts || {})[a.trait] || G.TRAITS[a.trait].cost; if ((pd.weakOnly ? tw[1] : tw[0]) > pd.freeMax) throw new Error(pd.weakOnly ? `転写体で無料にできるのは弱の値段が G${pd.freeMax} 以下の形質だけです` : `全転写で無料にできるのは G${pd.freeMax} 以下の形質だけです`); } // T13 全転写／T14 転写体（weakOnly＝弱で受け取る）
      if (pd.weakOnly) log(st, p.id, `${p.name}：転写体で ${a.trait} ${G.TRAITS[a.trait].name} を弱で無料`); ACTIONS.trait(st, p, { trait: a.trait, useL: a.useL, res: a.res, track: a.track, viaReward: pd.freeMax ? 'free' : pd.disc, weak: pd.weakOnly ? 'force' : a.weak }); return false; } // 'force'＝traitChoice が無い数値セットでも弱で受け取る // 2026-11-07：T10 の「弱なら無料」を選べるように weak を渡す
    if (pd.type === 'bonusAction') { if (!a.skip) throw new Error('追加アクションは対象アクションを直接実行してください'); p.pending.shift(); log(st, p.id, `${p.name}：追加アクションを見送り`); return false; }
    if (pd.type === 'specialOrgan') { const id = a.organ; if (!(st.shared.special || []).includes(id)) throw new Error('場に残っている特殊器官を選んでください'); p.pending.shift(); st.shared.special.splice(st.shared.special.indexOf(id), 1); p.organs.push({ id, strong: true, special: true }); log(st, p.id, `${p.name}：代謝 Lv4 で特殊器官 ${G.ORGANS[id].name}（${G.ORGANS[id].strong}）を取得`); return false; } // T15
    if (pd.type === 'fkBreed') { p.pending.shift(); if (a.skip) { log(st, p.id, `${p.name}：孵化核の繁殖を見送り`); return false; } log(st, p.id, `${p.name}：孵化核で繁殖（手番なし）`); ACTIONS.breed(st, p, { nP: a.nP, nL: a.nL, pay: a.pay, bonus: true }); return false; } // T15 孵化核
    if (pd.type === 'flSwap') { p.pending.shift(); if (a.skip) return false; doFlSwap(st, p, a, pd.max); return false; }
    if (pd.type === 'cvIncome') { p.pending.shift(); const r = a.res || 'E'; gainRes(p, r, pd.n); log(st, p.id, `${p.name}：収斂膜で${r}+${pd.n}`); return false; }
    if (pd.type === 'lYield') { const r = a.res || 'E'; if (!pd.opts.includes(r)) throw new Error(`産出で選べる資源は ${pd.opts.join('/')} です`); p.pending.shift(); gainRes(p, r, pd.n); log(st, p.id, `${p.name}：生命核の産出 ${r}+${pd.n}`); return false; }
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
    if (pd.type === 'learn') { p.pending.shift(); if (a.skip) { log(st, p.id, `${p.name}：学習を見送り`); return false; } if (a.kind === 'express') ACTIONS.express(st, p, { track: a.track, free: true }); else ACTIONS.mimic(st, p, { effect: a.effect, free: true }); return false; }
    if (pd.type === 'dgBuy') { p.pending.shift(); if (a.skip) return false; ACTIONS.trait(st, p, { trait: a.trait, useL: a.useL, res: a.res, track: a.track, viaDG: pd.disc, weak: a.weak }); return false; } // 2026-11-08：強／弱を選べるように weak を渡す（ユーザー指摘）
    throw new Error('不明な保留');
  };

  // ---------- 公開API ----------
  const BONUS_OK = { track: 1, breed: 1, organ: 1, scan: 1, convert: 1, reserve: 1, card: 1, stAct: 1, crystal: 1, premium: 1, lCrystal: 1, coopCrystal: 1 };
  function apply(st, action) {
    if (st.ended) throw new Error('ゲームは終了しています');
    const pid = action.pid; assertTurn(st, pid); const p = P(st, pid);
    const pd = p.pending[0]; let viaBonus = false;
    if (pd && action.type !== 'resolve' && action.type !== 'freeConv' && action.type !== 'gToE' && action.type !== 'lToRes' && action.type !== 'cheat') {
      if (pd.type === 'bonusAction' && BONUS_OK[action.type]) { action = Object.assign({}, action, { bonus: true }); viaBonus = true; }
      else throw new Error(pd.type === 'bonusAction' ? '追加アクション（排他なしアクション）を今すぐ実行するか見送ってください' : '先に保留中の選択（収入時の振替・遺伝子図書館・報酬）を解決してください');
    }
    // 例外時の巻き戻し用スナップショット（log/history/roundStart は複製しない）
    const lg = st.log, hist = st.history, rs = st.roundStart, logLen = lg.length;
    st.log = []; st.history = []; st.roundStart = null;
    const snap = clone(st);
    st.log = lg; st.history = hist; st.roundStart = rs;
    try {
      const wasPre = action.type === 'resolve' && !!(pd && pd.pre); // 手番前の保留（収入時）の解決か
      const consumed = ACTIONS[action.type](st, p, action);
      if (wasPre) p.pending.forEach(x => { if (x.pre === undefined) x.pre = true; }); // 手番前の解決から派生した保留（例：遺伝子図書館の購入で知性 Lv3★ に到達→報酬の形質）も手番前
      if (p._coop8Due) { p._coop8Due = false; if (RS(p).coop8Gem) addGem(st, p, 'social', 1, `協調${RS(p).coopGemAt || 8}到達`); if (RS(p).coop8Coef) addUpgrade(st, p, '協調8到達'); }
      syncGates(st, p);
      if (viaBonus) { const i = p.pending.findIndex(x => x.type === 'bonusAction'); if (i >= 0) p.pending.splice(i, 1); }
      if ((consumed !== false || action.type === 'resolve' || viaBonus) && !wasPre) advanceTurn(st); // 追加アクション（知性Lv4↗）を実行したら手番は次へ（本体のアクションで既にトークンを消費している）。手番前の保留の解決後はそのまま本人の手番（v3.63）
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
    const tg = RS(st).traitEndGem; if (tg && st.ended) n += Math.floor(p.traits.length / tg); // 試作 traitEndGem：終了時、形質N枚につき祝福+1（知性Lvを問わない）
    const le = RS(st).lEndGem; if (le && st.ended) n += Math.min(le.max, Math.floor(p.L / le.per)); // T6 S2：終了時、保有L per個につき祝福+1（上限）
    const cv = RS(st).lv6Convert; if (cv && st.ended) { const cnt = { body: RS(st).lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: Math.max(0, p.traits.length - 3 * (p.intel4VgN || 0)), social: p.coop, metab: p.organs.length }; const by = RS(st).lv6ConvertBy || {}; G.TRACKS.forEach(t => { if (p.lv[t] >= 6 && !(RS(st).lv6RealTracks || []).includes(t)) n += lv6N(st, t, cnt, by, cv); }); } // lv6RealTracks の色は endGame で痕跡に／T6 L6-A：Lv6 の色は収集物 cv 個につき祝福+1（lv6ConvertBy で色別に変更可）
    const re2 = organ(p, 'Re2'); let wildLeft = re2 ? (re2.strong ? 99 : 1) : 0;
    if (RS(st).noCombo) return n; // 試作 noCombo（第41部）：宝石コンボを廃止（色の組合せは祝福を生まない）
    st.shared.combos.two.forEach(i => {
      const c = G.COMBOS2[i];
      if (c.every(t => p.gems[t] > 0)) { n += 1; return; }
      if (wildLeft > 0 && re2) { const missing = c.filter(t => p.gems[t] === 0); if (missing.length === 1 && (re2.strong ? missing[0] === p.wild : true)) { n += 1; wildLeft -= 1; } }
    });
    st.shared.combos.three.forEach(i => { if (G.COMBOS3[i].every(t => p.gems[t] > 0)) n += 1; });
    return n;
  }
  function score(st, p) {
    const real = realGems(p), vg = virtualGems(st, p), cf = coef(p), cfB = coefB(p), cfC = coefC(p);
    const R = RS(st); const colors = G.TRACKS.filter(t => p.gems[t] > 0).length;
    const core = R.coef2 ? real * R.gemPt * cfB + vg * R.gemPt * cfC : (real + vg) * R.gemPt * cf, reg = p.regime ? R.regimePt : 0;
    let dev, org;
    if (R.scoreMode === 'mult') { dev = p.traits.length * Math.max(1, colors); org = p.organs.length * Math.min(4, p.coop); } // 掛け算：形質×宝石色数（1〜4）・器官×協調（上限4）
    else { dev = (p.traits.length + p.coop) * R.devPt; org = p.organs.length * R.organPt; }
    return { total: core + dev + org + reg, core, dev, org, reg, real, vg, cf: R.coef2 ? cfC : cf, cfB, cfC, coef2: !!R.coef2, colors, mode: R.scoreMode, gemPt: R.gemPt, devPt: R.devPt, organPt: R.organPt, tie: [real, p.traits.length + p.coop, p.E + p.G + p.P] };
  }
  function endGame(st) {
    st.ended = true; st.phase = 'end';
    if (RS(st).endMajorityGem) G.TRACKS.forEach(t => { const mx = Math.max(...st.players.map(p => p.lv[t])); const tops = st.players.filter(p => p.lv[t] === mx); if (tops.length === 1 && mx >= (RS(st).endMajorityMinLv || 2)) addGem(st, tops[0], t, 1, `${G.TRACK_INFO[t].name}の首位（最果ての痕跡）`); }); // 試作 endMajorityGem（第30部 B1）：各色の単独首位に痕跡+1
    { const cv = RS(st).lv6Convert, rt = RS(st).lv6RealTracks || []; if (cv && rt.length) st.players.forEach(p => { const cnt = { body: RS(st).lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: Math.max(0, p.traits.length - 3 * (p.intel4VgN || 0)), social: p.coop, metab: p.organs.length }; const by = RS(st).lv6ConvertBy || {}; rt.forEach(t => { if (p.lv[t] >= 6) { const k = lv6N(st, t, cnt, by, cv); if (k > 0) addGem(st, p, t, k, `${G.TRACK_INFO[t].name} Lv6 神の裁定`); } }); }); } // 試作 lv6RealTracks
    st.hist = st.hist || []; st.hist.push({ round: st.round + 1, label: '終了', rows: st.players.map(p => summaryRow(st, p)) });
    const rows = st.players.map(p => Object.assign({ pid: p.id, name: p.name }, score(st, p)));
    rows.sort((a, b) => b.total - a.total || b.tie[0] - a.tie[0] || b.tie[1] - a.tie[1] || b.tie[2] - a.tie[2]);
    st.result = rows;
    log(st, null, '=== ゲーム終了 ===', 'round');
    rows.forEach((r, i) => log(st, r.pid, `${i + 1}位 ${r.name}：${r.total}点（${r.coef2 ? `痕跡${r.real}×${r.gemPt !== 1 ? r.gemPt + '×' : ''}繁栄度${r.cfB}＋祝福${r.vg}×${r.gemPt !== 1 ? r.gemPt + '×' : ''}成熟度${r.cfC}` : `痕跡${r.real}+祝福${r.vg} ×${r.gemPt}×${r.cf}`}＝${r.core}${r.dev ? '／発展度' + r.dev : ''}${r.organPt || r.mode === 'mult' ? '／器官' + r.org : ''}${r.reg ? '／体制' + r.reg : ''}）`, 'gem'));
  }

  // ---------- 獲得量プレビュー（UI用）：アクションを試し打ちして資源の差分を返す。実行不可なら null ----------
  function previewGain(st, action, o) { // o.noTraitFx＝選ぶ形質の効果を数えない（淘汰(知性)の見込み）
    let s2; if (o && o.noTraitFx) st._noTraitFx = true; try { s2 = tryApply(st, action); } catch (e) { return null; } finally { delete st._noTraitFx; } if (s2) delete s2._noTraitFx;
    const a = st.players[action.pid], b = s2.players[action.pid]; const d = {};
    ['E', 'G', 'P', 'L', 'coop', 'gemsets'].forEach(k => { const v = (b[k] || 0) - (a[k] || 0); if (v) d[k] = v; });
    G.TRACKS.forEach(t => { const v = b.gems[t] - a.gems[t]; if (v) d['gem_' + t] = v; });
    return d;
  }
  function gainText(d) {
    if (!d) return '';
    const jp = { E: 'E', G: 'G', P: 'P', L: '生命核', coop: '協調', gemsets: '祝福' };
    const parts = Object.entries(d).filter(([k]) => !k.startsWith('gem_')).map(([k, v]) => `${jp[k] || k}${v > 0 ? '+' : ''}${v}`);
    { const gsum = G.TRACKS.reduce((a, t) => a + (d['gem_' + t] || 0), 0); if (gsum) parts.push(`痕跡+${gsum}`); } // 2026-10-28 色の廃止：合計で表示
    return parts.join(' ');
  }
  // 数値セット連動の説明文（ツールチップ用。静的な TIPS の代わり）
  function slotTip(st, id) {
    const R = RS(st); const cb = R.coopMode === 'spend' ? `協調1個を払うと この枠の資源+${R.coopSpendGain || 3}（1回1個まで）` : R.coopMode === 'half' ? `協調ボーナス＝＋協調数の半分（切り捨て${R.coopBonusCap !== undefined ? `・上限+${Math.floor(R.coopBonusCap / 2)}` : ''}）` : R.coopMode === 'tier' ? `協調ボーナス＝協調1〜3で+1・4〜7で+2・8で+3${R.coopBonusSlots ? '（' + R.coopBonusSlots.map(x => G.SLOT_BY_ID[x].name).join('・') + 'のみ）' : ''}` : R.coopBonusCap !== undefined ? `協調ボーナス＝＋協調数（上限+${R.coopBonusCap}）` : '協調ボーナス＝＋協調数';
    const byp0 = R.launchFree ? `使用済みは協調進出（協調${R.bypassCoopCost || 2}）で突破可` : `使用済みは緊急進出（生命核1）${st.ext === 'x1' ? `・協調進出（協調${R.bypassCoopCost || 2}）` : ''}で突破可`; const byp = (R.launchFree ? `空いている枠なら緊急進出（生命核1）で獲得量${R.launchFree}倍。` : '') + byp0 + (R.launchMul ? `（獲得量${R.launchMul}倍）` : ''); // T18：緊急進出＝空き枠で 3 倍・後乗りは協調進出だけ // T12：発進は獲得量 2 倍（資源枠のみ）
    const bypM = R.bypassCoopWide && st.ext === 'x1' ? `。使用済みは協調進出（協調${R.bypassCoopCost || 2}）で突破可` : '';
    const m = {
      E5: `熱源吸収：E+${sc(st, 5)}。${cb}。${byp}`, G3: `配列解析：G+${sc(st, 3)}。${cb}。${byp}`, P8: `個体培養：P+${R.p8 || 8}。${cb}。${byp}`,
      EG: R.herd ? `群体同期：P${R.herdCost || 6}を払って E+${sc(st, 3)}＋協調+${R.herdCoop || 1}。${cb}。${byp}` : `群体同期：E+${sc(st, 2)}＋P${sc(st, 10)}ごとに+${sc(st, 1)}E。${cb}。${byp}`,
      GG: R.herd ? `群体融合：P${R.herdCost || 6}を払って G+${sc(st, 2)}＋協調+${R.herdCoop || 1}。${cb}。${byp}` : `群体融合：G+${sc(st, 1)}＋P${sc(st, 10)}ごとに+${sc(st, 1)}G。${cb}。${byp}`,
      ALL: `資源合成：E+${sc(st, 2)} G+${sc(st, 1)} P+${sc(st, 4)}。${cb}（資源を選ぶ）。${byp}`, PB: `自己複製：G${sc(st, 2)}→P+${pbGain(st)}（全翻訳で割引）${R.pbCoop ? '。' + cb : ''}。${byp0}（自由行動は対象外）`, // 2026-11-05 Pブーストも緊急発進・協調発進の対象に
      MB: `淘汰(身体)：P${R.massCost}（下限${R.massMin.body}）→痕跡+1。${R.bodyAxis === 'L' ? '誰でもP→痕跡の出口' : '身体Lv4/5で軽減'}${bypM}`,
      MI: `淘汰(知性)：P${R.massCost}→G${R.miMaxCost || 4}以下の形質${R.miMaxCost ? (R.miCount || 1) + '種' : 'を異なる2種'}（無料）${bypM}`, MS: `淘汰(社会)：P${R.msCost || R.massCost}→協調+${R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2)}${bypM}`, MM: `淘汰(代謝)：P${R.mmCost || R.massCost}→E+${R.mmGain || sc(st, 10)} G+${R.mmGain || sc(st, 10)}${bypM}`,
      MIM: `模倣：G${R.mimicCost || 4}を払い、自分を含む誰かが到達済みの Lv2／Lv3★ の !即時効果（G+${sc(st, 3)}／P+${sc(st, 6)}／P+${sc(st, 10)}／E+${sc(st, 8)}／自由行動+1）を1つ受け取る。◆生命核の L+1 と ∞恒久・手収入は対象外。1ラウンド1人`,
      EXP: `発現：G${R.expressCost || 10}を払い、痕跡+1（先駆なし・トラックは進まない）。1ラウンド1人${bypM}`,
      TRT: R.traitShared ? '形質獲得：共用（排他なし）。形質プールのカードをクリック。先駆＝強・追随＝弱。' + (R.traitHalfFloor ? 'コストの下限＝元コストの半分（切上）' : '') : '形質獲得：形質プールのカードをクリック（1ラウンド1人）',
      AMP: R.amplify ? `増幅：E${R.amplify.E || 0} を払い、器官1つの効果を以後2倍（1人1回・ワーカー）。対象＝${ampTargetText(st)}。持っている器官に使うほか、形成のときに「形成と同時に増幅」を選べば手番1つで済む` : '', BST: R.burst ? `急速形成：同じ系統の器官を 2〜${R.burst.max || 3} 枚、形態の順に続けて形成（各々の${R.organCumulative ? '定価（差額払いにならない）' : '値段'}と追随の代償・形成時効果あり・ワーカー 1）。系統完成を 1 手で` : '', TRT2: `形質獲得（割増枠）：通常コスト＋E${st.round}`, GEM: R.tribute && R.tribute.flatG ? `献上（遺伝子）：G${sc(st, R.tribute.flatG)}→${tribOutText(st, 'G')}。${R.tributeOnceGame ? '' : '共用・'}${tribLimitText(st)}${R.intelRewards === 'learn' ? '（研究で何度でも）' : ''}` : `宝石セット：G(${sc(st, 10)}−形質数×${sc(st, 1)}・下限${sc(st, 5)}${R.gemsetEscalate ? '・購入ごとに+' + R.gemsetEscalate : ''})→祝福+1（自分専用）${R.gemsetShared ? '。共用（排他なし）' : '。1ラウンド1人'}`,
      TE: R.tribute ? `恩寵枠（エネルギー）：E${sc(st, R.tribute.slots.TE.E)}→祝福+1。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TP: R.tribute ? `恩寵枠（個体数）：P${sc(st, R.tribute.slots.TP.P)}→祝福+1。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TR: R.tribute ? `恩寵枠（宝石）：E${sc(st, R.tribute.slots.TR.E)}+P${sc(st, R.tribute.slots.TR.P)}→痕跡+1（先駆なし）。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '',
      TO: R.tribute && R.toLineage ? `器官の恩寵：系統 1 つを、1 段目の定価 1 回だけで 3 段目まで形成（追随の代償なし・形成時効果あり・系統完成も判定。既に 1〜2 枚持つ系統にも使え、払うのは 1 段目の定価 1 回）。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : R.tribute ? `器官の恩寵：器官の場から器官1枚を無料で形成（追随の代償なし・形成時効果あり・系統内は形態の順）。同じ手番にもう1枚を半額で形成してよい。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TT: R.tribute ? `形質の恩寵：G${sc(st, (R.tribute.slots.TT || {}).G || 0)}を払い、形質プールから形質を${(R.tribute.slots.TT || {}).n || 2}枚まで無料で取得（強が残っていれば強）。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TA: R.tribute ? `錬金：手持ちの宝石の色を${(R.tribute.slots.TA || {}).n || 2}個まで替える（コンボ・審判は替えた後の色で数える）。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TB: R.tribute ? `神の加護：置いたとき資源枠1つを今すぐ実行（使用済みでも可・占有しない・獲得量${(R.tribute.slots.TB || {}).mul || 2}倍）。さらにワーカーを置いたこのラウンドの残りの手番、自分の資源枠（占有盤の資源獲得）の獲得量が${(R.tribute.slots.TB || {}).mul || 2}倍（協調ボーナスとコストはそのまま）。先に置くほど強い。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '', TJ: R.tribute ? `跳躍：進化を${(R.tribute.slots.TJ || {}).n || 2}回（同じトラックでも別でも）、合計コストから E${sc(st, (R.tribute.slots.TJ || {}).disc || 0)}引く。ワーカー必須・報酬は通常どおり。ラウンド${R.tribute.openRound || 6}から・1ラウンド1人` : '',
      BRD: R.coef2 ? `繁殖：${R.breed.map((c, i) => `P${c}→×${(R.coef2.breedBase || 3) + i + 1}`).join('／')}（繁栄度＝痕跡に掛ける）${R.breedL ? `。生命核L${R.breedL}でも払える（身体の投入回数に数える）` : ''}${R.mbMode === 'multi' ? '。P 払いの段と生命核払いの段を同時に行ってよい（それぞれ 1 段・増殖暴走の強で 2 段）' : ''}` : `繁殖：P${R.breed[0]}→×4／P${R.breed[1]}→×5${R.breedL ? `。生命核L${R.breedL}でも払える（身体の投入回数に数える）` : ''}。係数の上限×7`,
      ORG: `器官形成：器官の場のカードをクリック。コスト${(R.organCost || G.ORGAN_COST).map(c => c[0] + 'E+' + c[1] + 'G').join('／')}${R.organCostBy ? Object.entries(R.organCostBy).map(([l, arr]) => `・${G.LINEAGES[l]}は${arr.map(c => c[0] + 'E+' + c[1] + 'G').join('／')}`).join('') : ''}${R.organSameEffect ? `（効果は先駆も追随も同じ・追随は +${sc(st, R.organLateFee || 1)}E）` : `（弱はG0${R.organEscalate ? '・所持' + R.organEscalate + '枚ごとに+1E' : ''}）`}${R.organExcl ? '・各カード1ラウンド1人' : '・共用（何人でも）'}`,
      SCAN: `探索：E${sc(st, 5)}→他プレイヤーの最高Lv×${sc(st, 2)}の資源（身体=P／知性=G／社会=協調${R.scanCoop !== undefined ? '〔+' + R.scanCoop + 'のみ〕' : ''}／代謝=E）`,
      TRK: `進化：E ${R.step.slice(1).join('／')}（Lv2→3→4→5→6）${R.bodyStep ? '・身体は ' + R.bodyStep.slice(1).join('／') : ''}。ワーカー必須。素材が規定数に達すると自動で上がる`,
      ADP: `適応進化：生命核1→Lv1のトラックを+1（ワーカー必須）${R.bodyAxis === 'L' ? '。身体の投入回数に数える' : ''}`, CNV: `資源変換：E${sc(st, 2)}→G${sc(st, 1)}／G${sc(st, 2)}→E${sc(st, 1)}／P${sc(st, 8)}→E${sc(st, 3)}／P${sc(st, 8)}→G${sc(st, 2)}（1アクション1種類・回数自由）`, RSV: `予備動員：無料で E+${R.reserveE || 2} または G+${R.reserveG || 1}`,
    };
    return m[id] || (G.SLOT_BY_ID[id] ? G.SLOT_BY_ID[id].text : '');
  }

  // 種族の表示文（speciesMod を反映）
  function speciesInfo(st, id) {
    const sp = G.SPECIES[id]; const mod = (RS(st).speciesMod || {})[id] || {}; const stock = mod.stock || sp.stock;
    let passive = sp.passive, hint = sp.hint;
    if (id === 'manta' && mod.stock) { const pP = mod.mantaP !== undefined ? mod.mantaP : 10, iE = mod.mantaIncE !== undefined ? mod.mantaIncE : 1; passive = [pP ? `P+${pP}` : null, iE ? `E収入+${iE}（恒久）` : null].filter(Boolean).join(' ＋ ') || '初期資源が多い（何にでも伸ばせる）'; hint = '初期資源が全種類多く、最初の手番から形質・器官・進化のどれにも手が届く。何にでも伸ばせる万能型。'; } const type = (id === 'manta' && mod.stock) ? '万能' : sp.type;
    if (id === 'ant' && mod.coop !== undefined) passive = `協調${mod.coop}でスタート`;
    if (id === 'arm' && RS(st).armTraitMax) passive = `コストG${RS(st).armTraitMax}以下の形質1枚を取得済みでスタート`;
    return { name: sp.name, type, order: sp.order, stock: { E: stock.E, G: stock.G, P: stock.P }, L: mod.L || 0, passive, hint };
  }

  // ---------- 表示文（数値セット連動） ----------
  // 2026-10-29：p（見ている人）を渡すと、形質・器官・報酬による割引を反映した「その人の実際のコスト」を表示する（基準値と違うときは「（軽減後）」）
  function slotText(st, id, p) {
    const R = RS(st); const s = G.SLOT_BY_ID[id]; if (!s) return '';
    const eff = (base, mine) => (p && mine !== null && mine !== undefined && mine !== base) ? `${mine}（軽減後）` : String(base);
    const mass = (kind) => eff(kind === 'MM' && R.mmCost ? R.mmCost : kind === 'MS' && R.msCost ? R.msCost : R.massCost, p ? massCost(p, kind) : null);
    if (id === 'MB') return `P${mass('MB')} → 痕跡+1`;
    if (id === 'MI') return R.miMaxCost ? `P${mass('MI')} → G${R.miMaxCost}以下の形質${R.miCount || 2}種` : `P${mass('MI')} → G4以下の形質を異なる2種`;
    if (id === 'MS') return `P${mass('MS')} → 協調+${R.msCoop !== undefined ? R.msCoop : (st.ext === 'x1' ? 3 : 2)}`;
    if (id === 'MM') return `P${mass('MM')} → E+${R.mmGain || sc(st, 10)} G+${R.mmGain || sc(st, 10)}`; // T18：mmGain（v3.96 で短文も）
    if (id === 'RST') return `強の値段＋E${(R.restore || {}).E || 0} → 取られた強の形質を強の効果で（1人1回）`;
    if (id === 'AMP') return `E${(R.amplify || {}).E || 0} → 器官1つ（${(R.amplify || {}).organs ? '数の効果を持つ器官' : ampTargetText(st)}）の効果を以後2倍（1人1回）`;
    if (id === 'BST') return `同じ系統の器官を 2〜${(R.burst || {}).max || 3} 枚続けて形成（各々の${R.organCumulative ? '定価（差額にならない）' : '値段'}・ワーカー 1）`;
    if (id === 'PASS') return '何も得ない（置ける場所が無いときに）';
    if (id === 'GTH') { const g = R.gather || {}; return `E${g.E}／G${g.G}／P${g.P} のどれか1つ、または P${g.coopCostP || 0}→協調+${g.coop}（弱い資源・置ける場所が無いときに）`; }
    if (id === 'GEM') return R.tribute && R.tribute.flatG ? `G${sc(st, R.tribute.flatG)} → ${tribOutText(st, 'G')}${R.tributeOnceGame ? '' : `（共用・${tribLimitText(st)}）`}` : `G(${sc(st, 10)}−形質数×${sc(st, 1)}・下限${sc(st, 5)}${R.gemsetEscalate ? '・購入ごとに+' + R.gemsetEscalate : ''}) → 祝福+1${R.gemsetShared ? '（共用）' : ''}`;
    if (id === 'TE' && R.tribute) return `E${sc(st, R.tribute.slots.TE.E)} → 祝福+1`; if (id === 'TP' && R.tribute) return `P${sc(st, R.tribute.slots.TP.P)} → 祝福+1`; if (id === 'TR' && R.tribute) return `E${sc(st, R.tribute.slots.TR.E)}+P${sc(st, R.tribute.slots.TR.P)} → 痕跡+1`;
    if (id === 'TO' && R.tribute) return R.toLineage ? '系統 1 つを 1 段目の定価で 3 段目まで' : '器官1枚を無料（＋もう1枚を半額）'; if (id === 'TT' && R.tribute) return `G${sc(st, (R.tribute.slots.TT || {}).G || 0)} → 形質${(R.tribute.slots.TT || {}).n || 2}枚まで無料`; if (id === 'TA' && R.tribute) return `宝石の色を${(R.tribute.slots.TA || {}).n || 2}個まで替える`; if (id === 'TB' && R.tribute) return `資源枠1つを今すぐ（使用済みでも）＋残りの手番は資源枠が${(R.tribute.slots.TB || {}).mul || 2}倍`; if (id === 'TJ' && R.tribute) return `進化2回・合計 −E${sc(st, (R.tribute.slots.TJ || {}).disc || 0)}`;
    if (id === 'BRD') return R.coef2 ? `${R.breed.every(c => c === R.breed[0]) ? `P${eff(R.breed[0], p ? breedCost(p) : null)}→繁栄度+1（${R.breed.length}段）` : R.breed.map((c, i) => `P${c}→×${(R.coef2.breedBase || 3) + i + 1}`).join(' / ')}${R.breedL ? `（または生命核L${R.breedL}）` : ''}（ワーカー必須）` : `P${R.breed[0]}→×4 / P${R.breed[1]}→×5${R.breedL ? `（または生命核L${R.breedL}）` : ''}（ワーカー必須）`;
    if (id === 'TRK') { const base = `${R.step.slice(1).join('/')}E（ワーカー必須）`; if (!p) return base; const mine = G.TRACKS.map(t => { const c = stepCost(p, t); return c === null ? null : { t, c }; }).filter(Boolean); const diff = mine.some(({ t, c }) => c !== ((t === 'body' && R.bodyStep) ? R.bodyStep : R.step)[p.lv[t]]); return diff ? `${base}　あなたの次の段：${mine.map(({ t, c }) => `${G.TRACK_INFO[t].name.split('・')[0]}E${c}`).join('／')}` : base; }
    if (id === 'EG' && R.herd) return `P${R.herdCost || 6} → +${sc(st, 3)}E ＋ 協調+1`;
    if (id === 'GG' && R.herd) return `P${R.herdCost || 6} → +${sc(st, 2)}G ＋ 協調+1`;
    if (id === 'TRT2') return `通常コスト＋E${st.round}（ラウンド数）`;
    if (id === 'RSV') return `無料で E+${R.reserveE || 2} または G+${R.reserveG || 1}`;
    if (id === 'MIM') return `G${eff(R.mimicCost || 4, p ? gSlotCost(p, R.mimicCost || 4) : null)} → 自分を含む誰かが到達済みの Lv2／Lv3★ の !即時効果を1つ（◆L+1 は対象外）`;
    if (id === 'EXP') return `G${eff(R.expressCost || 10, p ? gSlotCost(p, R.expressCost || 10) : null)} → 痕跡+1（先駆なし）`;
    if (id === 'P8' && R.p8) return `+${R.p8}P`;
    if (id === 'TRT' && R.traitShared) return 'Gを払い形質を取得（共用・排他なし）';
    if (id === 'ORG') { const oc = R.organCost || G.ORGAN_COST; return oc.map(([e, g]) => `${e}E+${g}G`).join(' / ') + (R.organSameEffect ? `（代償 +${sc(st, R.organLateFee || 1)}E）` : '（弱はG0' + (R.organEscalate ? `・所持${R.organEscalate}枚ごとに+1E` : '') + '）'); }
    if (id === 'E5') return `+${sc(st, 5)}E`; if (id === 'G3') return `+${sc(st, 3)}G`; if (id === 'ALL') return `+${sc(st, 2)}E +${sc(st, 1)}G +${sc(st, 4)}P`; if (id === 'PB') return `G${eff(sc(st, 2), p ? pbCost(p) : null)} → P+${pbGain(st)}`;
    if (id === 'SCAN') return `E${sc(st, 5)} → 他者の最高Lv×${sc(st, 2)}の資源`; if (id === 'CNV') return `E${sc(st, 2)}→G${sc(st, 1)} / G${sc(st, 2)}→E${sc(st, 1)} / P${sc(st, 8)}→E${sc(st, 3)} / P${sc(st, 8)}→G${sc(st, 2)}`;
    return txt(st, s.text);
  }
  function trackRewardText(st, track, lv) {
    const R = RS(st);
    if (lv === 6) return `${R.lv6First ? `先駆：痕跡+1＋祝福+1／追随：痕跡+1` : `痕跡+1（先駆なし）`}${R.lv6Convert ? `。${R.lv6First ? 'どちらも' : ''}終了時、${R.lv6Fixed && R.lv6Fixed[track] !== undefined ? `祝福+${R.lv6Fixed[track]}（固定）` : `${G.GATE_SHORT_L && track === 'body' && R.bodyAxis === 'L' ? '払ったL' : G.GATE_SHORT[track]}${R.lv6Convert}個につき祝福+1`}` : ''}${lv6PayDef(st, track) ? `。コスト＝${lv6CostText(st, track)}（そのトラックの資源で払う）` : ''}`;
    if (R.bodyAxis === 'L' && track === 'body' && R.bodyRewards === 'P') { const m = { 2: ['今すぐL+1', R.lCrystal && (R.lCrystalLv || 4) === 2 ? `献上（生命核）（L${R.lCrystal}→祝福+1）を解放` : null].filter(Boolean).join('＋'), 3: `1L＝E${sc(st, 4)}／G${sc(st, 4)}（投入の価値上昇）＋強は今すぐL+1`, 4: (R.bodyLv4Gem ? '痕跡+1＋' : '') + '生命核の産出（P）が2倍', 5: `強：1L＝E${sc(st, 5)}／G${sc(st, 5)}＋今すぐL+1／弱：今すぐL+1` }; if (m[lv]) return txt(st, m[lv]); }
    if (R.bodyAxis === 'L' && track === 'body') { // T5/T6：生命核軸の身体（フラグで文を組み立てる）
      const t2 = ['産出の資源をLごとにE/Gから選べる']; if (R.body2L) t2.push('今すぐL+1'); if (R.body2Gem) t2.push('痕跡+1'); if (R.lCrystal && (R.lCrystalLv || 4) === 2) t2.push(`結晶化（L${R.lCrystal}→祝福+1・排他なし）を解放`);
      const t4 = []; if (R.bodyLv4Gem) t4.push('痕跡+1'); t4.push('1L＝E4／G4', '産出でPも選べる'); if (R.lCrystal && (R.lCrystalLv || 4) === 4) t4.push(`結晶化（L${R.lCrystal}→祝福+1）を解放`);
      const m = { 2: t2.join('＋'), 3: `強：今すぐL+1＋${R.body3YieldAdd ? '産出+1/L' : '緊急進出の対象に形質獲得・宝石セット・淘汰を追加'}／弱：今すぐL+1`, 4: t4.join('＋'), 5: `強：${R.body5Coef ? '係数+1' : '産出が保有L1個につき2'}＋今すぐL+1／弱：今すぐL+1` };
      if (m[lv]) return txt(st, m[lv]);
    }
    let s = G.TRACK_REWARDS[track][lv];
    if (R.socialRewards === 'shield' && track === 'social' && G.TRACK_REWARDS_T4.social[lv]) s = G.TRACK_REWARDS_T4.social[lv];
    if (R.intel4 === 'traitDisc' && track === 'intel' && lv === 4) s = G.TRACK_REWARDS_T4.intel[4];
    if (R.intelRewards === 'learn' && track === 'intel' && G.TRACK_REWARDS_T7_INTEL[lv]) s = G.TRACK_REWARDS_T7_INTEL[lv];
    if (R.intelRewards === 'trait' && track === 'intel' && G.TRACK_REWARDS_T10_INTEL[lv]) s = G.TRACK_REWARDS_T10_INTEL[lv]; // T10
    if (R.metab4 === 'organNoG' && track === 'metab' && lv === 4) s = G.TRACK_REWARDS_T10_METAB4; // T10
    if (R.metab4 === 'special' && track === 'metab' && lv === 4) s = G.TRACK_REWARDS_T15_METAB4; // T15
    if (R.bodyAxis === 'L' && track === 'body' && G.TRACK_REWARDS_T5_BODY[lv]) s = G.TRACK_REWARDS_T5_BODY[lv];
    if (R.bodyAxis === 'L' && track === 'body' && lv === 4 && R.bodyLv4Gem && R.lCrystal) s = G.TRACK_REWARDS_T6_BODY4;
    return txt(st, s);
  }

  // ---------- 状況照会（UI用） ----------
  function availability(st, p) {
    const out = {};
    G.SLOTS.forEach(s => { const u = slotUsedBy(st, s.id); out[s.id] = { used: u !== undefined, usedBy: u }; });
    return out;
  }
  function summaryRow(st, p) { return { round: st.round, name: p.name, E: p.E, G: p.G, P: p.P, L: p.L, lv: G.TRACKS.map(t => p.lv[t]).join('/'), gems: realGems(p), vg: virtualGems(st, p), coef: RS(st).coef2 ? `${coefB(p)}/${coefC(p)}` : coef(p), traits: p.traits.length, organs: p.organs.length, coop: p.coop, score: score(st, p).total }; }

  Object.assign(G, { traitCountC, lineageCount, cxDisc, restoreE, ampE, lineageDone, altFuelP, traitText, stepCostDouble, stepCostTriple, tribVg, tribReal, tribOutText, nrTwoLeft, breedMaxN, tribLimitText, ampOk, ampTargetText, tribOpenRound: (st) => (RS(st).tribute || {}).openRound || 6, tribSlots, sc, txt, coefB, coefC, mimicOptions, gSlotCost, traitPool, baseTraitCost, armTraitOptions, speciesInfo, handSize, slotText, slotTip, previewGain, gainText, trackRewardText, gateLabel, gateShort, gateNote, applyEntry, rebuild, tryApply, flSwapMax, reachedMilestones, newGame, chooseSpecies, chooseStartTrait, draftCards, finishSetup, apply, undo, undoRound, score, realGems, coef, virtualGems, stepCost, lv6CostText, lv6Preview, lv6PayDef, organCost, traitCost, massCost, breedCost, gemsetPrice, pbCost, pbGain, scanCandidates, income, availability, slotUsedBy, bypassable, coopBypassable, gateReq, autoLv, summaryRow, comboNames, organ, trait, lineageCount, cur, P, clone });
})((typeof window !== 'undefined' ? window : globalThis).G1 = (typeof window !== 'undefined' ? window : globalThis).G1 || {});
