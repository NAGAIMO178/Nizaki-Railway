import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Phone, PhoneCall, PhoneOff, Award, Sparkles, Compass, 
  Search, Check, Copy, RotateCcw, ShieldCheck, MapPin, 
  HelpCircle, ChevronRight, AlertCircle, X, Volume2, VolumeX,
  ExternalLink, Gem, Flame, ArrowRight, ArrowLeft, LogOut, Image as ImageIcon
} from 'lucide-react';
import { LINE_OA_ADD_FRIEND_URL } from '../utils/accountApi';

// ============================================================================
// 1. 定数・データ定義（神埼鉄道 全72駅 ＋ 雅石謎解きデータ）
// ============================================================================

export const KANZAKI_STATIONS_72 = [
  // 神埼線 (Y)
  { id: 'tokyo', code: 'Y01', name: '東京', kana: 'とうきょう', line: '神埼線' },
  { id: 'asakusa', code: 'Y02', name: '浅草', kana: 'あさくさ', line: '神埼線' },
  { id: 'kitasenju', code: 'Y03', name: '北千住', kana: 'きたせんじゅ', line: '神埼線' },
  { id: 'adachi', code: 'Y04', name: '足立', kana: 'あだち', line: '神埼線' },
  { id: 'souka', code: 'Y05', name: '草加', kana: 'そうか', line: '神埼線' },
  { id: 'koshigaya_laketown', code: 'Y06', name: '越谷レイクタウン', kana: 'こしがやれいくたうん', line: '神埼線' },
  { id: 'nanakoudai', code: 'Y07', name: '七光台', kana: 'ななこうだい', line: '神埼線' },
  { id: 'kitakasukabe', code: 'Y08', name: '北春日部', kana: 'きたかすかべ', line: '神埼線' },
  { id: 'subway_iwatsuki', code: 'Y09', name: '地下鉄岩槻', kana: 'ちかてついわつき', line: '神埼線' },
  { id: 'hasuda', code: 'Y10', name: '蓮田', kana: 'はすだ', line: '神埼線' },
  { id: 'maruyama', code: 'Y11', name: '丸山', kana: 'まるやま', line: '神埼線' },
  { id: 'oomiya', code: 'Y12', name: '大宮', kana: 'おおみや', line: '神埼線' },
  { id: 'asakadai', code: 'Y13', name: '朝霞台', kana: 'あさかだい', line: '神埼線' },
  { id: 'niiza', code: 'Y14', name: '新座', kana: 'にいざ', line: '神埼線' },
  { id: 'hibarigaoka', code: 'Y15', name: 'ひばりヶ丘', kana: 'ひばりがおか', line: '神埼線' },
  { id: 'tanashi', code: 'Y16', name: '田無', kana: 'たなし', line: '神埼線' },
  { id: 'musashisakai', code: 'Y17', name: '武蔵境', kana: 'むさしさかい', line: '神埼線' },
  { id: 'nakamitaka', code: 'Y18', name: '中三鷹', kana: 'なかみたか', line: '神埼線' },
  { id: 'chofu', code: 'Y19', name: '調布', kana: 'ちょうふ', line: '神埼線' },
  { id: 'ikuta', code: 'Y20', name: '生田', kana: 'いくた', line: '神埼線' },
  { id: 'mizonokuchi', code: 'Y21', name: '溝の口', kana: 'みぞのくち', line: '神埼線' },
  { id: 'shinyokohama', code: 'Y22', name: '新横浜', kana: 'しんよこはま', line: '神埼線' },
  { id: 'yokohama', code: 'Y23', name: '横浜', kana: 'よこはま', line: '神埼線' },

  // 神埼高速線 (NI)
  { id: 'shimbashi', code: 'NI02', name: '新橋', kana: 'しんばし', line: '神埼高速線' },
  { id: 'shinagawa', code: 'NI03', name: '品川', kana: 'しながわ', line: '神埼高速線' },
  { id: 'ooimachi', code: 'NI04', name: '大井町', kana: 'おおいまち', line: '神埼高速線' },
  { id: 'heiwajima', code: 'NI05', name: '平和島', kana: 'へいわじま', line: '神埼高速線' },
  { id: 'subway_kamata', code: 'NI06', name: '地下鉄蒲田', kana: 'ちかてつかまた', line: '神埼高速線' },
  { id: 'kawasaki', code: 'NI07', name: '川崎', kana: 'かわさき', line: '神埼高速線' },
  { id: 'tsurumi', code: 'NI08', name: '鶴見', kana: 'つるみ', line: '神埼高速線' },

  // 埼千環状線 (SC)
  { id: 'minamisenju', code: 'SC02', name: '南千住', kana: 'みなみせんじゅ', line: '埼千環状線' },
  { id: 'ayase', code: 'SC04', name: '綾瀬', kana: 'あやせ', line: '埼千環状線' },
  { id: 'matsudo', code: 'SC05', name: '松戸', kana: 'まつど', line: '埼千環状線' },
  { id: 'kashiwa', code: 'SC06', name: '柏', kana: 'かしわ', line: '埼千環状線' },
  { id: 'abiko', code: 'SC07', name: '我孫子', kana: 'あびこ', line: '埼千環状線' },
  { id: 'kasukabe', code: 'SC08', name: '春日部', kana: 'かすかべ', line: '埼千環状線' },
  { id: 'iwatsuki', code: 'SC09', name: '岩槻', kana: 'いわつき', line: '埼千環状線' },
  { id: 'oomiyakouen', code: 'SC10', name: '大宮公園', kana: 'おおみやこうえん', line: '埼千環状線' },
  { id: 'saitama_shintoshin', code: 'SC12', name: 'さいたま新都心', kana: 'さいたましんとしん', line: '埼千環状線' },
  { id: 'minamiurawa', code: 'SC13', name: '南浦和', kana: 'みなみうらわ', line: '埼千環状線' },
  { id: 'nishiaoki', code: 'SC14', name: '西青木', kana: 'にしあおき', line: '埼千環状線' },
  { id: 'kawaguchi', code: 'SC15', name: '川口', kana: 'かわぐち', line: '埼千環状線' },
  { id: 'shimura_sakaue', code: 'SC16', name: '志村坂上', kana: 'しむらさかうえ', line: '埼千環状線' },
  { id: 'kamiitabashi', code: 'SC17', name: '上板橋', kana: 'かみいたばし', line: '埼千環状線' },
  { id: 'kotake_mukaihara', code: 'SC18', name: '小竹向原', kana: 'こたけむかいはら', line: '埼千環状線' },
  { id: 'ikebukuro', code: 'SC19', name: '池袋', kana: 'いけぶくろ', line: '埼千環状線' },
  { id: 'shinjuku', code: 'SC20', name: '新宿', kana: 'しんじゅく', line: '埼千環状線' },

  // 土浦線 (TC)
  { id: 'shinmatsudo', code: 'TC02', name: '新松戸', kana: 'しんまつど', line: '土浦線' },
  { id: 'matsugaoka', code: 'TC03', name: '松が丘', kana: 'まつがおか', line: '土浦線' },
  { id: 'moriya', code: 'TC05', name: '守谷', kana: 'もりや', line: '土浦線' },
  { id: 'yaniida', code: 'TC06', name: '谷井田', kana: 'やにいだ', line: '土浦線' },
  { id: 'morinosato', code: 'TC07', name: '森の里', kana: 'もりのさと', line: '土浦線' },
  { id: 'arakawaoki', code: 'TC08', name: '荒川沖', kana: 'あらかわおき', line: '土浦線' },
  { id: 'tsuchiura', code: 'TC09', name: '土浦', kana: 'つちうら', line: '土浦線' },
  { id: 'takahama', code: 'TC10', name: '高浜', kana: 'たかはま', line: '土浦線' },
  { id: 'ibaraki_airport', code: 'TC11', name: '茨城空港', kana: 'いばらきくうこう', line: '土浦線' },
  { id: 'kashimaasahi', code: 'TC12', name: '鹿島旭', kana: 'かしまあさひ', line: '土浦線' },
  { id: 'ooarai', code: 'TC13', name: '大洗', kana: 'おおあらい', line: '土浦線' },
  { id: 'nakaminato', code: 'TC14', name: '那珂湊', kana: 'なかみなと', line: '土浦線' },
  { id: 'hiraiso', code: 'TC15', name: '平磯', kana: 'ひらいそ', line: '土浦線' },
  { id: 'hitachinaka_park', code: 'TC16', name: 'ひたちなか海浜公園', kana: 'ひたちなかかいひんこうえん', line: '土浦線' },
  { id: 'kujigawa', code: 'TC17', name: '久慈川', kana: 'くじがわ', line: '土浦線' },
  { id: 'oomika', code: 'TC18', name: '大甕', kana: 'おおみか', line: '土浦線' },
  { id: 'higashionuma', code: 'TC19', name: '東大沼', kana: 'ひがしおおぬま', line: '土浦線' },
  { id: 'taga', code: 'TC20', name: '多賀', kana: 'たが', line: '土浦線' },
  { id: 'ouse', code: 'TC21', name: '会瀬', kana: 'おうせ', line: '土浦線' },
  { id: 'hitachi', code: 'TC22', name: '日立', kana: 'ひたち', line: '土浦線' },
];

