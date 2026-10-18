/* 簡易AI（ソロ検証用）。desk_sim.py の台本（Tall/Wide/GEcon/Breed）を移植した貪欲方策＋共通の後処理。
   choose(st, pid, style) → 実行可能なアクション（G.tryApply で検証済み）を1つ返す。 */
(function (G) {
  'use strict';
  const STYLES = ['tall', 'wide', 'gecon', 'breed'];
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
      case 'cvIncome': return R({ res: p.E < 6 ? 'E' : 'G' });
      case 'wildColor': return R({ track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' });
      case 'reMilestone': { const m = G.reachedMilestones(p); const best = m.find(x => x.lv === 5) || m[0]; return R({ track: best.track, lv: best.lv }); }
      case 'bonusAction': return first(st, G.TRACKS.map(t => ({ pid, type: 'track', track: t, pay: 'E', useL: 0 })).concat(st.shared.organField.map(o => ({ pid, type: 'organ', organ: o, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })), [{ pid, type: 'convert', kind: 'EG', n: 1 }, { pid, type: 'reserve', res: 'E' }, R({ skip: true })]));
    }
    return null;
  }

  function choose(st, pid, style) {
    const p = st.players[pid]; style = style || STYLES[pid % 4];
    const pd = pending(st, p); if (pd) return pd;
    const A = (x) => Object.assign({ pid }, x);
    const last = st.round >= G.ROUNDS;
    const track = (t, pay) => A({ type: 'track', track: t, pay: pay || 'E', useL: Math.min(p.L, 3) });
    const organs = st.shared.organField.map(o => A({ type: 'organ', organ: o, useL: Math.min(p.L, 2), li2Res: 'E', li3Res: 'E', regimeRes: 'G' }));
    const wanted = goodTraits[style].filter(t => !G.trait(p, t)).map(t => A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel' }));
    const anyTrait = cheapTraits(st, p).map(t => A({ type: 'trait', trait: t, useL: 0, res: 'E', track: 'intel' }));
    const cards = p.cards.map(c => A({ type: 'card', card: c, choice: 'E' }));
    const res = (s) => A({ type: 'res', slot: s, coopRes: 'E', useL: false });
    const mass = (k) => A({ type: 'mass', kind: k, traits: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).slice(0, 2) });
    const breed = A({ type: 'breed' }); const gemset = A({ type: 'gemset', useL: 0 });
    const adapt = A({ type: 'adapt', track: G.TRACKS.find(t => p.lv[t] === 1) || 'body' });
    const needE = (t) => { const c = G.stepCost(p, t); return c !== null && p.E + p.L * 3 < c; };
    // 最終ラウンド：得点に直結するものを優先
    const endgame = last ? [mass('MB'), gemset, ...anyTrait, breed, mass('MS')] : [];
    let plan = [];
    if (style === 'tall') {
      const prog = [...['body', 'intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab'].filter(t => p.lv[t] < 3).map(t => track(t))];
      const incomeFirst = (p.lv.body < 5 && needE('body')) ? [res('E5'), res('EG'), ...cards.filter(c => 'ADQCK'.includes(c.card))] : [];
      plan = [...endgame, ...incomeFirst, ...prog, adapt, breed, ...wanted.slice(0, 2), res('E5'), ...cards, res('EG'), res('ALL'), mass('MB'), ...G.TRACKS.filter(t => p.lv[t] < 5).map(t => track(t)), ...anyTrait];
    } else if (style === 'wide') {
      const needG = p.G < 1 ? [A({ type: 'convert', kind: 'EG', n: 1 }), res('G3'), ...cards.filter(c => 'BCQ'.includes(c.card))] : [];
      plan = [...endgame, ...organs, ...needG, ...['body', 'intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, breed, res('E5'), ...cards, res('ALL'), ...wanted.slice(0, 2), A({ type: 'convert', kind: 'PE', n: 1 }), mass('MB')];
    } else if (style === 'gecon') {
      plan = [...endgame, gemset, ...wanted, mass('MI'), ...['intel'].filter(t => p.lv[t] < 5).map(t => track(t, 'G')), ...['intel'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['social', 'metab', 'body'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, res('G3'), ...cards, res('GG'), A({ type: 'convert', kind: 'PG', n: 1 }), A({ type: 'convert', kind: 'EG', n: 2 }), ...anyTrait, breed];
    } else {
      plan = [...endgame, ...wanted.slice(0, 1), breed, mass('MB'), ...['body'].filter(t => p.lv[t] < 5).map(t => track(t, 'P')), ...['body'].filter(t => p.lv[t] < 5).map(t => track(t)), ...['metab', 'social', 'intel'].filter(t => p.lv[t] < 3).map(t => track(t)), adapt, res('P8'), ...cards, A({ type: 'convert', kind: 'PG', n: 1 }), res('ALL'), mass('MM'), ...anyTrait];
    }
    plan.push(res('E5'), res('ALL'), A({ type: 'reserve', res: p.G < 2 ? 'G' : 'E' }));
    return first(st, plan.filter(Boolean));
  }
  G.Bot = { choose, STYLES };
})((typeof window !== 'undefined' ? window : globalThis).G1);
