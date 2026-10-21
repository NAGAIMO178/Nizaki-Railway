import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CalendarX, Check, CircleAlert, Clock, LucideIcon } from 'lucide-react';
import { SeatClass } from '../types';
import { getSeatClassLabel } from '../utils/seatUtils';
import { TICKET_STATE_LABEL, TicketResult, TicketState, useTicket, verifyTicket } from '../utils/ticketApi';

// QR乗車券を読み取った先の、検札用の画面。列車・区間・座席・状態だけを出す(名前・メール・会員IDは出さない)
const STATE_STYLE: Record<TicketState, { Icon: LucideIcon; tone: string }> = {
  valid: { Icon: Check, tone: 'bg-[#EDE9FE] text-[#5B21B6]' },
  used: { Icon: Check, tone: 'bg-[#F4F3F8] text-[#6B6380]' },
  expired: { Icon: Clock, tone: 'bg-[#F4F3F8] text-[#6B6380]' },
  otherDay: { Icon: CalendarX, tone: 'bg-[#FEF3C7] text-[#B45309]' },
  cancelled: { Icon: Ban, tone: 'bg-[#FEE2E2] text-[#B91C1C]' },
  invalid: { Icon: CircleAlert, tone: 'bg-[#FEE2E2] text-[#B91C1C]' },
};

type View = { kind: 'loading' } | { kind: 'error' } | { kind: 'result'; result: TicketResult };

export const TicketCheckPage: React.FC<{ token: string }> = ({ token }) => {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [using, setUsing] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    verifyTicket(token)
      .then((result) => setView({ kind: 'result', result }))
      .catch(() => setView({ kind: 'error' }));
  }, [token]);

  useEffect(load, [load]);

  const handleUse = async () => {
    setConfirming(false);
    setNotice('');
    setUsing(true);
    try {
      setView({ kind: 'result', result: await useTicket(token) });
    } catch (err) {
      // 応答が届かなかったかもしれない。状態を取り直す(乗車済みになっていれば、そう出る)
      try {
        const result = await verifyTicket(token);
        setView({ kind: 'result', result });
        if (result.state === 'valid') setNotice(err instanceof Error ? err.message : '通信できませんでした');
      } catch {
        setView({ kind: 'error' });
      }
    } finally {
      setUsing(false);
    }
  };

  const result = view.kind === 'result' ? view.result : null;
  const style = result ? STATE_STYLE[result.state] : null;
  const info = result?.ticket;

  return (
    <div className="min-h-screen w-full bg-[#F4F3F8] text-[#221C35] font-sans antialiased flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E5E2EE] shadow-2xl p-6 text-center">
        {view.kind === 'loading' && <div className="py-16 text-xs text-[#857D99]">確認しています…</div>}

        {view.kind === 'error' && (
          <div className="py-10">
            <p className="text-sm font-bold text-[#221C35]">通信できませんでした</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm px-6 py-3 rounded-xl cursor-pointer transition-colors"
            >
              もう一度
            </button>
          </div>
        )}

        {result && style && (
          <>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${style.tone}`}>
              <style.Icon className="w-7 h-7" strokeWidth={3} />
            </div>
            <h1 className="text-xl font-black text-[#221C35] mt-3">{TICKET_STATE_LABEL[result.state]}</h1>
            {result.state === 'used' && result.usedAt && <p className="text-sm font-bold text-[#857D99] mt-1">{result.usedAt}</p>}

            {info && (
              <div className="mt-4 bg-[#F9F8FD] border border-[#E6E2EE] rounded-2xl px-3.5 py-1 text-left">
                {[
                  { label: '列車', value: `${info.trainName} ${info.departureTime || '—'}発` },
                  { label: '区間', value: `${info.boardingStation || '—'} → ${info.destinationStation || '—'}` },
                  { label: '座席', value: `${info.carNo}号車 ${getSeatClassLabel(info.seatType as SeatClass)} ${info.seatNo}` },
                  ...(result.state !== 'valid' ? [{ label: '日付', value: info.reservedDate }] : []),
                ].map((r) => (
                  <div key={r.label} className="flex justify-between gap-3 py-2.5 border-b border-[#EFEDF5] last:border-b-0 text-[13px]">
                    <span className="text-[#857D99] shrink-0">{r.label}</span>
                    <span className="font-bold text-[#221C35] text-right min-w-0 break-words">{r.value}</span>
                  </div>
                ))}
              </div>
            )}

            {notice && <p className="mt-3 text-xs font-bold text-[#B91C1C]">{notice}</p>}

            {result.state === 'valid' && (
              <button
                type="button"
                disabled={using}
                onClick={() => setConfirming(true)}
                className="w-full mt-4 bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors"
              >
                {using ? '処理しています…' : '利用する'}
              </button>
            )}
          </>
        )}

        <p className="mt-5 text-[11px] text-[#857D99] leading-relaxed">※架空の鉄道を題材にしたフィクションです。</p>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="利用の確認">
          <div className="w-full max-w-xs bg-white rounded-3xl border border-[#E5E2EE] shadow-2xl p-6 text-center">
            <h2 className="text-lg font-black text-[#221C35]">利用しますか?</h2>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 bg-[#F4F3F8] hover:bg-[#EDEAF4] text-[#6B6380] font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors"
              >
                やめる
              </button>
              <button
                type="button"
                onClick={handleUse}
                className="flex-1 bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors"
              >
                利用する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketCheckPage;