export const MYSTERY_STAGES = [
  {
    id: 1,
    title: '第一問：緑白の雅石',
    stoneName: '緑白（りょくはく）の雅石',
    stoneColor: 'from-emerald-400 to-emerald-600',
    stoneBorder: 'border-emerald-400',
    stoneBg: 'bg-emerald-950/60',
    stoneGlow: 'shadow-[0_0_20px_rgba(16,185,129,0.5)]',
    riddle: '『太陽のまばゆい色』と『木々の深い緑の色』。この2つの色を足し合わせ、最後に『土』をどっしりと据え置いた時に現れる駅へ向かえ。',
    hint: '「太陽のまばゆい色」＝白、「木々の深い緑」＝木……この2つの漢字を合体させると？ 最後に「土」という言葉に惑わされないのがポイントじゃ。',
    correctStationId: 'kashiwa',
    correctStationName: '柏駅',
    explanation: '見事！「太陽のまばゆい色（白）」＋「木々の深い緑（木）」を合わせると「木＋白＝柏」！「土」を据え置くという言葉を退けたアハ体験の漢字パズルじゃ！',
  },
  {
    id: 2,
    title: '第二問：蒼線の雅石',
    stoneName: '蒼線（そうせん）の雅石',
    stoneColor: 'from-cyan-400 to-blue-600',
    stoneBorder: 'border-cyan-400',
    stoneBg: 'bg-cyan-950/60',
    stoneGlow: 'shadow-[0_0_20px_rgba(6,182,212,0.5)]',
    riddle: '方位磁石の『N』が示す方角と、森に生い茂る『樹木』。この2つの間に『1本のライン（線）』を引いた時、現れる駅へ向かえ。',
    hint: '「Nの方角」＝北、森に生い茂る樹木の音＝住（樹：じゅ）。その真ん中に引かれた1本のライン（線＝せん）……3つの音を順に読むと？',
    correctStationId: 'kitasenju',
    correctStationName: '北千住駅',
    explanation: '見事！方角の「北」＋ライン（線＝せん）＋樹木（住＝じゅ）の音の挟み撃ちで【北千住駅】！多くの路線が集まる北の巨大結節点に隠されていたぞ！',
  },
  {
    id: 3,
    title: '第三問：時空の雅石',
    stoneName: '時空（じくう）の雅石',
    stoneColor: 'from-purple-400 to-indigo-600',
    stoneBorder: 'border-purple-400',
    stoneBg: 'bg-purple-950/60',
    stoneGlow: 'shadow-[0_0_20px_rgba(168,85,247,0.5)]',
    riddle: '先頭に『自分自身』。真ん中に『自分の孫』。そして最後尾に『自分の子供』。時系列が狂って並んでいる、この駅はどこか？',
    hint: '「自分自身」＝我、「自分の孫」＝孫、「自分の子供」＝子。三世代の家族の名がそのまま漢字として連なる、常磐方面の難読駅じゃ。',
    correctStationId: 'abiko',
    correctStationName: '我孫子駅',
    explanation: '見事！「我」＋「孫」＋「子」がそのまま連なる難読有名駅【我孫子駅】！時系列が狂った家族の並びを見破り、3つ目の雅石をしかと回収したぞ！',
  },
];

