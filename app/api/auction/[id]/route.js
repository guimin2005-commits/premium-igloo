export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Auction from "@/models/Auction";
import AuctionChat from "@/models/AuctionChat";

const totalSlots = (s) => (s.slotTank || 0) + (s.slotDealer || 0) + (s.slotHealer || 0);
const slotLimitOf = (S, slot) => (slot === "탱커" ? S.slotTank : slot === "딜러" ? S.slotDealer : S.slotHealer);
const slotCount = (leader, slot) => leader.roster.filter((r) => r.slot === slot).length;

const addLog = (auction, msg) => {
  auction.log.push({ t: new Date(), msg });
  if (auction.log.length > 100) auction.log = auction.log.slice(-100);
};

const sysChat = (auctionId, message) =>
  AuctionChat.create({ auctionId, message, isSystem: true }).catch(() => {});

// [상태 조회] — 폴링용. ?chatSince=ISO 로 신규 채팅만
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

    // ── 입장 알림 (최소화 표시용) ──
    if (action === "enter") {
      if (!body.userName?.trim()) return NextResponse.json({ success: true });
      await AuctionChat.create({
        auctionId: id,
        message: `${body.userName.trim()}님이 입장했습니다`,
        isSystem: true,
        kind: "join",
      });
      return NextResponse.json({ success: true });
    }

    // ── 채팅 ──
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

      // 전략 타임 중 입찰 불가
      if (auction.strategyUntil && Date.now() < new Date(auction.strategyUntil).getTime()) {
        return NextResponse.json({ success: false, message: "전략 타임 중에는 입찰할 수 없습니다." }, { status: 403 });
      }
      // 스카우터 타임 중 입찰 불가
      if (auction.current.scoutUntil && Date.now() < new Date(auction.current.scoutUntil).getTime()) {
        return NextResponse.json({ success: false, message: "스카우터 타임 중에는 입찰할 수 없습니다." }, { status: 403 });
      }
      // 카운트다운 종료 후 입찰 차단
      if (auction.current.endsAt && Date.now() > new Date(auction.current.endsAt).getTime()) {
        return NextResponse.json({ success: false, message: "카운트다운이 종료되어 입찰할 수 없습니다." }, { status: 403 });
      }

      const leader = auction.leaders[leaderIdx];
      const player = auction.players[playerIdx];
      if (!leader || !player) return NextResponse.json({ success: false }, { status: 400 });

      if (player.phase === 1 && auction.phase === 1 && leader.position === "탱커") {
        return NextResponse.json({ success: false, message: "탱커 포지션 리더는 1페이즈 경매에 참가할 수 없습니다." }, { status: 403 });
      }
      // 1페이즈에선 탱커 슬롯이 이미 찬 리더 입찰 불가
      if (auction.phase === 1 && slotCount(leader, "탱커") >= auction.settings.slotTank) {
        return NextResponse.json({ success: false, message: "탱커 슬롯이 이미 채워져 1페이즈에 입찰할 수 없습니다." }, { status: 403 });
      }
      const emptySlots = totalSlots(auction.settings) - leader.roster.length;
      if (emptySlots <= 0) {
        return NextResponse.json({ success: false, message: "모든 슬롯이 채워져 더 이상 입찰할 수 없습니다." }, { status: 403 });
      }

      let bidAmount = Number(amount);
      if (action === "allin") {
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
          return NextResponse.json({ success: false, message: `최소 입찰 단위는 ${auction.settings.minIncrement.toLocaleString()} Point 입니다.` }, { status: 400 });
        }
      }
      if (bidAmount > leader.points) {
        return NextResponse.json({ success: false, message: "보유 Point가 부족합니다." }, { status: 400 });
      }

      const endsAt = new Date(Date.now() + auction.settings.timerSeconds * 1000);
      const updated = await Auction.findOneAndUpdate(
        { _id: id, "current.playerIdx": playerIdx, "current.price": { $lt: bidAmount } },
        {
          $set: { "current.price": bidAmount, "current.leaderIdx": leaderIdx, "current.endsAt": endsAt, "current.isAllin": action === "allin" },
          $push: { log: { $each: [{ t: new Date(), msg: `${leader.name} ${action === "allin" ? "올인" : "입찰"} ${bidAmount.toLocaleString()} Point` }], $slice: -100 } },
        },
        { new: true }
      );
      if (!updated) return NextResponse.json({ success: false, message: "먼저 들어온 더 높은 입찰이 있습니다." }, { status: 409 });

      sysChat(id, `${leader.name}님이 [${player.isAllPos ? "올 포지션 선수" : player.alias}] ${action === "allin" ? "올인" : "입찰"} — ${bidAmount.toLocaleString()} Point`);
      return NextResponse.json({ success: true });
    }

    // ── 이하 액션은 문서 로드 후 저장 ──
    const auction = await Auction.findById(id);
    if (!auction) return NextResponse.json({ success: false }, { status: 404 });
    const S = auction.settings;

    switch (action) {
      // 스카우터: 호명된 현재 선수에 대해서만 사용 가능
      case "scout": {
        const { leaderIdx, playerIdx } = body;
        const leader = auction.leaders[leaderIdx];
        const player = auction.players[playerIdx];
        if (!leader || !player) return NextResponse.json({ success: false }, { status: 400 });
        if (auction.current.playerIdx !== playerIdx) {
          return NextResponse.json({ success: false, message: "호명된 선수에게만 스카우터를 사용할 수 있습니다." }, { status: 403 });
        }
        if (player.isAllPos) return NextResponse.json({ success: false, message: "올 포지션 선수는 스카우터를 사용할 수 없습니다." }, { status: 403 });
        if (player.scoutedBy.includes(leaderIdx)) return NextResponse.json({ success: false, message: "이미 스카우트한 선수입니다." }, { status: 409 });
        if (leader.points < S.scoutCost) return NextResponse.json({ success: false, message: "보유 Point가 부족합니다." }, { status: 400 });
        leader.points -= S.scoutCost;
        player.scoutedBy.push(leaderIdx);
        addLog(auction, `${leader.name} 스카우터 사용 → ${player.alias}`);
        await auction.save();
        return NextResponse.json({ success: true });
      }

      // 리더: 준비 완료 토글
      case "leader:ready": {
        const { leaderIdx, ready } = body;
        const leader = auction.leaders[leaderIdx];
        if (!leader) return NextResponse.json({ success: false }, { status: 400 });
        leader.ready = !!ready;
        addLog(auction, `${leader.name} ${ready ? "준비 완료" : "준비 해제"}`);
        await auction.save();
        sysChat(id, `${leader.name} 리더가 ${ready ? "준비를 완료했습니다." : "준비를 해제했습니다."}`);
        return NextResponse.json({ success: true });
      }

      case "host:start": {
        const notReady = auction.leaders.filter((l) => !l.ready);
        if (notReady.length > 0 && !body.force) {
          return NextResponse.json({ success: false, message: `아직 준비하지 않은 리더가 있습니다: ${notReady.map((l) => l.name).join(", ")}`, notReady: true }, { status: 409 });
        }
        auction.status = "진행중";
        addLog(auction, "경매 시작");
        await auction.save();
        sysChat(id, "경매가 시작되었습니다.");
        return NextResponse.json({ success: true });
      }

      case "host:end":
        auction.status = "종료";
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, scoutUntil: null, isAllin: false };
        auction.strategyUntil = null;
        addLog(auction, "경매 종료");
        await auction.save();
        sysChat(id, "모든 경매가 종료되었습니다.");
        return NextResponse.json({ success: true });

      // 개최자: 페이즈 시작 선언
      case "host:phase": {
        const { phase } = body;
        auction.phase = phase;
        if (phase === 2) {
          // 1페이즈에서 낙찰되지 못한 선수들은 자연스럽게 2페이즈로 편입
          auction.players.forEach((p) => {
            if (p.phase === 1 && (p.status === "유찰" || p.status === "경매중")) p.status = "대기";
          });
          auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, scoutUntil: null, isAllin: false };
        }
        addLog(auction, `${phase}페이즈 시작`);
        await auction.save();
        sysChat(id, phase === 1 ? "1페이즈 경매가 시작됩니다. 탱커 가능 선수들이 경매에 투입됩니다." : "2페이즈 경매가 시작됩니다.");
        return NextResponse.json({ success: true });
      }

      // 개최자: 선수 호명
      case "host:call": {
        const { playerIdx } = body;
        const player = auction.players[playerIdx];
        if (!player || player.status === "낙찰") return NextResponse.json({ success: false }, { status: 400 });
        if (auction.pendingAssign?.playerIdx !== null && auction.pendingAssign?.playerIdx !== undefined) {
          return NextResponse.json({ success: false, message: "이전 낙찰 선수의 슬롯 배정이 완료되지 않았습니다." }, { status: 409 });
        }
        if (auction.pendingOverflow?.leaderIdx !== null && auction.pendingOverflow?.leaderIdx !== undefined) {
          return NextResponse.json({ success: false, message: "황금카드 초과 배정 정리가 완료되지 않았습니다." }, { status: 409 });
        }
        if (auction.phase === 1 && player.phase !== 1) {
          return NextResponse.json({ success: false, message: "1페이즈에는 탱커 가능 선수만 호명할 수 있습니다." }, { status: 403 });
        }
        if (auction.phase === 0) {
          return NextResponse.json({ success: false, message: "먼저 페이즈를 시작해주세요." }, { status: 403 });
        }

        const base = player.isAllPos ? S.goldenBasePrice : S.basePrice;
        auction.players.forEach((p) => { if (p.status === "경매중") p.status = "대기"; });
        player.status = "경매중";
        // 스카우터 타임: 올포지션 선수는 스카우터 불가 → 즉시 경매
        const scoutUntil = player.isAllPos ? null : new Date(Date.now() + (S.scoutSeconds || 7) * 1000);
        auction.current = { playerIdx, price: base - 1, leaderIdx: null, endsAt: null, scoutUntil, isAllin: false };
        auction.reveal = { playerIdx: null };
        addLog(auction, `${player.isAllPos ? "올 포지션 선수" : player.alias} 호명 (시작가 ${base.toLocaleString()} Point)`);
        await auction.save();
        sysChat(id, `${player.isAllPos ? "[올 포지션 선수]" : player.alias} 경매가 시작되었습니다. 시작가 ${base.toLocaleString()} Point${scoutUntil ? ` · 스카우터 타임 ${S.scoutSeconds || 7}초` : ""}`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 낙찰 확정
      case "host:sold": {
        const { playerIdx, price, leaderIdx } = auction.current;
        if (playerIdx === null || leaderIdx === null) return NextResponse.json({ success: false, message: "입찰자가 없습니다." }, { status: 400 });
        const player = auction.players[playerIdx];
        const leader = auction.leaders[leaderIdx];

        // 1페이즈: 탱커 슬롯 자동 배정 (리더 선택 없음)
        if (auction.phase === 1) {
          if (slotCount(leader, "탱커") >= S.slotTank) {
            return NextResponse.json({ success: false, message: "해당 팀의 탱커 슬롯이 가득 찼습니다." }, { status: 400 });
          }
          leader.points -= price;
          leader.roster.push({ playerIdx, slot: "탱커", price, golden: false });
          player.status = "낙찰";
          player.soldTo = leaderIdx;
          player.soldPrice = price;
          auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, scoutUntil: null, isAllin: false };
          addLog(auction, `${player.alias} → ${leader.name} [탱커] 낙찰 (${price.toLocaleString()} Point)`);
          await auction.save();
          sysChat(id, `낙찰. ${player.alias} 선수가 ${leader.name} 팀 [탱커] 슬롯에 배정되었습니다. (${price.toLocaleString()} Point)`);
          return NextResponse.json({ success: true });
        }

        player.status = "배정중";
        auction.pendingAssign = { playerIdx, leaderIdx, price };
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, scoutUntil: null, isAllin: false };
        addLog(auction, `${player.alias} 낙찰 — ${leader.name} 슬롯 배정 대기`);
        await auction.save();
        sysChat(id, `낙찰. ${player.isAllPos ? "올 포지션 선수" : player.alias} — ${leader.name} 리더가 슬롯을 배정하고 있습니다. (${price.toLocaleString()} Point)`);
        return NextResponse.json({ success: true });
      }

      // 낙찰 리더(또는 진행자 대행): 슬롯 배정 확정
      case "assignSlot": {
        const { slot, byLeaderIdx } = body;
        const paPlayerIdx = auction.pendingAssign?.playerIdx;
        const paLeaderIdx = auction.pendingAssign?.leaderIdx;
        const paPrice = auction.pendingAssign?.price;
        if (paPlayerIdx === null || paPlayerIdx === undefined) {
          return NextResponse.json({ success: false, message: "배정 대기 중인 선수가 없습니다." }, { status: 400 });
        }
        if (byLeaderIdx !== null && byLeaderIdx !== undefined && byLeaderIdx !== paLeaderIdx) {
          return NextResponse.json({ success: false, message: "낙찰 리더만 슬롯을 배정할 수 있습니다." }, { status: 403 });
        }
        const player = auction.players[paPlayerIdx];
        const leader = auction.leaders[paLeaderIdx];

        const isFull = slotCount(leader, slot) >= slotLimitOf(S, slot);
        // 황금카드는 꽉 찬 슬롯에도 배정 가능 → 초과 정리 상태로 전환
        if (isFull && !player.isAllPos) {
          return NextResponse.json({ success: false, message: `${slot} 슬롯이 가득 찼습니다.` }, { status: 400 });
        }

        leader.points -= paPrice;
        leader.roster.push({ playerIdx: paPlayerIdx, slot, price: paPrice, golden: player.isAllPos });
        player.status = "낙찰";
        player.soldTo = paLeaderIdx;
        player.soldPrice = paPrice;
        auction.pendingAssign = { playerIdx: null, leaderIdx: null, price: null };

        if (isFull && player.isAllPos) {
          auction.pendingOverflow = { leaderIdx: paLeaderIdx, slot };
          addLog(auction, `올 포지션 선수 → ${leader.name} [${slot}] 초과 배정 — 기존 선수 이동 필요`);
          await auction.save();
          sysChat(id, `올 포지션 선수가 ${leader.name} 팀 [${slot}] 슬롯에 배정되었습니다. ${leader.name} 리더는 기존 선수 한 명을 다른 슬롯으로 이동해주세요.`);
          return NextResponse.json({ success: true, overflow: true });
        }

        addLog(auction, `${player.alias} → ${leader.name} [${slot}] 배정 완료 (${(paPrice || 0).toLocaleString()} Point)`);
        await auction.save();
        sysChat(id, `${player.alias} 선수가 ${leader.name} 팀 [${slot}] 슬롯에 배정되었습니다.`);
        return NextResponse.json({ success: true });
      }

      // 황금카드 초과 배정 정리: 기존 선수를 다른 슬롯으로 이동
      case "moveSlot": {
        const { rosterIdx, toSlot, byLeaderIdx } = body;
        const poLeaderIdx = auction.pendingOverflow?.leaderIdx;
        const poSlot = auction.pendingOverflow?.slot;
        if (poLeaderIdx === null || poLeaderIdx === undefined) {
          return NextResponse.json({ success: false, message: "이동이 필요한 상태가 아닙니다." }, { status: 400 });
        }
        if (byLeaderIdx !== null && byLeaderIdx !== undefined && byLeaderIdx !== poLeaderIdx) {
          return NextResponse.json({ success: false, message: "해당 리더만 이동할 수 있습니다." }, { status: 403 });
        }
        const leader = auction.leaders[poLeaderIdx];
        const entry = leader.roster[rosterIdx];
        if (!entry || entry.slot !== poSlot) {
          return NextResponse.json({ success: false, message: "초과된 슬롯의 선수를 선택해주세요." }, { status: 400 });
        }
        if (entry.golden) {
          return NextResponse.json({ success: false, message: "올 포지션 선수는 이동할 수 없습니다." }, { status: 400 });
        }
        if (toSlot === poSlot) return NextResponse.json({ success: false, message: "다른 슬롯을 선택해주세요." }, { status: 400 });
        // 탱커 슬롯으로의 이동은 금지 (단, 황금카드 초과로 밀려나는 탱커 슬롯 이탈은 허용)
        if (toSlot === "탱커") {
          return NextResponse.json({ success: false, message: "탱커 슬롯으로는 이동할 수 없습니다." }, { status: 400 });
        }
        if (slotCount(leader, toSlot) >= slotLimitOf(S, toSlot)) {
          return NextResponse.json({ success: false, message: `${toSlot} 슬롯이 가득 찼습니다.` }, { status: 400 });
        }
        const movedName = entry.playerIdx === -1 ? `${leader.name} (리더)` : auction.players[entry.playerIdx]?.alias;
        entry.slot = toSlot;
        auction.pendingOverflow = { leaderIdx: null, slot: null };
        addLog(auction, `${leader.name} 팀 — ${movedName} [${poSlot} → ${toSlot}] 이동`);
        await auction.save();
        sysChat(id, `${leader.name} 팀 — ${movedName} 선수가 [${toSlot}] 슬롯으로 이동했습니다.`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 낙찰 선수 디스코드 프로필 공개
      case "host:reveal": {
        const { playerIdx } = body;
        const player = auction.players[playerIdx];
        if (!player || player.status !== "낙찰") return NextResponse.json({ success: false, message: "낙찰된 선수만 공개할 수 있습니다." }, { status: 400 });
        if (!player.discordId) return NextResponse.json({ success: false, message: "이 선수에 등록된 디스코드 ID가 없습니다." }, { status: 400 });
        player.revealed = true;
        auction.reveal = { playerIdx };
        const leader = auction.leaders[player.soldTo];
        addLog(auction, `${player.alias} 프로필 공개`);
        await auction.save();
        sysChat(id, `${player.alias} 선수의 정체가 공개되었습니다. (${leader?.name} 팀)`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 전략 타임 시작/종료
      case "host:strategy": {
        const { seconds } = body;
        if (!seconds || seconds <= 0) {
          auction.strategyUntil = null;
          addLog(auction, "전략 타임 종료");
          await auction.save();
          sysChat(id, "전략 타임이 종료되었습니다. 경매를 재개합니다.");
        } else {
          auction.strategyUntil = new Date(Date.now() + seconds * 1000);
          addLog(auction, `전략 타임 ${Math.round(seconds / 60)}분 시작`);
          await auction.save();
          sysChat(id, `전략 타임이 시작되었습니다. (${Math.round(seconds / 60)}분) 리더와 팀원들은 전략을 논의해주세요.`);
        }
        return NextResponse.json({ success: true });
      }

      // 개최자: 유찰
      case "host:pass": {
        const { playerIdx } = auction.current;
        if (playerIdx === null) return NextResponse.json({ success: false }, { status: 400 });
        const player = auction.players[playerIdx];
        player.status = "유찰";
        auction.current = { playerIdx: null, price: 0, leaderIdx: null, endsAt: null, scoutUntil: null, isAllin: false };
        addLog(auction, `${player.alias} 유찰`);
        await auction.save();
        sysChat(id, `${player.alias} 선수가 유찰되었습니다.`);
        return NextResponse.json({ success: true });
      }

      // 개최자: 유찰 선수 강제 랜덤 배정
      case "host:assignPassed": {
        const passed = auction.players.map((p, i) => ({ p, i })).filter(({ p }) => p.status === "유찰");
        let assigned = 0;
        for (const { p, i } of passed.sort(() => Math.random() - 0.5)) {
          const candidates = auction.leaders
            .map((l, li) => ({ l, li }))
            .filter(({ l }) => l.roster.length < totalSlots(S))
            .sort((a, b) => a.l.points - b.l.points);
          if (candidates.length === 0) break;
          const { l, li } = candidates[0];
          const slots = [
            ...(slotCount(l, "탱커") < S.slotTank ? ["탱커"] : []),
            ...(slotCount(l, "딜러") < S.slotDealer ? ["딜러"] : []),
            ...(slotCount(l, "힐러") < S.slotHealer ? ["힐러"] : []),
          ];
          const fit = slots.find((s) => s === p.mainPos) || slots.find((s) => s === p.subPos) || slots[0];
          l.points -= S.basePrice;
          l.roster.push({ playerIdx: i, slot: fit, price: S.basePrice, golden: p.isAllPos });
          p.status = "낙찰";
          p.soldTo = li;
          p.soldPrice = S.basePrice;
          assigned++;
          addLog(auction, `유찰 배정: ${p.alias} → ${l.name} [${fit}]`);
        }
        await auction.save();
        sysChat(id, `유찰 선수 ${assigned}명이 랜덤 배정되었습니다.`);
        return NextResponse.json({ success: true, assigned });
      }

      // 포지션 체인지 — 경매 진행 중 리더가 유동적으로 1회 사용 (종료 후 불가)
      case "host:posSwap": {
        const { leaderIdx, a, b, byLeaderIdx } = body;
        const leader = auction.leaders[leaderIdx];
        if (!leader) return NextResponse.json({ success: false }, { status: 400 });
        if (auction.status === "종료") {
          return NextResponse.json({ success: false, message: "경매 종료 후에는 포지션 체인지를 사용할 수 없습니다." }, { status: 403 });
        }
        if (byLeaderIdx !== null && byLeaderIdx !== undefined && byLeaderIdx !== leaderIdx) {
          return NextResponse.json({ success: false, message: "본인 팀만 포지션 체인지를 사용할 수 있습니다." }, { status: 403 });
        }
        if (leader.positionChanged) return NextResponse.json({ success: false, message: "이미 포지션 체인지를 사용했습니다." }, { status: 409 });
        if (leader.points < S.posChangeCost) return NextResponse.json({ success: false, message: "보유 Point가 부족합니다." }, { status: 400 });
        const ra = leader.roster[a], rb = leader.roster[b];
        if (!ra || !rb) return NextResponse.json({ success: false }, { status: 400 });
        // 탱커 ↔ 타 포지션 교환 금지
        if ((ra.slot === "탱커") !== (rb.slot === "탱커")) {
          return NextResponse.json({ success: false, message: "탱커 슬롯은 타 포지션과 교환할 수 없습니다." }, { status: 400 });
        }
        // 같은 포지션끼리는 교환 의미가 없으므로 금지
        if (ra.slot === rb.slot) {
          return NextResponse.json({ success: false, message: "같은 포지션끼리는 변경할 수 없습니다." }, { status: 400 });
        }
        [ra.slot, rb.slot] = [rb.slot, ra.slot];
        leader.points -= S.posChangeCost;
        leader.positionChanged = true;
        addLog(auction, `${leader.name} 포지션 체인지 사용`);
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
