import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { executeQuery } from "../../database.js";
import { reportJobFailure, sendLogEmbed } from "../logger.js";
import COLOUR_VALUES from "../colourMap.js";
import { fetchRecentVideos, isTikTokConfigured, refreshAccessToken } from "./tiktokApi.js";

export const DEFAULT_ANNOUNCEMENT = "{role} **{creator}** just posted a new TikTok! 🎬";

// Refresh a little before expiry so a check never runs with a token that dies mid-request.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
// Upper bound on announcements per check, in case of a backlog after downtime.
const MAX_POSTS_PER_CHECK = 5;

let checkInProgress = false;

export async function getTikTokSettings(guildId) {
    const rows = await executeQuery(`SELECT * FROM tiktok_settings WHERE guild_id = ?`, [guildId]);
    return rows[0] || null;
}

// Returns a usable access token, refreshing (and persisting the new tokens) when
// needed. Marks the guild as needing a reconnect if TikTok rejects the refresh.
export async function getValidAccessToken(guild, settings) {
    if (!settings?.refresh_token || settings.needs_reconnect) return null;

    if (settings.access_token && Number(settings.access_expires_at) - REFRESH_MARGIN_MS > Date.now()) {
        return settings.access_token;
    }

    try {
        const tokens = await refreshAccessToken(settings.refresh_token);
        await executeQuery(`
            UPDATE tiktok_settings
            SET access_token = ?, access_expires_at = ?, refresh_token = ?, refresh_expires_at = ?
            WHERE guild_id = ?
        `, [tokens.accessToken, tokens.accessExpiresAt, tokens.refreshToken, tokens.refreshExpiresAt, guild.id]);
        return tokens.accessToken;
    } catch (error) {
        console.error(`[TikTok] Token refresh failed for guild ${guild.id}:`, error);
        // Only a rejected refresh token needs a reconnect; network blips just retry next check.
        if (error.tiktokError) {
            await executeQuery(`UPDATE tiktok_settings SET needs_reconnect = TRUE WHERE guild_id = ?`, [guild.id]);
            await sendLogEmbed(
                guild.id,
                `**TikTok Notifications Paused**\n\nThe TikTok connection for **${settings.display_name || "the creator"}** has expired or been revoked.\nAn admin needs to run \`/tiktok connect\` again.`,
                COLOUR_VALUES.WARNING
            );
        }
        return null;
    }
}

function fillTemplate(template, values) {
    return template.replace(/\{(creator|title|link|role)\}/g, (_, key) => values[key] ?? "");
}

// Builds the announcement for one video. Shared by the scheduled check and /tiktok test
// so the test shows exactly what a real announcement looks like.
export function buildAnnouncement(settings, video) {
    const creator = settings.display_name || "We";
    const title = (video.title || video.video_description || "").trim();
    const roleMention = settings.role_id ? `<@&${settings.role_id}>` : "";

    const content = fillTemplate(settings.announcement_message || DEFAULT_ANNOUNCEMENT, {
        creator,
        title: title || "New video",
        link: video.share_url,
        role: roleMention,
    }).trim();

    const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setAuthor({ name: `${creator} on TikTok` })
        .setTitle((title || "Watch the new video").slice(0, 256))
        .setURL(video.share_url)
        .setTimestamp(new Date(Number(video.create_time) * 1000));

    if (video.cover_image_url) embed.setImage(video.cover_image_url);

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Watch on TikTok").setURL(video.share_url)
    );

    return {
        content: content || undefined,
        embeds: [embed],
        components: [buttons],
        allowedMentions: { roles: settings.role_id ? [settings.role_id] : [] },
    };
}

// Latest create_time among the given videos, or "now" if there are none — used as
// the starting point so connecting/enabling never re-announces old videos.
export function newestVideoTime(videos) {
    const newest = videos.reduce((max, v) => Math.max(max, Number(v.create_time) || 0), 0);
    return newest || Math.floor(Date.now() / 1000);
}

// Checks one guild for videos posted since the last announced one. Returns the
// number announced.
export async function checkGuildForNewVideos(client, guildId) {
    const settings = await getTikTokSettings(guildId);
    if (!settings?.is_enabled || !settings.channel_id || settings.needs_reconnect) return 0;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return 0;

    const accessToken = await getValidAccessToken(guild, settings);
    if (!accessToken) return 0;

    const videos = await fetchRecentVideos(accessToken, 10);
    const lastSeen = Number(settings.last_video_time) || 0;

    const fresh = videos
        .filter(v => Number(v.create_time) > lastSeen)
        .sort((a, b) => Number(a.create_time) - Number(b.create_time))
        .slice(-MAX_POSTS_PER_CHECK);

    if (fresh.length === 0) {
        await executeQuery(`UPDATE tiktok_settings SET last_checked_at = ? WHERE guild_id = ?`, [Date.now(), guildId]);
        return 0;
    }

    const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
    if (!channel) {
        console.error(`[TikTok] Announcement channel ${settings.channel_id} missing in guild ${guildId}`);
        await reportJobFailure(guildId, "TikTok announcement", "The TikTok announcement channel no longer exists, so a new video wasn't announced. Set it again with `/tiktok channel`.");
        return 0;
    }

    let announced = 0;
    for (const video of fresh) {
        await channel.send(buildAnnouncement(settings, video));
        // Save progress after each post so a failure part-way doesn't repost earlier videos.
        await executeQuery(
            `UPDATE tiktok_settings SET last_video_time = ?, last_checked_at = ? WHERE guild_id = ?`,
            [Number(video.create_time), Date.now(), guildId]
        );
        announced++;
    }

    console.log(`[TikTok] Announced ${announced} new video(s) in guild ${guildId}`);
    return announced;
}

// How often to check for new uploads, in whole minutes (TIKTOK_CHECK_INTERVAL in
// .env, 1-60, default 1). Each check is one API request per connected server, far
// under TikTok's 600 requests/minute limit; checking more often than every minute
// gains little because TikTok takes minutes to make new uploads visible anyway.
export function getCheckIntervalMinutes() {
    const minutes = Number.parseInt(process.env.TIKTOK_CHECK_INTERVAL, 10);
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 1;
}

// Each guild is checked independently so one broken connection doesn't stop the others.
export function startTikTokWatcher(client) {
    if (!isTikTokConfigured()) {
        console.log("[TikTok] TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REDIRECT_URI not set — TikTok notifications disabled.");
        return;
    }

    const minutes = getCheckIntervalMinutes();
    cron.schedule(minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`, async () => {
        if (checkInProgress) return;
        checkInProgress = true;
        try {
            const rows = await executeQuery(`
                SELECT guild_id FROM tiktok_settings
                WHERE is_enabled = TRUE AND channel_id IS NOT NULL AND refresh_token IS NOT NULL AND needs_reconnect = FALSE
            `);
            for (const { guild_id } of rows) {
                try {
                    await checkGuildForNewVideos(client, guild_id);
                } catch (error) {
                    console.error(`[TikTok] Check failed for guild ${guild_id}:`, error);
                    await reportJobFailure(guild_id, "TikTok upload check", error);
                }
            }
        } finally {
            checkInProgress = false;
        }
    });

    console.log(`[TikTok] Upload watcher started (every ${minutes === 1 ? "minute" : `${minutes} minutes`}).`);
}
