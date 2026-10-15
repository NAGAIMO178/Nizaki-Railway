// 下から出るシート(ボトムシート)を、下へ引っ張って閉じるための部品。
//  - handleProps を、つまみ(や見出し)に付けると、指(やマウス)で下へ引いて閉じられる。ちょんと押しただけでも閉じる。
//  - contentRef を、シートの中のスクロールする箱に付けると、箱が一番上までスクロールされているときに、下へ引いても閉じられる。
//    (一番上でないときは、ふつうにスクロールする)
//  - style を、シート本体に付ける。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const CLOSE_DISTANCE_PX = 90; // これ以上引いたら閉じる
const CLOSE_VELOCITY_PX_PER_MS = 0.6; // これより速く引いたら、短くても閉じる
const TAP_MOVE_PX = 6; // これ以下の動きは、「ちょんと押した」とみなす
const TAP_MAX_MS = 300;
const CLOSE_ANIMATION_MS = 180;

export function useDragToDismiss(onDismiss: () => void) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const dragYRef = useRef(0);
  const startRef = useRef<{ y: number; t: number } | null>(null);
  const lastRef = useRef<{ y: number; t: number }>({ y: 0, t: 0 });
  const velocityRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const update = (v: number) => {
    dragYRef.current = v;
    setDragY(v);
  };

  const begin = (y: number) => {
    const now = performance.now();
    startRef.current = { y, t: now };
    lastRef.current = { y, t: now };
    velocityRef.current = 0;
    setDragging(true);
  };

  const move = (y: number) => {
    const start = startRef.current;
    if (!start) return;
    const now = performance.now();
    const dt = now - lastRef.current.t;
    if (dt > 0) velocityRef.current = (y - lastRef.current.y) / dt;
    lastRef.current = { y, t: now };
    update(Math.max(0, y - start.y));
  };

  const finish = (allowTap: boolean) => {
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);
    if (!start) return;
    const dy = dragYRef.current;
    const elapsed = performance.now() - start.t;
    const isTap = allowTap && dy <= TAP_MOVE_PX && elapsed <= TAP_MAX_MS;
    const isFlick = velocityRef.current > CLOSE_VELOCITY_PX_PER_MS && dy > 30;
    if (isTap || dy >= CLOSE_DISTANCE_PX || isFlick) {
      slideOut();
    } else {
      update(0);
    }
  };

  // 下まで滑らせてから閉じる
  const slideOut = () => {
    update(Math.max(window.innerHeight, 600));
    window.setTimeout(() => {
      dismissRef.current();
      update(0);
    }, CLOSE_ANIMATION_MS);
  };

  const handleProps = {
    onPointerDown: (e: ReactPointerEvent) => {
      begin(e.clientY);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 取れない環境でも、動きは追える
      }
    },
    onPointerMove: (e: ReactPointerEvent) => move(e.clientY),
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    // キーボードでも閉じられるように
    tabIndex: 0,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        slideOut();
      }
    },
    // 中身の「引いて閉じる」と二重に動かないよう、つまみの印を付ける
    'data-sheet-handle': true,
    // つまみの上では、ブラウザのスクロールを始めさせない
    style: { touchAction: 'none' as const },
  };

  // シートの中身: 一番上までスクロールされているときだけ、下へ引いて閉じる
  const attachContent = useCallback((el: HTMLDivElement | null) => {
    contentRef.current = el;
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let mode: 'idle' | 'undecided' | 'drag' | 'scroll' = 'idle';
    let startY = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // つまみの上から始まった動きは、つまみ自身が受け持つ
      if ((e.target as HTMLElement | null)?.closest?.('[data-sheet-handle]')) {
        mode = 'idle';
        return;
      }
      mode = 'undecided';
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return;
      const y = e.touches[0].clientY;
      if (mode === 'undecided') {
        const dy = y - startY;
        if (Math.abs(dy) < 4) return;
        if (dy > 0 && el.scrollTop <= 0) {
          mode = 'drag';
          begin(startY);
        } else {
          mode = 'scroll';
          return;
        }
      }
      e.preventDefault(); // 引いて閉じる動きのあいだは、中身を動かさない
      move(y);
    };
    const onEnd = () => {
      if (mode === 'drag') finish(false);
      mode = 'idle';
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });

  const style = {
    transform: `translateY(${dragY}px)`,
    transition: dragging ? 'none' : `transform ${CLOSE_ANIMATION_MS}ms ease`,
  };

  return { handleProps, contentRef: attachContent, style };
}
