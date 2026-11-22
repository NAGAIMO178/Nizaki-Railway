import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import {
  AnswerInput, AnswerInputs, EndReason, END_TEXT, LoadResult, PublicSurvey, SURVEY_OTHER_ANSWER_MAX, SURVEY_TEXT_ANSWER_MAX, SurveyCall, SurveyQuestion,
  buildAnswers, emptyAnswerInput, fetchSurvey, hasAnswered, markAnswered, submitSurveyAnswers, validateAnswerInputs,
} from '../utils/survey';

// アンケートに答える専用画面(お知らせのリンク ?survey=<アンケートID> から開く)。匿名。名前・メール・会員IDは、送らない
const optionClass = (on: boolean) =>
  `flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] font-bold cursor-pointer ${on ? 'border-[#5B21B6] bg-[#EDE9FE] text-[#5B21B6]' : 'border-[#E6E2EE] bg-white text-[#221C35]'}`;

const primaryButton = 'w-full bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-60 disabled:cursor-wait text-white font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors';

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen w-full bg-[#F4F3F8] text-[#221C35] font-sans antialiased flex items-start justify-center p-4 pc:py-10">
    <div className="w-full max-w-md pc:max-w-xl bg-white rounded-3xl border border-[#E5E2EE] shadow-2xl p-5 pc:p-8">{children}</div>
  </div>
);

// アプリの入口へ(アンケートの画面は、アプリ本体を開かないため)
const BackToApp: React.FC = () => (
  <a href={window.location.pathname} className="mt-5 inline-block text-xs font-bold text-[#5B21B6] underline">
    アプリを開く
  </a>
);

