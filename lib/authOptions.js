import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";

// 📌 로컬 확인용 로그인 — .env.local의 DEV_LOGIN=1 일 때만 켜진다.
//    .env* 는 커밋되지 않으므로 배포 환경에는 이 제공자가 아예 존재하지 않는다.
//    (디스코드 계정 없이 로그인 상태를 만들어, 로그인이 필요한 화면을 직접 열어보기 위한 용도)
const devLoginProvider =
  process.env.DEV_LOGIN === "1"
    ? [
        CredentialsProvider({
          id: "devlogin",
          name: "로컬 확인용 로그인",
          credentials: {
            name: { label: "닉네임", type: "text" },
            id: { label: "디스코드 ID", type: "text" },
          },
          async authorize(credentials) {
            return {
              id: credentials?.id || process.env.DEV_LOGIN_ID || "",
              name: credentials?.name || process.env.DEV_LOGIN_NAME || "",
              image: "",
            };
          },
        }),
      ]
    : [];

// 📌 NextAuth 설정을 공유 모듈로 분리
//  - [...nextauth]/route.js 와 서버 사이드 getServerSession(authOptions) 에서 공용으로 사용
export const authOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+guilds",
    }),
    ...devLoginProvider,
  ],
  callbacks: {
    async jwt({ token, profile, user, trigger, session }) {
      // 로컬 확인용 로그인은 profile이 없으므로 user에서 ID를 받아둔다
      if (user?.id && !token.id) token.id = user.id;

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
          } else if (res.status === 404) {
            // 📌 404 만이 "정말로 서버에 없는 유저"다
            token.isGuildMember = false;
            token.isVerified = false;
            token.hasScrimRole = false;
            token.isBooster = false;
          } else {
            // 📌 401·403·429(레이트리밋)·5xx 는 디스코드 쪽 사정이다.
            //    멀쩡히 서버에 있는 사람을 '미입장'으로 떨어뜨리면 안 된다 —
            //    이전 상태를 그대로 두고, 다음 요청 때 곧바로 다시 확인한다.
            console.error(`길드 멤버 조회 실패 (${res.status}) — 이전 상태 유지 후 재시도`);
            token.rolesCheckedAt = Date.now() - ROLE_TTL + 60 * 1000; // 1분 뒤 재확인
          }
        } catch (e) {
          console.error("역할 확인 에러:", e);
          // 통신 자체가 실패한 경우 — 기존 상태를 유지하고 곧 다시 확인한다.
          // 최초 로그인이라 기존 상태가 없더라도 '미입장'으로 단정하지 않는다
          // (isGuildMember 를 false 로 박으면 입장 안내 화면이 잘못 뜬다).
          token.rolesCheckedAt = Date.now() - ROLE_TTL + 60 * 1000;
          if (profile) {
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
