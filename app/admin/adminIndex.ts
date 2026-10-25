// 📌 관리자 색인 한 벌 — 좌측 메뉴(AdminNav.tsx)와 기능 검색(AdminSearch.tsx)이 이 파일 하나를 쓴다.
//    페이지 → 탭 → 패널 → 명령을 한 목록에 적는다. 메뉴를 고치면 검색도 따라간다(메뉴 = kind "page" 항목).
//    서버 호출 없는 정적 색인이다. 주소는 지금 있거나 각 화면이 받는 것만:
//      · 탭 ?tab=<id> · 패널 &sec=<id>(Panel id="sec-<id>" 로 스크롤 — 레벨 설정 · 시즌 패스 · 대시보드 · 통계)
//      · 명령 ?new=1(새로 만들기 칸) · ?open=<창>(창 열기) · ?edit=<상품 id> · ?item=<아이템 id> · ?key=<봇 메시지 키>
//    모르는 값이 와도 화면은 첫 탭으로 열린다(죽은 링크가 되지 않는다).
//    항목 꼴: { id, label, crumb(「레벨 설정 › 정책」), href, keywords, kind, icon }
//    ⚠ 이벤트 패스(/admin/event-pass)는 다른 세션이 만든 화면 — 화면이 있을 때만 둔다(app/admin/event-pass/page.tsx)
import type { IconName } from "../components/Icons";

export type AdminKind = "page" | "tab" | "section" | "action";
export type AdminCountKey = "inquiry" | "apply" | "orders" | "supportReports";
export type AdminCounts = Record<AdminCountKey, number>;
export const EMPTY_COUNTS: AdminCounts = { inquiry: 0, apply: 0, orders: 0, supportReports: 0 };
// 화면이 처리 뒤 메뉴 숫자를 바로 다시 세게 할 때: window.dispatchEvent(new Event(ADMIN_COUNTS_EVENT))
export const ADMIN_COUNTS_EVENT = "igloo:admin-counts";

export type AdminEntry = {
  id: string;
  label: string;
  crumb: string;
  href: string;
  keywords: string;
  kind: AdminKind;
  icon: IconName;
};

// 메뉴 칸 — 켜짐 판정: 경로가 path(또는 also 중 하나)이고 need 쿼리가 모두 맞을 때
export type AdminNavPage = AdminEntry & {
  kind: "page";
  group: string;
  path: string;
  also?: string[];
  need?: Record<string, string>;
  count?: AdminCountKey;
};
export type AdminNavGroup = { label: string; items: AdminNavPage[] };

