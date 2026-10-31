"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import {
  MESSAGE_GROUPS,
  MESSAGE_DEFS,
  MESSAGE_KEYS,
  renderTemplate,
  sampleVars,
  resolveColor,
  formatUntil,
  isCardKey,
  defaultTemplate,
  sanitizeTemplate,
  progressBar,
} from "@/lib/botMessages";
import { CARD_SIZE, CARD_TIERS, SKIN_CARD_KINDS, sampleCardData } from "@/lib/botCards";
import { SKINS, SCENES, FRAMES, SKIN_RANK_ALL, FRAME_ALL } from "@/lib/itemEffects";
import { NOTICE_KEY, NOTICE_BUTTON_LABEL } from "@/lib/noticeDiscord";
import { AdminPage, Panel, Btn, Switch, SaveBar, StatusChip, ConfirmDialog, useAdminGuard, useToast, inputClass } from "../ui";
import {
  type Embed,
  type Tpl,
  type Draft,
  type VarDef,
  type Rendered,
  type REmbed,
  type EmbedText,
  type CardView,
  COMMON,
  LIM,
  str,
  normTpl,
  toDEmbed,
  toDraft,
  fromDraft,
  embedSig,
  sigOf,
  changedParts,
  problemsOf,
  firstProblem,
  withText,
  M_OPEN,
  M_CLOSE,
  MENTION_VARS,
  DiscordPreview,
  GRANT_TICKET_EXTRAS,
  TextBox,
  Dot,
  Blk,
  count,
  useClock,
  useVarInsert,
  VarChips,
  EmbedPanel,
} from "./BotMessageEditor";

// 📌 봇 메시지 편집 — 레벨업 · 역할 지급 · DM · 명령어 응답의 임베드 디자인과 문구를 키마다 고친다.
//    왼쪽(모바일은 위) 키 목록 → 편집 → 디스코드처럼 그린 미리보기. 넓은 화면(xl)에서는 세 칸이 나란히.
//    · 초안은 키마다 따로 들고 있어 다른 키로 옮겨도 고치던 것이 남는다(목록에 빨간 점). 저장은 지금 키만.
//    · 미리보기는 lib/botMessages.js 의 renderTemplate(봇과 같은 규칙)에 예시 값(sampleVars)을 넣은 결과를 그린다.
//    · 📌 2026-10-17 보내는 곳(채널 · 만료 알림 시점)도 여기서 고른다 — 레벨 설정의 알림 채널 패널 5개를 옮겼다.
//      그 값은 BotSetting 의 칸이라 저장 줄의 저장이 PATCH /api/bot-settings(그 칸만)로 함께 보낸다. 켜고 끄기는 「보내기」 하나.
//    · 카드 키(CARD_KEYS)는 이미지 카드 켜기/끄기 — 켜지면 미리보기의 큰 이미지 자리에 카드(등급 칩으로 바꿔 보기).
//    API: /api/admin/bot-messages (GET 목록 · PUT 저장 · DELETE 기본값으로 · POST 테스트 발송) · /card?key=&tier= (카드 PNG)
//    편집 부품 · 미리보기는 ./BotMessageEditor.tsx — 글쓰기 › 디스코드 공지 팝업도 같은 부품을 쓴다

const API = "/api/admin/bot-messages";
const CARD_API = "/api/admin/bot-messages/card";
// 등급에 따라 그림이 바뀌는 카드 — 출석(강조색 하나) · RANKER(금은동)는 등급 칩이 없다
const TIER_CARD_KEYS = new Set(["levelUp", "roleGrant", "cmdLevel", "cmdRank"]);
const TIER_OPTIONS = (CARD_TIERS as { name: string }[]).map((t, i) => ({ v: String(i), l: t.name }));
const DEFAULT_CARD_TIER = 1; // 브론즈 — 예시 레벨(128)의 등급
// 📌 미리보기에 끼워 볼 꾸미기(2026-10-16 "디코 메시지 창에 스킨 껴서 확인 가능하게") — 카드 배경 · 카드 테두리 · 프로필 테두리. "" = 없음
const SCENE_OPTIONS = [{ v: "", l: "없음" }, ...SCENES.map((s: { v: string; l: string }) => ({ v: s.v, l: s.l }))];
const SKIN_OPTIONS = [{ v: "", l: "없음" }, ...SKINS.filter((s: { v: string }) => s.v !== SKIN_RANK_ALL).map((s: { v: string; l: string }) => ({ v: s.v, l: s.l }))];
const FRAME_OPTIONS = [{ v: "", l: "없음" }, ...FRAMES.filter((f: { v: string }) => f.v !== FRAME_ALL).map((f: { v: string; l: string }) => ({ v: f.v, l: f.l }))];
const DRESS_KEYS = new Set<string>(SKIN_CARD_KINDS as string[]);
// 📌 틀 밖에서 봇이 붙이는 것도 미리보기에(2026-10-29 운영자 "미리보기가 이건데" — 추첨권 뽑는 법이 안 보였다)
//    운영진 지급은 추첨권일 때 뽑는 법 그림 임베드 + 단추(봇 features/grantDm.js) — 예시 아이템이 추첨권이라 붙여 그린다
//    게임 그룹 지원 승인은 아래에 「괴담회 문화상품권 안내」 임베드(with — 그 틀이 켜져 있으면) + 단추(봇 features/goedamWatch.js noticeGroups)
const BOT_EXTRAS: Record<string, { images?: string[]; buttons?: string[]; with?: string }> = {
  itemGrantNotice: GRANT_TICKET_EXTRAS,
  goedamGroupApprove: { with: "goedamGiftNotice", buttons: ["번호 확인하러 가기"] },
  // 괴담회 음성 추첨권 · 홍보 DM — 봇이 「뽑기 하러 가기」 단추를 붙인다(features/goedamWatch.js · dmBlast.js — 2026-11-01 운영자 "바로가기 버튼도 필요" · 미리보기에 안 보였다)
  goedamVoiceTicket: { buttons: ["뽑기 하러 가기"] },
  goedamPromo: { buttons: ["뽑기 하러 가기"] },
};
const JSON_HEADERS = { "Content-Type": "application/json" };

