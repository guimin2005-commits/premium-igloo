import mongoose from "mongoose";

// 📌 인벤토리 즐겨찾기(2026-10-17) — 계정마다 문서 하나, 즐겨찾기한 칸의 uid 목록만 둔다.
//    uid 는 인벤토리 API(lib/inventory.js buildInventory)가 주는 그대로("p:<구매>" · "u:i:<아이템>" · "r:<역할>" · "season-frame:<n>" …).
//    읽기 · 넣기 · 빼기는 app/api/shop/inv-favorites 하나. 더는 없는 칸의 uid 가 남아 있어도 화면이 지금 칸과 맞춰 보여 준다(최대 500개)
const InvFavoriteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    uids: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
// 한 계정 한 문서 — 처음 넣을 때 동시에 눌러도 한 건만 남는다(진 쪽은 11000 → 라우트가 다시 시도)
InvFavoriteSchema.index({ userId: 1 }, { unique: true });

export default mongoose.models.InvFavorite || mongoose.model("InvFavorite", InvFavoriteSchema);
