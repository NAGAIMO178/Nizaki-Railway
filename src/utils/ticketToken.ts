import { isLaunched, withPreviewFlag } from './launch';

// QR乗車券のトークン = 予約番号 + '.' + 署名12文字(サーバーが作る。形は gas/Code.gs と同じ)
export const TICKET_TOKEN_PATTERN = /^[A-Za-z0-9-]{3,40}\.[A-Za-z0-9_-]{12}$/;

const HASH_PREFIX = '#/t/';

// リンクのハッシュ(#/t/トークン)からトークンを取り出す。形が違えば null
export const parseTicketHash = (hash: string): string | null => {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const token = hash.slice(HASH_PREFIX.length);
  return TICKET_TOKEN_PATTERN.test(token) ? token : null;
};

// 検札の画面を開くべきときだけ、トークンを返す。公開前は、リンクを開いても、いつものアプリのまま(null)
export const ticketRouteToken = (hash: string = window.location.hash): string | null =>
  isLaunched() ? parseTicketHash(hash) : null;

// QR に入れるリンク。公開URLは、いま開いているアプリの場所から作る(コードには書かない)
export const buildTicketUrl = (
  token: string,
  location: { origin: string; pathname: string } = window.location,
): string => {
  const url = withPreviewFlag(new URL(location.origin + location.pathname));
  url.hash = `/t/${token}`;
  return url.toString();
};
