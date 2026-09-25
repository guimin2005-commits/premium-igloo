"use client";
import { PHASES, phaseOf, statusFromPhase } from "@/lib/tournamentPhase";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BracketView } from "../components/BracketView";
import { DiscordIdInput } from "../components/DiscordIds";
import {
  AdminPage,
  AdminTabs,
  Panel,
  FieldRow,
  Inline,
  Segmented,
  Switch,
  Toggle,
  Btn,
  EmptyRow,
  inputClass,
  labelClass,
  fieldNote,
  useAdminGuard,
} from "../admin/ui";

// 개인정보 수집·이용 안내 기본 문구 (관리자가 "기본 문구 넣기"로 채운 뒤 자유롭게 수정)
const DEFAULT_PRIVACY_TITLE = "[중요] 개인정보 수집 및 이용 안내";
const DEFAULT_PRIVACY_BODY = [
  "• 본 설문을 통해 수집된 개인정보는 상금/상품 발송 및 본인 확인 이외의 목적으로 사용되지 않습니다.",
  "• 수집된 개인정보는 상금/상품 발송 완료 후 7일 이내 즉시 안전하게 파기됩니다.",
  "",
  "[개인정보 수집 및 이용 목적 안내]",
  "1. 수집 목적: 대회 참가자 본인 확인, 대진표 작성, 상금 및 상품 발송",
  "2. 수집 항목: 실명, 디스코드 닉네임, 연락처, 게임 닉네임, 계좌번호",
  "3. 보유 및 이용 기간: 대회 종료 및 상금 지급 완료 후 7일 이내 즉시 파기",
  "",
  "귀하는 개인정보 수집에 동의하지 않을 권리가 있으나, 미동의 시 대회 참가 및 상금 수령이 제한됩니다.",
].join("\n");
const DEFAULT_PRIVACY_CONFIRM = "본 상금 및 상품 수령을 위한 개인정보 수집 및 이용 안내, 유의사항을 충분히 숙지하였으며 이에 동의합니다.";
const EMPTY_PRIVACY = { enabled: false, title: "", body: "", confirmLabel: "" };

