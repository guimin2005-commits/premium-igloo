export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Auction from "@/models/Auction";
import AuctionChat from "@/models/AuctionChat";

const totalSlots = (s) => (s.slotTank || 0) + (s.slotDealer || 0) + (s.slotHealer || 0);
const slotCount = (leader, slot) => leader.roster.filter((r) => r.slot === slot).length;

const addLog = (auction, msg) => {
  auction.log.push({ t: new Date(), msg });
  if (auction.log.length > 100) auction.log = auction.log.slice(-100);
};

const sysChat = (auctionId, message) =>
  AuctionChat.create({ auctionId, message, isSystem: true }).catch(() => {});

// [상태 조회] — 1~2초 폴링용. ?chatSince=ISO 로 신규 채팅만
export async function GET(request, { params }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const auction = await Auction.findById(id);
    if (!auction) return NextResponse.json({ success: false }, { status: 404 });

    const chatSince = new URL(request.url).searchParams.get("chatSince");
    const chatQuery = { auctionId: id };
    if (chatSince) chatQuery.createdAt = { $gt: new Date(chatSince) };
    const chat = await AuctionChat.find(chatQuery).sort({ createdAt: 1 }).limit(80);

    return NextResponse.json({ success: true, auction, chat, now: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// [액션 처리]
export async function POST(request, { params }) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    // ── 채팅 (원자성 불필요) ──
    if (action === "chat") {
      if (!body.message?.trim()) return NextResponse.json({ success: false }, { status: 400 });
      await AuctionChat.create({
        auctionId: id,
        userName: body.userName || "익명",
        avatar: body.avatar || "",
        message: body.message.trim().slice(0, 200),
      });
      return NextResponse.json({ success: true });
    }

    // ── 입찰 (원자적 업데이트로 동시 충돌 방지) ──
    if (action === "bid" || action === "allin") {
      const { leaderIdx, amount, playerIdx } = body;
      const auction = await Auction.findById(id);
      if (!auction || auction.status !== "진행중") return NextResponse.json({ success: false, message: "진행 중인 경매가 아닙니다." }, { status: 400 });
      if (auction.current.playerIdx !== playerIdx) return NextResponse.json({ success: false, message: "경매 대상이 변경되었습니다." }, { status: 409 });

      const leader = auction.leaders[leaderIdx];
      const player = auction.players[playerIdx];
      if (!leader || !player) return NextResponse.json({ success: false }, { status: 400 });

      // 탱커 리더는 1페이즈 참가 불가
      if (player.phase === 1 && leader.position === "탱커") {
        return NextResponse.json({ success: false, message: "탱커 포지션 리더는 1페이즈 경매에 참가할 수 없습니다." }, { status: 403 });
      }
      // 슬롯이 모두 찼으면 입찰 불가
      const emptySlots = totalSlots(auction.settings) - leader.roster.length;
      if (emptySlots <= 0) {
        return NextResponse.json({ success: false, message: "모든 슬롯이 채워져 더 이상 입찰할 수 없습니다." }, { status: 403 });
      }

      let bidAmount = Number(amount);
      if (action === "allin") {
        // 올인: 남은 빈 슬롯(이번 낙찰 제외) × 기본가를 제외한 최대 금액
        const reserve = (emptySlots - 1) * auction.settings.basePrice;
        bidAmount = leader.points - reserve;
        if (bidAmount <= auction.current.price) {
          return NextResponse.json({ success: false, message: "올인 가능 금액이 현재가보다 낮습니다." }, { status: 400 });
        }
      } else {
        if (!bidAmount || bidAmount <= auction.current.price) {
          return NextResponse.json({ success: false, message: "현재가보다 높은 금액을 입찰해주세요." }, { status: 400 });
        }
        if (bidAmount - auction.current.price < auction.settings.minIncrement && auction.current.leaderIdx !== null) {
          return NextResponse.json({ success: false, message: `최소 입찰 단위는 ${auction.settings.minIncrement}pt 입니다.` }, { status: 400 });
        }
      }
      if (bidAmount > leader.points) {
        return NextResponse.json({ success: false, message: "보유 포인트가 부족합니다." }, { status: 400 });
      }

      // 원자적 업데이트: 그 사이 더 높은 입찰이 들어왔으면 실패
      const endsAt = new Date(Date.now() + auction.settings.timerSeconds * 1000);
      const updated = await Auction.findOneAndUpdate(
        { _id: id, "current.playerIdx": playerIdx, "current.price": { $lt: bidAmount } },
        {
          $set: { "current.price": bidAmount, "current.leaderIdx": leaderIdx, "current.endsAt": endsAt, "current.isAllin": action === "allin" },
          $push: { log: { $each: [{ t: new Date(), msg: `${leader.name} ${action === "allin" ? "🔥 올인" : "입찰"} ${bidAmount.toLocaleString()}pt` }], $slice: -100 } },
        },
        { new: true }
      );
      if (!updated) return NextResponse.json({ success: false, message: "먼저 들어온 더 높은 입찰이 있습니다." }, { status: 409 });

      sysChat(id, `🔨 ${leader.name}님이 [${player.isAllPos ? "황금카드" : player.alias}] ${action === "allin" ? "🔥 올인" : "입찰"} — ${bidAmount.toLocaleString()}pt!`);
      return NextResponse.json({ success: true });
    }

    // ── 이하 액션은 문서 로드 후 저장 (호스트 진행 · 스카우터) ──
    const auction = await Auction.findById(id);
    if (!auction) return NextResponse.json({ success: false }, { status: 404 });
    const S = auction.settings;

    switch (action) {
      // 스카우터: 리더가 비용 지불 후 선수 포지션 열람
      case "scout": {
        const { leaderIdx, playerIdx } = body;
        const leader = auction.leaders[leaderIdx];
        const player = auction.players[playerIdx];
        if (!leader || !player) return NextResponse.json({ success: false }, { status: 400 });
        if (player.isAllPos) return NextResponse.json({ success: false, message: "올 포지션 선수는 스카우터를 사용할 수 없습니다." }, { status: 403 });
        if (player.scoutedBy.includes(leaderIdx)) return NextResponse.json({ success: false, message: "이미 스카우트한 선수입니다." }, { status: 409 });
        if (leader.points < S.scoutCost) return NextResponse.json({ success: false, message: "포인트가 부족합니다." }, { status: 400 });
        leader.points -= S.scoutCost;
        player.scoutedBy.push(leaderIdx);
        addLog(auction, `${leader.name} 스카우터 사용 → ${player.alias}`);
        await auction.save();
        return NextResponse.json({ success: true });
      }

      // 개최자: 경매 시작/종료
      case "host:start":
        auction.status = "진행중";
        addLog(auction, "▶ 경매 시작");
        await auction.save();
        sysChat(id, "▶ 경매가 시작되었습니다!");
        return NextResponse.json({ success: true });

      case "host:end":
        auction.status = "종료";
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, isAllin: false };
        addLog(auction, "■ 경매 종료");
        await auction.save();
        sysChat(id, "■ 모든 경매가 종료되었습니다.");
        return NextResponse.json({ success: true });

      // 개최자: 선수 호명 (경매 개시)
      case "host:call": {
        const { playerIdx } = body;
        const player = auction.players[playerIdx];
        if (!player || player.status === "낙찰") return NextResponse.json({ success: false }, { status: 400 });
        const base = player.isAllPos ? S.goldenBasePrice : S.basePrice;
        auction.players.forEach((p) => { if (p.status === "경매중") p.status = "대기"; });
        player.status = "경매중";
        auction.current = { playerIdx, price: base - 1, leaderIdx: null, endsAt: null, isAllin: false }; // base부터 입찰 가능하도록 base-1
        addLog(auction, `📢 ${player.isAllPos ? "황금카드" : player.alias} 경매 시작 (시작가 ${base.toLocaleString()}pt)`);
        await auction.save();
        sysChat(id, `📢 ${player.isAllPos ? "✨ 황금카드 [올 포지션 선수]" : player.alias} 경매 시작! 시작가 ${base.toLocaleString()}pt`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 낙찰 확정 (+슬롯 배정)
      case "host:sold": {
        const { slot } = body;
        const { playerIdx, price, leaderIdx } = auction.current;
        if (playerIdx === null || leaderIdx === null) return NextResponse.json({ success: false, message: "입찰자가 없습니다." }, { status: 400 });
        const player = auction.players[playerIdx];
        const leader = auction.leaders[leaderIdx];

        // 슬롯 검증 (황금카드는 슬롯제 무시하고 자유 배정)
        const slotLimit = slot === "탱커" ? S.slotTank : slot === "딜러" ? S.slotDealer : S.slotHealer;
        if (!player.isAllPos && slotCount(leader, slot) >= slotLimit) {
          return NextResponse.json({ success: false, message: `${slot} 슬롯이 가득 찼습니다.` }, { status: 400 });
        }
        if (slotCount(leader, slot) >= slotLimit) {
          return NextResponse.json({ success: false, message: `${slot} 슬롯이 가득 찼습니다.` }, { status: 400 });
        }

        leader.points -= price;
        leader.roster.push({ playerIdx, slot, price, golden: player.isAllPos });
        player.status = "낙찰";
        player.soldTo = leaderIdx;
        player.soldPrice = price;
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, isAllin: false };
        addLog(auction, `✅ ${player.alias} → ${leader.name} 낙찰 ${price.toLocaleString()}pt [${slot}]`);
        await auction.save();
        sysChat(id, `✅ 낙찰! ${player.alias} → ${leader.name} 팀 [${slot}] · ${price.toLocaleString()}pt`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 유찰
      case "host:pass": {
        const { playerIdx } = auction.current;
        if (playerIdx === null) return NextResponse.json({ success: false }, { status: 400 });
        const player = auction.players[playerIdx];
        player.status = "유찰";
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, isAllin: false };
        addLog(auction, `↩ ${player.alias} 유찰`);
        await auction.save();
        sysChat(id, `↩ ${player.alias} 선수 유찰되었습니다.`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 유찰 선수 강제 랜덤 배정 (잔여 포인트 적은 팀 우선)
      case "host:assignPassed": {
        const passed = auction.players.map((p, i) => ({ p, i })).filter(({ p }) => p.status === "유찰");
        let assigned = 0;
        for (const { p, i } of passed.sort(() => Math.random() - 0.5)) {
          // 빈 슬롯 있는 팀 중 포인트 최저 팀
          const candidates = auction.leaders
            .map((l, li) => ({ l, li }))
            .filter(({ l }) => l.roster.length < totalSlots(S))
            .sort((a, b) => a.l.points - b.l.points);
          if (candidates.length === 0) break;
          const { l, li } = candidates[0];
          // 빈 슬롯 찾기
          const slots = [
            ...(slotCount(l, "탱커") < S.slotTank ? ["탱커"] : []),
            ...(slotCount(l, "딜러") < S.slotDealer ? ["딜러"] : []),
            ...(slotCount(l, "힐러") < S.slotHealer ? ["힐러"] : []),
          ];
          // 주/부 포지션과 맞는 슬롯 우선, 없으면 아무 빈 슬롯
          const fit = slots.find((s) => s === p.mainPos) || slots.find((s) => s === p.subPos) || slots[0];
          l.points -= S.basePrice;
          l.roster.push({ playerIdx: i, slot: fit, price: S.basePrice, golden: p.isAllPos });
          p.status = "낙찰";
          p.soldTo = li;
          p.soldPrice = S.basePrice;
          assigned++;
          addLog(auction, `🎲 유찰 배정: ${p.alias} → ${l.name} [${fit}]`);
        }
        await auction.save();
        sysChat(id, `🎲 유찰 선수 ${assigned}명이 랜덤 배정되었습니다.`);
        return NextResponse.json({ success: true, assigned });
      }

      // 개최자: 경매 종료 후 포지션 체인지 (팀당 1회, 비용 지불)
      case "host:posSwap": {
        const { leaderIdx, a, b } = body; // roster 인덱스 두 개 슬롯 교환
        const leader = auction.leaders[leaderIdx];
        if (!leader) return NextResponse.json({ success: false }, { status: 400 });
        if (leader.positionChanged) return NextResponse.json({ success: false, message: "이미 포지션 체인지를 사용했습니다." }, { status: 409 });
        if (leader.points < S.posChangeCost) return NextResponse.json({ success: false, message: "포인트가 부족합니다." }, { status: 400 });
        const ra = leader.roster[a], rb = leader.roster[b];
        if (!ra || !rb) return NextResponse.json({ success: false }, { status: 400 });
        [ra.slot, rb.slot] = [rb.slot, ra.slot];
        leader.points -= S.posChangeCost;
        leader.positionChanged = true;
        addLog(auction, `🔄 ${leader.name} 포지션 체인지 사용`);
        await auction.save();
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, message: "알 수 없는 액션" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
