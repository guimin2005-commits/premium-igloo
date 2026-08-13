"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { BracketView } from "../components/BracketView";

const ADMIN_USERS = ["elahw.06"];

const CustomSelect = ({ value, options, onChange }: { value: string, options: {value: string, label: string}[], onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (selectRef.current && !selectRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="relative w-full" ref={selectRef}>
      <div onClick={() => setIsOpen(!isOpen)} className={`bg-[#1a1a1a] border ${isOpen ? 'border-[#e91e3f]' : 'border-white/5'} text-white text-sm rounded-xl px-5 py-3 cursor-pointer flex items-center justify-between gap-4 transition-colors`}>
        <span className="font-bold">{options.find(o => o.value === value)?.label}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-[#1e1e1e] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 animate-in fade-in zoom-in-95">
          {options.map((opt) => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); }} className="px-5 py-3 text-sm text-gray-300 font-bold hover:bg-[#e91e3f]/20 hover:text-white cursor-pointer transition-colors">{opt.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const CustomCheckbox = ({ checked, onChange, label }: { checked: boolean, onChange: (val: boolean) => void, label: string }) => (
  <div onClick={() => onChange(!checked)} className="flex items-center gap-3 cursor-pointer group w-fit">
    <div className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all ${checked ? 'bg-[#e91e3f] border-[#e91e3f]' : 'border-gray-600 group-hover:border-gray-400 bg-transparent'}`}>
      {checked && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </div>
    <span className={`text-sm font-bold select-none transition-colors ${checked ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>{label}</span>
  </div>
)

export default function AdminWritePage() {
  const { data: session, status } = useSession();
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
  const [eventTag, setEventTag] = useState("NONE");
  const [bannerUrl, setBannerUrl] = useState("");
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
  const [tournamentType, setTournamentType] = useState("모집");

  // 📌 참가 설문 (구글폼 형식)
  type SQ = { qid: string; type: string; label: string; desc: string; required: boolean; options: string[]; etc: boolean };
  const [survey, setSurvey] = useState<{ enabled: boolean; title: string; desc: string; closed: boolean; questions: SQ[] }>({
    enabled: false, title: "", desc: "", closed: false, questions: [],
  });
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
    category, title, content, publishAt, noticeTag, isPinned, bannerUrl,
    eventTag, eventStartDate, eventEndDate, isEventAlways,
    recruitSubCategory, recruitRole, recruitStartDate, recruitEndDate, isRecruitAlways, recruitQual, recruitTasks, recruitExtra,
    tournamentGame, tournamentPrize, tournamentStatus, tournamentLink, tournamentBracket: serializeBracket(bracketRounds), tournamentWinner, tournamentWinnerId, tournamentStartDate, tournamentEndDate,
    tournamentType, tournamentSchedule, survey,
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
      setCategory(d.category || "공지사항"); setTitle(d.title || ""); setContent(d.content || ""); setPublishAt(d.publishAt || "");
      setNoticeTag(d.noticeTag || "일반"); setIsPinned(!!d.isPinned); setBannerUrl(d.bannerUrl || "");
      setEventTag(d.eventTag || "NONE"); setEventStartDate(d.eventStartDate || ""); setEventEndDate(d.eventEndDate || ""); setIsEventAlways(!!d.isEventAlways);
      setRecruitSubCategory(d.recruitSubCategory || "staff"); setRecruitRole(d.recruitRole || ""); setRecruitStartDate(d.recruitStartDate || ""); setRecruitEndDate(d.recruitEndDate || "");
      setIsRecruitAlways(!!d.isRecruitAlways); setRecruitQual(d.recruitQual || ""); setRecruitTasks(d.recruitTasks || ""); setRecruitExtra(d.recruitExtra || "");
      setTournamentGame(d.tournamentGame || ""); setTournamentPrize(d.tournamentPrize || ""); setTournamentStatus(d.tournamentStatus || "예정됨"); setTournamentLink(d.tournamentLink || "");
      setTournamentBracket(d.tournamentBracket || ""); setBracketRounds(parseBracket(d.tournamentBracket || "")); setTournamentWinner(d.tournamentWinner || ""); setTournamentWinnerId(d.tournamentWinnerId || "");
      setTournamentStartDate(d.tournamentStartDate || ""); setTournamentEndDate(d.tournamentEndDate || "");
      setTournamentType(d.tournamentType || "모집"); setTournamentSchedule(Array.isArray(d.tournamentSchedule) ? d.tournamentSchedule : []);
      if (d.survey) setSurvey({ enabled: !!d.survey.enabled, title: d.survey.title || "", desc: d.survey.desc || "", closed: !!d.survey.closed, questions: Array.isArray(d.survey.questions) ? d.survey.questions : [] });
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


  const categories = ["공지사항", "이벤트", "구인", "대회"];

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
            setTournamentWinner(post.tournamentWinner || "");
            setTournamentWinnerId(post.tournamentWinnerId || "");
            setTournamentType(post.tournamentType || "모집");
            if (post.survey) setSurvey({ enabled: !!post.survey.enabled, title: post.survey.title || "", desc: post.survey.desc || "", closed: !!post.survey.closed, questions: Array.isArray(post.survey.questions) ? post.survey.questions.map((q: any) => ({ qid: q.qid || newQid(), type: q.type || "short", label: q.label || "", desc: q.desc || "", required: !!q.required, options: Array.isArray(q.options) ? q.options : [], etc: !!q.etc })) : [] });
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
      else router.push("/recruit");
      router.refresh();
    }
  };

  const isAdmin = session?.user?.name && ADMIN_USERS.includes(session.user.name);
  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated" || !session || !isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const isFormValid = () => {
    if (!title.trim()) return false;
    if (category === "구인") return recruitRole.trim() && recruitTasks.trim() && recruitQual.trim() && recruitStartDate;
    if (category === "이벤트") return eventStartDate && content.trim();
    if (category === "대회") return tournamentGame.trim() && tournamentPrize.trim() && tournamentStartDate;
    return content.trim();
  };

  const formatBulletPoints = (text = "") => text.split("\n").map(line => {
    const t = line.trim();
    return t === "" ? "" : (/^[ \-*]/.test(t) ? t : "• " + t);
  }).filter(line => line !== "").join("\n");

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
    let computedTournamentDate = "";
    if (category === "대회" && tournamentStartDate) {
      const formattedStart = tournamentStartDate.replace(/-/g, ".");
      computedTournamentDate = tournamentEndDate ? `${formattedStart} ~ ${tournamentEndDate.replace(/-/g, ".")}` : formattedStart;
    }
    const postData = {
      author: session.user?.name || "관리자", category, title,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      ...(category === "공지사항" && { content, noticeTag, isPinned, bannerUrl }),
      ...(category === "이벤트" && { content, eventTag, bannerUrl, eventPeriod: computedEventPeriod }),
      ...(category === "구인" && {
         recruitSubCategory, recruitRole, recruitPeriod: computedRecruitPeriod,
         recruitTasks: formatBulletPoints(recruitTasks), recruitQual: formatBulletPoints(recruitQual), recruitExtra: formatBulletPoints(recruitExtra)
       }),
      ...(category === "대회" && {
         content, bannerUrl, tournamentGame, tournamentPrize, tournamentStatus, tournamentLink,
         tournamentType,
         tournamentSchedule: tournamentSchedule.filter((p) => p.label.trim()),
         tournamentBracket: serializeBracket(bracketRounds), tournamentWinner, tournamentWinnerId,
         tournamentDate: computedTournamentDate,
         // 📌 참가 설문 — 빈 질문/선택지는 정리해서 저장
         survey: {
           ...survey,
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

  const textareaClass = "w-full bg-transparent border-0 px-0 py-2 text-[15px] text-gray-100 focus:outline-none resize-none leading-[1.9] placeholder:text-neutral-700 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col relative">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-8">
        
        <div className="pb-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">{editId ? "Edit" : "New"}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            {category}{category === "대회" ? " 등록" : " 작성"}
          </h1>
        </div>

        <section className="flex flex-col gap-2 border-b border-white/10 pb-5">
          {/* 보류된 글 이어서 작성 안내 */}
          {hasDraft && (
            <div className="mb-4 border-y border-[#e91e3f]/25 bg-[#e91e3f]/[0.05] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">보류된 글이 있습니다</p>
                <p className="text-xs text-gray-400 mt-0.5">이전에 작성하다 보류한 글을 이어서 작성할 수 있습니다.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={discardDraft} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-white/5 rounded-lg transition-colors">삭제</button>
                <button type="button" onClick={restoreDraft} className="px-4 py-2 text-xs font-black text-white bg-[#e91e3f] hover:bg-[#d01634] rounded-lg transition-colors">이어서 작성</button>
              </div>
            </div>
          )}

          <input type="text" placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required className="w-full bg-transparent text-3xl md:text-4xl font-black text-white placeholder:text-neutral-800 outline-none tracking-tight"/>

          {/* 📌 예약 발행 */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-gray-500">예약 발행 (선택)</span>
            <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#e91e3f] [color-scheme:dark]" />
            {publishAt && (
              <>
                <span className="text-[10px] font-bold text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/20 px-2.5 py-1 rounded-full">해당 시각부터 공개됩니다</span>
                <button type="button" onClick={() => setPublishAt("")} className="text-[10px] font-bold text-gray-500 hover:text-white underline underline-offset-2">해제</button>
              </>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <p className="text-[11px] font-bold text-gray-500 tracking-wide">설정</p>
          
          {category === "공지사항" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">카테고리 태그</span>
                <CustomSelect value={noticeTag} onChange={setNoticeTag} options={[{value:"일반", label:"[일반]"}, {value:"중요", label:"[중요]"}, {value:"업데이트", label:"[업데이트]"}]} />
              </div>
              <div className="flex flex-col justify-center gap-3 pt-6">
                <CustomCheckbox checked={isPinned} onChange={setIsPinned} label="상단에 중요 공지로 고정" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">상단 배너 URL (선택)</span>
                <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>
            </div>
          )}

          {category === "이벤트" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">강조 태그</span>
                <CustomSelect value={eventTag} onChange={setEventTag} options={[{value:"NONE", label:"선택 안함"}, {value:"HOT", label:"HOT"}, {value:"NEW", label:"NEW"}, {value:"종료", label:"종료됨"}]} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">배너 이미지 URL</span>
                <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">이벤트 기간 <span className="text-[#e91e3f]">*</span></span>
                <div className="flex flex-wrap items-center gap-3 w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-2.5 focus-within:border-[#e91e3f] transition-colors">
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} required className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                  </div>
                  {!isEventAlways && (
                    <>
                      <span className="text-gray-600 font-bold shrink-0">~</span>
                      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                        <input type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                      </div>
                    </>
                  )}
                  <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block shrink-0"></div>
                  <CustomCheckbox checked={isEventAlways} onChange={(v) => { setIsEventAlways(v); if(v) setEventEndDate(""); }} label="상시 진행" />
                </div>
              </div>
            </div>
          )}

          {category === "구인" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">모집 분류 (필터)</span>
                <CustomSelect value={recruitSubCategory} onChange={setRecruitSubCategory} options={[{value:"staff", label:"스태프 모집"}, {value:"sup", label:"서포터즈 모집"}]} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">모집 직책명 (태그) <span className="text-[#e91e3f]">*</span></span>
                <input type="text" placeholder="예: MANAGER, SUPPORTERS" value={recruitRole} onChange={(e) => setRecruitRole(e.target.value)} className="w-full bg-[#121212] border border-white/10 rounded-xl px-5 py-3 text-sm text-white font-bold tracking-wider focus:border-[#e91e3f] focus:outline-none" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">모집 기간 <span className="text-[#e91e3f]">*</span></span>
                <div className="flex flex-wrap items-center gap-3 w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-2.5 focus-within:border-[#e91e3f] transition-colors">
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    <input type="date" value={recruitStartDate} onChange={(e) => setRecruitStartDate(e.target.value)} required className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                  </div>
                  {!isRecruitAlways && (
                    <>
                      <span className="text-gray-600 font-bold shrink-0">~</span>
                      <div className="flex items-center bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                        <input type="date" value={recruitEndDate} onChange={(e) => setRecruitEndDate(e.target.value)} className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                      </div>
                    </>
                  )}
                  <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block shrink-0"></div>
                  <CustomCheckbox checked={isRecruitAlways} onChange={(v) => { setIsRecruitAlways(v); if(v) setRecruitEndDate(""); }} label="상시 모집" />
                </div>
              </div>
            </div>
          )}

          {category === "대회" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 📌 글 타입 선택 — 참가 신청 vs 대진표 */}
              <div className="md:col-span-2 flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">대회 글 타입 <span className="text-[#e91e3f]">*</span></span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { v: "모집", t: "참가 신청", d: "참가팀 모집·신청 접수" },
                    { v: "대진표", t: "대진표 / 리그", d: "본선 대진·경기 진행" },
                  ].map((opt) => (
                    <button key={opt.v} type="button" onClick={() => { setTournamentType(opt.v); if (opt.v === "모집" && tournamentStatus === "진행중") setTournamentStatus("모집중"); if (opt.v === "대진표" && tournamentStatus === "모집중") setTournamentStatus("진행중"); }}
                      className={`text-left rounded-xl border p-4 transition-all ${tournamentType === opt.v ? "border-[#e91e3f] bg-[#e91e3f]/[0.08]" : "border-white/10 bg-[#161616] hover:border-white/25"}`}>
                      <p className={`text-sm font-black mb-0.5 ${tournamentType === opt.v ? "text-[#e91e3f]" : "text-white"}`}>{opt.t}</p>
                      <p className="text-[11px] text-gray-500">{opt.d}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">종목 영문명 (부제) <span className="text-[#e91e3f]">*</span></span>
                <input type="text" placeholder="예: LEAGUE OF LEGENDS" value={tournamentGame} onChange={(e) => setTournamentGame(e.target.value)} className="w-full bg-[#121212] border border-white/10 rounded-xl px-5 py-3 text-sm text-white font-bold tracking-wider focus:border-[#e91e3f] focus:outline-none" />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">보상 및 상금 <span className="text-[#e91e3f]">*</span></span>
                <input type="text" placeholder="예: 총 상금 1,000,000원" value={tournamentPrize} onChange={(e) => setTournamentPrize(e.target.value)} className="w-full bg-[#121212] border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:border-[#e91e3f] focus:outline-none" />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">진행 상태</span>
                <CustomSelect value={tournamentStatus} onChange={setTournamentStatus} options={[{value:"예정됨", label:"예정됨"}, {value:"모집중", label:"모집중 (참가 신청 접수)"}, {value:"진행중", label:"진행중 (리그 진행)"}, {value:"종료됨", label:"종료됨"}]} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">참가 신청 링크 {tournamentType === "모집" ? <span className="text-[#e91e3f]">(권장)</span> : "(선택)"}</span>
                <input type="text" placeholder="https://..." value={tournamentLink} onChange={(e) => setTournamentLink(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>

              {/* 📌 리그 상세 일정 (양쪽 타입 공통) */}
              <div className="md:col-span-2 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-400">리그 상세 일정 (선택) <span className="text-gray-600 font-medium">— 팀원 배정, 스크림, 본선 등 단계별 기간</span></span>
                  <div className="flex flex-wrap gap-1.5">
                    {PHASE_PRESETS.map((p) => (
                      <button key={p} type="button" onClick={() => addPhase(p)} className="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-full hover:text-white hover:border-[#e91e3f]/40 transition-all">+ {p}</button>
                    ))}
                    <button type="button" onClick={() => addPhase()} className="text-[10px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-2.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">+ 직접 입력</button>
                  </div>
                </div>
                {tournamentSchedule.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#161616] py-6 text-center">
                    <p className="text-xs text-gray-500">위 버튼으로 대회 단계별 일정을 추가하세요. (예: 팀원 배정 → 스크림 → 본선 → 결승)</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tournamentSchedule.map((ph, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 bg-[#161616] border border-white/10 rounded-xl p-3">
                        <span className="text-[9px] font-black text-gray-600 w-5 text-center shrink-0">{i + 1}</span>
                        <input type="text" placeholder="단계명 (예: 본선 경기)" value={ph.label} onChange={(e) => updatePhase(i, { label: e.target.value })} className="flex-1 min-w-[120px] bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#e91e3f]" />
                        <input type="date" value={ph.start} onChange={(e) => updatePhase(i, { start: e.target.value })} className="bg-[#0f0f0f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#e91e3f] [color-scheme:dark]" />
                        <span className="text-[10px] text-gray-600 font-bold shrink-0">~</span>
                        <input type="date" value={ph.end} onChange={(e) => updatePhase(i, { end: e.target.value })} className="bg-[#0f0f0f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#e91e3f] [color-scheme:dark]" />
                        <button type="button" onClick={() => setTournamentSchedule(tournamentSchedule.filter((_, j) => j !== i))} className="shrink-0 text-gray-700 hover:text-red-400 text-sm font-black px-1 transition-colors">×</button>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-600">종료일을 비우면 단일 날짜로 표시됩니다.</p>
                  </div>
                )}
              </div>

              {/* 📌 대진표 — '대진표' 타입일 때만 표시 */}
              {tournamentType === "대진표" && (
              <div className="md:col-span-2 flex flex-col gap-3">
                <div className="mt-1 space-y-4">
                  {/* 자동 생성기 */}
                  <div className="rounded-xl border border-white/10 bg-[#161616] p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-bold text-gray-400">대진표 <span className="text-gray-600 font-medium">(선택 · 패자부활전 지원)</span></span>
                      {bracketRounds.length > 0 && (
                        <button type="button" onClick={() => setBracketRounds([])} className="text-[10px] font-bold text-gray-600 hover:text-red-400 px-2 py-1 transition-colors">전체 초기화</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-lg border border-white/8 bg-[#0f0f0f] p-3">
                        <p className="text-[10px] font-black text-gray-300 mb-2">단일 토너먼트</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[4, 8, 16].map((n) => (
                            <button key={n} type="button" onClick={() => quickBracket(n)} className="text-[10px] font-black text-gray-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:text-white hover:border-white/30 transition-all">{n}팀</button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#e91e3f]/20 bg-[#e91e3f]/[0.04] p-3">
                        <p className="text-[10px] font-black text-[#e91e3f] mb-2">패자부활전 (더블 엘리미네이션)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[4, 8, 16].map((n) => (
                            <button key={n} type="button" onClick={() => doubleBracket(n)} className="text-[10px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-all">{n}팀</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className="text-[10px] font-bold text-gray-600 mr-1">직접 추가</span>
                      {GROUP_ORDER.map((g) => (
                        <button key={g} type="button" onClick={() => setBracketRounds([...bracketRounds, { name: "", bracket: g, matches: [{ a: "", b: "", winner: "" }] }])} className="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:text-white transition-colors">+ {GROUP_LABEL[g]}</button>
                      ))}
                    </div>
                  </div>

                  {/* 라운드 편집 */}
                  {bracketRounds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[#161616] py-8 text-center">
                      <p className="text-xs text-gray-500">위 버튼으로 토너먼트 골격을 자동 생성하거나 라운드를 직접 추가하세요.</p>
                      <p className="text-[10px] text-gray-600 mt-1">팀 이름은 나중에 채워도 되고, 승자는 경기 후 수정으로 지정하면 됩니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bracketRounds.map((round, ri) => {
                        const gBorder = round.bracket === "L" ? "border-l-orange-400/60" : round.bracket === "F" ? "border-l-[#e91e3f]/60" : "border-l-emerald-400/60";
                        return (
                        <div key={ri} className={`rounded-xl border border-white/10 border-l-4 ${gBorder} bg-[#161616] p-4`}>
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className="flex gap-1 shrink-0">
                              {GROUP_ORDER.map((g) => {
                                const active = round.bracket === g;
                                const activeCls = g === "L" ? "bg-orange-500/15 border-orange-500/40 text-orange-300" : g === "F" ? "bg-[#e91e3f]/15 border-[#e91e3f]/40 text-[#e91e3f]" : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
                                return <button key={g} type="button" onClick={() => updateRound(ri, { bracket: g })} className={`px-2 py-1 text-[9px] font-black rounded-md border transition-all ${active ? activeCls : "border-white/10 text-gray-600 hover:text-gray-300"}`}>{GROUP_LABEL[g]}</button>;
                              })}
                            </div>
                            <input type="text" placeholder="라운드명 (예: 8강)" value={round.name} onChange={(e) => updateRound(ri, { name: e.target.value })} className="w-28 bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-[#e91e3f]" />
                            <button type="button" onClick={() => updateRound(ri, { matches: [...round.matches, { a: "", b: "", winner: "" }] })} className="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:text-white transition-colors">매치 추가</button>
                            <button type="button" onClick={() => setBracketRounds(bracketRounds.filter((_, i) => i !== ri))} className="ml-auto text-[10px] font-bold text-gray-600 hover:text-red-400 transition-colors">라운드 삭제</button>
                          </div>
                          <div className="space-y-2">
                            {round.matches.map((m, mi) => (
                              <div key={mi} className="flex flex-wrap items-center gap-2">
                                <span className="text-[9px] font-black text-gray-700 w-5 text-center shrink-0">{mi + 1}</span>
                                <input type="text" placeholder="팀 A" value={m.a} onChange={(e) => updateMatch(ri, mi, { a: e.target.value, winner: m.winner === m.a ? e.target.value : m.winner })} className={`flex-1 min-w-[100px] bg-[#0f0f0f] border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#e91e3f] ${m.winner && m.winner === m.a ? "border-emerald-500/50" : "border-white/10"}`} />
                                <span className="text-[9px] font-black text-gray-600 shrink-0">VS</span>
                                <input type="text" placeholder="팀 B" value={m.b} onChange={(e) => updateMatch(ri, mi, { b: e.target.value, winner: m.winner === m.b ? e.target.value : m.winner })} className={`flex-1 min-w-[100px] bg-[#0f0f0f] border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#e91e3f] ${m.winner && m.winner === m.b ? "border-emerald-500/50" : "border-white/10"}`} />
                                <div className="flex gap-1 shrink-0">
                                  <button type="button" disabled={!m.a.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.a ? "" : m.a })} className={`px-2.5 py-2 text-[10px] font-black rounded-lg border transition-all ${m.winner && m.winner === m.a ? "bg-emerald-500/90 border-emerald-500 text-white" : "border-white/10 text-gray-500 hover:border-emerald-500/50 disabled:opacity-30"}`}>A승</button>
                                  <button type="button" disabled={!m.b.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.b ? "" : m.b })} className={`px-2.5 py-2 text-[10px] font-black rounded-lg border transition-all ${m.winner && m.winner === m.b ? "bg-emerald-500/90 border-emerald-500 text-white" : "border-white/10 text-gray-500 hover:border-emerald-500/50 disabled:opacity-30"}`}>B승</button>
                                </div>
                                <button type="button" onClick={() => updateRound(ri, { matches: round.matches.filter((_, j) => j !== mi) })} className="shrink-0 text-gray-700 hover:text-red-400 text-sm font-black px-1 transition-colors">×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                      <p className="text-[10px] text-gray-600">각 라운드 좌측에서 승자조/패자조/결승 그룹 지정 · 승자 버튼(A승/B승)으로 승리 팀 하이라이트.</p>
                    </div>
                  )}

                  {/* 실시간 미리보기 */}
                  {serializeBracket(bracketRounds).trim() && (
                    <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-4">
                      <p className="text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase mb-3">미리보기 · 대회 페이지 표시 형태</p>
                      <BracketView text={serializeBracket(bracketRounds)} showHeader={false} />
                    </div>
                  )}
                </div>

                <span className="text-xs font-bold text-gray-400 mt-4 block">우승팀 / 우승자 (선택 · 명예의 전당 표시)</span>
                <input type="text" placeholder="예시: 이글루A" value={tournamentWinner} onChange={(e) => setTournamentWinner(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />

                <span className="text-xs font-bold text-gray-400 mt-4 block">우승자 디스코드 ID <span className="text-gray-600 font-medium">(선택 · 팀원 여러 명이면 쉼표(,)로 구분 — 명예의 전당에 각자 프로필로 표시)</span></span>
                <textarea rows={2} placeholder="예시: 1104242935664492666, 2205..., 3306... (팀원 전원 입력 가능)" value={tournamentWinnerId} onChange={(e) => setTournamentWinnerId(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f] resize-none leading-relaxed" />
              </div>
              )}

              {/* 📌 참가 설문 (구글폼 형식) */}
              <div className="md:col-span-2">
                <div className="border-y border-white/10">
                  <div className="flex flex-wrap items-center gap-3 py-3.5 border-b border-white/[0.06]">
                    <span className="w-1 h-4 bg-[#e91e3f] rounded-full"></span>
                    <span className="text-sm font-black text-white">참가 설문</span>
                    {survey.enabled && survey.questions.length > 0 && (
                      <span className="text-[10px] font-bold text-gray-500">
                        문항 {survey.questions.length}개 · 필수 {survey.questions.filter((q) => q.required).length}개
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {survey.enabled && (
                        <>
                          <button type="button" onClick={() => setSurveyPreview(true)} disabled={!survey.questions.length} className="text-[11px] font-black px-3 py-1.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-40 transition-all">미리보기</button>
                          <button type="button" onClick={() => setSurvey({ ...survey, closed: !survey.closed })} className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-all ${survey.closed ? "bg-white/10 text-gray-300 border-white/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>
                            {survey.closed ? "접수 마감됨" : "접수 중"}
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => setSurvey({ ...survey, enabled: !survey.enabled })} className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-all ${survey.enabled ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-white/15 text-gray-400 hover:text-white"}`}>
                        {survey.enabled ? "설문 사용 중" : "설문 사용 안 함"}
                      </button>
                    </div>
                  </div>

                  {survey.enabled && (
                    <div className="p-5 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="text" placeholder="설문 제목 (예: 제1회 대회 참가 신청서)" value={survey.title} onChange={(e) => setSurvey({ ...survey, title: e.target.value })} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
                        <input type="text" placeholder="설명 (선택)" value={survey.desc} onChange={(e) => setSurvey({ ...survey, desc: e.target.value })} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
                      </div>

                      {/* 템플릿 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black tracking-widest text-gray-600 uppercase mr-1">템플릿</span>
                        {SURVEY_TEMPLATES.map((t) => (
                          <button key={t.name} type="button" onClick={() => applyTemplate(t)} title={t.desc} className="text-[11px] font-bold text-gray-300 border border-white/10 px-3 py-1.5 rounded-full hover:border-[#e91e3f]/50 hover:text-white transition-all">
                            {t.name}
                          </button>
                        ))}
                        {survey.questions.length > 0 && (
                          <>
                            <span className="w-px h-4 bg-white/10 mx-1" />
                            <button type="button" onClick={() => setSurvey({ ...survey, questions: survey.questions.map((q) => ({ ...q, required: !survey.questions.every((x) => x.required) })) })} className="text-[11px] font-bold text-gray-400 hover:text-white transition-colors">
                              {survey.questions.every((q) => q.required) ? "필수 전체 해제" : "전체 필수로"}
                            </button>
                            <button type="button" onClick={() => { if (confirm("작성한 문항을 모두 삭제할까요?")) setSurvey({ ...survey, questions: [] }); }} className="text-[11px] font-bold text-gray-600 hover:text-red-400 transition-colors">전체 삭제</button>
                          </>
                        )}
                      </div>

                      {/* 질문 목록 */}
                      {survey.questions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
                          <p className="text-xs text-gray-500">위 템플릿을 고르거나, 아래에서 문항을 추가하세요.</p>
                        </div>
                      ) : (
                        <div className="border-t border-white/[0.08]">
                          {survey.questions.map((q, qi) => {
                            const isOpen = !collapsed[q.qid];
                            const dupOpts = q.options.filter((o, i) => o.trim() && q.options.findIndex((x) => x.trim() === o.trim()) !== i);
                            return (
                            <div
                              key={q.qid}
                              onDragOver={(e) => { if (dragQ !== null) { e.preventDefault(); setOverQ(qi); } }}
                              onDrop={(e) => { if (dragQ !== null) { e.preventDefault(); dropQuestion(qi); setDragQ(null); setOverQ(null); } }}
                              className={`border-b border-white/[0.08] transition-colors ${dragQ === qi ? "opacity-40" : ""} ${overQ === qi && dragQ !== null && dragQ !== qi ? "bg-[#e91e3f]/[0.06] shadow-[inset_0_2px_0_0_#e91e3f]" : ""}`}
                            >
                              <div className="flex flex-wrap items-center gap-2 py-3">
                                {/* 드래그 핸들 */}
                                <span
                                  draggable
                                  onDragStart={() => setDragQ(qi)}
                                  onDragEnd={() => { setDragQ(null); setOverQ(null); }}
                                  title="끌어서 순서 변경"
                                  className="shrink-0 cursor-grab active:cursor-grabbing px-1.5 py-2 text-gray-700 hover:text-gray-300 select-none leading-none"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>
                                </span>
                                <span className="text-[10px] font-black text-gray-600 w-5 tabular-nums shrink-0">{String(qi + 1).padStart(2, "0")}</span>
                                <input
                                  type="text"
                                  placeholder={q.type === "note" ? "설명 제목 (비워둘 수 있음)" : "질문을 입력하세요"}
                                  value={q.label}
                                  onChange={(e) => updateQuestion(qi, { label: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestion(q.type); } }}
                                  className="flex-1 min-w-[160px] bg-transparent border-b border-white/10 px-1 py-2 text-sm font-bold text-white outline-none focus:border-[#e91e3f] transition-colors"
                                />
                                <select value={q.type} onChange={(e) => { const t = e.target.value; updateQuestion(qi, { type: t, options: isChoiceType(t) && q.options.length === 0 ? ["선택지 1"] : q.options, required: t === "note" ? false : q.required }); }} className="bg-[#161616] border border-white/10 rounded-lg px-2.5 py-2 text-xs font-bold text-white outline-none focus:border-[#e91e3f] [color-scheme:dark] shrink-0">
                                  {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                                </select>
                                {q.type !== "note" && (
                                  <button type="button" onClick={() => updateQuestion(qi, { required: !q.required })} title="필수 응답 여부" className={`text-[10px] font-black px-2.5 py-2 rounded-lg border transition-all shrink-0 ${q.required ? "bg-[#e91e3f]/15 border-[#e91e3f]/40 text-[#e91e3f]" : "border-white/10 text-gray-500 hover:text-gray-300"}`}>필수</button>
                                )}
                                <div className="flex gap-0.5 shrink-0">
                                  <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0} title="위로" className="px-2 py-2 text-[10px] font-black text-gray-500 hover:text-white disabled:opacity-25 rounded-lg hover:bg-white/5">▲</button>
                                  <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === survey.questions.length - 1} title="아래로" className="px-2 py-2 text-[10px] font-black text-gray-500 hover:text-white disabled:opacity-25 rounded-lg hover:bg-white/5">▼</button>
                                  <button type="button" onClick={() => dupQuestion(qi)} title="문항 복사" className="px-2 py-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [q.qid]: !c[q.qid] }))} title={isOpen ? "접기" : "펼치기"} className="px-2 py-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/5">
                                    <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                                  </button>
                                  <button type="button" onClick={() => removeQuestion(qi)} title="문항 삭제" className="px-2 py-2 text-gray-600 hover:text-red-400 rounded-lg hover:bg-white/5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              </div>

                              {/* 📌 부가 설명 — 모든 문항 공통 (note 타입은 이게 본문) */}
                              {isOpen && (
                                <div className="pl-9 pb-3">
                                  <textarea
                                    rows={q.type === "note" ? 3 : 1}
                                    placeholder={q.type === "note" ? "참가자에게 보여줄 안내 문구를 입력하세요 (줄바꿈 가능)" : "부가 설명 (선택) — 질문 아래 회색으로 표시됩니다"}
                                    value={q.desc}
                                    onChange={(e) => updateQuestion(qi, { desc: e.target.value })}
                                    className={`w-full bg-transparent border-b px-1 py-1.5 text-xs outline-none resize-none leading-relaxed transition-colors ${q.type === "note" ? "border-white/15 text-gray-200 focus:border-[#e91e3f]" : "border-white/[0.07] text-gray-400 focus:border-[#e91e3f]"}`}
                                  />
                                </div>
                              )}

                              {isOpen && (isChoiceType(q.type) ? (
                                <div className="pl-9 pb-4 space-y-1">
                                  {q.options.map((opt, oi) => (
                                    <div
                                      key={oi}
                                      onDragOver={(e) => { if (dragOpt?.qi === qi) e.preventDefault(); }}
                                      onDrop={(e) => { if (dragOpt?.qi === qi) { e.preventDefault(); dropOption(qi, oi); setDragOpt(null); } }}
                                      className={`flex items-center gap-2 group/opt rounded ${dragOpt && dragOpt.qi === qi && dragOpt.oi === oi ? "opacity-40" : ""}`}
                                    >
                                      <span
                                        draggable
                                        onDragStart={() => setDragOpt({ qi, oi })}
                                        onDragEnd={() => setDragOpt(null)}
                                        title="끌어서 순서 변경"
                                        className="shrink-0 cursor-grab active:cursor-grabbing text-gray-800 group-hover/opt:text-gray-500 leading-none"
                                      >
                                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/></svg>
                                      </span>
                                      <span className={`w-3 h-3 shrink-0 border border-white/25 ${q.type === "single" ? "rounded-full" : "rounded-[3px]"}`}></span>
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
                                        className="flex-1 bg-transparent border-b border-white/10 px-1 py-1.5 text-xs text-white outline-none focus:border-[#e91e3f] transition-colors"
                                      />
                                      <button type="button" onClick={() => { const opts = [...q.options]; opts.splice(oi + 1, 0, opt); updateQuestion(qi, { options: opts }); }} title="선택지 복사" className="opacity-0 group-hover/opt:opacity-100 text-gray-600 hover:text-white text-[11px] px-1 transition-opacity">복사</button>
                                      {q.options.length > 1 && (
                                        <button type="button" onClick={() => updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })} title="선택지 삭제" className="text-gray-700 hover:text-red-400 text-xs px-1">×</button>
                                      )}
                                    </div>
                                  ))}
                                  <div className="flex flex-wrap items-center gap-3 pt-2">
                                    <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options, ""] })} className="text-[11px] font-bold text-[#e91e3f] hover:underline">+ 선택지 추가</button>
                                    <button type="button" onClick={() => updateQuestion(qi, { etc: !q.etc })} className={`text-[11px] font-bold ${q.etc ? "text-[#e91e3f]" : "text-gray-600 hover:text-gray-400"}`}>기타(직접 입력) {q.etc ? "사용 중" : "추가"}</button>
                                    <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options].sort((a, b) => a.localeCompare(b, "ko")) })} className="text-[11px] font-bold text-gray-600 hover:text-gray-300">가나다 정렬</button>
                                    <span className="text-[10px] text-gray-700">Enter=추가 · 여러 줄 붙여넣기=일괄 등록</span>
                                  </div>
                                  {dupOpts.length > 0 && (
                                    <p className="text-[10px] font-bold text-amber-400/90 pt-1">중복된 선택지가 있습니다: {[...new Set(dupOpts)].join(", ")}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="pl-9 pb-4 text-[11px] text-gray-600">
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
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {Q_TYPES.map((t) => (
                            <button key={t.v} type="button" onClick={() => addQuestion(t.v)} className="text-[11px] font-black text-gray-300 bg-white/5 border border-white/10 px-3.5 py-2 rounded-full hover:border-[#e91e3f]/40 hover:text-white transition-all">+ {t.l}</button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black tracking-widest text-gray-600 uppercase mr-1">자주 쓰는 문항</span>
                          {QUICK_QS.map((x) => (
                            <button key={x.l} type="button" onClick={() => addQuickQuestion(x.q)} className="text-[11px] font-bold text-gray-500 border-b border-white/10 px-1.5 py-1 hover:text-white hover:border-[#e91e3f] transition-all">{x.l}</button>
                          ))}
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-600">설문을 사용하면 대회 상세에서 참가자가 바로 신청할 수 있고, 응답과 통계는 관리자만 확인할 수 있습니다.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 📌 설문 미리보기 — 참가자에게 보이는 그대로 */}
              {surveyPreview && (
                <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4" onClick={() => setSurveyPreview(false)}>
                  <div onClick={(e) => e.stopPropagation()} className="bg-[#101010] border border-white/10 w-full max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
                    <div className="shrink-0 px-5 sm:px-8 pt-6 pb-5 border-b border-white/10 bg-gradient-to-b from-emerald-500/[0.07] to-transparent">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black tracking-[0.25em] text-emerald-400 mb-1.5">PREVIEW</p>
                          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight break-keep">{survey.title || `${title || "대회"} 참가 신청서`}</h2>
                          {survey.desc && <p className="text-xs sm:text-sm text-gray-400 mt-2 leading-relaxed whitespace-pre-wrap">{survey.desc}</p>}
                        </div>
                        <button type="button" onClick={() => setSurveyPreview(false)} className="shrink-0 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8">
                      {(() => { let n = 0; return survey.questions.map((q) => {
                        if (q.type !== "note") n += 1;
                        const no = n;
                        return (
                        <div key={q.qid} className="py-6 border-b border-white/[0.07] last:border-b-0">
                          {q.type === "note" ? (
                            <div className="border-l-2 border-emerald-500/50 pl-4">
                              {q.label && <p className="text-sm sm:text-base font-black text-white mb-1.5 break-keep">{q.label}</p>}
                              <p className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap break-keep">{q.desc || <span className="text-gray-600">(설명 미입력)</span>}</p>
                            </div>
                          ) : (<>
                          <div className="flex items-start gap-3 mb-4">
                            <span className="shrink-0 mt-0.5 text-[11px] font-black text-gray-700 tabular-nums">{String(no).padStart(2, "0")}</span>
                            <div className="min-w-0">
                              <p className="text-sm sm:text-base font-bold text-white leading-snug break-keep">
                                {q.label || <span className="text-gray-600">(질문 미입력)</span>}
                                {q.required && <span className="text-red-400 ml-1">*</span>}
                              </p>
                              {q.desc && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed whitespace-pre-wrap break-keep">{q.desc}</p>}
                            </div>
                          </div>
                          <div className="sm:pl-7">
                            {q.type === "short" && <div className="border-b border-white/12 py-2.5 text-sm text-gray-600">답변을 입력해주세요</div>}
                            {q.type === "long" && <div className="border-b border-white/12 py-2.5 pb-12 text-sm text-gray-600">답변을 입력해주세요</div>}
                            {isChoiceType(q.type) && (
                              <div className="border-t border-white/[0.07]">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-3 px-1 py-3 border-b border-white/[0.07]">
                                    <span className={`w-4 h-4 border-2 border-gray-600 shrink-0 ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
                                    <span className="text-sm text-gray-300">{opt || `선택지 ${oi + 1}`}</span>
                                  </div>
                                ))}
                                {q.etc && (
                                  <div className="flex items-center gap-3 px-1 py-3 border-b border-white/[0.07]">
                                    <span className={`w-4 h-4 border-2 border-gray-600 shrink-0 ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
                                    <span className="text-sm text-gray-300">기타 (직접 입력)</span>
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
                    <div className="shrink-0 px-5 sm:px-8 py-4 border-t border-white/10 bg-[#0d0d0d]">
                      <button type="button" onClick={() => setSurveyPreview(false)} className="w-full py-3.5 rounded-xl font-black text-sm bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">미리보기 닫기</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">배너 이미지 URL (선택)</span>
                <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">전체 대회 기간 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">— 카드에 표시되는 대표 기간</span></span>
                <div className="flex flex-wrap items-center gap-3 w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-2.5 focus-within:border-[#e91e3f] transition-colors">
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    <input type="date" value={tournamentStartDate} onChange={(e) => setTournamentStartDate(e.target.value)} required className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                  </div>
                  <span className="text-gray-600 font-bold shrink-0">~</span>
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5 flex-1 min-w-[140px]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    <input type="date" value={tournamentEndDate} onChange={(e) => setTournamentEndDate(e.target.value)} className="bg-transparent text-sm text-white font-medium focus:outline-none cursor-pointer [color-scheme:dark] w-full" />
                  </div>
                  <span className="text-[10px] text-gray-600 w-full sm:w-auto">단일 일정은 종료일 비워두세요</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <p className="text-[11px] font-bold text-gray-500 tracking-wide">본문</p>

          {(category === "공지사항" || category === "이벤트" || category === "대회") && (
            <>
              <div className="flex flex-wrap gap-1 bg-[#1a1a1a] border border-white/5 p-1.5 rounded-xl">
                <button type="button" onClick={() => insertWrap("**")} className="p-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1"><span className="font-extrabold text-base">B</span> 굵게</button>
                <div className="w-px h-6 bg-white/10 self-center" />
                <button type="button" onClick={() => insertWrap("__")} className="p-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1"><span className="underline text-base font-medium">U</span> 밑줄</button>
                <div className="w-px h-6 bg-white/10 self-center" />
                <button type="button" onClick={() => insertWrap("~~")} className="p-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1"><span className="line-through text-base font-medium">S</span> 취소선</button>
                <div className="w-px h-6 bg-white/10 self-center" />
                <button type="button" onClick={() => insertWrap("==")} className="p-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1"><span className="text-base font-extrabold text-[#e91e3f]">A</span> 강조</button>
                <div className="w-px h-6 bg-white/10 self-center" />
                <button type="button" onClick={() => insertTable(2, 2)} className="p-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1"><span className="text-base font-bold">⊞</span> 표</button>
              </div>
              <textarea ref={textareaRef} placeholder="내용을 입력하세요..." value={content} onChange={(e) => setContent(e.target.value)} className={`min-h-[400px] ${textareaClass}`} />
            </>
          )}

          {category === "구인" && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2"><span className="text-xs font-bold text-gray-400">지원 자격 <span className="text-[#e91e3f]">*</span></span><textarea rows={4} placeholder="지원에 필요한 자격 요건을 입력하세요." value={recruitQual} onChange={(e) => setRecruitQual(e.target.value)} className={textareaClass} /></div>
              <div className="flex flex-col gap-2"><span className="text-xs font-bold text-gray-400">주요 업무 <span className="text-[#e91e3f]">*</span></span><textarea rows={4} placeholder="담당하게 될 주요 업무를 입력하세요." value={recruitTasks} onChange={(e) => setRecruitTasks(e.target.value)} className={textareaClass} /></div>
              <div className="flex flex-col gap-2"><span className="text-xs font-bold text-gray-400">우대 사항 및 추가 안내 (선택)</span><textarea rows={3} placeholder="우대 사항 또는 혜택 등을 자유롭게 입력하세요." value={recruitExtra} onChange={(e) => setRecruitExtra(e.target.value)} className={textareaClass} /></div>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between pt-6 border-t border-white/5">
          <button type="button" onClick={() => router.back()} className="text-sm font-bold text-gray-600 hover:text-white transition-colors">취소</button>
          {!editId && (
            <button type="button" onClick={saveDraft} className="px-6 py-3.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/25 transition-all">보류</button>
          )}
          <button type="submit" disabled={isSubmitting || !isFormValid()} className={`px-8 py-3.5 rounded-xl text-sm font-bold transition-all ${isSubmitting || !isFormValid() ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200"}`}>{isSubmitting ? "처리 중..." : editId ? "수정하기" : "등록하기"}</button>
        </div>
      </form>

      {popupConfig.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popupConfig.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">알림</h2>
            <p className="text-sm text-gray-400 mb-8">{popupConfig.message}</p>
            <button onClick={handleModalClose} className="w-full py-3 bg-[#2a2a2a] text-white font-bold rounded-xl">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}