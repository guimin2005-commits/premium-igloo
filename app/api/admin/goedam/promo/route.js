export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { loadGoedamConfig, goedamTicketInfo } from "@/lib/goedam";
import { serverMemberCount } from "@/lib/serverMembers";
import DmBlast from "@/models/DmBlast";
import XpLog from "@/models/XpLog";
import Purchase from "@/models/Purchase";
import GoedamCode from "@/models/GoedamCode";

// 📌 괴담회 홍보 DM(2026-11-01 운영자 "문화상품권 16개가 추가 됐거든 그거 홍보성 dm 보낼 거니까") — 관리 › 괴담회 「홍보 DM」 탭.
//    보내기는 단체 DM 한 건(models/DmBlast)을 만드는 것까지 — 실제 DM 은 봇(bot/src/features/dmBlast.js)이 한 통씩(1.5초 간격) 보낸다.
//    틀은 관리 › 봇 메시지 「괴담회 홍보」(goedamPromo) — 변수 prize · count(여기서 넣는다) · until(추첨 마감 1분 전)
//    GET  → { success, counts: { active, goedam, all }, codesLeft, until, blasts: [{ id, target, total, sent, failed, status, createdBy, createdAt, startedAt, finishedAt, vars }] }
//    POST { action: "send", target: "active" | "goedam" | "all", prize, count } → { success, blast }  (보내는 중인 단체 DM 이 있으면 409)
//    POST { action: "stop", id } → { success }
//    받는 사람: active — 최근 30일 XP 기록이 있는 사람 · goedam — 괴담회 추첨권을 받은 적 있는 사람 · all — 서버 전체(봇이 보낼 때 서버 멤버로 채운다)
const fail = (status, error) => NextResponse.json({ success: false, message: error, error }, { status });
const KEY = "goedamPromo";
const TARGETS = ["active", "goedam", "all"];
const PRIZE_MAX = 20;
const COUNT_MAX = 9999;
const DAY = 86400000;

// 날짜 → "2026.11.05 23:59"(KST) — 봇 formatUntil 과 같은 모양
const kst = (ms) => {
  if (!Number.isFinite(ms)) return "";
  const k = new Date(ms + 9 * 3600e3).toISOString();
  return `${k.slice(0, 4)}.${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
};
const iso = (d) => (d ? new Date(d).toISOString() : null);

async function recipientsOf(target) {
  if (target === "active") return (await XpLog.distinct("userId", { createdAt: { $gte: new Date(Date.now() - 30 * DAY) } })).map(String).filter(Boolean);
  if (target === "goedam") {
    const t = await goedamTicketInfo();
    if (!t.id) return [];
    return (await Purchase.distinct("userId", { itemRef: String(t.id) })).map(String).filter(Boolean);
  }
  return [];
}
const blastView = (b) => ({
  id: String(b._id),
  target: b.target,
  total: Number(b.total) || 0,
  sent: Number(b.sent) || 0,
  failed: Number(b.failed) || 0,
  status: b.status,
  createdBy: b.createdBy || "",
  createdAt: iso(b.createdAt),
  startedAt: iso(b.startedAt),
  finishedAt: iso(b.finishedAt),
  vars: b.vars && typeof b.vars === "object" ? b.vars : {},
});

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const cfg = await loadGoedamConfig();
    const [active, goedam, all, codesLeft, blasts] = await Promise.all([
      recipientsOf("active").then((l) => l.length),
      recipientsOf("goedam").then((l) => l.length),
      serverMemberCount().catch(() => 0),
      GoedamCode.countDocuments({ eventKey: cfg.key, userId: null }),
      DmBlast.find({ key: KEY }, { recipients: 0 }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    return NextResponse.json({
      success: true,
      counts: { active, goedam, all },
      codesLeft,
      until: kst(cfg.drawClosesAt.getTime() - 60_000),
      blasts: blasts.map(blastView),
    });
  } catch (e) {
    console.error("괴담회 홍보 DM 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    const body = await request.json().catch(() => ({}));
    await connectToDatabase();

    if (body?.action === "stop") {
      const id = String(body.id || "");
      if (!/^[0-9a-f]{24}$/i.test(id)) return fail(400, "잘못된 요청입니다.");
      const r = await DmBlast.updateOne({ _id: id, status: { $in: ["queued", "sending"] } }, { $set: { status: "stopped", stoppedBy: auth.name, finishedAt: new Date() } });
      if (!r.modifiedCount) return fail(409, "이미 끝났거나 멈춘 DM 입니다.");
      return NextResponse.json({ success: true });
    }

    if (body?.action !== "send") return fail(400, "잘못된 요청입니다.");
    const target = String(body.target || "");
    if (!TARGETS.includes(target)) return fail(400, "받는 사람을 골라 주세요.");
    const prize = String(body.prize ?? "").trim().slice(0, PRIZE_MAX) || "문화상품권";
    const count = Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > COUNT_MAX) return fail(400, `늘어난 수는 1~${COUNT_MAX} 사이로 넣어 주세요.`);
    // 한 번에 하나 — 보내는 중인 단체 DM 이 있으면 겹쳐 보내지 않는다
    if (await DmBlast.exists({ status: { $in: ["queued", "sending"] } })) return fail(409, "보내는 중인 DM 이 있습니다. 끝나거나 멈춘 뒤에 보내 주세요.");
    const recipients = target === "all" ? [] : [...new Set(await recipientsOf(target))];
    if (target !== "all" && !recipients.length) return fail(400, "받을 사람이 없습니다.");
    const cfg = await loadGoedamConfig();
    const doc = await DmBlast.create({
      key: KEY,
      vars: { prize, count: String(count), until: kst(cfg.drawClosesAt.getTime() - 60_000) },
      target,
      recipients,
      total: target === "all" ? await serverMemberCount().catch(() => 0) : recipients.length,
      status: "queued",
      createdBy: auth.name,
    });
    return NextResponse.json({ success: true, blast: blastView(doc.toObject()) });
  } catch (e) {
    console.error("괴담회 홍보 DM 보내기 오류:", e);
    return fail(500, "처리 중 오류가 발생했습니다.");
  }
}