// 📌 오른쪽 좁은 칸(게시 설정)용 줄 — FieldRow 의 180px 이름 칸이 360px 안에 들어가지 않아 이름 위 · 입력 아래로 쌓는다.
//    right: 이름 줄 오른쪽 끝(스위치 · 해제 단추)
function SideRow({ label, right, children }: { label: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-5 py-3.5 border-b border-[#ededed] last:border-b-0">
      <div className="flex items-center gap-3 min-h-8">
        <span className="min-w-0 flex-1 text-[13px] font-bold text-[#131313]">{label}</span>
        {right}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

// 📌 시작일 ~ 종료일 + 상시 스위치 — 이벤트 기간 · 모집 기간이 같은 모양을 쓴다 (옛 CustomCheckbox 자리)
const dateClass = `${inputClass} !w-auto`;
function DateRange({ start, end, always, onStart, onEnd, onAlways, alwaysLabel }: {
  start: string; end: string; always: boolean;
  onStart: (v: string) => void; onEnd: (v: string) => void; onAlways: (v: boolean) => void;
  alwaysLabel: string;
}) {
  return (
    <Inline>
      <input type="date" value={start} onChange={(e) => onStart(e.target.value)} required className={dateClass} />
      {!always && (
        <>
          <span className="text-[#a3a3a3] font-bold">~</span>
          <input type="date" value={end} onChange={(e) => onEnd(e.target.value)} className={dateClass} />
        </>
      )}
      <span className="inline-flex items-center gap-2.5 sm:ml-2">
        <Switch on={always} onChange={onAlways} label={alwaysLabel} />
        <span className={`text-[13px] font-bold ${always ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{alwaysLabel}</span>
      </span>
    </Inline>
  );
}

export default function AdminWritePage() {
  // 📌 권한 가드는 관리자 공용(useAdminGuard) — 같은 ADMIN_USERS(lib/admins)로 막고, 막힌 화면도 다른 관리 화면과 같은 모양
  const { session, gate } = useAdminGuard();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [editId, setEditId] = useState("");
  const [category, setCategory] = useState("공지사항");
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });
  
  const [content, setContent] = useState("");
  const [noticeTag, setNoticeTag] = useState("일반");
  const [isPinned, setIsPinned] = useState(false);
  const [publishAt, setPublishAt] = useState(""); // 📌 예약 발행 (비우면 즉시 공개)
  const [hidden, setHidden] = useState(false);    // 📌 글 가리기 (지우지 않고 감추기)
  const [eventTag, setEventTag] = useState("NONE");
  const [bannerUrl, setBannerUrl] = useState("");
  // 본문 이미지 넣기 창
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageCap, setImageCap] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [isEventAlways, setIsEventAlways] = useState(false);
  
  const [recruitSubCategory, setRecruitSubCategory] = useState("staff");
  const [recruitRole, setRecruitRole] = useState("");
  const [recruitStartDate, setRecruitStartDate] = useState("");
  const [recruitEndDate, setRecruitEndDate] = useState("");
  const [isRecruitAlways, setIsRecruitAlways] = useState(false);
  const [recruitQual, setRecruitQual] = useState("");
  const [recruitTasks, setRecruitTasks] = useState("");
  const [recruitExtra, setRecruitExtra] = useState("");

  // 대회 전용 상태
  const [tournamentGame, setTournamentGame] = useState("");
  const [tournamentPrize, setTournamentPrize] = useState("");
  const [tournamentStatus, setTournamentStatus] = useState("예정됨");
  const [tournamentLink, setTournamentLink] = useState("");
  const [tournamentBracket, setTournamentBracket] = useState("");
  const [bracketPublic, setBracketPublic] = useState(false); // 대진표를 지금 공개할지

  // 📌 대진표 비주얼 빌더 — 라운드/매치 단위 편집 + 승자조/패자조/결승 그룹(패자부활전)
  type BracketMatch = { a: string; b: string; winner: string };
  type Grp = "W" | "L" | "F";
  type BracketRound = { name: string; bracket: Grp; matches: BracketMatch[] };
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>([]);

  const GROUP_LABEL: Record<Grp, string> = { W: "승자조", L: "패자조", F: "결승" };
  const GROUP_ORDER: Grp[] = ["W", "L", "F"];

  // 기존 텍스트 형식 ↔ 빌더 상호 변환 (표시 컴포넌트 호환 유지)
  //  · 그룹 헤더 [승자조]/[패자조]/[결승] 지원 · 헤더 없으면 승자조(단일 토너먼트)로 간주
  const parseBracket = (text: string): BracketRound[] => {
    const rounds: BracketRound[] = [];
    let current: BracketRound | null = null;
    let grp: Grp = "W";
    (text || "").split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const gm = line.match(/^\[(.+)\]$/);
      if (gm) { const n = gm[1].trim(); grp = /패자|loser/i.test(n) ? "L" : /결승|final|grand/i.test(n) ? "F" : "W"; return; }
      if (line.endsWith(":")) { current = { name: line.slice(0, -1).trim(), bracket: grp, matches: [] }; rounds.push(current); return; }
      const [matchPart, winnerPart] = line.split(">");
      const teams = matchPart.split(/vs/i);
      if (teams.length !== 2) return;
      if (!current) { current = { name: "대진", bracket: grp, matches: [] }; rounds.push(current); }
      current.matches.push({ a: teams[0].trim(), b: teams[1].trim(), winner: (winnerPart || "").trim() });
    });
    return rounds;
  };
  const serializeBracket = (rounds: BracketRound[]): string => {
    const valid = rounds.filter((r) => r.matches.some((m) => m.a.trim() || m.b.trim()));
    const used = GROUP_ORDER.filter((g) => valid.some((r) => r.bracket === g));
    const multi = used.length > 1; // 그룹이 2개 이상일 때만 [그룹] 헤더 출력(단일 토너먼트 하위호환)
    const out: string[] = [];
    used.forEach((g) => {
      if (multi) out.push(`[${GROUP_LABEL[g]}]`);
      valid.filter((r) => r.bracket === g).forEach((r) => {
        out.push(`${r.name || "라운드"}:`);
        r.matches.filter((m) => m.a.trim() || m.b.trim()).forEach((m) => out.push(`${m.a.trim()} vs ${m.b.trim()}${m.winner ? ` > ${m.winner}` : ""}`));
      });
    });
    return out.join("\n");
  };

  const updateRound = (ri: number, patch: Partial<BracketRound>) =>
    setBracketRounds((prev) => prev.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  const updateMatch = (ri: number, mi: number, patch: Partial<BracketMatch>) =>
    setBracketRounds((prev) => prev.map((r, i) => (i === ri ? { ...r, matches: r.matches.map((m, j) => (j === mi ? { ...m, ...patch } : m)) } : r)));

  const mkMatches = (n: number) => Array.from({ length: n }, () => ({ a: "", b: "", winner: "" }));

  // 단일 토너먼트 골격
  const quickBracket = (teams: number) => {
    const rounds: BracketRound[] = [];
    let c = teams / 2;
    while (c >= 1) {
      rounds.push({ name: c === 1 ? "결승" : `${c * 2}강`, bracket: "W", matches: mkMatches(c) });
      c = c / 2;
    }
    setBracketRounds(rounds);
  };

  // 패자부활전(더블 엘리미네이션) 골격 — 승자조 + 패자조 + 최종 결승
  const doubleBracket = (teams: number) => {
    const W: BracketRound[] = [];
    let c = teams / 2;
    while (c >= 1) { W.push({ name: c === 1 ? "승자 결승" : `승자 ${c * 2}강`, bracket: "W", matches: mkMatches(c) }); c = c / 2; }
    const L: BracketRound[] = [];
    let lc = teams / 4, n = 1;
    while (lc >= 1) {
      L.push({ name: `패자 R${n++}`, bracket: "L", matches: mkMatches(lc) });
      L.push({ name: `패자 R${n++}`, bracket: "L", matches: mkMatches(lc) });
      lc = lc / 2;
    }
    const F: BracketRound[] = [{ name: "최종 결승", bracket: "F", matches: mkMatches(1) }];
    setBracketRounds([...W, ...L, ...F]);
  };
  const [tournamentWinner, setTournamentWinner] = useState("");
  const [tournamentWinnerId, setTournamentWinnerId] = useState("");
  const [tournamentStartDate, setTournamentStartDate] = useState("");
  const [tournamentEndDate, setTournamentEndDate] = useState("");

  // 📌 대회 글 타입: "모집"(참가 신청) / "대진표"(리그 진행)
  const [tournamentType, setTournamentType] = useState("모집"); // 옛 글 호환용 — 새 글은 phase 를 쓴다
  const [tournamentPhase, setTournamentPhase] = useState("접수");
  const [tournamentTeamDay, setTournamentTeamDay] = useState("");
  const [tournamentEventDay, setTournamentEventDay] = useState("");

  // 📌 참가 설문 (구글폼 형식)
  type SQ = { qid: string; type: string; label: string; desc: string; required: boolean; options: string[]; etc: boolean };
  type SPrivacy = { enabled: boolean; title: string; body: string; confirmLabel: string };
  const [survey, setSurvey] = useState<{ enabled: boolean; title: string; desc: string; closed: boolean; questions: SQ[]; privacy: SPrivacy }>({
    enabled: false, title: "", desc: "", closed: false, questions: [], privacy: { ...EMPTY_PRIVACY },
  });
  const readPrivacy = (v: any): SPrivacy => ({
    enabled: !!v?.enabled,
    title: v?.title || "",
    body: v?.body || "",
    confirmLabel: v?.confirmLabel || "",
  });
  const setPrivacy = (patch: Partial<SPrivacy>) => setSurvey((s) => ({ ...s, privacy: { ...s.privacy, ...patch } }));
  const Q_TYPES = [
    { v: "short", l: "단답형" },
    { v: "long", l: "장문형" },
    { v: "single", l: "객관식(1개)" },
    { v: "multi", l: "객관식(복수)" },
    { v: "note", l: "설명" },          // 입력 없이 안내 문구만 표시
  ];
  const isChoiceType = (t: string) => t === "single" || t === "multi";
  const newQid = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const addQuestion = (type = "short") =>
    setSurvey((s) => ({ ...s, questions: [...s.questions, { qid: newQid(), type, label: "", desc: "", required: false, options: isChoiceType(type) ? ["선택지 1"] : [], etc: false }] }));
  const updateQuestion = (i: number, patch: Partial<SQ>) =>
    setSurvey((s) => ({ ...s, questions: s.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) }));
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setSurvey((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.questions.length) return s;
      const qs = [...s.questions];
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...s, questions: qs };
    });

  // ── 설문 빌더 편의기능 ──
  const [dragQ, setDragQ] = useState<number | null>(null);        // 끌고 있는 문항
  const [overQ, setOverQ] = useState<number | null>(null);        // 놓일 위치
  const [dragOpt, setDragOpt] = useState<{ qi: number; oi: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [surveyPreview, setSurveyPreview] = useState(false);

  const dupQuestion = (i: number) =>
    setSurvey((s) => {
      const src = s.questions[i];
      const copy: SQ = { ...src, qid: newQid(), options: [...src.options], label: src.label ? `${src.label} (복사본)` : "" };
      const qs = [...s.questions];
      qs.splice(i + 1, 0, copy);
      return { ...s, questions: qs };
    });

  const removeQuestion = (i: number) => setSurvey((s) => ({ ...s, questions: s.questions.filter((_, x) => x !== i) }));

  // 문항 드래그 정렬
  const dropQuestion = (to: number) =>
    setSurvey((s) => {
      if (dragQ === null || dragQ === to) return s;
      const qs = [...s.questions];
      const [m] = qs.splice(dragQ, 1);
      qs.splice(to, 0, m);
      return { ...s, questions: qs };
    });

  // 선택지 드래그 정렬
  const dropOption = (qi: number, to: number) => {
    if (!dragOpt || dragOpt.qi !== qi || dragOpt.oi === to) return;
    const opts = [...survey.questions[qi].options];
    const [m] = opts.splice(dragOpt.oi, 1);
    opts.splice(to, 0, m);
    updateQuestion(qi, { options: opts });
  };

  // 여러 줄 붙여넣기 → 선택지 일괄 생성
  const pasteOptions = (qi: number, oi: number, text: string) => {
    const parts = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    const opts = [...survey.questions[qi].options];
    opts.splice(oi, 1, ...parts);
    updateQuestion(qi, { options: opts });
    return true;
  };

  // 자주 쓰는 문항 빠른 추가
  const QUICK_QS: { l: string; q: Omit<SQ, "qid"> }[] = [
    { l: "디스코드 닉네임", q: { type: "short", label: "디스코드 닉네임", desc: "", required: true, options: [], etc: false } },
    { l: "게임 닉네임", q: { type: "short", label: "게임 내 닉네임 (태그 포함)", desc: "", required: true, options: [], etc: false } },
    { l: "티어", q: { type: "single", label: "현재 티어", desc: "", required: true, options: ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터 이상"], etc: false } },
    { l: "주 포지션", q: { type: "single", label: "주 포지션", desc: "", required: true, options: ["탑", "정글", "미드", "원딜", "서포터"], etc: false } },
    { l: "부 포지션", q: { type: "single", label: "부 포지션", desc: "", required: false, options: ["탑", "정글", "미드", "원딜", "서포터", "없음"], etc: false } },
    { l: "참가 가능 요일", q: { type: "multi", label: "참가 가능 요일", desc: "", required: true, options: ["월", "화", "수", "목", "금", "토", "일"], etc: false } },
    { l: "팀명", q: { type: "short", label: "팀명", desc: "", required: true, options: [], etc: false } },
    { l: "팀원 명단", q: { type: "long", label: "팀원 전체 명단 (닉네임 줄바꿈으로 구분)", desc: "", required: true, options: [], etc: false } },
    { l: "각오 한마디", q: { type: "long", label: "각오 한마디", desc: "", required: false, options: [], etc: false } },
    { l: "참가 안내(설명)", q: { type: "note", label: "참가 전 확인해주세요", desc: "· 신청 후에는 수정이 불가하니 내용을 확인하고 제출해주세요.\n· 대회 일정은 공지사항을 통해 안내됩니다.", required: false, options: [], etc: false } },
  ];
  const addQuickQuestion = (q: Omit<SQ, "qid">) =>
    setSurvey((s) => ({ ...s, questions: [...s.questions, { ...q, qid: newQid(), options: [...q.options] }] }));

  // 설문 템플릿 (한 번에 구성)
  const SURVEY_TEMPLATES: { name: string; desc: string; pick: string[] }[] = [
    { name: "개인전 신청", desc: "닉네임 · 티어 · 포지션 · 요일", pick: ["디스코드 닉네임", "게임 닉네임", "티어", "주 포지션", "부 포지션", "참가 가능 요일"] },
    { name: "팀전 신청", desc: "팀명 · 팀원 명단 · 요일", pick: ["팀명", "디스코드 닉네임", "팀원 명단", "참가 가능 요일"] },
    { name: "간단 신청", desc: "닉네임 · 각오", pick: ["디스코드 닉네임", "각오 한마디"] },
  ];
  const applyTemplate = (t: { name: string; pick: string[] }) => {
    if (survey.questions.length && !confirm(`현재 작성한 문항을 모두 지우고\n'${t.name}' 템플릿으로 바꿀까요?`)) return;
    const qs = t.pick
      .map((l) => QUICK_QS.find((x) => x.l === l))
      .filter(Boolean)
      .map((x) => ({ ...(x as any).q, qid: newQid(), options: [...(x as any).q.options] }));
    setSurvey((s) => ({ ...s, questions: qs }));
  };

  // 📌 리그 상세 일정 (팀원 배정, 스크림, 본선 등)
  type SchedulePhase = { label: string; start: string; end: string };
  const [tournamentSchedule, setTournamentSchedule] = useState<SchedulePhase[]>([]);
  const updatePhase = (i: number, patch: Partial<SchedulePhase>) =>
    setTournamentSchedule((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPhase = (label = "") =>
    setTournamentSchedule((prev) => [...prev, { label, start: "", end: "" }]);
  const PHASE_PRESETS = ["팀원 배정", "스크림 (연습 경기)", "본선 경기", "결승전", "시상식"];

  // 📌 보류(임시저장) — 작성 중인 글을 저장해두고 나중에 이어서 작성
  const [hasDraft, setHasDraft] = useState(false);
  const DRAFT_KEY = "writeDraft";

  const collectDraft = () => ({
    category, title, content, publishAt, hidden, noticeTag, isPinned, bannerUrl,
    eventTag, eventStartDate, eventEndDate, isEventAlways,
    recruitSubCategory, recruitRole, recruitStartDate, recruitEndDate, isRecruitAlways, recruitQual, recruitTasks, recruitExtra,
    tournamentGame, tournamentPrize, tournamentStatus: statusFromPhase(tournamentPhase), tournamentLink, tournamentBracket: serializeBracket(bracketRounds), tournamentBracketPublic: bracketPublic, tournamentWinner, tournamentWinnerId, tournamentStartDate, tournamentEndDate,
    tournamentType, tournamentPhase, tournamentTeamDay, tournamentEventDay, tournamentSchedule, survey,
    savedAt: new Date().toISOString(),
  });

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
      setHasDraft(true);
      setPopupConfig({ isOpen: true, message: "작성 중인 글이 보류되었습니다.\n다음에 글쓰기 페이지에 들어오면 이어서 작성할 수 있습니다.", isError: false });
    } catch {
      setPopupConfig({ isOpen: true, message: "보류 저장에 실패했습니다.", isError: true });
    }
  };

  const restoreDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!d) return;
      setCategory(d.category || "공지사항"); setTitle(d.title || ""); setContent(d.content || ""); setPublishAt(d.publishAt || ""); setHidden(!!d.hidden);
      setNoticeTag(d.noticeTag || "일반"); setIsPinned(!!d.isPinned); setBannerUrl(d.bannerUrl || "");
      setEventTag(d.eventTag || "NONE"); setEventStartDate(d.eventStartDate || ""); setEventEndDate(d.eventEndDate || ""); setIsEventAlways(!!d.isEventAlways);
      setRecruitSubCategory(d.recruitSubCategory || "staff"); setRecruitRole(d.recruitRole || ""); setRecruitStartDate(d.recruitStartDate || ""); setRecruitEndDate(d.recruitEndDate || "");
      setIsRecruitAlways(!!d.isRecruitAlways); setRecruitQual(d.recruitQual || ""); setRecruitTasks(d.recruitTasks || ""); setRecruitExtra(d.recruitExtra || "");
      setTournamentGame(d.tournamentGame || ""); setTournamentPrize(d.tournamentPrize || ""); setTournamentStatus(d.tournamentStatus || "예정됨"); setTournamentLink(d.tournamentLink || "");
      setTournamentBracket(d.tournamentBracket || ""); setBracketRounds(parseBracket(d.tournamentBracket || "")); setBracketPublic(!!d.tournamentBracketPublic); setTournamentWinner(d.tournamentWinner || ""); setTournamentWinnerId(d.tournamentWinnerId || "");
      setTournamentStartDate(d.tournamentStartDate || ""); setTournamentEndDate(d.tournamentEndDate || "");
      setTournamentType(d.tournamentType || "모집");
      setTournamentPhase(phaseOf(d));
      setTournamentTeamDay(d.tournamentTeamDay || ""); setTournamentEventDay(d.tournamentEventDay || "");
      setTournamentSchedule(Array.isArray(d.tournamentSchedule) ? d.tournamentSchedule : []);
      if (d.survey) setSurvey({ enabled: !!d.survey.enabled, title: d.survey.title || "", desc: d.survey.desc || "", closed: !!d.survey.closed, questions: Array.isArray(d.survey.questions) ? d.survey.questions : [], privacy: readPrivacy(d.survey.privacy) });
      setHasDraft(false);
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setHasDraft(false);
  };
  useEffect(() => {
    // 수정 모드가 아닐 때만 보류 글 안내
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.get("id") && localStorage.getItem(DRAFT_KEY)) setHasDraft(true);
    } catch {}
  }, []);


  const categories = ["공지사항", "이벤트", "구인", "대회", "서포터즈"];

  const searchParams = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const id = params.get("id");
    const categoryParam = params.get("category");
    if (!id && categoryParam && categories.includes(categoryParam)) {
      setCategory(categoryParam);
    }
    if (id) {
      setEditId(id);
      fetch(`/api/posts/${id}`).then((res) => res.json()).then((json) => {
        if (json.success) {
          const post = json.data;
          setCategory(post.category);
          setTitle(post.title);
          if (post.publishAt) {
            const d = new Date(post.publishAt);
            const pad = (n: number) => String(n).padStart(2, "0");
            setPublishAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
          }
          
          if (post.category === "구인") {
            setRecruitSubCategory(post.recruitSubCategory || "staff");
            setRecruitRole(post.recruitRole || "");
            setRecruitQual(post.recruitQual || "");
            setRecruitTasks(post.recruitTasks || "");
            setRecruitExtra(post.recruitExtra || "");
            if (post.recruitPeriod && post.recruitPeriod.includes("~")) {
              const [start, end] = post.recruitPeriod.split("~").map((s: string) => s.trim());
              setRecruitStartDate(start.replace(/\./g, "-"));
              if (end === "상시") { setIsRecruitAlways(true); setRecruitEndDate(""); }
              else setRecruitEndDate(end.replace(/\./g, "-"));
            }
          } else if (post.category === "대회") {
            setContent(post.content || "");
            setBannerUrl(post.bannerUrl || "");
            setTournamentGame(post.tournamentGame || "");
            setTournamentPrize(post.tournamentPrize || "");
            setTournamentStatus(post.tournamentStatus || "예정됨");
            setTournamentLink(post.tournamentLink || "");
            setTournamentBracket(post.tournamentBracket || "");
            setBracketRounds(parseBracket(post.tournamentBracket || ""));
            setBracketPublic(!!post.tournamentBracketPublic);
            setTournamentWinner(post.tournamentWinner || "");
            setTournamentWinnerId(post.tournamentWinnerId || "");
            setTournamentType(post.tournamentType || "모집");
            setTournamentPhase(phaseOf(post));
            setTournamentTeamDay(post.tournamentTeamDay || ""); setTournamentEventDay(post.tournamentEventDay || "");
            if (post.survey) setSurvey({ enabled: !!post.survey.enabled, title: post.survey.title || "", desc: post.survey.desc || "", closed: !!post.survey.closed, questions: Array.isArray(post.survey.questions) ? post.survey.questions.map((q: any) => ({ qid: q.qid || newQid(), type: q.type || "short", label: q.label || "", desc: q.desc || "", required: !!q.required, options: Array.isArray(q.options) ? q.options : [], etc: !!q.etc })) : [], privacy: readPrivacy(post.survey.privacy) });
            setTournamentSchedule(Array.isArray(post.tournamentSchedule) ? post.tournamentSchedule.map((p: any) => ({ label: p.label || "", start: p.start || "", end: p.end || "" })) : []);
            if (post.tournamentDate && post.tournamentDate.includes("~")) {
              const [start, end] = post.tournamentDate.split("~").map((s: string) => s.trim());
              setTournamentStartDate(start.replace(/\./g, "-"));
              setTournamentEndDate(end.replace(/\./g, "-"));
            } else if (post.tournamentDate) {
              setTournamentStartDate(post.tournamentDate.replace(/\./g, "-"));
            }
          } else {
            setContent(post.content || "");
            setEventTag(post.eventTag || "NONE");
            setBannerUrl(post.bannerUrl || "");
            setNoticeTag(post.noticeTag || (post.isImportant ? "중요" : "일반"));
            setIsPinned(post.isPinned || false);
            setHidden(!!post.hidden);
            
            if (post.eventPeriod && post.eventPeriod.includes("~")) {
              const [start, end] = post.eventPeriod.split("~").map((s: string) => s.trim());
              setEventStartDate(start.replace(/\./g, "-"));
              if (end === "상시") { setIsEventAlways(true); setEventEndDate(""); } 
              else setEventEndDate(end.replace(/\./g, "-"));
            }
          }
        }
      });
    }
  }, [searchParams]);

  const insertWrap = (symbol: string, placeholder = "텍스트") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const scrollY = window.scrollY;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end);
    const inner = selectedText || placeholder;
    const newContent = currentText.substring(0, start) + symbol + inner + symbol + currentText.substring(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start + symbol.length, start + symbol.length + inner.length);
      window.scrollTo({ top: scrollY });
    }, 0);
  };

  // 📌 본문 이미지 — 주소와 설명을 받아 커서 자리에 ![설명](주소) 로 넣는다
  const insertImage = (url: string, caption: string) => {
    const textarea = textareaRef.current;
    const src = url.trim();
    if (!textarea || !src) return;
    const scrollY = window.scrollY;
    const start = textarea.selectionStart;
    const cur = textarea.value;
    const md = `![${caption.trim()}](${src})`;
    const before = cur.substring(0, start);
    const after = cur.substring(start);
    // 이미지는 한 줄을 통째로 차지해야 크게 나온다
    const next = before + (before && !before.endsWith("\n") ? "\n" : "") + md + (after && !after.startsWith("\n") ? "\n" : "") + after;
    setContent(next);
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY });
    }, 0);
  };

  const insertTable = (rows: number = 2, cols: number = 2) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const scrollY = window.scrollY;
    const start = textarea.selectionStart;
    const currentText = textarea.value;

    const headerRow = Array(cols).fill("헤더").map((h, i) => `${h}${i + 1}`).join(" | ");
    const separatorRow = Array(cols).fill("---").join(" | ");
    const dataRow = Array(cols).fill("데이터").map((d, i) => `${d}${i + 1}`).join(" | ");

    let tableLines = [`| ${headerRow} |`, `| ${separatorRow} |`];
    for (let i = 0; i < rows; i++) {
      tableLines.push(`| ${dataRow} |`);
    }
    const table = tableLines.join("\n");
    const newContent = currentText.substring(0, start) + (start > 0 ? "\n" : "") + table + (start < currentText.length ? "\n" : "") + currentText.substring(start);

    setContent(newContent);
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY });
    }, 0);
  };

  const handleModalClose = () => {
    setPopupConfig({ ...popupConfig, isOpen: false });
    if (!popupConfig.isError) {
      if (category === "공지사항") router.push("/notice");
      else if (category === "이벤트") router.push("/event");
      else if (category === "대회") router.push("/tournament");
      else if (category === "서포터즈") router.push(editId ? `/supporters/notice/${editId}` : "/supporters?tab=notice");
      else router.push("/recruit");
      router.refresh();
    }
  };

  // 불러오는 중 · 비로그인 · 관리자 아님 → 공용 가드 화면
  if (gate) return gate;

  const isFormValid = () => {
    if (!title.trim()) return false;
    if (category === "구인") return recruitRole.trim() && recruitTasks.trim() && recruitQual.trim() && recruitStartDate;
    if (category === "이벤트") return eventStartDate && content.trim();
    if (category === "대회") return tournamentGame.trim() && tournamentPrize.trim() && tournamentEventDay;
    return content.trim();
  };

  const formatBulletPoints = (text = "") => text.split("\n").map(line => {
    const t = line.trim();
    return t === "" ? "" : (/^[ \-*]/.test(t) ? t : "• " + t);
  }).filter(line => line !== "").join("\n");

  /* 단계 하나에서 상태·기간을 끌어낸다 — 같은 걸 여러 칸에서 받으면 반드시 어긋난다 (statusFromPhase 는 lib 공용) */
  const dateFromDays = (a: string, b: string) => {
    const f = (v: string) => (v || "").replace(/-/g, ".");
    if (a && b) return `${f(a)} ~ ${f(b)}`;
    return f(a || b);
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setIsSubmitting(true);
    let computedEventPeriod = "";
    if (category === "이벤트" && eventStartDate) {
      const formattedStart = eventStartDate.replace(/-/g, ".");
      computedEventPeriod = isEventAlways ? `${formattedStart} ~ 상시` : (eventEndDate ? `${formattedStart} ~ ${eventEndDate.replace(/-/g, ".")}` : `${formattedStart} ~ 상시`);
    }
    let computedRecruitPeriod = "";
    if (category === "구인" && recruitStartDate) {
      const formattedStart = recruitStartDate.replace(/-/g, ".");
      computedRecruitPeriod = isRecruitAlways ? `${formattedStart} ~ 상시` : (recruitEndDate ? `${formattedStart} ~ ${recruitEndDate.replace(/-/g, ".")}` : `${formattedStart} ~ 상시`);
    }
    // 대표 기간은 팀 배정일 ~ 대회 당일에서 만든다 (따로 묻지 않는다)
    const computedTournamentDate = category === "대회" ? dateFromDays(tournamentTeamDay, tournamentEventDay) : "";
    const postData = {
      author: session?.user?.name || "관리자", category, title,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      hidden,
      ...(category === "공지사항" && { content, noticeTag, isPinned, bannerUrl }),
      ...(category === "이벤트" && { content, eventTag, bannerUrl, eventPeriod: computedEventPeriod }),
      // 서포터즈 글은 본문만 — 태그·배너 없이 /supporters 안에서 펼쳐 읽는다
      ...(category === "서포터즈" && { content }),
      ...(category === "구인" && {
         recruitSubCategory, recruitRole, recruitPeriod: computedRecruitPeriod,
         recruitTasks: formatBulletPoints(recruitTasks), recruitQual: formatBulletPoints(recruitQual), recruitExtra: formatBulletPoints(recruitExtra)
       }),
      ...(category === "대회" && {
         // 상태는 단계에서 파생 — 옛 값을 그대로 보내면 종료된 대회가 '진행중'으로 남는다
         content, bannerUrl, tournamentGame, tournamentPrize, tournamentStatus: statusFromPhase(tournamentPhase), tournamentLink,
         tournamentType, tournamentPhase, tournamentTeamDay, tournamentEventDay,
         tournamentSchedule: tournamentSchedule.filter((p) => p.label.trim()),
         tournamentBracket: serializeBracket(bracketRounds), tournamentBracketPublic: bracketPublic, tournamentWinner, tournamentWinnerId,
         tournamentDate: computedTournamentDate,
         // 📌 참가 설문 — 빈 질문/선택지는 정리해서 저장
         survey: {
           ...survey,
           // 안내를 끈 경우 문구도 함께 비워 저장한다 (꺼진 채 옛 문구가 남지 않게)
           privacy: survey.privacy.enabled
             ? {
                 enabled: true,
                 title: survey.privacy.title.trim() || DEFAULT_PRIVACY_TITLE,
                 body: survey.privacy.body.trim(),
                 confirmLabel: survey.privacy.confirmLabel.trim() || DEFAULT_PRIVACY_CONFIRM,
               }
             : { ...EMPTY_PRIVACY },
           questions: survey.questions
             // 설명 블록은 제목이 없어도 본문만 있으면 유지
             .filter((q) => q.label.trim() || (q.type === "note" && q.desc.trim()))
             .map((q) => ({
               ...q,
               label: q.label.trim(),
               desc: (q.desc || "").trim(),
               required: q.type === "note" ? false : q.required,
               options: isChoiceType(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [],
             })),
         },
       })
    };
    try {
      const res = await fetch(editId ? `/api/posts/${editId}` : "/api/posts", { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postData) });
      if (res.ok) setPopupConfig({ isOpen: true, message: editId ? "수정되었습니다." : "등록되었습니다.", isError: false });
      else setPopupConfig({ isOpen: true, message: "등록 실패", isError: true });
    } catch { setPopupConfig({ isOpen: true, message: "서버 통신 오류", isError: true }); }
    finally { setIsSubmitting(false); }
  };

  // 본문 편집기 — 패널 안에서 테두리 없이 제목 아래로 이어진다
  const textareaClass = "w-full bg-transparent border-0 text-[15px] text-[#131313] outline-none resize-none leading-[1.9] placeholder:text-[#a3a3a3] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";
  // 구인 세 칸 · 설문 긴 입력 — 공용 입력칸 모양에 줄 수만 늘린다
  const areaClass = `${inputClass} resize-y leading-relaxed`;
  const usesEditor = category === "공지사항" || category === "이벤트" || category === "대회" || category === "서포터즈";
  const req = <span className="text-[#e91e3f]">*</span>;
  const optTag = <span className="text-[#8a8a8a] font-normal">(선택)</span>;
  const iconBtn = "w-8 h-8 inline-flex items-center justify-center rounded-full text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] hover:bg-[#f2f2f2] disabled:opacity-25 disabled:hover:bg-transparent transition-colors";
  const delBtn = "w-8 h-8 inline-flex items-center justify-center rounded-full text-[#a3a3a3] hover:text-[#d01634] hover:bg-[#f2f2f2] transition-colors";
  const winBtn = (on: boolean) => `h-8 px-3 rounded-full border text-[12px] font-bold transition-colors disabled:opacity-30 ${on ? "bg-emerald-500 border-emerald-500 text-[#131313]" : "border-[#a3a3a3] text-[#5a5a5a] hover:border-emerald-500"}`;
  const validImage = /^https?:\/\/\S+$/i.test(imageUrl.trim());

  // 📌 글 종류는 머리 탭 한 줄로 (예전엔 ?category= 로만 바뀌었다). 수정 중에는 종류를 바꿀 수 없으니 지금 것만 보인다
  const kindTabs = (editId ? [category] : categories).map((c) => ({ id: c, short: c }));

  return (
    <AdminPage
      section="작성"
      title={editId ? "글 수정" : "글쓰기"}
      tabs={<AdminTabs tabs={kindTabs} current={category} onSelect={(id) => { if (!editId) setCategory(id); }} />}
    >
      {/* 📌 두 칸 — 왼쪽 넓은 칸은 글 자체(제목 · 본문 · 종류별 항목), 오른쪽 좁은 칸은 게시 설정 + 등록 단추(따라 내려온다).
             xl 미만은 위아래로. flex-col 에서는 gap 이 먹지 않는 빌드라 칸 사이는 margin 으로 */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {/* 보류된 글 이어서 작성 */}
          {hasDraft && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#ededed] bg-white px-5 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0" />
              <p className="min-w-0 flex-1 text-[13px] font-bold">보류된 글이 있습니다</p>
              <Btn variant="ghost" size="sm" onClick={discardDraft}>삭제</Btn>
              <Btn size="sm" onClick={restoreDraft}>이어서 작성</Btn>
            </div>
          )}

          {/* 📌 제목 + 본문 — 한 판 안에서 문서처럼 이어 쓴다 */}
          <Panel flush>
            <input type="text" placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required
              className="block w-full px-5 py-4 bg-transparent border-b border-[#ededed] text-[20px] md:text-[22px] font-black tracking-tight text-[#131313] placeholder:text-[#a3a3a3] outline-none" />

            {usesEditor && (
              <>
                <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-[#ededed]">
                  <Btn variant="ghost" size="sm" onClick={() => insertWrap("**")}><span className="text-[14px] font-black">B</span>굵게</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => insertWrap("__")}><span className="text-[14px] underline">U</span>밑줄</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => insertWrap("~~")}><span className="text-[14px] line-through">S</span>취소선</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => insertWrap("==")}><span className="text-[14px] font-black text-[#e91e3f]">A</span>강조</Btn>
                  <span aria-hidden className="w-px h-4 mx-1 bg-[#ededed]" />
                  <Btn variant="ghost" size="sm" onClick={() => insertTable(2, 2)}><span className="text-[14px]">⊞</span>표</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setImageOpen(true)} title="본문에 넣은 이미지는 글 너비에 맞춰 크게 나옵니다."><span className="text-[14px]">🖼</span>이미지</Btn>
                </div>
                <textarea ref={textareaRef} placeholder="내용을 입력하세요..." value={content} onChange={(e) => setContent(e.target.value)} className={`block min-h-[400px] px-5 py-4 ${textareaClass}`} />
              </>
            )}

            {category === "구인" && (
              <>
                <FieldRow top label={<>지원 자격 {req}</>}>
                  <textarea rows={4} placeholder="지원에 필요한 자격 요건을 입력하세요." value={recruitQual} onChange={(e) => setRecruitQual(e.target.value)} className={areaClass} />
                </FieldRow>
                <FieldRow top label={<>주요 업무 {req}</>}>
                  <textarea rows={4} placeholder="담당하게 될 주요 업무를 입력하세요." value={recruitTasks} onChange={(e) => setRecruitTasks(e.target.value)} className={areaClass} />
                </FieldRow>
                <FieldRow top label={<>우대 사항 및 추가 안내 {optTag}</>}>
                  <textarea rows={3} placeholder="우대 사항 또는 혜택 등을 자유롭게 입력하세요." value={recruitExtra} onChange={(e) => setRecruitExtra(e.target.value)} className={areaClass} />
                </FieldRow>
              </>
            )}
          </Panel>

          {category === "이벤트" && (
            <Panel flush>
              <FieldRow label={<>이벤트 기간 {req}</>}>
                <DateRange start={eventStartDate} end={eventEndDate} always={isEventAlways}
                  onStart={setEventStartDate} onEnd={setEventEndDate}
                  onAlways={(v) => { setIsEventAlways(v); if (v) setEventEndDate(""); }} alwaysLabel="상시 진행" />
              </FieldRow>
            </Panel>
          )}

          {category === "구인" && (
            <Panel flush>
              <FieldRow label={<>모집 직책명 (태그) {req}</>}>
                <input type="text" placeholder="예: MANAGER, SUPPORTERS" value={recruitRole} onChange={(e) => setRecruitRole(e.target.value)} className={`${inputClass} font-bold`} />
              </FieldRow>
              <FieldRow label={<>모집 기간 {req}</>}>
                <DateRange start={recruitStartDate} end={recruitEndDate} always={isRecruitAlways}
                  onStart={setRecruitStartDate} onEnd={setRecruitEndDate}
                  onAlways={(v) => { setIsRecruitAlways(v); if (v) setRecruitEndDate(""); }} alwaysLabel="상시 모집" />
              </FieldRow>
            </Panel>
          )}

          {category === "대회" && (
            <>
              {/* 📌 대회 단계 — 글 하나가 접수부터 종료까지 따라간다.
                     타입(모집/대진표)으로 글을 쪼개던 구조를 대체한다. */}
              <Panel title={<>대회 단계 {req}</>}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {PHASES.map((ph) => {
                    const on = tournamentPhase === ph.id;
                    return (
                      <button key={ph.id} type="button" onClick={() => setTournamentPhase(ph.id)} aria-pressed={on}
                        className={`text-left rounded-xl border px-3.5 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "border-[#131313] ring-1 ring-[#131313]" : "border-[#ededed] hover:border-[#a3a3a3]"}`}>
                        <p className={`text-[11px] font-bold ${on ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>{ph.code}</p>
                        <p className={`mt-0.5 text-[13px] font-black ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{ph.label}</p>
                        <p className="mt-0.5 text-[12px] text-[#5a5a5a] leading-snug break-keep">{ph.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="대회 정보" flush>
                {/* 📌 두 날짜만 있으면 단계가 자동으로 흘러간다 (토: 팀 배정 → 일주일 연습 → 일: 대회 당일) */}
                <FieldRow label="팀 배정일" hint="경매하는 날">
                  <input type="date" value={tournamentTeamDay} onChange={(e) => setTournamentTeamDay(e.target.value)} className={dateClass} />
                </FieldRow>
                <FieldRow label={<>대회 당일 {req}</>} hint={
                  <>
                    8강~결승을 하루에
                    {tournamentTeamDay && tournamentEventDay && (
                      <span className="block">연습 주간은 <b className="text-[#131313]">{tournamentTeamDay}</b> 다음날부터 <b className="text-[#131313]">{tournamentEventDay}</b> 전날까지로 잡힙니다.</span>
                    )}
                  </>
                }>
                  <input type="date" value={tournamentEventDay} onChange={(e) => setTournamentEventDay(e.target.value)} className={dateClass} />
                </FieldRow>
                <FieldRow label={<>종목 영문명 (부제) {req}</>}>
                  <input type="text" placeholder="예: LEAGUE OF LEGENDS" value={tournamentGame} onChange={(e) => setTournamentGame(e.target.value)} className={`${inputClass} font-bold`} />
                </FieldRow>
                <FieldRow label={<>보상 및 상금 {req}</>}>
                  <input type="text" placeholder="예: 총 상금 1,000,000원" value={tournamentPrize} onChange={(e) => setTournamentPrize(e.target.value)} className={inputClass} />
                </FieldRow>
                <FieldRow label={<>참가 신청 링크 {tournamentPhase === "접수" ? <span className="text-[#e91e3f]">(권장)</span> : optTag}</>}>
                  <input type="text" placeholder="https://..." value={tournamentLink} onChange={(e) => setTournamentLink(e.target.value)} className={inputClass} />
                </FieldRow>
              </Panel>

              {/* 📌 대진표 — 단계와 무관하게 언제든 짤 수 있다.
                     연습 주간에 미리 만들어 두고 공개는 따로 정한다. */}
              <Panel title="대진표" right={bracketRounds.length > 0 && <Btn variant="ghost" size="sm" onClick={() => setBracketRounds([])}>전체 초기화</Btn>}>
                {/* 자동 생성기 — 세 묶음을 한 줄에 (좁으면 줄바꿈) */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Inline>
                    <span className="font-bold">단일 토너먼트</span>
                    {[4, 8, 16].map((n) => (
                      <Btn key={n} variant="secondary" size="sm" onClick={() => quickBracket(n)}>{n}팀</Btn>
                    ))}
                  </Inline>
                  <Inline>
                    <span className="font-bold">패자부활전 (더블 엘리미네이션)</span>
                    {[4, 8, 16].map((n) => (
                      <Btn key={n} variant="secondary" size="sm" onClick={() => doubleBracket(n)}>{n}팀</Btn>
                    ))}
                  </Inline>
                  <Inline>
                    <span className="font-bold">직접 추가</span>
                    {GROUP_ORDER.map((g) => (
                      <Btn key={g} variant="secondary" size="sm" onClick={() => setBracketRounds([...bracketRounds, { name: "", bracket: g, matches: [{ a: "", b: "", winner: "" }] }])}>+ {GROUP_LABEL[g]}</Btn>
                    ))}
                  </Inline>
                </div>

                {/* 라운드 편집 */}
                <div className="mt-5">
                  {bracketRounds.length === 0 ? (
                    <EmptyRow>위 버튼으로 토너먼트 골격을 자동 생성하거나 라운드를 직접 추가하세요.</EmptyRow>
                  ) : (
                    <div className="space-y-3">
                      {bracketRounds.map((round, ri) => {
                        // 그룹 색(승자조 초록 · 패자조 주황 · 결승 빨강)은 데이터에 딸린 색이라 그대로 둔다
                        const gBorder = round.bracket === "L" ? "border-l-orange-400/60" : round.bracket === "F" ? "border-l-[#e91e3f]/60" : "border-l-emerald-400/60";
                        return (
                          <div key={ri} className={`rounded-xl border border-[#ededed] border-l-4 ${gBorder} p-4`}>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <div className="flex gap-1 shrink-0">
                                {GROUP_ORDER.map((g) => {
                                  const active = round.bracket === g;
                                  const activeCls = g === "L" ? "bg-orange-500/15 border-orange-500/40 text-orange-700" : g === "F" ? "bg-[#e91e3f]/15 border-[#e91e3f]/40 text-[#e91e3f]" : "bg-emerald-500/15 border-emerald-500/40 text-emerald-700";
                                  return <button key={g} type="button" onClick={() => updateRound(ri, { bracket: g })} className={`h-8 px-3 rounded-full border text-[12px] font-bold transition-colors ${active ? activeCls : "border-[#ededed] text-[#8a8a8a] hover:text-[#131313] hover:border-[#a3a3a3]"}`}>{GROUP_LABEL[g]}</button>;
                                })}
                              </div>
                              <input type="text" placeholder="라운드명 (예: 8강)" value={round.name} onChange={(e) => updateRound(ri, { name: e.target.value })} className={`${inputClass} !w-36 font-bold`} />
                              <Btn variant="secondary" size="sm" onClick={() => updateRound(ri, { matches: [...round.matches, { a: "", b: "", winner: "" }] })}>매치 추가</Btn>
                              <Btn variant="ghost" size="sm" className="ml-auto" onClick={() => setBracketRounds(bracketRounds.filter((_, i) => i !== ri))}>라운드 삭제</Btn>
                            </div>
                            <div className="space-y-2">
                              {round.matches.map((m, mi) => (
                                <div key={mi} className="flex flex-wrap items-center gap-2">
                                  <span className="w-5 shrink-0 text-center text-[12px] font-bold text-[#8a8a8a] tabular-nums">{mi + 1}</span>
                                  <input type="text" placeholder="팀 A" value={m.a} onChange={(e) => updateMatch(ri, mi, { a: e.target.value, winner: m.winner === m.a ? e.target.value : m.winner })} className={`${inputClass} flex-1 min-w-[100px] ${m.winner && m.winner === m.a ? "!border-emerald-500" : ""}`} />
                                  <span className="shrink-0 text-[12px] font-bold text-[#a3a3a3]">VS</span>
                                  <input type="text" placeholder="팀 B" value={m.b} onChange={(e) => updateMatch(ri, mi, { b: e.target.value, winner: m.winner === m.b ? e.target.value : m.winner })} className={`${inputClass} flex-1 min-w-[100px] ${m.winner && m.winner === m.b ? "!border-emerald-500" : ""}`} />
                                  <div className="flex gap-1 shrink-0">
                                    <button type="button" disabled={!m.a.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.a ? "" : m.a })} className={winBtn(!!m.winner && m.winner === m.a)}>A승</button>
                                    <button type="button" disabled={!m.b.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.b ? "" : m.b })} className={winBtn(!!m.winner && m.winner === m.b)}>B승</button>
                                  </div>
                                  <button type="button" onClick={() => updateRound(ri, { matches: round.matches.filter((_, j) => j !== mi) })} aria-label="매치 삭제" className={`shrink-0 text-[16px] font-bold ${delBtn}`}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 실시간 미리보기 */}
                {serializeBracket(bracketRounds).trim() && (
                  <div className="mt-5 rounded-xl border border-[#ededed] p-4">
                    <p className="mb-3 text-[12px] font-bold text-[#5a5a5a]">미리보기 · 대회 페이지 표시 형태</p>
                    <BracketView text={serializeBracket(bracketRounds)} showHeader={false} />
                  </div>
                )}

                {/* 📌 공개 여부 — 짜는 것과 보여주는 것을 나눈다.
                       대회 당일부터는 숨길 이유가 없으므로 잠그고 항상 공개로 둔다. */}
                {bracketRounds.length > 0 && (() => {
                  const forced = tournamentPhase === "당일" || tournamentPhase === "종료";
                  const on = forced || bracketPublic;
                  return (
                    <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#ededed] px-4 py-3">
                      <Switch on={on} disabled={forced} onChange={() => setBracketPublic((v) => !v)} label="대진표 공개" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#131313]">{on ? "대진표를 참가자에게 공개" : "대진표를 아직 숨김"}</p>
                        <p className="mt-0.5 text-[12px] text-[#5a5a5a] break-keep">
                          {forced
                            ? "대회 당일부터는 항상 공개됩니다."
                            : on
                              ? "지금 대회 페이지에 대진표가 보입니다."
                              : "짜두기만 하고 보여주지 않습니다. 관리자에게는 계속 보입니다."}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </Panel>

              <Panel title="우승" flush>
                <FieldRow label="우승팀 / 우승자" hint="선택 · 명예의 전당 표시">
                  <input type="text" placeholder="예시: 이글루A" value={tournamentWinner} onChange={(e) => setTournamentWinner(e.target.value)} className={inputClass} />
                </FieldRow>
                {/* 팀원은 한 명씩 칩으로 담는다 — 쉼표로 나열하면 오타를 알아채기 어렵다 */}
                <div className="px-5 py-4">
                  <DiscordIdInput value={tournamentWinnerId} onChange={setTournamentWinnerId} label="우승 팀원 명단 (명예의 전당에 각자 프로필로 표시)" />
                </div>
              </Panel>

              {/* 📌 참가 설문 (구글폼 형식) — 켜기 스위치는 판 머리에, 켜면 설정 줄 → 문항 도구 → 문항 → 문항 추가 순으로 */}
              <Panel
                title="참가 설문"
                flush
                className={survey.enabled ? "" : "[&>div:first-child]:border-b-0"}
                right={
                  <>
                    {survey.enabled && survey.questions.length > 0 && (
                      <span className="text-[12px] text-[#8a8a8a] tabular-nums">
                        문항 {survey.questions.length}개 · 필수 {survey.questions.filter((q) => q.required).length}개
                      </span>
                    )}
                    {survey.enabled && (
                      <Btn variant="secondary" size="sm" onClick={() => setSurveyPreview(true)} disabled={!survey.questions.length}>미리보기</Btn>
                    )}
                    <Toggle on={survey.enabled} onClick={() => setSurvey({ ...survey, enabled: !survey.enabled })} onLabel="설문 사용 중" offLabel="설문 사용 안 함" />
                  </>
                }
              >
                {survey.enabled && (
                  <>
                    <FieldRow label="설문 제목">
                      <input type="text" placeholder="예: 제1회 대회 참가 신청서" value={survey.title} onChange={(e) => setSurvey({ ...survey, title: e.target.value })} className={inputClass} />
                    </FieldRow>
                    <FieldRow label={<>설명 {optTag}</>}>
                      <input type="text" value={survey.desc} onChange={(e) => setSurvey({ ...survey, desc: e.target.value })} className={inputClass} />
                    </FieldRow>
                    <FieldRow label="접수">
                      <Segmented
                        options={[{ v: "open", l: "접수 중" }, { v: "closed", l: "접수 마감됨" }]}
                        value={survey.closed ? "closed" : "open"}
                        onChange={(v) => setSurvey({ ...survey, closed: v === "closed" })}
                      />
                    </FieldRow>

                    {/* 개인정보 수집·이용 안내 — 참가자가 제출 전 반드시 동의해야 한다 */}
                    <FieldRow top label="개인정보 수집 · 이용 안내" hint={survey.privacy.enabled ? undefined : "계좌번호 · 실명 등을 받는 대회라면 반드시 켭니다."}>
                      <div className="min-h-10 flex items-center">
                        <Toggle
                          on={survey.privacy.enabled}
                          onClick={() => {
                            const on = !survey.privacy.enabled;
                            // 처음 켤 때는 기본 문구를 미리 채워 준다
                            if (on && !survey.privacy.body.trim()) {
                              setPrivacy({ enabled: true, title: DEFAULT_PRIVACY_TITLE, body: DEFAULT_PRIVACY_BODY, confirmLabel: DEFAULT_PRIVACY_CONFIRM });
                            } else {
                              setPrivacy({ enabled: on });
                            }
                          }}
                          onLabel="사용 중"
                          offLabel="사용 안 함"
                        />
                      </div>
                      {survey.privacy.enabled && (
                        <div className="mt-3 space-y-4">
                          <div>
                            <label className={labelClass}>안내 제목</label>
                            <input type="text" value={survey.privacy.title} onChange={(e) => setPrivacy({ title: e.target.value })} placeholder={DEFAULT_PRIVACY_TITLE} className={inputClass} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <label className="text-[13px] font-bold text-[#131313]">안내 본문</label>
                              <Btn variant="secondary" size="sm" onClick={() => setPrivacy({ title: DEFAULT_PRIVACY_TITLE, body: DEFAULT_PRIVACY_BODY, confirmLabel: DEFAULT_PRIVACY_CONFIRM })}>기본 문구 넣기</Btn>
                            </div>
                            <textarea value={survey.privacy.body} onChange={(e) => setPrivacy({ body: e.target.value })} rows={12} placeholder="수집 목적 · 수집 항목 · 보유 기간을 적어 주세요." className={`${areaClass} text-[13px]`} />
                            <p className={fieldNote}>줄바꿈은 그대로 보입니다.</p>
                          </div>
                          <div>
                            <label className={labelClass}>동의 체크 문구</label>
                            <input type="text" value={survey.privacy.confirmLabel} onChange={(e) => setPrivacy({ confirmLabel: e.target.value })} placeholder={DEFAULT_PRIVACY_CONFIRM} className={inputClass} />
                            <p className={fieldNote}>체크하지 않으면 참가자의 제출 버튼이 잠깁니다.</p>
                          </div>
                        </div>
                      )}
                    </FieldRow>

                    {/* 템플릿 · 일괄 조작 */}
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-[#ededed]">
                      <span className="mr-1 text-[13px] font-bold">템플릿</span>
                      {SURVEY_TEMPLATES.map((t) => (
                        <Btn key={t.name} variant="secondary" size="sm" onClick={() => applyTemplate(t)} title={t.desc}>{t.name}</Btn>
                      ))}
                      {survey.questions.length > 0 && (
                        <div className="ml-auto flex items-center gap-1">
                          <Btn variant="ghost" size="sm" onClick={() => setSurvey({ ...survey, questions: survey.questions.map((q) => ({ ...q, required: !survey.questions.every((x) => x.required) })) })}>
                            {survey.questions.every((q) => q.required) ? "필수 전체 해제" : "전체 필수로"}
                          </Btn>
                          <Btn variant="ghost" size="sm" onClick={() => { if (confirm("작성한 문항을 모두 삭제할까요?")) setSurvey({ ...survey, questions: [] }); }}>전체 삭제</Btn>
                        </div>
                      )}
                    </div>

                    {/* 질문 목록 */}
                    {survey.questions.length === 0 ? (
                      <div className="px-5 py-4 border-b border-[#ededed]">
                        <EmptyRow>위 템플릿을 고르거나, 아래에서 문항을 추가하세요.</EmptyRow>
                      </div>
                    ) : (
                      <div>
                        {survey.questions.map((q, qi) => {
                          const isOpen = !collapsed[q.qid];
                          const dupOpts = q.options.filter((o, i) => o.trim() && q.options.findIndex((x) => x.trim() === o.trim()) !== i);
                          const isOver = overQ === qi && dragQ !== null && dragQ !== qi;
                          return (
                            <div
                              key={q.qid}
                              onDragOver={(e) => { if (dragQ !== null) { e.preventDefault(); setOverQ(qi); } }}
                              onDrop={(e) => { if (dragQ !== null) { e.preventDefault(); dropQuestion(qi); setDragQ(null); setOverQ(null); } }}
                              // 놓일 자리는 위쪽 빨간 선 + 들어간 면으로 (색 덩어리 대신)
                              className={`px-5 border-t-2 border-b border-[#ededed] transition-colors ${dragQ === qi ? "opacity-40" : ""} ${isOver ? "border-t-[#e91e3f] bg-[#f2f2f2]" : "border-t-transparent"}`}
                            >
                              <div className="flex flex-wrap items-center gap-2 py-3">
                                {/* 드래그 핸들 */}
                                <span
                                  draggable
                                  onDragStart={() => setDragQ(qi)}
                                  onDragEnd={() => { setDragQ(null); setOverQ(null); }}
                                  title="끌어서 순서 변경"
                                  className="shrink-0 cursor-grab active:cursor-grabbing px-1 py-2 text-[#a3a3a3] hover:text-[#5a5a5a] select-none leading-none"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>
                                </span>
                                <span className="w-5 shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{String(qi + 1).padStart(2, "0")}</span>
                                <input
                                  type="text"
                                  placeholder={q.type === "note" ? "설명 제목 (비워둘 수 있음)" : "질문을 입력하세요"}
                                  value={q.label}
                                  onChange={(e) => updateQuestion(qi, { label: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestion(q.type); } }}
                                  className={`${inputClass} flex-1 min-w-[160px] font-bold`}
                                />
                                <select value={q.type} onChange={(e) => { const t = e.target.value; updateQuestion(qi, { type: t, options: isChoiceType(t) && q.options.length === 0 ? ["선택지 1"] : q.options, required: t === "note" ? false : q.required }); }} className={`${inputClass} !w-auto shrink-0`}>
                                  {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                                </select>
                                {q.type !== "note" && (
                                  <button type="button" onClick={() => updateQuestion(qi, { required: !q.required })} title="필수 응답 여부" aria-pressed={q.required}
                                    className={`shrink-0 h-8 px-3 rounded-full border text-[12px] font-bold transition-colors ${q.required ? "border-[#e91e3f] text-[#e91e3f]" : "border-[#a3a3a3] text-[#5a5a5a] hover:text-[#131313] hover:border-[#131313]"}`}>필수</button>
                                )}
                                <div className="flex shrink-0">
                                  <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0} title="위로" className={iconBtn}>▲</button>
                                  <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === survey.questions.length - 1} title="아래로" className={iconBtn}>▼</button>
                                  <button type="button" onClick={() => dupQuestion(qi)} title="문항 복사" className={iconBtn}>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [q.qid]: !c[q.qid] }))} title={isOpen ? "접기" : "펼치기"} className={iconBtn}>
                                    <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                                  </button>
                                  <button type="button" onClick={() => removeQuestion(qi)} title="문항 삭제" className={delBtn}>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              </div>

                              {/* 📌 부가 설명 — 모든 문항 공통 (note 타입은 이게 본문) */}
                              {isOpen && (
                                <div className="md:pl-9 pb-3">
                                  <textarea
                                    rows={q.type === "note" ? 3 : 1}
                                    placeholder={q.type === "note" ? "참가자에게 보여줄 안내 문구를 입력하세요 (줄바꿈 가능)" : "부가 설명 (선택) — 질문 아래 회색으로 표시됩니다"}
                                    value={q.desc}
                                    onChange={(e) => updateQuestion(qi, { desc: e.target.value })}
                                    className={`${areaClass} text-[13px]`}
                                  />
                                </div>
                              )}

                              {isOpen && (isChoiceType(q.type) ? (
                                <div className="md:pl-9 pb-4 space-y-1.5">
                                  {q.options.map((opt, oi) => (
                                    <div
                                      key={oi}
                                      onDragOver={(e) => { if (dragOpt?.qi === qi) e.preventDefault(); }}
                                      onDrop={(e) => { if (dragOpt?.qi === qi) { e.preventDefault(); dropOption(qi, oi); setDragOpt(null); } }}
                                      className={`flex items-center gap-2 group/opt ${dragOpt && dragOpt.qi === qi && dragOpt.oi === oi ? "opacity-40" : ""}`}
                                    >
                                      <span
                                        draggable
                                        onDragStart={() => setDragOpt({ qi, oi })}
                                        onDragEnd={() => setDragOpt(null)}
                                        title="끌어서 순서 변경"
                                        className="shrink-0 cursor-grab active:cursor-grabbing text-[#a3a3a3] group-hover/opt:text-[#5a5a5a] leading-none"
                                      >
                                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/></svg>
                                      </span>
                                      <span className={`w-3 h-3 shrink-0 border border-[#a3a3a3] ${q.type === "single" ? "rounded-full" : "rounded-[3px]"}`}></span>
                                      <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => updateQuestion(qi, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                                        onPaste={(e) => { const txt = e.clipboardData.getData("text"); if (pasteOptions(qi, oi, txt)) e.preventDefault(); }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") { e.preventDefault(); const opts = [...q.options]; opts.splice(oi + 1, 0, ""); updateQuestion(qi, { options: opts }); }
                                          if (e.key === "Backspace" && !opt && q.options.length > 1) { e.preventDefault(); updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) }); }
                                        }}
                                        placeholder={`선택지 ${oi + 1}`}
                                        className={`${inputClass} flex-1 min-w-0`}
                                      />
                                      <button type="button" onClick={() => { const opts = [...q.options]; opts.splice(oi + 1, 0, opt); updateQuestion(qi, { options: opts }); }} title="선택지 복사" className="shrink-0 px-1 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] opacity-0 group-hover/opt:opacity-100 focus:opacity-100 transition-opacity">복사</button>
                                      {q.options.length > 1 && (
                                        <button type="button" onClick={() => updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })} title="선택지 삭제" className={`shrink-0 text-[14px] font-bold ${delBtn}`}>×</button>
                                      )}
                                    </div>
                                  ))}
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
                                    <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options, ""] })} className="text-[12px] font-bold text-[#e91e3f] hover:text-[#d01634]">+ 선택지 추가</button>
                                    <button type="button" onClick={() => updateQuestion(qi, { etc: !q.etc })} className={`text-[12px] font-bold ${q.etc ? "text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>기타(직접 입력) {q.etc ? "사용 중" : "추가"}</button>
                                    <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options].sort((a, b) => a.localeCompare(b, "ko")) })} className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313]">가나다 정렬</button>
                                    <span className="text-[12px] text-[#8a8a8a]">Enter=추가 · 여러 줄 붙여넣기=일괄 등록</span>
                                  </div>
                                  {dupOpts.length > 0 && (
                                    <p className="pt-1 text-[12px] font-bold text-amber-700">중복된 선택지가 있습니다: {[...new Set(dupOpts)].join(", ")}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="md:pl-9 pb-4 text-[12px] text-[#5a5a5a]">
                                  {q.type === "short" ? "참가자가 한 줄로 입력합니다."
                                    : q.type === "long" ? "참가자가 여러 줄로 입력합니다."
                                    : "입력칸 없이 안내 문구만 표시됩니다. (응답에 포함되지 않음)"}
                                </p>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 문항 추가 */}
                    <div className="px-5 py-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {Q_TYPES.map((t) => (
                          <Btn key={t.v} variant="secondary" size="sm" onClick={() => addQuestion(t.v)}>+ {t.l}</Btn>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[12px] font-bold text-[#5a5a5a]">자주 쓰는 문항</span>
                        {QUICK_QS.map((x) => (
                          <button key={x.l} type="button" onClick={() => addQuickQuestion(x.q)} className="h-8 px-3 rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">{x.l}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </Panel>
            </>
          )}
        </div>

        {/* 📌 오른쪽 칸 — 게시 설정 + 등록 단추. 넓은 화면에서는 따라 내려와 긴 대회 글에서도 단추가 늘 보인다 */}
        <aside className="mt-5 xl:mt-0 xl:ml-6 xl:w-[360px] shrink-0 xl:sticky xl:top-[88px] xl:max-h-[calc(100dvh-104px)] xl:overflow-y-auto no-bar">
          <Panel title="게시 설정" flush>
            {/* 📌 예약 발행 (비우면 즉시 공개) */}
            <SideRow label={<>예약 발행 {optTag}</>} right={publishAt ? <Btn variant="ghost" size="sm" onClick={() => setPublishAt("")}>해제</Btn> : null}>
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={inputClass} />
              {publishAt && <p className={fieldNote}>해당 시각부터 공개됩니다</p>}
            </SideRow>

            {/* 📌 글 가리기 — 삭제와 달리 되돌릴 수 있다 */}
            <SideRow label="글 가리기" right={<Switch on={hidden} onChange={() => setHidden((v) => !v)} label="글 가리기" />}>
              {hidden && <p className="text-[12px] font-bold text-amber-700 break-keep">이 글은 목록과 링크에서 감춰집니다. 관리자만 볼 수 있습니다.</p>}
            </SideRow>

            {category === "공지사항" && (
              <>
                <SideRow label="카테고리 태그">
                  <Segmented options={[{ v: "일반", l: "일반" }, { v: "중요", l: "중요" }, { v: "업데이트", l: "업데이트" }]} value={noticeTag} onChange={setNoticeTag} />
                </SideRow>
                <SideRow label="상단에 중요 공지로 고정" right={<Switch on={isPinned} onChange={setIsPinned} label="상단에 중요 공지로 고정" />} />
                <SideRow label={<>상단 배너 URL {optTag}</>}>
                  <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className={inputClass} />
                </SideRow>
              </>
            )}

            {category === "이벤트" && (
              <>
                <SideRow label="강조 태그">
                  <Segmented options={[{ v: "NONE", l: "선택 안함" }, { v: "HOT", l: "HOT" }, { v: "NEW", l: "NEW" }, { v: "종료", l: "종료됨" }]} value={eventTag} onChange={setEventTag} />
                </SideRow>
                <SideRow label="배너 이미지 URL">
                  <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className={inputClass} />
                </SideRow>
              </>
            )}

            {category === "구인" && (
              <SideRow label="모집 분류 (필터)">
                <Segmented options={[{ v: "staff", l: "스태프 모집" }, { v: "sup", l: "서포터즈 모집" }]} value={recruitSubCategory} onChange={setRecruitSubCategory} />
              </SideRow>
            )}

            {category === "대회" && (
              <SideRow label={<>배너 이미지 URL {optTag}</>}>
                <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className={inputClass} />
              </SideRow>
            )}

            {/* 제출 — 등록/수정 조건(isFormValid)은 그대로. 보류는 새 글에서만 */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-4">
              <Btn variant="ghost" onClick={() => router.back()}>취소</Btn>
              {!editId && <Btn variant="secondary" onClick={saveDraft}>보류</Btn>}
              <Btn type="submit" disabled={isSubmitting || !isFormValid()} className="ml-auto">{isSubmitting ? "처리 중..." : editId ? "수정하기" : "등록하기"}</Btn>
            </div>
          </Panel>
        </aside>
      </form>

      {/* 📌 설문 미리보기 — 참가자에게 보이는 그대로 */}
      {surveyPreview && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={() => setSurveyPreview(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white border border-[#ededed] w-full max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] overflow-hidden text-[#131313]">
            <div className="shrink-0 flex items-start gap-3 px-5 sm:px-8 pt-5 pb-4 border-b border-[#ededed]">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-[#8a8a8a]">미리보기</p>
                <h2 className="mt-1 text-[18px] sm:text-[20px] font-black tracking-tight leading-tight break-keep">{survey.title || `${title || "대회"} 참가 신청서`}</h2>
                {survey.desc && <p className="mt-1.5 text-[13px] text-[#5a5a5a] leading-relaxed whitespace-pre-wrap">{survey.desc}</p>}
              </div>
              <button type="button" onClick={() => setSurveyPreview(false)} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8">
              {(() => { let n = 0; return survey.questions.map((q) => {
                if (q.type !== "note") n += 1;
                const no = n;
                return (
                <div key={q.qid} className="py-6 border-b border-[#ededed] last:border-b-0">
                  {q.type === "note" ? (
                    <div className="border-l-2 border-emerald-500/50 pl-4">
                      {q.label && <p className="text-[14px] sm:text-[15px] font-black mb-1.5 break-keep">{q.label}</p>}
                      <p className="text-[13px] text-[#5a5a5a] leading-relaxed whitespace-pre-wrap break-keep">{q.desc || <span className="text-[#a3a3a3]">(설명 미입력)</span>}</p>
                    </div>
                  ) : (<>
                  <div className="flex items-start gap-3 mb-4">
                    <span className="shrink-0 mt-0.5 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{String(no).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] sm:text-[15px] font-bold leading-snug break-keep">
                        {q.label || <span className="text-[#a3a3a3]">(질문 미입력)</span>}
                        {q.required && <span className="text-[#e91e3f] ml-1">*</span>}
                      </p>
                      {q.desc && <p className="text-[12px] text-[#5a5a5a] mt-1.5 leading-relaxed whitespace-pre-wrap break-keep">{q.desc}</p>}
                    </div>
                  </div>
                  <div className="sm:pl-7">
                    {q.type === "short" && <div className="border-b border-[#a3a3a3] py-2.5 text-[14px] text-[#a3a3a3]">답변을 입력해주세요</div>}
                    {q.type === "long" && <div className="border-b border-[#a3a3a3] py-2.5 pb-12 text-[14px] text-[#a3a3a3]">답변을 입력해주세요</div>}
                    {isChoiceType(q.type) && (
                      <div className="border-t border-[#ededed]">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-3 px-1 py-3 border-b border-[#ededed]">
                            <span className={`w-4 h-4 border-2 border-[#a3a3a3] shrink-0 ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
                            <span className="text-[14px] text-[#5a5a5a]">{opt || `선택지 ${oi + 1}`}</span>
                          </div>
                        ))}
                        {q.etc && (
                          <div className="flex items-center gap-3 px-1 py-3 border-b border-[#ededed]">
                            <span className={`w-4 h-4 border-2 border-[#a3a3a3] shrink-0 ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
                            <span className="text-[14px] text-[#5a5a5a]">기타 (직접 입력)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </>)}
                </div>
                );
              }); })()}
            </div>
            <div className="shrink-0 px-5 sm:px-8 py-3.5 border-t border-[#ededed] flex justify-end">
              <Btn variant="secondary" onClick={() => setSurveyPreview(false)}>미리보기 닫기</Btn>
            </div>
          </div>
        </div>
      )}

      {/* 본문 이미지 넣기 — 주소를 넣으면 미리 보여주고, 넣으면 글 너비에 맞춰 크게 들어간다 */}
      {imageOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 overlay-in" onClick={() => setImageOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white border border-[#ededed] rounded-2xl w-full max-w-md p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
            <h2 className="text-[17px] font-black tracking-tight">본문에 이미지 넣기</h2>

            <label className={`${labelClass} mt-5`}>이미지 주소 {req}</label>
            <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} autoFocus placeholder="https://..." className={inputClass} />

            <label className={`${labelClass} mt-4`}>설명 {optTag}</label>
            <input type="text" value={imageCap} onChange={(e) => setImageCap(e.target.value)} placeholder="이미지 아래 작게 들어갑니다" className={inputClass} />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            {validImage && (
              <img src={imageUrl.trim()} alt="" className="mt-4 w-full h-auto max-h-56 object-contain rounded-lg border border-[#ededed] bg-[#f2f2f2]" />
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setImageOpen(false)}>취소</Btn>
              <Btn disabled={!validImage}
                onClick={() => { insertImage(imageUrl, imageCap); setImageOpen(false); setImageUrl(""); setImageCap(""); }}>넣기</Btn>
            </div>
          </div>
        </div>
      )}

      {/* 결과 알림 — 닫으면(성공 시) 해당 게시판으로 이동한다 (handleModalClose). 바깥을 눌러 닫지 않는다 */}
      {popupConfig.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 overlay-in">
          <div role="alertdialog" aria-modal="true" className="bg-white border border-[#ededed] rounded-2xl w-full max-w-sm p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
            <p className={`text-[12px] font-black ${popupConfig.isError ? "text-[#d01634]" : "text-emerald-700"}`}>{popupConfig.isError ? "오류" : "알림"}</p>
            <p className="mt-2 text-[14px] leading-relaxed break-keep whitespace-pre-line">{popupConfig.message}</p>
            <div className="mt-6 flex justify-end"><Btn onClick={handleModalClose} autoFocus>확인</Btn></div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