// ── 페이지(= 좌측 메뉴) ─────────────────────────────────────
//    묶음 차례 · 칸 차례가 곧 메뉴 차례다(2026-10-17 정리: 20칸 → 18칸)
type PageDef = Omit<AdminNavPage, "id" | "kind" | "crumb" | "path"> & { key: string; path?: string };
const PAGE_DEFS: PageDef[] = [
  // 허브
  { key: "dashboard", group: "허브", label: "대시보드", href: "/admin", icon: "home", keywords: "홈 첫 화면 확인할 일 점검 모드 봇 상태 dashboard" },
  { key: "economy", group: "허브", label: "통계", href: "/admin/economy", icon: "trend", keywords: "재화 통계 경제 XP 발행 XP 사용 순증 빙옥 유통 일별 상품별 판매 서버 활동 골든타임 멤버 증감 statistics" },
  // 운영
  { key: "users", group: "운영", label: "유저 조회", href: "/admin/users", icon: "user", keywords: "유저 검색 회원 닉네임 디스코드 ID 인벤토리 구매 기록 역할 회수 XP 내역 지급 제재 member" },
  { key: "sanctions", group: "운영", label: "제재 · 잠수", href: "/admin/sanctions", also: ["/admin/activity"], icon: "eye", keywords: "제재 기록 잠수 기록 이상 활동 음성 XP 정지 XP 획득 중단 해제 잠수 확인 이동 횟수 AFK" },
  { key: "inquiry", group: "운영", label: "1:1 문의", href: "/support?admin=1", need: { admin: "1" }, count: "inquiry", icon: "chat", keywords: "문의 답변 미답변 접수 중 고객 센터 inquiry" },
  { key: "apply", group: "운영", label: "구인 지원자", href: "/recruit?admin=1", need: { admin: "1" }, count: "apply", icon: "briefcase", keywords: "지원서 심사 중 지원자 합격 불합격 구인 apply" },
  { key: "notify", group: "운영", label: "알림 발송", href: "/admin/notify", icon: "bell", keywords: "회원 통지 통지서 발송 경고 제재 안내 축하 일반 DM 알림함 발송 이력" },
  { key: "supporters", group: "운영", label: "서포터즈", href: "/admin/supporters", count: "supportReports", icon: "shieldCheck", keywords: "서포터즈 평가 신고 피드백 월 정산 서포터즈 설정" },
  // 콘텐츠
  { key: "write", group: "콘텐츠", label: "글쓰기", href: "/write?category=공지사항", path: "/write", icon: "megaphone", keywords: "글 작성 공지 이벤트 구인 대회 서포터즈 공지 post notice" },
  { key: "auction", group: "콘텐츠", label: "경매", href: "/admin/auction", icon: "flag", keywords: "경매 목록 경매 개최 경매장 낙찰 auction" },
  { key: "honors", group: "콘텐츠", label: "명예의 전당", href: "/admin/honors", icon: "trophy", keywords: "수동 기록 대회 우승 우승자 hall of fame" },
  { key: "room", group: "콘텐츠", label: "대회 룸", href: "/admin/room", icon: "users", keywords: "팀 로스터 스크림 매칭 대회 공지 룸 설정 Nudge DM 미제출자 경기 tournament" },
  // SYSTEM : LEVEL
  { key: "bot", group: "SYSTEM : LEVEL", label: "레벨 설정", href: "/admin/bot", icon: "chart", keywords: "봇 설정 XP 설정 레벨 정책 역할 퀘스트 지급 내역 bot" },
  { key: "pass", group: "SYSTEM : LEVEL", label: "시즌 패스", href: "/admin/pass", icon: "star", keywords: "시즌 패스 티어 보상 무료 트랙 프리미엄 트랙 season pass" },
  { key: "eventPass", group: "SYSTEM : LEVEL", label: "이벤트 패스", href: "/admin/event-pass", icon: "ticket", keywords: "이벤트 패스 유령 펭귄의 초대 단계 미션 기간 한정 event pass" },
  // 📌 2026-10-23 방구석 심야 괴담회 — 스테이지 채널 상영 · 완청 추첨권 · 즉석 추첨(app/admin/goedam/page.tsx)
  { key: "goedam", group: "SYSTEM : LEVEL", label: "괴담회", href: "/admin/goedam", icon: "ticket", keywords: "괴담회 방구석 심야 괴담회 추첨 추첨권 할로윈 추첨권 영화 상영 회차 스테이지 완청 상품 goedam" },
  // 📌 2026-10-25 친구 초대 — 상시 이벤트 · 초대 코드 · 누적 보상 · 괴담회 추첨권 보너스(app/admin/invite/page.tsx)
  { key: "invite", group: "SYSTEM : LEVEL", label: "친구 초대", href: "/admin/invite", icon: "gift", keywords: "친구 초대 초대 코드 초대 이벤트 누적 보상 1명 3명 5명 10명 추첨권 보너스 기간 신규 멤버 invite referral" },
  { key: "season", group: "SYSTEM : LEVEL", label: "시즌 전환", href: "/admin/role-migration", icon: "arrowRight", keywords: "역할 이전 지난 시즌 역할 역할 떼기 RANKER 랭커 시즌 결산 시즌 역할" },
  { key: "messages", group: "SYSTEM : LEVEL", label: "봇 메시지", href: "/admin/messages", icon: "sparkles", keywords: "봇 메시지 임베드 문구 디자인 테스트 발송 기본값 변수 카드 이미지 알림 채널 보내는 곳" },
  // ARCTIC
  { key: "shop", group: "ARCTIC", label: "상점 관리", href: "/admin/shop", count: "orders", icon: "bag", keywords: "상점 ARCTIC 아이템 상품 배너 쿠폰 구매 내역 카탈로그 초안 실사이트 반영 shop" },
];

