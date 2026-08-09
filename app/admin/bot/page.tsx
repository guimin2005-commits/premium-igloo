"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";
import Dropdown from "../../components/Dropdown";

const ADMIN_USERS = ["elahw.06"];

const CHANNEL_TYPE_LABEL: Record<string, string> = { text: "텍스트", voice: "음성", category: "카테고리" };
const CHANNEL_TYPE_ICON: Record<string, string> = { text: "#", voice: "🔊", category: "📁" };
const REASON_LABEL: Record<string, string> = { chat: "채팅", voice: "음성", attend: "출석" };

const TAB_META: Record<string, { title: string; desc: string }> = {
  settings: { title: "기본 정책", desc: "지급량·쿨타임·음소거·퇴장 처리 등 봇의 기본 XP 규칙을 설정합니다." },
  roles: { title: "역할 설정", desc: "레벨 보상 역할과 역할별 Boost 효과를 관리합니다." },
  channels: { title: "채널 · 카테고리", desc: "채널별 XP Boost와 지급 제외를 관리합니다." },
  boosts: { title: "기간제 부스트", desc: "대상·XP·기간을 지정한 한시적 부스트를 운영합니다." },
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "role" | "channel" | "boost"; id: string } | null>(null);
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

  // ── 데이터 로드 ─────────────────────────────
  const fetchCore = useCallback(() => {
    Promise.all([
      fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/channel-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-channels", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: null })),
      fetch("/api/xp-boost", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([cfg, roles, chCfg, channels, st, bst]) => {
      setConfigs(Array.isArray(cfg?.data) ? cfg.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setChannelConfigs(Array.isArray(chCfg?.data) ? chCfg.data : []);
      setGuildChannels(Array.isArray(channels?.data) ? channels.data : []);
      if (st?.data) setSettings(st.data);
      setBoosts(Array.isArray(bst?.data) ? bst.data : []);
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

  const [roleForm, setRoleForm] = useState({ roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "" });
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === roleForm.roleId);

  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.roleId) return notify("역할을 선택해주세요.", true);
    const res = await fetch("/api/role-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId: roleForm.roleId, roleName: selectedRole?.name || "",
        rewardLevel: roleForm.rewardLevel === "" ? null : Number(roleForm.rewardLevel),
        buffXp: Number(roleForm.buffXp) || 0, attendBuffXp: Number(roleForm.attendBuffXp) || 0,
      }),
    }).catch(() => null);
    if (res?.ok) { setRoleForm({ roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "" }); fetchCore(); saved(); }
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

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const api = { role: "/api/role-config", channel: "/api/channel-config", boost: "/api/xp-boost" }[deleteConfirm.kind];
    const res = await fetch(`${api}?id=${deleteConfirm.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) fetchCore();
    setDeleteConfirm(null);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-500";
  const fieldNote = "text-[10px] text-gray-400 mt-1.5";
  const labelClass = "block text-xs font-bold text-gray-500 mb-2";
  const primaryBtn = "w-full md:w-auto md:px-10 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all";

  const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg md:text-xl font-black text-white tracking-tight">{title}</h2>
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
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Admin · Level Dashboard</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">{meta.title.split(" ")[0]} </span>
              <span className="text-[#e91e3f]">{meta.title.split(" ").slice(1).join(" ") || "설정"}</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">{meta.desc}</p>
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
                  <p className={fieldNote}>/출석체크 1일 1회 지급량</p>
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
                        className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${settings.muteMode === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-400 border-white/10 hover:text-white"}`}>
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
                        className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${settings.muteTarget === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-400 border-white/10 hover:text-white"}`}>
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
                    <span className={settings.resetOnLeave ? "text-[#e91e3f] font-bold" : "text-gray-400"}>{settings.resetOnLeave ? "초기화함" : "유지함 (기본)"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.resetOnLeave ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${settings.resetOnLeave ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                  <p className={fieldNote}>⚠️ 켜면 나간 유저의 XP 기록이 삭제되어 복구할 수 없습니다</p>
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
                    <span className="text-gray-200">{"{user}"}</span> 멘션 · <span className="text-gray-200">{"{level}"}</span> 도달 레벨 · <span className="text-gray-200">{"{xp}"}</span> 누적 XP · 디스코드 마크다운(**굵게**) 사용 가능
                  </p>
                </div>
              </div>
            </section>

            <section>
              <SectionHead no="04" title="역할 지급 알림" right={
                <button type="button" onClick={() => setSettings({ ...settings, roleGrantEnabled: settings.roleGrantEnabled === false })}
                  className={`flex items-center gap-2.5 text-[11px] font-bold transition-colors ${settings.roleGrantEnabled !== false ? "text-[#e91e3f]" : "text-gray-400"}`}>
                  {settings.roleGrantEnabled !== false ? "사용 중" : "사용 안 함"}
                  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.roleGrantEnabled !== false ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${settings.roleGrantEnabled !== false ? "left-[18px]" : "left-0.5"}`}></span>
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
                    <span className="text-gray-200">{"{user}"}</span> 멘션 · <span className="text-gray-200">{"{role}"}</span> 지급된 역할명 · <span className="text-gray-200">{"{level}"}</span> 도달 레벨
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
            <section>
              <SectionHead no="01" title="역할 추가 / 수정" />
              <form onSubmit={saveRole}>
                <div className={`mb-4 relative ${isRoleDropdownOpen ? "z-50" : ""}`}>
                  <label className={labelClass}>디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
                  <button type="button" onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                    {selectedRole ? (
                      <span className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                        <span className="font-bold">{selectedRole.name}</span>
                      </span>
                    ) : <span className="text-gray-400">역할을 선택하세요</span>}
                    <span className="text-[10px] text-gray-500">▼</span>
                  </button>
                  {isRoleDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsRoleDropdownOpen(false)}></div>
                      <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                        {guildRoles.map((r) => (
                          <button key={r.id} type="button" onClick={() => { setRoleForm({ ...roleForm, roleId: r.id }); setIsRoleDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${roleForm.roleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-gray-300 hover:bg-white/5"}`}>
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
              {isLoading ? <div className="py-10 text-center text-gray-500 text-sm">불러오는 중...</div>
                : configs.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">설정된 역할이 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {configs.map((c) => {
                    const role = guildRoles.find((r) => r.id === c.roleId);
                    return (
                      <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-48 shrink-0 min-w-0">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }}></span>
                          <span className="text-sm font-bold text-white truncate">{c.roleName || role?.name || c.roleId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          {c.rewardLevel != null && <span className="text-[11px] font-bold text-[#e91e3f]">Lv.{c.rewardLevel} 도달 시 지급</span>}
                          {c.buffXp > 0 && <span className="text-[11px] font-bold text-gray-400">채팅/음성 +{c.buffXp.toLocaleString()}</span>}
                          {c.attendBuffXp > 0 && <span className="text-[11px] font-bold text-gray-400">출석 +{c.attendBuffXp.toLocaleString()}</span>}
                          {c.rewardLevel == null && !c.buffXp && !c.attendBuffXp && <span className="text-[11px] text-gray-400">효과 없음</span>}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setRoleForm({ roleId: c.roleId, rewardLevel: c.rewardLevel == null ? "" : String(c.rewardLevel), buffXp: c.buffXp ? String(c.buffXp) : "", attendBuffXp: c.attendBuffXp ? String(c.attendBuffXp) : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-500 hover:text-white transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "role", id: c._id })} className="text-xs font-bold text-red-500/60 hover:text-red-500 transition-colors">삭제</button>
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
                        <span className="text-gray-500 shrink-0">{CHANNEL_TYPE_ICON[selectedChannel.type]}</span>
                        <span className="font-bold truncate">{selectedChannel.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{CHANNEL_TYPE_LABEL[selectedChannel.type]}</span>
                      </span>
                    ) : <span className="text-gray-400">채널 또는 카테고리를 선택하세요</span>}
                    <span className="text-[10px] text-gray-500">▼</span>
                  </button>
                  {isChannelDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                      <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                        {guildChannels.map((c) => (
                          <button key={c.id} type="button" onClick={() => { setChForm({ ...chForm, channelId: c.id }); setIsChannelDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${c.type === "category" ? "bg-white/[0.03]" : ""} ${chForm.channelId === c.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : c.type === "category" ? "text-gray-400 font-bold" : "text-gray-300 hover:bg-white/5"}`}>
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
                      <span className={chForm.excluded ? "text-[#e91e3f] font-bold" : "text-gray-400"}>{chForm.excluded ? "지급 안 함" : "지급함 (기본)"}</span>
                      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${chForm.excluded ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${chForm.excluded ? "left-[18px]" : "left-0.5"}`}></span>
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
              {isLoading ? <div className="py-10 text-center text-gray-500 text-sm">불러오는 중...</div>
                : channelConfigs.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">설정된 채널이 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {channelConfigs.map((c) => {
                    const live = guildChannels.find((g) => g.id === c.channelId);
                    return (
                      <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0">
                          <span className="text-gray-500 text-xs shrink-0">{CHANNEL_TYPE_ICON[c.channelType] || "#"}</span>
                          <span className="text-sm font-bold text-white truncate">{live?.name || c.channelName || c.channelId}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          {c.excluded ? <span className="text-[11px] font-bold text-red-400">XP 지급 제외</span>
                            : c.boostXp > 0 ? <span className="text-[11px] font-bold text-[#e91e3f]">+{c.boostXp.toLocaleString()} XP</span>
                            : <span className="text-[11px] text-gray-400">효과 없음</span>}
                          {c.channelType === "category" && <span className="text-[11px] font-bold text-gray-500">하위 채널 전체</span>}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setChForm({ channelId: c.channelId, boostXp: c.boostXp ? String(c.boostXp) : "", excluded: !!c.excluded }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-500 hover:text-white transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "channel", id: c._id })} className="text-xs font-bold text-red-500/60 hover:text-red-500 transition-colors">삭제</button>
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
                      ) : <span className="text-gray-300 font-bold">서버 전체</span>}
                      <span className="text-[10px] text-gray-500">▼</span>
                    </button>
                    {isBoostRoleOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsBoostRoleOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                          <button type="button" onClick={() => { setBoostForm({ ...boostForm, targetRoleId: "" }); setIsBoostRoleOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${!boostForm.targetRoleId ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "text-gray-300 hover:bg-white/5"}`}>서버 전체</button>
                          {guildRoles.map((r) => (
                            <button key={r.id} type="button" onClick={() => { setBoostForm({ ...boostForm, targetRoleId: r.id }); setIsBoostRoleOpen(false); }}
                              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${boostForm.targetRoleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-gray-300 hover:bg-white/5"}`}>
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
                          <span className="text-gray-400 shrink-0">{CHANNEL_TYPE_ICON[boostChannel.type]}</span>
                          <span className="font-bold truncate">{boostChannel.name}</span>
                        </span>
                      ) : <span className="text-gray-300 font-bold">모든 채널</span>}
                      <span className="text-[10px] text-gray-400">▼</span>
                    </button>
                    {isBoostChannelOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsBoostChannelOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                          <button type="button" onClick={() => { setBoostForm({ ...boostForm, targetChannelId: "" }); setIsBoostChannelOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${!boostForm.targetChannelId ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "text-gray-300 hover:bg-white/5"}`}>모든 채널</button>
                          {guildChannels.map((c) => (
                            <button key={c.id} type="button" onClick={() => { setBoostForm({ ...boostForm, targetChannelId: c.id }); setIsBoostChannelOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${c.type === "category" ? "bg-white/[0.03]" : ""} ${boostForm.targetChannelId === c.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : c.type === "category" ? "text-gray-300 font-bold" : "text-gray-300 hover:bg-white/5"}`}>
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
                      <input type="datetime-local" value={boostForm.startAt} onChange={(e) => setBoostForm({ ...boostForm, startAt: e.target.value })} className={`${inputClass} [color-scheme:dark]`} />
                    </div>
                    <div>
                      <label className={labelClass}>종료 <span className="text-[#e91e3f]">*</span></label>
                      <input type="datetime-local" value={boostForm.endAt} onChange={(e) => setBoostForm({ ...boostForm, endAt: e.target.value })} className={`${inputClass} [color-scheme:dark]`} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className={primaryBtn}>{boostForm.id ? "수정 저장" : "부스트 등록"}</button>
                  {boostForm.id && <button type="button" onClick={() => setBoostForm(emptyBoost)} className="px-6 py-3.5 text-sm font-bold text-gray-400 hover:text-white transition-colors">취소</button>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 부스트 (${boosts.length})`} />
              {isLoading ? <div className="py-10 text-center text-gray-500 text-sm">불러오는 중...</div>
                : boosts.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">등록된 부스트가 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {boosts.map((b) => {
                    const now = Date.now();
                    const start = new Date(b.startAt).getTime();
                    const end = new Date(b.endAt).getTime();
                    const state = now < start ? "예정" : now > end ? "종료" : "진행 중";
                    return (
                      <div key={b._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-52 shrink-0 min-w-0">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${state === "진행 중" ? "bg-[#e91e3f] text-white" : state === "예정" ? "bg-white/10 text-gray-300" : "bg-transparent text-gray-400 border border-white/10"}`}>{state}</span>
                          <span className="text-sm font-bold text-white truncate">{b.name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-[#e91e3f]">+{(b.boostXp || 0).toLocaleString()} XP</span>
                          <span className="text-[11px] font-bold text-gray-400">{b.targetRoleName || "전체 유저"}</span>
                          <span className="text-[11px] font-bold text-gray-400">{b.targetChannelName ? `${CHANNEL_TYPE_ICON[b.targetChannelType] || "#"} ${b.targetChannelName}` : "모든 채널"}</span>
                          <span className="text-[11px] text-gray-500">{fmtDateTime(b.startAt)} ~ {fmtDateTime(b.endAt)}</span>
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setBoostForm({ id: b._id, name: b.name, targetRoleId: b.targetRoleId || "", targetChannelId: b.targetChannelId || "", boostXp: String(b.boostXp), startAt: toLocalInput(b.startAt), endAt: toLocalInput(b.endAt) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-500 hover:text-white transition-colors">수정</button>
                          <button onClick={() => setDeleteConfirm({ kind: "boost", id: b._id })} className="text-xs font-bold text-red-500/60 hover:text-red-500 transition-colors">삭제</button>
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
        {tab === "leaderboard" && (
          <Reveal>
          <section>
            <SectionHead no="01" title="랭킹" right={
              <div className="flex gap-2">
                {[{ v: "all", l: "누적" }, { v: "month", l: "이번 달" }].map((o) => (
                  <button key={o.v} onClick={() => setLbPeriod(o.v as any)}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${lbPeriod === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/30" : "text-gray-400 border-white/10 hover:text-white"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            } />
            {lbPeriod === "month" && (
              <p className="text-[11px] text-gray-400 mb-4">월간 랭킹은 봇의 지급 로그를 기준으로 집계됩니다. 로그가 쌓이기 시작한 시점 이후 활동만 반영됩니다.</p>
            )}
            {leaderboard.length === 0 ? (
              <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">표시할 기록이 없습니다.</div>
            ) : (
              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {leaderboard.map((u) => (
                  <div key={u.userId} className="py-3 flex items-center gap-4">
                    <span className={`w-8 text-sm font-black shrink-0 ${u.rank <= 3 ? "text-[#e91e3f]" : "text-gray-400"}`}>{u.rank}</span>
                    <span className="text-sm font-bold text-white flex-1 truncate">{u.name}</span>
                    <span className="text-[11px] font-bold text-gray-500 shrink-0">Lv.{u.level}</span>
                    <span className="text-sm font-black text-gray-200 shrink-0 tabular-nums">{u.xp.toLocaleString()}</span>
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
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold border transition-colors ${logReason === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-400 border-white/10 hover:text-white"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">지급 내역이 없습니다. 봇이 XP를 지급하면 여기에 기록됩니다.</div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {logs.map((l) => (
                    <div key={l._id} className="py-3 flex items-center gap-3 md:gap-4">
                      <span className="text-[10px] text-gray-400 shrink-0 w-24 md:w-32 tabular-nums">{fmtDateTime(l.createdAt)}</span>
                      <span className="text-[10px] font-bold text-gray-400 shrink-0 w-8">{REASON_LABEL[l.reason] || "-"}</span>
                      <span className="text-sm font-bold text-white flex-1 truncate">{l.displayName || l.userId}</span>
                      {l.channelName && <span className="text-[10px] text-gray-400 shrink-0 hidden md:block truncate max-w-[140px]">#{l.channelName}</span>}
                      <span className="text-sm font-black text-[#e91e3f] shrink-0 tabular-nums">+{(l.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                    className="px-5 py-2.5 text-xs font-bold text-gray-400 border border-white/10 rounded-lg disabled:opacity-30 hover:text-white transition-colors">이전</button>
                  <span className="text-[11px] font-bold text-gray-400">{logPage + 1} / {Math.max(1, Math.ceil(logTotal / 50))}</span>
                  <button disabled={(logPage + 1) * 50 >= logTotal} onClick={() => setLogPage((p) => p + 1)}
                    className="px-5 py-2.5 text-xs font-bold text-gray-400 border border-white/10 rounded-lg disabled:opacity-30 hover:text-white transition-colors">다음</button>
                </div>
              </>
            )}
          </section>
          </Reveal>
        )}

        {/* 안내 각주 */}
        <Reveal>
        <div className="border-t border-white/[0.06] pt-5 text-xs text-gray-500 leading-relaxed">
          💡 <strong className="text-gray-300">작동 방식:</strong> 봇이 1분마다 설정을 다시 읽습니다. 최종 지급량 = 기본 XP + 역할 Boost + 채널 Boost + 기간제 부스트 (음소거 시 설정된 배율 적용).<br/>
          ⚠️ 역할 자동 지급이 작동하려면 봇에게 <strong className="text-gray-300">역할 관리 권한</strong>이 있고, 봇의 역할이 지급 대상 역할보다 <strong className="text-gray-300">위에</strong> 있어야 합니다.
        </div>
        </Reveal>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">
              {deleteConfirm.kind === "role" ? <>해당 역할 설정을 삭제하시겠습니까?<br/>이미 지급된 역할은 회수되지 않습니다.</>
                : deleteConfirm.kind === "channel" ? <>해당 채널 설정을 삭제하시겠습니까?<br/>삭제 후 기본 XP 정책으로 돌아갑니다.</>
                : <>해당 부스트를 삭제하시겠습니까?<br/>진행 중이라면 즉시 중단됩니다.</>}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
