import { EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { isTikTokConfigured } from "../utils/tiktok/tiktokApi.js";

const TEAMS = ["mixed", "female", "clan"];
const TEAM_LABELS = { mixed: "Mixed", female: "Female", clan: "Clan" };

// Permissions the bot needs in any channel it posts embeds to.
const POSTING_PERMISSIONS = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
];

export default {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Overview of the bot's setup in this server")
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Show which features are set up, and anything that needs fixing")
        ),

    async execute(interaction) {

        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to view the bot setup!", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const check = channelChecker(guild);
        const problems = [];
        const note = async (label, channelId, fixCommand) => {
            const result = await check(channelId);
            if (result.problem) problems.push(`${label}: ${result.problem} → \`${fixCommand}\``);
            return result.text;
        };

        const logs = await settingsRow("log_settings", guild.id);
        const roster = await settingsRow("roster_settings", guild.id);
        const activity = await settingsRow("player_activity_settings", guild.id);
        const earnings = await settingsRow("earnings_settings", guild.id);
        const socials = await settingsRow("social_media_settings", guild.id);
        const tiktok = await settingsRow("tiktok_settings", guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`Bot setup — ${guild.name}`.slice(0, 256))
            .setColor(0x5865F2)
            .setTimestamp();

        // Logs
        embed.addFields({ name: "📝 Logs", value: await note("Logs", logs?.channel_id, "/logs channel") });

        // Roster
        const rosterRoles = ["owner", "leader", "elite", "member"].filter(level => roster?.[`${level}_role_id`]).length;
        embed.addFields({
            name: "👥 Roster",
            value: [
                await note("Roster", roster?.channel_id, "/roster channel"),
                `Auto-roles: ${rosterRoles === 4 ? "✅ all 4 set" : `${rosterRoles}/4 set → \`/roster role\``}`,
            ].join("\n"),
        });

        // Scrim availability, one line per team
        const scrimLines = [];
        for (const team of TEAMS) {
            const row = await settingsRow(`${team}_scrim_settings`, guild.id);
            const enabled = row?.is_enabled ? "🟢 On" : "⚪ Off";
            const ping = row?.role_id ? ` · pings <@&${row.role_id}>` : "";
            scrimLines.push(`**${TEAM_LABELS[team]}:** ${enabled} · ${await note(`${TEAM_LABELS[team]} scrims`, row?.channel_id, "/scrim channel")}${ping}`);
        }
        embed.addFields({ name: "🎯 Scrim availability", value: scrimLines.join("\n") });

        // Schedule, one line per team
        const scheduleLines = [];
        for (const team of TEAMS) {
            const row = await settingsRow(`${team}_schedule_settings`, guild.id);
            const schedule = await note(`${TEAM_LABELS[team]} schedule`, row?.schedule_channel_id, "/schedule channel type:Schedule");
            const announcements = await note(`${TEAM_LABELS[team]} announcements`, row?.announcements_channel_id, "/schedule channel type:Announcements");
            scheduleLines.push(`**${TEAM_LABELS[team]}:** schedule ${schedule} · announcements ${announcements}`);
        }
        embed.addFields({ name: "📅 Schedule", value: scheduleLines.join("\n").slice(0, 1024) });

        // Single-channel modules
        embed.addFields(
            { name: "📊 Activity", value: await note("Activity", activity?.channel_id, "/activity channel"), inline: true },
            { name: "💰 Earnings", value: await note("Earnings", earnings?.channel_id, "/earnings channel"), inline: true },
            { name: "📱 Socials", value: await note("Socials", socials?.channel_id, "/socials channel"), inline: true },
        );

        // TikTok
        let tiktokText;
        if (!isTikTokConfigured()) {
            tiktokText = "⚪ Not configured on the bot (TikTok keys missing from `.env`)";
        } else if (!tiktok?.refresh_token) {
            tiktokText = "❌ Not connected → `/tiktok connect`";
        } else if (tiktok.needs_reconnect) {
            tiktokText = "⚠ Connection expired → `/tiktok connect`";
            problems.push("TikTok: connection expired → `/tiktok connect`");
        } else {
            tiktokText = [
                `${tiktok.is_enabled ? "🟢 On" : "⚪ Off"} · ${tiktok.display_name || "Connected"}`,
                `Channel: ${await note("TikTok", tiktok.channel_id, "/tiktok channel")}`,
            ].join("\n");
        }
        embed.addFields({ name: "🎬 TikTok", value: tiktokText });

        embed.setDescription(problems.length
            ? `**⚠ ${problems.length} thing(s) need attention:**\n${problems.map(p => `• ${p}`).join("\n")}`.slice(0, 4096)
            : "✅ Everything that's set up is working.");

        await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    },

    development: false
};

async function settingsRow(table, guildId) {
    try {
        const rows = await executeQuery(`SELECT * FROM ${table} WHERE guild_id = ?`, [guildId]);
        return rows[0] || null;
    } catch (error) {
        console.error(`[setup status] Failed to read ${table} for guild ${guildId}:`, error);
        return null;
    }
}

// Describes a configured channel: not set, deleted, missing permissions, or fine.
// "problem" is only set for things an admin needs to fix.
function channelChecker(guild) {
    const me = guild.members.me;
    return async (channelId) => {
        if (!channelId) return { text: "❌ Not set" };

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return { text: "⚠ Channel deleted", problem: "saved channel was deleted" };

        if (me && !channel.permissionsFor(me)?.has(POSTING_PERMISSIONS)) {
            return { text: `⚠ ${channel} (can't post)`, problem: `I can't post in ${channel} (need View Channel, Send Messages, Embed Links)` };
        }

        return { text: `✅ ${channel}` };
    };
}
