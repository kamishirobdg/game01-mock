/* game01 デジタルモック — オンライン同期（Firebase Realtime Database）
   共有するのは「エントリ列」（セットアップ＋アクション＋アンドゥ）だけ。各端末は先頭から再生して状態を作る。
   rooms/{code}/meta   : { seed, mode, slots('v7'|'m4'), rules('v1'|'t1'), ext('none'|'x1'), undoMode, players:[{name,passive}], createdAt }
   rooms/{code}/seats  : { "0": {uid,name}, ... }   座席→端末
   rooms/{code}/entries: push({ ...entry, uid, ts })
   設定は js/config.js（window.G1_FIREBASE）。未設定ならオンライン機能は無効。 */
(function (G) {
  'use strict';
  const Net = { ready: false, uid: null, room: null, code: null, meta: null, seats: {}, entries: [], onChange: null, error: null };
  try { Net.uid = localStorage.getItem('g01_uid'); if (!Net.uid) { Net.uid = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem('g01_uid', Net.uid); } } catch (e) { Net.uid = 'u' + Math.random().toString(36).slice(2, 10); }

  function init() {
    const cfg = window.G1_FIREBASE;
    if (!cfg || !cfg.databaseURL || !window.firebase) { Net.ready = false; Net.error = 'Firebase未設定（js/config.js を作成してください）'; return false; }
    try { if (!firebase.apps.length) firebase.initializeApp(cfg); Net.db = firebase.database(); Net.ready = true; return true; }
    catch (e) { Net.error = e.message; Net.ready = false; return false; }
  }
  function ref(path) { return Net.db.ref('rooms/' + Net.code + (path ? '/' + path : '')); }
  function genCode() { const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += s[Math.floor(Math.random() * s.length)]; return c; }

  async function createRoom(meta) {
    if (!Net.ready && !init()) throw new Error(Net.error);
    const code = genCode(); Net.code = code;
    meta = Object.assign({}, meta, { createdAt: Date.now(), host: Net.uid });
    await ref().set({ meta, seats: {}, entries: {} });
    return join(code);
  }
  async function join(code) {
    if (!Net.ready && !init()) throw new Error(Net.error);
    Net.code = code.toUpperCase().trim();
    const snap = await ref('meta').get(); if (!snap.exists()) throw new Error('そのルームは存在しません');
    Net.meta = snap.val();
    leave();
    Net._refs = [ref('meta'), ref('seats'), ref('entries')];
    Net._refs[0].on('value', s => { Net.meta = s.val(); fire(); });
    Net._refs[1].on('value', s => { Net.seats = s.val() || {}; fire(); });
    Net._refs[2].on('value', s => { const v = s.val() || {}; Net.entries = Object.keys(v).sort().map(k => Object.assign({ id: k }, v[k])); fire(); });
    try { localStorage.setItem('g01_room', Net.code); } catch (e) { }
    return Net.code;
  }
  function leave() { (Net._refs || []).forEach(r => r.off()); Net._refs = null; }
  // ルームごと削除（テストで作った部屋の片付け用。コードを知っている人なら誰でも消せる）
  async function deleteRoom(code) {
    if (!Net.ready && !init()) throw new Error(Net.error);
    code = (code || '').toUpperCase().trim(); if (!code) throw new Error('ルームコードを入力してください');
    const r = Net.db.ref('rooms/' + code); const s = await r.child('meta').get(); if (!s.exists()) throw new Error('そのルームは存在しません');
    if (Net.code === code) leave();
    await r.remove();
  }
  Net.deleteRoom = deleteRoom;
  function fire() { if (Net.onChange) Net.onChange(); }
  async function claimSeat(i, name) {
    const cur = Net.seats[i]; if (cur && cur.uid !== Net.uid) throw new Error('その席は使用中です');
    await ref('seats/' + i).set({ uid: Net.uid, name: name || ('P' + (i + 1)) });
  }
  async function releaseSeat(i) { const cur = Net.seats[i]; if (cur && cur.uid === Net.uid) await ref('seats/' + i).remove(); }
  function mySeats() { return Object.entries(Net.seats || {}).filter(([, v]) => v && v.uid === Net.uid).map(([k]) => +k); }
  function seatUids() { return Array.from(new Set(Object.values(Net.seats || {}).filter(Boolean).map(v => v.uid))); }
  // Firebase は undefined を含む値を拒否する（例：Li2 を持たないときの li2Res）→ JSON 経由で undefined のキーを落とす
  async function push(entry) { await ref('entries').push(JSON.parse(JSON.stringify(Object.assign({}, entry, { uid: Net.uid, ts: Date.now() })))); }
  async function setMeta(patch) { await ref('meta').update(patch); }

  // 承認モードの補助：undo要求に対する承認uid一覧
  function oksFor(entryId) { return Net.entries.filter(e => e.type === 'undoOk' && e.target === entryId).map(e => e.uid); }
  function otherUids(uid) { return seatUids().filter(u => u !== uid); }
  function rebuild() {
    if (!Net.meta) return null;
    return G.rebuild(Net.meta, Net.entries, { otherUids, oks: oksFor });
  }

  Object.assign(Net, { init, createRoom, join, leave, claimSeat, releaseSeat, mySeats, seatUids, push, setMeta, rebuild, oksFor, otherUids });
  G.Net = Net;
})(window.G1);
