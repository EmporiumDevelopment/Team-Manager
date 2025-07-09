import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";

export default {
    data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Setup and manage the logs channel.")
    // channel
    .addSubcommand(subcommand =>
        subcommand
            .setName("channel")
            .setDescription("Set the channel to send logs in.")
            .addChannelOption(option =>
                option.setName("channel")
                .setDescription("Select a channel")
                .setRequired(true)
            )
    ),

    async execute(interaction) {

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Admin permission check
        if (["title", "channel"].includes(subcommand)) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: "You need **Manage Server** permission to manage the logs!", ephemeral: true });
            }
        }

        // Check if channel has been setup
        const logRows = await executeQuery(`
            SELECT channel_id FROM log_settings WHERE guild_id = ?
        `, [guildId]);

        if(logRows.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO log_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        if(subcommand === "channel") {
            return await this.setChannel(interaction);
        }
    
        // Check if guild is setup for logs
        if (!logRows.length || !logRows[0]?.channel_id) {
            return interaction.reply({ content: "Logs channel has not been set up yet! Use `/logs channel` to set it up.", ephemeral: true });
        }
        
        const logsChannelId = logRows.length > 0 && logRows[0].channel_id ? logRows[0].channel_id : null;
        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);

        // Check if the channel exists
        if (!logsChannel) {
                return interaction.reply({ content: "The logs channel no longer exists! Use `/logs channel` again.", ephemeral: true });
            }

        // Other subcommand checks
        if(subcommand === "title") {
            await this.setTitle(interaction);
        }
    },

    async setChannel(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        if (!channel) {
            return interaction.reply({ content: "Please provide a valid channel!", ephemeral: true });
        }

        try {
            // Then, update the channel_id for the correct guild
            await executeQuery(`
                INSERT INTO log_settings (guild_id, channel_id) 
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `, [guildId, channel.id]);

            // send log embed
            await sendLogEmbed(
                guildId, 
                `**Logs Settings Updated**\n\nThe Logs channel has been changed\n\n**New Channel:** <#${channel.id}>\n*By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.EDIT
            );
            if(interaction.deferred || interaction.replied) {
                return interaction.followUp({ content: `Logs channel successfully set to <#${channel.id}>`, ephemeral: true });
            } else {
                return interaction.reply({ content: `Logs channel successfully set to <#${channel.id}>`, ephemeral: true });
            }
        } catch (error) {
            console.error(`Failed to set roster channel for Server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting up the roster channel.", ephemeral: true });
        }
    },

    async setTitle(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;
        const title = interaction.options.getString("title");

        try {
            await executeQuery(`
                INSERT INTO log_settings (guild_id, embed_title) 
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
            `, [guildId, title]);

            await sendLogEmbed(
                guildId, 
                `**Log Settings Updated**\n\n The Logs Title has been changed\n\n** New title:** "${title}"\n**By:** ${interaction.user.tag}.`
                , COLOUR_VALUES.EDIT
            );
            return interaction.reply({ content: `Logs title set to "${title}".`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set logs title for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the logs title.", ephemeral: true });
        }
    },
    development: false
};