type Item = { key: string; custom: boolean; template: Tpl; updatedAt: string | null; updatedBy: string };
type Def = { group: string; label: string; vars: VarDef[]; plainEmbed?: unknown };

const DEFS = MESSAGE_DEFS as unknown as Record<string, Def>;
const KEYS = MESSAGE_KEYS as string[];
const GROUPS = MESSAGE_GROUPS as { key: string; label: string }[];

// 보내는 곳 — 고를 수 있는 키(DEST_FIELD)는 BotSetting 칸, 나머지는 정해진 곳(글자만)
//    채널 칸의 "" 뜻은 봇과 같다: 레벨업 = 알림 끄기(봇 환경변수 채널이 있으면 그곳) · 역할 지급 · 자동 출석 = 레벨업 채널 · 공지 = 보내지 않음
type DestField = { field: string; kind: "channel"; empty: string } | { field: string; kind: "hours" };
const DEST_FIELD: Record<string, DestField> = {
  levelUp: { field: "levelupChannelId", kind: "channel", empty: "알림 끄기" },
  roleGrant: { field: "roleGrantChannelId", kind: "channel", empty: "레벨업 채널과 동일" },
  autoAttend: { field: "attendChannelId", kind: "channel", empty: "레벨업 채널과 동일" },
  noticePost: { field: "noticeChannelId", kind: "channel", empty: "보내지 않음" },
  expiryReminder: { field: "expiryReminderHours", kind: "hours" },
};
const DEST_FIELDS = Object.values(DEST_FIELD).map((f) => f.field);
const DEST: Record<string, string> = {
  // 고르는 칸이 있는 키 — 봇 설정을 못 읽었을 때만 이 글자로
  levelUp: "레벨업 채널",
  roleGrant: "역할 지급 채널",
  autoAttend: "출석 알림 채널",
  noticePost: "공지 채널",
  rankerAnnounce: "레벨업 채널",
  afkCheck: "그 음성 채널 채팅",
  cmdAttendAlready: "명령어를 쓴 채널 · 나만 보기",
  levelClosed: "명령어를 쓴 채널 · 나만 보기",
  passUnclaimed: "유저 DM",
  expiryReminder: "구매자 DM",
};
// 만료 알림 시점 — 1~168시간 전(app/api/bot-settings PATCH 와 같은 범위)
const HOURS_MIN = 1;
const HOURS_MAX = 168;
const hoursOk = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= HOURS_MIN && Number(v) <= HOURS_MAX;
// 공용 Dropdown(라이트)을 입력칸과 같은 높이로 — 보내는 곳 줄은 키마다 같은 높이(아래 단추 줄이 키를 바꿔도 움직이지 않게)
const DD = "!px-3 !py-1.5 min-h-10 !text-[13px] !border-[#a3a3a3]";
// 📌 DEFS[k] 로만 보면 ?key=constructor 같은 이름도 통과해 빈 화면이 된다 — 자기 키만
const isKey = (k: string | null): k is string => !!k && KEYS.includes(k);
const destOf = (key: string) => {
  if (DEST[key]) return DEST[key];
  const g = DEFS[key]?.group;
  return g === "dm" ? "구매자 DM" : g === "command" ? "명령어를 쓴 채널" : "채널";
};

const normItem = (x: any): Item => ({
  key: String(x?.key || ""),
  custom: !!x?.custom,
  template: normTpl(x?.template),
  updatedAt: x?.updatedAt ? String(x.updatedAt) : null,
  updatedBy: str(x?.updatedBy),
});

// 카드 켜기/끄기 짝 — 카드와 쓰는 짧은 기본 임베드 · 카드를 끈 예전 기본 임베드(lib/botMessages.js 의 plainEmbed)
const cardEmbedOf = (key: string): Embed | null => (isCardKey(key) ? normTpl(defaultTemplate(key)).embed : null);
const plainEmbedOf = (key: string): Embed | null => {
  const p = DEFS[key]?.plainEmbed;
  return isCardKey(key) && p ? normTpl(sanitizeTemplate({ embed: p }, key)).embed : null;
};


