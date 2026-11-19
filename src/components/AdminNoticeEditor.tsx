import React, { useCallback, useEffect, useState } from 'react';
import { callGas } from '../utils/accountApi';
import { getAdminToken } from '../utils/disruptionManager';
import { uploadNoticeImage, UploadCall } from '../utils/noticeImage';
import { Notice, NOTICE_BODY_MAX, NOTICE_KIND_LABEL, NOTICE_KINDS, NOTICE_TITLE_MAX, NOTICE_URL_MAX, NoticeKind, safeHttpsUrl } from '../utils/notices';

// 管理者コンソールの「通知」: 書く・直す・消す。サーバー(GAS)が、管理トークンを確かめる(アプリ側の確認だけに頼らない)
type GasLike = { status?: string; message?: string; notices?: unknown };
type Call = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;

const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const NOT_DEPLOYED = 'サーバーが、通知に対応していません(GAS の再デプロイが必要です)。';

// 入力を確かめる。問題があれば、その文。なければ null
export const validateNoticeForm = (f: { title: string; body: string; imageUrl: string; linkUrl: string; publishAt: string }): string | null => {
  if (!f.title.trim()) return '題名を入れてください。';
  if (f.title.length > NOTICE_TITLE_MAX) return `題名は ${NOTICE_TITLE_MAX} 文字までです。`;
  if (f.body.length > NOTICE_BODY_MAX) return `本文は ${NOTICE_BODY_MAX} 文字までです。`;
  if (f.imageUrl.trim() && safeHttpsUrl(f.imageUrl) === null) return `画像のアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`;
  if (f.linkUrl.trim() && safeHttpsUrl(f.linkUrl) === null) return `リンクのアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`;
  if (!Number.isFinite(new Date(f.publishAt).getTime())) return '公開する日時を入れてください。';
  return null;
};

const inputClass = 'w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400';

export const AdminNoticeEditor: React.FC<{ call?: Call }> = ({ call = (a, p) => callGas(a, p) as Promise<GasLike> }) => {
  const [uploading, setUploading] = useState(false);
  const [list, setList] = useState<Notice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [kind, setKind] = useState<NoticeKind>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [publishAt, setPublishAt] = useState(() => toLocalInput(Date.now()));
  const [confirmDeleteId, setConfirmDeleteId] = useState('');

  const resetForm = () => {
    setEditingId('');
    setKind('normal');
    setTitle('');
    setBody('');
    setImageUrl('');
    setLinkUrl('');
    setPublishAt(toLocalInput(Date.now()));
  };

  const load = useCallback(async () => {
    try {
      const res = await call('adminListNotices', { adminToken: getAdminToken() });
      if (res.status === 'success' && Array.isArray(res.notices)) {
        setList((res.notices as Notice[]).filter((n) => n && typeof n.id === 'string'));
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

  const send = async () => {
    const problem = validateNoticeForm({ title, body, imageUrl, linkUrl, publishAt });
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminSaveNotice', {
        adminToken: getAdminToken(),
        notice: { id: editingId, kind, title: title.trim(), body, imageUrl: imageUrl.trim(), linkUrl: linkUrl.trim(), publishAt: new Date(publishAt).getTime() },
      });
      if (res.status === 'success') {
        resetForm();
        setMessage(editingId ? '直しました。' : '送信しました。');
        await load();
      } else {
        setMessage(res.status === 'ignored' ? NOT_DEPLOYED : res.message || '送信できませんでした。');
      }
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminDeleteNotice', { adminToken: getAdminToken(), id });
      if (res.status === 'success') {
        setConfirmDeleteId('');
        if (editingId === id) resetForm();
        await load();
      } else {
        setMessage(res.status === 'ignored' ? NOT_DEPLOYED : res.message || '消せませんでした。');
      }
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const edit = (n: Notice) => {
    setEditingId(n.id);
    setKind(n.kind);
    setTitle(n.title);
    setBody(n.body);
    setImageUrl(n.imageUrl);
    setLinkUrl(n.linkUrl);
    setPublishAt(toLocalInput(n.publishAt));
    setMessage(null);
  };

  // 画像を選ぶ: 画面の中で縮めて、サーバーに送る。返ってきたアドレスを、欄に入れる
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const res = await uploadNoticeImage(file, { call: call as UploadCall });
    setUploading(false);
    if (res.ok) setImageUrl(res.url);
    else setMessage((res as { message: string }).message);
  };

  const now = Date.now();

  return (
    <div className="space-y-3 text-slate-200">
      <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
        <div className="text-xs font-bold text-slate-100">{editingId ? '通知を直す' : '通知を書く'}</div>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">種類</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as NoticeKind)} className={inputClass}>
            {NOTICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTICE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">題名({title.length}/{NOTICE_TITLE_MAX})</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={NOTICE_TITLE_MAX} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">本文({body.length}/{NOTICE_BODY_MAX})</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={NOTICE_BODY_MAX} rows={5} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">画像のアドレス(https:// から。なくてもよい)</span>
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={NOTICE_URL_MAX} inputMode="url" className={inputClass} />
        </label>
        <div className="flex items-center gap-2">
          <label className={`px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? '送っています…' : '画像を選ぶ'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading} onChange={pickImage} />
          </label>
          {safeHttpsUrl(imageUrl) && <img src={safeHttpsUrl(imageUrl) as string} alt="" referrerPolicy="no-referrer" className="h-12 w-auto max-w-[96px] rounded border border-slate-700 object-cover" />}
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">リンクのアドレス(https:// から。なくてもよい)</span>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={NOTICE_URL_MAX} inputMode="url" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">公開する日時(未来にすると、その時刻まで隠れる)</span>
          <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={inputClass} />
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {editingId ? '直して送信' : '送信'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer">
              やめる
            </button>
          )}
        </div>
        {message && (
          <div role="status" className="text-[11px] text-amber-300">
            {message}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-400">書いた通知({list.length})</div>
        {list.length === 0 ? (
          <div className="text-[11px] text-slate-500 py-3">まだありません</div>
        ) : (
          list.map((n) => (
            <div key={n.id} className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${n.kind === 'important' ? 'bg-rose-500/20 text-rose-300' : n.kind === 'event' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700 text-slate-300'}`}>
                  {NOTICE_KIND_LABEL[n.kind] ?? n.kind}
                </span>
                <span className="text-[10px] font-mono text-slate-400">{toLocalInput(n.publishAt).replace('T', ' ')}</span>
                {n.publishAt > now && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">公開前</span>}
              </div>
              <div className="text-xs font-bold text-slate-100 break-words">{n.title}</div>
              <div className="flex items-center gap-2 pt-0.5">
                <button type="button" onClick={() => edit(n)} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
                  直す
                </button>
                {confirmDeleteId === n.id ? (
                  <>
                    <button type="button" onClick={() => remove(n.id)} disabled={busy} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 cursor-pointer disabled:opacity-50">
                      本当に消す
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId('')} className="text-[11px] font-bold text-slate-400 hover:text-slate-200 cursor-pointer">
                      やめる
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(n.id)} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 cursor-pointer">
                    消す
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
