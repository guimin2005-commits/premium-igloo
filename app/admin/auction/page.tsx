"use client";

// 📌 관리자 · 경매 — 목록 / 개최 두 탭
//    예전에는 공개 경매 화면(/auction)에 목록 관리(공개 전환 · 제목 수정 · 삭제)와 개최 폼(?admin=1)이 섞여 있었다.
//    관리 조작은 전부 여기로 옮기고, 공개 화면은 보기만 한다.
//    · 목록 — 검색 · 상태 토글 → 전체 폭 표 → 줄을 누르면 오른쪽 상세 칸(제목 수정 · 비공개 · 입장 · 삭제)
//    · 개최 — 왼쪽 넓은 칸에 입력 패널들, 오른쪽 좁은 칸(xl 에서 따라옴)에 방 설정 · 요약 · 제출
//    요청 주소 · 본문 · 검증 · 결과 문구는 공개 화면에 있던 그대로다. 화면만 관리자 틀(../ui)로 바꿨다.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GAME_PRESETS, GAME_LIST } from "@/lib/auctionGames";
import { randomNick } from "@/lib/auctionNicks";
import {
  AdminPage,
  AdminTabs,
  Segmented,
  Toolbar,
  SearchInput,
  DataTable,
  DetailPane,
  DefRow,
  StatusChip,
  Panel,
  FieldRow,
  Switch,
  Btn,
  EmptyRow,
  inputClass,
  labelClass,
  fieldNote,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
} from "../ui";
import type { Column } from "../ui";

// 목록 한 줄 — GET /api/auction 이 돌려주는 모양 (관리자에겐 테스트 · 비공개 포함 전부)
type AuctionRow = {
  _id: string;
  title: string;
  status: string;
  game?: string;
  isTest?: boolean;
  isPrivate?: boolean;
  leaderCount: number;
  playerCount: number;
  soldCount?: number;
  createdAt: string;
};

const TABS = [
  { id: "list", short: "목록" },
  { id: "new", short: "개최" },
];
const hrefTab = (id: string) => (id === "list" ? "/admin/auction" : "/admin/auction?tab=new");

// 📌 경매 상태 — 시작 전 경매는 DB 에 "준비중"으로 저장된다("대기"는 선수 상태). 진행중 · 종료가 아니면 모두 대기로 묶는다
const stateOf = (a: AuctionRow) => (a.status === "진행중" ? "진행중" : a.status === "종료" ? "종료" : "대기");
const STATE_TONE: Record<string, "ok" | "warn" | "neutral"> = { 진행중: "ok", 대기: "warn", 종료: "neutral" };

const fmtDate = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

