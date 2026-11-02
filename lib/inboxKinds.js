// 📌 알림함 종류 한 곳(2026-10-31) — 운영자 "알림함 개선 · 디스코드 봇 메시지랑 연계". 봇 DM 도 알림함에 쌓인다(bot/src/inbox.js · models/Notification).
//    칩: 전체 / 운영팀 / 지급 / 기간 / 이벤트. 줄 아이콘은 칩마다 사이트 선 아이콘 하나(app/components/Icons.tsx — 경고 · 제재만 빨강).
//    ⚠️ 2026-10-31 시안 1차에 줄마다 아무 도트 아이템 그림을 붙였다가 "아이콘 장난하니.." — 종류 아이콘 하나로만
//    작은 글자(label)는 화면 글이라 가운데 점 없이 뜻만. 봇 메시지 틀 이름(「구매 지급 · 영구」 등)을 그대로 쓰지 않는다
export const INBOX_CATS = ["전체", "운영팀", "지급", "기간", "이벤트"];
export const INBOX_ICON = { 운영팀: "megaphone", 지급: "gift", 기간: "clock", 이벤트: "ticket" };

// kind(봇 메시지 키 · 사이트 안내 키) → { cat, label }
export const INBOX_KIND = {
  purchaseGranted: { cat: "지급", label: "구매 지급" },
  purchaseGrantedTimed: { cat: "지급", label: "구매 지급" },
  itemGrantNotice: { cat: "지급", label: "운영진 지급" },
  refunded: { cat: "지급", label: "환불" },
  boosterBonus: { cat: "지급", label: "부스팅 보상" },
  boosterStep: { cat: "지급", label: "부스팅 보상" },
  renewed: { cat: "기간", label: "기간 연장" },
  expiryReminder: { cat: "기간", label: "만료 임박" },
  expired: { cat: "기간", label: "기간 만료" },
  passUnclaimed: { cat: "기간", label: "시즌 패스" },
  goedamVoiceTicket: { cat: "이벤트", label: "괴담회 추첨권" },
  goedamGiftNotice: { cat: "이벤트", label: "문화상품권 당첨" },
  goedamPromo: { cat: "이벤트", label: "괴담회 소식" },
  goedamGroupApprove: { cat: "이벤트", label: "게임 그룹 지원" },
  goedamGroupReject: { cat: "이벤트", label: "게임 그룹 지원" },
};

// 단추 주소는 사이트 안 경로만(다른 곳으로 보내지 않는다)
const safePath = (u) => {
  const s = String(u || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "";
};

// 📌 알림 한 건 → 목록 줄 { key, href, at, unread, title, summary, cat, label, icon, warn, link }
//    운영팀 발송(kind 없음)은 칩 「운영팀」 · 작은 글자 = 종류(경고 · 제재 · 안내 · 축하 · 일반)
export function inboxRowOf(n, q = "") {
  const k = INBOX_KIND[n?.kind];
  const cat = k?.cat || "운영팀";
  const type = String(n?.type || "안내");
  const url = safePath(n?.link?.url);
  return {
    key: String(n?._id || ""),
    href: `/profile/notice/${n?._id}${q}`,
    at: n?.createdAt,
    unread: !n?.read,
    title: String(n?.title || ""),
    summary: String(n?.summary || "") || firstLine(n?.content),
    cat,
    label: k?.label || type,
    icon: INBOX_ICON[cat],
    warn: !k && (type === "경고" || type === "제재"),
    link: url && n?.link?.label ? { label: String(n.link.label), url } : null,
  };
}

// 📌 문의 답변 → 목록 줄(칩 「운영팀」 · 말풍선). 읽음은 이 기기의 본 목록(localStorage seenAnswerIds)
export function answerRowOf(a, seen) {
  return {
    key: `answer:${a?._id}`,
    href: "/profile/inquiry",
    at: a?.answeredAt || a?.updatedAt || a?.createdAt,
    unread: !seen?.has?.(a?._id),
    title: String(a?.title || "") || String(a?.content || "").slice(0, 40) || "문의 내역",
    summary: "답변이 등록되었습니다.",
    cat: "운영팀",
    label: "문의 답변",
    icon: "chat",
    warn: false,
    link: null,
    answerId: String(a?._id || ""),
  };
}

// 본문 첫 줄(서식 기호 · 아이템 태그 글자는 화면이 지운다)
function firstLine(s) {
  return String(s || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
}
