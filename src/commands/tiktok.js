import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import {
    buildAuthorizeUrl, createOAuthState, exchangeCode, fetchRecentVideos, fetchUserInfo, isTikTokConfigured,
} from "../utils/tiktok/tiktokApi.js";
import {
    DEFAULT_ANNOUNCEMENT, buildAnnouncement, checkGuildForNewVideos, getTikTokSettings, getValidAccessToken, newestVideoTime,
} from "../utils/tiktok/tiktokNotifier.js";

// How long a /tiktok connect login link stays valid.
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName("tiktok")
        .setDescription("Automatic TikTok upload announcements")
        // connect
        .addSubcommand(subcommand =>
            subcommand
                .setName("connect")
                .setDescription("Link the creator's TikTok account (run without a URL first to get the login link)")
                .addStringOption(option =>
                    option.setName("redirect-url")
                        .setDescription("The full address TikTok sent you to after approving")
                        .setRequired(false)
                )
        )
        // disconnect
        .addSubcommand(subcommand =>
            subcommand
                .setName("disconnect")
                .setDescription("Unlink the TikTok account and stop announcements")
        )
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Set the channel new TikToks are announced in")
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("The announcement channel")
                        .setRequired(true)
                )
        )
        // role
        .addSubcommand(subcommand =>
            subcommand
                .setName("role")
                .setDescription("Set the role pinged for new TikToks (leave empty for no ping)")
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("Role to ping")
                        .setRequired(false)
                )
        )
        // toggle
        .addSubcommand(subcommand =>
            subcommand
                .setName("toggle")
                .setDescription("Enable or disable TikTok announcements")
                .addStringOption(option =>
                    option.setName("status")
                        .setDescription("Enable or disable")
                        .setRequired(true)
                        .addChoices(
                            { name: "Enable", value: "enable" },
                            { name: "Disable", value: "disable" }
                        )
                )
        )
        // message
        .addSubcommand(subcommand =>
            subcommand
                .setName("message")
                .setDescription("Set the announcement text. Placeholders: {creator} {title} {link} {role}")
                .addStringOption(option =>
                    option.setName("text")
                        .setDescription("Leave empty to reset to the default message")
                        .setRequired(false)
                        .setMaxLength(1000)
                )
        )
        // test
        .addSubcommand(subcommand =>
            subcommand
                .setName("test")
                .setDescription("Preview the announcement using the most recent TikTok")
                .addBooleanOption(option =>
                    option.setName("post")
                        .setDescription("Post it in the announcement channel instead of only showing you (default: no)")
                        .setRequired(false)
                )
        )
        // check
        .addSubcommand(subcommand =>
            subcommand
                .setName("check")
                .setDescription("Check for new uploads right now instead of waiting for the next automatic check")
        )
        // status
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Show the TikTok announcement setup")
        ),

    async execute(interaction) {

        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", ephemeral: true });
        }

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to manage TikTok announcements!", ephemeral: true });
        }

        if (!isTikTokConfigured()) {
            return interaction.reply({
                content: "TikTok isn't configured on the bot yet. The bot owner needs to set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and `TIKTOK_REDIRECT_URI` in the bot's `.env` and restart it.",
                ephemeral: true,
            });
        }

        await executeQuery(`
            INSERT INTO tiktok_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id
        `, [interaction.guild.id]);

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        switch (subcommand) {
            case "connect": return this.connect(interaction);
            case "disconnect": return this.disconnect(interaction);
            case "channel": return this.setChannel(interaction);
            case "role": return this.setRole(interaction);
            case "toggle": return this.toggle(interaction);
            case "message": return this.setMessage(interaction);
            case "test": return this.test(interaction);
            case "check": return this.check(interaction);
            case "status": return this.status(interaction);
        }
    },

    // Step 1 (no URL): hand out a login link. Step 2 (with URL): finish linking.
    // The bot has no web server, so TikTok's redirect page is pasted back here instead.
    async connect(interaction) {
        const guildId = interaction.guild.id;
        const redirectUrl = interaction.options.getString("redirect-url");

        if (!redirectUrl) {
            const state = createOAuthState();
            await executeQuery(`
                UPDATE tiktok_settings SET oauth_state = ?, oauth_state_expires_at = ? WHERE guild_id = ?
            `, [state, Date.now() + OAUTH_STATE_TTL_MS, guildId]);

            return interaction.editReply({
                content: [
                    "**Link the creator's TikTok account**",
                    `1. Open this link (or send it to the creator) and log in with **their** TikTok account: [Connect TikTok](${buildAuthorizeUrl(state)})`,
                    "2. Approve access. TikTok then opens another page — **copy the full address from the browser's address bar**.",
                    "3. Run `/tiktok connect redirect-url:` and paste that address.",
                    "",
                    "-# The link expires in 15 minutes.",
                ].join("\n"),
            });
        }

        let params;
        try {
            params = new URL(redirectUrl.trim()).searchParams;
        } catch {
            return interaction.editReply({ content: "That doesn't look like a web address. Paste the **full** address TikTok redirected you to (it contains `code=`)." });
        }

        if (params.get("error")) {
            return interaction.editReply({ content: `TikTok reported an error: **${params.get("error_description") || params.get("error")}**. Run \`/tiktok connect\` to try again.` });
        }

        const code = params.get("code");
        const state = params.get("state");
        const settings = await getTikTokSettings(guildId);

        if (!code || !state) {
            return interaction.editReply({ content: "That address is missing the `code` from TikTok. Make sure you copied the whole address after approving." });
        }

        if (state !== settings?.oauth_state || Number(settings?.oauth_state_expires_at) < Date.now()) {
            return interaction.editReply({ content: "That login link has expired or belongs to a different request. Run `/tiktok connect` again for a fresh link." });
        }

        try {
            const tokens = await exchangeCode(code);

            const grantedScopes = (tokens.scope || "").split(",");
            if (!grantedScopes.includes("video.list")) {
                return interaction.editReply({ content: "The video access permission wasn't granted, so new uploads can't be detected. Run `/tiktok connect` again and leave all permissions ticked." });
            }

            const user = await fetchUserInfo(tokens.accessToken).catch(() => null);
            // Start from the newest existing video so nothing old gets announced.
            const videos = await fetchRecentVideos(tokens.accessToken, 5).catch(() => []);

            await executeQuery(`
                UPDATE tiktok_settings
                SET open_id = ?, display_name = ?, access_token = ?, access_expires_at = ?,
                    refresh_token = ?, refresh_expires_at = ?, needs_reconnect = FALSE,
                    oauth_state = NULL, oauth_state_expires_at = NULL, last_video_time = ?
                WHERE guild_id = ?
            `, [
                tokens.openId, user?.display_name || null, tokens.accessToken, tokens.accessExpiresAt,
                tokens.refreshToken, tokens.refreshExpiresAt, newestVideoTime(videos), guildId,
            ]);

            const updated = await getTikTokSettings(guildId);
            const nextSteps = [];
            if (!updated.channel_id) nextSteps.push("set a channel with `/tiktok channel`");
            if (!updated.is_enabled) nextSteps.push("turn it on with `/tiktok toggle status:Enable`");

            await interaction.editReply({
                content: `Connected to **${user?.display_name || "TikTok"}**! ✅`
                    + (nextSteps.length ? `\nNext: ${nextSteps.join(", then ")}.` : "\nNew uploads will be announced automatically.")
                    + "\nUse `/tiktok test` to preview an announcement.",
            });

            await sendLogEmbed(
                guildId,
                `**TikTok Connected**\n\nTikTok account **${user?.display_name || tokens.openId}** has been linked for upload announcements.\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.ADD
            );
        } catch (error) {
            console.error(`[TikTok] Connect failed for guild ${guildId}:`, error);
            return interaction.editReply({ content: "TikTok didn't accept that login (codes are single-use and expire quickly). Run `/tiktok connect` to get a fresh link and try again." });
        }
    },

    async disconnect(interaction) {
        const guildId = interaction.guild.id;

        await executeQuery(`
            UPDATE tiktok_settings
            SET is_enabled = FALSE, open_id = NULL, display_name = NULL, access_token = NULL, access_expires_at = NULL,
                refresh_token = NULL, refresh_expires_at = NULL, needs_reconnect = FALSE, oauth_state = NULL
            WHERE guild_id = ?
        `, [guildId]);

        await interaction.editReply({ content: "TikTok account unlinked and announcements turned off." });
        await sendLogEmbed(
            guildId,
            `**TikTok Disconnected**\n\nThe TikTok account has been unlinked and announcements are off.\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.REMOVE
        );
    },

    async setChannel(interaction) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        if (!channel?.isTextBased?.()) {
            return interaction.editReply({ content: "Please pick a text channel." });
        }

        const me = interaction.guild.members.me;
        if (me && !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
            return interaction.editReply({ content: `I need **View Channel**, **Send Messages** and **Embed Links** in ${channel}.` });
        }

        await executeQuery(`UPDATE tiktok_settings SET channel_id = ? WHERE guild_id = ?`, [channel.id, guildId]);
        await interaction.editReply({ content: `New TikToks will be announced in ${channel}.` });
        await sendLogEmbed(
            guildId,
            `**TikTok Settings Updated**\n\nAnnouncement channel set to ${channel}.\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.EDIT
        );
    },

    async setRole(interaction) {
        const guildId = interaction.guild.id;
        const role = interaction.options.getRole("role");

        await executeQuery(`UPDATE tiktok_settings SET role_id = ? WHERE guild_id = ?`, [role?.id || null, guildId]);
        await interaction.editReply({ content: role ? `${role} will be pinged for new TikToks.` : "New TikToks will be announced without a ping." });
        await sendLogEmbed(
            guildId,
            `**TikTok Settings Updated**\n\nPing role ${role ? `set to ${role}` : "removed"}.\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.EDIT
        );
    },

    async toggle(interaction) {
        const guildId = interaction.guild.id;
        const enable = interaction.options.getString("status") === "enable";
        const settings = await getTikTokSettings(guildId);

        if (!enable) {
            await executeQuery(`UPDATE tiktok_settings SET is_enabled = FALSE WHERE guild_id = ?`, [guildId]);
            await interaction.editReply({ content: "TikTok announcements disabled." });
        } else {
            if (!settings.refresh_token || settings.needs_reconnect) {
                return interaction.editReply({ content: "Connect the creator's TikTok first with `/tiktok connect`." });
            }
            if (!settings.channel_id) {
                return interaction.editReply({ content: "Set an announcement channel first with `/tiktok channel`." });
            }

            // Skip anything uploaded while announcements were off, so enabling
            // doesn't flood the channel with old videos.
            const accessToken = await getValidAccessToken(interaction.guild, settings);
            if (!accessToken) {
                return interaction.editReply({ content: "The TikTok connection has expired. Run `/tiktok connect` again." });
            }
            const videos = await fetchRecentVideos(accessToken, 5).catch(() => []);

            await executeQuery(`
                UPDATE tiktok_settings SET is_enabled = TRUE, last_video_time = GREATEST(last_video_time, ?) WHERE guild_id = ?
            `, [newestVideoTime(videos), guildId]);
            await interaction.editReply({ content: `TikTok announcements enabled. New uploads will be posted in <#${settings.channel_id}> (checked every 5 minutes).` });
        }

        await sendLogEmbed(
            guildId,
            `**TikTok Settings Updated**\n\nTikTok announcements ${enable ? "enabled" : "disabled"}.\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.EDIT
        );
    },

    async setMessage(interaction) {
        const guildId = interaction.guild.id;
        const text = interaction.options.getString("text")?.trim() || null;

        await executeQuery(`UPDATE tiktok_settings SET announcement_message = ? WHERE guild_id = ?`, [text, guildId]);
        await interaction.editReply({
            content: `Announcement text ${text ? "updated" : "reset to the default"}:\n> ${text || DEFAULT_ANNOUNCEMENT}\n\nUse \`/tiktok test\` to preview it.`,
        });
        await sendLogEmbed(
            guildId,
            `**TikTok Settings Updated**\n\nAnnouncement text ${text ? `set to:\n> ${text}` : "reset to the default"}\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.EDIT
        );
    },

    // Builds a real announcement from the most recent upload. Doesn't affect which
    // videos count as already announced.
    async test(interaction) {
        const guildId = interaction.guild.id;
        const postToChannel = interaction.options.getBoolean("post") ?? false;
        const settings = await getTikTokSettings(guildId);

        const accessToken = await getValidAccessToken(interaction.guild, settings);
        if (!accessToken) {
            return interaction.editReply({ content: "No working TikTok connection. Run `/tiktok connect` first." });
        }

        const [latest] = await fetchRecentVideos(accessToken, 1);
        if (!latest) {
            return interaction.editReply({ content: "The connected TikTok account has no public videos to preview." });
        }

        const announcement = buildAnnouncement(settings, latest);

        if (!postToChannel) {
            return interaction.editReply({
                ...announcement,
                content: `-# Preview — only you can see this. Use \`post:True\` to send it to the channel.\n${announcement.content || ""}`,
                allowedMentions: { parse: [] },
            });
        }

        if (!settings.channel_id) {
            return interaction.editReply({ content: "Set an announcement channel first with `/tiktok channel`." });
        }
        const channel = await interaction.guild.channels.fetch(settings.channel_id).catch(() => null);
        if (!channel) {
            return interaction.editReply({ content: "The announcement channel no longer exists. Set it again with `/tiktok channel`." });
        }

        await channel.send(announcement);
        await interaction.editReply({ content: `Test announcement posted in ${channel}.` });
    },

    async check(interaction) {
        const settings = await getTikTokSettings(interaction.guild.id);
        if (!settings.is_enabled) {
            return interaction.editReply({ content: "Announcements are disabled. Turn them on with `/tiktok toggle status:Enable`." });
        }

        try {
            const announced = await checkGuildForNewVideos(interaction.client, interaction.guild.id);
            await interaction.editReply({ content: announced ? `Announced ${announced} new TikTok(s).` : "No new TikToks since the last announcement." });
        } catch (error) {
            console.error(`[TikTok] Manual check failed for guild ${interaction.guild.id}:`, error);
            await interaction.editReply({ content: "Checking TikTok failed. Check `/tiktok status` and the bot's console for details." });
        }
    },

    async status(interaction) {
        const s = await getTikTokSettings(interaction.guild.id);
        const time = ms => ms ? `<t:${Math.floor(Number(ms) / 1000)}:R>` : "never";

        let connection = "Not connected";
        if (s.refresh_token && s.needs_reconnect) connection = "⚠ Expired — run `/tiktok connect`";
        else if (s.refresh_token) connection = `✅ ${s.display_name || "Connected"} (login renews automatically until ${time(s.refresh_expires_at)})`;

        const embed = new EmbedBuilder()
            .setTitle("TikTok Announcements")
            .setColor(s.is_enabled ? 0x00C853 : 0x9E9E9E)
            .addFields(
                { name: "Status", value: s.is_enabled ? "Enabled" : "Disabled", inline: true },
                { name: "Channel", value: s.channel_id ? `<#${s.channel_id}>` : "Not set", inline: true },
                { name: "Ping", value: s.role_id ? `<@&${s.role_id}>` : "None", inline: true },
                { name: "Account", value: connection },
                { name: "Last check", value: time(s.last_checked_at), inline: true },
                { name: "Message", value: `> ${s.announcement_message || DEFAULT_ANNOUNCEMENT}` },
            );

        await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    },

    development: false
};
