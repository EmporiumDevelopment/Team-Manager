import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { isScrimButton, handleScrimButton } from "./utils/scrimAvailability.js";
import CommandHandler from './handlers/commandHandler.js';
import { handleMemberLeave } from './handlers/roster/playerHandler.js';
import { scheduleScrims } from './utils/scrimScheduler.js';
import { startTikTokWatcher } from './utils/tiktok/tiktokNotifier.js';
import { isPageButton, handlePageButton } from './utils/pagination.js';
import { sendLogEmbed } from './utils/logger.js';
import { executeQuery } from './database.js';
import "./utils/schedule/scheduleTasks.js"
import { isScheduleButton, handleScheduleButton } from './utils/schedule/scheduleAvailability.js';

dotenv.config({ path: './src/.env' });

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
const testServerId = process.env.TEST_SERVER_ID;
const testGuildIds = process.env.TEST_GUILD_IDS ? process.env.TEST_GUILD_IDS.split(',').map(s => s.trim()).filter(Boolean) : (testServerId ? [testServerId] : []);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        // Needed for MessageDelete (roster embed deletion detection). Message
        // content is never read, so the privileged MessageContent intent isn't requested.
        GatewayIntentBits.GuildMessages,
    ]
});

client.announcementTypeCache = new Map();
client.announcementProgressCache = new Map();

const commandHandler = new CommandHandler(client);

// Availability uses buttons, which carry their message with the interaction, so
// there's no need to pre-fetch scrim/schedule messages into the cache on startup.
client.once(Events.ClientReady, () => {
    console.log(`Bot is online!`);
    scheduleScrims(client);
    startTikTokWatcher(client);
});

// Default settings rows for a newly joined guild. Each insert is independent so one
// failure doesn't stop the rest.
const DEFAULT_SETTINGS_TABLES = [
    "roster_settings",
    "mixed_scrim_settings",
    "female_scrim_settings",
    "clan_scrim_settings",
    "log_settings",
    "announcement_settings",
    "tournament_settings",
];

client.on("guildCreate", async (guild) => {

    console.log(`Joined new guild: ${guild.id} - ${guild.name}, setting up default data in database...`);

    for (const table of DEFAULT_SETTINGS_TABLES) {
        try {
            await executeQuery(`INSERT INTO ${table} (guild_id) VALUES (?) ON DUPLICATE KEY UPDATE guild_id = guild_id;`, [guild.id]);
        } catch (error) {
            console.error(`Error initializing ${table} for guild ${guild.id}:`, error);
        }
    }

    console.log(`Default settings applied for guild: ${guild.id}`);
});

client.on(Events.MessageDelete, async (message) => {
    try {
        if (!message.guild) return; // ignore DM deletions

        // Roster channel + tracked message live in roster_settings, not a
        // separate "channels" table (which doesn't exist).
        const rosterSettings = await executeQuery(`
            SELECT channel_id, message_id FROM roster_settings WHERE guild_id = ?
        `, [message.guild.id]);

        const settings = rosterSettings[0];
        if (!settings?.channel_id || message.channelId !== settings.channel_id) return;

        // The tracked roster embed was deleted — clear the stored ID and notify.
        if (settings.message_id && settings.message_id === message.id) {
            await executeQuery(`
                UPDATE roster_settings SET message_id = NULL WHERE guild_id = ?
            `, [message.guild.id]);
            sendLogEmbed(message.guild.id, `Roster embed deleted. Use /roster fix to restore it.`);
        }
    } catch (error) {
        console.error("Error handling roster message deletion:", error);
    }
});

client.on(Events.InteractionCreate, async interaction => {

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        return commandHandler.handleInteraction(interaction);
    }

    // Handle availability button clicks (scrims + schedule events)
    if (interaction.isButton()) {
        try {
            if (isScrimButton(interaction.customId)) return await handleScrimButton(interaction);
            if (isScheduleButton(interaction.customId)) return await handleScheduleButton(interaction);
            if (isPageButton(interaction.customId)) return await handlePageButton(interaction);
        } catch (error) {
            console.error("Error handling button interaction:", error);
        }
    }
});

client.on(Events.GuildMemberRemove, async (member) => {
    return handleMemberLeave(member);
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

        if(globalCommands.length > 0) {
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: globalCommands }
            );
        }

        const guildCommands = commands
            .filter(cmd => cmd.development)
            .map(cmd => cmd.data);

        if (guildCommands.length > 0) {
            if (testGuildIds.length === 0) {
                console.log('No test guild IDs provided; skipping guild command registration.');
            } else {
                console.log(`Registering guild commands to ${testGuildIds.length} test guild(s)...`);
                for (const gid of testGuildIds) {
                    try {
                        await rest.put(
                            Routes.applicationGuildCommands(process.env.CLIENT_ID, gid),
                            { body: guildCommands }
                        );
                        console.log(`Registered guild commands to ${gid}`);
                    } catch (err) {
                        console.error(`Failed to register guild commands to ${gid}:`, err);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Command Registration Failed:', error);
    }

    await client.login(process.env.TOKEN);
}

// loadCommands() imports every command file asynchronously; registering before it
// finished is why commands used to go missing without a startup delay. Not awaited
// at top level: command modules import this file, and a top-level await here would
// deadlock that import cycle.
commandHandler.loadCommands()
    .then(setup)
    .catch(error => console.error("Startup failed:", error));

export default client;
