import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { handleReactionAdd, handleReactionRemove } from "./handlers/scrimReactions.js";
import CommandHandler from './handlers/commandHandler.js';
import { scheduleScrims } from './utils/scrimScheduler.js';
import { sendLogEmbed } from './utils/logger.js';
import { executeQuery } from './database.js';
import "./utils/schedule/scheduleTasks.js"
import { handleScheduleReactionAdd, handleScheduleReactionRemove } from './handlers/schedule/scheduleAnnouncementReactions.js';

dotenv.config({ path: './src/.env' });

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
const testServerId = process.env.TEST_SERVER_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
        ]
});

client.announcementTypeCache = new Map();
client.announcementProgressCache = new Map();

const commandHandler = new CommandHandler(client);
commandHandler.loadCommands();

client.once(Events.ClientReady, async () => {
    console.log(`Bot is online!`);

    const guilds = client.guilds.cache.map(guild => guild.id);

    for (const guildId of guilds) {
        if (!guildId) {
            console.error("Error: guildId is undefined.");
            continue;
        }

        // 🔹 Fetch scrim messages
        const scrimRows = await executeQuery(`
            SELECT scrim_message_id FROM channels WHERE guild_id = ?
        `, [guildId]);

        const scrimSettings = await executeQuery(`
            SELECT channel_id FROM scrim_settings WHERE guild_id = ?
        `, [guildId]);

        if (!scrimSettings.length || !scrimSettings[0]?.channel_id) {
            console.error(`Skipping guild: Missing scrim channel ID for guild ${guildId}`);
            continue;
        }

        try {
            const channel = await client.channels.fetch(scrimSettings[0]?.channel_id);
            if (!channel) {
                console.error(`Skipping guild: Channel not found for guild ${guildId}`);
                continue;
            }

            if (!scrimRows.length || !scrimRows[0]?.scrim_message_id) {
                console.log(`Skipping guild ${guildId}: No scrim message stored.`);
                continue;
            }

            const scrimMessage = await channel.messages.fetch(scrimRows[0]?.scrim_message_id).catch(() => null);
            if (!scrimMessage) {
                console.log(`Skipping guild ${guildId}: Scrim message no longer exists.`);
            }

        } catch (error) {
            console.log(`Failed to fetch scrim message for guild ${guildId}:`, error);
        }

        // 🔹 Fetch schedule messages
        const scheduleRows = await executeQuery(`
            SELECT announcement_message_id, announcements_channel_id 
            FROM schedule s 
            JOIN schedule_settings ss ON s.guild_id = ss.guild_id 
            WHERE s.announcement_message_id IS NOT NULL;
        `);

        for (const row of scheduleRows) {
            try {
                const scheduleChannel = await client.channels.fetch(row.announcements_channel_id);
                if (!scheduleChannel) {
                    console.error(`Skipping guild: Schedule channel not found for ${row.announcements_channel_id}`);
                    continue;
                }

                const scheduleMessage = await scheduleChannel.messages.fetch(row.announcement_message_id).catch(() => null);
                if (!scheduleMessage) {
                    console.log(`Skipping schedule message ${row.announcement_message_id}: Message no longer exists.`);
                    continue;
                }

                console.log(`✅ Cached schedule message ${scheduleMessage.id} in ${scheduleChannel.id}`);

            } catch (error) {
                console.log(`❌ Failed to fetch schedule message ${row.announcement_message_id}:`, error);
            }
        }
    }

    scheduleScrims(client);
});

