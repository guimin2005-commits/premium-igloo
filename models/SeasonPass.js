import mongoose from "mongoose";

// 📌 시즌 패스 설정 — 관리자가 등록하는 단일 문서(key: "main"). BotSetting 과 같은 방식.
//    진행도는 새 재화가 아니라 "이번 시즌에 번 XP"(UserXp.xp - passBaseXp)를 그대로 쓴다.
//    보상 kind — none(빈 칸) | xp(봇 Payout 큐로 지급) | point(사이트가 직접 지급) | role(봇 Purchase 큐로 역할 지급)
const RewardSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "none", enum: ["none", "xp", "point", "role"] },
    amount: { type: Number, default: 0 },    // xp·point 일 때 지급량
    roleId: { type: String, default: "" },   // role 일 때 지급할 역할
    roleName: { type: String, default: "" }, // 표시용 (역할 이름이 바뀌어도 라벨은 남게)
  },
  { _id: false } // 티어에 박히는 값일 뿐이라 개별 id 를 만들지 않는다
);

const TierSchema = new mongoose.Schema(
  {
    // 📌 tid — 티어의 안정 식별자("t1", "t2" …). 수령 기록(UserXp.passClaimed*)이 이 값을 담는다.
    //    배열 인덱스나 level 은 쓸 수 없다: 관리자가 시즌 도중 티어를 중간에 하나 끼워 넣으면
    //    뒤쪽 인덱스가 전부 한 칸씩 밀려, 이미 받은 티어가 "미수령"으로 돌아가 같은 보상을 두 번 받는다.
    //    티어 추가는 시즌 중에 흔히 일어나는 정상 조작이므로 위치와 무관한 id 가 필요하다.
    //    발급·보존은 lib/seasonPass.js 의 normalizeTiers 가 맡는다 (한 번 붙은 tid 는 절대 바뀌지 않는다).
    tid: { type: String, default: "" },
    level: { type: Number, default: 1 },  // 1..N — 저장할 때 need 순서대로 다시 매긴다 (표시용, 식별자가 아니다)
    need: { type: Number, default: 0 },   // 이 티어에 도달하는 데 필요한 시즌 XP
    free: { type: RewardSchema, default: () => ({}) },
    paid: { type: RewardSchema, default: () => ({}) },
  },
  { _id: false }
);

const SeasonPassSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },
  // 관리자가 켜기 전에는 패스를 노출하지 않는다 — 티어를 다 채우기 전에 새는 걸 막는 기본 꺼짐
  enabled: { type: Boolean, default: false },
  // 프리미엄 트랙 해금가 — XP 와 POINT 는 1:1 등가라 가격은 하나를 공유한다
  unlockPrice: { type: Number, default: 50000 },
  // 티어는 need 오름차순으로만 저장된다 (정렬·검증은 lib/seasonPass.js 의 normalizeTiers)
  tiers: { type: [TierSchema], default: [] },
  // 다음에 발급할 tid 번호 — 삭제된 티어의 tid 를 재사용하지 않으려고 문서에 들고 다닌다.
  // (재사용하면 지운 티어를 받았던 유저의 기록이 새 티어의 수령 기록으로 둔갑한다)
  nextTid: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.SeasonPass || mongoose.model("SeasonPass", SeasonPassSchema);
