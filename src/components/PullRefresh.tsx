import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, RotateCw } from 'lucide-react';
import { openLayerCount } from '../utils/backClose';
import { ancestorBlocksPull, canStartPull, isPullIntent, pullDistance, pullProgress, shouldReload } from '../utils/pullRefresh';

// 下に引っ張って再読み込み。引いているあいだ、上に、紫の小さな目印(矢印。離すと再読み込みになる所まで引くと、矢印が上向きに変わる)を出す。
// ページのゴムの動き(iOS)は止めない(touch は、見るだけ)。

const scrollTopNow = (): number => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

// 触った場所から、まわりの様子を調べる(内側にスクロールする場所・指で動かす場所・入力欄なら、引きを始めさせない)
const blockedByAncestors = (target: EventTarget | null): boolean => {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const cs = window.getComputedStyle(el);
    if (
      ancestorBlocksPull({
        tag: el.tagName,
        overflowY: cs.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        touchAction: cs.touchAction,
        editable: (el as HTMLElement).isContentEditable === true,
        noPull: el.hasAttribute('data-no-pull'),
      })
    )
      return true;
    el = el.parentElement;
  }
  return false;
};

export const PullRefresh: React.FC = () => {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const track = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const distRef = useRef(0);

  useEffect(() => {
    const reset = () => {
      track.current = null;
      distRef.current = 0;
      setDistance(0);
    };
    const onStart = (e: TouchEvent) => {
      track.current = null;
      const t = e.touches[0];
      if (!t) return;
      const ok = canStartPull({ scrollTop: scrollTopNow(), layers: openLayerCount(), blocked: blockedByAncestors(e.target), touches: e.touches.length });
      if (ok) track.current = { x: t.clientX, y: t.clientY, active: false };
    };
    const onMove = (e: TouchEvent) => {
      const tr = track.current;
      const t = e.touches[0];
      if (!tr || !t) return;
      // 動いているあいだに、スクロールした・モーダルが開いた・指が増えたら、やめる
      if (e.touches.length !== 1 || scrollTopNow() > 0 || openLayerCount() > 0) return reset();
      const dx = t.clientX - tr.x;
      const dy = t.clientY - tr.y;
      if (!tr.active) {
        if (isPullIntent(dx, dy)) tr.active = true;
        else if (Math.abs(dy) > 12 || Math.abs(dx) > 12) return reset(); // 上へのスクロール・横の動きは、引きではない
        else return;
      }
      const d = pullDistance(tr.y, t.clientY);
      distRef.current = d;
      setDistance(d);
    };
    const onEnd = () => {
      const tr = track.current;
      const d = distRef.current;
      const go = !!tr?.active && shouldReload(d, scrollTopNow(), openLayerCount());
      reset();
      if (go) {
        setRefreshing(true);
        window.location.reload();
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, []);

  const progress = pullProgress(distance);
  if (distance <= 0 && !refreshing) return null;
  const ready = progress >= 1;
  return (
    <div
      className="fixed left-1/2 z-[200] pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', transform: `translate(-50%, ${Math.min(distance * 0.4, 48) - 36}px)`, opacity: refreshing ? 1 : Math.min(1, progress * 1.5) }}
      role="status"
      aria-label={refreshing ? '再読み込み中' : ready ? '離すと再読み込み' : '引いて再読み込み'}
    >
      <div className="w-8 h-8 rounded-full bg-white border border-[#C4B5FD] shadow-md flex items-center justify-center text-[#5B21B6]">
        {refreshing ? (
          <RotateCw className="w-4 h-4 animate-spin" strokeWidth={2.6} />
        ) : (
          <ArrowDown className="w-4 h-4 transition-transform duration-150" strokeWidth={2.8} style={{ transform: `rotate(${ready ? 180 : progress * 150}deg)` }} />
        )}
      </div>
    </div>
  );
};
