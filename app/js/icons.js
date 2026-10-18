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
</svg>`;
  const inject = () => { const d = document.createElement('div'); d.innerHTML = svg; document.body.insertBefore(d.firstElementChild, document.body.firstChild); };
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
