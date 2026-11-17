/* O-57：グラフィックボード（盤の表示）。共用の場（進化トラック・枠・器官・形質）を 1 枚の盤の形に並べる。
   ?board=1（盤）／?board=0（一覧）。選んだ表示は端末に記憶（g01_board＝1／0。何も無ければ一覧）。
   並べ替えるのは見た目だけ＝今の画面の部品（押せる枠・カード・title の全文）をそのまま使い、css/board.css で配置する。規則・数値・記号の中身には触らない。
   盤は見た目 B「生命」の上に作ってあるので、盤にしている間は見た目を B にそろえる（一覧に戻すと元の見た目に戻る）。
   <head> で css より先に読み、<html data-board="1"> を付ける（一覧のときは属性なし＝board.css は何も当たらない）。 */
(function () {
  'use strict';
  var KEY = 'g01_board', W = 1872, H = 960, MINW = 1100, on = false;
  try {
    var q = new URLSearchParams(location.search).get('board');
    if (q === '1' || q === '0') { on = q === '1'; localStorage.setItem(KEY, q); }
    else on = localStorage.getItem(KEY) === '1';
  } catch (e) { }
  var root = document.documentElement, skinWas = null;
  function wide() { return window.innerWidth >= MINW; } // 盤は PC 幅だけ（携帯幅は一覧のまま）
  function active() { return on && wide(); }
  // 盤は 1872×960 で設計してあり、画面に合わせて全体を拡大・縮小する（幅に合わせ、縦に収まらなければ 9 割まで縮める）
  function fit() {
    if (!active()) return;
    var app = document.getElementById('app'); var w = (app && app.clientWidth) || window.innerWidth;
    var hd = document.getElementById('hdr'); var wf = (w - 24) / W, hf = (window.innerHeight - Math.min((hd && hd.offsetHeight) || 0, 170) - 34) / H; // ヘッダが伸びても（AI の手の一覧など）盤の大きさは変えない
    root.style.setProperty('--bz', String(Math.max(.5, Math.max(Math.min(wf, hf), wf * .9)).toFixed(4)));
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
    [[false, '一覧', '今の一覧の画面'], [true, '盤', '共用の場を 1 枚の盤の形に並べる（PC 幅）']].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = k[1]; b.title = k[2]; if (k[0] === on) b.className = 'on';
      b.addEventListener('click', function () { set(k[0]); if (typeof after === 'function') after(); });
      box.appendChild(b);
    });
    wrap.appendChild(box); if (typeof after === 'function') window.G1Board.rerender = after;
    if (active()) (window.requestAnimationFrame || setTimeout)(fit); // ヘッダの高さが決まってから合わせ直す
    return wrap;
  }
  var wasWide = wide();
  window.addEventListener('resize', function () { var w = wide(); if (w !== wasWide) { wasWide = w; apply(); if (on && typeof window.G1Board.rerender === 'function') window.G1Board.rerender(); } else fit(); });
  document.addEventListener('DOMContentLoaded', fit);
  apply();
  // on()＝盤で描くか（ui.js が器官の場と形質プールを両方出す・記号の表示にそろえるために見る）
  window.G1Board = { on: active, set: set, toggle: toggle, fit: fit, rerender: null };
})();
