// 📌 옛 「기본 효과」 세 칸(채팅 · 음성 1회당 · 출석 시 +N XP)을 같은 값의 추가 효과 줄로 옮기는 일회용 스크립트 — 2026-10-17
//    상점 관리 › 아이템 편집기에서 세 칸 입력을 없애고 「추가 효과」 하나로 합쳤다(app/admin/shop/page.tsx EffectsEditor).
//    값이 남은 아이템은 편집기에 읽기 전용 줄 + 「추가 효과로 옮기기」가 뜬다 — 이 스크립트는 그것을 모든 아이템에 한 번에 한다.
//
//    바꾸는 것(아이템 문서 하나):
//      chatBuffXp N   → effects 맨 앞 { id: "basic-chat",   on: "chat",   mode: "add", amount: N } · chatBuffXp 0
//      voiceBuffXp N  → effects 맨 앞 { id: "basic-voice",  on: "voice",  mode: "add", amount: N } · voiceBuffXp 0
//      attendBuffXp N → effects 맨 앞 { id: "basic-attend", on: "attend", mode: "add", amount: N } · attendBuffXp 0
//    봇(bot/src/itemEffects.js itemEffectList)은 세 칸을 바로 이 모양(같은 id · 조건 없음 · 목록 맨 앞)으로 바꿔 쓰므로 옮기기 전후 지급이 같다.
//    인벤토리 · 상품 상세 문장도 같다(lib/itemEffects describeItemBasic 「채팅 1회당 +N XP」 = describeEffect 같은 문장).
//    사이트 /api/xp/me 의 itemChatXp · itemVoiceXp · attendItemXp(레벨 화면 세부 효과)도 세 칸 + 조건 없는 add 줄을 함께 센다(flatItemXp) — 옮기기 전후 숫자가 같다
//
//    대상: items(실사이트) · draft_items(localhost 초안 — 기준 _draftBase 도 같은 규칙으로 바꿔 반영 때 차이가 생기지 않게).
//    건너뜀: 기프트카드(효과를 안 씀) · 삭제 예정 초안 · 옮기면 효과가 20줄(MAX_EFFECTS)을 넘는 아이템.
//    공유 DB 라 --write 는 실행하는 순간 실사이트 · 봇에도 뜬다.
//
//    node scripts/migrate-basic-buffs.mjs            — 옮길 대상과 바뀔 모양만 보여 준다(읽기만 — 쓰지 않음)
//    node scripts/migrate-basic-buffs.mjs --write    — 옮긴다. 바꾸기 전 값을 scripts/migrate-basic-buffs.backup.json 에 남긴다
//    node scripts/migrate-basic-buffs.mjs --revert   — 그 백업으로 되돌린다(그 사이 효과를 다시 고친 문서는 건드리지 않는다)
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MAX_EFFECTS, describeItemBasic } from "../lib/itemEffects.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const mongoose = require("mongoose");
const BACKUP = path.join(ROOT, "scripts", "migrate-basic-buffs.backup.json");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--revert") ? "revert" : "dry";

const BUFF_MAX = 1_000_000;
const BASIC = [
  { k: "chatBuffXp", on: "chat" },
  { k: "voiceBuffXp", on: "voice" },
  { k: "attendBuffXp", on: "attend" },
];
// 관리 API(app/api/admin/items buffInt)와 같은 정리 — 정수 · 0 ~ 1,000,000
const buffInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(BUFF_MAX, Math.max(0, n)) : 0;
};
const fmt = (n) => Number(n).toLocaleString("ko-KR");

function uriOf() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) throw new Error("MONGODB_URI 없음");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// 문서 하나(또는 초안 기준 _draftBase)의 새 값 — 옮길 게 없으면 null, 못 옮기면 { skip }
function convert(doc) {
  if (!doc || typeof doc !== "object") return null;
  const vals = BASIC.map((b) => ({ ...b, v: buffInt(doc[b.k]) })).filter((x) => x.v > 0);
  if (!vals.length) return null;
  if (doc.type === "physical") return { skip: "기프트카드 — 효과를 쓰지 않음" };
  const list = Array.isArray(doc.effects) ? doc.effects : [];
  if (list.length + vals.length > MAX_EFFECTS) return { skip: `효과가 ${MAX_EFFECTS}줄을 넘음(지금 ${list.length}줄 + ${vals.length}줄)` };
  const rows = vals.map((x) => ({ id: `basic-${x.on}`, on: x.on, mode: "add", amount: x.v }));
  return {
    set: { effects: [...rows, ...list], chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0 },
    lines: describeItemBasic({ chatBuffXp: buffInt(doc.chatBuffXp), voiceBuffXp: buffInt(doc.voiceBuffXp), attendBuffXp: buffInt(doc.attendBuffXp) }),
    from: list.length,
  };
}
const BASIC_FILTER = { $or: BASIC.map((b) => ({ [b.k]: { $gt: 0 } })) };

