"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Reveal, LuxStyles } from "../components/Lux";
import { AuctionStyles } from "../components/AuctionStyles";

import { GAME_PRESETS, GAME_LIST } from "@/lib/auctionGames";

const ADMIN_USERS = ["elahw.06"];

// 📌 구획 머리말 — 관리자 작성 화면 공통 서식(번호 + 헤어라인)
const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
  <div className="mb-3">
    <div className="flex items-baseline gap-4 mb-2">
      <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
    </div>
    <div className="flex items-center justify-between gap-4">
      <h3 className="text-base md:text-lg font-black text-white tracking-tight">{title}</h3>
      {right}
    </div>
  </div>
);

// 📌 아무 의미 없는 랜덤 익명 닉네임 생성기
const NICK_ADJ = [
  "무지개", "눅눅한", "바삭한", "졸린", "신난", "수줍은", "당당한", "미지근한", "얼어붙은", "말랑한",
  "시큼한", "달콤한", "매콤한", "심심한", "화려한", "투명한", "반짝이는", "느긋한", "재빠른", "엉뚱한",
  "고요한", "우렁찬", "조그만", "커다란", "삐딱한", "동그란", "네모난", "푹신한", "딱딱한", "촉촉한",
  "건조한", "뜨끈한", "서늘한", "몽롱한", "또렷한", "낡은", "새것같은", "빈티지", "미래형", "전설의",
  // 유쾌한 쪽 — 상태·표정이 눈에 그려지는 말들
  "춤추는", "노래하는", "굴러다니는", "숨어있는", "배고픈", "방금깨어난", "당황한", "의욕넘치는", "과몰입한", "야근하는",
  "칼퇴한", "지각한", "삐진", "능청맞은", "허둥대는", "빙글빙글", "폭주하는", "은퇴한", "복귀한", "수상한",
  "정체불명", "무적의", "최후의", "초심자", "베테랑", "떠돌이", "출근중인", "낭만적인", "천진한", "무심한",
  "각성한", "잠수탄", "우쭐한", "겸손한", "질주하는", "구르는", "떠오르는", "장엄한", "소박한", "전설속의",
  "만렙", "1렙", "자칭프로", "월요일의", "금요일의", "산책하는", "낮잠자는", "야망있는", "느릿느릿", "번개같은",
  // 웃긴 쪽 — 처지가 보이는 말들
  "배터리3%", "와이파이끊긴", "지갑두고온", "알람끈", "숙제안한", "면접보고온", "월급털린", "적금깬", "읽씹당한", "단톡탈출한",
  "막차놓친", "새벽4시", "다이어트중", "야식시킨", "치킨앞의", "라면불린", "양말한짝", "액정깨진", "민초파", "반민초파",
  "부먹파", "찍먹파", "엘베놓친", "번호표뽑은", "줄서다지친", "헬스끊은", "내일부터", "3일차", "작심삼일", "의욕만앞선",
  "눈치보는", "머쓱한", "뿌듯한", "들뜬", "하품하는", "기지개켜는", "까치발든", "손흔드는", "박수치는", "고개끄덕이는",
  "천하태평", "새침한", "털털한", "까칠한", "장난기많은", "충전중인", "점검중인", "예열중인", "재부팅한", "무한로딩중",
];
const NICK_NOUN = [
  "머그컵", "감자칩", "슬리퍼", "선인장", "고등어", "우산", "베개", "양말", "타코야키", "붕어빵",
  "책갈피", "리모컨", "화분", "물티슈", "계란찜", "주전자", "목도리", "냄비뚜껑", "젤리", "식빵",
  "돌멩이", "구름", "만두", "김밥", "라디오", "스탬프", "지우개", "테이프", "빨대", "단추",
  "쿠션", "달력", "옷걸이", "삼각김밥", "가습기", "멀티탭", "귤껍질", "아이스크림", "종이비행기", "고무장갑",
  // 이글루 감성 + 웃긴 물건·먹거리
  "펭귄", "눈사람", "빙하", "고드름", "털장갑", "핫팩", "전기장판", "온수매트", "군고구마", "호빵",
  "탕후루", "마라탕", "떡볶이", "곱창", "컵라면", "치즈볼", "군만두", "약과", "누룽지", "찐빵",
  "슬라임", "훌라후프", "탬버린", "리코더", "요요", "팽이", "딱지", "구슬", "제기", "복권",
  "출석도장", "택배상자", "뽁뽁이", "포스트잇", "형광펜", "충전기", "이어폰", "마우스패드", "선풍기", "청소기",
  "댕댕이", "고양이발", "햄스터", "해달", "물개", "부엉이", "두더지", "달팽이", "개구리", "문어",
  // 웃긴 쪽 — 이름만 불러도 웃긴 것들
  "치킨무", "피자엣지", "붕어빵꼬리", "탕수육소스", "떡꼬치", "닭발", "번데기", "젤리곰", "빼빼로", "감자탕",
  "종량제봉투", "비닐봉지", "회전문", "자동문", "에스컬레이터", "정수기", "번호표", "적립금10원", "쿠폰만료", "무한로딩",
  "이어폰한짝", "충전기5%", "보조배터리", "먹통리모컨", "고장난선풍기", "삐걱대는의자", "덜컹대는책상", "미끄러운양말", "구겨진영수증", "굴러간동전",
  "월요일아침", "금요일저녁", "알람소리", "지각버스", "막차", "첫눈", "우박", "장마", "황사", "폭설",
  "물음표", "느낌표", "말줄임표", "받아쓰기", "출석부", "칠판지우개", "실내화", "체육복", "급식판", "우유갑",
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
  const searchParams = useSearchParams();
  // 📌 ?admin=1 — 관리자 패널에서 들어온 '경매 개최' 화면 (콘텐츠 작성과 같은 방식)
  const adminMode = searchParams.get("admin") === "1";
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [auctions, setAuctions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [focus, setFocus] = useState(0); // 📌 무대 중앙에 세울 경매
  const [tearing, setTearing] = useState<string | null>(null); // 📌 티켓을 찢는 중인 경매
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  // 생성 폼
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("오버워치");
  const [roles, setRoles] = useState<any[]>(GAME_PRESETS["오버워치"].roles.map((r) => ({ ...r })));
  const [phase1Role, setPhase1Role] = useState<string>(GAME_PRESETS["오버워치"].phase1Role);
  const [assignMode, setAssignMode] = useState<string>("instant"); // instant | inventory
  const [isTest, setIsTest] = useState(false); // 테스트 방
  const [isPrivate, setIsPrivate] = useState(false); // 비공개 방 — 목록에 뜨지 않는다
  const [reveal, setReveal] = useState<string[]>((GAME_PRESETS as any)["오버워치"].reveal);
  const [settings, setSettings] = useState({
    leaderPoints: 100000, basePrice: 1000, goldenBasePrice: 4000,
    scoutCost: 2000, goldenScoutCost: 4000, posChangeCost: 10000, minIncrement: 100, timerSeconds: 15, scoutSeconds: 7,
    invCapacity: 1, invPlusCost: 5000,
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

    setTitle(`[테스트] ${game} 경매 ${new Date().toLocaleDateString("ko-KR")}`);
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

  // 📌 선수 카드를 리더로 올린다 — 설문으로 한꺼번에 불러온 뒤 팀장을 골라낼 때 쓴다
  const promoteToLeader = (i: number) => {
    const p = players[i];
    if (!p?.alias?.trim()) {
      setPopup({ isOpen: true, message: "닉네임이 있어야 리더로 올릴 수 있습니다.", isError: true });
      return;
    }
    // 포지션은 이 경매의 역할과 맞을 때만 가져간다
    const pos = roleNamesList().includes(p.mainPos) ? p.mainPos : "";
    setLeaders((prev) => {
      const empty = prev.findIndex((l) => !l.name.trim());
      const next = { name: p.alias.trim(), discordId: p.discordId || "", position: pos };
      // 비어 있는 리더 칸이 있으면 그 자리를 채운다
      return empty >= 0 ? prev.map((l, idx) => (idx === empty ? next : l)) : [...prev, next];
    });
    setPlayers((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", mostChampions: [""], isAllPos: false }]));
    setPopup({ isOpen: true, message: `${p.alias}님을 리더로 올렸습니다.${pos ? ` (${pos})` : ""}`, isError: false });
  };

  // 📌 대회 참가 설문 → 선수 명단 자동 채우기 (관리자 전용)
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [surveyPosts, setSurveyPosts] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const openSurveyPicker = async () => {
    setShowSurveyPicker(true);
    try {
      const d = await (await fetch("/api/auction/import-survey", { cache: "no-store" })).json();
      setSurveyPosts(Array.isArray(d?.data) ? d.data : []);
    } catch { setSurveyPosts([]); }
  };

  const importSurvey = async (postId: string) => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const qs = new URLSearchParams({ postId, roles: roleNamesList().join(",") });
      const d = await (await fetch(`/api/auction/import-survey?${qs}`, { cache: "no-store" })).json();
      const list = Array.isArray(d?.data) ? d.data : [];
      if (list.length === 0) {
        setPopup({ isOpen: true, message: "불러올 응답이 없습니다.", isError: true });
      } else {
        setPlayers(list);
        setShowSurveyPicker(false);
        const skipped = d?.meta?.skipped || 0;
        setPopup({ isOpen: true, message: `선수 ${list.length}명을 불러왔습니다.${skipped ? `
닉네임을 찾지 못한 ${skipped}명은 제외했습니다.` : ""}`, isError: false });
      }
    } catch {
      setPopup({ isOpen: true, message: "설문을 불러오지 못했습니다.", isError: true });
    } finally {
      setIsImporting(false);
    }
  };

  // 공개 ↔ 비공개 전환 (관리자 전용)
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const togglePrivate = async (id: string, next: boolean) => {
    if (togglingId) return;
    setTogglingId(id);
    try {
      const res = await fetch("/api/auction", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isPrivate: next }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setAuctions((prev) => prev.map((a) => (a._id === id ? { ...a, isPrivate: next } : a)));
        setPopup({ isOpen: true, message: d.message || "전환했습니다.", isError: false });
      } else {
        setPopup({ isOpen: true, message: d.message || "전환에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버와 통신 중 오류가 발생했습니다.", isError: true });
    } finally {
      setTogglingId(null);
    }
  };

  // 경매 제목 수정 (관리자 전용)
  const [renameTarget, setRenameTarget] = useState<any>(null); // { id, title }
  const [isRenaming, setIsRenaming] = useState(false);
  const renameAuction = async () => {
    const t = (renameTarget?.title || "").trim();
    if (!t || isRenaming) return;
    setIsRenaming(true);
    try {
      const res = await fetch("/api/auction", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameTarget.id, title: t }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setAuctions((prev) => prev.map((a) => (a._id === renameTarget.id ? { ...a, title: t } : a)));
        setRenameTarget(null);
        setPopup({ isOpen: true, message: "제목을 변경했습니다.", isError: false });
      } else setPopup({ isOpen: true, message: d.message || "제목 변경에 실패했습니다.", isError: true });
    } catch {
      setPopup({ isOpen: true, message: "서버와 통신 중 오류가 발생했습니다.", isError: true });
    } finally {
      setIsRenaming(false);
    }
  };

  const fetchList = () => {
    fetch("/api/auction", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : [];
        setAuctions(list);
        // 진행 중인 경매가 있으면 그걸 중앙에 세운다 (최근 5개 안에서)
        const liveIdx = list.slice(0, 5).findIndex((a: any) => a.status === "진행중");
        setFocus(liveIdx >= 0 ? liveIdx : 0);
      })
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchList(); }, []);

  // 관리자 패널로 들어오면 개최 폼을 바로 펼친다
  useEffect(() => { if (adminMode) setShowCreate(true); }, [adminMode]);

  // 📌 티켓 무대는 최근 5개까지, 그 이전 경매는 아래 목록으로
  const recent = auctions.slice(0, 5);
  const past = auctions.slice(5);

  // 📌 종이가 찢어지는 소리 — 밴드패스를 훑는 노이즈로 '드드득' 결을 만들고 끝에 탁 끊는다.
  //    (클릭으로 호출되므로 AudioContext 자동재생 정책에 걸리지 않는다)
  const playTear = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const dur = 0.42;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      // 균일한 노이즈가 아니라 불규칙하게 끊기는 결 — 종이 섬유가 뜯기는 느낌
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const grain = Math.random() < 0.55 + t * 0.4 ? 1 : 0.25;
        d[i] = (Math.random() * 2 - 1) * grain;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(700, now);
      bp.frequency.exponentialRampToValueAtTime(3400, now + dur * 0.82);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
      g.gain.setValueAtTime(0.16, now + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur);
      // 마지막으로 완전히 끊기는 '탁'
      const snap = ctx.createOscillator();
      const sg = ctx.createGain();
      snap.type = "triangle";
      snap.frequency.value = 240;
      sg.gain.setValueAtTime(0.09, now + dur * 0.8);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.8 + 0.09);
      snap.connect(sg).connect(ctx.destination);
      snap.start(now + dur * 0.8);
      snap.stop(now + dur * 0.8 + 0.1);
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {}
  };

  // 📌 입장 — 티켓이 절취선을 따라 찢어지고 사라진 뒤 이동한다
  //    종료된 경매는 이미 찢긴 티켓이라 연출 없이 바로 들어간다
  const enter = (id: string, skipTear = false) => {
    if (tearing) return;
    if (skipTear) { router.push(`/auction/${id}`); return; }
    setTearing(id);
    playTear();
    setTimeout(() => router.push(`/auction/${id}`), 720);
  };

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
        body: JSON.stringify({ title, game, isTest, isPrivate, settings: { ...settings, roles: validRoles, phase1Role, assignMode, reveal }, leaders: validLeaders, players: validPlayers }),
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
        <p className="text-gray-400 mb-8 text-sm">경매를 보시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20">Discord 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-transparent border-0 border-b border-white/12 rounded-none px-0 py-2.5 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";
  const numClass = "w-full bg-transparent border-0 border-b border-white/12 rounded-none px-0 py-2 text-xs text-white text-center outline-none focus:border-[#e91e3f] transition-colors font-bold";

  return (
    <main className="w-full flex-1 flex flex-col relative auc">
      <LuxStyles />
      <AuctionStyles />

      {/* 📌 관리자 개최 화면 머리말 — 콘텐츠 작성과 같은 톤 */}
      {adminMode && isAdmin && (
        <section className="w-full px-6 pt-10 pb-2">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Create Auction</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">경매 개최</h1>
            <p className="text-sm text-gray-400 break-keep">경매장을 만들고 팀·포지션·포인트 규칙을 설정합니다.</p>
          </div>
        </section>
      )}

      {/* ══ 경매장 — 포인트 코인 무대 (최근 5개) ══ */}
      {!(adminMode && isAdmin) && (
      <section className="relative w-full pt-24 md:pt-32 pb-16 px-6 overflow-hidden">
        <div className="relative z-10 max-w-6xl mx-auto">
          {/* 제목 — 가운데 '포인트 경매', 뒤에 POINT / AUCTION */}
          <div className="relative flex flex-col items-center mb-16 md:mb-20">
            <div className="auc-ghost" aria-hidden>
              <span className="g1">POINT</span>
              <span className="g2">AUCTION</span>
            </div>
            <h1 className="auc-in relative text-[2.5rem] md:text-[4.4rem] font-black leading-none tracking-[0.28em] pl-[0.28em] md:tracking-[0.4em] md:pl-[0.4em] text-white">
              포인트 경매
            </h1>
          </div>

          {isLoading ? (
            <p className="text-center py-24 text-sm text-gray-600">불러오는 중…</p>
          ) : recent.length === 0 ? (
            <div className="auc-in flex flex-col items-center py-16">
              <div className="auc-ticket auc-ticket-focus" style={{ position: "relative", cursor: "default", transform: "none", opacity: 1 }}>
                <div className="auc-half auc-half-l">
                  <div className="absolute inset-0 flex items-center justify-center"><p className="auc-label text-gray-600">No Ticket</p></div>
                </div>
                <div className="auc-half auc-half-r" />
                <span className="auc-perf" />
              </div>
              <p className="mt-12 text-sm text-gray-500">{isAdmin ? "아래에서 첫 경매를 개최해보세요." : "대회 시즌이 시작되면 이곳에서 경매가 열립니다."}</p>
            </div>
          ) : (
            <>
              {/* 티켓 무대 — 초대장이 겹쳐 놓인 형태 */}
              <div className="auc-stage auc-in" style={{ animationDelay: "120ms" }}>
                {recent.map((a, i) => {
                  const off = i - focus;
                  if (Math.abs(off) > 2) return null;
                  const isCenter = off === 0;
                  const isLive = a.status === "진행중";
                  const isEnd = a.status === "종료";
                  return (
                    <div
                      key={a._id}
                      onClick={() => (isCenter ? enter(a._id, isEnd) : setFocus(i))}
                      className={`auc-ticket ${isCenter ? "auc-ticket-focus" : ""} ${isLive && isCenter ? "auc-ticket-live" : ""} ${isEnd ? "auc-ticket-closed" : ""} ${tearing === a._id ? "auc-ticket-tear" : ""}`}
                      style={{ ["--off" as any]: off, zIndex: tearing === a._id ? 40 : 10 - Math.abs(off) }}
                    >
                      {/* 본권 */}
                      <div className="auc-half auc-half-l">
                        <span className="auc-shine" />
                        <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-6">
                          <div className="flex items-center gap-2">
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                            <span className={`auc-label ${isLive ? "text-white" : "text-gray-500"}`}>
                              {isLive ? "Live Now" : isEnd ? "Closed" : "Ready"}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <p className="auc-label text-gray-600 mb-1.5">Invitation</p>
                            <p className="text-base md:text-xl font-black text-white leading-snug break-keep truncate">
                              {a.game || "경매"}
                            </p>
                          </div>

                          {/* 티켓 정보란 — 좌석표처럼 */}
                          <div className="flex items-end gap-5">
                            <div>
                              <p className="auc-label text-gray-600 mb-1">Teams</p>
                              <p className="auc-num text-xl font-black text-white leading-none">{String(a.leaderCount).padStart(2, "0")}</p>
                            </div>
                            <span className="w-px h-7 bg-white/12 mb-0.5" />
                            <div>
                              <p className="auc-label text-gray-600 mb-1">Players</p>
                              <p className="auc-num text-xl font-black text-white leading-none">{String(a.playerCount).padStart(2, "0")}</p>
                            </div>
                          </div>
                        </div>
                        {isEnd && isCenter && <span className="auc-seal">CLOSED</span>}
                      </div>

                      {/* 절취 스텁 */}
                      <div className="auc-half auc-half-r">
                        <span className="auc-shine" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
                          <p className="auc-label text-gray-500 leading-[1.6] text-center">Admit<br />One</p>
                          <span className="w-6 h-px bg-white/15" />
                          <p className="auc-label text-gray-700 auc-num">
                            {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      {/* 절취선 */}
                      <span className="auc-perf" />
                    </div>
                  );
                })}
              </div>

              {/* 중앙 경매 — 제목 + 진입 */}
              {(() => {
                const a: any = recent[focus];
                if (!a) return null;
                const isLive = a.status === "진행중";
                const isEnd = a.status === "종료";
                return (
                  <div key={a._id} className="auc-in mt-10 flex flex-col items-center text-center">
                    <h2 className={`text-2xl md:text-4xl font-black leading-snug break-keep max-w-3xl ${isEnd ? "text-gray-500" : "text-white"}`}>
                      {a.title}
                    </h2>

                    <button
                      onClick={() => enter(a._id, isEnd)}
                      disabled={!!tearing}
                      className={`group mt-8 inline-flex items-center gap-3 px-9 py-4 transition-colors disabled:opacity-60 ${isLive ? "bg-white text-black hover:bg-gray-200" : "border border-white/25 text-gray-300 hover:bg-white hover:text-black"}`}
                    >
                      <span className="auc-label">{isLive ? "지금 입장" : isEnd ? "결과 보기" : "경매장 보기"}</span>
                      <span className="text-base leading-none transition-transform group-hover:translate-x-1">→</span>
                    </button>

                    {recent.length > 1 && (
                      <div className="flex items-center gap-2 mt-10">
                        {recent.map((x, i) => (
                          <button key={x._id} onClick={() => setFocus(i)} aria-label={`${i + 1}번째 경매`}
                            className={`h-[3px] transition-all ${i === focus ? "w-6 bg-white" : "w-[3px] bg-white/25 hover:bg-white/60"}`} />
                        ))}
                      </div>
                    )}

                    {isAdmin && (
                      <div className="mt-6 flex items-center justify-center gap-4">
                        <button onClick={() => togglePrivate(a._id, !a.isPrivate)} disabled={togglingId === a._id}
                          className={`auc-label transition-colors disabled:opacity-40 ${a.isPrivate ? "text-[#e91e3f] hover:text-white" : "text-gray-800 hover:text-white"}`}>
                          {a.isPrivate ? "비공개 · 공개로 전환" : "공개 · 비공개로 전환"}
                        </button>
                        <button onClick={() => setRenameTarget({ id: a._id, title: a.title })} className="auc-label text-gray-800 hover:text-white transition-colors">제목 수정</button>
                        <button onClick={() => setDeleteId(a._id)} className="auc-label text-gray-800 hover:text-red-400 transition-colors">삭제</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {isAdmin && (
            <div className="mt-16 flex justify-center">
              <Link href="/auction?admin=1" className="auc-label text-gray-500 hover:text-white border-b border-white/15 hover:border-white pb-1 transition-colors">
                + 경매 개최
              </Link>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ══ 지난 경매 — 스크롤하면 부드럽게 올라온다 ══ */}
      {!(adminMode && isAdmin) && past.length > 0 && (
        <section className="w-full px-6 pb-4">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <div className="flex items-center gap-4 mb-2">
                <span className="auc-label text-gray-600">지난 경매</span>
                <span className="h-px flex-1 bg-white/10" />
                <span className="auc-label text-gray-700 auc-num">{past.length}</span>
              </div>
            </Reveal>
            {past.map((a, i) => (
              <Reveal key={a._id} delay={Math.min(i, 8) * 70}>
                <div
                  onClick={() => router.push(`/auction/${a._id}`)}
                  className="auc-past group cursor-pointer border-b border-white/[0.07] py-5 flex items-center gap-5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/15 shrink-0 group-hover:bg-white transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-gray-300 truncate group-hover:text-white transition-colors">{a.title}</p>
                    <p className="auc-label text-gray-700 mt-1.5">
                      {a.game || "경매"} · 팀 {a.leaderCount} · 선수 {a.playerCount}
                    </p>
                  </div>
                  <span className="auc-label text-gray-700 shrink-0 hidden sm:block auc-num">
                    {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                  </span>
                  <svg className="w-4 h-4 text-gray-800 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}


      <div className="w-full max-w-6xl mx-auto px-6 pt-10 pb-16 flex-1 flex flex-col space-y-8">

        {/* 생성 폼 */}
        {showCreate && (
          <Reveal>
          <form onSubmit={handleCreate} className="relative">
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg md:text-xl font-black text-white tracking-tight">경매 개최</h3>
                {/* 📌 관리자 테스트 도구 */}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setIsTest(!isTest)} className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-all ${isTest ? "bg-amber-500/15 text-amber-400 border-amber-500/35" : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"}`}>
                    {isTest ? "🧪 테스트 방" : "테스트 방 아님"}
                  </button>
                  <button type="button" onClick={() => setIsPrivate(!isPrivate)} className={`text-[11px] font-black px-3 py-1.5 rounded-full border transition-all ${isPrivate ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/35" : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"}`}>
                    {isPrivate ? "비공개" : "공개"}
                  </button>
                  <button type="button" onClick={fillTestData} className="text-[11px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full hover:bg-amber-500/20 transition-colors">
                    테스트 데이터 자동 입력
                  </button>
                </div>
              </div>

              <SectionHead no="01" title="기본 정보" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">경매 제목 <span className="text-[#e91e3f]">*</span></label>
                  <input type="text" required placeholder="예: 제 1회 종합 e스포츠 대회 경매" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
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
                    <div key={i} className="flex items-center gap-1.5 bg-transparent border-b border-white/10 px-2 py-1.5">
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
                <SectionHead no="02" title="경매 룰 설정" />
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
                    { k: "invCapacity", l: "인벤토리 용량(칸)" },
                    { k: "invPlusCost", l: "인벤토리 플러스" },
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
                <div className="flex items-baseline gap-4 mb-2">
                  <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-base md:text-lg font-black text-white tracking-tight">리더 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({leaders.filter(l => l.name.trim()).length}명)</span></label>
                  <button type="button" onClick={() => setLeaders([...leaders, { name: "", position: "", discordId: "" }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">리더 추가</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {leaders.map((l, i) => (
                    <div key={i} className="relative rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-white/20 transition-colors">
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
                <div className="flex items-baseline gap-4 mb-2">
                  <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">04</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-base md:text-lg font-black text-white tracking-tight">선수 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({players.filter(p => p.alias.trim()).length}명)</span></label>
                  <div className="flex gap-2">
                    <button type="button" onClick={openSurveyPicker} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">설문에서 불러오기</button>
                    <button type="button" onClick={rollAllNicks} className="text-[11px] font-black text-gray-400 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full hover:text-white hover:border-white/25 transition-colors">전체 랜덤 닉네임</button>
                    <button type="button" onClick={() => setPlayers([...players, { alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", mostChampions: [""], isAllPos: false }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">선수 추가</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {players.map((p, i) => (
                    <div key={i} className={`relative rounded-xl border p-4 transition-colors ${p.isAllPos ? "border-[#e91e3f]/35 bg-[#e91e3f]/[0.04]" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">Player {String(i + 1).padStart(2, "0")}</span>
                        <div className="flex items-center gap-2.5">
                          <button type="button" onClick={() => promoteToLeader(i)} title="이 선수를 리더로" className="text-[10px] font-black px-2.5 py-1 rounded-full border border-white/15 text-gray-400 hover:text-white hover:border-white/35 transition-colors">리더로</button>
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

      </div>

      {/* 경매 제목 수정 */}
      {renameTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4" onClick={() => setRenameTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#121212] border border-white/12 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-black text-white mb-1.5">경매 제목 수정</h2>
            <p className="text-[11px] text-gray-500 mb-6">경매 목록과 경매장 상단에 표시되는 이름입니다.</p>
            <input
              value={renameTarget.title}
              autoFocus
              maxLength={60}
              onChange={(e) => setRenameTarget({ ...renameTarget, title: e.target.value.slice(0, 60) })}
              onKeyDown={(e) => { if (e.key === "Enter") renameAuction(); }}
              placeholder="경매 제목"
              className="w-full bg-transparent border-0 border-b border-white/20 focus:border-white/60 px-0 py-2.5 text-base font-black text-white outline-none transition-colors placeholder:text-gray-700 placeholder:font-bold"
            />
            <p className="auc-label text-gray-700 mt-2 text-right">{renameTarget.title.length}/60</p>
            <div className="flex gap-3 mt-7">
              <button onClick={() => setRenameTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">취소</button>
              <button onClick={renameAuction} disabled={!renameTarget.title.trim() || isRenaming}
                className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
                {isRenaming ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── 설문에서 선수 불러오기 ── */}
      {showSurveyPicker && (
        <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setShowSurveyPicker(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-[#121212] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="shrink-0 px-6 py-4 border-b border-white/[0.07]">
              <h2 className="text-base font-black text-white tracking-tight">설문에서 선수 불러오기</h2>
              <p className="text-[11px] text-gray-500 mt-1 break-keep">
                참가 설문을 받은 대회를 고르면 응답을 선수 카드로 옮깁니다. 닉네임·티어·포지션·모스트는 질문 문구를 보고 자동으로 맞춥니다.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden divide-y divide-white/[0.06]">
              {surveyPosts.length === 0 ? (
                <p className="px-6 py-12 text-center text-xs text-gray-500 break-keep">참가 설문을 받은 대회가 없습니다.</p>
              ) : (
                surveyPosts.map((p) => (
                  <button key={p._id} type="button" disabled={isImporting || p.responses === 0}
                    onClick={() => importSurvey(p._id)}
                    className={`w-full text-left px-6 py-4 flex items-center gap-3 transition-colors ${p.responses === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-white/[0.03]"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-white truncate">{p.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {new Date(p.createdAt).toLocaleDateString("ko-KR")} · 응답 {p.responses}건
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-[#e91e3f] shrink-0">
                      {isImporting ? "불러오는 중" : "불러오기"}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="shrink-0 px-6 py-3 border-t border-white/[0.07] flex justify-end">
              <button type="button" onClick={() => setShowSurveyPicker(false)}
                className="px-5 py-2 rounded-full bg-[#2a2a2a] hover:bg-[#333] text-white text-[12px] font-bold transition-colors">닫기</button>
            </div>
          </div>
        </div>
      )}
      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
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
