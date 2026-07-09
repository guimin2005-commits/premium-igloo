import { NextResponse } from "next/server";

// 📌 디스코드 서버 상세 통계 (관리자 대시보드용, 5분 캐시)
export async function GET() {
  try {
    const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
    const GUILD = process.env.DISCORD_GUILD_ID;

    const [guildRes, channelsRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${GUILD}?with_counts=true`, { headers, next: { revalidate: 300 } }),
      fetch(`https://discord.com/api/v10/guilds/${GUILD}/channels`, { headers, next: { revalidate: 300 } }),
    ]);

    if (!guildRes.ok) return NextResponse.json({ success: false }, { status: 502 });

    const guild = await guildRes.json();
    const channels = channelsRes.ok ? await channelsRes.json() : [];

    // 채널 타입: 0=텍스트, 2=음성, 4=카테고리, 5=공지, 13=스테이지, 15=포럼
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 5 || c.type === 15).length;
    const voiceChannels = channels.filter((c) => c.type === 2 || c.type === 13).length;
    const categories = channels.filter((c) => c.type === 4).length;

    // 서버 개설일 (스노우플레이크 → 타임스탬프)
    const createdAt = Number((BigInt(guild.id) >> 22n) + 1420070400000n);
    const ageDays = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));

    return NextResponse.json({
      success: true,
      memberCount: guild.approximate_member_count || 0,
      onlineCount: guild.approximate_presence_count || 0,
      boostCount: guild.premium_subscription_count || 0,
      boostTier: guild.premium_tier || 0,
      roleCount: Array.isArray(guild.roles) ? guild.roles.filter((r) => r.name !== "@everyone").length : 0,
      emojiCount: Array.isArray(guild.emojis) ? guild.emojis.length : 0,
      stickerCount: Array.isArray(guild.stickers) ? guild.stickers.length : 0,
      textChannels,
      voiceChannels,
      categories,
      totalChannels: textChannels + voiceChannels,
      createdAt: new Date(createdAt).toISOString(),
      ageDays,
    });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