// 빈 카드 한 장 — 추가 · 초기화에 쓰는 모양 (공개 화면과 같다)
const emptyLeader = () => ({ name: "", position: "", discordId: "" });
const emptyPlayer = () => ({ alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", mostChampions: [""], isAllPos: false });

// 경매 방식 — 설명을 함께 읽어야 고를 수 있어 알약 대신 카드로 둔다
const ASSIGN_MODES = [
  { v: "instant", l: "즉시 배정", d: "낙찰 즉시 포지션 배정 후 다음 선수로" },
  { v: "inventory", l: "인벤토리 방식", d: "낙찰 선수를 인벤토리에 보관 → 리더가 언제든 배정, 종료 시 확정" },
];

// 경매 룰 숫자 13개
const RULE_FIELDS = [
  { k: "leaderPoints", l: "리더 시작 Point" },
  { k: "basePrice", l: "기본 시작가" },
  { k: "goldenBasePrice", l: "황금카드 시작가" },
  { k: "scoutCost", l: "스카우터 비용" },
  { k: "goldenScoutCost", l: "황금 스카우터" },
  { k: "ownedScoutCost", l: "낙찰 후 스카우터" },
  { k: "ownedGoldenScoutCost", l: "낙찰 후 황금" },
  { k: "posChangeCost", l: "포지션 체인지" },
  { k: "minIncrement", l: "최소 입찰 단위" },
  { k: "timerSeconds", l: "입찰 타이머(초)" },
  { k: "scoutSeconds", l: "스카우터 타임(초)" },
  { k: "invCapacity", l: "인벤토리 용량(칸)" },
  { k: "invPlusCost", l: "인벤토리 플러스" },
];

// 필수 표시 (라벨 옆 기호)
const Req = () => <span className="text-[#e91e3f]"> *</span>;

// 링크를 버튼(secondary · sm) 모양으로
const LINK_PILL =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold whitespace-nowrap bg-white text-[#131313] border border-[#a3a3a3] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40";

// 포지션 알약 — 다시 누르면 풀린다(토글)
const PILL = "h-8 px-3 rounded-full text-[12px] font-bold border whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30";
const pillCls = (on: boolean) => `${PILL} ${on ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"}`;
// 부 포지션은 먹 테두리로 — 주 포지션(먹 채움)과 한눈에 갈리게
const subPillCls = (on: boolean) => `${PILL} ${on ? "bg-white border-[#131313] text-[#131313] ring-1 ring-[#131313]" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"}`;
const miniLabel = "block text-[12px] font-bold text-[#5a5a5a] mb-1.5";

export default function AdminAuctionPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "new" ? "new" : "list";

  // ── 목록 ────────────────────────────────────
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── 개최 폼 ─────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    scoutCost: 2000, goldenScoutCost: 4000, ownedScoutCost: 2900, ownedGoldenScoutCost: 4900, posChangeCost: 10000, minIncrement: 100, timerSeconds: 15, scoutSeconds: 7,
    invCapacity: 1, invPlusCost: 5000,
  });
  const [leaders, setLeaders] = useState<any[]>([emptyLeader()]);
  const [players, setPlayers] = useState<any[]>([emptyPlayer()]);

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

  // 📌 테스트 전용 — 폼 전체를 더미 데이터로 한 번에 채움
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
    notify(`테스트 데이터를 입력했습니다.\n리더 ${teamCount}명 · 선수 ${total}명 (테스트 방으로 표시)`);
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

  // 📌 선수 카드를 리더로 올린다 — 설문으로 한꺼번에 불러온 뒤 리더를 골라낼 때 쓴다
  const promoteToLeader = (i: number) => {
    const p = players[i];
    if (!p?.alias?.trim()) {
      notify("닉네임이 있어야 리더로 올릴 수 있습니다.", true);
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
    setPlayers((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [emptyPlayer()]));
    notify(`${p.alias}님을 리더로 올렸습니다.${pos ? ` (${pos})` : ""}`);
  };

  // 📌 대회 참가 설문 → 선수 명단 자동 채우기
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);
  const [surveyPosts, setSurveyPosts] = useState<any[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const openSurveyPicker = async () => {
    setShowSurveyPicker(true);
    setSurveyLoading(true);
    try {
      const d = await (await fetch("/api/auction/import-survey", { cache: "no-store" })).json();
      setSurveyPosts(Array.isArray(d?.data) ? d.data : []);
    } catch { setSurveyPosts([]); }
    finally { setSurveyLoading(false); }
  };

  const importSurvey = async (postId: string) => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const qs = new URLSearchParams({ postId, roles: roleNamesList().join(",") });
      const d = await (await fetch(`/api/auction/import-survey?${qs}`, { cache: "no-store" })).json();
      const list = Array.isArray(d?.data) ? d.data : [];
      if (list.length === 0) {
        notify("불러올 응답이 없습니다.", true);
      } else {
        setPlayers(list);
        setShowSurveyPicker(false);
        const skipped = d?.meta?.skipped || 0;
        notify(`선수 ${list.length}명을 불러왔습니다.${skipped ? `\n닉네임을 찾지 못한 ${skipped}명은 제외했습니다.` : ""}`);
      }
    } catch {
      notify("설문을 불러오지 못했습니다.", true);
    } finally {
      setIsImporting(false);
    }
  };

  // 설문 고르기 창 — Esc 로 닫는다 (결과 알림이 위에 떠 있으면 그 창 차례)
  useEffect(() => {
    if (!showSurveyPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      setShowSurveyPicker(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSurveyPicker]);

  // 공개 ↔ 비공개 전환
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
        notify(d.message || "전환했습니다.");
      } else {
        notify(d.message || "전환에 실패했습니다.", true);
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setTogglingId(null);
    }
  };

  // 경매 제목 수정 — 상세 칸의 입력칸이 renameTarget 을 고친다
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameAuction = async () => {
    const t = (renameTarget?.title || "").trim();
    if (!renameTarget || !t || isRenaming) return;
    setIsRenaming(true);
    try {
      const res = await fetch("/api/auction", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameTarget.id, title: t }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setAuctions((prev) => prev.map((a) => (a._id === renameTarget.id ? { ...a, title: t } : a)));
        // 칸은 열어 둔 채 저장된 제목으로 맞춘다 (예전 모달은 닫혔다)
        setRenameTarget({ id: renameTarget.id, title: t });
        notify("제목을 변경했습니다.");
      } else notify(d.message || "제목 변경에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsRenaming(false);
    }
  };

  const fetchList = useCallback(() => {
    fetch("/api/auction", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAuctions(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);
  useEffect(() => { if (isAdmin) fetchList(); }, [isAdmin, fetchList]);

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
      notify("제목, 리더 2명 이상, 선수 1명 이상이 필요합니다.", true);
      return;
    }
    if (validRoles.length === 0) {
      notify("포지션(역할)을 1개 이상 설정해 주세요.", true);
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
        notify(d.message || "생성 실패", true);
      }
    } catch {
      notify("서버 통신 오류", true);
    } finally { setIsSubmitting(false); }
  };

  const executeDelete = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    const res = await fetch(`/api/auction?id=${deleteId}`, { method: "DELETE" }).catch(() => null);
    setIsDeleting(false);
    if (res?.ok) {
      if (selId === deleteId) setSelId(null);
      notify("삭제했습니다.");
    } else {
      notify("삭제에 실패했습니다.", true);
    }
    setDeleteId(null);
    fetchList();
  };

  const closePane = useCallback(() => setSelId(null), []);

  if (gate) return gate;

  // ── 목록 거르기 ──
  const qq = q.trim().toLowerCase();
  const byState = (s: string) => auctions.filter((a) => stateOf(a) === s).length;
  const shown = auctions.filter(
    (a) => (!stateFilter || stateOf(a) === stateFilter) && (!qq || [a.title, a.game].some((v) => String(v ?? "").toLowerCase().includes(qq)))
  );
  const sel = tab === "list" && selId ? auctions.find((a) => a._id === selId) || null : null;

  const smallChip = "!h-5 !px-1.5 !text-[10px]";
  const cols: Column<AuctionRow>[] = [
    {
      key: "state",
      label: "상태",
      className: "w-20",
      render: (a) => <StatusChip tone={STATE_TONE[stateOf(a)]}>{stateOf(a)}</StatusChip>,
    },
    {
      key: "title",
      label: "제목",
      mobile: "title",
      wrap: true,
      render: (a) => (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
          <span className="font-bold text-[#131313] break-keep">{a.title}</span>
          {a.isPrivate && <StatusChip tone="neutral" className={smallChip}>비공개</StatusChip>}
          {a.isTest && <StatusChip tone="warn" className={smallChip}>테스트</StatusChip>}
        </span>
      ),
    },
    { key: "game", label: "종목", render: (a) => a.game || "—" },
    { key: "teams", label: "팀", align: "right", render: (a) => <span className="tabular-nums">{a.leaderCount}팀</span> },
    {
      key: "players",
      label: "선수",
      align: "right",
      render: (a) => (
        <span className="tabular-nums"><span className="text-[#8a8a8a]">낙찰 </span>{a.soldCount ?? 0}/{a.playerCount}</span>
      ),
    },
    { key: "date", label: "생성일", align: "right", render: (a) => <span className="tabular-nums text-[#8a8a8a]">{fmtDate(a.createdAt)}</span> },
  ];

  // ── 개최 요약 ──
  const leaderN = leaders.filter((l) => l.name.trim()).length;
  const playerN = players.filter((p) => p.alias.trim()).length;
  const roleSummary = roles.filter((r) => r.name.trim()).map((r) => `${r.name.trim()}×${r.count}`).join(" · ");

  return (
    <>
      <AdminPage
        section="운영"
        // 📌 제목은 탭과 무관하게 고정 — 탭마다 글자 수가 달라지면 머리가 흔들려 탭 줄이 밀린다(메모: tabs-never-move)
        title="경매"
        tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={hrefTab} />}
      >
        {/* ═══ 목록 ═══ */}
        {tab === "list" && (
          <>
            <Toolbar right={<Btn onClick={() => router.push(hrefTab("new"))}>경매 개최</Btn>}>
              <SearchInput value={q} onChange={setQ} placeholder="제목 · 종목" />
              <Segmented
                options={[
                  { v: "", l: "전체", n: auctions.length },
                  { v: "대기", l: "대기", n: byState("대기") },
                  { v: "진행중", l: "진행중", n: byState("진행중") },
                  { v: "종료", l: "종료", n: byState("종료") },
                ]}
                value={stateFilter}
                onChange={setStateFilter}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중…</EmptyRow> : (
              <DataTable
                columns={cols}
                rows={shown}
                rowKey={(a) => a._id}
                onRowClick={(a) => { setSelId(a._id); setRenameTarget({ id: a._id, title: a.title }); }}
                selectedKey={sel ? sel._id : null}
                empty={auctions.length === 0 ? "개최한 경매가 없습니다." : "검색 결과가 없습니다."}
              />
            )}

            {/* 📌 줄을 누르면 제목 수정 · 공개 전환 · 입장 · 삭제가 상세 칸에 모인다 (예전엔 티켓 아래 글자 단추였다) */}
            <DetailPane
              open={!!sel}
              onClose={closePane}
              title={sel?.title || ""}
              sub={sel ? `${sel.game || "—"} · ${fmtDate(sel.createdAt)}` : undefined}
              badge={
                sel ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip tone={STATE_TONE[stateOf(sel)]}>{stateOf(sel)}</StatusChip>
                    {sel.isPrivate && <StatusChip tone="neutral">비공개</StatusChip>}
                    {sel.isTest && <StatusChip tone="warn">테스트</StatusChip>}
                  </div>
                ) : undefined
              }
              footer={
                sel ? (
                  <>
                    <Link href={`/auction/${sel._id}`} className={LINK_PILL}>경매장 입장</Link>
                    <Btn variant="ghost" size="sm" className="ml-auto !text-[#d01634]" onClick={() => setDeleteId(sel._id)}>삭제</Btn>
                  </>
                ) : undefined
              }
            >
              {sel && (
                <>
                  <dl>
                    <DefRow k="상태">{stateOf(sel)}</DefRow>
                    <DefRow k="종목">{sel.game || "—"}</DefRow>
                    <DefRow k="팀"><span className="tabular-nums">{sel.leaderCount}팀</span></DefRow>
                    <DefRow k="선수"><span className="tabular-nums">{sel.playerCount}명</span></DefRow>
                    <DefRow k="낙찰"><span className="tabular-nums">{sel.soldCount ?? 0}명</span></DefRow>
                    <DefRow k="생성일"><span className="tabular-nums">{fmtDate(sel.createdAt)}</span></DefRow>
                  </dl>

                  {renameTarget && renameTarget.id === sel._id && (
                    <div className="mt-6">
                      <label htmlFor="auction-rename" className={labelClass}>제목</label>
                      <div className="flex items-start gap-2">
                        <input
                          id="auction-rename"
                          value={renameTarget.title}
                          maxLength={60}
                          onChange={(e) => setRenameTarget({ ...renameTarget, title: e.target.value.slice(0, 60) })}
                          // 한글 조합 중 Enter 는 마지막 글자가 빠진 채 저장되므로 건너뛴다
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) renameAuction(); }}
                          placeholder="경매 제목"
                          className={`${inputClass} flex-1 min-w-0`}
                        />
                        <Btn onClick={renameAuction} disabled={!renameTarget.title.trim() || renameTarget.title.trim() === sel.title || isRenaming}>
                          {isRenaming ? "저장 중…" : "저장"}
                        </Btn>
                      </div>
                      <p className="mt-1.5 text-right text-[12px] text-[#8a8a8a] tabular-nums">{renameTarget.title.length}/60</p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-[#ededed] flex items-center justify-between gap-4">
                    <span className="text-[13px] font-bold">비공개</span>
                    <Switch on={!!sel.isPrivate} onChange={(v) => togglePrivate(sel._id, v)} disabled={!!togglingId} label="비공개" />
                  </div>
                </>
              )}
            </DetailPane>
          </>
        )}

        {/* ═══ 개최 ═══ */}
        {tab === "new" && (
          <form onSubmit={handleCreate}>
            {/* 넓은 화면은 두 칸(입력 · 개최 설정), 좁으면 한 칸 — flex-col 에서는 gap 이 먹지 않아 세로 간격은 mb 로 */}
            <div className="flex flex-col xl:flex-row xl:items-start">
              <div className="min-w-0 flex-1 space-y-5 mb-5 xl:mb-0 xl:mr-5">
                {/* 기본 정보 */}
                <Panel title="기본 정보" flush>
                  <FieldRow label={<>경매 제목<Req /></>}>
                    <input type="text" required placeholder="예: 제 1회 종합 e스포츠 대회 경매" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                  </FieldRow>
                  <FieldRow label={<>종목<Req /></>}>
                    <Segmented options={GAME_LIST.map((g) => ({ v: g, l: g }))} value={game} onChange={selectGame} />
                  </FieldRow>
                  <FieldRow label={<>경매 방식<Req /></>} top>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ASSIGN_MODES.map((o) => {
                        const on = assignMode === o.v;
                        return (
                          <button key={o.v} type="button" aria-pressed={on} onClick={() => setAssignMode(o.v)}
                            className={`min-w-0 px-3.5 py-2.5 rounded-lg text-left border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
                              on ? "border-[#131313] ring-1 ring-[#131313]" : "border-[#a3a3a3] hover:border-[#131313]"
                            }`}>
                            <span className={`block text-[13px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{o.l}</span>
                            <span className="block mt-0.5 text-[12px] text-[#5a5a5a] break-keep">{o.d}</span>
                          </button>
                        );
                      })}
                    </div>
                  </FieldRow>
                </Panel>

                {/* 포지션(역할) & 슬롯 — 게임별 프리셋 + 커스텀 편집 */}
                <Panel
                  title="포지션 · 슬롯"
                  flush
                  right={<Btn variant="secondary" size="sm" onClick={() => setRoles([...roles, { name: "", count: 1 }])}>+ 포지션</Btn>}
                >
                  <FieldRow label="팀별 인원" top>
                    {/* 역할 묶음(이름 × 인원) 사이는 가로로 더 띄운다 — 줄바꿈된 묶음끼리 섞여 보이지 않게 */}
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {roles.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="text" placeholder="역할명" aria-label="역할명" value={r.name} onChange={(e) => updateRole(i, "name", e.target.value)} className={`${inputClass} !w-28`} />
                          <span className="text-[13px] text-[#8a8a8a]">×</span>
                          <input type="number" min={1} aria-label="인원" value={r.count} onChange={(e) => updateRole(i, "count", Number(e.target.value))} className={`${inputClass} !w-16 text-center tabular-nums`} />
                          {roles.length > 1 && (
                            <button type="button" onClick={() => setRoles(roles.filter((_, idx) => idx !== i))} aria-label="포지션 삭제"
                              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8a8a8a] hover:text-[#d01634] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </FieldRow>
                  <FieldRow label="선경매 포지션" hint="1페이즈에 먼저 경매합니다. 없음이면 단일 페이즈로 진행합니다.">
                    <Segmented
                      options={[{ v: "", l: "없음(단일)" }, ...roleNamesList().map((n: string) => ({ v: n, l: n }))]}
                      value={phase1Role}
                      onChange={setPhase1Role}
                    />
                  </FieldRow>
                </Panel>

                {/* 룰 설정 (수치) */}
                <Panel title="경매 룰">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4">
                    {RULE_FIELDS.map((f) => (
                      <label key={f.k} className="block min-w-0">
                        <span className={miniLabel}>{f.l}</span>
                        <input type="number" min={0} value={(settings as any)[f.k]} onChange={(e) => setSettings({ ...settings, [f.k]: Number(e.target.value) })} className={`${inputClass} tabular-nums`} />
                      </label>
                    ))}
                  </div>
                </Panel>

                {/* 리더 카드 목록 */}
                <Panel
                  title={<>리더 명단<Req /> <span className="text-[#8a8a8a] font-bold tabular-nums">({leaderN}명)</span></>}
                  right={<Btn variant="secondary" size="sm" onClick={() => setLeaders([...leaders, emptyLeader()])}>리더 추가</Btn>}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {leaders.map((l, i) => (
                      <div key={i} className="min-w-0 rounded-2xl border border-[#ededed] p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">리더 {i + 1}</span>
                          {leaders.length > 1 && (
                            <Btn variant="ghost" size="sm" className="!text-[#d01634]" onClick={() => setLeaders(leaders.filter((_, idx) => idx !== i))}>제거</Btn>
                          )}
                        </div>
                        <input type="text" placeholder="리더 이름" value={l.name} onChange={(e) => updateLeader(i, "name", e.target.value)} className={`${inputClass} mb-2`} />
                        <input type="text" placeholder="디스코드 ID (선택 · 프로필 표시)" value={l.discordId} onChange={(e) => updateLeader(i, "discordId", e.target.value)} className={`${inputClass} mb-3`} />
                        <div className="flex flex-wrap gap-1.5">
                          {roleNamesList().map((pos: string) => (
                            <button type="button" key={pos} aria-pressed={l.position === pos} onClick={() => updateLeader(i, "position", l.position === pos ? "" : pos)} className={pillCls(l.position === pos)}>{pos}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className={fieldNote}>
                    {phase1Role ? `${phase1Role} 포지션 리더는 1페이즈 참가가 자동 차단됩니다. ` : ""}디스코드 ID가 있으면 접속 시 리더 화면으로 들어갑니다.
                  </p>
                </Panel>

                {/* 선수 카드 목록 */}
                <Panel
                  title={<>선수 명단<Req /> <span className="text-[#8a8a8a] font-bold tabular-nums">({playerN}명)</span></>}
                  right={
                    <>
                      <Btn variant="secondary" size="sm" onClick={openSurveyPicker}>설문에서 불러오기</Btn>
                      <Btn variant="secondary" size="sm" onClick={rollAllNicks}>전체 랜덤 닉네임</Btn>
                      <Btn variant="secondary" size="sm" onClick={() => setPlayers([...players, emptyPlayer()])}>선수 추가</Btn>
                    </>
                  }
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {players.map((p, i) => (
                      <div key={i} className={`min-w-0 rounded-2xl border p-4 ${p.isAllPos ? "border-amber-200 bg-amber-50/60" : "border-[#ededed]"}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">선수 {i + 1}</span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <button type="button" onClick={() => promoteToLeader(i)} title="이 선수를 리더로" className={pillCls(false)}>리더로</button>
                            <button type="button" aria-pressed={!!p.isAllPos} onClick={() => updatePlayer(i, "isAllPos", !p.isAllPos)}
                              className={`${PILL} ${p.isAllPos ? "bg-amber-700 border-amber-700 text-white" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"}`}>
                              올 포지션
                            </button>
                            {players.length > 1 && (
                              <Btn variant="ghost" size="sm" className="!text-[#d01634]" onClick={() => setPlayers(players.filter((_, idx) => idx !== i))}>제거</Btn>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <input type="text" placeholder="익명 닉네임" value={p.alias} onChange={(e) => updatePlayer(i, "alias", e.target.value)} className={`${inputClass} flex-1 min-w-0`} />
                          <button type="button" onClick={() => rollNick(i)} title="랜덤 닉네임" aria-label="랜덤 닉네임"
                            className="shrink-0 w-10 h-10 rounded-full border border-[#a3a3a3] bg-white text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313] flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                          </button>
                        </div>
                        <input type="text" placeholder="디스코드 ID (선택 · 낙찰 후 프로필 공개용)" value={p.discordId} onChange={(e) => updatePlayer(i, "discordId", e.target.value)} className={`${inputClass} mb-2`} />
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <input type="text" placeholder="최고 티어" aria-label="최고 티어" value={p.peakTier} onChange={(e) => updatePlayer(i, "peakTier", e.target.value)} className={inputClass} />
                          <input type="text" placeholder="현재 티어" aria-label="현재 티어" value={p.currentTier} onChange={(e) => updatePlayer(i, "currentTier", e.target.value)} className={inputClass} />
                        </div>
                        {p.isAllPos ? (
                          <div className="space-y-2.5">
                            <p className="text-[12px] font-bold text-amber-700 leading-relaxed break-keep">
                              황금카드 — 티어 비공개 · 시작가 {settings.goldenBasePrice.toLocaleString()}pt · 슬롯 자유(이미 찬 곳도 배정) · 스카우터({settings.goldenScoutCost.toLocaleString()}pt)는 모스트만 공개
                            </p>
                            <label className="block">
                              <span className={miniLabel}>모스트 챔피언 <span className="font-medium">(스카우터 공개 · 1개)</span></span>
                              <input type="text" placeholder="예: 아트록스" value={(p.mostChampions || [""])[0] || ""} onChange={(e) => updatePlayer(i, "mostChampions", [e.target.value])} className={inputClass} />
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div>
                              <p className={miniLabel}>주 포지션</p>
                              <div className="flex flex-wrap gap-1.5">
                                {roleNamesList().map((pos: string) => (
                                  <button type="button" key={pos} aria-pressed={p.mainPos === pos} onClick={() => updatePlayer(i, "mainPos", p.mainPos === pos ? "" : pos)} className={pillCls(p.mainPos === pos)}>{pos}</button>
                                ))}
                              </div>
                            </div>
                            {reveal.includes("subPos") && (
                              <div>
                                <p className={miniLabel}>부 포지션</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {roleNamesList().map((pos: string) => (
                                    <button type="button" key={pos} aria-pressed={p.subPos === pos} onClick={() => updatePlayer(i, "subPos", p.subPos === pos ? "" : pos)} className={subPillCls(p.subPos === pos)}>{pos}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {reveal.includes("champions") && (
                              <label className="block">
                                <span className={miniLabel}>모스트 챔피언 <span className="font-medium">(스카우터 공개 · 1개)</span></span>
                                <input type="text" placeholder="예: 아트록스" value={(p.mostChampions || [""])[0] || ""} onChange={(e) => updatePlayer(i, "mostChampions", [e.target.value])} className={inputClass} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {phase1Role && <p className={fieldNote}>주/부 포지션에 {phase1Role}가 포함된 선수는 1페이즈로 자동 분류됩니다.</p>}
                </Panel>
              </div>

              {/* 개최 설정 — 넓은 화면에서는 스크롤을 따라온다. 좁으면 명단 아래(제출이 맨 끝) */}
              <div className="xl:w-[340px] shrink-0 xl:sticky xl:top-[88px]">
                <Panel title="개최 설정">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <span className="text-[13px] font-bold">테스트 방</span>
                    <Switch on={isTest} onChange={setIsTest} label="테스트 방" />
                  </div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-[13px] font-bold">비공개</span>
                    <Switch on={isPrivate} onChange={setIsPrivate} label="비공개" />
                  </div>
                  <dl className="mb-5 border-t border-[#ededed]">
                    <DefRow k="리더"><span className="tabular-nums">{leaderN}명</span></DefRow>
                    <DefRow k="선수"><span className="tabular-nums">{playerN}명</span></DefRow>
                    <DefRow k="포지션"><span className="tabular-nums">{roleSummary || "—"}</span></DefRow>
                  </dl>
                  <Btn variant="secondary" className="w-full mb-2" onClick={fillTestData}>테스트 데이터 자동 입력</Btn>
                  <Btn type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "생성 중…" : "경매장 생성"}</Btn>
                </Panel>
              </div>
            </div>
          </form>
        )}
      </AdminPage>

      <ConfirmDialog
        open={!!deleteId}
        title="삭제 확인"
        body="경매장과 모든 기록 · 채팅이 삭제됩니다."
        confirmLabel="삭제"
        danger
        busy={isDeleting}
        onConfirm={executeDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── 설문에서 선수 불러오기 ── */}
      {showSurveyPicker && (
        <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={() => setShowSurveyPicker(false)}>
          <div role="dialog" aria-modal="true" aria-label="설문에서 선수 불러오기" onClick={(e) => e.stopPropagation()}
            className="bg-white border border-[#ededed] rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="shrink-0 px-5 py-4 border-b border-[#ededed]">
              <h2 className="text-[17px] font-black tracking-tight">설문에서 선수 불러오기</h2>
              <p className="mt-1 text-[12px] text-[#5a5a5a] break-keep">고른 대회의 참가 응답으로 선수 명단을 채웁니다.</p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-bar divide-y divide-[#ededed]">
              {surveyLoading ? (
                <p className="px-5 py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
              ) : surveyPosts.length === 0 ? (
                <p className="px-5 py-12 text-center text-[13px] text-[#5a5a5a] break-keep">참가 설문을 받은 대회가 없습니다.</p>
              ) : (
                surveyPosts.map((p) => (
                  <button key={p._id} type="button" disabled={isImporting || p.responses === 0}
                    onClick={() => importSurvey(p._id)}
                    className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#f2f2f2] ${p.responses === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-[#f7f7f7]"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold truncate">{p.title}</p>
                      <p className="mt-0.5 text-[12px] text-[#8a8a8a] tabular-nums">
                        {new Date(p.createdAt).toLocaleDateString("ko-KR")} · 응답 {p.responses}건
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-[#d01634] shrink-0">
                      {isImporting ? "불러오는 중" : "불러오기"}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-[#ededed] flex justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setShowSurveyPicker(false)}>닫기</Btn>
            </div>
          </div>
        </div>
      )}

      {noticeEl}
    </>
  );
}
