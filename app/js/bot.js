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
      case 'join': { // T19（O-13 #2）合流進出：得たその場で、いちばん評価の高い資源枠に使う（評価の作り込みはしない）
        const opts = G.RES_SLOTS.concat(['PB']).flatMap(s => s === 'ALL' ? ['E', 'G', 'P'].map(r => R({ slot: s, coopRes: r })) : [R({ slot: s, coopRes: 'E' })]);
        let best = null, bv = -Infinity; opts.forEach(a => { try { const s2 = G.tryApply(st, a); const v = evaluate(s2, s2.players[pid], W); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best || R({ skip: true }); }
      case 'rewardTrait': { if (!pd.freeMax && p.nextTraitFree && W.rtFree) { // 2026-11-09 O-09：知性 Lv3★（T10 以降）＝次の形質は弱なら無料・強は差額。弱（無料）も候補に入れ、評価＋形質の値打ち（弱の定価＋強の上乗せ分×rtStrong）で選ぶ
          const RT = RSo(st), ws = scaledW(st), price = (t) => ((RT.traitCosts || {})[t] || G.TRAITS[t].cost); const opts = [];
          G.traitPool(st).filter(t => !G.trait(p, t)).forEach(t => { const pr = price(t); if (G.traitCost(st, p, t).strong) opts.push({ a: R({ trait: t, res: 'E', track: 'body' }), mv: pr[1] + (pr[0] - pr[1]) * W.rtStrong }); opts.push({ a: R({ trait: t, res: 'E', track: 'body', weak: true }), mv: pr[1] }); });
          let best = null, bv = -Infinity; opts.forEach(o => { try { const s2 = G.tryApply(st, o.a); const v = evaluate(s2, s2.players[pid], ws) + o.mv * ws.G * W.rtFree; if (v > bv) { bv = v; best = o.a; } } catch (e) {} }); if (best) return best; }
        if (pd.freeMax) { const RT = RSo(st); const wi = pd.weakOnly ? 1 : 0; const el = G.traitPool(st).filter(t => !G.trait(p, t) && ((RT.traitCosts || {})[t] || G.TRAITS[t].cost)[wi] <= pd.freeMax).sort((a, b) => ((RT.traitCosts || {})[b] || G.TRAITS[b].cost)[wi] - ((RT.traitCosts || {})[a] || G.TRAITS[a].cost)[wi]); /* T14 転写腺（weakOnly）＝弱の値段で */ return first(st, el.map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })])); } // T13 転写核：無料なので高い順
        return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })])); }
      case 'starJump': case 'prStar': case 'prJump': { // prJump＝T42（O-76）遊泳核＝星渡と同じ払い方 // T27（O-27）：星渡の片方払い・遊泳核の手番なしの進化＝候補を試して評価が最も高いもの
        const opts = []; const s0 = p.star | 0;
        if (pd.type === 'starJump' || pd.type === 'prJump') { const lv = G.starJumpLv(st, p); G.starJumpOpts(st, p).forEach(o => { opts.push(R({ res: o.res })); if (lv && G.starProsOk(st, p, lv)) opts.push(R({ res: o.res, pros: [lv] })); }); }
        else [1, 2].forEach(n => { if (s0 + n > G.STAR_MAX || (n > 1 && (RSo(st).star || {}).top && s0 + n >= G.STAR_MAX && !G.multiTop(p)) || (n === 2 && !RSo(st).doubleStep)) return; const lvs = []; for (let l = s0 + 1; l <= s0 + n; l++) lvs.push(l); opts.push(R({ steps: n })); const pr = starPros(st, p, lvs); if (pr) opts.push(R({ steps: n, pros: pr })); });
        opts.push(R({ skip: true })); let best = null, bv = -Infinity; opts.forEach(a => { try { const s2 = G.tryApply(st, a); const v = evaluate(s2, s2.players[pid], W); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best || opts[opts.length - 1]; }
      case 'specialOrgan': case 'fkBreed': { // T15：特殊器官の選択・孵化核の繁殖（手番なし）＝候補を試して評価が最も高いもの
        const opts = pd.type === 'specialOrgan' ? (st.shared.special || []).map(o => R({ organ: o })) : [R({ nP: 1, nL: 1 }), R({ nP: 1, nL: 0 }), R({ nP: 0, nL: 1 }), R({ skip: true })];
        const spOn = pd.type === 'specialOrgan' && W.spPick && RSo(st).spInc; const wv = spOn ? scaledW(st) : W; // 2026-11-09 O-09：特殊器官は「残り収入回数 × 収入の E 換算 × 器官枚数の見込み」で選ぶ（同点は評価）。旧＝規模で割らない W の評価（E を 3 倍に見て E 系に偏り、交信腔 0.05/戦）
        let best = null, bv = -Infinity; opts.forEach(a => { try { const s2 = G.tryApply(st, a); const v = (spOn ? spIncomeE(st, p, a.organ) * W.spPick * 1e3 : 0) + evaluate(s2, s2.players[pid], wv); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best || opts[opts.length - 1]; }
      case 'mutate': { // O-38 計測のみ：返す＝効果を受け終えた即時の形質（群居・長命・星渡）→ 無ければ定価の最も低い形質／受け取る＝持っていない形質のうち、実行後の評価が最も高いもの。見送りより評価が上がらなければ見送る
        const RT = RSo(st), pr = (t) => ((RT.traitCosts || {})[t] || G.TRAITS[t].cost)[0]; const mo = G.mutOpts(st, p); const inst = mo.give.filter(t => ['NC', 'NL', 'JS'].includes(t)); const give = (inst.length ? inst : mo.give.slice()).sort((a, b) => pr(a) - pr(b))[0];
        const opts = [R({ skip: true })].concat(give ? mo.take.filter(t => t !== give).map(t => R({ give, take: t })) : []); let best = null, bv = -Infinity; opts.forEach(a => { try { const s2 = G.tryApply(st, a); const v = evaluate(s2, s2.players[pid], W); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best || R({ skip: true }); }
      case 'flip': { // O-36 計測のみ intelFlip：裏返せる形質のうち「強の定価−弱の定価」が大きい順に pd.n 枚まで（耐性 MC は裏返さない）。対象が無ければ見送り（G）
        const RT = RSo(st), pr = (t) => ((RT.traitCosts || {})[t] || G.TRAITS[t].cost); const el = G.flippable(p).filter(t => t !== 'MC').sort((a, b) => (pr(b)[0] - pr(b)[1]) - (pr(a)[0] - pr(a)[1]));
        return first(st, [el.length ? R({ traits: el.slice(0, pd.n) }) : null, R({ skip: true })]); }
      case 'dgBuy': return first(st, cheapTraits(st, p).map(t => R({ trait: t, res: 'E', track: 'body' })).concat([R({ skip: true })]));
      case 'flSwap': return first(st, [p.E > p.G + G.sc(st, 4) ? R({ dir: 'EG', n: Math.min(pd.max, 2) }) : null, R({ skip: true })]);
      case 'diIncome': { const D = RSo(st).diPay || {}; const e = !!G.organ(p, 'Di1') && D.Di1 && p.P - D.Di1.P >= 30; const g = !!G.organ(p, 'Di2') && D.Di2 && p.P - (e ? D.Di1.P : 0) - D.Di2.P >= 30; return R({ e, g }); } // T49（O-91）消化：払っても P が 30 以上残るなら払う（消化膜が先）
      case 'molt': { const opts = []; for (let n = 0; n <= pd.max; n++) opts.push(R({ n })); let best = opts[0], bv = -Infinity; opts.forEach(a => { try { const s2 = G.tryApply(st, a); const v = evaluate(s2, s2.players[pid], W); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best; } // T51（O-99）脱皮：払う回数 0〜上限を試して評価が最も高いもの
      case 'foresee': { let best = R({ pick: 's' }), bv = -Infinity; [R({ pick: 's' }), R({ pick: 'w' })].forEach(a => { try { const s2 = G.tryApply(st, a); const v = evaluate(s2, s2.players[pid], W); if (v > bv) { bv = v; best = a; } } catch (e) {} }); return best; } // T53（O-137）先見：強・弱の報酬を試して評価が高いほう
      case 'cvIncome': return R({ res: p.E < G.sc(st, 6) ? 'E' : p.G < G.sc(st, 4) ? 'G' : 'P' });
      case 'lYield': { const pref = [p.E < G.sc(st, 6) ? 'E' : null, p.G < G.sc(st, 4) ? 'G' : null, 'E', 'G', 'P'].filter(Boolean).filter(r => pd.opts.includes(r)); return R({ res: pref[0] || pd.opts[0] }); }
      case 'wildColor': return R({ track: G.TRACKS.find(t => p.gems[t] === 0) || 'body' });
      case 'learn': { const miss = G.TRACKS.find(t => p.gems[t] === 0); return first(st, [R({ kind: 'express', track: miss || 'body' }), R({ kind: 'mimic', effect: 'metab3w' }), R({ kind: 'mimic', effect: 'social3w' }), R({ kind: 'mimic', effect: 'intel2' }), R({ kind: 'mimic', effect: 'social2' }), R({ skip: true })]); }
      case 'reMilestone': { const m = G.reachedMilestones(p); const best = m.find(x => x.lv === 5) || m[0]; return R({ track: best.track, lv: best.lv }); }
      case 'bonusAction': return first(st, G.TRACKS.map(t => ({ pid, type: 'track', track: t, pay: 'E', useL: 0 })).concat(st.shared.organField.map(o => ({ pid, type: 'organ', organ: o, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })), [{ pid, type: 'convert', kind: 'EG', n: 1 }, { pid, type: 'reserve', res: 'E' }, R({ skip: true })]));
    }
    return null;
  }

  // 2026-11-09 O-09：greedy と同じ規模補正をした重み（保留の解決で使う。W そのままだと E/G/P を規模ぶん高く見る）
  function scaledW(st) { const R = RSo(st), w = Object.assign({}, W), k = R.scale || 1; if (k !== 1) ['E', 'G', 'P'].forEach(r => { w[r] = w[r] / k; }); if (R.gToE) w.G = Math.max(w.G, w.E * R.gToE[1] / R.gToE[0]); return w; }
  // 特殊器官 id の残りの収入を E 換算で（E1＝1・G1＝1.5・P1＝0.6・協調1＝W.coopE）。器官の枚数は取得後の枚数＋1R あたり W.orgRate 枚の伸び（収入は各ラウンドの頭＝残り rem 回）
  function spIncomeE(st, p, id) {
    const R = RSo(st), v = (R.spInc || {})[id]; if (!v) return 0; const rem = (R.rounds || G.ROUNDS) - st.round; let e = 0, coopRoom = (R.coopMax || G.COOP_MAX || 99) - p.coop;
    for (let j = 1; j <= rem; j++) { const n = p.organs.length + 1 + W.orgRate * (j - 0.5); e += ((v.E || 0) * 1 + (v.G || 0) * 1.5 + (v.P || 0) * 0.6) * n; if (v.coop || v.coopFlat) { const c = Math.min(coopRoom, v.coopFlat || Math.floor(n * v.coop)); coopRoom -= c; e += c * W.coopE; } } // T18：coopFlat＝枚数によらない協調
    return e;
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
    const res = (s, coopRes) => { const base = { type: 'res', slot: s, coopRes: coopRes || pref[0], useL: false }; return [A(base), p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass') && st.ext === 'x1' && style !== 'white' ? A(Object.assign({}, base, { bypassCoop: true })) : null, p.L >= lMin ? A(Object.assign({}, base, { useL: true })) : null]; };
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
    const traitPref = ['IE', 'IG', 'IB', 'IP', 'DA', 'MC', 'NP', 'NE', 'NS', 'DB', 'DI', 'IM', 'DV', 'DG', 'MB', 'JI', 'JB', 'JS', 'NC', 'NL', 'NF', 'NB', 'NR', 'NM', 'ND', 'NH', 'NK', 'NZ', 'NY', 'NU', 'NG', 'NV', 'NO', 'NT', 'NA', 'NW', 'NI', 'NQ', 'NJ', 'NX', 'NN'].filter(t => G.traitPool(st).includes(t)); // T51（O-99） // T49（O-91） // T47（O-88）：結実は後ろに // T44（O-79）：新しい 4 種は後ろに
    const jsVar = (t) => { if (t !== 'JS' || !((RSo(st).star || {}).jump === 'half')) return [{}]; const lv = G.starJumpLv(st, p); if (!lv) return [{ jsPay: 'skip' }]; const c = G.starCost(st, lv); return Object.keys(c).map(r => ({ jsPay: r, jsPros: G.starProsOk(st, p, lv) ? starPros(st, p, [lv]) : undefined })).concat([{ jsPay: 'skip' }]); }; // T27（O-27）：星渡は払う 1 種まで含めて候補にする
    const traitCands = (slots) => traitPref.filter(t => !G.trait(p, t)).flatMap(t => jsVar(t).flatMap(jv => slots.map(sl => A(Object.assign({ type: 'trait', trait: t, useL: Math.max(0, Math.min(p.L, Math.ceil((G.traitCost(st, p, t).G - p.G) / 3))), res: pref[0], track: 'intel' }, jv, sl)))));
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
  const W = { E: 0.5, G: 0.7, P: 0.3, L: 1.5, gate: 1.0, coefFuture: 1.6, shield: 4, coop: 0.8, organ: 1.0, trait: 0.8, inc: 1.0, breedFut: 0, breedProg: 0, plan: 1, deny: 1.5, uncrowded: 1.4, denyFinal: 0.5,
    spPick: 1, coopE: 7.5, orgRate: 0.6, coopIncE: 3, herdRate: 0.5, dvUse: 1, dvSave: 0.4, rtFree: 1, rtStrong: 0.5 }; // 2026-11-09 O-09（足した重み・0 で旧の挙動）：spPick＝特殊器官を収入の E 換算で選ぶ／coopE＝協調1 の E 換算（6〜9 の中）／orgRate＝器官枚数の伸び（枚/R）／coopIncE＝協調の収入 1/R に上乗せする E（既存の収入項 w.inc×w.coop≈E4.8 と合わせて≈E7.8）／herdRate＝群体同期・融合の見込み回数/R（群心網の協調+ を残R分）／dvUse＝使った三段進行の価値（手番 2 つ分＝E30＋既存の残り回数の E15 を打ち消す分 × これ）／dvSave＝残りの三段進行への E の貯まり具合の価値（E30 × 貯まり具合 × これ。1 だと E を抱えすぎて種族の配分が動く〔万列 53％〕ので 0.4）／rtFree＝知性 Lv3★ の報酬で弱（無料）も候補に・形質の値打ちの重み／rtStrong＝強の上乗せ分（定価の差）の値打ち // 2026-11-05 uncrowded＝序盤、他者が選んでいない主トラックのゲート重み（第53部の「未選択の戦略」を重みに反映）／denyFinal＝最終R、首位がまだ使える空き資源枠（祝福枠）を先に取る妨害の重み（deny に掛かる） // 2026-11-04 plan＝ラウンド単位の計画（1＝有効・--bw=plan=0 で旧 greedy）／deny＝終盤の妨害（首位が使える早取り枠を先に取る）の重み // 2026-11-02 breedFut＝繁栄度1段が「これから得る痕跡」に掛かる見込み／breedProg＝次の繁殖（P150／L3）へ貯める途中の価値。第47部：どちらも種族の計測を光翼に偏らせ（7R 混合で 光翼 58〜67%・万列 1〜11%）得点も上がらないため既定 0（--bw= で試せる）
  function evaluate(st, p, w) {
    w = w || W; const sc = G.score(st, p); let v = sc.total * (2 / (RSo(st).gemPt || 2)); // 2026-10-28：評価の点は gemPt=2 の尺度に正規化（T8 で ×2 を外しても AI の重みづけが変わらないように。以下の「×2」はこの尺度）
    const RN = RSo(st).rounds || G.ROUNDS; const rem = RN - st.round; const k = rem / RN; // rem＝この後に残るラウンド数
    v += k * (p.E * w.E + p.G * w.G + p.P * w.P + p.L * w.L);
    if (RSo(st).lYield) { const R5 = RSo(st); const rate = (R5.yieldByRound ? 1.5 : R5.lYield) + (p.yieldAdd || 0); v += p.L * rem * rate * (p.yieldMul || 1) * (R5.yieldRes === 'P' ? w.P : w.E); } // T5：保有Lは残ラウンド分の利回りを生む（資源別の重み）
    if (rem > 0) { const has = (id) => p.traits.some(t => t.id === id); // T7：効果が得点・資源の差分に出にくい形質の見込み
      if (has('NF')) { const RF = RSo(st), nfs = G.trait(p, 'NF').strong; if (RF.nfPick) v += Math.min(4, G.TRACKS.filter(t => p.lv[t] < (nfs ? 5 : 3)).length) * sc.cfB * 2 * (nfs ? 0.35 : 0.2) * (rem / 7); /* T53（O-137）：強＝Lv3★・Lv5★（Lv5★ は痕跡+1 も）／弱＝Lv3★ */ else v += Math.min(4, G.TRACKS.filter(t => p.lv[t] < 5).length) * sc.cfB * 2 * 0.25 * (rem / 7); }
      if (has('NM')) v += rem * (RSo(st).nmMul ? 4.5 : 2.5); // T53（O-137）：獲得量 2 倍
      if (has('NR') && (RSo(st).nrMode === 'two' || RSo(st).nrTwoN) && G.nrTwoLeft(p) > 0) { const near = st.shared.lineages.filter(l => G.lineageCount(p, l) >= 1 && !G.lineageDone(p, l)).length; v += Math.min(G.nrTwoLeft(p), near) * rem * 1.6; } // T14：残り系統数ぶん // T13：2 枚で完成（まだ使っていなければ、1 枚ある系統が近い）
      else if (has('NR') && (RSo(st).lineageCoefMax || 0) > 0) { const near = st.shared.lineages.filter(l => G.lineageCount(p, l) >= 1).length; v += Math.min(1, Math.max(0, near - 1)) * rem * 1.6; } }
    const tg = RSo(st).traitEndGem; if (tg && !st.ended) v += Math.floor(p.traits.length / tg) * sc.cfC * 2 * (rem === 0 ? 1 : 0.6); // 試作 traitEndGem
    const le = RSo(st).lEndGem; if (le) v += Math.min(le.max, Math.floor(p.L / le.per)) * sc.cfC * 2 * (rem === 0 ? 1 : 0.6); // T6 S2：終了時の保有L祝福
    const cv6 = RSo(st).lv6Convert; const R6 = RSo(st); if ((R6.maxLv || 5) >= 6) { const cnt = { body: R6.lv6ConvertBodyInv ? (p.lInvested || 0) : p.L, intel: R6.lv6IntelFull ? G.intelCnt6(st, p) : p.traits.length, social: p.coop, metab: p.organs.length }; const by6 = R6.lv6ConvertBy || {}; G.TRACKS.forEach(t => { const conv = cv6 ? ((R6.lv6Fixed || {})[t] !== undefined ? R6.lv6Fixed[t] : Math.floor(cnt[t] / (by6[t] || cv6))) : 0; /* T18：社会は固定 */ if (p.lv[t] >= 6) v += conv * ((R6.lv6RealTracks || []).includes(t) ? sc.cfB : sc.cfC) * 2 * (rem === 0 ? 1 : 0.7); else if (p.lv[t] === 5 && rem > 0) { const c6 = G.stepCost(p, t); if (c6 !== null) { const afford = Math.min(1, (p.E + p.L * (p.lValue || 3)) / c6); v += ((R6.lv6Gems ? R6.lv6Gems.later : 1) + conv) * sc.cfC * 2 * 0.35 * afford; } } }); } // T6 L6-A：Lv6 の宝石＋転換の見込み（Lv5 のトラックは E で届く分だけ先読み）
    const inc = G.income(p); v += rem * w.inc * (inc.E * w.E + inc.G * w.G + inc.P * w.P + (inc.coop || 0) * w.coop); // T15 交信腔の協調収入も
    if (rem > 0) { const room = Math.max(0, (RSo(st).coopMax || G.COOP_MAX) - p.coop); // 2026-11-09 O-09：協調の収入（交信腔）・群心網（群体同期／融合の協調+）を「残りR × 1R の協調 × 協調1 の E 換算」で上乗せ（協調の上限まで）
      if (inc.coop && w.coopIncE) v += Math.min(room, inc.coop * rem) * w.coopIncE * w.E;
      if (p.herdCoopAdd && RSo(st).herd && w.herdRate) v += Math.min(room, rem * w.herdRate * p.herdCoopAdd) * (w.coopE || 0) * w.E; }
    // 2026-11-02 rem>0：最終ラウンドにはゲートの途中（届かない収集）へ価値を置かない（T8-H1：最終Rの形質・器官・資源枠の空振り）
    if (RSo(st).gates && rem > 0) G.TRACKS.forEach(t => { const g = G.gateReq(p, t); if (!g || !g.need) return; const nl = p.lv[t] + 1; const val = (nl === 3 || nl === 5) ? sc.cfB * 2 * (nl === 5 ? 1.6 : 1) : 4; const tw = w[t + 'Gate'] || 1; v += w.gate * tw * Math.min(1, g.have / g.need) * val * 0.6; });
    v += ((sc.cfB - 3) + (sc.cfC - 3)) / 2 * rem * w.coefFuture;
    { const PR = RSo(st).propel; if (PR && (PR.pr1E || PR.pr1Any) && G.organ(p, 'Pr1') && rem > 0) v += (PR.pr1E || PR.pr1Any) * /* T42（O-76）pr1Any＝好きな資源（E と同じ見方） */ Math.min(G.STAR_MAX - (p.star | 0), Math.ceil(rem * 1.2)) * w.E * 0.6; } // T27（O-27）：遊泳膜＝これから上げる段の E の見込み
    { const SJ = RSo(st).star && RSo(st).star.top && RSo(st).star.top.judge; if (SJ && (p.star | 0) >= G.STAR_MAX) v += SJ * sc.cfC * 2 * (rem === 0 ? 1 : 0.7); } // T26（O-26）：星海 Lv6 の神の裁定（4 本の Lv6 と同じ見方）
    if ((p.trialGem || p.starGem) && rem > 0) v += ((p.trialGem || 0) + (p.starGem || 0)) * 2 * rem * 0.5; /* T25（O-23）：星海の痕跡も同じ考え方 */ // T24（O-20）：試練の痕跡は早い R ほど多く、いまの係数で数えると安く見える。終了までの係数の伸び（実測 R1 3.0→終了 4.9≈0.5/R）を上乗せ // C2 では2本の平均（1本なら cf-3 と同値）
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
      const dv = G.trait(p, 'DV'); if (dv) { if (R.dvMode === 'triple') v += (p.dv3 || 0) * 15 * w.E; else if (R.dvMode === 'perm') v += Math.min(rem, 2) * (dv.strong ? 2 : 1) * 15 * w.E; /* T42（O-76）：回数なし＝残りの R で手番 1 つの節約（三段進行の評価と同じ E15）を強 2・弱 1 回ぶん（最大 2 R） */ else v += rem * 0.9 * (dv.strong ? 2 : 1) * k1 * w.E; } /* T14 三段進行＝残り回数×手番 1 つ（E15 相当） */ const dg = G.trait(p, 'DG'); if (dg) v += rem * 0.5 * (R.dgDisc ? R.dgDisc[dg.strong ? 0 : 1] : 2 * k1) * w.G; // 2026-11-09 O-10：DG の行が上のコメントに飲み込まれていたのを生かした
      { const ng = G.trait(p, 'NG'); if (ng && R.ngLaunchP) v += Math.min(rem, 3) * 0.4 * w.L; const nu = G.trait(p, 'NU'); if (nu && R.nuGain) v += rem * 0.5 * R.nuGain[nu.strong ? 0 : 1] * w.E; const no = G.trait(p, 'NO'); if (no && R.noAltarHalf && R.altar) G.ALTAR_KEYS.forEach(k => { if (['E', 'G', 'P'].includes(k) && !(p.tribGame && p.tribGame[k])) v += Math.max(0, R.altar.cost[k] - G.altarCost(p, k)) * w[k] * 0.4; }); const nt = G.trait(p, 'NT'); if (nt && R.ntBless) { const near = G.TRACKS.filter(t => p.lv[t] === 5).length + ((p.star | 0) === G.STAR_MAX - 1 ? 1 : 0); v += near * R.ntBless[nt.strong ? 0 : 1] * sc.cfC * 2 * 0.35; } if (R.diPay) { if (G.organ(p, 'Di1')) v += rem * w.inc * Math.max(0, R.diPay.Di1.E * w.E - R.diPay.Di1.P * w.P); if (G.organ(p, 'Di2')) v += rem * w.inc * Math.max(0, R.diPay.Di2.G * w.G - R.diPay.Di2.P * w.P); if (G.organ(p, 'Di3')) v += rem * 0.6 * R.diPay.Di3 * w.E; } } // T49（O-91）：犠牲＝生命核の節約・互恵＝使用済みの枠 0.5 回/R・供物＝まだ払っていない口の値引き・極致＝Lv5 のトラック（星海は Lv5）の数・消化＝収入の差し引き・消化核＝淘汰 0.6 回/R
      { const T = (id) => G.trait(p, id), gv = sc.cfB * 2, ce = (w.coopE || 3) * w.E; // T51（O-99）：新しい形質・寄生の見込み（最小限）
        const na = T('NA'); if (na && R.naDisc) v += rem * 0.4 * (na.strong ? 1.5 : 1) * ce; if (R.adCoopDisc && G.organ(p, 'Ad2')) v += rem * (R.adCoopDiscBypass ? 0.5 : 0.3) * ce; /* T53（O-137）：協調進出 −2 */ const nh = T('NH'); if (nh && R.nhFill) v += rem * 0.6 * R.nhFill[nh.strong ? 0 : 1] * w.E; /* T53（O-137）渇望：1 回の収入で 20／15 まで補う見込み（資源 1 種ぶん強） */ if (R.adLaunch && G.organ(p, 'Ad3')) v += rem * 0.4 * 6 * w.E;
        const ahead = (lv) => G.TRACKS.reduce((a, t) => a + (p.lv[t] < lv ? (p.lv[t] === lv - 1 ? 0.6 : 0.25) : 0), 0) + ((p.star | 0) + 1 < lv ? ((p.star | 0) + 2 === lv ? 0.5 : 0.2) : 0); // まだ着いていない Lv lv の見込みの数（星海は内部の段＋1）
        const ni = T('NI'); if (ni && R.niGain) v += Math.min(rem, ahead(4)) * (ni.strong ? gv * R.niGain.gem : R.niGain.any * w.E) * 0.8;
        const nq = T('NQ'); if (nq && R.nq5) v += Math.min(rem, ahead(5)) * (nq.strong ? gv * R.nq5.gem : R.nq5.any * w.E) * 0.8; /* T52（O-108）：開花＝Lv5★ だけ */ else if (nq && R.nqGain) v += Math.min(rem * 2, ahead(3) + ahead(5)) * R.nqGain[nq.strong ? 0 : 1] * w.E * 0.8;
        const nj = T('NJ'); if (nj && R.njGem && R.altar) { const u = G.ALTAR_KEYS.filter(k => !(p.tribGame && p.tribGame[k])).length; v += Math.min(u, rem) * 0.5 * gv * (nj.strong ? 1 : 0.7); }
        const nn = T('NN'); if (nn && R.nnGain && G.nnLins(p) >= 4) v += rem * w.inc * R.nnGain[nn.strong ? 0 : 1] * w.E; } // 孤高・多様の E・G・P は G.income に入る
      { const nd = G.trait(p, 'ND'); if (nd && R.ndDisc) v += rem * 0.6 * R.ndDisc[nd.strong ? 0 : 1] * w.E; if (G.organ(p, 'Sv3') && R.svInc) v += rem * w.inc * R.svInc.Sv3 * w.E; } // T44（O-79）：分化＝器官 0.6 枚/R の E 値引き（今の器官の割引と同じ見方）・貯蔵核＝収入の好きな資源（E と同じ見方・収斂膜の保留と同じく income には入らない）
      const mb = G.trait(p, 'MB'); if (mb && mb.strong && R.mbBreedDisc && R.mbMode !== 'multi') v += Math.min(rem, (R.breed.length - p.breed)) * 0.5 * R.mbBreedDisc * k1 * w.P;
      // 2026-11-04 耐性（MC）の見込み：これまで評価に無く（形質1枚ぶんの重みだけ）、G15 の MC は G9 の形質に常に負けて 0.02 枚/戦しか買われなかった。大量消費 0.5回/R × 軽減 を残Rぶん。1回限り（弱／freeOnce の強）は 1回ぶん
      const mcT = G.trait(p, 'MC'); if (mcT) { const fo = R.mcMode === 'freeOnce'; const perm = fo ? (!mcT.strong ? (R.mcDiscWeak !== undefined ? R.mcDiscWeak : R.mcDisc) : (R.mcStrongPerm || 0)) : (mcT.strong ? R.mcDisc : 0); /* T53（O-137）mcStrongPerm */ v += rem * 0.5 * perm * w.P;
        const once = fo ? (mcT.strong && p.mcFree ? (R.mmCost ? (R.massCost + R.mmCost) / 2 : R.massCost) : 0) : p.next.mass; v += Math.min(1, rem * 0.5) * once * w.P; }
    }
    if (R.dvMode === 'triple' && (w.dvUse || w.dvSave)) { const dvT = G.trait(p, 'DV'); if (dvT) { // 2026-11-09 O-09：三段進行＝手番 2 つの節約（E30）。使った回数は満額、残りは「打てるトラックの数まで × E の貯まり具合（最安の三段の E に対して）」＝ E を貯めて打つ判断。使うと残りの見込みが満額に変わるので、使うことが損にならない
      const turn2 = 2 * G.sc(st, 5) * w.E; const tot = (R.dvTriple || [2, 1])[dvT.strong ? 0 : 1]; v += Math.max(0, tot - (p.dv3 || 0)) * (turn2 + 15 * w.E) * (w.dvUse || 0); // 使った回数（上の「残り回数 × E15」が使うと減る分も打ち消す）
      if (rem > 0 && p.dv3 > 0) { const cs = G.TRACKS.map(t => G.stepCostTriple(p, t)).filter(c => c !== null).sort((a, b) => a - b); let pool = p.E + p.L * (p.lValue || G.sc(st, 3)); for (let i = 0; i < Math.min(p.dv3, cs.length); i++) { v += turn2 * (w.dvSave || 0) * Math.max(0, Math.min(1, pool / Math.max(1, cs[i]))); pool -= cs[i]; } } } } // 2 回目は 1 回目の残りの E で
    // 得点に変換できる資源の潜在価値：P は大量消費(身体)（1宝石＝係数×2点）、G は宝石セット（1R1人）に化ける。残ラウンドがあるときだけ
    if (rem > 0) { const gemValR = (RSo(st).massBodyVirtual ? sc.cfC : sc.cfB) * 2, gemValV = sc.cfC * 2; v += Math.min(2, Math.floor(p.P / Math.max(1, G.massCost(p, 'MB')))) * 0.5 * (gemValR * (RSo(st).massBodyGem || 1) + (RSo(st).massBodyL || 0) * (w.L + (RSo(st).lYield || 0) * Math.max(0, rem - 1) * w.P)); /* T42（O-76）massBodyGem・T45（O-83）massBodyL＝生命核 1 の値打ち＝持っているだけの値打ち w.L＋残りの収入で産む P */ if (RSo(st).altar) { const nv = G.altarNextVg(p); if (nv && G.ALTAR_KEYS.some(k2 => !(p.tribGame && p.tribGame[k2]) && G.altarCost(p, k2) !== null && p[k2] >= G.altarCost(p, k2))) v += nv * sc.cfC * 2 * 0.3; } /* T23：次の払い口で得る祝福の見込み */ else if (p.G >= G.gemsetPrice(p)) v += gemValV * 0.3; }
    return v;
  }
  function starPros(st, p, lvs) { // T25（O-23）：先駆の段で繁栄度を選ぶか（その段を除いた終了時の痕跡の見込み ＞ 5 × 今の繁栄度・5 段目は痕跡 1 が残るので +1）
    const RN = RSo(st).rounds || G.ROUNDS; const real = G.realGems(p); const proj = real * RN / Math.max(1, st.round); let room = G.prosRoom(p); const out = [];
    lvs.forEach(lv => { if (room <= 0 || !G.starProsOk(st, p, lv)) return; const keep = (G.starFirstDef(st, lv).pros || 0); if (proj + keep > 5 * (G.coefB(p) + (out.length))) { out.push(lv); room -= 1; } });
    return out.length ? out : undefined;
  }
  // O-113：AI が試す候補＝全部の候補から「必ず例外になる手」を複製の前にはじいたもの（選ぶ手と得点は変わらない）。G.Bot.candidates は全部の候補のまま
  function cands(st, p) { const keepE = !!RSo(st).gToE; return candidates(st, p).filter(a => !G.surelyIllegal(st, a, { keepE })); }
  function candidates(st, p) {
    const pid = p.id, A = (x) => Object.assign({ pid }, x); const out = [];
    const used = (s) => G.slotUsedBy(st, s) !== undefined;
    const byp = (base, slot) => { if (RSo(st).coopMode === 'spend' && p.coop >= 1 && slot !== 'PB') { const b2 = Object.assign({}, base, { coopSpend: true }); out.push(A(b2)); if (used(slot)) { if (p.L > 0) out.push(A(Object.assign({}, b2, { useL: true }))); } } out.push(A(base)); if (used(slot) && p.mimic && !p.round.mimicUsed) out.push(A(Object.assign({}, base, { bypassMimic: true }))); if (used(slot)) { if (p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass') && st.ext === 'x1') out.push(A(Object.assign({}, base, { bypassCoop: true }))); if (p.L > 0) out.push(A(Object.assign({}, base, { useL: true, bypassL: true }))); } else if (RSo(st).launchFree && p.L > 0 && (slot !== 'PB' || RSo(st).pbLaunch) && !base.vg) out.push(A(Object.assign({}, base, { useL: true }))); if (!used(slot) && RSo(st).launchFree && (slot !== 'PB' || RSo(st).pbLaunch) && !base.vg && G.ngCost(p) !== null && p.P >= G.ngCost(p)) out.push(A(Object.assign({}, base, { useL: true, launchP: true }))); }; /* T49（O-91）犠牲：P で緊急進出 */ // T18（O-12）：空き枠の緊急進出（生命核 1 で 3 倍）を候補に（評価はそのまま）
    { const fv = RSo(st).finalSlotVg; if (fv && fv.mode === 'choice' && st.round === (RSo(st).rounds || G.ROUNDS)) G.RES_SLOTS.forEach(s => byp({ type: 'res', slot: s, coopRes: 'E', vg: true }, s)); } // 試作 finalSlotVg：最終Rは資源の代わりに祝福
    G.RES_SLOTS.concat(['PB']).forEach(s => { if (s === 'ALL') ['E', 'G', 'P'].forEach(r => byp({ type: 'res', slot: s, coopRes: r }, s)); else byp({ type: 'res', slot: s, coopRes: 'E' }, s); if (p.shields > 0 && s !== 'PB') ['E', 'G', 'P'].forEach(r => out.push(A({ type: 'res', slot: s, coopRes: r, shield: true }))); });
    const lFor = (cost, have) => Math.max(0, Math.min(p.L, Math.ceil((cost - have) / (p.lValue || G.sc(st, 3)))));
    G.TRACKS.forEach(t => { const c = G.stepCost(p, t); if (c !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c, p.E) })); if (RSo(st).bodyBulkLv4 && p.L >= 2 && c >= 2 * (p.lValue || 3) && !p.lBulk) out.push(A({ type: 'track', track: t, pay: 'E', useL: 2 })); } });
    if (RSo(st).bodyBulkLv4 && p.L >= 2 && !p.lBulk) st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (c && c.E >= 2 * (p.lValue || 3)) out.push(A({ type: 'organ', organ: o, useL: 2, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); });
    out.push(A({ type: 'breed' })); if (RSo(st).breedE) out.push(A({ type: 'breed', pay: 'E' })); if (RSo(st).breedL) out.push(A({ type: 'breed', pay: 'L' }));
    if (RSo(st).mbMode === 'multi') { const mx = G.breedMaxN(p); for (let a1 = 0; a1 <= mx; a1++) for (let b1 = 0; b1 <= (RSo(st).breedL ? mx : 0); b1++) if (a1 + b1 >= 2) out.push(A({ type: 'breed', nP: a1, nL: b1 })); } // T14 繁殖の同時払い（2 段以上の組み合わせ。1 段は上の候補）
    if (RSo(st).massL) out.push(A({ type: 'mass', kind: 'MB', pay: 'L' }));
    if (RSo(st).crystal) ['E', 'G'].forEach(r => out.push(A({ type: 'crystal', res: r })));
    if (RSo(st).lCrystal) out.push(A({ type: 'lCrystal' }));
    if (RSo(st).coopCrystal) out.push(A({ type: 'coopCrystal' }));
    if (RSo(st).premium) G.PREMIUM_ORDER.filter(t => !G.trait(p, t)).forEach(t => out.push(A({ type: 'premium', trait: t, useL: 0 })));
    st.shared.organField.forEach(o => { const c = G.organCost(st, p, o); if (!c) return; out.push(A({ type: 'organ', organ: o, useL: lFor(c.E, p.E), li2Res: p.G < G.sc(st, 2) ? 'G' : 'E', li3Res: 'E', regimeRes: 'E' })); { const AM = RSo(st).amplify; if (AM && !(p.uses && p.uses.amplify) && G.ampOk(st, o, false) && p.E >= c.E + (AM.E || 0)) out.push(A({ type: 'organ', organ: o, useL: 0, amp: true, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); } if (p.altFuel && p.P >= G.altFuelP(p, c.E) && (p.E < c.E || p.P >= G.altFuelP(p, c.E) + G.sc(st, 20))) out.push(A({ type: 'organ', organ: o, useL: 0, payP: true, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); }); // 第42部 N5 代替燃料：E 不足か P 余剰なら P 払いの候補
    if (RSo(st).burst) st.shared.lineages.forEach(lin => { const n = G.lineageCount(p, lin); const seq = [1, 2, 3].filter(t => t > n).map(t => lin + t).filter(id => st.shared.organField.includes(id)); for (let k = 2; k <= Math.min(seq.length, RSo(st).burst.max || 3); k++) out.push(A({ type: 'burst', organs: seq.slice(0, k), useL: 0, liRes: p.G < G.sc(st, 2) ? 'G' : 'E' })); }); // T14 一気立て：同じ系統を 2〜3 枚続けて（資源が足りなければ engine が弾く）
    const cheap2 = G.traitPool(st).filter(t => G.baseTraitCost(st, t) <= (RSo(st).miMaxCost || 4) && !G.trait(p, t)).slice(0, RSo(st).miCount || 2);
    ['MB', 'MI', 'MS', 'MM'].forEach(k => { out.push(A({ type: 'mass', kind: k, traits: cheap2 })); if (RSo(st).massSecond && used(k) && G.slotUsedBy(st, k) !== p.id && st.shared.used[k + '#2'] === undefined) { if (RSo(st).massSecond.pay === 'either') ['coop', 'L'].forEach(sp => out.push(A({ type: 'mass', kind: k, traits: cheap2, second: true, secondPay: sp }))); else out.push(A({ type: 'mass', kind: k, traits: cheap2, second: true })); } /* O-39 計測のみ：淘汰の 2 人目／T31（O-44）：協調・生命核の両方を候補に */ if (used(k) && p.bypassWide && p.L > 0) out.push(A({ type: 'mass', kind: k, traits: cheap2, bypassL: true })); if (used(k) && G.coopBypassable(st, k, p) && p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass')) out.push(A({ type: 'mass', kind: k, traits: cheap2, bypassCoop: true })); if (k === 'MM') for (let n = 2; n <= G.mmMax(p); n++) { out.push(A({ type: 'mass', kind: k, n })); if (used(k) && G.coopBypassable(st, k, p) && p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass')) out.push(A({ type: 'mass', kind: k, n, bypassCoop: true })); } }); // O-34 計測のみ：淘汰（代謝）の口数 // bypassCoopWide：使用済みの大量消費を協調発進で
    const tslots = [{}, { slot: 'TRT2' }]; if (used('TRT') || used('TRT2')) { if (p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass') && st.ext === 'x1') tslots.push({ bypassCoop: true }); if (p.L > 0) tslots.push({ bypassL: true }); }
    G.traitPool(st).filter(t => !G.trait(p, t)).forEach(t => { const tc = G.traitCost(st, p, t); const c = tc.G; tslots.forEach(sl => out.push(A(Object.assign({ type: 'trait', trait: t, useL: lFor(c, p.G), res: 'E', track: 'intel' }, sl)))); if (RSo(st).traitChoice && tc.strong) { const cw = G.traitCost(st, p, t, undefined, true).G; out.push(A({ type: 'trait', trait: t, useL: lFor(cw, p.G), res: 'E', track: 'intel', weak: true })); } }); // traitChoice：弱（安い）も候補に
    if (RSo(st).altar) G.ALTAR_KEYS.forEach(k => { if (!(p.tribGame && p.tribGame[k]) && G.altarCost(p, k) !== null && p[k] >= G.altarCost(p, k)) out.push(A({ type: 'altar', res: k })); }); if (RSo(st).altar && RSo(st).altarDouble) { const ok = G.ALTAR_KEYS.filter(k => !(p.tribGame && p.tribGame[k]) && G.altarCost(p, k) !== null && p[k] >= G.altarCost(p, k)); ok.forEach((k, i) => ok.slice(i + 1).forEach(k2 => { if (!RSo(st).altarDouble.adjacent || G.altarAdj(k, k2)) out.push(A({ type: 'altar', res: k, res2: k2 })); })); } /* T35（O-63）：隣り合う組だけ */ /* O-43 計測のみ：2 個まとめて（払えない組は engine が弾く） */ // T23（O-19）：祭壇の払い口 5 つ（評価は得点の祝福＋下の見込み）
    else out.push(A({ type: 'gemset', useL: lFor(G.gemsetPrice(p), p.G) }));
    if (RSo(st).trial) { const k = G.trialKey(st); if (k && !G.trialDone(st, p) && p[k] >= G.trialCost(st)) out.push(A({ type: 'trial' })); } // T24（O-20）：いまの R の試練（評価は得点の痕跡。R が終わると消えるので見込みの項は置かない）
    if (RSo(st).tributeBulk) { const bk = RSo(st).tributeBulk; out.push(A({ type: 'gemset', useL: lFor(Math.ceil(G.gemsetPrice(p) * bk.mult), p.G), bulk: true })); const T2 = RSo(st).tribute; if (T2 && st.round >= (T2.openRound || 6)) out.push(A({ type: 'tribute', res: 'E', bulk: true }), A({ type: 'tribute', res: 'P', bulk: true })); } // 試作 tributeBulk
    if (RSo(st).tributeAll) out.push(A({ type: 'tributeAll' })); // 試作 tributeAll
    { const T = RSo(st).tribute; if (T && st.round >= (T.openRound || 6)) { if (T.shared) out.push(A({ type: 'tribute', res: 'E' }), A({ type: 'tribute', res: 'P' })); G.tribSlots(st).forEach(sl => { const def = T.slots[sl]; if (!def) return; // 献上（第33部）・恩寵枠（第35部：この卓で開いている枠だけ）
      if (!def.kind) { if (def.real) { const miss = G.TRACKS.find(t => p.gems[t] === 0) || 'body'; out.push(A({ type: 'tributeSlot', slot: sl, track: miss })); } else out.push(A({ type: 'tributeSlot', slot: sl })); return; }
      if (def.kind === 'organ' && RSo(st).toLineage) { st.shared.lineages.forEach(lin => { if (G.lineageCount(p, lin) < 3) out.push(A({ type: 'tributeSlot', slot: sl, lin, useL: 0, liRes: p.G < G.sc(st, 2) ? 'G' : 'E', regimeRes: 'E' })); }); return; } // T15 器官の恩寵：系統 1 つを 1 段目の定価で 3 段目まで
      if (def.kind === 'organ') { const bl = st.shared.organField.filter(o => G.organCost(st, p, o)); bl.forEach(o => { out.push(A({ type: 'tributeSlot', slot: sl, organ: o, li2Res: 'E', li3Res: 'E', regimeRes: 'E' })); if (def.half) { const lin = G.ORGANS[o].lin, tier = G.ORGANS[o].tier; const nxt = lin + (tier + 1); const second = (st.shared.organField.includes(nxt) ? [nxt] : []).concat(bl.filter(x => x !== o)); second.slice(0, 4).forEach(o2 => out.push(A({ type: 'tributeSlot', slot: sl, organ: o, organ2: o2, useL: 0, li2Res: 'E', li3Res: 'E', regimeRes: 'E' }))); } }); return; }
      if (def.kind === 'trait') { const un = G.traitPool(st).filter(t => !G.trait(p, t)); const top = un.slice().sort((x, y) => G.baseTraitCost(st, y) - G.baseTraitCost(st, x)).slice(0, 5); un.forEach(t => out.push(A({ type: 'tributeSlot', slot: sl, traits: [t], useL: 0, res: 'E', track: 'intel' }))); if ((def.n || 2) >= 2) for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) out.push(A({ type: 'tributeSlot', slot: sl, traits: [top[i], top[j]], useL: 0, res: 'E', track: 'intel' })); return; }
      if (def.kind === 'alchemy') { const singles = []; G.TRACKS.forEach(f => { if (p.gems[f] < 1) return; G.TRACKS.forEach(t => { if (t !== f) singles.push({ from: f, to: t }); }); }); singles.forEach(c => out.push(A({ type: 'tributeSlot', slot: sl, changes: [c] }))); if ((def.n || 2) >= 2) { const need = new Set(); st.shared.combos.two.forEach(i => { const c = G.COMBOS2[i]; const miss = c.filter(t => p.gems[t] === 0); if (miss.length === 1) need.add(miss[0]); }); st.shared.combos.three.forEach(i => { const c = G.COMBOS3[i]; const miss = c.filter(t => p.gems[t] === 0); if (miss.length >= 1 && miss.length <= 2) miss.forEach(t => need.add(t)); }); const ns = singles.filter(c => need.has(c.to)); for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a1 = ns[i], a2 = ns[j]; if (a1.to === a2.to) continue; if (a1.from === a2.from && p.gems[a1.from] < 2) continue; if (a2.from === a1.to || a1.from === a2.to) continue; out.push(A({ type: 'tributeSlot', slot: sl, changes: [a1, a2] })); } } return; }
      if (def.kind === 'altarHalf') { const okK = G.ALTAR_KEYS.filter(k => { const c = G.altarHalfCost(p, k); return c !== null && p[k] >= c; }); okK.forEach(k => out.push(A({ type: 'tributeSlot', slot: sl, res: k }))); const D2 = RSo(st).altarDouble; if (def.pair && D2) okK.forEach((k, i) => okK.slice(i + 1).forEach(k2 => { if (!D2.adjacent || G.altarAdj(k, k2)) out.push(A({ type: 'tributeSlot', slot: sl, res: k, res2: k2 })); })); return; } // T39（O-68）pair：通常の祭壇の手と同じ並びの 2 口も // T32（O-47）祭壇の恩寵：払える未払いの払い口ごと（評価は通常の祭壇と同じく得点の祝福）
      if (def.kind === 'life') { out.push(A({ type: 'tributeSlot', slot: sl })); return; }
      if (def.kind === 'star') { const lv = (p.star | 0) + 1; if (!G.starOn(st) || lv > G.STAR_MAX) return; const c = G.starCost(st, lv); Object.keys(c).forEach(k => { if (p[k] < c[k]) return; out.push(A({ type: 'tributeSlot', slot: sl, res: k })); if (G.starProsOk(st, p, lv)) out.push(A({ type: 'tributeSlot', slot: sl, res: k, pros: [lv] })); }); return; } // T49（O-91）星の恩寵
      if (def.kind === 'cull') { if (p.P < (def.P || 100)) return; const ks = ['MB', 'MI', 'MS', 'MM']; ks.forEach((k1, i) => ks.slice(i + 1).forEach(k2 => out.push(A({ type: 'tributeSlot', slot: sl, kinds: [k1, k2], traits: cheap2 })))); return; } // T49（O-91）淘汰の恩寵 // T32 命の恩寵（評価は生命核の価値）
      if (def.kind === 'breedHalf' && (RSo(st).breedTrib || {}).normal) { const cL1 = G.breedHalfCost(p, 'L'); if (G.breedHalfCost(p, 'P') === null) return; const mx = G.breedTribMax(p), left = G.breedLeft(p); for (const [nP, nL] of [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2]]) { if (nP > mx || nL > mx || nP + nL > left) continue; if (nL && (cL1 === null || p.L < cL1 * nL)) continue; if (nP && p.P < G.breedTribP(p, nP)) continue; out.push(A({ type: 'tributeSlot', slot: sl, nP, nL })); } return; } // T38（O-67）：通常の繁殖と同じ段数（強の持ち主は 2 段ずつの候補も）
      if (def.kind === 'breedHalf' && (RSo(st).breedTrib || {}).both) { const cP = G.breedHalfCost(p, 'P'), cL = G.breedHalfCost(p, 'L'); if (cP === null) return; const okP = p.P >= cP, okL = cL !== null && p.L >= cL; if (okP) out.push(A({ type: 'tributeSlot', slot: sl, nP: 1, nL: 0 })); if (okL) out.push(A({ type: 'tributeSlot', slot: sl, nP: 0, nL: 1 })); if (okP && okL && G.breedLeft(p) >= 2) out.push(A({ type: 'tributeSlot', slot: sl, nP: 1, nL: 1 })); return; } // T37（O-65）：P と生命核を両方
      if (def.kind === 'breedHalf') { ['P', 'L'].forEach(pay => { const c = G.breedHalfCost(p, pay); if (c !== null && p[pay] >= c) out.push(A({ type: 'tributeSlot', slot: sl, pay })); }); return; } // T32 繁殖の恩寵
      if (def.kind === 'boost') { if (def.instant) G.RES_SLOTS.concat(['PB']).forEach(s => { if (s === 'ALL') ['E', 'G', 'P'].forEach(r => out.push(A({ type: 'tributeSlot', slot: sl, res: s, coopRes: r }))); else out.push(A({ type: 'tributeSlot', slot: sl, res: s, coopRes: 'E' })); }); else out.push(A({ type: 'tributeSlot', slot: sl })); return; }
      if (def.kind === 'leap') { const ok = G.TRACKS.filter(t => G.stepCost(p, t) !== null); const s0 = p.star | 0; if (G.starOn(st) && s0 < G.STAR_MAX) ok.push('star'); ok.forEach((t1, i) => ok.forEach((t2, j) => { if (j < i) return; const ns = [t1, t2].filter(t => t === 'star').length; if (s0 + ns > G.STAR_MAX) return; const lvs = ns ? [s0 + 1, s0 + 2].slice(0, ns) : []; out.push(A({ type: 'tributeSlot', slot: sl, tracks: [t1, t2], useL: 0, pros: ns ? starPros(st, p, lvs) : undefined })); })); return; } // T25：星海も跳躍の対象
    }); } }
    if (RSo(st).gSlots) { const mc = G.gSlotCost(p, RSo(st).mimicCost || 4), ec = G.gSlotCost(p, RSo(st).expressCost || 10); G.mimicOptions(st, p).forEach(e => out.push(A({ type: 'mimic', effect: e.id, useL: lFor(mc, p.G) }))); G.TRACKS.forEach(t => { out.push(A({ type: 'express', track: t, useL: lFor(ec, p.G) })); if (used('EXP') && G.coopBypassable(st, 'EXP', p) && p.coop >= G.coopCost(p, RSo(st).bypassCoopCost || 2, 'bypass')) out.push(A({ type: 'express', track: t, useL: lFor(ec, p.G), bypassCoop: true })); }); } if (used('GEM') && p.bypassWide && p.L > 0) out.push(A({ type: 'gemset', useL: 0, bypassL: true }));
    if (!RSo(st).noScan) G.scanCandidates(st, p).slice(0, 2).forEach(tg => out.push(A({ type: 'scan', target: tg, useL: 0 })));
    if (!RSo(st).noAdapt) G.TRACKS.filter(t => p.lv[t] === 1).forEach(t => out.push(A({ type: 'adapt', track: t })));
    if (!RSo(st).noConvert) ['EG', 'GE', 'PE', 'PG'].forEach(k => [1, 2].forEach(n => out.push(A({ type: 'convert', kind: k, n }))));
    if (!RSo(st).noReserve) out.push(A({ type: 'reserve', res: 'E' }), A({ type: 'reserve', res: 'G' })); else if (RSo(st).gather) ['E', 'G', 'P', 'coop'].forEach(r => out.push(A({ type: 'gather', res: r }))); else out.push(A({ type: 'pass' })); // v3.65 採集（パスの置き換え）
    // T10（第59部）：復元（他者が強で取った形質を強で）・増幅（器官1つを2倍）・二段進行
    if (RSo(st).restore && !(p.uses && p.uses.restore)) G.traitPool(st).filter(t => st.shared.traitFirst[t] !== undefined && st.shared.traitFirst[t] !== p.id && !G.trait(p, t)).forEach(t => out.push(A({ type: 'restore', trait: t, useL: 0, res: 'E', track: 'intel' })));
    if (RSo(st).amplify && !(p.uses && p.uses.amplify)) p.organs.filter(o => G.ampOk(st, o.id, true) && !o.amp).forEach(o => out.push(A({ type: 'amplify', organ: o.id })));
    if (RSo(st).doubleStep) G.TRACKS.forEach(t => { const c2 = G.stepCostDouble(p, t); if (c2 !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0, steps: 2 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c2, p.E), steps: 2 })); } });
    if (G.starOn(st)) { // T25（O-23）：星海（1／2／3 段・跳躍は下の leap）。先駆の繁栄度は「その段を除いた終了時の痕跡の見込み ＞ 5 × 今の繁栄度」なら選ぶ
      const s0 = p.star | 0; [1, 2, 3].forEach(n => { if (s0 + n > G.STAR_MAX || (n > 1 && (RSo(st).star || {}).top && s0 + n >= G.STAR_MAX && !G.multiTop(p)) || (n === 2 && !RSo(st).doubleStep) || (n === 3 && !G.can3(p))) return; const lvs = []; for (let l = s0 + 1; l <= s0 + n; l++) lvs.push(l); out.push(A({ type: 'track', track: 'star', steps: n, pros: starPros(st, p, lvs) })); }); }
    if (G.can3(p)) G.TRACKS.forEach(t => { const c3 = G.stepCostTriple(p, t); if (c3 !== null) { out.push(A({ type: 'track', track: t, pay: 'E', useL: 0, steps: 3 })); if (p.L) out.push(A({ type: 'track', track: t, pay: 'E', useL: lFor(c3, p.E), steps: 3 })); } }); // T14 三段進行（突然変異の残り回数）
    if (RSo(st).gToE) [1, 2, 4].forEach(n => out.push(A({ type: 'gToE', n })));
    p.cards.forEach(c => { out.push(A({ type: 'card', card: c, choice: 'E' })); if (c === 'J') out.push(A({ type: 'card', card: c, choice: 'G' })); if (p.shields > 0) out.push(A({ type: 'card', card: c, choice: 'E', shield: true })); });
    ['St1', 'St2', 'St3'].forEach(o => { if (G.organ(p, o)) out.push(A({ type: 'stAct', organ: o, pe: 14, pg: 12 })); });
    if (p.round && p.round.boostLock) return out.filter(a => !(a.type === 'res' && (a.useL || a.bypassCoop || a.bypassL))); // T40（O-69）：神の加護を取った人は緊急進出・協調進出なし
    return out;
  }
  // O-115②：G.tryFrom の結果（ほかの人は凍ったまま）を扱う口。evalT＝評価する（凍った人に触れたら redo＝tryApply でやり直す）・thaw＝凍った人を写して普通の状態に戻す（評価以外の処理に渡す前）・settleT＝保留があるときだけ戻してから settle
  function thaw(s) { if (s.players.some(q => Object.isFrozen(q))) s.players = s.players.map(q => Object.isFrozen(q) ? G.clone(q) : q); return s; }
  function evalT(s2, pid, w, redo) { try { return { s: s2, v: evaluate(s2, s2.players[pid], w) }; } catch (e) { if (!(e instanceof TypeError)) throw e; const s3 = redo(); return { s: s3, v: evaluate(s3, s3.players[pid], w) }; } }
  function settleT(s, pid) { return (!s.ended && G.cur(s).id === pid && s.players[pid].pending[0]) ? settle(thaw(s), pid) : s; }
  function chooseGreedy(st, pid, w) {
    const p = st.players[pid]; const R = RSo(st);
    // 2026-11-04 ラウンド単位の計画（ユーザー採用・第53部）：方策の重み指定（色寄せ）が無い greedy は、局面から「今 R の狙い」を決めて評価の重みに反映する。手番ごとに読み直す（相手の先取りに追従）
    const plan = (!w && W.plan) ? planFor(st, p) : null; if (plan) G.Bot.lastPlan = plan;
    w = Object.assign({}, w || W, plan ? plan.w : {}); { const k = R.scale || 1; if (k !== 1) ['E', 'G', 'P'].forEach(r => { w[r] = w[r] / k; }); } // 資源の規模に合わせて1個あたりの価値を下げる
    if (R.gToE) w.G = Math.max(w.G, w.E * R.gToE[1] / R.gToE[0]); // G→E変換があるならGはE換算以上の価値
    const isFree = (a) => a.shield || a.type === 'gToE' || a.type === 'freeConv';
    const base = evaluate(st, p, w);
    let best = null, bv = -Infinity, bestFree = null, bfv = base + 0.2, ties = 0; // ties：最良値と同点の候補数（検証用 G.TIES）
    const TB = G.trialBase(st); // O-115②
    for (const a of cands(st, p)) {
      let s2; try { s2 = G.tryFrom(TB, a); } catch (e) {
        // E不足で打てない手は、G→E変換（無料）を挟めば打てるか試す＝複合候補。成立すれば先に変換を返す
        if (R.gToE && a.type !== 'gToE' && p.G >= R.gToE[0] && /エネルギーが足りません/.test(e.message)) {
          const m = e.message.match(/必要E(\d+)・所持E(\d+)/); const need = m ? Math.max(1, Math.ceil((+m[1] - +m[2]) / R.gToE[1])) : 1;
          if (p.G >= need * R.gToE[0]) { try { const s1 = G.tryApply(st, { pid, type: 'gToE', n: need }); const s3 = G.tryApply(s1, a); const v = evaluate(s3, s3.players[pid], w); if (v > bv) { bv = v; best = { pid, type: 'gToE', n: need }; } } catch (e2) { /* 不成立 */ } }
        }
        continue;
      }
      let v = evalT(s2, pid, w, () => G.tryApply(st, a)).v; if (a.type === 'pass') v -= 1; // パスは最後の手段
      if (plan && plan.denyPid !== undefined) v += denyBonus(st, a, st.players[plan.denyPid]) * (W.deny || 0); // 終盤：首位が使える早取り枠を先に取る
      if (isFree(a)) { if (v > bfv) { bfv = v; bestFree = a; } } // 手番を消費しない手は「今の状態より良くなる」なら先に実行
      else if (v > bv) { bv = v; best = a; ties = 1; } else if (v === bv) ties++;
    }
    if (G.TIES) { G.TIES.n++; G.TIES.sum += ties; if (ties > 1) G.TIES.tied++; }
    // 2026-11-02 最終ラウンドの2手読み（T8-H1：最終Rに得点にならない資源枠が 1.2 手/人）：1手では得点が増えないとき、「資源を得る手 → 得点になる手」の組み合わせを試し、最良の初手を選ぶ（手番が2つ以上残っているときだけ）
    const RN = R.rounds || G.ROUNDS;
    if (st.round === RN && bv <= base + 1e-9 && (p.left.W + p.left.AT) >= 2) {
      const SETUP = (a) => a.type === 'res' || a.type === 'convert' || a.type === 'gToE' || a.type === 'card' || a.type === 'scan' || (a.type === 'tributeSlot' && a.res);
      const SCORE = (a) => ['breed', 'tribute', 'tributeAll', 'tributeSlot', 'track', 'mass', 'trait', 'organ', 'burst', 'gemset', 'altar', 'trial', 'lCrystal', 'coopCrystal', 'express', 'premium', 'crystal'].includes(a.type);
      let b2 = null, b2v = base + 1e-9;
      for (const a1 of cands(st, p).filter(SETUP)) { let s1; try { s1 = thaw(G.tryFrom(TB, a1)); } catch (e) { continue; }
        const p1 = s1.players[pid], TB1 = G.trialBase(s1); for (const a2 of cands(s1, p1).filter(SCORE)) { let s2; try { s2 = G.tryFrom(TB1, a2); } catch (e) { continue; } const v = evalT(s2, pid, w, () => G.tryApply(s1, a2)).v; if (v > b2v) { b2v = v; b2 = a1; } } }
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
  const BEAM = { depth: 1, k: 3, final: false, top: 0, budget: 0 }; let inSearch = false, inRoll = false; // O-121：final＝最終ラウンドを最終得点で読む（top＝打ち切る候補を greedy の評価の上位 N 手に絞る・0＝絞らない／budget＝ミリ秒。超えたら評価の上位 12 手を読んだ所で止める・0＝止めない＝画面だけが使う）
  function settle(s, pid) { let g = 0; while (!s.ended && G.cur(s).id === pid && s.players[pid].pending[0] && g++ < 8) { const a = pending(s, s.players[pid]); if (!a) break; try { s = G.tryApply(s, a); } catch (e) { break; } } return s; }
  // O-115④：相手の代打ち（greedy）の結果を局面ごとに覚えて使い回す。鍵＝局面の中身すべて（ログと履歴を除く）＋席。重み（W・BIAS）が変わったら捨てる。打つ手は覚えなかったときと同じ（G.Bot.lastPlan も同じに戻す）
  const SIMC = new Map(); let simW = ''; G.SIMSTAT = G.SIMSTAT || null;
  function stateKey(s) { let k = ''; for (const f in s) { if (f === 'log' || f === 'history') continue; const v = s[f]; if (v === undefined || typeof v === 'function') continue; k += f + ':' + JSON.stringify(v) + ';'; } return k; }
  function greedyMemo(s, q) {
    if (G.TIES) return choose(s, q, 'greedy');
    const wk = JSON.stringify(W) + JSON.stringify(BIAS); if (wk !== simW) { SIMC.clear(); simW = wk; }
    const key = q + '|' + stateKey(s); const hit = SIMC.get(key); if (G.SIMSTAT) G.SIMSTAT[hit ? 'hit' : 'miss']++;
    if (hit) { if (hit.plan) G.Bot.lastPlan = hit.plan; return hit.a === null ? null : JSON.parse(hit.a); }
    const lp = G.Bot.lastPlan; const a = choose(s, q, 'greedy'); const np = G.Bot.lastPlan !== lp ? G.Bot.lastPlan : null;
    if (SIMC.size >= 4000) SIMC.clear(); SIMC.set(key, { a: a ? JSON.stringify(a) : null, plan: np }); return a;
  }
  function simOthers(s, pid) { const r0 = s.round; let g = 0; while (!s.ended && s.round === r0 && G.cur(s).id !== pid && g++ < 60) { const q = G.cur(s).id; const a = greedyMemo(s, q); if (!a) break; try { s = G.tryApply(s, a); } catch (e) { break; } } return s; }
  function chooseBeam(st, pid) {
    const p0 = st.players[pid]; const R = RSo(st);
    const plan = W.plan ? planFor(st, p0) : null; if (plan) G.Bot.lastPlan = plan;
    const w = Object.assign({}, W, plan ? plan.w : {}); { const k = R.scale || 1; if (k !== 1) ['E', 'G', 'P'].forEach(r => { w[r] = w[r] / k; }); }
    const K = BEAM.k, depth = BEAM.depth; inSearch = true;
    try {
      let frontier = [];
      const TB = G.trialBase(st); for (const a of cands(st, p0)) { let s2; try { s2 = G.tryFrom(TB, a); } catch (e) { continue; } const r = evalT(settleT(s2, pid), pid, w, () => settle(G.tryApply(st, a), pid)); frontier.push({ first: a, st: r.s, v: r.v + (plan && plan.denyPid !== undefined ? denyBonus(st, a, st.players[plan.denyPid]) * (W.deny || 0) : 0), done: false }); }
      if (!frontier.length) return null;
      frontier.sort((x, y) => y.v - x.v); frontier = frontier.slice(0, K); frontier.forEach(n => thaw(n.st));
      for (let d = 2; d <= depth; d++) {
        const next = [];
        for (const node of frontier) {
          if (node.done) { next.push(node); continue; }
          const s1 = simOthers(node.st, pid);
          if (s1.ended || s1.round !== st.round || G.cur(s1).id !== pid) { next.push({ first: node.first, st: s1, v: evaluate(s1, s1.players[pid], w), done: true }); continue; }
          const p1 = s1.players[pid]; let any = false;
          const TB1 = G.trialBase(s1); for (const a of cands(s1, p1)) { let s2; try { s2 = G.tryFrom(TB1, a); } catch (e) { continue; } any = true; const r = evalT(settleT(s2, pid), pid, w, () => settle(G.tryApply(s1, a), pid)); next.push({ first: node.first, st: r.s, v: r.v, done: false }); }
          if (!any) next.push({ first: node.first, st: s1, v: evaluate(s1, s1.players[pid], w), done: true });
        }
        next.sort((x, y) => y.v - x.v); frontier = next.slice(0, K); frontier.forEach(n => thaw(n.st));
      }
      return frontier[0].first;
    } finally { inSearch = false; }
  }
  function choose(st, pid, style) {
    const p = st.players[pid];
    const pd = pending(st, p); if (pd) return pd;
    const gate = !!RSo(st).gates;
    style = style || (gate ? ['greedy', 'greenG', 'blueG', 'redG'][pid % 4] : STYLES[pid % 4]); // 画面のAI席：ゲート型では混合greedy＋色寄せ（純ルート台本は弱すぎるため）
    if (style === 'greedy') { if (finalOn(st, pid)) return chooseFinal(st, pid); return (BEAM.depth > 1 && !inSearch && !inRoll) ? chooseBeam(st, pid) : chooseGreedy(st, pid); }
    if (BIAS[style]) return chooseGreedy(st, pid, BIAS[style]);
    if (GATE_STYLES.includes(style)) return chooseGate(st, pid, style);
    return chooseClassic(st, pid, style);
  }
  // ---------- O-121：最終ラウンドを最終得点で読む ----------
  // 最終ラウンドの自分の手番（保留なし）：合法手を 1 つずつ打ち、そこから最後まで全員 greedy（1 手読み）で打ち切って、自分の実際の最終得点がいちばん高い手を選ぶ。
  // 候補は greedy の評価の高い順に並べ、同点は評価の高いほう。BEAM.top>0 なら上位 top 手だけ打ち切る。finalGen は 1 手打ち切るごとに止まる（画面が固まらないよう UI が少しずつ進める）
  function finalOn(st, pid) { return BEAM.final && !inSearch && !inRoll && !st.ended && st.phase === 'play' && st.round >= (RSo(st).rounds || G.ROUNDS || 5) && !st.players[pid].pending[0]; }
  function rollout(s, seat) { let g = 0; inRoll = true; try { while (!s.ended && g++ < 3000) { const q = G.cur(s).id; const a = choose(s, q, 'greedy'); if (!a) break; try { G.apply(s, a, true); } catch (e) { break; } } } finally { inRoll = false; } return G.score(s, s.players[seat]).total; }
  function* finalGen(st, pid) {
    const p = st.players[pid], seen = new Set(), legal = [];
    for (const a of candidates(st, p)) { const k = JSON.stringify(a); if (seen.has(k)) continue; seen.add(k); if (G.surelyIllegal(st, a)) continue; let s2; try { s2 = G.tryApply(st, a); } catch (e) { continue; } legal.push({ a, s2, e: evaluate(s2, s2.players[pid], W) }); }
    if (!legal.length) { const d = BEAM.depth; return d > 1 ? chooseBeam(st, pid) : chooseGreedy(st, pid); }
    legal.sort((x, y) => y.e - x.e); if (BEAM.top > 0 && legal.length > BEAM.top) legal.length = BEAM.top;
    let best = null, bv = -Infinity; const t0 = Date.now(), B = BEAM.budget;
    for (let i = 0; i < legal.length; i++) { const c = legal[i]; if (B > 0 && i >= 12 && Date.now() - t0 > B) break; const v = rollout(c.s2, pid); c.s2 = null; if (v > bv) { bv = v; best = c; } yield legal.length; }
    return best.a;
  }
  function chooseFinal(st, pid) { const it = finalGen(st, pid); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  G.Bot = { choose, evaluate, candidates, finalOn, finalGen, STYLES, GATE_STYLES, W, BIAS, BEAM, planFor, lastPlan: null, stylesFor: (st) => (RSo(st).gates ? GATE_STYLES : STYLES) }; // W/BIAS は test/observe.js の --bw= で一時上書き
})((typeof window !== 'undefined' ? window : globalThis).G1);
