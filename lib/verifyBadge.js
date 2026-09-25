// 📌 인증 상태 배지 — 헤더·모바일 서랍·내 정보에서 같은 색을 쓰도록 한 곳에 모은다
//    dark 는 어두운 바탕(다크 페이지 · 내 정보 잉크 카드) — 500 계열.
//    흰 바탕은 500 이 글자 대비(4.5:1)에 못 미쳐 700 계열 · 누른 빨강으로.
//    text 는 아이콘만 쓸 때(헤더 이름 옆)의 색, kind 는 아이콘 모양(app/components/VerifyMark)
export function verifyBadge(isVerified, hasScrimRole, dark = true) {
  if (isVerified && hasScrimRole) {
    return dark
      ? { kind: "ok", label: "인증", text: "text-emerald-500", cls: "bg-emerald-500/12 text-emerald-500 border-emerald-500/30" }
      : { kind: "ok", label: "인증", text: "text-emerald-700", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-600/30" };
  }
  if (isVerified) {
    return dark
      ? { kind: "partial", label: "일부 인증", text: "text-amber-500", cls: "bg-amber-500/12 text-amber-500 border-amber-500/30" }
      : { kind: "partial", label: "일부 인증", text: "text-amber-700", cls: "bg-amber-500/10 text-amber-700 border-amber-600/30" };
  }
  return dark
    ? { kind: "none", label: "미인증", text: "text-red-500", cls: "bg-red-500/12 text-red-500 border-red-500/30" }
    : { kind: "none", label: "미인증", text: "text-[#d01634]", cls: "bg-[#e91e3f]/[0.08] text-[#d01634] border-[#e91e3f]/30" };
}
