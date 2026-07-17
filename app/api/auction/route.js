export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Auction from "@/models/Auction";
import AuctionChat from "@/models/AuctionChat";

// [목록]
export async function GET() {
  try {
    await connectToDatabase();
    const auctions = await Auction.find().sort({ createdAt: -1 }).select("title status createdAt leaders players");
    const data = auctions.map((a) => ({
      _id: a._id,
      title: a.title,
      status: a.status,
      createdAt: a.createdAt,
      leaderCount: a.leaders.length,
      playerCount: a.players.length,
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
    // 📌 팀장 본인도 팀의 한 슬롯을 차지 (playerIdx: -1 = 팀장 자신)
    const leaders = (body.leaders || []).map((l) => ({
      name: l.name,
      discordId: l.discordId || "",
      position: l.position || "",
      points: settings.leaderPoints ?? 100000,
      positionChanged: false,
      roster: l.position ? [{ playerIdx: -1, slot: l.position, price: 0, golden: false }] : [],
    }));

    // 페이즈 자동 분류: 탱커 가능(주/부 탱커) & 올포 아님 → 1페이즈
    const players = (body.players || []).map((p) => ({
      alias: p.alias,
      discordId: p.discordId || "",
      revealed: false,
      peakTier: p.peakTier || "",
      currentTier: p.currentTier || "",
      mainPos: p.mainPos || "",
      subPos: p.subPos || "",
      isAllPos: !!p.isAllPos,
      phase: !p.isAllPos && (p.mainPos === "탱커" || p.subPos === "탱커") ? 1 : 2,
      status: "대기",
      soldTo: null,
      soldPrice: null,
      scoutedBy: [],
    }));

    const auction = await Auction.create({ title: body.title.trim(), settings, leaders, players });
    return NextResponse.json({ success: true, data: auction });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
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
