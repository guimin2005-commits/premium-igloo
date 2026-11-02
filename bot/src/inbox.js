// ── 알림함 기록 (2026-10-31) ──────────────────
//  📌 운영자 "알림함 개선할 필요가 있다 · 디스코드 봇 메시지랑 연계가 되던지 해야하는데 아무 기능도 없어" —
//     봇이 DM 을 보낼 때마다 사이트 알림함(models/Notification · 컬렉션 notifications)에도 한 줄. DM 이 막혀 못 갔어도 남긴다(dmSent false).
//     디스코드 DM 은 필수다("디스코드 디엠은 필수여") — 끄는 설정을 두지 않는다.
//  📌 제목 · 목록 한 줄(summary) · 단추(link — DM 단추와 같은 이름, 사이트 경로)는 아래 NOTE 가 종류마다 정한다.
//     본문(content) · 칸(detail — 수량 · 사유 …)은 보낸 DM 첫 임베드에서 옮긴다(디스코드 문법을 사이트 글로). 「사유」 같은 이름표는 상세 표에만
//     (2026-10-31 운영자 "사유 괴담회 진행 보상은 너무 어색" — 목록 줄엔 사유 글만)
//  ⚠️ 핀번호 같은 값은 DM 에도 싣지 않는다 — 여기서도 없다(번호는 사이트 「번호 확인」에서)
//  📌 게임 그룹 지원 승인은 사이트가 승인할 때 이미 한 줄 넣는다(lib/goedamGroup.js notify) — 그 DM(features/goedamWatch.js noticeGroups)은 기록하지 않는다
//  📌 90일 뒤 몽고 TTL 이 지운다(expireAt — db.js NotificationSchema). 종류 칩 · 작은 글자는 사이트 lib/inboxKinds.js 가 kind 로 정한다
import { Notification } from "./db.js";
import { SITE_URL, formatUntil } from "./botMessages.js";

const KEEP_MS = 90 * 86400000;
const INV = ["인벤토리", "/arctic/inventory"];
const DRAW = ["뽑기 하러 가기", "/level?event=goedam"];

// 종류마다 { title, summary, link: [단추 이름, 경로] } — v 는 그 DM 을 만든 값(틀 변수 + ticket 등)
const NOTE = {
  purchaseGranted: (v) => ({ title: `${v.item} 지급 완료`, summary: "이용 기간 영구", link: INV }),
  purchaseGrantedTimed: (v) => ({ title: `${v.item} 지급 완료`, summary: `이용 기간 ${v.days}일`, link: INV }),
  renewed: (v) => ({ title: `${v.item} 기간 연장`, summary: v.until ? `${v.until} 만료` : `+${v.days}일`, link: INV }),
  expiryReminder: (v) => ({ title: `${v.item} 기간이 곧 끝납니다`, summary: `${v.until} 만료`, link: v.renewUrl ? ["연장하기", v.renewUrl] : INV }),
  expired: (v) => ({ title: `${v.item} 기간 만료`, summary: `이용 기간 ${v.days}일이 끝나 회수되었습니다.`, link: ["다시 구매", "/arctic"] }),
  refunded: (v) => ({ title: `${v.item} 환불 완료`, summary: "결제한 XP와 빙옥을 돌려드렸습니다." }),
  itemGrantNotice: (v) => ({ title: `${v.item} ${v.qty} 지급`, summary: v.reason, link: v.ticket ? DRAW : INV }),
  goedamVoiceTicket: (v) => ({ title: `추첨권 ${v.count}장을 받았습니다`, summary: `괴담회 음성 채널 ${v.minutes}분 참여 보상입니다.`, link: DRAW }),
  goedamPromo: (v) => ({ title: `${v.prize || "문화상품권"} ${v.count}장 추가`, summary: v.until ? `${v.until}까지 추첨할 수 있습니다.` : "괴담회 추첨에서 뽑을 수 있습니다.", link: DRAW }),
  goedamGiftNotice: (v) => ({ title: `괴담회 뽑기 ${v.prize} 당첨`, summary: "번호는 내 당첨에서 확인할 수 있습니다.", link: ["번호 확인", "/level?event=goedam"] }),
  passUnclaimed: (v) => ({ title: `받지 않은 시즌 패스 보상 ${v.claimable}개`, summary: `${v.until} 시즌 종료`, link: ["보상 받기", "/level?tab=pass"] }),
  boosterBonus: (v) => ({ title: "최초 부스팅 보상 지급", summary: `${v.xp} XP와 빙옥 ${v.point}개를 받았습니다.` }),
  boosterStep: (v) => ({ title: `연속 부스팅 ${v.months}개월 보상 지급`, summary: `${v.xp} XP와 빙옥 ${v.point}개를 받았습니다.` }),
};

// 사이트 주소 → 경로(테스트 사이트에서도 그 자리로). 다른 곳 주소 · 이상한 값이면 ""(단추 없음)
function pathOf(url) {
  const s = String(url || "").trim();
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.origin === new URL(SITE_URL).origin ? `${u.pathname}${u.search}${u.hash}` : "";
  } catch {
    return "";
  }
}

// 디스코드 글 → 사이트 글 — 시각 표시(<t:…>)는 날짜로, 이모지 · 멘션은 빼고, [글](주소)는 글만. **굵게** 등은 사이트 서식(FormattedText)이 읽는다
function plain(s) {
  return String(s ?? "")
    .replace(/<t:(\d+)(?::[a-zA-Z])?>/g, (_, t) => formatUntil(Number(t) * 1000))
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<(?:@[!&]?|#)\d+>/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// 알림함에 한 줄 — 실패해도 DM 쪽은 그대로(로그만)
export async function logInbox(member, kind, vars, payload, sent) {
  const make = NOTE[kind];
  if (!make || !member?.id) return;
  try {
    const n = make(vars || {});
    const e = payload?.embeds?.[0];
    const d = e?.data ?? e ?? {};
    const summary = plain(n.summary || "").slice(0, 200);
    const content = (plain(d.description || payload?.content || "") || summary || n.title).slice(0, 2000);
    const detail = (Array.isArray(d.fields) ? d.fields : [])
      .map((f) => ({ name: plain(f?.name).slice(0, 40), value: plain(f?.value).slice(0, 200) }))
      .filter((f) => f.name && f.value)
      .slice(0, 8);
    const url = n.link ? pathOf(n.link[1]) : "";
    await Notification.create({
      recipientName: member.user?.username || member.displayName || String(member.id),
      recipientId: String(member.id),
      type: "안내",
      title: String(n.title || "").slice(0, 120),
      content,
      summary,
      source: "bot",
      kind,
      ...(url ? { link: { label: n.link[0], url } } : {}),
      detail,
      dmSent: !!sent,
      sentBy: "봇",
      expireAt: new Date(Date.now() + KEEP_MS),
    });
  } catch (err) {
    console.error(`📮 알림함 기록 실패 (${kind}):`, err?.message || err);
  }
}

// DM 한 통 + 알림함 한 줄. 보냈으면 true(DM 막힘 · 실패는 false — 던지지 않는다)
export async function dmAndLog(member, payload, kind, vars) {
  const ok = await member.send(payload).then(() => true).catch(() => false);
  await logInbox(member, kind, vars, payload, ok);
  return ok;
}
