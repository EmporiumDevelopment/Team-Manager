import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import client from "../index.js";
import colourMap from "./colourMap.js";

export async function sendLogEmbed(guildId, logMessage, action = "default") {

    if (!guildId || typeof guildId !== "string") {
        console.error("Error: guildId is invalid or missing.");
        return;
    }

    const guild = await client.guilds.fetch(guildId);
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

            const logChannel = await client.channels.fetch(logChannelId);
            // 🔹 Check if the channel exists
            // if an ID exists in db set it to null
            // as this channel no longer exists
            if (!logChannel) {
                console.log(`Log channel not found for server: ${serverName} ID: ${guildId}`);
                await executeQuery(`UPDATE log_settings SET channel_id = NULL WHERE guild_id = ?`, [guildId]);
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
            console.error(`Failed to fetch log channel for server: ${serverName} ID: ${guildId}`, error);
            return;
        }

    } catch (error) {
        console.error(`Error sending log embed for server: ${serverName} ID: ${guildId}`, error);
    }
}