client.on("guildCreate", async (guild) => {
    
    console.log(`Joined new guild: ${guild.id} - ${guild.name}, setting up default data in database...`);
    // Initialize default data for the new guild

    try {
        await executeQuery(`INSERT INTO roster (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO roster_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO scrim_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO scrim_emojis (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO log_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO announcement_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        await executeQuery(`INSERT INTO tournament_settings (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);

        console.log(`Default settings applied for guild: ${guild.id}`);
    } catch (error) {
        console.error("Error initializing default data:", error);
    }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {

    if (!reaction.message.guild) return; // Ensure it's in a guild

    console.log(`🔍 Reaction detected: ${reaction.emoji.name} by ${user.tag} on message ${reaction.message.id}`);

    if(user.bot) return;

    console.log(`🔍 Reaction detected: ${reaction.emoji.name} by ${user.tag}`)

    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
            console.log("Reaction message fetched successfully.");
        } catch (error) {
            console.log("Failed to fetch message:", error);
            return;
        }
    }


    // check if reaction message is a schedule announcement
    const scheduleData = await executeQuery(`
        SELECT event_name FROM schedule WHERE announcement_message_id = ?;
    `, [reaction.message.id]);

    console.log(`🔍 Schedule data check result:`, scheduleData);

    if (scheduleData.length > 0) {

        console.log(`Schedule announcement detected for ${scheduleData[0].event_name}`);
        return await handleScheduleReactionAdd(reaction, user);
    }

    console.log(`🔍 Reaction did not match any schedule message, passing to scrim handler.`);

    // scrim availability
    await handleReactionAdd(reaction, user);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (!reaction.message.guild || user.bot) return; // Ignore bot reactions & ensure it's in a guild

    // Fetch message if needed
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            console.log("Failed to fetch message:", error);
            return;
        }
    }

    // Check if the reaction belongs to a schedule announcement
    const scheduleData = await executeQuery(`
        SELECT event_name FROM schedule WHERE announcement_message_id = ?;
    `, [reaction.message.id]);

    if (scheduleData.length > 0) {
        return await handleScheduleReactionRemove(reaction, user);
    }

    // Scrim availability handling
    await handleReactionRemove(reaction, user);
});

client.on(Events.MessageDelete, async (message) => {

    const channelIdResult = await executeQuery(`
        SELECT roster_channel_id FROM channels WHERE guild_id = ?
    `, [message.guild.id]);

    if (!message.guild || message.channel.id !== channelIdResult[0]?.roster_channel_id) return; // Ensure it's the correct channel

    // Fetch the stored roster_message_id
    const messageIdResult = await executeQuery(`
        SELECT roster_message_id FROM channels WHERE guild_id = ?
    `, [message.guild.id]);

    if (messageIdResult.length > 0 && messageIdResult[0]?.roster_message_id === message.id) {
        sendLogEmbed(message.guild.id, `Roster embed deleted. Use /roster fix to restore it.`);

        // Update database to remove the stored roster message ID
        await executeQuery(`
            UPDATE channels SET roster_message_id = NULL WHERE guild_id = ?
        `, [message.guild.id]);
    }
});

client.on(Events.InteractionCreate, async interaction => {

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        return commandHandler.handleInteraction(interaction);
    }
});

async function setup() {

    const commands = [...commandHandler.commands.values()]
    .filter(cmd => cmd.data && cmd.data.name)
    .map(cmd => ({
        data: cmd.data.toJSON(),
        development: cmd.development || false
    }));

    try {
        console.log('Registering global commands...');

        const globalCommands = commands
            .filter(cmd => !cmd.development)
            .map(cmd => cmd.data);

        // Register global commands
        if(globalCommands.length > 0) {
            // Register global commands
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: globalCommands }
            );
        }

        const guildCommands = commands
            .filter(cmd => cmd.development)
            .map(cmd => cmd.data);

        if(guildCommands.length > 0) {
            console.log('Registering guild commands to test server...');

            // Register development commands
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, testServerId),
                { body: guildCommands }
            );
        }
    } catch (error) {
        console.error('Command Registration Failed:', error);
    }

    // Ensure bot logs in outside of try/catch block
    client.login(process.env.TOKEN).then(() => {
    });
}

// without this commands dont get registered for some reason
setTimeout(() => {
    setup();
}, 2000); // Delays setup by 2 seconds

export default client;