import React, { useEffect, useRef, useState } from 'react';
import { isLaunchBonusOpen, isLaunched } from '../utils/launch';

// NIZAKI 2.0 の公開日の案内(公開後だけ出る)。
//  - 初めて開いたとき、新しい機能を数枚で案内する(端末ごとに1回)。案内は、画面の下のカードで出して、
//    説明している場所(時刻表タブ・マイページ・設定・N-POINT)を、後ろで実際に開く(開き方は、App の onStep)。
//  - クラウドの会員には、公開記念のポイントを、受け取りの画面で渡す(アカウントごとに1回。サーバーが二重に付けない)。
//    受け取らずに閉じたときは、次にアプリを開いたとき、また出す(同じ開いている間は出さない)。
const TOUR_SEEN_KEY = 'nizaki_v2_tour_seen';
const BONUS_LATER_KEY = 'nizaki_v2_bonus_later'; // sessionStorage: 「あとで」にした
export const LAUNCH_BONUS_ID = 'launch2';
export const LAUNCH_BONUS_POINTS = 300;

// 案内が、後ろで開く場所
export type WelcomeStep = 'home' | 'route' | 'mileage' | 'delay' | 'save';

interface Slide {
  title: string;
  lines: string[];
  step: WelcomeStep;
  memberOnly?: boolean; // ログインしたクラウドの会員だけが見られる場所
}

const SLIDES: Slide[] = [
  {
    title: 'NIZAKI 2.0 へようこそ',
    lines: ['神埼アプリが、新しくなりました。', '新しい機能を、実際の画面を開きながら、ご案内します。'],
    step: 'home',
  },
  {
    title: '経路検索',
    lines: [
      '「時刻表」タブの「経路検索」で、駅から駅までの行き方を、乗換と運賃つきで調べられます。',
      '通ってほしい駅の指定や、遅れを加えた検索もできます。',
    ],
    step: 'route',
  },
  {
    title: '乗車記録とマイレージ',
    lines: [
      '予約して乗った列車が、自動で記録されます。',
      '乗った距離に応じて、レギュラー・ゴールド・プレミアムとランクが上がります。マイページで見られます。',
    ],
    step: 'mileage',
    memberOnly: true,
  },
  {
    title: '遅れのお知らせ',
    lines: [
      'アプリを開いていれば、列車の遅れを、自動でお知らせします。',
      'お知らせの出し方は、メニューの「設定」で変えられます。',
    ],
    step: 'delay',
  },
  {
    title: 'ポイントは、神埼IDに保存',
    lines: [
      'ポイント・クーポン・予約の履歴が、神埼IDに保存されます。',
      '機種を変えたり、ブラウザを入れ直したりしても、ログインすれば引き継げます。',
    ],
    step: 'save',
    memberOnly: true,
  },
];

const readTourSeen = (): boolean => {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

const writeTourSeen = () => {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // 保存できなくても、この画面を開いているあいだは、また出ない
  }
};

const readBonusLater = (): boolean => {
  try {
    return sessionStorage.getItem(BONUS_LATER_KEY) === '1';
  } catch {
    return false;
  }
};

const writeBonusLater = () => {
  try {
    sessionStorage.setItem(BONUS_LATER_KEY, '1');
  } catch {
    // 保存できなくても、この画面を開いているあいだは、また出ない
  }
};

// どの画面を出すか(出さないときは、画面の数が0)
export const planWelcome = (o: {
  tourSeen: boolean;
  replay?: boolean; // メニューから、案内をもう一度見る
  bonusLater: boolean;
  bonusOpen: boolean; // 記念ボーナスを渡す期間か
  cloudOn: boolean; // 公開後で、ログイン証のある会員か
  ready: boolean; // 最初の同期が済んだか
  error: boolean;
  claimed: boolean; // この会員は、受け取り済みか
}): { slides: number; bonus: boolean } => {
  const bonus = o.bonusOpen && o.cloudOn && o.ready && !o.error && !o.claimed && !o.bonusLater;
  return { slides: o.tourSeen && !o.replay ? 0 : SLIDES.length, bonus };
};

