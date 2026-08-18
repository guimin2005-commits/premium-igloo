import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /* 📌 이용수칙(/rlues) 은 없앴다.
         내용이 서버 이용약관 제3·4조와 겹쳐 두 벌로 관리되고 있었고, 규칙이 어긋나면
         제재 근거로 쓸 수 없다. 주소를 눌러 들어오던 사람이 404 를 보지 않게 넘겨준다. */
      { source: "/rlues", destination: "/policy", permanent: true },
      { source: "/rules", destination: "/policy", permanent: true },
    ];
  },
};

export default nextConfig;
