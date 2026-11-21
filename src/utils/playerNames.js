import { executeQuery } from "../database.js";

// Team tag every roster name starts with (e.g. "6pmFESTINA").
const TEAM_NAME_PREFIX = "6pm";

// "6pmFESTINA" -> "Festina", "6pmSpookTikkaMasala" -> "SpookTikkaMasala".
// All-caps names are tidied to capitalised; mixed-case names are kept as written.
export function cleanPlayerName(name) {
    if (!name) return name;
    const stripped = name.trim().replace(new RegExp(`^${TEAM_NAME_PREFIX}[\\s_-]*`, "i"), "") || name.trim();
    const isAllCaps = stripped === stripped.toUpperCase() && stripped !== stripped.toLowerCase();
    return isAllCaps ? stripped.charAt(0) + stripped.slice(1).toLowerCase() : stripped;
}

// Name as shown on the roster: always starts with the team tag, never doubled.
// "Tetro" -> "6pmTetro", "6pmTetro" / "6PMTetro" / "6pm Tetro" -> kept as written.
export function withTeamTag(name) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return trimmed;
    return trimmed.toLowerCase().startsWith(TEAM_NAME_PREFIX.toLowerCase()) ? trimmed : `${TEAM_NAME_PREFIX}${trimmed}`;
}

// Resolves user IDs to readable names for log messages. Mentions inside embeds show
// as raw <@id> when the viewer's client hasn't cached that user, so logs use plain
// names instead: roster name first, then server nickname, then username.
export async function getPlayerNames(guild, userIds) {
    const ids = [...new Set(userIds.map(String))];
    const names = new Map();
    if (ids.length === 0) return names;

    // Player profile name first (it is what players set with /profile and also
    // covers former players), then the roster, then Discord names.
    const placeholders = ids.map(() => "?").join(", ");
    for (const table of ["player_profiles", "roster"]) {
        if (ids.every(id => names.has(id))) break;
        const rows = await executeQuery(
            `SELECT discord_id, player_name FROM ${table} WHERE guild_id = ? AND discord_id IN (${placeholders})`,
            [guild.id, ...ids]
        ).catch(() => []);
        for (const row of rows) {
            const id = String(row.discord_id);
            if (row.player_name && !names.has(id)) names.set(id, cleanPlayerName(row.player_name));
        }
    }

    for (const id of ids) {
        if (names.has(id)) continue;
        const member = await guild.members.fetch(id).catch(() => null);
        if (member) {
            names.set(id, cleanPlayerName(member.displayName));
            continue;
        }
        const user = await guild.client.users.fetch(id).catch(() => null);
        names.set(id, user ? cleanPlayerName(user.globalName || user.username) : `<@${id}>`);
    }

    return names;
}

// "Festina, Tetro, Alana"
export async function formatPlayerList(guild, userIds) {
    const names = await getPlayerNames(guild, userIds);
    return userIds.map(id => names.get(String(id))).join(", ");
}
