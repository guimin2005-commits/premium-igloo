// ── 단체 DM (2026-11-01) ──────────────────────
//  📌 운영자 "문화상품권 16개가 추가 됐거든 그거 홍보성 dm 보낼 거니까" — 관리 › 괴담회 「홍보 DM」이 만든 단체 DM(DmBlast)을 한 통씩 보낸다.
//     틀은 관리 › 봇 메시지(blast.key — 괴담회 홍보 goedamPromo), 변수는 blast.vars(prize · count · until). 「뽑기 하러 가기」 단추는 여기서 붙인다.
//  📌 20초마다 10명 · 한 통씩 1.5초 간격(디스코드가 스팸으로 막지 않게 — 운영진 지급 DM 과 같은 속도). 한 번에 단체 DM 하나만(먼저 만든 것부터).
//  📌 집기: cursor 를 조건부로 옮긴 쪽만 그 몫을 보낸다 + 보낸 한 줄(DmBlastSend · blastId + userId 유니크)을 먼저 넣은 쪽만 보낸다 — 겹친 봇 · 재시작에도 한 사람 한 통.
//     서버를 나간 사람 · DM 막힘은 까닭만 적고(failed) 다시 두드리지 않는다. 틀을 꺼 두면 쉰다(켜면 이어서). 관리자가 멈추면(stopped) 거기서 끝
//  📌 target "all" 은 사이트가 받는 사람을 비워 둔다 — 처음 집을 때 서버 멤버(봇 제외)로 채운다
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { DmBlast, DmBlastSend, isDuplicateKeyError } from "../db.js";
import { config } from "../config.js";
import { buildMessage, currentTemplate, commonVars, SITE_URL } from "../botMessages.js";

const TICK_MS = 20 * 1000;
const GAP_MS = 1500;
const BATCH = 10;
const GONE_CODES = new Set([10007, 10013]); // Unknown Member · Unknown User
const DRAW_PATH = "/level?event=goedam";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;
let indexed = false;

const drawButton = () =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("뽑기 하러 가기").setURL(`${SITE_URL}${DRAW_PATH}`));

// 보낸 한 줄 유니크 인덱스 — 첫 보내기 전에 한 번(컬렉션 · 인덱스는 봇 몫)
async function ensureBlastIndexes() {
  if (indexed) return;
  await DmBlastSend.createIndexes();
  indexed = true;
}

async function run(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  const blast = await DmBlast.findOne({ status: { $in: ["queued", "sending"] } }).sort({ createdAt: 1 }).lean();
  if (!blast) return;
  // 관리자가 틀을 꺼 두었으면 쉰다 — 켜면 그때 이어서
  if (!currentTemplate(blast.key)) return;
  await ensureBlastIndexes();

  // 처음 집기 — 서버 전체면 받는 사람을 서버 멤버로 채우고, 보내는 중으로
  if (blast.status === "queued") {
    let set = { status: "sending", startedAt: new Date() };
    if (blast.target === "all") {
      const members = await guild.members.fetch().catch(() => null);
      if (!members) return; // 잠깐 실패 — 다음 주기에 다시
      const ids = [...members.values()].filter((m) => !m.user?.bot).map((m) => m.id);
      set = { ...set, recipients: ids, total: ids.length };
    }
    const r = await DmBlast.updateOne({ _id: blast._id, status: "queued" }, { $set: set });
    if (!r.modifiedCount) return;
    return; // 다음 주기부터 보낸다(채운 목록을 다시 읽어서)
  }

  const list = Array.isArray(blast.recipients) ? blast.recipients : [];
  const from = Math.max(0, Number(blast.cursor) || 0);
  if (from >= list.length) {
    await DmBlast.updateOne({ _id: blast._id, status: "sending" }, { $set: { status: "done", finishedAt: new Date() } });
    console.log(`📣 단체 DM 끝: ${blast.key} · 보냄 ${blast.sent || 0} · 못 보냄 ${blast.failed || 0}`);
    return;
  }
  const to = Math.min(list.length, from + BATCH);
  // 📌 이 몫 집기 — cursor 가 그대로일 때만 옮긴다(다른 봇이 먼저 집었으면 이번엔 쉰다)
  const claim = await DmBlast.updateOne({ _id: blast._id, status: "sending", cursor: blast.cursor || 0 }, { $set: { cursor: to } });
  if (!claim.modifiedCount) return;

  const blastId = String(blast._id);
  for (const userId of list.slice(from, to)) {
    // 관리자가 그새 멈췄으면 남은 몫은 보내지 않는다
    const live = await DmBlast.findOne({ _id: blast._id }, { status: 1 }).lean();
    if (live?.status !== "sending") return;
    try {
      await DmBlastSend.create({ blastId, userId });
    } catch (e) {
      if (isDuplicateKeyError(e)) continue; // 이미 보냈다(겹친 봇 · 재시작)
      throw e;
    }
    const mark = (ok, error = "") =>
      Promise.all([
        DmBlastSend.updateOne({ blastId, userId }, { $set: { ok, error, at: new Date() } }),
        DmBlast.updateOne({ _id: blast._id }, { $inc: ok ? { sent: 1 } : { failed: 1 } }),
      ]).catch(() => {});
    let member = guild.members.cache.get(userId) || null;
    if (!member) {
      try {
        member = await guild.members.fetch(userId);
      } catch (e) {
        if (!GONE_CODES.has(e?.code)) {
          // 잠깐 실패 — 이 사람 줄을 지우고 몫을 되돌려 다음 주기에 다시
          await DmBlastSend.deleteOne({ blastId, userId }).catch(() => {});
          await DmBlast.updateOne({ _id: blast._id, cursor: to }, { $set: { cursor: from } }).catch(() => {});
          return;
        }
      }
    }
    if (!member || member.user?.bot) {
      await mark(false, "no-member");
      continue;
    }
    const vars = blast.vars && typeof blast.vars === "object" ? blast.vars : {};
    const msg = buildMessage(blast.key, { ...commonVars(member, member.guild), ...vars });
    if (!msg) {
      // 그새 틀이 꺼졌다 — 이 사람 줄을 지우고 몫을 되돌린다(켜면 이어서)
      await DmBlastSend.deleteOne({ blastId, userId }).catch(() => {});
      await DmBlast.updateOne({ _id: blast._id, cursor: to }, { $set: { cursor: from } }).catch(() => {});
      return;
    }
    const ok = await member.send({ ...msg, components: [drawButton()] }).then(() => true).catch(() => false);
    await mark(ok, ok ? "" : "dm");
    await wait(GAP_MS);
  }
}

// 한 번 돌리기 — 시험용(봇은 아래 startDmBlast 의 주기로만 부른다)
export const runDmBlastOnce = run;

export function startDmBlast(client) {
  const tick = () => {
    if (busy) return;
    busy = true;
    run(client)
      .catch((e) => console.error("📣 단체 DM 오류:", e?.message || e))
      .finally(() => {
        busy = false;
      });
  };
  setTimeout(tick, 20_000);
  setInterval(tick, TICK_MS);
  console.log(`✅ 단체 DM 시작 — ${TICK_MS / 1000}초마다 ${BATCH}명 · 한 통씩 ${GAP_MS / 1000}초 간격`);
}
