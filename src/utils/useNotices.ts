// 通知を読む: アプリを開いたときと、メニューを開いたときだけ(短い間隔の繰り返しは、しない。60秒以内の再取得は、飛ばす)。
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotices, getNoticeOpenedAt, hasNewNotice, markNoticesOpened, Notice } from './notices';

const MIN_REFETCH_MS = 60 * 1000;

export const useNotices = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [openedAt, setOpenedAt] = useState<number>(() => getNoticeOpenedAt());
  const lastFetchAt = useRef(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchAt.current < MIN_REFETCH_MS) return;
    lastFetchAt.current = now;
    const list = await fetchNotices();
    if (list !== null) setNotices(list); // 読めなかったときは、いまの表示のまま
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 通知を開いた: すべて既読
  const markRead = useCallback(() => {
    setOpenedAt(markNoticesOpened(Date.now(), notices));
  }, [notices]);

  return { notices, hasNew: hasNewNotice(notices, openedAt), refresh, markRead };
};
