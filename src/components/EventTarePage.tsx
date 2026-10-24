import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  ACT1,
  ACT2,
  ACT3_BEFORE_RESERVATION,
  ACT3_RESERVED,
  ACT5,
  ACT6,
  CHAT_SPEAKER,
  CLEAR,
  EPILOGUE,
  TARE_BADGE,
  TARE_TITLE,
  UI,
  ScriptLine,
  Speaker,
} from '../data/eventTareScript';
import {
  EVENT_TARE,
  EventOrder,
  EventStore,
  getEventState,
  loadEventData,
  markEventJoined,
  readEventProgress,
  setEventCleared,
} from '../utils/eventTare';
import { EXTRA_CHOICES, VISIBLE_CHOICES, chatReply, commanderUpdates, showsChat } from '../utils/eventTareChat';
import { claimEventTare } from '../utils/eventTareClaim';
import type { ChatChoice } from '../data/eventTareScript';

// 公開記念イベントの画面(公開後だけ。呼ぶ側が isLaunched() の内側で出す)。雅石のミステリーと同じ、暗い背景と琥珀色。
interface EventTarePageProps {
  owner: string; // 会員のメール(小文字)
  sessionToken?: string; // ログイン証のある会員だけ(ごほうびをサーバーに判定してもらう)。無ければ、デモ会員(画面の中だけ)
  store?: EventStore; // デモ会員の保存先
  orders: EventOrder[];
  onClose: () => void;
  onReserve: () => void;
  onDemoReward: (points: number) => void; // デモ会員のごほうび(画面を開いている間だけ)
  onRewarded: () => void; // サーバーでごほうびが付いたあと(残高を読み直す)
}

interface LogItem {
  id: number;
  kind: 'say' | 'nar' | 'me' | 'sys';
  who?: Speaker;
  text: string;
}

const AVATAR: Record<string, string> = { 指令員: '司', 広報: '広', 若手: '若', 店主: '店', 親父: '親' };

const Bubble: React.FC<{ item: Pick<LogItem, 'kind' | 'who' | 'text'> }> = ({ item }) => {
  if (item.kind === 'nar' || item.kind === 'sys') {
    return <div className="self-center rounded-full bg-white/5 px-3 py-1 text-[11px] text-stone-400 text-center font-sans">{item.text}</div>;
  }
  if (item.kind === 'me') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-[13px] leading-relaxed text-amber-100">{item.text}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-[#991B1B] text-amber-100 text-xs font-black flex items-center justify-center font-sans">{AVATAR[item.who ?? ''] ?? '？'}</span>
      <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-amber-600/30 bg-white/[0.07] px-3 py-2 text-[13px] leading-relaxed text-stone-100">
        <span className="block text-[10px] font-bold text-amber-400 font-sans">{item.who}</span>
        {item.text}
      </div>
    </div>
  );
};

const fromScript = (lines: ScriptLine[]): Omit<LogItem, 'id'>[] =>
  lines.map((l) => (l.who === 'ナレーション' ? { kind: 'nar', text: l.text } : l.who === 'あなた' ? { kind: 'me', text: l.text } : { kind: 'say', who: l.who, text: l.text }));

// 1つずつ、タップで進む場面(第5〜6幕と、エピローグ)
const Scene: React.FC<{ lines: ScriptLine[]; onDone: () => void }> = ({ lines, onDone }) => {
  const [n, setN] = useState(1);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [n]);
  const last = n >= lines.length;
  return (
    <>
      <div className="flex-1 space-y-2.5 px-4 py-4">
        {fromScript(lines.slice(0, n)).map((it, i) => (
          <Bubble key={i} item={it} />
        ))}
        <div ref={end} />
      </div>
      <div className="px-4 pb-5 pt-2">
        <button type="button" onClick={() => (last ? onDone() : setN(n + 1))} className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] font-black text-sm cursor-pointer font-sans">
          {UI.next}
        </button>
      </div>
    </>
  );
};

const lastTrainPassed = (now: Date): boolean => now.getHours() >= 23; // 最終便(23:05発)の、発車の5分前を過ぎた

