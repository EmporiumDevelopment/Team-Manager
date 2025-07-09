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
import { resolveScheduleTeamByMessageId } from './utils/schedule/scheduleUtils.js';

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

        const mixedScrimSettings = await executeQuery(`
            SELECT channel_id, message_id FROM mixed_scrim_settings WHERE guild_id = ?
        `, [guildId]);

        // cache mixed scrim message if it has been sent
        if(mixedScrimSettings[0]?.channel_id) {

            try {
                const mixedScrimChannel = await client.channels.fetch(mixedScrimSettings[0]?.channel_id);
                
                // mixed scrim channel is setup
                if(mixedScrimChannel) {

                    // scrim message is stored
                    if (mixedScrimSettings[0]?.message_id) {
                        // cache scrim message so bot can access it
                        await mixedScrimChannel.messages.fetch(mixedScrimSettings[0]?.message_id).catch(() => null);
                    }
                }
            } catch (error) {
                console.log(`Failed to fetch mixed scrim message for guild ${guildId}:`, error);
            }
        }

        const femaleScrimSettings = await executeQuery(`
            SELECT channel_id, message_id FROM female_scrim_settings WHERE guild_id = ?
            `, [guildId]);

        // cache female scrim message if it has been sent
        if(femaleScrimSettings[0]?.channel_id) {

            try {
                const femaleScrimChannel = await client.channels.fetch(femaleScrimSettings[0]?.channel_id);

                // female scrim channel is setup
                if(femaleScrimChannel) {

                    // scrim message is stored
                    if (femaleScrimSettings[0]?.message_id) {
                        // cache scrim message so bot can access it
                        await femaleScrimChannel.messages.fetch(femaleScrimSettings[0]?.message_id).catch(() => null);
                    }
                }

            } catch (error) {
                console.log(`Failed to fetch female scrim message for guild ${guildId}:`, error);
            }
        }

        // 🔹 Fetch schedule messages

        // mixed schedule
        const mixedScheduleSettings = await executeQuery(`
            SELECT announcement_message_id, announcements_channel_id 
            FROM mixed_schedule s 
            JOIN mixed_schedule_settings ss ON s.guild_id = ss.guild_id 
            WHERE s.announcement_message_id IS NOT NULL;
        `);

        for (const row of mixedScheduleSettings) {
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
            } catch (error) {
                console.log(`Failed to fetch schedule message ${row.announcement_message_id}:`, error);
            }
        }

        // female schedule
        const femaleScheduleSettings = await executeQuery(`
            SELECT announcement_message_id, announcements_channel_id 
            FROM female_schedule s 
            JOIN female_schedule_settings ss ON s.guild_id = ss.guild_id 
            WHERE s.announcement_message_id IS NOT NULL;
        `);

        for (const row of femaleScheduleSettings) {
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
            } catch (error) {
                console.log(`Failed to fetch schedule message ${row.announcement_message_id}:`, error);
            }
        }

        // clan schedule
        const clanScheduleSettings = await executeQuery(`
            SELECT announcement_message_id, announcements_channel_id 
            FROM clan_schedule s 
            JOIN clan_schedule_settings ss ON s.guild_id = ss.guild_id 
            WHERE s.announcement_message_id IS NOT NULL;
        `);

        for (const row of clanScheduleSettings) {
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
            } catch (error) {
                console.log(`Failed to fetch schedule message ${row.announcement_message_id}:`, error);
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

    if(user.bot) return;

    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
            console.log("Reaction message fetched successfully.");
        } catch (error) {
            console.log("Failed to fetch message:", error);
            return;
        }
    }

    // schedule availability handling
    const teamContext = await resolveScheduleTeamByMessageId(reaction.message.guild.id, reaction.message.id);

    if(teamContext) {
        // If the reaction is on a schedule announcement message, handle it
        return await handleScheduleReactionAdd(reaction, user, teamContext.team);
    }

    // scrim availability handling
    await handleReactionAdd(reaction, user);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {

    if (!reaction.message.guild || user.bot) return;

    // Fetch message if needed
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            console.log("Failed to fetch message:", error);
            return;
        }
    }

    // Schedule availability handling
    const teamContext = await resolveScheduleTeamByMessageId(reaction.message.guild.id, reaction.message.id);

    if(teamContext) {
        return await handleScheduleReactionRemove(reaction, user, teamContext.team);
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