async function planOf(db) {
  const plan = [];
  const skipped = [];
  // 실사이트
  for (const it of await db.collection("items").find(BASIC_FILTER).toArray()) {
    const c = convert(it);
    if (!c) continue;
    if (c.skip) { skipped.push({ col: "items", id: it._id, name: it.name, why: c.skip }); continue; }
    plan.push({ col: "items", id: it._id, name: it.name, set: c.set, lines: c.lines, from: c.from, before: pick(it) });
  }
  // 초안(있으면) — 문서 칸 · 기준(_draftBase) 칸을 같은 규칙으로. 기준만 값이 남은 초안(세 칸을 이미 비운 초안)도 기준은 맞춘다
  const hasDraft = (await db.listCollections({ name: "draft_items" }).toArray()).length > 0;
  if (hasDraft) {
    const baseOr = { $or: BASIC.map((b) => ({ [`_draftBase.${b.k}`]: { $gt: 0 } })) };
    for (const d of await db.collection("draft_items").find({ $or: [BASIC_FILTER, baseOr] }).toArray()) {
      if (d._draftOp === "delete") { skipped.push({ col: "draft_items", id: d._id, name: d.name, why: "삭제 예정 초안" }); continue; }
      const c = convert(d);
      const cb = convert(d._draftBase);
      if (c?.skip || cb?.skip) { skipped.push({ col: "draft_items", id: d._id, name: d.name, why: c?.skip || cb?.skip }); continue; }
      if (!c && !cb) continue;
      const set = { ...(c ? c.set : {}) };
      if (cb) for (const [k, v] of Object.entries(cb.set)) set[`_draftBase.${k}`] = v;
      plan.push({ col: "draft_items", id: d._id, name: d.name, set, lines: c ? c.lines : [], from: c ? c.from : null, baseOnly: !c, before: { ...pick(d), _draftBase: d._draftBase ? pick(d._draftBase) : null } });
    }
  }
  return { plan, skipped, hasDraft };
}
// 되돌리기용 — 바꾸기 전 효과 칸
function pick(doc) {
  return { effects: Array.isArray(doc.effects) ? doc.effects : [], chatBuffXp: doc.chatBuffXp ?? 0, voiceBuffXp: doc.voiceBuffXp ?? 0, attendBuffXp: doc.attendBuffXp ?? 0 };
}

await mongoose.connect(uriOf());
const db = mongoose.connection.db;
try {
  if (mode === "revert") {
    const back = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
    let n = 0;
    for (const b of back) {
      const _id = new mongoose.Types.ObjectId(b.id);
      const cur = await db.collection(b.col).findOne({ _id }, { projection: { effects: 1 } });
      // 그 사이 효과를 다시 고쳤으면 건드리지 않는다
      if (!cur || JSON.stringify(cur.effects || []) !== JSON.stringify(b.after.effects || [])) continue;
      const $set = { effects: b.before.effects, chatBuffXp: b.before.chatBuffXp, voiceBuffXp: b.before.voiceBuffXp, attendBuffXp: b.before.attendBuffXp };
      if (b.col === "draft_items" && b.before._draftBase) {
        for (const [k, v] of Object.entries(b.before._draftBase)) $set[`_draftBase.${k}`] = v;
      }
      const r = await db.collection(b.col).updateOne({ _id }, { $set });
      n += r.modifiedCount;
    }
    console.log(`되돌림 ${n} / ${back.length}`);
  } else {
    const { plan, skipped, hasDraft } = await planOf(db);
    const live = plan.filter((p) => p.col === "items");
    const drafts = plan.filter((p) => p.col === "draft_items");
    console.log(`실사이트 items — 옮길 것 ${live.length}개`);
    for (const p of live) console.log(`  · ${p.name} (${p.id}) — ${p.lines.join(" · ")} → 추가 효과 맨 앞 ${p.lines.length}줄 (${p.from}줄 → ${p.from + p.lines.length}줄)`);
    if (hasDraft) {
      console.log(`초안 draft_items — 옮길 것 ${drafts.length}개(기준 _draftBase 만 ${drafts.filter((p) => p.baseOnly).length}개)`);
      for (const p of drafts) console.log(`  · ${p.name} (${p.id}) — ${p.baseOnly ? "기준만" : `${p.lines.join(" · ")} → 추가 효과 맨 앞 ${p.lines.length}줄 (${p.from}줄 → ${p.from + p.lines.length}줄)`}`);
    } else console.log("초안 draft_items — 없음");
    if (skipped.length) {
      console.log(`건너뜀 ${skipped.length}개`);
      for (const s of skipped) console.log(`  · [${s.col}] ${s.name} (${s.id}) — ${s.why}`);
    }
    const sum = (k) => live.reduce((n, p) => n + (p.before[k] > 0 ? 1 : 0), 0);
    console.log(`합계 — 채팅 ${fmt(sum("chatBuffXp"))} · 음성 ${fmt(sum("voiceBuffXp"))} · 출석 ${fmt(sum("attendBuffXp"))} (실사이트 아이템 수)`);
    if (mode === "dry") {
      console.log("\n쓰지 않았습니다. 옮기려면 --write");
    } else if (plan.length) {
      // 바꾸기 전 값을 먼저 남긴다
      fs.writeFileSync(BACKUP, JSON.stringify(plan.map((p) => ({ col: p.col, id: String(p.id), name: p.name, before: p.before, after: { effects: p.set.effects ?? p.before.effects } })), null, 2));
      let n = 0;
      for (const p of plan) {
        // 세 칸이 아직 남은(또는 기준만 남은) 문서만 — 두 번 돌려도 같은 결과
        const filter = p.baseOnly ? { _id: p.id } : { _id: p.id, ...BASIC_FILTER };
        const r = await db.collection(p.col).updateOne(filter, { $set: p.set });
        n += r.modifiedCount;
      }
      console.log(`\n옮김 ${n} / ${plan.length} · 백업 ${path.relative(ROOT, BACKUP)}`);
    } else console.log("\n옮길 것이 없습니다.");
  }
} finally {
  await mongoose.disconnect();
}
