// 予約をサーバーの台帳へ送る(createReservation)。送れなかったときは、間をあけて、もう一度送る(回数の上限つき)。
//  - callGas は、サーバーが「失敗」と返しても例外にしないので、返事の status を見る。通信できなかった(例外)ときも、失敗。
//  - やり直しても直らない失敗(ログイン切れ・内容が正しくない・上限・使用できない予約番号・取消ずみ)は、もう一度は送らない。
//    やり直して直るのは、通信の失敗と、サーバーが混み合っているときだけ。
//  - 画面には、何も出さない。
export const RETRY_DELAYS_MS = [3000, 10000, 30000]; // 失敗したあと、何ms待って送り直すか(最初の1回のほかに、最大3回)

// サーバーが「混み合っています」と返す文(gas/Code.gs の handleCreateReservation)。これだけが、送り直せば直る
export const BUSY_MESSAGE_PART = '混み合っています';

export interface ReservationResponse {
  status: 'success' | 'error';
  message?: string;
  code?: string;
}

export interface SendOutcome {
  ok: boolean;
  retryable: boolean; // 失敗のとき、送り直せば直るか
  reason: string;
  response?: ReservationResponse;
}

// 1回送った結果を、「成功」「送り直せば直る失敗」「直らない失敗」に分ける
export const judgeResponse = (res: ReservationResponse | undefined): SendOutcome => {
  if (res && res.status === 'success') return { ok: true, retryable: false, reason: '', response: res };
  const message = res?.message ?? '';
  return { ok: false, retryable: message.includes(BUSY_MESSAGE_PART), reason: message || '失敗' };
};

export const sendReservationWithRetry = async (
  send: () => Promise<ReservationResponse>,
  opts: { delays?: number[]; sleep?: (ms: number) => Promise<void>; shouldContinue?: () => boolean } = {}
): Promise<SendOutcome> => {
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: SendOutcome = { ok: false, retryable: true, reason: '送れませんでした' };
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      last = judgeResponse(await send());
    } catch (err) {
      last = { ok: false, retryable: true, reason: err instanceof Error ? err.message : '通信できませんでした' };
    }
    if (last.ok || !last.retryable || attempt === delays.length) return last;
    await sleep(delays[attempt]);
    // 待っているあいだに、その予約が無くなった(取消・別の会員に切り替え)なら、送り直さない
    if (opts.shouldContinue && !opts.shouldContinue()) return last;
  }
  return last;
};
