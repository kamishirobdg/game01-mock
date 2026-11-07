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
  const cheapTraits = (st, p) => G.traitPool(st).filter(t => !G.trait(p, t)).sort((a, b) => G.traitCost(st, p, a).G - G.traitCost(st, p, b).G);
  const goodTraits = { tall: ['DB', 'DI', 'DV', 'IE', 'JB', 'JI'], wide: ['IE', 'IB', 'DV', 'IG'], gecon: ['IG', 'IB', 'DG', 'DI', 'IE', 'IP', 'DA', 'MC', 'IM', 'JI', 'DV'], breed: ['MB', 'IP', 'MC', 'DB', 'JB'] };

  function pending(st, p) {
    const pid = p.id, pd = p.pending[0]; if (!pd) return null;
    const R = (x) => Object.assign({ pid, type: 'resolve' }, x);
    switch (pd.type) {
      case 'freeMass': return first(st, [R({ kind: 'MB' }), R({ kind: 'MM' }), R({ kind: 'MS' })]);
      case 'rewardTrait': { if (pd.freeMax) { const RT = RSo(st); const el = G.traitPool(st).filter(t => !G.trait(p, t) && ((RT.traitCosts || {})[t] || G.TRAITS[t].cost)[0] <= pd.freeMax).sort((a, b) => ((RT.traitCosts || {})[b] || G.TRAITS[b].cost)[0] - ((RT.traitCosts || {})[a] || G.TRAITS[a].cost)[0]); return first(st, el.map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })])); } // T13 全転写：無料なので高い順
        return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })])); }
      case 'dgBuy': return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })]));
      case 'flSwap': return first(st, [p.E > p.G + G.sc(st, 4) ? R({ dir: 'EG', n: Math.min(pd.max, 2) }) : null, R({ skip: true })]);
      case 'cvIncome': return R({ res: p.E < G.sc(st, 6) ? 'E' : p.G < G.sc(st, 4) ? 'G' : 'P' });
      case 'lYield': { const pref = [p.E < G.sc(st, 6) ? 'E' : null, p.G < G.sc(st, 4) ? 'G' : null, 'E', 'G', 'P'].filter(Boolean).filter(r => pd.opts.includes(r)); return R({ res: pref[0] || pd.opts[0] }); }
      case 'wildColor': return R({ track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' });
      case 'learn': { const miss = G.TRACKS.find(t => p.gems[t] === 0); return first(st, [R({ kind: 'express', track: miss || 'body' }), R({ kind: 'mimic', effect: 'metab3w' }), R({ kind: 'mimic', effect: 'social3w' }), R({ kind: 'mimic', effect: 'intel2' }), R({ kind: 'mimic', effect: 'social2' }), R({ skip: true })]); }
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
    const wanted = goodTraits[style].filter(t => G.traitPool(st).includes(t) && !G.trait(p, t)).flatMap(traitBuy);
    const anyTrait = cheapTraits(st, p).map(t => A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel' }));
    const cards = p.cards.map(c => A({ type: 'card', card: c, choice: 'E' }));
    const res = (s) => A({ type: 'res', slot: s, coopRes: 'E', useL: false });
    const mass = (k) => A({ type: 'mass', kind: k, traits: G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RSo(st).miMaxCost || 4) && !G.trait(p, t)).slice(0, RSo(st).miCount || 2) });
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
    plan.push(res('E5'), res('ALL'), A({ type: 'reserve', res: p.G < G.sc(st, 2) ? 'G' : 'E' }));
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
    const res = (s, coopRes) => { const base = { type: 'res', slot: s, coopRes: coopRes || pref[0], useL: false }; return [A(base), p.coop >= (RSo(st).bypassCoopCost || 2) && st.ext === 'x1' && style !== 'white' ? A(Object.assign({}, base, { bypassCoop: true })) : null, p.L >= lMin ? A(Object.assign({}, base, { useL: true })) : null]; };
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
      return list.map(x => A({ type: 'organ', organ: x.o, useL: Math.max(0, Math.min(p.L, Math.ceil((x.c.E - p.E) / 3))), li2Res: p.G < G.sc(st, 2) ? 'G' : 'E', li3Res: 'E', regimeRes: 'E' }));
    };
    const traitPref = ['IE', 'IG', 'IB', 'IP', 'DA', 'MC', 'NP', 'NE', 'NS', 'DB', 'DI', 'IM', 'DV', 'DG', 'MB', 'JI', 'JB', 'NC', 'NL', 'NF', 'NB', 'NR', 'NM'].filter(t => G.traitPool(st).includes(t));
    const traitCands = (slots) => traitPref.filter(t => !G.trait(p, t)).flatMap(t => slots.map(sl => A(Object.assign({ type: 'trait', trait: t, useL: Math.max(0, Math.min(p.L, Math.ceil((G.traitCost(st, p, t).G - p.G) / 3))), res: pref[0], track: 'intel' }, sl))));
    const traitSlots = [{}, { slot: 'TRT2' }, p.coop >= 2 && style !== 'white' ? { bypassCoop: true } : null, p.L >= 2 ? { bypassL: true } : null].filter(Boolean);
    const mass = (k) => A({ type: 'mass', kind: k, traits: G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RSo(st).miMaxCost || 4) && !G.trait(p, t)).slice(0, RSo(st).miCount || 2) });
    const breed = A({ type: 'breed' }); const gemset = A({ type: 'gemset', useL: 0 });
    const herdSlots = herd ? [...res('EG', 'E'), ...res('GG', 'G')] : [];
    // Eでの先買い：Eが余っていれば（コスト+4）トラックを買う。宝石の段（Lv3/Lv5）が近いトラックを優先し、同じなら安い方
    const buyGem = G.TRACKS.filter(t => p.lv[t] < (R.maxLv || 5)).map(t => ({ t, c: G.stepCost(p, t), gem: (p.lv[t] + 1 === 3 || p.lv[t] + 1 === 5 || p.lv[t] + 1 === 6) ? 0 : 1 })).filter(x => x.c !== null && p.E >= x.c + 4).sort((a, b) => (a.gem - b.gem) || (a.c - b.c)).map(x => A({ type: 'track', track: x.t, pay: 'E', useL: 0 }));
    const adapt = A({ type: 'adapt', track: G.TRACKS.find(t => p.lv[t] === 1) || 'body' });
    const gemsetOk = p.G >= G.gemsetPrice(p) + 2;
    // 専念ルートの完了判定（主トラックがLv5、または収集対象が尽きた）→ 以後は得点化モード：余資源を宝石・係数・進行に変える
    const mainTrack = { green: 'metab', blue: 'intel', white: 'social', red: 'body' }[style];
    const exhausted = style === 'blue' ? G.traitPool(st).every(t => G.trait(p, t)) : style === 'green' ? st.shared.organField.every(o => G.organ(p, o)) : false;
    const mainDone = p.lv[mainTrack] >= 5 || exhausted;
    const canGemset = p.G >= G.gemsetPrice(p);
    const nextCoefTrait = (RSo(st).traitCoef || [4, 8]).includes(p.traits.length + 1) ? /* 2026-10-28：次の1枚が成熟度+1 になるとき（T8 は 3/6枚目） */ cheapTraits(st, p).slice(0, 3).map(t => A({ type: 'trait', trait: t, useL: 0, res: pref[0], track: 'intel' })) : [];
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
      // 生命核軸の赤：毎ラウンド L を1個だけ投入して身体を上げ（宝石の段に近いトラックの進行にLを充てる／使用済み枠の緊急発進／適応進化）、残りは利回りのために抱える。P≥大量消費なら痕跡
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
      ? [...shield, ...endgame, ...scoreMode, ...gte, ...collectX, adaptX, mass('MM'), A({ type: 'reserve', res: p.G < G.sc(st, 2) ? 'G' : 'E' })]
      : [...shield, ...endgame, ...mainFirst, st.round >= 2 && gemsetOk ? gemset : null, ...main, ...buyGem, ...gte, late ? breed : null, ...collectX, adaptX, mass('MM'), A({ type: 'convert', kind: 'PE', n: 1 }), A({ type: 'reserve', res: p.G < G.sc(st, 2) ? 'G' : 'E' })];
    return first(st, plan.filter(Boolean));
  }

  // ---------- 貪欲評価型（greedy）：全候補を tryApply → 評価関数の最大を選ぶ。複数ルートを混ぜる「人間らしい」基準線 ----------
  const W = { E: 0.5, G: 0.7, P: 0.3, L: 1.5, gate: 1.0, coefFuture: 1.6, shield: 4, coop: 0.8, organ: 1.0, trait: 0.8, inc: 1.0, breedFut: 0, breedProg: 0, plan: 1, deny: 1.5, uncrowded: 1.4, denyFinal: 0.5 }; // 2026-11-05 uncrowded＝序盤、他者が選んでいない主トラックのゲート重み（第53部の「未選択の戦略」を重みに反映）／denyFinal＝最終R、首位がまだ使える空き資源枠（祝福枠）を先に取る妨害の重み（deny に掛かる） // 2026-11-04 plan＝ラウンド単位の計画（1＝有効・--bw=plan=0 で旧 greedy）／deny＝終盤の妨害（首位が使える早取り枠を先に取る）の重み // 2026-11-02 breedFut＝繁栄度1段が「これから得る痕跡」に掛かる見込み／breedProg＝次の繁殖（P150／L3）へ貯める途中の価値。第47部：どちらも種族の計測を光翼に偏らせ（7R 混合で 光翼 58〜67%・万列 1〜11%）得点も上がらないため既定 0（--bw= で試せる）
  function evaluate(st, p, w) {
    w = w || W; const sc = G.score(st, p); let v = sc.total * (2 / (RSo(st).gemPt || 2)); // 2026-10-28：評価の点は gemPt=2 の尺度に正規化（T8 で ×2 を外しても AI の重みづけが変わらないように。以下の「×2」はこの尺度）
    const RN = RSo(st).rounds || G.ROUNDS; const rem = RN - st.round; const k = rem / RN; // rem＝この後に残るラウンド数
    v += k * (p.E * w.E + p.G * w.G + p.P * w.P + p.L * w.L);
    if (RSo(st).lYield) { const R5 = RSo(st); const rate = (R5.yieldByRound ? 1.5 : R5.lYield) + (p.yieldAdd || 0); v += p.L * rem * rate * (p.yieldMul || 1) * (R5.yieldRes === 'P' ? w.P : w.E); } // T5：保有Lは残ラウンド分の利回りを生む（資源別の重み）
    if (rem > 0) { const has = (id) => p.traits.some(t => t.id === id); // T7：効果が得点・資源の差分に出にくい形質の見込み
      if (has('NF')) v += Math.min(4, G.TRACKS.filter(t => p.lv[t] < 5).length) * sc.cfB * 2 * 0.25 * (rem / 7);
      if (has('NM')) v += rem * 2.5;
      if (has('NR') && RSo(st).nrMode === 'two' && !p.nrTwoLin) { const near = st.shared.lineages.filter(l => G.lineageCount(p, l) >= 1).length; v += Math.min(1, near) * rem * 1.6; } // T13：2 枚で完成（まだ使っていなければ、1 枚ある系統が近い）
      else if (has('NR') && (RSo(st).lineageCoefMax || 0) > 0) { const near = st.shared.lineages.filter(l => G.lineageCount(p, l) >= 1).length; v += Math.min(1, Math.max(0, near - 1)) * rem * 1.6; } }
    const tg = RSo(st).traitEndGem; if (tg && !st.ended) v += Math.floor(p.traits.length / tg) * sc.cfC * 2 * (rem === 0 ? 1 : 0.6); // 試作 traitEndGem
    const le = RSo(st).lEndGem; if (le) v += Math.min(le.max, Math.floor(p.L / le.per)) * sc.cfC * 2 * (rem === 0 ? 1 : 0.6); // T6 S2：終了時の保有L祝福
    const cv6 = RSo(st).lv6Convert; const R6 = RSo(st); if ((R6.maxLv || 5) >= 6) { const cnt = { body: R6.lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: p.traits.length, social: p.coop, metab: p.organs.length }; const by6 = R6.lv6ConvertBy || {}; G.TRACKS.forEach(t => { const conv = cv6 ? Math.floor(cnt[t] / (by6[t] || cv6)) : 0; if (p.lv[t] >= 6) v += conv * ((R6.lv6RealTracks || []).includes(t) ? sc.cfB : sc.cfC) * 2 * (rem === 0 ? 1 : 0.7); else if (p.lv[t] === 5 && rem > 0) { const c6 = G.stepCost(p, t); if (c6 !== null) { const afford = Math.min(1, (p.E + p.L * (p.lValue || 3)) / c6); v += (1 + conv) * sc.cfC * 2 * 0.35 * afford; } } }); } // T6 L6-A：Lv6 の宝石＋転換の見込み（Lv5 のトラックは E で届く分だけ先読み）
    const inc = G.income(p); v += rem * w.inc * (inc.E * w.E + inc.G * w.G + inc.P * w.P);
    // 2026-11-02 rem>0：最終ラウンドにはゲートの途中（届かない収集）へ価値を置かない（T8-H1：最終Rの形質・器官・資源枠の空振り）
    if (RSo(st).gates && rem > 0) G.TRACKS.forEach(t => { const g = G.gateReq(p, t); if (!g || !g.need) return; const nl = p.lv[t] + 1; const val = (nl === 3 || nl === 5) ? sc.cfB * 2 * (nl === 5 ? 1.6 : 1) : 4; const tw = w[t + 'Gate'] || 1; v += w.gate * tw * Math.min(1, g.have / g.need) * val * 0.6; });
    v += ((sc.cfB - 3) + (sc.cfC - 3)) / 2 * rem * w.coefFuture; // C2 では2本の平均（1本なら cf-3 と同値）
    // 2026-11-02 繁殖の方策（T8-H1：AI が一度も繁殖しない）：①繁栄度の1段は「これから得る痕跡」にも掛かる（自分の痕跡の歩調 × 残R）②次の段の支払い（P150／L3）へ貯める途中にも価値を置く（貯めずに大量消費(代謝)で P を崩すのを防ぐ）
    if (rem > 0 && RSo(st).breed) { const pace = Math.max(1, sc.real / Math.max(1, st.round - 1)); const fut = pace * rem; const bc = G.breedCost(p);
      v += (sc.cfB - (RSo(st).coef2 ? RSo(st).coef2.breedBase : 3)) * fut * 2 * w.breedFut * (RSo(st).gemPt === 1 ? 1 : 0.5);
      if (bc !== null) { const stepVal = (sc.real + fut) * 2 * (RSo(st).gemPt === 1 ? 1 : 0.5); const progP = Math.min(1, p.P / bc); const progL = RSo(st).breedL ? Math.min(1, p.L / RSo(st).breedL) : 0; v += Math.max(progP, progL) * stepVal * w.breedProg; } }
    if (rem > 0) v += p.shields * w.shield;
    if (p.round.resBoost > 1 && !st.ended) { const freeRes = G.RES_SLOTS.filter(s => G.slotUsedBy(st, s) === undefined).length; v += Math.min(p.left.W + p.left.AT, freeRes) * G.sc(st, 5) * (p.round.resBoost - 1) * w.E * 0.8; } // 第35部 神の加護：残りの手番で資源枠を使う見込み
    const R = RSo(st);
    if (R.coopMode === 'spend') { if (rem > 0) v += Math.min(p.coop, rem * 2) * (R.coopSpendGain || 3) * w.E * 0.6; } // K3：持っている協調＝あとで払える資源（即時より割り引く）
    else { let cb = R.coopBonusCap !== undefined ? Math.min(p.coop, R.coopBonusCap + (p.coopCapAdd || 0)) : p.coop; if (R.coopMode === 'tier') cb = p.coop >= 8 ? 3 : p.coop >= 4 ? 2 : p.coop >= 1 ? 1 : 0; if (R.coopMode === 'half') cb = p.coopRoundUp ? Math.ceil(cb / 2) : Math.floor(cb / 2); if (R.coopMode === 'third') cb = R.coopThirdRound ? Math.floor((cb + 1) / 3) : Math.floor(cb / 3); if (p.coopBonusAdd && p.coop > 0) cb += p.coopBonusAdd; if (R.coopBonusSlots) cb *= 0.5; v += rem * cb * w.coop; }
    v += k * (p.organs.length * w.organ + p.traits.length * w.trait);
    if (rem > 0) { // 将来の割引・資源を生む器官/形質の見込み（1ラウンドあたりの期待使用回数 × 割引・資源）
      const k1 = R.scale || 1; const lm = (lin, sv, wv) => { let m = 0; p.organs.forEach(o => { const d = G.ORGANS[o.id]; if (d && d.lin === lin) m = Math.max(m, (o.strong ? sv : wv)[d.tier - 1] * (o.amp ? 2 : 1)); }); return m * k1; }; // o.amp＝T10 増幅
      v += rem * 0.6 * lm('Tl', [2, 3, 4], [1, 2, 3]) * w.G; // 転写：形質 0.6枚/R
      if (R.organFx === 2) { v += rem * (0.9 + 0.6 + 0.3) * G.cxDisc(p, 'E') * w.E + rem * (0.6 + 0.6) * G.cxDisc(p, 'G') * w.G; } // T13 促進：E の支払い（進行 0.9＋器官 0.6＋共用盤 0.3 回/R）・G の支払い（形質 0.6＋器官 0.6 回/R）。連結は建造時の資源が評価に入るので見込みなし
      else { v += rem * 0.9 * lm('Cx', [1, 2, 3], [1, 1, 2]) * w.E; // 促進：進行 0.9回/R
        const li1 = G.organ(p, 'Li1'); if (li1) v += rem * 0.6 * (li1.strong ? 2 : 1) * k1 * w.E; const li2 = G.organ(p, 'Li2'); if (li2) v += rem * 0.6 * (li2.strong ? 3 : 2) * k1 * w.E; }
      const dv = G.trait(p, 'DV'); if (dv) v += rem * 0.9 * (dv.strong ? 2 : 1) * k1 * w.E; const dg = G.trait(p, 'DG'); if (dg) v += rem * 0.5 * (R.dgDisc ? R.dgDisc[dg.strong ? 0 : 1] : 2 * k1) * w.G;
      const mb = G.trait(p, 'MB'); if (mb && mb.strong && R.mbBreedDisc) v += Math.min(rem, (R.breed.length - p.breed)) * 0.5 * R.mbBreedDisc * k1 * w.P;
      // 2026-11-04 消費軽減（MC）の見込み：これまで評価に無く（形質1枚ぶんの重みだけ）、G15 の MC は G9 の形質に常に負けて 0.02 枚/戦しか買われなかった。大量消費 0.5回/R × 軽減 を残Rぶん。1回限り（弱／freeOnce の強）は 1回ぶん
      const mcT = G.trait(p, 'MC'); if (mcT) { const fo = R.mcMode === 'freeOnce'; const perm = fo ? (!mcT.strong ? (R.mcDiscWeak !== undefined ? R.mcDiscWeak : R.mcDisc) : 0) : (mcT.strong ? R.mcDisc : 0); v += rem * 0.5 * perm * w.P;
        const once = fo ? (mcT.strong && p.mcFree ? (R.mmCost ? (R.massCost + R.mmCost) / 2 : R.massCost) : 0) : p.next.mass; v += Math.min(1, rem * 0.5) * once * w.P; }
    }
    // 得点に変換できる資源の潜在価値：P は大量消費(身体)（1宝石＝係数×2点）、G は宝石セット（1R1人）に化ける。残ラウンドがあるときだけ
    if (rem > 0) { const gemValR = (RSo(st).massBodyVirtual ? sc.cfC : sc.cfB) * 2, gemValV = sc.cfC * 2; v += Math.min(2, Math.floor(p.P / Math.max(1, G.massCost(p, 'MB')))) * gemValR * 0.5; if (p.G >= G.gemsetPrice(p)) v += gemValV * 0.3; }
    return v;
  }
  function candidates(st, p) {
    const pid = p.id, A = (x) => Object.assign({ pid }, x); const out = [];
    const used = (s) => G.slotUsedBy(st, s) !== undefined;
    const byp = (base, slot) => { if (RSo(st).coopMode === 'spend' && p.coop >= 1 && slot !== 'PB') { const b2 = Object.assign({}, base, { coopSpend: true }); out.push(A(b2)); if (used(slot)) { if (p.L > 0) out.push(A(Object.assign({}, b2, { useL: true }))); } } out.push(A(base)); if (used(slot) && p.mimic && !p.round.mimicUsed) out.push(A(Object.assign({}, base, { bypassMimic: true }))); if (used(slot)) { if (p.coop >= (RSo(st).bypassCoopCost || 2) && st.ext === 'x1') out.push(A(Object.assign({}, base, { bypassCoop: true }))); if (p.L > 0) out.push(A(Object.assign({}, base, { useL: true, bypassL: true }))); } };
    { const fv = RSo(st).finalSlotVg; if (fv && fv.mode === 'choice' && st.round === (RSo(st).rounds || G.ROUNDS)) G.RES_SLOTS.forEach(s => byp({ type: 'res', slot: s, coopRes: 'E', vg: true }, s)); } // 試作 finalSlotVg：最終Rは資源の代わりに祝福
    G.RES_SLOTS.concat(['PB']).forEach(s => { if (s === 'ALL') ['E', 'G', 'P'].forEach(r => byp({ type: 'res', slot: s, coopRes: r }, s)); else byp({ type: 'res', slot: s, coopRes: 'E' }, s); if (p.shields > 0 && s !== 'PB') ['E', 'G', 'P'].forEach(r => out.push(A({ type: 'res', slot: s, coopRes: r, shield: true }))); });
    const lFor = (cost, have) => Math.max(0, Math.min(p.L, Math.ceil((cost - have) / (p.lValue || G.sc(st, 3)))));
    G.TRACKS.forEach(t => { const c = G.stepCost(p, t); if (c !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c, p.E) })); if (RSo(st).bodyBulkLv4 && p.L >= 2 && c >= 2 * (p.lValue || 3) && !p.lBulk) out.push(A({ type: 'track', track: t, pay: 'E', useL: 2 })); } });
    if (RSo(st).bodyBulkLv4 && p.L >= 2 && !p.lBulk) st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (c && c.E >= 2 * (p.lValue || 3)) out.push(A({ type: 'organ', organ: o, useL: 2, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); });
    out.push(A({ type: 'breed' })); if (RSo(st).breedE) out.push(A({ type: 'breed', pay: 'E' })); if (RSo(st).breedL) out.push(A({ type: 'breed', pay: 'L' }));
    if (RSo(st).massL) out.push(A({ type: 'mass', kind: 'MB', pay: 'L' }));
    if (RSo(st).crystal) ['E', 'G'].forEach(r => out.push(A({ type: 'crystal', res: r })));
    if (RSo(st).lCrystal) out.push(A({ type: 'lCrystal' }));
    if (RSo(st).coopCrystal) out.push(A({ type: 'coopCrystal' }));
    if (RSo(st).premium) G.PREMIUM_ORDER.filter(t => !G.trait(p, t)).forEach(t => out.push(A({ type: 'premium', trait: t, useL: 0 })));
    st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (!c) return; out.push(A({ type: 'organ', organ: o, useL: lFor(c.E, p.E), li2Res: p.G < G.sc(st, 2) ? 'G' : 'E', li3Res: 'E', regimeRes: 'E' })); { const AM = RSo(st).amplify; if (AM && !(p.uses && p.uses.amplify) && G.ampOk(st, o, false) && p.E >= c.E + (AM.E || 0)) out.push(A({ type: 'organ', organ: o, useL: 0, amp: true, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); } if (p.altFuel && p.P >= G.altFuelP(p, c.E) && (p.E < c.E || p.P >= G.altFuelP(p, c.E) + G.sc(st, 20))) out.push(A({ type: 'organ', organ: o, useL: 0, payP: true, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); }); // 第42部 N5 代替燃料：E 不足か P 余剰なら P 払いの候補
    const cheap2 = G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RSo(st).miMaxCost || 4) && !G.trait(p, t)).slice(0, RSo(st).miCount || 2);
    ['MB', 'MI', 'MS', 'MM'].forEach(k => { out.push(A({ type: 'mass', kind: k, traits: cheap2 })); if (used(k) && p.bypassWide && p.L > 0) out.push(A({ type: 'mass', kind: k, traits: cheap2, bypassL: true })); if (used(k) && G.coopBypassable(st, k, p) && p.coop >= (RSo(st).bypassCoopCost || 2)) out.push(A({ type: 'mass', kind: k, traits: cheap2, bypassCoop: true })); }); // bypassCoopWide：使用済みの大量消費を協調発進で
    const tslots = [{}, { slot: 'TRT2' }]; if (used('TRT') || used('TRT2')) { if (p.coop >= (RSo(st).bypassCoopCost || 2) && st.ext === 'x1') tslots.push({ bypassCoop: true }); if (p.L > 0) tslots.push({ bypassL: true }); }
    G.traitPool(st).filter(t => !G.trait(p, t)).forEach(t => { const tc = G.traitCost(st, p, t); const c = tc.G; tslots.forEach(sl => out.push(A(Object.assign({ type: 'trait', trait: t, useL: lFor(c, p.G), res: 'E', track: 'intel' }, sl)))); if (RSo(st).traitChoice && tc.strong) { const cw = G.traitCost(st, p, t, undefined, true).G; out.push(A({ type: 'trait', trait: t, useL: lFor(cw, p.G), res: 'E', track: 'intel', weak: true })); } }); // traitChoice：弱（安い）も候補に
    out.push(A({ type: 'gemset', useL: lFor(G.gemsetPrice(p), p.G) }));
    if (RSo(st).tributeBulk) { const bk = RSo(st).tributeBulk; out.push(A({ type: 'gemset', useL: lFor(Math.ceil(G.gemsetPrice(p) * bk.mult), p.G), bulk: true })); const T2 = RSo(st).tribute; if (T2 && st.round >= (T2.openRound || 6)) out.push(A({ type: 'tribute', res: 'E', bulk: true }), A({ type: 'tribute', res: 'P', bulk: true })); } // 試作 tributeBulk
    if (RSo(st).tributeAll) out.push(A({ type: 'tributeAll' })); // 試作 tributeAll
    { const T = RSo(st).tribute; if (T && st.round >= (T.openRound || 6)) { if (T.shared) out.push(A({ type: 'tribute', res: 'E' }), A({ type: 'tribute', res: 'P' })); G.tribSlots(st).forEach(sl => { const def = T.slots[sl]; if (!def) return; // 献上（第33部）・恩寵枠（第35部：この卓で開いている枠だけ）
      if (!def.kind) { if (def.real) { const miss = G.TRACKS.find(t => p.gems[t] === 0) || 'body'; out.push(A({ type: 'tributeSlot', slot: sl, track: miss })); } else out.push(A({ type: 'tributeSlot', slot: sl })); return; }
      if (def.kind === 'organ') { const bl = st.shared.organField.filter(o => G.organCost(st, p, o)); bl.forEach(o => { out.push(A({ type: 'tributeSlot', slot: sl, organ: o, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); if (def.half) { const lin = G.ORGANS[o].lin, tier = G.ORGANS[o].tier; const nxt = lin + (tier + 1); const second = (st.shared.organField.includes(nxt) ? [nxt] : []).concat(bl.filter(x => x !== o)); second.slice(0, 4).forEach(o2 => out.push(A({ type: 'tributeSlot', slot: sl, organ: o, organ2: o2, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }))); } }); return; }
      if (def.kind === 'trait') { const un = G.traitPool(st).filter(t => !G.trait(p, t)); const top = un.slice().sort((x, y) => G.baseTraitCost(st, y) - G.baseTraitCost(st, x)).slice(0, 5); un.forEach(t => out.push(A({ type: 'tributeSlot', slot: sl, traits: [t], useL: 0, res: 'E', track: 'intel' }))); if ((def.n || 2) >= 2) for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) out.push(A({ type: 'tributeSlot', slot: sl, traits: [top[i], top[j]], useL: 0, res: 'E', track: 'intel' })); return; }
      if (def.kind === 'alchemy') { const singles = []; G.TRACKS.forEach(f => { if (p.gems[f] < 1) return; G.TRACKS.forEach(t => { if (t !== f) singles.push({ from: f, to: t }); }); }); singles.forEach(c => out.push(A({ type: 'tributeSlot', slot: sl, changes: [c] }))); if ((def.n || 2) >= 2) { const need = new Set(); st.shared.combos.two.forEach(i => { const c = G.COMBOS2[i]; const miss = c.filter(t => p.gems[t] === 0); if (miss.length === 1) need.add(miss[0]); }); st.shared.combos.three.forEach(i => { const c = G.COMBOS3[i]; const miss = c.filter(t => p.gems[t] === 0); if (miss.length >= 1 && miss.length <= 2) miss.forEach(t => need.add(t)); }); const ns = singles.filter(c => need.has(c.to)); for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a1 = ns[i], a2 = ns[j]; if (a1.to === a2.to) continue; if (a1.from === a2.from && p.gems[a1.from] < 2) continue; if (a2.from === a1.to || a1.from === a2.to) continue; out.push(A({ type: 'tributeSlot', slot: sl, changes: [a1, a2] })); } } return; }
      if (def.kind === 'boost') { if (def.instant) G.RES_SLOTS.concat(['PB']).forEach(s => { if (s === 'ALL') ['E', 'G', 'P'].forEach(r => out.push(A({ type: 'tributeSlot', slot: sl, res: s, coopRes: r }))); else out.push(A({ type: 'tributeSlot', slot: sl, res: s, coopRes: 'E' })); }); else out.push(A({ type: 'tributeSlot', slot: sl })); return; }
      if (def.kind === 'leap') { const ok = G.TRACKS.filter(t => G.stepCost(p, t) !== null); ok.forEach((t1, i) => ok.forEach((t2, j) => { if (j < i) return; out.push(A({ type: 'tributeSlot', slot: sl, tracks: [t1, t2], useL: 0 })); })); return; }
    }); } }
    if (RSo(st).gSlots) { const mc = G.gSlotCost(p, RSo(st).mimicCost || 4), ec = G.gSlotCost(p, RSo(st).expressCost || 10); G.mimicOptions(st, p).forEach(e => out.push(A({ type: 'mimic', effect: e.id, useL: lFor(mc, p.G) }))); G.TRACKS.forEach(t => { out.push(A({ type: 'express', track: t, useL: lFor(ec, p.G) })); if (used('EXP') && G.coopBypassable(st, 'EXP', p) && p.coop >= (RSo(st).bypassCoopCost || 2)) out.push(A({ type: 'express', track: t, useL: lFor(ec, p.G), bypassCoop: true })); }); } if (used('GEM') && p.bypassWide && p.L > 0) out.push(A({ type: 'gemset', useL: 0, bypassL: true }));
    G.scanCandidates(st, p).slice(0, 2).forEach(tg => out.push(A({ type: 'scan', target: tg, useL: 0 })));
    if (!RSo(st).noAdapt) G.TRACKS.filter(t => p.lv[t] === 1).forEach(t => out.push(A({ type: 'adapt', track: t })));
    if (!RSo(st).noConvert) ['EG', 'GE', 'PE', 'PG'].forEach(k => [1, 2].forEach(n => out.push(A({ type: 'convert', kind: k, n }))));
    if (!RSo(st).noReserve) out.push(A({ type: 'reserve', res: 'E' }), A({ type: 'reserve', res: 'G' })); else if (RSo(st).gather) ['E', 'G', 'P', 'coop'].forEach(r => out.push(A({ type: 'gather', res: r }))); else out.push(A({ type: 'pass' })); // v3.65 採集（パスの置き換え）
    // T10（第59部）：復元（他者が強で取った形質を強で）・増幅（器官1つを2倍）・二段進行
    if (RSo(st).restore && !(p.uses && p.uses.restore)) G.traitPool(st).filter(t => st.shared.traitFirst[t] !== undefined && st.shared.traitFirst[t] !== p.id && !G.trait(p, t)).forEach(t => out.push(A({ type: 'restore', trait: t, useL: 0, res: 'E', track: 'intel' })));
    if (RSo(st).amplify && !(p.uses && p.uses.amplify)) p.organs.filter(o => G.ampOk(st, o.id, true) && !o.amp).forEach(o => out.push(A({ type: 'amplify', organ: o.id })));
    if (RSo(st).doubleStep) G.TRACKS.forEach(t => { const c2 = G.stepCostDouble(p, t); if (c2 !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0, steps: 2 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c2, p.E), steps: 2 })); } });
    if (RSo(st).gToE) [1, 2, 4].forEach(n => out.push(A({ type: 'gToE', n })));
    p.cards.forEach(c => { out.push(A({ type: 'card', card: c, choice: 'E' })); if (c === 'J') out.push(A({ type: 'card', card: c, choice: 'G' })); if (p.shields > 0) out.push(A({ type: 'card', card: c, choice: 'E', shield: true })); });
    ['St1', 'St2', 'St3'].forEach(o => { if (G.organ(p, o)) out.push(A({ type: 'stAct', organ: o, pe: 14, pg: 12 })); });
    return out;
  }
  function chooseGreedy(st, pid, w) {
    const p = st.players[pid]; const R = RSo(st);
    // 2026-11-04 ラウンド単位の計画（ユーザー採用・第53部）：方策の重み指定（色寄せ）が無い greedy は、局面から「今 R の狙い」を決めて評価の重みに反映する。手番ごとに読み直す（相手の先取りに追従）
    const plan = (!w && W.plan) ? planFor(st, p) : null; if (plan) G.Bot.lastPlan = plan;
    w = Object.assign({}, w || W, plan ? plan.w : {}); { const k = R.scale || 1; if (k !== 1) ['E', 'G', 'P'].forEach(r => { w[r] = w[r] / k; }); } // 資源の規模に合わせて1個あたりの価値を下げる
    if (R.gToE) w.G = Math.max(w.G, w.E * R.gToE[1] / R.gToE[0]); // G→E変換があるならGはE換算以上の価値
    const isFree = (a) => a.shield || a.type === 'gToE' || a.type === 'freeConv';
    const base = evaluate(st, p, w);
    let best = null, bv = -Infinity, bestFree = null, bfv = base + 0.2, ties = 0; // ties：最良値と同点の候補数（検証用 G.TIES）
    for (const a of candidates(st, p)) {
      let s2; try { s2 = G.tryApply(st, a); } catch (e) {
        // E不足で打てない手は、G→E変換（無料）を挟めば打てるか試す＝複合候補。成立すれば先に変換を返す
        if (R.gToE && a.type !== 'gToE' && p.G >= R.gToE[0] && /エネルギーが足りません/.test(e.message)) {
          const m = e.message.match(/必要E(\d+)・所持E(\d+)/); const need = m ? Math.max(1, Math.ceil((+m[1] - +m[2]) / R.gToE[1])) : 1;
          if (p.G >= need * R.gToE[0]) { try { const s1 = G.tryApply(st, { pid, type: 'gToE', n: need }); const s3 = G.tryApply(s1, a); const v = evaluate(s3, s3.players[pid], w); if (v > bv) { bv = v; best = { pid, type: 'gToE', n: need }; } } catch (e2) { /* 不成立 */ } }
        }
        continue;
      }
      let v = evaluate(s2, s2.players[pid], w); if (a.type === 'pass') v -= 1; // パスは最後の手段
      if (plan && plan.denyPid !== undefined) v += denyBonus(st, a, st.players[plan.denyPid]) * (W.deny || 0); // 終盤：首位が使える早取り枠を先に取る
      if (isFree(a)) { if (v > bfv) { bfv = v; bestFree = a; } } // 手番を消費しない手は「今の状態より良くなる」なら先に実行
      else if (v > bv) { bv = v; best = a; ties = 1; } else if (v === bv) ties++;
    }
    if (G.TIES) { G.TIES.n++; G.TIES.sum += ties; if (ties > 1) G.TIES.tied++; }
    // 2026-11-02 最終ラウンドの2手読み（T8-H1：最終Rに得点にならない資源枠が 1.2 手/人）：1手では得点が増えないとき、「資源を得る手 → 得点になる手」の組み合わせを試し、最良の初手を選ぶ（手番が2つ以上残っているときだけ）
    const RN = R.rounds || G.ROUNDS;
    if (st.round === RN && bv <= base + 1e-9 && (p.left.W + p.left.AT) >= 2) {
      const SETUP = (a) => a.type === 'res' || a.type === 'convert' || a.type === 'gToE' || a.type === 'card' || a.type === 'scan' || (a.type === 'tributeSlot' && a.res);
      const SCORE = (a) => ['breed', 'tribute', 'tributeAll', 'tributeSlot', 'track', 'mass', 'trait', 'organ', 'gemset', 'lCrystal', 'coopCrystal', 'express', 'premium', 'crystal'].includes(a.type);
      let b2 = null, b2v = base + 1e-9;
      for (const a1 of candidates(st, p).filter(SETUP)) { let s1; try { s1 = G.tryApply(st, a1); } catch (e) { continue; }
        const p1 = s1.players[pid]; for (const a2 of candidates(s1, p1).filter(SCORE)) { let s2; try { s2 = G.tryApply(s1, a2); } catch (e) { continue; } const v = evaluate(s2, s2.players[pid], w); if (v > b2v) { b2v = v; b2 = a1; } } }
      if (b2) return bestFree || b2;
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
  // ---------- ラウンド単位の計画（2026-11-04 ユーザー採用）----------
  // 局面（残R・自分のゲートの進み・種族・他者の主戦略・収入・首位との差）から「今 R の狙い」を決め、評価の重みの上書きで表す。
  //   序盤：ゲート達成（主トラック＝ゲートの進みが大きく・種族に合い・他者が選んでいないもの）／収入の最大化（収入が卓の平均以下なら）／他者が選んでいない戦略を優先
  //   中盤：次Rの得点化の準備（繁栄度・成熟度の先・繁殖への貯金・Lv6 の支払い）／競合に備えて2本目のトラックも進める
  //   終盤：最大限の得点化（資源の重みを下げて得点へ）／首位と競っているときは妨害（首位が使える早取り枠を先に取る）
  const FOCUS_W = { metab: { organ: 1.8, metabGate: 2.5 }, intel: { trait: 1.5, intelGate: 2.5 }, social: { coop: 1.5, socialGate: 2.5 }, body: { L: 2.2, bodyGate: 2.5 } };
  const AFFINITY = { wing: 'body', arm: 'intel', ant: 'social', manta: 'metab' };
  function focusOf(q) { let best = null, bv = -1; G.TRACKS.forEach(t => { const g = G.gateReq(q, t); const v = (g ? g.have / Math.max(1, g.need) : 1) + q.lv[t] * 0.1; if (v > bv) { bv = v; best = t; } }); return best; }
  function phaseOf(st) { const RN = RSo(st).rounds || G.ROUNDS; const rem = RN - st.round; return rem / RN > 0.5 ? 'early' : rem >= 2 ? 'mid' : 'late'; } // 7R：R1〜3／R4〜5／R6〜7、5R：R1〜2／R3／R4〜5
  function planFor(st, p) {
    const phase = phaseOf(st); const crowd = {}; G.TRACKS.forEach(t => { crowd[t] = 0; });
    st.players.filter(q => q.id !== p.id && q.species).forEach(q => { crowd[focusOf(q)] += 1; });
    const aff = AFFINITY[p.species]; const sc = {};
    G.TRACKS.forEach(t => { const g = G.gateReq(p, t); const prog = g ? g.have / Math.max(1, g.need) : 1; sc[t] = prog + (p.lv[t] >= 5 ? -1 : 0) + (aff === t ? 0.25 : 0) - 0.3 * crowd[t] + p.lv[t] * 0.05; });
    const order = G.TRACKS.slice().sort((a, b) => sc[b] - sc[a]); const primary = order[0], secondary = order[1];
    const w = {}; const goals = []; const out = { phase, primary, secondary, goals, w };
    if (phase === 'early') {
      goals.push('gate:' + primary); Object.assign(w, FOCUS_W[primary]);
      const incV = (i) => i.E + 1.5 * i.G + 0.6 * i.P; const mine = incV(G.income(p)); const avg = st.players.reduce((a, q) => a + incV(G.income(q)), 0) / st.players.length;
      if (mine <= avg) { goals.push('income'); w.inc = 1.6; w.organ = Math.max(w.organ || 1, 1.4); }
      if (crowd[primary] === 0) { goals.push('uncrowded'); w[primary + 'Gate'] = (w[primary + 'Gate'] || 1) * (W.uncrowded || 1); } // 2026-11-05：他者が選んでいない主トラックは先着（★の強報酬・Lv6 の祝福）を取りやすいので、ゲートの重みを上げる
    } else if (phase === 'mid') {
      goals.push('prepare'); Object.assign(w, FOCUS_W[primary]); w.coefFuture = 2.0; w.breedProg = 0.6;
      goals.push('diverse:' + secondary); w[secondary + 'Gate'] = 1.6;
    } else {
      goals.push('cash'); w.E = 0.3; w.G = 0.45; w.P = 0.2;
      const others = st.players.filter(q => q.id !== p.id); if (others.length) { const lead = others.slice().sort((a, b) => G.score(st, b).total - G.score(st, a).total)[0]; const my = G.score(st, p).total; if (G.score(st, lead).total >= my - 10) { goals.push('deny'); out.denyPid = lead.id; } }
    }
    return out;
  }
  // 妨害ボーナス：首位（lead）が今すぐ使える早取り枠（大量消費・強の形質・恩寵枠）を自分が取る手に +1
  function denyBonus(st, a, lead) {
    if (!lead) return 0;
    if (a.type === 'mass') return lead.P >= G.massCost(lead, a.kind) ? 1 : 0;
    if (a.type === 'trait' && !a.weak) { const tc = G.traitCost(st, lead, a.trait); return tc && tc.strong && lead.G >= tc.G ? 1 : 0; }
    if (a.type === 'tributeSlot') return 1;
    if (a.type === 'gemset') return lead.G >= G.gemsetPrice(lead) ? 0.5 : 0;
    { const RN = RSo(st).rounds || G.ROUNDS; const fv = RSo(st).finalSlotVg; if (fv && st.round === RN && a.type === 'res' && !a.bypassL && !a.bypassCoop && !a.shield && (lead.left.W + lead.left.AT) > 0 && G.slotUsedBy(st, a.slot) === undefined) return (W.denyFinal || 0); } // 2026-11-05：最終Rの祝福枠（空いている資源枠＝祝福+1）を首位より先に埋める
    return 0;
  }
  // ---------- ビーム探索（R 内・自分の手だけ深読み・相手は 1 手読み＋計画で代打ち）----------
  // BEAM.depth＝自分の手数（1＝従来の 1 手読み）、BEAM.k＝各段で残す候補数。観測用 `--depth=3 --beam=3`。画面の AI は depth 1 のまま
  const BEAM = { depth: 1, k: 3 }; let inSearch = false;
  function settle(s, pid) { let g = 0; while (!s.ended && G.cur(s).id === pid && s.players[pid].pending[0] && g++ < 8) { const a = pending(s, s.players[pid]); if (!a) break; try { s = G.tryApply(s, a); } catch (e) { break; } } return s; }
  function simOthers(s, pid) { const r0 = s.round; let g = 0; while (!s.ended && s.round === r0 && G.cur(s).id !== pid && g++ < 60) { const q = G.cur(s).id; const a = choose(s, q, 'greedy'); if (!a) break; try { s = G.tryApply(s, a); } catch (e) { break; } } return s; }
  function chooseBeam(st, pid) {
    const p0 = st.players[pid]; const R = RSo(st);
    const plan = W.plan ? planFor(st, p0) : null; if (plan) G.Bot.lastPlan = plan;
    const w = Object.assign({}, W, plan ? plan.w : {}); { const k = R.scale || 1; if (k !== 1) ['E', 'G', 'P'].forEach(r => { w[r] = w[r] / k; }); }
    const K = BEAM.k, depth = BEAM.depth; inSearch = true;
    try {
      let frontier = [];
      for (const a of candidates(st, p0)) { let s2; try { s2 = G.tryApply(st, a); } catch (e) { continue; } s2 = settle(s2, pid); frontier.push({ first: a, st: s2, v: evaluate(s2, s2.players[pid], w) + (plan && plan.denyPid !== undefined ? denyBonus(st, a, st.players[plan.denyPid]) * (W.deny || 0) : 0), done: false }); }
      if (!frontier.length) return null;
      frontier.sort((x, y) => y.v - x.v); frontier = frontier.slice(0, K);
      for (let d = 2; d <= depth; d++) {
        const next = [];
        for (const node of frontier) {
          if (node.done) { next.push(node); continue; }
          const s1 = simOthers(node.st, pid);
          if (s1.ended || s1.round !== st.round || G.cur(s1).id !== pid) { next.push({ first: node.first, st: s1, v: evaluate(s1, s1.players[pid], w), done: true }); continue; }
          const p1 = s1.players[pid]; let any = false;
          for (const a of candidates(s1, p1)) { let s2; try { s2 = G.tryApply(s1, a); } catch (e) { continue; } any = true; s2 = settle(s2, pid); next.push({ first: node.first, st: s2, v: evaluate(s2, s2.players[pid], w), done: false }); }
          if (!any) next.push({ first: node.first, st: s1, v: evaluate(s1, s1.players[pid], w), done: true });
        }
        next.sort((x, y) => y.v - x.v); frontier = next.slice(0, K);
      }
      return frontier[0].first;
    } finally { inSearch = false; }
  }
  function choose(st, pid, style) {
    const p = st.players[pid];
    const pd = pending(st, p); if (pd) return pd;
    const gate = !!RSo(st).gates;
    style = style || (gate ? ['greedy', 'greenG', 'blueG', 'redG'][pid % 4] : STYLES[pid % 4]); // 画面のAI席：ゲート型では混合greedy＋色寄せ（純ルート台本は弱すぎるため）
    if (style === 'greedy') return (BEAM.depth > 1 && !inSearch) ? chooseBeam(st, pid) : chooseGreedy(st, pid);
    if (BIAS[style]) return chooseGreedy(st, pid, BIAS[style]);
    if (GATE_STYLES.includes(style)) return chooseGate(st, pid, style);
    return chooseClassic(st, pid, style);
  }
  G.Bot = { choose, evaluate, candidates, STYLES, GATE_STYLES, W, BIAS, BEAM, planFor, lastPlan: null, stylesFor: (st) => (RSo(st).gates ? GATE_STYLES : STYLES) }; // W/BIAS は test/observe.js の --bw= で一時上書き
})((typeof window !== 'undefined' ? window : globalThis).G1);
