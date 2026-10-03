export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { MESSAGE_KEYS, mergeTemplate } from "@/lib/botMessages";
import { isKey, cleanTemplate } from "@/lib/botMessageClean";
import BotMessage from "@/models/BotMessage";
import BotMessageTest from "@/models/BotMessageTest";
import BotSetting from "@/models/BotSetting";

// 📌 관리자 '봇 메시지' 편집 API — 레벨업 · 역할 지급 · DM · 명령어 응답의 임베드 디자인 · 문구
//    GET              → 모든 키를 MESSAGE_DEFS 순서로 [{ key, custom, template(병합된 값), updatedAt, updatedBy }]
//    GET ?test=<id>   → 내 테스트 발송 한 건의 상태 { status, error }
//    PUT { key, template, baseUpdatedAt } → 정리해서 저장(upsert). template.card — 카드 키(CARD_KEYS)의 이미지 카드 켜기/끄기
//    DELETE ?key=     → 기본값으로 (문서 삭제)
//    POST { action:"test", key, template? } → 테스트 발송 대기열(BotMessageTest)에 넣는다 — 봇이 요청한 관리자 DM 으로 보낸다
//    저장된 문서는 봇이 1분 주기로 다시 읽는다(bot/src/botMessages.js).

const TEST_COOLDOWN_MS = 30 * 1000;

const fail = (message, status = 400, extra = {}) =>
  NextResponse.json({ success: false, message, error: message, ...extra }, { status });

// 템플릿 검사(색 · 주소 · 필드 수)는 lib/botMessageClean.js — 글마다 고친 디스코드 공지 디자인도 같은 규칙

// 📌 문서가 없는 키는 BotSetting 의 옛 한 줄 문구(levelupMessage · roleGrantMessage · roleGrantEnabled)를 반영한 기본값 — 봇과 같은 규칙
const loadLegacy = () => BotSetting.findOne({ key: "main" }).lean().catch(() => null);

const toItem = (key, doc, legacy) => ({
  key,
  custom: !!doc,
  template: mergeTemplate(key, doc || null, { legacy }),
  updatedAt: doc?.updatedAt || null,
  updatedBy: doc?.updatedBy || "",
});

// ── [조회] 전체 목록 · 테스트 발송 상태 ──
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;
  try {
    await connectToDatabase();

    const testId = request.nextUrl.searchParams.get("test");
    if (testId) {
      if (!mongoose.isObjectIdOrHexString(testId)) return fail("잘못된 요청입니다.");
      // 남의 테스트는 보지 않는다 — 요청한 관리자 본인 것만
      const t = await BotMessageTest.findOne({ _id: testId, userId: auth.userId }, { status: 1, error: 1, key: 1 }).lean();
      if (!t) return fail("테스트 요청을 찾을 수 없습니다.", 404);
      return NextResponse.json({ success: true, data: { id: String(t._id), key: t.key, status: t.status, error: t.error || "" } });
    }

    const [docs, legacy] = await Promise.all([BotMessage.find({ key: { $in: MESSAGE_KEYS } }).lean(), loadLegacy()]);
    const byKey = new Map(docs.map((d) => [d.key, d]));
    return NextResponse.json({ success: true, data: MESSAGE_KEYS.map((key) => toItem(key, byKey.get(key), legacy)) });
  } catch (e) {
    console.error("봇 메시지 조회 오류:", e);
    return fail("조회 중 오류가 발생했습니다.", 500);
  }
}