// cardTier 를 주면(카드 켜짐 · 등급 카드) 예시 레벨 · XP 를 카드 샘플(lib/botCards.js sampleCardData)과 같게 — 글과 카드 숫자가 어긋나지 않게
function previewVars(key: string, cardTier: number | null = null) {
  const v = { ...(sampleVars(key) as Record<string, unknown>) };
  if (cardTier != null && TIER_CARD_KEYS.has(key)) {
    const d = sampleCardData(key, cardTier, null) as { level: number; prevLevel?: number; xp: number; need: number; progress: number; rank?: number; total?: number; role?: string };
    v.level = d.level;
    // 역할 지급 — 그 등급 역할 · 시작 레벨(카드 샘플과 같다). 다른 등급 카드만 XP · 등급 이름
    if (key === "roleGrant") v.role = d.role;
    else {
      v.xp = d.xp;
      v.tier = (CARD_TIERS as { name: string }[])[cardTier]?.name;
    }
    if (key === "levelUp") Object.assign(v, { prevLevel: d.prevLevel, nextXp: d.need, progressBar: progressBar(d.progress) });
    if (key === "cmdLevel") Object.assign(v, { need: d.need, nextLevel: d.level + 1, progressBar: progressBar(d.progress) });
    if (key === "cmdRank") Object.assign(v, { rank: d.rank, total: d.total });
  }
  for (const n of MENTION_VARS) if (typeof v[n] === "string") v[n] = `${M_OPEN}${String(v[n]).replace(/^@/, "")}${M_CLOSE}`;
  return v;
}

