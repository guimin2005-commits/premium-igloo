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
  const [tournamentWinner, setTournamentWinner] = useState("");
  const [tournamentWinnerId, setTournamentWinnerId] = useState("");
  const [tournamentStartDate, setTournamentStartDate] = useState("");
  const [tournamentEndDate, setTournamentEndDate] = useState("");

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
      ...(category === "공지사항" && { content, noticeTag, isPinned, bannerUrl }),
      ...(category === "이벤트" && { content, eventTag, bannerUrl, eventPeriod: computedEventPeriod }),
      ...(category === "구인" && {
         recruitSubCategory, recruitRole, recruitPeriod: computedRecruitPeriod,
         recruitTasks: formatBulletPoints(recruitTasks), recruitQual: formatBulletPoints(recruitQual), recruitExtra: formatBulletPoints(recruitExtra)
       }),
      ...(category === "대회" && {
         content, bannerUrl, tournamentGame, tournamentPrize, tournamentStatus, tournamentLink,
         tournamentBracket, tournamentWinner, tournamentWinnerId,
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
          <input type="text" placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required className="w-full bg-transparent text-3xl md:text-4xl font-black text-white placeholder:text-neutral-800 outline-none tracking-tight"/>
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
                <CustomSelect value={tournamentStatus} onChange={setTournamentStatus} options={[{value:"예정됨", label:"예정됨"}, {value:"진행중", label:"진행중"}, {value:"종료됨", label:"종료됨"}]} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-400">참가 신청 링크 (선택)</span>
                <input type="text" placeholder="https://..." value={tournamentLink} onChange={(e) => setTournamentLink(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f]" />

                <span className="text-xs font-bold text-gray-400 mt-4 block">대진표 (선택)</span>
                <p className="text-[10px] text-gray-600 mb-1">라운드명 뒤에 콜론(:), 매치는 &quot;팀A vs 팀B&quot;, 승자는 &quot;&gt; 팀A&quot; 형식으로 입력<br/>예시)  4강:  ↵  이글루A vs 이글루B &gt; 이글루A  ↵  결승:  ↵  이글루A vs 이글루C</p>
                <textarea rows={5} placeholder={"4강:\n이글루A vs 이글루B > 이글루A\n이글루C vs 이글루D > 이글루C\n결승:\n이글루A vs 이글루C"} value={tournamentBracket} onChange={(e) => setTournamentBracket(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#e91e3f] resize-none font-mono" />

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