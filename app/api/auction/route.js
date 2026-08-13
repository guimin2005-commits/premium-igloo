export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import Auction from "@/models/Auction";
import AuctionChat from "@/models/AuctionChat";
import { phase1RoleOf } from "@/lib/auctionGames";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";

// [목록]
export async function GET() {
  try {
    await connectToDatabase();
    // 📌 테스트 방은 관리자에게만 노출
    const session = await getServerSession(authOptions);
    // 테스트 방과 비공개 방은 관리자에게만 목록에 보인다
    const query = isAdminName(session?.user?.name) ? {} : { isTest: { $ne: true }, isPrivate: { $ne: true } };
    const auctions = await Auction.find(query).sort({ createdAt: -1 }).select("title status createdAt leaders players game isTest isPrivate settings");
    const data = auctions.map((a) => ({
      _id: a._id,
      title: a.title,
      status: a.status,
      game: a.game,
      isTest: a.isTest,
      isPrivate: a.isPrivate,
      createdAt: a.createdAt,
      leaderCount: a.leaders.length,
      playerCount: a.players.length,
      // 📌 목록에서 '판돈' 감각을 보여주기 위한 포인트 지표
      pointPool: a.leaders.reduce((s, l) => s + (Number(l.points) || 0), 0),
      soldCount: a.players.filter((p) => p.status === "낙찰").length,
    }));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// [생성]
export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ success: false, message: "경매 제목이 필요합니다." }, { status: 400 });
    }

    const settings = { ...body.settings };
    const p1Role = phase1RoleOf(settings); // 선경매(1페이즈) 포지션 — 없으면 단일 페이즈

    // 📌 팀장 본인도 팀의 한 슬롯을 차지 (playerIdx: -1 = 팀장 자신)
    const leaders = (body.leaders || []).map((l) => ({
      name: l.name,
      discordId: l.discordId || "",
      position: l.position || "",
      points: settings.leaderPoints ?? 100000,
      positionChanged: false,
      roster: l.position ? [{ playerIdx: -1, slot: l.position, price: 0, golden: false }] : [],
    }));

    // 페이즈 자동 분류: 선경매 포지션(주/부) & 올포 아님 → 1페이즈. 선경매 포지션 없으면 전원 2페이즈(단일)
    const players = (body.players || []).map((p) => ({
      alias: p.alias,
      discordId: p.discordId || "",
      revealed: false,
      peakTier: p.peakTier || "",
      currentTier: p.currentTier || "",
      mainPos: p.mainPos || "",
      subPos: p.subPos || "",
      mostChampions: Array.isArray(p.mostChampions) ? p.mostChampions.filter((c) => c && c.trim()).slice(0, 1) : [],
      isAllPos: !!p.isAllPos,
      phase: !p.isAllPos && p1Role && (p.mainPos === p1Role || p.subPos === p1Role) ? 1 : 2,
      status: "대기",
      soldTo: null,
      soldPrice: null,
      scoutedBy: [],
    }));

    const auction = await Auction.create({ title: body.title.trim(), game: body.game || "오버워치", isTest: !!body.isTest, isPrivate: !!body.isPrivate, settings, leaders, players });
    return NextResponse.json({ success: true, data: auction });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// [전환] 공개 ↔ 비공개 (관리자만)
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const { id, isPrivate, title } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: "대상이 없습니다." }, { status: 400 });

    // 제목 수정 — 넘어온 항목만 바꾼다 (공개 전환과 같은 창구를 쓴다)
    if (title !== undefined) {
      const t = String(title).trim().slice(0, 60);
      if (!t) return NextResponse.json({ success: false, message: "제목을 입력해 주세요." }, { status: 400 });
      const renamed = await Auction.findByIdAndUpdate(id, { title: t }, { new: true, select: "title" });
      if (!renamed) return NextResponse.json({ success: false, message: "경매를 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ success: true, message: "제목을 변경했습니다.", data: { title: renamed.title } });
    }

    const auction = await Auction.findByIdAndUpdate(id, { isPrivate: !!isPrivate }, { new: true, select: "isPrivate" });
    if (!auction) return NextResponse.json({ success: false, message: "경매를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: auction.isPrivate ? "비공개로 전환했습니다." : "공개로 전환했습니다.",
      data: { isPrivate: auction.isPrivate },
    });
  } catch (e) {
    return NextResponse.json({ success: false, message: "전환 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// [삭제]
export async function DELETE(request) {
  try {
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await Auction.findByIdAndDelete(id);
    await AuctionChat.deleteMany({ auctionId: id });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
