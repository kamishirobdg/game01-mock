/* 印刷用（print_*.html）と同じSVGアイコンをスプライトとして注入する */
(function () {
  'use strict';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="ico-e" viewBox="0 0 12 20"><polygon points="8,0 1,11 6,11 4,20 11,9 6,9" fill="currentColor"/></symbol>
  <symbol id="ico-g" viewBox="0 0 16 20">
    <path d="M2 1 C5 5 11 5 14 9 C11 13 5 13 2 17" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <path d="M14 1 C11 5 5 5 2 9 C5 13 11 13 14 17" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <line x1="4" y1="5.5" x2="12" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".5"/>
    <line x1="4" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".5"/>
    <line x1="4" y1="12.5" x2="12" y2="12.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".5"/>
  </symbol>
  <symbol id="ico-pop" viewBox="0 0 24 18">
    <circle cx="7" cy="4" r="3" fill="currentColor"/><path d="M1 18 Q1 11 7 11 Q13 11 13 18" fill="currentColor"/>
    <circle cx="17" cy="4" r="3" fill="currentColor" opacity=".6"/><path d="M11 18 Q11 11 17 11 Q23 11 23 18" fill="currentColor" opacity=".6"/>
  </symbol>
  <symbol id="ico-life" viewBox="0 0 16 20"><path d="M8 1 C8 1 2 9 2 13 A6 6 0 0 0 14 13 C14 9 8 1 8 1Z" fill="currentColor"/></symbol>
  <symbol id="ico-coord" viewBox="0 0 15 15"><rect x=".8" y=".8" width="13.4" height="13.4" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/></symbol>
  <symbol id="ico-gem" viewBox="0 0 16 16"><polygon points="8,0 16,6 12.5,16 3.5,16 0,6" fill="currentColor"/></symbol>
  <symbol id="ico-w" viewBox="0 0 16 16"><circle cx="8" cy="5" r="3.2" fill="currentColor"/><path d="M2 16 Q2 9 8 9 Q14 9 14 16Z" fill="currentColor"/></symbol>
  <!-- 2026-11-01 アイコン表示（モック）用：祝福・形質・器官・繁栄度・トラック進行・資源枠・他者の最高Lv・模倣 -->
  <symbol id="ico-bless" viewBox="0 0 16 16"><path d="M8 0 L9.8 6.2 L16 8 L9.8 9.8 L8 16 L6.2 9.8 L0 8 L6.2 6.2Z" fill="currentColor"/></symbol>
  <symbol id="ico-trait" viewBox="0 0 16 16"><rect x="2.5" y="1" width="11" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5.5 4 C8 6 8 6 10.5 8 C8 10 8 10 5.5 12 M10.5 4 C8 6 8 6 5.5 8 C8 10 8 10 10.5 12" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="ico-organ" viewBox="0 0 16 16"><polygon points="8,1 14.2,4.6 14.2,11.4 8,15 1.8,11.4 1.8,4.6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></symbol>
  <symbol id="ico-breed" viewBox="0 0 16 16"><path d="M8 15 V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 10 C4 10 1.5 7.5 1.5 4 C5 4 8 6 8 10Z M8 8 C12 8 14.5 5.5 14.5 2 C11 2 8 4 8 8Z" fill="currentColor"/></symbol>
  <symbol id="ico-up" viewBox="0 0 16 16"><path d="M8 1 L14 8 H10.5 V15 H5.5 V8 H2Z" fill="currentColor"/></symbol>
  <symbol id="ico-slot" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="5" cy="8" r="1.7" fill="currentColor"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/><circle cx="11" cy="8" r="1.7" fill="currentColor"/></symbol>
  <symbol id="ico-eye" viewBox="0 0 16 16"><path d="M1 8 C3 4 5.5 3 8 3 C10.5 3 13 4 15 8 C13 12 10.5 13 8 13 C5.5 13 3 12 1 8Z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></symbol>
  <symbol id="ico-copy" viewBox="0 0 16 16"><rect x="1" y="1" width="9.5" height="9.5" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="5.5" y="5.5" width="9.5" height="9.5" rx="2" fill="currentColor"/></symbol>
</svg>`;
  const inject = () => { const d = document.createElement('div'); d.innerHTML = svg; document.body.insertBefore(d.firstElementChild, document.body.firstChild); };
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
