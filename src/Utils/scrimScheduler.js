import cron from "node-cron";
import { executeQuery } from "../database.js";
import { EmbedBuilder } from "discord.js";

const TIMEZONE = "Europe/London";

export function scheduleScrims(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot schedule scrims.");
        return;
    }

    console.log("Scrim scheduler initialized.");

    // 🔹 Clear Mixed & Female scrim channels at 3 AM for every server
    cron.schedule('0 3 * * *', async () => {
        console.log("Starting scheduled scrim channel clear...");

        // mixed scrims
        const guildMixedRows = await executeQuery(`SELECT guild_id, channel_id FROM mixed_scrim_settings`);
        
        // clear mixed scrim channels
        guildMixedRows.forEach(async ({ guild_id, channel_id }) => {
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

    cron.schedule('59 23 * * *', async () => {
        console.log("Starting scheduled scrim channel clear...");

        const guildFemaleRows = await executeQuery(`SELECT guild_id, channel_id FROM female_scrim_settings`);

        // clear female scrim channels
        guildFemaleRows.forEach(async ({ guild_id, channel_id }) => {
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

    // Send scrim availability embed at 7am for every server
    cron.schedule('0 7 * * *', async () => {

        sendScrimEmbedMixed(client);
        sendScrimEmbedClan(client);

    }, {
        timezone: TIMEZONE
    });

    // send female scrim availability embed at 12am for every server
    cron.schedule('0 0 * * *', async () => {
        
        sendScrimEmbedFemale(client);
        
    }, {
        timezone: TIMEZONE
    });
}

export async function sendScrimEmbedMixed(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot send scrim embed.");
        return;
    }

    const mixedGuildRows = await executeQuery(`SELECT guild_id, channel_id FROM mixed_scrim_settings`);
        
    // send mixed scrim availability
    for (const { guild_id, channel_id } of mixedGuildRows) {

        const guild = await client.guilds.fetch(guild_id).catch(() => null);

        if (!guild) continue;

        const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);

        // channel not setup
        if (!scrimChannel) continue;

        const emojiRows = await executeQuery(`
            SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
        `, [guild_id]);

        // reaction emojis not setup
        if (!emojiRows.length) continue;

        const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

        // get mention role
        const roleRows = await executeQuery(`
            SELECT role_id FROM mixed_scrim_settings WHERE guild_id = ?
            `, [guild.id]);

        const roleId = (roleRows.length > 0 && roleRows[0].role_id) ? roleRows[0].role_id : null;

        const roleMention = roleId ? `<@&${roleId}>` : "";

        try {
            const embed = new EmbedBuilder()
                .setTitle("Scrim Availability")
                .setDescription("React to the time slots you can play.")
                .setColor(0x00AAFF)
                .addFields(
                    { name: `${emoji_16} Players`, value: "No players", inline: true },
                    { name: `${emoji_20} Players`, value: "No players", inline: true },
                    { name: `${emoji_23} Players`, value: "No players", inline: true }
                );

            const embedMessage = await scrimChannel.send({ embeds: [embed] });

            await executeQuery(`
                INSERT INTO mixed_scrim_settings (guild_id, message_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);
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
    }
}

export async function sendScrimEmbedFemale(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot send scrim embed.");
        return;
    }

    const femaleGuildRows = await executeQuery(`SELECT guild_id, channel_id FROM female_scrim_settings`);
        
    // send female scrim availability
    for (const { guild_id, channel_id } of femaleGuildRows) {

        const guild = await client.guilds.fetch(guild_id).catch(() => null);

        if (!guild) continue;

        const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);

        // channel not setup
        if (!scrimChannel) continue;

        const emojiRows = await executeQuery(`
            SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
        `, [guild_id]);

        // reaction emojis not setup
        if (!emojiRows.length) continue;

        const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

        // get mention role
        const roleRows = await executeQuery(`
            SELECT role_id FROM female_scrim_settings WHERE guild_id = ?
            `, [guild.id]);

        const roleId = (roleRows.length > 0 && roleRows[0].role_id) ? roleRows[0].role_id : null;

        const roleMention = roleId ? `<@&${roleId}>` : "";

        try {
            const embed = new EmbedBuilder()
                .setTitle("Scrim Availability")
                .setDescription("React to the time slots you can play.")
                .setColor(0x00AAFF)
                .addFields(
                    { name: `${emoji_16} Players`, value: "No players", inline: true },
                    { name: `${emoji_20} Players`, value: "No players", inline: true },
                    { name: `${emoji_23} Players`, value: "No players", inline: true }
                );

            const embedMessage = await scrimChannel.send({ embeds: [embed] });

            await executeQuery(`
                INSERT INTO female_scrim_settings (guild_id, message_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);
            `, [guild_id, embedMessage.id]);

            await embedMessage.react(emoji_16);
            await embedMessage.react(emoji_20);
            await embedMessage.react(emoji_23);

            if (roleMention) {
                await scrimChannel.send(roleMention);
            }

            console.log(`[${guild.name} | ${guild.id}] Scrim embed sent at 12AM.`);
        } catch (error) {
            console.error(`[${guild.name} | ${guild.id}] Error sending scrim embed:`, error);
        }
    }
}

export async function sendScrimEmbedClan(client) {

    if (!client) {
        console.error("Error: Bot client is undefined. Cannot send scrim embed.");
        return;
    }

    const clanScrimSettings = await executeQuery(`SELECT guild_id, channel_id FROM clan_scrim_settings`);
        
    // send female scrim availability
    for (const { guild_id, channel_id } of clanScrimSettings) {

        const guild = await client.guilds.fetch(guild_id).catch(() => null);

        if (!guild) continue;

        const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);

        // channel not setup
        if (!scrimChannel) continue;

        const emojiRows = await executeQuery(`
            SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
        `, [guild_id]);

        // reaction emojis not setup
        if (!emojiRows.length) continue;

        const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

        // get mention role
        const roleRows = await executeQuery(`
            SELECT role_id FROM clan_scrim_settings WHERE guild_id = ?
            `, [guild.id]);

        const roleId = (roleRows.length > 0 && roleRows[0].role_id) ? roleRows[0].role_id : null;

        const roleMention = roleId ? `<@&${roleId}>` : "";

        try {
            const embed = new EmbedBuilder()
                .setTitle("Scrim Availability")
                .setDescription("React to the time slots you can play.")
                .setColor(0x00AAFF)
                .addFields(
                    { name: `${emoji_16} Players`, value: "No players", inline: true },
                    { name: `${emoji_20} Players`, value: "No players", inline: true },
                    { name: `${emoji_23} Players`, value: "No players", inline: true }
                );

            const embedMessage = await scrimChannel.send({ embeds: [embed] });

            await executeQuery(`
                INSERT INTO clan_scrim_settings (guild_id, message_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);
            `, [guild_id, embedMessage.id]);

            await embedMessage.react(emoji_16);
            await embedMessage.react(emoji_20);
            await embedMessage.react(emoji_23);

            if (roleMention) {
                await scrimChannel.send(roleMention);
            }

            console.log(`[${guild.name} | ${guild.id}] Scrim embed sent at 12AM.`);
        } catch (error) {
            console.error(`[${guild.name} | ${guild.id}] Error sending scrim embed:`, error);
        }
    }
}