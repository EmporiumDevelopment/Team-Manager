import { SlashCommandBuilder } from "@discordjs/builders";
import { PermissionsBitField, MessageFlags, EmbedBuilder } from "discord.js";
import { sendLogEmbed } from "../utils/logger.js";
import { executeQuery } from "../database.js";
import COLOUR_VALUES from "../utils/colourMap.js";

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
        )
        // fix
        .addSubcommand(subcommand =>
            subcommand
                .setName("fix")
                .setDescription("Fix the scrim availability embed")
        ),

    async execute(interaction) {

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Check if guildId is available
        if(!guildId) {
            return interaction.reply({ content: "Error: Could not determine guild ID.", flags: MessageFlags.Ephemeral });
        }

        // Check if roster settings exist
        const scrimRows = await executeQuery(`
            SELECT * FROM scrim_settings WHERE guild_id = ?
        `, [guildId]);

        // Permission check
        if(["channel", "sendavailability", "role", "title", "emojis"].includes(subcommand)) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", ephemeral: true });
            }
        }

        if(scrimRows.length === 0) {
            // Initialize scrim settings if not present
            await executeQuery(`
                INSERT INTO scrim_settings (guild_id) VALUES (?)
            `, [guildId]);
            console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
        }

        if(subcommand === "channel") {
            await this.setChannel(interaction);
            return;
        }

        if (!scrimRows[0]?.channel_id) {
            return interaction.reply({ content: "The scrim channel has not been set up! Use `/scrim channel` first.", ephemeral: true });
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
        } else if(subcommand === "emojis") {
            await this.setScrimEmojis(interaction);
        } else if(subcommand === "fix") {
            await this.fixScrimEmbed(interaction);
        }
    },

    async setRole(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const role = interaction.options.getRole("role");
        
        try {

            // Check if role is valid
            if (!role) {
                return interaction.reply({ content: "Please provide a valid role!", flags: MessageFlags.Ephemeral });
            }

            // Check if scrim settings exist for the guild
            const scrimSettings = await executeQuery(`
                SELECT * FROM scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Update or insert the role in scrim_settings
            await executeQuery(`
                INSERT INTO scrim_settings (guild_id, role_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)
            `, [guildId, role.id]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\n The Scrim availability role has been updated\n**New Role:** ${role}**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.reply({ content: `Scrim availability role set to ${role}.`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set Scrim Availability role for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the Scrim Availability role.", flag: MessageFlags.Ephemeral });
        }
    },

    async setTitle(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const title = interaction.options.getString("title");

        try {

            if(!title) {
                return interaction.reply({ content: "Please provide a valid title for the scrim availability embed.", flags: MessageFlags.Ephemeral });
            }

            // Check if scrim settings exist for the guild
            const scrimSettings = await executeQuery(`
                SELECT * FROM scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Update or insert the title in scrim_settings
            await executeQuery(`
                INSERT INTO scrim_settings (guild_id, embed_title) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
            `, [guildId, title]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\nThe Scrim availability title has been updated\n\n**New Title:** ${title}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.reply({ content: `Scrim availability embed title set to "${title}".`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set scrim title for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.reply({ content: "An error occurred while setting the scrim title.", flag: MessageFlags.Ephemeral });
        }
    },

    async setChannel(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const channel = interaction.options.getChannel("channel");

        try {
            await interaction.deferReply({ ephemeral: true });

            if(!channel) {
                return interaction.editReply({ content: "Error: Could not find the specified channel.", flags: MessageFlags.Ephemeral });
            }

            const scrimSettings = await executeQuery(`
                SELECT * FROM scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (scrimSettings.length === 0) {
                // Initialize scrim settings if not present
                await executeQuery(`
                    INSERT INTO scrim_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No scrim settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Insert or update the channel in scrim_settings
            await executeQuery(`
                INSERT INTO scrim_settings (guild_id, channel_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `, [guildId, channel.id]);

            // Send confirmation message
            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\n The Scrim availability channel has been updated\n**New Channel:** ${channel}**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            return interaction.editReply({ content: `Scrim availability channel set to ${channel}.`, ephemeral: true });
        } catch (error) {
            console.error(`Failed to set Scrim Availability channel for server: ${serverName} ID: ${guildId}:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the scrim channel.", flag: MessageFlags.Ephemeral });
        }
    },

    async setScrimEmojis(interaction) {

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        const emoji16 = interaction.options.getString("16");
        const emoji20 = interaction.options.getString("20");
        const emoji23 = interaction.options.getString("23");

        try {

            // Validate user input
            if(!emoji16) {  
                return interaction.reply({ content: "You must provide an emoji for 16.", flags: MessageFlags.Ephemeral });
            }

            if(!emoji20) {
                return interaction.reply({ content: "You must provide an emoji for 20.", flags: MessageFlags.Ephemeral });
            }

            if(!emoji23) {
                return interaction.reply({ content: "You must provide an emoji for 23.", flags: MessageFlags.Ephemeral });
            }
            
            const emojiRegex = /^<:\w+:\d+>$/;
            if (!emojiRegex.test(emoji16) || !emojiRegex.test(emoji20) || !emojiRegex.test(emoji23)) {
                return interaction.reply({ content: "Please provide valid custom emojis in the format `<:name:id>`!", ephemeral: true });
            }

            // Check if scrim emojis exist for the guild
            const scrimEmojis = await executeQuery(`
                SELECT * FROM scrim_emojis WHERE guild_id = ?
            `, [guildId]);

            if (scrimEmojis.length === 0) {
                // Initialize scrim emojis if not present
                await executeQuery(`
                    INSERT INTO scrim_emojis (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`🔍 No scrim emojis found for guild: ${guildId}. Initialized default settings.`);
            }
            
            // Insert or update the emojis in scrim_emojis
            await executeQuery(`
                INSERT INTO scrim_emojis (guild_id, emoji_16, emoji_20, emoji_23)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE emoji_16 = VALUES(emoji_16), emoji_20 = VALUES(emoji_20), emoji_23 = VALUES(emoji_23);
            `, [guildId, emoji16, emoji20, emoji23]);
    
            // Send confirmation message
            await interaction.reply({ content: "Scrim emojis updated successfully!", flags: MessageFlags.Ephemeral });

            await sendLogEmbed(
                guildId, 
                `**Scrim Settings Updated**\n\n The Scrim emojis have been updated\n\n**16 Players Emoji:** ${emoji16}\n**20 Players Emoji:** ${emoji20}\n**23 Players Emoji:** ${emoji23}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

        } catch (error) {
            console.error(`Failed to save scrim emojis for server: ${serverName} ID: ${guildId}:`, error);
            await interaction.reply({ content: "There was an error setting scrim emojis.", flags: MessageFlags.Ephemeral });
        }
    },

    async fixScrimEmbed(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;

        try {
            // Fetch scrim settings
            const scrimSettings = await executeQuery(`
                SELECT channel_id, embed_title FROM scrim_settings WHERE guild_id = ?
            `, [guildId]);

            if (!scrimSettings || !scrimSettings[0]?.channel_id) {
                return interaction.editReply({ content: "No scrim settings found. Use `/scrim setup` first." });
            }

            // Fetch scrim message ID
            const channels = await executeQuery(`
                SELECT scrim_message_id FROM channels WHERE guild_id = ?
            `, [guildId]);

            if (!channels || !channels[0]?.scrim_message_id) {
                return interaction.editReply({ content: "No scrim message found. Use `/scrim sendavailability` first." });
            }

            const scrimMessageId = channels[0]?.scrim_message_id;
            let scrimChannel;
            try {
                scrimChannel = await interaction.guild.channels.fetch(scrimSettings[0]?.channel_id);
            } catch (error) {
                console.error(`Failed to fetch scrim channel ${scrimSettings[0]?.channel_id} for guild ${guildId}:`, error);
                return interaction.editReply({ content: "Scrim channel doesn't exist or is inaccessible. Please reset it using `/scrim channel`.", ephemeral: true });
            }


            if (!scrimChannel) {
                return interaction.editReply({ content: "Scrim channel not found. Make sure it's correctly set." });
            }

            const message = await scrimChannel.messages.fetch(scrimMessageId).catch(() => null);
            if (!message) {
                console.log(`Failed to fetch scrim message ${scrimMessageId} for guild ${guildId}.`);
                return interaction.editReply({ content: "Scrim message not found. You may need to resend it." });
            }

            // Fetch emoji settings
            const emojiRows = await executeQuery(`
                SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
            `, [guildId]);

            if (!emojiRows.length === 0) {
                return interaction.editReply({ content: "Scrim emojis are not set. Use `/scrim emojis` first." });
            }

            const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

            // Check for missing reactions and re-add them if necessary
            const expectedEmojis = [emoji_16, emoji_20, emoji_23];
            const missingReactions = expectedEmojis.filter(emoji => !message.reactions.cache.some(r => r.emoji.id === emoji || r.emoji.name === emoji));

            if (missingReactions.length > 0) {
                await Promise.all(missingReactions.map(async (emoji) => {
                    await message.react(emoji).catch(err => console.error(`Failed to re-add reaction ${emoji}:`, err));
                }));
            }

            // Fetch reaction users
            await Promise.all(
                message.reactions.cache.map(async (reaction) => {
                    await reaction.users.fetch().catch(err => console.error(`Failed to fetch users for ${reaction.emoji.name}:`, err));
                })
            );

            // Retrieve users for each reaction
            const reaction16 = message.reactions.cache.find(r => r.emoji.name === "16" || r.emoji.id === emoji_16);
            const users16 = reaction16 ? await reaction16.users.fetch().then(users => [...users.values()].filter(user => !user.bot)) : [];

            const reaction20 = message.reactions.cache.find(r => r.emoji.name === "20" || r.emoji.id === emoji_20);
            const users20 = reaction20 ? await reaction20.users.fetch().then(users => [...users.values()].filter(user => !user.bot)) : [];

            const reaction23 = message.reactions.cache.find(r => r.emoji.name === "23" || r.emoji.id === emoji_23);
            const users23 = reaction23 ? await reaction23.users.fetch().then(users => [...users.values()].filter(user => !user.bot)) : [];

            // Format user lists
            const users16List = users16.length > 0 ? users16.map(user => user.displayName).join("\n") : "No players";
            const users20List = users20.length > 0 ? users20.map(user => user.displayName).join("\n") : "No players";
            const users23List = users23.length > 0 ? users23.map(user => user.displayName).join("\n") : "No players";

            // Update embed
            const embed = new EmbedBuilder()
                .setColor("#0099ff")
                .setTitle(scrimSettings[0]?.embed_title || "Scrim Availability")
                .setDescription("React to the time slots you can play.")
                .addFields(
                    { name: `${emoji_16} Players`, value: users16List, inline: true },
                    { name: `${emoji_20} Players`, value: users20List, inline: true },
                    { name: `${emoji_23} Players`, value: users23List, inline: true }
                );

            await message.edit({ embeds: [embed] });
            await interaction.editReply({ content: "Scrim availability updated successfully!" });

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

        await interaction.deferReply({ ephemeral: true });

        const scrimSettings = await executeQuery(`
            SELECT channel_id FROM scrim_settings WHERE guild_id = ?
        `, [guildId]);

        if (scrimSettings.length === 0 || !scrimSettings[0]?.channel_id) {
            return interaction.editReply({ content: "The scrim channel has not been set up! Use `/scrim channel` first.", ephemeral: true });
        }
        const channel_id = scrimSettings[0]?.channel_id;

        const scrimChannel = await client.channels.fetch(channel_id);

        if (!scrimChannel) {
            return interaction.editReply({ content: "Scrim channel not found. Please set the scrim channel first.", ephemeral: true });
        }

        const emojiRows = await executeQuery(`
            SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
            `, [guildId]);

        if (emojiRows.length === 0) {
            console.log(`No emoji settings found for ${guild.name} | (${guildId}).`);
            return interaction.editReply({ content: "Scrim emojis are not set. Please set the emojis first using `/scrim emojis`.", ephemeral: true });
        }

        const { emoji_16, emoji_20, emoji_23 } = emojiRows[0];

        const titleRows = await executeQuery(`
            SELECT embed_title FROM scrim_settings WHERE guild_id = ?`
            , [guildId]);

        const embedTitle = (titleRows.length > 0 && titleRows[0]?.embed_title) ? titleRows[0].embed_title : "Scrim Availability";

        const roleRows = await executeQuery(`
            SELECT role_id FROM scrim_settings WHERE guild_id = ?
            `, [guildId]);

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

            await executeQuery(`
                INSERT INTO channels (guild_id, scrim_message_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE scrim_message_id = VALUES(scrim_message_id);
            `, [guildId, embedMessage.id]);

            await embedMessage.react(emoji_16);
            await embedMessage.react(emoji_20);
            await embedMessage.react(emoji_23);

            if (roleMention) {
                await scrimChannel.send(roleMention);
            }

            // send confirmation
            await interaction.editReply({ content: "Scrim embed sent successfully!", ephemeral: true });

            // send discord log
            await sendLogEmbed(
                guildId, 
                `**Scrim Availability**\n\nThe scrim availability has been sent manually\n\n**Channel:** ${scrimChannel}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.ADD
            );

        } catch (error) {
            console.error(`[${guild.name} | ${guildId}] Error sending scrim embed:`, error);
            await interaction.editReply({ content: "An error occurred while sending the scrim embed.", ephemeral: true });
        }
        
    },

    development: false
};