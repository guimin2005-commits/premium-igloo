"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LuxStyles } from "../../components/Lux";
import { AuctionStyles } from "../../components/AuctionStyles";
import { roleNames, totalSlots as totalSlotsFn, slotLimitOf as slotLimitOfFn, phase1RoleOf } from "@/lib/auctionGames";

const ADMIN_USERS = ["elahw.06"];
const POLL_MS = 1500;

// 확성기 SVG
const MegaphoneIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73" />
  </svg>
);

// 📌 중요도 높은 시스템 공지 — 채팅에서 레드로 구분한다 (서버 스키마 변경 없이 문구로 판별)
const SYS_HIGH = /(낙찰|유찰|경매를? ?시작|경매가? ?종료|페이즈|올 포지션|전략 타임)/;

// 📌 포지션 표기 — 방 전체에서 영문 약자로 통일 (좌측 레일 / 중앙 슬롯 보드 / 모달 / 스카우터 결과)
const ROLE_ABBR: Record<string, string> = {
  탱커: "TNK", 딜러: "DPS", 힐러: "SUP",
  탑: "TOP", 정글: "JGL", 미드: "MID", 원딜: "ADC", 서폿: "SUP", 서포터: "SUP",
  타격대: "DUE", 척후대: "INI", 감시자: "SEN", 전략가: "CTR",
  스쿼드: "SQD",
};
const roleAbbr = (name: string) => ROLE_ABBR[name] || (/^[A-Za-z]/.test(name) ? name.slice(0, 3).toUpperCase() : name.slice(0, 3));

