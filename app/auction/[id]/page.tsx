"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LuxStyles } from "../../components/Lux";
import { AuctionStyles } from "../../components/AuctionStyles";
import { roleNames, totalSlots as totalSlotsFn, slotLimitOf as slotLimitOfFn, phase1RoleOf } from "@/lib/auctionGames";

const ADMIN_USERS = ["elahw.06"];
const POLL_MS = 1500;      // 평상시
const POLL_FAST_MS = 600;  // 매물이 호명돼 입찰이 오가는 동안

// 확성기 SVG
const MegaphoneIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73" />
  </svg>
);

// 📌 중요도 높은 시스템 공지 — 채팅에서 레드로 구분한다 (서버 스키마 변경 없이 문구로 판별)
// 📱 모바일 전용 접이식 섹션 — 정보가 한 화면에 전부 펼쳐져 있으면 밀도가 너무 높다.
//    ⚠️ 렌더 함수 밖에 둔다 (안에서 정의하면 폴링마다 언마운트/재마운트된다)
const MobFold = ({ title, sub, open, onToggle, children }: {
  title: string; sub?: React.ReactNode; open: boolean; onToggle: () => void; children?: React.ReactNode;
}) => (
  <section className="lg:hidden">
    <button onClick={onToggle} className="w-full flex items-center gap-2.5 pb-2 border-b border-white/20 text-left">
      <span className="auc-label text-white">{title}</span>
      {sub && <span className="text-[10px] font-bold text-gray-600 tabular-nums">{sub}</span>}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
        className={`ml-auto w-3 h-3 shrink-0 text-gray-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {open && children}
  </section>
);

// ⚠️ 렌더 함수 안에서 컴포넌트를 정의하면 폴링(1.5초)마다 새 타입이 되어 매번 언마운트/재마운트된다.
//    호버·트랜지션이 끊겨 깜빡이므로 모듈 스코프에 둔다. (props 만 쓰므로 클로저 의존 없음)
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
        className={`auc-modal ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} max-h-[88dvh] overflow-y-auto animate-in zoom-in-95 duration-200`}
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

  const [miniChat, setMiniChat] = useState(false); // 모바일 우하단 팝업 채팅
  const [sheet, setSheet] = useState<null | "teams">(null); // 모바일 하단 시트 (타 팀)
  const [teamView, setTeamView] = useState<number | null>(null); // 모바일 단일 팀 프로필 (리더 idx)
  const [mobPick, setMobPick] = useState<number | null>(null); // 모바일 인벤토리: 배정할 카드
  const [mobBid, setMobBid] = useState(false); // 모바일 직접 입찰 팝업
  // 📱 모바일 섹션 접힘 — 기본값은 '선수 목록만 접힘' (한 화면 정보량을 줄인다)
  const [mobFold, setMobFold] = useState<{ slots: boolean; race: boolean; players: boolean }>({ slots: true, race: true, players: false });
  const [chatUnread, setChatUnread] = useState(0); // 모바일에서 채팅 탭에 없을 때 쌓인 새 메시지
  const [bidFlash, setBidFlash] = useState<{ idx: number; n: number } | null>(null); // 입찰한 팀 강조 (좌측 레일)
  const [showSystemChat, setShowSystemChat] = useState(true); // 채팅의 공지 표시 on/off
  const [noticeOpen, setNoticeOpen] = useState(false);        // 알림함 모달
  const [noticeUnread, setNoticeUnread] = useState(0);        // 안 읽은 알림 수
  const [scoutFx, setScoutFx] = useState<any>(null);          // 스카우터 결과 즉시 팝업 (자동 소멸)
  const [revealFx, setRevealFx] = useState(false); // 프로필 공개 연출 표시 중인지 (시간 제한)
  const revealSeen = useRef<number | null>(null);  // 이미 띄운 공개 대상
  const chatScrolledOnce = useRef(false);          // 첫 채팅 렌더에서 맨 아래로 내렸는지
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const miniChatBoxRef = useRef<HTMLDivElement>(null);
  const lastChatAt = useRef<string | null>(null);
  const chatIds = useRef<Set<string>>(new Set());
  const chatCooldown = useRef(0);
  const pollBusy = useRef(false);
  const pollTimer = useRef<any>(null);
  const pollDelay = useRef(POLL_MS);
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
      const fold = localStorage.getItem("auctionMobFold");
      if (fold) setMobFold((prev) => ({ ...prev, ...JSON.parse(fold) }));
    } catch {}
  }, []);

  // 접힘 상태는 기기별로 유지한다
  const toggleFold = (k: "slots" | "race" | "players") => {
    setMobFold((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem("auctionMobFold", JSON.stringify(next)); } catch {}
      return next;
    });
    sfxSelect();
  };

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
  const sfxBid = useCallback(() => playTone(760, 0.07, 0.035), [playTone]);
  // 다음 매물 호명 — 리더들이 바로 인지하도록 또렷한 3음 차임
  const sfxCall = useCallback(() => { playTone(523, 0.11, 0.05); setTimeout(() => playTone(659, 0.11, 0.05), 120); setTimeout(() => playTone(988, 0.2, 0.055), 240); }, [playTone]);
  // 낙찰 축하 (경쾌한 아르페지오 + 반짝임, 과하지 않게)
  const sfxSold = useCallback(() => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 0.04), i * 80));
    setTimeout(() => playTone(1047, 0.22, 0.045), 260);
    setTimeout(() => playTone(1568, 0.12, 0.02, "triangle"), 340);
  }, [playTone]);
  // 낙찰 선언 (경매봉 두드림 — 탁! 탁!)
  const sfxHammer = useCallback(() => {
    playTone(180, 0.09, 0.07, "square");
    playTone(90, 0.12, 0.06, "sine");
    setTimeout(() => { playTone(180, 0.09, 0.075, "square"); playTone(90, 0.14, 0.065, "sine"); }, 180);
    setTimeout(() => playTone(659, 0.25, 0.04), 420);
  }, [playTone]);
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
          // 내 입찰은 누른 즉시 소리를 냈으므로 여기서 또 울리지 않는다 (두 번 나는 것 방지)
          if (a.current.leaderIdx === null || a.current.leaderIdx !== roleRef.current) {
            if (a.current.isAllin) sfxAllin(); else sfxBid();
          }
          // 📌 누가 질렀는지 좌측 팀 레일에서 즉시 알아보도록 해당 팀을 번쩍인다
          if (a.current.leaderIdx !== null && a.current.leaderIdx !== undefined) {
            setBidFlash({ idx: a.current.leaderIdx, n: Date.now() });
          }
        }
        // 낙찰 선언(배정 대기 진입) → 망치 소리
        const paIdx = a.pendingAssign?.playerIdx ?? null;
        if (paIdx !== null && paIdx !== (ps.paIdx ?? null)) sfxHammer();
        if (soldCount > (ps.soldCount || 0)) sfxSold();
        if (passCount > (ps.passCount || 0)) sfxPass();
        if (revealIdx !== null && revealIdx !== ps.revealIdx) sfxReveal();
        if (strategyOn && !ps.strategyOn) sfxStrategy();
        if (ps.status === "준비중" && a.status === "진행중") sfxStart();
        if (ps.status === "진행중" && a.status === "종료") sfxEnd();
        if ((ps.phase ?? 0) < a.phase) sfxPhase();
        prevState.current = { ...ps, price: a.current.price, playerIdx: a.current.playerIdx, soldCount, passCount, revealIdx, strategyOn, status: a.status, phase: a.phase, paIdx };

        // 📌 매물이 올라와 입찰이 오가는 동안엔 빠르게, 그 외에는 평상시 주기로.
        //    (관전자·타 리더 화면에서 호가와 효과음이 뒤늦게 따라오던 문제 완화)
        pollDelay.current = a.status === "진행중" && a.current.playerIdx !== null ? POLL_FAST_MS : POLL_MS;

        // 🐛 입찰 직후, 입찰 전에 이미 날아가 있던 폴링 응답이 도착하면 방금 반영한 최고가가
        //    되돌아가 '입찰이 안 먹은' 것처럼 보였다 (그래서 한 번 더 눌러야 했다).
        //    같은 매물 안에서 호가는 절대 내려가지 않으므로, 더 낮은 값이 오면 현재 값을 지킨다.
        setAuction((prev: any) => {
          if (
            prev && a.current &&
            prev.current?.playerIdx !== null && prev.current?.playerIdx !== undefined &&
            prev.current.playerIdx === a.current.playerIdx &&
            (prev.current.price ?? 0) > (a.current.price ?? 0)
          ) {
            return { ...a, current: { ...prev.current } };
          }
          return a;
        });
        if (d.chat?.length) {
          const fresh = d.chat.filter((m: any) => !chatIds.current.has(m._id));
          if (fresh.length) {
            fresh.forEach((m: any) => chatIds.current.add(m._id));
            if (fresh.some((m: any) => !m.isSystem)) { sfxChat(); setChatUnread((u) => u + fresh.filter((m: any) => !m.isSystem).length); }
            setChat((prev) => [...prev, ...fresh].slice(-150));
            lastChatAt.current = d.chat[d.chat.length - 1].createdAt;
          }
        }
      } catch {} finally {
        pollBusy.current = false;
        // 다음 폴링을 스스로 예약 — 응답이 늦어도 겹치지 않고, 진행 중일 때만 빠르게 돈다
        if (alive) pollTimer.current = setTimeout(poll, pollDelay.current);
      }
    };
    poll();
    return () => { alive = false; if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [id, status, sfxBid, sfxCall, sfxSold, sfxPass, sfxAllin, sfxReveal, sfxStrategy, sfxStart, sfxEnd, sfxPhase, sfxChat, sfxGolden, sfxHammer]);

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

  // 🐛 미니 채팅을 열면 맨 위(과거 메시지)부터 보이던 문제 — 열릴 때와 새 메시지 도착 시 맨 아래로
  useEffect(() => {
    if (!miniChat) return;
    const box = miniChatBoxRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [miniChat, chat.length]);

  // 📌 인벤토리가 용량을 넘기면 배너로 알리는 정도가 아니라 인벤토리를 강제로 연다.
  //    (배정 전까지 입찰이 막히므로, 지금 해야 할 일을 화면에 바로 띄운다)
  //    한 번 열고 나면 닫을 수 있게 하되, 다시 초과 상태가 되면 또 열린다.
  const invForcedRef = useRef(false);
  useEffect(() => {
    if (!auction) return;
    const S0 = auction.settings;
    if (S0?.assignMode !== "inventory") return;
    const mi = role === "host" || role === "spec" ? null : Number(role);
    if (mi === null) return;
    const me = auction.leaders?.[mi];
    if (!me) return;
    const cap = Math.max(1, (S0.invCapacity ?? 1) + (me.invExtra || 0));
    const over = (me.inventory?.length || 0) > cap;
    if (!over) { invForcedRef.current = false; return; }
    if (invForcedRef.current) return;
    invForcedRef.current = true;
    setInvModal(mi);
    setDragCard(null);
    setSwapMode(false);
    setSwapPick([]);
    setMoveFrom(null);
    setMobPick(null);
  }, [auction, role]);

  // 입찰 강조는 1초 뒤 스스로 꺼진다 (애니메이션 길이와 맞춤)
  useEffect(() => {
    if (!bidFlash) return;
    const t = setTimeout(() => setBidFlash(null), 1000);
    return () => clearTimeout(t);
  }, [bidFlash]);

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

  // 📌 진행자 조작(시간 관련)이 폴링(최대 1.5초)을 기다려 늦게 반영되던 문제 —
  //    서버가 성공을 돌려주면 같은 값을 로컬에도 즉시 반영한다. (서버 시각 기준 serverNow 사용)
  const patchAuction = (mutate: (a: any) => void) => {
    setAuction((prev: any) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutate(next);
      return next;
    });
  };

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

  // 📌 인벤토리 용량 — 기본 용량 + 인벤토리 플러스로 산 칸. 초과 소지 시 배정 전까지 입찰 불가
  const invPlusCost = S.invPlusCost ?? 5000;
  const invCapOf = (l: any) => Math.max(1, (S.invCapacity ?? 1) + (l?.invExtra || 0));
  const invPlusUsed = (l: any) => (l?.invExtra || 0) >= 1; // 팀당 1회
  const myInvCap = myLeader ? invCapOf(myLeader) : 1;
  const myInvCount = myLeader?.inventory?.length || 0;
  const invOverCap = !!(myLeader && invMode && myInvCount > myInvCap);

  // 📱 모바일 하단 독의 높이 — 미니 채팅 버튼을 그 위에 띄우기 위해 계산
  //   ⚠️ 인벤토리 초과 시에는 입찰 UI 를 아예 띄우지 않는다 (서버도 403 으로 거부한다)
  // 입찰 바가 빠지면 그 자리에 초과 안내 줄이 들어가므로 높이를 같이 센다
  // 슬롯 줄 40 + 프로필 52 (+ 대기 중 인벤토리 경고 50)
  const bottomBarH = (myLeader ? 92 : 0) + (invOverCap && !curPlayer ? 50 : 0);

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
    // ⚠️ 인벤토리 초과 중에는 어떤 경로로도 입찰이 나가지 않게 한다 (서버 403 과 이중 방어)
    if (invOverCap) { showToast(`인벤토리가 가득 찼습니다 (${myInvCount}/${myInvCap}) — 선수를 배정한 뒤 입찰할 수 있습니다`); return; }
    if (myLeader && amount > myLeader.points) { showToast(`보유 Point가 부족합니다. (보유 ${myLeader.points.toLocaleString()} Point)`); return; }
    const d = await act({ action: "bid", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx, amount });
    // 📌 폴링 지연 동안 타이머가 짧게 보이는 문제 방지 — 성공 즉시 로컬 반영
    if (d?.success) {
      sfxBid(); // 누른 즉시 소리 (폴링을 기다리면 연속 입찰 때 소리가 밀리거나 한 번만 난다)
      setAuction((prev: any) => {
        if (!prev || prev.current?.playerIdx === null) return prev;
        const next = structuredClone(prev);
        next.current.price = amount;
        next.current.leaderIdx = myLeaderIdx;
        next.current.isAllin = false; // 직전 올인 뒤 일반 입찰이면 '올인' 표기를 지운다
        next.current.endsAt = new Date(serverNow() + (next.settings.timerSeconds || 15) * 1000).toISOString();
        return next;
      });
    } else if (d?.message) showToast(d.message);
  };

  // 직접 입력 입찰: 입찰 단위로 자동 보정 + Enter 지원
  const submitDirectBid = () => {
    if (invOverCap) { showToast(`인벤토리가 가득 찼습니다 (${myInvCount}/${myInvCap}) — 선수를 배정한 뒤 입찰할 수 있습니다`); return; }
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
              <div key={slot} className="flex-1 min-w-[108px] sm:min-w-[132px] px-2.5 sm:px-3.5 first:pl-0 last:pr-0 py-1 border-l border-white/[0.07] first:border-l-0">
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

  // 📌 보유 선수(인벤토리) 행 — 팀 레일 펼침과 모바일 팀 프로필에서 함께 쓴다
  const invRows = (l: any) => {
    const inv = l.inventory || [];
    if (inv.length === 0) return <p className="py-2 text-[10px] font-bold text-gray-700">비어 있음</p>;
    return inv.map((c: any, ci: number) => {
      const cp = auction.players[c.playerIdx];
      const cHidden = cp ? isHiddenFor(cp) : true;
      const cProf = cp?.revealed && cp.discordId ? profiles[cp.discordId] : null;
      return (
        <div key={ci} className="flex items-center gap-2 py-1.5 border-b border-white/[0.06]">
          <span className={`shrink-0 w-6 h-8 rounded border flex items-center justify-center overflow-hidden ${c.golden ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/[0.04]"}`}>
            {cProf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cProf.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 64 58" className={`w-3 h-3 ${c.golden ? "fill-amber-300/60" : "fill-white/20"}`} aria-hidden="true"><circle cx="32" cy="16" r="13" /><path d="M32 32c14.4 0 26 9.6 26 21.4V58H6v-4.6C6 41.6 17.6 32 32 32z" /></svg>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[11px] font-black truncate leading-tight ${c.golden ? "text-amber-200" : cHidden ? "text-gray-500" : "text-white"}`}>
              {cHidden ? "비공개" : cProf ? cProf.globalName : cp?.alias}
            </span>
            {!cHidden && cp && (
              <span className="block text-[9px] font-bold text-gray-600 truncate leading-tight mt-0.5">
                {c.golden ? "올 포지션" : <>{cp.peakTier || "?"}<span className="text-gray-800 mx-1">·</span>{cp.currentTier || "?"}</>}
                {canSeePos(cp) && <span className="text-gray-300 ml-1.5">{revealParts(cp).map((x: any) => x.v).join(" · ")}</span>}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[10px] font-black text-gray-500 tabular-nums">{c.price?.toLocaleString()}</span>
        </div>
      );
    });
  };

  // 📌 팀 레일 — 데스크톱 좌측과 모바일 시트에서 함께 쓴다
  const teamsSection = (
    <>
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
          const flashed = bidFlash?.idx === li;
          const fillPct = Math.min(100, (l.roster.length / Math.max(1, totalSlots)) * 100);
          return (
            <div key={li} className={`relative transition-colors ${bidding ? "bg-[#e91e3f]/[0.05]" : ""}`}>
              {/* 입찰 순간 효과 — 행의 배경과 분리된 오버레이 한 겹.
                  key 에 갱신 번호를 넣어 같은 팀이 연속 입찰해도 애니메이션이 다시 재생된다 */}
              {flashed && <span key={bidFlash!.n} className="auc-bidfx" />}
              {/* 최고가 입찰 중인 팀 — 왼쪽 레드 세로선 */}
              <span className={`absolute left-0 inset-y-0 w-[2px] z-10 transition-colors ${bidding ? "bg-[#e91e3f]" : myLeaderIdx === li ? "bg-white/40" : "bg-transparent"}`} />

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
                  <p key={flashed ? bidFlash!.n : "p"} className={`text-[13px] font-black tabular-nums leading-none origin-right ${flashed ? "text-[#ff5c77] auc-bidpop" : "text-white"}`}>{l.points.toLocaleString()}</p>
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
                  {SlotBoard({ leader: l, leaderIdx: li })}

                  {/* 인벤토리 — 팀을 펼치면 로스터와 함께 내용까지 바로 보인다.
                         (예전에는 버튼만 있어서 한 번 더 눌러야 확인할 수 있었다) */}
                  {invMode && (() => {
                    const inv = l.inventory || [];
                    const canManage = myLeaderIdx === li || role === "host";
                    return (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 pb-1.5 border-b border-white/15">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3 h-3 shrink-0 ${inv.length ? "text-[#ff5c77]" : "text-gray-600"}`}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                          <span className="auc-cap text-gray-500">보유 선수</span>
                          <span className={`text-[10px] font-black tabular-nums ${inv.length > invCapOf(l) ? "text-[#ff5c77]" : "text-gray-600"}`}>{inv.length}/{invCapOf(l)}</span>
                          {canManage && (
                            <button onClick={() => { setInvModal(li); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }} className="ml-auto text-[10px] font-black text-gray-500 hover:text-white active:text-white transition-colors">
                              관리 ›
                            </button>
                          )}
                        </div>

                        <div className="pt-0.5">{invRows(l)}</div>
                      </div>
                    );
                  })()}

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
    </>
  );

  // 📌 모바일 팀 프로필 — 아코디언 목록이 아니라 '그 팀 한 곳'만 보는 화면.
  //    위에서부터 리더 프로필 · 포인트 → 배치도 → 보유 카드 순으로 쌓는다.
  const teamProfile = (li: number) => {
    const l = auction.leaders[li];
    if (!l) return null;
    const prof = l.discordId ? profiles[l.discordId] : null;
    const bidding = cur.leaderIdx === li;
    const isMe = myLeaderIdx === li;
    const canManage = isMe || role === "host";
    const spent = l.roster.reduce((s: number, r: any) => s + (r.price || 0), 0) + (l.inventory || []).reduce((s: number, c: any) => s + (c.price || 0), 0);
    return (
      <div className="pb-1">
        {/* ── 리더 프로필 ── */}
        <div className={`relative flex items-center gap-3 px-3 py-3.5 border ${bidding ? "border-[#e91e3f]/60 bg-[#e91e3f]/[0.08]" : "border-white/12 bg-white/[0.02]"}`}>
          <span className={`absolute left-0 inset-y-0 w-[2px] ${bidding ? "bg-[#e91e3f]" : isMe ? "bg-white/45" : "bg-white/15"}`} />
          {prof ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prof.avatarUrl} alt="" className={`w-14 h-14 rounded-full bg-gray-800 shrink-0 ring-1 ${bidding ? "ring-[#e91e3f]" : "ring-white/20"}`} />
          ) : (
            <span className={`w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-lg font-black text-gray-300 ring-1 ${bidding ? "ring-[#e91e3f] bg-[#e91e3f]/10" : "ring-white/15 bg-white/[0.04]"}`}>{l.name[0]}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 leading-tight">
              <span className="text-[16px] font-black text-white truncate">{l.name}</span>
              {isMe && <span className="shrink-0 auc-label-xs text-gray-300">Me</span>}
              {bidding && <span className="shrink-0 auc-label-xs text-[#ff5c77]">Top Bid</span>}
            </p>
            <p className="flex items-center gap-1.5 mt-1.5">
              {l.position && <span className={`px-1.5 py-0.5 text-[10px] font-black border ${roleColor(l.position).badge}`}>{roleAbbr(l.position)}</span>}
              <span className="text-[10px] font-bold text-gray-500 tabular-nums">슬롯 {l.roster.length}/{totalSlots}</span>
              {invMode && <span className="text-[10px] font-bold text-gray-500 tabular-nums">보유 {(l.inventory?.length || 0)}/{invCapOf(l)}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="auc-label-xs text-gray-600">Point</p>
            <p className={`text-[20px] font-black tabular-nums leading-none mt-1 ${bidding ? "text-[#ff5c77]" : "text-white"}`}>{l.points.toLocaleString()}</p>
            <p className="text-[9px] font-bold text-gray-700 tabular-nums mt-1">사용 {spent.toLocaleString()}</p>
          </div>
        </div>

        {/* ── 배치도 ── */}
        <div className="flex items-center gap-2 mt-4 pb-1.5 border-b border-white/20">
          <span className="auc-label text-white">Roster</span>
          <span className="text-[10px] font-black text-gray-600 tabular-nums">{l.roster.length}/{totalSlots}</span>
        </div>
        <div className="pt-2.5">
          {SlotBoard({ leader: l, leaderIdx: li })}
        </div>

        {/* ── 보유 카드 ── */}
        {invMode && (
          <>
            <div className="flex items-center gap-2 mt-4 pb-1.5 border-b border-white/20">
              <span className="auc-label text-white">Inventory</span>
              <span className={`text-[10px] font-black tabular-nums ${(l.inventory?.length || 0) > invCapOf(l) ? "text-[#ff5c77]" : "text-gray-600"}`}>{l.inventory?.length || 0}/{invCapOf(l)}</span>
              {canManage && (
                <button onClick={() => { setTeamView(null); setInvModal(li); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }} className="ml-auto text-[10px] font-black text-gray-500 active:text-white">
                  관리 ›
                </button>
              )}
            </div>
            <div className="pt-1">{invRows(l)}</div>
          </>
        )}

        {/* ── 진행자 도구 ── */}
        {role === "host" && (
          <div className="mt-4 flex gap-3">
            <button onClick={() => { setTeamView(null); setAdjustTarget(li); setAdjustAmount(""); }} className="flex-1 py-2 text-[11px] font-black text-gray-400 border border-white/15 active:bg-white/[0.08]">포인트 조정</button>
            <button onClick={() => { setTeamView(null); setPosSetTarget(li); }} className="flex-1 py-2 text-[11px] font-black text-gray-400 border border-white/15 active:bg-white/[0.08]">{l.position ? "포지션 변경" : "포지션 지정"}</button>
          </div>
        )}
      </div>
    );
  };

  // 📌 모바일 선수 목록 — 줄글 목록 대신 2열 미니 카드. 인물 실루엣과 상태 띠로 훑어보게 한다.
  const playersMobile = (
    <div className="grid grid-cols-2 gap-1.5 pt-2.5 auto-rows-fr">
      {auction.players.map((p: any, i: number) => {
        const hidden = isHiddenFor(p);
        const prof = p.revealed && p.discordId ? profiles[p.discordId] : null;
        const callable = role === "host" && auction.status === "진행중" && (p.status === "대기" || p.status === "유찰") && !(auction.phase === 1 && p1Role && p.phase !== 1) && auction.phase > 0;
        const name = hidden ? "비공개" : p.isAllPos ? "올 포지션" : prof ? prof.globalName : p.alias;
        const live = p.status === "경매중";
        const sold = p.status === "낙찰";
        const gold = p.isAllPos && !hidden;
        return (
          <div
            key={i}
            className={`relative border p-2 ${
              live ? "border-[#e91e3f] bg-[#e91e3f]/[0.10]" : gold ? "border-amber-400/35 bg-amber-400/[0.05]" : sold ? "border-white/[0.07] opacity-70" : "border-white/12"
            }`}
          >
            <div className="flex gap-2">
              {/* 실루엣 썸네일 */}
              <span className={`shrink-0 w-8 h-11 rounded border flex items-center justify-center ${gold ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/[0.04]"}`}>
                {prof ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prof.avatarUrl} alt="" className="w-full h-full object-cover rounded" />
                ) : (
                  <svg viewBox="0 0 64 58" className={`w-4 h-4 ${gold ? "fill-amber-300/60" : "fill-white/20"}`} aria-hidden="true">
                    <circle cx="32" cy="16" r="13" />
                    <path d="M32 32c14.4 0 26 9.6 26 21.4V58H6v-4.6C6 41.6 17.6 32 32 32z" />
                  </svg>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className={`text-[12px] font-black truncate leading-tight ${hidden ? "text-gray-600" : gold ? "text-amber-300" : "text-white"}`}>{name}</p>
                {!hidden && (
                  <p className="text-[9px] font-bold text-gray-500 truncate leading-tight mt-1">
                    {p.isAllPos ? <span className="text-amber-200/60">티어 비공개</span> : <><span className="text-gray-300">{p.peakTier || "?"}</span><span className="text-gray-700 mx-0.5">·</span><span>{p.currentTier || "?"}</span></>}
                  </p>
                )}
                {canSeePos(p) && (
                  <p className="flex flex-wrap gap-0.5 mt-1">
                    {revealParts(p).map((r: any, ri: number) => (
                      <span key={ri} className={`px-1 text-[8px] font-black border ${r.pos ? roleColor(r.pos).badge : "border-white/12 text-gray-400"}`}>{r.v}</span>
                    ))}
                  </p>
                )}
              </div>
            </div>

            {/* 상태 띠 */}
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/[0.07]">
              <span className="text-[8px] font-black text-gray-700 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              {sold ? (
                <>
                  <span className="text-[9px] font-black text-gray-400 truncate">{auction.leaders[p.soldTo]?.name}</span>
                  <span className="ml-auto text-[9px] font-black text-gray-500 tabular-nums shrink-0">{p.soldPrice?.toLocaleString()}</span>
                </>
              ) : callable ? (
                <button onClick={() => act({ action: "host:call", playerIdx: i })} className="ml-auto px-2.5 py-0.5 text-[9px] font-black text-white bg-[#e91e3f]/85 active:bg-[#e91e3f]">호명</button>
              ) : live ? (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-[#ff5c77]"><span className="w-1 h-1 rounded-full bg-[#e91e3f] animate-pulse" />LIVE</span>
              ) : p.status === "유찰" ? (
                <span className="ml-auto text-[9px] font-black text-orange-400">유찰</span>
              ) : p.status === "배정중" ? (
                <span className="ml-auto text-[9px] font-black text-gray-300">배정</span>
              ) : (
                <span className="ml-auto text-[9px] font-black text-gray-700">대기</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );


  // 📌 선수 목록 — 데스크톱 본문과 모바일 시트에서 함께 쓰므로 한 번만 만든다
  const playersSection = (
      <section>
        {/* 구획 머리글 — 무대와 선수 목록의 경계가 흐릿했다. 제목을 가운데로 옮기고
               좌우로 선을 뻗어 한 구획이 여기서 시작한다는 걸 분명히 한다. */}
        <div className="relative mb-5">
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-center shrink-0">
              <span className="block text-[15px] font-black tracking-[0.34em] text-white leading-none">PLAYERS</span>
              <span className="block text-[10px] font-bold text-gray-600 tabular-nums mt-1.5">
                낙찰 {auction.players.filter((p: any) => p.status === "낙찰").length} / 전체 {auction.players.length}
              </span>
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>
          {role === "host" && auction.status === "진행중" && auction.players.some((p: any) => p.status === "유찰") && !auction.players.some((p: any) => ["대기", "경매중", "배정중"].includes(p.status)) && (
            <button onClick={() => setConfirmCfg({ title: "유찰 랜덤 배정", message: "유찰 선수를 빈 슬롯 팀에 기본가로 랜덤 배정합니다. (잔여 Point 최저 팀 우선)", confirmLabel: "배정", onConfirm: () => act({ action: "host:assignPassed" }) })} className="absolute right-0 top-0 text-[10px] font-black text-gray-300 hover:text-white border-b border-white/25 hover:border-white pb-0.5 transition-colors">유찰 랜덤 배정</button>
          )}
        </div>

        {[1, 2].map((phase) => {
          const list = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.phase === phase);
          if (list.length === 0) return null;
          return (
            <div key={phase} className="mb-5 last:mb-0">
              <p className="auc-label-xs text-gray-600 mb-2.5">{p1Role ? `Phase ${phase}` : "All"}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5 auto-rows-fr">
                {list.map(({ p, i }: any) => {
                  const hidden = isHiddenFor(p);
                  const prof = p.revealed && p.discordId ? profiles[p.discordId] : null;
                  const callable = role === "host" && auction.status === "진행중" && (p.status === "대기" || p.status === "유찰") && !(auction.phase === 1 && p1Role && p.phase !== 1) && auction.phase > 0;
                  return (
                    /* 📌 골든 카드는 이 목록에서 가장 중요한 매물 — 금박으로 확실히 띄운다 (이전엔 회색이라 비활성처럼 보였다) */
                    <div key={i} className={`group flex flex-col rounded-xl border overflow-hidden transition-colors ${p.isAllPos && !hidden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.13] to-amber-500/[0.02] shadow-[0_0_20px_-6px_rgba(251,191,36,0.4)]" : p.status === "경매중" ? "border-[#e91e3f]/40 bg-[#e91e3f]/[0.06]" : p.status === "낙찰" ? "border-white/5 bg-black/20" : p.status === "유찰" ? "border-orange-500/20 bg-orange-500/[0.03]" : p.status === "배정중" ? "border-white/25 bg-white/[0.04]" : "border-white/5 bg-black/25 hover:border-white/15"}`}>
                      {/* 📌 초상 밴드 — 정보 상자가 아니라 '선수 카드'로 읽히게 하는 부분.
                             공개된 선수는 실제 아바타, 아니면 실루엣(비공개는 물음표) */}
                      <div className={`relative aspect-[5/3] flex items-center justify-center border-b ${p.isAllPos && !hidden ? "border-amber-400/25 bg-gradient-to-b from-amber-400/25 via-amber-500/[0.06] to-transparent" : p.status === "경매중" ? "border-[#e91e3f]/25 bg-gradient-to-b from-[#e91e3f]/20 to-transparent" : "border-white/[0.07] bg-gradient-to-b from-white/[0.07] to-transparent"}`}>
                        {hidden ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-9 h-9 text-gray-700"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
                        ) : prof ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prof.avatarUrl} alt="" className={`w-[52px] h-[52px] rounded-full bg-gray-800 ring-2 ${p.isAllPos ? "ring-amber-400/60" : "ring-white/20"}`} />
                        ) : (
                          <svg viewBox="0 0 64 58" className={`w-11 h-11 ${p.isAllPos ? "fill-amber-300/60" : "fill-white/20"}`} aria-hidden="true">
                            <circle cx="32" cy="16" r="13" />
                            <path d="M32 32c14.4 0 26 9.6 26 21.4V58H6v-4.6C6 41.6 17.6 32 32 32z" />
                          </svg>
                        )}
                        <span className={`absolute top-2 left-2.5 text-[8px] font-black tracking-[0.2em] uppercase ${p.isAllPos && !hidden ? "text-amber-400" : "text-gray-600"}`}>{p.isAllPos && !hidden ? "Golden" : `P${String(i + 1).padStart(2, "0")}`}</span>
                        <span className="absolute top-2 right-2.5">
                          {p.status === "경매중" ? <span className="text-[9px] font-black text-gray-200 animate-pulse">LIVE</span>
                            : p.status === "배정중" ? <span className="text-[9px] font-black text-gray-200">배정 중</span>
                            : p.status === "유찰" ? <span className="text-[9px] font-black text-orange-400">유찰</span>
                            : p.status === "낙찰" ? <span className="text-[9px] font-black text-gray-500">SOLD</span>
                            : null}
                        </span>
                      </div>

                      <div className="flex flex-col flex-1 px-3.5 pt-2.5 pb-3">
                      {hidden ? (
                        <p className="flex-1 flex items-center justify-center py-2 text-[10px] font-bold text-gray-600">비공개</p>
                      ) : (
                        <>
                          {prof ? (
                            /* 아바타는 위 초상 밴드에 이미 크게 있으므로 여기선 이름만 */
                            <div className="mb-1 min-w-0">
                              <p className="text-sm font-black text-white truncate leading-tight">{prof.globalName}</p>
                              <p className="text-[9px] text-gray-500 truncate">{p.alias}</p>
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
                                {/* 일반 카드와 같은 규칙 — 비용 안내는 다시 호명될 수 있는 '유찰'일 때만 */}
                                {canSeePos(p) ? (
                                  <span className="text-amber-100">{revealParts(p).map((r) => r.v).join(" · ")}</span>
                                ) : !p.hasMost ? (
                                  <span className="text-amber-200/40">공개 정보 없음</span>
                                ) : p.status === "유찰" ? (
                                  <span className="text-amber-200/50">스카우터 {(S.goldenScoutCost ?? 4000).toLocaleString()}pt</span>
                                ) : (
                                  <span className="text-amber-200/40">스카우터 미사용</span>
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

                      {/* 상태 문구는 상단 뱃지로 이미 드러나므로 아래에는 '행동/결과'만 남긴다.
                          아직 팔리지 않아 표시할 게 없으면 선 하나만 그어 카드 바닥을 맞춘다. */}
                      <div className={`mt-auto border-t border-white/[0.05] ${p.status === "낙찰" || (p.status === "배정중" && role === "host") || callable ? "pt-1.5" : ""}`}>
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
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
  );
  return (
    <main className="w-full flex-1 flex flex-col relative auc">
      <LuxStyles />
      <AuctionStyles />

      {/* 상단 바 — 1단: 정체(제목·상태) / 2단 오른쪽: 조작(볼륨·역할·진행) */}
      <div className="sticky top-0 md:top-16 z-30 w-full px-3 md:px-6 py-2 md:py-2.5 bg-[#090909]/92 backdrop-blur-xl border-b border-white/[0.07]">
        {/* 상태 라인 — LIVE만 레드 포인트 */}
        <span className={`absolute inset-x-0 top-0 h-px ${auction.status === "진행중" ? "bg-[#e91e3f]" : auction.status === "종료" ? "bg-white/10" : "bg-amber-400/60"}`} />
        {/* 모바일에서는 줄바꿈 대신 한 줄로 흐르게 — 여러 줄로 쌓이면 헤더만 두꺼워진다 */}
        <div className="max-w-[1720px] mx-auto flex items-center gap-x-3 md:gap-x-4 gap-y-2 md:flex-wrap overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden">
          {/* 정체 */}
          <button onClick={() => router.push("/auction")} title="목록으로" className="shrink-0 text-gray-500 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="min-w-0 flex-1 shrink md:shrink-0 flex items-center gap-3">
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
          <div className="shrink-0 flex items-center gap-2 px-2.5 md:px-3 py-1.5 border border-white/10 bg-white/[0.03]">
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
              className="hidden sm:block w-16 h-1 accent-white cursor-pointer"
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
                <button onClick={async () => { const d = await act({ action: "host:strategy", seconds: 0 }); if (d?.success) patchAuction((a) => { a.strategyUntil = null; }); }} className="text-xs font-black bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-1.5 transition-colors">전략 타임 종료</button>
              ) : (
                <button onClick={() => setStrategyModalOpen(true)} className="text-xs font-black bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 transition-colors">전략 타임</button>
              )}
              {invMode && <button onClick={async () => { const d = await act({ action: "host:assignTime", seconds: 180 }); if (d?.success) { sfxStrategy(); patchAuction((a) => { a.assignUntil = new Date(serverNow() + 180 * 1000).toISOString(); }); showToast("팀원 배정 시간 3분이 시작되었습니다"); } else showToast(d?.message || "배정 시간 부여에 실패했습니다"); }} className="text-xs font-black bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-1.5 transition-colors">팀원 배정 시간(3분)</button>}
              <button onClick={() => setConfirmCfg({ title: "경매 종료", message: invMode ? "경매를 종료합니다. 종료 후에는 인벤토리·포지션 조정이 불가합니다. 계속할까요?" : "모든 경매를 종료하시겠습니까?", confirmLabel: "종료", onConfirm: () => act({ action: "host:end" }) })} className="text-xs font-black bg-white/10 hover:bg-red-500/80 text-white px-4 py-1.5 transition-colors">종료</button>
            </>
          )}
        </div>
      </div>


      <div className="w-full max-w-[1720px] mx-auto px-3 md:px-8 pt-3 pb-36 lg:py-6 flex-1 flex flex-wrap gap-3.5 lg:gap-5 items-start">

        {/* ═══ 좌측 세로 레일: 팀 현황판 ═══ */}
        <aside className="hidden lg:block w-full lg:w-[280px] shrink-0 order-2 lg:order-1 lg:sticky lg:top-36 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full lg:pr-1">
          {teamsSection}
        </aside>

        {/* ═══ 중앙: 경매 메인 ═══ */}
        <div className={"flex-1 min-w-0 w-full lg:w-auto space-y-3.5 lg:space-y-5 order-1 lg:order-2"} style={{ minWidth: "min(100%, 400px)" }}>

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
          {hasOverflow && (isMyOverflow || role === "host") && (() => {
            // 내보낼 '선수'가 여럿일 때만 선택 안내가 의미 있다 (한 명이면 서버가 자동 복귀시킨다)
            const ol = auction.leaders[po.leaderIdx];
            const ejectable = ol ? ol.roster.filter((r: any) => r.slot === po.slot && !r.golden && r.playerIdx !== -1).length : 0;
            return (
              <div className="border border-orange-500/40 bg-orange-500/[0.06] px-5 py-4">
                {ejectable >= 2 ? (
                  /* 선택은 팝업에서 하므로 여기선 상태만 알린다 */
                  <p className="text-xs font-black text-white">슬롯 초과 — [{roleAbbr(po.slot)}] 정원을 넘겼습니다. 내보낼 선수를 선택해주세요</p>
                ) : (
                  <p className="text-xs font-black text-white">슬롯 초과 — [{po.slot}] 정리가 필요합니다</p>
                )}
                {LeaderPosPicker({ leaderIdx: po.leaderIdx })}
              </div>
            );
          })()}
          {hasOverflow && !isMyOverflow && role !== "host" && (
            <div className="border border-orange-500/25 bg-orange-500/[0.04] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{overflowLeader?.name}</span> 리더이 슬롯을 정리하고 있습니다...</p>
            </div>
          )}

          {/* ═══════ 📱 모바일 게임 HUD ═══════
              글자 행을 나열하는 대신, 매물을 '카드'로 세우고 타이머는 링, 호가는 초대형 숫자,
              팀 현황은 아바타 줄로 보여준다. (데스크톱 무대는 hidden lg:block 으로 분리) */}
          <div className="lg:hidden">
            <div className={`relative overflow-hidden border ${isGoldenLot ? "auc-stage-golden" : "auc-stage-panel border-white/15"}`}>
              <span className={`absolute inset-x-0 top-0 h-[2px] z-10 ${isGoldenLot ? "auc-stage-goldline" : curPlayer ? "bg-[#e91e3f]" : "bg-white/20"}`} />

              {curPlayer ? (
                <div className="relative z-10 px-4 pt-4 pb-4">
                  {/* 상태 + 타이머 링 */}
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className={`auc-label-xs ${isGoldenLot ? "text-amber-300" : "text-gray-500"}`}>
                        {isGoldenLot ? "Golden Card" : `On the Block · P${curPlayer.phase}`}
                      </p>
                      <p className={`text-[22px] font-black tracking-tight leading-tight truncate mt-1 ${isGoldenLot ? "text-amber-300" : "text-white"}`}>
                        {isGoldenLot ? "올 포지션" : curPlayer.alias}
                      </p>
                    </div>

                    {/* 원형 타이머 — 남은 시간을 링으로 */}
                    {(() => {
                      const total = scoutLeft > 0 ? (S.scoutSeconds || 7) : (S.timerSeconds || 15);
                      const left = scoutLeft > 0 ? scoutLeft : timeLeft;
                      if (left === null) return null;
                      const pct = Math.max(0, Math.min(100, (left / Math.max(1, total)) * 100));
                      const urgent = scoutLeft === 0 && left <= 5;
                      const col = scoutLeft > 0 ? "#60a5fa" : urgent ? "#e91e3f" : isGoldenLot ? "#fbbf24" : "#ffffff";
                      return (
                        <div className={`relative shrink-0 w-16 h-16 ${urgent ? "animate-pulse" : ""}`}>
                          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="16" fill="none" stroke={col} strokeWidth="3" strokeLinecap="round"
                              pathLength={100} strokeDasharray={`${pct} 100`} style={{ transition: "stroke-dasharray .3s linear" }} />
                          </svg>
                          <span className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[19px] font-black tabular-nums leading-none" style={{ color: col }}>{left}</span>
                            <span className="auc-label-xs text-gray-600 mt-0.5">{scoutLeft > 0 ? "Scout" : "Sec"}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 매물 카드 — 실루엣 + 능력치 뱃지 */}
                  <div className={`flex gap-3 mt-3 p-3 border ${isGoldenLot ? "border-amber-400/35 bg-amber-400/[0.06]" : "border-white/10 bg-black/25"}`}>
                    <span className={`relative shrink-0 w-16 h-[86px] rounded-lg border overflow-hidden flex items-center justify-center ${isGoldenLot ? "border-amber-400/60 bg-gradient-to-b from-amber-400/25 to-transparent" : "border-white/12 bg-gradient-to-b from-white/[0.08] to-transparent"}`}>
                      <svg viewBox="0 0 64 58" className={`w-10 h-10 ${isGoldenLot ? "fill-amber-300/70" : "fill-white/25"}`} aria-hidden="true">
                        <circle cx="32" cy="16" r="13" />
                        <path d="M32 32c14.4 0 26 9.6 26 21.4V58H6v-4.6C6 41.6 17.6 32 32 32z" />
                      </svg>
                    </span>

                    <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
                      {isGoldenLot ? (
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="auc-cap text-amber-600/80 w-10 shrink-0">티어</span>
                            <span className="text-[13px] font-black text-amber-100/50">비공개</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="auc-cap text-amber-600/80 w-10 shrink-0">슬롯</span>
                            <span className="text-[13px] font-black text-amber-200">자유 배정</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="auc-cap text-gray-600 w-10 shrink-0">최고</span>
                            <span className="text-[13px] font-black text-white truncate">{curPlayer.peakTier || "?"}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="auc-cap text-gray-600 w-10 shrink-0">현재</span>
                            <span className="text-[13px] font-black text-gray-300 truncate">{curPlayer.currentTier || "?"}</span>
                          </span>
                        </>
                      )}
                      {/* 포지션 뱃지 — 스카우터로 공개된 경우에만 */}
                      <span className="flex flex-wrap gap-1 mt-0.5">
                        {canSeePos(curPlayer) ? (
                          revealParts(curPlayer).map((r: any, ri: number) => (
                            <span key={ri} className={`px-1.5 py-0.5 text-[10px] font-black border ${r.pos ? `${roleColor(r.pos).badge}` : "border-white/15 text-gray-300"}`}>{r.v}</span>
                          ))
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-black border border-white/12 text-gray-600">스카우터 미사용</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* 호가 — 초대형 숫자 + 최고가 팀 */}
                  <div className="flex items-end gap-3 mt-3.5">
                    <div className="min-w-0">
                      <p className={`auc-label-xs ${isGoldenLot ? "text-amber-300/70" : "text-gray-600"}`}>
                        {cur.leaderIdx === null ? "시작가" : "현재 최고가"}
                      </p>
                      <p className={`text-[34px] font-black tracking-tighter tabular-nums leading-none mt-1 ${isGoldenLot ? "text-amber-200" : "text-[#e91e3f]"}`}>
                        {(cur.leaderIdx === null ? basePrice : cur.price).toLocaleString()}
                      </p>
                    </div>
                    {curLeader && (() => {
                      const cp = curLeader.discordId ? profiles[curLeader.discordId] : null;
                      return (
                        <span className="ml-auto shrink-0 flex items-center gap-2 pb-1">
                          {cp ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cp.avatarUrl} alt="" className="w-7 h-7 rounded-full ring-1 ring-[#e91e3f]" />
                          ) : (
                            <span className="w-7 h-7 rounded-full ring-1 ring-[#e91e3f] bg-[#e91e3f]/15 flex items-center justify-center text-[10px] font-black text-[#ff5c77]">{curLeader.name[0]}</span>
                          )}
                          <span className="text-[11px] font-black text-white truncate max-w-[92px]">{curLeader.name}</span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* ── 입찰 조작부 — 데스크톱 무대와 같은 자리(호가 바로 아래)에 둔다 ── */}
                  {myLeader && auction.status === "진행중" && (
                    invOverCap ? (
                      <button
                        onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
                        className="mt-3 w-full flex items-center gap-2 px-3 py-2.5 border border-[#e91e3f]/50 bg-[#e91e3f]/[0.12] text-left active:bg-[#e91e3f]/25"
                      >
                        <MegaphoneIcon className="w-3.5 h-3.5 shrink-0 text-white" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-black text-[#ff5c77] leading-tight">입찰할 수 없습니다 · 인벤토리 {myInvCount}/{myInvCap}</span>
                          <span className="block text-[10px] font-bold text-gray-400 leading-tight mt-0.5">선수를 배정해 칸을 비우세요 — 눌러서 열기</span>
                        </span>
                      </button>
                    ) : scoutLeft > 0 ? (
                      <p className="mt-3 py-2.5 border-t border-white/10 text-[11px] font-bold text-gray-500 text-center">스카우터 타임 종료 후 입찰이 시작됩니다</p>
                    ) : strategyLeft > 0 ? (
                      <p className="mt-3 py-2.5 border-t border-white/10 text-[11px] font-bold text-blue-400 text-center">전략 타임 중 — 입찰 일시 중지</p>
                    ) : timeLeft === 0 ? (
                      <p className="mt-3 py-2.5 border-t border-white/10 text-[11px] font-black text-gray-400 text-center">입찰 마감 — 진행자의 처리를 기다리는 중</p>
                    ) : (
                      // ⚠️ bidBarOn 으로 한 번 더 거르지 않는다. bidBarOn 은 timeLeft !== null 을 요구하는데
                      //    cur.endsAt 이 아직 없는 구간(호명 직후 등)에서는 timeLeft 가 null 이라
                      //    입찰 칸이 통째로 사라졌다. 데스크톱과 같이 마지막 분기에서 항상 그린다.
                      <div className="mt-3 border-y border-white/12">
                        <div className="flex items-stretch divide-x divide-white/12">
                          {[S.minIncrement, S.minIncrement * 5, S.minIncrement * 10].map((inc) => {
                            const result = cur.leaderIdx === null ? basePrice : cur.price + inc;
                            const affordable = myLeader.points >= result;
                            return (
                              <button
                                key={inc}
                                onClick={() => doBid(result)}
                                disabled={!affordable}
                                className={`flex-1 min-w-0 py-3 text-center transition-colors ${affordable ? "active:bg-[#e91e3f]/30" : "opacity-25"}`}
                              >
                                <span className="block text-[17px] font-black text-white leading-none tabular-nums">+{inc.toLocaleString()}</span>
                                <span className="block text-[9px] font-bold text-gray-500 tabular-nums mt-1">{result.toLocaleString()}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-stretch divide-x divide-white/12 border-t border-white/12">
                          <button onClick={() => { setBidInput(""); setMobBid(true); sfxSelect(); }} className="flex-1 py-2 text-[11px] font-black text-gray-300 active:bg-white/[0.08]">
                            직접 입찰
                          </button>
                          <button
                            onClick={() => setConfirmCfg({ title: "올인", message: `남은 슬롯 최소 예산을 제외한 전액 ${allinMax.toLocaleString()} Point를 베팅합니다.`, confirmLabel: "올인", onConfirm: async () => { const d = await act({ action: "allin", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx }); if (d?.success) sfxAllin(); else if (d?.message) showToast(d.message); } })}
                            className="flex-1 py-2 text-[11px] font-black text-[#ff5c77] active:bg-[#e91e3f]/25"
                          >
                            올인 <span className="text-gray-600 tabular-nums">{allinMax.toLocaleString()}</span>
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {/* 스카우터 — 아직 안 썼을 때만 */}
                  {myLeader && auction.status === "진행중" && myLeaderIdx !== null && !curPlayer.scoutedBy.includes(myLeaderIdx) && (!curPlayer.isAllPos || curPlayer.hasMost) && (
                    <button
                      onClick={() => setConfirmCfg({ title: "스카우터 사용", message: `${scoutCostOf(curPlayer).toLocaleString()} Point를 사용하여 이 선수의 ${curPlayer.isAllPos ? "모스트 챔피언" : revealFields.includes("champions") ? "주 포지션·모스트 챔피언" : "주/부 포지션"}을(를) 확인합니다.`, confirmLabel: "사용", onConfirm: useScouter })}
                      className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 border text-[12px] font-black transition-colors ${curPlayer.isAllPos ? "border-amber-400/50 text-amber-200 active:bg-amber-400/15" : "border-white/25 text-gray-200 active:bg-white/10"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      스카우터 −{scoutCostOf(curPlayer).toLocaleString()}
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative z-10 px-4 py-10 text-center">
                  <p className="auc-label-xs text-gray-600">{auction.status === "종료" ? "Finished" : "Standby"}</p>
                  <p className="text-white font-black text-base mt-2">{auction.status === "종료" ? "경매 종료" : "대기 중"}</p>
                </div>
              )}
            </div>

            {/* ── 팀 현황 아바타 줄 — 이름 나열 대신 얼굴과 막대로 ── */}
            <div className="mt-3.5 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
              {auction.leaders.map((l: any, li: number) => {
                const prof = l.discordId ? profiles[l.discordId] : null;
                const bidding = cur.leaderIdx === li;
                const isMe = myLeaderIdx === li;
                const maxPt = Math.max(1, ...auction.leaders.map((x: any) => x.points));
                return (
                  <button
                    key={li}
                    // 팀 하나를 누르면 그 팀의 프로필 화면이 열린다 (프로필 → 배치도 → 보유 카드)
                    onClick={() => { setTeamView(li); sfxSelect(); }}
                    className={`relative flex-1 basis-0 min-w-[74px] px-1.5 py-2 border text-center transition-colors ${bidding ? "border-[#e91e3f] bg-[#e91e3f]/[0.12]" : isMe ? "border-white/35 bg-white/[0.04]" : "border-white/10"}`}
                  >
                    {bidFlash?.idx === li && <span key={bidFlash.n} className="auc-bidfx" />}
                    {prof ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prof.avatarUrl} alt="" className={`w-9 h-9 rounded-full mx-auto bg-gray-800 ring-1 ${bidding ? "ring-[#e91e3f]" : isMe ? "ring-white/50" : "ring-white/15"}`} />
                    ) : (
                      <span className={`w-9 h-9 rounded-full mx-auto flex items-center justify-center text-[11px] font-black text-gray-300 ring-1 ${bidding ? "ring-[#e91e3f] bg-[#e91e3f]/10" : "ring-white/15 bg-white/[0.04]"}`}>{l.name[0]}</span>
                    )}
                    <span className="block text-[10px] font-black text-gray-300 truncate mt-1.5">{l.name}</span>
                    <span className={`block text-[11px] font-black tabular-nums leading-tight ${bidding ? "text-[#ff5c77]" : "text-white"}`}>{Math.round(l.points / 1000)}K</span>
                    <span className="block relative h-[2px] bg-white/10 mt-1.5">
                      <span className={`absolute inset-y-0 left-0 ${bidding ? "bg-[#e91e3f]" : isMe ? "bg-white/70" : "bg-white/30"}`} style={{ width: `${(l.points / maxPt) * 100}%` }} />
                    </span>
                    <span className="block auc-cap text-gray-600 mt-1 tabular-nums">{l.roster.length}/{totalSlots}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ═══ 무대 — 현재 매물 ═══
              · 일반 매물 : 메인 화면과 같은 블랙&화이트 패널 + 상단 레드 라인
              · 올 포지션 : 배경 자체가 골드 그라데이션으로 전환 (등장 임팩트) */}
          <div className={`hidden lg:block relative border overflow-hidden sm:min-h-[230px] transition-colors duration-500 ${isGoldenLot ? "auc-stage-golden" : "auc-stage-panel border-white/15"}`}>
            <span className={`absolute inset-x-0 top-0 h-[2px] z-10 ${isGoldenLot ? "auc-stage-goldline" : curPlayer ? "bg-[#e91e3f]" : "bg-white/20"}`} />
            <div className="p-4 sm:p-6 md:p-8 relative sm:min-h-[230px]">
              <div className={`absolute -top-16 -right-16 w-52 h-52 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite] ${isGoldenLot ? "bg-amber-300/15" : "bg-white/[0.06]"}`}></div>

              {curPlayer ? (
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className={`auc-label mb-2 ${curPlayer.isAllPos ? "text-amber-300" : "text-gray-500"}`}>
                        {curPlayer.isAllPos ? "Golden Card" : `On the Block · Phase ${curPlayer.phase}`}
                      </p>
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
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
                            className={`min-w-[88px] sm:min-w-[112px] px-2.5 sm:px-4 first:pl-0 last:pr-0 border-l first:border-l-0 ${isGoldenLot ? "border-amber-400/20" : "border-white/[0.09]"} ${c.l === "모스트" || c.l.includes("모스트") ? "flex-[2]" : "flex-1"}`}
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
                        {/* ── 스카우터 — 아직 안 썼을 때만 버튼을 둔다.
                               쓰고 나면 결과가 위 정보 밴드에 그대로 뜨므로 '사용함' 안내는 군더더기였다 ── */}
                        {myLeaderIdx !== null && curPlayer.scoutedBy.includes(myLeaderIdx) ? null
                        : myLeaderIdx !== null && (!curPlayer.isAllPos || curPlayer.hasMost) ? (
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

                        {/* ⚠️ 인벤토리가 가득 찬 동안에는 입찰 칸을 아예 두지 않는다 — 시도 자체가 불가능해야 한다 */}
                        {invOverCap ? (
                          <div className="border-t border-[#e91e3f]/40 pt-3">
                            <p className="text-[12px] font-black text-[#ff5c77]">입찰할 수 없습니다</p>
                            <p className="text-[11px] text-gray-400 leading-relaxed break-keep mt-1">
                              인벤토리가 가득 찼습니다 <b className="text-white tabular-nums">{myInvCount}/{myInvCap}</b>.
                              보유 중인 선수를 포지션에 배정해 칸을 비우면 입찰 칸이 다시 나타납니다.
                            </p>
                            <button
                              onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
                              className="mt-2.5 px-4 py-2 text-[11px] font-black text-white bg-[#e91e3f] hover:bg-[#d01634] transition-colors"
                            >
                              인벤토리 열기
                            </button>
                          </div>
                        ) : scoutLeft > 0 ? (
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
                                onClick={() => setConfirmCfg({ title: "올인", message: `남은 슬롯 최소 예산을 제외한 전액 ${allinMax.toLocaleString()} Point를 베팅합니다.`, confirmLabel: "올인", onConfirm: async () => { const d = await act({ action: "allin", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx }); if (d?.success) sfxAllin(); else if (d?.message) showToast(d.message); } })}
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
                                  if (r?.success) {
                                    sfxSelect();
                                    // 서버가 알려준 남은 초를 그대로 로컬 타이머에 즉시 반영
                                    patchAuction((a) => { a.current.endsAt = new Date(serverNow() + r.left * 1000).toISOString(); });
                                    showToast(`입찰 시간 ${d > 0 ? "+" : ""}${d}초 · 남은 ${r.left}초`);
                                  }
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
              <section className={`hidden lg:block transition-colors ${needAct ? "bg-[#e91e3f]/[0.04]" : ""}`}>
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

                  {/* 📌 액션 묶음 — 인벤토리·알림함이 각각 독립 박스로 서면 서로 경쟁하고 줄도 어수선해진다.
                      하나의 테두리 안에 세로 헤어라인으로 나눠 '여기가 눌러야 하는 곳'을 한 덩어리로 보여준다.
                      읽기 정보(POINT·ROSTER)와는 ml-auto 로 좌우를 갈라둔다. */}
                  {/* ⚠️ 이 버튼들을 별도 컴포넌트로 뽑아 렌더 함수 안에서 정의하면 안 된다.
                      폴링(1.5초)마다 새 컴포넌트 타입이 되어 매번 언마운트/재마운트되고,
                      그 탓에 호버 상태와 트랜지션이 끊겨 깜빡인다. 그래서 마크업을 그대로 둔다. */}
                  <div className="sm:ml-auto flex items-stretch border border-white/25 divide-x divide-white/15">
                    {invMode && (
                      <button
                        onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
                        title="인벤토리 열기 — 보유 선수를 포지션에 배정합니다"
                        className={`group relative flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer transition-colors ${invCount > 0 ? "bg-[#e91e3f]/[0.12] hover:bg-[#e91e3f]/25" : "hover:bg-white/[0.06]"}`}
                      >
                        {invCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 shrink-0 transition-colors ${invCount > 0 ? "text-[#ff5c77]" : "text-gray-500 group-hover:text-white"}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <span className="text-left">
                          <span className={`block auc-label ${invCount > 0 ? "text-[#ff5c77]" : "text-gray-500"}`}>Inventory</span>
                          <span className={`block text-lg font-black tabular-nums leading-tight transition-colors ${invCount > 0 ? "text-white" : "text-gray-400 group-hover:text-white"}`}>
                            {invCount}<span className="text-[10px] font-bold text-gray-500 ml-1">/{myInvCap}</span>
                          </span>
                        </span>
                      </button>
                    )}
                    {/* 스카우터는 인벤토리 모드와 무관하므로 항상 노출 */}
                    <button
                      onClick={() => { setNoticeOpen(true); setNoticeUnread(0); sfxSelect(); }}
                      title="알림함 — 스카우터 결과 모아보기"
                      className={`group relative flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer transition-colors ${noticeUnread > 0 ? "bg-[#e91e3f]/[0.12] hover:bg-[#e91e3f]/25" : "hover:bg-white/[0.06]"}`}
                    >
                      {noticeUnread > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 shrink-0 transition-colors ${noticeUnread > 0 ? "text-[#ff5c77]" : "text-gray-500 group-hover:text-white"}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                      </svg>
                      <span className="text-left">
                        <span className={`block auc-label ${noticeUnread > 0 ? "text-[#ff5c77]" : "text-gray-500"}`}>알림함</span>
                        <span className={`block text-lg font-black tabular-nums leading-tight transition-colors ${noticeUnread > 0 ? "text-white" : "text-gray-400 group-hover:text-white"}`}>
                          {notices.length}<span className="text-[10px] font-bold text-gray-500 ml-1">건</span>
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* 슬롯 보드 */}
                <div className="flex items-baseline gap-3 pb-2 mb-3 border-b border-white/20">
                  <span className="auc-label text-white">Team Slots</span>
                  
                  {needAct && <span className="ml-auto auc-label-xs text-[#ff5c77] animate-pulse">Action Required</span>}
                </div>
                {SlotBoard({ leader: myLeader, leaderIdx: myLeaderIdx!, big: true })}
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

          {/* 내 팀 슬롯은 하단 독(내 프로필 위)으로 옮겼다 — 항상 보이는 자리가 낫다 */}



          {/* 선수 목록 — 데스크톱은 카드 격자, 모바일은 접이식 압축 행 (기본 접힘) */}
          <div className="hidden lg:block">{playersSection}</div>
          <MobFold
            title="Players"
            sub={`낙찰 ${auction.players.filter((p: any) => p.status === "낙찰").length} / 전체 ${auction.players.length}`}
            open={mobFold.players}
            onToggle={() => toggleFold("players")}
          >
            {playersMobile}
          </MobFold>
        </div>

        {/* ═══ 우측: 실시간 채팅 + 로그 ═══ */}
        {/* 모바일: 경매 탭에 채팅이 함께 표시 (스트리밍 스타일 · 컴팩트 높이) */}
        {/* 알림 로그 패널은 제거 — 스카우터 결과는 즉시 팝업 + 콘솔의 '알림함'에서 모아 본다 */}
        <div className="hidden lg:flex w-full xl:w-[350px] shrink-0 order-3 flex-col gap-4 xl:sticky xl:top-36 xl:self-start">

          {/* 넓은 화면에서만 세로로 끝없이 늘어나 길었다 → xl 에서만 상한을 둔다 (좁은 화면 높이는 종전 그대로) */}
          <div className="bg-[#0d0d0d] border border-white/[0.07] flex flex-col overflow-hidden h-[calc(100dvh-15rem)] max-h-none lg:h-[46vh] lg:max-h-[360px] xl:h-[46vh] xl:max-h-[440px]">
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
                    /* 확성기는 절대 위치로 왼쪽에 고정(글 길이에 흔들리지 않게), 본문은 블록 안에서 가운데 정렬.
                       좌우 패딩을 같게 둬야 본문이 실제로 가운데로 온다. */
                    <div key={m._id || i} className={`relative border rounded-lg pl-9 pr-9 py-2 ${high ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.08]" : "border-white/20 bg-white/[0.05]"}`}>
                      <span className={`absolute left-2.5 top-2 w-5 h-5 rounded-md flex items-center justify-center ${high ? "bg-[#e91e3f]/25" : "bg-white/[0.08]"}`}>
                        <MegaphoneIcon className={`w-3 h-3 shrink-0 ${high ? "text-[#ff5c77]" : "text-gray-300"}`} />
                      </span>
                      <p className={`text-center text-[11px] font-bold leading-relaxed break-keep ${high ? "text-gray-100" : "text-gray-400"}`}>{m.message}</p>
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
            // 되돌릴 수 없는 조작이라 기록으로 남긴다
            pushNotice({ kind: "assign", title: `배정 — ${nm}`, rows: [{ l: "포지션", v: roleAbbr(slot), pos: slot }] });

            // 📌 폴링(1.5초)을 기다리지 않고 즉시 반영 — 칸이 비면 입찰 칸이 바로 다시 떠야 한다.
            //    자동 복귀(autoEjected)는 한 장 나가고 한 장 들어와 보유 수가 그대로이므로 건드리지 않는다.
            if (!d.autoEjected) {
              setAuction((prev: any) => {
                if (!prev) return prev;
                const next = structuredClone(prev);
                const L = next.leaders?.[li];
                const c = L?.inventory?.[invIdx];
                if (!L || !c) return prev; // 이미 폴링으로 반영됐다면 그대로 둔다
                L.inventory.splice(invIdx, 1);
                L.roster.push({ playerIdx: c.playerIdx, slot, price: c.price, golden: c.golden });
                if (d.overflow) next.pendingOverflow = { leaderIdx: li, slot };
                return next;
              });
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
        // 📌 자동 복귀가 도입된 뒤 pendingOverflow 가 남는 경우는 둘뿐이다.
        //    ① 초과된 슬롯의 주인이 리더 본인 → 내보낼 '선수'가 없다 (리더 포지션 재지정으로 해결)
        //    ② 정원 2 이상 슬롯이 꽉 찬 경우 → 누구를 뺄지 서버가 못 정하므로 리더가 고른다
        //    ①에서 '내보낼 선수를 클릭' 안내는 틀린 말이라 ②에서만 띄운다.
        const poEjectable = invOverflow
          ? l.roster.filter((r: any) => r.slot === po.slot && !r.golden && r.playerIdx !== -1).length
          : 0;
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
          <div className="auc-modal-back z-[118] animate-in fade-in" onClick={() => { setInvModal(null); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); setMobPick(null); }}>
            {/* 공지는 팝업 '바깥 위' 에 별도로 띄운다 → 세로로 [공지] / [인벤토리] 두 덩어리 */}
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-4xl flex flex-col max-h-[88dvh] h-[88dvh] sm:h-[560px] sm:max-h-[85vh]">

              {/* 📢 인벤토리 초과 공지 — 채팅 공지 생김새 그대로 */}
              {mine && (l.inventory?.length || 0) > invCapOf(l) && (
                <div className="shrink-0 relative border rounded-lg pl-9 pr-9 py-2 mb-2.5 border-[#e91e3f]/50 bg-[#e91e3f]/[0.12] backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {/* 확성기 — 배경 없이 아이콘만, 세로 중앙 */}
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center">
                    <MegaphoneIcon className="w-3.5 h-3.5 shrink-0 text-white" />
                  </span>
                  <p className="text-center text-[11px] font-bold leading-relaxed break-keep text-gray-100">
                    인벤토리가 가득 찼습니다 <b className="text-[#ff5c77] tabular-nums">{l.inventory?.length || 0}/{invCapOf(l)}</b> — 선수를 포지션에 배정하기 전까지 입찰할 수 없습니다.
                    {!invPlusUsed(l) && " 인벤토리 플러스로 칸을 늘릴 수도 있습니다."}
                  </p>
                </div>
              )}

              {/* 고정 높이 — 카드가 늘어나도 팝업은 그대로, 카드 영역만 스크롤 */}
              <div className="auc-modal flex-1 min-h-0 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <span className="auc-modal-line bg-white/35" />

              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/12 shrink-0">
                <span className="auc-label text-gray-500">Inventory</span>
                <span className="text-sm font-black text-white truncate">{l.name}</span>
                {!mine && <span className="auc-cap text-gray-600 border border-white/12 px-1.5 py-1">열람 전용</span>}
                <button onClick={() => { setInvModal(null); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); setMobPick(null); }} className="ml-auto p-1.5 -mr-1 text-gray-500 hover:text-white hover:bg-white/5 transition-colors outline-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>


              {/* 가로 2단 — 팝업 크기는 고정, 각 영역 내부만 스크롤 */}
              {/* ══════════ 📱 모바일 전용 인벤토리 ══════════
                  PC의 2단(카드 격자 ↔ 포지션 드롭존) 구조는 모바일에 맞지 않는다.
                  드래그가 안 되고, 작은 카드에서 정보를 읽을 수도 없다.
                  → '보유 선수 목록' → '배정하기' → '포지션 선택' 3단계 흐름으로 다시 짠다. */}
              <div className="lg:hidden flex-1 min-h-0 flex flex-col">

                {/* ── 현재 로스터 (읽기 전용 요약) ── */}
                <div className="shrink-0 px-3.5 py-2.5 border-b border-white/[0.07] bg-white/[0.015]">
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {roleList.map((slot) => {
                      const entries = l.roster.filter((r: any) => r.slot === slot);
                      const limit = slotLimitOf(slot);
                      return (
                        <span key={slot} className="flex items-baseline gap-1.5 min-w-0">
                          <span className={`text-[9px] font-black shrink-0 ${roleColor(slot).text}`}>{roleAbbr(slot)}</span>
                          <span className={`text-[11px] font-bold truncate ${entries.length ? "text-gray-200" : "text-gray-700"}`}>
                            {entries.length ? entries.map((r: any) => rosterName(l, r)).join(", ") : `—`}
                          </span>
                          <span className="text-[9px] font-black text-gray-700 tabular-nums shrink-0">{entries.length}/{limit}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* ── 초과 배정 정리 안내 ── */}
                {invOverflow && (
                  <div className="shrink-0 px-3.5 py-2 border-b border-amber-400/30 bg-amber-400/[0.07]">
                    {poEjectable >= 2 && (
                      <p className="text-[10px] font-bold text-amber-200 leading-relaxed">
                        <b>[{po.slot}]</b> 정원을 넘겼습니다. 아래 목록에서 내보낼 선수를 눌러 보유 선수로 되돌리세요.
                      </p>
                    )}
                    {LeaderPosPicker({ leaderIdx: li })}
                  </div>
                )}

                {/* ── 보유 선수 목록 (한 명당 한 줄, 정보 그대로 읽힌다) ── */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
                  <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5">
                    <p className="auc-label text-gray-500">
                      보유 선수 <span className={(l.inventory?.length || 0) > invCapOf(l) ? "text-[#ff5c77]" : "text-gray-300"}>{l.inventory?.length || 0}</span>
                      <span className="text-gray-700">/{invCapOf(l)}</span>
                    </p>
                    {/* 인벤토리 플러스 — 팀당 1회 */}
                    {canManage && invPlusUsed(l) ? (
                      <span className="ml-auto px-2.5 py-1.5 border border-white/12 text-[10px] font-black text-gray-600">플러스 사용됨</span>
                    ) : canManage ? (
                      <button
                        onClick={() => setConfirmCfg({
                          title: "인벤토리 플러스",
                          message: `${invPlusCost.toLocaleString()} Point 를 사용해 인벤토리 용량을 한 칸 늘립니다.\n팀당 한 번만 사용할 수 있습니다. (현재 ${invCapOf(l)}칸 → ${invCapOf(l) + 1}칸)`,
                          confirmLabel: "구매",
                          onConfirm: async () => {
                            const d = await act({ action: "leader:invPlus", leaderIdx: li, byLeaderIdx: myLeaderIdx });
                            if (d?.success) { sfxAssign(); showToast(`인벤토리 용량이 ${d.capacity}칸이 되었습니다`); }
                            else showToast(d?.message || "구매에 실패했습니다");
                          },
                        })}
                        className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] font-black transition-colors ${
                          (l.inventory?.length || 0) > invCapOf(l)
                            ? "border-[#e91e3f] bg-[#e91e3f]/[0.12] text-[#ff5c77]"
                            : "border-white/20 text-gray-400 active:bg-white/[0.06]"
                        }`}
                      >
                        <span className="text-[12px] leading-none">＋</span>플러스
                        <span className="tabular-nums text-gray-500">{invPlusCost.toLocaleString()}</span>
                      </button>
                    ) : null}
                  </div>

                  {(l.inventory?.length || 0) === 0 ? (
                    <p className="px-3.5 py-8 text-center text-[11px] text-gray-700">보유 중인 선수가 없습니다.</p>
                  ) : (
                    (l.inventory || []).map((card: any, ci: number) => {
                      const cp = auction.players[card.playerIdx];
                      const scouted = cp && canSeePos(cp);
                      return (
                        /* 순수 리스트는 밋밋하다 → 왼쪽에 작은 카드를 세워 '카드를 쥐고 있다'는 감각을 남긴다 */
                        <div key={`m-inv-${ci}`} className={`flex gap-3 px-3.5 py-3 border-b border-white/[0.07] ${card.golden ? "bg-amber-400/[0.05]" : ""}`}>
                          <span className={`relative shrink-0 w-[58px] aspect-[3/4.2] rounded-lg border overflow-hidden flex flex-col items-center justify-center gap-1.5 ${card.golden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.20] via-amber-500/[0.06] to-[#0d0d0d] shadow-[0_0_14px_-4px_rgba(251,191,36,0.5)]" : "border-white/12 bg-gradient-to-b from-white/[0.07] to-[#0d0d0d]"}`}>
                            {card.golden && <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-amber-200/15 to-transparent" />}
                            <span className={`relative w-7 h-7 rounded-full flex items-center justify-center border ${card.golden ? "border-amber-300/50 bg-amber-400/10" : "border-white/12 bg-white/[0.04]"}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={`w-3.5 h-3.5 ${card.golden ? "text-amber-300" : "text-gray-500"}`}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                            </span>
                            <span className={`relative text-[9px] font-black tabular-nums ${card.golden ? "text-amber-300" : "text-gray-300"}`}>{card.price.toLocaleString()}</span>
                          </span>

                          <div className="min-w-0 flex-1 flex flex-col">
                            <div className="flex items-baseline gap-1.5">
                              <span className={`text-[14px] font-black truncate ${card.golden ? "text-amber-300" : "text-white"}`}>{cardName(card)}</span>
                              {card.golden && <span className="shrink-0 text-[8px] font-black text-amber-300 border border-amber-400/45 px-1">ALL</span>}
                            </div>
                            <p className="text-[11px] font-bold text-gray-500 mt-1 leading-snug break-keep">
                              {card.golden ? (
                                <span className="text-amber-200/60">티어 비공개</span>
                              ) : (
                                <>
                                  <span className="text-gray-300">{cp?.peakTier || "?"}</span>
                                  <span className="text-gray-700 mx-1">·</span>
                                  <span>{cp?.currentTier || "?"}</span>
                                </>
                              )}
                              {scouted && <span className="block text-gray-200 mt-0.5">{revealParts(cp).map((r: any) => r.v).join(" · ")}</span>}
                            </p>
                            {canManage && !swapMode && !invOverflow && (
                              <div className="mt-auto pt-2 flex">
                                <button
                                  onClick={() => { setMobPick(ci); sfxSelect(); }}
                                  className="ml-auto px-3.5 py-1.5 text-[11px] font-black text-[#ff5c77] border border-[#e91e3f]/60 active:bg-[#e91e3f] active:text-white transition-colors"
                                >
                                  배정 ›
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* ── 배정 완료 (읽기 전용) ── */}
                  {assignedCards.length > 0 && (
                    <>
                      <p className="px-3.5 pt-4 pb-1.5 auc-label text-gray-600">배정 완료 {assignedCards.length}</p>
                      {assignedCards.map((ac: any) => {
                        const sp = auction.players[ac.card.playerIdx];
                        const scouted = sp && canSeePos(sp);
                        return (
                          /* 배정을 마쳤어도 정보는 계속 볼 수 있어야 한다 (티어·스카우터 결과 포함) */
                          <div key={ac.key} className="px-3.5 py-2.5 border-b border-white/[0.05]">
                            <div className="flex items-baseline gap-2">
                              <span className={`shrink-0 text-[10px] font-black ${roleColor(ac.slot).text}`}>{roleAbbr(ac.slot)}</span>
                              <span className={`text-[13px] font-black truncate ${ac.card.golden ? "text-amber-300/80" : "text-gray-200"}`}>{cardName(ac.card)}</span>
                              <span className="ml-auto shrink-0 text-[11px] font-black text-gray-500 tabular-nums">{ac.card.price.toLocaleString()}</span>
                            </div>
                            <p className="text-[10px] font-bold text-gray-500 mt-1 truncate">
                              {ac.card.golden ? (
                                <span className="text-amber-200/50">티어 비공개</span>
                              ) : (
                                <>
                                  <span className="text-gray-400">{sp?.peakTier || "?"}</span>
                                  <span className="text-gray-700 mx-1">·</span>
                                  <span>{sp?.currentTier || "?"}</span>
                                </>
                              )}
                              {scouted ? (
                                <span className="text-gray-300 ml-2">{revealParts(sp).map((r: any) => r.v).join(" · ")}</span>
                              ) : (
                                <span className="text-gray-700 ml-2">스카우터 미사용</span>
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* ── 포지션 체인지 ── */}
                {canManage && (
                  <div className="shrink-0 px-3.5 py-2.5 border-t border-white/12 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-gray-300">포지션 체인지</p>
                      <p className="text-[9px] text-gray-600">팀당 1회 · {S.posChangeCost.toLocaleString()} Pt</p>
                    </div>
                    {l.positionChanged ? (
                      <span className="shrink-0 text-[10px] font-black text-gray-600 border border-white/12 px-2.5 py-1.5">사용됨</span>
                    ) : swapMode ? (
                      <button onClick={() => { setSwapMode(false); setSwapPick([]); }} className="shrink-0 text-[11px] font-black text-gray-300 border border-white/20 px-3 py-1.5">취소</button>
                    ) : (
                      <button
                        onClick={() => { if (l.roster.length < 2) { showToast("배정된 선수가 2명 이상이어야 합니다"); return; } setSwapMode(true); setSwapPick([]); sfxSelect(); showToast("교환할 선수 2명을 선택하세요"); }}
                        className="shrink-0 text-[11px] font-black text-gray-200 border border-white/25 px-3 py-1.5 active:bg-white/10"
                      >
                        교환
                      </button>
                    )}
                  </div>
                )}

                {/* ── 교환 모드: 배정된 선수 중 2명 선택 ── */}
                {swapMode && canManage && (
                  <div className="shrink-0 max-h-[38dvh] overflow-y-auto border-t border-white/12">
                    {l.roster.map((r: any, ri: number) => {
                      if (p1Role && r.slot === p1Role) return null;
                      const picked = swapPick.includes(ri);
                      return (
                        <button
                          key={ri}
                          onClick={() => { setSwapPick((prev) => prev.includes(ri) ? prev.filter((x) => x !== ri) : prev.length >= 2 ? prev : [...prev, ri]); sfxSelect(); }}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-white/[0.07] text-left ${picked ? "bg-[#e91e3f]/15" : ""}`}
                        >
                          <span className={`shrink-0 w-9 text-[10px] font-black ${roleColor(r.slot).text}`}>{roleAbbr(r.slot)}</span>
                          <span className="flex-1 min-w-0 truncate text-[13px] font-black text-white">{rosterName(l, r)}</span>
                          <span className={`shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-black border ${picked ? "border-[#e91e3f] bg-[#e91e3f] text-white" : "border-white/15 text-transparent"}`}>{picked ? "✓" : ""}</span>
                        </button>
                      );
                    })}
                    <button
                      disabled={swapPick.length !== 2}
                      onClick={async () => {
                        if (swapPick.length !== 2) return;
                        const [a, b] = swapPick;
                        const na = rosterName(l, l.roster[a]), nb = rosterName(l, l.roster[b]);
                        const d = await act({ action: "host:posSwap", leaderIdx: li, a, b, byLeaderIdx: myLeaderIdx });
                        if (d?.success) { sfxAssign(); showToast(`${na} ↔ ${nb} 교환 완료`); pushNotice({ kind: "swap", title: "포지션 체인지", rows: [{ l: "교환", v: `${na} ↔ ${nb}` }] }); setSwapMode(false); setSwapPick([]); }
                        else showToast(d?.message || "교환에 실패했습니다");
                      }}
                      className="w-full py-3 text-[12px] font-black text-white bg-[#e91e3f] disabled:bg-white/5 disabled:text-gray-600"
                    >
                      {swapPick.length === 2 ? "선택한 2명 교환" : `${2 - swapPick.length}명 더 선택`}
                    </button>
                  </div>
                )}
              </div>

              {/* 📱 포지션 선택 시트 — '배정하기' 를 누르면 올라온다 */}
              {mobPick !== null && l.inventory?.[mobPick] && (() => {
                const card = l.inventory[mobPick];
                return (
                  /* 하단에 붙이면 선택지가 화면 아래에 뭉친다 → 가운데에 띄워 세로로 펼친다 */
                  <div className="lg:hidden absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/80 animate-in fade-in" onClick={() => setMobPick(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col border border-white/20 bg-[#0e0e10] shadow-[0_24px_60px_-16px_#000] animate-in zoom-in-95 duration-200" style={{ maxHeight: "100%" }}>
                      <div className="flex items-baseline gap-2 px-4 py-3 border-b border-white/12 shrink-0">
                        <span className="auc-label text-gray-500">배정</span>
                        <span className={`text-[13px] font-black truncate ${card.golden ? "text-amber-300" : "text-white"}`}>{cardName(card)}</span>
                        <button onClick={() => setMobPick(null)} className="ml-auto p-1 -mr-1 text-gray-500">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        {roleList.map((slot) => {
                          const entries = l.roster.filter((r: any) => r.slot === slot);
                          const limit = slotLimitOf(slot);
                          const full = entries.length >= limit;
                          const canHere = !full || !!card.golden; // 황금카드는 꽉 찬 슬롯에도
                          return (
                            <button
                              key={slot}
                              disabled={!canHere}
                              onClick={() => { const idx = mobPick; setMobPick(null); requestPlace(idx, slot); }}
                              className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07] text-left transition-colors ${canHere ? "active:bg-white/[0.08]" : "opacity-35"}`}
                            >
                              <span className={`shrink-0 w-10 text-[12px] font-black ${roleColor(slot).text}`}>{roleAbbr(slot)}</span>
                              <span className="flex-1 min-w-0 text-[11px] font-bold text-gray-400 truncate">
                                {entries.length ? entries.map((r: any) => rosterName(l, r)).join(", ") : "비어 있음"}
                              </span>
                              <span className="shrink-0 text-[10px] font-black text-gray-600 tabular-nums">{entries.length}/{limit}</span>
                              <span className={`shrink-0 text-[10px] font-black ${!canHere ? "text-gray-700" : full ? "text-amber-300" : "text-[#ff5c77]"}`}>
                                {!canHere ? "가득참" : full ? "초과 배정" : "배정"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ══ PC 전용: 좌우 2단 ══ */}
              <div className="hidden lg:grid p-5 flex-1 min-h-0 overflow-hidden lg:grid-cols-[1fr_300px] gap-5 items-stretch">

                {/* ══ 좌측 ══ */}
                <div className="order-2 lg:order-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden space-y-4">
                  {/* ── 선택한 선수 정보 카드 ── */}
                  {(() => {
                    const sel = selectedCard;
                    if (!sel) {
                      // 선택 전에도 동일한 높이를 유지해 레이아웃이 밀리지 않도록
                      return (
                        <div className="flex gap-4 sm:gap-5 h-[132px] sm:h-[190px] items-center">
                          <div className="shrink-0 w-[92px] sm:w-[132px] aspect-[3/4.3] rounded-xl border border-dashed border-white/12 flex items-center justify-center">
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
                      <div className="flex gap-4 sm:gap-5 h-[132px] sm:h-[190px]">
                        {/* 세로 카드 — 우측 목록 카드와 동일 규격 */}
                        <div className={`relative shrink-0 w-[92px] sm:w-[132px] aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 ${sel.golden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.18] via-amber-500/[0.06] to-[#0d0d0d] shadow-[0_0_18px_rgba(251,191,36,0.18)]" : "border-white/12 bg-gradient-to-b from-white/[0.06] to-[#0d0d0d]"}`}>
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
                                {/* 크기·두께는 원래대로 (라벨 10px bold / 값 12px bold) */}
                                <span className="w-16 shrink-0 text-[10px] font-bold text-gray-600">{it.l}</span>
                                <span className={`text-[12px] font-bold truncate ${it.v === "미확인" || it.v.includes("불가") || it.v === "비공개" ? "text-gray-600" : "text-gray-200"}`}>{it.v}</span>
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
                    {invOverflow && poEjectable >= 2 && <span className="text-amber-300 font-black normal-case tracking-normal"> — [{po.slot}] 에서 내보낼 선수를 선택하세요</span>}
                  </p>
                  {/* 초과 배정 안내 — 내보낼 선수가 실제로 여럿일 때만 '선택' 안내를 띄운다 */}
                  {invOverflow && (
                    <div className="mb-2 rounded-lg border border-amber-400/35 bg-amber-400/[0.07] px-3 py-2">
                      {poEjectable >= 2 && (
                        <p className="text-[10px] font-bold text-amber-200 leading-relaxed">
                          <b>[{po.slot}]</b> 정원을 넘겼습니다. 내보낼 선수 <b>한 명을 클릭</b>하면 보유 선수로 돌아가며, 원하는 포지션에 다시 배정할 수 있습니다.
                        </p>
                      )}
                      {LeaderPosPicker({ leaderIdx: li })}
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
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[36px] transition-all border ${dropOk ? "border-white/25 bg-white/[0.06] cursor-pointer" : "border-transparent bg-white/[0.035]"}`}
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
                            if (d?.success) { sfxAssign(); showToast(`${na} ↔ ${nb} 포지션 교환 완료`); pushNotice({ kind: "swap", title: "포지션 체인지", rows: [{ l: "교환", v: `${na} ↔ ${nb}` }, { l: "비용", v: `${S.posChangeCost.toLocaleString()} Pt` }] }); setSwapMode(false); setSwapPick([]); }
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
                  <div className="shrink-0 mb-2.5">
                    <p className="text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase">
                      보유 선수{" "}
                      <span className={(l.inventory?.length || 0) > invCapOf(l) ? "text-[#ff5c77]" : "text-gray-200"}>{l.inventory?.length || 0}</span>
                      <span className="text-gray-700">/{invCapOf(l)}</span>
                      {assignedCards.length > 0 && <span className="text-gray-600"> · 배정 {assignedCards.length}</span>}
                      {!mine && <span className="text-gray-600 font-bold normal-case tracking-normal"> — 선택해 정보 확인</span>}
                    </p>
                    {/* 인벤토리 플러스 — 칸이 모자랄 때 여기서 바로 산다 (팀당 1회) */}
                    {canManage && invPlusUsed(l) ? (
                      <span className="mt-2 w-full block text-center px-2.5 py-1.5 border border-white/12 text-[10px] font-black text-gray-600">인벤토리 플러스 사용됨</span>
                    ) : canManage ? (
                      <button
                        onClick={() => setConfirmCfg({
                          title: "인벤토리 플러스",
                          message: `${invPlusCost.toLocaleString()} Point 를 사용해 인벤토리 용량을 한 칸 늘립니다.\n팀당 한 번만 사용할 수 있습니다. (현재 ${invCapOf(l)}칸 → ${invCapOf(l) + 1}칸)`,
                          confirmLabel: "구매",
                          onConfirm: async () => {
                            const d = await act({ action: "leader:invPlus", leaderIdx: li, byLeaderIdx: myLeaderIdx });
                            if (d?.success) { sfxAssign(); showToast(`인벤토리 용량이 ${d.capacity}칸이 되었습니다`); }
                            else showToast(d?.message || "구매에 실패했습니다");
                          },
                        })}
                        className={`mt-2 w-full flex items-center gap-2 px-2.5 py-1.5 border text-[10px] font-black transition-colors ${
                          (l.inventory?.length || 0) > invCapOf(l)
                            ? "border-[#e91e3f] bg-[#e91e3f]/[0.12] text-[#ff5c77] hover:bg-[#e91e3f]/25"
                            : "border-white/20 text-gray-400 hover:border-white hover:text-white hover:bg-white/[0.06]"
                        }`}
                      >
                        <span className="text-[13px] leading-none">＋</span>
                        인벤토리 플러스
                        <span className="ml-auto tabular-nums">{invPlusCost.toLocaleString()} Pt</span>
                      </button>
                    ) : null}
                  </div>
                  {(l.inventory?.length || 0) === 0 && assignedCards.length === 0 ? (
                    <p className="text-center text-xs text-gray-600 py-8 border border-dashed border-white/10 rounded-xl">보유 중인 선수가 없습니다.</p>
                  ) : (
                    <div className="shrink-0 lg:flex-1 lg:min-h-0 overflow-x-auto overflow-y-hidden lg:overflow-x-hidden lg:overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full p-1 flex gap-2.5 lg:block lg:space-y-3">
                      {/* 미배정 카드 */}
                      <div className="flex gap-2.5 w-fit mx-auto lg:w-auto lg:mx-0 lg:grid lg:grid-cols-2 content-start">
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
                              className={`relative w-[78px] shrink-0 lg:w-auto aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 select-none transition-colors ${card.golden ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.18] via-amber-500/[0.06] to-[#0d0d0d] shadow-[0_0_18px_rgba(251,191,36,0.18)]" : "border-white/12 bg-gradient-to-b from-white/[0.06] to-[#0d0d0d]"} ${canManage && !swapMode ? "cursor-grab active:cursor-grabbing hover:border-white/35" : !swapMode ? "cursor-pointer hover:border-white/25" : ""} ${picked ? (card.golden ? "border-amber-300 ring-2 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.45)]" : "border-[#e91e3f] ring-2 ring-[#e91e3f] shadow-[0_0_18px_rgba(255,255,255,0.12)] bg-white/[0.08]") : ""}`}
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
                        <div className="shrink-0 pl-2.5 border-l border-white/[0.07] lg:pl-0 lg:border-l-0 lg:pt-3 lg:border-t lg:border-white/[0.07]">
                          <p className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase mb-2">배정 완료</p>
                          <div className="flex gap-2.5 lg:grid lg:grid-cols-2 content-start">
                            {assignedCards.map((ac: any) => {
                              const picked = dragCard === ac.key;
                              return (
                                <div
                                  key={ac.key}
                                  onClick={() => { if (!canSelect || swapMode) return; const next = picked ? null : ac.key; setDragCard(next); if (next !== null) sfxSelect(); }}
                                  className={`relative w-[78px] shrink-0 lg:w-auto aspect-[3/4.3] rounded-xl border overflow-hidden flex flex-col items-center justify-between px-2 py-2.5 select-none grayscale opacity-55 hover:opacity-80 transition-all ${swapMode ? "" : "cursor-pointer"} border-white/10 bg-gradient-to-b from-white/[0.05] to-[#0d0d0d] ${picked ? "opacity-100 grayscale-0 border-white/40 ring-2 ring-white/30" : ""}`}
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

      {/* 📌 정원 2 이상 슬롯이 초과된 경우 — 서버가 누구를 뺄지 정할 수 없으므로 선택 팝업을 띄운다.
             (후보가 한 명이면 서버가 자동 복귀시키므로 이 팝업은 뜨지 않는다) */}
      {hasOverflow && (isMyOverflow || role === "host") && (() => {
        const ol = auction.leaders[po.leaderIdx];
        if (!ol) return null;
        const list = ol.roster
          .map((r: any, ri: number) => ({ r, ri }))
          .filter(({ r }: any) => r.slot === po.slot && !r.golden && r.playerIdx !== -1);
        if (list.length < 2) return null;
        return (
          <AucModal
            label="Overflow"
            tone="danger"
            title={`[${roleAbbr(po.slot)}] 정원을 넘겼습니다`}
            desc={`${ol.name} 팀 · 내보낼 선수를 한 명 선택하세요. 선택한 선수는 보유 선수로 돌아가며, 원하는 포지션에 다시 배정할 수 있습니다.`}
          >
            <div className="mt-4 border-t border-white/12">
              {list.map(({ r, ri }: any) => {
                const sp = auction.players[r.playerIdx];
                const scouted = sp && canSeePos(sp);
                return (
                  <button
                    key={ri}
                    onClick={async () => {
                      const nm = rosterName(ol, r);
                      const d = await act({ action: "overflow:toInventory", leaderIdx: po.leaderIdx, rosterIdx: ri, byLeaderIdx: myLeaderIdx });
                      if (d?.success) {
                        sfxSelect();
                        showToast(`${nm} 선수가 보유 선수로 돌아왔습니다 — 원하는 포지션에 배정하세요`);
                        // 폴링을 기다리지 않고 즉시 반영
                        patchAuction((a) => {
                          const L = a.leaders?.[po.leaderIdx];
                          const ent = L?.roster?.[ri];
                          if (!L || !ent) return;
                          L.roster.splice(ri, 1);
                          L.inventory.push({ playerIdx: ent.playerIdx, price: ent.price, golden: false });
                          a.pendingOverflow = { leaderIdx: null, slot: null };
                        });
                      } else showToast(d?.message || "정리에 실패했습니다");
                    }}
                    className="w-full flex items-center gap-3 px-1 py-3 border-b border-white/[0.07] text-left transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-black text-white truncate">{rosterName(ol, r)}</span>
                      <span className="block text-[10px] font-bold text-gray-500 truncate mt-0.5">
                        {sp?.peakTier || "?"}<span className="text-gray-700 mx-1">·</span>{sp?.currentTier || "?"}
                        {scouted && <span className="text-gray-300 ml-2">{revealParts(sp).map((x: any) => x.v).join(" · ")}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-gray-400 tabular-nums">{r.price?.toLocaleString()}</span>
                    <span className="shrink-0 text-[10px] font-black text-[#ff5c77]">내보내기 ›</span>
                  </button>
                );
              })}
            </div>
          </AucModal>
        );
      })()}

      {/* 📮 알림함 — 스카우터 결과 모아보기 */}
      {noticeOpen && (
        <AucModal
          label="Notices"
          title="알림함"
          desc="나에게만 보입니다."
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
                <span className="text-[10px] text-gray-800">스카우터·포지션 체인지 기록이 쌓입니다</span>
              </p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="py-3 border-b border-white/[0.07]">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="auc-label-xs text-[#ff5c77]">{n.kind === "scout" ? "Scout" : n.kind === "swap" ? "Change" : n.kind === "assign" ? "Assign" : "Notice"}</span>
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
        <div className="fixed top-20 lg:top-28 inset-x-3 lg:inset-x-auto lg:right-8 lg:w-[268px] z-[126] pointer-events-none animate-[scoutIn_5.5s_ease-in-out_forwards]">
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
                onClick={async () => {
                  setStrategyModalOpen(false);
                  sfxSelect();
                  const d = await act({ action: "host:strategy", seconds: min * 60 });
                  // 폴링을 기다리지 않고 즉시 카운트다운이 돌게 한다
                  if (d?.success) patchAuction((a) => { a.strategyUntil = new Date(serverNow() + min * 60 * 1000).toISOString(); });
                }}
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
                  if (d?.success) { sfxAssign(); showToast(`${na} ↔ ${nb} 포지션 교환 완료`); pushNotice({ kind: "swap", title: "포지션 체인지", rows: [{ l: "교환", v: `${na} ↔ ${nb}` }, { l: "비용", v: `${S.posChangeCost.toLocaleString()} Pt` }] }); setPosSwapTarget(null); setSwapA(""); setSwapB(""); }
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

      {/* 📱 모바일 — 우하단 미니 채팅 (유튜브 라이브처럼 말풍선만 떠 있다가 열린다) */}
      {(
        <>
          <button
            onClick={() => { setMiniChat((v) => !v); setChatUnread(0); sfxSelect(); }}
            aria-label="채팅 열기"
            className="lg:hidden fixed right-4 z-[97] w-12 h-12 rounded-full border border-white/25 bg-[#141416]/95 backdrop-blur-xl shadow-[0_10px_30px_-8px_#000] flex items-center justify-center active:scale-95 transition-transform"
            style={{ bottom: `calc(${bottomBarH}px + 1rem + env(safe-area-inset-bottom))` }}
          >
            {miniChat ? (
              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-5 h-5 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
            )}
            {!miniChat && chatUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e91e3f] text-[10px] font-black text-white flex items-center justify-center">
                {chatUnread > 99 ? "99+" : chatUnread}
              </span>
            )}
          </button>

          {/* 말풍선을 누르면 열리는 팝업 채팅 */}
          {miniChat && (
            <div
              /* 머리글 없이 대화만 — 유튜브 라이브 채팅처럼 가볍게 */
              className="lg:hidden fixed right-4 left-14 sm:left-auto sm:w-[300px] z-[96] flex flex-col border border-white/15 bg-[#0b0b0c]/95 backdrop-blur-xl shadow-[0_20px_60px_-12px_#000] animate-in fade-in slide-in-from-bottom-2 duration-200"
              style={{ bottom: `calc(${bottomBarH}px + 4.5rem + env(safe-area-inset-bottom))`, maxHeight: "min(38dvh, 300px)" }}
            >
              <div ref={miniChatBoxRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
                {chat.filter((m: any) => showSystemChat || !(m.isSystem && m.kind !== "join")).slice(-40).map((m: any, i: number) =>
                  m.kind === "join" ? (
                    <p key={m._id || i} className="text-center text-[10px] text-gray-600 py-0.5">{m.message}</p>
                  ) : m.isSystem ? (
                    <div key={m._id || i} className={`relative border rounded-lg pl-8 pr-8 py-1.5 ${SYS_HIGH.test(m.message || "") ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.08]" : "border-white/20 bg-white/[0.05]"}`}>
                      <span className={`absolute left-2 top-1.5 w-4 h-4 rounded flex items-center justify-center ${SYS_HIGH.test(m.message || "") ? "bg-[#e91e3f]/25" : "bg-white/[0.08]"}`}>
                        <MegaphoneIcon className={`w-2.5 h-2.5 shrink-0 ${SYS_HIGH.test(m.message || "") ? "text-[#ff5c77]" : "text-gray-300"}`} />
                      </span>
                      <p className={`text-center text-[10px] font-bold leading-relaxed break-keep ${SYS_HIGH.test(m.message || "") ? "text-gray-100" : "text-gray-400"}`}>{m.message}</p>
                    </div>
                  ) : (
                    <div key={m._id || i} className="flex items-start gap-2">
                      {m.avatar ? <img src={m.avatar} alt="" className="w-4 h-4 rounded-full shrink-0 mt-0.5" /> : <span className="w-4 h-4 rounded-full bg-white/10 shrink-0 mt-0.5" />}
                      <p className="text-[11px] leading-relaxed min-w-0"><span className="font-bold text-gray-300">{m.userName}</span> <span className="text-gray-400 break-all">{m.message}</span></p>
                    </div>
                  )
                )}
              </div>
              <form onSubmit={sendChat} className="p-2.5 border-t border-white/12 flex gap-2 shrink-0">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} maxLength={200} placeholder="메시지 입력..." className="flex-1 min-w-0 px-3 py-2 bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/40 transition-colors placeholder:text-gray-600" />
                <button type="submit" className="shrink-0 px-3.5 bg-[#e91e3f] text-white text-xs font-black">전송</button>
              </form>
            </div>
          )}
        </>
      )}

      {/* 📱 모바일 하단 독 — 전역 탭을 숨긴 자리를 경매 전용 조작부로 쓴다.
             위: 타 팀 시트 · 가운데: 입찰 · 아래: 내 프로필 + 인벤토리 · 알림함 */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-[95] border-t border-white/15 bg-[#0b0b0c]/97 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* 타 팀 버튼은 뺐다 — 무대 아래 아바타 줄에서 팀을 바로 누르면 프로필이 열린다 */}

        {/* ── 인벤토리가 가득 차면 입찰 바 대신 설명을 둔다 (입찰 시도 자체를 없앤다) ── */}
        {myLeader && invMode && invOverCap && !curPlayer && (
          <button
            onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-[#e91e3f]/40 bg-[#e91e3f]/[0.12] text-left active:bg-[#e91e3f]/25 transition-colors"
          >
            <MegaphoneIcon className="w-3.5 h-3.5 shrink-0 text-white" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black text-[#ff5c77] leading-tight">입찰할 수 없습니다 · 인벤토리 {myInvCount}/{myInvCap}</span>
              <span className="block text-[10px] font-bold text-gray-400 leading-tight mt-0.5">선수를 배정해 칸을 비우세요 — 눌러서 인벤토리 열기</span>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 shrink-0 text-[#ff5c77]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}

        {/* ── 내 슬롯 — 프로필 바로 위에 항상 붙여둔다 (어디가 비었는지 늘 보이게) ── */}
        {myLeader && (
          <div className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden px-3 py-1.5 border-b border-white/12">
            {roleList.flatMap((slot) => {
              const entries = myLeader.roster.filter((r: any) => r.slot === slot);
              const limit = slotLimitOf(slot);
              return Array.from({ length: limit }, (_, k) => {
                const ent = entries[k];
                const rc = roleColor(slot);
                return (
                  <span
                    key={`${slot}-${k}`}
                    className={`flex-1 basis-0 min-w-[54px] px-1 py-1 border text-center ${
                      ent ? (ent.golden ? "border-amber-400/50 bg-amber-400/[0.08]" : "border-white/20 bg-white/[0.05]") : "border-dashed border-white/12"
                    }`}
                  >
                    <span className={`block text-[8px] font-black tracking-wider ${ent ? rc.text : "text-gray-700"}`}>{roleAbbr(slot)}</span>
                    <span className={`block text-[9px] font-black truncate leading-tight mt-0.5 ${ent ? "text-white" : "text-gray-800"}`}>
                      {ent ? rosterName(myLeader, ent) : "—"}
                    </span>
                  </span>
                );
              });
            })}
          </div>
        )}

        {/* ── 내 프로필 고정 + 인벤토리 · 알림함 ── */}
        {myLeader && (() => {
          const myProf = myLeader.discordId ? profiles[myLeader.discordId] : null;
          const invCount = myLeader.inventory?.length || 0;
          return (
            <div className="flex items-center gap-2.5 px-3 py-2">
              {myProf ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={myProf.avatarUrl} alt="" className="w-8 h-8 rounded-full bg-gray-800 ring-1 ring-white/20 shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black text-gray-300 ring-1 ring-white/15 bg-white/[0.04]">{myLeader.name[0]}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-white truncate leading-tight">{myLeader.name}</p>
                <p className="flex items-center gap-1.5 text-[9px] font-bold text-gray-600 leading-tight mt-0.5">
                  {myLeader.position && <span className={roleColor(myLeader.position).text}>{roleAbbr(myLeader.position)}</span>}
                  <span className="tabular-nums">{myLeader.roster.length}/{totalSlots}</span>
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="auc-cap text-gray-600 leading-none">Point</p>
                <p className="text-[15px] font-black text-white tabular-nums leading-tight mt-0.5">{myLeader.points.toLocaleString()}</p>
              </div>

              <span className="shrink-0 w-px h-8 bg-white/12" />

              {/* 유동 액션 — 인벤토리 / 알림함 */}
              {invMode && (
                <button
                  onClick={() => { setInvModal(myLeaderIdx); setDragCard(null); setSwapMode(false); setSwapPick([]); setMoveFrom(null); sfxSelect(); }}
                  aria-label="인벤토리"
                  className={`relative shrink-0 w-9 h-9 flex items-center justify-center border transition-colors ${invOverCap ? "border-[#e91e3f] bg-[#e91e3f]/25 text-[#ff5c77] animate-pulse" : invCount > 0 ? "border-[#e91e3f] bg-[#e91e3f]/15 text-[#ff5c77]" : "border-white/20 text-gray-400 active:bg-white/[0.06]"}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  {invCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-[9px] font-black text-white flex items-center justify-center">{invCount}</span>}
                </button>
              )}
              <button
                onClick={() => { setNoticeOpen(true); setNoticeUnread(0); sfxSelect(); }}
                aria-label="알림함"
                className={`relative shrink-0 w-9 h-9 flex items-center justify-center border transition-colors ${noticeUnread > 0 ? "border-[#e91e3f] bg-[#e91e3f]/15 text-[#ff5c77]" : "border-white/20 text-gray-400 active:bg-white/[0.06]"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {noticeUnread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-[9px] font-black text-white flex items-center justify-center">{noticeUnread}</span>}
              </button>
            </div>
          );
        })()}
      </div>

      {/* 📱 팀 프로필 팝업 — 아바타 줄에서 팀 하나를 누르면 그 팀만 본다.
             리더 프로필·포인트 → 배치도 → 보유 카드 순 */}
      {teamView !== null && auction.leaders[teamView] && (
        <div className="lg:hidden fixed inset-0 z-[112] flex items-center justify-center p-3.5 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setTeamView(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full border border-white/20 bg-[#0d0d0e] shadow-[0_24px_60px_-16px_#000] flex flex-col animate-in zoom-in-95 duration-200"
            style={{ maxHeight: "86dvh" }}
          >
            <span className={`absolute inset-x-0 top-0 h-[2px] ${cur.leaderIdx === teamView ? "bg-[#e91e3f]" : "bg-white/25"}`} />
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/12 shrink-0">
              <span className="auc-label text-white">Team</span>
              <span className="text-[10px] font-bold text-gray-600 tabular-nums">{teamView + 1}/{auction.leaders.length}</span>
              <button onClick={() => setTeamView(null)} className="ml-auto p-1.5 -mr-1 text-gray-500 active:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
              {teamProfile(teamView)}
            </div>
          </div>
        </div>
      )}

      {/* 📱 타 팀 팝업 — 하단에 꽂지 않고 화면 중앙에 띄운다 */}
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-[110] flex items-center justify-center p-3.5 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setSheet(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full border border-white/20 bg-[#0d0d0e] shadow-[0_24px_60px_-16px_#000] flex flex-col animate-in zoom-in-95 duration-200"
            style={{ maxHeight: "86dvh" }}
          >
            <span className="absolute inset-x-0 top-0 h-[2px] bg-[#e91e3f]" />
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/12 shrink-0">
              <span className="auc-label text-white">{isThird ? "Teams" : "Rivals"}</span>
              <span className="text-[10px] font-bold text-gray-600 tabular-nums">
                {`${railLeaders.length}팀`}
              </span>
              <button onClick={() => setSheet(null)} className="ml-auto p-1.5 -mr-1 text-gray-500 active:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15">
              {sheet === "teams" ? teamsSection : null}
            </div>
          </div>
        </div>
      )}

      {/* 📱 모바일 직접 입찰 — 데스크톱 무대의 입력창을 팝업으로 옮겼다 */}
      {mobBid && myLeader && auction.status === "진행중" && curPlayer && !invOverCap && (
        <AucModal
          label="Direct Bid"
          title="직접 입찰"
          desc={`최소 ${nextMinBid.toLocaleString()} Point · 보유 ${myLeader!.points.toLocaleString()} Point\n입찰 단위(${S.minIncrement.toLocaleString()} Point)에 맞춰 자동 보정됩니다.`}
          onClose={() => setMobBid(false)}
          actions={[
            { text: "취소", onClick: () => setMobBid(false) },
            { text: "입찰", kind: "primary", onClick: () => { submitDirectBid(); setMobBid(false); } },
          ]}
        >
          <div className="flex items-center mt-5 border-b border-white/20 focus-within:border-[#e91e3f] transition-colors">
            <button type="button" onClick={() => setBidInput(String(Math.max(nextMinBid, (Number(bidInput) || nextMinBid) - S.minIncrement)))} className="px-4 py-3 text-xl font-black text-gray-600 active:text-white">−</button>
            <input
              type="number"
              inputMode="numeric"
              autoFocus
              placeholder={nextMinBid.toLocaleString()}
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { submitDirectBid(); setMobBid(false); } }}
              className="flex-1 min-w-0 w-full py-3 bg-transparent text-white text-xl text-center outline-none font-black tabular-nums placeholder:text-gray-700"
            />
            <button type="button" onClick={() => setBidInput(String((Number(bidInput) || (nextMinBid - S.minIncrement)) + S.minIncrement))} className="px-4 py-3 text-xl font-black text-gray-600 active:text-white">+</button>
          </div>
        </AucModal>
      )}

      {/* 안내 토스트 — 폭을 고정한다. 중앙 정렬 + 자동 폭이면 메시지 길이마다
             좌우로 늘었다 줄었다 하며 줄 수까지 바뀌어 화면이 흔들린다.
             모바일은 좌우 여백만 남긴 고정 폭, 데스크톱은 고정 360px. */}
      {toast && (
        <div
          className="fixed inset-x-3 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[360px] bottom-[var(--toast-b)] lg:bottom-8 z-[200] flex items-center min-h-[46px] px-4 py-2.5 bg-[#141416] border border-white/15 text-white text-[12px] font-bold leading-snug shadow-[0_20px_50px_-16px_#000] animate-in fade-in slide-in-from-bottom-2"
          style={{ "--toast-b": `calc(${bottomBarH + 12}px + env(safe-area-inset-bottom))` } as React.CSSProperties}
        >
          <span className="w-[2px] self-stretch bg-[#e91e3f] shrink-0 -my-2.5 mr-3" />
          <span className="min-w-0 line-clamp-2">{toast}</span>
        </div>
      )}
    </main>
  );
}
