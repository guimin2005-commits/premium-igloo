"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";
import Dropdown from "../../components/Dropdown";
import { VOICE_TIERS } from "@/lib/voiceTiers";

const ADMIN_USERS = ["elahw.06"];

const CHANNEL_TYPE_LABEL: Record<string, string> = { text: "텍스트", voice: "음성", category: "카테고리" };
const CHANNEL_TYPE_ICON: Record<string, string> = { text: "#", voice: "🔊", category: "📁" };
const REASON_LABEL: Record<string, string> = { chat: "채팅", voice: "음성", attend: "출석" };
const PERIOD_LABEL: Record<string, string> = { daily: "일일", weekly: "주간", monthly: "월간" };
const INV_CATEGORY: Record<string, string> = { perk: "특전", title: "칭호", notify: "알림", etc: "기타" };

const TAB_META: Record<string, { title: string; desc: string }> = {
  settings: { title: "기본 정책", desc: "지급량·쿨타임·음소거·퇴장 처리 등 봇의 기본 XP 규칙을 설정합니다." },
  roles: { title: "역할 설정", desc: "레벨 보상 역할과 역할별 Boost 효과를 관리합니다." },
  channels: { title: "채널 · 카테고리", desc: "채널별 XP Boost와 지급 제외를 관리합니다." },
  boosts: { title: "기간제 부스트", desc: "대상·XP·기간을 지정한 한시적 부스트를 운영합니다." },
  inventory: { title: "인벤토리 역할", desc: "디스코드 역할을 보유 아이템으로 등록합니다. 등록된 역할을 가진 멤버의 대시보드 인벤토리에 표시됩니다." },
  quests: { title: "퀘스트", desc: "일일·주간·월간 퀘스트를 관리합니다. 진행도는 봇의 XP 지급 로그로 자동 판정되며, 주기마다 초기화됩니다." },
  grant: { title: "XP 수동 지급", desc: "특정 유저나 전원에게 XP를 지급·제거하거나, 보유 XP를 초기화합니다." },
  leaderboard: { title: "리더보드", desc: "누적·월간 XP 랭킹을 확인합니다." },
  logs: { title: "XP 로그", desc: "봇이 지급한 XP 내역을 조회합니다. (최근 60일 보관)" },
};

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// datetime-local 입력값 ↔ Date 변환 (로컬 시간 기준)
const toLocalInput = (v: string | Date) => {
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AdminBotPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  // 📌 사이드 패널 하위 카테고리와 연결되는 탭
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "settings";
  const tab = TAB_META[tabParam] ? tabParam : "settings";

  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "role" | "channel" | "boost" | "quest" | "inventory"; id: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 공통 데이터
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [guildChannels, setGuildChannels] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<any[]>([]);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lbPeriod, setLbPeriod] = useState<"all" | "month">("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logReason, setLogReason] = useState("");
  const [logQuery, setLogQuery] = useState("");

  const notify = (message: string, isError = false) => setPopup({ isOpen: true, message, isError });
  const saved = () => notify("저장되었습니다. 봇에는 1분 이내 자동 반영됩니다.");

  const [quests, setQuests] = useState<any[]>([]);
  const [invRoles, setInvRoles] = useState<any[]>([]);
  const emptyInv = { id: "", roleId: "", label: "", category: "perk", description: "", sortOrder: 0, visible: true };
  const [invForm, setInvForm] = useState<any>(emptyInv);
  const emptyQuest = { id: "", name: "", desc: "", period: "daily", reason: "chat", metric: "count", target: 1, rewardXp: 0, enabled: true, order: 0 };
  const [questForm, setQuestForm] = useState<any>(emptyQuest);

  // ── 데이터 로드 ─────────────────────────────
  const fetchCore = useCallback(() => {
    Promise.all([
      fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/channel-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-channels", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: null })),
      fetch("/api/xp-boost", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/daily-quest", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/inventory-role", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([cfg, roles, chCfg, channels, st, bst, qst, inv]) => {
      setConfigs(Array.isArray(cfg?.data) ? cfg.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setChannelConfigs(Array.isArray(chCfg?.data) ? chCfg.data : []);
      setGuildChannels(Array.isArray(channels?.data) ? channels.data : []);
      if (st?.data) setSettings(st.data);
      setBoosts(Array.isArray(bst?.data) ? bst.data : []);
      setQuests(Array.isArray(qst?.data) ? qst.data : []);
      setInvRoles(Array.isArray(inv?.data) ? inv.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) fetchCore(); }, [isAdmin, fetchCore]);

  // 리더보드
  useEffect(() => {
    if (!isAdmin || tab !== "leaderboard") return;
    fetch(`/api/xp/leaderboard?period=${lbPeriod}&limit=100`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLeaderboard(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, [isAdmin, tab, lbPeriod]);

  // 로그
  useEffect(() => {
    if (!isAdmin || tab !== "logs") return;
    const qs = new URLSearchParams({ limit: "50", skip: String(logPage * 50) });
    if (logReason) qs.set("reason", logReason);
    if (logQuery.trim()) qs.set("q", logQuery.trim());
    fetch(`/api/xp-logs?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setLogs(Array.isArray(d?.data) ? d.data : []); setLogTotal(d?.total || 0); })
      .catch(() => {});
  }, [isAdmin, tab, logPage, logReason, logQuery]);

  // ── 저장 핸들러 ─────────────────────────────
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/bot-settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    }).catch(() => null);
    if (res?.ok) { const d = await res.json(); setSettings(d.data); saved(); }
    else notify("저장에 실패했습니다.", true);
  };

  // ── XP 수동 지급 ─────────────────────────────
  const [grantForm, setGrantForm] = useState({ target: "", amount: "", reason: "" });
  const [grantLogs, setGrantLogs] = useState<any[]>([]);
  const [isGranting, setIsGranting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const loadGrantLogs = useCallback(() => {
    fetch("/api/xp/grant", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGrantLogs(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { if (isAdmin && tab === "grant") loadGrantLogs(); }, [isAdmin, tab, loadGrantLogs]);

  // amount를 넘기면 그 값으로, 넘기지 않으면 입력값 그대로 보낸다 (제거는 음수로 뒤집는다)
  const runGrant = async (target: string, override?: { amount?: number; mode?: "reset" }) => {
    if (isGranting) return;
    setIsGranting(true);
    try {
      const res = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...grantForm, target, ...override }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        notify(d.message || "처리했습니다.");
        setGrantForm({ target: "", amount: "", reason: "" });
        loadGrantLogs();
      } else {
        notify(d.message || "처리에 실패했습니다.", true);
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsGranting(false);
      setConfirmAll(false);
      setConfirmReset(null);
    }
  };

  const submitGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.target.trim()) return notify("지급 대상을 입력해주세요.", true);
    runGrant(grantForm.target.trim());
  };

  // 제거 — 입력한 XP만큼 회수한다 (보유량을 넘으면 보유량까지만)
  const submitRemove = () => {
    const amount = Math.abs(Math.trunc(Number(grantForm.amount) || 0));
    if (!grantForm.target.trim()) return notify("제거할 대상을 입력해주세요.", true);
    if (!amount) return notify("제거할 XP를 입력해주세요.", true);
    runGrant(grantForm.target.trim(), { amount: -amount });
  };

  // 초기화 — 보유 XP·레벨을 0으로 되돌린다
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const [roleForm, setRoleForm] = useState<any>({ roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "", exclusive: false });
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === roleForm.roleId);

  // ── 음성 티어 역할 일괄 등록 ──────────────────
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [tierSaving, setTierSaving] = useState(false);

  const saveTierRoles = async () => {
    const picked = VOICE_TIERS.filter((t: any) => tierMap[t.key]);
    if (!picked.length) return notify("연결할 역할을 하나 이상 선택해 주세요.", true);
    // 같은 역할을 두 티어에 붙이면 지급·회수가 서로 싸운다
    const ids = picked.map((t: any) => tierMap[t.key]);
    if (new Set(ids).size !== ids.length) return notify("같은 역할을 여러 티어에 연결할 수 없습니다.", true);

    setTierSaving(true);
    let ok = 0;
    for (const t of picked as any[]) {
      const roleId = tierMap[t.key];
      const res = await fetch("/api/role-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          roleName: guildRoles.find((r: any) => r.id === roleId)?.name || t.name,
          rewardLevel: t.min,
          buffXp: 0,
          attendBuffXp: 0,
          exclusive: true, // 티어 사다리 — 최상위 하나만 유지된다
        }),
      }).catch(() => null);
      if (res?.ok) ok++;
    }
    setTierSaving(false);
    fetchCore();
    if (ok === picked.length) notify(`티어 역할 ${ok}개를 연결했습니다. 봇에는 1분 이내 반영됩니다.`);
    else notify(`${ok}/${picked.length}개만 저장되었습니다.`, true);
  };

  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.roleId) return notify("역할을 선택해주세요.", true);
    const res = await fetch("/api/role-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId: roleForm.roleId, roleName: selectedRole?.name || "",
        rewardLevel: roleForm.rewardLevel === "" ? null : Number(roleForm.rewardLevel),
        buffXp: Number(roleForm.buffXp) || 0, attendBuffXp: Number(roleForm.attendBuffXp) || 0,
        exclusive: !!roleForm.exclusive,
      }),
    }).catch(() => null);
    if (res?.ok) { setRoleForm({ roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "", exclusive: false }); fetchCore(); saved(); }
    else notify("저장에 실패했습니다.", true);
  };

  const [chForm, setChForm] = useState({ channelId: "", boostXp: "", excluded: false });
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const selectedChannel = guildChannels.find((c) => c.id === chForm.channelId);

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chForm.channelId) return notify("채널을 선택해주세요.", true);
    if (!chForm.excluded && !(Number(chForm.boostXp) > 0)) return notify("Boost XP를 입력하거나 지급 제외를 선택해주세요.", true);
    const res = await fetch("/api/channel-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: chForm.channelId, channelName: selectedChannel?.name || "",
        channelType: selectedChannel?.type || "text",
        boostXp: chForm.excluded ? 0 : Number(chForm.boostXp) || 0, excluded: chForm.excluded,
      }),
    }).catch(() => null);
    if (res?.ok) { setChForm({ channelId: "", boostXp: "", excluded: false }); fetchCore(); saved(); }
    else notify("저장에 실패했습니다.", true);
  };

  const emptyBoost = { id: "", name: "", targetRoleId: "", targetChannelId: "", boostXp: "", startAt: "", endAt: "" };
  const [boostForm, setBoostForm] = useState(emptyBoost);
  const [isBoostRoleOpen, setIsBoostRoleOpen] = useState(false);
  const [isBoostChannelOpen, setIsBoostChannelOpen] = useState(false);
  const boostRole = guildRoles.find((r) => r.id === boostForm.targetRoleId);
  const boostChannel = guildChannels.find((c) => c.id === boostForm.targetChannelId);

  const saveBoost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boostForm.startAt || !boostForm.endAt) return notify("기간을 입력해주세요.", true);
    const res = await fetch("/api/xp-boost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...boostForm,
        targetRoleName: boostRole?.name || "",
        targetChannelName: boostChannel?.name || "",
        targetChannelType: boostChannel?.type || "",
        boostXp: Number(boostForm.boostXp) || 0,
        startAt: new Date(boostForm.startAt), endAt: new Date(boostForm.endAt),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setBoostForm(emptyBoost); fetchCore(); saved(); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // ── 인벤토리 역할 ───────────────────────────
  const saveInvRole = async () => {
    if (!invForm.roleId) return notify("역할을 선택해 주세요.", true);
    const res = await fetch("/api/inventory-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...invForm, roleName: guildRoles.find((r: any) => r.id === invForm.roleId)?.name || "" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (d?.success) { setInvForm(emptyInv); fetchCore(); notify("저장되었습니다. 유저 인벤토리에 바로 반영됩니다."); }
    else notify(d?.error || "저장에 실패했습니다.", true);
  };

  // ── 일일 퀘스트 ─────────────────────────────
  const saveQuest = async () => {
    if (!questForm.name.trim()) return notify("퀘스트 이름을 입력해 주세요.", true);
    const res = await fetch("/api/daily-quest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (d?.success) {
      setQuestForm(emptyQuest);
      fetchCore();
      notify("저장되었습니다. 유저 화면에 바로 반영됩니다.");
    } else notify(d?.error || "저장에 실패했습니다.", true);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const api = { role: "/api/role-config", channel: "/api/channel-config", boost: "/api/xp-boost", quest: "/api/daily-quest", inventory: "/api/inventory-role" }[deleteConfirm.kind];
    const res = await fetch(`${api}?id=${deleteConfirm.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) fetchCore();
    setDeleteConfirm(null);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-[#131313] mb-2">권한 없음</h2>
        <p className="text-[#5a5a5a] text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-transparent border border-black/10 rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#8a8a8a]";
  const fieldNote = "text-[10px] text-[#5a5a5a] mt-1.5";
  const labelClass = "block text-xs font-bold text-[#8a8a8a] mb-2";
  const primaryBtn = "w-full md:w-auto md:px-10 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all";

  const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-black/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg md:text-xl font-black text-[#131313] tracking-tight">{title}</h2>
        {right}
      </div>
    </div>
  );

  const meta = TAB_META[tab];

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Admin · Level Dashboard</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-[#131313]">{meta.title.split(" ")[0]} </span>
              <span className="text-[#e91e3f]">{meta.title.split(" ").slice(1).join(" ") || "설정"}</span>
            </h1>
            <p className="text-[#5a5a5a] text-sm md:text-base leading-relaxed">{meta.desc}</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-14">

        {/* ═══ 기본 정책 ═══ */}
        {tab === "settings" && settings && (
          <Reveal>
          <form onSubmit={saveSettings} className="space-y-14">
            <section>
              <SectionHead no="01" title="지급량 · 주기" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>채팅 XP</label>
                  <input type="number" min={0} value={settings.chatXp} onChange={(e) => setSettings({ ...settings, chatXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>메시지 1회당 기본 지급량</p>
                </div>
                <div>
                  <label className={labelClass}>채팅 쿨타임 (초)</label>
                  <input type="number" min={0} value={settings.chatCooldownSec} onChange={(e) => setSettings({ ...settings, chatCooldownSec: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>이 시간 안의 추가 메시지는 지급 없음</p>
                </div>
                <div>
                  <label className={labelClass}>음성 XP</label>
                  <input type="number" min={0} value={settings.voiceXp} onChange={(e) => setSettings({ ...settings, voiceXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 지급 1회당 기본 지급량</p>
                </div>
                <div>
                  <label className={labelClass}>음성 지급 주기 (초)</label>
                  <input type="number" min={30} value={settings.voiceIntervalSec} onChange={(e) => setSettings({ ...settings, voiceIntervalSec: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 채널 접속자에게 이 주기마다 지급 (기본 300초 = 5분)</p>
                </div>
                <div>
                  <label className={labelClass}>출석체크 XP</label>
                  <input type="number" min={0} value={settings.attendXp} onChange={(e) => setSettings({ ...settings, attendXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>일일 출석 보상 지급량 (1일 1회)</p>
                </div>
                <div>
                  <label className={labelClass}>출석 인정 접속 시간 (분)</label>
                  <input type="number" min={1} max={1440} value={settings.attendVoiceMin ?? 60} onChange={(e) => setSettings({ ...settings, attendVoiceMin: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 채널에 하루 이만큼 머무르면 출석 보상을 받을 수 있습니다 (기본 60분)</p>
                </div>
              </div>
            </section>

            <section>
              <SectionHead no="02" title="음소거 · 퇴장 처리" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>음소거 시 처리</label>
                  <div className="flex gap-2">
                    {[
                      { v: "off", l: "제한 없음" },
                      { v: "reduce", l: "감소" },
                      { v: "block", l: "차단" },
                    ].map((o) => (
                      <button key={o.v} type="button" onClick={() => setSettings({ ...settings, muteMode: o.v })}
                        className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${settings.muteMode === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <p className={fieldNote}>차단은 지급 자체를 건너뜁니다</p>
                </div>
                <div>
                  <label className={labelClass}>감소 비율 (%)</label>
                  <input type="number" min={0} max={100} value={settings.muteReducePct} disabled={settings.muteMode !== "reduce"}
                    onChange={(e) => setSettings({ ...settings, muteReducePct: e.target.value })} className={`${inputClass} disabled:opacity-40`} />
                  <p className={fieldNote}>90 = 원래 지급량의 10%만 지급</p>
                </div>
                <div>
                  <label className={labelClass}>적용 기준</label>
                  <div className="flex gap-2">
                    {[
                      { v: "both", l: "마이크+헤드셋 모두" },
                      { v: "any", l: "하나라도 음소거" },
                    ].map((o) => (
                      <button key={o.v} type="button" onClick={() => setSettings({ ...settings, muteTarget: o.v })}
                        className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${settings.muteTarget === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <p className={fieldNote}>어떤 상태를 &lsquo;음소거&rsquo;로 볼지</p>
                </div>
                <div>
                  <label className={labelClass}>서버 퇴장 시 XP 초기화</label>
                  <button type="button" onClick={() => setSettings({ ...settings, resetOnLeave: !settings.resetOnLeave })}
                    className={`${inputClass} flex items-center justify-between text-left ${settings.resetOnLeave ? "border-[#e91e3f]/50" : ""}`}>
                    <span className={settings.resetOnLeave ? "text-[#e91e3f] font-bold" : "text-[#5a5a5a]"}>{settings.resetOnLeave ? "초기화함" : "유지함 (기본)"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.resetOnLeave ? "bg-[#e91e3f]" : "bg-[#e6e3de]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${settings.resetOnLeave ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                  <p className={fieldNote}>⚠️ 켜면 나간 유저의 XP 기록이 삭제되어 복구할 수 없습니다</p>
                </div>

                <div>
                  <label className={labelClass}>ARCTIC 상점 공개</label>
                  <button type="button" onClick={() => setSettings({ ...settings, shopPublic: !settings.shopPublic })}
                    className={`${inputClass} flex items-center justify-between text-left ${settings.shopPublic ? "border-[#e91e3f]/50" : ""}`}>
                    <span className={settings.shopPublic ? "text-[#e91e3f] font-bold" : "text-[#5a5a5a]"}>{settings.shopPublic ? "공개 중" : "비공개 (관리자만)"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.shopPublic ? "bg-[#e91e3f]" : "bg-[#e6e3de]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${settings.shopPublic ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                  <p className={fieldNote}>
                    비공개면 일반 유저에게 &lsquo;준비 중&rsquo; 화면이 보이고 관리자만 상점을 이용할 수 있습니다
                  </p>
                </div>
              </div>
            </section>

            <section>
              <SectionHead no="03" title="레벨업 알림" />
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>알림 채널</label>
                  <Dropdown
                    value={settings.levelupChannelId || ""}
                    onChange={(v) => setSettings({ ...settings, levelupChannelId: v })}
                    options={[
                      { value: "", label: "알림 끄기" },
                      ...guildChannels.filter((c) => c.type === "text").map((c) => ({ value: c.id, label: `# ${c.name}` })),
                    ]}
                  />
                  <p className={fieldNote}>레벨업 시 메시지를 보낼 채널</p>
                </div>
                <div>
                  <label className={labelClass}>알림 문구</label>
                  <textarea rows={2} value={settings.levelupMessage} onChange={(e) => setSettings({ ...settings, levelupMessage: e.target.value })}
                    className={`${inputClass} resize-none`} />
                  <p className={fieldNote}>
                    <span className="text-[#3a3a3a]">{"{user}"}</span> 멘션 · <span className="text-[#3a3a3a]">{"{level}"}</span> 도달 레벨 · <span className="text-[#3a3a3a]">{"{xp}"}</span> 누적 XP · 디스코드 마크다운(**굵게**) 사용 가능
                  </p>
                </div>
              </div>
            </section>

            <section>
              <SectionHead no="04" title="역할 지급 알림" right={
                <button type="button" onClick={() => setSettings({ ...settings, roleGrantEnabled: settings.roleGrantEnabled === false })}
                  className={`flex items-center gap-2.5 text-[11px] font-bold transition-colors ${settings.roleGrantEnabled !== false ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
                  {settings.roleGrantEnabled !== false ? "사용 중" : "사용 안 함"}
                  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.roleGrantEnabled !== false ? "bg-[#e91e3f]" : "bg-[#e6e3de]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${settings.roleGrantEnabled !== false ? "left-[18px]" : "left-0.5"}`}></span>
                  </span>
                </button>
              } />
              <div className={`space-y-4 ${settings.roleGrantEnabled === false ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                  <label className={labelClass}>알림 채널</label>
                  <Dropdown
                    value={settings.roleGrantChannelId || ""}
                    onChange={(v) => setSettings({ ...settings, roleGrantChannelId: v })}
                    options={[
                      { value: "", label: "레벨업 알림 채널과 동일" },
                      ...guildChannels.filter((c) => c.type === "text").map((c) => ({ value: c.id, label: `# ${c.name}` })),
                    ]}
                  />
                  <p className={fieldNote}>레벨 보상 역할이 지급됐을 때 메시지를 보낼 채널</p>
                </div>
                <div>
                  <label className={labelClass}>알림 문구</label>
                  <textarea rows={2} value={settings.roleGrantMessage || ""} onChange={(e) => setSettings({ ...settings, roleGrantMessage: e.target.value })}
                    className={`${inputClass} resize-none`} />
                  <p className={fieldNote}>
                    <span className="text-[#3a3a3a]">{"{user}"}</span> 멘션 · <span className="text-[#3a3a3a]">{"{role}"}</span> 지급된 역할명 · <span className="text-[#3a3a3a]">{"{level}"}</span> 도달 레벨
                  </p>
                </div>
              </div>
            </section>

            <button type="submit" className={primaryBtn}>저장</button>
          </form>
          </Reveal>
        )}

        {/* ═══ 역할 설정 ═══ */}
        {tab === "roles" && (
          <>
            <Reveal>
              <section className="mb-16">
                <SectionHead no="01" title="음성 티어 역할 일괄 연결" />
                <div className="p-5 md:p-6 rounded-xl border border-black/10 bg-black/[0.02] mb-6">
                  <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep">
                    디스코드에서 만든 역할을 8개 티어에 연결합니다. 지급 레벨은 자동으로 채워지고,
                    <b className="text-[#131313]"> 배타 모드</b>로 저장되어 승급하면 아래 티어 역할이 자동 회수됩니다.
                    역할에 <b className="text-[#131313]">&ldquo;따로 표시(hoist)&rdquo;</b>를 켜두면 멤버 목록 오른쪽이 티어별로 묶입니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(VOICE_TIERS as any[]).map((t) => (
                    <div key={t.key} className="flex items-center gap-3 py-2">
                      <span aria-hidden className="shrink-0 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: t.c }}></span>
                      <span className="shrink-0 w-24 text-sm font-bold" style={{ color: t.c }}>{t.name}</span>
                      <span className="shrink-0 w-16 text-[11px] font-black text-[#8a8a8a] tabular-nums">Lv.{t.min}+</span>
                      <select
                        value={tierMap[t.key] || ""}
                        onChange={(e) => setTierMap({ ...tierMap, [t.key]: e.target.value })}
                        className="flex-1 min-w-0 bg-transparent border border-black/10 rounded-lg px-3 py-2.5 text-xs text-[#131313] outline-none focus:border-[#e91e3f] transition-colors"
                      >
                        <option value="" className="bg-[#ffffff]">— 역할 선택 —</option>
                        {guildRoles.map((r: any) => (
                          <option key={r.id} value={r.id} className="bg-[#ffffff]">{r.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 mt-7">
                  <button onClick={saveTierRoles} disabled={tierSaving} className={primaryBtn}>
                    {tierSaving ? "연결 중…" : "티어 역할 연결"}
                  </button>
                  <button
                    onClick={() => setTierMap({})}
                    className="px-6 py-3.5 border border-black/10 text-[#5a5a5a] hover:text-[#131313] hover:border-black/30 text-sm font-bold rounded-lg transition-all outline-none focus:outline-none"
                  >
                    선택 초기화
                  </button>
                </div>
              </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title="역할 추가 / 수정" />
              <form onSubmit={saveRole}>
                <div className={`mb-4 relative ${isRoleDropdownOpen ? "z-50" : ""}`}>
                  <label className={labelClass}>디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
                  <button type="button" onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                    {selectedRole ? (
                      <span className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                        <span className="font-bold">{selectedRole.name}</span>
                      </span>
                    ) : <span className="text-[#5a5a5a]">역할을 선택하세요</span>}
                    <span className="text-[10px] text-[#8a8a8a]">▼</span>
                  </button>
                  {isRoleDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsRoleDropdownOpen(false)}></div>
                      <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                        {guildRoles.map((r) => (
                          <button key={r.id} type="button" onClick={() => { setRoleForm({ ...roleForm, roleId: r.id }); setIsRoleDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${roleForm.roleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>지급 레벨 (선택)</label>
                    <input type="number" min={1} max={1000} placeholder="예: 100" value={roleForm.rewardLevel} onChange={(e) => setRoleForm({ ...roleForm, rewardLevel: e.target.value })} className={inputClass} />
                    <p className={fieldNote}>비우면 Boost 효과만 적용</p>
                  </div>
                  <div>
                    <label className={labelClass}>채팅/음성 Boost XP</label>
                    <input type="number" min={0} placeholder="예: 300" value={roleForm.buffXp} onChange={(e) => setRoleForm({ ...roleForm, buffXp: e.target.value })} className={inputClass} />
                    <p className={fieldNote}>보유자의 XP 지급마다 추가</p>
                  </div>
                  <div>
                    <label className={labelClass}>출석 Boost XP</label>
                    <input type="number" min={0} placeholder="예: 7000" value={roleForm.attendBuffXp} onChange={(e) => setRoleForm({ ...roleForm, attendBuffXp: e.target.value })} className={inputClass} />
                    <p className={fieldNote}>출석체크 시 추가 지급</p>
                  </div>
                </div>
                <button type="submit" className={primaryBtn}>저장</button>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`설정된 역할 (${configs.length})`} />
              {isLoading ? <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
                : configs.length === 0 ? <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">설정된 역할이 없습니다.</div>
                : (
                <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                  {configs.map((c) => {
                    const role = guildRoles.find((r) => r.id === c.roleId);
                    return (
                      <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-48 shrink-0 min-w-0">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }}></span>
                          <span className="text-sm font-bold text-[#131313] truncate">{c.roleName || role?.name || c.roleId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          {c.rewardLevel != null && <span className="text-[11px] font-bold text-[#e91e3f]">Lv.{c.rewardLevel} 도달 시 지급</span>}
                          {c.buffXp > 0 && <span className="text-[11px] font-bold text-[#5a5a5a]">채팅/음성 +{c.buffXp.toLocaleString()}</span>}
                          {c.attendBuffXp > 0 && <span className="text-[11px] font-bold text-[#5a5a5a]">출석 +{c.attendBuffXp.toLocaleString()}</span>}
                          {c.rewardLevel == null && !c.buffXp && !c.attendBuffXp && <span className="text-[11px] text-[#5a5a5a]">효과 없음</span>}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setRoleForm({ roleId: c.roleId, rewardLevel: c.rewardLevel == null ? "" : String(c.rewardLevel), buffXp: c.buffXp ? String(c.buffXp) : "", attendBuffXp: c.attendBuffXp ? String(c.attendBuffXp) : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "role", id: c._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 채널 / 카테고리 ═══ */}
        {tab === "channels" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title="채널 정책 추가 / 수정" />
              <form onSubmit={saveChannel}>
                <div className={`mb-4 relative ${isChannelDropdownOpen ? "z-50" : ""}`}>
                  <label className={labelClass}>디스코드 채널 · 카테고리 <span className="text-[#e91e3f]">*</span></label>
                  <button type="button" onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                    {selectedChannel ? (
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[#8a8a8a] shrink-0">{CHANNEL_TYPE_ICON[selectedChannel.type]}</span>
                        <span className="font-bold truncate">{selectedChannel.name}</span>
                        <span className="text-[10px] text-[#5a5a5a] shrink-0">{CHANNEL_TYPE_LABEL[selectedChannel.type]}</span>
                      </span>
                    ) : <span className="text-[#5a5a5a]">채널 또는 카테고리를 선택하세요</span>}
                    <span className="text-[10px] text-[#8a8a8a]">▼</span>
                  </button>
                  {isChannelDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                      <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                        {guildChannels.map((c) => (
                          <button key={c.id} type="button" onClick={() => { setChForm({ ...chForm, channelId: c.id }); setIsChannelDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${c.type === "category" ? "bg-black/[0.03]" : ""} ${chForm.channelId === c.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : c.type === "category" ? "text-[#5a5a5a] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                            <span className={`shrink-0 text-xs ${c.parentId ? "ml-4" : ""}`}>{CHANNEL_TYPE_ICON[c.type]}</span>
                            <span className="truncate">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className={fieldNote}>카테고리를 선택하면 하위 채널 전체에 적용됩니다</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Boost XP</label>
                    <input type="number" min={0} placeholder="예: 500" value={chForm.boostXp} onChange={(e) => setChForm({ ...chForm, boostXp: e.target.value })} disabled={chForm.excluded} className={`${inputClass} disabled:opacity-40`} />
                    <p className={fieldNote}>이 채널에서의 XP 지급마다 추가</p>
                  </div>
                  <div>
                    <label className={labelClass}>XP 지급 제외</label>
                    <button type="button" onClick={() => setChForm({ ...chForm, excluded: !chForm.excluded })} className={`${inputClass} flex items-center justify-between text-left ${chForm.excluded ? "border-[#e91e3f]/50" : ""}`}>
                      <span className={chForm.excluded ? "text-[#e91e3f] font-bold" : "text-[#5a5a5a]"}>{chForm.excluded ? "지급 안 함" : "지급함 (기본)"}</span>
                      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${chForm.excluded ? "bg-[#e91e3f]" : "bg-[#e6e3de]"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${chForm.excluded ? "left-[18px]" : "left-0.5"}`}></span>
                      </span>
                    </button>
                    <p className={fieldNote}>봇 명령어 채널 등에 사용</p>
                  </div>
                </div>
                <button type="submit" className={primaryBtn}>저장</button>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`설정된 채널 (${channelConfigs.length})`} />
              {isLoading ? <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
                : channelConfigs.length === 0 ? <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">설정된 채널이 없습니다.</div>
                : (
                <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                  {channelConfigs.map((c) => {
                    const live = guildChannels.find((g) => g.id === c.channelId);
                    return (
                      <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0">
                          <span className="text-[#8a8a8a] text-xs shrink-0">{CHANNEL_TYPE_ICON[c.channelType] || "#"}</span>
                          <span className="text-sm font-bold text-[#131313] truncate">{live?.name || c.channelName || c.channelId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          {c.excluded ? <span className="text-[11px] font-bold text-red-600">XP 지급 제외</span>
                            : c.boostXp > 0 ? <span className="text-[11px] font-bold text-[#e91e3f]">+{c.boostXp.toLocaleString()} XP</span>
                            : <span className="text-[11px] text-[#5a5a5a]">효과 없음</span>}
                          {c.channelType === "category" && <span className="text-[11px] font-bold text-[#8a8a8a]">하위 채널 전체</span>}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setChForm({ channelId: c.channelId, boostXp: c.boostXp ? String(c.boostXp) : "", excluded: !!c.excluded }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "channel", id: c._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 기간제 부스트 ═══ */}
        {tab === "boosts" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title="부스트 추가 / 수정" />
              <form onSubmit={saveBoost}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>부스트 이름</label>
                    <input type="text" placeholder="예: 주말 2배 이벤트" value={boostForm.name} onChange={(e) => setBoostForm({ ...boostForm, name: e.target.value })} className={inputClass} />
                  </div>
                  <div className={`relative ${isBoostRoleOpen ? "z-50" : ""}`}>
                    <label className={labelClass}>대상</label>
                    <button type="button" onClick={() => setIsBoostRoleOpen(!isBoostRoleOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                      {boostRole ? (
                        <span className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: boostRole.color }}></span>
                          <span className="font-bold">{boostRole.name}</span>
                        </span>
                      ) : <span className="text-[#4b4b4b] font-bold">서버 전체</span>}
                      <span className="text-[10px] text-[#8a8a8a]">▼</span>
                    </button>
                    {isBoostRoleOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsBoostRoleOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                          <button type="button" onClick={() => { setBoostForm({ ...boostForm, targetRoleId: "" }); setIsBoostRoleOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${!boostForm.targetRoleId ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "text-[#4b4b4b] hover:bg-black/5"}`}>서버 전체</button>
                          {guildRoles.map((r) => (
                            <button key={r.id} type="button" onClick={() => { setBoostForm({ ...boostForm, targetRoleId: r.id }); setIsBoostRoleOpen(false); }}
                              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${boostForm.targetRoleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className={fieldNote}>역할을 고르면 해당 역할 보유자에게만 적용</p>
                  </div>
                  <div className={`relative ${isBoostChannelOpen ? "z-50" : ""}`}>
                    <label className={labelClass}>대상 채널 · 카테고리</label>
                    <button type="button" onClick={() => setIsBoostChannelOpen(!isBoostChannelOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                      {boostChannel ? (
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[#5a5a5a] shrink-0">{CHANNEL_TYPE_ICON[boostChannel.type]}</span>
                          <span className="font-bold truncate">{boostChannel.name}</span>
                        </span>
                      ) : <span className="text-[#4b4b4b] font-bold">모든 채널</span>}
                      <span className="text-[10px] text-[#5a5a5a]">▼</span>
                    </button>
                    {isBoostChannelOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsBoostChannelOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                          <button type="button" onClick={() => { setBoostForm({ ...boostForm, targetChannelId: "" }); setIsBoostChannelOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${!boostForm.targetChannelId ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "text-[#4b4b4b] hover:bg-black/5"}`}>모든 채널</button>
                          {guildChannels.map((c) => (
                            <button key={c.id} type="button" onClick={() => { setBoostForm({ ...boostForm, targetChannelId: c.id }); setIsBoostChannelOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${c.type === "category" ? "bg-black/[0.03]" : ""} ${boostForm.targetChannelId === c.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : c.type === "category" ? "text-[#4b4b4b] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                              <span className={`shrink-0 text-xs ${c.parentId ? "ml-4" : ""}`}>{CHANNEL_TYPE_ICON[c.type]}</span>
                              <span className="truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className={fieldNote}>카테고리 선택 시 하위 채널 전체에 적용 · 역할과 함께 지정하면 둘 다 만족해야 발동</p>
                  </div>
                  <div>
                    <label className={labelClass}>추가 XP <span className="text-[#e91e3f]">*</span></label>
                    <input type="number" min={1} placeholder="예: 1000" value={boostForm.boostXp} onChange={(e) => setBoostForm({ ...boostForm, boostXp: e.target.value })} className={inputClass} />
                    <p className={fieldNote}>채팅·음성 지급 1회당 추가</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>시작 <span className="text-[#e91e3f]">*</span></label>
                      <input type="datetime-local" value={boostForm.startAt} onChange={(e) => setBoostForm({ ...boostForm, startAt: e.target.value })} className={`${inputClass}`} />
                    </div>
                    <div>
                      <label className={labelClass}>종료 <span className="text-[#e91e3f]">*</span></label>
                      <input type="datetime-local" value={boostForm.endAt} onChange={(e) => setBoostForm({ ...boostForm, endAt: e.target.value })} className={`${inputClass}`} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className={primaryBtn}>{boostForm.id ? "수정 저장" : "부스트 등록"}</button>
                  {boostForm.id && <button type="button" onClick={() => setBoostForm(emptyBoost)} className="px-6 py-3.5 text-sm font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">취소</button>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 부스트 (${boosts.length})`} />
              {isLoading ? <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
                : boosts.length === 0 ? <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">등록된 부스트가 없습니다.</div>
                : (
                <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                  {boosts.map((b) => {
                    const now = Date.now();
                    const start = new Date(b.startAt).getTime();
                    const end = new Date(b.endAt).getTime();
                    const state = now < start ? "예정" : now > end ? "종료" : "진행 중";
                    return (
                      <div key={b._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-52 shrink-0 min-w-0">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${state === "진행 중" ? "bg-[#e91e3f] text-white" : state === "예정" ? "bg-black/10 text-[#4b4b4b]" : "bg-transparent text-[#5a5a5a] border border-black/10"}`}>{state}</span>
                          <span className="text-sm font-bold text-[#131313] truncate">{b.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-[#e91e3f]">+{(b.boostXp || 0).toLocaleString()} XP</span>
                          <span className="text-[11px] font-bold text-[#5a5a5a]">{b.targetRoleName || "전체 유저"}</span>
                          <span className="text-[11px] font-bold text-[#5a5a5a]">{b.targetChannelName ? `${CHANNEL_TYPE_ICON[b.targetChannelType] || "#"} ${b.targetChannelName}` : "모든 채널"}</span>
                          <span className="text-[11px] text-[#8a8a8a]">{fmtDateTime(b.startAt)} ~ {fmtDateTime(b.endAt)}</span>
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setBoostForm({ id: b._id, name: b.name, targetRoleId: b.targetRoleId || "", targetChannelId: b.targetChannelId || "", boostXp: String(b.boostXp), startAt: toLocalInput(b.startAt), endAt: toLocalInput(b.endAt) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "boost", id: b._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 리더보드 ═══ */}
        {/* ═══ XP 수동 지급 ═══ */}
        {tab === "inventory" && (
          <>
            <Reveal>
              <section className="mb-16">
                <SectionHead no="01" title={invForm.id ? "인벤토리 역할 수정" : "인벤토리 역할 등록"} />
                <div className="p-5 md:p-6 rounded-xl border border-black/10 bg-black/[0.02] mb-6">
                  <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep">
                    디스코드 역할을 <b className="text-[#131313]">보유 아이템</b>으로 등록합니다. 등록한 역할을 가진 멤버는
                    자기 대시보드의 인벤토리에서 그 역할을 보게 됩니다.
                    상점 상품이나 레벨 보상으로 주는 역할은 이미 자동으로 잡히므로, 여기에는
                    <b className="text-[#131313]"> 디스코드에서만 주던 역할</b>(칭호·알림 구독·특전 권한 등)을 넣으면 됩니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="md:col-span-2">
                    <label className={labelClass}>디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
                    <select
                      value={invForm.roleId}
                      onChange={(e) => setInvForm({ ...invForm, roleId: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">— 역할 선택 —</option>
                      {guildRoles.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>인벤토리 표시 이름</label>
                    <input
                      value={invForm.label}
                      onChange={(e) => setInvForm({ ...invForm, label: e.target.value })}
                      placeholder="비우면 디스코드 역할 이름 그대로"
                      maxLength={40}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>분류</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { v: "perk", l: "특전" },
                        { v: "title", l: "칭호" },
                        { v: "notify", l: "알림" },
                        { v: "etc", l: "기타" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setInvForm({ ...invForm, category: o.v })}
                          className={`py-2.5 rounded-lg text-xs font-bold border transition-all outline-none focus:outline-none ${
                            invForm.category === o.v
                              ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                              : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30 hover:text-[#131313]"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>설명 (선택)</label>
                    <input
                      value={invForm.description}
                      onChange={(e) => setInvForm({ ...invForm, description: e.target.value })}
                      placeholder="예: 상품 소식 알림을 받습니다"
                      maxLength={120}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>표시 순서</label>
                    <input
                      type="number"
                      min={0}
                      value={invForm.sortOrder}
                      onChange={(e) => setInvForm({ ...invForm, sortOrder: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setInvForm({ ...invForm, visible: !invForm.visible })}
                      className={`w-full py-3.5 rounded-lg text-sm font-bold border transition-all outline-none focus:outline-none ${
                        invForm.visible
                          ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                          : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30"
                      }`}
                    >
                      {invForm.visible ? "표시함" : "숨김"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button onClick={saveInvRole} className={primaryBtn}>{invForm.id ? "수정 저장" : "등록"}</button>
                  {invForm.id && (
                    <button
                      onClick={() => setInvForm(emptyInv)}
                      className="px-6 py-3.5 border border-black/10 text-[#5a5a5a] hover:text-[#131313] hover:border-black/30 text-sm font-bold rounded-lg transition-all outline-none focus:outline-none"
                    >
                      취소
                    </button>
                  )}
                </div>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <SectionHead no="02" title={`등록된 인벤토리 역할 (${invRoles.length})`} />
                {invRoles.length === 0 ? (
                  <p className="py-14 text-center text-sm text-[#8a8a8a]">아직 등록된 역할이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                    {invRoles.map((r: any) => (
                      <div key={r._id} className="py-4 flex items-center gap-4">
                        <span className="shrink-0 w-8 text-center text-xs font-black text-[#a3a3a3] tabular-nums">{r.sortOrder}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-bold ${r.visible ? "text-[#131313]" : "text-[#a3a3a3] line-through"}`}>{r.label || r.roleName}</p>
                            <span className="text-[10px] font-black text-[#e91e3f] border border-[#e91e3f]/30 rounded-full px-2 py-0.5">
                              {INV_CATEGORY[r.category] || "기타"}
                            </span>
                            {!r.visible && <span className="text-[10px] font-black text-[#a3a3a3] border border-black/10 rounded-full px-2 py-0.5">숨김</span>}
                          </div>
                          <p className="text-[11px] text-[#8a8a8a] mt-1">
                            {r.roleName}
                            {r.description ? ` · ${r.description}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setInvForm({ id: r._id, roleId: r.roleId, label: r.label || "", category: r.category || "perk", description: r.description || "", sortOrder: r.sortOrder ?? 0, visible: r.visible !== false });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ kind: "inventory", id: r._id })}
                            className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </Reveal>
          </>
        )}

        {tab === "quests" && (
          <>
            <Reveal>
              <section className="mb-16">
                <SectionHead no="01" title={questForm.id ? "퀘스트 수정" : "퀘스트 추가"} />

                <div className="p-5 md:p-6 rounded-xl border border-black/10 bg-black/[0.02] mb-6">
                  <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep">
                    진행도는 <b className="text-[#131313]">봇이 기록한 오늘(KST)의 XP 지급 로그</b>로 자동 판정됩니다. 따라서 봇이 지급하는 활동(채팅·음성·출석)만 조건으로 쓸 수 있습니다.
                    보상은 유저가 <b className="text-[#131313]">직접 &lsquo;받기&rsquo;를 눌러야</b> 지급되며, 하루 한 번만 받을 수 있습니다. 매일 자정(KST)에 초기화됩니다.
                  </p>
                  <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep mt-2">
                    출석 퀘스트(음성 N분 접속)는 기본 제공되므로 여기에 만들 필요가 없습니다 — 기준 시간과 보상은 <b className="text-[#131313]">기본 정책</b> 탭에서 조정하세요.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="md:col-span-2">
                    <label className={labelClass}>퀘스트 이름</label>
                    <input
                      value={questForm.name}
                      onChange={(e) => setQuestForm({ ...questForm, name: e.target.value })}
                      placeholder="예: 오늘의 수다"
                      maxLength={40}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>설명 (선택)</label>
                    <input
                      value={questForm.desc}
                      onChange={(e) => setQuestForm({ ...questForm, desc: e.target.value })}
                      placeholder="예: 채팅으로 XP를 5번 받으세요"
                      maxLength={120}
                      className={inputClass}
                    />
                    <p className={fieldNote}>유저 화면에서 퀘스트 이름 아래 회색으로 표시됩니다.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>초기화 주기</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "daily", l: "일일", d: "매일 자정" },
                        { v: "weekly", l: "주간", d: "매주 월요일" },
                        { v: "monthly", l: "월간", d: "매월 1일" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setQuestForm({ ...questForm, period: o.v })}
                          className={`py-3 rounded-lg text-xs font-bold border transition-all outline-none focus:outline-none ${
                            questForm.period === o.v
                              ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                              : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30 hover:text-[#131313]"
                          }`}
                        >
                          {o.l}
                          <span className="block text-[10px] font-medium opacity-70 mt-0.5">{o.d}</span>
                        </button>
                      ))}
                    </div>
                    <p className={fieldNote}>진행도와 보상 수령이 이 주기마다 초기화됩니다 (KST 기준).</p>
                  </div>

                  <div>
                    <label className={labelClass}>측정 대상</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { v: "chat", l: "채팅" },
                        { v: "voice", l: "음성" },
                        { v: "attend", l: "출석" },
                        { v: "any", l: "전체" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setQuestForm({ ...questForm, reason: o.v })}
                          className={`py-2.5 rounded-lg text-xs font-bold border transition-all outline-none focus:outline-none ${
                            questForm.reason === o.v
                              ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                              : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30 hover:text-[#131313]"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <p className={fieldNote}>어떤 활동의 지급 로그를 셀지 고릅니다.</p>
                  </div>

                  <div>
                    <label className={labelClass}>측정 방식</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: "count", l: "지급 횟수" },
                        { v: "xp", l: "XP 합계" },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setQuestForm({ ...questForm, metric: o.v })}
                          className={`py-2.5 rounded-lg text-xs font-bold border transition-all outline-none focus:outline-none ${
                            questForm.metric === o.v
                              ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                              : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30 hover:text-[#131313]"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <p className={fieldNote}>
                      {questForm.metric === "xp" ? "오늘 받은 XP의 합계로 판정합니다." : "오늘 XP를 받은 횟수로 판정합니다. (음성은 1회 = 지급 주기)"}
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>목표치</label>
                    <input
                      type="number"
                      min={1}
                      value={questForm.target}
                      onChange={(e) => setQuestForm({ ...questForm, target: e.target.value })}
                      className={inputClass}
                    />
                    <p className={fieldNote}>{questForm.metric === "xp" ? "달성에 필요한 XP 합계" : "달성에 필요한 지급 횟수"}</p>
                  </div>

                  <div>
                    <label className={labelClass}>보상 XP</label>
                    <input
                      type="number"
                      min={0}
                      value={questForm.rewardXp}
                      onChange={(e) => setQuestForm({ ...questForm, rewardXp: e.target.value })}
                      className={inputClass}
                    />
                    <p className={fieldNote}>0으로 두면 보상 없는 &lsquo;목표&rsquo;로만 표시됩니다.</p>
                  </div>

                  <div>
                    <label className={labelClass}>표시 순서</label>
                    <input
                      type="number"
                      min={0}
                      value={questForm.order}
                      onChange={(e) => setQuestForm({ ...questForm, order: e.target.value })}
                      className={inputClass}
                    />
                    <p className={fieldNote}>작을수록 위에 표시됩니다.</p>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setQuestForm({ ...questForm, enabled: !questForm.enabled })}
                      className={`w-full py-3.5 rounded-lg text-sm font-bold border transition-all outline-none focus:outline-none ${
                        questForm.enabled
                          ? "bg-[#e91e3f] border-[#e91e3f] text-white"
                          : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30"
                      }`}
                    >
                      {questForm.enabled ? "활성화됨 — 유저에게 표시" : "비활성 — 숨김"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button onClick={saveQuest} className={primaryBtn}>{questForm.id ? "수정 저장" : "퀘스트 등록"}</button>
                  {questForm.id && (
                    <button
                      onClick={() => setQuestForm(emptyQuest)}
                      className="px-6 py-3.5 border border-black/10 text-[#5a5a5a] hover:text-[#131313] hover:border-black/30 text-sm font-bold rounded-lg transition-all outline-none focus:outline-none"
                    >
                      취소
                    </button>
                  )}
                </div>
              </section>
            </Reveal>

            <Reveal>
              <section>
                <SectionHead no="02" title={`등록된 퀘스트 (${quests.length})`} />
                {quests.length === 0 ? (
                  <p className="py-14 text-center text-sm text-[#8a8a8a]">아직 등록된 퀘스트가 없습니다. 위에서 추가해 주세요.</p>
                ) : (
                  <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                    {quests.map((q: any) => (
                      <div key={q._id} className="py-4 flex items-center gap-4">
                        <span className="shrink-0 w-8 text-center text-xs font-black text-[#a3a3a3] tabular-nums">{q.order}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-bold ${q.enabled ? "text-[#131313]" : "text-[#8a8a8a] line-through"}`}>{q.name}</p>
                            <span className="text-[10px] font-black text-[#e91e3f] border border-[#e91e3f]/30 rounded-full px-2 py-0.5">{PERIOD_LABEL[q.period || "daily"]}</span>
                            {!q.enabled && <span className="text-[10px] font-black text-[#8a8a8a] border border-black/10 rounded-full px-2 py-0.5">비활성</span>}
                          </div>
                          <p className="text-[11px] text-[#8a8a8a] mt-1 tabular-nums">
                            {(REASON_LABEL[q.reason] || "전체")} {q.metric === "xp" ? "XP" : "횟수"} {q.target.toLocaleString()} 달성
                            {q.desc ? ` · ${q.desc}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-black text-[#e91e3f] tabular-nums">
                          {q.rewardXp > 0 ? `+${q.rewardXp.toLocaleString()} XP` : <span className="text-[#a3a3a3]">보상 없음</span>}
                        </span>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setQuestForm({ id: q._id, name: q.name, desc: q.desc || "", period: q.period || "daily", reason: q.reason, metric: q.metric, target: q.target, rewardXp: q.rewardXp, enabled: q.enabled, order: q.order });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ kind: "quest", id: q._id })}
                            className="text-[11px] font-bold text-[#a3a3a3] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </Reveal>
          </>
        )}

        {tab === "grant" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title="XP 지급 · 회수" />
              <form onSubmit={submitGrant}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>대상 <span className="text-[#e91e3f]">*</span></label>
                    <input type="text" value={grantForm.target} onChange={(e) => setGrantForm({ ...grantForm, target: e.target.value })}
                      placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
                    <p className={fieldNote}>XP 기록이 있는 유저만 검색됩니다</p>
                  </div>
                  <div>
                    <label className={labelClass}>지급 XP <span className="text-[#e91e3f]">*</span></label>
                    <input type="number" value={grantForm.amount} onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                      placeholder="예: 50000 (회수는 -50000)" className={inputClass} />
                    <p className={fieldNote}>음수를 넣으면 회수됩니다 (보유량을 넘지 않게 잘립니다)</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className={labelClass}>사유</label>
                  <input type="text" value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                    placeholder="예: 이벤트 우승 보상" className={inputClass} />
                  <p className={fieldNote}>비우면 &lsquo;관리자 지급&rsquo;으로 기록됩니다</p>
                </div>

                {Number(grantForm.amount) !== 0 && grantForm.amount !== "" && (
                  <div className={`mb-6 px-4 py-3 rounded-lg border text-[12px] font-bold ${
                    Number(grantForm.amount) > 0 ? "border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[#e91e3f]" : "border-amber-500/30 bg-amber-500/[0.06] text-amber-700"
                  }`}>
                    {Number(grantForm.amount) > 0
                      ? `${Number(grantForm.amount).toLocaleString()} XP 지급 — 레벨이 올라갈 수 있습니다`
                      : `${Math.abs(Number(grantForm.amount)).toLocaleString()} XP 회수 — 레벨이 내려갈 수 있습니다`}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={isGranting} className={primaryBtn}>
                    {isGranting ? "처리 중..." : "지급"}
                  </button>
                  <button type="button" onClick={submitRemove} disabled={isGranting || !grantForm.amount}
                    className="px-6 py-3.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-amber-700 hover:bg-amber-500/[0.12] text-sm font-bold transition-colors disabled:opacity-40">
                    XP 제거
                  </button>
                  <button type="button" onClick={() => setConfirmAll(true)} disabled={isGranting || !grantForm.amount}
                    className="px-6 py-3.5 rounded-lg border border-black/15 text-[#4b4b4b] hover:text-[#131313] text-sm font-bold transition-colors disabled:opacity-40">
                    전체 유저에게 지급
                  </button>
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title="XP 초기화" />
              <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep mb-5">
                보유 XP와 레벨을 0으로 되돌립니다. 레벨 보상 역할은 봇이 30초 이내에 함께 회수합니다. (ARCTIC에서 구매한 역할은 회수하지 않습니다)
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={isGranting || !grantForm.target.trim()}
                  onClick={() => setConfirmReset(grantForm.target.trim())}
                  className="px-6 py-3.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-amber-700 hover:bg-amber-500/[0.12] text-sm font-bold transition-colors disabled:opacity-40">
                  위 대상 초기화
                </button>
                <button type="button" disabled={isGranting} onClick={() => setConfirmReset("all")}
                  className="px-6 py-3.5 rounded-lg border border-[#e91e3f]/25 bg-red-500/[0.06] text-red-600 hover:bg-red-500/[0.12] text-sm font-bold transition-colors disabled:opacity-40">
                  전체 유저 초기화
                </button>
              </div>
              <p className={fieldNote}>대상은 위 &lsquo;XP 지급 · 회수&rsquo;의 대상 칸을 그대로 사용합니다</p>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="03" title={`최근 수동 지급 (${grantLogs.length})`} />
              {grantLogs.length === 0 ? (
                <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">수동 지급 이력이 없습니다.</div>
              ) : (
                <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                  {grantLogs.map((g) => (
                    <div key={g._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 w-fit ${
                        g.status === "paid" ? "bg-emerald-500/15 text-emerald-700"
                        : g.status === "failed" ? "bg-red-500/15 text-red-600"
                        : "bg-[#e91e3f] text-white"}`}>
                        {g.status === "paid" ? "완료" : g.status === "failed" ? "실패" : "대기"}
                      </span>
                      <div className="min-w-0 md:w-44 shrink-0">
                        <div className="text-sm font-bold text-[#131313] truncate">{g.userName || g.userId}</div>
                        <div className="text-[10px] text-[#5a5a5a]">{fmtDateTime(g.createdAt)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                        <span className={`text-[13px] font-black tabular-nums ${g.amount >= 0 ? "text-[#e91e3f]" : "text-amber-700"}`}>
                          {g.amount >= 0 ? "+" : ""}{g.amount.toLocaleString()} XP
                        </span>
                        {g.reason && <span className="text-[11px] text-[#5a5a5a] truncate">{g.reason}</span>}
                        {g.error && <span className="text-[11px] font-bold text-red-600">{g.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-6 text-xs text-[#5a5a5a] leading-relaxed break-keep">
                💡 지급은 봇의 자동 지급 큐에 쌓여 30초 이내에 반영되며, 반영 시 레벨도 함께 다시 계산됩니다.
                봇이 꺼져 있으면 &lsquo;대기&rsquo; 상태로 남아 있다가 켜질 때 처리됩니다.
              </p>
            </section>
            </Reveal>
          </>
        )}

        {tab === "leaderboard" && (
          <Reveal>
          <section>
            <SectionHead no="01" title="랭킹" right={
              <div className="flex gap-2">
                {[{ v: "all", l: "누적" }, { v: "month", l: "이번 달" }].map((o) => (
                  <button key={o.v} onClick={() => setLbPeriod(o.v as any)}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${lbPeriod === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/30" : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            } />
            {lbPeriod === "month" && (
              <p className="text-[11px] text-[#5a5a5a] mb-4">월간 랭킹은 봇의 지급 로그를 기준으로 집계됩니다. 로그가 쌓이기 시작한 시점 이후 활동만 반영됩니다.</p>
            )}
            {leaderboard.length === 0 ? (
              <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">표시할 기록이 없습니다.</div>
            ) : (
              <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                {leaderboard.map((u) => (
                  <div key={u.userId} className="py-3 flex items-center gap-4">
                    <span className={`w-8 text-sm font-black shrink-0 ${u.rank <= 3 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>{u.rank}</span>
                    <span className="text-sm font-bold text-[#131313] flex-1 truncate">{u.name}</span>
                    <span className="text-[11px] font-bold text-[#8a8a8a] shrink-0">Lv.{u.level}</span>
                    <span className="text-sm font-black text-[#3a3a3a] shrink-0 tabular-nums">{u.xp.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          </Reveal>
        )}

        {/* ═══ XP 로그 ═══ */}
        {tab === "logs" && (
          <Reveal>
          <section>
            <SectionHead no="01" title={`지급 내역 (${logTotal.toLocaleString()})`} />
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <input type="text" placeholder="유저 이름 검색" value={logQuery}
                onChange={(e) => { setLogQuery(e.target.value); setLogPage(0); }} className={`${inputClass} md:max-w-xs`} />
              <div className="flex gap-2">
                {[{ v: "", l: "전체" }, { v: "chat", l: "채팅" }, { v: "voice", l: "음성" }, { v: "attend", l: "출석" }].map((o) => (
                  <button key={o.v} onClick={() => { setLogReason(o.v); setLogPage(0); }}
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold border transition-colors ${logReason === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">지급 내역이 없습니다. 봇이 XP를 지급하면 여기에 기록됩니다.</div>
            ) : (
              <>
                <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                  {logs.map((l) => (
                    <div key={l._id} className="py-3 flex items-center gap-3 md:gap-4">
                      <span className="text-[10px] text-[#5a5a5a] shrink-0 w-24 md:w-32 tabular-nums">{fmtDateTime(l.createdAt)}</span>
                      <span className="text-[10px] font-bold text-[#5a5a5a] shrink-0 w-8">{REASON_LABEL[l.reason] || "-"}</span>
                      <span className="text-sm font-bold text-[#131313] flex-1 truncate">{l.displayName || l.userId}</span>
                      {l.channelName && <span className="text-[10px] text-[#5a5a5a] shrink-0 hidden md:block truncate max-w-[140px]">#{l.channelName}</span>}
                      <span className="text-sm font-black text-[#e91e3f] shrink-0 tabular-nums">+{(l.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                    className="px-5 py-2.5 text-xs font-bold text-[#5a5a5a] border border-black/10 rounded-lg disabled:opacity-30 hover:text-[#131313] transition-colors">이전</button>
                  <span className="text-[11px] font-bold text-[#5a5a5a]">{logPage + 1} / {Math.max(1, Math.ceil(logTotal / 50))}</span>
                  <button disabled={(logPage + 1) * 50 >= logTotal} onClick={() => setLogPage((p) => p + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-[#5a5a5a] border border-black/10 rounded-lg disabled:opacity-30 hover:text-[#131313] transition-colors">다음</button>
                </div>
              </>
            )}
          </section>
          </Reveal>
        )}

        {/* 안내 각주 */}
        <Reveal>
        <div className="border-t border-black/[0.06] pt-5 text-xs text-[#8a8a8a] leading-relaxed">
          💡 <strong className="text-[#4b4b4b]">작동 방식:</strong> 봇이 1분마다 설정을 다시 읽습니다. 최종 지급량 = 기본 XP + 역할 Boost + 채널 Boost + 기간제 부스트 (음소거 시 설정된 배율 적용).<br/>
          ⚠️ 역할 자동 지급이 작동하려면 봇에게 <strong className="text-[#4b4b4b]">역할 관리 권한</strong>이 있고, 봇의 역할이 지급 대상 역할보다 <strong className="text-[#4b4b4b]">위에</strong> 있어야 합니다.
        </div>
        </Reveal>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-[#e91e3f]/25 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-[#131313] mb-3">삭제 확인</h2>
            <p className="text-sm text-[#5a5a5a] mb-8">
              {deleteConfirm.kind === "role" ? <>해당 역할 설정을 삭제하시겠습니까?<br/>이미 지급된 역할은 회수되지 않습니다.</>
                : deleteConfirm.kind === "channel" ? <>해당 채널 설정을 삭제하시겠습니까?<br/>삭제 후 기본 XP 정책으로 돌아갑니다.</>
                : <>해당 부스트를 삭제하시겠습니까?<br/>진행 중이라면 즉시 중단됩니다.</>}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-[#e6e3de] text-[#131313] rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 전체 유저 지급 — 되돌리기 어려우므로 한 번 더 확인 */}
      {confirmAll && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-[#e91e3f]/30 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-bold text-[#131313] mb-3">전체 유저에게 지급</h2>
            <p className="text-sm text-[#5a5a5a] leading-relaxed mb-2 break-keep">
              XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>에게{" "}
              <strong className={Number(grantForm.amount) >= 0 ? "text-[#e91e3f]" : "text-amber-700"}>
                {Number(grantForm.amount) >= 0 ? "+" : ""}{Number(grantForm.amount).toLocaleString()} XP
              </strong>
              를 반영합니다.
            </p>
            <p className="text-xs text-[#5a5a5a] mb-8 break-keep">되돌리려면 반대 부호로 다시 지급해야 합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAll(false)} className="flex-1 py-3 bg-[#e6e3de] text-[#131313] rounded-xl">취소</button>
              <button onClick={() => runGrant("all")} disabled={isGranting}
                className="flex-1 py-3 bg-[#e91e3f] disabled:opacity-40 text-white rounded-xl font-bold">
                {isGranting ? "처리 중..." : "전체 지급"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📌 초기화는 되돌릴 수 없어 한 번 더 확인한다 */}
      {confirmReset !== null && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-[#e91e3f]/25 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-bold text-[#131313] mb-3">
              {confirmReset === "all" ? "전체 유저 XP 초기화" : "XP 초기화"}
            </h2>
            <p className="text-sm text-[#5a5a5a] leading-relaxed mb-2 break-keep">
              {confirmReset === "all"
                ? <>XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>의 보유 XP와 레벨이 <strong className="text-red-600">0</strong>이 됩니다.</>
                : <><strong className="text-[#131313]">{confirmReset}</strong> 님의 보유 XP와 레벨이 <strong className="text-red-600">0</strong>이 됩니다.</>}
            </p>
            <p className="text-xs text-[#5a5a5a] mb-8 break-keep">되돌릴 수 없으며, 레벨 보상 역할도 함께 회수됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReset(null)} className="flex-1 py-3 bg-[#e6e3de] text-[#131313] rounded-xl">취소</button>
              <button onClick={() => runGrant(confirmReset, { mode: "reset" })} disabled={isGranting}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-xl font-bold">
                {isGranting ? "처리 중..." : "초기화"}
              </button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
            <h2 className="text-xl font-bold text-[#131313] mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-[#5a5a5a] mb-8">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#e6e3de] hover:bg-[#d6d3ce] text-[#131313] font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
