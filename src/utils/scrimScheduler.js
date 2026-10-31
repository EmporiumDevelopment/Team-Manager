import cron from "node-cron";
import { executeQuery } from "../database.js";
import { renderScrimMessage, clearScrimAvailability } from "./scrimAvailability.js";
import { reportJobFailure } from "./logger.js";

const TIMEZONE = "Europe/London";
const TEAM_LABELS = { mixed: "Mixed", female: "Female", clan: "Clan" };

// Clears each *enabled* guild's scrim channel. Previously only the first guild's
// `is_enabled` flag was checked, and it gated every guild at once; now the toggle
// is respected per guild. Sequential awaits keep us clear of rate limits.
async function clearScrimChannels(client, rows, label) {
    for (const { guild_id, channel_id, is_enabled } of rows) {
        if (!is_enabled) continue;

        const guild = await client.guilds.fetch(guild_id).catch(() => null);
        if (!guild) continue;

        const job = `${label} scrim channel clear`;
        const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);
        if (!scrimChannel) {
            await reportJobFailure(guild_id, job, "The scrim channel no longer exists. Set it again with `/scrim channel`.");
            continue;
        }

        try {
            const messages = await scrimChannel.messages.fetch({ limit: 100 });
            await scrimChannel.bulkDelete(messages, true);
            console.log(`[${guild.name} | ${guild.id}] ${label} scrim channel cleared.`);
        } catch (error) {
            console.error(`[${guild.name} | ${guild.id}] Error clearing ${label} scrim channel:`, error);
            await reportJobFailure(guild_id, job, error);
        }
    }
}

export function scheduleScrims(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot schedule scrims.");
        return;
    }

    console.log("Scrim scheduler initialized.");

    // 🔹 Clear Mixed & Clan scrim channels at 3 AM for every server
    cron.schedule('0 3 * * *', async () => {

        console.log("Starting scheduled Mixed/Clan scrim channel clear...");

        const mixedScrimSettings = await executeQuery(`SELECT guild_id, channel_id, is_enabled FROM mixed_scrim_settings`);
        const clanScrimSettings = await executeQuery(`SELECT guild_id, channel_id, is_enabled FROM clan_scrim_settings`);

        await clearScrimChannels(client, mixedScrimSettings, "Mixed");
        await clearScrimChannels(client, clanScrimSettings, "Clan");
    }, {
        timezone: TIMEZONE
    });

    cron.schedule('59 23 * * *', async () => {
        console.log("Starting scheduled Female scrim channel clear...");

        const femaleScrimSettings = await executeQuery(`SELECT guild_id, channel_id, is_enabled FROM female_scrim_settings`);

        await clearScrimChannels(client, femaleScrimSettings, "Female");
    }, {
        timezone: TIMEZONE
    });

    // Send Mixed & Clan scrim availability embeds at 7am. Each function only posts
    // to guilds that have that scrim type enabled (per-guild is_enabled check).
    cron.schedule('0 7 * * *', async () => {
        await sendScrimEmbedMixed(client);
        await sendScrimEmbedClan(client);
    }, {
        timezone: TIMEZONE
    });

    // send female scrim availability embed at 12am (self-filters by is_enabled)
    cron.schedule('0 0 * * *', async () => {
        await sendScrimEmbedFemale(client);
    }, {
        timezone: TIMEZONE
    });
}

// Posts a fresh scrim availability message (with buttons) to every enabled guild for
// the given team. Availability is tracked in the DB and rendered from there, so the
// three teams share one implementation.
async function sendScrimEmbeds(client, team) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot send scrim embed.");
        return;
    }

    const rows = await executeQuery(
        `SELECT guild_id, channel_id, is_enabled, embed_title, role_id, message_id FROM ${team}_scrim_settings`
    );

    for (const { guild_id, channel_id, is_enabled, embed_title, role_id, message_id: previousMessageId } of rows) {

        if (!is_enabled) continue; // respect this guild's toggle

        const guild = await client.guilds.fetch(guild_id).catch(() => null);
        if (!guild) continue;

        const job = `${TEAM_LABELS[team]} scrim availability post`;
        const scrimChannel = channel_id ? await client.channels.fetch(channel_id).catch(() => null) : null;
        if (!scrimChannel) {
            await reportJobFailure(guild_id, job, channel_id
                ? "The scrim channel no longer exists. Set it again with `/scrim channel`."
                : "Scrims are enabled but no channel is set. Use `/scrim channel`.");
            continue;
        }

        const roleMention = role_id ? `<@&${role_id}>` : "";

        try {
            const message = await scrimChannel.send(await renderScrimMessage(guild_id, null, {
                title: embed_title || "Scrim Availability",
            }));

            await executeQuery(
                `INSERT INTO ${team}_scrim_settings (guild_id, message_id) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);`,
                [guild_id, message.id]
            );

            // Drop the previous message's availability so the table doesn't grow forever.
            if (previousMessageId && previousMessageId !== message.id) {
                await clearScrimAvailability(previousMessageId);
            }

            if (roleMention) {
                await scrimChannel.send(roleMention);
            }

            console.log(`[${guild.name} | ${guild.id}] ${team} scrim embed sent.`);
        } catch (error) {
            console.error(`[${guild.name} | ${guild.id}] Error sending ${team} scrim embed:`, error);
            await reportJobFailure(guild_id, job, error);
        }
    }
}

export const sendScrimEmbedMixed = (client) => sendScrimEmbeds(client, "mixed");
export const sendScrimEmbedFemale = (client) => sendScrimEmbeds(client, "female");
export const sendScrimEmbedClan = (client) => sendScrimEmbeds(client, "clan");
