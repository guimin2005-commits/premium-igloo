"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";
import { AuctionStyles } from "../components/AuctionStyles";

import { GAME_PRESETS, GAME_LIST } from "@/lib/auctionGames";

const ADMIN_USERS = ["elahw.06"];

// 📌 아무 의미 없는 랜덤 익명 닉네임 생성기
const NICK_ADJ = [
  "무지개", "눅눅한", "바삭한", "졸린", "신난", "수줍은", "당당한", "미지근한", "얼어붙은", "말랑한",
  "시큼한", "달콤한", "매콤한", "심심한", "화려한", "투명한", "반짝이는", "느긋한", "재빠른", "엉뚱한",
  "고요한", "우렁찬", "조그만", "커다란", "삐딱한", "동그란", "네모난", "푹신한", "딱딱한", "촉촉한",
  "건조한", "뜨끈한", "서늘한", "몽롱한", "또렷한", "낡은", "새것같은", "빈티지", "미래형", "전설의",
];
const NICK_NOUN = [
  "머그컵", "감자칩", "슬리퍼", "선인장", "고등어", "우산", "베개", "양말", "타코야키", "붕어빵",
  "책갈피", "리모컨", "화분", "물티슈", "계란찜", "주전자", "목도리", "냄비뚜껑", "젤리", "식빵",
  "돌멩이", "구름", "만두", "김밥", "라디오", "스탬프", "지우개", "테이프", "빨대", "단추",
  "쿠션", "달력", "옷걸이", "삼각김밥", "가습기", "멀티탭", "귤껍질", "아이스크림", "종이비행기", "고무장갑",
];
const randomNick = (used: Set<string>) => {
  for (let i = 0; i < 80; i++) {
    const nick = `${NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)]} ${NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)]}`;
    if (!used.has(nick)) return nick;
  }
  return `익명${Math.floor(Math.random() * 1000)}`;
};

