import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageFlags, PermissionsBitField } from "discord.js";
import { sendLogEmbed } from "../utils/logger.js";
import { executeQuery } from "../database.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { renderScrimEmbed, buildScrimComponents, clearScrimAvailability } from "../utils/scrimAvailability.js";

export default {
    data: new SlashCommandBuilder()
        .setName("scrim")
        .setDescription("Manage Team Scrims")
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Set the channel for scrim availability")
                .addStringOption(option =>
                    option
                    .setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
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
                .addStringOption(option =>
                    option
                    .setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
        )
        // role
        .addSubcommand(subcommand =>
            subcommand
                .setName("role")
                .setDescription("Set the role to be pinged for scrim availability")
                .addStringOption(option =>
                    option
                    .setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
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
                    .setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
                .addStringOption(option =>
                    option
                        .setName("title")
                        .setDescription("The title of the scrim availability embed")
                        .setRequired(true)
                )
        )
        // fix
        .addSubcommand(subcommand =>
            subcommand
                .setName("fix")
                .setDescription("Fix the scrim availability embed")
                .addStringOption(option =>
                    option
                    .setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
        )
        // toggle
        .addSubcommand(subcommand =>
            subcommand
                .setName("toggle")
                .setDescription("Toggle scrim availability embed sending")
                .addStringOption(option =>
                    option
                    .setName("team-type")
                    .setDescription("The team you want to toggle scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                    )
                )
                .addStringOption(option =>
                    option
                        .setName("status")
                        .setDescription("Enable or disable scrim availability embed sending")
                        .setRequired(true)
                        .addChoices(
                            { name: "Enable", value: "enable" },
                            { name: "Disable", value: "disable" }
                        )
                )
        ),

    async execute(interaction) {

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Check if guildId is available
        if(!guildId) {
            return interaction.reply({ content: "Error: Could not determine guild ID.", flags: MessageFlags.Ephemeral });
        }

        // Check if roster settings exist
        const mixedScrimRows = await executeQuery(`
            SELECT * FROM mixed_scrim_settings WHERE guild_id = ?
        `, [guildId]);

        const femaleScrimRows = await executeQuery(`
            SELECT * FROM female_scrim_settings WHERE guild_id = ?
            `, [guildId]);

        const clanScrimRows = await executeQuery(`
            SELECT * FROM clan_scrim_settings WHERE guild_id = ?
            `, [guildId]);

        // Permission check
        if(["channel", "sendavailability", "role", "title", "fix", "toggle"].includes(subcommand)) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", flags: MessageFlags.Ephemeral });
            }
        }

        if(mixedScrimRows.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO mixed_scrim_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No mixed scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        if(femaleScrimRows.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO female_scrim_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No female scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        if(clanScrimRows.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO clan_scrim_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No clan scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        if(subcommand === "channel") {
            await this.setChannel(interaction);
            return;
        }

        if (!guildId) {
            return interaction.reply({ content: "Error: Could not determine guild ID.", flags: MessageFlags.Ephemeral });
        }

        if(subcommand === "role") {
            await this.setRole(interaction);
        } else if(subcommand === "title") {
            await this.setTitle(interaction);
        } else if(subcommand === "sendavailability") {
            await this.sendScrimEmbed(interaction);
        } else if(subcommand === "fix") {
            await this.fixScrimEmbed(interaction);
        } else if(subcommand === "toggle") {
            await this.toggleScrim(interaction);
        }
    },

    async setRole(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const role = interaction.options.getRole("role");
        const team = interaction.options.getString("team-type");
        
        try {

            if(!team) {
                return interaction.reply({ content: "You must specify the team you want to set the mentionable role for. (Mixed/Female)", flags: MessageFlags.Ephemeral });
            }

            // Check if role is valid
            if (!role) {
                return interaction.reply({ content: "Please provide a valid role!", flags: MessageFlags.Ephemeral });
            }

            // Check if scrim settings exist for the guild
            const scrimSettings = await executeQuery(`
                SELECT * FROM ${team}_scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO ${team}_scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Update or insert the role in scrim_settings
            await executeQuery(`
                INSERT INTO ${team}_scrim_settings (guild_id, role_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)
            `, [guildId, role.id]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\n The Scrim availability role has been updated\n**New Role:** ${role}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.reply({ content: `Scrim availability role set to ${role}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(`Failed to set Scrim Availability role for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the Scrim Availability role.", flags: MessageFlags.Ephemeral });
        }
    },

    async setTitle(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const title = interaction.options.getString("title");
        const team = interaction.options.getString("team-type");

        try {

            if(!team) {
                return interaction.reply({ content: "You must specify the team you want to change the title for. (Mixed/Female)", flags: MessageFlags.Ephemeral });
            }

            if(!title) {
                return interaction.reply({ content: "Please provide a valid title for the scrim availability embed.", flags: MessageFlags.Ephemeral });
            }

            // Check if scrim settings exist for the guild
            const scrimSettings = await executeQuery(`
                SELECT * FROM ${team}_scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO ${team}_scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Update or insert the title in scrim_settings
            await executeQuery(`
                INSERT INTO ${team}_scrim_settings (guild_id, embed_title) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
            `, [guildId, title]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\nThe Scrim availability title has been updated\n\n**New Title:** ${title}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.reply({ content: `Scrim availability embed title set to "${title}".`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error(`Failed to set scrim title for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the scrim title.", flags: MessageFlags.Ephemeral });
        }
    },

    async setChannel(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const team = interaction.options.getString("team-type");
        const channel = interaction.options.getChannel("channel");

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if(!team) {
                return interaction.editReply({ content: "You must specify which team you want to set scrims up for. (Mixed/Female)" });
            }

            if(!channel) {
                return interaction.editReply({ content: "You must specify the channel you want to set." });
            }

            const scrimSettings = await executeQuery(`
                SELECT * FROM ${team}_scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO ${team}_scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Insert or update the channel in scrim_settings
            await executeQuery(`
                INSERT INTO ${team}_scrim_settings (guild_id, channel_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `, [guildId, channel.id]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\n The Scrim availability channel has been updated for ${team}\n**New Channel:** ${channel}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.editReply({ content: `Scrim availability channel set to ${channel}.` });
        } catch (error) {
            console.error(`Failed to set Scrim Availability channel for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the scrim channel." });
        }
    },

    async fixScrimEmbed(interaction) {

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guild.id;
        const team = interaction.options.getString("team-type");

        try {

            if(!team) {
                return interaction.editReply({ content: "You must specify the team you want to fix scrim availability for. (Mixed/Female/Clan)" });
            }

            // Fetch scrim settings (channel, title, tracked message)
            const scrimSettings = await executeQuery(`
                SELECT channel_id, embed_title, message_id FROM ${team}_scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (!scrimSettings[0]?.channel_id) {
                return interaction.editReply({ content: "No scrim channel set. Use `/scrim channel` first." });
            }

            if (!scrimSettings[0]?.message_id) {
                return interaction.editReply({ content: "No scrim message found. Use `/scrim sendavailability` first." });
            }

            const { channel_id, embed_title, message_id } = scrimSettings[0];

            let scrimChannel;
            try {
                scrimChannel = await interaction.guild.channels.fetch(channel_id);
            } catch (error) {
                console.error(`Failed to fetch scrim channel ${channel_id} for guild ${guildId}:`, error);
                return interaction.editReply({ content: "Scrim channel doesn't exist or is inaccessible. Please reset it using `/scrim channel`." });
            }

            if (!scrimChannel) {
                return interaction.editReply({ content: "Scrim channel not found. Make sure it's correctly set." });
            }

            const message = await scrimChannel.messages.fetch(message_id).catch(() => null);
            if (!message) {
                console.log(`Failed to fetch scrim message ${message_id} for guild ${guildId}.`);
                return interaction.editReply({ content: "Scrim message not found. You may need to resend it with `/scrim sendavailability`." });
            }

            // Re-render straight from the availability table and re-attach the buttons.
            const embed = await renderScrimEmbed(guildId, message_id, {
                title: embed_title || "Scrim Availability",
            });

            await message.edit({ embeds: [embed], components: buildScrimComponents() });
            await interaction.editReply({ content: "Scrim availability embed restored." });

        } catch (error) {
            console.error(`Error fixing scrim embed for guild ${guildId}:`, error);
            await interaction.editReply({ content: "Failed to update the scrim embed. Check logs for details." });
        }
    },

    // Only for manual sending, automated scrim embed sending is handled by the scrimScheduler.js
    async sendScrimEmbed(interaction) {
        
        const guild = interaction.guild;
        const guildId =  interaction.guild.id;
        const client = interaction.client;

        const team = interaction.options.getString("team-type");

        if(!team) {
            return interaction.reply({ content: "You must specify which scrim availability you want to send.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const scrimSettings = await executeQuery(`
            SELECT channel_id, embed_title, role_id, message_id FROM ${team}_scrim_settings WHERE guild_id = ?
        `, [guildId]);

        if (scrimSettings.length === 0 || !scrimSettings[0]?.channel_id) {
            return interaction.editReply({ content: "The scrim channel has not been set up! Use `/scrim channel` first." });
        }

        const { channel_id, embed_title, role_id, message_id: previousMessageId } = scrimSettings[0];

        const scrimChannel = await client.channels.fetch(channel_id).catch(() => null);

        if (!scrimChannel) {
            return interaction.editReply({ content: "Scrim channel not found. Please set the scrim channel first." });
        }

        const embedTitle = embed_title || "Scrim Availability";
        const roleMention = role_id ? `<@&${role_id}>` : "";

        try {
            // We're posting a new message here, so Send Messages really is required.
            const me = guild.members.me;
            if (me && scrimChannel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) === false) {
                return interaction.editReply({ content: `I do not have permission to send messages in the ${team} scrims channel.` });
            }

            const embed = await renderScrimEmbed(guildId, null, { title: embedTitle });

            const embedMessage = await scrimChannel.send({
                embeds: [embed],
                components: buildScrimComponents(),
            });

            await executeQuery(`
                INSERT INTO ${team}_scrim_settings (guild_id, message_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);
            `, [guildId, embedMessage.id]);

            // Drop the old message's availability so the table doesn't grow forever.
            if (previousMessageId && previousMessageId !== embedMessage.id) {
                await clearScrimAvailability(previousMessageId);
            }

            if (roleMention) {
                await scrimChannel.send(roleMention);
            }

            // send confirmation
            await interaction.editReply({ content: "Scrim embed sent successfully!" });

            // send discord log
            await sendLogEmbed(
                guildId, 
                `**Scrim Availability**\n\nThe scrim availability has been sent manually for ${team}\n\n**Channel:** ${scrimChannel}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.ADD
            );

        } catch (error) {
            console.error(`[${guild.name} | ${guildId}] Error sending scrim embed:`, error);
            await interaction.editReply({ content: "An error occurred while sending the scrim embed." });
        }
        
    },

    async toggleScrim(interaction) {

        const guildId = interaction.guild.id;
        const team = interaction.options.getString("team-type");
        const status = interaction.options.getString("status")?.toLowerCase();

        if(!team) {
            return interaction.reply({ content: "You must specify which scrim availability you want to toggle.", flags: MessageFlags.Ephemeral });
        }

        if(!status) {
            return interaction.reply({ content: "You must specify the status to toggle the scrim availability.", flags: MessageFlags.Ephemeral });
        }

        // Check if scrim settings exist for the guild
        const scrimSettings = await executeQuery(`
            SELECT * FROM ${team}_scrim_settings WHERE guild_id = ?
        `, [guildId]);

        if (scrimSettings.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO ${team}_scrim_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        // Update or insert the toggle status in scrim_settings
        await executeQuery(`
            INSERT INTO ${team}_scrim_settings (guild_id, is_enabled) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)
        `, [guildId, status === "enable" ? 1 : 0]);

        // Send confirmation message
        await sendLogEmbed(
            guildId, 
            `**Scrim Settings Updated**\n\nThe Scrim availability has been ${status}d for ${team}\n**By:** <@${interaction.user.id}>`, 
            COLOUR_VALUES.EDIT
        );

        return interaction.reply({ content: `Scrim availability has been ${status}d for ${team}.`, flags: MessageFlags.Ephemeral });
    },

    development: false
};