import DiscordProvider from "next-auth/providers/discord";

// 📌 NextAuth 설정을 공유 모듈로 분리
//  - [...nextauth]/route.js 와 서버 사이드 getServerSession(authOptions) 에서 공용으로 사용
export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+guilds",
    }),
  ],
  callbacks: {
    async jwt({ token, profile, trigger, session }) {
      // 📌 클라이언트에서 인증 업데이트 시 토큰에도 반영
      if (trigger === "update" && session) {
        if (session.isVerified !== undefined) token.isVerified = session.isVerified;
        if (session.hasScrimRole !== undefined) token.hasScrimRole = session.hasScrimRole;
        if (session.isBooster !== undefined) token.isBooster = session.isBooster;
      }

      // 📌 인증/내전/부스터 역할 확인 — 최초 로그인 때, 그리고 10분마다 다시 본다
      //    (로그인 이후에 부스트를 시작해도 다시 로그인하지 않고 뱃지가 붙도록)
      const ROLE_TTL = 10 * 60 * 1000;
      const userId = profile?.id || token.id;
      const stale = !token.rolesCheckedAt || Date.now() - token.rolesCheckedAt > ROLE_TTL;

      if (userId && (profile || stale)) {
        token.id = userId;
        token.rolesCheckedAt = Date.now();
        try {
          const GUILD_ID = process.env.DISCORD_GUILD_ID;
          const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
          const AUTH_ROLE = process.env.DISCORD_AUTH_ROLE_ID;
          const SCRIM_ROLE = process.env.DISCORD_SCRIM_ROLE_ID;
          const BOOSTER_ROLE = process.env.DISCORD_BOOSTER_ROLE_ID;

          const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
            headers: { "Authorization": `Bot ${BOT_TOKEN}` },
            cache: "no-store",
          });

          if (res.ok) {
            const memberData = await res.json();
            token.isGuildMember = true; // 서버 입장 상태
            token.isVerified = memberData.roles.includes(AUTH_ROLE);
            // 환경변수에 스크림 역할이 정의되어 있을 때만 검사
            token.hasScrimRole = SCRIM_ROLE ? memberData.roles.includes(SCRIM_ROLE) : false;
            // 부스터 확인 — 역할 ID(환경변수)와 디스코드가 직접 알려주는 부스트 시작일 중 하나만 있어도 부스터로 본다
            //   (배포 환경에 DISCORD_BOOSTER_ROLE_ID가 없어도 premium_since로 잡힌다)
            token.isBooster =
              (BOOSTER_ROLE ? memberData.roles.includes(BOOSTER_ROLE) : false) || !!memberData.premium_since;
          } else {
            // 📌 404 = 디스코드 서버에 입장하지 않은 유저
            token.isGuildMember = false;
            token.isVerified = false;
            token.hasScrimRole = false;
            token.isBooster = false;
          }
        } catch (e) {
          console.error("역할 확인 에러:", e);
          // 주기 갱신 중 통신이 실패했다면 기존 상태를 유지한다 (최초 로그인일 때만 초기화)
          if (profile) {
            token.isGuildMember = false;
            token.isVerified = false;
            token.hasScrimRole = false;
            token.isBooster = false;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isGuildMember = token.isGuildMember; // 서버 입장 여부
        session.user.isVerified = token.isVerified; // 기본 인증 상태
        session.user.hasScrimRole = token.hasScrimRole; // 내전 권한 상태
        session.user.isBooster = token.isBooster; // 부스터 상태
      }
      return session;
    }
  },
};
