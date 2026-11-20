import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { callGas } from '../utils/accountApi';
import { getAdminToken } from '../utils/disruptionManager';
import { uploadNoticeImage, UploadCall } from '../utils/noticeImage';
import { Notice, NOTICE_BODY_MAX, NOTICE_IMAGE_MAX, NOTICE_KIND_LABEL, NOTICE_KINDS, NOTICE_TITLE_MAX, NOTICE_URL_MAX, NoticeKind, noticeImages, safeHttpsUrl } from '../utils/notices';
import { NoticeImageViewer } from './NoticeImageViewer';

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
// imageUrl: 欄に書いたままの、まだ足していないアドレス(あれば、確かめる)。imageUrls: 付ける画像
export const validateNoticeForm = (f: { title: string; body: string; imageUrl?: string; imageUrls?: string[]; linkUrl: string; publishAt: string }): string | null => {
  if (!f.title.trim()) return '題名を入れてください。';
  if (f.title.length > NOTICE_TITLE_MAX) return `題名は ${NOTICE_TITLE_MAX} 文字までです。`;
  if (f.body.length > NOTICE_BODY_MAX) return `本文は ${NOTICE_BODY_MAX} 文字までです。`;
  if (f.imageUrl && f.imageUrl.trim() && safeHttpsUrl(f.imageUrl) === null) return `画像のアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`;
  const urls = f.imageUrls ?? [];
  if (urls.length > NOTICE_IMAGE_MAX) return `画像は ${NOTICE_IMAGE_MAX} 枚までです。`;
  if (urls.some((u) => safeHttpsUrl(u) === null)) return `画像のアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`;
  if (new Set(urls).size !== urls.length) return '同じ画像が、2枚あります。';
  if (f.linkUrl.trim() && safeHttpsUrl(f.linkUrl) === null) return `リンクのアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`;
  if (!Number.isFinite(new Date(f.publishAt).getTime())) return '公開する日時を入れてください。';
  return null;
};

const inputClass = 'w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400';

export interface EditorImage {
  url: string;
  id?: string;
  fresh: boolean;
}

