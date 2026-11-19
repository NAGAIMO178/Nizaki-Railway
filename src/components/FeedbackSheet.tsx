import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { usePcLayout } from '../utils/usePcLayout';
import { useBackClose } from '../utils/backClose';
import { systemLogger } from '../utils/systemLogger';
import {
  buildEnvText, buildFeedbackFormUrl, FEEDBACK_KINDS, FEEDBACK_MESSAGE_MAX, FEEDBACK_SCREENS, LINE_OA_ADD_FRIEND_URL, lineOaMessageUrl, submitFeedback, validateFeedback,
} from '../utils/feedback';
import { LineIcon } from './LineIcon';

interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  defaultScreen: string; // いま開いていた画面(最初から選んでおく)
  currentScreenLabel: string; // 動作状況の「いまの画面」
  sessionToken?: string; // ログイン中なら(返信希望のときだけ、サーバーが会員IDを覚える)
  loggedIn: boolean;
}

const radioClass = (on: boolean) =>
  `flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold cursor-pointer ${on ? 'border-[#5B21B6] bg-[#EDE9FE] text-[#5B21B6]' : 'border-[#E6E2EE] bg-white text-[#221C35]'}`;

// 送れたあと: 返信を希望した人には、受付コードを大きく出す
export const FeedbackDone: React.FC<{ replyCode?: string; copied: boolean; onCopy: (code: string) => void }> = ({ replyCode, copied, onCopy }) => (
  <div className="space-y-4 py-2 text-center">
    {replyCode ? (
      <>
        <div className="font-mono text-4xl font-black tracking-[0.3em] text-[#5B21B6] pl-[0.3em]" aria-label="受付コード">{replyCode}</div>
        <p className="text-xs font-bold text-[#221C35]">公式LINEで、この6文字を、そのまま送ってください(10分間有効)</p>
        <div className="flex gap-2">
          <a href={lineOaMessageUrl(replyCode)} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#06C755] py-3 text-sm font-bold text-white">
            <LineIcon className="w-5 h-5" />
            <span>LINEで送る</span>
          </a>
          <button type="button" onClick={() => onCopy(replyCode)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E6E2EE] bg-white py-3 text-sm font-bold text-[#221C35] cursor-pointer">
            {copied ? <Check className="w-4 h-4 text-[#059669]" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'コピーしました' : 'コードをコピー'}</span>
          </button>
        </div>
        <a href={LINE_OA_ADD_FRIEND_URL} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] font-bold text-[#6B6380] underline">
          公式LINEを友だち追加
        </a>
      </>
    ) : (
      <p className="py-6 text-sm font-bold text-[#221C35]">送信しました。ありがとうございます</p>
    )}
  </div>
);

// ご意見・不具合: 下から出るシート(PC では、中央の480px。段階3の、ほかのシートと同じ作り)
export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ isOpen, onClose, defaultScreen, currentScreenLabel, sessionToken, loggedIn }) => {
  const pcLayout = usePcLayout();
  const drag = useDragToDismiss(onClose, !pcLayout);
  const [screen, setScreen] = useState(defaultScreen);
  const [kind, setKind] = useState('');
  const [message, setMessage] = useState('');
  const [wantReply, setWantReply] = useState(false);
  const [attachEnv, setAttachEnv] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ replyCode?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // 開くたびに、まっさらにする(いま開いていた画面を、選んでおく)
  useEffect(() => {
    if (!isOpen) return;
    setScreen(defaultScreen);
    setKind('');
    setMessage('');
    setWantReply(false);
    setAttachEnv(true);
    setSending(false);
    setError(null);
    setDone(null);
    setCopied(false);
  }, [isOpen, defaultScreen]);

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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useBackClose(isOpen, onClose);

  // 動作状況(開いたときに、作る)
  const env = useMemo(() => {
    if (!isOpen) return '';
    const errors = systemLogger
      .getLogs()
      .filter((l) => l.level === 'error' || l.level === 'critical')
      .slice(0, 3)
      .map((l) => l.message);
    return buildEnvText({
      version: __APP_VERSION__,
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      pcLayout,
      userAgent: navigator.userAgent,
      screen: currentScreenLabel,
      loggedIn,
      errors,
      online: navigator.onLine !== false,
      now: new Date(),
      href: window.location.href,
    });
  }, [isOpen, pcLayout, currentScreenLabel, loggedIn]);

  if (!isOpen) return null;

  const problem = validateFeedback({ screen, kind, message });

  const send = async () => {
    if (problem || sending) return;
    setSending(true);
    setError(null);
    const res = await submitFeedback({ screen, kind, message, wantReply, env: attachEnv ? env : '' }, sessionToken);
    setSending(false);
    if (res.ok) setDone({ replyCode: wantReply ? res.replyCode : undefined });
    else setError((res as { message: string }).message);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn pc:justify-center pc:items-center pc:p-4" role="dialog" aria-modal="true" aria-label="ご意見・不具合">
      <button type="button" onClick={onClose} className="flex-1 cursor-default pc:absolute pc:inset-0 pc:flex-none" aria-label="ご意見・不具合を閉じる" />
      <div style={drag.style} className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col pc:relative pc:max-w-[480px] pc:rounded-3xl">
        <div {...drag.handleProps} className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none pc:cursor-default pc:pt-5">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D1C9E3] pc:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[#221C35]">ご意見・不具合</h2>
            <button type="button" onClick={onClose} aria-label="閉じる" className="hidden pc:block p-1 rounded-lg text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={drag.contentRef} className="overflow-y-auto overscroll-contain px-4 pb-6">
          {done ? (
            <FeedbackDone replyCode={done.replyCode} copied={copied} onCopy={copyCode} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <p className="text-[11px] text-[#857D99]">個人情報(本名・住所など)は入力しないでください</p>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-black text-[#221C35] mb-1.5">対象の画面</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {FEEDBACK_SCREENS.map((s) => (
                    <label key={s} className={radioClass(screen === s)}>
                      <input type="radio" name="feedback-screen" value={s} checked={screen === s} onChange={() => setScreen(s)} className="accent-[#5B21B6] shrink-0" />
                      <span className="break-words min-w-0">{s}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-black text-[#221C35] mb-1.5">種類</legend>
                <div className="grid grid-cols-3 gap-1.5">
                  {FEEDBACK_KINDS.map((k) => (
                    <label key={k} className={radioClass(kind === k)}>
                      <input type="radio" name="feedback-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[#5B21B6] shrink-0" />
                      <span className="break-words min-w-0">{k}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="flex items-center justify-between text-xs font-black text-[#221C35] mb-1.5">
                  <span>内容</span>
                  <span className="font-mono text-[11px] font-bold text-[#857D99]">残り {FEEDBACK_MESSAGE_MAX - message.length}</span>
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MESSAGE_MAX))}
                  rows={5}
                  className="w-full rounded-xl border border-[#E6E2EE] px-3 py-2 text-sm text-[#221C35] focus:outline-none focus:border-[#5B21B6]"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-[#221C35] cursor-pointer">
                <input type="checkbox" checked={wantReply} onChange={(e) => setWantReply(e.target.checked)} className="accent-[#5B21B6]" />
                <span>返信を希望する</span>
              </label>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-[#221C35] cursor-pointer">
                  <input type="checkbox" checked={attachEnv} onChange={(e) => setAttachEnv(e.target.checked)} className="accent-[#5B21B6]" />
                  <span>動作状況を添える</span>
                </label>
                <details className="rounded-xl bg-[#F4F3F8] px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-bold text-[#6B6380]">添える内容を見る</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap break-all text-[10px] leading-relaxed text-[#6B6380] font-mono">{env}</pre>
                </details>
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-xs font-bold text-[#B91C1C]">
                  {error}
                </div>
              )}

              <button type="submit" disabled={!!problem || sending} className="w-full rounded-xl bg-[#5B21B6] py-3 text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {sending ? '送信中…' : '送信'}
              </button>

              <div className="text-center">
                <a href={buildFeedbackFormUrl({ screen, kind, message, wantReply, env: attachEnv ? env : '' })} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#6B6380] underline">
                  Googleフォームで送る
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
