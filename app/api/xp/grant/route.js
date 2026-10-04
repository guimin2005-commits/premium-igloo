export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import UserXp from "@/models/UserXp";
import Payout from "@/models/Payout";
import { addPoints } from "@/lib/points";
import { parseTargetKeys, resolveTargets, unresolvedMessage, MAX_TARGETS } from "@/lib/adminTargets";
import { currentSeason, passRolloverSet } from "@/lib/season";

// 📌 대상 찾기 — 유저 ID 가 맞으면 그 한 명만. 아니면 사용자명 · 표시 이름으로 찾는다.
//    표시 이름은 고유하지 않아(남의 사용자명과 같을 수도 있다) 여러 명이 걸리면 호출부가 아무에게도 적용하지 않는다.
const findTargets = async (key, proj) => {
  const byId = await UserXp.find({ userId: key }, proj).lean();
  if (byId.length) return byId;
  return UserXp.find({ $or: [{ username: key }, { displayName: key }] }, proj).lean();
};
const ambiguous = (rows) =>
  NextResponse.json({
    success: false,
    message: `같은 이름의 유저가 ${rows.length}명입니다. 유저 ID로 지정해 주세요. (${rows.slice(0, 5).map((r) => `${r.displayName || r.username || "이름 없음"} ${r.userId}`).join(", ")})`,
    candidates: rows.map((r) => ({ userId: r.userId, username: r.username, displayName: r.displayName })),
  }, { status: 409 });

