export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/mongodb";
import Item from "@/models/Item";
import BotSetting from "@/models/BotSetting";
import { catalogFind } from "@/lib/catalogDraft";
import BoosterStep from "@/models/BoosterStep";
import { isBoosterPerkItem, isBoosterMember, boosterRewardsOf, boostMonths, addMonthsKst } from "@/lib/booster";
import { fetchGuildMember } from "@/lib/discordMember";
import { normalizeEffects, describeEffect, perksOfItems, SKIN_OF, FRAME_OF } from "@/lib/itemEffects";
import { CARD_SKIN_KEYS } from "@/lib/botCards";

// 📌 서버 부스터 혜택(2026-10-24 운영자 「지정 아이템 보유」 · 화면 「비교형」) — 부스터 안내(/booster · /profile/booster)가 읽는다. 누구나 읽는다(혜택 목록은 공개 안내).
//    GET → data: {
//      base:  { chatMin, chatMax, voiceXp, voiceMin, attendXp } — 「일반」 열(봇 설정 그대로)
//      perks: { chat, voice, attend, cashback } — 「부스터」 열. 「서버 부스터 혜택」을 켠 아이템(lib/booster.js isBoosterPerkItem)의 합:
//             기본 효과 칸(chatBuffXp · voiceBuffXp · attendBuffXp) + 조건 없는 추가 효과(채팅 · 음성 · 출석 1회당 +N), 캐시백은 상한을 건 합(perksOfItems)
//      extras: 위 넷에 안 들어가는 효과 문장(요일 · 시간 · 채널 조건이 붙은 것 · 다른 종류) — 표에 한 줄씩
//      badge: 부스터 혜택 아이템 중 프로필 배지 효과가 있는 첫 아이템 { id, name, icon, imageUrl, color } | null — 머리 · 「전용 배지」 줄
//      skin · frame: 부스터 혜택 아이템의 첫 카드 테두리 · 프로필 테두리 효과 { key, label } | null(skin 은 botCard — 봇 /레벨 카드가 그릴 수 있나, 미리보기 디스코드 칸) — 「전용 카드 테두리」 · 「전용 프로필 테두리」 줄(2026-10-25 운영자 "혜택에도 추가해")
//      bonus: 최초 부스팅 보상 { xp, point } — 봇이 처음 부스트한 사람에게 한 번(봇 features/boosterBonus.js)
//      ladder: 연속 부스팅 단계 [{ months, xp, point }] — 부스트 시작일부터 이어진 개월, 단계마다 사람당 한 번. 둘 다 관리 › 레벨 설정 「서버 부스터 보상」(lib/booster.js boosterRewardsOf — 비면 기본값)
//      me:    로그인했으면 { booster: true | false | null(디스코드 확인 실패), since: 부스트 시작일 ISO | "", months: 이어 온 개월, got: [받은 단계 개월], next: { months, at(ISO) } | null } — 비로그인은 null
//    }
//    부스팅 중인 동안 이 아이템들을 가진 것으로 친다(사이트 lib/ownedItems.js · lib/inventory.js (C) · 봇 itemEffects (C)) — 화면 숫자와 지급이 같은 원천.
//    초안 모드(localhost)는 초안을 덧씌운 값(catalogFind). 쓰기 없음
const FIELDS = {
  name: 1, type: 1, icon: 1, imageUrl: 1, color: 1, visible: 1, boosterPerk: 1,
  effects: 1, chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1, sortOrder: 1, createdAt: 1,
};
// 「부스터」 열 칸에 바로 더하는 효과 — 조건(요일 · 시간 · 채널)이 없는 1회당 +N
const FLAT = { chat: "chat", voice: "voice", attend: "attend" };
const COSMETIC = new Set(["profileBadge", "cardSkin", "cardScene", "avatarFrame"]);
const plain = (e) => !(Array.isArray(e.days) && e.days.length) && e.hourFrom == null && e.hourTo == null && !(Array.isArray(e.channelIds) && e.channelIds.length);

