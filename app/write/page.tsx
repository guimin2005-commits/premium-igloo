"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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

  // 📌 대진표 비주얼 빌더 — 텍스트 형식 대신 라운드/매치 단위로 편집
  type BracketMatch = { a: string; b: string; winner: string };
  type BracketRound = { name: string; matches: BracketMatch[] };
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>([]);

  // 기존 텍스트 형식 ↔ 빌더 상호 변환 (표시 컴포넌트 호환 유지)
  const parseBracket = (text: string): BracketRound[] => {
    const rounds: BracketRound[] = [];
    let current: BracketRound | null = null;
    (text || "").split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (line.endsWith(":")) { current = { name: line.slice(0, -1).trim(), matches: [] }; rounds.push(current); return; }
      const [matchPart, winnerPart] = line.split(">");
      const teams = matchPart.split(/vs/i);
      if (teams.length !== 2) return;
      if (!current) { current = { name: "대진", matches: [] }; rounds.push(current); }
      current.matches.push({ a: teams[0].trim(), b: teams[1].trim(), winner: (winnerPart || "").trim() });
    });
    return rounds;
  };
  const serializeBracket = (rounds: BracketRound[]): string =>
    rounds
      .filter((r) => r.matches.some((m) => m.a.trim() || m.b.trim()))
      .map((r) => `${r.name || "라운드"}:\n` + r.matches.filter((m) => m.a.trim() || m.b.trim()).map((m) => `${m.a.trim()} vs ${m.b.trim()}${m.winner ? ` > ${m.winner}` : ""}`).join("\n"))
      .join("\n");

  const updateRound = (ri: number, patch: Partial<BracketRound>) =>
    setBracketRounds((prev) => prev.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  const updateMatch = (ri: number, mi: number, patch: Partial<BracketMatch>) =>
    setBracketRounds((prev) => prev.map((r, i) => (i === ri ? { ...r, matches: r.matches.map((m, j) => (j === mi ? { ...m, ...patch } : m)) } : r)));

  // 빠른 생성: 팀 수에 맞는 토너먼트 골격 자동 구성
  const quickBracket = (teams: number) => {
    const names: Record<number, string[]> = { 4: ["4강", "결승"], 8: ["8강", "4강", "결승"], 16: ["16강", "8강", "4강", "결승"] };
    const rounds: BracketRound[] = [];
    let matches = teams / 2;
    (names[teams] || []).forEach((name) => {
      rounds.push({ name, matches: Array.from({ length: matches }, () => ({ a: "", b: "", winner: "" })) });
      matches = Math.max(1, matches / 2);
    });
    setBracketRounds(rounds);
  };
  const [tournamentWinner, setTournamentWinner] = useState("");
  const [tournamentWinnerId, setTournamentWinnerId] = useState("");
  const [tournamentStartDate, setTournamentStartDate] = useState("");
  const [tournamentEndDate, setTournamentEndDate] = useState("");

  // 📌 보류(임시저장) — 작성 중인 글을 저장해두고 나중에 이어서 작성
  const [hasDraft, setHasDraft] = useState(false);
  const DRAFT_KEY = "writeDraft";

  const collectDraft = () => ({
    category, title, content, publishAt, noticeTag, isPinned, bannerUrl,
    eventTag, eventStartDate, eventEndDate, isEventAlways,
    recruitSubCategory, recruitRole, recruitStartDate, recruitEndDate, isRecruitAlways, recruitQual, recruitTasks, recruitExtra,
    tournamentGame, tournamentPrize, tournamentStatus, tournamentLink, tournamentBracket: serializeBracket(bracketRounds), tournamentWinner, tournamentWinnerId, tournamentStartDate, tournamentEndDate,
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
  }, []);

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
         tournamentBracket: serializeBracket(bracketRounds), tournamentWinner, tournamentWinnerId,
         tournamentDate: computedTournamentDate
       })
    };
    try {
      const res = await fetch(editId ? `/api/posts/${editId}` : "/api/posts", { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postData) });
      if (res.ok) setPopupConfig({ isOpen: true, message: editId ? "수정되었습니다." : "등록되었습니다.", isError: false });
      else setPopupConfig({ isOpen: true, message: "등록 실패", isError: true });
    } catch { setPopupConfig({ isOpen: true, message: "서버 통신 오류", isError: true }); }
    finally { setIsSubmitting(false); }
  };

  const textareaClass = "w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-4 text-sm text-white focus:border-[#e91e3f] focus:outline-none resize-none leading-relaxed [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col relative">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-8">
        
        <div className="flex gap-8 border-b border-white/10">
          {categories.map((cat) => (
            <button key={cat} type="button" disabled={!!editId} onClick={() => setCategory(cat)} className={`pb-4 text-sm font-bold transition-all border-b-2 outline-none ${category === cat ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300 disabled:opacity-30"}`}>{cat}</button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-b border-white/10 pb-4 focus-within:border-[#e91e3f] transition-colors">
          <span className="text-xs font-bold text-[#e91e3f] tracking-wider uppercase">{category} TITLE</span>
          {/* 보류된 글 이어서 작성 배너 */}
          {hasDraft && (
            <div className="mb-6 rounded-2xl border border-[#e91e3f]/25 bg-[#e91e3f]/[0.05] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
        </div>

        <div className="bg-[#121212] border border-white/5 rounded-2xl p-6 flex flex-col gap-6">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-white/5 pb-4">기본 설정</h3>
          
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
                <span className="text-xs font-bold text-gray-400">참가 신청 링크 (선택)</span>
                <input type="text" placeholder="https://..." value={tournamentLink} onChange={(e) => setTournamentLink(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />

                {/* 📌 대진표 비주얼 빌더 */}
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold text-gray-400">대진표 (선택)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[4, 8, 16].map((n) => (
                        <button key={n} type="button" onClick={() => quickBracket(n)} className="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:text-white hover:border-[#e91e3f]/40 transition-all">{n}팀 자동 생성</button>
                      ))}
                      <button type="button" onClick={() => setBracketRounds([...bracketRounds, { name: bracketRounds.length === 0 ? "8강" : "", matches: [{ a: "", b: "", winner: "" }] }])} className="text-[10px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">라운드 추가</button>
                      {bracketRounds.length > 0 && (
                        <button type="button" onClick={() => setBracketRounds([])} className="text-[10px] font-bold text-gray-600 hover:text-red-400 px-2 py-1.5 transition-colors">초기화</button>
                      )}
                    </div>
                  </div>

                  {bracketRounds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[#161616] py-8 text-center">
                      <p className="text-xs text-gray-500">위 버튼으로 토너먼트 골격을 자동 생성하거나, 라운드를 직접 추가하세요.</p>
                      <p className="text-[10px] text-gray-600 mt-1">팀 이름은 나중에 채워도 되고, 승자는 경기 후 수정으로 지정하면 됩니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bracketRounds.map((round, ri) => (
                        <div key={ri} className="rounded-xl border border-white/10 bg-[#161616] p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <input type="text" placeholder="라운드명 (예: 8강)" value={round.name} onChange={(e) => updateRound(ri, { name: e.target.value })} className="w-32 bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-[#e91e3f]" />
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
                                {/* 승자 지정 — 클릭 한 번 */}
                                <div className="flex gap-1 shrink-0">
                                  <button type="button" disabled={!m.a.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.a ? "" : m.a })} className={`px-2.5 py-2 text-[10px] font-black rounded-lg border transition-all ${m.winner && m.winner === m.a ? "bg-emerald-500/90 border-emerald-500 text-white" : "border-white/10 text-gray-500 hover:border-emerald-500/50 disabled:opacity-30"}`}>A승</button>
                                  <button type="button" disabled={!m.b.trim()} onClick={() => updateMatch(ri, mi, { winner: m.winner === m.b ? "" : m.b })} className={`px-2.5 py-2 text-[10px] font-black rounded-lg border transition-all ${m.winner && m.winner === m.b ? "bg-emerald-500/90 border-emerald-500 text-white" : "border-white/10 text-gray-500 hover:border-emerald-500/50 disabled:opacity-30"}`}>B승</button>
                                </div>
                                <button type="button" onClick={() => updateRound(ri, { matches: round.matches.filter((_, j) => j !== mi) })} className="shrink-0 text-gray-700 hover:text-red-400 text-sm font-black px-1 transition-colors">×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-gray-600">승자 버튼(A승/B승)을 누르면 대회 페이지 대진표에 승리 팀이 하이라이트됩니다. 다시 누르면 해제.</p>
                    </div>
                  )}
                </div>

                <span className="text-xs font-bold text-gray-400 mt-4 block">우승팀 / 우승자 (선택 · 명예의 전당 표시)</span>
                <input type="text" placeholder="예시: 이글루A" value={tournamentWinner} onChange={(e) => setTournamentWinner(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />

                <span className="text-xs font-bold text-gray-400 mt-4 block">우승자 디스코드 ID (선택 · 명예의 전당에서 복사 가능)</span>
                <input type="text" placeholder="예시: 1104242935664492666" value={tournamentWinnerId} onChange={(e) => setTournamentWinnerId(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">배너 이미지 URL (선택)</span>
                <input type="text" placeholder="https://..." value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />
              </div>
              <div className="flex flex-col gap-3 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">리그 일정 <span className="text-[#e91e3f]">*</span></span>
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
        </div>

        <div className="bg-[#121212] border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-white/5 pb-4">상세 내용</h3>

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
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-white/5">
          <button type="button" onClick={() => router.back()} className="text-sm font-bold text-gray-600 hover:text-white transition-colors">취소</button>
          {!editId && (
            <button type="button" onClick={saveDraft} className="px-6 py-3.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/25 transition-all">보류</button>
          )}
          <button type="submit" disabled={isSubmitting || !isFormValid()} className={`px-8 py-3.5 rounded-xl text-sm font-bold transition-all ${isSubmitting || !isFormValid() ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-white text-black hover:bg-gray-200"}`}>{isSubmitting ? "처리 중..." : editId ? "수정하기" : "등록하기"}</button>
        </div>
      </form>

      {popupConfig.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
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