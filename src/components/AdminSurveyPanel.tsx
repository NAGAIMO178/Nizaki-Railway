import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Check, Plus, X } from 'lucide-react';
import { callGas } from '../utils/accountApi';
import { getAdminToken } from '../utils/disruptionManager';
import {
  AdminSurvey, DraftQuestion, QuestionResult, SURVEY_DESCRIPTION_MAX, SURVEY_OPTION_MAX, SURVEY_OPTION_MIN, SURVEY_OPTION_TEXT_MAX, SURVEY_QUESTION_MAX, SURVEY_QUESTION_TEXT_MAX,
  SURVEY_TITLE_MAX, SURVEY_TYPES, SURVEY_TYPES_WITH_OPTIONS, SURVEY_TYPE_LABEL, SurveyCall, SurveyDraft, SurveyResults, SurveyType,
  buildSurveyUrl, draftFromSurvey, draftToPayload, emptyDraft, newDraftQuestion, normalizeAdminSurveys, normalizeResults, optionLines, percentOf, validateSurveyDraft,
} from '../utils/survey';

// 管理者コンソールの「アンケート」: 作る・直す・受付の開始と終了・消す・結果を見る。サーバー(GAS)が、管理トークンを確かめる
const NOT_DEPLOYED = 'サーバーが、アンケートに対応していません(GAS の再デプロイが必要です)。';
const inputClass = 'w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400';
const smallButton = 'px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

// リンクを、クリップボードへ。できなければ false
const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// お知らせに貼る用のリンクを、コピーするボタン
const CopyLinkButton: React.FC<{ id: string }> = ({ id }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const url = buildSurveyUrl(id);
  const onClick = async () => {
    setState((await copyText(url)) ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  };
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => void onClick()} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
        {state === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{state === 'copied' ? 'コピーしました' : 'お知らせに貼る用のリンクをコピー'}</span>
      </button>
      {state === 'failed' && (
        <div role="status" className="text-[11px] text-amber-300 break-all select-all">
          コピーできませんでした。次のリンクを、手でコピーしてください: {url}
        </div>
      )}
    </div>
  );
};