interface LaunchWelcomeProps {
  cloudOn: boolean;
  ready: boolean;
  error: boolean;
  claimedEvents: string[] | undefined;
  isLoggedIn: boolean;
  onClaim: () => Promise<{ added: boolean; points: number } | null>;
  onStep: (step: WelcomeStep) => void; // 案内が説明している場所を、後ろで開く
  onLogin: () => void; // 案内の途中から、ログインの画面を開く
  loginOpen: boolean; // ログインの画面が開いているあいだは、案内のカードを隠す(案内の途中の状態は、そのまま)
  replayKey: number; // 増えるたびに、案内を、最初から見せる(メニューの「NIZAKI 2.0 のご案内」)
}

type Result = { kind: 'got'; points: number } | { kind: 'already' } | { kind: 'fail' };

export const LaunchWelcome: React.FC<LaunchWelcomeProps> = ({ cloudOn, ready, error, claimedEvents, isLoggedIn, onClaim, onStep, onLogin, loginOpen, replayKey }) => {
  const [tourSeen, setTourSeen] = useState(readTourSeen);
  const [bonusLater, setBonusLater] = useState(readBonusLater);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [replaying, setReplaying] = useState(false); // 見終わった案内を、メニューからもう一度見ている
  const [claimedHere, setClaimedHere] = useState(false); // 受け取れた(または受け取り済みと分かった)あとは、同期の反映を待たずに、出さない

  const launched = isLaunched();
  const bonusOpen = isLaunchBonusOpen();
  const plan = planWelcome({
    tourSeen,
    replay: replaying,
    bonusLater,
    bonusOpen,
    cloudOn,
    ready,
    error,
    claimed: claimedHere || !!claimedEvents?.includes(LAUNCH_BONUS_ID),
  });
  const total = plan.slides + (plan.bonus || result ? 1 : 0);
  const open = launched && (total > 0 || result !== null);
  const onBonusPage = index >= plan.slides;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const openedPlaceRef = useRef(false); // 案内で、後ろの画面を動かした(終わったら、ホームへ戻す)

  // メニューから「ご案内」を押されたら、最初から見せる
  useEffect(() => {
    if (replayKey <= 0) return;
    setReplaying(true);
    setIndex(0);
    setResult(null);
  }, [replayKey]);

  // 受け取りの画面は、うしろを暗くして、スクロールさせない。案内のカードのあいだは、後ろの画面を見せる
  useEffect(() => {
    if (!open || !onBonusPage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, onBonusPage]);

  // 案内のカードが出ているあいだ、マイページなどが、カードに重ならないようにする(index.css)
  useEffect(() => {
    if (!open || onBonusPage || loginOpen) return;
    document.body.dataset.welcomeTour = '1';
    return () => {
      delete document.body.dataset.welcomeTour;
    };
  }, [open, onBonusPage, loginOpen]);

  // 枚が変わるたびに、説明している場所を、後ろで開く。受け取りの画面へ進むときは、ホームへ戻す
  useEffect(() => {
    if (!open) return;
    if (!onBonusPage) {
      openedPlaceRef.current = true;
      onStepRef.current(SLIDES[Math.min(index, SLIDES.length - 1)].step);
    } else if (openedPlaceRef.current) {
      openedPlaceRef.current = false;
      onStepRef.current('home');
    }
  }, [open, onBonusPage, index, cloudOn]);

  if (!open) return null;
  // ログインの画面が開いているあいだは、案内を隠す(ログインが済んだら、同じ枚から続ける)
  if (loginOpen) return null;

  const closeTour = () => {
    if (openedPlaceRef.current) {
      openedPlaceRef.current = false;
      onStepRef.current('home');
    }
    writeTourSeen();
    setTourSeen(true);
    setReplaying(false);
    setIndex(0);
  };
  const close = () => {
    if (openedPlaceRef.current) {
      openedPlaceRef.current = false;
      onStepRef.current('home');
    }
    if (!tourSeen) closeTour();
    // 受け取りの画面を、受け取らずに閉じたときだけ、この開いているあいだは出さない(案内だけを閉じたときは、すぐ受け取りの画面へ進む)
    if (onBonusPage && !result) {
      writeBonusLater();
      setBonusLater(true);
    }
    setReplaying(false);
    setResult(null);
  };
  const next = () => {
    if (index + 1 < total) setIndex(index + 1);
    else close();
  };
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    const r = await onClaim();
    setBusy(false);
    if (!r) setResult({ kind: 'fail' });
    else {
      setClaimedHere(true);
      setResult(r.added ? { kind: 'got', points: r.points } : { kind: 'already' });
    }
  };

  const slide = SLIDES[Math.min(index, SLIDES.length - 1)];
  const isLastTourSlide = !onBonusPage && index === plan.slides - 1;
  const bonusHint = isLastTourSlide && !plan.bonus && bonusOpen && !isLoggedIn;

  const guestNote = slide.memberOnly && !cloudOn;

  if (!onBonusPage) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div role="dialog" aria-label="NIZAKI 2.0 のご案内" className="w-full max-w-sm rounded-2xl border border-[#E6E2EE] bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-[#6B6380]">
              {index + 1} / {total}
            </div>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full ${i === index ? 'w-4 bg-[#5B21B6]' : 'w-1.5 bg-[#D8D3E6]'}`} />
              ))}
            </div>
          </div>
          <h2 className="mt-1 text-base font-bold text-[#221C35]">{slide.title}</h2>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#221C35]">
            {slide.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            {guestNote && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#F4F1FA] p-2 text-xs text-[#5B21B6]">
                <span>ログインすると、この画面を見られます。</span>
                {!isLoggedIn && (
                  <button type="button" onClick={onLogin} className="shrink-0 cursor-pointer rounded-lg bg-[#5B21B6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4C1D95]">
                    ログインして続ける
                  </button>
                )}
              </div>
            )}
            {bonusHint && (
              <p className="rounded-lg bg-[#F4F1FA] p-2 text-xs text-[#5B21B6]">
                ログインすると、公開記念のポイント({LAUNCH_BONUS_POINTS} pt)を受け取れます。
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            {index + 1 < total ? (
              <>
                <button type="button" onClick={closeTour} className="flex-1 cursor-pointer rounded-xl bg-[#E6E2EE] py-2.5 text-sm font-bold text-[#6B6380] hover:bg-[#DCD6E8]">
                  スキップ
                </button>
                <button type="button" onClick={next} className="flex-1 cursor-pointer rounded-xl bg-[#5B21B6] py-2.5 text-sm font-bold text-white hover:bg-[#4C1D95]">
                  次へ
                </button>
              </>
            ) : (
              <button type="button" onClick={close} className="flex-1 cursor-pointer rounded-xl bg-[#5B21B6] py-2.5 text-sm font-bold text-white hover:bg-[#4C1D95]">
                はじめる
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="NIZAKI 2.0 公開記念ボーナス">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <div className="text-xs font-bold text-[#6B6380]">公開記念</div>
          <h2 className="mt-1 text-lg font-bold text-[#221C35]">NIZAKI 2.0 公開記念ボーナス</h2>
          {result?.kind === 'got' ? (
            <p className="mt-4 text-sm leading-relaxed text-[#221C35]">
              <span className="text-2xl font-bold text-[#5B21B6]">{result.points.toLocaleString()} pt</span>
              <br />
              をお届けしました。N-POINT に反映されています。
            </p>
          ) : result?.kind === 'already' ? (
            <p className="mt-4 text-sm leading-relaxed text-[#221C35]">このアカウントでは、すでに受け取り済みです。</p>
          ) : (
            <>
              <p className="mt-4 text-sm leading-relaxed text-[#221C35]">
                新しくなったお祝いに、
                <span className="font-bold text-[#5B21B6]"> {LAUNCH_BONUS_POINTS} pt </span>
                をお届けします。
              </p>
              <p className="mt-1 text-xs text-[#6B6380]">アカウントごとに1回です。</p>
              {result?.kind === 'fail' && (
                <p className="mt-3 text-xs font-bold text-[#B42318]">通信できませんでした。もう一度お試しください。</p>
              )}
            </>
          )}
          <div className="mt-6 flex gap-2">
            {result?.kind === 'got' || result?.kind === 'already' ? (
              <button type="button" onClick={close} className="flex-1 cursor-pointer rounded-xl bg-[#5B21B6] py-3 text-sm font-bold text-white hover:bg-[#4C1D95]">
                閉じる
              </button>
            ) : (
              <>
                <button type="button" onClick={close} className="flex-1 cursor-pointer rounded-xl bg-[#E6E2EE] py-3 text-sm font-bold text-[#6B6380] hover:bg-[#DCD6E8]">
                  あとで
                </button>
                <button
                  type="button"
                  onClick={claim}
                  disabled={busy}
                  className="flex-1 cursor-pointer rounded-xl bg-[#5B21B6] py-3 text-sm font-bold text-white hover:bg-[#4C1D95] disabled:opacity-60"
                >
                  {busy ? '受け取り中…' : '受け取る'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
