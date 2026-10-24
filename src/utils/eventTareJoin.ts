// 公開記念イベントの参加を、サーバーの時刻(joinEventTare)とつなぐ。通信の結果は、画面にエラーとして出さない(端末の時刻のまま続ける)。
import { markEventJoined, readEventProgress, resetEventProgress, setEventJoinedAt } from './eventTare';
import { clearSeenScenes } from './eventTareReveal';
import type { EventProgress, EventStore } from './eventTare';
import type { EventTareJoinResult } from './cloudAccount';

type JoinCall = (sessionToken: string) => Promise<EventTareJoinResult>;

// 参加を押したとき: すぐ、端末の中で参加にする(端末の時刻)。ログイン証のある会員は、サーバーに記録してもらい、
// 時刻が返ったら、それを端末の時刻にする(サーバーが正)。断られた(まだ受け付けていない)・通信できない・ほかのエラーは、端末の時刻のまま。
// 戻り値は、反映後の印。デモ会員(ログイン証なし)は、サーバーを呼ばない。
export const joinEvent = async (
  owner: string,
  store: EventStore | undefined,
  sessionToken: string | undefined,
  call: JoinCall,
  onLocalJoined?: (p: EventProgress) => void
): Promise<EventProgress> => {
  markEventJoined(owner, store);
  onLocalJoined?.(readEventProgress(owner, store));
  if (!sessionToken) return readEventProgress(owner, store);
  try {
    const r = await call(sessionToken);
    if (r.ok === true) setEventJoinedAt(owner, r.joinedAt, store, false);
  } catch {
    // 通信できなくても、端末の時刻で続ける
  }
  return readEventProgress(owner, store);
};

// アカウントの同期のとき(別の端末で開いたとき)。serverJoinedAt は、syncAccount が返す eventTareJoinedAt。
//  - 時刻があれば: この端末も「参加済み」にして、時刻は早いほう
//  - null で、この端末に参加の印があるとき: サーバーに記録を送る(送るのは、呼ぶ側が、1回だけにする)。返った時刻は、早いほうを使う
// 変わったとき true を返す(画面の読み直し用)。
export const syncJoinedFromServer = async (
  owner: string,
  store: EventStore | undefined,
  sessionToken: string | undefined,
  serverJoinedAt: number | null,
  call: JoinCall
): Promise<boolean> => {
  if (!sessionToken) return false;
  const before = readEventProgress(owner, store);
  if (serverJoinedAt !== null) {
    setEventJoinedAt(owner, serverJoinedAt, store, true);
  } else if (before.joined && !before.cleared) {
    try {
      const r = await call(sessionToken);
      if (r.ok === true) setEventJoinedAt(owner, r.joinedAt, store, true);
    } catch {
      // 断られた・通信できないときは、そのまま
    }
  }
  const after = readEventProgress(owner, store);
  return after.joined !== before.joined || after.joinedAt !== before.joinedAt;
};

// 「最初からやり直す」: 参加の印・参加の時刻・見た場面の印を、この会員の分だけ消す。やり直した時刻を記録する(サーバーは変えない)。
// クリア済みは、やり直せない(false)。チャットの履歴は、画面の中だけなので、画面を作り直して消す(呼ぶ側)。
export const resetEvent = (owner: string, store: EventStore | undefined, nowMs: number = Date.now()): boolean => {
  if (!resetEventProgress(owner, store, nowMs)) return false;
  clearSeenScenes(owner);
  return true;
};

// 「最初からやり直す」を出すのは、参加ずみで、まだクリアしていないとき
export const canResetEvent = (p: Pick<EventProgress, 'joined' | 'cleared'>): boolean => p.joined && !p.cleared;