export const BOSS_STAGE = {
  title: '最終関門：怪盗のアジト特定',
  riddle: '集めた3つの雅石（柏・北千住・我孫子）を鉄路の線で結べ。その三角形が示す中心の駅に、怪盗のアジトがある…！',
  hint: '路線図上で「北千住」「柏」「我孫子」を結ぶ三角形を描いてみよ。その中心・中継点として位置する主要乗換駅じゃ！',
  correctStationId: 'matsudo',
  correctStationName: '松戸駅',
  explanation: '見事じゃ！！北千住・柏・我孫子が描く三角形の要衝、松戸駅の地下留置線にて怪盗を完全に包囲した！これにて一件落着じゃ！',
};

export const CLEAR_CODE = 'MYSTERY_2026_MASHIN_CLEAR';

// ============================================================================
// 2. 音響エフェクト（Web Audio API・外部ファイル不要で安全に動作）
// ============================================================================

class SoundFX {
  static ctx = null;

  static getCtx() {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch (e) {
      console.warn('AudioContext initialization error:', e);
      return null;
    }
  }

  // 電話の呼び出し音（和風黒電話のツートーン・ジリリ音）
  static playRing() {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.setValueAtTime(400, now);
      osc2.frequency.setValueAtTime(450, now);
      osc1.type = 'sine';
      osc2.type = 'sine';

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.setValueAtTime(0.15, now + 0.8);
      gain.gain.linearRampToValueAtTime(0, now + 0.9);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.9);
      osc2.stop(now + 0.9);
    } catch {
      // Audio playback fails gracefully
    }
  }

  // 正解音（和風の鈴と鐘の澄んだ和音）
  static playCorrect() {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + idx * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.8);
      });
    } catch {}
  }

  // 不正解音（拍子木・鈍い木魚の音）
  static playWrong() {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  // 完全クリアファンファーレ（神仏の鐘と祝宴）
  static playFanfare() {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const chord = [392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];
      chord.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + idx * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 1.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 1.6);
      });
    } catch {}
  }
}

// ============================================================================
// 3. メインコンポーネント: MysteryTrainApp
// ============================================================================