export const EventTarePage: React.FC<EventTarePageProps> = ({ owner, sessionToken, store, orders, onClose, onReserve, onDemoReward, onRewarded }) => {
  const [progress, setProgress] = useState(() => readEventProgress(owner, store));
  const [now, setNow] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [scene, setScene] = useState<'none' | 'found' | 'epilogue' | 'reward'>('none');
  const [log, setLog] = useState<LogItem[]>([]);
  const [typing, setTyping] = useState(false);
  const [more, setMore] = useState(false);
  const [claim, setClaim] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' });
  const [rewardShown, setRewardShown] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const counts = useRef<Record<string, number>>({});
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadEventData()
      .catch(() => undefined)
      .then(() => alive && setReady(true));
    const timer = setInterval(() => setNow(new Date()), 30000);
    const onVisible = () => setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const state = useMemo(
    () => getEventState(progress.joined, orders, now, { cleared: progress.cleared }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress, orders, now, ready]
  );

  const push = (items: Omit<LogItem, 'id'>[]) => setLog((l) => [...l, ...items.map((it) => ({ ...it, id: ++seq.current }))]);

  // 状態が変わったら、指令員の報告を足す(新しいものだけ)
  useEffect(() => {
    if (!progress.joined || progress.cleared) return;
    const add: Omit<LogItem, 'id'>[] = [];
    const once = (key: string, items: Omit<LogItem, 'id'>[]) => {
      if (known.current.has(key)) return;
      known.current.add(key);
      add.push(...items);
    };
    if (state.phase === 'no_reservation') once('act2', [...fromScript(ACT2), ...fromScript(ACT3_BEFORE_RESERVATION)]);
    if (state.phase === 'before_departure' || state.phase === 'riding' || state.phase === 'arrived') once('act3r', fromScript(ACT3_RESERVED));
    commanderUpdates(known.current, state, now).forEach((u) => {
      known.current.add(u.key);
      add.push({ kind: 'say', who: CHAT_SPEAKER, text: u.text });
    });
    if (add.length > 0) push(add);
  }, [state, now, progress.joined, progress.cleared]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [log.length, typing]);

  const ask = (c: ChatChoice) => {
    const nth = (counts.current[c.id] = (counts.current[c.id] || 0) + 1);
    push([{ kind: 'me', text: c.label }]);
    setTyping(true);
    const reply = chatReply(c.id, nth, state);
    const who: Speaker = c.id === 'pr' ? '広報' : c.id === 'shop' ? '店主' : CHAT_SPEAKER;
    window.setTimeout(() => {
      setTyping(false);
      push([{ kind: 'say', who, text: reply }]);
    }, 500 + Math.floor(Math.random() * 300));
  };

  const join = () => {
    markEventJoined(owner, store);
    setProgress(readEventProgress(owner, store));
  };

  const finishCleared = (shown: boolean) => {
    setEventCleared(owner, true, store);
    setProgress(readEventProgress(owner, store));
    setRewardShown(shown);
    setScene('none');
  };

  // ごほうび: ログイン証のある会員は、サーバーで判定。デモ会員は、画面の中だけ
  const claimReward = async () => {
    if (!sessionToken) {
      onDemoReward(EVENT_TARE.rewardPoints);
      finishCleared(true);
      return;
    }
    if (!state.orderId) {
      setClaim({ busy: false, message: UI.claimError });
      return;
    }
    setClaim({ busy: true, message: '' });
    try {
      const r = await claimEventTare(sessionToken, state.orderId);
      if (r.ok === true) {
        setClaim({ busy: false, message: '' });
        onRewarded();
        finishCleared(r.added);
        return;
      }
      const msg = r.reason === 'notYet' ? UI.claimNotYet : r.reason === 'locked' ? UI.claimLocked : r.reason === 'busy' ? UI.claimBusy : r.reason === 'session' ? UI.claimSession : UI.claimError;
      setClaim({ busy: false, message: msg });
    } catch {
      setClaim({ busy: false, message: UI.claimError });
    }
  };

  // デモ会員は、受け取りの画面に来たら、すぐ付ける
  useEffect(() => {
    if (scene === 'reward' && !sessionToken) void claimReward();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const phase = state.phase;
  const header = (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-amber-600/25 bg-[#0C0A10]/95 px-4 py-3 backdrop-blur font-sans">
      <button type="button" onClick={onClose} aria-label={UI.back} className="p-1 text-amber-400 cursor-pointer">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-400">{TARE_BADGE}</span>
    </div>
  );

  let body: React.ReactNode;
  if (!progress.joined) {
    // 特設ページ(物語の導入と、参加)
    body = (
      <div className="flex-1 space-y-4 px-4 py-5">
        <h2 className="font-serif text-2xl font-extrabold leading-snug text-amber-100">{TARE_TITLE}</h2>
        <div className="space-y-2.5 rounded-2xl border border-amber-600/35 bg-black/50 p-3.5">
          {fromScript(ACT1).map((it, i) => (
            <Bubble key={i} item={it} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 font-sans">
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-400">名札『{EVENT_TARE.tagName}』</span>
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-400">N-POINT +{EVENT_TARE.rewardPoints}</span>
        </div>
        <button type="button" onClick={join} className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] font-black text-base cursor-pointer font-sans">
          {UI.join}
        </button>
      </div>
    );
  } else if (phase === 'cleared' && scene === 'none') {
    // クリア画面(認定証)
    body = (
      <div className="flex-1 px-4 py-6 text-center">
        <div className="mx-1 rounded-md border-[3px] border-double border-amber-500/75 bg-black/45 px-3 py-5">
          <div className="font-sans text-[11px] tracking-[0.3em] text-stone-400">{CLEAR.certTitle}</div>
          <div className="my-2.5 font-serif text-[28px] font-black text-amber-100">{EVENT_TARE.tagName}</div>
          <div className="font-sans text-xs text-stone-200">{CLEAR.solved}</div>
          <span className="mt-2 inline-block h-[58px] w-[58px] -rotate-12 rounded-full border-[3px] border-red-600 pt-[14px] font-sans text-[11px] font-black leading-[1.15] text-red-600">
            {CLEAR.stamp[0]}
            <br />
            {CLEAR.stamp[1]}
          </span>
        </div>
        <div className="mx-1.5 mt-3 flex items-center justify-between rounded-xl border border-amber-600/35 bg-black/55 px-3.5 py-2.5 font-sans">
          <span className="text-xs text-stone-400">N-POINT</span>
          <span className="flex items-center gap-2">
            {rewardShown && !sessionToken && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">{UI.demoOnly}</span>}
            <b className="font-mono text-lg text-amber-400">+{EVENT_TARE.rewardPoints}pt</b>
          </span>
        </div>
        <div className="mx-2 mt-5 font-serif text-sm font-bold text-amber-100">{CLEAR.delivered}</div>
        <button type="button" onClick={onClose} className="mt-5 w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] font-black text-sm cursor-pointer font-sans">
          {UI.close}
        </button>
      </div>
    );
  } else if (scene === 'found') {
    body = <Scene lines={[...ACT5, ...ACT6]} onDone={() => setScene('epilogue')} />;
  } else if (scene === 'epilogue') {
    body = <Scene lines={EPILOGUE} onDone={() => setScene('reward')} />;
  } else if (scene === 'reward') {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <div className="font-serif text-xl font-bold text-amber-100">{CLEAR.delivered}</div>
        {sessionToken && (
          <button
            type="button"
            disabled={claim.busy}
            onClick={() => void claimReward()}
            className="h-12 w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#1c1410] font-black text-sm cursor-pointer font-sans"
          >
            {claim.message ? UI.retry : UI.claim}
          </button>
        )}
        {claim.message && <div className="font-sans text-xs font-bold text-amber-400" role="alert">{claim.message}</div>}
      </div>
    );
  } else {
    // 進行画面(司令員のログ)
    body = (
      <>
        {phase === 'no_reservation' && (
          <div className="mx-4 mt-4 rounded-2xl border border-amber-600/35 bg-black/50 p-3.5 font-sans">
            {UI.steps.map((s, i) => (
              <div key={s.title} className={`flex gap-2.5 py-1.5 ${i > 0 ? 'border-t border-amber-600/20' : ''}`}>
                <i className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black not-italic ${i === 0 ? 'border-amber-500 bg-amber-500 text-[#1c1410]' : 'border-amber-500/60 text-amber-400'}`}>
                  {i === 0 ? '✓' : i + 1}
                </i>
                <span>
                  <b className="text-[13px] text-amber-100">{s.title}</b>
                  {s.note && <small className="block text-[11px] text-stone-400">{s.note}</small>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex-1 space-y-2.5 px-4 py-4">
          {log.map((it) => (
            <Bubble key={it.id} item={it} />
          ))}
          {typing && (
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 shrink-0 rounded-full bg-[#991B1B]" />
              <div className="animate-pulse rounded-2xl border border-amber-600/30 bg-white/[0.07] px-3 py-2 text-[13px] text-stone-400">…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="sticky bottom-0 border-t border-amber-600/25 bg-[#0C0A10]/95 px-4 py-3 font-sans">
          {phase === 'no_reservation' &&
            (lastTrainPassed(now) ? (
              <div className="py-1 text-center text-xs font-bold text-amber-400">{UI.reserveLastTrainPassed}</div>
            ) : (
              <button type="button" onClick={onReserve} className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] font-black text-sm cursor-pointer">
                {UI.reserve}
              </button>
            ))}
          {showsChat(phase) && (
            <div className="flex flex-wrap gap-2">
              {[...VISIBLE_CHOICES, ...(more ? EXTRA_CHOICES : [])].map((c) => (
                <button key={c.id} type="button" disabled={typing} onClick={() => ask(c)} className="rounded-full border border-amber-500/50 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer">
                  {c.label}
                </button>
              ))}
              {!more && (
                <button type="button" aria-label="ほかの選択肢" onClick={() => setMore(true)} className="rounded-full border border-amber-500/50 px-3 py-1.5 text-xs font-bold text-amber-400 cursor-pointer">
                  …
                </button>
              )}
            </div>
          )}
          {phase === 'arrived' && (
            <button type="button" onClick={() => setScene('found')} className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] font-black text-sm cursor-pointer">
              {UI.talk}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0C0A10] text-stone-200" role="dialog" aria-modal="true" aria-label={TARE_TITLE}>
      <div className="mx-auto flex min-h-full max-w-md flex-col bg-[radial-gradient(120%_60%_at_50%_0%,#1d1522_0%,#0C0A10_55%)]">
        {header}
        {body}
      </div>
    </div>
  );
};