export default function AdminBotMessagesPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/bot-messages 가 서버에서 한다
  const { isAdmin, gate } = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // 📌 주소의 ?key= 로 연 키 — 새로고침해도 보던 메시지에 머문다. 기능 검색이 같은 화면에서 다른 키로 보내도(router.push) 따라간다
  const searchParams = useSearchParams();
  const keyParam = searchParams.get("key");
  const [sel, setSel] = useState<string>(() => (isKey(keyParam) ? keyParam : KEYS[0]));
  const [seenKey, setSeenKey] = useState(keyParam);
  if (keyParam !== seenKey) {
    setSeenKey(keyParam);
    if (isKey(keyParam) && keyParam !== sel) setSel(keyParam);
  }
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  // 미리보기의 "오늘 오후 9:41"
  const clock = useClock();
  // 결과 알림 — 관리 화면 공용 토스트(성공 · 실패 효과음 포함)
  const { toast, toastEl } = useToast();
  // 보내는 곳 — 저장된 값(dest · BotSetting 에서 읽은 글자) · 고친 값(destDraft · 칸 이름 → 글자) · 고를 채널(텍스트 채널)
  const [dest, setDest] = useState<Record<string, string> | null>(null);
  const [destDraft, setDestDraft] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  // 카드 미리보기 등급 — 키를 옮겨도 그대로 (레벨업 · /레벨 · /랭크 공통)
  const [cardTier, setCardTier] = useState(DEFAULT_CARD_TIER);
  const [dress, setDress] = useState({ scene: "", skin: "", frame: "" }); // 미리보기에 끼운 꾸미기

  const alive = useRef(true);
  const editorRef = useRef<HTMLDivElement | null>(null);
  // 마지막으로 누른 글 칸과 커서 자리 — 변수 칩이 여기에 넣는다
  const { onCaret, resetCaret, insertVar: insertVarAt } = useVarInsert(editorRef);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (!alive.current) return;
    const list: Item[] = d?.success && Array.isArray(d.data) ? d.data.map(normItem).filter((x: Item) => isKey(x.key)) : [];
    if (!list.length) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    const map: Record<string, Item> = {};
    const dm: Record<string, Draft> = {};
    for (const it of list) {
      map[it.key] = it;
      dm[it.key] = toDraft(it.template);
    }
    setItems(map);
    setDrafts(dm);
    setLoadFailed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // 보내는 곳 — 봇 설정의 채널 · 만료 시점 칸과 디스코드 텍스트 채널 목록. 못 읽으면 글자만 보인다(고를 수 없다)
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/bot-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive.current || !d?.success || !d.data) return;
        setDest(Object.fromEntries(DEST_FIELDS.map((f) => [f, d.data[f] == null ? "" : String(d.data[f])])));
      })
      .catch(() => {});
    fetch("/api/discord-channels", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive.current) return;
        const list: { id: string; name: string; type: string }[] = Array.isArray(d?.data) ? d.data : [];
        setChannels(list.filter((c) => c.type === "text").map((c) => ({ id: String(c.id), name: String(c.name || "") })));
      })
      .catch(() => {});
  }, [isAdmin]);
  const item = items[sel] || null;
  const draft = drafts[sel] || null;
  const def = DEFS[sel];

  // 보내는 곳이 바뀐 키 — 그 키의 칸(DEST_FIELD)에 저장값과 다른 고친 값이 있으면
  const destDirtyOf = useCallback((k: string) => {
    const f = DEST_FIELD[k];
    if (!f || !dest || !(f.field in destDraft)) return false;
    return destDraft[f.field].trim() !== (dest[f.field] || "").trim();
  }, [dest, destDraft]);
  const dirtyKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of KEYS) {
      if ((items[k] && drafts[k] && sigOf(fromDraft(drafts[k])) !== sigOf(items[k].template)) || destDirtyOf(k)) s.add(k);
    }
    return s;
  }, [items, drafts, destDirtyOf]);
  const destDirty = destDirtyOf(sel);
  const tplDirty = !!items[sel] && !!drafts[sel] && sigOf(fromDraft(drafts[sel])) !== sigOf(items[sel].template);
  const dirty = tplDirty || destDirty;
  const chg = useMemo(() => new Set(item && draft && tplDirty ? changedParts(item.template, fromDraft(draft)) : []), [item, draft, tplDirty]);
  const problems = useMemo<Partial<Record<EmbedText, string>>>(() => (draft ? problemsOf(draft, sel) : {}), [draft, sel]);

  // 저장 안 한 초안이 있으면 창을 닫기 전에 묻는다
  useEffect(() => {
    if (dirtyKeys.size === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyKeys]);

  const cardKey = isCardKey(sel);
  const cardOn = !!draft && cardKey && draft.card;
  const tierCard = cardOn && TIER_CARD_KEYS.has(sel);
  const pv = useMemo(() => previewVars(sel, tierCard ? cardTier : null), [sel, tierCard, cardTier]);
  const rendered = useMemo(
    () => (draft ? (renderTemplate(fromDraft(draft), pv) as unknown as Rendered) : null),
    [draft, pv]
  );
  // 봇이 아래에 붙이는 다른 틀(저장본 · 꺼져 있으면 안 붙는다). 두 임베드 글자 합이 6,000 을 넘으면 봇이 빼고 보내므로 미리보기도 뺀다
  const withKey = BOT_EXTRAS[sel]?.with || "";
  const withTpl = withKey ? items[withKey]?.template : undefined;
  const extraEmbeds = useMemo(() => {
    if (!withKey || !withTpl?.enabled) return undefined;
    const e = (renderTemplate(withTpl, sampleVars(withKey)) as unknown as Rendered).embed;
    if (!e) return undefined;
    const chars = (x: REmbed | null | undefined) =>
      x ? x.title.length + x.description.length + x.authorName.length + x.footerText.length + x.fields.reduce((a, f) => a + f.name.length + f.value.length, 0) : 0;
    return chars(rendered?.embed) + chars(e) > LIM.total ? undefined : [e];
  }, [withKey, withTpl, rendered]);
  const cardView = useMemo<CardView | null>(() => {
    if (!cardOn) return null;
    const size = (CARD_SIZE as Record<string, { width: number; height: number }>)[sel];
    const q = new URLSearchParams({ key: sel });
    if (tierCard) q.set("tier", String(cardTier));
    if (DRESS_KEYS.has(sel)) { if (dress.scene) q.set("scene", dress.scene); if (dress.skin) q.set("skin", dress.skin); }
    if (dress.frame) q.set("frame", dress.frame);
    return { src: `${CARD_API}?${q}`, ratio: size ? size.width / size.height : 1200 / 630 };
  }, [cardOn, tierCard, sel, cardTier, dress]);
  // 📌 디스코드는 임베드 하나의 글자 합 6,000 을 넘으면 거절한다 — 봇은 뒤 필드부터 빼서 보낸다
  const overTotal = useMemo(() => {
    if (!draft || !draft.embed.on) return false;
    const e = draft.embed;
    const n = e.title.length + e.description.length + e.authorName.length + e.footerText.length + e.fields.reduce((a, f) => a + f.name.length + f.value.length, 0);
    return n > LIM.total;
  }, [draft]);

  // ── 초안 고치기 ──
  const patch = useCallback((fn: (d: Draft) => Draft) => {
    setDrafts((p) => (p[sel] ? { ...p, [sel]: fn(p[sel]) } : p));
  }, [sel]);
  const setTop = (k: "enabled" | "content", v: boolean | string) => patch((d) => ({ ...d, [k]: v }));
  const setText = (path: string, v: string) => patch((d) => withText(d, path, v));
  // 카드 켜기/끄기 — 임베드가 기본 모양 그대로면 짝 모양으로 바꾼다(끄면 예전 임베드, 켜면 카드와 겹치지 않는 짧은 임베드). 고친 임베드는 그대로
  const setCard = (on: boolean) =>
    patch((d) => {
      const from = on ? plainEmbedOf(sel) : cardEmbedOf(sel);
      const to = on ? cardEmbedOf(sel) : plainEmbedOf(sel);
      const swap = !!from && !!to && embedSig(d.embed) === embedSig(from);
      return { ...d, card: on, embed: swap && to ? toDEmbed(to) : d.embed };
    });

  // 변수 칩 — 마지막으로 누른 칸의 커서 자리에 {이름} (BotMessageEditor useVarInsert)
  const insertVar = (name: string) => insertVarAt(draft, name, setText, (m) => toast(m, true));

  const pick = (k: string) => {
    if (k === sel) return;
    setSel(k);
    resetCaret();
    try {
      window.history.replaceState(null, "", `?key=${encodeURIComponent(k)}`);
    } catch {}
    // 모바일은 목록이 위에 있어 고른 뒤 편집 칸으로 내려 준다
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // ── 저장 ──
  const save = async () => {
    // 📌 바뀐 게 없으면 보내지 않는다 — Ctrl+S 로 기본 디자인 키를 저장하면 '저장한 디자인'이 되어 옛 문구 반영이 끊긴다
    if (!draft || !item || saving || !dirty) return;
    const key = sel;
    if (tplDirty) {
      const p = firstProblem(problemsOf(draft, key));
      if (p) return toast(p, true);
    }
    // 보내는 곳 — 그 칸만 PATCH(app/api/bot-settings — 다른 봇 설정은 건드리지 않는다)
    const df = destDirty ? DEST_FIELD[key] : null;
    const dv = df ? (destDraft[df.field] || "").trim() : "";
    if (df && df.kind === "hours" && !hoursOk(dv)) return toast(`만료 알림 시점은 ${HOURS_MIN}~${HOURS_MAX}시간 사이로 입력해 주세요.`, true);
    setSaving(true);
    if (df) {
      const res = await fetch("/api/bot-settings", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ [df.field]: df.kind === "hours" ? Number(dv) : dv }),
      }).catch(() => null);
      const d = await res?.json().catch(() => null);
      if (!alive.current) return;
      if (!res?.ok || !d?.success) {
        setSaving(false);
        return toast(d?.message || "보내는 곳을 저장하지 못했습니다.", true);
      }
      const savedVal = d.data?.[df.field] == null ? dv : String(d.data[df.field]);
      setDest((m) => ({ ...(m || {}), [df.field]: savedVal }));
      // 저장하는 사이 더 고쳤으면 그 값은 그대로 둔다
      setDestDraft((m) => {
        if ((m[df.field] || "").trim() !== dv) return m;
        const next = { ...m };
        delete next[df.field];
        return next;
      });
      if (!tplDirty) {
        setSaving(false);
        toast("저장했습니다.");
        return;
      }
    }
    const tpl = fromDraft(draft);
    const sent = sigOf(tpl);
    const res = await fetch(API, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ key, template: tpl, baseUpdatedAt: item.updatedAt }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setSaving(false);
    if (res?.ok && d?.success && d.data) {
      const saved = normItem(d.data);
      setItems((m) => ({ ...m, [key]: saved }));
      // 저장하는 사이 더 고쳤으면 그 초안은 그대로 둔다
      setDrafts((m) => (m[key] && sigOf(fromDraft(m[key])) === sent ? { ...m, [key]: toDraft(saved.template, m[key]) } : m));
      toast("저장했습니다.");
      return;
    }
    // 409 — 다른 관리자가 먼저 바꿨다. 기준만 최신으로 바꾸고 초안은 둔다(한 번 더 저장하면 덮어쓴다)
    if (res?.status === 409 && d?.data) setItems((m) => ({ ...m, [key]: normItem(d.data) }));
    toast(d?.message || "저장하지 못했습니다.", true);
  };
  // Ctrl/⌘ + S — 저장 줄의 저장과 같다
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 되돌리기 — 불러온(저장된) 값으로(보내는 곳도)
  const revert = () => {
    if (!item) return;
    resetCaret();
    setDrafts((m) => ({ ...m, [sel]: toDraft(item.template) }));
    const f = DEST_FIELD[sel];
    if (f) setDestDraft((m) => {
      if (!(f.field in m)) return m;
      const next = { ...m };
      delete next[f.field];
      return next;
    });
  };

  // ── 기본값으로 ── 저장한 디자인이 있으면 지운다(확인 모달), 없으면 초안만 되돌린다
  const askReset = () => {
    if (!item) return;
    if (!item.custom) {
      resetCaret();
      setDrafts((m) => ({ ...m, [sel]: toDraft(item.template) }));
      toast("기본값으로 되돌렸습니다.");
      return;
    }
    setConfirmReset(true);
  };
  const doReset = async () => {
    const key = sel;
    setResetting(true);
    const res = await fetch(`${API}?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    setResetting(false);
    setConfirmReset(false);
    if (res?.ok && d?.success && d.data) {
      const it = normItem(d.data);
      resetCaret();
      setItems((m) => ({ ...m, [key]: it }));
      setDrafts((m) => ({ ...m, [key]: toDraft(it.template) }));
      toast("기본값으로 되돌렸습니다.");
    } else {
      toast(d?.message || "되돌리지 못했습니다.", true);
    }
  };

  // ── 테스트 발송 ── 저장 안 한 초안이면 초안 그대로 보낸다. 봇이 10초마다 대기열을 보므로 결과를 2초마다 확인
  const sendTest = async () => {
    if (!draft || !item || testing) return;
    const key = sel;
    if (tplDirty) {
      const p = firstProblem(problemsOf(draft, key));
      if (p) return toast(p, true);
    }
    setTesting(true);
    const res = await fetch(API, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(tplDirty ? { action: "test", key, template: fromDraft(draft) } : { action: "test", key }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (!alive.current) return;
    const id = d?.data?.id;
    if (!res?.ok || !d?.success || !id) {
      setTesting(false);
      return toast(d?.message || "테스트 요청에 실패했습니다.", true);
    }
    toast("내 DM 으로 보내는 중입니다.");
    const started = Date.now();
    while (alive.current && Date.now() - started < 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(`${API}?test=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (!alive.current) return;
      const st = s?.data?.status;
      if (st === "sent") {
        setTesting(false);
        return toast("DM 으로 보냈습니다.");
      }
      if (st === "failed") {
        setTesting(false);
        return toast(s?.data?.error || "보내지 못했습니다.", true);
      }
    }
    if (!alive.current) return;
    setTesting(false);
    toast("봇이 아직 보내지 않았습니다. 봇이 켜지면 보냅니다.", true);
  };

  if (gate) return gate;

  const vars = [...(def?.vars || []), ...COMMON];
  const keyVarCount = def?.vars?.length || 0;
  const tierColor = resolveColor("tier", pv) as string;
  const meta = item
    ? item.custom
      ? `저장 ${formatUntil(item.updatedAt)}${item.updatedBy ? ` · ${item.updatedBy}` : ""}`
      : "기본 디자인"
    : "";
  const destText = destOf(sel);
  const destField = DEST_FIELD[sel];
  const e = draft?.embed;
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name || "";
  // 채널 고르기 목록 — 저장된 채널이 목록에 없으면(지운 채널) 그 ID 로 한 줄 남긴다(조용히 사라지면 무엇이 빠졌는지 모른다)
  const channelOptions = (cur: string, empty: string) => [
    { value: "", label: empty },
    ...channels.map((c) => ({ value: c.id, label: `# ${c.name}` })),
    ...(cur && !channels.some((c) => c.id === cur) ? [{ value: cur, label: `삭제된 채널 (${cur})` }] : []),
  ];
  const destValue = destField && dest ? (destField.field in destDraft ? destDraft[destField.field] : dest[destField.field] || "") : "";
  const setDestValue = (v: string) => { if (destField) setDestDraft((m) => ({ ...m, [destField.field]: v })); };
  // 저장 줄의 바뀐 것 — 디자인 칸 + 보내는 곳(있으면)
  const destLabel = (v: string) =>
    !destField ? v : destField.kind === "hours" ? `만료 ${v || "—"}시간 전` : v ? `#${channelName(v) || v}` : destField.empty;
  const saveChanges = [
    ...(destDirty && destField && dest ? [`보내는 곳 ${destLabel(dest[destField.field] || "")} → ${destLabel(destValue)}`] : []),
    ...chg,
  ];

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="봇 메시지"
        footer={<SaveBar dirty={!loading && dirty} changes={saveChanges} onSave={save} onReset={revert} saving={saving} />}
      >
        {loadFailed && !loading && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-[#e91e3f]/[0.08] text-[#d01634] text-[13px] font-bold">
            <p className="min-w-0 grow basis-60">메시지 설정을 불러오지 못했습니다.</p>
            <Btn size="sm" variant="secondary" onClick={load}>다시 불러오기</Btn>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
        ) : item && draft && e && def ? (
          <div className="flex flex-col lg:flex-row lg:items-start">
            {/* ── 키 목록 — PC 왼쪽 칸 / 모바일 위 두 열 ── */}
            <nav aria-label="메시지 목록" className="mb-5 lg:mb-0 lg:mr-5 lg:w-[196px] lg:shrink-0 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto no-bar">
              <Panel flush>
                {GROUPS.map((g, gi) => {
                  const keys = KEYS.filter((k) => DEFS[k]?.group === g.key);
                  if (!keys.length) return null;
                  return (
                    <div key={g.key} className={gi > 0 ? "border-t border-[#ededed]" : ""}>
                      <p className="px-4 pt-3 pb-1.5 text-[11px] font-black tracking-[0.04em] text-[#8a8a8a]">{g.label}</p>
                      <div className="grid grid-cols-2 lg:grid-cols-1 pb-2">
                        {keys.map((k) => {
                          const on = k === sel;
                          const off = items[k] && !items[k].template.enabled;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => pick(k)}
                              aria-current={on ? "true" : undefined}
                              title={DEFS[k].label}
                              className={`relative flex items-center h-10 pl-4 pr-3 text-left text-[13px] font-bold outline-none focus-visible:bg-[#f2f2f2] transition-colors ${on ? "bg-[#f2f2f2] text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f7f7f7]"}`}
                            >
                              {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#e91e3f]" />}
                              <span className={`min-w-0 truncate ${off ? "text-[#a3a3a3]" : ""}`}>{DEFS[k].label}</span>
                              <span className="ml-auto pl-2 flex items-center shrink-0">
                                {off && <span className="text-[11px] text-[#a3a3a3]">꺼짐</span>}
                                {dirtyKeys.has(k) && <Dot />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Panel>
            </nav>

            <div className="min-w-0 flex-1 flex flex-col xl:flex-row xl:items-start">
              {/* ── 편집 ── */}
              <div ref={editorRef} className="min-w-0 flex-1 mb-5 xl:mb-0 xl:mr-5 scroll-mt-24">
                {/* 머리 — 이름 · 보내는 곳 · 저장 시각은 줄 수를 고정해(말줄임) 아래 단추 줄이 키마다 움직이지 않게 */}
                <Panel flush className="mb-5">
                  <div className="px-5 pt-4 pb-3 border-b border-[#ededed]">
                    <h2 className="text-[17px] font-black tracking-tight truncate">{def.label}</h2>
                    {/* 📌 보내는 곳 — 키마다 같은 높이(h-10)로: 고르는 칸(채널 · 만료 시점)이든 글자든 아래 단추 줄이 움직이지 않게 */}
                    <div className="mt-2 flex items-center gap-3 min-h-10 min-w-0">
                      <span className="shrink-0 inline-flex items-center text-[12px] font-bold text-[#5a5a5a]">
                        보내는 곳{destDirty && <Dot />}
                      </span>
                      {destField?.kind === "channel" && dest ? (
                        <Dropdown
                          theme="light"
                          className="min-w-0 flex-1 max-w-[320px]"
                          buttonClassName={DD}
                          value={destValue}
                          onChange={setDestValue}
                          options={channelOptions(destValue, destField.empty)}
                        />
                      ) : destField?.kind === "hours" && dest ? (
                        // 한 줄에 — 375 폭에서도 「DM · 만료 [24] 시간 전」이 접히지 않게(머리 높이가 키마다 같게)
                        <span className="min-w-0 inline-flex flex-nowrap items-center gap-2 whitespace-nowrap text-[13px] text-[#5a5a5a]">
                          <span className="font-bold text-[#131313]">DM</span>
                          · 만료
                          <input
                            type="number"
                            inputMode="numeric"
                            min={HOURS_MIN}
                            max={HOURS_MAX}
                            aria-label="만료 몇 시간 전"
                            value={destValue}
                            onChange={(ev) => setDestValue(ev.target.value)}
                            className={`${inputClass} !w-16 h-10 tabular-nums ${destValue && !hoursOk(destValue) ? "!border-[#d01634]" : ""}`}
                          />
                          시간 전
                        </span>
                      ) : (
                        <span className="min-w-0 truncate text-[13px] font-bold text-[#131313]">
                          {destText}
                          {sel === "rankerAnnounce" && dest?.levelupChannelId ? <span className="font-normal text-[#5a5a5a]"> · #{channelName(dest.levelupChannelId) || dest.levelupChannelId}</span> : null}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-[#8a8a8a] truncate tabular-nums">{meta}</p>
                  </div>
                  {/* 단추 줄 — 켜짐/꺼짐 글자는 고정 폭, 바뀜 점은 띄워 둬서 375px 에서도 한 줄 그대로 */}
                  <div className="flex items-center px-4 md:px-5 py-3">
                    <span className="relative inline-flex items-center shrink-0">
                      <Switch on={draft.enabled} onChange={(v) => setTop("enabled", v)} label="보내기" />
                      <span className={`ml-2 w-8 text-[13px] font-bold ${draft.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{draft.enabled ? "켜짐" : "꺼짐"}</span>
                      {chg.has("보내기") && <span className="absolute -top-1 -right-2"><Dot /></span>}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <Btn variant="ghost" size="sm" onClick={askReset} disabled={(!item.custom && !dirty) || resetting}>기본값으로</Btn>
                      <Btn variant="secondary" size="sm" onClick={sendTest} disabled={testing} aria-busy={testing || undefined}>테스트 발송</Btn>
                    </div>
                  </div>
                </Panel>

                {/* 변수 칩 — PC 는 편집 칸 위에 붙어 따라온다, 모바일은 한 줄 가로 스크롤 */}
                <div className="mb-5 lg:sticky lg:top-[72px] z-10">
                  <VarChips vars={vars} keyVarCount={keyVarCount} onInsert={insertVar} />
                </div>

                <Panel flush className="mb-5">
                  <Blk label="본문" changed={chg.has("본문")} right={count(draft.content.length, LIM.content)}>
                    <TextBox path="content" value={draft.content} onChange={(v) => setText("content", v)} onCaret={onCaret} max={LIM.content} rows={3} label="본문" />
                  </Blk>
                </Panel>

                {/* 카드 이미지 — 카드 키만. 임베드 패널 머리와 같은 한 줄 */}
                {cardKey && (
                  <Panel flush className="mb-5">
                    <div className="flex items-center px-5 py-3.5">
                      <h2 className="inline-flex items-center text-[15px] font-black tracking-tight">
                        카드 이미지{chg.has("카드") && <Dot />}
                      </h2>
                      <span className="ml-auto inline-flex items-center shrink-0">
                        <Switch on={draft.card} onChange={setCard} label="카드 이미지" />
                      </span>
                    </div>
                  </Panel>
                )}

                {/* 공지는 레벨 변수가 없어 등급 색을 고를 수 없다 */}
                <EmbedPanel draft={draft} patch={patch} onCaret={onCaret} problems={problems} chg={chg} cardOn={cardOn} tierColor={tierColor} tierChip={sel !== NOTICE_KEY} onLimit={(m) => toast(m, true)} />
              </div>

              {/* ── 미리보기 — 예시 값으로 그린다. PC(xl)는 오른쪽에 붙어 따라온다 ── */}
              <div className="min-w-0 xl:w-[380px] 2xl:w-[460px] xl:shrink-0 xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-104px)] xl:overflow-y-auto no-bar">
                <Panel
                  flush
                  className="overflow-hidden"
                  title="미리보기"
                  right={
                    // 📌 칩 자리는 높이 0 — 칩(24px)이 제목 줄(22.5px)보다 커서, '보내기'를 끄고 켤 때마다 미리보기가 1~2px 오르내리던 것.
                    //    칩은 제목 줄 가운데에 겹쳐 뜨고, 칩이 없는 평소 모습(제목 줄 22.5px)은 예전 그대로
                    <span className="flex items-center gap-2 h-0">
                      {overTotal && <StatusChip tone="warn">6,000자 초과</StatusChip>}
                      {!draft.enabled && <StatusChip>꺼짐</StatusChip>}
                    </span>
                  }
                >
                  {/* 등급 칩 — 등급 카드(레벨업 · 역할 지급 · /레벨 · /랭크)에서 카드가 켜져 있을 때만.
                      📌 2026-10-16 운영자 "안 넘어가니까 · 이런 거 만들 때 신경 좀" — 한 줄 가로 스크롤(스크롤 막대 숨김)은 마우스로 넘길 수 없어 뒤 등급이 안 보였다 → 줄을 접어 다 보이게 */}
                  {tierCard && (
                    <div className="flex items-start px-4 py-2.5 border-b border-[#ededed]">
                      <span className="shrink-0 mr-3 mt-1.5 text-[12px] font-bold text-[#5a5a5a]">등급</span>
                      <div role="radiogroup" aria-label="등급" className="min-w-0 flex-1 flex flex-wrap gap-1">
                        {TIER_OPTIONS.map((o) => {
                          const on = String(cardTier) === o.v;
                          return (
                            <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => setCardTier(Number(o.v))}
                              className={`h-8 px-3 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"}`}>
                              {o.l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* 꾸미기 끼워 보기 — 카드가 켜져 있을 때. 카드 배경 · 카드 테두리는 꾸미기를 그리는 카드에서만(봇과 같다), 프로필 테두리는 어느 카드든 */}
                  {cardOn && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-4 py-2.5 border-b border-[#ededed]">
                      {([
                        ["scene", "카드 배경", SCENE_OPTIONS, DRESS_KEYS.has(sel)],
                        ["skin", "카드 테두리", SKIN_OPTIONS, DRESS_KEYS.has(sel)],
                        ["frame", "프로필 테두리", FRAME_OPTIONS, true],
                      ] as [keyof typeof dress, string, { v: string; l: string }[], boolean][]).map(([k, label, opts, ok]) => (
                        <label key={k} className={`min-w-0 flex flex-col gap-1 ${ok ? "" : "opacity-40"}`}>
                          <span className="text-[11px] font-bold text-[#5a5a5a]">{label}</span>
                          <select value={dress[k]} disabled={!ok} onChange={(e) => setDress((d) => ({ ...d, [k]: e.target.value }))} className={`${inputClass} h-9 text-[12px]`}>
                            {opts.map((o) => <option key={o.v || "none"} value={o.v}>{o.l}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* 공지는 봇이 링크 버튼을 붙인다 — 글자는 글마다(글쓰기 › 디스코드 공지), 여기선 기본 글자로 */}
                  <DiscordPreview r={rendered} clock={clock} off={!draft.enabled} card={cardView} buttons={sel === NOTICE_KEY ? [NOTICE_BUTTON_LABEL] : BOT_EXTRAS[sel]?.buttons} images={BOT_EXTRAS[sel]?.images} extra={extraEmbeds} />
                </Panel>
              </div>
            </div>
          </div>
        ) : null}
      </AdminPage>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="기본값으로"
        body={`저장한 '${def?.label || ""}' 디자인을 지우고 기본 디자인으로 돌아갑니다.`}
        confirmLabel="되돌리기"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />

      {/* 결과 토스트(공용 useToast) — 저장 줄이 떠 있으면 그 높이만큼 위로(SaveBar 가 --admin-bar 로 알린다) */}
      {toastEl}
    </>
  );
}
