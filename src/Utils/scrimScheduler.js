import cron from "node-cron";
import db from "../database.js";
import { EmbedBuilder } from "discord.js";

const TIMEZONE = "Europe/London"; // Adjust if necessary

export function scheduleScrims(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot schedule scrims.");
        return;
    }

    console.log("Scrim scheduler initialized.");

    // 🔹 Clear Scrim Channels at 3 AM for Every Server
    cron.schedule('0 3 * * *', async () => {
        console.log("Starting scheduled scrim channel clear...");

        const [guildRows] = await db.execute(`SELECT guild_id, channel_id FROM scrim_settings`);
        
        guildRows.forEach(async ({ guild_id, channel_id }) => {
            const guild = await client.guilds.fetch(guild_id).catch(() => null);
            if (!guild) return;

            const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);
            if (!scrimChannel) return;

            try {
                const messages = await scrimChannel.messages.fetch({ limit: 100 });
                await scrimChannel.bulkDelete(messages, true);
                console.log(`[${guild.name} | ${guild.id}] Scrim channel cleared at 3 AM.`);
            } catch (error) {
                console.error(`[${guild.name} | ${guild.id}] Error clearing scrim channel:`, error);
            }
        });
    }, {
        timezone: TIMEZONE
    });

    cron.schedule('0 7 * * *', async () => {
        console.log("Starting scheduled scrim embed posting...");

        this.sendScrimEmbed(client);
    }, {
        timezone: TIMEZONE
    });
}

export async function sendScrimEmbed(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot send scrim embed.");
        return;
    }

    const [guildRows] = await db.execute(`SELECT guild_id, channel_id FROM scrim_settings`);
        
        guildRows.forEach(async ({ guild_id, channel_id }) => {
            const guild = await client.guilds.fetch(guild_id).catch(() => null);
            if (!guild) return;

            const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);
            if (!scrimChannel) return;

            const [emojiRows] = await db.execute(`SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?`, [guild_id]);
            if (!emojiRows.length) return;

            const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

            const [titleRows] = await db.execute(`SELECT embed_title FROM scrim_settings WHERE guild_id = ?`, [guild_id]);
            const embedTitle = (titleRows.length > 0 && titleRows[0].embed_title) ? titleRows[0].embed_title : "Scrim Availability";

            const [roleRows] = await db.execute(`SELECT role_id FROM scrim_settings WHERE guild_id = ?`, [guild_id]);
            const roleId = (roleRows.length > 0 && roleRows[0].role_id) ? roleRows[0].role_id : null;

            const roleMention = roleId ? `<@&${roleId}>` : "";

            try {
                const embed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setDescription("React to the time slots you can play.")
                    .setColor(0x00AAFF)
                    .addFields(
                        { name: `${emoji_16} Players`, value: "No players", inline: true },
                        { name: `${emoji_20} Players`, value: "No players", inline: true },
                        { name: `${emoji_23} Players`, value: "No players", inline: true }
                    );

                const embedMessage = await scrimChannel.send({ embeds: [embed] });

                await db.execute(`
                    INSERT INTO channels (guild_id, scrim_message_id) VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE scrim_message_id = VALUES(scrim_message_id);
                `, [guild_id, embedMessage.id]);

                await embedMessage.react(emoji_16);
                await embedMessage.react(emoji_20);
                await embedMessage.react(emoji_23);

                if (roleMention) {
                    await scrimChannel.send(roleMention);
                }

                console.log(`[${guild.name} | ${guild.id}] Scrim embed sent at 7 AM.`);
            } catch (error) {
                console.error(`[${guild.name} | ${guild.id}] Error sending scrim embed:`, error);
            }
        });
}