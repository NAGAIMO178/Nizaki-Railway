export interface Station72 {
  id: string; // 判定用キー (e.g. 'tokyo', 'oomiya', 'kashiwa')
  code: string; // 代表駅コード (e.g. 'Y01')
  name: string; // 駅名 (e.g. '東京')
  kana: string; // ふりがな (e.g. 'とうきょう')
  lines: string[]; // 乗り入れ路線名
  primaryLine: 'kanzaki' | 'express' | 'saisen' | 'tsuchiura';
}

// 神埼鉄道 全路線全74駅（72駅体系）の網羅リスト
export const KANZAKI_ALL_STATIONS_72: Station72[] = [
  // --- 1. 神埼線 (Y) ---
  { id: 'tokyo', code: 'Y01', name: '東京', kana: 'とうきょう', lines: ['神埼線', '神埼高速線', '埼千環状線'], primaryLine: 'kanzaki' },
  { id: 'asakusa', code: 'Y02', name: '浅草', kana: 'あさくさ', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'kitasenju', code: 'Y03', name: '北千住', kana: 'きたせんじゅ', lines: ['神埼線', '埼千環状線'], primaryLine: 'kanzaki' },
  { id: 'adachi', code: 'Y04', name: '足立', kana: 'あだち', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'souka', code: 'Y05', name: '草加', kana: 'そうか', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'koshigaya_laketown', code: 'Y06', name: '越谷レイクタウン', kana: 'こしがやれいくたうん', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'nanakoudai', code: 'Y07', name: '七光台', kana: 'ななこうだい', lines: ['神埼線', '埼千環状線'], primaryLine: 'kanzaki' },
  { id: 'kitakasukabe', code: 'Y08', name: '北春日部', kana: 'きたかすかべ', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'subway_iwatsuki', code: 'Y09', name: '地下鉄岩槻', kana: 'ちかてついわつき', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'hasuda', code: 'Y10', name: '蓮田', kana: 'はすだ', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'maruyama', code: 'Y11', name: '丸山', kana: 'まるやま', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'oomiya', code: 'Y12', name: '大宮', kana: 'おおみや', lines: ['神埼線', '埼千環状線'], primaryLine: 'kanzaki' },
  { id: 'asakadai', code: 'Y13', name: '朝霞台', kana: 'あさかだい', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'niiza', code: 'Y14', name: '新座', kana: 'にいざ', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'hibarigaoka', code: 'Y15', name: 'ひばりヶ丘', kana: 'ひばりがおか', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'tanashi', code: 'Y16', name: '田無', kana: 'たなし', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'musashisakai', code: 'Y17', name: '武蔵境', kana: 'むさしさかい', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'nakamitaka', code: 'Y18', name: '中三鷹', kana: 'なかみたか', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'chofu', code: 'Y19', name: '調布', kana: 'ちょうふ', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'ikuta', code: 'Y20', name: '生田', kana: 'いくた', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'mizonokuchi', code: 'Y21', name: '溝の口', kana: 'みぞのくち', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'shinyokohama', code: 'Y22', name: '新横浜', kana: 'しんよこはま', lines: ['神埼線'], primaryLine: 'kanzaki' },
  { id: 'yokohama', code: 'Y23', name: '横浜', kana: 'よこはま', lines: ['神埼線', '神埼高速線'], primaryLine: 'kanzaki' },

  // --- 2. 神埼高速線 (NI) ---
  { id: 'shimbashi', code: 'NI02', name: '新橋', kana: 'しんばし', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'shinagawa', code: 'NI03', name: '品川', kana: 'しながわ', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'ooimachi', code: 'NI04', name: '大井町', kana: 'おおいまち', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'heiwajima', code: 'NI05', name: '平和島', kana: 'へいわじま', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'subway_kamata', code: 'NI06', name: '地下鉄蒲田', kana: 'ちかてつかまた', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'kawasaki', code: 'NI07', name: '川崎', kana: 'かわさき', lines: ['神埼高速線'], primaryLine: 'express' },
  { id: 'tsurumi', code: 'NI08', name: '鶴見', kana: 'つるみ', lines: ['神埼高速線'], primaryLine: 'express' },

  // --- 3. 埼千環状線 (SC) ---
  { id: 'minamisenju', code: 'SC02', name: '南千住', kana: 'みなみせんじゅ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'ayase', code: 'SC04', name: '綾瀬', kana: 'あやせ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'matsudo', code: 'SC05', name: '松戸', kana: 'まつど', lines: ['埼千環状線', '土浦線'], primaryLine: 'saisen' },
  { id: 'kashiwa', code: 'SC06', name: '柏', kana: 'かしわ', lines: ['埼千環状線', '土浦線'], primaryLine: 'saisen' },
  { id: 'abiko', code: 'SC07', name: '我孫子', kana: 'あびこ', lines: ['埼千環状線', '土浦線'], primaryLine: 'saisen' },
  { id: 'kasukabe', code: 'SC08', name: '春日部', kana: 'かすかべ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'iwatsuki', code: 'SC09', name: '岩槻', kana: 'いわつき', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'oomiyakouen', code: 'SC10', name: '大宮公園', kana: 'おおみやこうえん', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'saitama_shintoshin', code: 'SC12', name: 'さいたま新都心', kana: 'さいたましんとしん', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'minamiurawa', code: 'SC13', name: '南浦和', kana: 'みなみうらわ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'nishiaoki', code: 'SC14', name: '西青木', kana: 'にしあおき', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'kawaguchi', code: 'SC15', name: '川口', kana: 'かわぐち', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'shimura_sakaue', code: 'SC16', name: '志村坂上', kana: 'しむらさかうえ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'kamiitabashi', code: 'SC17', name: '上板橋', kana: 'かみいたばし', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'kotake_mukaihara', code: 'SC18', name: '小竹向原', kana: 'こたけむかいはら', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'ikebukuro', code: 'SC19', name: '池袋', kana: 'いけぶくろ', lines: ['埼千環状線'], primaryLine: 'saisen' },
  { id: 'shinjuku', code: 'SC20', name: '新宿', kana: 'しんじゅく', lines: ['埼千環状線'], primaryLine: 'saisen' },

  // --- 4. 土浦線 (TC) ---
  { id: 'shinmatsudo', code: 'TC02', name: '新松戸', kana: 'しんまつど', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'matsugaoka', code: 'TC03', name: '松が丘', kana: 'まつがおか', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'moriya', code: 'TC05', name: '守谷', kana: 'もりや', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'yaniida', code: 'TC06', name: '谷井田', kana: 'やにいだ', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'morinosato', code: 'TC07', name: '森の里', kana: 'もりのさと', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'arakawaoki', code: 'TC08', name: '荒川沖', kana: 'あらかわおき', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'tsuchiura', code: 'TC09', name: '土浦', kana: 'つちうら', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'takahama', code: 'TC10', name: '高浜', kana: 'たかはま', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'ibaraki_airport', code: 'TC11', name: '茨城空港', kana: 'いばらきくうこう', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'kashimaasahi', code: 'TC12', name: '鹿島旭', kana: 'かしまあさひ', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'ooarai', code: 'TC13', name: '大洗', kana: 'おおあらい', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'nakaminato', code: 'TC14', name: '那珂湊', kana: 'なかみなと', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'hiraiso', code: 'TC15', name: '平磯', kana: 'ひらいそ', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'hitachinaka_park', code: 'TC16', name: 'ひたちなか海浜公園', kana: 'ひたちなかかいひんこうえん', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'kujigawa', code: 'TC17', name: '久慈川', kana: 'くじがわ', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'oomika', code: 'TC18', name: '大甕（おおみか）', kana: 'おおみか', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'higashionuma', code: 'TC19', name: '東大沼', kana: 'ひがしおおぬま', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'taga', code: 'TC20', name: '多賀', kana: 'たが', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'ouse', code: 'TC21', name: '会瀬（おうせ）', kana: 'おうせ', lines: ['土浦線'], primaryLine: 'tsuchiura' },
  { id: 'hitachi', code: 'TC22', name: '日立', kana: 'ひたち', lines: ['土浦線'], primaryLine: 'tsuchiura' },
];

export interface MysteryStage {
  stageNumber: number; // 1, 2, 3
  stageTitle: string;
  riddleTitle: string;
  story: string;
  riddleText: string;
  hint: string;
  correctStationId: string; // 'kashiwa' | 'kitasenju' | 'abiko'
  correctStationName: string;
  correctExplanation: string;
  stampTitle: string;
  stampColor: string;
}

export const MYSTERY_STAGES: MysteryStage[] = [
  {
    stageNumber: 1,
    stageTitle: '第一問：色が織りなす漢字パズル',
    riddleTitle: '暗号指図書 No.01',
    story: '深夜24時、神埼総合車両センターから試運転へ向かった新型車両「クモハ9000番台」が突如として運行追跡システムから消失した。運転指令室の端末に残された第1の暗号パズルを解読せよ。',
    riddleText: '「関東平野の東部、水辺に囲まれた街。\n『太陽のまばゆい色』と『木々の深い緑の色』。\nこの2つの色を足し合わせ（合体させ）、最後に『土』をどっしりと据え置いた時に現れる駅へ向かえ。」',
    hint: '「太陽のまばゆい色」＝白、「木々の深い緑」＝木……この2つの漢字を合体させると？ 最後に「土」という言葉に惑わされないのがポイントです。',
    correctStationId: 'kashiwa',
    correctStationName: '柏駅',
    correctExplanation: '見事正解！「太陽のまばゆい色（白）」＋「木々の深い緑（木）」を合体させると「木＋白＝柏」！「土」を据え置くというトラップを越えたアハ体験の漢字パズルでした。スタンプ「柏駅 済」を獲得！',
    stampTitle: '柏駅 済',
    stampColor: '#B91C1C', // 朱色
  },
  {
    stageNumber: 2,
    stageTitle: '第二問：方位と音の挟み撃ち',
    riddleTitle: '暗号指図書 No.02',
    story: '柏駅の側線を通過した試運転列車は、進路を変えて大動脈へと向かった。車掌がモニターに残した第2の暗号電文は、言葉の響きと意味を組み合わせた難問だ。',
    riddleText: '「磁石が指し示す『寒冷なる方角（方位）』。\nそれに連なるは、幾重にも伸びる鉄路の『ライン（線）』の響き。\nそして大地に根ざし青々と茂る『樹木（じゅ）』の音。\n三つの意味と音が重なりし時、数多の鉄路が交わる巨大結節点が姿を現す。その駅を特定せよ。」',
    hint: '方位の「北」＋ライン（線＝せん）＋樹木の音（樹＝じゅ）の音の挟み撃ち。神埼線(Y03)と埼千環状線が接続する足立区の大ターミナルです。',
    correctStationId: 'kitasenju',
    correctStationName: '北千住駅',
    correctExplanation: '大正解！方角の「北」＋ラインの「千（線）」＋樹木の「住（樹）」の音の重なりで【北千住駅】！多くの路線が集まる北の巨大結節点にて、試運転列車の通過信号を確認しました！スタンプ「北千住駅 済」を獲得！',
    stampTitle: '北千住駅 済',
    stampColor: '#B91C1C', // 朱色
  },
  {
    stageNumber: 3,
    stageTitle: '第三問：家族の直訳と時空の歪み',
    riddleTitle: '暗号指図書 No.03',
    story: '北千住を抜けた列車はいよいよ最終目的地へ。指令室に届いた最後の電文は、三世代の家族の呼び名が記された奇妙な暗号だった。',
    riddleText: '「『自分自身（我）』の先にある血脈、『我が愛しき子（子）』、そして『我が子のその子（孫）』。\n三世代の家族の名をそのまま直訳し、ひとつの駅名へと並べよ。\n時空の歪みを越えて現れる、名物・巨大唐揚げそばの湯気立つ要衝へ急行せよ。」',
    hint: '「我（われ）」＋「孫（まご）」＋「子（こ）」という3つの家族の漢字がそのまま使われている常磐方面の難読駅です。名物の駅そばでも有名です。',
    correctStationId: 'abiko',
    correctStationName: '我孫子駅',
    correctExplanation: '大正解！！「我」・「孫」・「子」がそのまま連なる難読の有名駅【我孫子駅】！特別留置線にて、無事に試運転を完了した「クモハ9000番台」を発見・保護しました！全三幕完全解明です！',
    stampTitle: '我孫子駅 完',
    stampColor: '#B91C1C', // 朱色
  },
];

export const MYSTERY_CLEAR_COUPON_CODE = 'NIZAKI_MYSTERY_CLEAR_2026';