export const ADMIN_PAGES: AdminNavPage[] = PAGE_DEFS.map(({ key, path, ...p }) => ({
  ...p,
  id: `page:${key}`,
  kind: "page",
  crumb: p.group,
  path: path || p.href.split("?")[0],
}));

const GROUP_ORDER = ["허브", "운영", "콘텐츠", "SYSTEM : LEVEL", "ARCTIC"];
export const NAV_GROUPS: AdminNavGroup[] = GROUP_ORDER.map((label) => ({ label, items: ADMIN_PAGES.filter((p) => p.group === label) }));

// ── 탭 · 패널 · 명령 ───────────────────────────────────────
//    [페이지 key, 종류, 이름, 주소, 찾을 말, 탭 이름(경로에 붙는다)?, 아이콘?]
type SubDef = [string, Exclude<AdminKind, "page">, string, string, string, string?, IconName?];
const SUBS: SubDef[] = [
  // 대시보드
  ["dashboard", "section", "점검 모드", "/admin", "점검 중 사이트 닫기 공사 maintenance", undefined, "lock"],
  ["dashboard", "section", "확인할 일", "/admin", "미답변 문의 심사 중 지원 구매 처리 대기 서포터즈 신고 우승자 미기재"],
  ["dashboard", "section", "봇", "/admin?sec=bot", "봇 꺼짐 작동 중 마지막 신호 heartbeat 대기 합계 XP 지급 상품 역할 레벨 역할 환불 회수 기간 만료 테스트 DM"],

  // 통계
  ["economy", "tab", "재화", "/admin/economy", "재화 통계 XP 발행 XP 사용 순증 빙옥 유통 일별"],
  ["economy", "section", "상품별 판매", "/admin/economy?sec=sales", "판매량 매출 많이 팔린 상품 건수", "재화"],
  ["economy", "tab", "서버 활동", "/admin/economy?tab=server", "활동 골든타임 멤버 증감 최근 7일 문의 Discord 서버 현황 콘텐츠 활동 현황"],

  // 유저 조회 — 상세 탭은 유저를 고른 뒤라 주소로 바로 가지 않는다(찾을 말로만)
  ["users", "action", "XP · 빙옥 지급", "/admin/users", "한 명 XP 지급 XP 제거 빙옥 지급 빙옥 제거 개별 지급 쿠폰 지급 아이템 지급 POINT", "지급"],
  ["users", "action", "음성 정지 · XP 중단", "/admin/users", "제재 걸기 음성 XP 정지 정지 해제 XP 획득 중단 타임아웃", "제재"],

  // 제재 · 잠수
  ["sanctions", "tab", "제재 중", "/admin/sanctions?tab=sanctioned", "제재 중 음성 XP 정지 XP 획득 중단 예약 해제 기간 끝남"],
  ["sanctions", "tab", "잠수 이동", "/admin/sanctions?tab=moved", "잠수 채널 이동 횟수 지우기 이동 기록 AfkLog AFK"],
  ["sanctions", "tab", "이상 활동", "/admin/sanctions?tab=activity", "잠수 의심 AFK 혼자 음소거 헤드셋 최장 연속 무활동 화면 캠 음성 XP 오늘 7일 30일"],

  // 서포터즈
  ["supporters", "tab", "평가", "/admin/supporters?tab=eval", "서포터즈 평가 월 정산 보상 지급 달성률 등급 코멘트 이번 달 지난 달"],
  ["supporters", "tab", "신고·피드백", "/admin/supporters?tab=reports", "신고 피드백 답변 미처리 처리됨 제출 건 삭제"],
  ["supporters", "tab", "설정", "/admin/supporters?tab=settings", "서포터즈 역할 월 기본 XP 월 목표 채팅 월 목표 음성 서포터즈 설정"],
  ["supporters", "action", "공지 확인 현황", "/supporters?tab=notice", "서포터즈 공지 읽음 확인 현황"],

  // 글쓰기
  ["write", "tab", "공지사항", "/write?category=공지사항", "공지 작성 notice 디스코드 공지 보내기 멘션"],
  ["write", "tab", "이벤트", "/write?category=이벤트", "이벤트 글 event"],
  ["write", "tab", "구인", "/write?category=구인", "구인 글 모집 recruit"],
  ["write", "tab", "대회", "/write?category=대회", "대회 글 토너먼트 tournament"],
  ["write", "tab", "서포터즈", "/write?category=서포터즈", "서포터즈 공지 작성"],

  // 경매
  ["auction", "tab", "경매 목록", "/admin/auction", "경매 목록 경매장 입장 낙찰 비공개 경매 삭제 제목 수정"],
  ["auction", "action", "경매 개최", "/admin/auction?tab=new", "경매 만들기 기본 정보 포지션 슬롯 경매 룰 리더 명단 선수 명단 설문에서 불러오기 테스트 방 경매장 생성"],

  // 명예의 전당
  ["honors", "tab", "수동 기록", "/admin/honors", "수동 기록 기록 수정 등재 공개 페이지"],
  ["honors", "tab", "대회 우승", "/admin/honors?tab=tournament", "우승팀 우승자 우승자 미기재 우승 팀원 명단 대회 우승 정보 수정"],
  ["honors", "action", "새 기록 등재", "/admin/honors?new=1", "새 기록 추가 등재 만들기", "수동 기록"],

  // 레벨 설정 › 정책
  ["bot", "tab", "정책", "/admin/bot?tab=policy", "XP 정책"],
  ["bot", "section", "지급량 · 주기", "/admin/bot?tab=policy&sec=xp", "채팅 XP 채팅 쿨타임 음성 XP 음성 지급 주기 출석체크 XP 출석 인정 접속 시간", "정책"],
  ["bot", "section", "연속 출석 보너스", "/admin/bot?tab=policy&sec=streak", "연속 출석 스트릭 보너스 규칙 배수마다 반복 빙옥", "정책"],
  ["bot", "section", "서버 부스터 보상", "/admin/bot?tab=policy&sec=booster", "서버 부스터 보상 최초 부스팅 연속 부스팅 개월 단계 부스트 XP 빙옥", "정책"],
  ["bot", "section", "음소거 처리", "/admin/bot?tab=policy&sec=muting", "음소거 마이크 헤드셋 감소 비율 차단 적용 기준", "정책"],
  ["bot", "section", "AFK 방지 시스템", "/admin/bot?tab=policy&sec=afk", "잠수 확인 AFK 잠수 채널 첫 확인 다음 확인 응답 시간 제재 이력 분", "정책"],
  ["bot", "section", "강화", "/admin/bot?tab=policy&sec=enhance", "강화 단계당 XP 최대 단계 1단계 비용 비용 상승", "정책"],
  ["bot", "section", "핫타임", "/admin/bot?tab=policy&sec=hottime", "핫타임 배수 2배 XP 이벤트 평일 금토일 기간", "정책"],
  // 기간제 부스트 · 채널 정책은 정책 탭으로 옮긴다 — 옛 주소(tab=content&sec=…)는 레벨 설정이 새 자리로 넘겨준다
  ["bot", "section", "기간제 부스트", "/admin/bot?tab=content&sec=boosts", "기간제 부스트 부스트 추가 XP 기간 한정 이벤트 버프 대상 역할 XP 이벤트", "정책"],
  ["bot", "section", "채널 정책", "/admin/bot?tab=content&sec=channels", "채널 Boost XP 지급 제외 카테고리 채널별 XP", "정책"],
  ["bot", "section", "공개 · 초기화", "/admin/bot?tab=policy&sec=public", "SYSTEM LEVEL 공개 비공개 서버 퇴장 시 XP 초기화 준비 중 화면", "정책"],
  // 레벨 설정 › 역할
  ["bot", "tab", "역할", "/admin/bot?tab=roles", "역할 탭 디스코드 역할"],
  ["bot", "section", "등급 · 보상 역할", "/admin/bot?tab=roles&sec=reward", "레벨 보상 역할 지급 레벨 역할 Boost 채팅 Boost 음성 Boost 출석 Boost RoleConfig 버프 등급 역할 티어 역할 음성 티어 티어 사다리 일괄 연결 브론즈 실버 골드 다이아", "역할"],
  ["bot", "section", "시즌 전환 보호 역할", "/admin/bot?tab=roles&sec=protected", "보호할 역할 떼지 않을 역할 시즌 전환", "역할"],
  ["bot", "section", "승급 화면 미리보기", "/admin/bot?tab=roles&sec=promo", "승급 연출 승급 화면 재생 promo 등급 선택", "역할"],
  // 레벨 설정 › 퀘스트(옛 「콘텐츠」 탭)
  ["bot", "tab", "퀘스트", "/admin/bot?tab=content&sec=quests", "퀘스트 일일 주간 월간 노출 방식 노출 개수 무료 바꾸기 유료 바꾸기 리롤 추천 퀘스트 quest"],
  // 레벨 설정 › 지급·내역
  ["bot", "tab", "지급·내역", "/admin/bot?tab=ledger", "지급 내역 원장"],
  ["bot", "section", "수동 지급", "/admin/bot?tab=ledger&sec=grant", "XP 지급 빙옥 지급 아이템 지급 여러 명 전체 유저에게 지급 XP 제거 최근 아이템 지급 아이템 회수 POINT", "지급·내역"],
  ["bot", "section", "지급 내역", "/admin/bot?tab=ledger&sec=logs", "지급 내역 XP 로그 XpLog 원장 채팅 음성 출석 효과 수동 아이템 지급 대기 payout 지급 취소 지급 완료", "지급·내역"],
  ["bot", "section", "XP 초기화", "/admin/bot?tab=ledger&sec=reset", "XP 초기화 리셋 전체 유저 초기화 위 대상 초기화", "지급·내역"],
  ["bot", "action", "랭킹 보기", "/level?tab=rank", "랭킹 순위 리더보드 leaderboard"],

  // 시즌 패스
  ["pass", "section", "기본 설정", "/admin/pass?sec=basic", "시즌 패스 사용 운영 중 멈춤 프리미엄 트랙 해금가 빙옥"],
  ["pass", "section", "티어 구성", "/admin/pass?sec=tiers", "티어 추가 필요 XP 필요 XP 일괄 무료 보상 프리미엄 보상 티어 편집 티어 삭제 정렬"],

  // 괴담회 — 탭 넷(구성 · 명단 · 추첨 기록 · 그룹 지원 — 2026-10-25 게임 그룹 지원)
  ["goedam", "tab", "구성", "/admin/goedam", "괴담회 사용 스테이지 채널 ID 추첨권 아이템 추첨 기간 회차 상영 일정 장 수 완청 비율 상품 수량 비중 확률 희귀도 코드"],
  ["goedam", "tab", "명단", "/admin/goedam?tab=watch", "회차 명단 머문 시간 완청 지급 여부 수동 지급 추첨권 지급"],
  ["goedam", "tab", "추첨 기록", "/admin/goedam?tab=draws", "추첨 기록 당첨 코드 미지급 다시 지급"],
  ["goedam", "tab", "게임 그룹 지원", "/admin/goedam?tab=groups", "게임 그룹 지원 그룹 지원 그룹 모집 그룹 심사 심사 중 승인 반려 반려 사유 문화상품권 상품권 번호 번호 추가 번호 배정 최소 인원 최대 인원 멤버 확인 부계정 새 계정 참여 코드 group", undefined, "users"],

  // 친구 초대 — 탭 둘(구성 · 초대 기록)
  ["invite", "tab", "구성", "/admin/invite", "친구 초대 사용 기간 보너스 기간 추첨권 장 수 누적 보상 단계 가입 7일 계정 7일"],
  ["invite", "tab", "초대 기록", "/admin/invite?tab=log", "초대 기록 초대한 사람 초대받은 사람 코드 입력 거절 사유"],

  // 시즌 전환
  ["season", "tab", "역할 이전", "/admin/role-migration", "역할 이전 지난 시즌 역할 인벤토리 아이템으로 환불 미리보기 이전 실행 대상 제외"],
  ["season", "tab", "진행", "/admin/role-migration?tab=progress", "진행 빠진 지급 환불로 바꾸기 기간 적용 남음 실패"],
  ["season", "tab", "역할 떼기", "/admin/role-migration?tab=detach", "디스코드 역할 떼기 시즌 역할 내리기 대상 미리보기 detach"],
  ["season", "tab", "RANKER", "/admin/role-migration?tab=ranker", "랭커 RANKER 역할 시즌 결과 상위 3명 RANKER 역할 지급 시즌 결산"],

  // 봇 메시지 — 키 21개(lib/botMessages.js MESSAGE_KEYS). 알림 채널 · 만료 시점도 여기(편집 머리 「보내는 곳」)
  ["messages", "section", "레벨업", "/admin/messages?key=levelUp", "레벨업 메시지 레벨업 카드 레벨업 알림 알림 채널 알림 끄기"],
  ["messages", "section", "역할 지급", "/admin/messages?key=roleGrant", "역할 지급 메시지 보상 역할 알림 역할 지급 알림 알림 채널 알림 사용"],
  ["messages", "section", "자동 출석", "/admin/messages?key=autoAttend", "자동 출석 메시지 출석 알림 자동 출석 알림 알림 채널 음성 자동 출석"],
  ["messages", "section", "시즌 RANKER 발표", "/admin/messages?key=rankerAnnounce", "RANKER 발표 시즌 결과 발표 랭커"],
  ["messages", "section", "공지", "/admin/messages?key=noticePost", "공지 메시지 디스코드 공지 공지 알림 공지 채널 보내지 않음"],
  ["messages", "section", "AFK 방지 시스템", "/admin/messages?key=afkCheck", "잠수 확인 메시지 AFK 확인 버튼"],
  ["messages", "section", "구매 지급 · 영구", "/admin/messages?key=purchaseGranted", "구매 지급 DM 영구 상품 지급"],
  ["messages", "section", "구매 지급 · 기간제", "/admin/messages?key=purchaseGrantedTimed", "구매 지급 DM 기간제"],
  ["messages", "section", "기간 연장", "/admin/messages?key=renewed", "기간 연장 DM 연장"],
  ["messages", "section", "만료 임박", "/admin/messages?key=expiryReminder", "만료 임박 DM 만료 알림 기간제 만료 알림 보내는 시점 시간 전"],
  ["messages", "section", "기간 만료", "/admin/messages?key=expired", "기간 만료 DM 회수"],
  ["messages", "section", "환불", "/admin/messages?key=refunded", "환불 DM 취소"],
  ["messages", "section", "시즌 패스 미수령", "/admin/messages?key=passUnclaimed", "시즌 패스 미수령 DM 안 받은 보상"],
  ["messages", "section", "최초 부스팅 보상", "/admin/messages?key=boosterBonus", "최초 부스팅 보상 DM 서버 부스터 부스트"],
  ["messages", "section", "연속 부스팅 보상", "/admin/messages?key=boosterStep", "연속 부스팅 보상 DM 서버 부스터 개월 단계"],
  ["messages", "section", "/레벨", "/admin/messages?key=cmdLevel", "레벨 명령어 응답 슬래시"],
  ["messages", "section", "/랭크", "/admin/messages?key=cmdRank", "랭크 명령어 응답 슬래시"],
  ["messages", "section", "/출석체크", "/admin/messages?key=cmdAttend", "출석체크 명령어 응답 슬래시"],
  ["messages", "section", "/출석체크 · 이미 출석", "/admin/messages?key=cmdAttendAlready", "이미 출석 명령어 응답 슬래시"],
  ["messages", "section", "/퀘스트", "/admin/messages?key=cmdQuest", "퀘스트 명령어 응답 슬래시"],
  ["messages", "section", "/인벤토리", "/admin/messages?key=cmdInventory", "인벤토리 명령어 응답 슬래시"],
  ["messages", "section", "/시즌패스", "/admin/messages?key=cmdPass", "시즌패스 명령어 응답 슬래시"],
  ["messages", "section", "비공개 안내", "/admin/messages?key=levelClosed", "비공개 안내 레벨 비공개 명령어"],

  // 상점 관리 — 탭 다섯(아이템 · 상품 · 배너 · 쿠폰 · 구매 내역) + 머리 「설정」 창
  ["shop", "tab", "아이템", "/admin/shop?tab=items", "아이템 등록 아이템 수정 희귀도 일반 고급 희귀 영웅 전설 신화 유물 효과 추가 효과 꾸미기 카드 배경 카드 테두리 프로필 테두리 아이콘 그룹 지정 몸값 참고 일괄 편집"],
  ["shop", "action", "새 아이템", "/admin/shop?tab=items&new=1", "아이템 만들기 아이템 추가 새로 만들기", "아이템"],
  ["shop", "action", "추천 아이템", "/admin/shop?tab=items&open=preset", "추천 아이템 프리셋 한 번에 등록", "아이템"],
  ["shop", "action", "그룹 관리", "/admin/shop?tab=items&open=groups", "그룹 관리 상위 그룹 그룹 이름 바꾸기 그룹 추가 그룹 삭제 자동 정렬", "아이템"],
  ["shop", "tab", "상품", "/admin/shop?tab=products", "상품 판매 중 숨김 가격 할인율 할인 종료 판매 종료 세트 구성 재고 기간제 빙옥 전용 1개 단위 아이템 순서대로"],
  ["shop", "action", "새 상품", "/admin/shop?tab=products&new=1", "상품 등록 상품 만들기 새로 만들기 세트 만들기", "상품"],
  ["shop", "action", "테마 관리", "/admin/shop?tab=products&open=themes", "테마 관리 이벤트 테마 할로윈 탭 테마 추가 켜기", "상품"],
  ["shop", "tab", "배너", "/admin/shop?tab=banners", "배너 등록 배너 이미지 모바일 이미지 노출 위치 홈 시즌 탭 클릭 시 이동 슬라이드"],
  ["shop", "tab", "쿠폰", "/admin/shop?tab=coupons", "쿠폰 발급 쿠폰 지급 할인형 보상형 쿠폰 코드 만료 전체 유저에게 지급"],
  ["shop", "tab", "구매 내역", "/admin/shop?tab=orders", "구매 내역 주문 구매 관리 처리 대기 완료 취소 환불 만료 발송 처리 기프트카드 운송장"],
  ["shop", "action", "상점 설정", "/admin/shop?open=settings", "ARCTIC 상점 공개 비공개 결제 캐시백 캐시백 합 상한 빙옥 결제분 상점 설정"],
  ["shop", "action", "효과 문구", "/admin/shop?open=fxtext", "효과 문구 자동 문구 효과 설명 문구 틀 매크로 채팅 XP 음성 XP 출석 레벨업 강화 비용 캐시백 쿨타임"],
];