export const MysteryTrainApp = ({ onAddNPoints, onExit, posterImageUrl }) => {
  // 進行状況のローカルストレージ永続化
  const STORAGE_KEY = 'kanzaki_mystery_mashin_2026_v1';

  const [gameState, setGameState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {
      phase: 'intro',
      currentStage: 1,
      collectedStoneIds: [],
      bossUnlocked: false,
      isAllCleared: false,
    };
  });

  // UI状態
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState({
    isOpen: false,
    isCorrect: false,
    title: '',
    message: '',
    explanation: '',
  });
  const [isRinging, setIsRinging] = useState(true);
  const [copied, setCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // 永続化同期
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch {}
  }, [gameState]);

  // 着信音の自動ループ（導入画面時）
  useEffect(() => {
    if (gameState.phase === 'intro' && isRinging && soundEnabled) {
      SoundFX.playRing();
      const timer = setInterval(() => {
        if (gameState.phase === 'intro' && isRinging && soundEnabled) {
          SoundFX.playRing();
        }
      }, 3500);
      return () => clearInterval(timer);
    }
  }, [gameState.phase, isRinging, soundEnabled]);

  // 現在の問題データ
  const currentStageData = useMemo(() => {
    if (gameState.phase === 'boss') {
      return null;
    }
    return MYSTERY_STAGES.find((s) => s.id === gameState.currentStage) || MYSTERY_STAGES[0];
  }, [gameState.phase, gameState.currentStage]);

  // 駅検索のフィルタリング
  const filteredStations = useMemo(() => {
    if (!searchKeyword.trim()) return [];
    const q = searchKeyword.trim().toLowerCase();
    return KANZAKI_STATIONS_72.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.kana.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [searchKeyword]);

  // クイック選択用の主要駅（正解駅を含む便利な10駅）
  const quickPickStations = useMemo(() => {
    const targetIds = ['kashiwa', 'kitasenju', 'abiko', 'matsudo', 'tokyo', 'oomiya', 'tsuchiura', 'yokohama', 'shinjuku', 'ikebukuro'];
    return KANZAKI_STATIONS_72.filter((s) => targetIds.includes(s.id));
  }, []);

  // --------------------------------------------------------------------------
  // イベントハンドラー
  // --------------------------------------------------------------------------

  // 電話に出る
  const handleAnswerCall = () => {
    setIsRinging(false);
    setGameState((prev) => ({ ...prev, phase: 'call_active' }));
  };

  // 探偵団に参加する
  const handleJoinDetective = () => {
    setGameState((prev) => ({ ...prev, phase: 'quest' }));
  };

  // 回答チェック（雅石収集フェーズ ＆ 最終ボスフェーズ）
  const handleSubmitAnswer = () => {
    if (!selectedStation) return;

    // 1. 最終ボスフェーズの判定
    if (gameState.phase === 'boss') {
      if (selectedStation.id === BOSS_STAGE.correctStationId) {
        if (soundEnabled) SoundFX.playFanfare();
        setFeedback({
          isOpen: true,
          isCorrect: true,
          title: '【真の隠し場所 特定完了！】',
          message: '斬丸「あっぱれじゃ！！松戸駅にて怪盗のアジトを完全制圧せり！坂東の平和は保たれたぞ！」',
          explanation: BOSS_STAGE.explanation,
        });
        setGameState((prev) => ({
          ...prev,
          phase: 'clear',
          isAllCleared: true,
        }));
        if (onAddNPoints) {
          onAddNPoints(300, 'ミステリートレイン完全制覇', 'coupon');
        }
      } else {
        if (soundEnabled) SoundFX.playWrong();
        setFeedback({
          isOpen: true,
          isCorrect: false,
          title: '【特定失敗】',
          message: `斬丸「バカ者！【${selectedStation.name}駅】は三角形の中心ではないわ！柏・北千住・我孫子の路線網をよく見よ！」`,
          explanation: '路線図を見直し、3駅が結ぶ三角形の真ん中に位置する要衝駅を探してください。',
        });
      }
      return;
    }

    // 2. 雅石収集フェーズの判定
    if (currentStageData) {
      if (selectedStation.id === currentStageData.correctStationId) {
        if (soundEnabled) SoundFX.playCorrect();
        const nextStage = gameState.currentStage + 1;
        const newCollected = Array.from(new Set([...gameState.collectedStoneIds, currentStageData.id]));
        const isBossUnlocked = newCollected.length >= 3;

        setFeedback({
          isOpen: true,
          isCorrect: true,
          title: `【${currentStageData.stoneName} 回収成功！】`,
          message: `斬丸「見事じゃ！【${selectedStation.name}駅】にて秘蔵の雅石をしかと回収したぞ！」`,
          explanation: currentStageData.explanation,
        });

        setGameState((prev) => ({
          ...prev,
          collectedStoneIds: newCollected,
          currentStage: isBossUnlocked ? 3 : nextStage,
          phase: isBossUnlocked ? 'boss' : 'quest',
          bossUnlocked: isBossUnlocked,
        }));

        setSelectedStation(null);
        setShowHint(false);
      } else {
        if (soundEnabled) SoundFX.playWrong();
        setFeedback({
          isOpen: true,
          isCorrect: false,
          title: '【捜索失敗】',
          message: `斬丸「バカ者！【${selectedStation.name}駅】には雅石などないわ！もう一度電文を熟読せよ！」`,
          explanation: '提示された暗号の特徴を冷静に読み解き、別の駅を捜索してください。',
        });
      }
    }
  };

  // 特典コードコピー
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(CLEAR_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
    }
  };

  // 白紙に戻す（リセット実行：最初からやり直す or イベント終了して一覧へ戻る）
  const handleConfirmReset = (exitAfterReset = false) => {
    const initial = {
      phase: 'intro',
      currentStage: 1,
      collectedStoneIds: [],
      bossUnlocked: false,
      isAllCleared: false,
    };
    setGameState(initial);
    setSelectedStation(null);
    setIsRinging(true);
    setIsResetModalOpen(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    if (exitAfterReset && onExit) {
      onExit();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto font-sans text-stone-200 select-none pb-12">
      {/* =======================================================================
          上部ナビゲーション＆ポスターヘッダー枠
         ======================================================================= */}
      {/* イベントポスターバナー枠（画像が指定されていれば表示、または和風題字ビジュアル） */}
      {posterImageUrl ? (
        <div className="relative w-full aspect-[21/9] sm:aspect-[16/9] max-h-72 rounded-t-2xl overflow-hidden border border-amber-500/40 shadow-2xl mb-1 group">
          <img 
            src={posterImageUrl} 
            alt="神埼鉄道ミステリートレイン ポスター" 
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <span className="bg-[#991B1B] text-amber-100 text-[10px] font-bold px-2.5 py-1 rounded shadow border border-amber-400 font-serif">
              公式企画ポスター
            </span>
            <span className="text-[10px] text-amber-200/80 bg-black/60 px-2 py-0.5 rounded font-mono">
              16:9 / 1200×675px
            </span>
          </div>
        </div>
      ) : null}

      {/* 特命イベントバナー・戻る・リセット・消音ヘッダー */}
      <header className={`bg-gradient-to-r from-stone-950 via-[#161220] to-stone-950 border-b border-amber-500/30 px-3 sm:px-4 py-3 ${posterImageUrl ? 'rounded-b-none' : 'rounded-t-2xl'} shadow-xl flex items-center justify-between gap-2.5 sm:gap-3`}>
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="h-8 px-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-amber-500/30 text-amber-300 hover:text-amber-100 text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
              title="イベント選択一覧へ戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">イベント一覧</span>
            </button>
          )}

          <div className="w-8 h-8 rounded-lg bg-[#991B1B] border border-amber-400 flex items-center justify-center text-amber-100 font-serif font-black shadow-md shrink-0">
            ㊙︎
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[9px] sm:text-[10px] text-amber-400/90 font-bold tracking-widest uppercase truncate">
                2026 Special Mystery
              </span>
              <span className="bg-amber-500/20 text-amber-300 text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded border border-amber-500/40 shrink-0">
                二段階構成
              </span>
            </div>
            <h1 className="text-xs sm:text-base font-bold text-amber-100 tracking-wide font-serif truncate">
              神埼鉄道ミステリートレイン 〜斬丸と三つの雅石〜
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-black/40 hover:bg-black/70 border border-stone-700 text-stone-300 hover:text-amber-300 transition-all cursor-pointer"
            title={soundEnabled ? '効果音を消音' : '効果音を再生'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-stone-500" />}
          </button>
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-black/40 hover:bg-stone-800 border border-stone-700 text-stone-400 hover:text-amber-200 transition-all flex items-center gap-1 cursor-pointer"
            title="白紙に戻す / イベント終了"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">白紙に戻す</span>
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-stone-900/80 hover:bg-stone-800 border border-red-500/30 text-stone-300 hover:text-red-200 transition-all flex items-center gap-1 cursor-pointer"
              title="進捗を保持してイベントを終了し、イベント選択へ戻る"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden md:inline">終了</span>
            </button>
          )}
        </div>
      </header>

      {/* =======================================================================
          雅石収集帳（全画面共通ステータスバー）
         ======================================================================= */}
      <section className="bg-[#120E1A] border-x border-b border-amber-500/20 p-4 sm:p-5 shadow-2xl relative overflow-hidden">
        {/* 和風テクスチャ装飾 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gem className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-200 tracking-widest font-serif">
              神埼鉄道 秘蔵雅石収集帳
            </span>
          </div>
          <span className="text-[11px] text-stone-400">
            回収状況: <strong className="text-amber-400 font-bold">{gameState.collectedStoneIds.length}</strong> / 3 個
          </span>
        </div>

        {/* 3つの雅石スロット ＋ 最終隠し場所スロット */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {MYSTERY_STAGES.map((stg) => {
            const isAcquired = gameState.collectedStoneIds.includes(stg.id);
            return (
              <div
                key={stg.id}
                className={`relative rounded-xl p-3 border transition-all flex flex-col items-center justify-center text-center min-h-[90px] ${
                  isAcquired
                    ? `${stg.stoneBg} ${stg.stoneBorder} ${stg.stoneGlow}`
                    : 'bg-black/40 border-stone-800 opacity-60'
                }`}
              >
                <div className="text-[9px] tracking-wider text-stone-400 mb-1">
                  第{stg.id}問
                </div>
                {isAcquired ? (
                  <>
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${stg.stoneColor} shadow-lg flex items-center justify-center mb-1 animate-pulse border border-white/40`}>
                      <Gem className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-amber-200 truncate w-full">
                      {stg.stoneName}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold">
                      {stg.correctStationName} 済
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-stone-900 border border-stone-700 flex items-center justify-center mb-1 text-stone-600">
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-stone-500 font-bold">
                      {stg.stoneName}
                    </span>
                    <span className="text-[9px] text-stone-600">未回収</span>
                  </>
                )}
              </div>
            );
          })}

          {/* 最終ボススロット */}
          <div
            className={`col-span-3 sm:col-span-1 rounded-xl p-3 border transition-all flex flex-col items-center justify-center text-center min-h-[90px] ${
              gameState.isAllCleared
                ? 'bg-amber-950/60 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.6)]'
                : gameState.bossUnlocked
                ? 'bg-rose-950/40 border-rose-500 animate-pulse'
                : 'bg-black/40 border-stone-800 opacity-60'
            }`}
          >
            <div className="text-[9px] tracking-wider text-stone-400 mb-1">
              最終関門
            </div>
            {gameState.isAllCleared ? (
              <>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg flex items-center justify-center mb-1 border border-white/60">
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                </div>
                <span className="text-[10px] font-bold text-amber-200">
                  怪盗のアジト
                </span>
                <span className="text-[9px] text-amber-300 font-bold">
                  松戸駅 制覇
                </span>
              </>
            ) : gameState.bossUnlocked ? (
              <>
                <div className="w-8 h-8 rounded-full bg-rose-900 border border-rose-400 flex items-center justify-center mb-1 text-rose-200">
                  <Flame className="w-4 h-4 text-rose-400 animate-bounce" />
                </div>
                <span className="text-[10px] font-bold text-rose-300">
                  真の隠し場所
                </span>
                <span className="text-[9px] text-rose-400 font-bold">解禁中！</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-stone-900 border border-stone-700 flex items-center justify-center mb-1 text-stone-600">
                  <Compass className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-stone-500 font-bold">
                  怪盗のアジト
                </span>
                <span className="text-[9px] text-stone-600">封印中</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* =======================================================================
          1. プレショー画面（電話着信 〜 斬丸の依頼）
         ======================================================================= */}
      {gameState.phase === 'intro' && (
        <div className="bg-[#0E0B14] border-x border-b border-amber-500/20 p-6 sm:p-10 rounded-b-2xl shadow-2xl flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative">
            {/* 着信アニメーション */}
            <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500/60 flex items-center justify-center text-amber-400 animate-bounce shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <PhoneCall className="w-10 h-10 animate-pulse text-amber-300" />
            </div>
            <div className="absolute -inset-2 rounded-full border border-amber-500/30 animate-ping pointer-events-none" />
          </div>

          <div className="space-y-2 max-w-md">
            <div className="inline-flex items-center gap-2 bg-[#991B1B] text-amber-100 text-xs px-3 py-1 rounded-full font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
              <span>着信中：非通知設定（暗号周波数）</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-amber-100 font-serif">
              運転指令室の内線が激しく鳴り響いている…！
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 leading-relaxed">
              深夜の指令室に届いた謎の着信。ディスプレイには「斬丸」の名が表示されている。受話器を取って要件を確認せよ。
            </p>
          </div>

          <button
            type="button"
            onClick={handleAnswerCall}
            className="h-14 px-8 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-base shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer border border-emerald-300"
          >
            <Phone className="w-5 h-5" />
            <span>受話器を取る（通話開始）</span>
          </button>
        </div>
      )}

      {/* =======================================================================
          2. 通話中画面（斬丸のセリフ ＋ 探偵団結成）
         ======================================================================= */}
      {gameState.phase === 'call_active' && (
        <div className="bg-[#0E0B14] border-x border-b border-amber-500/20 p-6 sm:p-10 rounded-b-2xl shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#991B1B] border-2 border-amber-400 flex items-center justify-center text-amber-100 font-serif font-black text-xl shadow-lg">
                斬
              </div>
              <div>
                <span className="text-[10px] text-amber-400 tracking-wider block font-bold">
                  発信者：謎の依頼人
                </span>
                <h3 className="text-lg font-bold text-amber-100 font-serif">
                  斬丸（きりまる）
                </h3>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded">
              通話中 ● 00:14
            </span>
          </div>

          {/* 斬丸のセリフ枠（和紙調） */}
          <div className="bg-gradient-to-b from-[#1C1626] to-[#120E1A] border-2 border-amber-500/40 rounded-xl p-5 sm:p-6 space-y-4 shadow-inner relative">
            <div className="text-amber-400 text-xs font-bold tracking-widest">
              【通信音声記録】
            </div>
            <p className="text-sm sm:text-base text-amber-50 leading-relaxed font-serif tracking-wide border-l-4 border-amber-500 pl-4 py-1">
              「フッ……やっと出たな。<br />
              <strong className="text-amber-300">ワシの名は斬丸じゃ。</strong><br />
              ちと私用が重なりてな…坂東の広き平野に散らばったワシの秘蔵たる<span className="text-amber-300 font-bold">『三つの雅石』</span>を、貴殿ら神埼鉄道社内探偵団の総力を挙げてすべて回収してもらいたいのだ。<br />
              奴（怪盗）の残した暗号を解読し、鉄路に眠る雅石を取り戻してみせよ……頼んだぞ！」
            </p>
          </div>

          <button
            type="button"
            onClick={handleJoinDetective}
            className="w-full h-14 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-base shadow-xl flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer border border-amber-300"
          >
            <ShieldCheck className="w-5 h-5" />
            <span>社内探偵団を結成し、雅石の回収に向かう！ →</span>
          </button>
        </div>
      )}

      {/* =======================================================================
          3. 雅石収集フェーズ（第1問〜第3問）
         ======================================================================= */}
      {gameState.phase === 'quest' && currentStageData && (
        <div className="bg-[#0E0B14] border-x border-b border-amber-500/20 p-5 sm:p-8 rounded-b-2xl shadow-2xl space-y-6">
          {/* 問題ヘッダー */}
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
            <div className="space-y-1">
              <span className="text-[10px] text-amber-400 font-bold tracking-widest block">
                指令書 No.0{currentStageData.id}
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-amber-100 font-serif flex items-center gap-2">
                <span>{currentStageData.title}</span>
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded font-bold">
                目標: {currentStageData.stoneName}
              </span>
            </div>
          </div>

          {/* 暗号カード（和風書状調） */}
          <div className="bg-gradient-to-b from-[#1C1628] to-[#130E1C] border border-amber-500/40 rounded-xl p-5 sm:p-6 space-y-4 shadow-xl relative">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400 font-bold flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500 animate-pulse" />
                <span>【怪盗からの暗号電文】</span>
              </span>
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs text-amber-300 hover:text-white bg-black/40 hover:bg-black/70 border border-amber-500/30 px-3 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>{showHint ? '斬丸の助言を閉じる ▲' : '斬丸の助言を聞く ▼'}</span>
              </button>
            </div>

            <p className="font-serif text-base sm:text-lg font-medium leading-loose text-amber-100 tracking-wider bg-black/40 p-4 rounded-lg border border-amber-500/20">
              {currentStageData.riddle}
            </p>

            {/* 斬丸の助言（ヒント） */}
            {showHint && (
              <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-3.5 text-xs text-amber-100 leading-relaxed animate-fadeIn">
                <strong className="text-amber-300 block mb-1">🏮 斬丸からの助言：</strong>
                <p>{currentStageData.hint}</p>
              </div>
            )}
          </div>

          {/* 駅選択＆回答エリア */}
          <div className="space-y-4 bg-black/40 border border-stone-800 rounded-xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span>暗号が指し示す駅（うまや）を特定せよ</span>
              </span>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(true)}
                className="text-xs text-amber-400 hover:underline cursor-pointer"
              >
                全72駅から選ぶ →
              </button>
            </div>

            {/* 駅検索入力バー */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-amber-500 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="駅名または駅コードを入力（例: 柏、北千住、我孫子、松戸）"
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (searchKeyword.trim()) setIsDropdownOpen(true);
                  }}
                  className="w-full bg-[#161220] border border-amber-700/50 focus:border-amber-400 pl-10 pr-4 py-3 rounded-lg text-sm font-bold text-amber-100 placeholder:text-stone-500 outline-none transition-all"
                />
              </div>

              {/* 検索結果サジェストドロップダウン */}
              {isDropdownOpen && filteredStations.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#171322] border border-amber-500/50 rounded-lg shadow-2xl z-30 divide-y divide-stone-800 max-h-56 overflow-y-auto">
                  {filteredStations.map((st) => (
                    <div
                      key={st.id}
                      onClick={() => {
                        setSelectedStation(st);
                        setSearchKeyword('');
                        setIsDropdownOpen(false);
                      }}
                      className="p-3 hover:bg-amber-950/50 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-black/60 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                          {st.code}
                        </span>
                        <span className="text-sm font-bold text-stone-100">
                          {st.name}駅
                        </span>
                        <span className="text-xs text-stone-400">({st.kana})</span>
                      </div>
                      <span className="text-xs font-bold text-amber-400">選択 ↵</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* クイック選択ピル（10駅） */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-stone-400 block">
                主要駅・重要拠点から選ぶ：
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickPickStations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStation(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      selectedStation?.id === st.id
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                        : 'bg-stone-900/80 hover:bg-stone-800 text-amber-100 border-stone-700'
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 選択した駅の確認＆回答送信ボタン */}
            {selectedStation && (
              <div className="bg-[#1A1426] border-2 border-amber-500 rounded-xl p-4 sm:p-5 space-y-4 animate-scaleUp">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-amber-400 font-bold">
                    【選定した駅】
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedStation(null)}
                    className="text-xs text-stone-400 hover:text-white"
                  >
                    取り消す
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-amber-200">
                      {selectedStation.name}駅
                    </h3>
                    <span className="text-xs text-stone-400">
                      路線：{selectedStation.line} ({selectedStation.code})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  className="w-full h-12 sm:h-14 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm sm:text-base shadow-xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all border border-amber-300"
                >
                  <Check className="w-5 h-5" />
                  <span>【{selectedStation.name}駅】で回答・雅石を捜索する！ →</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================================
          4. 最終ボス謎（第4フェーズ：真の隠し場所特定）
         ======================================================================= */}
      {gameState.phase === 'boss' && (
        <div className="bg-[#0E0B14] border-x border-b border-amber-500/20 p-5 sm:p-8 rounded-b-2xl shadow-2xl space-y-6 animate-fadeIn">
          {/* ボスヘッダー */}
          <div className="flex items-center justify-between border-b border-rose-500/40 pb-3">
            <div className="space-y-1">
              <span className="bg-[#991B1B] text-amber-100 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-400">
                最終決戦
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-amber-100 font-serif">
                {BOSS_STAGE.title}
              </h2>
            </div>
            <span className="text-xs text-amber-300 font-bold">
              3つの雅石 結集完了！
            </span>
          </div>

          {/* 路線図・三角形ビジュアライザー（SVG地図） */}
          <div className="bg-black/60 border-2 border-amber-500/60 rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>東葛・常磐 鉄路三角形暗号図</span>
              </span>
              <span className="text-[10px] text-stone-400">
                ※3点を結ぶ三角形の中心を割り出せ
              </span>
            </div>

            {/* 三角形幾何学路線図（北千住・柏・我孫子・松戸） */}
            <div className="relative w-full h-64 bg-[#140F20] rounded-lg border border-amber-500/30 overflow-hidden flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 400 240">
                <defs>
                  <linearGradient id="goldLine" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#EF4444" />
                  </linearGradient>
                </defs>

                {/* 背景グリッド */}
                <line x1="0" y1="60" x2="400" y2="60" stroke="#251F33" strokeDasharray="4" />
                <line x1="0" y1="120" x2="400" y2="120" stroke="#251F33" strokeDasharray="4" />
                <line x1="0" y1="180" x2="400" y2="180" stroke="#251F33" strokeDasharray="4" />
                <line x1="100" y1="0" x2="100" y2="240" stroke="#251F33" strokeDasharray="4" />
                <line x1="200" y1="0" x2="200" y2="240" stroke="#251F33" strokeDasharray="4" />
                <line x1="300" y1="0" x2="300" y2="240" stroke="#251F33" strokeDasharray="4" />

                {/* 3点を結ぶ三角形（柏(378, 40) - 北千住(290, 190) - 我孫子(120, 90)・架空駅） */}
                <polygon
                  points="378,45 290,190 120,90"
                  fill="rgba(245, 158, 11, 0.1)"
                  stroke="url(#goldLine)"
                  strokeWidth="3"
                  strokeDasharray="6 3"
                />

                {/* 頂点1: 柏駅 */}
                <circle cx="378" cy="45" r="7" fill="#10B981" stroke="#FFF" strokeWidth="2" />
                <text x="378" y="30" fill="#6EE7B7" fontSize="11" fontWeight="bold" textAnchor="middle">
                  柏駅（緑白の雅石）
                </text>

                {/* 頂点2: 北千住駅 */}
                <circle cx="290" cy="190" r="7" fill="#06B6D4" stroke="#FFF" strokeWidth="2" />
                <text x="290" y="215" fill="#67E8F9" fontSize="11" fontWeight="bold" textAnchor="middle">
                  北千住駅（蒼線の雅石）
                </text>

                {/* 頂点3: 我孫子駅 */}
                <circle cx="120" cy="90" r="7" fill="#A855F7" stroke="#FFF" strokeWidth="2" />
                <text x="120" y="65" fill="#D8B4FE" fontSize="11" fontWeight="bold" textAnchor="middle">
                  我孫子駅（時空の雅石）
                </text>

                {/* 中心：松戸駅 */}
                <circle cx="325" cy="115" r="10" fill="#EF4444" stroke="#F59E0B" strokeWidth="3" className="animate-ping opacity-75" />
                <circle cx="325" cy="115" r="7" fill="#EF4444" stroke="#FFF" strokeWidth="2" />
                <text x="325" y="140" fill="#FCA5A5" fontSize="12" fontWeight="black" textAnchor="middle">
                  ？（三角形の中心）
                </text>
              </svg>
            </div>

            <p className="font-serif text-sm sm:text-base text-amber-100 leading-relaxed">
              {BOSS_STAGE.riddle}
            </p>

            {/* ヒント */}
            <div className="bg-rose-950/30 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-200">
              💡 <strong>斬丸からの最終助言：</strong> {BOSS_STAGE.hint}
            </div>
          </div>

          {/* 回答エリア */}
          <div className="space-y-4 bg-black/40 border border-stone-800 rounded-xl p-5">
            <span className="text-xs font-bold text-amber-200 block">
              三角形の中心にある駅を選択せよ：
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['matsudo', 'shinmatsudo', 'ayase', 'minamisenju'].map((stId) => {
                const st = KANZAKI_STATIONS_72.find((s) => s.id === stId);
                if (!st) return null;
                const isSelected = selectedStation?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStation(st)}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-lg scale-102'
                        : 'bg-[#181324] hover:bg-[#231B34] text-stone-200 border-stone-700'
                    }`}
                  >
                    <span className="text-xs block text-stone-400 font-mono mb-0.5">
                      {st.code}
                    </span>
                    <span className="text-base font-bold block">{st.name}駅</span>
                  </button>
                );
              })}
            </div>

            {selectedStation && (
              <button
                type="button"
                onClick={handleSubmitAnswer}
                className="w-full h-14 rounded-xl bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black text-base shadow-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all border border-amber-300 animate-pulse"
              >
                <ShieldCheck className="w-6 h-6" />
                <span>【{selectedStation.name}駅】へ突入！怪盗のアジトを制圧する！</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* =======================================================================
          5. エピローグ・完全制覇＆認定証画面
         ======================================================================= */}
      {gameState.phase === 'clear' && (
        <div className="bg-[#0E0B14] border-x border-b border-amber-500/20 p-5 sm:p-8 rounded-b-2xl shadow-2xl space-y-6 animate-scaleUp">
          {/* 大団円ヘッダー */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-black px-4 py-1 rounded-full shadow-lg">
              <Award className="w-4 h-4" />
              <span>全任務完全遂行・大団円</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-amber-100 font-serif">
              怪盗のアジト完全制圧！雅石のすべてを取り戻せり！
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 max-w-xl mx-auto leading-relaxed">
              斬丸「あっぱれ！貴殿ら社内探偵団の知略により、坂東の鉄路に平安が戻った。この誉れ高き功績を称え、S級探偵団員の認定証と公式LINE特典を進呈仕候！」
            </p>
          </div>

          {/* S級探偵団員 認定証（金箔・漆黒の豪華カード） */}
          <div 
            className="rounded-2xl p-6 sm:p-8 text-stone-100 border-2 border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.25)] relative overflow-hidden space-y-4"
            style={{
              background: 'linear-gradient(135deg, #1C1528 0%, #0E0A16 50%, #201730 100%)',
            }}
          >
            {/* 四隅の飾り金具意匠 */}
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-amber-400 pointer-events-none" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-amber-400 pointer-events-none" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-amber-400 pointer-events-none" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-amber-400 pointer-events-none" />

            <div className="flex items-center justify-between border-b border-amber-500/40 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <span className="font-serif font-black text-amber-200 tracking-widest text-sm">
                  神埼鉄道 総裁・特命依頼人 斬丸 認可
                </span>
              </div>
              <span className="bg-amber-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded">
                S級認定
              </span>
            </div>

            <div className="text-center py-3 space-y-2">
              <div className="text-xs text-amber-300 font-serif tracking-widest">
                神埼鉄道 社内探偵団員 認定之証
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 font-serif tracking-wider">
                特務最高顧問 探偵士
              </h3>
              <p className="text-xs text-stone-300 leading-relaxed max-w-md mx-auto">
                貴殿は「緑白の雅石（柏）」「蒼線の雅石（北千住）」「時空の雅石（我孫子）」を揃え、さらに三角形の結節点たる「松戸駅」のアジトを暴き出し、全事件を完全解決に導いたことを永久に証す。
              </p>
            </div>

            {/* LINE公式特典引換コード */}
            <div className="bg-black/70 border border-amber-500/50 rounded-xl p-4 text-center space-y-2">
              <span className="text-[11px] text-amber-400 font-bold tracking-widest block font-serif">
                【 公式LINE専用 特典引換コード 】
              </span>
              <div className="font-mono text-xl sm:text-2xl font-black text-amber-300 bg-black/90 py-2 px-4 rounded-lg border border-amber-500/40 inline-block tracking-widest select-all">
                {CLEAR_CODE}
              </div>
              <p className="text-[10px] text-stone-400">
                ※このコードを神埼鉄道公式LINEトークへ送信すると限定特典が授与されます
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? '特典コードをコピーしました！' : '特典コードをコピー'}</span>
              </button>

              <a
                href={LINE_OA_ADD_FRIEND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="h-12 px-6 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
              >
                <span>公式LINEを開く</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* イベント終了・イベント選択へ戻るナビゲーション */}
            {onExit && (
              <div className="pt-3 border-t border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(true)}
                  className="w-full sm:w-auto h-10 px-4 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-700 text-stone-400 hover:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>白紙に戻して再挑戦</span>
                </button>

                <button
                  type="button"
                  onClick={onExit}
                  className="w-full sm:w-auto h-11 px-6 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/60 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>イベントを終了して一覧へ戻る</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================================
          6. 全72駅選択モーダル
         ======================================================================= */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border-2 border-amber-600/60 bg-[#140F20] shadow-2xl flex flex-col overflow-hidden text-stone-200">
            <div className="p-4 border-b border-amber-500/30 flex items-center justify-between bg-black/50">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-amber-100 font-serif">
                  神埼鉄道 全線72駅一覧
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="p-1 text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh] grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KANZAKI_STATIONS_72.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setSelectedStation(st);
                    setIsStationModalOpen(false);
                  }}
                  className="p-2.5 rounded-lg border border-stone-800 hover:border-amber-500/80 bg-black/40 hover:bg-amber-950/40 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-[10px] text-amber-400/80 font-mono">
                    <span>{st.code}</span>
                    <span className="text-stone-500 group-hover:text-amber-300">選択</span>
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-stone-100 group-hover:text-amber-200">
                    {st.name}駅
                  </div>
                  <div className="text-[10px] text-stone-400">{st.kana}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          7. 判定結果モーダル（正解 / 不正解）
         ======================================================================= */}
      {feedback.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div 
            className={`w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl space-y-4 animate-scaleUp relative overflow-hidden text-stone-100 ${
              feedback.isCorrect ? 'bg-[#151C18] border-emerald-500' : 'bg-[#1C1215] border-rose-500'
            }`}
          >
            <div className="flex items-center justify-center">
              {feedback.isCorrect ? (
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 animate-bounce">
                  <Check className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <h3 className={`text-lg font-bold font-serif ${feedback.isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                {feedback.title}
              </h3>
              <p className="text-sm text-stone-200 leading-relaxed font-serif">
                {feedback.message}
              </p>
              {feedback.explanation && (
                <div className="text-xs bg-black/50 p-3 rounded-lg border border-stone-700 text-stone-300 text-left leading-relaxed">
                  💡 {feedback.explanation}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFeedback({ ...feedback, isOpen: false })}
              className={`w-full h-12 rounded-xl font-bold text-sm shadow-lg cursor-pointer active:scale-[0.98] transition-all ${
                feedback.isCorrect
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {feedback.isCorrect ? '次へ進む →' : '電文をもう一度読み直す'}
            </button>
          </div>
        </div>
      )}

      {/* =======================================================================
          8. 白紙に戻す（リセット確認モーダル）
         ======================================================================= */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl border-2 border-stone-700 bg-[#161220] p-6 shadow-2xl space-y-4 text-stone-100 animate-scaleUp">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto text-amber-300">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-amber-200 font-serif">
                捜査記録の初期化
              </h3>
              <p className="text-xs text-stone-300 leading-relaxed">
                集めた雅石や暗号解明の記録を白紙に戻します。目的の動作を選択してください。
              </p>
            </div>

            <div className="space-y-2 pt-2">
              {/* 白紙に戻してイベントを終了し、イベント選択へ戻る */}
              <button
                type="button"
                onClick={() => handleConfirmReset(true)}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-red-800 to-red-900 hover:from-red-700 hover:to-red-800 text-amber-100 text-xs font-bold cursor-pointer transition-all border border-red-500/60 shadow-lg flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4 text-amber-300" />
                <span>白紙に戻してイベント終了（選択へ戻る）</span>
              </button>

              {/* 白紙に戻して最初からやり直す */}
              <button
                type="button"
                onClick={() => handleConfirmReset(false)}
                className="w-full h-11 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold cursor-pointer transition-all border border-stone-600 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>白紙に戻して最初から捜査</span>
              </button>

              {/* キャンセル */}
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="w-full h-10 rounded-xl bg-black/40 hover:bg-black/60 text-stone-400 hover:text-stone-200 text-xs font-medium cursor-pointer transition-all border border-stone-800"
              >
                キャンセル（捜査を継続）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MysteryTrainApp;
