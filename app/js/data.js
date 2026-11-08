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
  // T4（2026-10-19・試作）：T3 の土台（基礎収入ゼロ・収集物で自動進行・係数ゲージ・買い替えなし・代替払いなし・x1）を維持し、歪みを構造で正す
  //   ①P系コストを現行v1に戻す（大量消費20〔下限8・身体10〕・繁殖30/50・身体Lv4/5軽減-5・MB-8・MC-6）②協調の自己参照を切る＝社会トラック報酬から協調を外す（Lv2 P+6／Lv3★強 Wなし実行権+1・弱 P+10／Lv5★強 権+2・弱 権+1）
  //   ③協調の新しい入手経路＝群体E/G を「P6を払い 資源＋協調+1」に再設計（herd）④大量消費(社会)は協調+2 ⑤協調ボーナス（資源スロット+協調数）は最大+4 ⑥赤ゲートのP投入＝繁殖変換＋大量消費(身体)のみ
  //   ⑦身体Lv5★強の排他無視は1ラウンド1回 ⑧器官の場＝6系統18枚（累積3＋機能3を抽選）・各カード1R1人 ⑨知性Lv4↗＝形質購入コスト-1（恒久）⑩ゲート：緑3/6/9/12・青2/4/6/9・白2/4/6/8・赤1/2/3/4
  G.RULESETS.t4 = Object.assign({}, G.RULESETS.t3, { name: '仮値セットT4', massCost: 20, massMin: { other: 8, body: 10 }, breed: [30, 50], massDiscLv: 5, mbDisc: 8, mcDisc: 6,
    msCoop: 2, coopBonusCap: 4, scanCoop: 1, organCost: [[3, 1], [4, 1], [6, 1]], lineageCoefMax: 2, organEscalate: 3, traitShared: true, herd: true, herdCost: 6, socialRewards: 'shield', pInvKinds: 'bodyOnly', body5Once: true, organLineages: 6, organExcl: true, intel4: 'traitDisc',
    gates: { metab: [0, 0, 3, 6, 9, 12], intel: [0, 0, 2, 4, 6, 9], social: [0, 0, 2, 4, 6, 8], body: [0, 0, 1, 2, 3, 4] } });
  // T5（2026-10-19・試作＝T4＋身体の別性能化 D-6「生命核軸」）：
  //   全員：収入時、保有している生命核1個につき E+1（lYield。その収入で受け取る分は数えない）。基礎収入ゼロはT4のまま
  //   身体トラック（bodyAxis='L'）：ゲート＝生命核を投入した回数（代用払い・緊急発進・適応進化）1/2/3/4。報酬は「Lの質」＝
  //     Lv2 利回りの資源をLごとにE/Gから選べる／Lv3★強 今すぐL+1＋緊急発進の対象に形質購入・宝石セット・大量消費を追加・弱 L+1／Lv4 1L＝E4/G4＋利回りでPも可／Lv5★強 利回り2倍＋L+1・弱 L+1
  //   大量消費(身体)は全員のP→宝石の出口として残す。身体Lv4/5の軽減（massDiscLv）とLv5★強の排他無視は廃止。利回りが強ければ身体の価値を上げる方向で調整する（上限・半減はしない＝ユーザー方針）
  //   2026-10-19 ユーザー判断：利回りは2（1では全員が即投入）、身体ゲートは奇数個 1/3/5/7（覚えやすさ優先。7投入は終盤になるが、E進行と別口のL獲得で補う）
  G.RULESETS.t5 = Object.assign({}, G.RULESETS.t4, { name: '仮値セットT5', bodyAxis: 'L', lYield: 2, massDiscLv: 0, body5Once: false, step: [0, 3, 5, 8, 13, 21], gates: Object.assign({}, G.RULESETS.t4.gates, { body: [0, 0, 1, 3, 5, 7] }) });
  // 終盤のE/G出口（試作フラグ・observe --set で比較。既定は無効）：
  //   maxLv=6（全トラックにLv6＝Eで買う段〔step[5]〕・痕跡+1・先着なし・自動進行はLv5まで）／crystal={E:15,G:8}（共用アクション「結晶化」＝EまたはGを払って祝福+1）
  //   premium=true（上位形質4種をGで購入）／gemsetShared=true＋gemsetEscalate=3（宝石セットを排他なしにし、購入ごとに+3G）／breedE=[24,40]（繁殖変換をEでも払える）
  // T6（2026-10-20・試作）：T5＋終盤の出口＋身体の得点化。ユーザー方針＝得点を抑えない・資源に見合うリターン・余らせない・手が尽きない
  //   maxLv=6（全トラック Lv6＝E21で宝石+1・先着なし）／gemsetShared（宝石セット共用）＋gemsetEscalate=5（購入ごとに+5G）
  //   身体の得点化：S1 bodyLv4Gem（Lv4で痕跡+1）／S3 lCrystal=2（Lv4で解放：L2→祝福+1・排他なし・W）／S2 lEndGem={per:2,max:2}（終了時、保有L2個につき祝福+1・上限2）
  //   rounds（ラウンド数。未指定なら G.ROUNDS=7。--set=rounds=8 で比較）
  //   2026-10-20 計測（AI8）を受けて既定に追加：bodyNoE（身体はL投入のみ・Eでは進めない。混合の独走が縮み赤が立つ）・rhLife（律動T1を生命核版に）・mmCost=14（大量消費(代謝)）
  //   2026-10-20 ユーザー判断：bodyNoE は外す（ルールの複雑化・特別扱いを避ける）。個人カードは現状では寄与がないため noCards で無効化（ドラフト省略）し他の調整に専念
  //   2026-10-20 ユーザー採用：Lv6＝L6-A 転換（lv6Convert：Lv6 に達した色は終了時、その色の収集物3個につき祝福+1。身体＝保有L・知性＝形質・社会＝協調・代謝＝器官）
  //   身体の葛藤設計：B4 結晶化を Lv2 から解放（lCrystalLv=2）／B2 Lv4 のゲートは「5投入のうち1回は2個以上を同時投入」（bodyBulkLv4）／B7 身体のE進行コストを1段高く（bodyStep 5/8/13/21・Lv6 は21）
  //   2026-10-20 計測（AI11）：S2（終了時の保有L祝福）は「抱える」側を後押しし結晶化が使われないため外す。一括投入は2個では制約にならず3個に
  G.RULESETS.t6 = Object.assign({}, G.RULESETS.t5, { name: '仮値セットT6', maxLv: 6, gemsetShared: true, gemsetEscalate: 5, bodyLv4Gem: true, lCrystal: 2, lCrystalLv: 2, lEndGem: null, rhLife: true, mmCost: 14, noCards: true,
    lv6Convert: 3, bodyBulkLv4: 3, bodyStep: [0, 5, 8, 13, 21, 21],
    // 2026-10-20 第10部（AI12）：利回りは R1〜3＝2・R4〜7＝1（投入の終盤偏りを平準化・ばらつき半減）、繁殖変換を L3 でも払える（生命核ルートに係数の供給源）
    yieldByRound: [0, 2, 2, 2, 1, 1, 1, 1], breedL: 3,
    // 2026-10-20 第11部（AI13）：協調が初めて8に達したら係数+1（協調ルートに係数の供給源）、共用アクション「群れの結晶」協調3→祝福+1（協調を点にするか残すかの葛藤）
    coop8Coef: true, coopCrystal: 3,
    // 2026-10-20 第12部（AI14）：身体Lv2（1投入）で L+1（L総量7→8。生命核ルートの L 不足を緩和・専念者の計測でばらつき109→68）
    body2L: true,
    // 2026-10-20 人間テスト1戦目（ルームJAK9C・491点）の手筋を受けて：形質コストの下限＝元コストの半分（切上。翻訳系統＋遺伝子図書館でG1になるのを防ぐ）／知的跳躍・身体覚醒の+2段はLv5まで（Lv6は飛び越えない）／身体Lv6の転換は保有Lでなく投入回数
    traitHalfFloor: true, jumpMaxLv: 5, lv6ConvertBodyInv: true,
    // 2026-10-20 ユーザー指示：適応進化は機能していない（メリットを提示できていない）ため削除
    noAdapt: true,
    // 2026-10-20 種族（第13部・計測 species_20261020）：群泳双盤は E収入+1を廃止し初期資源 E6 G3 P10（案A＝全種族の平均順位が2.45〜2.60に揃った）。万列協和衆の協調2は資源を削っても突出するため協調1のまま
    speciesMod: { manta: { stock: { E: 6, G: 3, P: 10 }, mantaP: 0, mantaIncE: 0 } },
    // 2026-10-20 ユーザー提案：大量消費(社会)は協調+3（群体E/Gの協調+1と差をつける。計測で他ルートへの影響なし）
    msCoop: 3 });
  // 試作フラグ（observe --set）：lv6E=30（Lv6 のEコストを全トラック統一）／traitCostMul=1.5（形質のGコスト倍率・切上）／organCost=[[E,G],…]（器官コスト）／rounds=5
  // 変更候補の試作フラグ（2026-10-20・observe --set で比較）：
  //   bodyNoE=true（身体はEでは進めない＝L投入のみ。Lv6はEで可）／traitGateBoost=true（割引系形質をゲート加速に：DB＝身体の投入+1・DI＝形質+1・DA＝選んだ色の収集+1・DV＝全色+1〔強。弱は半分〕。DG＝毎R最初の形質購入-3G/-2G）
  //   traitCostTweak=true（DV 8/6→6/5・DG 7/5→5/4・MB 7/5→5/4）／cardBoost=1.5（個人カードの獲得量×1.5・切上）／rhLife=true（律動T1＝建造時L+1・1Lの価値+1〔強〕／L+1〔弱〕）／mmCost=14（大量消費(代謝)のコスト）
  // 第10部の試作フラグ（observe --set）：yieldByRound=[0,2,2,2,1,1,1,1]（R別利回り）／lInvPerRound=true（身体ゲートの投入は1R1回だけ加算）／investPrepay=true（投入時に残R数ぶんのE即時）
  //   breedL=3（繁殖変換をLでも）／body5Coef=true（身体Lv5★強＝係数+1）／crystalLv4Rate=1（Lv4以降の結晶化はL1）／massL=2（大量消費(身体)をLでも）
  // 第11部（協調を点に結ぶ）の試作フラグ：coop8Gem（協調が初めて8で痕跡+1）／bypassCoopFull（協調発進の枠は協調ボーナス上限なし）／coopCrystal=3（共用「群れの結晶」協調3→祝福+1）
  //   gemsetCoopDisc（宝石セット −協調÷2）／social4Gem（社会Lv4に痕跡+1）／coop8Coef（協調が初めて8で係数+1）／herdCoop=2（群体E/Gの協調+2）／msGem（大量消費(社会)に痕跡+1）／msCost（大量消費(社会)のコスト）
  // 第12部（生命核ルートの底上げ）の試作フラグ：body2L（身体Lv2で L+1）／body2Gem（身体Lv2で痕跡+1）／lValueLv2（1L＝E4 を Lv2 から）／crystalE=2（結晶化に E+2）
  //   lv6ConvertBodyInv（身体Lv6の転換を投入回数で）／body3YieldAdd（Lv3★強＝L+1＋利回り+1/L。緊急発進の対象拡大は無し）
  // T7（2026-10-20・第14部）：T6＋器官と形質の役割再編。器官＝トラックの色に対応する3段階の成長（代謝/転写/群心/脈動/促進/連結から4系統）・コスト4E+1G/6E+2G/9E+3G（弱はG0）
  //   形質＝突然変異12種（Gのみ・能力ごとの値段・割引は転写系の器官だけ・下限なし）。収入系・細かい割引の形質は廃止。形質4/7枚目で係数+1。大量消費(知性)＝G9以下の形質1種
  G.RULESETS.t7 = Object.assign({}, G.RULESETS.t6, { name: '仮値セットT7',
    organSet: ['Mg', 'Tl', 'Hc', 'Pu', 'Cx', 'Li'], organPick: 4, organSetBeginner: ['Mg', 'Tl', 'Hc', 'Pu'], organLineages: 0,
    organCost: [[4, 1], [5, 2], [7, 2]], organCostBy: { Pu: [[5, 1], [6, 2], [8, 2]] }, organEscalate: 0,
    // 2026-10-22 ユーザー採用（第27部）：器官は「早い者が安い」＝各カード1R1人なし・効果は先着も後続も同じ・後続は後追い料 +1E（T8 で +3E）。形質は「早い者が強い」のまま
    organExcl: false, organSameEffect: true, organLateFee: 1,
    endMajorityGem: true, endMajorityMinLv: 2,
    regimePt: 0, noRegime: true,
    lInvestByCount: true, nbCrystalInvest: true, // 2026-10-25 ユーザー採用（結晶体質 案2）：強は献上（生命核）で払った L も身体の収集物に // 2026-10-24 ユーザー判断：身体の収集物（生命核の投入）は払った回数でなく「個数」で数える（ゲート 1/3/5/7 は据え置き） // 2026-10-24 ユーザー判断：体制完成（4系統1枚ずつ→収入+1・終了時+15点）は T1 の値が残っていただけで機能していないため廃止
    // 2026-10-23 ユーザー採用（第32〜33部）：献上＝資源を祝福に換える経路を統一。共用は定額・各品目1ラウンド1回（遺伝子 G6／生命核 L2／協調4。R6 からエネルギー E12／個体数 P24 が開く＝「神の到来」）。
    //   早取りの恩寵枠（R6 から・1R1人ずつ）＝エネルギー E8／個体数 P16／宝石 E10+P10→痕跡。研究（知性Lv4）＝献上（遺伝子）が1ラウンドに何度でも。数値は基準単位（T8 は3倍）
    tribute: { openRound: 6, shared: { E: 12, P: 24 }, flatG: 6, onceEach: true,
      // 2026-10-24 ユーザー採用（第35部）：恩寵枠は「点数化」から「強力で多彩な一手」へ。候補5枚（pool）から毎ゲーム pick 枚を抽選して R6 に開く（1R1人）。旧枠 TE/TP/TR（E→祝福・P→祝福・E+P→痕跡）は定義だけ残す（--set で比較用）
      //   TO 器官の恩寵＝器官1枚を無料（後追い料なし）＋同じ手番にもう1枚を半額／TT 形質の恩寵＝G4（T8 G12）で形質2枚まで無料／TA 錬金＝痕跡の色を2個まで替える／TB 神の加護＝置いたとき資源枠1つを使用済みでも即時に実行（倍）＋このラウンドの残りの手番、資源枠の獲得量が倍（協調ボーナス・コストはそのまま。計測で −18点だったため即時枠を追加）／TJ 跳躍＝トラック進行を2回（同じでも別でも）・合計コスト −8E（T8 −24E。−15E では使用者 −9点）
      slots: { TE: { E: 8 }, TP: { P: 16 }, TR: { E: 10, P: 10, real: true }, TO: { kind: 'organ', half: true }, TT: { kind: 'trait', G: 4, n: 2 }, TA: { kind: 'alchemy', n: 2 }, TB: { kind: 'boost', mul: 2, instant: true }, TJ: { kind: 'leap', n: 2, disc: 8 } },
      pool: ['TO', 'TT', 'TB', 'TJ'] /* 2026-10-28 ユーザー採用（第41部 B1）：錬金 TA を除外（色の廃止）。旧 ['TO','TT','TA','TB','TJ'] */, pick: 3 }, gemsetEscalate: 0, // 2026-10-23 ユーザー採用（第30部 B1・試行）：終了時、各トラックの単独首位（Lv2 以上）にその色の痕跡+1
    traitChoice: true, // 2026-10-22 ユーザー採用：形質は「強は1枚だけ・早い者勝ち、弱は何枚でも」＝強が残っていても弱（安い）を選べる。先着が弱を選べば強は次の人に残る // 2026-10-22 脈動は全員が3枚そろえる（完成2.7/戦）ため系統別に+1E lineageCoefMax: 2, rhLife: false, // 2026-10-20 採用①：T3まで育てる価値を出すためなだらかに
    traitPool: ['NC', 'NL', 'MC', 'DG', 'NB', 'MB', 'NF', 'DV', 'NM', 'NR', 'JI', 'JB', 'NE', 'NS', 'NP'], sporeCap: 3, // 2026-10-28 第42部：NE/NS/NP 追加（15種）・胞子の上限（T8 は 10）
    // 2026-10-22 全面見直し（第25部）：値段は実効値（×0.75 を廃止）。E換算の価値と T8 の実測（取得数・所持者の得点差）から
    //   群れ本能 7/5（×3 の世界では協調の価値が下がる）・長命 10/8（L+2≈E60 で全員が買っていた）・増殖暴走 10/6（効果を半減→各段-15P に変更）・跳躍 11/8・身体覚醒 13/10（弱を全員が買っていた）
    //   使われない形質を値下げ：消費軽減 5/4・遺伝子図書館 5/4・結晶体質 5/3・適応放散 5/4・進化加速 6/5・擬態 7/5・先見 6/5
    traitCosts: { JI: [11, 8], JB: [13, 10], DV: [6, 5], MB: [10, 6], MC: [5, 4], DG: [5, 4], NC: [7, 5], NB: [5, 3], NM: [7, 5], NL: [10, 8], NF: [6, 5], NR: [5, 4], NE: [3, 2], NS: [3, 2], NP: [3, 2] },
    traitHalfFloor: false, traitCoef: [3, 6] /* 2026-10-28 ユーザー採用（第41部 C4）：コンボ廃止の補填。旧 [4, 7] */, armTraitMax: 5 /* 2026-10-29 ユーザー決定：九腕の初期形質の上限 G21→G15（T8） */, miMaxCost: 7, miCount: 2 /* 2026-10-29 ユーザー決定：design.md どおり2種（九腕の突出は初期形質の上限 G15 と初期資源で抑える・AI55） */, armNoInstant: true, // 閾値は実効値（旧 9×0.75）。九腕の初期形質は即時効果（!・◆）のものを除く dgDisc: [3, 2], firstBonusStrict: true,
    hc1Coop: [1, 1], ncCoop: [2, 1], // 採用③：協調の抑え（群心点 +1・群れ本能 +2/弱+1）
    reserveE: 3, reserveG: 2, p8: 10, // 採用④：手詰まり対策（予備動員 E+3/G+2・P増加 +10）
    // 採用⑤：初期資源は全種族、各資源を強アクション（E5／G3／P10）の0.5〜1.5回分でバランスよく。合計は種族のパッシブ分を差し引いて揃える（群泳はパッシブ無しの代わりに多め）
    speciesMod: { wing: { stock: { E: 5, G: 2, P: 8 } }, arm: { stock: { E: 3, G: 2, P: 6 } } /* 2026-10-29 ユーザー採用（AI55）：九腕 E12 G9 P18 → E9 G6 P18（T8）。大量消費(知性) 2種・群心核/代謝核の復旧で突出した九腕の抑制 */, ant: { stock: { E: 5, G: 2, P: 6 }, coop: 2 } /* 2026-10-22 採用：初期協調2 */, manta: { stock: { E: 7, G: 4, P: 12 }, mantaP: 0, mantaIncE: 0 } }, // 2026-10-23 第34部：群泳 P14→12（T8 P42→36）。献上で P の余りが点になり群泳が 1.6（63%）に突出したため。献上の P の行（P72/P48）は物差しで E の行より高い（E43/E29 相当）ので据え置き
    // 2026-10-20 ユーザー採用（第15部 R1）：生命核の利回りは全て P（保有L1個につき P+3・逓減なし）／身体報酬は P 版（Lv3★ 1L＝E4/G4・Lv4 痕跡＋利回り2倍・Lv5★ 1L＝E5/G5）／大量消費 P28／協調8到達は係数でなく痕跡+1
    yieldRes: 'P', lYield: 3, yieldByRound: null, bodyRewards: 'P', massCost: 28, coop8Coef: false, coop8Gem: true,
    // 2026-10-20 ユーザー採用（第16部 AI21）：協調ボーナスは＋協調数の半分（切り捨て）＝資源全体を倍にした場合と同じ効き。上限なし（ユーザー判断）。資源倍化は今後の数値調整で実施予定（その時点で＋協調数に戻す）。K3 消費型は保留案
    //   群心核（Hc3）は上限が無くなったので「協調ボーナスの端数を切り上げ（強は＋社会のゲート+1）」に差し替え（hc3RoundUp）
    coopMode: 'half', coopBonusCap: undefined, hc3RoundUp: true,
    // 2026-10-21 ユーザー採用（第19〜21部）：G を払う先取り枠「模倣」（G4・自分を含む誰かが到達済みの Lv2／Lv3★ の !即時効果を1つ。◆生命核の L+1 は対象外）と「発現」（G10・痕跡+1・先着なし）。
    //   知性の報酬＝学習（Lv3★強：G枠を今すぐ1回 G0・排他無視／弱：G枠の G -1 恒久）・研究（Lv4：宝石セットの値上がり無効）・洞察（Lv5★強：常に強のみ／弱：G+6）。形質の割引は知性から外す
    gSlots: true, mimicCost: 4, expressCost: 12, intelRewards: 'learn',
    // 2026-10-22 ユーザー採用（AI25）：形質×0.75・発現 G12・群れの結晶 協調4（結晶体質の協調側 -1 は無し＝nbCoopDisc）・協調発進 協調3（bypassCoopCost）・社会の自動進行 2/5/8/11
    coopCrystal: 4, nbCoopDisc: false, bypassCoopCost: 3, mbBreedDisc: 15,
    jumpNoFirst: true, lv6First: true, // 2026-10-28 ユーザー採用（第40部）：跳躍形質で着いた★は後着扱い（K2）／Lv6 は先着＝痕跡+1＋祝福+1・後着＝痕跡+1（案B）
    gates: Object.assign({}, G.RULESETS.t6.gates, { metab: [0, 0, 2, 4, 7, 10], social: [0, 0, 2, 5, 8, 11] }),
    // 2026-10-22 ユーザー採用（第23部 AI29）：C2 2本係数＝痕跡×2×繁栄度（×3＋繁殖の段数・4段・全段 P50）＋祝福×2×成熟度（×3＋形質4/7枚目・系統完成〔上限+4〕）。手当て(a)は不採用
    coef2: { breedBase: 3, breedMax: 4, collectBase: 3, collectMax: 4 }, breed: [50, 50, 50, 50] });
  // T7 の追加検討（試作フラグ・observe --set）：
  //   yieldRes='P'＋lYield=N（生命核の利回りを全てPで受け取る・Lごとに P+N）＋yieldByRound=null（逓減なし）
  //   bodyRewards='P'（Pの利回り前提の身体報酬：Lv2 L+1・結晶化解放／Lv3★ 1L＝E4/G4＋強L+1／Lv4 痕跡＋利回り×2／Lv5★ 強 1L＝E5/G5＋L+1・弱 L+1）
  //   massCost=N（大量消費のP）／traitCoef=[]・lineageCoefMax=0（係数ゲージの上昇を形質と器官から外す）
  // 第19部 C2（2本係数）の試作フラグ：coef2={ breedBase:3, breedMax:2, collectBase:3, collectMax:4 }
  //   得点＝痕跡×gemPt×繁栄度（breedBase＋繁殖の段数）＋祝福×gemPt×成熟度（collectBase＋形質4/7枚目・系統完成・協調8 等の回数、上限 collectMax）
  //   手当て：massBodyVirtual=true（大量消費(身体)の痕跡を祝福に）／bodyLv4Gem=false（身体Lv4の痕跡なし）
  // 第16部（協調ボーナスの見直し）の試作フラグ：coopMode='spend'（K3 消費型：資源枠で協調1個を払うとその枠の資源+coopSpendGain・1回の行動で1個まで・自動ボーナスなし）
  //   coopMode='half'（協調ボーナス＝＋協調数の半分・切り捨て＝資源倍化の近似。T7 の既定）
  //   coopMode='tier'（K1 段階制：協調1〜3＝+1・4〜7＝+2・8＝+3）＋coopBonusSlots=['E5','G3','P8']（K2 ボーナスが付く枠を絞る）
  // 資源量を k 倍にした数値セットを作る（L・協調・収集物の個数・ゲート・段数は変えない）。エンジン側の直書きは R.scale で同じ倍率が掛かる
  G.scaleRuleset = function (base, k, extra) {
    const R = Object.assign({}, base); const m = (v) => v === undefined || v === null ? v : Math.round(v * k); // extra は倍化の後に適用（倍化後の単位の絶対値で上書き）
    ['massCost', 'mmCost', 'msCost', 'herdCost', 'p8', 'reserveE', 'reserveG', 'mimicCost', 'expressCost', 'lYield', 'incE', 'incG', 'incP', 'gemsetEscalate', 'mcDisc', 'mbDisc', 'crystalE', 'lv6E', 'coopSpendGain', 'massDiscLv'].forEach(key => { if (typeof R[key] === 'number') R[key] = m(R[key]); });
    { const mul = R.traitCostMul || 1; ['miMaxCost', 'armTraitMax'].forEach(key => { if (typeof R[key] === 'number') R[key] = m(Math.ceil(R[key] * mul)); }); } // 形質の値段の閾値：値段と同じく ×mul を先に適用（候補の顔ぶれを変えない）
    ['step', 'bodyStep', 'breed', 'dgDisc'].forEach(key => { if (Array.isArray(R[key])) R[key] = R[key].map(m); });
    if (R.massMin) R.massMin = { other: m(R.massMin.other), body: m(R.massMin.body) };
    if (R.organCost) R.organCost = R.organCost.map(([e, g]) => [m(e), m(g)]);
    if (R.organCostBy) { const ob = {}; Object.entries(R.organCostBy).forEach(([l, arr]) => { ob[l] = arr.map(([e, g]) => [m(e), m(g)]); }); R.organCostBy = ob; }
    if (R.traitCosts) { const mul = R.traitCostMul || 1; const tc = {}; Object.entries(R.traitCosts).forEach(([t, c]) => { tc[t] = c.map(x => m(Math.ceil(x * mul))); }); R.traitCosts = tc; R.traitCostMul = undefined; }
    if (R.speciesMod) { const sm = {}; Object.entries(R.speciesMod).forEach(([sp, v]) => { const o = Object.assign({}, v); if (o.stock) o.stock = { E: m(o.stock.E), G: m(o.stock.G), P: m(o.stock.P) }; if (typeof o.mantaP === 'number') o.mantaP = m(o.mantaP); if (typeof o.mantaIncE === 'number') o.mantaIncE = m(o.mantaIncE); sm[sp] = o; }); R.speciesMod = sm; }
    if (R.crystal) R.crystal = { E: m(R.crystal.E), G: m(R.crystal.G) };
    R.scale = (base.scale || 1) * k;
    Object.assign(R, extra || {});
    return R;
  };
  // T8＝T7 の資源3倍版（2026-10-22 ユーザー採用）：協調ボーナスは「＋協調数」（半分・切り捨てを廃止）、群心核は「協調ボーナス+1」（hc3Bonus）
  G.RULESETS.t8 = G.scaleRuleset(G.RULESETS.t7, 3, { name: '仮値セットT8（T7の資源3倍）', coopMode: undefined, coopMax: 12, sporeCap: 10, noCombo: true, gemPt: 1, pbGain: 50, /* 2026-10-31 ユーザー指示（第44部 AI57）：Pブースト G6→P+30 は P増加（P+30＋協調ぶん）と同値で支配されていたため P+50 に（物差し 価値÷コスト 0.75→1.25）。試作 pbCoop（協調ボーナスの対象にする）は不採用 */ /* 2026-10-28 ユーザー採用（第41部）：宝石コンボと色を廃止（noCombo）・得点式の ×2 を削除（gemPt 2→1）。T8 の得点＝痕跡×繁栄度＋祝福×成熟度 */ gates: Object.assign({}, G.RULESETS.t7.gates, { social: [0, 0, 3, 6, 9, 12] }),
    hc3RoundUp: false, hc3Bonus: 1, mg3Inc: 2, /* 2026-10-29 修正：この3キーは lv6Pay 行末の // コメントに飲み込まれて v3.48〜v3.49 で無効になっていた（群心核のボーナス+3・代謝核 全種+2） */
    lv6Pay: { body: { L: 5 }, intel: { G: 42 } /* 2026-10-29 G36 を計測（AI53）したが G での調整は保留 */, social: { coop: 8 }, metab: { E: 90 } }, // 2026-10-28 案B：Lv6 はその色の資源で払う（T8 の絶対値・仮値。E63 相当：L1≈9＋利回り・G1＝1.5E・協調1≈3E） /* 2026-10-28 ユーザー判断：協調の上限 8→12・社会のゲート 2/5/8/11→3/6/9/12（上限8では白だけ途中から E 必須だった）*/
    // 2026-10-22 形質の強／弱の選択制（traitChoice）に合わせて弱の値段を効果比で個別に（T8 単位の絶対値・第28部）：弱が安すぎると「安い収集物」として買い占められ、初期資源の多い種族が突出した
    tribute: Object.assign({}, G.RULESETS.t7.tribute, { shared: null }), // 2026-11-03 ユーザー決定（第49部・AI63・v3.55）：献上（エネルギー／個体数）を廃止し、最終ラウンドの祝福枠に一本化（7R・5R とも）
    mcMode: 'freeOnce', mcDiscWeak: 18, mcAfterCap: true, // 2026-11-04 ユーザー決定（第51部 C18・v3.59）：消費軽減＝強「次の大量消費1回を無料（コスト0）」・弱「大量消費 −18P（恒久）」。軽減は代謝/社会の固定コスト（mmCost/msCost）の後に引く＝代謝にも効く（旧「代謝は対象外」の例外を解消）。旧＝強 恒久 −18・弱 1回 −18（T7 以前はそのまま）
    finalSlotVg: { mode: 'add', vg: 1, noBypass: true }, // v3.55 祝福枠：最終ラウンド、空いている資源枠にコマを置くと資源に加えて祝福+1（Pブーストも対象。緊急発進・協調発進・Wなし実行・神の加護の即時枠は対象外）
    traitCosts: { JI: [33, 27], JB: [39, 33], DV: [18, 15], MB: [30, 24], MC: [15, 12], DG: [15, 13], NC: [21, 17], NB: [15, 11], NM: [21, 18], NL: [30, 26], NF: [18, 15], NR: [15, 12], NE: [9, 6], NS: [9, 6], NP: [9, 6] } }); // mg3Inc＝代謝核の収入（T8 の絶対値・2026-10-22 全種+3→+2：物差しの比 1.6→1.33） // 2026-10-22 ユーザー判断：2倍では協調の効きが残るため3倍（微調整の余地も広がる）
  // 2026-10-24 ユーザー採用：T9＝T7 の資源1倍（数字を直感的に）。協調は上限12・社会の自動進行 3/6/9/12・協調ボーナス＝協調3個につき+1（coopMode 'third'＝T8 の「＋協調数」を 1/3 単位にした等価）・協調9到達で痕跡・群心核＝ボーナス+1。
  //   形質の値段は T8 の絶対値を 1/3 に丸めた（13→4・17→6・11→4・26→9）。代謝核の収入 +2 は +1（1.5倍相当）。献上（協調）4・協調発進 3 は据え置き
  G.RULESETS.t9 = G.scaleRuleset(G.RULESETS.t7, 1, { name: '仮値セットT9（資源1倍・協調12）', coopMode: 'third', coopMax: 12, coopGemAt: 9, hc3RoundUp: false, hc3Bonus: 1, mg3Inc: 1,
    gates: Object.assign({}, G.RULESETS.t7.gates, { social: [0, 0, 3, 6, 9, 12] }),
    traitCosts: { JI: [11, 9], JB: [13, 11], DV: [6, 5], MB: [10, 8], MC: [5, 4], DG: [5, 4], NC: [7, 6], NB: [5, 4], NM: [7, 6], NL: [10, 9], NF: [6, 5], NR: [5, 4] } });
  G.VERSION = '3.80'; // 画面の表示用（README の版と合わせる。公開時は index.html の ?v= も上げる＝キャッシュ対策）
  // 2026-10-30 ユーザー試行：T8 の5ラウンド版（通常4＋神の到来1）。「全トラック・係数が上がり切る」のを防ぐ（AI56）。既定は T8（7R）のまま
  G.RULESETS.t8s = Object.assign({}, G.RULESETS.t8, { name: '仮値セットT8・5ラウンド（4＋神の到来1・試行）', rounds: 5, tribute: Object.assign({}, G.RULESETS.t8.tribute, { openRound: 5 }),
    lv6Pay: Object.assign({}, G.RULESETS.t8.lv6Pay, { body: { L: 3 } }),
    speciesMod: Object.assign({}, G.RULESETS.t8.speciesMod, { wing: Object.assign({}, G.RULESETS.t8.speciesMod.wing, { stock: { E: 12, G: 6, P: 18 } }), arm: Object.assign({}, G.RULESETS.t8.speciesMod.arm, { stock: { E: 9, G: 9, P: 18 } }), ant: Object.assign({}, G.RULESETS.t8.speciesMod.ant, { stock: { E: 15, G: 6, P: 24 } }) }) }); // 2026-11-04 ユーザー決定（第50部 E1・5R の試遊用）：v3.55 の祝福枠で九腕 41%・万列 11〜17% になったため、九腕 E12 G9 P18→E9 G9 P18・万列 E15 G6 P18→E15 G6 P24（t8s のみ。4人 3シード 16〜32%）。 // 2026-11-01 ユーザー決定（第45部 S12）：5R では光翼 E15 G6 P24→E12 G6 P18・九腕 E9 G6 P18→E12 G9 P18（種族 48/3/10/39%→28/18/32/22%）。// 2026-11-01 ユーザー決定（第45部）：5R では身体 Lv6 を L5→L3（L の入手は 5R で平均8.3・専念で9〜10。ゲート7＋L5＝12 は上限11を超えていた）。7R（t8）は L5 のまま
  // 2026-11-05 T10（第55〜59部・ユーザー決定）＝T8（v3.59 で凍結）＋共用盤の改訂（資源変換・予備動員・模倣・発現を撤去／復元・増幅を追加／パス）・弱形質の効果（第57部）・知性 Lv3★／Lv4 の作り直し・代謝 Lv4＝器官の G なし・E 進行＝二段進行＋自分で払って上げた★は強の報酬・跳躍形質の弱は +1 段（★なら強）・弱の値段 JI 21／JB 27
  G.RULESETS.t10 = Object.assign({}, G.RULESETS.t8, { name: '仮値セットT10（T8＋共用盤改訂・弱形質・E進行・知性/代謝Lv4）',
    gSlots: false, noConvert: true, noReserve: true, restore: { E: 9 }, amplify: { E: 15, lins: ['Mg', 'Tl', 'Cx', 'Li'], organs: ['Hc1', 'Hc2', 'Pu1', 'Pu2'], buildOnly: ['Hc1', 'Pu1'] }, /* 2026-11-06 ユーザー決定（第68部）：増幅は E24→15・対象＝数の効果を持つ器官全て（連結・群心点／網・脈動点／腺を追加。Hc3／Pu3／ゲート+1 は対象外） */ gather: { E: 6, G: 3, P: 9, coop: 1, coopCostP: 18 }, // 2026-11-05 v3.65 採集（第65部：協調は無料だと AI が 14 回/戦＝資源枠より強い。P18〔群体枠と同じ払い・資源なし〕で 3.8 回。E/G/P は 0.1 回＝パス並み）（パスの置き換え・ユーザー指示「パスの代わりになる程度に弱い」）：固定E強 E15・固定G強 G9・P増加 P30 の 4 割弱＝物差し E6≈6・G3≈4.5・P9≈5.4・協調1≈3＋ゲート
    weakTraits2: true, ncCoopW: 1, dgDisc: [6, 4], dgDiscW: 4, dvDisc: [6, 4], dvDiscW: 4, mbBreedDiscWeak: 15, mbDiscWeak: 12,
    intelRewards: 'trait', metab4: 'organNoG', paidStrong: true, firstBonusStrict: true, doubleStep: true,
    tributeOnceGame: true, tributeVg: 2, // 2026-11-05 ユーザー決定（第67部 案 B・v3.67）：献上（共用）＝祭壇 3 マス（遺伝子・生命核・協調）。各祭壇は 1 ゲームに 1 回・祝福+2（旧＝各品目 1R1回・祝福+1）。AI 計測＝得点不変（156→158）・Lv6 1.9→1.6・万列 11→24%
    yieldAfterL: true, // 2026-11-05 ユーザー決定（第62部 案 A）：収入は L+1 を受け取ってから利回り（受け取った L も数える）。全員 +P9/R。種族の崩れ（群泳 42〜51%・万列 6〜8%）は他の調整と一緒に見直す
    traitCosts: Object.assign({}, G.RULESETS.t8.traitCosts, { JI: [27, 21], JB: [33, 27] }), leapStrong: 'res', // 2026-11-06 ユーザー決定（第68部 案 A）：知的跳躍／身体覚醒の強＝+1 段＋色の資源（G+9／L+1）。値段 JI 33/21→27/21・JB 39/27→33/27（旧＝強は +2 段）
    speciesMod: Object.assign({}, G.RULESETS.t8.speciesMod, { ant: { stock: { E: 15, G: 3, P: 12 }, coop: 2 } }) }); // 2026-11-05 ユーザー指示（第61部）：万列の協調2＝群体2回分（約E34）＋恒久ボーナスに見合うよう初期資源を E15 G6 P18→E15 G3 P12（T10 で 40〜48%→29〜31%・2シード）
  G.RULESETS.t10s = Object.assign({}, G.RULESETS.t10, { name: '仮値セットT10・5ラウンド（4＋神の到来1）', rounds: 5, tribute: Object.assign({}, G.RULESETS.t10.tribute, { openRound: 5 }), lv6Pay: G.RULESETS.t8s.lv6Pay,
    speciesMod: Object.assign({}, G.RULESETS.t8s.speciesMod, { ant: { stock: { E: 15, G: 3, P: 18 }, coop: 2 } }) }); // 5R：t8s の E1（万列 E15 G6 P24）から同じ幅（G−3・P−6）を引く＝E15 G3 P18（第61部・5R の種族は揺れが大きく要再計測）
  // 2026-11-05 ユーザー指示（第63部・バランス調査・試作）：T11＝T10 の資源量をすべて 1/3（T7 の単位に戻す）＋協調ボーナス＝協調 2 個ごとに +1（coopMode 'half'・切り捨て）。
  //   scaleRuleset が倍率を掛けるのは基準単位のキーだけなので、T8／T10 で絶対値（×3 の単位）で書いたキーはここで 1/3 に丸めて上書きする：復元 E9→3・増幅 E24→8・消費軽減 弱 −18→−6・増殖暴走 弱 繁殖 −15→−5／大量消費(身体) −12→−4・進化加速 [6,4]→[2,1]・Lv6 G42→14／E90→30・Pブースト P+50→+17・胞子の上限 10→3・代謝核 +2→+1（T9 と同じ）。形質の値段・種族の初期資源・大量消費・繁殖・利回り・進行・器官は scaleRuleset が 1/3 に丸める（T9 と同じ丸め）
  G.RULESETS.t11 = G.scaleRuleset(G.RULESETS.t10, 1 / 3, { name: '仮値セットT11（試作：T10 の資源1/3・協調2個ごとに+1）', coopMode: 'half', coopRoundUp: false,
    restore: { E: 3 }, amplify: { E: 5, lins: ['Mg', 'Tl', 'Cx', 'Li'], organs: ['Hc1', 'Hc2', 'Pu1', 'Pu2'], buildOnly: ['Hc1', 'Pu1'] }, gather: { E: 2, G: 1, P: 3, coop: 1, coopCostP: 6 }, mcDiscWeak: 6, mbBreedDiscWeak: 5, mbDiscWeak: 4, dvDisc: [2, 1], dvDiscW: 1, dgDiscW: 1, sporeCap: 3, mg3Inc: 1, pbGain: 17,
    lv6Pay: { body: { L: 5 }, intel: { G: 14 }, social: { coop: 8 }, metab: { E: 30 } } });
  G.RULESETS.t11s = Object.assign({}, G.RULESETS.t11, { name: '仮値セットT11・5ラウンド（試作）', rounds: 5, tribute: Object.assign({}, G.RULESETS.t11.tribute, { openRound: 5 }), lv6Pay: Object.assign({}, G.RULESETS.t11.lv6Pay, { body: { L: 3 } }),
    speciesMod: G.scaleRuleset({ speciesMod: G.RULESETS.t10s.speciesMod }, 1 / 3).speciesMod });
  // 2026-11-07 ユーザー決定（第69部 3a＋K1）：T12＝t10s（5R）＋跳躍形質の強は「+1 段＋そのトラックのゲート+1」（色の資源をやめる）＋緊急発進・協調発進で使った資源枠は獲得量 2 倍（launchMul）。
  //   評価の基準は 5R（7R 版は作らない）。T12 から画面の「ルール数値」は RULES_VISIBLE だけを表示（過去のセットは ?rules= と計測スクリプトからは使える）
  G.RULESETS.t12 = Object.assign({}, G.RULESETS.t10s, { name: '仮値セットT12（5ラウンド：T10＋跳躍の強＝+1段＋ゲート+1・発進は獲得量2倍）', leapStrong: 'gate', launchMul: 2 });
  // 2026-11-07 ユーザー決定（第70部 §5・§6）：T13＝T12＋器官効果の第2版（organFx 2＝5R 向けの「建造時の効果」型）＋適応放散の強＝2 枚で完成＋弱の値段（DV・MB）。
  //   促進＝E・G の支払い割引（系統内の最大値。E＝進行・器官・スキャン・復元・増幅／G＝形質・器官）／連結＝建造時、持っている器官 1 枚につき（自分も含む・上限 liCap）E／好きな資源／転写＝建造時 G＋2 段目に知性のゲート+1・3 段目は形質 1 枚無料（G15 以下）／群心＝建造時 協調+2（1・2 段）／代謝腺＝建造時 E+6／脈動腺＝建造時 L+1。
  //   連結は建造時だけの効果になったので増幅の対象から外す。changed＝この版で変えた効果・値段（画面に「改」を付ける。次の数値セットでは外す）
  G.RULESETS.t13 = Object.assign({}, G.RULESETS.t12, { name: '仮値セットT13（5ラウンド：T12＋器官効果の第2版・適応放散・弱の値段）', organFx: 2,
    cxDisc: [[3, 0], [6, 3], [9, 6]], liPer: [6, 6, 9], liCap: 6, liRes: [false, true, true], tlBuild: [6, 9, 0], tlFreeMax: 15, tlGateTier: 2, hc1Coop: [2, 2], hc2Coop: 2, mg2Build: 6, pu2L: 1, nrMode: 'two',
    traitCosts: Object.assign({}, G.RULESETS.t12.traitCosts, { NR: [18, 12], DV: [18, 9], MB: [30, 15] }),
    amplify: { E: 15, lins: ['Mg', 'Tl', 'Cx'], organs: ['Hc1', 'Hc2', 'Pu1', 'Pu2'], buildOnly: ['Hc1', 'Pu1'] },
    // 2026-11-07 v3.74（ユーザー指示「調整して公開して」）：器官の値段の一括調整＝value_scale の比（効果の価値÷手番込みのコスト）と items.js（2 シード）で並べ、脈動 +3E（点 15→18・腺 18→21・核 24 据え置き）・群心網 15→18・結合膜 12→9。代謝・転写・促進は据え置き（比 0.57〜1.0。転写・促進を AI が建てないのは AI 側の癖）。基準の表は [[12,3],[15,6],[21,6]]
    organCostBy: { Pu: [[18, 3], [21, 6], [24, 6]], Hc: [[12, 3], [18, 6], [21, 6]], Li: [[9, 3], [15, 6], [21, 6]] },
    changed: ['Cx1', 'Cx2', 'Cx3', 'Li1', 'Li2', 'Li3', 'Tl1', 'Tl2', 'Tl3', 'Hc1', 'Hc2', 'Mg2', 'Pu1', 'Pu2', 'NR', 'DV', 'MB'] });
  // 2026-11-08 ユーザー決定（第71部 §11〜§19）：T14＝T13＋ゲート+1 の全廃（群心核＝建造時 Wなし実行権+1／脈動核＝建造時 L+1＋1L＝E18／G18／転写体＝建造時 弱の形質 1 枚を無料〔弱の値段 G12 以下〕／知的跳躍・身体覚醒の強＝+1 段＋痕跡+1。代謝核のゲート+1 は据え置き）
  //   ＋適応放散＝2 枚で完成が 強 2 系統 G21／弱 1 系統 G12 ＋進化加速＝三段進行を 強 2 回／弱 1 回（割引をやめる）＋増幅→一気立て（同じ系統の器官を 2〜3 枚続けて建造・W 1 個・制限なし）＋光翼 P18→24
  //   ＋祭壇の内訳（§16 M-a）＝生命核 痕跡+2／遺伝子 痕跡+1＋祝福+1／協調 祝福+2 ＋繁殖変換（§19 S-c）＝P150 の 1 段と L3 の 1 段を同時に払える（増殖暴走の強＝それぞれ 2 段まで・各段 −45P の割引はやめる。弱は現行）。changed（「改」）は外す。
  //   計測用：Q-b（繁殖 P120）は --set breed=[120,120,120,120] で。
  G.RULESETS.t14 = Object.assign({}, G.RULESETS.t13, { name: '仮値セットT14（5ラウンド：T13＋ゲート全廃・一気立て・祭壇の痕跡・繁殖の同時払い）',
    noOrganGate: true, hc3Shield: 1, pu3L: 1, pu3Rate: 6, tlFreeTier2: 12, leapStrong: 'gem', nrTwoN: [2, 1], dvMode: 'triple', dvTriple: [2, 1], mbMode: 'multi', mbBreedN: 2,
    amplify: null, burst: { max: 3 }, tributeVg: { G: 1, L: 0, coop: 2 }, tributeReal: { G: 1, L: 2 },
    traitCosts: Object.assign({}, G.RULESETS.t13.traitCosts, { NR: [21, 12] }),
    speciesMod: Object.assign({}, G.RULESETS.t13.speciesMod, { wing: Object.assign({}, G.RULESETS.t13.speciesMod.wing, { stock: { E: 12, G: 6, P: 24 } }) }),
    changed: [] });
  // 2026-11-09 ユーザー決定（第71部 §23〜§26・ORDERS O-03）：T15＝T14＋器官の造り直し。
  //   差額払い（organCumulative：1 枚ずつは同じ系統の 1 つ前の段の定価を引いた差額・一気立ては各段の定価）／係数 B（lineageCoefAt：系統完成の成熟度+1 は 1・3 系統目）／
  //   促進 Cx・共生 NS・代替燃料 NE・適応放散 NR の廃止／代謝ゲート 2/4/6/8／代謝 Lv4＝特殊器官（metab4 'special'・場の 5 枚から先着 1 枚）／
  //   器官の恩寵＝系統 1 つを 1 段目の定価 1 回で 3 段目まで（toLineage）／新系統 孵化 Fk・神経 Nv・発光 Lm（8 系統から 4 を抽選・初心者固定は Mg/Tl/Hc/Pu のまま）
  G.RULESETS.t15 = Object.assign({}, G.RULESETS.t14, { name: '仮値セットT15（5ラウンド：T14＋器官の造り直し＝差額払い・系統完成 1/3 系統目・代謝Lv4 特殊器官・新系統 3）',
    organCumulative: true, lineageCoefAt: [1, 3], metab4: 'special', specialOrgans: ['SpE', 'SpG', 'SpP', 'SpC', 'SpM'], toLineage: true,
    organSet: ['Mg', 'Tl', 'Hc', 'Pu', 'Li', 'Fk', 'Nv', 'Lm'],
    gates: Object.assign({}, G.RULESETS.t14.gates, { metab: [0, 0, 2, 4, 6, 8] }),
    traitPool: G.RULESETS.t14.traitPool.filter(t => !['NE', 'NS', 'NR'].includes(t)),
    fkInc: 12, fk2Build: 24, nvTrait: true, nv2Inc: 3, nv3Vg: 1, lm1Inc: 3, lm2Vg: 1, lm3Vg: 1, lm3Real: 1,
    spInc: { SpE: { E: 3 }, SpG: { G: 2 }, SpP: { P: 5 }, SpC: { coop: 0.5 }, SpM: { E: 1, G: 1 } },
    changed: [] });
  G.RULES_VISIBLE = ['t15'];
  G.RULESET_ORDER = ['v1', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't8s', 't9', 't10', 't10s', 't11', 't11s', 't12', 't13', 't14', 't15'];
  G.GATE_LABEL = { metab: '器官', intel: '形質', social: '協調', body: '個体数の投入（繁殖・大量消費）' };
  G.GATE_LABEL_L = '生命核の投入（代用払い・緊急発進・適応進化）'; G.GATE_SHORT_L = 'L投入'; // T5：身体＝生命核軸 // T4 では赤＝繁殖変換＋大量消費(身体)のみ（engine の gateCount）
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
      2: 'G+{3}', 3: '強：今すぐ形質1枚をG-{3}で購入可／弱：G+{1}/R', 4: '追加アクション1回（排他なし・Eコスト半額）',
      5: '強：形質コスト永続-{2}＋後着でも常に強効果／弱：G+{6}',
    },
    social: {
      2: '協調+1', 3: '強：協調+2／弱：協調+1＋G+3', 4: 'Wなし実行権+1（資源獲得スロット／個人カード・コマを置かず占有しない）',
      5: '強：協調+1＋Wなし実行権+2／弱：協調+1＋Wなし実行権+1',
    },
    metab: {
      2: 'E収入+{1}', 3: '強：E収入+{1}かつG収入+{1}／弱：即時E+{8}', 4: 'いつでもE↔G 1:1変換（無料・無制限）',
      5: '強：収入が全種+{2}／弱：全種+{1}',
    },
  };

  // T4 の差し替え報酬文（socialRewards='shield'／intel4='traitDisc'）
  G.TRACK_REWARDS_T5_BODY = { 2: '収入の利回り（保有L1個につき+1）を、Lごとに E か G から選べる', 3: '強：今すぐL+1 ＋ 緊急発進の対象に形質購入・宝石セット・大量消費を追加／弱：今すぐL+1', 4: '1L＝E4／G4（代用払いの価値上昇）＋ 利回りで P も選べる', 5: '強：利回りが保有L1個につき2 ＋ 今すぐL+1／弱：今すぐL+1' };
  G.TRACK_REWARDS_T6_BODY4 = '痕跡+1 ＋ 1L＝E4／G4 ＋ 利回りで P も選べる ＋ 結晶化（L2→祝福+1・排他なし）を解放';
  G.TRACK_REWARDS_T7_INTEL = { 2: 'G+{3}', 3: '強：Gを払う先取り枠（模倣・発現）を今すぐ1回 G0 で実行（排他無視）／弱：以後それらの G -{1}', 4: '研究：献上（遺伝子）が1ラウンドに何度でも', 5: '強：後着でも常に強効果／弱：G+{6}' };
  // 2026-11-05 T10（第58〜59部）：知性 Lv3★／Lv4 の作り直し・代謝 Lv4 の無料変換撤去
  G.TRACK_REWARDS_T10_INTEL = { 2: 'G+{3}', 3: '強：次の形質1枚を「弱なら無料・強は差額」で／弱：次の形質1枚 -{3}G', 4: '形質3枚ごとに祝福+1（即時。Lv6の終了時換算とは重ねない）', 5: '強：後着でも常に強効果／弱：G+{6}' };
  G.TRACK_REWARDS_T10_METAB4 = '以後、器官建造のGコストなし＋後追い料なし';
  G.TRACK_REWARDS_T15_METAB4 = '場の特殊器官 5 枚から 1 枚を取る（先着・値段なし・器官 1 枚に数える）';
  G.MIMIC_EFFECTS = [ // 模倣の対象（!即時効果のみ。◆L+1・∞恒久・手収入は対象外）。誰かがそのLv以上に到達していること
    { id: 'intel2', track: 'intel', lv: 2, label: '知性Lv2：G+{3}' }, { id: 'social2', track: 'social', lv: 2, label: '社会Lv2：P+{6}' },
    { id: 'social3s', track: 'social', lv: 3, label: '社会Lv3★強：Wなし実行権+1' }, { id: 'social3w', track: 'social', lv: 3, label: '社会Lv3★弱：P+{10}' }, { id: 'metab3w', track: 'metab', lv: 3, label: '代謝Lv3★弱：E+{8}' },
  ];
  G.TRACK_REWARDS_T4 = {
    social: { 2: 'P+{6}', 3: '強：Wなし実行権+1／弱：P+{10}', 4: 'Wなし実行権+1（資源獲得スロット／個人カード・コマを置かず占有しない）', 5: '強：Wなし実行権+2／弱：Wなし実行権+1' },
    intel: { 4: '形質購入コスト-1（恒久）' },
  };
  // 形質14種
  G.TRAITS = {
    IE: { name: 'E収入強化', cat: 'I', cost: [3, 2], strong: 'E+2/R（恒久）', weak: '即時E+6', permWeak: false },
    IG: { name: 'G収入強化', cat: 'I', cost: [2, 1], strong: 'G+1/R（恒久）', weak: '即時G+3', permWeak: false },
    IP: { name: 'P収入強化', cat: 'I', cost: [2, 1], strong: 'P+3/R（恒久）', weak: '即時P+9', permWeak: false },
    DB: { name: '身体加速', cat: 'D', cost: [3, 2], strong: '身体進行コスト-2（恒久）', weak: '次の身体進行1回だけ-2', permWeak: false },
    DI: { name: '知性加速', cat: 'D', cost: [3, 2], strong: '知性進行コスト-2（恒久）', weak: '次の知性進行1回だけ-2', permWeak: false },
    MC: { name: '消費軽減', cat: 'M', cost: [3, 2], strong: '次の大量消費1回を無料（コスト0）', weak: '大量消費コスト-{mcDiscWeak:6}P（恒久）', permWeak: true, legacyStrong: '大量消費コスト-{mcDisc:6}P（恒久）', legacyWeak: '次の大量消費1回だけ-{mcDisc:6}P' }, // 2026-11-04 v3.59（第51部 C18）：mcMode='freeOnce' が既定。mcMode の無い数値セット（T7 以前）は legacy の文を ui が表示
    IB: { name: '複合収入', cat: 'I', cost: [4, 3], strong: 'E+1/RかつG+1/R（恒久）', weak: '即時E+3かつG+3', permWeak: false },
    DA: { name: '適応効率', cat: 'D', cost: [2, 1], strong: '選んだ1トラックの進行コスト-1（恒久）', weak: '次の進行1回だけ-1', permWeak: false },
    DV: { name: '進化加速', cat: 'D', cost: [8, 6], strong: '全トラック進行コスト-{2}（恒久）', weak: '全トラック-{1}（恒久）', weak2: '全トラック進行コスト-{dvDiscW:4}（恒久）', strongTriple: '三段進行をゲーム中 2 回（3 段分の E を合算・手番 1 つ・Lv5 まで）', weakTriple: '三段進行をゲーム中 1 回（3 段分の E を合算・手番 1 つ・Lv5 まで）', permWeak: true }, // strongTriple／weakTriple＝T14（dvMode 'triple'・第71部 §9 D-a）
    MB: { name: '増殖暴走', cat: 'M', cost: [7, 5], strong: '繁殖変換 -{15}P（各段）＋大量消費(身体)-{mbDisc:8}P', weak: '大量消費(身体)-{mbDisc:8}Pのみ', weak2: '繁殖変換 -{mbBreedDiscWeak:15}P（各段）＋大量消費(身体)-{mbDiscWeak:12}P', strongMulti: '繁殖変換で P の段と生命核の段をそれぞれ 2 段まで同時に ＋ 大量消費(身体)-{mbDisc:8}P', permWeak: true }, // strongMulti＝T14（mbMode 'multi'・第71部 §19 S-c） // 2026-10-22 半減→各段-15P（4段で半減だと P300 の価値になるため）
    IM: { name: '代謝亢進', cat: 'I', cost: [8, 6], strong: '好きな1種の収入+3（取得時固定）', weak: '好きな1種の収入+2（取得時固定）', permWeak: true },
    DG: { name: '遺伝子図書館', cat: 'D', cost: [7, 5], strong: '毎R形質1枚を-{2}Gで購入可（排他不要）', weak: '毎R形質1枚を-{1}Gで購入可（排他不要）', weak2: '毎R形質1枚を-{dgDiscW:4}Gで購入可（排他不要）', permWeak: true }, // 2026-11-05 弱の文を単体で読める形に（ユーザー指摘）
    JI: { name: '知的跳躍', cat: 'J', cost: [9, 7], strong: '知性+2段階（即時）', strongRes: '知性+1段階＋G+{3}（即時）', strongGate: '知性+1段階＋知性のゲート+1（即時）', strongGem: '知性+1段階＋痕跡+1（即時）', strongCap: '知性+2段階（即時・Lv4 まで。Lv4 以上なら+1段階）', weak: '知性+1段階＋Lv5★で必ず強効果', weak2: '知性+1段階（その段が★なら強の報酬）', permWeak: false, instant: true },
    JB: { name: '身体覚醒', cat: 'J', cost: [9, 7], strong: '身体+2段階（即時）', strongRes: '身体+1段階＋生命核+1（即時）', strongGate: '身体+1段階＋身体のゲート+1（即時）', strongGem: '身体+1段階＋痕跡+1（即時）', strongCap: '身体+2段階（即時・Lv4 まで。Lv4 以上なら+1段階）', weak: '身体+1段階＋Lv5★で必ず強効果', weak2: '身体+1段階（その段が★なら強の報酬）', permWeak: false, instant: true },
    // 2026-10-28 ユーザー採用（第42部 N5/N8/N9）：コンボ廃止の補填。序盤に取るほど得な「資源を生む／器官に役立つ」形質
    NE: { name: '代替燃料', cat: 'N', cost: [3, 2], strong: '器官建造の E を P で払える（E1＝P1）', weak: '器官建造の E を P で払える（E3＝P5・切り上げ）', permWeak: true }, // 2026-10-30 弱 E1＝P2 → E3＝P5（強弱の差を縮める・ユーザー採用）
    NS: { name: '共生', cat: 'N', cost: [3, 2] /* 2026-10-29 G6→G9（T8）：九腕 39% の是正・AI52 */, strong: '器官建造時、同じ系統の器官を他者が持っていれば G コストなし', weak: '器官建造時、同じ系統の器官を他者が持っていれば G-{1}', permWeak: true },
    NP: { name: '胞子', cat: 'N', cost: [3, 2], strong: 'ラウンド終了時、残った E を P に換える（E1→P3・上限 E{sporeCap:3}）', weak: 'ラウンド終了時、残った E を P に換える（E1→P2・上限 E{sporeCap:3}）', permWeak: true },
  };
  G.TRAIT_ORDER = ['IE', 'IG', 'IP', 'IB', 'DB', 'DI', 'DA', 'MC', 'DV', 'MB', 'IM', 'DG', 'JI', 'JB'];
  // T7（第14部）の新形質＝突然変異。値段は数値セット側（RULESETS.t7.traitCosts）で上書きする
  Object.assign(G.TRAITS, {
    NC: { name: '群れ本能', cat: 'N', cost: [8, 6], strong: '即時 協調+2', weak: '即時 協調+1', weak2: '即時 協調+1＋P+{3}', permWeak: false, instant: true }, // 文言は T7 の ncCoop [2,1] に合わせた（2026-10-24）
    NB: { name: '結晶体質', cat: 'N', cost: [10, 8], strong: '献上（生命核）の必要数が1つ少なく、払った生命核を身体の収集物に数える', weak: '献上（生命核）の必要数が1つ少ない', permWeak: true, strongNoCoop: '献上（生命核）の必要数が1つ少ない（強：先着）' }, // T7 nbCoopDisc=false では強も結晶化側のみ // 文言は T7 の nbCoopDisc=false（協調側の割引なし）に合わせた。強弱で効果が同じ点は要検討（2026-10-24）
    NM: { name: '擬態', cat: 'N', cost: [12, 9], strong: '1ラウンド1回、他者が使用済みの資源獲得枠を無償で使える', weak: '1ラウンド1回、他者が使用済みの資源獲得枠を E{3} を払って使える', weak2: '1ラウンド1回、他者が使用済みの資源獲得枠を E{2} を払って使える', permWeak: true },
    NL: { name: '長命', cat: 'N', cost: [9, 7], strong: '即時 生命核+2', weak: '即時 生命核+1', weak2: '即時 生命核+1＋E+{3}', permWeak: false, instant: true },
    NF: { name: '先見', cat: 'N', cost: [11, 8], strong: 'Lv3★／Lv5★を後着でも強の報酬で受け取る（痕跡の先着ボーナスは除く）', weak: 'Lv5★のみ', weak2: 'Lv3★／Lv5★のどちらか1回、後着でも強の報酬', permWeak: true },
    NR: { name: '適応放散', cat: 'N', cost: [12, 9], strong: '器官の系統完成（同じ系統3枚）の成熟度+1を、通常の2系統目までに加えて3系統目でも得る', strongTwo: '器官の系統完成が 2 枚で成立する（1 系統だけ・取得時に 2 枚の系統があれば即時）', strongTwo2: '器官の系統完成が 2 枚で成立する（2 系統まで・取得時に 2 枚の系統があれば即時）', weakTwo: '器官の系統完成が 2 枚で成立する（1 系統だけ・取得時に 2 枚の系統があれば即時）', weak: '系統完成のたびE+{3}', permWeak: true }, // strongTwo2／weakTwo＝T14（nrTwoN [2,1]・第71部 §5） // strongTwo＝T13（nrMode 'two'） // 2026-11-05 文言を具体的に（ユーザー「意味がぴんとこない」）
  });
  // 画像の代替（新しいIDは既存の絵を仮に使う）
  G.ART_ALIAS = { NC: 'IG', NB: 'MC', NM: 'DA', NL: 'IP', NF: 'DI', NR: 'DV', Mg1: 'Cv1', Mg2: 'Cv2', Mg3: 'Cv3', Tl1: 'Tr1', Tl2: 'Tr2', Tl3: 'Tr3', Hc1: 'Li1', Hc2: 'Li2', Hc3: 'Li3', Pu1: 'St1', Pu2: 'St2', Pu3: 'St3', Cx1: 'Ca1', Cx2: 'Ca2', Cx3: 'Ca3' };
  // 試作：上位形質（終盤のGの出口。RS.premium のときだけアクション 'premium' で購入可。形質として数える＝青ゲート・4/8枚目にも算入）
  Object.assign(G.TRAITS, {
    XA: { name: '結晶核', cat: 'X', cost: [12, 10], strong: '即時 祝福+2', weak: '即時 祝福+1', permWeak: false, instant: true, premium: true },
    XB: { name: '超進化', cat: 'X', cost: [12, 10], strong: '係数+1（上限×7）', weak: '即時 祝福+1', permWeak: false, instant: true, premium: true },
    XC: { name: '深層記憶', cat: 'X', cost: [10, 8], strong: '収入時 E+3 G+2（恒久）', weak: '収入時 E+2 G+1（恒久）', permWeak: true, premium: true },
    XD: { name: '適応爆発', cat: 'X', cost: [10, 8], strong: '全トラック進行コスト-3（恒久）', weak: '全トラック進行コスト-2（恒久）', permWeak: true, premium: true },
  });
  G.PREMIUM_ORDER = ['XA', 'XB', 'XC', 'XD'];

  // 器官・初期固定12種（連結/翻訳/転流/律動）
  G.ORGANS = {
    Li1: { lin: 'Li', tier: 1, name: '結合膜', strong: '以後、器官を建造するたびE+{2}', weak: '以後、器官を建造するたびE+{1}' },
    Li2: { lin: 'Li', tier: 2, name: '共役組織', strong: '建造するたび好きな資源+{3}', weak: '建造するたび好きな資源+{2}' },
    Li3: { lin: 'Li', tier: 3, name: '統合体', strong: '系統を完成させるたび好きな資源+{6}', weak: '同 +{4}' },
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
  // T7（第14部）の器官：系統＝トラックの色に対応する「3段階で育つ体のしくみ」
  Object.assign(G.ORGANS, {
    Mg1: { lin: 'Mg', tier: 1, name: '代謝膜', strong: '収入 E+{2}', weak: '収入 E+{1}' }, // ※organSameEffect では weak は使わない
    Mg2: { lin: 'Mg', tier: 2, name: '代謝腺', strong: '収入 E+{1} G+{1}', weak: '収入 G+{1}' },
    Mg3: { lin: 'Mg', tier: 3, name: '代謝核', strong: '収入 全種+{mg3Inc:1} ＋ 緑の収集物+1扱い', weak: '収入 全種+{mg3Inc:1}' },
    Tl1: { lin: 'Tl', tier: 1, name: '転写膜', strong: '形質のGコスト-{2}', weak: '-{1}' },
    Tl2: { lin: 'Tl', tier: 2, name: '転写体', strong: '形質のGコスト-{3}（系統内の最大値）', weak: '-{2}' },
    Tl3: { lin: 'Tl', tier: 3, name: '全転写', strong: '形質のGコスト-{4} ＋ 知性のゲート+1', weak: '-{3}' },
    Hc1: { lin: 'Hc', tier: 1, name: '群心点', strong: '建造時 協調+1', weak: '建造時 協調+1' }, // 文言は T7 の hc1Coop [1,1] に合わせた（2026-10-24）
    Hc2: { lin: 'Hc', tier: 2, name: '群心網', strong: '群体E/Gで協調+2追加', weak: '群体E/Gで協調+1追加' },
    Hc3: { lin: 'Hc', tier: 3, name: '群心核', strong: '協調ボーナスの端数を切り上げ ＋ 社会のゲート+1', weak: '協調ボーナスの端数を切り上げ', strongB: '協調ボーナス+{1} ＋ 社会のゲート+1', weakB: '協調ボーナス+{1}' }, // 2026-10-20 上限撤廃に伴い「上限+2/+1」から差し替え。倍化版（hc3Bonus）では strongB/weakB
    Pu1: { lin: 'Pu', tier: 1, name: '脈動点', strong: '建造時 生命核+1', weak: '同' },
    Pu2: { lin: 'Pu', tier: 2, name: '脈動腺', strong: '生命核の利回り +{1}/L', weak: '同' },
    Pu3: { lin: 'Pu', tier: 3, name: '脈動核', strong: '1L＝E{4}／G{4} ＋ 身体のゲート+1', weak: '1L＝E{4}／G{4}' },
    Cx1: { lin: 'Cx', tier: 1, name: '促進点', strong: 'トラック進行 -{1}E', weak: '同' },
    Cx2: { lin: 'Cx', tier: 2, name: '促進腺', strong: 'トラック進行 -{2}E（系統内の最大値）', weak: '-{1}E' },
    Cx3: { lin: 'Cx', tier: 3, name: '全促進', strong: 'トラック進行 -{3}E', weak: '-{2}E' },
  });
  // T15（第71部 §25・§26）：新系統 孵化 Fk／神経 Nv／発光 Lm（定価は基準 12+3／15+6／21+6）と代謝 Lv4 の特殊器官（系統なし＝lin 'Sp'・場の 5 枚から先着 1 枚。名前は仮）
  Object.assign(G.ORGANS, {
    Fk1: { lin: 'Fk', tier: 1, name: '孵化膜', strong: '収入 P+12', weak: '同' },
    Fk2: { lin: 'Fk', tier: 2, name: '孵化腺', strong: '建造時 P+24 ＋ 収入 P+12', weak: '同' },
    Fk3: { lin: 'Fk', tier: 3, name: '孵化核', strong: '建造時 繁殖変換を 1 回、手番なしで（支払いは通常・同時払いも可）＋ 収入 P+12', weak: '同' },
    Nv1: { lin: 'Nv', tier: 1, name: '神経点', strong: 'この器官は形質 1 枚として数える（知性のゲート・形質 3／6 枚目の成熟度）', weak: '同' },
    Nv2: { lin: 'Nv', tier: 2, name: '神経網', strong: '形質 1 枚として数える ＋ 収入 G+3', weak: '同' },
    Nv3: { lin: 'Nv', tier: 3, name: '神経核', strong: '形質 1 枚として数える ＋ 建造時 祝福+1', weak: '同' },
    Lm1: { lin: 'Lm', tier: 1, name: '発光点', strong: '収入 G+3', weak: '同' },
    Lm2: { lin: 'Lm', tier: 2, name: '発光腺', strong: '建造時 祝福+1', weak: '同' },
    Lm3: { lin: 'Lm', tier: 3, name: '発光核', strong: '建造時 痕跡+1 ＋ 祝福+1', weak: '同' },
    SpE: { lin: 'Sp', tier: 0, special: true, name: '蓄電嚢', strong: '収入 器官 1 枚につき E+3', weak: '同' },
    SpG: { lin: 'Sp', tier: 0, special: true, name: '蓄積腺', strong: '収入 器官 1 枚につき G+2', weak: '同' },
    SpP: { lin: 'Sp', tier: 0, special: true, name: '貯蔵腔', strong: '収入 器官 1 枚につき P+5', weak: '同' },
    SpC: { lin: 'Sp', tier: 0, special: true, name: '連絡腺', strong: '収入 器官 2 枚につき 協調+1', weak: '同' },
    SpM: { lin: 'Sp', tier: 0, special: true, name: '循環腔', strong: '収入 器官 1 枚につき E+1 G+1', weak: '同' },
  });
  // T13（第70部 §6・organFx 2）：器官効果の第2版の効果文（数は T13 の絶対値）。organDef(x, id) で数値セットに応じて差し替える
  G.ORGANS_V2 = {
    Cx1: { strong: 'E の支払い −3（進行・器官・共用盤）', weak: '同' },
    Cx2: { strong: 'E の支払い −6・G の支払い −3（形質・器官。系統内の最大値）', weak: '同' },
    Cx3: { strong: 'E の支払い −9・G の支払い −6', weak: '同' },
    Li1: { strong: '建造時、持っている器官 1 枚につき E+6（この器官も数える・6 枚まで）', weak: '同' },
    Li2: { strong: '建造時、持っている器官 1 枚につき好きな資源+6（6 枚まで）', weak: '同' },
    Li3: { strong: '建造時、持っている器官 1 枚につき好きな資源+9（6 枚まで）', weak: '同' },
    Tl1: { strong: '建造時 G+6 ＋ 形質のGコスト−6', weak: '同' },
    Tl2: { strong: '建造時 G+9 ＋ 知性のゲート+1 ＋ 形質のGコスト−9（系統内の最大値）', weak: '同' },
    Tl3: { strong: '建造時 形質 1 枚を無料で（G15 以下・強が残っていれば強）＋ 形質のGコスト−12', weak: '同' },
    Hc1: { strong: '建造時 協調+2', weak: '同' },
    Hc2: { strong: '建造時 協調+2 ＋ 群体E/Gで協調+2追加', weak: '同' },
    Mg2: { strong: '建造時 E+6 ＋ 収入 E+3 G+3', weak: '同' },
    Pu2: { strong: '建造時 生命核+1 ＋ 生命核の利回り +3/L', weak: '同' },
  };
  // T14（第71部 §11・ユーザー決定）：ゲート+1 を外した 3 段目・転写体の効果文（noOrganGate のとき V2 の上に重ねる）
  G.ORGANS_V3 = {
    Tl2: { strong: '建造時 G+9 ＋ 弱の形質 1 枚を無料で（弱の値段 G12 以下）＋ 形質のGコスト−9（系統内の最大値）', weak: '同' },
    Hc3: { strong: '協調ボーナス+{1} ＋ 建造時 Wなし実行権+1', weak: '同', strongB: '協調ボーナス+{1} ＋ 建造時 Wなし実行権+1', weakB: '同' },
    Pu3: { strong: '建造時 生命核+1 ＋ 1L＝E18／G18', weak: '同' },
  };
  G.organDef = (x, id) => { const R = (x && x.rules !== undefined) ? G.RULESETS[x.rules || 'v1'] : (x || {}); const d = G.ORGANS[id]; if (!d) return d; let o = (R && R.organFx === 2 && G.ORGANS_V2[id]) ? Object.assign({}, d, G.ORGANS_V2[id]) : d; if (R && R.noOrganGate && G.ORGANS_V3[id]) o = Object.assign({}, o, G.ORGANS_V3[id]); return o; }; // x＝ゲーム状態 or 数値セット
  G.isChanged = (x, id) => { const R = (x && x.rules !== undefined) ? G.RULESETS[x.rules || 'v1'] : (x || {}); return !!(R && R.changed && R.changed.includes(id)); }; // 画面の「改」バッジ
  G.ORGAN_FIELD = ['Li1', 'Li2', 'Li3', 'Tr1', 'Tr2', 'Tr3', 'Fl1', 'Fl2', 'Fl3', 'Rh1', 'Rh2', 'Rh3']; // 初心者固定
  G.LINEAGES = { Li: '連結', Tr: '翻訳', Fl: '転流', Rh: '律動', Ca: '触媒', Cv: '収斂', Re: '感応', St: '応力', Mg: '代謝', Tl: '転写', Hc: '群心', Pu: '脈動', Cx: '促進', Fk: '孵化', Nv: '神経', Lm: '発光', Sp: '特殊' };
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
    L: { name: '痕跡連動獲得', text: '+3P ＋ 保有痕跡×2P' },
    M: { name: '形質連動獲得', text: '+1E ＋ 保有形質×1E（最大+5）' },
    N: { name: '知性連動獲得', text: '+1G ＋ 知性Lv×1G' },
    O: { name: '博打収集', text: '所持Eを全て支払い、1EにつきP+2' },
    P: { name: '個人変換', text: 'E-3 → G+2' },
    Q: { name: '安定収集', text: '+1E +1G' },
    R: { name: 'P収集弱', text: '+3P ＋ P20ごとに+1P' },
    S: { name: '早期形質支援', text: '知性Lv2以下なら+3G、Lv3以上は+1G' },
    T: { name: '繁殖連動獲得', text: 'P+6。繁栄度×4以上ならP+10' },
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
    { id: 'MB',   group: 'mass', excl: true,  name: '大量消費(身体)', text: 'P20 → 痕跡+1' },
    { id: 'MI',   group: 'mass', excl: true,  name: '大量消費(知性)', text: 'P20 → G4以下の形質を異なる2種' },
    { id: 'MS',   group: 'mass', excl: true,  name: '大量消費(社会)', text: 'P20 → 協調+2' },
    { id: 'MM',   group: 'mass', excl: true,  name: '大量消費(代謝)', text: 'P20 → E+10 G+10' },
    { id: 'TRT',  group: 'oth',  excl: true,  name: '形質購入／アップグレード', text: 'Gを払い形質を取得・差額+1で上位へ' },
    { id: 'TRT2', group: 'oth',  excl: true,  name: '形質購入（割増）', text: '通常コスト＋ラウンド数ぶんのE', ext: 'x1' }, // 拡張x1のみ
    { id: 'MIM',  group: 'oth',  excl: true,  name: '模倣',     text: 'Gを払い 到達済みの Lv2／Lv3★ の即時(!)効果を1つ', rs: 'gSlots' }, // T7 第21部：G を払う先取り枠
    { id: 'EXP',  group: 'oth',  excl: true,  name: '発現',     text: 'Gを払い 痕跡+1（先着なし）', rs: 'gSlots' },
    { id: 'GEM',  group: 'oth',  excl: true,  name: '献上（遺伝子）', text: 'G(10−形質数・下限5) → 祝福+1' },
    { id: 'TE',   group: 'trib', excl: true,  name: '恩寵枠（エネルギー）', text: 'E → 祝福+1', rs: 'tribute' }, // 第33部：R6 から開く早取りの恩寵枠
    { id: 'TP',   group: 'trib', excl: true,  name: '恩寵枠（個体数）', text: 'P → 祝福+1', rs: 'tribute' },
    { id: 'TR',   group: 'trib', excl: true,  name: '恩寵枠（痕跡）', text: 'E+P → 痕跡+1', rs: 'tribute' },
    { id: 'TO',   group: 'trib', excl: true,  name: '器官の恩寵', text: '器官1枚を無料＋もう1枚を半額', rs: 'tribute' }, // 第35部：多彩な恩寵枠（毎ゲーム pool から pick 枚）
    { id: 'TT',   group: 'trib', excl: true,  name: '形質の恩寵', text: 'G → 形質2枚まで無料', rs: 'tribute' },
    { id: 'TA',   group: 'trib', excl: true,  name: '錬金', text: '（廃止・色の廃止により未使用）', rs: 'tribute' },
    { id: 'TB',   group: 'trib', excl: true,  name: '神の加護', text: '資源枠1つを今すぐ（使用済みでも）＋残りの手番は資源枠が倍', rs: 'tribute' },
    { id: 'TJ',   group: 'trib', excl: true,  name: '跳躍', text: 'トラック進行2回・合計 −E', rs: 'tribute' },
    { id: 'SCAN', group: 'cu',   excl: false, name: '環境スキャン', text: 'E5 → 他者の最高Lv×2の資源' },
    { id: 'ADP',  group: 'cu',   excl: false, name: '適応進化',  text: 'L1 → Lv1のトラックを+1（W必須）', worker: true },
    { id: 'CNV',  group: 'cu',   excl: false, name: '資源変換',  text: 'E2→G1 / G2→E1 / P8→E3 / P8→G2' },
    { id: 'RSV',  group: 'cu',   excl: false, name: '予備動員',  text: '無料で E+2 または G+1' },
    { id: 'RST',  group: 'cu',   excl: false, name: '復元',     text: '取られた強の形質を強の効果で取る（強の値段＋E9・1人1回）', rs: 'restore' }, // 2026-11-05 T10（第59部）
    { id: 'AMP',  group: 'cu',   excl: false, name: '増幅',     text: 'E15 → 器官1つ（数の効果を持つ器官）の効果を以後2倍（1人1回）', rs: 'amplify' },
    { id: 'BST',  group: 'cu',   excl: false, name: '一気立て',  text: '同じ系統の器官を 2〜3 枚、階層順に続けて建造（各々の値段と後追い料・W 1 個）', rs: 'burst' }, // 2026-11-08 T14（第71部 §7・§14）：増幅の置き換え
    { id: 'GTH',  group: 'cu',   excl: false, name: '採集',     text: 'E／G／P／協調+1 のどれか1つを少しだけ（置ける場所が無いときの逃げ道）', rs: 'gather' }, // 2026-11-05 ユーザー指示：パスの代わりに「1アクションで E・G・P・協調のどれかを少し得る」弱い共用アクション（値は数値セット gather）
    { id: 'PASS', group: 'cu',   excl: false, name: 'パス',     text: '置ける場所が無いときに（何も得ない）', rs: 'passSlot' }, // v3.65：採集に置き換え（旧セーブの再生用に ACTIONS.pass は残す）
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
  G.GROUP_NAME = { trib: '恩寵枠（R6 から・早取り）', res: '資源獲得（早取り排他）', trk: 'トラック進行（排他なし）', org: '器官建造（排他なし）', mass: '大量消費（早取り排他）', oth: 'その他共有（早取り排他）', cu: 'キャッチアップ・運用（排他なし）' };
})((typeof window !== "undefined" ? window : globalThis).G1 = (typeof window !== "undefined" ? window : globalThis).G1 || {});