const EndView: React.FC<{ reason: EndReason | 'thanks' }> = ({ reason }) => {
  const done = reason === 'thanks';
  const text = done ? { title: 'ありがとうございました', body: '回答を受け付けました。' } : END_TEXT[reason];
  return (
    <div className="py-10 text-center">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${done ? 'bg-[#EDE9FE] text-[#5B21B6]' : 'bg-[#F4F3F8] text-[#6B6380]'}`}>
        <Check className="w-7 h-7" strokeWidth={3} />
      </div>
      <h1 className="text-xl font-black mt-3">{text.title}</h1>
      <p className="text-[13px] text-[#6B6380] mt-2 leading-relaxed">{text.body}</p>
      <BackToApp />
    </div>
  );
};

const QuestionInput: React.FC<{ q: SurveyQuestion; value: AnswerInput; onChange: (v: AnswerInput) => void; disabled: boolean }> = ({ q, value, onChange, disabled }) => {
  const set = (patch: Partial<AnswerInput>) => onChange({ ...value, ...patch });
  if (q.type === 'single' || q.type === 'singleOther') {
    return (
      <div role="radiogroup" aria-label={q.text} className="space-y-2">
        {(q.options ?? []).map((o) => {
          const on = !value.otherOn && value.choice === o;
          return (
            <label key={o} className={optionClass(on)}>
              <input type="radio" name={q.id} checked={on} disabled={disabled} onChange={() => set({ choice: o, otherOn: false })} className="accent-[#5B21B6] w-4 h-4 shrink-0" />
              <span className="min-w-0 break-words">{o}</span>
            </label>
          );
        })}
        {q.type === 'singleOther' && (
          <>
            <label className={optionClass(value.otherOn)}>
              <input type="radio" name={q.id} checked={value.otherOn} disabled={disabled} onChange={() => set({ otherOn: true, choice: '' })} className="accent-[#5B21B6] w-4 h-4 shrink-0" />
              <span>その他</span>
            </label>
            {value.otherOn && (
              <input
                type="text"
                value={value.other}
                disabled={disabled}
                maxLength={SURVEY_OTHER_ANSWER_MAX}
                onChange={(e) => set({ other: e.target.value })}
                aria-label="その他の内容"
                className="w-full rounded-xl border border-[#E6E2EE] bg-white px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#5B21B6]"
              />
            )}
          </>
        )}
      </div>
    );
  }
  if (q.type === 'multi') {
    return (
      <div role="group" aria-label={q.text} className="space-y-2">
        {(q.options ?? []).map((o) => {
          const on = value.choices.includes(o);
          return (
            <label key={o} className={optionClass(on)}>
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => set({ choices: on ? value.choices.filter((c) => c !== o) : [...value.choices, o] })}
                className="accent-[#5B21B6] w-4 h-4 shrink-0"
              />
              <span className="min-w-0 break-words">{o}</span>
            </label>
          );
        })}
      </div>
    );
  }
  if (q.type === 'scale5') {
    return (
      <div role="radiogroup" aria-label={q.text} className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value.scale === n;
          return (
            <label key={n} className={`${optionClass(on)} justify-center !px-0 !py-3 text-base`}>
              <input type="radio" name={q.id} checked={on} disabled={disabled} onChange={() => set({ scale: n })} className="sr-only" />
              <span>{n}</span>
            </label>
          );
        })}
      </div>
    );
  }
  return (
    <div>
      <textarea
        value={value.text}
        disabled={disabled}
        maxLength={SURVEY_TEXT_ANSWER_MAX}
        rows={4}
        onChange={(e) => set({ text: e.target.value })}
        aria-label={q.text}
        className="w-full rounded-xl border border-[#E6E2EE] bg-white px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#5B21B6]"
      />
      <div className="text-right text-[11px] text-[#857D99]">
        {value.text.length}/{SURVEY_TEXT_ANSWER_MAX}
      </div>
    </div>
  );
};

type View = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'end'; reason: EndReason | 'thanks' } | { kind: 'form'; survey: PublicSurvey };

export const SurveyPage: React.FC<{ surveyId: string; call?: SurveyCall }> = ({ surveyId, call }) => {
  const [view, setView] = useState<View>(() => (hasAnswered(surveyId) ? { kind: 'end', reason: 'already_answered' } : { kind: 'loading' }));
  const [inputs, setInputs] = useState<AnswerInputs>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<{ index: number; message: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const questionRefs = useRef<(HTMLElement | null)[]>([]);
  const sendingRef = useRef(false);

  const load = useCallback(() => {
    setView({ kind: 'loading' });
    void fetchSurvey(surveyId, call).then((r: LoadResult) => {
      if (r.kind === 'ok') setView({ kind: 'form', survey: r.survey });
      else if (r.kind === 'end') setView({ kind: 'end', reason: r.reason });
      else setView({ kind: 'error', message: r.message });
    });
  }, [surveyId, call]);

  useEffect(() => {
    if (!hasAnswered(surveyId)) load();
  }, [surveyId, load]);

  const submit = async (survey: PublicSurvey) => {
    if (sendingRef.current) return;
    const bad = validateAnswerInputs(survey.questions, inputs);
    setFailure(null);
    setProblem(bad);
    if (bad) {
      questionRefs.current[bad.index]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    const res = await submitSurveyAnswers(surveyId, buildAnswers(survey.questions, inputs), call);
    sendingRef.current = false;
    setSending(false);
    if (res.kind === 'done') {
      markAnswered(surveyId);
      setView({ kind: 'end', reason: 'thanks' });
    } else if (res.kind === 'end') {
      if (res.reason === 'already_answered') markAnswered(surveyId);
      setView({ kind: 'end', reason: res.reason });
    } else {
      setFailure(res.message);
    }
  };

  return (
    <Frame>
      {view.kind === 'loading' && <div className="py-16 text-center text-xs text-[#857D99]">読み込んでいます…</div>}

      {view.kind === 'error' && (
        <div className="py-10 text-center">
          <p className="text-sm font-bold">{view.message}</p>
          <button type="button" onClick={load} className="mt-4 bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm px-6 py-3 rounded-xl cursor-pointer transition-colors">
            もう一度
          </button>
        </div>
      )}

      {view.kind === 'end' && <EndView reason={view.reason} />}

      {view.kind === 'form' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(view.survey);
          }}
        >
          <h1 className="text-lg font-black leading-snug break-words">{view.survey.title}</h1>
          {view.survey.description && <p className="mt-2 text-[13px] text-[#6B6380] leading-relaxed whitespace-pre-wrap break-words">{view.survey.description}</p>}
          <p className="mt-2 text-[11px] text-[#857D99]">回答は、匿名です。</p>

          <div className="mt-4 space-y-5">
            {view.survey.questions.map((q, i) => (
              <section
                key={q.id}
                ref={(el) => {
                  questionRefs.current[i] = el;
                }}
                aria-labelledby={`sq-${q.id}`}
                className={`rounded-2xl border p-3.5 ${problem?.index === i ? 'border-[#B91C1C] bg-[#FEF2F2]' : 'border-[#E6E2EE] bg-[#F9F8FD]'}`}
              >
                <div className="flex items-start gap-2 mb-2.5">
                  <span className="shrink-0 text-xs font-black text-[#5B21B6] pt-0.5">Q{i + 1}</span>
                  <h2 id={`sq-${q.id}`} className="text-[13px] font-black leading-snug break-words min-w-0 flex-1">
                    {q.text}
                  </h2>
                  {q.required && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-[#FEE2E2] text-[#B91C1C]">必須</span>}
                </div>
                {q.type === 'multi' && <p className="text-[11px] text-[#857D99] mb-2">いくつでも選べます</p>}
                <QuestionInput q={q} value={inputs[q.id] ?? emptyAnswerInput()} onChange={(v) => setInputs((prev) => ({ ...prev, [q.id]: v }))} disabled={sending} />
                {problem?.index === i && (
                  <p role="alert" className="mt-2 text-xs font-bold text-[#B91C1C]">
                    {problem.message}
                  </p>
                )}
              </section>
            ))}
          </div>

          {failure && (
            <p role="alert" className="mt-4 flex items-start gap-1.5 text-xs font-bold text-[#B91C1C]">
              <CircleAlert className="w-4 h-4 shrink-0" />
              <span>{failure}</span>
            </p>
          )}

          <button type="submit" disabled={sending} className={`${primaryButton} mt-5`}>
            {sending ? '送っています…' : '送信'}
          </button>
        </form>
      )}
    </Frame>
  );
};

export default SurveyPage;