// 保存せずに外れる画像(今回、新しく選んだもの)を、ゴミ箱へ。できなかった分は、残る(Drive の通知画像フォルダに、使われないまま残るだけ)
export const trashFreshImages = async (images: EditorImage[], call: Call): Promise<boolean> => {
  let ok = true;
  for (const im of images) {
    if (!im.fresh || !im.id) continue;
    try {
      const res = await call('adminDeleteNoticeImage', { adminToken: getAdminToken(), id: im.id });
      if (res.status !== 'success') ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
};

export const AdminNoticeEditor: React.FC<{ call?: Call }> = ({ call = (a, p) => callGas(a, p) as Promise<GasLike> }) => {
  const [uploading, setUploading] = useState(false);
  const [list, setList] = useState<Notice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [kind, setKind] = useState<NoticeKind>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // 付ける画像。fresh = 今回の編集で、新しく選んだ(まだ保存していない)もの。id は、その画像の保存先の番号(×で、すぐ、ゴミ箱に入れるのに使う)
  const [images, setImages] = useState<EditorImage[]>([]);
  const [imageUrl, setImageUrl] = useState(''); // 手で貼る、まだ足していないアドレス
  const [viewer, setViewer] = useState<number | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [publishAt, setPublishAt] = useState(() => toLocalInput(Date.now()));
  const [confirmDeleteId, setConfirmDeleteId] = useState('');

  const callRef = useRef(call);
  callRef.current = call;
  const imagesRef = useRef<EditorImage[]>([]);
  imagesRef.current = images;

  // 新しく選んだまま、保存せずに離れる(やめる・別の通知を開く・閉じる)ときは、その画像を、ゴミ箱へ(できる範囲で)
  const discardFresh = () => {
    const fresh = imagesRef.current.filter((im) => im.fresh && im.id);
    if (fresh.length > 0) void trashFreshImages(fresh, callRef.current);
  };
  useEffect(() => () => discardFresh(), []);

  const resetForm = (discard = true) => {
    if (discard) discardFresh();
    setImages([]);
    setImageUrl('');
    setViewer(null);
    setEditingId('');
    setKind('normal');
    setTitle('');
    setBody('');
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
    // 欄に書いたままのアドレスがあれば、1枚として足して送る(足し忘れで、消えないように)
    const typed = imageUrl.trim();
    const urls = images.map((im) => im.url);
    const allUrls = typed && safeHttpsUrl(typed) !== null && !urls.includes(typed) && urls.length < NOTICE_IMAGE_MAX ? [...urls, typed] : urls;
    const problem = validateNoticeForm({ title, body, imageUrl: typed && safeHttpsUrl(typed) === null ? typed : '', imageUrls: allUrls, linkUrl, publishAt });
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminSaveNotice', {
        adminToken: getAdminToken(),
        notice: { id: editingId, kind, title: title.trim(), body, imageUrls: allUrls, linkUrl: linkUrl.trim(), publishAt: new Date(publishAt).getTime() },
      });
      if (res.status === 'success') {
        resetForm(false); // 保存できたので、新しく選んだ画像も、使われる(ゴミ箱に入れない)
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
    discardFresh(); // 前の編集で、新しく選んで、まだ保存していない画像は、ゴミ箱へ
    setImages(noticeImages(n).map((url) => ({ url, fresh: false })));
    setImageUrl('');
    setViewer(null);
    setEditingId(n.id);
    setKind(n.kind);
    setTitle(n.title);
    setBody(n.body);
    setLinkUrl(n.linkUrl);
    setPublishAt(toLocalInput(n.publishAt));
    setMessage(null);
  };

  // 画像を選ぶ: 画面の中で縮めて、サーバーに送る。返ってきたアドレスを、欄に入れる
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || images.length >= NOTICE_IMAGE_MAX) return; // 4枚のときは、送らない(使われない画像を、増やさない)
    setUploading(true);
    setMessage(null);
    const res = await uploadNoticeImage(file, { call: call as UploadCall });
    setUploading(false);
    if (res.ok) setImages((prev) => (prev.length >= NOTICE_IMAGE_MAX || prev.some((im) => im.url === res.url) ? prev : [...prev, { url: res.url, id: res.id, fresh: true }]));
    else setMessage((res as { message: string }).message);
  };

  // 手で貼ったアドレスを、1枚として足す(重複・4枚を超える分は、足さない)
  const addTyped = () => {
    const u = safeHttpsUrl(imageUrl);
    if (!u) {
      setMessage(`画像のアドレスは、https:// で始まる ${NOTICE_URL_MAX} 文字までです。`);
      return;
    }
    setMessage(null);
    setImages((prev) => (prev.length >= NOTICE_IMAGE_MAX || prev.some((im) => im.url === u) ? prev : [...prev, { url: u, fresh: false }]));
    setImageUrl('');
  };

  // ×: その1枚だけ外す。今回、新しく選んだものは、すぐ、ゴミ箱へ。保存ずみのものは、画面から外すだけ(保存で、サーバーが、ゴミ箱へ)
  const removeImage = (i: number) => {
    const im = images[i];
    if (!im) return;
    setImages((prev) => prev.filter((_, k) => k !== i));
    setViewer(null);
    if (im.fresh && im.id) {
      void trashFreshImages([im], call).then((ok) => {
        if (!ok) setMessage('画像を、ゴミ箱に入れられませんでした。');
      });
    }
  };

  const full = images.length >= NOTICE_IMAGE_MAX;
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
          <div className="flex items-center gap-2">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={NOTICE_URL_MAX} inputMode="url" className={inputClass} />
            <button
              type="button"
              onClick={addTyped}
              disabled={full || !imageUrl.trim()}
              className="shrink-0 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              足す
            </button>
          </div>
        </label>
        <div className="flex items-center gap-2">
          <label className={`px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold ${uploading || full ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            {uploading ? '送っています…' : '画像を選ぶ'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={uploading || full} onChange={pickImage} />
          </label>
        </div>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((im, i) => (
              <div key={im.url} className="relative">
                <button type="button" onClick={() => setViewer(i)} aria-label="画像を大きく見る" className="block cursor-zoom-in">
                  <img src={im.url} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded border border-slate-700 object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label="この画像を外す"
                  className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-slate-900 border border-slate-600 text-slate-200 hover:bg-rose-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
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
            <button type="button" onClick={() => resetForm()} className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer">
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
      {viewer !== null && images.length > 0 && <NoticeImageViewer urls={images.map((im) => im.url)} startIndex={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
};