const Bar: React.FC<{ label: string; count: number; total: number }> = ({ label, count, total }) => {
  const pct = percentOf(count, total);
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-slate-200 break-words min-w-0">{label}</span>
        <span className="shrink-0 font-mono text-slate-400">
          {count}件({pct}%)
        </span>
      </div>
      <div className="h-1.5 rounded bg-slate-900 overflow-hidden">
        <div className="h-full bg-sky-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// 自由記述などの文は、React が、そのまま文字として出す(HTML として読まない)
const TextList: React.FC<{ title: string; items: string[] }> = ({ title, items }) =>
  items.length === 0 ? null : (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-slate-400">{title}</div>
      <ul className="space-y-1 max-h-60 overflow-y-auto">
        {items.map((t, i) => (
          <li key={i} className="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 whitespace-pre-wrap break-words">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );

const ResultBlock: React.FC<{ r: QuestionResult; index: number }> = ({ r, index }) => (
  <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
    <div className="text-xs font-bold text-slate-100 break-words">
      Q{index + 1}. {r.text}
    </div>
    <div className="text-[10px] text-slate-400">
      {SURVEY_TYPE_LABEL[r.type]} / 回答 {r.answered}件
    </div>
    {(r.type === 'single' || r.type === 'multi' || r.type === 'singleOther') && (
      <div className="space-y-1.5">
        {r.options.map((o) => (
          <Bar key={o.option} label={o.option} count={o.count} total={r.answered} />
        ))}
        {r.type === 'singleOther' && <Bar label="その他" count={r.otherCount} total={r.answered} />}
      </div>
    )}
    {r.type === 'scale5' && (
      <div className="space-y-1.5">
        {r.counts.map((c, i) => (
          <Bar key={i} label={String(i + 1)} count={c} total={r.answered} />
        ))}
        <div className="text-[11px] text-slate-300">平均 {r.average === null ? '—' : r.average.toFixed(2)}</div>
      </div>
    )}
    {r.type === 'singleOther' && <TextList title="「その他」の内容" items={r.others} />}
    {r.type === 'text' && <TextList title="記述" items={r.texts} />}
  </div>
);

const QuestionEditor: React.FC<{
  q: DraftQuestion;
  index: number;
  total: number;
  locked: boolean;
  onChange: (q: DraftQuestion) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}> = ({ q, index, total, locked, onChange, onMove, onRemove }) => {
  const hasOptions = SURVEY_TYPES_WITH_OPTIONS.includes(q.type);
  const lines = optionLines(q.optionsText).length;
  return (
    <div className="p-2.5 bg-slate-900/60 rounded-md border border-slate-700 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-300">{index + 1}問目</span>
        {!locked && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="1つ上へ" className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowUp className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="1つ下へ" className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowDown className="w-3 h-3" />
            </button>
            <button type="button" onClick={onRemove} disabled={total <= 1} aria-label="この質問を消す" className="p-1 rounded bg-slate-700 hover:bg-rose-600 text-slate-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-400">型</span>
        <select value={q.type} disabled={locked} onChange={(e) => onChange({ ...q, type: e.target.value as SurveyType })} className={`${inputClass} disabled:opacity-60`}>
          {SURVEY_TYPES.map((t) => (
            <option key={t} value={t}>
              {SURVEY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-400">
          質問の文({q.text.length}/{SURVEY_QUESTION_TEXT_MAX})
        </span>
        <input value={q.text} disabled={locked} maxLength={SURVEY_QUESTION_TEXT_MAX} onChange={(e) => onChange({ ...q, text: e.target.value })} className={`${inputClass} disabled:opacity-60`} />
      </label>
      {hasOptions && (
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">
            選択肢(1行に1つ・{SURVEY_OPTION_MIN}〜{SURVEY_OPTION_MAX}個・{SURVEY_OPTION_TEXT_MAX}文字まで。いま{lines}個)
          </span>
          <textarea value={q.optionsText} disabled={locked} rows={4} onChange={(e) => onChange({ ...q, optionsText: e.target.value })} className={`${inputClass} disabled:opacity-60`} />
        </label>
      )}
      <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
        <input type="checkbox" checked={q.required} disabled={locked} onChange={(e) => onChange({ ...q, required: e.target.checked })} />
        <span>必須</span>
      </label>
    </div>
  );
};

// 描きなおしのたびに別の関数にならないよう、外に1つだけ置く(中に書くと、一覧の読み込みが、止まらなくなる)
const defaultCall: SurveyCall = (a, p) => callGas(a, p) as ReturnType<SurveyCall>;

export const AdminSurveyPanel: React.FC<{ call?: SurveyCall }> = ({ call = defaultCall }) => {
  const [list, setList] = useState<AdminSurvey[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<SurveyDraft | null>(null);
  const [editingCount, setEditingCount] = useState(0); // 編集中のアンケートの回答数(1件でもあれば、質問は変えられない)
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await call('adminListSurveys', { adminToken: getAdminToken() });
      if (res.status === 'success') {
        setList(normalizeAdminSurveys(res.surveys));
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

  // サーバーの断りの文は、そのまま出す
  const failText = (res: { status?: string; message?: string }, fallback: string) => (res.status === 'ignored' ? NOT_DEPLOYED : res.message || fallback);

  const save = async () => {
    if (!draft) return;
    const problem = validateSurveyDraft(draft);
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminSaveSurvey', { adminToken: getAdminToken(), survey: draftToPayload(draft) });
      if (res.status === 'success') {
        setMessage(draft.id ? '直しました。' : '作りました。');
        setDraft(null);
        await load();
      } else {
        setMessage(failText(res, '保存できませんでした。'));
      }
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  // 受付の開始・終了(いまの定義のまま、状態だけ変える)
  const setStatus = async (sv: AdminSurvey, status: 'open' | 'closed') => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminSaveSurvey', { adminToken: getAdminToken(), survey: { id: sv.id, title: sv.title, description: sv.description, status, questions: sv.questions } });
      if (res.status === 'success') await load();
      else setMessage(failText(res, '切り替えられませんでした。'));
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
      const res = await call('adminDeleteSurvey', { adminToken: getAdminToken(), id });
      if (res.status === 'success') {
        setConfirmDeleteId('');
        if (draft?.id === id) setDraft(null);
        await load();
      } else {
        setMessage(failText(res, '消せませんでした。'));
      }
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const showResults = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await call('adminSurveyResults', { adminToken: getAdminToken(), surveyId: id });
      const parsed = res.status === 'success' ? normalizeResults(res) : null;
      if (parsed) setResults(parsed);
      else setMessage(res.status === 'success' ? '結果を読めませんでした。' : failText(res, '結果を読めませんでした。'));
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    setDraft(emptyDraft());
    setEditingCount(0);
    setResults(null);
    setMessage(null);
  };

  const edit = (sv: AdminSurvey) => {
    setDraft(draftFromSurvey(sv));
    setEditingCount(sv.responseCount);
    setResults(null);
    setMessage(null);
  };

  const updateQuestion = (i: number, q: DraftQuestion) => setDraft((d) => (d ? { ...d, questions: d.questions.map((x, k) => (k === i ? q : x)) } : d));
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.questions.length) return d;
      const qs = [...d.questions];
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...d, questions: qs };
    });

  const locked = editingCount > 0; // 回答が1件でもあると、質問は変えられない(サーバーも断る)

  return (
    <div className="space-y-3 text-slate-200">
      {message && (
        <div role="status" className="text-[11px] text-amber-300">
          {message}
        </div>
      )}

      {draft ? (
        <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          <div className="text-xs font-bold text-slate-100">{draft.id ? 'アンケートを直す' : 'アンケートを作る'}</div>
          {locked && <div className="text-[11px] text-amber-300">回答が{editingCount}件あるため、質問は変えられません(題名・説明・受付は、変えられます)。</div>}
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">
              題名({draft.title.length}/{SURVEY_TITLE_MAX})
            </span>
            <input value={draft.title} maxLength={SURVEY_TITLE_MAX} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">
              説明({draft.description.length}/{SURVEY_DESCRIPTION_MAX}。なくてもよい)
            </span>
            <textarea value={draft.description} maxLength={SURVEY_DESCRIPTION_MAX} rows={3} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">受付</span>
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value === 'closed' ? 'closed' : 'open' })} className={inputClass}>
              <option value="open">受付中</option>
              <option value="closed">終了</option>
            </select>
          </label>
          {draft.questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={i}
              total={draft.questions.length}
              locked={locked}
              onChange={(nq) => updateQuestion(i, nq)}
              onMove={(dir) => moveQuestion(i, dir)}
              onRemove={() => setDraft({ ...draft, questions: draft.questions.filter((_, k) => k !== i) })}
            />
          ))}
          {!locked && (
            <button
              type="button"
              onClick={() => setDraft({ ...draft, questions: [...draft.questions, newDraftQuestion(draft.questions)] })}
              disabled={draft.questions.length >= SURVEY_QUESTION_MAX}
              className={`${smallButton} inline-flex items-center gap-1`}
            >
              <Plus className="w-3 h-3" />
              <span>質問を足す({draft.questions.length}/{SURVEY_QUESTION_MAX})</span>
            </button>
          )}
          {draft.id && <CopyLinkButton id={draft.id} />}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => void save()} disabled={busy} className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-50">
              {draft.id ? '直して保存' : '作る'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className={smallButton}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startNew} className={`${smallButton} inline-flex items-center gap-1`}>
          <Plus className="w-3 h-3" />
          <span>アンケートを作る</span>
        </button>
      )}

      {results && (
        <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-100 break-words">{results.title}</div>
              <div className="text-[11px] text-slate-400">回答 {results.responseCount}件</div>
            </div>
            <button type="button" onClick={() => setResults(null)} className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-200 cursor-pointer">
              閉じる
            </button>
          </div>
          {results.results.map((r, i) => (
            <ResultBlock key={r.id} r={r} index={i} />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold text-slate-400">アンケート({list.length})</div>
          <button type="button" onClick={() => void load()} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
            読み直す
          </button>
        </div>
        {list.length === 0 ? (
          <div className="text-[11px] text-slate-500 py-3">まだありません</div>
        ) : (
          list.map((sv) => (
            <div key={sv.id} className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sv.status === 'open' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{sv.status === 'open' ? '受付中' : '終了'}</span>
                <span className="text-[10px] font-mono text-slate-400">{sv.createdAt}</span>
                <span className="text-[10px] text-slate-400">回答 {sv.responseCount}件</span>
              </div>
              <div className="text-xs font-bold text-slate-100 break-words">{sv.title}</div>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap pt-0.5">
                <button type="button" onClick={() => void showResults(sv.id)} disabled={busy} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer disabled:opacity-50">
                  結果
                </button>
                <button type="button" onClick={() => edit(sv)} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
                  直す
                </button>
                <button type="button" onClick={() => void setStatus(sv, sv.status === 'open' ? 'closed' : 'open')} disabled={busy} className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer disabled:opacity-50">
                  {sv.status === 'open' ? '受付を終える' : '受付を始める'}
                </button>
                {confirmDeleteId === sv.id ? (
                  <>
                    <button type="button" onClick={() => void remove(sv.id)} disabled={busy} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 cursor-pointer disabled:opacity-50">
                      本当に消す
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId('')} className="text-[11px] font-bold text-slate-400 hover:text-slate-200 cursor-pointer">
                      やめる
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(sv.id)} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 cursor-pointer">
                    消す
                  </button>
                )}
              </div>
              <CopyLinkButton id={sv.id} />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
