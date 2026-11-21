import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { cleanPlayerName } from "./playerNames.js";

// Player profiles. The player_profiles row holds identity only (name, flag, rank,
// active/former, join date); every stat is computed on demand from the tables
// that already record it, so profiles can never drift out of sync:
//   games / wins / points  -> player_activity (current season) + player_activity_archive
//   tournaments / winnings -> earnings_players + earnings + earnings_payouts
//   scheduled events       -> player_event_history (filled before events are deleted)

const LEVEL_LABELS = { owner: "Owner", leader: "Leader", elite: "Elite Member", member: "Member" };

// Creates the profile, or reactivates and refreshes an existing (former) one so a
// returning player keeps their history. joined_at keeps the original join date.
export async function upsertProfile(guildId, discordId, { playerName, flagEmoji, memberLevel }) {
    await executeQuery(`
        INSERT INTO player_profiles (guild_id, discord_id, player_name, flag_emoji, member_level, status)
        VALUES (?, ?, ?, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE
            player_name = VALUES(player_name),
            flag_emoji = VALUES(flag_emoji),
            member_level = VALUES(member_level),
            status = 'active',
            left_at = NULL;
    `, [guildId, String(discordId), playerName, flagEmoji || "", memberLevel || "member"]);
}

// Mirrors a /roster edit onto the profile (field is a roster column name).
export async function syncProfileField(guildId, discordId, field, value) {
    if (!["player_name", "flag_emoji", "member_level"].includes(field)) return;
    await executeQuery(
        `UPDATE player_profiles SET ${field} = ? WHERE guild_id = ? AND discord_id = ?`,
        [value, guildId, String(discordId)]
    );
    if (field === "player_name") {
        await executeQuery(
            `UPDATE scrim_availability SET display_name = ? WHERE guild_id = ? AND user_id = ?`,
            [cleanPlayerName(value), guildId, String(discordId)]
        );
    }
}

// Keeps the profile but marks the player as having left the roster.
export async function markProfilesFormer(guildId, discordIds) {
    const ids = discordIds.map(String);
    if (!ids.length) return;
    await executeQuery(
        `UPDATE player_profiles SET status = 'former', left_at = NOW()
         WHERE guild_id = ? AND status = 'active' AND discord_id IN (${ids.map(() => "?").join(", ")})`,
        [guildId, ...ids]
    );
}

