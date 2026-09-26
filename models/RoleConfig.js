import mongoose from "mongoose";

// 📌 레벨 보상 역할 & 역할별 Boost 효과 — 관리자 대시보드에서 설정, 봇이 자동 반영
const RoleConfigSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },        // 표시용 (디스코드 역할 이름)
  rewardLevel: { type: Number, default: null },   // 이 레벨 도달 시 자동 지급 (null이면 자동 지급 안 함)
  // 📌 배타 역할(티어) — 켜면 이 그룹 안에서 최상위 하나만 유지하고 하위는 회수한다.
  //    음성 티어처럼 "아이언 → 브론즈 → 실버"가 겹쳐 달리면 안 되는 사다리에 쓴다.
  exclusive: { type: Boolean, default: false },
  buffXp: { type: Number, default: 0 },           // 채팅/음성 1회 지급당 추가 XP
  attendBuffXp: { type: Number, default: 0 },     // 출석체크 1회당 추가 XP
  // 📌 조건 효과 — 아이템 등록 화면에서 정한다(이 역할이 연결된 아이템). 정의 · 문구 · 정리는 lib/itemEffects.js.
  //    한 칸: { id, on, mode: "add"|"percent", amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds? }
  //    저장 전에 normalizeEffects 로 정리하므로 스키마는 그대로 담기만 한다(`on` 경로가 문서의 on() 을 가리지 않게 Mixed).
  //    봇 사본(bot/src/db.js)과 같은 모양 — 봇은 lean() 으로 읽는다. 키를 바꾸면 봇도 함께 고칠 것.
  effects: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.RoleConfig || mongoose.model("RoleConfig", RoleConfigSchema);