const pageOf = new Map(ADMIN_PAGES.map((p) => [p.id.slice(5), p]));

const SUB_ENTRIES: AdminEntry[] = SUBS.flatMap(([key, kind, label, href, keywords, tab, icon]) => {
  const page = pageOf.get(key);
  if (!page) return [];
  return [{
    id: `${kind}:${href}#${label}`,
    label,
    crumb: tab ? `${page.label} › ${tab}` : page.label,
    href,
    keywords,
    kind,
    icon: icon || page.icon,
  }];
});

// 검색이 훑는 전체 — 페이지가 먼저(같은 점수면 페이지 > 탭 > 패널 > 명령)
export const ADMIN_INDEX: AdminEntry[] = [...ADMIN_PAGES.map(({ id, label, crumb, href, keywords, kind, icon }) => ({ id, label, crumb, href, keywords, kind, icon })), ...SUB_ENTRIES];

// ── 같은 뜻 — 화면마다 이름이 달라 꼭 필요하다(한 묶음 안 아무 말로 찾아도 서로 걸린다) ──
export const SYNONYMS: string[][] = [
  ["잠수", "AFK", "잠수 확인"],
  ["알림 발송", "회원 통지", "통지서"],
  ["빙옥", "POINT", "포인트"],
  ["제재", "정지", "중단", "타임아웃"],
  ["상점", "ARCTIC", "샵"],
  ["구매", "주문"],
  ["쿠폰", "코드"],
  ["테두리", "프레임"],
  ["카드 스킨", "카드 배경"],
  ["부스트", "버프", "Boost"],
  ["등급 역할", "티어 역할", "음성 티어"],
  ["서포터즈 평가", "서포터즈"],
  ["레벨 설정", "봇 설정", "XP 설정"],
  ["통계", "재화 통계"],
  ["시즌 전환", "역할 이전"],
  ["경매 개최", "경매 만들기"],
];

// 메뉴 칸이 지금 화면인가
export function isNavActive(p: AdminNavPage, pathname: string, query: URLSearchParams | { get: (k: string) => string | null }) {
  if (pathname !== p.path && !(p.also || []).includes(pathname)) return false;
  return Object.entries(p.need || {}).every(([k, v]) => query.get(k) === v);
}
