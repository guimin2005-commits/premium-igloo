// ── 운영진 지급 DM 알림 (2026-10-28) ──────────────────
//  📌 운영자 "모든 유저한테 추첨권 30장 · 그에 맞는 봇 메시지 · 전체 지급하는 건 있는데 봇 메시지가 가지 않으니까" —
//     사이트 관리 아이템 지급 창에서 「DM 알림」을 켠 지급(Purchase itemId "grant" · grantDm true — 한 사람분 주문의 첫 건)마다
//     받은 사람에게 「운영진 지급」(botMessages itemGrantNotice) DM 한 통. 수량은 그 주문(orderId)에서 아직 가진 건 수(추첨권 「30장」 · 그 밖 「3개」 — 보내기 전에 다 회수했으면 보내지 않는다).
//  📌 괴담회 추첨권이면 뽑는 법 그림 임베드와 「뽑기 하러 가기」 단추를 붙인다(음성 추첨권 DM 과 같은 그림 · 주소 — features/goedamWatch.js)
//  📌 한 통씩 1.5초 간격 — 한꺼번에 보낸 DM 을 디스코드가 스팸으로 막지 않게(130명이면 약 3~4분). 20초마다 10건씩
//  📌 줄마다 { grantDmAt: null } 조건부로 먼저 세운 뒤 보낸다(재시작 · 겹친 봇에도 한 번만). 서버를 나간 사람 · DM 막힘은 까닭(grantDmError)만 적고
//     다시 두드리지 않는다. 틀을 꺼 두었거나 디스코드 조회가 잠깐 실패하면 표시를 되돌려 다음에 다시
//  📌 역할 아이템(pending) 지급은 사이트가 grantDm 을 세우지 않는다 — 봇 지급 큐(grantQueue.js)가 역할을 붙이며 지급 DM 을 이미 보낸다
//  📌 2026-10-29 지급 창에서 고친 제목 · 본문(grantDmTitle · grantDmBody — null 이면 틀 그대로)은 그 지급에만 틀의 그 칸을 바꿔 보낸다.
//     글은 지급 창이 아이템 · 수량 · 사유를 채워 둔 것 — 같은 틀 규칙(renderTemplate)으로 한 번 더 거쳐 {name} 같은 칸도 채운다
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { Purchase } from "../db.js";
import { config } from "../config.js";
import { buildMessage, buildMessageFrom, currentTemplate, commonVars, SITE_URL } from "../botMessages.js";
import { goedamTicketInfo, isTicketPurchase } from "../goedamTicket.js";

const TICK_MS = 20 * 1000;
const GAP_MS = 1500;
const BATCH = 10;
const GONE_CODES = new Set([10007, 10013]); // Unknown Member · Unknown User
const KEY = "itemGrantNotice";
const DRAW_PATH = "/level?event=goedam";
const GUIDE_URL = `${SITE_URL}/notices/goedam-draw-guide.png`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;

const drawButton = () =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("뽑기 하러 가기").setURL(`${SITE_URL}${DRAW_PATH}`));

async function run(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  // 관리자가 틀을 꺼 두었으면 줄을 건드리지 않는다 — 켜면 그때 보낸다
  const tpl = currentTemplate(KEY);
  if (!tpl) return;
  const rows = await Purchase.find(
    { itemId: "grant", grantDm: true, grantDmAt: null },
    { userId: 1, userName: 1, orderId: 1, itemId: 1, itemRef: 1, itemName: 1, adminNote: 1, status: 1, grantDmTitle: 1, grantDmBody: 1 }
  ).sort({ createdAt: 1 }).limit(BATCH).lean();
  if (!rows.length) return;
  // 추첨권 설정을 못 읽으면 이번엔 쉰다 — 추첨권이 「개」로 그림 · 단추 없이 나가지 않게
  const tk = await goedamTicketInfo().catch(() => undefined);
  if (tk === undefined) return;
  for (const r of rows) {
    const claim = await Purchase.updateOne({ _id: r._id, grantDmAt: null }, { $set: { grantDmAt: new Date() } });
    if (!claim.modifiedCount) continue; // 그새 다른 쪽이 보냈다
    const undo = () => Purchase.updateOne({ _id: r._id }, { $set: { grantDmAt: null } }).catch(() => {});
    const fail = (why) => Purchase.updateOne({ _id: r._id }, { $set: { grantDmError: why } }).catch(() => {});
    let member = guild.members.cache.get(r.userId) || null;
    if (!member) {
      try {
        member = await guild.members.fetch(r.userId);
      } catch (e) {
        if (!GONE_CODES.has(e?.code)) {
          await undo(); // 잠깐 실패 — 다음 주기에 다시
          return;
        }
      }
    }
    if (!member) {
      await fail("no-member");
      continue;
    }
    // 📌 아직 가진 것만 센다 — 보내기 전에 회수한 지급(refunded · cancelled)은 보내지 않고, 일부만 회수했으면 남은 수량으로
    let n;
    try {
      n = r.orderId
        ? await Purchase.countDocuments({ userId: r.userId, orderId: r.orderId, itemId: "grant", status: "completed" })
        : r.status === "completed" ? 1 : 0;
    } catch {
      await undo(); // 잠깐 실패 — 다음 주기에 다시
      return;
    }
    if (n < 1) {
      await fail("revoked");
      continue;
    }
    const ticket = !!tk && isTicketPurchase(r, tk);
    const vars = {
      ...commonVars(member, member.guild),
      item: r.itemName || "아이템",
      qty: `${n.toLocaleString("ko-KR")}${ticket ? "장" : "개"}`,
      reason: r.adminNote || "관리자 지급",
    };
    const own = r.grantDmTitle != null || r.grantDmBody != null;
    const ownTpl = own
      ? {
          ...tpl,
          embed: {
            ...tpl.embed,
            ...(r.grantDmTitle != null ? { title: r.grantDmTitle } : {}),
            ...(r.grantDmBody != null ? { description: r.grantDmBody } : {}),
          },
        }
      : null;
    // 고친 글로 못 만들면(보낼 칸이 비는 등) 틀 그대로
    const msg = (ownTpl && buildMessageFrom(KEY, ownTpl, vars)) || buildMessage(KEY, vars);
    if (!msg) {
      await undo(); // 그새 틀이 꺼졌다 — 켜면 그때 보낸다
      return;
    }
    // 그림 임베드의 띠 색은 첫 임베드와 같게 — EmbedBuilder 는 색을 data.color 에 둔다
    const payload = ticket
      ? { ...msg, embeds: [...(msg.embeds || []), { color: msg.embeds?.[0]?.data?.color, image: { url: GUIDE_URL } }], components: [drawButton()] }
      : msg;
    const ok = await member.send(payload).then(() => true).catch(() => false);
    if (ok) console.log(`📨 운영진 지급 DM: ${r.userName || r.userId} ← ${r.itemName} ×${n}`);
    else await fail("dm");
    await wait(GAP_MS);
  }
}

export function startGrantDm(client) {
  const tick = () => {
    if (busy) return;
    busy = true;
    run(client)
      .catch((e) => console.error("📨 운영진 지급 DM 오류:", e?.message || e))
      .finally(() => {
        busy = false;
      });
  };
  setTimeout(tick, 15_000);
  setInterval(tick, TICK_MS);
  console.log(`✅ 운영진 지급 DM 시작 — ${TICK_MS / 1000}초마다 ${BATCH}건 · 한 통씩 ${GAP_MS / 1000}초 간격`);
}