// Copies confirmed players of finished schedule events into player_event_history.
// Call this BEFORE the events are deleted. Cancelled events are not counted.
// events: rows from {team}_schedule with id, event_name, event_date, participants, status.
export async function recordEventAttendance(guildId, team, events) {
    const rows = [];
    for (const event of events) {
        if (event.status === "cancelled" || !event.participants) continue;
        const ids = [...new Set(String(event.participants).split(",").map(s => s.trim()).filter(Boolean))];
        for (const userId of ids) {
            rows.push([guildId, team, event.id, userId, event.event_name ?? null, event.event_date ?? null]);
        }
    }
    if (!rows.length) return 0;

    await executeQuery(
        `INSERT IGNORE INTO player_event_history (guild_id, team, event_id, user_id, event_name, event_date)
         VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        rows.flat()
    );
    return rows.length;
}

export async function getProfile(guildId, discordId) {
    const [profile] = await executeQuery(
        `SELECT * FROM player_profiles WHERE guild_id = ? AND discord_id = ?`,
        [guildId, String(discordId)]
    );
    return profile ?? null;
}

// Gathers every stat for one player. All numbers come back as JS numbers.
export async function getProfileStats(guildId, discordId) {
    const id = String(discordId);

    const [current] = await executeQuery(
        `SELECT games_played, wins, total_points FROM player_activity WHERE guild_id = ? AND user_id = ?`,
        [guildId, id]
    );

    const [archived] = await executeQuery(`
        SELECT COUNT(*) AS seasons,
               COALESCE(SUM(games_played), 0) AS games_played,
               COALESCE(SUM(wins), 0) AS wins,
               COALESCE(SUM(total_points), 0) AS total_points
        FROM player_activity_archive WHERE guild_id = ? AND user_id = ?
    `, [guildId, id]);

    const [tournaments] = await executeQuery(`
        SELECT COUNT(DISTINCT e.id) AS events,
               MIN(CAST(e.result AS UNSIGNED)) AS best_result,
               COUNT(DISTINCT CASE WHEN CAST(e.result AS UNSIGNED) = 1 THEN e.id END) AS first_places
        FROM earnings_players ep
        JOIN earnings e ON e.id = ep.earning_id AND e.guild_id = ep.guild_id
        WHERE ep.guild_id = ? AND ep.player_id = ?
    `, [guildId, id]);

    const [payouts] = await executeQuery(
        `SELECT COALESCE(SUM(player_split_amount), 0) AS total FROM earnings_payouts WHERE guild_id = ? AND player_id = ?`,
        [guildId, id]
    );

    const scheduled = await executeQuery(
        `SELECT team, COUNT(*) AS events FROM player_event_history WHERE guild_id = ? AND user_id = ? GROUP BY team`,
        [guildId, id]
    );

    const n = v => Number(v) || 0;
    const season = {
        games: n(current?.games_played),
        wins: n(current?.wins),
        points: n(current?.total_points),
    };
    const allTime = {
        games: season.games + n(archived?.games_played),
        wins: season.wins + n(archived?.wins),
        points: season.points + n(archived?.total_points),
        seasons: n(archived?.seasons),
    };
    const scheduledByTeam = Object.fromEntries(scheduled.map(r => [r.team, n(r.events)]));

    return {
        season,
        allTime,
        tournaments: {
            events: n(tournaments?.events),
            bestResult: n(tournaments?.best_result) || null,
            firstPlaces: n(tournaments?.first_places),
            winnings: n(payouts?.total),
        },
        scheduled: {
            total: Object.values(scheduledByTeam).reduce((a, b) => a + b, 0),
            byTeam: scheduledByTeam,
        },
    };
}

function record({ games, wins }) {
    const losses = Math.max(games - wins, 0);
    const rate = games > 0 ? `${Math.round((wins / games) * 100)}%` : "—";
    return `Games: **${games}**\nWins: **${wins}**\nLosses: **${losses}**\nWin Rate: **${rate}**`;
}

function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function buildProfileEmbed(profile, stats, user) {
    const name = cleanPlayerName(profile.player_name) || user?.username || "Unknown player";
    const unix = value => value ? Math.floor(new Date(value).getTime() / 1000) : null;
    const joinedUnix = unix(profile.joined_at);
    const leftUnix = unix(profile.left_at);
    const isFormer = profile.status === "former";

    const infoLines = [
        `Rank: **${LEVEL_LABELS[profile.member_level] || "Member"}**`,
        `Status: **${isFormer ? "Former player" : "Active"}**`,
    ];
    if (joinedUnix) infoLines.push(`Joined: <t:${joinedUnix}:D>`);
    if (isFormer && leftUnix) infoLines.push(`Left: <t:${leftUnix}:D>`);

    const { allTime, tournaments: t, scheduled } = stats;
    const tournamentLines = [
        `Events: **${t.events}**`,
        `Best Placement: **${t.bestResult ? ordinal(t.bestResult) : "—"}**`,
        `1st Places: **${t.firstPlaces}**`,
        `Winnings Paid: **€${t.winnings.toFixed(2)}**`,
    ];

    const teamLabels = { mixed: "Mixed", female: "Female", clan: "Clan" };
    const scheduleLines = [`Attended: **${scheduled.total}**`];
    for (const [team, label] of Object.entries(teamLabels)) {
        if (scheduled.byTeam[team]) scheduleLines.push(`${label}: **${scheduled.byTeam[team]}**`);
    }

    const embed = new EmbedBuilder()
        .setTitle(`${profile.flag_emoji ? `${profile.flag_emoji} ` : ""}${name}`)
        .setColor(isFormer ? 0x808080 : 0xFFFFFF)
        .setDescription(infoLines.join("\n"))
        .addFields(
            // Stats = every season combined (archived seasons + the current one).
            { name: "Stats", value: `${record(allTime)}\nPoints: **${allTime.points}**`, inline: true },
            { name: "Tournaments", value: tournamentLines.join("\n"), inline: true },
            { name: "Scheduled Events", value: scheduleLines.join("\n"), inline: true },
        )
        .setFooter({ text: "Player Profile" })
        .setTimestamp();

    const avatar = user?.displayAvatarURL?.({ size: 256 });
    if (avatar) embed.setThumbnail(avatar);
    return embed;
}
