import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import client from "../index.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { getPlayerNames } from "./playerNames.js";

export async function sendLogEmbed(guildId, logMessage, embedColour = COLOUR_VALUES.DEFAULT) {

    if (!guildId || typeof guildId !== "string") {
        console.error("Error sending log: guildId is invalid or missing.");
        return;
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const serverName = guild ? guild.name : "Unknown Server";

    try {

        // 🔹 Fetch stored log channel ID
        const logRows = await executeQuery(`
            SELECT channel_id FROM log_settings WHERE guild_id = ?
        `, [guildId]);

        if (!logRows.length || !logRows[0]?.channel_id) {
            console.log(`No log settings found for server: ${serverName} ID: ${guildId}`);
            return;
        }

        const logChannelId = logRows[0].channel_id;
        
        try {

            const logChannel = await client.channels.fetch(logChannelId).catch(err => {
                console.error(`Failed to fetch log channel for ${serverName} (ID: ${guildId})`, err);
                return null;
            });

            // 🔹 Check if the channel exists
            // if an ID exists in db set it to null
            // as this channel no longer exists
            if (!logChannel) {
                console.log(`Log channel not found for server: ${serverName} ID: ${guildId}`);
                await executeQuery(`
                    UPDATE log_settings SET channel_id = NULL WHERE guild_id = ?
                    `, [guildId]);
                return;
            }

            // 🔹 Show people by roster name (6pm prefix removed) instead of mentions,
            // which appear as raw IDs for anyone whose client hasn't cached that user.
            // Role (<@&id>) and channel (<#id>) mentions are left as they are.
            const userMention = /<@!?(\d{15,25})>/g;
            const mentionedIds = [...logMessage.matchAll(userMention)].map(match => match[1]);
            if (guild && mentionedIds.length) {
                const names = await getPlayerNames(guild, mentionedIds);
                logMessage = logMessage.replace(userMention, (mention, id) => names.get(id) || mention);
            }

            // 🔹 Create the embed
            const logEmbed = new EmbedBuilder()
                .setTitle("Team Manager Log")
                .setColor(embedColour)
                .setDescription(logMessage.slice(0, 4096))
                .setFooter({ text: `Logged at ${new Date().toLocaleString()}` });

            await logChannel.send({ embeds: [logEmbed] });

        } catch (error) {
            console.error(`Failed to fetch log channel for server: ${serverName} ID: ${guildId}`, error);
            return;
        }

    } catch (error) {
        console.error(`Error sending log embed for server: ${serverName} ID: ${guildId}`, error);
    }
}

// Readable explanations for the Discord API errors background jobs usually hit.
const DISCORD_ERROR_HINTS = {
    10003: "The channel no longer exists.",
    10008: "The message no longer exists.",
    50001: "I can't see that channel (missing access).",
    50013: "I'm missing permissions in that channel.",
};

const FAILURE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastFailureAlert = new Map();

// Posts a ⚠ to the guild's logs channel when a scheduled job fails (scrim posts,
// schedule announcements, TikTok checks...), which otherwise only shows in the
// console. Each guild + job alerts at most once every 6 hours so a persistent
// problem doesn't flood the channel.
export async function reportJobFailure(guildId, job, problem) {
    const key = `${guildId}:${job}`;
    if (Date.now() - (lastFailureAlert.get(key) || 0) < FAILURE_ALERT_COOLDOWN_MS) return;
    lastFailureAlert.set(key, Date.now());

    const reason = problem instanceof Error
        ? (DISCORD_ERROR_HINTS[problem.code] || problem.message)
        : String(problem);

    await sendLogEmbed(
        guildId,
        `**⚠ ${job} failed**\n\n${reason}\n\n-# Further failures of this job are muted for 6 hours. Run \`/setup status\` to check the setup.`.slice(0, 4000),
        COLOUR_VALUES.WARNING
    );
}
