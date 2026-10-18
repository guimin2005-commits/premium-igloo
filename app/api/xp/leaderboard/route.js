export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import WalletLog from "@/models/WalletLog";
import { kstMonthStart } from "@/lib/kst";
import { currentSeason, seasonStartMs } from "@/lib/season";
import { getSession } from "@/lib/apiAuth";
import { isAdminViewer } from "@/lib/adminViewServer";
import BotSetting from "@/models/BotSetting";
import { fetchGuildMember } from "@/lib/discordMember";
import { badgesOfUsers, framesOfUsers } from "@/lib/itemPerks";
import { monthBoard as monthBoardOf, totalBoard as totalBoardOf, rankTotalSince } from "@/lib/rankBoards";

// 📌 디스코드 멤버 정보 — 프로필 사진과 표시 이름을 함께 가져온다.
//    사진은 시상대(1~3위)에만, 이름은 UserXp 에 비어 있는 사람에게만 쓴다.
//    (봇의 grantXp 를 거치지 않고 XP 만 들어간 계정은 이름이 비어 있다)
const AVATAR_TTL = 10 * 60 * 1000;
let avatarCache = { at: 0, byUser: new Map() };

const defaultAvatar = (userId) => {
  // 디스코드 기본 아바타 — 새 유저명 체계는 (id >> 22) % 6
  let n = 0;
  try { n = Number((BigInt(userId) >> 22n) % 6n); } catch { n = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
};

async function fetchMembers(userIds) {
  const now = Date.now();
  if (now - avatarCache.at > AVATAR_TTL) avatarCache = { at: now, byUser: new Map() };

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const out = new Map();

  await Promise.all(
    userIds.map(async (id) => {
      if (avatarCache.byUser.has(id)) { out.set(id, avatarCache.byUser.get(id)); return; }
      const fallback = { avatar: defaultAvatar(id), name: "" };
      if (!GUILD_ID || !BOT_TOKEN) { out.set(id, fallback); return; }
      try {
        // 멤버 조회는 공용 캐시(lib/discordMember.js) — 세션 · 인벤토리와 같은 조회가 한꺼번에 몰려 429 가 나지 않게
        const r = await fetchGuildMember(id);
        if (r.status !== "ok") { out.set(id, fallback); return; }
        const m = r.member;
        // 서버 전용 프로필 사진이 있으면 그것을 우선한다
        const avatar = m?.avatar
          ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${id}/avatars/${m.avatar}.png?size=128`
          : m?.user?.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=128`
          : defaultAvatar(id);
        // 서버 별명 → 표시 이름 → 계정 이름 순
        const name = m?.nick || m?.user?.global_name || m?.user?.username || "";
        const info = { avatar, name };
        avatarCache.byUser.set(id, info);
        out.set(id, info);
      } catch {
        out.set(id, fallback);
      }
    })
  );
  return out;
}

// 사진은 첫 페이지 상위 3명(시상대)에만, 이름은 비어 있는 사람 전부에게 채운다.
const NO_NAME = "이름 없음";
async function decorate(rows, skip) {
  const needAvatar = skip === 0 ? rows.slice(0, 3).map((r) => r.userId) : [];
  const needName = rows.filter((r) => !r.name || r.name === NO_NAME).map((r) => r.userId);
  const ids = [...new Set([...needAvatar, ...needName])];
  if (ids.length === 0) return rows;
  const map = await fetchMembers(ids);
  const avatarSet = new Set(needAvatar);
  return rows.map((r) => {
    const info = map.get(r.userId);
    if (!info) return r;
    const out = { ...r };
    if (avatarSet.has(r.userId)) out.avatar = info.avatar;
    if ((!r.name || r.name === NO_NAME) && info.name) out.name = info.name;
    return out;
  });
}

// 📌 이름 옆 프로필 배지(최대 3) — 쪽 전체를 한 번에 모아 계산한다(lib/itemPerks badgesOfUsers · 구매 기록 기준 보유).
//    사진 · 이름 채우기(decorate)와 함께 돌리고, 배지 계산이 실패해도 랭킹은 그대로 보낸다
//    📌 시상대(첫 쪽 1~3위)는 낀 아바타 테두리(avatarFrame)도 — lib/itemPerks framesOfUsers. 실패해도 테두리만 빠진다
async function finish(rows, skip) {
  const [out, badgeMap, frameMap] = await Promise.all([
    decorate(rows, skip),
    badgesOfUsers(rows.map((r) => r.userId)).catch((e) => {
      console.error("랭킹 배지 계산 오류:", e?.message || e);
      return null;
    }),
    skip === 0
      ? framesOfUsers(rows.slice(0, 3).map((r) => r.userId)).catch((e) => {
          console.error("랭킹 테두리 계산 오류:", e?.message || e);
          return null;
        })
      : null,
  ]);
  if (!badgeMap?.size && !frameMap?.size) return out;
  return out.map((r) => {
    const badges = badgeMap?.get(r.userId), avatarFrame = frameMap?.get(r.userId);
    return badges || avatarFrame ? { ...r, ...(badges ? { badges } : {}), ...(avatarFrame ? { avatarFrame } : {}) } : r;
  });
}

// 📌 이번 달 · 누적 순위표 계산은 lib/rankBoards.js — 봇 /랭크 「기준」(bot/src/rankBoards.js)과 글자 그대로 같은 공용 블록(2026-10-18 운영자
//    "/랭크 명령어 뒤에 [현재] [누적] [이번 달] [음성 시간]"). 규칙 설명은 그 파일. 여기서는 모델을 넘기고, 누적만 30초 메모리 캐시로 감싼다
const RANK_MODELS = { UserXp, XpLog, Payout, Purchase, WalletLog, ObjectId: mongoose.Types.ObjectId };
const monthBoard = (monthStart) => monthBoardOf(RANK_MODELS, monthStart);
const TOTAL_TTL = 30 * 1000;
let totalCache = { at: 0, key: "", board: null };
// 구간 시작 — 시즌 시작과 내역 기준 시각 중 늦은 쪽
const totalSince = (ledgerSince) => rankTotalSince(seasonStartMs(currentSeason()), ledgerSince);
async function totalBoard(since) {
  const key = since.toISOString();
  if (totalCache.board && totalCache.key === key && Date.now() - totalCache.at < TOTAL_TTL) return totalCache.board;
  // 이름이 비면 "이름 없음"(공용 블록은 "" 로 준다 — 봇은 서버 멤버 이름으로 채운다)
  const board = (await totalBoardOf(RANK_MODELS, since)).map((r) => (r.name ? r : { ...r, name: NO_NAME }));
  totalCache = { at: Date.now(), key, board };
  return board;
}

// 📌 내 순위 한 줄(me=1) — 로그인한 본인 것만(세션 기준, 남의 순위는 물을 수 없다). 그 기준에서 순위가 없으면 null.
//    page = 이 limit 로 넘길 때 내가 있는 쪽(0 부터). 배지는 목록과 같은 판정(badgesOfUsers)
async function withMyBadges(row) {
  const map = await badgesOfUsers([row.userId]).catch(() => null);
  return map?.has(row.userId) ? { ...row, badges: map.get(row.userId) } : row;
}

// ── [조회] 랭킹 ──────────────────────────────────────────────
//   period=all   현재 XP        (UserXp.xp — 관리자 회수 · 초기화는 이미 빠져 있다)
//   period=total 누적 XP        (이번 시즌 얻은 XP 전부 = 현재 + 이번 시즌에 쓴 XP — totalBoard)
//   period=month 이번 달 획득   (이번 달 XpLog + 이번 달 지급된 XP − 관리자 회수 · 초기화 — monthBoard)
//   period=voice 누적 음성 시간 (UserXp.voiceSeconds — 시즌 2 개시일부터 적립, 10/3부터 실제 접속 초 · 봇 features/voiceTime.js)
//   skip/limit 으로 페이지를 넘긴다. 순위는 skip 을 더해 이어진다.
//   me=1 이면 로그인한 본인의 순위 · 값 · 쪽(me)을 함께 준다 — 목록에 없을 때 화면이 내 줄을 따로 그린다
export async function GET(request) {
  try {
    await connectToDatabase();
    // SYSTEM : LEVEL 비공개 동안은 전원 순위를 밖으로 내보내지 않는다 (화면만 가리면 API 로 새어 나간다)
    //   관리자 우회는 「유저 화면으로 보기」를 따른다(isAdminViewer — 켜 두면 유저처럼 막힌다)
    const gate = await BotSetting.findOne({ key: "main" }, { levelPublic: 1, ledgerSince: 1 }).lean();
    if (!gate?.levelPublic && !(await isAdminViewer())) {
      return NextResponse.json({ success: false, data: [], total: 0, message: "공개 전입니다." }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const skip = Math.max(0, parseInt(sp.get("skip") || "0", 10) || 0);
    const raw = sp.get("period");
    const period = raw === "month" || raw === "voice" || raw === "total" ? raw : "all";
    // 내 순위 — 세션의 본인 ID 만 쓴다(쿼리로 남의 ID 를 받지 않는다)
    const wantMe = sp.get("me") === "1";
    const session = wantMe ? await getSession() : null;
    const myId = session?.user?.id || "";
    const myName = session?.user?.name || "";
    const pageOf = (rank) => Math.floor((rank - 1) / limit);

    if (period === "total") {
      // 전원 값을 세어(캐시) 자른다 — 총원은 0 보다 큰 사람 전체
      const since = totalSince(gate?.ledgerSince);
      const board = await totalBoard(since);
      const rows = board.slice(skip, skip + limit);
      const myIdx = myId ? board.findIndex((r) => r.userId === myId) : -1;
      const totalData = await finish(rows.map((r, i) => ({ rank: skip + i + 1, ...r })), skip);
      let me = null;
      if (myIdx >= 0) {
        const r = board[myIdx];
        me = await withMyBadges({
          ...r,
          rank: myIdx + 1,
          page: pageOf(myIdx + 1),
          name: r.name === NO_NAME ? myName || NO_NAME : r.name,
        });
      }
      return NextResponse.json({ success: true, period, since, data: totalData, total: board.length, ...(wantMe ? { me } : {}) });
    }

    if (period === "month") {
      const monthStart = kstMonthStart();
      // 전원 값을 세고(이번 달 활동한 사람만이라 작다) 정렬한 뒤 잘라 낸다. 총원은 0 보다 큰 사람 전체여야 페이지 수가 맞는다
      const board = await monthBoard(monthStart);
      const rows = board.slice(skip, skip + limit);
      const myIdx = myId ? board.findIndex((r) => r.userId === myId) : -1;

      // 현재 레벨·이름은 UserXp 문서에서 채워 넣는다
      const docs = await UserXp.find(
        { userId: { $in: [...rows.map((r) => r.userId), ...(myIdx >= 0 ? [myId] : [])] } },
        { userId: 1, level: 1, displayName: 1 }
      ).lean();
      const byId = new Map(docs.map((u) => [u.userId, u]));

      const monthData = await finish(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r.userId,
          name: byId.get(r.userId)?.displayName || r.displayName || NO_NAME,
          xp: r.xp,
          level: byId.get(r.userId)?.level ?? 0,
        })),
        skip
      );
      let me = null;
      if (myIdx >= 0) {
        const r = board[myIdx];
        me = await withMyBadges({
          rank: myIdx + 1,
          page: pageOf(myIdx + 1),
          userId: myId,
          name: byId.get(myId)?.displayName || r.displayName || myName || NO_NAME,
          xp: r.xp,
          level: byId.get(myId)?.level ?? 0,
        });
      }
      return NextResponse.json({ success: true, period, monthStart, data: monthData, total: board.length, ...(wantMe ? { me } : {}) });
    }

    // 현재 · 음성 — 내 문서 하나로 내 순위를 센다(정렬과 같은 규칙: 값 내림차순, 동점은 userId 오름차순)
    const myDoc = myId
      ? await UserXp.findOne({ userId: myId }, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1, voiceSeconds: 1 }).lean()
      : null;

    if (period === "voice") {
      // 음성 시간은 시즌 2 개시일부터 쌓이므로 그 전에는 전원 0이다.
      // 0인 사람까지 줄 세우면 순위가 의미 없으므로 1초라도 있는 사람만 센다.
      const filter = { voiceSeconds: { $gt: 0 } };
      const myV = myDoc?.voiceSeconds || 0;
      const [rows, total, myAbove] = await Promise.all([
        UserXp.find(filter, { userId: 1, displayName: 1, username: 1, level: 1, voiceSeconds: 1 })
          .sort({ voiceSeconds: -1, userId: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserXp.countDocuments(filter),
        myV > 0 ? UserXp.countDocuments({ $or: [{ voiceSeconds: { $gt: myV } }, { voiceSeconds: myV, userId: { $lt: myId } }] }) : null,
      ]);

      const voiceData = await finish(
        rows.map((r, i) => ({
          rank: skip + i + 1,
          userId: r.userId,
          name: r.displayName || r.username || NO_NAME,
          level: r.level,
          voiceSeconds: r.voiceSeconds || 0,
        })),
        skip
      );
      const me = myAbove == null ? null : await withMyBadges({
        rank: myAbove + 1,
        page: pageOf(myAbove + 1),
        userId: myId,
        name: myDoc.displayName || myDoc.username || myName || NO_NAME,
        level: myDoc.level ?? 0,
        voiceSeconds: myV,
      });
      return NextResponse.json({ success: true, period, data: voiceData, total, ...(wantMe ? { me } : {}) });
    }

    const myXp = myDoc?.xp || 0;
    const [rows, total, myAbove] = await Promise.all([
      UserXp.find({}, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 })
        .sort({ xp: -1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserXp.countDocuments(),
      myDoc ? UserXp.countDocuments({ $or: [{ xp: { $gt: myXp } }, { xp: myXp, userId: { $lt: myId } }] }) : null,
    ]);

    const allData = await finish(
      rows.map((r, i) => ({
        rank: skip + i + 1,
        userId: r.userId,
        name: r.displayName || r.username || NO_NAME,
        xp: r.xp,
        level: r.level,
        attendCount: r.attendCount || 0,
      })),
      skip
    );
    const me = myAbove == null ? null : await withMyBadges({
      rank: myAbove + 1,
      page: pageOf(myAbove + 1),
      userId: myId,
      name: myDoc.displayName || myDoc.username || myName || NO_NAME,
      xp: myXp,
      level: myDoc.level ?? 0,
      attendCount: myDoc.attendCount || 0,
    });
    return NextResponse.json({ success: true, period, data: allData, total, ...(wantMe ? { me } : {}) });
  } catch (e) {
    console.error("리더보드 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], total: 0 }, { status: 500 });
  }
}