export default function AuctionListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [auctions, setAuctions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  // 생성 폼
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("오버워치");
  const [roles, setRoles] = useState<any[]>(GAME_PRESETS["오버워치"].roles.map((r) => ({ ...r })));
  const [phase1Role, setPhase1Role] = useState<string>(GAME_PRESETS["오버워치"].phase1Role);
  const [assignMode, setAssignMode] = useState<string>("instant"); // instant | inventory
  const [isTest, setIsTest] = useState(false); // 테스트 방
  const [reveal, setReveal] = useState<string[]>((GAME_PRESETS as any)["오버워치"].reveal);
  const [settings, setSettings] = useState({
    leaderPoints: 100000, basePrice: 1000, goldenBasePrice: 4000,
    scoutCost: 2000, goldenScoutCost: 4000, posChangeCost: 10000, minIncrement: 100, timerSeconds: 15, scoutSeconds: 7,
  });
  const [leaders, setLeaders] = useState<any[]>([{ name: "", position: "", discordId: "" }]);
  const [players, setPlayers] = useState<any[]>([{ alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", mostChampions: [""], isAllPos: false }]);

  // 📌 게임 선택 — 프리셋으로 역할/슬롯·선경매 포지션 세팅 + 기존 포지션 초기화
  const selectGame = (g: string) => {
    setGame(g);
    const preset = (GAME_PRESETS as any)[g] || { roles: [], phase1Role: "" };
    setRoles(preset.roles.length ? preset.roles.map((r: any) => ({ ...r })) : [{ name: "", count: 1 }]);
    setPhase1Role(preset.phase1Role || "");
    setReveal(preset.reveal || ["mainPos"]);
    setLeaders((prev) => prev.map((l) => ({ ...l, position: "" })));
    setPlayers((prev) => prev.map((p) => ({ ...p, mainPos: "", subPos: "", mostChampions: [""] })));
  };
  const roleNamesList = () => roles.map((r) => r.name).filter((n: string) => n.trim());

  // 📌 테스트 전용 — 폼 전체를 더미 데이터로 한 번에 채움 (관리자만 노출)
  const fillTestData = () => {
    const preset = (GAME_PRESETS as any)[game] || GAME_PRESETS["오버워치"];
    const rolesNow: string[] = (preset.roles?.length ? preset.roles : roles).map((r: any) => r.name).filter(Boolean);
    const slotsPerTeam = (preset.roles?.length ? preset.roles : roles).reduce((a: number, r: any) => a + (Number(r.count) || 0), 0) || 5;
    const teamCount = 4;
    const TIERS = ["브론즈", "실버", "골드", "플래티넘", "다이아", "마스터", "그랜드마스터"];
    const CHAMPS = ["아트록스", "리신", "아리", "징크스", "쓰레쉬", "야스오", "럭스", "제드", "탐켄치", "케이틀린"];
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    setTitle(`[테스트] ${game} 선수 경매 ${new Date().toLocaleDateString("ko-KR")}`);
    setIsTest(true);

    setLeaders(Array.from({ length: teamCount }, (_, i) => ({
      name: `테스트리더${i + 1}`,
      discordId: "",
      position: rolesNow[i % rolesNow.length] || "",
    })));

    // 팀 정원을 채우고도 남도록 여유 있게 생성
    const total = Math.max(teamCount * slotsPerTeam, 8);
    const used = new Set<string>();
    setPlayers(Array.from({ length: total }, (_, i) => {
      const nick = randomNick(used); used.add(nick);
      const golden = i > 0 && i % 7 === 0; // 가끔 황금카드
      return {
        alias: nick,
        discordId: "",
        peakTier: pick(TIERS),
        currentTier: pick(TIERS),
        mainPos: golden ? "" : pick(rolesNow),
        subPos: golden ? "" : pick(rolesNow),
        mostChampions: [pick(CHAMPS)],
        isAllPos: golden,
      };
    }));
    setPopup({ isOpen: true, message: `테스트 데이터를 입력했습니다.\n리더 ${teamCount}명 · 선수 ${total}명 (테스트 방으로 표시)`, isError: false });
  };
  const updateRole = (i: number, key: string, value: any) => setRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const updateLeader = (i: number, key: string, value: any) =>
    setLeaders((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  const updatePlayer = (i: number, key: string, value: any) =>
    setPlayers((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));

  // 랜덤 닉네임: 개별 지정 (현재 목록과 중복 방지)
  const rollNick = (i: number) => {
    setPlayers((prev) => {
      const used = new Set(prev.filter((_, idx) => idx !== i).map((p) => p.alias));
      return prev.map((p, idx) => (idx === i ? { ...p, alias: randomNick(used) } : p));
    });
  };
  // 랜덤 닉네임: 전체 일괄 지정
  const rollAllNicks = () => {
    setPlayers((prev) => {
      const used = new Set<string>();
      return prev.map((p) => {
        const nick = randomNick(used);
        used.add(nick);
        return { ...p, alias: nick };
      });
    });
  };

  const fetchList = () => {
    fetch("/api/auction", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAuctions(Array.isArray(d?.data) ? d.data : []))
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchList(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validLeaders = leaders.filter((l) => l.name.trim());
    const validPlayers = players.filter((p) => p.alias.trim()).map((p) => ({
      ...p,
      mainPos: p.isAllPos ? "" : p.mainPos,
      subPos: p.isAllPos ? "" : p.subPos,
    }));

    const validRoles = roles.filter((r) => r.name.trim() && Number(r.count) > 0).map((r) => ({ name: r.name.trim(), count: Number(r.count) }));

    if (!title.trim() || validLeaders.length < 2 || validPlayers.length < 1) {
      setPopup({ isOpen: true, message: "제목, 리더 2명 이상, 선수 1명 이상이 필요합니다.", isError: true });
      return;
    }
    if (validRoles.length === 0) {
      setPopup({ isOpen: true, message: "포지션(역할)을 1개 이상 설정해 주세요.", isError: true });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, game, isTest, settings: { ...settings, roles: validRoles, phase1Role, assignMode, reveal }, leaders: validLeaders, players: validPlayers }),
      });
      const d = await res.json();
      if (d.success) {
        router.push(`/auction/${d.data._id}`);
      } else {
        setPopup({ isOpen: true, message: d.message || "생성 실패", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류", isError: true });
    } finally { setIsSubmitting(false); }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/auction?id=${deleteId}`, { method: "DELETE" }).catch(() => {});
    setDeleteId(null);
    fetchList();
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">선수 경매를 보시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20">Discord 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";
  const numClass = "w-full bg-[#121212] border border-white/10 rounded-lg px-3 py-2 text-xs text-white text-center outline-none focus:border-[#e91e3f] transition-colors font-bold";

  return (
    <main className="w-full flex-1 flex flex-col relative auc">
      <LuxStyles />
      <AuctionStyles />

      {/* ══ 호가판 헤드 — 판돈(POINT)이 주인공 ══ */}
      {(() => {
        const live = auctions.filter((a: any) => a.status === "진행중");
        const pool = auctions.reduce((s: number, a: any) => s + (a.pointPool || 0), 0);
        const players = auctions.reduce((s: number, a: any) => s + (a.playerCount || 0), 0);
        const sold = auctions.reduce((s: number, a: any) => s + (a.soldCount || 0), 0);
        return (
          <section className="relative w-full pt-14 md:pt-20 px-6 border-b border-white/[0.08]">
            <div className="max-w-5xl mx-auto">
              {/* 상태 줄 */}
              <div className="auc-in flex items-center gap-2.5 mb-7">
                <span className={`w-2 h-2 rounded-full ${live.length ? "bg-[#e91e3f] auc-live" : "bg-gray-700"}`} />
                <span className="auc-label text-gray-500">{live.length ? `${live.length}개 경매 진행 중` : "진행 중인 경매 없음"}</span>
              </div>

              <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-end pb-10">
                {/* 좌 : 타이틀 */}
                <div className="min-w-0">
                  <h1 className="auc-in text-5xl md:text-[5.5rem] font-black tracking-tighter leading-[0.88] mb-5" style={{ animationDelay: "60ms" }}>
                    <span className="block text-white">선수</span>
                    <span className="block text-white">경매<span className="text-[#e91e3f]">.</span></span>
                  </h1>
                  <p className="auc-in text-gray-400 text-sm md:text-base leading-relaxed max-w-md" style={{ animationDelay: "140ms" }}>
                    팀장이 가진 <span className="text-[#4d7cfe] font-bold">Point</span>를 걸고 선수를 사 옵니다.<br className="hidden sm:block" />
                    더 높게 부른 쪽이 가져가고, 내려간 망치는 되돌릴 수 없습니다.
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => setShowCreate(!showCreate)}
                      className="auc-in mt-7 group inline-flex items-center gap-3 border border-[#e91e3f] px-6 py-3 text-[#e91e3f] hover:bg-[#e91e3f] hover:text-white transition-colors"
                      style={{ animationDelay: "220ms" }}
                    >
                      <span className="auc-label">{showCreate ? "닫기" : "경매 개최"}</span>
                      <span className="text-base leading-none transition-transform group-hover:translate-x-1">→</span>
                    </button>
                  )}
                </div>

                {/* 우 : 총 판돈 + 대치 지표 */}
                <div className="auc-in w-full lg:w-[360px] shrink-0" style={{ animationDelay: "300ms" }}>
                  <p className="auc-label text-gray-600 mb-2">총 판돈 · Total Point</p>
                  <p className="auc-num text-5xl md:text-6xl font-black text-white leading-none mb-1">
                    <span className="auc-roll inline-block">{pool.toLocaleString()}</span>
                    <span className="text-lg font-bold text-[#4d7cfe] ml-2">P</span>
                  </p>
                  <div className="auc-gauge mt-3 mb-6"><span /></div>

                  {/* VS 대치 */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-right">
                      <p className="auc-label text-gray-600 mb-1">팀</p>
                      <p className="auc-num text-3xl font-black text-white leading-none">{auctions.reduce((s: number, a: any) => s + (a.leaderCount || 0), 0)}</p>
                    </div>
                    <span className="auc-vs shrink-0">
                      <span className="text-[10px] font-black text-gray-500 tracking-widest">VS</span>
                    </span>
                    <div className="flex-1">
                      <p className="auc-label text-gray-600 mb-1">선수</p>
                      <p className="auc-num text-3xl font-black text-white leading-none">{players}</p>
                    </div>
                  </div>

                  <p className="auc-label text-gray-700 mt-5 pt-4 border-t border-white/[0.08]">
                    누적 낙찰 <span className="text-gray-400">{sold}</span>
                  </p>
                </div>
              </div>
            </div>
          </section>
        );
      })()}


      <div className="w-full max-w-6xl mx-auto px-6 pt-10 pb-16 flex-1 flex flex-col space-y-8">

        {/* 생성 폼 */}
        {showCreate && (
          <Reveal>
          <form onSubmit={handleCreate} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px">
            <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-black text-white flex items-center gap-3"><span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>경매 개최</h3>
                {/* 📌 관리자 테스트 도구 */}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setIsTest(!isTest)} className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-all ${isTest ? "bg-amber-500/15 text-amber-400 border-amber-500/35" : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"}`}>
                    {isTest ? "🧪 테스트 방" : "테스트 방 아님"}
                  </button>
                  <button type="button" onClick={fillTestData} className="text-[11px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full hover:bg-amber-500/20 transition-colors">
                    테스트 데이터 자동 입력
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">경매 제목 <span className="text-[#e91e3f]">*</span></label>
                  <input type="text" required placeholder="예: 제 1회 종합 e스포츠 대회 선수 경매" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">종목 <span className="text-[#e91e3f]">*</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {GAME_LIST.map((g) => (
                      <button type="button" key={g} onClick={() => selectGame(g)} className={`px-3 py-2.5 text-[11px] font-bold rounded-lg border transition-all ${game === g ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-[#0d0d0d] border-white/10 text-gray-400 hover:border-white/25 hover:text-white"}`}>{g}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 경매 방식 — 즉시 배정 / 인벤토리 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">경매 방식 <span className="text-[#e91e3f]">*</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { v: "instant", t: "즉시 배정", d: "낙찰 즉시 포지션 배정 후 다음 선수로" },
                    { v: "inventory", t: "인벤토리 방식", d: "낙찰 선수를 인벤토리에 보관 → 팀장이 언제든 배정, 종료 시 확정" },
                  ].map((opt) => (
                    <button type="button" key={opt.v} onClick={() => setAssignMode(opt.v)} className={`text-left rounded-xl border p-3.5 transition-all ${assignMode === opt.v ? "border-[#e91e3f] bg-[#e91e3f]/[0.08]" : "border-white/10 bg-[#0d0d0d] hover:border-white/25"}`}>
                      <p className={`text-sm font-black mb-0.5 ${assignMode === opt.v ? "text-[#e91e3f]" : "text-white"}`}>{opt.t}</p>
                      <p className="text-[11px] text-gray-500 leading-snug break-keep">{opt.d}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 포지션(역할) & 슬롯 — 게임별 프리셋 + 커스텀 편집 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500">포지션 & 슬롯 <span className="text-gray-600 font-medium">— 팀별 각 포지션 인원 수</span></label>
                  <button type="button" onClick={() => setRoles([...roles, { name: "", count: 1 }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">+ 포지션</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-[#0d0d0d] border border-white/10 rounded-lg px-2 py-1.5">
                      <input type="text" placeholder="역할명" value={r.name} onChange={(e) => updateRole(i, "name", e.target.value)} className="w-16 bg-transparent text-xs font-bold text-white outline-none placeholder:text-gray-600 text-center" />
                      <span className="text-gray-700 text-xs">×</span>
                      <input type="number" min={1} value={r.count} onChange={(e) => updateRole(i, "count", Number(e.target.value))} className="w-9 bg-transparent text-xs font-bold text-white outline-none text-center" />
                      {roles.length > 1 && <button type="button" onClick={() => setRoles(roles.filter((_, idx) => idx !== i))} className="text-gray-700 hover:text-red-400 text-sm px-0.5">×</button>}
                    </div>
                  ))}
                </div>
                {/* 선경매(1페이즈) 포지션 */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[10px] font-bold text-gray-500">선경매(1페이즈) 포지션</span>
                  <button type="button" onClick={() => setPhase1Role("")} className={`px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all ${!phase1Role ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-gray-500 hover:border-white/25"}`}>없음(단일)</button>
                  {roleNamesList().map((n: string) => (
                    <button type="button" key={n} onClick={() => setPhase1Role(n)} className={`px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all ${phase1Role === n ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "border-white/10 text-gray-500 hover:border-white/25"}`}>{n}</button>
                  ))}
                  <span className="text-[9px] text-gray-600 w-full mt-0.5">선경매 포지션은 1페이즈에 먼저 경매됩니다. (오버워치 탱커처럼) · 없음이면 단일 페이즈로 진행</span>
                </div>
              </div>

              {/* 룰 설정 (수치) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-3">경매 룰 설정</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { k: "leaderPoints", l: "리더 시작 Point" },
                    { k: "basePrice", l: "기본 시작가" },
                    { k: "goldenBasePrice", l: "황금카드 시작가" },
                    { k: "scoutCost", l: "스카우터 비용" },
                    { k: "goldenScoutCost", l: "황금 스카우터" },
                    { k: "posChangeCost", l: "포지션 체인지" },
                    { k: "minIncrement", l: "최소 입찰 단위" },
                    { k: "timerSeconds", l: "입찰 타이머(초)" },
                    { k: "scoutSeconds", l: "스카우터 타임(초)" },
                  ].map((f) => (
                    <div key={f.k}>
                      <p className="text-[10px] font-bold text-gray-600 mb-1">{f.l}</p>
                      <input type="number" min={0} value={(settings as any)[f.k]} onChange={(e) => setSettings({ ...settings, [f.k]: Number(e.target.value) })} className={numClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* 리더 카드 목록 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500">리더 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({leaders.filter(l => l.name.trim()).length}명)</span></label>
                  <button type="button" onClick={() => setLeaders([...leaders, { name: "", position: "", discordId: "" }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">리더 추가</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {leaders.map((l, i) => (
                    <div key={i} className="relative rounded-xl border border-white/10 bg-black/25 p-4 hover:border-white/20 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">Leader {String(i + 1).padStart(2, "0")}</span>
                        {leaders.length > 1 && (
                          <button type="button" onClick={() => setLeaders(leaders.filter((_, idx) => idx !== i))} className="text-[10px] font-bold text-gray-600 hover:text-red-400 transition-colors">제거</button>
                        )}
                      </div>
                      <input type="text" placeholder="리더 이름" value={l.name} onChange={(e) => updateLeader(i, "name", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <input type="text" placeholder="디스코드 ID (선택 · 프로필 표시)" value={l.discordId} onChange={(e) => updateLeader(i, "discordId", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <div className="flex flex-wrap gap-1.5">
                        {roleNamesList().map((pos: string) => (
                          <button type="button" key={pos} onClick={() => updateLeader(i, "position", l.position === pos ? "" : pos)} className={`flex-1 min-w-[48px] py-2 text-[11px] font-bold rounded-lg border transition-all ${l.position === pos ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">{phase1Role ? `${phase1Role} 포지션 리더는 1페이즈 참가가 자동 차단됩니다. ` : ""}디스코드 ID를 입력하면 팀 현황판에 프로필이 표시되고, 해당 유저는 접속 시 자동으로 리더 화면이 지정됩니다.</p>
              </div>

              {/* 선수 카드 목록 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500">선수 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({players.filter(p => p.alias.trim()).length}명)</span></label>
                  <div className="flex gap-2">
                    <button type="button" onClick={rollAllNicks} className="text-[11px] font-black text-gray-400 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full hover:text-white hover:border-white/25 transition-colors">전체 랜덤 닉네임</button>
                    <button type="button" onClick={() => setPlayers([...players, { alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", mostChampions: [""], isAllPos: false }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">선수 추가</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {players.map((p, i) => (
                    <div key={i} className={`relative rounded-xl border p-4 transition-colors ${p.isAllPos ? "border-[#e91e3f]/35 bg-[#e91e3f]/[0.04]" : "border-white/10 bg-black/25 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">Player {String(i + 1).padStart(2, "0")}</span>
                        <div className="flex items-center gap-2.5">
                          <button type="button" onClick={() => updatePlayer(i, "isAllPos", !p.isAllPos)} className={`text-[10px] font-black px-2.5 py-1 rounded-full border transition-all ${p.isAllPos ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "border-white/10 text-gray-600 hover:border-white/30"}`}>올 포지션</button>
                          {players.length > 1 && (
                            <button type="button" onClick={() => setPlayers(players.filter((_, idx) => idx !== i))} className="text-[10px] font-bold text-gray-600 hover:text-red-400 transition-colors">제거</button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 mb-2.5">
                        <input type="text" placeholder="익명 닉네임" value={p.alias} onChange={(e) => updatePlayer(i, "alias", e.target.value)} className={inputClass} />
                        <button type="button" onClick={() => rollNick(i)} title="랜덤 닉네임" className="shrink-0 px-3.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-[#e91e3f]/40 transition-all">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                      </div>
                      <input type="text" placeholder="디스코드 ID (선택 · 낙찰 후 프로필 공개용)" value={p.discordId} onChange={(e) => updatePlayer(i, "discordId", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <div className="grid grid-cols-2 gap-2 mb-2.5">
                        <input type="text" placeholder="최고 티어" value={p.peakTier} onChange={(e) => updatePlayer(i, "peakTier", e.target.value)} className={inputClass} />
                        <input type="text" placeholder="현재 티어" value={p.currentTier} onChange={(e) => updatePlayer(i, "currentTier", e.target.value)} className={inputClass} />
                      </div>
                      {p.isAllPos ? (
                        <div className="space-y-2">
                          <p className="text-[10px] text-amber-300/90 font-bold">황금카드 — 티어 비공개 · 시작가 {settings.goldenBasePrice.toLocaleString()}pt · 슬롯 자유(이미 찬 곳도 배정) · 스카우터({settings.goldenScoutCost.toLocaleString()}pt)는 모스트만 공개</p>
                          <div>
                            <p className="text-[9px] font-bold text-gray-600 mb-1">모스트 챔피언 <span className="text-gray-700">(스카우터 공개 · 1개)</span></p>
                            <input type="text" placeholder="예: 아트록스" value={(p.mostChampions || [""])[0] || ""} onChange={(e) => updatePlayer(i, "mostChampions", [e.target.value])} className="w-full bg-[#0d0d0d] border border-white/10 rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-amber-400/60 placeholder:text-gray-600" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <p className="text-[9px] font-bold text-gray-600 mb-1">주 포지션</p>
                            <div className="flex flex-wrap gap-1">
                              {roleNamesList().map((pos: string) => (
                                <button type="button" key={pos} onClick={() => updatePlayer(i, "mainPos", p.mainPos === pos ? "" : pos)} className={`flex-1 min-w-[40px] py-1.5 text-[10px] font-bold rounded-md border transition-all ${p.mainPos === pos ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos}</button>
                              ))}
                            </div>
                          </div>
                          {reveal.includes("subPos") && (
                            <div>
                              <p className="text-[9px] font-bold text-gray-600 mb-1">부 포지션</p>
                              <div className="flex flex-wrap gap-1">
                                {roleNamesList().map((pos: string) => (
                                  <button type="button" key={pos} onClick={() => updatePlayer(i, "subPos", p.subPos === pos ? "" : pos)} className={`flex-1 min-w-[40px] py-1.5 text-[10px] font-bold rounded-md border transition-all ${p.subPos === pos ? "bg-white/60 text-black border-white/60" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          {reveal.includes("champions") && (
                            <div>
                              <p className="text-[9px] font-bold text-gray-600 mb-1">모스트 챔피언 <span className="text-gray-700">(스카우터 공개 · 1개)</span></p>
                              <input type="text" placeholder="예: 아트록스" value={(p.mostChampions || [""])[0] || ""} onChange={(e) => updatePlayer(i, "mostChampions", [e.target.value])} className="w-full bg-[#0d0d0d] border border-white/10 rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[#e91e3f] placeholder:text-gray-600" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {phase1Role && <p className="text-[10px] text-gray-600 mt-2">주/부 포지션에 {phase1Role}가 포함된 선수는 1페이즈로 자동 분류됩니다.</p>}
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">
                {isSubmitting ? "생성 중..." : "경매장 생성"}
              </button>
            </div>
          </form>
          </Reveal>
        )}

        {/* 목록 */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">불러오는 중...</div>
        ) : auctions.length === 0 ? (
          <Reveal>
          <div className="border-y border-white/[0.09]">
            <div className="py-20 px-6 text-center relative">
              <div className="relative z-10">
                <div className="w-12 h-12 mx-auto mb-6 border border-[#e91e3f]/35 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-6 h-6 text-[#e91e3f]"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-white font-black text-lg mb-2">{isAdmin ? "개최된 경매가 없습니다" : "현재 진행 중인 경매가 없습니다"}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{isAdmin ? "우측 상단에서 첫 경매를 개최해보세요." : <>대회 시즌이 시작되면 이곳에서 실시간 선수 경매가 열립니다.<br/>공지사항을 통해 일정을 확인해주세요.</>}</p>
              </div>
            </div>
          </div>
          </Reveal>
        ) : (
          /* 📌 출품 목록 — 판돈(Point)과 팀 VS 선수 대치를 앞세운 행 */
          <div className="border-t border-white/[0.07]">
            {auctions.map((a, idx) => {
              const isLive = a.status === "진행중";
              const isEnd = a.status === "종료";
              return (
                <div
                  key={a._id}
                  onClick={() => router.push(`/auction/${a._id}`)}
                  className={`auc-lot auc-in group cursor-pointer border-b border-white/[0.07] px-1 sm:px-3 py-6 ${isEnd ? "opacity-55 hover:opacity-100 transition-opacity" : ""}`}
                  style={{ animationDelay: `${380 + Math.min(idx, 8) * 60}ms` }}
                >
                  {/* 낙찰 스트라이크 */}
                  <span className="auc-strike" />

                  <div className="flex flex-wrap lg:flex-nowrap items-center gap-x-8 gap-y-4">
                    {/* 제목 */}
                    <div className="min-w-0 flex-1 w-full lg:w-auto">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                        {a.game && <span className="auc-label text-gray-500">{a.game}</span>}
                        {a.isTest && <span className="auc-label text-amber-400/90">· 테스트</span>}
                        <span className="auc-label text-gray-700">· {new Date(a.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
                      </div>
                      <p className={`text-xl md:text-2xl font-black tracking-tight truncate transition-colors ${isEnd ? "text-gray-500" : "text-white group-hover:text-[#ff5c77]"}`}>
                        {a.title}
                      </p>
                    </div>

                    {/* 팀 VS 선수 */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right w-14">
                        <p className="auc-label text-gray-700 mb-1">팀</p>
                        <p className="auc-num text-2xl font-black text-gray-200 leading-none">{a.leaderCount}</p>
                      </div>
                      <span className="auc-vs shrink-0">
                        <span className="text-[9px] font-black text-gray-600 tracking-widest">VS</span>
                      </span>
                      <div className="w-14">
                        <p className="auc-label text-gray-700 mb-1">선수</p>
                        <p className="auc-num text-2xl font-black text-gray-200 leading-none">{a.playerCount}</p>
                      </div>
                    </div>

                    {/* 판돈 */}
                    <div className="shrink-0 w-40 sm:border-l border-white/[0.08] sm:pl-6">
                      <p className="auc-label text-gray-700 mb-1">{isEnd ? "소진 후 잔여" : "남은 판돈"}</p>
                      <p className="auc-num text-2xl font-black leading-none">
                        <span className={isEnd ? "text-gray-600" : "text-white"}>{(a.pointPool || 0).toLocaleString()}</span>
                        <span className="text-xs font-bold text-[#4d7cfe] ml-1.5">P</span>
                      </p>
                      {a.playerCount > 0 && (
                        <p className="auc-label text-gray-700 mt-1.5">낙찰 {a.soldCount || 0} / {a.playerCount}</p>
                      )}
                    </div>

                    {/* 상태 + 진입 */}
                    <div className="shrink-0 ml-auto lg:ml-0 flex items-center gap-4">
                      {isLive ? (
                        <span className="inline-flex items-center gap-2 border border-[#e91e3f] bg-[#e91e3f]/10 px-3 py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] auc-live" />
                          <span className="auc-label text-[#e91e3f]">Live</span>
                        </span>
                      ) : isEnd ? (
                        <span className="inline-flex items-center border border-white/12 px-3 py-1.5">
                          <span className="auc-label text-gray-600">낙찰 완료</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center border border-[#4d7cfe]/45 px-3 py-1.5">
                          <span className="auc-label text-[#8aa8ff]">개장 대기</span>
                        </span>
                      )}

                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(a._id); }} className="auc-label text-gray-700 hover:text-red-400 transition-colors lg:opacity-0 lg:group-hover:opacity-100">삭제</button>
                      )}

                      <svg className="w-5 h-5 text-gray-700 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">경매장과 모든 기록·채팅이 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 whitespace-pre-line">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
