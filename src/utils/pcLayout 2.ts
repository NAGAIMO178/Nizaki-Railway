// PC 表示(幅 1024px 以上で、本体を 960px に広げるなど)を、日時が来るまで隠すためのしくみ。launch.ts・tkLine.ts と同じ考え方。
//  - 日時は、PC_LAYOUT_AT に書く(2026-11-20 8:00 日本時間=高宮線の公開と同時)。変えるときは、ここの1行だけを直す。
//    null のあいだは、(?pc=1 の確認用を除いて)PC 表示は、誰にも出ない。
//  - その日時になった瞬間から、全員に出る(端末の時計を使う)。
//  - 公開前に動作を確かめる手段(開発者向け): アドレスの末尾に ?pc=1 を付けて開くと、この端末で出る(localStorage に覚える)。?pc=0 で解除。
//    保存できない環境(プライベートブラウズなど)でも、日時の判定は動く。
//  - 出ているときは、画面全体(<html>)に、data-pc-layout="on" の印を付ける。CSS は、この印と幅(1024px 以上)の、両方がそろったときだけ効く(index.css の pc: )。
//    アプリを開いたまま日時をまたいだときは、その日時ちょうどに切り替える(setTimeout)。画面に戻ってきたとき・再表示のときにも、確かめ直す(時計の変更・スリープの後のため)。

export const PC_LAYOUT_AT: string | null = '2026-11-20T08:00:00+09:00';

export const PC_LAYOUT_KEY = 'nizaki_pc_layout';
export const PC_LAYOUT_ATTR = 'data-pc-layout';
// PC の幅の境目(Tailwind の lg: と同じ)。index.css の pc: の幅と、同じ値にする
export const PC_MIN_WIDTH_PX = 1024;

export const isPcLayoutOn = (now: number = Date.now()): boolean => {
  try {
    const param = new URLSearchParams(window.location.search).get('pc');
    if (param === '1') localStorage.setItem(PC_LAYOUT_KEY, '1');
    if (param === '0') localStorage.removeItem(PC_LAYOUT_KEY);
    if (localStorage.getItem(PC_LAYOUT_KEY) === '1') return true;
  } catch {
    // 保存できない環境でも、日時の判定は続ける
  }
  return PC_LAYOUT_AT !== null && now >= Date.parse(PC_LAYOUT_AT);
};

// 印(<html> の data-pc-layout)と、画面の中の動き(JavaScript で切り替えているもの)が見る「いま、出ているか」
let marked = false;
const listeners = new Set<() => void>();

export const getPcLayoutMarked = (): boolean => marked;
export const subscribePcLayout = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// いまの状態に、印を合わせる(変わったときだけ、知らせる)
export const applyPcLayout = (now: number = Date.now()): boolean => {
  const on = isPcLayoutOn(now);
  if (typeof document !== 'undefined' && document.documentElement) {
    if (on) document.documentElement.setAttribute(PC_LAYOUT_ATTR, 'on');
    else document.documentElement.removeAttribute(PC_LAYOUT_ATTR);
  }
  if (on !== marked) {
    marked = on;
    listeners.forEach((cb) => cb());
  }
  return on;
};

// setTimeout で待てる最大(約24.8日)
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// アプリの起動時に1回。印を付け、日時ちょうどと、画面に戻ったときに、付け直す。止める関数を返す
export const startPcLayout = (): (() => void) => {
  applyPcLayout();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (PC_LAYOUT_AT === null) return;
    const wait = Date.parse(PC_LAYOUT_AT) - Date.now();
    if (wait > 0 && wait <= MAX_TIMEOUT_MS) {
      timer = setTimeout(() => {
        applyPcLayout();
        schedule();
      }, wait + 50);
    }
  };
  const recheck = () => {
    applyPcLayout();
    schedule();
  };
  schedule();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', recheck);
  }
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', recheck);
    }
  };
};
