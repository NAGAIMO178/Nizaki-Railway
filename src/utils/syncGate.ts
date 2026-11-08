// クラウドの「最初の同期」の関門。同期が済むまで、ほかの操作を待たせる。
// 最初の同期が失敗したままのときは、次の操作の前に、同期をやり直す(失敗のまま固まらない)。やり直しは、同時に1つだけ。
export const createSyncGate = () => {
  let lastSync: (() => Promise<boolean>) | null = null;
  let first: Promise<boolean> = Promise.resolve(false);
  let retry: Promise<boolean> | null = null;
  return {
    // 最初の同期を始める(sync は、成功したら true、失敗したら false を返す)
    begin(sync: () => Promise<boolean>): Promise<boolean> {
      lastSync = sync;
      retry = null;
      first = sync();
      return first;
    },
    // ログアウトなど: 何も待たせず、やり直しもしない
    reset() {
      lastSync = null;
      retry = null;
      first = Promise.resolve(false);
    },
    // 同期が済んでいれば true。失敗していたら、やり直して、その結果
    async ensure(): Promise<boolean> {
      if (await first) return true;
      const again = lastSync;
      if (!again) return false;
      if (!retry) {
        const p = again()
          .then((ok) => {
            if (ok && lastSync === again) first = Promise.resolve(true);
            return ok;
          })
          .finally(() => {
            if (retry === p) retry = null;
          });
        retry = p;
      }
      return retry;
    },
  };
};
