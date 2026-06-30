import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const handler = NextAuth({
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
      }
      
      // 📌 최초 로그인 시 유저의 인증/내전 역할 보유 여부 확인
      if (profile) {
        token.id = profile.id;
        try {
          const GUILD_ID = process.env.DISCORD_GUILD_ID;
          const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
          const AUTH_ROLE = process.env.DISCORD_AUTH_ROLE_ID;
          const SCRIM_ROLE = process.env.DISCORD_SCRIM_ROLE_ID; 

          const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${profile.id}`, {
            headers: { "Authorization": `Bot ${BOT_TOKEN}` }
          });
          
          if (res.ok) {
            const memberData = await res.json();
            token.isVerified = memberData.roles.includes(AUTH_ROLE);
            // 환경변수에 스크림 역할이 정의되어 있을 때만 검사
            token.hasScrimRole = SCRIM_ROLE ? memberData.roles.includes(SCRIM_ROLE) : false;
          } else {
            token.isVerified = false; 
            token.hasScrimRole = false;
          }
        } catch (e) {
          console.error("역할 확인 에러:", e);
          token.isVerified = false;
          token.hasScrimRole = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isVerified = token.isVerified; // 기본 인증 상태
        session.user.hasScrimRole = token.hasScrimRole; // 내전 권한 상태
      }
      return session;
    }
  },
});

export { handler as GET, handler as POST };