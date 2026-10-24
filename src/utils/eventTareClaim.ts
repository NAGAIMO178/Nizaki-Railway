// 公開記念イベントのごほうびを、サーバーに判定してもらって受け取る(薄い呼び出し)。
// 形は、PR #158(cloudAccount.ts の claimEventTare)と同じ。#158 がマージされたら、この呼び出しを、そちらに置き換える。
// ログイン証のある会員だけが呼ぶ(デモ会員は、画面の中だけ)。送るのは、予約番号だけ(額は、サーバーが決める)。
import { callGas } from './accountApi';

export type EventTareClaimResult =
  | { ok: true; added: boolean; points: number; balance: number }
  | { ok: false; reason: 'notYet' | 'locked' | 'busy' | 'session' | 'error'; message: string };

interface ClaimResponse {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  added?: boolean;
  points?: number;
  balance?: number;
}

export const claimEventTare = async (sessionToken: string, orderId: string): Promise<EventTareClaimResult> => {
  const res = (await callGas('claimEventTare', { sessionToken, orderId })) as unknown as ClaimResponse;
  if (res.status === 'success') return { ok: true, added: !!res.added, points: res.points ?? 0, balance: res.balance ?? 0 };
  const message = res.message || 'ごほうびを受け取れませんでした。';
  if (res.code === 'session') return { ok: false, reason: 'session', message };
  if (res.code === 'event_not_yet') return { ok: false, reason: 'notYet', message };
  if (res.code === 'event_locked') return { ok: false, reason: 'locked', message };
  if (res.code === 'event_busy') return { ok: false, reason: 'busy', message };
  return { ok: false, reason: 'error', message };
};
