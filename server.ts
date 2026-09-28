import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// CORSヘッダー設定（GASや外部サイト・アプリからのAPI取得を許可）
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// 管理者・指令発令による運行支障・遅延管理メモリマップ
let activeDisruptions: Record<string, any> = {};

// 運行状態生成関数（管理者設定の運行支障と連動）
function getLiveTrainStatus() {
  const now = new Date();
  const timeStr = now.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const lines = [
    {
      id: "kanzaki",
      lineName: "神埼線",
      code: "Y",
      status: "平常運転",
      delayMinutes: 0,
      message: "現在、全線でほぼ平常通り運転しております。",
    },
    {
      id: "kanzaki_kosoku",
      lineName: "神埼高速線",
      code: "NI",
      status: "平常運転",
      delayMinutes: 0,
      message: "現在、全線でほぼ平常通り運転しております。",
    },
    {
      id: "saichi",
      lineName: "埼千環状線",
      code: "SC",
      status: "平常運転",
      delayMinutes: 0,
      message: "現在、全線でほぼ平常通り運転しております。",
    },
    {
      id: "tsuchiura",
      lineName: "土浦線",
      code: "TC",
      status: "平常運転",
      delayMinutes: 0,
      message: "現在、全線でほぼ平常通り運転しております。",
    },
  ];

  const disruptionKeys = Object.keys(activeDisruptions);
  let hasDelay = false;
  const delayedNames: string[] = [];

  if (disruptionKeys.length > 0) {
    // 管理者からの指令発令データが存在する場合
    lines.forEach((l) => {
      const d = activeDisruptions[l.id] || (l.id === "saichi" ? activeDisruptions["saichi_loop"] : null);
      if (d && d.statusType && d.statusType !== "normal") {
        hasDelay = true;
        if (d.statusType === "suspended") {
          l.status = "運転見合わせ";
          l.delayMinutes = 0;
          delayedNames.push(`${l.lineName}(見合わせ)`);
        } else if (d.statusType === "partially_suspended") {
          l.status = "一部運休";
          l.delayMinutes = d.maxDelayMinutes || 5;
          delayedNames.push(`${l.lineName}(一部運休)`);
        } else if (d.statusType === "delay") {
          l.status = d.maxDelayMinutes > 0 ? `遅延 (最大約${d.maxDelayMinutes}分)` : "一部遅延";
          l.delayMinutes = d.maxDelayMinutes || 5;
          delayedNames.push(`${l.lineName}(遅延)`);
        }

        if (d.useCustomMessage && d.customMessage && d.customMessage.trim()) {
          l.message = d.customMessage.trim();
        } else if (d.statusType === "suspended") {
          l.message = `現在、${d.section || "全線"}での${d.reason || "安全確認"}の影響により、運転を見合わせております。${d.durationUntil ? `（${d.durationUntil}再開見込み）` : ""}`;
        } else if (d.statusType === "partially_suspended") {
          l.message = `現在、${d.reason || "安全確認"}の影響により、${d.section || "全線"}で一部列車の運転を取り止めております。`;
        } else {
          l.message = `現在、${d.section || "全線"}での${d.reason || "安全確認"}の影響により、最大約${d.maxDelayMinutes || 5}分の遅延が発生しております。${d.durationUntil ? `（${d.durationUntil}復旧見込み）` : ""}`;
        }
      }
    });

    const summary = hasDelay
      ? `【運行支障情報】${delayedNames.join("、")}が発生しております。`
      : "現在、神埼鉄道グループ全線でほぼ平常通り運転しております。";

    return {
      updatedAt: timeStr,
      hasDelay,
      summary,
      lines,
    };
  }

  // 管理者発令がない場合の平常時
  return {
    updatedAt: timeStr,
    hasDelay: false,
    summary: "現在、神埼鉄道グループ全線でほぼ平常通り運転しております。",
    lines,
  };
}

// 予約データストレージ（メモリ内マップ）
const ordersMap: Record<string, any> = {};
let latestOrderId = "";

// 1. 運行状態公開API (/api/status)
app.get("/api/status", (req, res) => {
  const status = getLiveTrainStatus();
  res.json(status);
});

// 1.1 管理者運行指令API (/api/disruptions)
app.get("/api/disruptions", (req, res) => {
  res.json({ disruptions: activeDisruptions });
});

app.post("/api/disruptions", (req, res) => {
  if (req.body && req.body.disruptions) {
    activeDisruptions = req.body.disruptions;
    return res.json({ status: "ok", message: "Disruptions updated", count: Object.keys(activeDisruptions).length });
  }
  res.json({ status: "ok", message: "No changes" });
});

// 2. 特急券予約情報API (/api/reservation)
app.get("/api/reservation", (req, res) => {
  const rawCode = (req.query.code as string || "").trim();
  const queryCode = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // コード指定がある場合は検索
  if (queryCode) {
    // 1. 完全一致・部分一致で探す
    const matchedKey = Object.keys(ordersMap).find((k) => {
      const cleanKey = k.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return cleanKey === queryCode || cleanKey.includes(queryCode) || queryCode.includes(cleanKey);
    });

    if (matchedKey && ordersMap[matchedKey]) {
      return res.json({
        hasReservation: true,
        order: ordersMap[matchedKey],
      });
    }

    return res.json({
      hasReservation: false,
      message: `予約番号「${rawCode}」に該当する特急券は見つかりませんでした。`,
    });
  }

  // コード指定がない場合は最新の予約を返却
  const latestOrder = ordersMap[latestOrderId] || Object.values(ordersMap).slice(-1)[0] || null;
  if (latestOrder) {
    return res.json({
      hasReservation: true,
      order: latestOrder,
    });
  }

  res.json({
    hasReservation: false,
    message: "現在、有効な特急券の予約はありません。",
  });
});

app.post("/api/reservation", (req, res) => {
  const order = req.body?.order;
  if (order && order.orderId) {
    ordersMap[order.orderId] = order;
    latestOrderId = order.orderId;
    return res.json({ status: "ok", message: "Reservation saved", order });
  }

  // キャンセルリクエストの場合
  if (req.body?.cancelOrderId) {
    delete ordersMap[req.body.cancelOrderId];
    return res.json({ status: "ok", message: "Reservation cancelled" });
  }

  res.json({ status: "ignored", message: "No valid order provided" });
});

// ヘルスチェックAPI
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
