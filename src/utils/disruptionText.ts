// 運行支障の文章づくり・理由に合う候補・自動解除の時刻候補(日時と文字だけを扱う部分)。
// 保存や通信は disruptionManager.ts が行う。

import { COMMON_REASON_CATEGORIES } from './disruptionPresets';
import type { DisruptionDirection, DisruptionStatusType } from './disruptionManager';

/**
 * 期限日時プリセット候補（現在時刻基準）の生成
 */
export function getExpiryOptions(baseDate: Date = new Date()): { label: string; date: Date; hoursFromNow: number }[] {
  const addHours = (h: number) => new Date(baseDate.getTime() + h * 60 * 60 * 1000);
  
  // 今日の24:00 (明日0:00)
  const todayMidnight = new Date(baseDate);
  todayMidnight.setHours(24, 0, 0, 0);

  // 明日の朝6:00
  const tomorrowMorning = new Date(baseDate);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(6, 0, 0, 0);

  // 明日の正午12:00
  const tomorrowNoon = new Date(baseDate);
  tomorrowNoon.setDate(tomorrowNoon.getDate() + 1);
  tomorrowNoon.setHours(12, 0, 0, 0);

  // 明日の24:00
  const tomorrowMidnight = new Date(baseDate);
  tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
  tomorrowMidnight.setHours(24, 0, 0, 0);

  const dayLabel = (d: Date) => {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === baseDate.toDateString()) return '本日';
    if (d.toDateString() === tomorrow.toDateString()) return '明日';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatTimeOnly = (d: Date) => {
    // 0:00ちょうどは前日の24:00として表示(例: 本日 24:00)
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      return `${dayLabel(new Date(d.getTime() - 60000))} 24:00`;
    }
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dayLabel(d)} ${time}`;
  };

  return [
    { label: `+1時間後 (${formatTimeOnly(addHours(1))})`, date: addHours(1), hoursFromNow: 1 },
    { label: `+2時間後 (${formatTimeOnly(addHours(2))})`, date: addHours(2), hoursFromNow: 2 },
    { label: `+3時間後 (${formatTimeOnly(addHours(3))})`, date: addHours(3), hoursFromNow: 3 },
    { label: `+6時間後 (${formatTimeOnly(addHours(6))})`, date: addHours(6), hoursFromNow: 6 },
    { label: `本日終電 (${formatTimeOnly(todayMidnight)})`, date: todayMidnight, hoursFromNow: Math.max(1, Math.round((todayMidnight.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `翌朝 06:00 (${formatTimeOnly(tomorrowMorning)})`, date: tomorrowMorning, hoursFromNow: Math.max(1, Math.round((tomorrowMorning.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `翌日 12:00 (${formatTimeOnly(tomorrowNoon)})`, date: tomorrowNoon, hoursFromNow: Math.max(1, Math.round((tomorrowNoon.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `明日終日 (${formatTimeOnly(tomorrowMidnight)})`, date: tomorrowMidnight, hoursFromNow: Math.max(1, Math.round((tomorrowMidnight.getTime() - baseDate.getTime()) / 3600000)) },
  ];
}

/**
 * 理由文字列から気象災害・自然災害系かどうかを判定
 */
export function isWeatherRelatedReason(reason: string): boolean {
  const weatherKeywords = ['雨', '風', '雪', '台風', '雷', '地震', '浸水', '冠水', '倒木', '飛来物', '火災', '天候', '気象'];
  return weatherKeywords.some((kw) => reason.includes(kw));
}

/**
 * 理由に適した復旧見込みプリセットを取得
 */
export function getDurationPresetsForReason(reason: string): string[] {
  const found = COMMON_REASON_CATEGORIES.find((cat) => cat.reasons.includes(reason));
  if (found) return found.durationPresets;

  if (isWeatherRelatedReason(reason)) {
    return [
      '天候回復次第',
      '現時点で復旧・再開のめどは立っていません',
      '風雨が収まり安全確認が取れ次第',
      '今後の気象情報にご注意ください',
    ];
  }

  return [
    '約15〜30分で復帰見込み',
    '点検完了次第',
    '18:30頃まで',
    '警察・消防の現場検証完了後',
    '現時点で復旧のめどは立っていません',
  ];
}

/**
 * 鉄道公式アナウンス形式の自動文言生成関数
 * 天候要因・復旧未定・時刻見込みなど状況に応じた自然な日本語文言を構築
 */
export function generateDisruptionText(
  lineName: string,
  statusType: DisruptionStatusType,
  maxDelayMinutes: number,
  section: string,
  reason: string,
  durationUntil: string,
  targetDirection: DisruptionDirection = 'both'
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const cleanSection = section.trim() || '全線';
  const cleanReason = reason.trim() || '安全確認のため';
  const cleanUntil = durationUntil.trim();
  const isWeather = isWeatherRelatedReason(cleanReason);

  const directionLabel =
    targetDirection === 'up' ? '上り線で' : targetDirection === 'down' ? '下り線で' : '上下線で';

  if (statusType === 'normal') {
    return '現在、全線でほぼ平常通り運転しております。';
  }

  // 運転見合わせ
  if (statusType === 'suspended') {
    const scopeLabel = targetDirection === 'up' ? '上り線で' : targetDirection === 'down' ? '下り線で' : '全線で';
    let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanSection}での${cleanReason}の影響により、${scopeLabel}運転を見合わせております。`;
    if (cleanUntil) {
      if (cleanUntil.includes('めど') || cleanUntil.includes('未定') || cleanUntil.includes('立っていません')) {
        msg += '（現時点で運転再開・復旧のめどは立っておりません）';
      } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後') || cleanUntil.includes('終了後')) {
        msg += `（${cleanUntil}、順次運転再開を予定しております）`;
      } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
        msg += `（${cleanUntil}）`;
      } else {
        msg += `（${cleanUntil}の運転再開を見込んでおります）`;
      }
    } else if (isWeather) {
      msg += '（天候回復および線路安全確認が取れ次第の再開となります）';
    }
    return msg;
  }

  // 一部運休
  if (statusType === 'partially_suspended') {
    let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanReason}の影響により、${cleanSection}の${directionLabel}一部列車の運転を取り止めております。`;
    if (cleanUntil) {
      if (cleanUntil.includes('めど') || cleanUntil.includes('未定')) {
        msg += '（現時点で通常運行復帰のめどは立っておりません）';
      } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後')) {
        msg += `（${cleanUntil}、通常ダイヤへ復旧予定です）`;
      } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
        msg += `（${cleanUntil}）`;
      } else {
        msg += `（${cleanUntil}まで継続見込み）`;
      }
    }
    return msg;
  }

  // statusType === 'delay' (列車遅延)
  const delayStr = maxDelayMinutes > 0 ? `最大約${maxDelayMinutes}分` : '一部';
  let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanSection}での${cleanReason}の影響により、${directionLabel}${delayStr}の遅れが発生しております。`;
  if (cleanUntil) {
    if (cleanUntil.includes('めど') || cleanUntil.includes('未定') || cleanUntil.includes('立っていません')) {
      msg += '（天候・現場状況により、遅れの拡大や運転見合わせとなる可能性があります）';
    } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後')) {
      msg += `（${cleanUntil}、平常運転への回復を見込んでおります）`;
    } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
      msg += `（${cleanUntil}）`;
    } else {
      msg += `（${cleanUntil}の平常運行再開を見込んでおります）`;
    }
  } else if (isWeather) {
    msg += '（天候の状況により遅れが拡大する場合がありますのでご注意ください）';
  }
  return msg;
}
