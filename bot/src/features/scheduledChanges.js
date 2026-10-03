// ── 예약 변경 — 정한 시각이 되면 설정 · 아이템 값을 바꾼다(1분 주기) ──
//    📌 공지에 "10/4 부터 적용"처럼 날짜를 정해 둔 조정을 사람이 자정에 손으로 바꾸지 않게 한다.
//       문서(ScheduledChange) 하나 = $set 하나. 먼저 appliedAt 을 찍어 잡은 뒤(봇이 둘이어도 한 번만) 바꾼다.
//       바꾸기 직전 값을 before 에 남긴다. 실패하면 error 에 적고 appliedAt 을 되돌려 다음 주기에 다시 한다
//    바꾼 뒤 설정 · 아이템 효과 캐시를 바로 다시 읽는다(1분 주기를 기다리지 않게)
import { ScheduledChange, BotSetting, Item } from "../db.js";
import { refreshBotSettings } from "../botSettings.js";
import { refreshItemEffects } from "../itemEffects.js";

const TICK_MS = 60 * 1000;
let running = false;

async function applyOne(doc) {
  const set = doc.set && typeof doc.set === "object" ? doc.set : null;
  if (!set || !Object.keys(set).length) throw new Error("바꿀 값이 없습니다");
  const keys = Object.keys(set);
  const proj = Object.fromEntries(keys.map((k) => [k, 1]));
  if (doc.target === "setting") {
    const cur = await BotSetting.findOne({ key: "main" }, proj).lean();
    await BotSetting.updateOne({ key: "main" }, { $set: set });
    return cur || {};
  }
  if (doc.target === "item") {
    const cur = await Item.findById(doc.itemId, proj).lean();
    if (!cur) throw new Error("아이템이 없습니다");
    await Item.updateOne({ _id: doc.itemId }, { $set: set });
    return cur;
  }
  throw new Error(`모르는 대상: ${doc.target}`);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await ScheduledChange.find({ appliedAt: null, at: { $lte: now } }).sort({ at: 1 }).limit(20).lean();
    let changed = false;
    for (const d of due) {
      // 잡기 — 다른 봇 · 다음 주기가 같은 건을 또 하지 않게
      const claim = await ScheduledChange.findOneAndUpdate({ _id: d._id, appliedAt: null }, { $set: { appliedAt: now } }, { new: true }).lean();
      if (!claim) continue;
      try {
        const before = await applyOne(claim);
        await ScheduledChange.updateOne({ _id: d._id }, { $set: { before, error: "" } });
        console.log(`🗓️ 예약 변경 적용: ${claim.label || claim.target} — ${JSON.stringify(claim.set)}`);
        changed = true;
      } catch (e) {
        console.error(`예약 변경 실패(${claim.label || claim._id}):`, e.message);
        await ScheduledChange.updateOne({ _id: d._id }, { $set: { appliedAt: null, error: String(e.message || e).slice(0, 300) } });
      }
    }
    if (changed) await Promise.all([refreshBotSettings(), refreshItemEffects()]);
  } catch (e) {
    console.error("예약 변경 주기 오류:", e.message);
  } finally {
    running = false;
  }
}

export function startScheduledChanges() {
  tick();
  setInterval(tick, TICK_MS);
}
