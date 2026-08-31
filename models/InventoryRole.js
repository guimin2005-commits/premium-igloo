import mongoose from "mongoose";

// 📌 인벤토리 역할 — 디스코드 역할을 '보유 아이템'으로 등록한다.
//    상점 상품(ShopItem)이나 레벨 보상(RoleConfig)이 아닌 역할도
//    여기 등록해 두면 그 역할을 가진 유저의 인벤토리에 표시된다.
//    (칭호·알림 구독·특전 권한처럼 디스코드에서만 주던 것들)
const InventoryRoleSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },        // 디스코드 원본 역할 이름 (참고용)
  label: { type: String, default: "" },           // 인벤토리에 보여줄 이름 (비우면 roleName)
  category: { type: String, default: "perk" },    // perk(특전) | title(칭호) | notify(알림) | etc
  description: { type: String, default: "" },     // 한 줄 설명
  color: { type: String, default: "" },           // 표시 색 (비우면 기본 잉크)
  sortOrder: { type: Number, default: 0 },
  visible: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.InventoryRole || mongoose.model("InventoryRole", InventoryRoleSchema);
