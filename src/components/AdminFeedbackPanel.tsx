import React, { useCallback, useEffect, useState } from 'react';
import { callGas } from '../utils/accountApi';
import { getAdminToken } from '../utils/disruptionManager';

// 管理者コンソールの「ご意見」: 一覧・返信(LINE)・状態。サーバー(GAS)が、管理トークンを確かめる。LINE のIDは、返ってこない(「返信先あり」の印だけ)
export interface FeedbackRow {
  id: string;
  receivedAt: string;
  entry: string; // app / form
  screen: string;
  kind: string;
  message: string;
  wantReply: boolean;
  codeState: string;
  canReply: boolean;
  env: string;
  status: string; // 未対応 / 対応済
  repliedAt: string;
}
type GasLike = { status?: string; message?: string; feedback?: unknown };
type Call = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;

export const FEEDBACK_REPLY_MAX = 1000;
const NOT_DEPLOYED = 'サーバーが、ご意見に対応していません。';

export const normalizeFeedbackRows = (raw: unknown): FeedbackRow[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
    .map((r) => ({
      id: String(r.id),
      receivedAt: String(r.receivedAt ?? ''),
      entry: String(r.entry ?? ''),
      screen: String(r.screen ?? ''),
      kind: String(r.kind ?? ''),
      message: String(r.message ?? ''),
      wantReply: r.wantReply === true,
      codeState: String(r.codeState ?? ''),
      canReply: r.canReply === true,
      env: String(r.env ?? ''),
      status: String(r.status ?? ''),
      repliedAt: String(r.repliedAt ?? ''),
    }));
};

// 描きなおしのたびに別の関数にならないよう、外に1つだけ置く(中に書くと、一覧の読み込みが、止まらなくなる)
const defaultCall: Call = (a, p) => callGas(a, p) as Promise<GasLike>;

export const AdminFeedbackPanel: React.FC<{ call?: Call }> = ({ call = defaultCall }) => {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await call('adminListFeedback', { adminToken: getAdminToken() });
      if (res.status === 'success') {
        setRows(normalizeFeedbackRows(res.feedback));
        return;
      }
      setMessage(res.status === 'ignored' ? NOT_DEPLOYED : res.message || '一覧を読めませんでした。');
    } catch {
      setMessage('通信に失敗しました。');
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: string, payload: Record<string, unknown>, onOk?: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await call(action, { adminToken: getAdminToken(), ...payload });
      if (res.status === 'success') {
        onOk?.();
        await load();
      } else {
        // サーバーの文を、そのまま出す
        setMessage(res.status === 'ignored' ? NOT_DEPLOYED : res.message || '処理できませんでした。');
      }
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const reply = (r: FeedbackRow) => {
    const text = (replyText[r.id] ?? '').trim();
    if (!text) {
      setMessage('返信の文を入れてください。');
      return;
    }
    void act('adminReplyFeedback', { id: r.id, text }, () => setReplyText((t) => ({ ...t, [r.id]: '' })));
  };

  return (
    <div className="space-y-2.5 text-slate-200">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-slate-400">ご意見({rows.length})</div>
        <button type="button" onClick={() => void load()} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
          読み直す
        </button>
      </div>
      {message && (
        <div role="status" className="text-[11px] text-amber-300">
          {message}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-[11px] text-slate-500 py-3">まだありません</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <span className="font-mono text-slate-400">{r.receivedAt}</span>
              <span className="px-1.5 py-0.5 rounded font-bold bg-slate-700 text-slate-300">{r.entry}</span>
              <span className="px-1.5 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-300">{r.screen}</span>
              <span className="px-1.5 py-0.5 rounded font-bold bg-slate-700 text-slate-300">{r.kind}</span>
              <span className={`px-1.5 py-0.5 rounded font-bold ${r.status === '対応済' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{r.status}</span>
              {r.canReply && <span className="px-1.5 py-0.5 rounded font-bold bg-sky-500/20 text-sky-300">返信先あり</span>}
            </div>
            <div className="text-xs text-slate-100 whitespace-pre-wrap break-words">{r.message}</div>
            {r.env && (
              <details>
                <summary className="cursor-pointer text-[10px] font-bold text-slate-400">利用環境</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-400 font-mono">{r.env}</pre>
              </details>
            )}
            {r.repliedAt && <div className="text-[10px] text-slate-500">返信: {r.repliedAt}</div>}
            {r.canReply && (
              <div className="space-y-1">
                <textarea
                  value={replyText[r.id] ?? ''}
                  onChange={(e) => setReplyText((t) => ({ ...t, [r.id]: e.target.value.slice(0, FEEDBACK_REPLY_MAX) }))}
                  rows={3}
                  placeholder={`返信の文(${FEEDBACK_REPLY_MAX}文字まで)`}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button type="button" onClick={() => reply(r)} disabled={busy} className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-50">
                  LINEで返信
                </button>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => void act('adminSetFeedbackStatus', { id: r.id, status: r.status === '対応済' ? '未対応' : '対応済' })}
                disabled={busy}
                className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer disabled:opacity-50"
              >
                {r.status === '対応済' ? '未対応に戻す' : '対応済にする'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
