import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { ScrimSeason, ScrimTeam, ScrimAvailability, ScrimFixture } from "@/models/Scrim";
import Auction from "@/models/Auction";

/* 📌 스크림 리그 API
   조율 기간·시간대는 시즌 하나로 통합 관리한다 (팀마다 다르면 교집합을 계산할 수 없다).
   운영 동작은 전부 관리자 세션으로 서버에서 검증한다 — 화면의 '운영 화면' 스위치는 표시용일 뿐이다. */

const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const clamp = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

// 시즌이 없으면 기본값으로 하나 만든다 (첫 진입에서 빈 화면이 뜨지 않도록)
const ensureSeason = async () => {
  let s = await ScrimSeason.findOne({ active: true }).sort({ createdAt: -1 });
  if (s) return s;
  const start = midnight(Date.now() + 864e5);
  const due = midnight(Date.now() + 864e5);
  due.setHours(23, 59, 0, 0);
  return ScrimSeason.create({ title: "스크림 리그", startAt: start, days: 7, fromHour: 19, toHour: 24, stepMin: 60, dueAt: due });
};

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return { session, ok: isAdminName(session?.user?.name) };
};

export async function GET() {
  try {
    await connectToDatabase();
    const session = await getServerSession(authOptions);
    const me = session?.user?.id || "";
    const season = await ensureSeason();
    const sid = String(season._id);

    const [teams, avails, fixtures] = await Promise.all([
      ScrimTeam.find({ seasonId: sid }).sort({ createdAt: 1 }).lean(),
      ScrimAvailability.find({ seasonId: sid }).lean(),
      ScrimFixture.find({ seasonId: sid }).sort({ at: 1 }).lean(),
    ]);

    // 팀별 응답을 붙여준다 — 일정 조율은 서로 보여야 하는 정보라 팀 안에서는 가리지 않는다
    const byTeam = new Map();
    avails.forEach((a) => {
      if (!byTeam.has(a.teamId)) byTeam.set(a.teamId, []);
      byTeam.get(a.teamId).push({ userId: a.userId, userName: a.userName, slots: a.slots });
    });

    const out = teams.map((t) => ({
      ...t,
      _id: String(t._id),
      avail: byTeam.get(String(t._id)) || [],
    }));

    return NextResponse.json({
      success: true,
      me,
      isAdmin: isAdminName(session?.user?.name),
      season: { ...season.toObject(), _id: sid },
      teams: out,
      fixtures: fixtures.map((f) => ({ ...f, _id: String(f._id) })),
    });
  } catch (e) {
    return NextResponse.json({ success: false, message: "불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const action = body.action || "";
    const season = await ensureSeason();
    const sid = String(season._id);

    switch (action) {
      /* ── 통합 시간 조정 (관리자) ── */
      case "season:update": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const from = clamp(body.fromHour, 0, 29, season.fromHour);
        const to = clamp(body.toHour, 1, 30, season.toHour);
        if (to <= from) return NextResponse.json({ success: false, message: "종료 시각은 시작 시각보다 뒤여야 합니다." }, { status: 400 });
        if (body.title !== undefined) season.title = String(body.title).slice(0, 40);
        if (body.startAt) season.startAt = midnight(body.startAt);
        season.days = clamp(body.days, 1, 21, season.days);
        season.fromHour = from;
        season.toHour = to;
        season.stepMin = Number(body.stepMin) === 30 ? 30 : 60;
        if (body.dueAt) season.dueAt = new Date(body.dueAt);
        await season.save();
        return NextResponse.json({ success: true });
      }

      /* ── 팀 ── */
      case "team:create": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const name = String(body.name || "").trim();
        if (!name) return NextResponse.json({ success: false, message: "팀 이름을 입력해 주세요." }, { status: 400 });
        const t = await ScrimTeam.create({
          seasonId: sid, name,
          tag: String(body.tag || name.slice(0, 3)).toUpperCase().slice(0, 4),
          color: /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#7dd3fc",
        });
        return NextResponse.json({ success: true, id: String(t._id) });
      }

      case "team:update": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const t = await ScrimTeam.findById(body.teamId);
        if (!t) return NextResponse.json({ success: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
        if (body.name !== undefined) t.name = String(body.name).trim().slice(0, 30) || t.name;
        if (body.tag !== undefined) t.tag = String(body.tag).toUpperCase().slice(0, 4);
        if (body.color !== undefined && /^#[0-9a-f]{6}$/i.test(body.color)) t.color = body.color;
        if (body.wins !== undefined) t.wins = clamp(body.wins, 0, 999, t.wins);
        if (body.losses !== undefined) t.losses = clamp(body.losses, 0, 999, t.losses);
        await t.save();
        return NextResponse.json({ success: true });
      }

      case "team:delete": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        await ScrimTeam.findByIdAndDelete(body.teamId);
        await ScrimAvailability.deleteMany({ teamId: body.teamId });
        await ScrimFixture.deleteMany({ $or: [{ teamAId: body.teamId }, { teamBId: body.teamId }] });
        return NextResponse.json({ success: true });
      }

      case "team:addMember": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const t = await ScrimTeam.findById(body.teamId);
        if (!t) return NextResponse.json({ success: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
        const discordId = String(body.discordId || "").trim();
        const name = String(body.name || "").trim();
        if (!name) return NextResponse.json({ success: false, message: "이름을 입력해 주세요." }, { status: 400 });
        if (discordId && t.members.some((m) => m.discordId === discordId)) {
          return NextResponse.json({ success: false, message: "이미 팀에 있는 사람입니다." }, { status: 409 });
        }
        t.members.push({ discordId, name, pos: String(body.pos || "").slice(0, 6), leader: !!body.leader });
        await t.save();
        return NextResponse.json({ success: true });
      }

      case "team:removeMember": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const t = await ScrimTeam.findById(body.teamId);
        if (!t) return NextResponse.json({ success: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
        const m = t.members[body.idx];
        if (!m) return NextResponse.json({ success: false, message: "대상을 찾을 수 없습니다." }, { status: 400 });
        if (m.discordId) await ScrimAvailability.deleteOne({ seasonId: sid, teamId: String(t._id), userId: m.discordId });
        t.members.splice(body.idx, 1);
        await t.save();
        return NextResponse.json({ success: true });
      }

      /* ── 경매 결과에서 팀 통째로 가져오기 ── */
      case "team:importAuction": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const a = await Auction.findById(body.auctionId).lean();
        if (!a) return NextResponse.json({ success: false, message: "경매를 찾을 수 없습니다." }, { status: 404 });
        const palette = ["#7dd3fc", "#a5b4fc", "#fcd34d", "#f0abfc", "#6ee7b7", "#fca5a5", "#c4b5fd", "#fdba74"];
        let made = 0;
        for (const [i, l] of (a.leaders || []).entries()) {
          const exists = await ScrimTeam.findOne({ seasonId: sid, auctionId: String(a._id), name: l.name });
          if (exists) continue;
          const members = [{ discordId: l.discordId || "", name: l.name, pos: l.position || "", leader: true }];
          (l.roster || []).forEach((r) => {
            if (r.playerIdx === -1) return; // 리더 본인은 위에서 넣었다
            const p = a.players?.[r.playerIdx];
            if (!p) return;
            members.push({ discordId: p.discordId || "", name: p.alias || "", pos: r.slot || "" });
          });
          await ScrimTeam.create({
            seasonId: sid, name: l.name, tag: l.name.slice(0, 3).toUpperCase(),
            color: palette[i % palette.length], auctionId: String(a._id), members,
          });
          made++;
        }
        return NextResponse.json({ success: true, made });
      }

      /* ── 개인 응답 ── */
      case "avail:submit": {
        const session = await getServerSession(authOptions);
        const uid = session?.user?.id;
        if (!uid) return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
        const t = await ScrimTeam.findById(body.teamId);
        if (!t) return NextResponse.json({ success: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
        const mine = t.members.some((m) => m.discordId === uid);
        if (!mine && !isAdminName(session?.user?.name)) {
          return NextResponse.json({ success: false, message: "이 팀의 팀원만 제출할 수 있습니다." }, { status: 403 });
        }
        const slots = Array.isArray(body.slots) ? body.slots.filter((s) => typeof s === "string").slice(0, 1000) : [];
        await ScrimAvailability.findOneAndUpdate(
          { seasonId: sid, teamId: String(t._id), userId: uid },
          { $set: { slots, userName: session?.user?.name || "", updatedAt: new Date() } },
          { upsert: true }
        );
        return NextResponse.json({ success: true });
      }

      case "avail:reset": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        await ScrimAvailability.deleteOne({ seasonId: sid, teamId: body.teamId, userId: body.userId });
        return NextResponse.json({ success: true });
      }

      /* ── 경기 ── */
      case "fixture:create": {
        const { ok, session } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        if (!body.teamAId || !body.teamBId || body.teamAId === body.teamBId) {
          return NextResponse.json({ success: false, message: "서로 다른 두 팀을 골라주세요." }, { status: 400 });
        }
        if (!body.at) return NextResponse.json({ success: false, message: "경기 시각이 필요합니다." }, { status: 400 });
        await ScrimFixture.create({
          seasonId: sid, teamAId: body.teamAId, teamBId: body.teamBId, at: new Date(body.at),
          usCount: Number(body.usCount) || 0, themCount: Number(body.themCount) || 0,
          createdBy: session?.user?.name || "",
        });
        return NextResponse.json({ success: true });
      }

      // 결과 입력 — 승패는 여기서만 움직인다 (팀 전적을 손으로 고치다 어긋나지 않게)
      case "fixture:result": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const f = await ScrimFixture.findById(body.fixtureId);
        if (!f) return NextResponse.json({ success: false, message: "경기를 찾을 수 없습니다." }, { status: 404 });
        const [A, B] = await Promise.all([ScrimTeam.findById(f.teamAId), ScrimTeam.findById(f.teamBId)]);
        // 이전 결과를 먼저 되돌린다
        const undo = (winner) => {
          if (!winner || winner === "draw") return;
          if (A && String(A._id) === winner) { A.wins = Math.max(0, A.wins - 1); if (B) B.losses = Math.max(0, B.losses - 1); }
          if (B && String(B._id) === winner) { B.wins = Math.max(0, B.wins - 1); if (A) A.losses = Math.max(0, A.losses - 1); }
        };
        const apply = (winner) => {
          if (!winner || winner === "draw") return;
          if (A && String(A._id) === winner) { A.wins += 1; if (B) B.losses += 1; }
          if (B && String(B._id) === winner) { B.wins += 1; if (A) A.losses += 1; }
        };
        undo(f.winnerId);
        const next = String(body.winnerId || "");
        if (next && next !== "draw" && next !== f.teamAId && next !== f.teamBId) {
          return NextResponse.json({ success: false, message: "이 경기의 팀이 아닙니다." }, { status: 400 });
        }
        apply(next);
        f.winnerId = next;
        f.scoreA = clamp(body.scoreA, 0, 99, 0);
        f.scoreB = clamp(body.scoreB, 0, 99, 0);
        if (body.note !== undefined) f.note = String(body.note).slice(0, 120);
        await Promise.all([f.save(), A?.save(), B?.save()]);
        return NextResponse.json({ success: true });
      }

      case "fixture:delete": {
        const { ok } = await requireAdmin();
        if (!ok) return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
        const f = await ScrimFixture.findById(body.fixtureId);
        if (f?.winnerId && f.winnerId !== "draw") {
          const [A, B] = await Promise.all([ScrimTeam.findById(f.teamAId), ScrimTeam.findById(f.teamBId)]);
          if (A && String(A._id) === f.winnerId) { A.wins = Math.max(0, A.wins - 1); if (B) B.losses = Math.max(0, B.losses - 1); }
          if (B && String(B._id) === f.winnerId) { B.wins = Math.max(0, B.wins - 1); if (A) A.losses = Math.max(0, A.losses - 1); }
          await Promise.all([A?.save(), B?.save()]);
        }
        await ScrimFixture.findByIdAndDelete(body.fixtureId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, message: "알 수 없는 요청입니다." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, message: "처리하지 못했습니다." }, { status: 500 });
  }
}
