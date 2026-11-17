/* O-53：見た目の見本（スキン）。?skin=a（星海）／?skin=b（生命）／?skin=0（標準）。既定は標準。
   選んだ見た目は端末に記憶（g01_skin）。見た目だけを切り替える＝規則・数値・記号の中身には触らない。
   <head> で css より先に読み、<html data-skin="a|b"> を付ける（標準のときは属性なし＝skin.css は何も当たらない）。 */
(function () {
  'use strict';
  var KEY = 'g01_skin', NAMES = { '': '標準', a: 'A', b: 'B' }, TITLES = { '': '今の見た目', a: '案 A「星海」', b: '案 B「生命」' };
  var cur = '';
  try {
    var q = new URLSearchParams(location.search).get('skin');
    if (q === 'a' || q === 'b') { cur = q; localStorage.setItem(KEY, cur); }
    else if (q === '0') { cur = ''; localStorage.removeItem(KEY); }
    else { var s = localStorage.getItem(KEY); cur = (s === 'a' || s === 'b') ? s : ''; }
  } catch (e) { }
  function apply() { var r = document.documentElement; if (cur) r.setAttribute('data-skin', cur); else r.removeAttribute('data-skin'); }
  function set(v) { cur = (v === 'a' || v === 'b') ? v : ''; try { if (cur) localStorage.setItem(KEY, cur); else localStorage.removeItem(KEY); } catch (e) { } apply(); }
  // メニューに置く切り替え（見た目：標準／A／B）。after＝切り替えた後に呼ぶ（画面の描き直し）
  function toggle(after) {
    var wrap = document.createElement('span'); wrap.className = 'skintog'; wrap.appendChild(document.createTextNode('見た目'));
    var box = document.createElement('span'); box.className = 'vtog';
    ['', 'a', 'b'].forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = NAMES[k]; b.title = TITLES[k]; if (k === cur) b.className = 'on';
      b.addEventListener('click', function () { set(k); if (typeof after === 'function') after(); });
      box.appendChild(b);
    });
    wrap.appendChild(box); return wrap;
  }
  apply();
  window.G1Skin = { get: function () { return cur; }, set: set, toggle: toggle };
})();
