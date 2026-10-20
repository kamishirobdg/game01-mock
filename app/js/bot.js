/* 簡易AI（ソロ検証用）。
   v1/t1/t2 向け：desk_sim.py の台本（Tall/Wide/GEcon/Breed）を移植した貪欲方策。
   t3/t4（収集物でトラックが自動進行する数値セット）向け：4色の収集ルート（green=器官／blue=形質／white=協調／red=P投入）
   ＋共通の後処理（Wなし実行・緊急/協調発進・Eでの宝石段の先買い・終盤の得点化）。
   choose(st, pid, style) → 実行可能なアクション（G.tryApply で検証済み）を1つ返す。 */
(function (G) {
  'use strict';
  const STYLES = ['tall', 'wide', 'gecon', 'breed'];
  const GATE_STYLES = ['green', 'blue', 'white', 'red'];
  const RSo = (st) => G.RULESETS[st.rules || 'v1'];
  function ok(st, a) { try { G.tryApply(st, a); return true; } catch (e) { return false; } }
  function first(st, list) { for (const a of list) if (a && ok(st, a)) return a; return null; }
  const cheapTraits = (st, p) => G.TRAIT_ORDER.filter(t => !G.trait(p, t)).sort((a, b) => G.traitCost(st, p, a).G - G.traitCost(st, p, b).G);
  const goodTraits = { tall: ['DB', 'DI', 'DV', 'IE', 'JB', 'JI'], wide: ['IE', 'IB', 'DV', 'IG'], gecon: ['IG', 'IB', 'DG', 'DI', 'IE', 'IP', 'DA', 'MC', 'IM', 'JI', 'DV'], breed: ['MB', 'IP', 'MC', 'DB', 'JB'] };

  function pending(st, p) {
    const pid = p.id, pd = p.pending[0]; if (!pd) return null;
    const R = (x) => Object.assign({ pid, type: 'resolve' }, x);
    switch (pd.type) {
      case 'freeMass': return first(st, [R({ kind: 'MB' }), R({ kind: 'MM' }), R({ kind: 'MS' })]);
      case 'rewardTrait': return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })]));
      case 'dgBuy': return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })]));
      case 'flSwap': return first(st, [p.E > p.G + 4 ? R({ dir: 'EG', n: Math.min(pd.max, 2) }) : null, R({ skip: true })]);
      case 'cvIncome': return R({ res: p.E < 6 ? 'E' : p.G < 4 ? 'G' : 'P' });
      case 'lYield': { const pref = [p.E < 6 ? 'E' : null, p.G < 4 ? 'G' : null, 'E', 'G', 'P'].filter(Boolean).filter(r => pd.opts.includes(r)); return R({ res: pref[0] || pd.opts[0] }); }
      case 'wildColor': return R({ track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' });
      case 'reMilestone': { const m = G.reachedMilestones(p); const best = m.find(x => x.lv === 5) || m[0]; return R({ track: best.track, lv: best.lv }); }
      case 'bonusAction': return first(st, G.TRACKS.map(t => ({ pid, type: 'track', track: t, pay: 'E', useL: 0 })).concat(st.shared.organField.map(o => ({ pid, type: 'organ', organ: o, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })), [{ pid, type: 'convert', kind: 'EG', n: 1 }, { pid, type: 'reserve', res: 'E' }, R({ skip: true })]));
    }
    return null;
  }

  // ---------- v1/t1/t2 向け（従来） ----------
  function chooseClassic(st, pid, style) {
    const p = st.players[pid]; const R = RSo(st);
    const A = (x) => Object.assign({ pid }, x);
    const last = st.round >= (RSo(st).rounds || G.ROUNDS);
    const track = (t, pay) => A({ type: 'track', track: t, pay: pay || 'E', useL: Math.min(p.L, 3) });
    const organs = st.shared.organField.map(o => A({ type: 'organ', organ: o, useL: Math.min(p.L, 2), li2Res: 'E', li3Res: 'E', regimeRes: 'G' }));
    const traitBuy = (t) => [A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel' }), A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel', slot: 'TRT2' }), A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel', bypassL: true }), A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel', bypassCoop: true })];
    const wanted = goodTraits[style].filter(t => !G.trait(p, t)).flatMap(traitBuy);
    const anyTrait = cheapTraits(st, p).map(t => A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel' }));
    const cards = p.cards.map(c => A({ type: 'card', card: c, choice: 'E' }));
    const res = (s) => A({ type: 'res', slot: s, coopRes: 'E', useL: false });
    const mass = (k) => A({ type: 'mass', kind: k, traits: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).slice(0, 2) });
    const breed = A({ type: 'breed' }); const gemset = A({ type: 'gemset', useL: 0 });
    const adapt = A({ type: 'adapt', track: G.TRACKS.find(t => p.lv[t] === 1) || 'body' });
    const needE = (t) => { const c = G.stepCost(p, t); return c !== null && p.E + p.L * 3 < c; };
    const endgame = last ? [mass('MB'), gemset, ...anyTrait, breed, mass('MS')] : [];
    let plan = [];
    if (style === 'tall') {
      const prog = [...['body', 'intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab'].filter(t => p.lv[t] < 3).map(t => track(t))];
      const incomeFirst = (p.lv.body < 5 && needE('body')) ? [res('E5'), res('EG'), ...cards.filter(c => 'ADQCK'.includes(c.card))] : [];
      plan = [...endgame, ...incomeFirst, ...prog, adapt, breed, ...wanted.slice(0, 8), res('E5'), ...cards, res('EG'), res('ALL'), mass('MB'), ...G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => track(t)), ...anyTrait];
    } else if (style === 'wide') {
      const needG = p.G < 1 ? [A({ type: 'convert', kind: 'EG', n: 1 }), res('G3'), ...cards.filter(c => 'BCQ'.includes(c.card))] : [];
      plan = [...endgame, ...organs, ...needG, ...['body', 'intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, breed, res('E5'), ...cards, res('ALL'), ...wanted.slice(0, 8), A({ type: 'convert', kind: 'PE', n: 1 }), mass('MB')];
    } else if (style === 'gecon') {
      plan = [...endgame, gemset, ...wanted, mass('MI'), ...['intel'].filter(t => p.lv[t] < 5).map(t => track(t, 'G')), ...['intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab', 'body'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, res('G3'), ...cards, res('GG'), A({ type: 'convert', kind: 'PG', n: 1 }), A({ type: 'convert', kind: 'EG', n: 2 }), ...anyTrait, breed];
    } else {
      plan = [...endgame, ...wanted.slice(0, 4), breed, mass('MB'), ...['body'].filter(t => p.lv[t] < 5).map(t => track(t, 'P')), ...['body'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['metab', 'social', 'intel'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, res('P8'), ...cards, A({ type: 'convert', kind: 'PG', n: 1 }), res('ALL'), mass('MM'), ...anyTrait];
    }
    plan.push(res('E5'), res('ALL'), A({ type: 'reserve', res: p.G < 2 ? 'G' : 'E' }));
    return first(st, plan.filter(Boolean));
  }

  // ---------- t3/t4 向け（収集ルート） ----------
  // 資源の優先順（スロット・カードの選び方に使う）
  const PREF = { green: ['E', 'G', 'P'], blue: ['G', 'E', 'P'], white: ['P', 'E', 'G'], red: ['P', 'G', 'E'] };
  const SLOT_OF = { E: ['E5', 'EG'], G: ['G3', 'GG'], P: ['P8', 'PB'] };
  const CARD_RES = { A: 'E', B: 'G', C: 'E', D: 'E', E: 'G', F: 'E', G: 'G', H: 'P', I: 'E', J: 'P', K: 'E', L: 'P', M: 'E', N: 'G', O: 'P', P: 'G', Q: 'E', R: 'P', S: 'G', T: 'P' };
  function chooseGate(st, pid, style) {
    const p = st.players[pid]; const R = RSo(st);
    const A = (x) => Object.assign({ pid }, x);
    const RN = RSo(st).rounds || G.ROUNDS; const last = st.round >= RN, late = st.round >= RN - 1;
    const pref = PREF[style];
    const herd = !!R.herd;
    // 資源スロット：通常→（使用済みなら）協調発進→緊急発進。群体はT4ではPを払って協調を得る枠なので white 以外は後回し
    const lMin = R.lYield ? 3 : 2; // 利回りがある数値セットでは L を温存気味に
    const res = (s, coopRes) => { const base = { type: 'res', slot: s, coopRes: coopRes || pref[0], useL: false }; return [A(base), p.coop >= 2 && st.ext === 'x1' && style !== 'white' ? A(Object.assign({}, base, { bypassCoop: true })) : null, p.L >= lMin ? A(Object.assign({}, base, { useL: true })) : null]; };
    const resFor = (r) => SLOT_OF[r].filter(s => !(herd && (s === 'EG' || s === 'GG') && style !== 'white')).flatMap(s => res(s, r));
    const resAll = res('ALL', pref[0]);
    const cardsFor = (r) => p.cards.filter(c => CARD_RES[c] === r).map(c => A({ type: 'card', card: c, choice: r === 'P' ? 'E' : r }));
    const cardsAny = p.cards.map(c => A({ type: 'card', card: c, choice: 'E' }));
    // Wなし実行（権利があれば手番を消費せず先に使う）
    const shield = p.shields > 0 ? [...pref.flatMap(r => SLOT_OF[r].filter(s => s !== 'PB' && !(herd && (s === 'EG' || s === 'GG'))).map(s => A({ type: 'res', slot: s, coopRes: r, shield: true }))), A({ type: 'res', slot: 'ALL', coopRes: pref[0], shield: true }), ...pref.flatMap(cardsFor).map(c => Object.assign({}, c, { shield: true }))] : [];
    // 収集アクション
    const organCands = () => {
      const list = st.shared.organField.filter(o => !G.organ(p, o)).map(o => ({ o, c: G.organCost(st, p, o) })).filter(x => x.c);
      // 系統を完成に近づけるものを優先、次に安いもの、強を優先
      list.sort((a, b) => (G.ORGANS[b.o].tier - G.ORGANS[a.o].tier) || (b.c.strong - a.c.strong) || (a.c.E - b.c.E));
      return list.map(x => A({ type: 'organ', organ: x.o, useL: Math.max(0, Math.min(p.L, Math.ceil((x.c.E - p.E) / 3))), li2Res: p.G < 2 ? 'G' : 'E', li3Res: 'E', regimeRes: 'E' }));
    };
    const traitPref = ['IE', 'IG', 'IB', 'IP', 'DA', 'MC', 'DB', 'DI', 'IM', 'DV', 'DG', 'MB', 'JI', 'JB'];
    const traitCands = (slots) => traitPref.filter(t => !G.trait(p, t)).flatMap(t => slots.map(sl => A(Object.assign({ type: 'trait', trait: t, useL: Math.max(0, Math.min(p.L, Math.ceil((G.traitCost(st, p, t).G - p.G) / 3))), res: pref[0], track: 'intel' }, sl))));
    const traitSlots = [{}, { slot: 'TRT2' }, p.coop >= 2 && style !== 'white' ? { bypassCoop: true } : null, p.L >= 2 ? { bypassL: true } : null].filter(Boolean);
    const mass = (k) => A({ type: 'mass', kind: k, traits: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).slice(0, 2) });
    const breed = A({ type: 'breed' }); const gemset = A({ type: 'gemset', useL: 0 });
    const herdSlots = herd ? [...res('EG', 'E'), ...res('GG', 'G')] : [];
    // Eでの先買い：Eが余っていれば（コスト+4）トラックを買う。宝石の段（Lv3/Lv5）が近いトラックを優先し、同じなら安い方
    const buyGem = G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => ({ t, c: G.stepCost(p, t), gem: (p.lv[t] + 1 === 3 || p.lv[t] + 1 === 5 || p.lv[t] + 1 === 6) ? 0 : 1 })).filter(x => x.c !== null && p.E >= x.c + 4).sort((a, b) => (a.gem - b.gem) || (a.c - b.c)).map(x => A({ type: 'track', track: x.t, pay: 'E', useL: 0 }));
    const adapt = A({ type: 'adapt', track: G.TRACKS.find(t => p.lv[t] === 1) || 'body' });
    const gemsetOk = p.G >= G.gemsetPrice(p) + 2;
    // 専念ルートの完了判定（主トラックがLv5、または収集対象が尽きた）→ 以後は得点化モード：余資源を宝石・係数・進行に変える
    const mainTrack = { green: 'metab', blue: 'intel', white: 'social', red: 'body' }[style];
    const exhausted = style === 'blue' ? G.TRAIT_ORDER.every(t => G.trait(p, t)) : style === 'green' ? st.shared.organField.every(o => G.organ(p, o)) : false;
    const mainDone = p.lv[mainTrack] >= 5 || exhausted;
    const canGemset = p.G >= G.gemsetPrice(p);
    const nextCoefTrait = (p.traits.length === 3 || p.traits.length === 7) ? cheapTraits(st, p).slice(0, 3).map(t => A({ type: 'trait', trait: t, useL: 0, res: pref[0], track: 'intel' })) : [];
    const lineageFinish = st.shared.organField.filter(o => !G.organ(p, o) && G.ORGANS[o].tier === 3 && G.lineageCount(p, G.ORGANS[o].lin) === 2).map(o => A({ type: 'organ', organ: o, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }));
    const anyStep = G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => ({ t, c: G.stepCost(p, t), gem: (p.lv[t] + 1 === 3 || p.lv[t] + 1 === 5 || p.lv[t] + 1 === 6) ? 0 : 1 })).filter(x => x.c !== null && p.E >= x.c).sort((a, b) => (a.gem - b.gem) || (a.c - b.c)).map(x => A({ type: 'track', track: x.t, pay: 'E', useL: 0 }));
    const toP = p.G >= G.pbCost(p) + 2 && p.P < G.massCost(p, 'MB') ? [res('PB', 'P')[0]] : [];
    // 最終ラウンド：宝石・係数・進行に直結する手だけ。Eが少し足りない宝石の段には G→E 変換（2:1）を挟む。群体／大量消費(社会)は白ゲートが届くときだけ
    const gemStepShort = G.TRACKS.filter(t => p.lv[t] < 5 && (p.lv[t] + 1 === 3 || p.lv[t] + 1 === 5 || p.lv[t] + 1 === 6)).map(t => ({ t, c: G.stepCost(p, t) })).filter(x => x.c !== null && x.c > p.E && p.G >= 2 * (x.c - p.E)).sort((a, b) => a.c - b.c);
    const gConvForStep = gemStepShort.length ? [A({ type: 'convert', kind: 'GE', n: gemStepShort[0].c - p.E })] : [];
    const sinks = [...(R.coopCrystal && p.coop >= R.coopCrystal && (last || p.lv.social >= 5) ? [A({ type: 'coopCrystal' })] : []), ...(R.lCrystal && p.lv.body >= (R.lCrystalLv || 4) && p.L >= R.lCrystal + (last ? 0 : 2) ? [A({ type: 'lCrystal' })] : []), ...(R.premium ? G.PREMIUM_ORDER.filter(t => !G.trait(p, t)).map(t => A({ type: 'premium', trait: t, useL: 0 })) : []), ...(R.breedE ? [A({ type: 'breed', pay: 'E' })] : []), ...(R.crystal ? [A({ type: 'crystal', res: 'G' }), A({ type: 'crystal', res: 'E' })] : [])];
    const scoreMode = [canGemset ? gemset : null, p.P >= (G.breedCost(p) || 999) ? breed : null, mass('MB'), ...lineageFinish, ...nextCoefTrait, ...anyStep, ...gConvForStep, ...sinks, ...toP, A({ type: 'convert', kind: 'PE', n: 1 })];
    const sg = G.gateReq(p, 'social'); const coopNear = sg && sg.have + 1 >= sg.need;
    const endgame = last ? [gemset, mass('MB'), breed, ...lineageFinish, ...nextCoefTrait, ...anyStep, ...gConvForStep, ...sinks, ...(coopNear ? [...herdSlots, mass('MS')] : [])] : [];
    let main = [];
    if (style === 'red' && R.bodyAxis === 'L') {
      // 生命核軸の赤：毎ラウンド L を1個だけ投入して身体を上げ（宝石の段に近いトラックの進行にLを充てる／使用済み枠の緊急発進／適応進化）、残りは利回りのために抱える。P≥大量消費なら赤宝石
      const invest = [];
      // 抱えるのは1個まで（利回り逓減後の R4 以降は全部投入）。L繁殖（係数）を最優先、P があれば大量消費(身体)
      const keep = (R.yieldByRound && st.round >= 4) ? 0 : 1;
      const saveForBreed = R.breedL && G.breedCost(p) !== null && G.coef(p) < 7; // L繁殖を狙う間は L を貯める（1個ずつ投入しない）
      if (saveForBreed && p.L >= R.breedL) invest.push(A({ type: 'breed', pay: 'L' }));
      if (!saveForBreed && p.L >= keep + 1 && p.lv.body < 5) {
        G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => ({ t, c: G.stepCost(p, t), gem: (p.lv[t] + 1 === 3 || p.lv[t] + 1 === 5 || p.lv[t] + 1 === 6) ? 0 : 1 })).filter(x => x.c !== null && x.c >= (p.lValue || 3)).sort((a, b) => (a.gem - b.gem) || (b.c - a.c)).forEach(x => invest.push(A({ type: 'track', track: x.t, pay: 'E', useL: 1 })));
        const bulkN = R.bodyBulkLv4 || 2; if (R.bodyBulkLv4 && !p.lBulk && p.L >= bulkN) G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => ({ t, c: G.stepCost(p, t) })).filter(x => x.c !== null && x.c >= bulkN * (p.lValue || 3)).sort((a, b) => b.c - a.c).forEach(x => invest.push(A({ type: 'track', track: x.t, pay: 'E', useL: bulkN })));
        ['P8', 'E5', 'ALL'].forEach(sl => { if (G.slotUsedBy(st, sl) !== undefined) invest.push(A({ type: 'res', slot: sl, coopRes: 'P', useL: true })); });
      }
      if (R.massL && p.L >= R.massL + 1) invest.push(A({ type: 'mass', kind: 'MB', pay: 'L' }));
      const mbNow = p.P >= G.massCost(p, 'MB') ? [mass('MB'), ...(p.bypassWide && p.L > 0 ? [A({ type: 'mass', kind: 'MB', bypassL: true })] : [])] : [];
      const crystalNow = (R.lCrystal && p.lv.body >= (R.lCrystalLv || 4) && st.round >= 4 && p.L >= R.lCrystal + keep) ? [A({ type: 'lCrystal' })] : [];
      main = [...mbNow, ...invest, ...crystalNow, ...buyGem];
    } else if (style === 'green') main = [...organCands()];
    else if (style === 'blue') main = [...traitCands(traitSlots), p.P >= G.massCost(p, 'MI') ? mass('MI') : null];
    else if (style === 'white') main = [...herdSlots, p.P >= G.massCost(p, 'MS') ? mass('MS') : null, ...st.shared.organField.filter(o => /^Cv/.test(o)).map(o => A({ type: 'organ', organ: o, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }))];
    else main = [p.P >= (G.breedCost(p) || 999) ? breed : null, mass('MB'), p.G >= 2 ? res('PB', 'P')[0] : null];
    const collect = [...pref.flatMap(r => [...resFor(r), ...cardsFor(r)]), ...resAll, ...cardsAny];
    // blue は形質を1枚買ってから宝石セット、他は宝石セットを先に（G＝得点化の出口）
    const mainFirst = style === 'blue' ? main.slice(0, 1) : [];
    const gte = R.gToE && p.G >= R.gToE[0] * 2 + 4 ? [A({ type: 'gToE', n: 2 })] : [];
    const adaptX = (style === 'red' && R.bodyAxis === 'L') ? null : adapt; // 生命核軸の赤は L を適応進化に使わない
    const collectX = (style === 'red' && R.bodyAxis === 'L') ? collect.filter(a => a && !a.useL) : collect;
    const plan = mainDone
      ? [...shield, ...endgame, ...scoreMode, ...gte, ...collectX, adaptX, mass('MM'), A({ type: 'reserve', res: p.G < 2 ? 'G' : 'E' })]
      : [...shield, ...endgame, ...mainFirst, st.round >= 2 && gemsetOk ? gemset : null, ...main, ...buyGem, ...gte, late ? breed : null, ...collectX, adaptX, mass('MM'), A({ type: 'convert', kind: 'PE', n: 1 }), A({ type: 'reserve', res: p.G < 2 ? 'G' : 'E' })];
    return first(st, plan.filter(Boolean));
  }

  // ---------- 貪欲評価型（greedy）：全候補を tryApply → 評価関数の最大を選ぶ。複数ルートを混ぜる「人間らしい」基準線 ----------
  const W = { E: 0.5, G: 0.7, P: 0.3, L: 1.5, gate: 1.0, coefFuture: 1.6, shield: 4, coop: 0.8, organ: 1.0, trait: 0.8, inc: 1.0 };
  function evaluate(st, p, w) {
    w = w || W; const sc = G.score(st, p); let v = sc.total;
    const RN = RSo(st).rounds || G.ROUNDS; const rem = RN - st.round; const k = rem / RN; // rem＝この後に残るラウンド数
    v += k * (p.E * w.E + p.G * w.G + p.P * w.P + p.L * w.L);
    if (RSo(st).lYield) v += p.L * rem * RSo(st).lYield * (p.yieldMul || 1) * w.E; // T5：保有Lは残ラウンド分の利回りを生む
    const le = RSo(st).lEndGem; if (le) v += Math.min(le.max, Math.floor(p.L / le.per)) * sc.cf * 2 * (rem === 0 ? 1 : 0.6); // T6 S2：終了時の保有L仮想宝石
    const cv6 = RSo(st).lv6Convert; const R6 = RSo(st); if ((R6.maxLv || 5) >= 6) { const cnt = { body: R6.lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: p.traits.length, social: p.coop, metab: p.organs.length }; const by6 = R6.lv6ConvertBy || {}; G.TRACKS.forEach(t => { const conv = cv6 ? Math.floor(cnt[t] / (by6[t] || cv6)) : 0; if (p.lv[t] >= 6) v += conv * sc.cf * 2 * (rem === 0 ? 1 : 0.7); else if (p.lv[t] === 5 && rem > 0) { const c6 = G.stepCost(p, t); if (c6 !== null) { const afford = Math.min(1, (p.E + p.L * (p.lValue || 3)) / c6); v += (1 + conv) * sc.cf * 2 * 0.35 * afford; } } }); } // T6 L6-A：Lv6 の宝石＋転換の見込み（Lv5 のトラックは E で届く分だけ先読み）
    const inc = G.income(p); v += rem * w.inc * (inc.E * w.E + inc.G * w.G + inc.P * w.P);
    if (RSo(st).gates) G.TRACKS.forEach(t => { const g = G.gateReq(p, t); if (!g || !g.need) return; const nl = p.lv[t] + 1; const val = (nl === 3 || nl === 5) ? sc.cf * 2 * (nl === 5 ? 1.6 : 1) : 4; const tw = w[t + 'Gate'] || 1; v += w.gate * tw * Math.min(1, g.have / g.need) * val * 0.6; });
    v += (sc.cf - 3) * rem * w.coefFuture;
    if (rem > 0) v += p.shields * w.shield;
    const R = RSo(st); const cb = R.coopBonusCap !== undefined ? Math.min(p.coop, R.coopBonusCap) : p.coop; v += rem * cb * w.coop;
    v += k * (p.organs.length * w.organ + p.traits.length * w.trait);
    // 得点に変換できる資源の潜在価値：P は大量消費(身体)（1宝石＝係数×2点）、G は宝石セット（1R1人）に化ける。残ラウンドがあるときだけ
    if (rem > 0) { const gemVal = sc.cf * 2; v += Math.min(2, Math.floor(p.P / Math.max(1, G.massCost(p, 'MB')))) * gemVal * 0.5; if (p.G >= G.gemsetPrice(p)) v += gemVal * 0.3; }
    return v;
  }
  function candidates(st, p) {
    const pid = p.id, A = (x) => Object.assign({ pid }, x); const out = [];
    const used = (s) => G.slotUsedBy(st, s) !== undefined;
    const byp = (base, slot) => { out.push(A(base)); if (used(slot)) { if (p.coop >= 2 && st.ext === 'x1') out.push(A(Object.assign({}, base, { bypassCoop: true }))); if (p.L > 0) out.push(A(Object.assign({}, base, { useL: true, bypassL: true }))); } };
    G.RES_SLOTS.concat(['PB']).forEach(s => { if (s === 'ALL') ['E', 'G', 'P'].forEach(r => byp({ type: 'res', slot: s, coopRes: r }, s)); else byp({ type: 'res', slot: s, coopRes: 'E' }, s); if (p.shields > 0 && s !== 'PB') ['E', 'G', 'P'].forEach(r => out.push(A({ type: 'res', slot: s, coopRes: r, shield: true }))); });
    const lFor = (cost, have) => Math.max(0, Math.min(p.L, Math.ceil((cost - have) / 3)));
    G.TRACKS.forEach(t => { const c = G.stepCost(p, t); if (c !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c, p.E) })); if (RSo(st).bodyBulkLv4 && p.L >= 2 && c >= 2 * (p.lValue || 3) && !p.lBulk) out.push(A({ type: 'track', track: t, pay: 'E', useL: 2 })); } });
    if (RSo(st).bodyBulkLv4 && p.L >= 2 && !p.lBulk) st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (c && c.E >= 2 * (p.lValue || 3)) out.push(A({ type: 'organ', organ: o, useL: 2, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); });
    out.push(A({ type: 'breed' })); if (RSo(st).breedE) out.push(A({ type: 'breed', pay: 'E' })); if (RSo(st).breedL) out.push(A({ type: 'breed', pay: 'L' }));
    if (RSo(st).massL) out.push(A({ type: 'mass', kind: 'MB', pay: 'L' }));
    if (RSo(st).crystal) ['E', 'G'].forEach(r => out.push(A({ type: 'crystal', res: r })));
    if (RSo(st).lCrystal) out.push(A({ type: 'lCrystal' }));
    if (RSo(st).coopCrystal) out.push(A({ type: 'coopCrystal' }));
    if (RSo(st).premium) G.PREMIUM_ORDER.filter(t => !G.trait(p, t)).forEach(t => out.push(A({ type: 'premium', trait: t, useL: 0 })));
    st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (!c) return; out.push(A({ type: 'organ', organ: o, useL: lFor(c.E, p.E), li2Res: p.G < 2 ? 'G' : 'E', li3Res: 'E', regimeRes: 'E' })); });
    const cheap2 = G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).slice(0, 2);
    ['MB', 'MI', 'MS', 'MM'].forEach(k => { out.push(A({ type: 'mass', kind: k, traits: cheap2 })); if (used(k) && p.bypassWide && p.L > 0) out.push(A({ type: 'mass', kind: k, traits: cheap2, bypassL: true })); });
    const tslots = [{}, { slot: 'TRT2' }]; if (used('TRT') || used('TRT2')) { if (p.coop >= 2 && st.ext === 'x1') tslots.push({ bypassCoop: true }); if (p.L > 0) tslots.push({ bypassL: true }); }
    G.TRAIT_ORDER.filter(t => !G.trait(p, t)).forEach(t => { const c = G.traitCost(st, p, t).G; tslots.forEach(sl => out.push(A(Object.assign({ type: 'trait', trait: t, useL: lFor(c, p.G), res: 'E', track: 'intel' }, sl)))); });
    out.push(A({ type: 'gemset', useL: lFor(G.gemsetPrice(p), p.G) })); if (used('GEM') && p.bypassWide && p.L > 0) out.push(A({ type: 'gemset', useL: 0, bypassL: true }));
    G.scanCandidates(st, p).slice(0, 2).forEach(tg => out.push(A({ type: 'scan', target: tg, useL: 0 })));
    G.TRACKS.filter(t => p.lv[t] === 1).forEach(t => out.push(A({ type: 'adapt', track: t })));
    ['EG', 'GE', 'PE', 'PG'].forEach(k => [1, 2].forEach(n => out.push(A({ type: 'convert', kind: k, n }))));
    out.push(A({ type: 'reserve', res: 'E' }), A({ type: 'reserve', res: 'G' }));
    if (RSo(st).gToE) [1, 2, 4].forEach(n => out.push(A({ type: 'gToE', n })));
    p.cards.forEach(c => { out.push(A({ type: 'card', card: c, choice: 'E' })); if (c === 'J') out.push(A({ type: 'card', card: c, choice: 'G' })); if (p.shields > 0) out.push(A({ type: 'card', card: c, choice: 'E', shield: true })); });
    ['St1', 'St2', 'St3'].forEach(o => { if (G.organ(p, o)) out.push(A({ type: 'stAct', organ: o, pe: 14, pg: 12 })); });
    return out;
  }
  function chooseGreedy(st, pid, w) {
    const p = st.players[pid]; const R = RSo(st);
    w = Object.assign({}, w || W); if (R.gToE) w.G = Math.max(w.G, w.E * R.gToE[1] / R.gToE[0]); // G→E変換があるならGはE換算以上の価値
    const isFree = (a) => a.shield || a.type === 'gToE' || a.type === 'freeConv';
    const base = evaluate(st, p, w);
    let best = null, bv = -Infinity, bestFree = null, bfv = base + 0.2;
    for (const a of candidates(st, p)) {
      let s2; try { s2 = G.tryApply(st, a); } catch (e) {
        // E不足で打てない手は、G→E変換（無料）を挟めば打てるか試す＝複合候補。成立すれば先に変換を返す
        if (R.gToE && a.type !== 'gToE' && p.G >= R.gToE[0] && /エネルギーが足りません/.test(e.message)) {
          const m = e.message.match(/必要E(\d+)・所持E(\d+)/); const need = m ? Math.max(1, Math.ceil((+m[1] - +m[2]) / R.gToE[1])) : 1;
          if (p.G >= need * R.gToE[0]) { try { const s1 = G.tryApply(st, { pid, type: 'gToE', n: need }); const s3 = G.tryApply(s1, a); const v = evaluate(s3, s3.players[pid], w); if (v > bv) { bv = v; best = { pid, type: 'gToE', n: need }; } } catch (e2) { /* 不成立 */ } }
        }
        continue;
      }
      const v = evaluate(s2, s2.players[pid], w);
      if (isFree(a)) { if (v > bfv) { bfv = v; bestFree = a; } } // 手番を消費しない手は「今の状態より良くなる」なら先に実行
      else if (v > bv) { bv = v; best = a; }
    }
    return bestFree || best;
  }

  // 色寄せ greedy：評価関数の重みを変えて専念させる（redG＝生命核/身体、greenG＝器官、blueG＝形質、whiteG＝協調）。台本の純ルートより「上手い専念者」に近い
  const BIAS = {
    redG: Object.assign({}, W, { L: 3.0, gate: 1.0, coefFuture: 2.0, organ: 0.3, trait: 0.3, coop: 0.3, bodyGate: 3.0 }),
    greenG: Object.assign({}, W, { organ: 3.0, trait: 0.3, coop: 0.3, L: 1.0, metabGate: 3.0 }),
    blueG: Object.assign({}, W, { trait: 3.0, organ: 0.3, coop: 0.3, L: 1.0, intelGate: 3.0 }),
    whiteG: Object.assign({}, W, { coop: 3.0, organ: 0.3, trait: 0.3, L: 1.0, socialGate: 3.0 }),
  };
  function choose(st, pid, style) {
    const p = st.players[pid];
    const pd = pending(st, p); if (pd) return pd;
    const gate = !!RSo(st).gates;
    style = style || (gate ? ['greedy', 'greenG', 'blueG', 'redG'][pid % 4] : STYLES[pid % 4]); // 画面のAI席：ゲート型では混合greedy＋色寄せ（純ルート台本は弱すぎるため）
    if (style === 'greedy') return chooseGreedy(st, pid);
    if (BIAS[style]) return chooseGreedy(st, pid, BIAS[style]);
    if (GATE_STYLES.includes(style)) return chooseGate(st, pid, style);
    return chooseClassic(st, pid, style);
  }
  G.Bot = { choose, evaluate, candidates, STYLES, GATE_STYLES, stylesFor: (st) => (RSo(st).gates ? GATE_STYLES : STYLES) };
})((typeof window !== 'undefined' ? window : globalThis).G1);
