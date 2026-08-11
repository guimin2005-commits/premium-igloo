// 📌 인증 상태 배지 — 헤더·모바일 서랍·내 정보에서 같은 색을 쓰도록 한 곳에 모은다
//    500 계열이라 어두운 배경과 밝은 배경 모두에서 읽힌다
export function verifyBadge(isVerified, hasScrimRole) {
  if (isVerified && hasScrimRole) {
    return { label: "인증", cls: "bg-emerald-500/12 text-emerald-500 border-emerald-500/30" };
  }
  if (isVerified) {
    return { label: "일부 인증", cls: "bg-amber-500/12 text-amber-500 border-amber-500/30" };
  }
  return { label: "미인증", cls: "bg-red-500/12 text-red-500 border-red-500/30" };
}
