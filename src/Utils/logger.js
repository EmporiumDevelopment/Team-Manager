import { EmbedBuilder } from "discord.js";
import db from "../database.js";
import client from "../index.js";
import colourMap from "./colourMap.js";

export async function sendLogEmbed(guildId, logMessage, action = "default") {
    try {

        if (!guildId || typeof guildId !== "string") {
            console.error("Error: guildId is invalid or missing.");
            return;
        }

        // 🔹 Fetch stored log channel ID
        const [logRows] = await db.execute(`
            SELECT channel_id FROM log_settings WHERE guild_id = ?
        `, [guildId]);

        if (!logRows.length || !logRows[0].channel_id) {
            console.log("Log channel not set—skipping log embed.");
            return;
        }

        const logChannelId = logRows[0].channel_id;

        const logChannel = await client.channels.fetch(logChannelId);
        if (!logChannel) {
            console.log("Log channel not found on Discord—skipping embed.");
            return;
        }

        // 🔹 Create the embed
        const logEmbed = new EmbedBuilder()
            .setTitle("Team Manager Log")
            .setColor(colourMap[action])
            .setDescription(logMessage)
            .setFooter({ text: `Logged at ${new Date().toLocaleString()}` });

        await logChannel.send({ embeds: [logEmbed] });

    } catch (error) {
        console.error("Error sending log embed:", error);
    }
}