export async function GET() {
  try {
    await connectToDatabase();
    const [rows, setting, session] = await Promise.all([
      catalogFind(Item, { boosterPerk: true }, { select: FIELDS, sort: { sortOrder: 1, createdAt: 1 } }),
      // 📌 boosterLadderOn 을 꼭 같이 — 빠지면 boosterRewardsOf 가 늘 꺼짐으로 보고 연속 부스팅 칸이 안 나왔다(2026-10-25)
      BotSetting.findOne({ key: "main" }, { chatXpMin: 1, chatXpMax: 1, voiceXp: 1, voiceIntervalSec: 1, attendXp: 1, boosterStartXp: 1, boosterStartPoint: 1, boosterLadder: 1, boosterLadderOn: 1 }).lean(),
      getServerSession(authOptions).catch(() => null),
    ]);
    const list = rows.filter(isBoosterPerkItem);
    const perks = { chat: 0, voice: 0, attend: 0, cashback: perksOfItems(list).shopCashback || 0 };
    const extras = [];
    let badge = null, skin = null, frame = null;
    for (const it of list) {
      perks.chat += Math.max(0, Number(it.chatBuffXp) || 0);
      perks.voice += Math.max(0, Number(it.voiceBuffXp) || 0);
      perks.attend += Math.max(0, Number(it.attendBuffXp) || 0);
      for (const e of normalizeEffects(it.effects)) {
        if (COSMETIC.has(e.on)) {
          if (e.on === "profileBadge" && !badge) badge = { id: String(it._id), name: it.name || "", icon: it.icon || "", imageUrl: it.imageUrl || "", color: it.color || "" };
          else if (e.on === "cardSkin" && !skin && SKIN_OF[e.skin]) skin = { key: e.skin, label: SKIN_OF[e.skin].l, botCard: CARD_SKIN_KEYS.includes(e.skin) };
          else if (e.on === "avatarFrame" && !frame && FRAME_OF[e.frame]) frame = { key: e.frame, label: FRAME_OF[e.frame].l };
          continue;
        }
        if (e.on === "shopCashback") continue;
        const k = FLAT[e.on];
        if (k && e.mode === "add" && plain(e)) { perks[k] += Math.max(0, Number(e.amount) || 0); continue; }
        const line = describeEffect(e);
        if (line && !extras.includes(line)) extras.push(line);
      }
    }
    const base = {
      chatMin: setting?.chatXpMin ?? 50,
      chatMax: setting?.chatXpMax ?? 500,
      voiceXp: setting?.voiceXp ?? 3000,
      voiceMin: Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60)),
      attendXp: setting?.attendXp ?? 7000,
    };
    // 내 부스터 상태 — 멤버 조회(60초 캐시) 한 번에 판정 · 부스트 시작일
    let me = null;
    const userId = session?.user?.id;
    if (userId) {
      const r = await fetchGuildMember(userId).catch(() => ({ status: "unknown" }));
      const booster = r.status === "ok" ? isBoosterMember(r.member) : r.status === "absent" ? false : null;
      me = { booster, since: booster && r.member?.premium_since ? String(r.member.premium_since) : "", months: 0, got: [], next: null };
    }
    const rw = boosterRewardsOf(setting);
    // 📌 연속 부스팅 — 이어 온 개월 · 받은 단계(봇이 남긴 BoosterStep — 닿은 뒤 봇 훑기 10분 안에 생긴다) · 다음 단계와 그 시각
    const sinceMs = me?.since ? Date.parse(me.since) : NaN;
    if (me && Number.isFinite(sinceMs)) {
      me.months = boostMonths(sinceMs);
      const rows = await BoosterStep.find({ userId }, { months: 1 }).lean().catch(() => []);
      me.got = rows.map((x) => Number(x.months)).filter(Number.isFinite);
      const nx = rw.ladder.find((x) => x.months > me.months && !me.got.includes(x.months));
      me.next = nx ? { months: nx.months, at: new Date(addMonthsKst(sinceMs, nx.months)).toISOString() } : null;
    }
    return NextResponse.json({ success: true, data: { base, perks, extras, badge, skin, frame, bonus: rw.start, ladder: rw.ladder, me } });
  } catch (e) {
    console.error("부스터 혜택 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
