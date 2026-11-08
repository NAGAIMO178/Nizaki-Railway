// 予約の送信: 返事の status を見る・送れなかったら間をあけて送り直す(直らない失敗は送り直さない)・同期の関門
import { describe, expect, it } from 'vitest';
import { judgeResponse, RETRY_DELAYS_MS, sendReservationWithRetry } from '../src/utils/reservationSync';
import { createSyncGate } from '../src/utils/syncGate';

const noSleep = () => Promise.resolve();

describe('返事の見分け', () => {
  it('success だけが成功。error は、混み合っているときだけ「送り直せば直る」', () => {
    expect(judgeResponse({ status: 'success' }).ok).toBe(true);
    const busy = judgeResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
    expect(busy).toMatchObject({ ok: false, retryable: true });
    for (const m of [
      'ログインの有効期限が切れています。もう一度ログインしてください。',
      '予約内容が正しくありません。',
      '会員情報が見つかりません。',
      'この予約番号は使用できません。',
      'この予約は取り消されています。新しく予約してください。',
      '一度に持てる予約の数の上限です。乗車後か、取消のあとに、もう一度お試しください。',
    ]) {
      expect(judgeResponse({ status: 'error', message: m }), m).toMatchObject({ ok: false, retryable: false });
    }
    expect(judgeResponse({ status: 'error', code: 'order_limit', message: '上限' })).toMatchObject({ ok: false, retryable: false });
    expect(judgeResponse(undefined).ok).toBe(false);
  });
});

describe('送り直し', () => {
  it('status:error でも例外にならないので、成功と見なさない(混み合い → 送り直して成功)', async () => {
    let n = 0;
    const waits: number[] = [];
    const r = await sendReservationWithRetry(async () => (++n < 3 ? { status: 'error', message: '混み合っています' } : { status: 'success' }), {
      sleep: async (ms) => void waits.push(ms),
    });
    expect(r.ok).toBe(true);
    expect(n).toBe(3);
    expect(waits).toEqual([RETRY_DELAYS_MS[0], RETRY_DELAYS_MS[1]]); // 間をあけて(だんだん長く)
  });

  it('通信できなかった(例外)ときも、送り直す。回数に上限があり、最初の1回と、最大3回', async () => {
    let n = 0;
    const r = await sendReservationWithRetry(async () => {
      n++;
      throw new Error('通信エラーが発生しました (status: 503)');
    }, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(n).toBe(1 + RETRY_DELAYS_MS.length);
    expect(r.reason).toContain('503');
  });

  it('直らない失敗(この予約番号は使用できません など)は、1回だけ。送り直さない', async () => {
    let n = 0;
    const r = await sendReservationWithRetry(async () => (n++, { status: 'error', message: 'この予約番号は使用できません。' }), { sleep: noSleep });
    expect(n).toBe(1);
    expect(r).toMatchObject({ ok: false, retryable: false });
  });

  it('1回で成功したら、送り直さない。待っているあいだに、その予約が無くなったら、送り直さない', async () => {
    let n = 0;
    expect((await sendReservationWithRetry(async () => (n++, { status: 'success' }), { sleep: noSleep })).ok).toBe(true);
    expect(n).toBe(1);
    n = 0;
    let alive = true;
    const r = await sendReservationWithRetry(async () => (n++, { status: 'error', message: '混み合っています' }), {
      sleep: async () => {
        alive = false;
      },
      shouldContinue: () => alive,
    });
    expect(n).toBe(1);
    expect(r.ok).toBe(false);
  });
});

describe('最初の同期の関門', () => {
  it('同期に成功していれば、そのまま通す(やり直さない)', async () => {
    const gate = createSyncGate();
    let n = 0;
    await gate.begin(async () => (n++, true));
    expect(await gate.ensure()).toBe(true);
    expect(await gate.ensure()).toBe(true);
    expect(n).toBe(1);
  });

  it('最初の同期が失敗したままなら、次の操作の前に、同期をやり直す。直れば、その後は、やり直さない', async () => {
    const gate = createSyncGate();
    let ok = false;
    let n = 0;
    await gate.begin(async () => (n++, ok)); // 最初は失敗
    ok = true; // 通信が戻った
    expect(await gate.ensure()).toBe(true); // 失敗のあと、やり直して成功
    expect(n).toBe(2);
    expect(await gate.ensure()).toBe(true);
    expect(n).toBe(2); // 直ったあとは、やり直さない
  });

  it('やり直しても失敗なら false。次の操作で、また、やり直す', async () => {
    const gate = createSyncGate();
    let n = 0;
    await gate.begin(async () => (n++, false));
    expect(await gate.ensure()).toBe(false);
    expect(await gate.ensure()).toBe(false);
    expect(n).toBe(3);
  });

  it('やり直しは同時に1つだけ', async () => {
    const gate = createSyncGate();
    let calls = 0;
    let finishRetry: (v: boolean) => void = () => undefined;
    await gate.begin(() => {
      calls++;
      return calls === 1 ? Promise.resolve(false) : new Promise<boolean>((res) => (finishRetry = res));
    });
    const a = gate.ensure();
    const b = gate.ensure();
    await Promise.resolve();
    await Promise.resolve();
    finishRetry(true);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(calls).toBe(2); // 最初の1回と、やり直し1回だけ
  });

  it('ログアウト(reset)のあとは、何もせず false', async () => {
    const gate = createSyncGate();
    let n = 0;
    await gate.begin(async () => (n++, false));
    gate.reset();
    expect(await gate.ensure()).toBe(false);
    expect(n).toBe(1);
  });
});