// 📌 포지션 색상 팔레트 — 역할 순서(index)대로 배정. 오버워치는 기존 색(파랑/레드/그린) 유지
const SLOT_PALETTE = [
  { badge: "bg-blue-500/15 text-blue-400 border-blue-500/25", text: "text-blue-400" },
  { badge: "bg-white/[0.07] text-gray-200 border-white/25", text: "text-gray-200" },
  { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", text: "text-emerald-400" },
  { badge: "bg-amber-500/15 text-amber-400 border-amber-500/25", text: "text-amber-400" },
  { badge: "bg-purple-500/15 text-purple-400 border-purple-500/25", text: "text-purple-400" },
  { badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25", text: "text-cyan-400" },
];

export default function AuctionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);
  const myDiscordId = (session?.user as any)?.id;

  const [auction, setAuction] = useState<any>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [role, setRole] = useState<string>("host");
  const [bidInput, setBidInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  // 📌 서버-클라이언트 시계 차이 보정 (기기 시계가 틀어져도 타이머가 정확하도록)
  const clockSkew = useRef(0);
  const serverNow = () => Date.now() + clockSkew.current;
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(60); // 0~100
  const [notices, setNotices] = useState<any[]>([]); // 📌 내 알림 로그 (스카우터 결과 등, 역할별로 분리)
  const noticeSeq = useRef(0);
  const roleKeyRef = useRef("host"); // 알림 로그 저장 키로 쓰는 현재 역할
  const [goldenFx, setGoldenFx] = useState(false);           // 황금카드 등장 애니메이션
  const [nextFx, setNextFx] = useState<string | null>(null); // 다음 매물 전환 배너
  const [mobileTab, setMobileTab] = useState<"main" | "teams">("main"); // 모바일 섹션 전환 (경매+채팅 통합 / 팀 현황)
  const [invModal, setInvModal] = useState<number | null>(null); // 인벤토리 팝업 대상 리더 idx
  const [dragCard, setDragCard] = useState<number | null>(null); // 드래그 중인 인벤토리 카드 idx
  const [assignWarn, setAssignWarn] = useState<{ invIdx: number; slot: string; name: string } | null>(null); // 최초 1회 배정 경고
  const warnedRef = useRef(false); // 배정 불가역 경고를 이미 봤는지
  const draggingRef = useRef(false); // 드래그 직후 클릭으로 선택이 풀리는 것 방지
  const [swapMode, setSwapMode] = useState(false);        // 인벤토리 내 포지션 체인지 모드
  const [swapPick, setSwapPick] = useState<number[]>([]); // 교환할 roster 인덱스 2개
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [confirmCfg, setConfirmCfg] = useState<any>(null); // {title, message, confirmLabel, onConfirm}
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [posSwapTarget, setPosSwapTarget] = useState<any>(null); // {leaderIdx} 포지션 체인지 모달
  const [swapA, setSwapA] = useState(""); const [swapB, setSwapB] = useState("");
  const [moveFrom, setMoveFrom] = useState<number | null>(null); // 오버플로우: 이동할 선수 rosterIdx
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set()); // 팀 레일 펼침 상태
  const [adjustTarget, setAdjustTarget] = useState<number | null>(null); // 포인트 조정 모달 (leaderIdx)
  const [adjustAmount, setAdjustAmount] = useState("");
  const [posSetTarget, setPosSetTarget] = useState<number | null>(null); // 리더 포지션 지정 모달

  const [showSystemChat, setShowSystemChat] = useState(true); // 채팅의 공지 표시 on/off
  const [noticeOpen, setNoticeOpen] = useState(false);        // 알림함 모달
  const [noticeUnread, setNoticeUnread] = useState(0);        // 안 읽은 알림 수
  const [scoutFx, setScoutFx] = useState<any>(null);          // 스카우터 결과 즉시 팝업 (자동 소멸)
  const [revealFx, setRevealFx] = useState(false); // 프로필 공개 연출 표시 중인지 (시간 제한)
  const revealSeen = useRef<number | null>(null);  // 이미 띄운 공개 대상
  const chatScrolledOnce = useRef(false);          // 첫 채팅 렌더에서 맨 아래로 내렸는지
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const lastChatAt = useRef<string | null>(null);
  const chatIds = useRef<Set<string>>(new Set());
  const chatCooldown = useRef(0);
  const pollBusy = useRef(false);
  // 폴링에서 현재 역할(리더 인덱스)을 참조 — 스카우터 정보 수신용
  const roleRef = useRef<number | null>(null);
  const autoRoleDone = useRef(false);
  const prevState = useRef<{ price: number; playerIdx: any; soldCount: number; lastTick: number }>({ price: 0, playerIdx: null, soldCount: 0, lastTick: 0 });
  const audioCtx = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(true);
  const volumeRef = useRef(60);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { volumeRef.current = volume; try { localStorage.setItem("auctionVolume", String(volume)); } catch {} }, [volume]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("auctionVolume");
      if (saved !== null) setVolume(Math.min(100, Math.max(0, Number(saved))));
      const sys = localStorage.getItem("auctionShowSystemChat");
      if (sys !== null) setShowSystemChat(sys === "1");
    } catch {}
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  // 📌 알림 로그 — 역할(리더)별로 분리 저장, 새로고침해도 유지
  const noticeKey = (r: string) => `auctionNotices:${id}:${r}`;
  // rows[].pos 에는 색상 판별용 '한글 포지션명'이 들어간다 (표시값 v 는 영문 약자)
  const pushNotice = (n: { kind: string; title: string; body?: string; rows?: { l: string; v: string; pos?: string }[] }) => {
    const nid = ++noticeSeq.current;
    setNotices((prev) => {
      const next = [{ ...n, id: nid, at: new Date().toISOString() }, ...prev].slice(0, 50);
      setNoticeUnread((u) => u + 1);
      try { localStorage.setItem(noticeKey(roleKeyRef.current), JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── 사운드 (적당한 볼륨의 신스 톤) ──
  const playTone = useCallback((freq: number, dur = 0.08, baseGain = 0.04, type: OscillatorType = "sine") => {
    if (!soundOnRef.current || volumeRef.current <= 0) return;
    const gain = baseGain * (volumeRef.current / 60); // 볼륨 60 = 기준 음량
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);
  // 📌 노이즈 버스트 — 나무 타격음처럼 '음정 없는' 소리는 오실레이터로 못 만든다.
  //    화이트 노이즈를 밴드패스로 깎아 타격 순간의 파열음을 만든다.
  const playNoise = useCallback((dur: number, baseGain: number, freq: number, q = 1) => {
    if (!soundOnRef.current || volumeRef.current <= 0) return;
    const gain = baseGain * (volumeRef.current / 60);
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch {}
  }, []);

  const sfxBid = useCallback(() => playTone(760, 0.07, 0.035), [playTone]);
  // 다음 매물 호명 — 리더들이 바로 인지하도록 또렷한 3음 차임
  const sfxCall = useCallback(() => { playTone(523, 0.11, 0.05); setTimeout(() => playTone(659, 0.11, 0.05), 120); setTimeout(() => playTone(988, 0.2, 0.055), 240); }, [playTone]);
  // 낙찰 — 의사봉 하나로 통일. 기존 축하 아르페지오(sfxSold)는 의사봉과 겹쳐 폐기.
  // 낙찰 선언 — 실제 경매 의사봉 소리 (탁·탁·탁)
  //  나무 타격은 '음정'이 아니라 파열음이므로 노이즈 버스트가 핵심이고,
  //  그 위에 받침대가 울리는 저역 몸통을 얹어 나무 느낌을 만든다.
  const sfxHammer = useCallback(() => {
    const knock = (t: number, power: number) =>
      setTimeout(() => {
        playNoise(0.014, 0.30 * power, 3600, 0.7);          // 타격 순간의 딱딱한 어택
        playNoise(0.055, 0.20 * power, 1500, 1.0);          // 나무 표면이 갈라지는 소리
        playTone(215, 0.085, 0.10 * power, "triangle");     // 받침대 몸통 울림
        playTone(104, 0.13, 0.085 * power, "sine");         // 저역 쿵
      }, t);
    knock(0, 0.92);
    knock(195, 0.96);
    knock(395, 1.12); // 마지막 한 방이 가장 세게 — 낙찰 확정
  }, [playTone, playNoise]);
  // 스카우터 결과 (신비로운 차임)
  const sfxScout = useCallback(() => { playTone(880, 0.1, 0.035, "triangle"); setTimeout(() => playTone(1175, 0.14, 0.04, "triangle"), 110); setTimeout(() => playTone(1568, 0.2, 0.035, "triangle"), 240); }, [playTone]);
  // 인벤토리 → 슬롯 배정 (카드가 '착' 꽂히는 느낌)
  const sfxAssign = useCallback(() => { playTone(392, 0.06, 0.045, "triangle"); setTimeout(() => playTone(659, 0.09, 0.05, "triangle"), 70); setTimeout(() => playTone(988, 0.14, 0.035), 150); }, [playTone]);
  // 카드 선택(집기) — 짧은 틱
  const sfxSelect = useCallback(() => playTone(880, 0.04, 0.025, "triangle"), [playTone]);
  // 황금카드 소환 — 딜러가 카드를 뿌리는 소리에 맞춘 구성
  //  리플(카드 훑기) → 한 장이 날아오는 휘파람 → 테이블에 꽂히는 스냅 → 금속 벨 팡파레 → 잔향
  //  (이전의 드론·심장박동 계열은 폐기)
  const sfxGolden = useCallback(() => {
    // 1) 리플 — 덱을 촤르르 훑는 소리 (짧은 노이즈성 틱을 촘촘히)
    for (let i = 0; i < 22; i++) {
      setTimeout(() => playTone(2600 + Math.random() * 1400, 0.012, 0.016, "square"), 60 + i * 26);
    }
    // 2) 두 번째 리플 — 더 빠르고 낮게
    for (let i = 0; i < 16; i++) {
      setTimeout(() => playTone(1700 + Math.random() * 900, 0.011, 0.013, "square"), 700 + i * 19);
    }
    // 3) 카드 한 장이 공기를 가르며 날아온다 (상승 휘파람)
    [520, 620, 740, 880, 1050, 1260, 1500].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.09, 0.02, "triangle"), 1250 + i * 105)
    );
    // 4) 착지 스냅 — 테이블에 '탁' 꽂히는 순간 (2.05초, 애니메이션 착지와 일치)
    setTimeout(() => {
      playTone(150, 0.07, 0.09, "square");   // 타격
      playTone(70, 0.20, 0.075, "sine");     // 저역 울림
      playTone(3200, 0.035, 0.03, "square"); // 종이 스냅
    }, 2050);
    // 5) 금속 벨 팡파레 — 스냅 직후 화음이 열린다
    setTimeout(() => { playTone(523, 0.7, 0.05, "triangle"); playTone(659, 0.7, 0.042, "triangle"); playTone(784, 0.75, 0.038, "triangle"); }, 2130);
    setTimeout(() => playTone(1047, 0.9, 0.045, "triangle"), 2320);
    // 6) 잔향 — 높은 배음이 천천히 흩어진다
    [1568, 2093, 2637].forEach((f, i) => setTimeout(() => playTone(f, 0.7, 0.018, "sine"), 2600 + i * 190));
  }, [playTone]);
  const sfxTick = useCallback(() => playTone(1050, 0.05, 0.03, "square"), [playTone]);
  const sfxPass = useCallback(() => { playTone(440, 0.12, 0.035); setTimeout(() => playTone(330, 0.18, 0.035), 130); }, [playTone]);
  const sfxAllin = useCallback(() => { playTone(392, 0.09, 0.04); setTimeout(() => playTone(523, 0.09, 0.04), 90); setTimeout(() => playTone(659, 0.09, 0.045), 180); setTimeout(() => playTone(784, 0.2, 0.05), 270); }, [playTone]);
  const sfxReveal = useCallback(() => { playTone(523, 0.12, 0.04); setTimeout(() => playTone(659, 0.12, 0.04), 130); setTimeout(() => playTone(1047, 0.28, 0.045), 260); }, [playTone]);
  const sfxStrategy = useCallback(() => { playTone(880, 0.25, 0.03, "triangle"); setTimeout(() => playTone(660, 0.3, 0.025, "triangle"), 260); }, [playTone]);
  // 경매 시작 팡파레 (도-미-솔-도 상승)
  const sfxStart = useCallback(() => { [262, 330, 392, 523].forEach((f, i) => setTimeout(() => playTone(f, 0.14, 0.045), i * 120)); setTimeout(() => playTone(784, 0.35, 0.05), 500); }, [playTone]);
  // 경매 종료 (장엄한 하강 마무리)
  const sfxEnd = useCallback(() => { [784, 659, 523].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 0.045), i * 160)); setTimeout(() => playTone(392, 0.5, 0.05), 500); }, [playTone]);
  // 페이즈 전환 (두 번 울리는 공)
  const sfxPhase = useCallback(() => { playTone(440, 0.3, 0.04, "triangle"); setTimeout(() => playTone(554, 0.4, 0.045, "triangle"), 320); }, [playTone]);
  // 5초 경고 (긴박한 이중음)
  const sfxWarn = useCallback(() => { playTone(988, 0.08, 0.04, "square"); setTimeout(() => playTone(880, 0.08, 0.04, "square"), 90); }, [playTone]);
  // 타임업 버저
  const sfxTimeUp = useCallback(() => { playTone(220, 0.35, 0.05, "sawtooth"); }, [playTone]);
  // 채팅 수신 (아주 미세한 블립)
  // 채팅 수신 — 기존 값(0.04초·gain 0.015)은 다른 효과음에 묻혀 사실상 들리지 않아 두 음의 짧은 블립으로 교체
  const sfxChat = useCallback(() => { playTone(660, 0.05, 0.03, "triangle"); setTimeout(() => playTone(880, 0.06, 0.026, "triangle"), 55); }, [playTone]);
  // 채팅 전송 — 내가 보낸 메시지는 폴링에서 중복 제거되어 수신음이 울리지 않으므로 별도로 짧게
  const sfxChatSend = useCallback(() => playTone(1046, 0.05, 0.022, "triangle"), [playTone]);

  // ── 폴링 (중복 방지: in-flight 가드 + 메시지 _id 중복 제거) ──
  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    const poll = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        // as=리더인덱스 — 디스코드 ID 미등록 리더가 본인 스카우터 정보를 받기 위한 힌트
        const qs = new URLSearchParams();
        if (lastChatAt.current) qs.set("chatSince", lastChatAt.current);
        if (roleRef.current !== null) qs.set("as", String(roleRef.current));
        const url = `/api/auction/${id}${qs.toString() ? `?${qs.toString()}` : ""}`;
        const t0 = Date.now();
        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();
        if (!alive || !d.success) return;

        // 📌 서버 시각 기준으로 시계 차이 보정 (왕복 지연의 절반 보정)
        if (d.now) {
          const rtt = Date.now() - t0;
          clockSkew.current = new Date(d.now).getTime() + rtt / 2 - Date.now();
        }

        // 사운드 트리거 (상태 변화 감지)
        const a = d.auction;
        const soldCount = a.players.filter((p: any) => p.status === "낙찰").length;
        const passCount = a.players.filter((p: any) => p.status === "유찰").length;
        const revealIdx = a.reveal?.playerIdx ?? null;
        const strategyOn = !!(a.strategyUntil && new Date(a.strategyUntil).getTime() > Date.now() + clockSkew.current);
        const ps: any = prevState.current;

        if (ps.playerIdx !== a.current.playerIdx && a.current.playerIdx !== null) {
          // 황금카드 호명 → 전원 화면에 등장 애니메이션 + 전용 사운드
          if (a.players[a.current.playerIdx]?.isAllPos) {
            sfxGolden();
            setGoldenFx(true);
            setTimeout(() => setGoldenFx(false), 4300);
          } else {
            sfxCall();
            // 다음 매물 전환 배너 (리더 즉시 인지용)
            setNextFx(a.players[a.current.playerIdx]?.alias || "");
            setTimeout(() => setNextFx(null), 2200);
          }
        }
        else if (a.current.price > ps.price && a.current.playerIdx === ps.playerIdx) {
          if (a.current.isAllin) sfxAllin(); else sfxBid();
        }
        // 🔨 낙찰 = 의사봉. 낙찰 경로가 두 가지라 한쪽만 보면 소리가 안 난다.
        //   · instant 모드 : host:sold → pendingAssign(배정 대기) 생성 → 이때가 낙찰 선언
        //   · inventory 모드 / 1페이즈 자동배정 : pendingAssign 없이 바로 status="낙찰"
        //   두 경로에서 각각 한 번씩만 울리도록 hammered 로 중복을 막는다.
        const paIdx = a.pendingAssign?.playerIdx ?? null;
        if (paIdx !== null && paIdx !== (ps.paIdx ?? null)) {
          sfxHammer();
          ps.hammered = paIdx; // 뒤이어 soldCount 가 올라도 다시 울리지 않게
        }
        if (soldCount > (ps.soldCount || 0)) {
          if (ps.hammered === null || ps.hammered === undefined) sfxHammer();
          ps.hammered = null;
        }
        if (passCount > (ps.passCount || 0)) sfxPass();
        if (revealIdx !== null && revealIdx !== ps.revealIdx) sfxReveal();
        if (strategyOn && !ps.strategyOn) sfxStrategy();
        if (ps.status === "준비중" && a.status === "진행중") sfxStart();
        if (ps.status === "진행중" && a.status === "종료") sfxEnd();
        if ((ps.phase ?? 0) < a.phase) sfxPhase();
        prevState.current = { ...ps, price: a.current.price, playerIdx: a.current.playerIdx, soldCount, passCount, revealIdx, strategyOn, status: a.status, phase: a.phase, paIdx };

        setAuction(a);
        if (d.chat?.length) {
          const fresh = d.chat.filter((m: any) => !chatIds.current.has(m._id));
          if (fresh.length) {
            fresh.forEach((m: any) => chatIds.current.add(m._id));
            if (fresh.some((m: any) => !m.isSystem)) sfxChat();
            setChat((prev) => [...prev, ...fresh].slice(-150));
            lastChatAt.current = d.chat[d.chat.length - 1].createdAt;
          }
        }
      } catch {} finally { pollBusy.current = false; }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [id, status, sfxBid, sfxCall, sfxPass, sfxAllin, sfxReveal, sfxStrategy, sfxStart, sfxEnd, sfxPhase, sfxChat, sfxGolden, sfxHammer]);

  // 📌 역할이 바뀌면 해당 역할의 알림 로그로 교체 (다른 리더의 알림이 남지 않도록)
  useEffect(() => {
    roleKeyRef.current = role;
    try {
      const saved = JSON.parse(localStorage.getItem(`auctionNotices:${id}:${role}`) || "[]");
      setNotices(Array.isArray(saved) ? saved : []);
    } catch { setNotices([]); }
  }, [role, id]);

  // 타이머 시계 + 마감 임박 사운드 (5초 경고 → 3·2·1 틱 → 타임업 버저)
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      const endsAt = auction?.current?.endsAt ? new Date(auction.current.endsAt).getTime() : null;
      if (endsAt) {
        const left = Math.ceil((endsAt - (Date.now() + clockSkew.current)) / 1000);
        if (left !== prevState.current.lastTick) {
          const prev = prevState.current.lastTick;
          prevState.current.lastTick = left;
          if (left === 5) sfxWarn();
          else if (left >= 1 && left <= 3) sfxTick();
          else if (left <= 0 && prev === 1) sfxTimeUp();
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [auction, sfxTick, sfxWarn, sfxTimeUp]);

  // 📌 모바일 — 내 팀에 배정/정리가 필요해지면 '경매' 탭(내 팀 콘솔이 있는 곳)으로 자동 전환
  //   리더의 슬롯 보드는 이제 좌측 레일이 아닌 중앙 콘솔에만 있으므로, 팀 현황 탭에 머물러 있으면 놓칠 수 있다
  useEffect(() => {
    if (!auction) return;
    const mi = role === "host" || role === "spec" ? null : Number(role);
    if (mi === null) return;
    const pAssign = auction.pendingAssign;
    const pOver = auction.pendingOverflow;
    const needMe =
      (pAssign?.playerIdx !== null && pAssign?.playerIdx !== undefined && pAssign?.leaderIdx === mi) ||
      (pOver?.leaderIdx !== null && pOver?.leaderIdx !== undefined && pOver?.leaderIdx === mi);
    if (needMe) setMobileTab("main");
  }, [auction, role]);

  // 채팅 자동 스크롤 — 채팅 박스 내부만 스크롤 (페이지 스크롤 강제 이동 방지)
  //  🐛 입장·새로고침 직후에는 스크롤이 맨 위(0)라 nearBottom 판정이 false → 과거 메시지가 보인 채로 멈췄다.
  //     첫 렌더에서는 조건 없이 맨 아래로 내린다.
  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box || chat.length === 0) return;
    if (!chatScrolledOnce.current) {
      chatScrolledOnce.current = true;
      box.scrollTop = box.scrollHeight;
      return;
    }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [chat.length]);

  // 📌 프로필 공개 화면은 '연출'이므로 잠시만 — 서버의 auction.reveal 은 계속 남아 있어
  //    그대로 두면 경매가 끝나도 무대에 공개 화면이 박혀 '경매 종료'가 나오지 않는다. (버그)
  useEffect(() => {
    const idx = auction?.reveal?.playerIdx;
    if (idx === null || idx === undefined) { setRevealFx(false); return; }
    if (revealSeen.current === idx) return; // 이미 보여준 공개는 다시 띄우지 않는다
    revealSeen.current = idx;
    setRevealFx(true);
    const t = setTimeout(() => setRevealFx(false), 9000);
    return () => clearTimeout(t);
  }, [auction?.reveal?.playerIdx]);

  // 디스코드 프로필 로드 (리더 + 공개된 선수)
  useEffect(() => {
    if (!auction) return;
    const ids = new Set<string>();
    auction.leaders.forEach((l: any) => { if (l.discordId) ids.add(l.discordId); });
    auction.players.forEach((p: any) => { if (p.revealed && p.discordId) ids.add(p.discordId); });
    ids.forEach((did) => {
      if (profiles[did]) return;
      fetch(`/api/discord-user?id=${did}`)
        .then((r) => r.json())
        .then((u) => { if (u.success) setProfiles((prev) => ({ ...prev, [did]: u })); })
        .catch(() => {});
    });
  }, [auction]); // eslint-disable-line

  // 접속 유저 디스코드 ID가 리더과 일치하면 자동으로 해당 리더 화면 지정
  useEffect(() => {
    if (!auction || autoRoleDone.current) return;
    const idx = myDiscordId ? auction.leaders.findIndex((l: any) => l.discordId && l.discordId === myDiscordId) : -1;
    const admin = session?.user?.name && ADMIN_USERS.includes(session.user.name);
    if (idx >= 0) { setRole(String(idx)); autoRoleDone.current = true; }
    else if (!admin && session) { setRole("spec"); autoRoleDone.current = true; } // 미등록 유저 → 관전자
  }, [auction, myDiscordId, session]);

  const act = async (payload: any) => {
    try {
      const res = await fetch(`/api/auction/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.success && d.message) showToast(d.message);
      return d;
    } catch {
      showToast("서버 통신 오류");
      return { success: false };
    }
  };

  // 📌 입장 알림 — 세션당 1회만 전송
  useEffect(() => {
    if (!auction || status !== "authenticated" || !session?.user?.name) return;
    const key = `auctionJoined:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    act({ action: "enter", userName: session.user.name });
  }, [auction ? id : null, status]); // eslint-disable-line

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    if (Date.now() - chatCooldown.current < 2000) { showToast("도배 방지: 2초에 한 번만 보낼 수 있어요"); return; }
    chatCooldown.current = Date.now();
    setChatInput("");
    const d = await act({ action: "chat", message: msg, userName: session?.user?.name, avatar: session?.user?.image || "" });
    // 📌 폴링(1.5초) 대기 없이 즉시 표시 — _id를 등록해 폴링 중복 방지
    if (d?.success && d.message?._id) {
      if (!chatIds.current.has(d.message._id)) {
        chatIds.current.add(d.message._id);
        sfxChatSend();
        setChat((prev) => [...prev, d.message].slice(-150));
        if (!lastChatAt.current || new Date(d.message.createdAt) > new Date(lastChatAt.current)) {
          lastChatAt.current = d.message.createdAt;
        }
      }
    } else if (d?.message && typeof d.message === "string") showToast(d.message);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">로그인 필요</h2>
        <p className="text-gray-400 text-sm mb-4">경매장 입장을 위해 디스코드 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }
  if (!auction) return <div className="min-h-[60vh] flex items-center justify-center text-gray-700 text-xs font-black tracking-[0.3em] uppercase">Admit One</div>;

  // 📌 입장 권한: 관리자(진행자) / 등록된 리더 / 그 외 로그인 유저는 관전자로 입장
  //  · 실제 시점 판별은 아래 role 기반(isSpec/isThird) — 관리자는 시점을 자유 전환할 수 있다

  const S = auction.settings;
  const roleList: string[] = roleNames(S);
  const p1Role: string = phase1RoleOf(S);
  const totalSlots = totalSlotsFn(S);
  const roleColor = (name: string) => SLOT_PALETTE[Math.max(0, roleList.indexOf(name)) % SLOT_PALETTE.length];
  const invMode = S.assignMode === "inventory"; // 인벤토리 방식
  const revealFields: string[] = Array.isArray(S.reveal) ? S.reveal : ["mainPos", "subPos"];
  const cur = auction.current;
  const curPlayer = cur.playerIdx !== null ? auction.players[cur.playerIdx] : null;
  const curLeader = cur.leaderIdx !== null ? auction.leaders[cur.leaderIdx] : null;
  const myLeaderIdx = role === "host" || role === "spec" ? null : Number(role);
  roleRef.current = myLeaderIdx; // 폴링에서 참조 (스카우터 정보 수신용)
  const myLeader = myLeaderIdx !== null ? auction.leaders[myLeaderIdx] : null;
  // 📌 시점 — 제3자(진행자·관전자)는 모든 팀 프로필을 좌측 레일에, 리더는 본인 프로필을 중앙에 둔다
  const isSpec = role === "spec";
  const isThird = role === "host" || isSpec;
  const railLeaders: { l: any; li: number }[] = auction.leaders
    .map((l: any, li: number) => ({ l, li }))
    .filter(({ li }: any) => isThird || li !== myLeaderIdx);
  const timeLeft = cur.endsAt ? Math.max(0, Math.ceil((new Date(cur.endsAt).getTime() - (now + clockSkew.current)) / 1000)) : null;
  // 스카우터 타임 — 황금카드 연출 중에는 아직 시작 전이므로 설정값 그대로 표시
  const scoutLeftRaw = cur.scoutUntil ? Math.max(0, Math.ceil((new Date(cur.scoutUntil).getTime() - (now + clockSkew.current)) / 1000)) : 0;
  const scoutLeft = goldenFx ? Math.min(scoutLeftRaw, S.scoutSeconds || 7) : scoutLeftRaw;
  const strategyLeft = auction.strategyUntil ? Math.max(0, Math.ceil((new Date(auction.strategyUntil).getTime() - (now + clockSkew.current)) / 1000)) : 0;
  const assignLeft = auction.assignUntil ? Math.max(0, Math.ceil((new Date(auction.assignUntil).getTime() - (now + clockSkew.current)) / 1000)) : 0;

  const pa = auction.pendingAssign;
  const hasPending = pa && pa.playerIdx !== null && pa.playerIdx !== undefined;
  const pendingPlayer = hasPending ? auction.players[pa.playerIdx] : null;
  const pendingLeader = hasPending ? auction.leaders[pa.leaderIdx] : null;
  const iAmAssigner = hasPending && (role === "host" || myLeaderIdx === pa.leaderIdx);
  const isMyPending = hasPending && myLeaderIdx === pa.leaderIdx;

  const po = auction.pendingOverflow;
  const hasOverflow = po && po.leaderIdx !== null && po.leaderIdx !== undefined;
  const overflowLeader = hasOverflow ? auction.leaders[po.leaderIdx] : null;
  const isMyOverflow = hasOverflow && myLeaderIdx === po.leaderIdx;

  const revealPlayer = auction.reveal?.playerIdx !== null && auction.reveal?.playerIdx !== undefined ? auction.players[auction.reveal.playerIdx] : null;
  const revealProfile = revealPlayer?.discordId ? profiles[revealPlayer.discordId] : null;

  // 📌 올 포지션 매물이 무대에 올라와 있는지 — 무대 배경을 골드 그라데이션으로 전환
  const isGoldenLot = !!curPlayer?.isAllPos;
  const basePrice = curPlayer?.isAllPos ? S.goldenBasePrice : S.basePrice;
  const nextMinBid = cur.leaderIdx === null ? basePrice : cur.price + S.minIncrement;

  const slotFilled = (leader: any, slot: string) => leader.roster.filter((r: any) => r.slot === slot).length;
  const slotLimitOf = (slot: string) => slotLimitOfFn(S, slot);
  // 포지션은 낙찰/프로필 공개 후에도 비공개 — 스카우터 사용자 · 진행자 · 경매 종료 시에만 공개
  // 스카우터로 공개되는 정보 문자열 (게임 reveal 설정 기반)
  //  · 황금카드(올 포지션)는 포지션 개념이 없으므로 모스트만 공개
  const revealInfo = (p: any) => {
    const ch = (p.mostChampions || []).filter(Boolean);
    if (p.isAllPos) return ch.length ? `모스트 ${ch.join("  ·  ")}` : "공개 정보 없음";
    const parts: string[] = [];
    if (revealFields.includes("mainPos")) parts.push(`주 ${p.mainPos ? roleAbbr(p.mainPos) : "?"}`);
    if (revealFields.includes("subPos")) parts.push(`부 ${p.subPos ? roleAbbr(p.subPos) : "-"}`);
    if (revealFields.includes("champions") && ch.length) parts.push(`모스트 ${ch.join("  ·  ")}`);
    return parts.join(" / ");
  };
  // 📌 스카우터 공개 정보를 항목별로 — 무대에서 큰 글씨로 나눠 보여주기 위한 구조화 버전
  const revealParts = (p: any): { l: string; v: string; pos?: string }[] => {
    const ch = (p.mostChampions || []).filter(Boolean);
    if (p.isAllPos) return [{ l: "모스트", v: ch.length ? ch.join(" · ") : "없음" }];
    const out: { l: string; v: string; pos?: string }[] = [];
    if (revealFields.includes("mainPos")) out.push({ l: "주 포지션", v: p.mainPos ? roleAbbr(p.mainPos) : "?", pos: p.mainPos || "" });
    if (revealFields.includes("subPos")) out.push({ l: "부 포지션", v: p.subPos ? roleAbbr(p.subPos) : "-", pos: p.subPos || "" });
    if (revealFields.includes("champions")) out.push({ l: "모스트", v: ch.length ? ch.join(" · ") : "없음" });
    return out;
  };
  // 선수별 스카우터 비용 (황금카드 전용가)
  const scoutCostOf = (p: any) => (p?.isAllPos ? (S.goldenScoutCost ?? 4000) : S.scoutCost);
  const canSeePos = (p: any) =>
    role === "host" || auction.status === "종료" || (myLeaderIdx !== null && p.scoutedBy.includes(myLeaderIdx));
  // 리더에게 익명 처리: 대기/경매중이 아닌 선수만 정보 공개 (호명 중엔 메인 카드에 표시)
  const isHiddenFor = (p: any) => role !== "host" && (p.status === "대기" || p.status === "배정중");

  const emptySlotsOf = (leader: any) => totalSlots - leader.roster.length;
  const allinMax = myLeader ? myLeader.points - Math.max(0, emptySlotsOf(myLeader) - 1) * S.basePrice : 0;

  const doBid = async (amount: number) => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 리더 역할을 선택하세요"); return; }
    if (myLeader && amount > myLeader.points) { showToast(`보유 Point가 부족합니다. (보유 ${myLeader.points.toLocaleString()} Point)`); return; }
    const d = await act({ action: "bid", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx, amount });
    // 📌 폴링(1.5초) 지연 동안 타이머가 짧게 보이는 문제 방지 — 성공 즉시 로컬 반영
    if (d?.success) {
      setAuction((prev: any) => {
        if (!prev || prev.current?.playerIdx === null) return prev;
        const next = structuredClone(prev);
        next.current.price = amount;
        next.current.leaderIdx = myLeaderIdx;
        next.current.endsAt = new Date(serverNow() + (next.settings.timerSeconds || 15) * 1000).toISOString();
        return next;
      });
    } else if (d?.message) showToast(d.message);
  };

  // 직접 입력 입찰: 입찰 단위로 자동 보정 + Enter 지원
  const submitDirectBid = () => {
    const raw = Number(bidInput);
    if (!raw) return;
    const snapped = Math.floor(raw / S.minIncrement) * S.minIncrement; // 입찰 단위로 내림 보정
    if (snapped !== raw) showToast(`입찰 단위(${S.minIncrement.toLocaleString()} Point)에 맞춰 ${snapped.toLocaleString()} Point로 보정되었습니다`);
    if (snapped <= (cur.leaderIdx === null ? basePrice - 1 : cur.price)) { showToast(`${nextMinBid.toLocaleString()} Point 이상 입력해주세요`); return; }
    doBid(snapped);
    setBidInput("");
  };

  // 스카우터 사용 → 성공 시 게임식 결과 연출
  const useScouter = async () => {
    if (myLeaderIdx === null || cur.playerIdx === null) return;
    const targetIdx = cur.playerIdx;
    const target = auction.players[targetIdx];
    const d = await act({ action: "scout", leaderIdx: myLeaderIdx, playerIdx: targetIdx });
    if (d.success) {
      sfxScout();
      // 📌 공개 정보는 서버 응답에서만 수신 (다른 리더에게는 전송되지 않음)
      const rv = d.reveal || {};
      const rows: { l: string; v: string; pos?: string }[] = [];
      const champs = (rv.mostChampions || []).filter(Boolean);
      if (target.isAllPos) {
        // 황금카드 — 모스트만 공개
        rows.push({ l: "모스트 챔피언", v: champs.length ? champs.join("  ·  ") : "없음" });
      } else {
        if (revealFields.includes("mainPos")) rows.push({ l: "주 포지션", v: rv.mainPos ? roleAbbr(rv.mainPos) : "?", pos: rv.mainPos || "" });
        if (revealFields.includes("subPos")) rows.push({ l: "부 포지션", v: rv.subPos ? roleAbbr(rv.subPos) : "없음", pos: rv.subPos || "" });
        if (revealFields.includes("champions")) rows.push({ l: "모스트 챔피언", v: champs.length ? champs.join("  ·  ") : "없음" });
      }
      const tName = target.isAllPos ? "올 포지션 선수" : target.alias;
      pushNotice({ kind: "scout", title: `스카우터 — ${tName}`, rows });
      // 결과는 즉시 팝업으로 보여주고(자동 소멸), 기록은 알림함에 남는다
      setScoutFx({ name: tName, rows });
      setTimeout(() => setScoutFx(null), 5500);
      // 📌 즉시 반영 (폴링 지연 동안 버튼 잔존/포인트 미차감/포지션 미표시 방지)
      setAuction((prev: any) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const p = next.players[targetIdx];
        if (p && !p.scoutedBy.includes(myLeaderIdx)) p.scoutedBy.push(myLeaderIdx);
        // 서버에서 받은 공개 정보를 내 화면 상태에 반영
        if (p) { p.mainPos = rv.mainPos || ""; p.subPos = rv.subPos || ""; p.mostChampions = rv.mostChampions || []; }
        const l = next.leaders[myLeaderIdx];
        if (l) l.points = Math.max(0, l.points - (target?.isAllPos ? (next.settings.goldenScoutCost ?? 4000) : next.settings.scoutCost));
        return next;
      });
    }
  };

  // 로스터 이름 — 프로필이 공개된 선수는 실제 디스코드 이름으로 동기화
  //  · 황금카드(올포지션)는 공개 전까지 정체를 숨김 (인벤토리 표기와 일치)
  const rosterName = (l: any, r: any) => {
    if (r.playerIdx === -1) return l.name;
    const p = auction.players[r.playerIdx];
    if (p?.revealed && p.discordId && profiles[p.discordId]) return profiles[p.discordId].globalName;
    if (p?.revealed) return p.alias;
    if (p?.isAllPos) return "올 포지션 선수";
    return p?.alias;
  };

  // ── 리더 슬롯 보드 (배정/오버플로우 인라인 처리) ──
  const SlotBoard = ({ leader, leaderIdx, big }: { leader: any; leaderIdx: number; big?: boolean }) => {
    const assigning = hasPending && pa.leaderIdx === leaderIdx && (role === "host" || myLeaderIdx === leaderIdx);
    const overflowing = hasOverflow && po.leaderIdx === leaderIdx && (role === "host" || myLeaderIdx === leaderIdx);
    const isGoldenAssign = assigning && pendingPlayer?.isAllPos;

    // ── 큰 보드 (내 팀) — 포지션별 세로 단, 단 사이는 헤어라인으로만 구분 ──
    if (big) {
      return (
        <div className="flex flex-wrap">
          {roleList.map((slot) => {
            const limit = slotLimitOf(slot);
            const entries = leader.roster.map((r: any, ri: number) => ({ r, ri })).filter(({ r }: any) => r.slot === slot);
            const emptyCount = Math.max(0, limit - entries.length);
            const canAssignHere = assigning && (entries.length < limit || isGoldenAssign);
            const isOverflowSlot = overflowing && po.slot === slot;
            const col = roleColor(slot);
            return (
              <div key={slot} className="flex-1 min-w-[132px] px-3.5 first:pl-0 last:pr-0 py-1 border-l border-white/[0.07] first:border-l-0">
                {/* 포지션 머리글 — 색 밑줄 한 줄 */}
                <div className={`flex items-baseline justify-between pb-1.5 mb-2 border-b ${isOverflowSlot ? "border-amber-400/60" : "border-white/15"}`}>
                  <span className={`text-[10px] font-black tracking-[0.14em] ${isOverflowSlot ? "text-amber-300" : col.text}`}>{roleAbbr(slot)}</span>
                  <span className="text-[9px] font-black text-gray-600 tabular-nums">{entries.length}<span className="text-gray-700">/{limit}</span></span>
                </div>

                {entries.map(({ r, ri }: any) => {
                  const movable = isOverflowSlot && !r.golden && r.playerIdx !== -1;
                  const selected = moveFrom === ri;
                  return (
                    <button
                      key={ri}
                      type="button"
                      disabled={!movable}
                      onClick={() => movable && setMoveFrom(selected ? null : ri)}
                      className={`w-full text-left border-b py-1.5 transition-colors ${selected ? "border-[#e91e3f] bg-[#e91e3f]/[0.07]" : movable ? "border-amber-400/60 bg-amber-400/[0.07] animate-pulse cursor-pointer" : "border-white/[0.06] cursor-default"}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-black truncate ${r.golden ? "text-amber-200" : "text-white"}`}>{rosterName(leader, r)}</span>
                        {r.playerIdx === -1 && <span className="shrink-0 text-[8px] font-black text-gray-600">리더</span>}
                        {r.golden && <span className="shrink-0 text-[8px] font-black text-amber-300">ALL</span>}
                      </span>
                      <span className="block text-[9px] font-bold text-gray-600 tabular-nums mt-0.5">
                        {r.playerIdx === -1 ? "" : `${r.price.toLocaleString()} Pt`}
                      </span>
                    </button>
                  );
                })}

                {Array.from({ length: emptyCount }).map((_, ei) => (
                  <button
                    key={`e${ei}`}
                    type="button"
                    disabled={!canAssignHere}
                    onClick={() => canAssignHere && act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })}
                    className={`w-full text-left border-b border-dashed py-1.5 h-[42px] transition-colors ${canAssignHere ? "border-[#e91e3f] bg-[#e91e3f]/[0.07] animate-pulse cursor-pointer hover:bg-[#e91e3f]/15" : "border-white/[0.09]"}`}
                  >
                    <span className={`text-[10px] font-black tracking-[0.12em] ${canAssignHere ? "text-[#ff5c77]" : "text-white/15"}`}>{canAssignHere ? "여기에 배정" : "—"}</span>
                  </button>
                ))}

                {/* 황금카드: 꽉 찬 슬롯에도 배정 */}
                {isGoldenAssign && emptyCount === 0 && (
                  <button type="button" onClick={() => act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })} className="w-full text-left border-b border-dashed border-amber-400/60 py-1.5 hover:bg-amber-400/10 transition-colors">
                    <span className="text-[10px] font-black tracking-[0.12em] text-amber-300">초과 배정</span>
                  </button>
                )}
                {/* 오버플로우 이동 대상 */}
                {overflowing && moveFrom !== null && slot !== po.slot && (!p1Role || slot !== p1Role) && entries.length < limit && (
                  <button
                    type="button"
                    onClick={async () => { const d = await act({ action: "moveSlot", rosterIdx: moveFrom, toSlot: slot, byLeaderIdx: myLeaderIdx }); if (d.success) { sfxAssign(); setMoveFrom(null); showToast(`[${slot}] 슬롯으로 이동했습니다`); } }}
                    className="w-full text-left border-b border-emerald-500/60 py-1.5 animate-pulse hover:bg-emerald-500/15 transition-colors"
                  >
                    <span className="text-[10px] font-black tracking-[0.12em] text-emerald-300">이곳으로 이동</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // ── 컴팩트 보드 (좌측 레일) — 한 포지션 = 한 줄 ──
    return (
      <div className="border-t border-white/[0.06]">
        {roleList.map((slot) => {
          const limit = slotLimitOf(slot);
          const entries = leader.roster.map((r: any, ri: number) => ({ r, ri })).filter(({ r }: any) => r.slot === slot);
          const emptyCount = Math.max(0, limit - entries.length);
          const canAssignHere = assigning && (entries.length < limit || isGoldenAssign);
          const isOverflowSlot = overflowing && po.slot === slot;
          const col = roleColor(slot);

          return (
            <div key={slot} className={`flex items-start gap-2.5 py-1.5 border-b ${isOverflowSlot ? "border-amber-400/40" : "border-white/[0.06]"}`}>
              <span className={`shrink-0 w-9 pt-px text-[10px] font-black tracking-wider ${isOverflowSlot ? "text-amber-300" : col.text}`}>{roleAbbr(slot)}</span>
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                {entries.map(({ r, ri }: any) => {
                  const movable = isOverflowSlot && !r.golden;
                  const selected = moveFrom === ri;
                  return (
                    <button
                      key={ri}
                      type="button"
                      disabled={!movable}
                      onClick={() => movable && setMoveFrom(selected ? null : ri)}
                      className={`min-w-0 text-left text-[11px] font-bold transition-colors ${selected ? "text-white underline decoration-[#e91e3f] decoration-2 underline-offset-2" : movable ? "text-amber-200 underline decoration-dotted underline-offset-2 animate-pulse cursor-pointer" : r.golden ? "text-amber-200 cursor-default" : "text-gray-300 cursor-default"}`}
                    >
                      <span className="truncate">{rosterName(leader, r)}</span>
                      {r.playerIdx === -1 && <span className="ml-1 text-[8px] font-black text-gray-600">리더</span>}
                      {r.golden && <span className="ml-1 text-[8px] font-black text-amber-300">ALL</span>}
                    </button>
                  );
                })}
                {Array.from({ length: emptyCount }).map((_, ei) => (
                  <button
                    key={`e${ei}`}
                    type="button"
                    disabled={!canAssignHere}
                    onClick={() => canAssignHere && act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })}
                    className={`text-[10px] font-black tracking-wider transition-colors ${canAssignHere ? "text-[#ff5c77] animate-pulse cursor-pointer hover:text-white" : "text-white/15"}`}
                  >
                    {canAssignHere ? "여기에 배정" : "———"}
                  </button>
                ))}
                {isGoldenAssign && emptyCount === 0 && (
                  <button type="button" onClick={() => act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })} className="text-[10px] font-black tracking-wider text-amber-300 hover:text-amber-200 transition-colors">초과 배정</button>
                )}
                {/* 오버플로우: 이동 대상 슬롯 선택 (선경매 포지션으로는 이동 불가 → 표시 안 함) */}
                {overflowing && moveFrom !== null && slot !== po.slot && (!p1Role || slot !== p1Role) && entries.length < limit && (
                  <button
                    type="button"
                    onClick={async () => { const d = await act({ action: "moveSlot", rosterIdx: moveFrom, toSlot: slot, byLeaderIdx: myLeaderIdx }); if (d.success) { sfxAssign(); setMoveFrom(null); showToast(`[${slot}] 슬롯으로 이동했습니다`); } }}
                    className="text-[10px] font-black tracking-wider text-emerald-400 hover:text-emerald-300 animate-pulse transition-colors"
                  >
                    이곳으로 이동
                  </button>
                )}
              </div>
              <span className="shrink-0 pt-px text-[9px] font-black text-gray-700 tabular-nums">{entries.length}/{limit}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // 📌 경매장 공용 팝업 — 방 안의 모든 모달이 같은 골격(상단 라인 · 라벨 · 제목 · 본문 · 분할 액션)을 쓴다
  const MODAL_TONE: Record<string, { line: string; label: string }> = {
    default: { line: "bg-white/35", label: "text-gray-500" },
    danger: { line: "bg-[#e91e3f]", label: "text-[#e91e3f]" },
    info: { line: "bg-blue-500", label: "text-blue-400" },
    gold: { line: "auc-stage-goldline", label: "text-amber-300" },
  };
  const AucModal = ({
    label, title, desc, tone = "default", onClose, wide, children, actions,
  }: {
    label: string; title: string; desc?: React.ReactNode; tone?: keyof typeof MODAL_TONE;
    onClose?: () => void; wide?: boolean; children?: React.ReactNode;
    actions?: { text: string; onClick: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }[];
  }) => {
    const t = MODAL_TONE[tone] || MODAL_TONE.default;
    return (
      <div className="auc-modal-back animate-in fade-in" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className={`auc-modal ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200`}
        >
          <span className={`auc-modal-line ${t.line}`} />
          <div className="px-6 sm:px-7 pt-6 sm:pt-7 pb-6">
            <div className="flex items-baseline gap-3 mb-3">
              <span className={`auc-label ${t.label}`}>{label}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <h2 className="text-lg font-black text-white leading-snug">{title}</h2>
            {desc && <div className="text-xs text-gray-400 leading-relaxed whitespace-pre-line mt-2.5">{desc}</div>}
            {children}
          </div>
          {actions && actions.length > 0 && (
            <div className="flex border-t border-white/12">
              {actions.map((a, ai) => (
                <button
                  key={ai}
                  disabled={a.disabled}
                  onClick={a.onClick}
                  className={`flex-1 py-3.5 text-sm font-black transition-colors border-l border-white/12 first:border-l-0 disabled:opacity-35 disabled:cursor-not-allowed ${
                    a.kind === "primary" ? "bg-[#e91e3f] hover:bg-[#d01634] text-white disabled:bg-white/[0.04] disabled:text-gray-600"
                    : a.kind === "danger" ? "text-[#ff5c77] hover:bg-[#e91e3f] hover:text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {a.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 📌 초과 배정으로 밀려난 대상이 '리더 본인'이면 인벤토리로 보낼 수 없다 →  그 자리에서 바로 포지션 재지정
  const LeaderPosPicker = ({ leaderIdx }: { leaderIdx: number }) => {
    if (!hasOverflow || po.leaderIdx !== leaderIdx) return null;
    const leader = auction.leaders[leaderIdx];
    const selfEntry = leader.roster.find((r: any) => r.playerIdx === -1);
    if (!selfEntry || selfEntry.slot !== po.slot) return null;
    const options = roleList.filter(
      (s) => s !== po.slot && (!p1Role || s !== p1Role) && leader.roster.filter((r: any) => r.slot === s).length < slotLimitOf(s)
    );
    return (
      <div className="mt-2.5 pt-2.5 border-t border-amber-400/25">
        <p className="text-[10px] font-black text-amber-200 mb-2">
          <b className="text-white">{leader.name}</b> 리더 본인이 [{po.slot}] 에 있습니다 — 옮길 포지션을 바로 선택하세요
        </p>
        {options.length === 0 ? (
          <p className="text-[10px] font-bold text-gray-500">빈 포지션이 없습니다. 진행자에게 문의해주세요.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((s) => (
              <button
                key={s}
                onClick={async () => {
                  const d = await act({ action: "overflow:leaderPos", leaderIdx, position: s, byLeaderIdx: myLeaderIdx });
                  if (d?.success) { sfxAssign(); setMoveFrom(null); showToast(`본인 포지션을 [${s}] 로 지정했습니다`); }
                  else showToast(d?.message || "포지션 지정에 실패했습니다");
                }}
                className={`px-3 py-1.5 text-[11px] font-black border transition-colors ${roleColor(s).text} border-white/20 hover:border-white hover:bg-white/10`}
              >
                {roleAbbr(s)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="w-full flex-1 flex flex-col relative auc">
      <LuxStyles />
      <AuctionStyles />

      {/* 상단 바 — 1단: 정체(제목·상태) / 2단 오른쪽: 조작(볼륨·역할·진행) */}
      <div className="sticky top-16 z-30 w-full px-4 md:px-6 py-2.5 bg-[#090909]/92 backdrop-blur-xl border-b border-white/[0.07]">
        {/* 상태 라인 — LIVE만 레드 포인트 */}
        <span className={`absolute inset-x-0 top-0 h-px ${auction.status === "진행중" ? "bg-[#e91e3f]" : auction.status === "종료" ? "bg-white/10" : "bg-amber-400/60"}`} />
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* 정체 */}
          <button onClick={() => router.push("/auction")} title="목록으로" className="shrink-0 text-gray-500 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black text-white truncate leading-tight">{auction.title}</h1>
              <div className="flex items-center gap-2.5 mt-0.5">
                <span className={`auc-label flex items-center gap-1.5 ${auction.status === "진행중" ? "text-[#e91e3f]" : auction.status === "종료" ? "text-gray-600" : "text-amber-300"}`}>
                  {auction.status === "진행중" && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-pulse" />}
                  {auction.status === "진행중" ? "Live" : auction.status === "종료" ? "Closed" : "Ready"}
                </span>
                {auction.phase > 0 && auction.status === "진행중" && <span className="auc-label text-gray-500 border-l border-white/15 pl-2.5">Phase {auction.phase}</span>}
                {auction.isTest && <span className="auc-label text-amber-400/90 border-l border-white/15 pl-2.5">Test</span>}
              </div>
            </div>
          </div>

          {/* 사운드 볼륨 컨트롤 */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-white/10 bg-white/[0.03]">
            <button onClick={() => setSoundOn(!soundOn)} title={soundOn ? "음소거" : "소리 켜기"} className="outline-none focus:outline-none">
              {soundOn && volume > 0 ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
              )}
            </button>
            <input
              type="range" min={0} max={100} value={soundOn ? volume : 0}
              onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (v > 0 && !soundOn) setSoundOn(true); }}
              onMouseUp={() => playTone(660, 0.06, 0.04)}
              className="w-16 h-1 accent-white cursor-pointer"
              title={`볼륨 ${volume}%`}
            />
          </div>

          {/* 역할: 관리자는 자유 전환, 리더 유저는 본인 역할 고정 */}
          {isAdmin ? (
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); sfxSelect(); showToast(e.target.value === "host" ? "진행자 시점으로 전환했습니다" : e.target.value === "spec" ? "관전자 시점으로 전환했습니다 — 비공개 정보는 가려집니다" : `${auction.leaders[Number(e.target.value)]?.name} 리더 시점으로 전환했습니다`); }}
              className="bg-[#141414] border border-white/12 px-3 py-1.5 text-xs text-white font-bold outline-none focus:border-white/40 [color-scheme:dark]"
            >
              <option value="host">진행자 시점</option>
              <option value="spec">관전자 시점</option>
              {auction.leaders.map((l: any, i: number) => (
                <option key={i} value={i}>리더 · {l.name}{l.position ? ` (${l.position})` : ""}</option>
              ))}
            </select>
          ) : myLeader ? (
            <span className="flex items-center gap-1.5 text-xs font-black text-white border-l-2 border-[#e91e3f] pl-2.5 py-0.5">
              <span className="auc-label text-gray-600">Leader</span>{myLeader.name}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-black text-gray-200 border-l-2 border-white/30 pl-2.5 py-0.5">
              <span className="auc-label text-gray-600">Spectator</span>관전 중
            </span>
          )}

          {role === "host" && auction.status === "준비중" && (() => {
            const readyCount = auction.leaders.filter((l: any) => l.ready).length;
            const allReady = readyCount === auction.leaders.length;
            return (
              <button onClick={async () => {
                const d = await act({ action: "host:start" });
                if (!d.success && d.notReady) {
                  setConfirmCfg({ title: "강제 시작", message: `${d.message}\n\n그래도 경매를 시작하시겠습니까?`, confirmLabel: "강제 시작", onConfirm: () => act({ action: "host:start", force: true }) });
                }
              }} className={`text-xs font-black px-4 py-1.5 transition-colors ${allReady ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-white/10 hover:bg-white/20 text-gray-300"}`}>
                경매 시작 ({readyCount}/{auction.leaders.length} 준비)
              </button>
            );
          })()}
          {role === "host" && auction.status === "진행중" && (
            <>
              {auction.phase < 1 && <button onClick={() => act({ action: "host:phase", phase: 1 })} className="text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white px-4 py-1.5 transition-colors">1페이즈 시작</button>}
              {auction.phase === 1 && p1Role && <button onClick={() => setConfirmCfg({ title: "2페이즈 시작", message: `1페이즈를 마치고 2페이즈를 시작합니다. 미낙찰 ${p1Role} 가능 선수들은 2페이즈로 편입됩니다.`, confirmLabel: "시작", onConfirm: () => act({ action: "host:phase", phase: 2 }) })} className="text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white px-4 py-1.5 transition-colors">2페이즈 시작</button>}
              {strategyLeft > 0 ? (
                <button onClick={() => act({ action: "host:strategy", seconds: 0 })} className="text-xs font-black bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-1.5 transition-colors">전략 타임 종료</button>
              ) : (
                <button onClick={() => setStrategyModalOpen(true)} className="text-xs font-black bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 transition-colors">전략 타임</button>
              )}
              {invMode && <button onClick={async () => { const d = await act({ action: "host:assignTime", seconds: 180 }); if (d?.success) { sfxStrategy(); showToast("팀원 배정 시간 3분이 시작되었습니다"); } else showToast(d?.message || "배정 시간 부여에 실패했습니다"); }} className="text-xs font-black bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-1.5 transition-colors">팀원 배정 시간(3분)</button>}
              <button onClick={() => setConfirmCfg({ title: "경매 종료", message: invMode ? "경매를 종료합니다. 종료 후에는 인벤토리·포지션 조정이 불가합니다. 계속할까요?" : "모든 경매를 종료하시겠습니까?", confirmLabel: "종료", onConfirm: () => act({ action: "host:end" }) })} className="text-xs font-black bg-white/10 hover:bg-red-500/80 text-white px-4 py-1.5 transition-colors">종료</button>
            </>
          )}
        </div>
      </div>

      {/* 📱 모바일 섹션 전환 탭 — 경매+채팅 통합 (라이브 스트리밍 스타일) */}
      <div className="lg:hidden sticky top-[6.7rem] z-20 w-full px-4 py-2 bg-[#090909]/92 backdrop-blur-xl border-b border-white/5">
        <div className="grid grid-cols-2 gap-1.5">
          {([["main", "경매 · 채팅"], ["teams", isThird ? "팀 현황" : "타 팀 현황"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setMobileTab(key); sfxSelect(); }} className={`py-2 text-xs font-black border-b-2 transition-all ${mobileTab === key ? "border-[#e91e3f] text-white" : "border-white/10 text-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[1720px] mx-auto px-4 md:px-8 py-4 lg:py-6 flex-1 flex flex-wrap gap-5 items-start">

        {/* ═══ 좌측 세로 레일: 팀 현황판 ═══ */}
        <aside className={`${mobileTab === "teams" ? "block" : "hidden"} lg:block w-full lg:w-[280px] shrink-0 order-2 lg:order-1 lg:sticky lg:top-36 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full lg:pr-1`}>
          {/* 섹션 머리글 — 굵은 선 한 줄로 구획 */}
          <div className="flex items-baseline gap-3 mb-1 pb-2 border-b border-white/20">
            <span className="auc-label text-white">{isThird ? "Teams" : "Rivals"}</span>
            <span className="text-[10px] font-bold text-gray-600">{isThird ? "전체 팀" : "타 리더"}</span>
            <span className="ml-auto text-[10px] font-black text-gray-600 tabular-nums">{String(railLeaders.length).padStart(2, "0")}</span>
          </div>

          {railLeaders.length === 0 && (
            <p className="py-6 text-center text-[11px] text-gray-700">다른 리더가 없습니다.</p>
          )}
          <div className="lg:block sm:grid sm:grid-cols-2 lg:grid-cols-1">
            {railLeaders.map(({ l, li }) => {
              const prof = l.discordId ? profiles[l.discordId] : null;
              // 배정/이동이 필요한 팀은 강제 펼침 (모든 화면 크기에서 동일 정보 노출)
              const forceOpen = (hasPending && pa.leaderIdx === li && (role === "host" || myLeaderIdx === li)) || (hasOverflow && po.leaderIdx === li && (role === "host" || myLeaderIdx === li));
              const isOpen = forceOpen || expandedTeams.has(li);
              const toggle = () => setExpandedTeams((prev) => { const next = new Set(prev); if (next.has(li)) next.delete(li); else next.add(li); return next; });
              const bidding = cur.leaderIdx === li;
              const fillPct = Math.min(100, (l.roster.length / Math.max(1, totalSlots)) * 100);
              return (
                <div key={li} className={`relative transition-colors ${bidding ? "bg-[#e91e3f]/[0.05]" : ""}`}>
                  {/* 최고가 입찰 중인 팀 — 왼쪽 레드 세로선 */}
                  <span className={`absolute left-0 inset-y-0 w-[2px] transition-colors ${bidding ? "bg-[#e91e3f]" : myLeaderIdx === li ? "bg-white/40" : "bg-transparent"}`} />

                  <button type="button" onClick={toggle} className="w-full text-left flex items-center gap-2.5 pl-3.5 pr-2 py-3 outline-none focus:outline-none hover:bg-white/[0.02] transition-colors">
                    {prof ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prof.avatarUrl} alt="" className={`w-9 h-9 rounded-full bg-gray-800 shrink-0 ring-1 transition-all ${bidding ? "ring-[#e91e3f]" : "ring-white/15"}`} />
                    ) : (
                      <span className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black text-gray-400 ring-1 transition-all ${bidding ? "ring-[#e91e3f] bg-[#e91e3f]/10" : "ring-white/12 bg-white/[0.03]"}`}>{l.name[0]}</span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 leading-tight">
                        <span className="text-[13px] font-black text-white truncate">{l.name}</span>
                        {myLeaderIdx === li && <span className="shrink-0 auc-label-xs text-gray-300">Me</span>}
                        {bidding && <span className="shrink-0 auc-label-xs text-[#ff5c77]">Top Bid</span>}
                      </p>
                      <p className="flex items-center gap-1.5 mt-0.5 text-[10px] font-bold text-gray-600">
                        {l.position && <span className={roleColor(l.position).text}>{roleAbbr(l.position)}</span>}
                        {l.position && <span className="text-gray-800">·</span>}
                        <span className="tabular-nums">{l.roster.length}/{totalSlots} 슬롯</span>
                        {invMode && (l.inventory?.length || 0) > 0 && (
                          <>
                            <span className="text-gray-800">·</span>
                            <span className="text-gray-300 tabular-nums">보유 {l.inventory.length}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-black text-white tabular-nums leading-none">{l.points.toLocaleString()}</p>
                      <p className="auc-label-xs text-gray-700 mt-1">Point</p>
                    </div>

                    {auction.status === "준비중" && (
                      <span className={`shrink-0 auc-label-xs ${l.ready ? "text-emerald-400" : "text-gray-600"}`}>{l.ready ? "Ready" : "Wait"}</span>
                    )}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-3 h-3 text-gray-700 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {/* 구분선이 곧 로스터 충원 게이지 */}
                  <div className="relative h-px bg-white/[0.09]">
                    <span className={`absolute inset-y-0 left-0 transition-all duration-500 ${bidding ? "bg-[#e91e3f]" : "bg-white/45"}`} style={{ width: `${fillPct}%` }} />
                  </div>

                  {/* 펼침 영역 — 로스터 상세 */}
                  {isOpen && (
                    <div className="pl-3.5 pr-2 pb-3.5 pt-2 bg-white/[0.015]">
                      <SlotBoard leader={l} leaderIdx={li} />

                      {invMode && (
                        <button onClick={() => { setInvModal(li); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }} className={`group mt-2.5 w-full flex items-center gap-2 border px-2.5 py-1.5 text-[10px] font-black cursor-pointer transition-all ${(l.inventory?.length || 0) > 0 ? "border-[#e91e3f]/60 bg-[#e91e3f]/[0.08] text-[#ff5c77] hover:bg-[#e91e3f]/20" : "border-white/20 text-gray-400 hover:border-white hover:text-white hover:bg-white/[0.06]"}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                          인벤토리 {(l.inventory?.length || 0) > 0 ? `${l.inventory.length}장` : "비어 있음"}
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 ml-auto shrink-0 transition-transform group-hover:translate-x-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                      )}

                      {/* 진행자 실시간 관리 도구 */}
                      {role === "host" && (
                        <div className="mt-2 flex gap-4">
                          <button onClick={() => { setAdjustTarget(li); setAdjustAmount(""); }} className="flex-1 text-[10px] font-black text-gray-500 hover:text-white border-b border-white/12 hover:border-white/50 py-1.5 transition-colors">포인트 조정</button>
                          <button onClick={() => setPosSetTarget(li)} className="flex-1 text-[10px] font-black text-gray-500 hover:text-white border-b border-white/12 hover:border-white/50 py-1.5 transition-colors">{l.position ? "포지션 변경" : "포지션 지정"}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ═══ 중앙: 경매 메인 ═══ */}
        <div className={`${mobileTab === "main" ? "block" : "hidden"} lg:block flex-1 min-w-0 w-full lg:w-auto space-y-4 lg:space-y-5 order-1 lg:order-2`} style={{ minWidth: "min(100%, 400px)" }}>

          {/* 리더: 준비 배너 (경매 시작 전, 눈에 확 띄게) */}
          {myLeader && auction.status === "준비중" && (
            <div className="relative border border-white/15 overflow-hidden" style={{ background: "linear-gradient(150deg, #17171a 0%, #101012 55%, #08080a 100%)" }}>
              <span className={`absolute inset-x-0 top-0 h-[2px] z-10 ${myLeader.ready ? "bg-emerald-500" : "bg-[#e91e3f]"}`} />
              <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 relative">
                {!myLeader.ready && <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/[0.07] blur-[60px] rounded-full pointer-events-none animate-[pulseGlow_2.5s_ease-in-out_infinite]"></div>}
                <div className="relative z-10 text-center sm:text-left">
                  <p className="text-[10px] font-black auc-mono uppercase mb-1.5 text-gray-500">Ready Check</p>
                  <p className="text-lg font-black text-white">{myLeader.ready ? "준비 완료 — 다른 리더를 기다리는 중" : "경매 시작 전, 준비 버튼을 눌러주세요"}</p>
                  <p className="text-[11px] text-gray-500 mt-1">전체 리더 준비 완료 시 진행자가 경매를 시작합니다. ({auction.leaders.filter((l: any) => l.ready).length}/{auction.leaders.length} 준비)</p>
                </div>
                <button onClick={() => act({ action: "leader:ready", leaderIdx: myLeaderIdx, ready: !myLeader.ready })} className={`relative z-10 shrink-0 px-10 py-4 rounded-2xl text-base font-black transition-all ${myLeader.ready ? "bg-white/10 hover:bg-white/20 text-gray-300" : "bg-[#e91e3f] hover:bg-[#d01634] text-white shadow-[0_10px_30px_rgba(233,30,63,0.4)] animate-pulse"}`}>
                  {myLeader.ready ? "준비 해제" : "준비 완료"}
                </button>
              </div>
            </div>
          )}

          {/* 관전자 안내 — 시점을 명시 (입찰 불가 · 비공개 정보는 가려짐) */}
          {isSpec && (
            <div className="flex items-center gap-3 py-2.5 border-y border-white/12">
              <span className="w-1.5 h-1.5 rounded-full bg-white/50 shrink-0" />
              <p className="text-[11px] font-bold text-gray-400 flex-1 break-keep">
                <span className="text-white font-black">관전자 시점</span> — 경매를 지켜봅니다. 입찰·스카우터는 사용할 수 없으며, 미공개 선수 정보는 가려집니다.
              </p>
              <span className="hidden sm:block shrink-0 auc-label-xs text-gray-600">Read Only</span>
            </div>
          )}

          {/* 전략 타임 배너 */}
          {strategyLeft > 0 && (
            <div className="border border-blue-500/30 bg-blue-500/[0.06] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300 flex-1">전략 타임 진행 중 — 리더과 팀원들이 전략을 논의하는 시간입니다. 입찰이 일시 중지됩니다.</p>
              <span className="text-lg font-black text-blue-400 tabular-nums shrink-0">{Math.floor(strategyLeft / 60)}:{String(strategyLeft % 60).padStart(2, "0")}</span>
            </div>
          )}

          {/* 팀원 배정 시간 배너 (인벤토리 모드) */}
          {assignLeft > 0 && (
            <div className="border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300 flex-1">팀원 배정 시간 — 팀장은 <b className="text-amber-300">인벤토리</b>의 선수를 포지션에 배정해주세요. 종료 시 확정됩니다.</p>
              <span className="text-lg font-black text-amber-400 tabular-nums shrink-0">{Math.floor(assignLeft / 60)}:{String(assignLeft % 60).padStart(2, "0")}</span>
            </div>
          )}

          {/* 슬롯 배정/이동 안내 배너 */}
          {hasPending && !iAmAssigner && (
            <div className="border border-white/25 bg-white/[0.05] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#e91e3f] animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{pendingLeader?.name}</span> 리더이 슬롯을 배정하고 있습니다...</p>
            </div>
          )}
          {isMyPending && (
            <div className="border border-white/25 bg-white/[0.05] px-5 py-4">
              <p className="text-xs font-black text-white mb-1">낙찰 완료 — 아래 내 팀 슬롯에서 배정할 위치를 선택하세요</p>
              <p className="text-[11px] text-gray-400">{pendingPlayer?.isAllPos ? "올 포지션 선수 · 꽉 찬 슬롯에도 배정할 수 있습니다 (배정 후 기존 선수 이동 필요)" : `${pendingPlayer?.alias} · ${pa.price?.toLocaleString()} Point`}</p>
            </div>
          )}
          {hasOverflow && (isMyOverflow || role === "host") && (
            <div className="border border-orange-500/40 bg-orange-500/[0.06] px-5 py-4">
              <p className="text-xs font-black text-white mb-1">슬롯 초과 — [{po.slot}] 슬롯에서 이동할 선수를 선택한 뒤, 옮길 슬롯을 클릭하세요</p>
              <p className="text-[11px] text-gray-400">깜빡이는 선수를 클릭 → 초록색 &quot;이곳으로 이동&quot; 버튼 클릭</p>
              <LeaderPosPicker leaderIdx={po.leaderIdx} />
            </div>
          )}
          {hasOverflow && !isMyOverflow && role !== "host" && (
            <div className="border border-orange-500/25 bg-orange-500/[0.04] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{overflowLeader?.name}</span> 리더이 슬롯을 정리하고 있습니다...</p>
            </div>
          )}

          {/* ═══ 무대 — 현재 매물 ═══
              · 일반 매물 : 메인 화면과 같은 블랙&화이트 패널 + 상단 레드 라인
              · 올 포지션 : 배경 자체가 골드 그라데이션으로 전환 (등장 임팩트) */}
          <div className={`relative border overflow-hidden min-h-[230px] transition-colors duration-500 ${isGoldenLot ? "auc-stage-golden" : "auc-stage-panel border-white/15"}`}>
            <span className={`absolute inset-x-0 top-0 h-[2px] z-10 ${isGoldenLot ? "auc-stage-goldline" : curPlayer ? "bg-[#e91e3f]" : "bg-white/20"}`} />
            <div className="p-6 md:p-8 relative min-h-[230px]">
              <div className={`absolute -top-16 -right-16 w-52 h-52 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite] ${isGoldenLot ? "bg-amber-300/15" : "bg-white/[0.06]"}`}></div>

              {curPlayer ? (
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className={`auc-label mb-2 ${curPlayer.isAllPos ? "text-amber-300" : "text-gray-500"}`}>
                        {curPlayer.isAllPos ? "Golden Card" : `On the Block · Phase ${curPlayer.phase}`}
                      </p>
                      <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
                        {curPlayer.isAllPos ? <span className="auc-gold-text">올 포지션 선수</span> : curPlayer.alias}
                      </h2>
                    </div>

                    {/* 스카우터 타임 / 입찰 타이머 */}
                    {scoutLeft > 0 ? (
                      <div className="shrink-0 text-center px-4 py-3 border border-white/25 bg-white/[0.07]">
                        <p className="text-[8px] font-black auc-mono text-[#e91e3f] uppercase mb-0.5">Scout Time</p>
                        <span className="text-2xl font-black tabular-nums text-white">{scoutLeft}</span>
                        <span className="text-[9px] font-bold text-gray-400 ml-1">초</span>
                      </div>
                    ) : timeLeft !== null && (
                      <div className={`shrink-0 w-16 h-16 border flex flex-col items-center justify-center ${timeLeft <= 5 ? "border-[#e91e3f] bg-[#e91e3f]/10" : "border-white/10 bg-black/30"}`}>
                        <span className={`text-2xl font-black tabular-nums ${timeLeft <= 5 ? "text-[#e91e3f]" : "text-white"}`}>{timeLeft}</span>
                        <span className="text-[8px] font-bold text-gray-500 tracking-widest">SEC</span>
                      </div>
                    )}
                  </div>

                  {/* ── 매물 핵심 정보 — 티어·스카우터 결과를 이 화면에서 가장 크게 읽히도록 ── */}
                  {(() => {
                    const scouted = canSeePos(curPlayer);
                    const cells: { l: string; v: string; tone?: "gold" | "muted"; posName?: string }[] = [];
                    if (curPlayer.isAllPos) {
                      cells.push({ l: "티어", v: "비공개", tone: "muted" });
                      cells.push({ l: "슬롯", v: "자유 배정", tone: "gold" });
                    } else {
                      cells.push({ l: "최고 티어", v: curPlayer.peakTier || "?" });
                      cells.push({ l: "현재 티어", v: curPlayer.currentTier || "?" });
                    }
                    if (scouted) {
                      revealParts(curPlayer).forEach((r) =>
                        cells.push({ l: r.l, v: r.v, tone: curPlayer.isAllPos ? "gold" : undefined, posName: r.pos || undefined })
                      );
                    } else if (!curPlayer.isAllPos || curPlayer.hasMost) {
                      cells.push({
                        l: curPlayer.isAllPos ? "모스트" : revealFields.includes("champions") ? "포지션 · 모스트" : "포지션",
                        v: `스카우터 ${scoutCostOf(curPlayer).toLocaleString()}pt`,
                        tone: "muted",
                      });
                    } else {
                      cells.push({ l: "공개 정보", v: "없음", tone: "muted" });
                    }
                    return (
                      <div className={`mt-5 flex flex-wrap border-t border-b py-3 ${isGoldenLot ? "border-amber-400/25" : "border-white/12"}`}>
                        {cells.map((c, ci) => (
                          <div
                            key={ci}
                            className={`min-w-[112px] px-4 first:pl-0 last:pr-0 border-l first:border-l-0 ${isGoldenLot ? "border-amber-400/20" : "border-white/[0.09]"} ${c.l === "모스트" || c.l.includes("모스트") ? "flex-[2]" : "flex-1"}`}
                          >
                            <p className={`auc-cap mb-1.5 ${isGoldenLot ? "text-amber-300/60" : "text-gray-600"}`}>{c.l}</p>
                            <p
                              className={`text-lg md:text-xl font-black tracking-tight leading-tight break-keep ${
                                c.tone === "muted"
                                  ? isGoldenLot ? "text-amber-100/45" : "text-gray-600"
                                  : c.posName
                                  ? roleColor(c.posName).text
                                  : c.tone === "gold"
                                  ? "text-amber-200"
                                  : "text-white"
                              }`}
                            >
                              {c.v}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 절취선 모티프 — 선수 정보와 호가 영역 분리 */}
                  <div className="mt-5 mb-5 border-t border-dashed border-white/15" />
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className={`auc-label mb-1.5 ${isGoldenLot ? "text-amber-300/70" : "text-gray-500"}`}>{cur.leaderIdx === null ? "시작가 · Opening" : `현재 최고가 · Top Bid${cur.isAllin ? " · 올인" : ""}`}</p>
                      <p
                        className={`text-4xl md:text-5xl font-black tracking-tighter tabular-nums ${isGoldenLot ? "text-amber-200" : "text-[#e91e3f]"}`}
                        style={isGoldenLot ? { textShadow: "0 0 22px rgba(251,191,36,0.4)" } : undefined}
                      >
                        {(cur.leaderIdx === null ? basePrice : cur.price).toLocaleString()}<span className="text-base text-gray-400 ml-2">Point</span>
                      </p>
                      {curLeader && <p className="text-xs font-bold text-white mt-1.5">{curLeader.name}</p>}
                    </div>

                    {/* 리더: 스카우터 + 입찰 (관전자는 열람만) */}
                    {myLeader && auction.status === "진행중" && (
                      <div className="w-full sm:w-auto sm:min-w-[380px]">
                        {/* ── 스카우터 — 선 하나로 구획된 액션 행 ── */}
                        {myLeaderIdx !== null && curPlayer.scoutedBy.includes(myLeaderIdx) ? (
                          <div className="flex items-center gap-2 pb-2 mb-3 border-b border-white/[0.09]">
                            <span className="auc-label-xs text-gray-600">Scouter</span>
                            <span className="text-[11px] font-bold text-gray-500">사용함 — 결과는 알림함에</span>
                          </div>
                        ) : myLeaderIdx !== null && (!curPlayer.isAllPos || curPlayer.hasMost) ? (
                          /* 황금카드는 공개할 모스트가 없으면 스카우터 자체를 제공하지 않음 */
                          <button
                            onClick={() => setConfirmCfg({ title: "스카우터 사용", message: `${scoutCostOf(curPlayer).toLocaleString()} Point를 사용하여 이 선수의 ${curPlayer.isAllPos ? "모스트 챔피언" : revealFields.includes("champions") ? "주 포지션·모스트 챔피언" : "주/부 포지션"}을(를) 확인합니다.`, confirmLabel: "사용", onConfirm: useScouter })}
                            className={`group w-full flex items-baseline gap-2 pb-2 mb-3 border-b transition-colors ${curPlayer.isAllPos ? "border-amber-400/40 hover:border-amber-300" : "border-white/20 hover:border-white"}`}
                          >
                            <span className={`auc-label-xs ${curPlayer.isAllPos ? "text-amber-300/80" : "text-gray-500"}`}>Scouter</span>
                            <span className="ml-auto text-[12px] font-black tabular-nums text-gray-300 group-hover:text-white transition-colors">
                              −{scoutCostOf(curPlayer).toLocaleString()} Pt
                            </span>
                          </button>
                        ) : null}

                        {scoutLeft > 0 ? (
                          <p className="text-[11px] font-bold text-gray-500 text-right">스카우터 타임 종료 후 입찰이 시작됩니다</p>
                        ) : timeLeft === 0 ? (
                          <p className="text-xs font-black text-gray-400 text-right border-t border-white/10 pt-2.5">입찰 마감 — 진행자의 처리를 기다리는 중</p>
                        ) : strategyLeft > 0 ? (
                          <p className="text-[11px] font-bold text-blue-400 text-right">전략 타임 중 — 입찰 일시 중지</p>
                        ) : (
                          <>
                            {/* ── 빠른 입찰 — 세로 헤어라인으로 나뉜 눈금 ── */}
                            <div className="flex items-stretch border-t border-b border-white/[0.09]">
                              {[S.minIncrement, S.minIncrement * 5, S.minIncrement * 10, S.minIncrement * 50].map((inc) => {
                                const result = (cur.leaderIdx === null ? basePrice : cur.price + inc);
                                const affordable = myLeader && result <= myLeader.points;
                                return (
                                  <button
                                    key={inc}
                                    onClick={() => doBid(result)}
                                    disabled={!affordable}
                                    className={`group flex-1 py-2.5 px-1 text-center border-l border-white/[0.09] first:border-l-0 transition-colors ${affordable ? "hover:bg-[#e91e3f]/10" : "opacity-30 cursor-not-allowed"}`}
                                  >
                                    <span className={`block text-[13px] font-black leading-tight tabular-nums transition-colors ${affordable ? "text-white group-hover:text-[#ff5c77]" : "text-gray-500"}`}>+{inc.toLocaleString()}</span>
                                    <span className={`block text-[9px] font-bold tabular-nums mt-0.5 ${isGoldenLot ? "text-amber-200/60" : "text-gray-600"}`}>{result.toLocaleString()}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* ── 직접 입력 — 밑줄 입력창 + 실선 액션 ── */}
                            <div className="flex items-stretch mt-3">
                              <div className="flex items-center flex-1 min-w-0 border-b border-white/20 focus-within:border-[#e91e3f] transition-colors">
                                <button type="button" title="입찰 단위만큼 감소" onClick={() => setBidInput(String(Math.max(nextMinBid, (Number(bidInput) || nextMinBid) - S.minIncrement)))} className="px-2.5 py-2 text-base font-black text-gray-600 hover:text-white transition-colors">−</button>
                                <input
                                  type="number"
                                  placeholder={nextMinBid.toLocaleString()}
                                  value={bidInput}
                                  onChange={(e) => setBidInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") submitDirectBid(); }}
                                  className="flex-1 min-w-0 w-full py-2 bg-transparent text-white text-sm text-center outline-none font-black tabular-nums placeholder:text-gray-700 placeholder:font-bold"
                                />
                                <button type="button" title="입찰 단위만큼 증가" onClick={() => setBidInput(String((Number(bidInput) || (nextMinBid - S.minIncrement)) + S.minIncrement))} className="px-2.5 py-2 text-base font-black text-gray-600 hover:text-white transition-colors">+</button>
                              </div>
                              <button onClick={submitDirectBid} className="shrink-0 ml-2.5 px-6 text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white transition-colors">입찰</button>
                              <button
                                onClick={() => setConfirmCfg({ title: "올인", message: `남은 슬롯 최소 예산을 제외한 전액 ${allinMax.toLocaleString()} Point를 베팅합니다.`, confirmLabel: "올인", onConfirm: () => act({ action: "allin", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx }) })}
                                className="shrink-0 ml-1.5 px-4 text-xs font-black text-[#ff5c77] border border-[#e91e3f]/50 hover:bg-[#e91e3f] hover:text-white hover:border-[#e91e3f] transition-colors"
                              >
                                올인
                              </button>
                            </div>
                            <p className={`text-[10px] mt-2 text-right ${isGoldenLot ? "text-amber-100/50" : "text-gray-600"}`}>
                              Enter 즉시 입찰 · 단위 자동 보정 · 올인 <span className={`font-bold tabular-nums ${isGoldenLot ? "text-amber-100/80" : "text-gray-300"}`}>{allinMax.toLocaleString()}</span> Pt
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {/* 진행자 컨트롤 */}
                    {role === "host" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 입찰 시간 조절 — 긴장감 조절용 (남은 시간 즉시 반영) */}
                        {timeLeft !== null && timeLeft > 0 && (
                          <div className="flex items-center gap-1 mr-1">
                            {[-5, -3, +5].map((d) => (
                              <button
                                key={d}
                                onClick={async () => {
                                  const r = await act({ action: "host:timer", delta: d });
                                  if (r?.success) { sfxSelect(); showToast(`입찰 시간 ${d > 0 ? "+" : ""}${d}초 · 남은 ${r.left}초`); }
                                  else showToast(r?.message || "타이머 조절에 실패했습니다");
                                }}
                                className={`px-2.5 py-2 text-[11px] font-black rounded-lg border transition-all ${d < 0 ? "border-white/25 text-gray-200 hover:bg-white/10" : "border-white/15 text-gray-300 hover:bg-white/10"}`}
                              >
                                {d > 0 ? `+${d}` : d}초
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { if (cur.leaderIdx !== null) setConfirmCfg({ title: "낙찰 확정", message: `${curLeader?.name} — ${cur.price.toLocaleString()} Point 낙찰을 확정합니다.${auction.phase === 1 && p1Role ? ` (1페이즈: ${p1Role} 슬롯 자동 배정)` : " 슬롯은 리더이 배정합니다."}`, confirmLabel: "낙찰", onConfirm: () => act({ action: "host:sold" }) }); }} disabled={cur.leaderIdx === null} className="px-5 py-2.5 text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors">낙찰</button>
                        <button onClick={() => act({ action: "host:pass", playerIdx: cur.playerIdx })} className="px-5 py-2.5 text-xs font-black bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">유찰</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : revealFx && auction.status !== "종료" && revealPlayer && revealProfile ? (
                /* 프로필 공개 화면 */
                <div className="relative z-10 flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-[10px] font-black tracking-[0.35em] text-gray-200 uppercase mb-5">Player Revealed</p>
                  <div className="relative mb-4">
                    <div className="absolute -inset-3 bg-white/[0.07] blur-2xl rounded-full pointer-events-none"></div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={revealProfile.avatarUrl} alt="" className="relative w-24 h-24 rounded-full bg-gray-800 ring-2 ring-[#e91e3f]/60 ring-offset-4 ring-offset-[#120a0c]" />
                  </div>
                  <p className="text-2xl font-black text-white tracking-tight">{revealProfile.globalName}</p>
                  <p className="text-xs text-gray-500 font-medium mb-2">@{revealProfile.username}</p>
                  <p className="text-sm font-bold text-gray-200">{revealPlayer.alias} → {auction.leaders[revealPlayer.soldTo]?.name} 팀</p>
                </div>
              ) : (
                <div className="relative z-10 h-full flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-[10px] font-black tracking-[0.35em] text-gray-600 uppercase mb-3">{auction.status === "종료" ? "Finished" : "Standby"}</p>
                  <p className="text-white font-black text-lg">{auction.status === "종료" ? "경매 종료" : "대기 중"}</p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {auction.status === "종료" ? "모든 경매가 종료되었습니다. 최종 팀 구성을 확인하세요."
                      : hasPending || hasOverflow ? "슬롯 배정을 기다리고 있습니다."
                      : auction.phase === 0 && auction.status === "진행중" ? "진행자가 페이즈를 시작하면 경매가 진행됩니다."
                      : role === "host" ? "아래 선수 목록에서 호명할 선수를 선택하세요."
                      : "진행자가 다음 선수를 호명할 때까지 기다려주세요."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ 내 팀 콘솔 — 내 프로필 · 자원 · 슬롯을 선으로만 구획 (리더 시점) ═══ */}
          {myLeader && (() => {
            const myProf = myLeader.discordId ? profiles[myLeader.discordId] : null;
            const invCount = myLeader.inventory?.length || 0;
            const needAct = isMyPending || isMyOverflow;
            return (
              <section className={`transition-colors ${needAct ? "bg-[#e91e3f]/[0.04]" : ""}`}>
                {/* 콘솔 시작을 알리는 굵은 선 */}
                <span className={`block h-[2px] transition-colors ${needAct ? "bg-[#e91e3f]" : "bg-white/25"}`} />

                <div className={needAct ? "px-4 pb-4" : ""}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4 py-4">
                  {/* 내 프로필 — 제3자 시점에서는 좌측 레일에, 리더 본인은 이곳 중앙에 */}
                  <div className="flex items-center gap-3 min-w-0">
                    {myProf ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={myProf.avatarUrl} alt="" className="w-11 h-11 rounded-full bg-gray-800 ring-1 ring-white/25 shrink-0" />
                    ) : (
                      <span className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-sm font-black text-gray-300 ring-1 ring-white/20 bg-white/[0.04]">{myLeader.name[0]}</span>
                    )}
                    <div className="min-w-0">
                      <p className="auc-label text-gray-600">My Team</p>
                      <p className="text-lg font-black text-white truncate leading-tight">{myLeader.name}</p>
                      {myLeader.position && <p className={`text-[10px] font-black tracking-wider ${roleColor(myLeader.position).text}`}>{roleAbbr(myLeader.position)}</p>}
                    </div>
                  </div>

                  <span className="hidden sm:block w-px h-11 bg-white/12" />

                  {/* POINT — 남은 예산. 내 자원은 화이트, 레드는 경매 호가·LIVE 전용 */}
                  <div>
                    <p className="auc-label text-gray-500">Point</p>
                    <p className="text-3xl font-black text-white tabular-nums leading-none mt-1.5">{myLeader.points.toLocaleString()}</p>
                  </div>

                  <span className="hidden sm:block w-px h-11 bg-white/12" />

                  {/* ROSTER — 숫자 + 밑선 게이지 */}
                  <div className="min-w-[104px]">
                    <p className="auc-label text-gray-600">Roster</p>
                    <p className="text-3xl font-black text-white tabular-nums leading-none mt-1.5">
                      {myLeader.roster.length}<span className="text-lg text-gray-700">/{totalSlots}</span>
                    </p>
                    <span className="relative block h-px bg-white/12 mt-2">
                      <span className="absolute inset-y-0 left-0 bg-white transition-all duration-500" style={{ width: `${Math.min(100, (myLeader.roster.length / Math.max(1, totalSlots)) * 100)}%` }} />
                    </span>
                  </div>

                  {invMode && (
                    <>
                      <span className="hidden sm:block w-px h-11 bg-white/12" />
                      {/* 📌 유일한 '눌러야 하는' 자원 — 주변이 전부 선(線) 정보라 버튼처럼 보이게 테두리를 준다.
                          보유 카드가 있으면 레드로 물들고 점이 깜빡여 시선을 끈다. */}
                      <button
                        onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
                        title="인벤토리 열기 — 보유 선수를 포지션에 배정합니다"
                        className={`group relative flex items-center gap-3 pl-3.5 pr-3 py-2.5 border cursor-pointer transition-all ${
                          invCount > 0
                            ? "border-[#e91e3f] bg-[#e91e3f]/[0.10] hover:bg-[#e91e3f]/20"
                            : "border-white/25 hover:border-white hover:bg-white/[0.06]"
                        }`}
                      >
                        {invCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#e91e3f] animate-[pulseGlow_1.6s_ease-in-out_infinite]" />}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 shrink-0 ${invCount > 0 ? "text-[#ff5c77]" : "text-gray-500 group-hover:text-white"} transition-colors`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <span className="text-left">
                          <span className={`block auc-label ${invCount > 0 ? "text-[#ff5c77]" : "text-gray-500"}`}>Inventory</span>
                          <span className={`block text-lg font-black tabular-nums leading-tight transition-colors ${invCount > 0 ? "text-white" : "text-gray-400 group-hover:text-white"}`}>
                            {invCount}<span className="text-[10px] font-bold text-gray-500 ml-1">장</span>
                          </span>
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${invCount > 0 ? "text-[#ff5c77]" : "text-gray-600 group-hover:text-white"}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>

                    </>
                  )}

                  {/* 알림함 — 스카우터 결과를 모아 본다 (기존 우측 '알림 로그' 패널 대체).
                      스카우터는 인벤토리 모드와 무관하므로 invMode 밖에 둔다. */}
                  <>
                      <span className="hidden sm:block w-px h-11 bg-white/12" />
                      <button
                        onClick={() => { setNoticeOpen(true); setNoticeUnread(0); sfxSelect(); }}
                        title="알림함 — 스카우터 결과 모아보기"
                        className={`group relative flex items-center gap-3 pl-3.5 pr-3 py-2.5 border cursor-pointer transition-all ${noticeUnread > 0 ? "border-[#e91e3f] bg-[#e91e3f]/[0.10] hover:bg-[#e91e3f]/20" : "border-white/25 hover:border-white hover:bg-white/[0.06]"}`}
                      >
                        {noticeUnread > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#e91e3f] animate-[pulseGlow_1.6s_ease-in-out_infinite]" />}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 shrink-0 transition-colors ${noticeUnread > 0 ? "text-[#ff5c77]" : "text-gray-500 group-hover:text-white"}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        <span className="text-left">
                          <span className={`block auc-label ${noticeUnread > 0 ? "text-[#ff5c77]" : "text-gray-500"}`}>알림함</span>
                          <span className={`block text-lg font-black tabular-nums leading-tight transition-colors ${noticeUnread > 0 ? "text-white" : "text-gray-400 group-hover:text-white"}`}>
                            {notices.length}<span className="text-[10px] font-bold text-gray-500 ml-1">건</span>
                          </span>
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${noticeUnread > 0 ? "text-[#ff5c77]" : "text-gray-600 group-hover:text-white"}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                  </>
                </div>

                {/* 슬롯 보드 */}
                <div className="flex items-baseline gap-3 pb-2 mb-3 border-b border-white/20">
                  <span className="auc-label text-white">Team Slots</span>
                  
                  {needAct && <span className="ml-auto auc-label-xs text-[#ff5c77] animate-pulse">Action Required</span>}
                </div>
                <SlotBoard leader={myLeader} leaderIdx={myLeaderIdx!} big />
                </div>
              </section>
            );
          })()}

          {/* ═══ 제3자 시점(진행자·관전자) — 팀별 예산 레이스 ═══ */}
          {isThird && auction.leaders.length > 0 && (() => {
            const maxPt = Math.max(1, ...auction.leaders.map((l: any) => l.points));
            return (
              <section>
                <div className="flex items-baseline gap-3 pb-2 border-b border-white/20">
                  <span className="auc-label text-white">Point Race</span>
                  <span className="text-[10px] font-bold text-gray-600">남은 예산 · 슬롯 충원</span>
                  <span className="ml-auto auc-label-xs text-gray-600">{isSpec ? "Spectator" : "Host"} View</span>
                </div>
                {auction.leaders.map((l: any, li: number) => {
                  const bidding = cur.leaderIdx === li;
                  return (
                    <div key={li} className={`flex items-center gap-3 py-2.5 border-b border-white/[0.06] transition-colors ${bidding ? "bg-[#e91e3f]/[0.05]" : ""}`}>
                      <span className="shrink-0 w-5 text-[10px] font-black text-gray-700 tabular-nums">{String(li + 1).padStart(2, "0")}</span>
                      <span className="shrink-0 w-20 sm:w-28 truncate text-xs font-black text-white">{l.name}</span>
                      <span className="flex-1 min-w-0 relative h-[2px] bg-white/[0.08]">
                        <span className={`absolute inset-y-0 left-0 transition-all duration-500 ${bidding ? "bg-[#e91e3f]" : "bg-white/45"}`} style={{ width: `${(l.points / maxPt) * 100}%` }} />
                      </span>
                      <span className={`shrink-0 w-[68px] text-right text-xs font-black tabular-nums ${bidding ? "text-white" : "text-gray-400"}`}>{l.points.toLocaleString()}</span>
                      <span className="shrink-0 w-9 text-right text-[10px] font-bold text-gray-600 tabular-nums">{l.roster.length}/{totalSlots}</span>
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {/* 진행자: 낙찰 직후 프로필 공개 대기 바 — 공개 여부는 주최자 재량 */}
          {role === "host" && (() => {
            const unrevealed = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.status === "낙찰" && p.discordId && !p.revealed);
            if (unrevealed.length === 0) return null;
            return (
              <div className="border border-white/25 bg-white/[0.05] p-4">
                <p className="text-[10px] font-black auc-mono text-[#e91e3f] uppercase mb-2.5">프로필 공개 대기 — 공개 여부는 진행자 재량</p>
                <div className="flex flex-wrap gap-2">
                  {unrevealed.map(({ p, i }: any) => (
                    <button key={i} onClick={() => act({ action: "host:reveal", playerIdx: i })} className="flex items-center gap-2 text-[11px] font-bold text-gray-200 bg-white/5 border border-white/10 hover:border-white/35 hover:bg-white/10 px-3 py-1.5 rounded-full transition-all">
                      {p.alias} <span className="text-[9px] text-gray-500">({auction.leaders[p.soldTo]?.name})</span>
                      <span className="text-[9px] font-black text-gray-200">공개</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ═══ 선수 목록 ═══ */}
          <section>
            <div className="flex items-center gap-3 pb-2 mb-4 border-b border-white/20">
              <span className="auc-label text-white">Players</span>
              <span className="text-[10px] font-bold text-gray-600 tabular-nums">
                낙찰 {auction.players.filter((p: any) => p.status === "낙찰").length} / 전체 {auction.players.length}
              </span>
              {role === "host" && auction.status === "진행중" && auction.players.some((p: any) => p.status === "유찰") && !auction.players.some((p: any) => ["대기", "경매중", "배정중"].includes(p.status)) && (
                <button onClick={() => setConfirmCfg({ title: "유찰 랜덤 배정", message: "유찰 선수를 빈 슬롯 팀에 기본가로 랜덤 배정합니다. (잔여 Point 최저 팀 우선)", confirmLabel: "배정", onConfirm: () => act({ action: "host:assignPassed" }) })} className="ml-auto text-[10px] font-black text-gray-300 hover:text-white border-b border-white/25 hover:border-white pb-0.5 transition-colors">유찰 랜덤 배정</button>
              )}
            </div>

            {[1, 2].map((phase) => {
              const list = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.phase === phase);
              if (list.length === 0) return null;
              return (
                <div key={phase} className="mb-5 last:mb-0">
                  <p className="auc-label-xs text-gray-600 mb-2.5">{p1Role ? `Phase ${phase}` : "All"}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                    {list.map(({ p, i }: any) => {
                      const hidden = isHiddenFor(p);
                      const prof = p.revealed && p.discordId ? profiles[p.discordId] : null;
                      const callable = role === "host" && auction.status === "진행중" && (p.status === "대기" || p.status === "유찰") && !(auction.phase === 1 && p1Role && p.phase !== 1) && auction.phase > 0;
                      return (
                        /* 📌 골든 카드는 이 목록에서 가장 중요한 매물 — 금박으로 확실히 띄운다 (이전엔 회색이라 비활성처럼 보였다) */
                        <div key={i} className={`group flex flex-col rounded-xl border p-3.5 transition-colors ${p.isAllPos && !hidden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.13] to-amber-500/[0.02] shadow-[0_0_20px_-6px_rgba(251,191,36,0.4)]" : p.status === "경매중" ? "border-[#e91e3f]/40 bg-[#e91e3f]/[0.06]" : p.status === "낙찰" ? "border-white/5 bg-black/20" : p.status === "유찰" ? "border-orange-500/20 bg-orange-500/[0.03]" : p.status === "배정중" ? "border-white/25 bg-white/[0.04]" : "border-white/5 bg-black/25 hover:border-white/15"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[8px] font-black tracking-[0.2em] uppercase ${p.isAllPos && !hidden ? "text-amber-400" : "text-gray-600"}`}>{p.isAllPos && !hidden ? "Golden" : `P${String(i + 1).padStart(2, "0")}`}</span>
                            {p.status === "경매중" ? <span className="text-[9px] font-black text-gray-200 animate-pulse">LIVE</span>
                              : p.status === "배정중" ? <span className="text-[9px] font-black text-gray-200">배정 중</span>
                              : p.status === "유찰" ? <span className="text-[9px] font-black text-orange-400">유찰</span>
                              : p.status === "낙찰" ? <span className="text-[9px] font-black text-gray-500">SOLD</span>
                              : null}
                          </div>

                          {hidden ? (
                            /* 리더에겐 익명 — 물음표 표시 */
                            <div className="flex-1 flex flex-col items-center justify-center py-3">
                              <span className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
                              </span>
                              <p className="text-[9px] font-bold text-gray-600">비공개</p>
                            </div>
                          ) : (
                            <>
                              {prof ? (
                                <div className="flex items-center gap-2 mb-1">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={prof.avatarUrl} alt="" className="w-6 h-6 rounded-full bg-gray-800 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-white truncate leading-tight">{prof.globalName}</p>
                                    <p className="text-[9px] text-gray-500 truncate">{p.alias}</p>
                                  </div>
                                </div>
                              ) : (
                                /* 그라디언트 텍스트는 작은 글씨에서 뭉개져 회색으로 보인다 → 골든은 단색 금색으로 */
                                <p className={`text-sm font-black truncate mb-1 ${p.isAllPos ? "text-amber-300" : "text-white"}`}>{p.isAllPos ? "올 포지션" : p.alias}</p>
                              )}
                              {p.isAllPos ? (
                                /* 한 줄만 있으면 카드가 비어 보인다 → 일반 카드와 같은 3단 구성으로 채운다 (모두 실제 정보) */
                                <div className="mb-2 mt-0.5">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="auc-cap text-amber-600/70 shrink-0">시작가</span>
                                    <span className="text-[13px] font-black text-amber-200 truncate tabular-nums">{(S.goldenBasePrice ?? 4000).toLocaleString()}</span>
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-0.5">
                                    <span className="auc-cap text-amber-600/70 shrink-0">티어</span>
                                    <span className="text-[13px] font-black text-amber-100/50 truncate">비공개</span>
                                  </div>
                                  <p className="text-[11px] font-black mt-1.5 pt-1.5 border-t border-amber-400/20 leading-snug break-keep">
                                    {canSeePos(p) ? (
                                      <span className="text-amber-100">{revealParts(p).map((r) => r.v).join(" · ")}</span>
                                    ) : p.hasMost ? (
                                      <span className="text-amber-200/50">스카우터 {(S.goldenScoutCost ?? 4000).toLocaleString()}pt</span>
                                    ) : (
                                      <span className="text-amber-200/40">공개 정보 없음</span>
                                    )}
                                  </p>
                                </div>
                              ) : (
                                /* 낙찰돼도 정보는 남긴다 — 누가 얼마에 어떤 선수를 가져갔는지가 이후 판단의 근거다 */
                                <div className="mb-2 mt-0.5">
                                  {/* 최고·현재 모두 판단 근거 — 라벨만 초소형으로 두고 값은 같은 무게로 */}
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="auc-cap text-gray-700 shrink-0">최고</span>
                                    <span className="text-[13px] font-black text-white truncate">{p.peakTier || "?"}</span>
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-0.5">
                                    <span className="auc-cap text-gray-700 shrink-0">현재</span>
                                    <span className="text-[13px] font-black text-gray-300 truncate">{p.currentTier || "?"}</span>
                                  </div>
                                  {/* 미사용일 때 이 줄을 비우면 카드가 들쭉날쭉해진다 → 항상 채운다.
                                      유찰은 다시 호명될 수 있어 비용을 안내하고, 그 외에는 '미사용'만 표기 */}
                                  <p className="text-[11px] font-black mt-1.5 pt-1.5 border-t border-white/[0.07] leading-snug break-keep">
                                    {canSeePos(p) ? (
                                      /* 주 포지션만 흰색 볼드 — 입찰 판단의 핵심이 평평해지지 않도록 */
                                      revealParts(p).map((r, ri) => (
                                        <span key={ri}>
                                          {ri > 0 && <span className="text-gray-700 mx-1">·</span>}
                                          <span className={ri === 0 ? "text-white" : r.pos ? "text-gray-500" : "text-gray-400"}>{r.v}</span>
                                        </span>
                                      ))
                                    ) : p.status === "유찰" ? (
                                      <span className="text-gray-500">스카우터 {scoutCostOf(p).toLocaleString()}pt</span>
                                    ) : (
                                      <span className="text-gray-600">스카우터 미사용</span>
                                    )}
                                  </p>
                                </div>
                              )}
                            </>
                          )}

                          {/* 상태 문구는 상단 뱃지로 이미 드러나므로 아래에는 '행동/결과'만 남긴다 */}
                          <div className={`mt-auto ${p.status === "낙찰" || (p.status === "배정중" && role === "host") || callable ? "pt-1.5 border-t border-white/[0.05]" : ""}`}>
                            {p.status === "낙찰" ? (
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-gray-500 truncate flex-1">{auction.leaders[p.soldTo]?.name} · {p.soldPrice?.toLocaleString()} Pt</p>
                                {role === "host" && p.discordId && !p.revealed && (
                                  <button onClick={() => act({ action: "host:reveal", playerIdx: i })} className="shrink-0 text-[9px] font-black text-gray-200 bg-white/[0.07] border border-white/25 px-2 py-0.5 rounded hover:bg-white/10 transition-colors">공개</button>
                                )}
                                {role === "host" && (
                                  <button onClick={() => setConfirmCfg({ title: "낙찰 취소", message: `${p.alias} 선수의 낙찰을 취소합니다.\n${auction.leaders[p.soldTo]?.name} 팀에서 제외되고 ${p.soldPrice?.toLocaleString()} Point가 환불됩니다.`, confirmLabel: "취소 확정", onConfirm: () => act({ action: "host:unsold", playerIdx: i }) })} className="shrink-0 text-[9px] font-black text-orange-400/80 hover:text-orange-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded transition-colors">취소</button>
                                )}
                              </div>
                            ) : p.status === "배정중" && role === "host" ? (
                              <button onClick={() => setConfirmCfg({ title: "낙찰 취소", message: `${p.alias} 선수의 낙찰(배정 대기)을 취소하고 대기 상태로 되돌립니다.`, confirmLabel: "취소 확정", onConfirm: () => act({ action: "host:unsold", playerIdx: i }) })} className="w-full text-[10px] font-black text-orange-400/80 hover:text-orange-400 bg-white/5 border border-white/10 py-1.5 rounded-lg transition-colors">낙찰 취소</button>
                            ) : callable ? (
                              /* 📌 20장이 전부 레드 버튼이면 포인트 컬러가 죽는다 → 데스크톱에선 호버 시에만 드러낸다
                                  (자리는 항상 확보해 레이아웃이 튀지 않게. 터치 기기는 호버가 없으므로 항상 표시) */
                              <button
                                onClick={() => act({ action: "host:call", playerIdx: i })}
                                className="w-full text-[10px] font-black text-white bg-[#e91e3f]/85 hover:bg-[#e91e3f] py-1.5 rounded-lg transition-all md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                              >
                                호명
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        </div>

        {/* ═══ 우측: 실시간 채팅 + 로그 ═══ */}
        {/* 모바일: 경매 탭에 채팅이 함께 표시 (스트리밍 스타일 · 컴팩트 높이) */}
        {/* 알림 로그 패널은 제거 — 스카우터 결과는 즉시 팝업 + 콘솔의 '알림함'에서 모아 본다 */}
        <div className={`${mobileTab === "main" ? "flex" : "hidden"} lg:flex w-full xl:w-[350px] shrink-0 order-3 flex-col gap-4 xl:sticky xl:top-36 xl:self-start`}>

          {/* 넓은 화면에서만 세로로 끝없이 늘어나 길었다 → xl 에서만 상한을 둔다 (좁은 화면 높이는 종전 그대로) */}
          <div className="bg-[#0d0d0d] border border-white/[0.07] flex flex-col overflow-hidden h-[40vh] max-h-[360px] lg:h-[46vh] xl:h-[46vh] xl:max-h-[440px]">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
              <span className="auc-label text-gray-200">실시간 채팅</span>
              {/* 공지만 껐다 켤 수 있게 — 사람 대화만 보고 싶을 때 */}
              <button
                onClick={() => { const v = !showSystemChat; setShowSystemChat(v); try { localStorage.setItem("auctionShowSystemChat", v ? "1" : "0"); } catch {} sfxSelect(); showToast(v ? "공지를 표시합니다" : "공지를 숨깁니다"); }}
                title={showSystemChat ? "공지 숨기기" : "공지 표시"}
                className={`ml-auto flex items-center gap-1.5 px-2 py-1 border text-[9px] font-black transition-colors ${showSystemChat ? "border-white/25 text-gray-300 hover:border-white hover:text-white" : "border-white/10 text-gray-600 hover:text-gray-300"}`}
              >
                <MegaphoneIcon className="w-2.5 h-2.5 shrink-0" />
                공지 {showSystemChat ? "ON" : "OFF"}
              </button>
            </div>
            <div ref={chatBoxRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {chat.length === 0 && <p className="text-center text-[11px] text-gray-700 py-6">아직 메시지가 없습니다.</p>}
              {chat.filter((m: any) => showSystemChat || !(m.isSystem && m.kind !== "join")).map((m: any, i: number) => m.kind === "join" ? (
                /* 입장 알림 — 최소화 표시 */
                <p key={m._id || i} className="text-center text-[10px] text-gray-600 py-0.5">{m.message}</p>
              ) : m.isSystem ? (
                /* 🐛 기존엔 행 전체가 가운데 정렬이라 글 길이에 따라 확성기 위치가 계속 움직였다.
                      → 좌측 상단에 고정하고 본문은 왼쪽 정렬. 중요 공지는 레드로 구분한다. */
                (() => {
                  const high = SYS_HIGH.test(m.message || "");
                  return (
                    <div key={m._id || i} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 ${high ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.08]" : "border-white/20 bg-white/[0.05]"}`}>
                      <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${high ? "bg-[#e91e3f]/25" : "bg-white/[0.08]"}`}>
                        <MegaphoneIcon className={`w-3 h-3 shrink-0 ${high ? "text-[#ff5c77]" : "text-gray-300"}`} />
                      </span>
                      <p className={`flex-1 min-w-0 text-[11px] font-bold leading-relaxed break-keep ${high ? "text-gray-100" : "text-gray-400"}`}>{m.message}</p>
                    </div>
                  );
                })()
              ) : (
                <div key={m._id || i} className="flex items-start gap-2">
                  {m.avatar ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full shrink-0 mt-0.5" /> : <span className="w-5 h-5 rounded-full bg-white/10 shrink-0 mt-0.5"></span>}
                  <p className="text-xs leading-relaxed min-w-0"><span className="font-bold text-gray-300">{m.userName}</span> <span className="text-gray-400 break-all">{m.message}</span></p>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="p-3 border-t border-white/5 flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} maxLength={200} placeholder="메시지 입력..." className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-white/40 transition-colors placeholder:text-gray-600" />
              <button type="submit" className="px-4 py-2.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-xs font-black rounded-xl transition-colors">전송</button>
            </form>
          </div>

          <div className="hidden lg:block shrink-0 bg-[#0d0d0d] border border-white/[0.07] p-4 max-h-40 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10">
            <p className="text-[10px] font-black auc-mono text-gray-500 uppercase mb-2.5">경매 로그</p>
            <div className="space-y-1">
              {[...auction.log].reverse().map((l: any, i: number) => (
                <p key={i} className="text-[10px] text-gray-500 leading-relaxed"><span className="text-gray-700">{new Date(l.t).toLocaleTimeString("ko-KR", { hour12: false })}</span> {l.msg}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 📌 인벤토리 팝업 — 내 팀은 드래그로 배정, 타 팀은 열람 전용 */}
      {invModal !== null && auction.leaders[invModal] && (() => {
        const li = invModal;
        const l = auction.leaders[li];
        const mine = role === "host" || myLeaderIdx === li;
        const canManage = mine && auction.status === "진행중"; // 배정/교환 (본인 팀·진행자만)
        const canSelect = true; // 카드 선택·정보 열람은 누구나 (타 팀 포함)
        const cardName = (card: any) => {
          const cp = auction.players[card.playerIdx];
          if (cp?.revealed) return cp.discordId && profiles[cp.discordId] ? profiles[cp.discordId].globalName : cp.alias;
          if (card.golden) return "올 포지션 선수";
          return cp?.alias;
        };
        // 배정 실행 (되돌릴 수 없음)
        const doPlace = async (invIdx: number, slot: string) => {
          const card = l.inventory?.[invIdx];
          if (!card) return;
          const nm = cardName(card);
          const d = await act({ action: "assign:place", leaderIdx: li, invIdx, slot, byLeaderIdx: myLeaderIdx });
          if (d?.success) {
            sfxAssign();
            setDragCard(null);
            if (d.autoEjected) {
              // 📌 올 포지션 초과 배정 — 밀려난 선수가 자동으로 보유 선수로 복귀
              setMoveFrom(null);
              sfxSelect();
              showToast(`${nm} → [${slot}] 배정 · ${d.autoEjected} 선수가 보유 선수로 돌아왔습니다`);
            } else if (d.overflow) {
              // 후보가 둘 이상이라 자동 복귀 불가 — 리더가 내보낼 선수를 직접 선택
              setMoveFrom(null);
              showToast(`${nm} → [${slot}] 초과 배정 · 내보낼 선수를 선택해주세요`);
            } else {
              showToast(`${nm} → [${slot}] 배정 완료 (되돌릴 수 없음)`);
            }
          } else {
            showToast(d?.message || "배정에 실패했습니다");
          }
        };
        // 📌 배정 완료된 선수 카드 (흑백으로 계속 열람 가능) — key는 인벤토리 인덱스와 겹치지 않게 음수 사용
        const assignedCards = (l.roster || [])
          .map((r: any, ri: number) => ({ r, ri }))
          .filter(({ r }: any) => r.playerIdx !== -1)
          .map(({ r, ri }: any) => ({
            key: -1000 - ri,
            slot: r.slot,
            card: { playerIdx: r.playerIdx, price: r.price, golden: r.golden },
          }));
        // 📌 황금카드 초과 배정 정리를 인벤토리 안에서 처리
        const invOverflow = hasOverflow && po.leaderIdx === li && canManage;
        // 선택 대상 카드 조회 (인벤토리 + 배정 완료 공용)
        const selectedCard = dragCard === null ? null
          : dragCard >= 0 ? (l.inventory?.[dragCard] || null)
          : (assignedCards.find((a: any) => a.key === dragCard)?.card || null);
        const selectedSlot = dragCard !== null && dragCard < 0 ? assignedCards.find((a: any) => a.key === dragCard)?.slot : null;

        // 최초 1회만 불가역 경고 → 이후 바로 배정
        const requestPlace = (invIdx: number, slot: string) => {
          const card = l.inventory?.[invIdx];
          if (!card) return;
          if (!warnedRef.current) { setAssignWarn({ invIdx, slot, name: cardName(card) }); return; }
          doPlace(invIdx, slot);
        };
        return (
          <div className="auc-modal-back z-[118] animate-in fade-in" onClick={() => { setInvModal(null); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); }}>
            {/* 고정 높이 — 카드가 늘어나도 팝업은 그대로, 카드 영역만 스크롤 */}
            <div onClick={(e) => e.stopPropagation()} className="auc-modal sm:max-w-4xl h-[88dvh] sm:h-[560px] sm:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
              <span className="auc-modal-line bg-white/35" />
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/12 shrink-0">
                <span className="auc-label text-gray-500">Inventory</span>
                <span className="text-sm font-black text-white truncate">{l.name}</span>
                <span className="text-[11px] font-black text-gray-400 tabular-nums">{l.inventory?.length || 0}장</span>
                {!mine && <span className="auc-cap text-gray-600 border border-white/12 px-1.5 py-1">열람 전용</span>}
                <button onClick={() => { setInvModal(null); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); }} className="ml-auto p-1.5 -mr-1 text-gray-500 hover:text-white hover:bg-white/5 transition-colors outline-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* 가로 2단 — 팝업 크기는 고정, 각 영역 내부만 스크롤 */}
              <div className="p-5 flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-stretch">

                {/* ══ 좌측 ══ */}
                <div className="order-2 lg:order-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden space-y-4">
                  {/* ── 선택한 선수 정보 카드 ── */}
                  {(() => {
                    const sel = selectedCard;
                    if (!sel) {
                      // 선택 전에도 동일한 높이를 유지해 레이아웃이 밀리지 않도록
                      return (
                        <div className="flex gap-5 h-[190px] items-center">
                          <div className="shrink-0 w-[132px] aspect-[3/4.3] rounded-xl border border-dashed border-white/12 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-white/10"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 font-bold">오른쪽에서 선수를 선택하세요</p>
                            <p className="text-[10px] text-gray-700 mt-1">선택한 선수의 정보가 여기에 표시됩니다</p>
                          </div>
                        </div>
                      );
                    }
                    const sp = auction.players[sel.playerIdx];
                    const scouted = sp && canSeePos(sp);
                    return (
                      // 외곽 박스 없이 카드 + 헤어라인 정보 (박스 중첩 제거)
                      <div className="flex gap-5 h-[190px]">
                        {/* 세로 카드 — 우측 목록 카드와 동일 규격 */}
                        <div className={`relative shrink-0 w-[132px] aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 ${sel.golden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.18] via-amber-500/[0.06] to-[#0d0d0d] shadow-[0_0_18px_rgba(251,191,36,0.18)]" : "border-white/12 bg-gradient-to-b from-white/[0.06] to-[#0d0d0d]"}`}>
                          {sel.golden && <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-amber-200/15 to-transparent"></span>}
                          <span className={`relative text-[7px] font-black tracking-[0.2em] uppercase ${sel.golden ? "text-amber-300" : "text-gray-600"}`}>{sel.golden ? "Golden" : "Player"}</span>
                          <div className={`relative w-11 h-11 rounded-full flex items-center justify-center border ${sel.golden ? "border-amber-300/50 bg-amber-400/10" : "border-white/10 bg-white/[0.04]"}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${sel.golden ? "text-amber-300" : "text-gray-500"}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                          </div>
                          <div className="relative w-full text-center">
                            <p className="text-[10px] font-black text-white truncate leading-tight">{cardName(sel)}</p>
                            <p className={`text-[9px] font-black tabular-nums mt-0.5 ${sel.golden ? "text-amber-300" : "text-gray-200"}`}>{sel.price.toLocaleString()}</p>
                          </div>
                        </div>
                        {/* 정보 — 선(헤어라인)으로만 구분 */}
                        <div className="min-w-0 flex-1 flex flex-col">
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-black text-white truncate tracking-tight">{cardName(sel)}</p>
                            {sel.golden && <span className="shrink-0 text-[8px] font-black text-amber-300 border border-amber-400/45 bg-amber-400/10 rounded px-1.5 py-0.5">ALL</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className={`text-[11px] font-black tabular-nums ${sel.golden ? "text-amber-300" : "text-gray-200"}`}>{sel.price.toLocaleString()} <span className="text-gray-600 font-bold">Point 낙찰</span></p>
                            {selectedSlot && <span className={`text-[9px] font-black rounded px-1.5 py-0.5 border ${roleColor(selectedSlot).badge}`}>{roleAbbr(selectedSlot)} 배정됨</span>}
                          </div>
                          <div className="mt-3 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                            {[
                              { l: "최고 티어", v: sel.golden ? "비공개" : (sp?.peakTier || "-") },
                              { l: "현재 티어", v: sel.golden ? "비공개" : (sp?.currentTier || "-") },
                              { l: "스카우터", v: scouted ? revealInfo(sp) : "미확인" },
                            ].map((it, ii) => (
                              <div key={ii} className="flex items-baseline gap-3 py-[7px]">
                                <span className="w-16 shrink-0 auc-cap text-gray-600">{it.l}</span>
                                <span className={`text-[15px] font-black truncate ${it.v === "미확인" || it.v.includes("불가") || it.v === "비공개" ? "text-gray-600" : "text-white"}`}>{it.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── 포지션 지정 (드롭존) ── */}
                  <div className="pt-4 border-t border-white/[0.07]">
                  <p className="text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase mb-2.5">
                    포지션 지정
                    {swapMode && <span className="text-gray-200 font-black normal-case tracking-normal"> — 교환할 선수 2명을 선택하세요 ({swapPick.length}/2)</span>}
                    {invOverflow && <span className="text-amber-300 font-black normal-case tracking-normal"> — [{po.slot}] 에서 내보낼 선수를 선택하세요</span>}
                  </p>
                  {/* 초과 배정 안내 배너 */}
                  {invOverflow && (
                    <div className="mb-2 rounded-lg border border-amber-400/35 bg-amber-400/[0.07] px-3 py-2">
                      <p className="text-[10px] font-bold text-amber-200 leading-relaxed">올 포지션 선수가 <b>[{po.slot}]</b> 에 초과 배정되었습니다. 내보낼 선수 <b>한 명을 클릭</b>하면 보유 선수로 돌아가며, 원하는 포지션에 다시 배정할 수 있습니다.</p>
                      <LeaderPosPicker leaderIdx={li} />
                    </div>
                  )}
                  {/* 2열 그리드 — 한 포지션에 여러 명이 들어가면 셀 안에서 줄바꿈 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 items-start">
                    {roleList.map((slot) => {
                      const entries = l.roster.map((r: any, ri: number) => ({ r, ri })).filter(({ r }: any) => r.slot === slot);
                      const limit = slotLimitOf(slot);
                      const full = entries.length >= limit;
                      // 배정 완료 카드(음수 key)는 드롭 불가 · 황금카드는 이미 찬 슬롯에도 배정 가능
                      const dragIsInv = dragCard !== null && dragCard >= 0;
                      const draggingGolden = dragIsInv && !!l.inventory?.[dragCard as number]?.golden;
                      // 초과 정리 중에는 새 배정 불가 (먼저 밀려난 선수를 내보내야 함)
                      const dropOk = canManage && !swapMode && !invOverflow && dragIsInv && (!full || draggingGolden);
                      return (
                        <div
                          key={slot}
                          onDragOver={(e) => { if (dropOk) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); if (dropOk && dragCard !== null) requestPlace(dragCard, slot); }}
                          onClick={() => { if (dropOk && dragCard !== null) requestPlace(dragCard, slot); }}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 min-h-[36px] transition-all border ${dropOk ? "border-white/25 bg-white/[0.06] cursor-pointer" : "border-transparent bg-white/[0.035]"}`}
                        >
                          <span className={`shrink-0 text-[9px] font-black rounded px-1.5 py-0.5 border ${roleColor(slot).badge}`}>{roleAbbr(slot)}</span>
                          <span className="shrink-0 text-[9px] font-bold text-gray-600 tabular-nums">{entries.length}/{limit}</span>
                          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                            {entries.length === 0 ? (
                              <span className="text-[10px] text-gray-700">비어 있음</span>
                            ) : entries.map(({ r, ri }: any) => {
                              const picked = swapPick.includes(ri);
                              const selectable = swapMode && canManage;
                              // 초과 배정 정리: 초과된 슬롯의 비황금 선수를 클릭 → 보유 선수(인벤토리)로 복귀
                              const movable = invOverflow && slot === po.slot && !r.golden && r.playerIdx !== -1;
                              const canUnassign = role === "host" && auction.status === "진행중" && !swapMode && !invOverflow && r.playerIdx !== -1;
                              return (
                                <span
                                  key={ri}
                                  title={movable ? "클릭하면 보유 선수로 돌아갑니다" : undefined}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (movable) {
                                      const nm = rosterName(l, r);
                                      const d = await act({ action: "overflow:toInventory", leaderIdx: li, rosterIdx: ri, byLeaderIdx: myLeaderIdx });
                                      if (d?.success) { sfxSelect(); showToast(`${nm} 선수가 보유 선수로 돌아왔습니다 — 원하는 포지션에 배정하세요`); }
                                      else showToast(d?.message || "정리에 실패했습니다");
                                      return;
                                    }
                                    if (!selectable) return;
                                    setSwapPick((prev) => prev.includes(ri) ? prev.filter((x) => x !== ri) : prev.length >= 2 ? prev : [...prev, ri]);
                                    sfxSelect();
                                  }}
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold rounded-full pl-2 ${canUnassign ? "pr-1" : "pr-2"} py-0.5 border transition-all ${picked ? "border-[#e91e3f] bg-white/[0.07] text-white ring-1 ring-[#e91e3f]" : movable ? "border-amber-400/60 bg-amber-400/[0.10] text-amber-100 animate-pulse cursor-pointer hover:bg-amber-400/20" : selectable ? "border-white/20 bg-white/[0.06] text-gray-200 hover:border-white/35 cursor-pointer" : "border-white/10 bg-white/[0.05] text-gray-200"}`}
                                >
                                  <span className="truncate max-w-[110px]">{rosterName(l, r)}</span>
                                  {r.playerIdx === -1 && <span className="text-[8px] text-gray-500 font-black">리더</span>}
                                  {r.golden && <span className="text-[8px] text-amber-300 font-black">ALL</span>}
                                  {/* 진행자 전용: 오배정 정정 (인벤토리로 되돌림) */}
                                  {canUnassign && (
                                    <button
                                      type="button"
                                      title="진행자: 배정 해제 (인벤토리로)"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const nm = rosterName(l, r);
                                        const d = await act({ action: "host:unassign", leaderIdx: li, rosterIdx: ri });
                                        if (d?.success) { sfxSelect(); showToast(`${nm} 배정을 해제했습니다 (인벤토리로)`); }
                                        else showToast(d?.message || "해제에 실패했습니다");
                                      }}
                                      className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500/80 text-gray-400 hover:text-white text-[9px] font-black leading-none transition-colors"
                                    >×</button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                          {dropOk && <span className={`shrink-0 mt-1 text-[9px] font-black animate-pulse ${full ? "text-amber-400" : "text-gray-200"}`}>{full ? "초과 배정" : "배정"}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* 포지션 체인지 — 인벤토리 안에서 바로 실행 (배정 후 유일한 조정 수단 · 1회) */}
                  {canManage && (
                    <div className="mt-4 pt-3.5 border-t border-white/[0.07]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-gray-300">포지션 체인지</p>
                          <p className="text-[9px] text-gray-600">배정 후 포지션을 바꾸는 유일한 방법 · 팀당 1회 · {S.posChangeCost.toLocaleString()} Pt</p>
                        </div>
                        {l.positionChanged ? (
                          <span className="shrink-0 text-[9px] font-black text-gray-600 border border-white/10 rounded-full px-2.5 py-1">사용됨</span>
                        ) : swapMode ? (
                          <button onClick={() => { setSwapMode(false); setSwapPick([]); }} className="shrink-0 text-[10px] font-black text-gray-400 bg-white/5 border border-white/15 hover:text-white px-3 py-1.5 rounded-full transition-colors">취소</button>
                        ) : (
                          <button
                            disabled={l.roster.length < 2}
                            onClick={() => { if (l.roster.length < 2) { showToast("교환하려면 배정된 선수가 2명 이상이어야 합니다"); return; } setSwapMode(true); setSwapPick([]); setDragCard(null); sfxSelect(); showToast("교환할 선수 2명을 선택하세요"); }}
                            className="shrink-0 text-[10px] font-black text-gray-200 bg-white/[0.07] border border-white/25 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors"
                          >
                            포지션 교환하기
                          </button>
                        )}
                      </div>
                      {swapMode && (
                        <button
                          disabled={swapPick.length !== 2}
                          onClick={async () => {
                            if (swapPick.length !== 2) return;
                            const [a, b] = swapPick;
                            const na = rosterName(l, l.roster[a]), nb = rosterName(l, l.roster[b]);
                            const d = await act({ action: "host:posSwap", leaderIdx: li, a, b, byLeaderIdx: myLeaderIdx });
                            if (d?.success) { sfxAssign(); showToast(`${na} ↔ ${nb} 포지션 교환 완료`); setSwapMode(false); setSwapPick([]); }
                            else showToast(d?.message || "포지션 교환에 실패했습니다");
                          }}
                          className="mt-2.5 w-full py-2 text-[11px] font-black rounded-lg transition-all bg-[#e91e3f] hover:bg-[#d01634] disabled:bg-white/5 disabled:text-gray-600 text-white"
                        >
                          {swapPick.length === 2 ? `선택한 2명 교환 (${S.posChangeCost.toLocaleString()} Pt)` : `선수 ${2 - swapPick.length}명 더 선택`}
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                </div>

                {/* ══ 우측: 보유 선수 목록 ══ */}
                <div className="order-1 lg:order-2 lg:pl-5 lg:border-l lg:border-white/[0.07] min-h-0 flex flex-col">
                  <p className="shrink-0 text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase mb-2.5">
                    보유 선수 <span className="text-gray-200">{l.inventory?.length || 0}</span>
                    {assignedCards.length > 0 && <span className="text-gray-600"> / 배정 {assignedCards.length}</span>}
                    {!mine && <span className="text-gray-600 font-bold normal-case tracking-normal"> — 선택해 정보 확인</span>}
                  </p>
                  {(l.inventory?.length || 0) === 0 && assignedCards.length === 0 ? (
                    <p className="text-center text-xs text-gray-600 py-8 border border-dashed border-white/10 rounded-xl">보유 중인 선수가 없습니다.</p>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full p-1 space-y-3">
                      {/* 미배정 카드 */}
                      <div className="grid grid-cols-3 lg:grid-cols-2 gap-2.5 content-start">
                        {(l.inventory || []).map((card: any, ci: number) => {
                          const picked = dragCard === ci;
                          return (
                            <div
                              key={`inv-${ci}`}
                              draggable={canManage && !swapMode}
                              /* 드래그로 배정에 실패해도 선택은 유지 (좌측 정보가 사라지지 않도록) */
                              onDragStart={() => { draggingRef.current = true; if (dragCard !== ci) { setDragCard(ci); sfxSelect(); } }}
                              onDragEnd={() => { setTimeout(() => { draggingRef.current = false; }, 0); }}
                              onClick={() => { if (!canSelect || swapMode) return; if (draggingRef.current) return; const next = picked ? null : ci; setDragCard(next); if (next !== null) sfxSelect(); }}
                              className={`relative aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 select-none transition-colors ${card.golden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.18] via-amber-500/[0.06] to-[#0d0d0d] shadow-[0_0_18px_rgba(251,191,36,0.18)]" : "border-white/12 bg-gradient-to-b from-white/[0.06] to-[#0d0d0d]"} ${canManage && !swapMode ? "cursor-grab active:cursor-grabbing hover:border-white/35" : !swapMode ? "cursor-pointer hover:border-white/25" : ""} ${picked ? (card.golden ? "border-amber-300 ring-2 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.45)]" : "border-[#e91e3f] ring-2 ring-[#e91e3f] shadow-[0_0_18px_rgba(255,255,255,0.12)] bg-white/[0.08]") : ""}`}
                            >
                              {/* 황금카드 광택 */}
                              {card.golden && <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-amber-200/15 to-transparent"></span>}
                              <span className={`relative text-[7px] font-black tracking-[0.2em] uppercase ${card.golden ? "text-amber-300" : "text-gray-600"}`}>{card.golden ? "Golden" : "Player"}</span>
                              <div className={`relative w-11 h-11 rounded-full flex items-center justify-center border ${card.golden ? "border-amber-300/50 bg-amber-400/10" : "border-white/10 bg-white/[0.04]"}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${card.golden ? "text-amber-300" : "text-gray-500"}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                              </div>
                              <div className="relative w-full text-center">
                                <p className="text-[10px] font-black text-white truncate leading-tight">{cardName(card)}</p>
                                <p className={`text-[9px] font-black tabular-nums mt-0.5 ${card.golden ? "text-amber-300" : "text-gray-200"}`}>{card.price.toLocaleString()}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 배정 완료 카드 — 흑백, 정보 확인만 가능 */}
                      {assignedCards.length > 0 && (
                        <div className="pt-3 border-t border-white/[0.07]">
                          <p className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase mb-2">배정 완료</p>
                          <div className="grid grid-cols-3 lg:grid-cols-2 gap-2.5 content-start">
                            {assignedCards.map((ac: any) => {
                              const picked = dragCard === ac.key;
                              return (
                                <div
                                  key={ac.key}
                                  onClick={() => { if (!canSelect || swapMode) return; const next = picked ? null : ac.key; setDragCard(next); if (next !== null) sfxSelect(); }}
                                  className={`relative aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 select-none grayscale opacity-55 hover:opacity-80 transition-all ${swapMode ? "" : "cursor-pointer"} border-white/10 bg-gradient-to-b from-white/[0.05] to-[#0d0d0d] ${picked ? "opacity-100 grayscale-0 border-white/40 ring-2 ring-white/30" : ""}`}
                                >
                                  <span className="text-[7px] font-black tracking-[0.2em] uppercase text-gray-600">{ac.card.golden ? "Golden" : "Player"}</span>
                                  <div className="w-11 h-11 rounded-full flex items-center justify-center border border-white/10 bg-white/[0.04]">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                  </div>
                                  <div className="w-full text-center">
                                    <p className="text-[10px] font-black text-gray-300 truncate leading-tight">{cardName(ac.card)}</p>
                                    <p className="text-[9px] font-black text-gray-500 tabular-nums mt-0.5">{ac.slot}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ⚠️ 최초 1회 — 배정 불가역 경고 */}
            {assignWarn && (
              <AucModal
                label="Warning"
                tone="danger"
                title="배정은 되돌릴 수 없습니다"
                onClose={() => setAssignWarn(null)}
                actions={[
                  { text: "취소", onClick: () => setAssignWarn(null) },
                  { text: "배정하기", kind: "primary", onClick: () => { const w = assignWarn; warnedRef.current = true; setAssignWarn(null); if (w) doPlace(w.invIdx, w.slot); } },
                ]}
              >
                <p className="text-xs text-gray-400 leading-relaxed mt-2.5">
                  <b className="text-white">{assignWarn.name}</b> 선수를 <b className={roleColor(assignWarn.slot).text}>[{roleAbbr(assignWarn.slot)}]</b> 에 배정합니다.
                </p>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-3 pt-3 border-t border-white/[0.09]">
                  한 번 배정한 선수는 인벤토리로 되돌릴 수 없습니다. 배정 후 조정은 <b className="text-gray-300">포지션 체인지(팀당 1회)</b>로만 가능합니다.
                </p>
                <p className="text-[9px] text-gray-700 mt-2">이 안내는 처음 한 번만 표시됩니다.</p>
              </AucModal>
            )}
          </div>
        );
      })()}

      {/* 진행자 대행 슬롯 배정 (진행자 화면에서 배정 대기 시 — 좌측 레일 SlotBoard로도 가능) */}

      {/* 📮 알림함 — 스카우터 결과 모아보기 */}
      {noticeOpen && (
        <AucModal
          label="알림함"
          title="스카우터 결과"
          desc="나에게만 보이는 기록입니다. 새로고침해도 남아 있습니다."
          onClose={() => setNoticeOpen(false)}
          wide
          actions={[
            ...(notices.length > 0
              ? [{ text: "모두 지우기", onClick: () => { setNotices([]); setNoticeUnread(0); try { localStorage.removeItem(noticeKey(roleKeyRef.current)); } catch {} showToast("알림함을 비웠습니다"); } }]
              : []),
            { text: "닫기", kind: "primary" as const, onClick: () => setNoticeOpen(false) },
          ]}
        >
          <div className="mt-4 border-t border-white/12 max-h-[52vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
            {notices.length === 0 ? (
              <p className="py-10 text-center text-[11px] text-gray-700">
                아직 기록이 없습니다.<br />
                <span className="text-[10px] text-gray-800">스카우터를 사용하면 이곳에 쌓입니다</span>
              </p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="py-3 border-b border-white/[0.07]">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="auc-label-xs text-[#ff5c77]">{n.kind === "scout" ? "Scout" : "Notice"}</span>
                    <span className="text-[12px] font-black text-white truncate">{n.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-gray-600 tabular-nums">
                      {new Date(n.at).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {n.body && <p className="text-[11px] text-gray-400 leading-relaxed break-keep">{n.body}</p>}
                  {n.rows?.length > 0 && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1">
                      {n.rows.map((r: any, ri: number) => (
                        <span key={ri} className="flex items-baseline gap-1.5">
                          <span className="auc-cap text-gray-700">{r.l}</span>
                          <span className={`text-[13px] font-black ${r.pos ? roleColor(r.pos).text : "text-white"}`}>{r.v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </AucModal>
      )}

      {/* 🔔 스카우터 결과 즉시 팝업 — 잠깐 떴다 스스로 사라진다 */}
      {scoutFx && (
        <div className="fixed top-28 right-4 md:right-8 z-[126] w-[268px] pointer-events-none animate-[scoutIn_5.5s_ease-in-out_forwards]">
          <div className="relative border border-[#e91e3f]/50 bg-[#140a0d]/95 backdrop-blur-md shadow-[0_20px_50px_-16px_#000]">
            <span className="absolute inset-x-0 top-0 h-[2px] bg-[#e91e3f]" />
            <div className="px-4 py-3">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="auc-label-xs text-[#ff5c77]">Scout</span>
                <span className="text-[12px] font-black text-white truncate">{scoutFx.name}</span>
              </div>
              <div className="border-t border-white/12 pt-2">
                {scoutFx.rows?.map((r: any, ri: number) => (
                  <div key={ri} className="flex items-baseline gap-2 py-[3px]">
                    <span className="auc-cap text-gray-600 w-14 shrink-0">{r.l}</span>
                    <span className={`text-[13px] font-black truncate ${r.pos ? roleColor(r.pos).text : "text-white"}`}>{r.v}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-600 mt-2">알림함에 보관됩니다</p>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scoutIn {
              0%   { opacity: 0; transform: translateX(24px); }
              6%   { opacity: 1; transform: translateX(0); }
              88%  { opacity: 1; transform: translateX(0); }
              100% { opacity: 0; transform: translateX(16px); }
            }
          `}} />
        </div>
      )}

      {/* 공용 확인 모달 */}
      {confirmCfg && (
        <AucModal
          label="Confirm"
          tone="danger"
          title={confirmCfg.title}
          desc={confirmCfg.message}
          onClose={() => setConfirmCfg(null)}
          actions={[
            { text: "취소", onClick: () => setConfirmCfg(null) },
            { text: confirmCfg.confirmLabel || "확인", kind: "primary", onClick: () => { confirmCfg.onConfirm(); setConfirmCfg(null); } },
          ]}
        />
      )}

      {/* 전략 타임 시작 모달 */}
      {strategyModalOpen && (
        <AucModal
          label="Strategy Time"
          tone="info"
          title="전략 타임 시작"
          desc="리더와 선정된 팀원들이 전략을 논의하는 시간입니다. 진행 시간을 선택하세요. (진행 중 입찰 중지)"
          onClose={() => setStrategyModalOpen(false)}
          actions={[{ text: "취소", onClick: () => setStrategyModalOpen(false) }]}
        >
          <div className="flex mt-5 border-t border-b border-white/12">
            {[1, 3, 5].map((min) => (
              <button
                key={min}
                onClick={() => { act({ action: "host:strategy", seconds: min * 60 }); setStrategyModalOpen(false); sfxSelect(); }}
                className="flex-1 py-4 text-base font-black text-white border-l border-white/12 first:border-l-0 hover:bg-blue-500/15 hover:text-blue-300 transition-colors"
              >
                {min}<span className="text-[11px] font-bold text-gray-500 ml-0.5">분</span>
              </button>
            ))}
          </div>
        </AucModal>
      )}

      {/* 포지션 체인지 모달 */}
      {posSwapTarget && (() => {
        const leader = auction.leaders[posSwapTarget.leaderIdx];
        return (
          <AucModal
            label="Position Change"
            title={`${leader.name} — 포지션 체인지`}
            desc={`교환할 두 선수를 선택하세요. (${S.posChangeCost.toLocaleString()} Point · 팀당 1회)`}
            onClose={() => { setPosSwapTarget(null); setSwapA(""); setSwapB(""); }}
            actions={[
              { text: "취소", onClick: () => { setPosSwapTarget(null); setSwapA(""); setSwapB(""); } },
              {
                text: swapA !== "" && swapB !== "" ? "교환하기" : `${2 - [swapA, swapB].filter((x) => x !== "").length}명 더 선택`,
                kind: "primary",
                disabled: swapA === "" || swapB === "",
                onClick: async () => {
                  if (swapA === "" || swapB === "" || swapA === swapB) { showToast("서로 다른 두 선수를 선택해주세요"); return; }
                  const na = rosterName(leader, leader.roster[Number(swapA)]), nb = rosterName(leader, leader.roster[Number(swapB)]);
                  const d = await act({ action: "host:posSwap", leaderIdx: posSwapTarget.leaderIdx, a: Number(swapA), b: Number(swapB), byLeaderIdx: myLeaderIdx });
                  if (d?.success) { sfxAssign(); showToast(`${na} ↔ ${nb} 포지션 교환 완료`); setPosSwapTarget(null); setSwapA(""); setSwapB(""); }
                  else showToast(d?.message || "포지션 교환에 실패했습니다");
                },
              },
            ]}
          >
            {/* 선수 선택 — 선으로만 나뉜 목록 */}
            <div className="mt-4 border-t border-white/12 max-h-[42vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
              {leader.roster.map((r: any, ri: number) => {
                if (p1Role && r.slot === p1Role) return null; // 선경매 포지션은 교환 불가
                const sel = swapA === String(ri) ? 1 : swapB === String(ri) ? 2 : 0;
                return (
                  <button
                    key={ri}
                    type="button"
                    onClick={() => {
                      sfxSelect();
                      if (sel === 1) setSwapA("");
                      else if (sel === 2) setSwapB("");
                      else if (swapA === "") setSwapA(String(ri));
                      else if (swapB === "") setSwapB(String(ri));
                      else showToast("이미 2명을 선택했습니다. 선택을 해제한 뒤 다시 고르세요");
                    }}
                    className={`w-full flex items-center gap-2.5 px-1 py-2.5 border-b border-white/[0.07] text-left transition-colors ${sel ? "bg-[#e91e3f]/10" : "hover:bg-white/[0.04]"}`}
                  >
                    <span className={`shrink-0 w-9 text-[10px] font-black tracking-wider ${roleColor(r.slot).text}`}>{roleAbbr(r.slot)}</span>
                    <span className="flex-1 min-w-0 truncate text-[13px] font-black text-white">
                      {rosterName(leader, r)}
                      {r.playerIdx === -1 && <span className="ml-1.5 text-[9px] text-gray-500 font-black">리더</span>}
                    </span>
                    <span className={`shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-black border ${sel ? "border-[#e91e3f] bg-[#e91e3f] text-white" : "border-white/15 text-transparent"}`}>{sel || ""}</span>
                  </button>
                );
              })}
            </div>
          </AucModal>
        );
      })()}

      {/* 다음 매물 전환 배너 — 호명 즉시 전원 인지 */}
      {nextFx !== null && (
        <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[125] pointer-events-none">
          <div className="animate-[nextFxIn_2.2s_ease-in-out_forwards]">
            <div className="relative bg-gradient-to-b from-[#e91e3f]/60 via-[#e91e3f]/20 to-transparent p-px shadow-[0_16px_50px_rgba(0,0,0,0.6)]">
              <div className="bg-[#150a0d] px-7 py-4 flex items-center gap-3.5">
                <span className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center shrink-0">
                  <MegaphoneIcon className="w-4 h-4 text-gray-200" />
                </span>
                <div>
                  <p className="text-[9px] font-black auc-mono text-gray-500 uppercase">Next Player</p>
                  <p className="text-lg font-black text-white tracking-tight leading-tight">{nextFx} <span className="text-xs text-gray-400 font-bold">경매 시작</span></p>
                </div>
              </div>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes nextFxIn {
              0% { opacity: 0; transform: translateY(-16px) scale(0.92); }
              12%, 82% { opacity: 1; transform: translateY(0) scale(1); }
              100% { opacity: 0; transform: translateY(-10px) scale(0.96); }
            }
          `}} />
        </div>
      )}

      {/* 황금카드 소환 연출 — 홀로그램 포일 카드가 옆면에서 회전하며 정면으로 착지한다 */}
      {goldenFx && (
        <div className="fixed inset-0 z-[135] pointer-events-none overflow-hidden">
          {/* 배경 딤 + 골드 비네트 */}
          <div className="absolute inset-0 animate-[gcBackdrop_4.3s_ease-in-out_forwards]" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(24,17,3,0.9) 0%, rgba(0,0,0,0.97) 100%)" }}></div>

          {/* 착지 후 퍼지는 광선 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] animate-[gcRays_4.3s_linear_forwards]">
            {[0, 30, 60, 90, 120, 150].map((deg) => (
              <span key={deg} className="absolute top-1/2 left-1/2 w-[620px] h-[2px] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-yellow-300/25 to-transparent" style={{ transform: `translate(-50%,-50%) rotate(${deg}deg)` }}></span>
            ))}
          </div>

          {/* 중앙 글로우 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-yellow-400/20 blur-[100px] rounded-full animate-[gcGlow_4.3s_ease-in-out_forwards]"></div>

          {/* 리플 — 덱에서 튕겨 나온 '일반 카드'가 먼저 스쳐 간다 (사운드의 촤르르 구간).
              장수를 줄이고 간격을 벌려, 스치는 하나하나가 카드로 보이도록 한다. */}
          {[0, 0.2, 0.42, 0.62].map((d, i) => (
            <span key={i} className="auc-gdeal-fly" style={{ animationDelay: `${0.12 + d}s`, marginTop: `${(i - 1.5) * 40}px` }}></span>
          ))}

          {/* 착지 스냅 — 테이블에 꽂히는 납작한 파문 */}
          <span className="auc-gcard-snap"></span>
          <span className="auc-gcard-snap" style={{ animationDelay: "0.08s", borderColor: "rgba(251,191,36,.5)" }}></span>

          {/* ══ 홀로그램 포일 카드 ══ */}
          <div className="auc-gcard-stage">
            <div className="auc-gcard-outer">
              <div className="auc-gcard-spin">
                <div className="auc-gcard">
                  <div className="auc-gcard-face">
                    {/* ── 위: 초상 창 — 정체를 감춘 실루엣 ── */}
                    <div className="auc-gcard-window">
                      <span className="auc-gcard-guilloche"></span>
                      {/* 카드를 가로지르는 거대 워드마크 */}
                      <span className="auc-gcard-word">ALL</span>
                      {/* 실루엣 */}
                      <span className="auc-gcard-figure">
                        <svg viewBox="0 0 64 58" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <circle cx="32" cy="16" r="13" />
                          <path d="M32 32c14.4 0 26 9.6 26 21.4V58H6v-4.6C6 41.6 17.6 32 32 32z" />
                        </svg>
                      </span>
                      {/* 일련번호 · 등급 */}
                      <span className="absolute top-2.5 left-3 auc-label-xs text-yellow-500/70">No.007</span>
                      <span className="absolute top-2.5 right-3 auc-label-xs text-yellow-300/85">Golden</span>
                    </div>

                    {/* ── 아래: 명판 ── */}
                    <div className="auc-gcard-plate">
                      <p className="text-[19px] md:text-[22px] font-black tracking-tight leading-none auc-gold-text">올 포지션</p>
                      <p className="auc-label-xs text-yellow-500/60 mt-1.5">All Position</p>

                      {/* 능력치 — 이름과 겹치지 않는 정보만: 시작가와 비공개 티어 */}
                      <div className="flex mt-3 pt-2.5 border-t border-yellow-400/25">
                        <div className="flex-1 pr-3">
                          <p className="auc-label-xs text-yellow-600/70">시작가</p>
                          <p className="text-[13px] font-black text-yellow-100 leading-tight mt-1 tabular-nums">{(S.goldenBasePrice ?? 4000).toLocaleString()}</p>
                        </div>
                        <span className="w-px bg-yellow-400/20"></span>
                        <div className="flex-1 pl-3">
                          <p className="auc-label-xs text-yellow-600/70">티어</p>
                          <p className="text-[13px] font-black text-yellow-100/45 leading-tight mt-1">비공개</p>
                        </div>
                      </div>
                    </div>

                    {/* 표면 광원 + 금선 프레임 (카드 전체에) */}
                    <span className="auc-gcard-light"></span>
                    <span className="absolute inset-[7px] rounded-[7px] border border-yellow-400/30 pointer-events-none"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 착지 순간 파티클 */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * 360;
            return (
              <span key={i} className="absolute top-1/2 left-1/2 text-yellow-300 text-sm" style={{ opacity: 0, animation: `gcSpark 1s ease-out ${2.05 + (i % 3) * 0.05}s forwards`, ["--sx" as any]: `${Math.cos((angle * Math.PI) / 180) * 190}px`, ["--sy" as any]: `${Math.sin((angle * Math.PI) / 180) * 190}px` }}>✦</span>
            );
          })}

          {/* 타이틀 */}
          <div className="absolute inset-x-0 top-1/2 flex justify-center animate-[gcTitle_4.3s_ease-in-out_forwards]" style={{ transform: "translateY(11.5rem)" }}>
            <p className="text-2xl md:text-4xl font-black auc-mono uppercase auc-gold-text">Golden Card</p>
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes gcBackdrop {
              0% { opacity: 0; }
              10%, 86% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes gcRays {
              0%, 42% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg); }
              54%, 84% { opacity: 1; }
              100% { opacity: 0; transform: translate(-50%, -50%) rotate(48deg); }
            }
            @keyframes gcGlow {
              0%, 34% { opacity: 0; }
              54%, 84% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes gcSpark {
              0% { opacity: 1; transform: translate(-50%, -50%) scale(0.4); }
              100% { opacity: 0; transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1.3); }
            }
            @keyframes gcTitle {
              0%, 58% { opacity: 0; letter-spacing: 0.5em; }
              70%, 86% { opacity: 1; letter-spacing: 0.25em; }
              100% { opacity: 0; }
            }
          `}} />
        </div>
      )}

      {/* 진행자: 포인트 조정 모달 */}
      {adjustTarget !== null && (() => {
        const leader = auction.leaders[adjustTarget];
        return (
          <AucModal
            label="Point Adjustment"
            title={`${leader.name} — 포인트 조정`}
            onClose={() => setAdjustTarget(null)}
            actions={[{ text: "닫기", onClick: () => setAdjustTarget(null) }]}
          >
            <p className="text-xs text-gray-400 mt-2.5">
              현재 보유 <span className="text-white font-black tabular-nums">{leader.points.toLocaleString()}</span> Point
            </p>
            <input
              type="number"
              placeholder="조정할 금액 (예: 5000)"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="w-full mt-4 py-2.5 bg-transparent border-b border-white/20 focus:border-white text-lg text-white text-center font-black tabular-nums outline-none transition-colors placeholder:text-gray-700 placeholder:text-sm placeholder:font-bold"
            />
            <div className="flex mt-4 border-t border-b border-white/12">
              <button
                onClick={async () => { const v = Math.abs(Number(adjustAmount)); if (!v) { showToast("조정할 금액을 입력해주세요"); return; } const d = await act({ action: "host:adjustPoints", leaderIdx: adjustTarget, delta: v }); if (d.success) { sfxSelect(); showToast(`${leader.name} +${v.toLocaleString()} Point`); setAdjustTarget(null); } }}
                className="flex-1 py-3.5 text-sm font-black text-emerald-400 hover:bg-emerald-500/15 transition-colors"
              >
                + 추가
              </button>
              <button
                onClick={async () => { const v = Math.abs(Number(adjustAmount)); if (!v) { showToast("조정할 금액을 입력해주세요"); return; } const d = await act({ action: "host:adjustPoints", leaderIdx: adjustTarget, delta: -v }); if (d.success) { sfxSelect(); showToast(`${leader.name} −${v.toLocaleString()} Point`); setAdjustTarget(null); } }}
                className="flex-1 py-3.5 text-sm font-black text-[#ff5c77] border-l border-white/12 hover:bg-[#e91e3f]/20 transition-colors"
              >
                − 차감
              </button>
            </div>
          </AucModal>
        );
      })()}

      {/* 진행자: 리더 포지션 지정/변경 모달 */}
      {posSetTarget !== null && (() => {
        const leader = auction.leaders[posSetTarget];
        return (
          <AucModal
            label="Leader Position"
            title={`${leader.name} — 포지션 ${leader.position ? "변경" : "지정"}`}
            desc={leader.position ? `현재 [${leader.position}] — 선택한 포지션 슬롯으로 이동합니다.` : "리더 본인이 차지할 슬롯을 지정합니다."}
            onClose={() => setPosSetTarget(null)}
            actions={[{ text: "닫기", onClick: () => setPosSetTarget(null) }]}
          >
            <div className="flex flex-wrap mt-4 border-t border-b border-white/12">
              {roleList.map((pos: string) => (
                <button
                  key={pos}
                  disabled={leader.position === pos}
                  onClick={async () => { const d = await act({ action: "host:setLeaderPos", leaderIdx: posSetTarget, position: pos }); if (d.success) { sfxSelect(); showToast(`${leader.name} 리더 포지션 → ${pos}`); setPosSetTarget(null); } }}
                  className={`flex-1 min-w-[72px] py-3.5 text-sm font-black border-l border-white/12 first:border-l-0 transition-colors ${leader.position === pos ? "bg-white/[0.07] text-gray-400 cursor-default" : `${roleColor(pos).text} hover:bg-white/10`}`}
                >
                  {pos}
                  {leader.position === pos && <span className="block auc-cap text-gray-600 mt-1">현재</span>}
                </button>
              ))}
            </div>
          </AucModal>
        );
      })()}

      {toast && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-[#1a1a1a] border border-white/15 text-white text-xs font-bold px-5 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </main>
  );
}
