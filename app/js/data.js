/* game01 デジタルモック — 静的データ（design.md 2026-10-18 時点）
   すべて仮値。名称は機能名＋ID（二段名は未確定）。 */
(function (G) {
  'use strict';

  G.ROUNDS = 7;
  G.TRACKS = ['body', 'intel', 'social', 'metab'];
  G.TRACK_INFO = {
    body:   { name: '身体適応',   color: 'red',   jp: '赤', res: 'P' },
    intel:  { name: '知性・認知', color: 'blue',  jp: '青', res: 'G' },
    social: { name: '社会性',     color: 'white', jp: '白', res: 'coop' },
    metab:  { name: '代謝・資源効率', color: 'green', jp: '緑', res: 'E' },
  };
  G.STEP_COST = [0, 2, 3, 5, 8]; // index = 現在Lv（1→2 は STEP_COST[1]）※現行値。実際の参照は G.RULESETS[st.rules]
  G.BASE_INCOME = { E: 3, G: 1, P: 4 };  // E は G.RULESETS[st.rules].incE が優先
  // 試作：ルールセット（meta.rules）。v1＝現行（design.md）／t1＝初回テストプレイ後の仮値セット（design.md 未変更・A/B比較用）
  //   step=進行コスト(index=現在Lv)／incE=基礎E収入／gemPt=宝石1個の点数（×係数）／devPt=形質・協調1つの点数／organPt=器官1枚の点数／regimePt=体制完成
  //   incG/incP=基礎G/P収入／massCost・massMin=大量消費／breed=繁殖コスト2段／scoreMode='add'（加算）|'mult'（形質×宝石色数・器官×協調〔上限4〕）
  //   gauge=係数ゲージ（コマは全てW・AT/強Wなし）／noUpgrade=形質買い替えなし／organExcl=器官の場の各カードは1R1人／noAlt=代替払いなし／x1=拡張x1を含む
  //   massDiscLv=身体Lv4/Lv5の大量消費軽減（各）／mbDisc=増殖暴走の身体大量消費軽減／mcDisc=消費軽減の軽減（T2以降は大量消費P12に合わせて縮小）
  const base = { incG: 1, incP: 4, massCost: 20, massMin: { other: 8, body: 10 }, breed: [30, 50], massDiscLv: 5, mbDisc: 8, mcDisc: 6, scoreMode: 'add', gauge: false, noUpgrade: false, organExcl: false, noAlt: false, x1: false };
  G.RULESETS = {
    v1: Object.assign({}, base, { name: '現行', step: [0, 2, 3, 5, 8], incE: 3, gemPt: 10, devPt: 7, organPt: 0, regimePt: 50 }),
    t1: Object.assign({}, base, { name: '仮値セットT1', step: [0, 3, 5, 8, 13], incE: 2, gemPt: 2, devPt: 3, organPt: 2, regimePt: 15 }),
    // T2（2026-10-18・ユーザー承認の推奨案）：基礎収入ゼロ（生命核のみ）・掛け算得点・係数ゲージ・形質買い替えなし・器官1R1人・代替払いなし・Pコスト再スケール・拡張x1込み
    t2: Object.assign({}, base, { name: '仮値セットT2', step: [0, 3, 5, 8, 13], incE: 0, incG: 0, incP: 0, gemPt: 2, devPt: 3, organPt: 2, regimePt: 15, massCost: 12, massMin: { other: 6, body: 6 }, breed: [20, 35], massDiscLv: 2, mbDisc: 4, mcDisc: 3, scoreMode: 'mult', gauge: true, noUpgrade: true, organExcl: true, noAlt: true, x1: true }),
  };
  // T3（2026-10-18）：T2をベースに、トラックは対応する収集物の数が閾値に達すると自動で上がる（Eでの進行は廃止・適応進化のみ可）。得点は宝石×係数＋体制に戻す（形質・器官・協調はトラック経由で宝石に化ける）
  //   gates[track][目標Lv] = 必要数。緑=器官枚数／青=形質枚数／白=協調トークン数／赤=個体数の投入回数（繁殖変換＋大量消費）
  //   Eでの進行は制限なし（収集で上がる段はEを払わずに済む、という関係）。器官の場は8系統24枚・1R1人の制限なし（弱版の意味を残す）
  G.RULESETS.t3 = Object.assign({}, G.RULESETS.t2, { name: '仮値セットT3', scoreMode: 'add', devPt: 0, organPt: 0, organExcl: false, organLineages: 8, gates: { metab: [0, 0, 3, 6, 9, 12], intel: [0, 0, 2, 4, 6, 8], social: [0, 0, 2, 4, 6, 8], body: [0, 0, 1, 2, 3, 4] } });
  G.GATE_LABEL = { metab: '器官', intel: '形質', social: '協調', body: '個体数の投入（繁殖・大量消費）' };
  G.GATE_SHORT = { metab: '器官', intel: '形質', social: '協調', body: 'P投入' };
  G.MASS_COST = 20;
  G.MASS_MIN = { other: 8, body: 10 }; // 身体は2026-10-18に12→10
  G.BREED_COST = [30, 50];
  G.GEMSET_BASE = 10; G.GEMSET_FLOOR = 5;
  G.ORGAN_COST = [[2, 1], [3, 1], [5, 1]]; // [E,G] 階層1..3（強）。弱はG0
  G.COOP_MAX = 8;
  G.HAND_SIZE = { 3: 2, 4: 3 };

  // トラック報酬の説明（表示用）。処理は engine 側
  G.TRACK_REWARDS = {
    body: {
      2: 'P+8', 3: '強：大量消費を1回無料（4種から選択・排他無視）／弱：P+15', 4: '大量消費コスト恒久-5',
      5: '強：大量消費(身体)を排他無視で使用可＋恒久-5／弱：恒久-5',
    },
    intel: {
      2: 'G+3', 3: '強：今すぐ形質1枚をG-3で購入可／弱：G+1/R', 4: '追加アクション1回（排他なし・Eコスト半額）',
      5: '強：形質コスト永続-2＋後着でも常に強効果／弱：G+6',
    },
    social: {
      2: '協調+1', 3: '強：協調+2／弱：協調+1＋G+3', 4: 'Wなし実行権+1（資源獲得スロット／個人カード・コマを置かず占有しない）',
      5: '強：協調+1＋Wなし実行権+2／弱：協調+1＋Wなし実行権+1',
    },
    metab: {
      2: 'E収入+1', 3: '強：E収入+1かつG収入+1／弱：即時E+8', 4: 'いつでもE↔G 1:1変換（無料・無制限）',
      5: '強：収入が全種+2／弱：全種+1',
    },
  };

  // 形質14種
  G.TRAITS = {
    IE: { name: 'E収入強化', cat: 'I', cost: [3, 2], strong: 'E+2/R（恒久）', weak: '即時E+6', permWeak: false },
    IG: { name: 'G収入強化', cat: 'I', cost: [2, 1], strong: 'G+1/R（恒久）', weak: '即時G+3', permWeak: false },
    IP: { name: 'P収入強化', cat: 'I', cost: [2, 1], strong: 'P+3/R（恒久）', weak: '即時P+9', permWeak: false },
    DB: { name: '身体加速', cat: 'D', cost: [3, 2], strong: '身体進行コスト-2（恒久）', weak: '次の身体進行1回だけ-2', permWeak: false },
    DI: { name: '知性加速', cat: 'D', cost: [3, 2], strong: '知性進行コスト-2（恒久）', weak: '次の知性進行1回だけ-2', permWeak: false },
    MC: { name: '消費軽減', cat: 'M', cost: [3, 2], strong: '大量消費コスト-6P（恒久）', weak: '次の大量消費1回だけ-6P', permWeak: false },
    IB: { name: '複合収入', cat: 'I', cost: [4, 3], strong: 'E+1/RかつG+1/R（恒久）', weak: '即時E+3かつG+3', permWeak: false },
    DA: { name: '適応効率', cat: 'D', cost: [2, 1], strong: '選んだ1トラックの進行コスト-1（恒久）', weak: '次の進行1回だけ-1', permWeak: false },
    DV: { name: '進化加速', cat: 'D', cost: [8, 6], strong: '全トラック進行コスト-2（恒久）', weak: '全トラック-1（恒久）', permWeak: true },
    MB: { name: '増殖暴走', cat: 'M', cost: [7, 5], strong: '繁殖変換P半減（15/25）＋大量消費(身体)-8P', weak: '大量消費(身体)-8Pのみ', permWeak: true },
    IM: { name: '代謝亢進', cat: 'I', cost: [8, 6], strong: '好きな1種の収入+3（取得時固定）', weak: '好きな1種の収入+2（取得時固定）', permWeak: true },
    DG: { name: '遺伝子図書館', cat: 'D', cost: [7, 5], strong: '毎R形質1枚を-2Gで購入可（排他不要）', weak: '同 -1G', permWeak: true },
    JI: { name: '知的跳躍', cat: 'J', cost: [9, 7], strong: '知性+2段階（即時）', weak: '知性+1段階＋Lv5★で必ず強効果', permWeak: false, instant: true },
    JB: { name: '身体覚醒', cat: 'J', cost: [9, 7], strong: '身体+2段階（即時）', weak: '身体+1段階＋Lv5★で必ず強効果', permWeak: false, instant: true },
  };
  G.TRAIT_ORDER = ['IE', 'IG', 'IP', 'IB', 'DB', 'DI', 'DA', 'MC', 'DV', 'MB', 'IM', 'DG', 'JI', 'JB'];

  // 器官・初期固定12種（連結/翻訳/転流/律動）
  G.ORGANS = {
    Li1: { lin: 'Li', tier: 1, name: '結合膜', strong: '以後、器官を建造するたびE+1', weak: 'ゲーム中3回の建造のみE+1' },
    Li2: { lin: 'Li', tier: 2, name: '共役組織', strong: '建造するたび好きな資源+2', weak: '建造するたび好きな資源+1' },
    Li3: { lin: 'Li', tier: 3, name: '統合体', strong: '系統を完成させるたび好きな資源+5', weak: '同 +3' },
    Tr1: { lin: 'Tr', tier: 1, name: '翻訳膜', strong: '形質購入のGコスト-1', weak: 'ゲーム中3回の形質購入のみ-1' },
    Tr2: { lin: 'Tr', tier: 2, name: '転写酵素', strong: '形質購入＋アップグレードのG-2', weak: '同 -1' },
    Tr3: { lin: 'Tr', tier: 3, name: '全翻訳', strong: '形質購入・アップグレード・PブーストのG-3', weak: '同 -2' },
    Fl1: { lin: 'Fl', tier: 1, name: '流路', strong: '収入時、E↔Gを最大3振替（1:1）', weak: '最大2' },
    Fl2: { lin: 'Fl', tier: 2, name: '転換槽', strong: '収入時、最大5振替', weak: '最大4' },
    Fl3: { lin: 'Fl', tier: 3, name: '万象炉', strong: 'いつでもE↔G 1:1振替・上限なし', weak: '収入時のみ上限なし' },
    Rh1: { lin: 'Rh', tier: 1, name: '先導', strong: '毎R、整列後の手番順を1つ前に', weak: 'ゲーム中3回' },
    Rh2: { lin: 'Rh', tier: 2, name: '先手核', strong: '毎R、最初のアクションのEコスト-3', weak: '-1' },
    Rh3: { lin: 'Rh', tier: 3, name: '先制権', strong: '毎R、初手のみ早取り排他を無視', weak: 'ゲーム中3回' },
    Ca1: { lin: 'Ca', tier: 1, name: '触媒膜', strong: '以後、器官の建造コスト-1E', weak: 'ゲーム中3回の建造のみ-1E' },
    Ca2: { lin: 'Ca', tier: 2, name: '促進酵素', strong: 'トラック進行コスト-1E（最低1）', weak: 'ゲーム中3回' },
    Ca3: { lin: 'Ca', tier: 3, name: '全触媒', strong: '進行＋建造＋資源変換(E→G)のコスト-2E（最低1）', weak: '同 -1E' },
    Cv1: { lin: 'Cv', tier: 1, name: '収斂膜', strong: '収入時、保有器官数÷2（切捨）の好きな資源', weak: '÷3' },
    Cv2: { lin: 'Cv', tier: 2, name: '群心器', strong: '器官が3・6・9枚に達するたび協調+1（遡って算入）', weak: '4枚ごと' },
    Cv3: { lin: 'Cv', tier: 3, name: '極相体', strong: '器官6枚で収入全種+1／9枚で+2', weak: '器官7枚で全種+1のみ' },
    Re1: { lin: 'Re', tier: 1, name: '感応点', strong: '建造時、到達済みのLv3★/Lv5★報酬1つの弱版を再発動', weak: '同（恒久効果は一時扱い）' },
    Re2: { lin: 'Re', tier: 2, name: '共鳴膜', strong: '建造時に色を1つ選ぶ。自分の2色コンボ判定でその色をワイルド扱い', weak: '終了時に1コンボのみ' },
    Re3: { lin: 'Re', tier: 3, name: '環境掌握', strong: '建造時、到達済み報酬1つの強版を再発動＋環境スキャン-2E', weak: '弱版を再発動＋-1E' },
    St1: { lin: 'St', tier: 1, name: '放出腺', strong: 'アクション：P→E 2:1（最大P15→E7）', weak: '最大P10→E5' },
    St2: { lin: 'St', tier: 2, name: '爆発腔', strong: 'アクション：P→G 3:1（最大P12→G4）', weak: '最大P9→G3' },
    St3: { lin: 'St', tier: 3, name: '臨界炉', strong: 'ラウンド1回・トークン不要でP→E（最大P15→E7）とP→G（最大P12→G4）を同時に', weak: 'トークン必要（上限は同じ）' },
  };
  G.ORGAN_FIELD = ['Li1', 'Li2', 'Li3', 'Tr1', 'Tr2', 'Tr3', 'Fl1', 'Fl2', 'Fl3', 'Rh1', 'Rh2', 'Rh3']; // 初心者固定
  G.LINEAGES = { Li: '連結', Tr: '翻訳', Fl: '転流', Rh: '律動', Ca: '触媒', Cv: '収斂', Re: '感応', St: '応力' };
  G.LINEAGE_TYPE = { cumulative: ['Li', 'Ca', 'Cv', 'Tr'], functional: ['Fl', 'Rh', 'Re', 'St'] };
  G.ST_CAPS = { St1: [15, 10], St2: [12, 9], St3: [15, 12] }; // [強, 弱] or St3:[P→E上限, P→G上限]

  // 個人アクションカード20
  G.CARDS = {
    A: { name: 'E固定獲得', text: '+3E' },
    B: { name: 'G固定獲得', text: '+2G' },
    C: { name: '複合獲得', text: '+2E +1G' },
    D: { name: 'E群体獲得', text: '+2E ＋ P20ごとに+1E（最大+5E）' },
    E: { name: 'G群体獲得', text: '+1G ＋ P20ごとに+1G（最大+4G）' },
    F: { name: 'P→E変換', text: 'P-5 → +3E' },
    G: { name: 'P→G変換', text: 'P-5 → +2G' },
    H: { name: 'P収集', text: '+5P' },
    I: { name: '全資源小収集', text: '+1E +1G +2P' },
    J: { name: '資源→P変換', text: 'E-2→P+6 または G-1→P+5' },
    K: { name: '協調連動獲得', text: '+2E ＋ 協調×1E' },
    L: { name: '宝石連動獲得', text: '+3P ＋ 保有宝石×2P' },
    M: { name: '形質連動獲得', text: '+1E ＋ 保有形質×1E（最大+5）' },
    N: { name: '知性連動獲得', text: '+1G ＋ 知性Lv×1G' },
    O: { name: '博打収集', text: '所持Eを全て支払い、1EにつきP+2' },
    P: { name: '個人変換', text: 'E-3 → G+2' },
    Q: { name: '安定収集', text: '+1E +1G' },
    R: { name: 'P収集弱', text: '+3P ＋ P20ごとに+1P' },
    S: { name: '早期形質支援', text: '知性Lv2以下なら+3G、Lv3以上は+1G' },
    T: { name: '繁殖連動獲得', text: 'P+6。繁殖係数×4以上ならP+10' },
  };
  G.CARD_ORDER = 'ABCDEFGHIJKLMNOPQRST'.split('');

  // 種族（基本4）
  G.SPECIES = {
    wing:  { name: '光翼類',     order: 1, stock: { E: 2, G: 1, P: 4 }, passive: '身体トラックLv2スタート', type: '速攻', hint: '身体トラックをLv2から始められ、身体Lv3★の先着ボーナスを狙いやすい。' },
    arm:   { name: '九腕知性体', order: 2, stock: { E: 2, G: 2, P: 4 }, passive: 'コストG4以下の形質1枚を取得済みでスタート', type: '形質', hint: '形質を1枚持って始まる。形質集めと知性トラックに向く。' },
    ant:   { name: '万列協和衆', order: 4, stock: { E: 4, G: 1, P: 6 }, passive: '協調1でスタート', type: '協調・初心者向け', hint: '協調トークンで序盤から行動が強く、資源も多め。クセが少なく扱いやすい。' },
    manta: { name: '群泳双盤',   order: 3, stock: { E: 2, G: 0, P: 0 }, passive: 'P+10 ＋ E収入+1（恒久）', type: '物量', hint: 'P+10とE収入+1で資源が豊富。形質の取得は遅め。' },
  };

  // コンボ
  G.COMBOS2 = [['body', 'intel'], ['body', 'metab'], ['body', 'social'], ['intel', 'metab'], ['intel', 'social'], ['metab', 'social']];
  G.COMBOS3 = [['body', 'intel', 'metab'], ['body', 'intel', 'social'], ['body', 'metab', 'social'], ['intel', 'metab', 'social']];
  G.BEGINNER_COMBOS = { two: [0, 1, 4, 5], three: [0, 3] };

  // 共有スロット定義（表示順）
  G.SLOTS = [
    { id: 'E5',   group: 'res',  excl: true,  name: '固定E強',   text: '+5E' },
    { id: 'EG',   group: 'res',  excl: true,  name: '群体E',     text: '+2E ＋ P10ごとに+1E' },
    { id: 'G3',   group: 'res',  excl: true,  name: '固定G強',   text: '+3G' },
    { id: 'GG',   group: 'res',  excl: true,  name: '群体G',     text: '+1G ＋ P10ごとに+1G' },
    { id: 'P8',   group: 'res',  excl: true,  name: 'P増加',     text: '+8P' },
    { id: 'ALL',  group: 'res',  excl: true,  name: '全資源獲得', text: '+2E +1G +4P' },
    { id: 'PB',   group: 'res',  excl: true,  name: 'Pブースト購入', text: 'G2 → P+10' },
    { id: 'TRK',  group: 'trk',  excl: false, name: 'トラック進行', text: '2/3/5/8E（W必須）', worker: true },
    { id: 'BRD',  group: 'trk',  excl: false, name: '繁殖変換',  text: 'P30→×4 / P50→×5（W必須）', worker: true },
    { id: 'ORG',  group: 'org',  excl: false, name: '器官建造',  text: '2E+1G / 3E+1G / 5E+1G（弱はG0）' },
    { id: 'MB',   group: 'mass', excl: true,  name: '大量消費(身体)', text: 'P20 → 赤宝石+1' },
    { id: 'MI',   group: 'mass', excl: true,  name: '大量消費(知性)', text: 'P20 → G4以下の形質を異なる2種' },
    { id: 'MS',   group: 'mass', excl: true,  name: '大量消費(社会)', text: 'P20 → 協調+2' },
    { id: 'MM',   group: 'mass', excl: true,  name: '大量消費(代謝)', text: 'P20 → E+10 G+10' },
    { id: 'TRT',  group: 'oth',  excl: true,  name: '形質購入／アップグレード', text: 'Gを払い形質を取得・差額+1で上位へ' },
    { id: 'TRT2', group: 'oth',  excl: true,  name: '形質購入（割増）', text: '通常コスト＋ラウンド数ぶんのE', ext: 'x1' }, // 拡張x1のみ
    { id: 'GEM',  group: 'oth',  excl: true,  name: '宝石セット得点カード', text: 'G(10−形質数・下限5) → 仮想宝石+1' },
    { id: 'SCAN', group: 'cu',   excl: false, name: '環境スキャン', text: 'E5 → 他者の最高Lv×2の資源' },
    { id: 'ADP',  group: 'cu',   excl: false, name: '適応進化',  text: 'L1 → Lv1のトラックを+1（W必須）', worker: true },
    { id: 'CNV',  group: 'cu',   excl: false, name: '資源変換',  text: 'E2→G1 / G2→E1 / P8→E3 / P8→G2' },
    { id: 'RSV',  group: 'cu',   excl: false, name: '予備動員',  text: '無料で E+2 または G+1' },
  ];
  G.SLOT_BY_ID = {}; G.SLOTS.forEach(s => { G.SLOT_BY_ID[s.id] = s; });
  G.RES_SLOTS = ['E5', 'EG', 'G3', 'GG', 'P8', 'ALL']; // 緊急発進・Wなし実行・協調ボーナスの対象
  // 試作：資源獲得スロットの統合4案（meta.slots='m4'）。早取り排他をグループ単位（各1人/R）にし、効果は従来スロットから選ぶ。紙のルール（design.md）は未変更
  G.RES_GROUPS = { RE: { name: 'E系', slots: ['E5', 'EG'] }, RG: { name: 'G系', slots: ['G3', 'GG'] }, RP: { name: 'P系', slots: ['P8', 'PB'] }, RA: { name: '全資源', slots: ['ALL'] } };
  G.RES_GROUP_OF = {}; Object.entries(G.RES_GROUPS).forEach(([g, v]) => v.slots.forEach(s => { G.RES_GROUP_OF[s] = g; }));
  G.SLOT_SET_NAME = { v7: '現行7スロット', m4: '統合4スロット' };
  // 試作：拡張ルール（meta.ext）。x1＝①形質購入枠を2つ（通常／割増=ラウンド数ぶんのE追加）②緊急発進（L1）の対象に形質購入を追加
  //   ③協調発進（協調トークン2個を取り除き、使用済みの資源獲得／形質購入スロットを使う）④大量消費（社会）の協調+2→+3。design.md 未変更
  G.EXT_NAME = { none: 'なし', x1: '形質2枠＋緊急/協調発進＋社会+3' };
  G.TRAIT_SLOTS = ['TRT', 'TRT2'];
  G.GROUP_NAME = { res: '資源獲得（早取り排他）', trk: 'トラック進行（排他なし）', org: '器官建造（排他なし）', mass: '大量消費（早取り排他）', oth: 'その他共有（早取り排他）', cu: 'キャッチアップ・運用（排他なし）' };
})((typeof window !== "undefined" ? window : globalThis).G1 = (typeof window !== "undefined" ? window : globalThis).G1 || {});
