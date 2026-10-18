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
    const img = h('img', { class: 'art ' + (cls || ''), alt: '', loading: 'lazy', src: ART_REAL + id + '.png' });
    img.addEventListener('error', () => { if (img.dataset.ph) { img.remove(); return; } img.dataset.ph = '1'; img.src = ART_PH + id + '.svg'; });
    return img;
  }
  const SPECIES_ART = { wing: 'species_wing', arm: 'species_arm', ant: 'species_ant', manta: 'species_manta' };
  const RES_JP = { E: 'E', G: 'G', P: 'P', L: 'L', coop: '協調' };
  const ICO = { E: 'ico-e', G: 'ico-g', P: 'ico-pop', L: 'ico-life', coop: 'ico-coord', gem: 'ico-gem', W: 'ico-w' };
  const ic = (k, n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic ' + k); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + (ICO[k] || 'ico-gem')); s.appendChild(u); const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = ({ E: 'エネルギー', G: '遺伝子', P: '個体数', L: '生命核', coop: '協調', gem: '宝石', W: 'ワーカー' })[k] || k; s.appendChild(t); if (n === undefined) return s; const f = document.createDocumentFragment(); f.appendChild(s); f.appendChild(document.createTextNode(String(n))); return f; };
  const icost = (txt) => { // "E5+G1" 等をアイコン化
    const frag = document.createDocumentFragment();
    String(txt).split(/\s*[+＋]\s*/).forEach((part, i) => { const m = part.match(/^([EGPL])(\d+)$/); if (i) frag.appendChild(document.createTextNode('+')); if (m) { frag.appendChild(ic(m[1])); frag.appendChild(document.createTextNode(m[2])); } else frag.appendChild(document.createTextNode(part)); });
    return frag;
  };

  // ---------- ゲームモデル ----------
  let game = null; // { kind:'local'|'online', meta, entries } / { kind:'online', code }
  let st = null;   // 再構築した状態
  let logOpen = true; let tab = 'organ';
  function rebuildState() {
    if (!game) { st = null; return; }
    st = game.kind === 'online' ? Net.rebuild() : G.rebuild(game.meta, game.entries);
    if (st && st.rejected && st.rejected.length) console.warn('rejected entries', st.rejected);
  }
  function isOnline() { return game && game.kind === 'online'; }
  function isBot(pid) { const m = isOnline() ? Net.meta : (game && game.meta); return !!(m && m.bots && m.bots.includes(pid)); }
  function mine(pid) { if (isBot(pid)) return false; if (!isOnline()) return true; return Net.mySeats().includes(pid); }
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
      let e = null;
      if (st.phase === 'setup') {
        if (st.setupStep === 'species') { const taken = st.players.map(q => q.species); const id = Object.keys(G.SPECIES).find(k => !taken.includes(k)); e = { type: 'species', pid, species: id }; }
        else if (st.setupStep === 'armTrait') e = { type: 'startTrait', pid, trait: 'IG' };
        else if (st.setupStep === 'draft') { const need = G.HAND_SIZE[st.nPlayers]; e = { type: 'draft', pid, cards: st.shared.cardPool.slice(0, need) }; }
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
  const lOpts = (p, res) => Array.from({ length: p.L + 1 }, (_, i) => ({ value: i, label: i === 0 ? '使わない' : `L${i}（=${res || 'E'}${i * 3}）` }));
  const resSel = (name, label, value) => ({ type: 'select', name, label, value: value || 'E', options: [{ value: 'E', label: 'E' }, { value: 'G', label: 'G' }, { value: 'P', label: 'P' }] });
  // 選択中の形質の効果（先着なら強・後続なら弱）を項目の下に表示する
  const traitDesc = (p, name) => (v) => { const t = v[name]; if (!t || !G.TRAITS[t]) return ''; const c = G.traitCost(st, p, t); return `${c.strong ? '強' : '弱'}：${c.strong ? G.TRAITS[t].strong : G.TRAITS[t].weak}`; };
  const traitSel = (p, name, label, filter) => ({ type: 'select', name, label, options: G.TRAIT_ORDER.filter(t => !G.trait(p, t) && (!filter || filter(t))).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（G${G.traitCost(st, p, t).G}）` })), desc: traitDesc(p, name) });
  // sel＝形質を選ぶ項目名。指定時はその項目で IM／DA を選んだときだけ表示する
  const imSel = (sel) => Object.assign(resSel('res', '代謝亢進(IM)の資源'), sel ? { when: v => v[sel] === 'IM' } : {});
  const daSel = (sel) => Object.assign({ type: 'select', name: 'track', label: '適応効率(DA)のトラック', options: G.TRACKS.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }, sel ? { when: v => v[sel] === 'DA' } : {});

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
    box.appendChild(metaForm('ローカル（この端末だけ・パス＆プレイ）', '開始', async (meta) => { game = { kind: 'local', meta, entries: [] }; rebuildState(); autosave(); render(); }));
    const on = h('div', { class: 'sec' }, h('h3', null, 'オンライン（各自の端末から参加）'));
    if (!Net.init()) on.appendChild(h('p', { class: 'warn' }, Net.error + '。手順は README を参照。'));
    else {
      on.appendChild(metaForm('新しいルームを作る', 'ルーム作成', async (meta) => { try { const code = await Net.createRoom(meta); game = { kind: 'online', code }; bindNet(); toast('ルーム ' + code + ' を作成'); } catch (e) { toast(e.message, true); } }));
      const jf = h('form', { class: 'sec' }, h('label', { class: 'frow' }, h('span', null, 'ルームコード'), h('input', { type: 'text', name: 'code', placeholder: '例 ABC12', value: (localStorage.getItem('g01_room') || '') })), h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, '参加')));
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
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'セットアップ'), h('select', { name: 'mode' }, h('option', { value: 'beginner' }, '初心者（宝石コンボ・器官の場を固定）'), h('option', { value: 'expert' }, '熟練者（宝石コンボ・器官の場を抽選）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, '資源スロット'), h('select', { name: 'slots' }, h('option', { value: 'v7' }, '現行（7スロット・各1人）'), h('option', { value: 'm4' }, '統合4（E系／G系／P系／全資源・各1人・試作）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'アンドゥ'), h('select', { name: 'undoMode' }, h('option', { value: 'free' }, '自由（誰でも即時）'), h('option', { value: 'approve' }, '承認（他の参加者全員のOK）'))));
    form.appendChild(h('label', { class: 'frow' }, h('span', null, 'シード'), h('input', { type: 'number', name: 'seed', value: Math.floor(Math.random() * 100000) })));
    for (let i = 0; i < 4; i++) form.appendChild(h('label', { class: 'frow' }, h('span', null, `P${i + 1} 名前`), h('input', { type: 'text', name: 'name' + i, value: 'P' + (i + 1) }), h('small', null, h('label', { title: '簡易AIが操作（ソロ検証用）' }, h('input', { type: 'checkbox', name: 'bot' + i }), 'AI'))));
    form.appendChild(h('div', { class: 'mbtns' }, h('button', { type: 'submit', class: 'primary' }, okLabel)));
    form.addEventListener('submit', ev => { ev.preventDefault(); const fd = new FormData(form); const n = +fd.get('n'); const players = []; for (let i = 0; i < n; i++) players.push({ name: fd.get('name' + i) || 'P' + (i + 1), passive: true }); const bots = []; for (let i = 0; i < n; i++) if (fd.get('bot' + i) === 'on') bots.push(i); onOk({ seed: +fd.get('seed'), mode: fd.get('mode'), slots: fd.get('slots') || 'v7', undoMode: fd.get('undoMode'), players, bots }); });
    return form;
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
      Object.entries(G.SPECIES).forEach(([id, sp]) => box.appendChild(h('button', { class: 'bigbtn withart', disabled: taken.includes(id), onclick: () => submit({ type: 'species', pid: i, species: id }) }, art(SPECIES_ART[id], 'portrait'), h('b', null, sp.name), h('em', { class: 'sptype' }, sp.type), h('span', null, `手番値${sp.order}・初期 E${sp.stock.E}/G${sp.stock.G}/P${sp.stock.P}`), h('small', { class: 'sphint' }, sp.hint), h('small', null, 'パッシブ：' + sp.passive))));
    } else if (st.setupStep === 'armTrait') {
      const i = st.setupIdx; const pl = st.players[i];
      box.appendChild(h('h2', null, `${pl.name}（九腕知性体）：初期形質を1枚選択（G4以下）`));
      if (!mine(i)) { box.appendChild(h('p', { class: 'note' }, `${pl.name} の端末で選択中です`)); return box; }
      G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4).forEach(t => box.appendChild(h('button', { class: 'bigbtn', onclick: () => submit({ type: 'startTrait', pid: i, trait: t }) }, h('b', null, `${t} ${G.TRAITS[t].name}`), h('small', null, G.TRAITS[t].strong))));
    } else if (st.setupStep === 'draft') {
      const order = st.setupOrder; const i = order[st.setupIdx]; const pl = st.players[i]; const need = G.HAND_SIZE[n];
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
    const st0 = [p.passive ? 'パッシブ：' + sp.passive : 'パッシブ無し'];
    G.TRACKS.forEach(t => { if (p.lv[t] > 1) st0.push(`${G.TRACK_INFO[t].name}Lv${p.lv[t]}`); });
    if (p.coop) st0.push(`協調${p.coop}`);
    if (p.traits.length) st0.push('形質 ' + p.traits.map(t => `${t.id} ${G.TRAITS[t.id].name}`).join('・'));
    box.appendChild(h('div', { class: 'note' }, st0.join('／')));
    box.appendChild(h('div', { class: 'note' }, sp.hint));
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
    hd.appendChild(h('b', null, 'game01 モック'));
    hd.appendChild(h('a', { href: '../guide/', target: '_blank', rel: 'noopener', class: 'rulelink' }, 'ルール'));
    if (!st || st.phase !== 'play') { if (game && isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code)); if (game) hd.appendChild(h('span', { class: 'hbtns' }, h('button', { onclick: quit }, '退出／新規'))); return; }
    hd.appendChild(h('span', { class: 'pill' }, `ラウンド ${st.round}/${G.ROUNDS}`));
    if (isOnline()) hd.appendChild(h('span', { class: 'pill' }, 'ルーム ' + game.code));
    const to = h('span', { class: 'order' }, '手番順：');
    st.turnOrder.forEach((pid, i) => { const q = st.players[pid]; to.appendChild(h('span', { class: 'chip' + (i === st.cur ? ' now' : '') + (q.left.W + q.left.AT === 0 ? ' done' : '') }, h('span', { class: 'mk p' + q.id }, q.id + 1), `${q.name} W${q.left.W}/AT${q.left.AT}`)); });
    hd.appendChild(to);
    const btns = h('span', { class: 'hbtns' });
    btns.appendChild(h('button', { title: '直前の1手を取り消す', onclick: () => submit({ type: 'undo' }) }, '1手戻す'));
    btns.appendChild(h('button', { title: 'このラウンドの頭（収入直後）まで戻す', onclick: () => { if (confirm('ラウンドの頭まで戻しますか？')) submit({ type: 'undoRound' }); } }, 'ラウンド頭へ'));
    btns.appendChild(h('button', { onclick: () => { logOpen = !logOpen; render(); } }, logOpen ? 'ログを隠す' : 'ログ'));
    btns.appendChild(h('button', { onclick: exportJson }, '保存(JSON)'));
    btns.appendChild(h('button', { onclick: exportCsv }, 'ログCSV'));
    btns.appendChild(h('button', { title: '検証用：手番プレイヤーの資源を書き換える（ログに残ります）', onclick: debugPanel }, 'デバッグ'));
    btns.appendChild(h('button', { onclick: quit }, '退出／新規'));
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
  function renderUndoBanner() {
    const u = st.pendingUndo; const isMine = u.uid === Net.uid; const oks = Net.oksFor(u.id);
    return h('div', { class: 'banner' }, `アンドゥ要求（${u.type === 'undo' ? '1手' : 'ラウンド頭'}）が承認待ち：承認 ${oks.length}/${Net.otherUids(u.uid).length}　`,
      !isMine && !oks.includes(Net.uid) ? h('button', { class: 'primary', onclick: () => submit({ type: 'undoOk', target: u.id }) }, '承認する') : null,
      isMine ? h('button', { onclick: () => submit({ type: 'undoCancel', target: u.id }) }, '取り下げる') : null);
  }
  function renderResult() {
    const box = h('div', { class: 'result' }, h('h2', null, '最終結果'));
    const tb = h('table', null, h('tr', null, ...['順位', '名前', '合計', '宝石', '仮想', '係数', '宝石点', '発展度', '体制'].map(x => h('th', null, x))));
    st.result.forEach((r, i) => tb.appendChild(h('tr', null, ...[i + 1, r.name, r.total, r.real, r.vg, '×' + r.cf, r.core, r.dev, r.reg].map(x => h('td', null, String(x))))));
    box.appendChild(tb);
    if (st.hist && st.hist.length) {
      const hb = h('div', { class: 'hist' }, h('h3', null, 'ラウンド推移（各ラウンド開始時の得点）'));
      const t2 = h('table', null, h('tr', null, h('th', null, 'R'), ...st.players.map(p => h('th', null, p.name))));
      st.hist.forEach(hh => t2.appendChild(h('tr', null, h('td', null, hh.label || ('R' + hh.round)), ...hh.rows.map(r => h('td', { title: `E${r.E} G${r.G} P${r.P}｜Lv${r.lv}｜宝石${r.gems}+${r.vg}｜×${r.coef}` }, String(r.score))))));
      hb.appendChild(t2); hb.appendChild(chart(st.hist)); box.appendChild(hb);
    }
    return box;
  }
  function chart(hist) {
    const W = 720, H = 220, L = 40, B = 24; const svgNS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('class', 'chart'); s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const max = Math.max(50, ...hist.flatMap(hh => hh.rows.map(r => r.score))); const n = hist.length;
    const x = i => L + (W - L - 10) * (n > 1 ? i / (n - 1) : 0), y = v => H - B - (H - B - 10) * v / max;
    const colors = ['#e4b400', '#333', '#8e44ad', '#e67e22'];
    [0, 0.5, 1].forEach(f => { const ln = document.createElementNS(svgNS, 'line'); ln.setAttribute('x1', L); ln.setAttribute('x2', W - 10); ln.setAttribute('y1', y(max * f)); ln.setAttribute('y2', y(max * f)); ln.setAttribute('stroke', '#eee'); s.appendChild(ln); const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', 2); tx.setAttribute('y', y(max * f) + 4); tx.setAttribute('font-size', '10'); tx.textContent = Math.round(max * f); s.appendChild(tx); });
    st.players.forEach((p, pi) => { const pl = document.createElementNS(svgNS, 'polyline'); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', colors[pi]); pl.setAttribute('stroke-width', '2'); pl.setAttribute('points', hist.map((hh, i) => `${x(i)},${y(hh.rows[pi].score)}`).join(' ')); s.appendChild(pl); const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', x(n - 1) - 30); tx.setAttribute('y', y(hist[n - 1].rows[pi].score) - 4); tx.setAttribute('font-size', '10'); tx.setAttribute('fill', colors[pi]); tx.textContent = p.name; s.appendChild(tx); });
    hist.forEach((hh, i) => { const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('x', x(i) - 6); tx.setAttribute('y', H - 8); tx.setAttribute('font-size', '10'); tx.textContent = hh.label || 'R' + hh.round; s.appendChild(tx); });
    return s;
  }

  // 事前判定：実行できるか（できなければ理由）
  function check(action) { try { G.tryApply(st, action); return null; } catch (e) { return e.message; } }
  function actBtn(attrs, reason, ...kids) { const b = h('button', attrs, ...kids); if (reason) { b.classList.add('na'); b.title = (b.title ? b.title + '\n' : '') + '× ' + reason; } return b; }

  const REW_SHORT = {
    body:   { 2: 'P+8', 3: ['大量消費×1無料', 'P+15'], 4: '大量消費-5', 5: ['大量消費 排他無視+-5', '大量消費-5'] },
    intel:  { 2: 'G+3', 3: ['形質1枚 G-3', 'G+1/R'], 4: '追加行動×1 E半額', 5: ['形質-2・常に強', 'G+6'] },
    social: { 2: '協調+1', 3: ['協調+2', '協調+1 G+3'], 4: 'Wなし実行権+1', 5: ['協調+1 権+2', '協調+1 権+1'] },
    metab:  { 2: 'E収入+1', 3: ['E・G収入+1', 'E+8'], 4: 'E↔G無料変換', 5: ['収入全種+2', '収入全種+1'] },
  };
  let roMsg = '他プレイヤーの手番'; // 操作できないときの理由表示（ドラフト中の参照表示で差し替え）
  function renderTracks(p, can) {
    const box = h('div', { class: 'panel tracksp' }, h('h3', null, '進化トラック', h('small', { class: 'sub' }, '　次の段（点線）をクリックで進行（W必須・排他なし）。★＝宝石・先着は強い報酬')));
    G.TRACKS.forEach(t => {
      const info = G.TRACK_INFO[t]; const nxt = p.lv[t] + 1;
      const reason = can ? check({ pid: p.id, type: 'track', track: t, pay: 'E', useL: Math.min(p.L, 3) }) : roMsg;
      const lane = h('div', { class: 'lane lane-' + info.color });
      lane.appendChild(h('div', { class: 'lane-lbl' }, h('b', null, info.name), h('small', null, `${info.jp}宝石`)));
      const body = h('div', { class: 'lane-body' });
      for (let l = 1; l <= 5; l++) {
        if (l > 1) body.appendChild(h('div', { class: 'conn' }, h('span', null, '▶'), h('small', null, `${G.STEP_COST[l - 1]}E`)));
        const isNext = l === nxt; const cost = isNext ? G.stepCost(p, t) : null; const r = REW_SHORT[t][l];
        const node = h('div', { class: 'node' + (isNext ? ' next' : '') + (isNext && reason ? ' na' : '') + (l === 3 || l === 5 ? ' star' : ''), title: `Lv${l}：${G.TRACK_REWARDS[t][l] || '開始'}${isNext ? `\nコスト E${cost}${t === 'body' ? '／P' + cost * 3 : t === 'intel' ? '／G' + cost : ''}` : ''}${isNext && reason ? '\n× ' + reason : ''}`, onclick: isNext && can ? () => onTrack(p, t) : null });
        node.appendChild(h('div', { class: 'node-lv' }, `Lv${l}`, (l === 3 || l === 5) ? ic('gem') : null, l === 4 ? '↗' : ''));
        if (Array.isArray(r)) node.appendChild(h('div', { class: 'node-rew' }, h('span', { class: 'rs' }, '先着 ' + r[0]), h('span', { class: 'rw' }, '後着 ' + r[1])));
        else if (r) node.appendChild(h('div', { class: 'node-rew' }, h('span', null, r)));
        else node.appendChild(h('div', { class: 'node-rew' }, h('span', null, 'START')));
        const mks = h('div', { class: 'node-mk' }); st.players.forEach(q => { if (q.lv[t] === l) mks.appendChild(h('span', { class: 'mk p' + q.id, title: q.name }, q.id + 1)); });
        if ((l === 3 || l === 5) && st.shared.firsts[t + l] !== undefined) mks.appendChild(h('small', { class: 'first' }, `先着:${st.players[st.shared.firsts[t + l]].name}`));
        node.appendChild(mks);
        body.appendChild(node);
      }
      lane.appendChild(body); box.appendChild(lane);
    });
    box.appendChild(h('p', { class: 'note' }, 'コンボ：' + G.comboNames(st).join('／') + '　（対応色の宝石を揃えると仮想宝石+1）'));
    return box;
  }

  const TIPS = {
    E5: '固定E強：+5E（協調ぶん+E）', EG: '群体E：+2E＋個体数10ごとに+1E', G3: '固定G強：+3G', GG: '群体G：+1G＋個体数10ごとに+1G', P8: 'P増加：+8P', ALL: '全資源獲得：+2E+1G+4P（協調ぶんは好きな資源）', PB: 'Pブースト購入：G2→P+10（協調対象外）',
    MB: '大量消費(身体)：P20→赤宝石+1', MI: '大量消費(知性)：P20→G4以下の形質を異なる2種（排他不要）', MS: '大量消費(社会)：P20→協調+2', MM: '大量消費(代謝)：P20→E+10 G+10',
    TRT: '形質購入：形質プールのカードをクリック。アップグレードは取得済みカードをクリック', GEM: '宝石セット得点カード：G(10−形質数・下限5)→仮想宝石+1（自分専用）',
    BRD: '繁殖変換：P30→係数×4／P50→×5（W必須・ATが残っていること）', ORG: '器官建造：器官の場のカードをクリック', SCAN: '環境スキャン：E5→他プレイヤーの最高Lv×2の資源（自分は除く）', ADP: '適応進化：生命核1→Lv1のトラックを+1（W必須）', CNV: '資源変換：E2→G1／G2→E1／P8→E3／P8→G2', RSV: '予備動員：無料でE+2またはG+1',
  };
  function slotButton(p, can, s, onclick, extra) {
    const used = G.slotUsedBy(st, s.id);
    const reason = !can ? roMsg : (s.id === 'TRT' || s.id === 'ORG' || s.id === 'TRK') ? null : check(sample(p, s.id));
    return actBtn({ class: 'slot' + (used !== undefined ? ' used' : ''), title: TIPS[s.id] || s.text, onclick }, reason, h('b', null, s.name), h('small', null, icost(s.text)), used !== undefined ? h('em', null, h('span', { class: 'mk p' + used }, used + 1), ` ${st.players[used].name} 使用`) : null, extra || null);
  }
  function sample(p, id) { // 事前判定用の代表アクション
    const pid = p.id;
    if (G.RES_SLOTS.includes(id)) return { pid, type: 'res', slot: id, coopRes: 'E', useL: p.L > 0 };
    if (id === 'PB') return { pid, type: 'res', slot: 'PB' };
    if (['MB', 'MI', 'MS', 'MM'].includes(id)) return { pid, type: 'mass', kind: id, traits: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).slice(0, 2) };
    if (id === 'GEM') return { pid, type: 'gemset', useL: Math.min(p.L, 3) };
    if (id === 'BRD') return { pid, type: 'breed' };
    if (id === 'SCAN') { const c = G.scanCandidates(st, p); return { pid, type: 'scan', target: c[0] || { pid: -1, track: 'body' }, useL: Math.min(p.L, 2) }; }
    if (id === 'ADP') { const l = G.TRACKS.find(t => p.lv[t] === 1); return { pid, type: 'adapt', track: l || 'body' }; }
    if (id === 'CNV') { const k = p.E >= 2 ? 'EG' : p.G >= 2 ? 'GE' : 'PE'; return { pid, type: 'convert', kind: k, n: 1 }; }
    return { pid, type: 'reserve', res: 'E' };
  }
  function renderExcl(p, can) {
    const m4 = st.slotSet === 'm4';
    const box = h('div', { class: 'panel excl' }, h('h3', null, '早取り盤', h('small', { class: 'sub' }, m4 ? '　資源獲得は4枠（E系／G系／P系／全資源）・各枠1ラウンドに1人、枠内のどちらかを選ぶ。使用済み枠は生命核1の「緊急発進」で突破可（Pブーストは不可）' : '　各スロットは1ラウンドに1人だけ。使用済みは生命核1の「緊急発進」で資源獲得スロットのみ突破可')));
    const g1 = h('div', { class: 'sgroup' }, h('h4', null, m4 ? '資源獲得（統合4・試作）' : '資源獲得'));
    const resBtn = (s, used) => slotButton(p, can, s, () => onSlot(p, s.id), used !== undefined && G.RES_SLOTS.includes(s.id) && p.L > 0 ? h('small', { class: 'bypass' }, '緊急発進可（L1）') : null);
    if (m4) Object.entries(G.RES_GROUPS).forEach(([gid, grp]) => { const used = st.shared.used[gid]; const gb = h('div', { class: 'merged' + (used !== undefined ? ' used' : '') }, h('h5', null, grp.name)); grp.slots.forEach(id => gb.appendChild(resBtn(G.SLOT_BY_ID[id], used))); g1.appendChild(gb); });
    else G.SLOTS.filter(s => s.group === 'res').forEach(s => g1.appendChild(resBtn(s, st.shared.used[s.id])));
    const g2 = h('div', { class: 'sgroup' }, h('h4', null, '大量消費（P20）'));
    G.SLOTS.filter(s => s.group === 'mass').forEach(s => g2.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))));
    const g3 = h('div', { class: 'sgroup' }, h('h4', null, 'その他'));
    G.SLOTS.filter(s => s.group === 'oth').forEach(s => g3.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))));
    box.appendChild(g1); box.appendChild(g2); box.appendChild(g3); return box;
  }
  function renderShared(p, can) {
    const box = h('div', { class: 'panel shared2' }, h('h3', null, '共用盤', h('small', { class: 'sub' }, '　何人でも・何回でも（トークンがある限り）')));
    const g = h('div', { class: 'sgroup' });
    G.SLOTS.filter(s => ['trk', 'org', 'cu'].includes(s.group) && s.id !== 'TRK').forEach(s => g.appendChild(slotButton(p, can, s, () => onSlot(p, s.id))));
    box.appendChild(g); return box;
  }
  function renderOrganField(p, can) {
    const box = h('div', { class: 'panel' }, h('h3', null, `器官の場（${st.shared.lineages.map(l => G.LINEAGES[l]).join('・')}・排他なし）`, h('small', { class: 'sub' }, '　系統内は階層順。先着＝強・後続＝弱（G0）。同系統3枚で係数+1、4系統で体制完成')));
    const grid = h('div', { class: 'ogrid' });
    st.shared.organField.forEach(id => {
      const o = G.ORGANS[id]; const c = G.organCost(st, p, id); const mine_ = G.organ(p, id); const first = st.shared.organFirst[id];
      const reason = !can ? '他プレイヤーの手番' : !c ? (mine_ ? '建造済み' : '階層順で未解放') : check({ pid: p.id, type: 'organ', organ: id, useL: Math.min(p.L, 2), li2Res: 'E', li3Res: 'E', regimeRes: 'E' });
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, c ? icost(`E${c.E}${c.G ? '+G' + c.G : ''}`) : (mine_ ? '建造済' : `T${o.tier}`)), h('span', { class: 'sw ' + (c ? (c.strong ? 'strong' : 'weak') : '') }, c ? (c.strong ? '強' : '弱') : `${G.LINEAGES[o.lin]}`));
      grid.appendChild(actBtn({ class: 'ocard' + (mine_ ? ' mine' : ''), title: `${id} ${o.name}（${G.LINEAGES[o.lin]}系 T${o.tier}）\n強：${o.strong}\n弱：${o.weak}`, onclick: () => onOrgan(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${o.name}`), h('small', null, `強：${o.strong}`), h('small', null, `弱：${o.weak}`),
        first !== undefined ? h('small', { class: 'first' }, `先着:${st.players[first].name}`) : null));
    });
    box.appendChild(grid); return box;
  }
  function renderTraitPool(p, can) {
    const box = h('div', { class: 'panel' }, h('h3', null, '形質プール（14種・購入は早取り）', h('small', { class: 'sub' }, '　先着＝強・後続＝弱（安い）。4枚目・8枚目で係数+1。取得済み（緑）をクリックでアップグレード')));
    const grid = h('div', { class: 'tgrid' });
    G.TRAIT_ORDER.forEach(id => {
      const t = G.TRAITS[id]; const c = G.traitCost(st, p, id); const mine_ = G.trait(p, id); const first = st.shared.traitFirst[id];
      const reason = !can ? '他プレイヤーの手番' : mine_ ? null : check({ pid: p.id, type: 'trait', trait: id, useL: Math.min(p.L, 3), res: 'E', track: 'body' });
      const hd = h('div', { class: 'hd' }, h('span', { class: 'cost' }, mine_ ? `取得済→交換` : [ic('G'), `${c.G}`, h('small', null, `（表示${t.cost[0]}/${t.cost[1]}）`)]), h('span', { class: 'sw ' + ((mine_ ? mine_.strong : c.strong) ? 'strong' : 'weak') }, (mine_ ? mine_.strong : c.strong) ? '強' : '弱'));
      grid.appendChild(actBtn({ class: 'tcard' + (mine_ ? ' mine' : ''), title: `${id} ${t.name}\n強：${t.strong}\n弱：${t.weak}`, onclick: () => onTrait(p, id) }, reason,
        hd, art(id), h('b', null, `${id} ${t.name}`), h('small', null, `強：${t.strong}`), h('small', null, `弱：${t.weak}`),
        first !== undefined ? h('small', { class: 'first' }, `先着:${st.players[first].name}`) : null));
    });
    box.appendChild(grid); return box;
  }

  function renderPlayer(p, can) {
    const sp = G.SPECIES[p.species]; const sc = G.score(st, p); const inc = G.income(p);
    const box = h('div', { class: 'panel player p' + p.id }, h('div', { class: 'phead' }, art(SPECIES_ART[p.species] || 'species_wing', 'portrait'), h('h3', null, h('span', { class: 'mk p' + p.id }, p.id + 1), ` ${can ? '手番' : isBot(p.id) ? '手番（AI）' : '手番（他端末）'}：${p.name}（${sp.name}）`, h('small', { class: 'sub' }, `　残り ${p.lRemain} ラウンド`))));
    // ① 資源トラック（E/G/P）＋生命核
    box.appendChild(h('div', { class: 'res' }, ...['E', 'G', 'P', 'L'].map(k => h('span', { class: 'rbox r' + k, title: `${RES_JP[k]}${k !== 'L' ? '　次の収入 +' + inc[k] : '　毎ラウンド+1（E3/G3代用・適応進化・緊急発進）'}` }, ic(k), h('b', null, String(p[k])), k !== 'L' ? h('small', null, `+${inc[k]}/R`) : null))));
    box.appendChild(h('div', { class: 'note', title: inc.parts.join('\n') }, `次の収入 E+${inc.E} G+${inc.G} P+${inc.P} L+1（内訳はマウスで）`));
    // ② 5コマ（係数）＋強W置き場
    const tok = h('div', { class: 'pbrow' }, h('b', null, 'コマ（係数）'));
    const left = { W: p.left.W, AT: p.left.AT };
    p.tokens.forEach((tk, i) => { const used = tk === 'AT' ? (i - p.tokens.indexOf('AT') >= p.left.AT) : false; tok.appendChild(h('span', { class: 'tokc ' + tk, title: tk === 'AT' ? 'AT：トラック進行・繁殖・適応進化には使えない' : tk === 'S' ? '強ワーカー（係数2）' : 'ワーカー（係数1）' }, ic('W'), tk === 'S' ? '強' : tk)); });
    tok.appendChild(h('span', { class: 'hl' }, `係数 ×${G.coef(p)}`)); tok.appendChild(h('span', null, `残 W${p.left.W}／AT${p.left.AT}`));
    if (p.shields) tok.appendChild(h('span', { class: 'hl' }, `Wなし実行権 ${p.shields}`));
    box.appendChild(tok);
    // ③ 協調トラック 0-8
    const co = h('div', { class: 'pbrow' }, h('b', null, ic('coop'), '協調'));
    for (let i = 0; i <= G.COOP_MAX; i++) co.appendChild(h('span', { class: 'coopc' + (i === p.coop ? ' on' : '') }, String(i)));
    box.appendChild(co);
    // ④ 宝石カウンター
    const gm = h('div', { class: 'pbrow' }, h('b', null, ic('gem'), '宝石'));
    G.TRACKS.forEach(t => gm.appendChild(h('span', { class: 'gem ' + G.TRACK_INFO[t].color, title: G.TRACK_INFO[t].name }, String(p.gems[t]))));
    gm.appendChild(h('span', null, ` 仮想 ${G.virtualGems(st, p)}（セット${p.gemsets}）`));
    box.appendChild(gm);
    box.appendChild(h('div', { class: 'score', title: `（実宝石${sc.real}＋仮想${sc.vg}）×10×係数${sc.cf}＝${sc.core}　発展度（形質${p.traits.length}＋協調${p.coop}）×7＝${sc.dev}　体制${sc.reg}` }, h('b', null, `現在 ${sc.total} 点`), h('small', null, ` ＝ 宝石${sc.core}（${sc.real}+${sc.vg}個×10×${sc.cf}）＋発展度${sc.dev}＋体制${sc.reg}`)));
    const flags = h('div', { class: 'stat' }, p.regime ? h('span', { class: 'hl' }, '体制完成') : null, p.alwaysStrong ? h('span', { class: 'hl' }, '形質常に強') : null, p.freeConv ? h('span', { class: 'hl' }, '無料E↔G変換') : null, p.wild ? h('span', { class: 'hl' }, `ワイルド色 ${G.TRACK_INFO[p.wild].jp}`) : null);
    if (flags.childNodes.length) box.appendChild(flags);
    if (p.pending.length) box.appendChild(h('div', { class: 'banner small' }, pendingText(p.pending[0]), ' ', p.pending[0].type === 'bonusAction' && can ? h('button', { onclick: () => submit({ pid: p.id, type: 'resolve', skip: true }) }, '見送る') : null));
    // ⑤ 器官（系統ごと）・形質
    const byLin = {}; p.organs.forEach(o => { (byLin[G.ORGANS[o.id].lin] = byLin[G.ORGANS[o.id].lin] || []).push(o); });
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `器官 ${p.organs.length}枚：`), ...Object.entries(byLin).map(([lin, os]) => h('span', { class: 'lin' + (os.length >= 3 ? ' done' : '') }, `${G.LINEAGES[lin]} `, ...os.map(o => h('span', { class: 'tag' + (o.strong ? ' strong' : ''), title: `${G.ORGANS[o.id].name}：${o.strong ? G.ORGANS[o.id].strong : G.ORGANS[o.id].weak}` }, `${o.id}${o.strong ? '強' : '弱'}`))))));
    box.appendChild(h('div', { class: 'owned' }, h('b', null, `形質 ${p.traits.length}枚：`), ...p.traits.map(t => h('span', { class: 'tag' + (t.strong ? ' strong' : ''), title: `${G.TRAITS[t.id].name}：${t.strong ? G.TRAITS[t.id].strong : G.TRAITS[t.id].weak}` }, `${t.id}${t.strong ? '強' : '弱'}${t.res ? '(' + t.res + ')' : ''}${t.track ? '(' + G.TRACK_INFO[t.track].jp + ')' : ''}`))));
    // ⑥ 個人カード置き場
    const cards = h('div', { class: 'cards' }, h('b', null, '個人カード（排他なし）：'));
    p.cards.forEach(c => { const reason = can ? check({ pid: p.id, type: 'card', card: c, choice: 'E' }) : '他プレイヤーの手番'; cards.appendChild(actBtn({ class: 'cardbtn', title: G.CARDS[c].text, onclick: () => onCard(p, c) }, reason, h('div', { class: 'hd' }, h('span', null, c), h('span', { class: 'sw' }, '個人')), art(c, 'small'), h('b', null, G.CARDS[c].name), h('small', null, G.CARDS[c].text))); });
    box.appendChild(cards);
    const stOrgs = p.organs.filter(o => o.id.startsWith('St'));
    if (stOrgs.length) { const sa = h('div', { class: 'cards' }, h('b', null, '器官アクション：')); stOrgs.forEach(o => { const reason = can ? check({ pid: p.id, type: 'stAct', organ: o.id, pe: o.id === 'St2' ? 0 : 2, pg: o.id === 'St2' ? 3 : 0 }) : '他プレイヤーの手番'; sa.appendChild(actBtn({ class: 'cardbtn', title: o.strong ? G.ORGANS[o.id].strong : G.ORGANS[o.id].weak, onclick: () => onStAct(p, o) }, reason, h('b', null, `${o.id} ${G.ORGANS[o.id].name}`), h('small', null, o.strong ? G.ORGANS[o.id].strong : G.ORGANS[o.id].weak))); }); box.appendChild(sa); }
    const free = h('div', { class: 'free' }, h('b', null, '無料：'));
    if (p.freeConv || (G.organ(p, 'Fl3') && G.organ(p, 'Fl3').strong)) free.appendChild(h('button', { disabled: !can, onclick: () => onFreeConv(p) }, 'E↔G 1:1変換'));
    if (p.shields > 0) free.appendChild(h('button', { disabled: !can, onclick: () => onSlot(p, null, true) }, 'Wなし実行（資源獲得スロット／個人カード・手番消費なし）'));
    if (free.childNodes.length > 1) box.appendChild(free);
    return box;
  }
  function pendingText(pd) {
    return { cvIncome: '収斂膜：収入時の追加資源を選んでください', wildColor: '共鳴膜：ワイルド色を選んでください', reMilestone: '感応系：再発動する到達済み報酬を選んでください', freeMass: '身体Lv3★先着：大量消費を1回無料で実行してください', rewardTrait: '知性Lv3★先着：形質1枚をG-3で購入できます', bonusAction: '知性Lv4↗：追加アクションを今すぐ実行してください（排他なしアクション・個人カード／Eコスト半額／トークン不要）。対象以外はグレー表示', flSwap: '収入時の転流：E↔Gを振替できます', dgBuy: 'ラウンド開始時：遺伝子図書館で形質1枚を割引購入できます' }[pd.type] || pd.type;
  }
  function renderSeatsMini() { const box = h('div', { class: 'panel others' }, h('h3', null, `ルーム ${game.code}`)); st.players.forEach((p, i) => { const s = Net.seats[i]; box.appendChild(h('div', { class: 'orow' }, h('span', { class: 'mk p' + i }, i + 1), ` ${p.name}：${s ? (s.uid === Net.uid ? '自分' : '他端末') : '空席'} `, !s ? h('button', { onclick: () => Net.claimSeat(i, p.name).catch(e => toast(e.message, true)) }, '着席') : s.uid === Net.uid ? h('button', { onclick: () => Net.releaseSeat(i) }, '離席') : null)); }); return box; }
  function renderOthers(p) {
    const box = h('div', { class: 'panel others' }, h('h3', null, '他プレイヤー'));
    st.players.filter(q => q.id !== p.id).forEach(q => box.appendChild(h('div', { class: 'orow' }, h('span', { class: 'mk p' + q.id }, q.id + 1), ' ', h('b', null, `${q.name}（${G.SPECIES[q.species].name}${isBot(q.id) ? '・AI' : ''}）`), ` ${G.score(st, q).total}点｜E${q.E} G${q.G} P${q.P} L${q.L}｜Lv ${G.TRACKS.map(t => q.lv[t]).join('/')}｜宝石${G.realGems(q)}+仮想${G.virtualGems(st, q)}｜×${G.coef(q)}｜形質${q.traits.length} 器官${q.organs.length} 協調${q.coop}｜W${q.left.W}/AT${q.left.AT}`)));
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
    const fields = [{ type: 'select', name: 'pay', label: '支払い', options: [{ value: 'E', label: `E${c}（＋生命核）` }].concat(t === 'body' ? [{ value: 'P', label: `P${c * 3}（身体の代替払い）` }] : t === 'intel' ? [{ value: 'G', label: `G${c}（知性の代替払い）` }] : []) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }];
    const r = await ask(`${G.TRACK_INFO[t].name} Lv${p.lv[t]}→${p.lv[t] + 1}`, fields, { note: `Lv${p.lv[t] + 1}の報酬：${G.TRACK_REWARDS[t][p.lv[t] + 1]}` }); if (!r) return;
    submit({ pid: p.id, type: 'track', track: t, pay: r.pay, useL: +r.useL });
  }
  async function onSlot(p, id, shield) {
    if (shield) {
      // Wなし実行（社会性の権利）：資源獲得スロット1つ or 個人カード1枚。コマを置かないのでスロットを占有しない
      const opts = G.RES_SLOTS.map(s => ({ value: s, label: G.SLOT_BY_ID[s].name + (G.slotUsedBy(st, s) !== undefined ? '（使用済・不可）' : ''), disabled: G.slotUsedBy(st, s) !== undefined }))
        .concat(p.cards.map(c => ({ value: 'card:' + c, label: `個人カード ${c} ${G.CARDS[c].name}` })));
      const r = await ask('Wなし実行：資源獲得スロット1つ または 個人カード1枚（コマを置かず・手番は消費しません）', [
        { type: 'select', name: 'slot', label: '対象', options: opts, desc: v => v.slot && v.slot.startsWith('card:') ? G.CARDS[v.slot.slice(5)].text : (TIPS[v.slot] || '') },
        Object.assign(resSel('coopRes', '協調ボーナスの資源（全資源用）'), { when: v => v.slot === 'ALL' && p.coop > 0 }),
        { type: 'select', name: 'choice', label: 'カードJの変換', options: [{ value: 'E', label: 'E-2 → P+6' }, { value: 'G', label: 'G-1 → P+5' }], when: v => v.slot === 'card:J' },
      ]); if (!r) return;
      if (r.slot.startsWith('card:')) return submit({ pid: p.id, type: 'card', card: r.slot.slice(5), choice: r.choice, shield: true });
      return submit({ pid: p.id, type: 'res', slot: r.slot, coopRes: r.coopRes, shield: true });
    }
    const s = G.SLOT_BY_ID[id];
    if (s.group === 'res') {
      const used = G.slotUsedBy(st, id) !== undefined; const fields = [];
      if (id === 'PB') return confirm(`Pブースト購入：G${G.pbCost(p)}→P+10。実行しますか？`) && submit({ pid: p.id, type: 'res', slot: 'PB' });
      if (id === 'ALL' && p.coop > 0) fields.push(resSel('coopRes', `協調ボーナス+${p.coop}の資源`));
      if (used && G.RES_SLOTS.includes(id)) fields.push({ type: 'check', name: 'useL', label: '緊急発進（生命核1で使用済みスロットを使う）', value: p.L > 0 });
      if (!fields.length) return submit({ pid: p.id, type: 'res', slot: id });
      const r = await ask(s.name, fields, { note: TIPS[id] }); if (!r) return; return submit({ pid: p.id, type: 'res', slot: id, coopRes: r.coopRes, useL: r.useL });
    }
    if (id === 'BRD') { const c = G.breedCost(p); return c !== null && confirm(`繁殖変換：P${c}を支払い係数×${G.coef(p) + 1}。実行しますか？`) && submit({ pid: p.id, type: 'breed' }); }
    if (id === 'ORG') return toast('器官の場のカードをクリックしてください');
    if (id === 'TRT') return toast('形質プールのカードをクリックしてください');
    if (s.group === 'mass') {
      if (id === 'MI') { const r = await ask('大量消費(知性)：G4以下の形質を異なる2種', [{ type: 'multi', name: 'traits', label: '形質（2つまで・Ctrlで複数選択）', options: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}` })) }], { note: `コスト P${G.massCost(p, 'MI')}` }); if (!r) return; return submit({ pid: p.id, type: 'mass', kind: 'MI', traits: r.traits.slice(0, 2) }); }
      const mc = G.massCost(p, id), floor = G.MASS_MIN[id === 'MB' ? 'body' : 'other'];
      return confirm(`${s.name}：P${mc}を支払います${mc === floor ? `（軽減後の下限P${floor}）` : ''}。実行しますか？`) && submit({ pid: p.id, type: 'mass', kind: id });
    }
    if (id === 'GEM') { const r = await ask('宝石セット得点カード', [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }], { note: `コスト G${G.gemsetPrice(p)} → 仮想宝石+1（現在 ${p.gemsets}）` }); if (!r) return; return submit({ pid: p.id, type: 'gemset', useL: +r.useL }); }
    if (id === 'SCAN') { const cands = G.scanCandidates(st, p); if (!cands.length) return toast('参照できる他プレイヤーがいません（全員Lv1）', true); const r = await ask('環境スキャン（E5）', [{ type: 'select', name: 'tgt', label: '参照先', options: cands.map((c, i) => ({ value: i, label: `${st.players[c.pid].name} の ${G.TRACK_INFO[c.track].name} Lv${c.lv} → ${RES_JP[G.TRACK_INFO[c.track].res]}+${c.lv * 2}` })) }, { type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }]); if (!r) return; return submit({ pid: p.id, type: 'scan', target: cands[+r.tgt], useL: +r.useL }); }
    if (id === 'ADP') { const lows = G.TRACKS.filter(t => p.lv[t] === 1); if (!lows.length) return toast('Lv1のトラックがありません', true); const r = await ask('適応進化（生命核1・W必須）', [{ type: 'select', name: 'track', label: 'Lv1のトラック', options: lows.map(t => ({ value: t, label: G.TRACK_INFO[t].name })) }]); if (!r) return; return submit({ pid: p.id, type: 'adapt', track: r.track }); }
    if (id === 'CNV') { const r = await ask('資源変換（1アクション1種類）', [{ type: 'select', name: 'kind', label: '変換', options: [{ value: 'EG', label: 'E2→G1' }, { value: 'GE', label: 'G2→E1' }, { value: 'PE', label: 'P8→E3' }, { value: 'PG', label: 'P8→G2' }] }, { type: 'number', name: 'n', label: '回数', value: 1, min: 1, max: 20 }]); if (!r) return; return submit({ pid: p.id, type: 'convert', kind: r.kind, n: r.n }); }
    if (id === 'RSV') { const r = await ask('予備動員（無料）', [{ type: 'select', name: 'res', label: '獲得', options: [{ value: 'E', label: 'E+2' }, { value: 'G', label: 'G+1' }] }]); if (!r) return; return submit({ pid: p.id, type: 'reserve', res: r.res }); }
  }
  async function onOrgan(p, id) {
    const c = G.organCost(st, p, id); if (!c) return toast('今は建造できません（系統内は階層順・建造済み）', true);
    const fields = [{ type: 'select', name: 'useL', label: '生命核をEの代わりに', options: lOpts(p) }];
    if (G.organ(p, 'Li2')) fields.push(resSel('li2Res', '共役組織の資源'));
    if (G.organ(p, 'Li3') && G.lineageCount(p, G.ORGANS[id].lin) === 2) fields.push(resSel('li3Res', '統合体の資源（系統完成）'));
    const lins = new Set(p.organs.map(o => G.ORGANS[o.id].lin)); lins.add(G.ORGANS[id].lin); if (lins.size >= 4 && !p.regime) fields.push(resSel('regimeRes', '体制完成の収入+1の資源'));
    const r = await ask(`器官建造 ${id} ${G.ORGANS[id].name}`, fields, { note: `コスト E${c.E}${c.G ? '+G' + c.G : ''}（${c.strong ? '強' : '弱'}）：${c.strong ? G.ORGANS[id].strong : G.ORGANS[id].weak}` }); if (!r) return;
    submit({ pid: p.id, type: 'organ', organ: id, useL: +r.useL, li2Res: r.li2Res, li3Res: r.li3Res, regimeRes: r.regimeRes });
  }
  async function onTrait(p, id) {
    if (G.trait(p, id)) {
      const from = id; const targets = G.TRAIT_ORDER.filter(t => !G.trait(p, t) && G.TRAITS[t].cost[0] > G.TRAITS[from].cost[0]);
      if (!targets.length) return toast('アップグレード先がありません', true);
      const r = await ask(`形質アップグレード：${from} を手放して上位へ`, [{ type: 'select', name: 'to', label: '上位形質', options: targets.map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}（表示G${G.TRAITS[t].cost[0]}/${G.TRAITS[t].cost[1]}）` })), desc: traitDesc(p, 'to') }, { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel('to'), daSel('to')], { note: 'コスト＝表示コストの差額＋G1（下限G1）。即時効果の形質は手放せません' }); if (!r) return;
      return submit({ pid: p.id, type: 'upgrade', from, to: r.to, useL: +r.useL, res: r.res, track: r.track });
    }
    const c = G.traitCost(st, p, id);
    const r = await ask(`形質購入 ${id} ${G.TRAITS[id].name}`, [{ type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, ...(id === 'IM' ? [imSel()] : []), ...(id === 'DA' ? [daSel()] : [])], { note: `コスト G${c.G}（${c.strong ? '強' : '弱'}）：${c.strong ? G.TRAITS[id].strong : G.TRAITS[id].weak}` }); if (!r) return;
    submit({ pid: p.id, type: 'trait', trait: id, useL: +r.useL, res: r.res, track: r.track });
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
    const r = await ask(`${o.id} ${G.ORGANS[o.id].name}`, fields, { note: (strong ? G.ORGANS[o.id].strong : G.ORGANS[o.id].weak) + '（端数は切り捨て）' }); if (!r) return;
    submit({ pid: p.id, type: 'stAct', organ: o.id, pe: r.pe | 0, pg: r.pg | 0 });
  }
  async function onFreeConv(p) { const r = await ask('無料E↔G変換', [{ type: 'select', name: 'dir', label: '方向', options: [{ value: 'EG', label: 'E→G' }, { value: 'GE', label: 'G→E' }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: 99 }]); if (!r) return; submit({ pid: p.id, type: 'freeConv', dir: r.dir, n: r.n }); }

  let pendingBusy = false;
  async function handlePending(p, pd) {
    if (pendingBusy) return; pendingBusy = true;
    try {
      if (pd.type === 'flSwap') {
        const r = await ask(`収入時の転流：E↔Gを最大${pd.max}振替（1:1）`, [{ type: 'select', name: 'dir', label: '方向', options: [{ value: 'EG', label: 'E→G' }, { value: 'GE', label: 'G→E' }] }, { type: 'number', name: 'n', label: '個数', value: 1, min: 1, max: pd.max }], { skipLabel: '振替しない', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', dir: r.dir, n: r.n });
      }
      if (pd.type === 'dgBuy') {
        const r = await ask(`ラウンド開始時：遺伝子図書館で形質1枚を-${pd.disc}Gで購入`, [traitSel(p, 'trait', '形質'), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel('trait'), daSel('trait')], { skipLabel: '買わない', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', trait: r.trait, useL: +r.useL, res: r.res, track: r.track });
      }
      if (pd.type === 'freeMass') {
        const r = await ask('身体Lv3★先着：大量消費を1回無料（排他無視）', [{ type: 'select', name: 'kind', label: '種類', options: ['MB', 'MI', 'MS', 'MM'].map(k => ({ value: k, label: G.SLOT_BY_ID[k].name + '：' + G.SLOT_BY_ID[k].text })) }, { type: 'multi', name: 'traits', label: '（知性のとき）G4以下の形質2種', options: G.TRAIT_ORDER.filter(t => G.TRAITS[t].cost[0] <= 4 && !G.trait(p, t)).map(t => ({ value: t, label: `${t} ${G.TRAITS[t].name}` })) }], { noCancel: true });
        if (!r) return; return submit({ pid: p.id, type: 'resolve', kind: r.kind, traits: r.traits });
      }
      if (pd.type === 'rewardTrait') {
        const r = await ask('知性Lv3★先着：今すぐ形質1枚をG-3で購入できます', [traitSel(p, 'trait', '形質', null), { type: 'select', name: 'useL', label: '生命核をGの代わりに', options: lOpts(p, 'G') }, imSel('trait'), daSel('trait')], { skipLabel: '見送る', noCancel: true });
        if (!r || r.__skip) return submit({ pid: p.id, type: 'resolve', skip: true }); return submit({ pid: p.id, type: 'resolve', trait: r.trait, useL: +r.useL, res: r.res, track: r.track });
      }
      if (pd.type === 'cvIncome') { const r = await ask(`収斂膜：好きな資源+${pd.n}`, [resSel('res', '資源')], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', res: r.res }); }
      if (pd.type === 'wildColor') { const r = await ask('共鳴膜：ワイルド扱いにする色（自分の2色コンボ判定）', [{ type: 'select', name: 'track', label: '色', options: G.TRACKS.map(t => ({ value: t, label: `${G.TRACK_INFO[t].jp}（${G.TRACK_INFO[t].name}）` })) }], { noCancel: true }); if (!r) return; return submit({ pid: p.id, type: 'resolve', track: r.track }); }
      if (pd.type === 'reMilestone') { const ms = G.reachedMilestones(p); const r = await ask(`${G.ORGANS[pd.organ].name}：到達済み報酬を再発動（${pd.organ === 'Re3' && pd.strong ? '強版' : '弱版'}）`, [{ type: 'select', name: 'm', label: '報酬', options: ms.map((m, i) => ({ value: i, label: `${G.TRACK_INFO[m.track].name} Lv${m.lv}★：${G.TRACK_REWARDS[m.track][m.lv]}` })) }], { noCancel: true }); if (!r) return; const m = ms[+r.m]; return submit({ pid: p.id, type: 'resolve', track: m.track, lv: m.lv }); }
      if (pd.type === 'bonusAction') { toast('知性Lv4↗：追加アクションを今すぐ選んでください（対象以外はグレー表示）'); }
    } finally { pendingBusy = false; }
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
    const meta = { seed, mode: q.get('mode') || 'expert', slots: q.get('slots') || 'v7', undoMode: 'free', players: Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), passive: true })), bots };
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
