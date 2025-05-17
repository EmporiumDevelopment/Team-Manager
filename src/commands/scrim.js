import { SlashCommandBuilder } from "@discordjs/builders";
import { sendScrimEmbed } from "../Utils/scrimScheduler.js";
import { PermissionsBitField, MessageFlags } from "discord.js";
import { sendLogEmbed } from "../Utils/logger.js";
import db from "../database.js";

export default {
    data: new SlashCommandBuilder()
        .setName("scrim")
        .setDescription("Manage Team Scrims")
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Set the channel for scrim availability")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel to send scrim availability in")
                        .setRequired(true)
                )
        )
        // sendavailability
        .addSubcommand(subcommand =>
            subcommand
                .setName("sendavailability")
                .setDescription("Send scrim availability embed to the channel")
        )
        // role
        .addSubcommand(subcommand =>
            subcommand
                .setName("role")
                .setDescription("Set the role to be pinged for scrim availability")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("The role to be pinged for scrim availability")
                        .setRequired(true)
                )
        )
        // title
        .addSubcommand(subcommand =>
            subcommand
                .setName("title")
                .setDescription("Set the title of the scrim availability embed")
                .addStringOption(option =>
                    option
                        .setName("title")
                        .setDescription("The title of the scrim availability embed")
                        .setRequired(true)
                )
        )
        // emojis
        .addSubcommand(subcommand =>
            subcommand
            .setName("emojis")
            .setDescription("Set the custom emojis for scrim availability.")
            .addStringOption(option =>
                option.setName("16")
                    .setDescription("Emoji for 16-player scrim")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("20")
                    .setDescription("Emoji for 20-player scrim")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("23")
                    .setDescription("Emoji for 23-player scrim")
                    .setRequired(true)
            ),
        ),

    async execute(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild?.id;
        const subcommand = interaction.options.getSubcommand();

        // Check if roster channel is set
        const [channelRows] = await db.execute(`
            SELECT channel_id FROM scrim_settings WHERE guild_id = ?
        `, [guildId]);

        // Permission check
        if(["channel", "sendavailability", "role", "title", "emojis"].includes(subcommand)) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", ephemeral: true });
            }
        }

        if(subcommand === "channel") {
            await this.setChannel(interaction);
            return;
        }

        if (channelRows.length === 0 || !channelRows[0].channel_id) {
                return interaction.reply({ content: "The scrim channel has not been set up! Use `/scrim setchannel` first.", ephemeral: true });
            }

        if (!guildId) {
            return interaction.reply({ content: "Error: Could not determine guild ID.", flags: MessageFlags.Ephemeral });
        }

        if(subcommand === "role") {
            await this.setRole(interaction);
        } else if(subcommand === "title") {
            await this.setTitle(interaction);
        } else if(subcommand === "sendavailability") {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Ensures the interaction is deferred first
                await sendScrimEmbed(interaction.client, guildId, interaction);
            } catch (error) {
                console.error(`Error sending scrim embed for server: ${serverName} ID: ${guildId}`, error);
                await interaction.followUp({ content: "There was an error sending the scrim embed.", flags: MessageFlags.Ephemeral });
            }
        } else if(subcommand === "emojis") {
            await this.setScrimEmojis(interaction);
        }
    },

    async setRole(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;
        
        try {
            const role = interaction.options.getRole("role");

            await db.execute(`
                INSERT INTO scrim_settings (guild_id, role_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)
            `, [guildId, role.id]);

            await sendLogEmbed(interaction.guild.id, `Scrim availability role set to ${role} by ${interaction.user.tag}.`);
            return interaction.reply({ content: `Scrim availability role set to ${role}.`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set Scrim Availability role for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the Scrim Availability role.", flag: MessageFlags.Ephemeral });
        }
    },

    async setTitle(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        try {
            const title = interaction.options.getString("title");

            await db.execute(`
                INSERT INTO scrim_settings (guild_id, embed_title) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
            `, [guildId, title]);

            await sendLogEmbed(interaction.guild.id, `Scrim availability embed title set to "${title}" by ${interaction.user.tag}.`);
            return interaction.reply({ content: `Scrim availability embed title set to "${title}".`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set scrim title for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the scrim title.", flag: MessageFlags.Ephemeral });
        }
    },

    async setChannel(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        try {
            const channel = interaction.options.getChannel("channel");

            if(!channel) {
                return interaction.reply({ content: "Error: Could not find the specified channel.", flags: MessageFlags.Ephemeral });
            }

            await db.execute(`
                INSERT INTO scrim_settings (guild_id, channel_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `, [guildId, channel.id]);

            await sendLogEmbed(interaction.guild.id, `Scrim availability channel set to ${channel} by ${interaction.user.tag}.`);
            return interaction.reply({ content: `Scrim availability channel set to ${channel}.`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set Scrim Availability channel for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting up the scrim channel.", flag: MessageFlags.Ephemeral });
        }
    },

    async setScrimEmojis(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        try {

            const emoji16 = interaction.options.getString("16");
            const emoji20 = interaction.options.getString("20");
            const emoji23 = interaction.options.getString("23");
        
            // 🔹 Ensure no null values
            if (!emoji16 || !emoji20 || !emoji23) {
                return interaction.reply({ content: "You must provide all three emojis!", flags: MessageFlags.Ephemeral });
            }
            
            const emojiRegex = /^<:\w+:\d+>$/;
            if (!emojiRegex.test(emoji16) || !emojiRegex.test(emoji20) || !emojiRegex.test(emoji23)) {
                return interaction.reply({ content: "Please provide valid custom emojis in the format `<:name:id>`!", ephemeral: true });
            }
            
            await db.execute(`
                INSERT INTO scrim_emojis (guild_id, emoji_16, emoji_20, emoji_23)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE emoji_16 = VALUES(emoji_16), emoji_20 = VALUES(emoji_20), emoji_23 = VALUES(emoji_23);
            `, [guildId, emoji16, emoji20, emoji23]);
    
            await interaction.reply({ content: "Scrim emojis updated successfully!", flags: MessageFlags.Ephemeral });
            await sendLogEmbed(interaction.guild.id, `Scrim emojis updated by ${interaction.user.username}:\n16 Players: ${emoji16}\n20 Players: ${emoji20}\n23 Players: ${emoji23}`);
        } catch (error) {
            console.error(`Failed to save scrim emojis for server: ${serverName} ID: ${guildId}:`, error);
            await interaction.reply({ content: "There was an error setting scrim emojis.", flags: MessageFlags.Ephemeral });
        }
    }
};