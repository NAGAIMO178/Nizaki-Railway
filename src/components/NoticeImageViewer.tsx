import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBackClose } from '../utils/backClose';

// 通知の画像の、全画面表示。左右の矢印(画像が2枚以上のときだけ)・指で左右にはらう・左右キー・Esc・閉じるボタン。
// 「戻る」ボタンでも閉じる(通知の画面は、そのまま残る)
export const SWIPE_MIN_PX = 50;

// 指をはらった向き: 左へ(次へ=1)・右へ(前へ=-1)・短い・縦に動いたとき(0)
export const swipeDirection = (dx: number, dy: number): -1 | 0 | 1 => {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
};

// 前後へ。端では、止まる(1周しない)
export const stepIndex = (index: number, dir: -1 | 1, count: number): number => Math.min(count - 1, Math.max(0, index + dir));

interface Props {
  urls: string[];
  startIndex?: number;
  onClose: () => void;
}

export const NoticeImageViewer: React.FC<Props> = ({ urls, startIndex = 0, onClose }) => {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, urls.length - 1)));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const many = urls.length > 1;
  const go = useCallback((dir: -1 | 1) => setIndex((i) => stepIndex(i, dir, urls.length)), [urls.length]);

  useBackClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  const url = urls[index];
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="画像"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        const t = e.changedTouches[0];
        if (!start || !t) return;
        const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y);
        if (dir !== 0) go(dir);
      }}
    >
      <button type="button" onClick={onClose} className="absolute inset-0 cursor-default" aria-label="閉じる" />
      <img src={url} alt="" referrerPolicy="no-referrer" draggable={false} className="relative max-h-full max-w-full object-contain select-none pointer-events-none" />
      <button type="button" onClick={onClose} aria-label="閉じる" className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer">
        <X className="w-6 h-6" />
      </button>
      {many && index > 0 && (
        <button type="button" onClick={() => go(-1)} aria-label="前の画像" className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer">
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {many && index < urls.length - 1 && (
        <button type="button" onClick={() => go(1)} aria-label="次の画像" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer">
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
};
