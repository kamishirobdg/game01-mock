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
  <symbol id="ico-coord" viewBox="0 0 15 15"><rect x="1.2" y="1.2" width="12.6" height="12.6" rx="2" stroke="currentColor" stroke-width="2.4" fill="#fff"/></symbol>
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
  <!-- O-49（v3.126）効果の記号：いつ（収入＝print_evol と同じ手・終了時＝旗）・星海・合流進出・緊急進出・好きな資源 -->
  <symbol id="ico-income" viewBox="0 0 28 26"><rect x="0" y="14" width="4.5" height="8" rx="2.2" fill="currentColor" transform="rotate(-15 2.25 18)"/><rect x="5" y="5" width="4.5" height="14" rx="2.2" fill="currentColor"/><rect x="10.5" y="2.5" width="4.5" height="16" rx="2.2" fill="currentColor"/><rect x="16" y="4" width="4.5" height="15" rx="2.2" fill="currentColor"/><rect x="21.5" y="7" width="4.5" height="12" rx="2.2" fill="currentColor"/><rect x="4.5" y="16" width="22" height="9" rx="3" fill="currentColor"/></symbol>
  <symbol id="ico-flag" viewBox="0 0 16 16"><path d="M3.5 1 V15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.3 1.5 H14 L11.2 5.2 L14 8.9 H4.3Z" fill="currentColor"/></symbol>
  <symbol id="ico-star" viewBox="0 0 16 16"><polygon points="8,0.6 10.2,5.6 15.6,6 11.5,9.6 12.8,15 8,12.2 3.2,15 4.5,9.6 0.4,6 5.8,5.6" fill="currentColor"/></symbol>
  <symbol id="ico-join" viewBox="0 0 16 16"><path d="M1.5 2.5 L7.5 8 L1.5 13.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 8 H12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11 4.5 L15.5 8 L11 11.5Z" fill="currentColor"/></symbol>
  <symbol id="ico-launch" viewBox="0 0 16 16"><path d="M8 0.8 C10.6 3 11.4 6 10.8 10.4 H5.2 C4.6 6 5.4 3 8 0.8Z" fill="currentColor"/><path d="M5.2 8 L2.6 11.6 L5.4 11 M10.8 8 L13.4 11.6 L10.6 11" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/><path d="M6.6 12 L8 15.4 L9.4 12" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/></symbol>
  <symbol id="ico-any" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.8" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5.6 6.1 C5.6 4.6 6.7 3.8 8 3.8 C9.4 3.8 10.4 4.7 10.4 5.9 C10.4 7.6 8 7.7 8 9.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8" cy="11.9" r="1.1" fill="currentColor"/></symbol>
  <symbol id="ico-copy" viewBox="0 0 16 16"><rect x="1" y="1" width="9.5" height="9.5" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="5.5" y="5.5" width="9.5" height="9.5" rx="2" fill="currentColor"/></symbol>
  <!-- O-61（2026-11-18・デザイン）字の札の代わりの記号：淘汰（ふるい）・祭壇・特殊器官・群体の枠・投入・完成した系統・弱の形質・強の形質・裏返す・ラウンド（終わりの印つき）・回数の切符（数字は上に重ねる）・使用済みの枠 -->
  <symbol id="ico-cull" viewBox="0 0 16 16"><path d="M1.2 1.8 H14.8 L10.3 8.4 H5.7Z" fill="currentColor"/><circle cx="8" cy="10.9" r="1.25" fill="currentColor"/><circle cx="5.7" cy="14" r="1.1" fill="currentColor"/><circle cx="10.3" cy="14" r="1.1" fill="currentColor"/></symbol>
  <symbol id="ico-altar" viewBox="0 0 16 16"><path d="M8 0.6 C9.5 2.5 10.1 3.5 10.1 4.4 A2.1 2.1 0 0 1 5.9 4.4 C5.9 3.5 6.5 2.5 8 0.6Z" fill="currentColor"/><rect x="1.8" y="7.6" width="12.4" height="2.3" rx=".8" fill="currentColor"/><rect x="4.4" y="9.9" width="7.2" height="3.4" fill="currentColor" opacity=".7"/><rect x="2.6" y="13.2" width="10.8" height="2.3" rx=".8" fill="currentColor"/></symbol>
  <symbol id="ico-sporgan" viewBox="0 0 16 16"><polygon points="8,3.6 13.2,6.6 13.2,12.4 8,15.4 2.8,12.4 2.8,6.6" stroke="currentColor" stroke-width="1.5" fill="none"/><polygon points="8,6.9 10.5,9.5 8,12.1 5.5,9.5" fill="currentColor"/><path d="M8 0.5 V2 M3 1.3 L4.1 2.7 M13 1.3 L11.9 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
  <symbol id="ico-herd" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 5.3 L5.2 10.4 H10.8Z" stroke="currentColor" stroke-width="1" fill="none"/><circle cx="8" cy="5.3" r="1.9" fill="currentColor"/><circle cx="5.2" cy="10.4" r="1.9" fill="currentColor"/><circle cx="10.8" cy="10.4" r="1.9" fill="currentColor"/></symbol>
  <symbol id="ico-invest" viewBox="0 0 16 16"><path d="M8 0.6 C8 0.6 4.9 4.6 4.9 6.9 A3.1 3.1 0 0 0 11.1 6.9 C11.1 4.6 8 0.6 8 0.6Z" fill="currentColor"/><path d="M1.8 8.6 V12.6 Q1.8 14.8 4 14.8 H12 Q14.2 14.8 14.2 12.6 V8.6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="ico-lineage" viewBox="0 0 16 16"><path d="M3.2 12.2 L12.8 3.8" stroke="currentColor" stroke-width="1.2"/><polygon points="3.2,9.5 5.54,10.85 5.54,13.55 3.2,14.9 0.86,13.55 0.86,10.85" fill="currentColor"/><polygon points="8,5.3 10.34,6.65 10.34,9.35 8,10.7 5.66,9.35 5.66,6.65" fill="currentColor"/><polygon points="12.8,1.1 15.14,2.45 15.14,5.15 12.8,6.5 10.46,5.15 10.46,2.45" fill="currentColor"/></symbol>
  <symbol id="ico-traitw" viewBox="0 0 16 16"><rect x="2.6" y="1.1" width="10.8" height="13.8" rx="2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-dasharray="2.5 1.75" stroke-dashoffset="1.2"/></symbol>
  <symbol id="ico-traits" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.5 1 H11.5 Q13.5 1 13.5 3 V13 Q13.5 15 11.5 15 H4.5 Q2.5 15 2.5 13 V3 Q2.5 1 4.5 1Z M5.3 5.6 Q8 2.5 10.7 5.6 Q8 8.7 5.3 5.6Z M5.3 10.4 Q8 7.3 10.7 10.4 Q8 13.5 5.3 10.4Z" fill="currentColor"/></symbol>
  <symbol id="ico-flip" viewBox="0 0 16 16"><rect x="1" y="6.2" width="5.2" height="8.8" rx="1.2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="1.8 1.3"/><rect x="9.8" y="6.2" width="5.2" height="8.8" rx="1.2" fill="currentColor"/><path d="M3.6 4.2 C5 1.2 10.4 0.9 12.2 3.6" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><polygon points="13.2,5.1 10.4,4.3 13.6,2.2" fill="currentColor"/></symbol>
  <symbol id="ico-round" viewBox="0 0 16 16"><path d="M13.5 8 A5.5 5.5 0 1 1 10.75 3.24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><polygon points="13.1,4.7 9,5.1 11.4,0.8" fill="currentColor"/></symbol>
  <symbol id="ico-roundend" viewBox="0 0 16 16"><path d="M13.5 8 A5.5 5.5 0 1 1 10.75 3.24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><polygon points="13.1,4.7 9,5.1 11.4,0.8" fill="currentColor"/><path d="M6.7 5.7 V10.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polygon points="7.2,5.6 10.4,7 7.2,8.4" fill="currentColor"/></symbol>
  <symbol id="ico-ticket" viewBox="0 0 20 16"><path d="M3 2 H17 Q18.5 2 18.5 3.5 V5.6 A2.4 2.4 0 0 0 18.5 10.4 V12.5 Q18.5 14 17 14 H3 Q1.5 14 1.5 12.5 V10.4 A2.4 2.4 0 0 0 1.5 5.6 V3.5 Q1.5 2 3 2Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></symbol>
  <symbol id="ico-usedslot" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="5.9" r="2.2" fill="currentColor"/><path d="M4.3 12.9 Q4.3 8.8 8 8.8 Q11.7 8.8 11.7 12.9Z" fill="currentColor"/></symbol>
</svg>`;
  const inject = () => { const d = document.createElement('div'); d.innerHTML = svg; document.body.insertBefore(d.firstElementChild, document.body.firstChild); };
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
