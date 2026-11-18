/* O-57：グラフィックボード（盤の表示）。共用の場（進化トラック・枠・器官・形質）を 1 枚の盤の形に並べる。
   ?board=1（盤）／?board=0（一覧）。選んだ表示は端末に記憶（g01_board＝1／0。何も無ければ一覧）。
   並べ替えるのは見た目だけ＝今の画面の部品（押せる枠・カード・title の全文）をそのまま使い、css/board.css で配置する。規則・数値・記号の中身には触らない。
   盤は見た目 B「生命」の上に作ってあるので、盤にしている間は見た目を B にそろえる（一覧に戻すと元の見た目に戻る）。
   <head> で css より先に読み、<html data-board="1"> を付ける（一覧のときは属性なし＝board.css は何も当たらない）。 */
(function () {
  'use strict';
  var KEY = 'g01_board', W = 1872, H = 960, MINZ = .6, on = false; // O-59：どの幅でも盤を出す。狭い画面では MINZ（字が読める倍率）より縮めず、盤の中を横に送る
  try {
    var q = new URLSearchParams(location.search).get('board');
    if (q === '1' || q === '0') { on = q === '1'; localStorage.setItem(KEY, q); }
    else on = localStorage.getItem(KEY) === '1';
  } catch (e) { }
  var root = document.documentElement, skinWas = null;
  // 恩寵枠（開く前）は小さくたたんでおく。見出しを押すと広げる／たたむ（端末に記憶 g01_grace＝1 で広げたまま）
  var GKEY = 'g01_grace', graceOpen = false; try { graceOpen = localStorage.getItem(GKEY) === '1'; } catch (e) { }
  function applyGrace() { if (graceOpen) root.setAttribute('data-grace', 'open'); else root.removeAttribute('data-grace'); }
  document.addEventListener('click', function (ev) { var t = ev.target; if (!on || !t || !t.closest || !t.closest('.panel.excl .glabel')) return; graceOpen = !graceOpen; try { localStorage.setItem(GKEY, graceOpen ? '1' : '0'); } catch (e) { } applyGrace(); });
  applyGrace();
  // 特殊器官はふだん出さず、器官の場の右上のボタンで重ねて出す（端末に記憶 g01_sporgan＝1 で出したまま）。画面は描き直すたびに作り直されるので、器官の場が現れたらボタンを置き直す
  var SKEY = 'g01_sporgan', spOpen = false; try { spOpen = localStorage.getItem(SKEY) === '1'; } catch (e) { }
  function applySp() { if (spOpen) root.setAttribute('data-sporgan', 'open'); else root.removeAttribute('data-sporgan'); }
  function placeSp() {
    if (!on) return; var f = document.querySelector('#app .panel.ofieldp'); if (!f || f.querySelector(':scope > .sptog')) return;
    var o = f.querySelector(':scope > .owned'); if (!o) return;
    var hd = o.querySelector(':scope > b'), m = hd && /残り\s*(\d+)/.exec(hd.textContent || '');
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sptog'; b.title = '特殊器官（代謝 Lv4 に達した順に 1 枚）を出す／しまう';
    b.appendChild(document.createTextNode('特殊器官')); if (m) { var n = document.createElement('i'); n.textContent = m[1]; b.appendChild(n); }
    b.addEventListener('click', function () { spOpen = !spOpen; try { localStorage.setItem(SKEY, spOpen ? '1' : '0'); } catch (e) { } applySp(); });
    f.appendChild(b);
  }
  applySp();
  if (window.MutationObserver) new MutationObserver(placeSp).observe(document.documentElement, { childList: true, subtree: true });
  function active() { return on; }
  // 盤は 1872×960 で設計してあり、画面に合わせて全体を拡大・縮小する（幅に合わせ、縦に収まらなければ 9 割まで縮める）
  function fit() {
    if (!active()) return;
    var app = document.getElementById('app'); var w = (app && app.clientWidth) || window.innerWidth;
    var hd = document.getElementById('hdr'); var wf = (w - 24) / W, hf = (window.innerHeight - Math.min((hd && hd.offsetHeight) || 0, 170) - 34) / H; // ヘッダが伸びても（AI の手の一覧など）盤の大きさは変えない
    root.style.setProperty('--bz', String(Math.max(MINZ, Math.max(Math.min(wf, hf), wf * .9)).toFixed(4)));
  }
  function apply() {
    if (active()) {
      root.setAttribute('data-board', '1');
      if (window.G1Skin && window.G1Skin.get() !== 'b') { if (skinWas === null) skinWas = window.G1Skin.get(); root.setAttribute('data-skin', 'b'); }
      fit();
    } else {
      root.removeAttribute('data-board');
      if (skinWas !== null && window.G1Skin) { var s = window.G1Skin.get(); if (s) root.setAttribute('data-skin', s); else root.removeAttribute('data-skin'); skinWas = null; }
    }
  }
  function set(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { } apply(); }
  // ヘッダ右上（見た目の切り替えの左）に置く切り替え（表示：一覧／盤）。after＝切り替えた後に呼ぶ（画面の描き直し）
  function toggle(after) {
    var wrap = document.createElement('span'); wrap.className = 'skintog boardtog'; wrap.appendChild(document.createTextNode('表示'));
    var box = document.createElement('span'); box.className = 'vtog';
    [[false, '一覧', '今の一覧の画面'], [true, '盤', '共用の場を 1 枚の盤の形に並べる（狭い画面では横に送って見る）']].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = k[1]; b.title = k[2]; if (k[0] === on) b.className = 'on';
      b.addEventListener('click', function () { set(k[0]); if (typeof after === 'function') after(); });
      box.appendChild(b);
    });
    wrap.appendChild(box); if (typeof after === 'function') window.G1Board.rerender = after;
    if (active()) (window.requestAnimationFrame || setTimeout)(fit); // ヘッダの高さが決まってから合わせ直す
    return wrap;
  }
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  apply();
  // on()＝盤で描くか（ui.js が器官の場と形質プールを両方出す・記号の表示にそろえるために見る）
  window.G1Board = { on: active, set: set, toggle: toggle, fit: fit, rerender: null };
})();