// ── [저장] 한 키 ──
//    📌 baseUpdatedAt — 화면이 불러온 시점의 updatedAt(없던 문서면 null). 그 사이 다른 관리자가 저장 · 초기화했으면 409 와 최신 값을 돌려준다.
//       화면은 초안을 그대로 둔 채 기준만 최신으로 바꾸므로, 한 번 더 저장하면 덮어쓴다(말없이 남의 저장을 지우지 않게).
export async function PUT(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;
  try {
    const b = await request.json().catch(() => null);
    const key = String(b?.key || "");
    if (!isKey(key)) return fail("알 수 없는 메시지입니다.");
    const c = cleanTemplate(key, b?.template);
    if (c.error) return fail(c.error);

    await connectToDatabase();
    const $set = { ...c.tpl, updatedAt: new Date(), updatedBy: auth.name || "" };
    const hasBase = b && Object.prototype.hasOwnProperty.call(b, "baseUpdatedAt");
    const base = hasBase && b.baseUpdatedAt ? new Date(b.baseUpdatedAt) : null;
    if (base && !Number.isFinite(base.getTime())) return fail("잘못된 요청입니다.");

    let doc = null;
    let conflict = false;
    if (!hasBase) {
      // 기준 없이 온 저장 — 그냥 덮어쓴다
      doc = await BotMessage.findOneAndUpdate({ key }, { $set }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }).lean();
    } else if (base) {
      // 불러온 뒤 아무도 안 바꿨을 때만
      doc = await BotMessage.findOneAndUpdate({ key, updatedAt: base }, { $set }, { returnDocument: "after" }).lean();
      conflict = !doc;
    } else {
      // 불러올 때 문서가 없었다(또는 updatedAt 이 빈 문서) — 그 사이 누가 먼저 만들었으면 key unique 에 걸린다
      //   📌 create 로 하면 updatedAt 이 빈 옛 문서가 있을 때 저장할 때마다 409 가 된다 — updatedAt:null 조건 upsert 로
      try {
        doc = await BotMessage.findOneAndUpdate({ key, updatedAt: null }, { $set }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }).lean();
      } catch (e) {
        if (e?.code !== 11000) throw e;
        conflict = true;
      }
    }

    if (conflict) {
      const [cur, legacy] = await Promise.all([BotMessage.findOne({ key }).lean(), loadLegacy()]);
      return fail("다른 관리자가 먼저 바꿨습니다. 한 번 더 저장하면 덮어씁니다.", 409, { data: toItem(key, cur, legacy) });
    }
    return NextResponse.json({ success: true, data: toItem(key, doc, null) });
  } catch (e) {
    console.error("봇 메시지 저장 오류:", e);
    return fail("저장 중 오류가 발생했습니다.", 500);
  }
}

// ── [기본값으로] 한 키의 문서를 지운다 ──
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;
  try {
    const key = String(request.nextUrl.searchParams.get("key") || "");
    if (!isKey(key)) return fail("알 수 없는 메시지입니다.");
    await connectToDatabase();
    await BotMessage.deleteOne({ key });
    const legacy = await loadLegacy();
    return NextResponse.json({ success: true, data: toItem(key, null, legacy) });
  } catch (e) {
    console.error("봇 메시지 초기화 오류:", e);
    return fail("기본값으로 되돌리지 못했습니다.", 500);
  }
}

// ── [테스트 발송] 내 DM 으로 ──
//    template 을 주면(저장 전 초안) 그 모양으로, 없으면 저장된 디자인으로 봇이 보낸다.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;
  try {
    const b = await request.json().catch(() => null);
    if (b?.action !== "test") return fail("알 수 없는 요청입니다.");
    const key = String(b?.key || "");
    if (!isKey(key)) return fail("알 수 없는 메시지입니다.");
    if (!auth.userId) return fail("디스코드 ID 를 확인할 수 없습니다. 다시 로그인해 주세요.");

    let template = null;
    if (b.template != null) {
      const c = cleanTemplate(key, b.template);
      if (c.error) return fail(c.error);
      template = c.tpl;
    }

    await connectToDatabase();
    // 📌 같은 관리자 · 같은 키로 30초 안에 또 누르면 409 — 찾기와 넣기를 한 번의 upsert 로 해서 연타 두 번이 둘 다 들어가지 않게
    const now = new Date();
    const res = await BotMessageTest.findOneAndUpdate(
      { key, userId: auth.userId, createdAt: { $gt: new Date(now.getTime() - TEST_COOLDOWN_MS) } },
      { $setOnInsert: { template, status: "pending", error: "", createdAt: now, claimedAt: null, sentAt: null } },
      { upsert: true, returnDocument: "after", includeResultMetadata: true }
    );
    if (res?.lastErrorObject?.updatedExisting) {
      const at = new Date(res.value?.createdAt || now).getTime();
      const wait = Math.max(1, Math.ceil((at + TEST_COOLDOWN_MS - now.getTime()) / 1000));
      return fail(`${wait}초 뒤에 다시 보낼 수 있습니다.`, 409, { retryAfter: wait });
    }
    const doc = res?.value;
    if (!doc?._id) return fail("테스트 요청을 넣지 못했습니다.", 500);
    return NextResponse.json({ success: true, data: { id: String(doc._id), status: doc.status || "pending" } });
  } catch (e) {
    console.error("봇 메시지 테스트 요청 오류:", e);
    return fail("테스트 요청 중 오류가 발생했습니다.", 500);
  }
}
