import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { LINE_OA_ADD_FRIEND_URL } from '../utils/accountApi';
import { LineIcon } from './LineIcon';
import { Notice, NOTICE_KIND_LABEL, NoticeKind, noticeImages, safeHttpsUrl } from '../utils/notices';
import { NoticeImageViewer } from './NoticeImageViewer';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { usePcLayout } from '../utils/usePcLayout';
import { useBackClose } from '../utils/backClose';

interface NoticeSheetProps {
  isOpen: boolean;
  notices: Notice[]; // 新しい順・最新の20件(utils/notices.ts で整えたもの)
  onClose: () => void;
}

const KIND_BADGE: Record<NoticeKind, string> = {
  normal: 'bg-[#EFEDF5] text-[#6B6380]',
  event: 'bg-[#EDE9FE] text-[#5B21B6]',
  important: 'bg-[#DC2626] text-white',
};

const dateText = (ms: number): string => new Date(ms).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' });

// 題名・本文は、文字として、そのまま出す(HTML として解釈しない)。画像・リンクは、https:// のものだけ
const NoticeItem: React.FC<{ n: Notice; onOpenImage: (urls: string[], index: number) => void }> = ({ n, onOpenImage }) => {
  const images = noticeImages(n);
  const link = safeHttpsUrl(n.linkUrl);
  const important = n.kind === 'important';
  return (
    <li className={`rounded-2xl border p-3.5 space-y-2 ${important ? 'border-[#FCA5A5] bg-[#FEF2F2]' : 'border-[#E6E2EE] bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${KIND_BADGE[n.kind]}`}>{NOTICE_KIND_LABEL[n.kind]}</span>
        <span className="text-[11px] font-bold text-[#857D99]">{dateText(n.publishAt)}</span>
      </div>
      <h3 className={`text-sm font-black break-words ${important ? 'text-[#B91C1C]' : 'text-[#221C35]'}`}>{n.title}</h3>
      {n.body && <p className="text-xs leading-relaxed text-[#221C35] whitespace-pre-wrap break-words">{n.body}</p>}
      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((src, i) => (
            <button key={src} type="button" onClick={() => onOpenImage(images, i)} aria-label="画像を大きく見る" className="block w-full cursor-zoom-in">
              <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-xl border border-[#E6E2EE] bg-[#F4F3F8]" />
            </button>
          ))}
        </div>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#5B21B6] underline break-all">
          <span>詳しく見る</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>
      )}
    </li>
  );
};

// メニューの「通知」: 下から出るシート(PC では、中央の枠。段階3の、ほかのシートと同じ作り)
export const NoticeSheet: React.FC<NoticeSheetProps> = ({ isOpen, notices, onClose }) => {
  const pcLayout = usePcLayout(); // PC 表示のときは、中央の枠。下へ引いて閉じる動きは付けない
  const drag = useDragToDismiss(onClose, !pcLayout);
  // 画像の全画面表示(開いているあいだは、Esc は、画像だけを閉じる)
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const viewerOpenRef = useRef(false);
  viewerOpenRef.current = viewer !== null;
  useEffect(() => {
    if (!isOpen) setViewer(null);
  }, [isOpen]);

  // シートを開いているあいだは、うしろの画面をスクロールさせない
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = html.style.overflow;
    document.body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !viewerOpenRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useBackClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn pc:justify-center pc:items-center pc:p-4" role="dialog" aria-modal="true" aria-label="通知">
      <button type="button" onClick={onClose} className="flex-1 cursor-default pc:absolute pc:inset-0 pc:flex-none" aria-label="通知を閉じる" />
      <div style={drag.style} className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col pc:relative pc:max-w-[480px] pc:rounded-3xl">
        <div {...drag.handleProps} className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none pc:cursor-default pc:pt-5">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D1C9E3] pc:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[#221C35]">通知</h2>
            <button type="button" onClick={onClose} aria-label="閉じる" className="hidden pc:block p-1 rounded-lg text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div ref={drag.contentRef} className="overflow-y-auto overscroll-contain px-4 pb-6">
          {notices.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#857D99]">通知はありません</div>
          ) : (
            <ul className="space-y-3">
              {notices.map((n) => (
                <NoticeItem key={n.id} n={n} onOpenImage={(urls, index) => setViewer({ urls, index })} />
              ))}
            </ul>
          )}
          <a href={LINE_OA_ADD_FRIEND_URL} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-[#E6E2EE] py-2.5 text-xs font-bold text-[#221C35]">
            <LineIcon className="w-5 h-5" />
            <span>公式LINE</span>
          </a>
        </div>
      </div>
      {viewer && <NoticeImageViewer urls={viewer.urls} startIndex={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  );
};
