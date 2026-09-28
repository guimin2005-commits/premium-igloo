// ── 봇 생존 신호 (30초 주기) ──────────────────
//  · BotStatus 한 문서에 lastSeen · startedAt(이번 구동 시작) · version(bot/package.json) 을 찍는다
//  · 관리자 대시보드(app/api/admin/bot-status)가 lastSeen 으로 켜짐/꺼짐을, lastError 로 최근 오류를 본다
//  · recordBotError — 처리되지 않은 오류(unhandledRejection · uncaughtException)를 lastError 에 남긴다
import { readFileSync } from "node:fs";
import { BotStatus } from "../db.js";
import { nudgeOnly } from "../config.js";

const TICK_MS = 30 * 1000;
const ERROR_FLUSH_MS = 1000;
const ERROR_MAX = 1000;

let version = "";
try {
  version = String(JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version || "");
} catch {
  version = "";
}

// 📌 문서 key — 본 봇은 "main". 재촉 DM 전용 모드는 "nudge" 로 따로 찍는다:
//    다른 곳에서 본 봇이 꺼져 있는데 재촉 전용 봇이 "main" 을 찍으면 대시보드가 지급 큐가 도는 줄 안다
const statusKey = nudgeOnly ? "nudge" : "main";
const bootAt = new Date(); // 이번 구동 시작 — 모듈을 읽은 때(프로세스 시작 직후)
let started = false;

async function beat() {
  // startedAt 은 매번 같은 값(부팅 시각)을 쓴다 — 첫 신호가 실패해도 다음 신호에서 채워진다
  await BotStatus.updateOne(
    { key: statusKey },
    { $set: { lastSeen: new Date(), startedAt: bootAt, version } },
    { upsert: true }
  );
}

export function startHeartbeat() {
  if (started) return;
  started = true;
  const run = () => beat().catch((e) => console.error("생존 신호 기록 오류:", e.message));
  run();
  setInterval(run, TICK_MS);
  console.log(`✅ 생존 신호 시작 (30초 주기 · ${statusKey}${version ? ` · v${version}` : ""})`);
}

// ── 최근 오류 ───────────────────────────────
//    오류가 몰려도 DB 쓰기는 1초에 한 번 — 마지막 오류만 남긴다. 던지지 않는다.
let pendingError = null;
let flushTimer = null;

function flushError() {
  flushTimer = null;
  const e = pendingError;
  pendingError = null;
  if (!e) return;
  BotStatus.updateOne(
    { key: statusKey },
    { $set: { lastError: e.message, lastErrorAt: e.at } },
    { upsert: true }
  ).catch(() => {});
}

export function recordBotError(err) {
  try {
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err?.message || err || "");
    const code = err?.code != null ? ` (${err.code})` : "";
    pendingError = { message: `${raw}${code}`.slice(0, ERROR_MAX), at: new Date() };
    if (!flushTimer) {
      flushTimer = setTimeout(flushError, ERROR_FLUSH_MS);
      flushTimer.unref?.();
    }
  } catch {
    // 오류 기록이 또 오류를 내면 안 된다
  }
}