// ── [조회] 최근 수동 지급 이력 ──
export async function GET() {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;

    await connectToDatabase();
    const rows = await Payout.find({ source: { $in: ["manual", "admin"] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [지급] 관리자가 XP를 직접 주거나 회수 ──
//    실제 반영은 봇의 자동 지급 큐가 30초 안에 처리한다 (레벨 재계산 포함)
//    대상: { target } 한 명(또는 "all") · { targets: [...] } 여러 명(최대 200, 초기화는 안 됨)
export async function POST(request) {
  try {
    const { deny, session } = await requireAdmin();
    if (deny) return deny;

    await connectToDatabase();
    const body = await request.json();
    const { amount, reason, mode, currency } = body;
    const isPoint = currency === "point";

    // 📌 여러 명 — { targets: [...] }(lib/adminTargets.js). 키가 하나면 { target } 한 명 경로와 똑같이 처리한다(응답도 같다).
    //    targets 로 온 키는 "all"(전체)로 읽지 않는다 — 이름이 "all" 인 유저로 찾는다(붙여 넣은 칸이 전체 지급이 되지 않게)
    const listKeys = Array.isArray(body?.targets) ? parseTargetKeys(body.targets) : [];
    if (listKeys.length > MAX_TARGETS) {
      return NextResponse.json({ success: false, message: `한 번에 ${MAX_TARGETS}명까지 지정할 수 있습니다.` }, { status: 400 });
    }
    const fromList = listKeys.length > 0;
    const multi = listKeys.length > 1;
    const target = fromList ? (multi ? "" : listKeys[0]) : body.target;
    const isAll = !fromList && target === "all";

    // ── [초기화] 보유 XP를 0으로, 레벨을 시작점(Lv.1)으로 되돌린다 ──
    //    큐를 거치지 않고 즉시 반영한다 (누적값을 지우는 작업이라 증감으로는 표현할 수 없다)
    if (mode === "reset") {
      // 초기화는 되돌릴 수 없다 — 여러 명을 한 번에 지우지 않는다
      if (multi) {
        return NextResponse.json({ success: false, message: "초기화는 한 명 또는 전체만 할 수 있습니다." }, { status: 400 });
      }
      if (!isAll && !(target || "").trim()) {
        return NextResponse.json({ success: false, message: "초기화할 대상을 입력해주세요." }, { status: 400 });
      }

      const proj = { userId: 1, username: 1, displayName: 1, xp: 1 };
      const rows = isAll
        ? await UserXp.find({}, proj).lean()
        : await findTargets((target || "").trim(), proj);
      if (rows.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }
      if (!isAll && rows.length > 1) return ambiguous(rows);
      // 찾은 문서만 정확히 — 이름 조건으로 다시 걸면 확인한 대상 밖의 문서까지 초기화된다
      const filter = isAll ? {} : { userId: { $in: rows.map((r) => r.userId) } };

      // 📌 passBaseXp 를 같이 0 으로 되돌린다. 진행도가 xp - passBaseXp 이므로
      //    xp 만 0 으로 만들면 기준선(예전 누적치)이 남아 진행도가 남은 시즌 내내 0 에 얼어붙는다.
      //    시즌 롤오버는 passSeason 이 바뀔 때만 재스냅샷하므로 스스로 풀리지도 않는다.
      // 📌 2026-10-04 "해금과 받은 기록은 그대로 두고 진행도만 0으로 돌립니다" — 프리미엄 해금(passUnlocked · passUnlockPaid)과
      //    수령 기록(passClaimedFree · passClaimedPaid)은 건드리지 않는다. 지우면 빙옥을 내고 연 해금이 환불 없이 풀리고,
      //    XP 를 다시 모았을 때 이미 받은 보상을 또 받는다. 진행도 0 인 화면에 받은 칸이 '수령 완료'로 남는 것은 그대로 둔다
      // ⚠️ 강화 단계(chatEnhance/voiceEnhance)는 영구 값이다 — 이 $set 목록에 넣지 않는다 (lib/enhance.js).
      // 📌 레벨은 0 이 아니라 1 — 0 XP 도 Lv.1(getLevelByXp(0))이다. 0 으로 두면 봇 역할 동기화가
      //    지급 레벨 1 인 아이언 티어까지 회수한다. 최고 도달 레벨(maxLevel)도 비운다 —
      //    남겨 두면 레벨 업 퀘스트 기준(bot/src/xp.js top)이 예전 최고 레벨이라 다시 넘기 전까지 세지 않는다.
      // 📌 2026-10-04 검토 반영 — 이번 시즌 기준선이 아직 없는 문서(passSeason ≠ 지금 시즌)는 그 자리에서 이번 시즌 기준선 0 으로 찍는다(passRolloverSet).
      //    그냥 두면 나중 기준선 계산(lib/seasonPass.js)이 초기화 전 XP 를 시즌에 번 것으로 되짚어, 진행도가 0 이 아니게 잡히거나 시즌 내내 0 에 묶인다.
      //    그 문서의 해금 · 수령 기록은 지난 시즌 것이라 어차피 새 시즌 롤오버가 비운다(이번 시즌 것은 위 결정대로 둔다).
      //    순서 — 기준선 없는 문서를 먼저 찍고, 그다음 이번 시즌 문서의 진행도만 0(먼저 찍힌 문서도 같은 값이 한 번 더 들어갈 뿐). 그 사이 다른 요청이 찍어도 빠지는 문서가 없다
      const season = currentSeason();
      const now = new Date();
      const resetSet = { xp: 0, level: 1, maxLevel: 0, needsRoleSync: true, updatedAt: now };
      await UserXp.updateMany({ ...filter, passSeason: { $ne: season.number } }, { $set: { ...resetSet, ...passRolloverSet(season, 0, now) } });
      await UserXp.updateMany({ ...filter, passSeason: season.number }, { $set: { ...resetSet, passBaseXp: 0 } });

      // 감사 기록 — 이미 반영했으므로 봇 큐가 다시 집지 않도록 paid로 남긴다
      //    userName 은 required — 이름 없는 문서(큐로만 XP 를 받은 계정)는 ID 로 채운다.
      //    초기화는 위에서 이미 끝났다. 기록이 실패해도 실패로 응답하지 않는다(다시 누르면 같은 일을 또 하게 된다)
      //    📌 kind "reset" — 유저 내역(/api/xp/ledger)에 보이지 않는다(사유를 바꿔 적어도). 관리자 이름은 사유가 아니라 by 에
      const who = session?.user?.name || "admin";
      await Payout.insertMany(
        rows.map((r) => ({
          userName: r.displayName || r.username || r.userId,
          userId: r.userId,
          amount: -(r.xp || 0),
          reason: (reason || "").trim() || "관리자 초기화",
          source: "manual",
          kind: "reset",
          by: who,
          status: "paid",
          paidAt: new Date(),
        })),
        { ordered: false }
      ).catch((e) => console.error("초기화 기록 실패:", e));

      return NextResponse.json({
        success: true,
        message: `${rows.length}명의 XP·레벨을 초기화했습니다. 봇이 30초 이내에 레벨 보상 역할도 회수합니다.`,
        data: { count: rows.length },
      });
    }

    const value = Math.trunc(Number(amount) || 0);
    if (!value) {
      return NextResponse.json({ success: false, message: `지급할 ${isPoint ? "빙옥" : "XP"}을 입력해주세요. (회수는 음수)` }, { status: 400 });
    }

    // 대상 확인 — "all"이면 XP 기록이 있는 전원
    //    📌 회수는 보유량을 대상 찾기에서 같이 읽는다 — 사람마다 다시 읽으면 200명에 왕복 200번이 더 든다
    const tProj = { userId: 1, username: 1, displayName: 1, ...(value < 0 ? (isPoint ? { point: 1 } : { xp: 1 }) : {}) };
    let targets = [];
    if (isAll) {
      targets = await UserXp.find({}, tProj).lean();
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "지급 대상이 없습니다." }, { status: 404 });
      }
    } else if (multi) {
      // 📌 전부 아니면 없음 — 못 찾은 키 · 겹치는 이름이 하나라도 있으면 아무에게도 주지 않는다. 통과하면 아래는 전체 지급과 같은 길
      const r = await resolveTargets(listKeys, tProj);
      if (r.missing.length || r.ambiguous.length) {
        return NextResponse.json({
          success: false,
          message: unresolvedMessage(r.missing, r.ambiguous),
          missing: r.missing,
          ambiguous: r.ambiguous,
        }, { status: 409 });
      }
      targets = r.found;
    } else {
      const key = (target || "").trim();
      if (!key) {
        return NextResponse.json({ success: false, message: "지급 대상을 입력해주세요." }, { status: 400 });
      }
      targets = await findTargets(key, tProj);
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }
      if (targets.length > 1) return ambiguous(targets);
    }

    // 📌 기본 사유는 유저 내역에 그대로 보인다 — 관리자 이름을 붙이지 않고 by 에 따로 남긴다(감사용)
    const who = session?.user?.name || "admin";
    const baseReason = (reason || "").trim() || `관리자 ${value > 0 ? "지급" : "회수"}`;

    // ── 빙옥 — 봇 큐 없이 즉시 반영하고, 감사 기록은 paid 로 남긴다 ──
    if (isPoint) {
      const paidDocs = [];
      try {
        for (const t of targets) {
          let give = value;
          if (value < 0) {
            // 잔액이 이미 0 아래인 옛 문서에서 회수가 지급으로 뒤집히지 않게 0 에서 자른다
            //    (대상 찾기에서 읽은 잔액 — 실제 차감은 addPoints 가 조건부로 다시 본다)
            give = -Math.min(Math.abs(value), Math.max(0, t.point ?? 0));
            if (give === 0) continue;
          }
          const applied = await addPoints(t.userId, give);
          if (!applied) continue; // 동시에 써서 잔액이 모자라면 건너뛴다 (마이너스 금지)
          paidDocs.push({
            userName: t.displayName || t.username || t.userId,
            userId: t.userId,
            amount: give,
            reason: baseReason,
            source: "manual",
            by: who,
            status: "paid",
            paidAt: new Date(),
            currency: "point",
          });
        }
      } catch (e) {
        // 📌 도중에 끊기면 이미 반영된 사람의 기록부터 남기고 몇 명까지 됐는지 알린다 — 그냥 실패로 답하면 다시 눌러 두 번 들어간다
        if (paidDocs.length === 0) throw e;
        console.error("빙옥 지급 도중 중단:", e);
        await Payout.insertMany(paidDocs, { ordered: false }).catch((err) => console.error("빙옥 지급 기록 실패:", err));
        return NextResponse.json({
          success: false,
          partial: true,
          message: `${paidDocs.length}명까지 빙옥을 ${value > 0 ? "지급" : "회수"}하고 중단했습니다. 지급 내역을 확인해 주세요.`,
          data: { count: paidDocs.length },
        }, { status: 500 });
      }
      if (paidDocs.length === 0) {
        return NextResponse.json({ success: false, message: value < 0 ? "회수할 빙옥이 있는 유저가 없습니다." : "지급 대상이 없습니다." }, { status: 400 });
      }
      // 빙옥은 위 루프에서 이미 반영됐다 — 기록이 실패해도 실패로 응답하면 관리자가 다시 눌러 두 번 지급된다
      await Payout.insertMany(paidDocs, { ordered: false }).catch((e) => console.error("빙옥 지급 기록 실패:", e));
      return NextResponse.json({
        success: true,
        message: `${paidDocs.length}명에게 빙옥을 ${value > 0 ? "지급" : "회수"}했습니다.`,
        data: { count: paidDocs.length },
      });
    }

    // 회수는 보유량을 넘지 않게 잘라 넣는다 (마이너스 방지)
    //    아직 봇이 끝내지 않은 회수(대기 · 처리 중 음수)도 보유량에서 빼고 본다 — 연달아 걸면 합이 보유량을 넘는다
    const pendingCut = new Map();
    if (value < 0) {
      const rows = await Payout.aggregate([
        { $match: { userId: { $in: targets.map((t) => t.userId) }, status: { $in: ["pending", "processing"] }, currency: { $ne: "point" }, amount: { $lt: 0 } } },
        { $group: { _id: "$userId", s: { $sum: "$amount" } } },
      ]);
      for (const r of rows) pendingCut.set(r._id, r.s);
    }
    const docs = [];
    for (const t of targets) {
      let give = value;
      if (value < 0) {
        // 보유량이 이미 0 아래인 옛 문서(과거 회수 경합)에서 회수가 지급으로 뒤집히지 않게 0 에서 자른다
        //    보유량은 대상 찾기에서 같이 읽은 값(tProj)
        const room = Math.max(0, Math.max(0, t.xp ?? 0) + (pendingCut.get(t.userId) || 0));
        give = -Math.min(Math.abs(value), room);
        if (give === 0) continue;
      }
      docs.push({
        userName: t.displayName || t.username || t.userId,
        userId: t.userId,
        amount: give,
        reason: baseReason,
        source: "manual",
        by: who,
        currency: "xp",
      });
    }

    if (docs.length === 0) {
      return NextResponse.json({ success: false, message: "회수할 XP가 있는 유저가 없습니다." }, { status: 400 });
    }
    await Payout.insertMany(docs);

    return NextResponse.json({
      success: true,
      message: `${docs.length}명에게 ${value > 0 ? "지급" : "회수"} 예약했습니다. 봇이 30초 이내에 반영합니다.`,
      data: { count: docs.length },
    });
  } catch (e) {
    console.error("XP 수동 지급 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
