import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags, AttachmentBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";

import path from "path";

const imagePath = path.resolve("src", "assets", "roster_image.jpg");
const imageAttachment = new AttachmentBuilder(imagePath);

export default {
    data: new SlashCommandBuilder()
        .setName('roster')
        .setDescription('Manage the team roster')
        // add
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a player to the roster')
                .addUserOption(option =>
                    option.setName('player')
                        .setDescription('Select a Discord user')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Select a role for the player')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Member', value: 'member' },
                            { name: 'Elite', value: 'elite' },
                            { name: 'Leader', value: 'leader' },
                            { name: 'Owner', value: 'owner' }
                        )
                )
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Set the name of the player')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Set the flag of the player')
                        .setRequired(true)
                )
        )
        // remove
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a player from the roster')
                .addUserOption(option =>
                    option.setName('player')
                        .setDescription('Select a Discord user')
                        .setRequired(true)
                )
        )
        // title
        .addSubcommand(subcommand =>
            subcommand
                .setName('title')
                .setDescription('Change the title of the roster embed')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Set the title of the roster embed')
                        .setRequired(true)
                )
        )
        // fix
        .addSubcommand(subcommand =>
            subcommand.setName('fix')
                .setDescription('Resends the roster embed with stored data')
        )
        // edit
        .addSubcommand(subcommand =>
            subcommand.setName('edit')
                .setDescription('Update the an existing player in the roster')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Select a Discord user')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('field')
                        .setDescription('What field to edit. (name, role, flag)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Name', value: 'player_name' },
                            { name: 'Role', value: 'member_level' },
                            { name: 'Flag', value: 'flag_emoji' }
                        )
                )
                .addStringOption(option =>
                    option.setName('new_value')
                        .setDescription('New value for the selected field')
                        .setRequired(true)
                )
        )
        // channel
        .addSubcommand(subcommand =>
            subcommand.setName('channel')
                .setDescription('Set the channel for the roster embed')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Select the channel for the roster embed')
                        .setRequired(true)
                )
        )
        // seperate sub command for festina
        .addSubcommand(subcommand =>
            subcommand.setName('embed')
                .setDescription('Set the embed picture for the roster embed')
        )
        // emojis
        .addSubcommand(subcommand =>
            subcommand.setName('emojis')
                .setDescription('Set the emojis for each role')
                .addStringOption(option =>
                    option.setName('owner')
                        .setDescription('Set the emoji for the owner role')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('leader')
                        .setDescription('Set the emoji for the leader role')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('elite')
                        .setDescription('Set the emoji for the elite role')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('member')
                        .setDescription('Set the emoji for the member role')
                        .setRequired(true)
                )
        ),

        async execute(interaction) {

            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();

            // Admin Permission Check for sub commands
            if (["add", "remove", "title", "fix", "edit", "channel", "emojis"].includes(subcommand)) {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", ephemeral: true });
                }
            }

            const channelRows = await executeQuery(`
                SELECT * FROM channels WHERE guild_id = ? AND type = "roster"
            `, [guildId]);

            // check if roster settings exist
            if(channelRows.length === 0) {
                // Initialize roster settings if not present
                await executeQuery(`
                    INSERT INTO channels (guild_id, type) VALUES (?, "roster")
                `, [guildId]);
                console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
            }

            if (subcommand === 'channel') {
                await this.setRosterChannel(interaction);
                return;
            }

            // Check if roster channel is set
            if (!channelRows[0]?.roster_channel_id) {
                return interaction.reply({ content: "The roster channel has not been set up! Use `/roster channel` first.", ephemeral: true });
            }
        
            const rosterChannelId = channelRows[0].roster_channel_id;
            const rosterChannel = await interaction.guild.channels.fetch(rosterChannelId);
        
            if (!rosterChannel) {
                return interaction.reply({ content: "The roster channel no longer exists! Use `/roster channel` again.", ephemeral: true });
            }
        
            if (subcommand === 'add') {
                await this.addPlayer(interaction);
            } else if (subcommand === 'remove') {
                await this.removePlayer(interaction);
            } else if (subcommand === 'title') {
                await this.updateRosterTitle(interaction);
            } else if (subcommand === 'fix') {
                await this.fixRosterEmbed(interaction);
            } else if (subcommand === 'edit') {
                await this.editRosterMember(interaction);
            } else if (subcommand === 'emojis') {
                await this.setRosterEmojis(interaction);
            }

            if(subcommand === 'embed') {

                const embed = new EmbedBuilder()
                    .setImage('attachment://roster_image.jpg')
                    .setColor(0xFFFFFF)
                await rosterChannel.send({ embeds: [embed], files: [imageAttachment] });
                await interaction.reply({ content: "Roster embed image has been sent to the roster channel.", ephemeral: true, files: [imageAttachment] });
            }
        },
        
        async addPlayer(interaction) {

            const guildId = interaction.guild.id;
            const user = interaction.options.getUser('player');
            const playerName = interaction.options.getString('name');
            const level = interaction.options.getString('role');
            const emoji = interaction.options.getString('emoji');
            const role = interaction.options.getString("role");
        
            try {

                // Validate user input
                if(!user) {
                    return interaction.reply({ content: "Please specify a user to add to the roster.", ephemeral: true });
                }

                if(!playerName) {
                    return interaction.reply({ content: "Please provide a valid player name.", ephemeral: true });
                }

                if(!level) {
                    return interaction.reply({ content: "Please select a valid role for the player.", ephemeral: true });
                }

                if(!emoji) {
                    return interaction.reply({ content: "Please provide a valid flag emoji for the player.", ephemeral: true });
                }

                if(!role) {
                    return interaction.reply({ content: "Please select a valid role for the player.", ephemeral: true });
                }

                // Check if the user is already in the roster
                const rosterRows = await executeQuery(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                // If the user is already in the roster, return an error message
                if (rosterRows.length > 0) {
                    return interaction.reply({ content: `<@${user.id}> is already in the roster!`, ephemeral: true });
                }
        
                // Insert the new player into the roster
                await executeQuery(`
                    INSERT INTO roster (discord_id, guild_id, player_name, member_level, flag_emoji) 
                    VALUES (?, ?, ?, ?, ?) 
                    ON DUPLICATE KEY UPDATE player_name = VALUES(player_name), member_level = VALUES(member_level), flag_emoji = VALUES(flag_emoji);
                `, [user.id, guildId, playerName, level, emoji]);
        
                // Log the addition
                await sendLogEmbed(
                    guildId, 
                    `**Roster Addition**\n\nA new player has been added to the roster\n\n**Player:** ${user}\n\n**Role:** ${role}\n**By:** <@${interaction.user.id}>.`
                    , COLOUR_VALUES.ADD
                );
                await interaction.reply({ content: `<@${user.id}> has been added to the roster as ${level}!`, ephemeral: true });
        
                // Update the roster embed
                await this.updateRosterEmbed(interaction);
            } catch (error) {
                console.error("Error adding player:", error);
                await interaction.reply({ content: "An error occurred while adding this player.", ephemeral: true });
            }
        },
        
        async removePlayer(interaction) {

            const guildId = interaction.guild.id;
            const user = interaction.options.getUser('player');
        
            try {

                if (!user) {
                    return interaction.reply({ content: "Please specify a user to remove from the roster.", ephemeral: true });
                }

                // Check if the user is in the roster
                const rosterRows = await executeQuery(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                if (rosterRows.length === 0) {
                    return interaction.reply({ content: `<@${user.id}> is not in the roster!`, ephemeral: true });
                }
        
                // Remove the player from the roster
                await executeQuery(`
                    DELETE FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                // Log the removal
                await sendLogEmbed(
                    guildId, 
                    `**Roster Removal**\n\nA Player has been removed from the roster\n\n**Player:** ${user} \n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.REMOVE
                );
                await interaction.reply({ content: `<@${user.id}> has been removed from the roster.`, ephemeral: true });
        
                // Update the roster embed
                await this.updateRosterEmbed(interaction);
            } catch (error) {
                console.error("Error removing player:", error);
                await interaction.reply({ content: "An error occurred while removing this player.", ephemeral: true });
            }
        },
        
        async updateRosterEmbed(interaction) {

            const client = interaction.client;
            const guildId = interaction.guild.id;
            const serverName = interaction.guild.name;

            try {

                // 🔹 Fetch stored embed message ID
                const rosterRows = await executeQuery(`
                    SELECT roster_message_id, roster_channel_id FROM channels WHERE guild_id = ?
                `, [guildId]);

                if(rosterRows.length === 0) {
                    console.error(`No roster settings found in the database for server: ${serverName} ID: ${guildId}`);
                    return;
                }
        
                if (!rosterRows[0]?.roster_channel_id) {
                    console.error(`No roster channel found in the database for server: ${serverName} ID: ${guildId}`);
                    return;
                }

                // 🔹 Fetch the roster channel
                // If roster_channel_id is not set, log an error and return
                const rosterChannelId = rosterRows.length > 0 ? rosterRows[0].roster_channel_id : null;
                if (!rosterChannelId) {
                    console.error(`No roster channel ID found in the database for server: ${serverName} ID: ${guildId}`);
                    return;
                }

                // Fetch the roster channel using the ID
                const rosterChannel = await client.channels.fetch(rosterChannelId).catch(error => {
                    console.error(`Error fetching roster channel for server: ${serverName} ID: ${guildId}`, error);
                    return null;
                });

                if(!rosterRows[0]?.roster_message_id) {
                    console.error(`No roster message ID found in the database for server: ${serverName} ID: ${guildId}`);
                    return;
                }

                // fetch the roster message ID from the database
                const rosterMessageId = rosterRows.length > 0 ? rosterRows[0].roster_message_id : null;
                let rosterMessage = rosterMessageId ? await rosterChannel.messages.fetch(rosterMessageId).catch(error => {
                    console.error(`Error fetching roster message for server: ${serverName} ID: ${guildId}`, error);
                    return null;
                }) : null;

                // 🔹 Fetch stored embed title
                const titleRow = await executeQuery(`
                    SELECT embed_title FROM roster_settings WHERE guild_id = ?
                `, [guildId]);
                
                // If no title is set, use a default title
                const embedTitle = titleRow.length > 0 ? titleRow[0]?.embed_title : "Team Roster";
                
                // 🔹 Retrieve and format player data
                const rosterPlayers = await executeQuery(`
                    SELECT * FROM roster WHERE guild_id = ? ORDER BY FIELD(member_level, "owner", "leader", "elite", "member")
                `, [guildId]);
        
                const emojiSettings = await executeQuery(`
                    SELECT owner_emoji, leader_emoji, elite_emoji, member_emoji FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                const roleEmojis = {
                    owner: emojiSettings[0]?.owner_emoji || '',
                    leader: emojiSettings[0]?.leader_emoji || '',
                    elite: emojiSettings[0]?.elite_emoji || '',
                    member: emojiSettings[0]?.member_emoji || ''
                };

                let description = rosterPlayers.length === 0 
                ? '**No players have been added yet!**\n\nUse `/roster add` to add a player.\nUse `/roster remove` to remove a player.\nUse `/roster title` to change the roster title.\n\nYour roster will update here as changes are made.'
                : '';
        
                if (rosterPlayers.length > 0) {
                    const roles = { owner: '**OWNER**', leader: '**LEADER**', elite: '**ELITE MEMBER**', member: '**MEMBER**' };
                    for (const role of Object.keys(roles)) {
                        const rolePlayers = rosterPlayers.filter(p => p.member_level === role);
                        if (rolePlayers.length > 0) {
                            description += `\n\n${roles[role]}\n`;
                            description += rolePlayers.map(player => ` ${roleEmojis[role]} | ${player.flag_emoji} | ${player.player_name}`).join('\n') + '\n';
                        }
                    }
                }
        
                const rosterEmbed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setColor(0xFFFFFF)
                    .setDescription(description)
                    .setFooter({ text: `Last updated: ${new Date().toLocaleString()}` });
        
                // Ensure the existing embed is updated instead of sending a new one
                if (rosterMessage) {
                    await rosterMessage.edit({ embeds: [rosterEmbed] });
                } else {
                    rosterMessage = await rosterChannel.send({ embeds: [rosterEmbed] });
        
                    if (rosterMessage) {
                        await executeQuery(`
                            UPDATE channels SET roster_message_id = ? WHERE guild_id = ?
                        `, [rosterMessage.id, guildId]);
                    }
                }
            } catch (error) {
                console.error(`Error updating roster for server: ${serverName} ID: ${guildId}`, error);
            }
        },

        async updateRosterTitle(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;
            const newTitle = interaction.options.getString("title");
        
            try {

                const rosterSettings = await executeQuery(`
                    SELECT * FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                if (rosterSettings.length === 0) {
                    await executeQuery(`
                        INSERT INTO roster_settings (guild_id, embed_title) VALUES (?, ?)
                    `, [guildId, newTitle]);
                    console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
                } else {
                    // Update the existing title
                    await executeQuery(`
                        UPDATE roster_settings SET embed_title = ? WHERE guild_id = ?
                    `, [newTitle, guildId]);
                }
            
                // Update the roster embed with the new title
                await sendLogEmbed(
                    guildId, 
                    `**Roster Settings Updated**\n\nThe roster title has been updated\n\n**New title:** ${newTitle}\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.EDIT
                );
                await interaction.reply({ content: `Roster title updated to **${newTitle}**!`, ephemeral: true });
            
                // After updating the title, check if the roster channel exists and update the embed
                const channelRows = await executeQuery(`
                    SELECT roster_channel_id FROM channels WHERE guild_id = ?
                `, [guildId]);
            
                if (channelRows.length > 0) {
                    await this.updateRosterEmbed(interaction);
                }
            } catch (error) {
                console.error(`Failed to set roster title for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting the roster title.", ephemeral: true });
            }
        },

        async fixRosterEmbed(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            try {
                const channelRows = await executeQuery(`
                    SELECT * FROM channels WHERE guild_id = ?
                `, [guildId]);

                if(channelRows.length === 0) {
                    // Initialize roster settings if not present
                    await executeQuery(`
                        INSERT INTO channels (guild_id, type) VALUES (?, "roster")
                    `, [guildId]);
                    console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
                }

                if(!channelRows[0]?.roster_channel_id) {
                    console.error(`No roster channel found in the database for server: ${serverName} ID: ${guildId}`);
                    return interaction.reply({ content: "No roster channel found! Use `/roster channel` first.", ephemeral: true });
                }

                // Fetch the roster channel using the ID
                const channel = interaction.guild.channels.cache.get(channelRows[0].roster_channel_id);
                if (!channel) {
                    return interaction.reply({ content: "Roster channel is invalid or missing.", ephemeral: true });
                }

                // Check if an existing roster message exists and delete it
                if (channelRows[0]?.roster_message_id) {
                    try {
                        const oldMessage = await channel.messages.fetch(channelRows[0]?.roster_message_id);
                        await oldMessage.delete();
                        console.log("Old roster embed deleted.");
                    } catch (error) {
                        console.error(`Failed to delete previous roster embed for server: ${serverName} ID: ${guildId}`, error);
                    }
                }

                // Fetch stored roster data sorted by hierarchy
                const rosterData = await executeQuery(`
                    SELECT player_name, member_level, flag_emoji 
                    FROM roster 
                    WHERE guild_id = ? 
                    ORDER BY FIELD(member_level, 'owner', 'leader', 'elite', 'member')
                `, [guildId]);

                if (!rosterData.length) {
                    return interaction.reply({ content: "No players found in the roster!", ephemeral: true });
                }

                // Group players by role
                const roleSections = {
                    owner: "**OWNER**",
                    leader: "**LEADER**",
                    elite: "**ELITE**",
                    member: "**MEMBER**"
                };

                let description = "";

                for (const role of ["owner", "leader", "elite", "member"]) {
                    const players = rosterData.filter(player => player.member_level === role);
                    if (players.length > 0) {
                        description += `\n\n${roleSections[role]}\n`;
                        description += players.map(player => `${player.flag_emoji} **${player.player_name}**`).join("\n");
                    }
                }

                const extraRosterData = await executeQuery(`
                    SELECT embed_title FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                // Use stored embed title
                const embed = {
                    title: extraRosterData[0]?.embed_title || "Team Roster",
                    description,
                    color: 0xFFFFFF,
                };

                const message = await channel.send({ embeds: [embed] });

                // Store the new message ID
                await executeQuery(`
                    UPDATE channels SET roster_message_id = ? WHERE guild_id = ?
                `, [message.id, guildId]);

                sendLogEmbed(
                    guildId, 
                    `**Roster restoration**\n\nThe roster has been restored\n\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.ADD
                );
                return interaction.reply({ content: "Roster has been restored", ephemeral: true });
            } catch (error) {
                console.error(`Failed to fix roster for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while fixing the roster.", ephemeral: true });
            }
        },

        async editRosterMember(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            try {
                const user = interaction.options.getUser('user');
                const field = interaction.options.getString('field');
                const newValue = interaction.options.getString('new_value');

                if(!user) {
                    return interaction.reply({ content: "Please specify a user to edit in the roster.", ephemeral: true });
                }

                if(!field) {
                    return interaction.reply({ content: "Please specify a field to edit (name, role, flag).", ephemeral: true });
                }

                if(!newValue) {
                    return interaction.reply({ content: "Please provide a new value for the selected field.", ephemeral: true });
                }

                if (field === 'member_level' && !['owner', 'leader', 'elite', 'member'].includes(newValue.toLowerCase())) {
                    return interaction.reply({ content: "Invalid role! Please choose from Owner, Leader, Elite, or Member.", ephemeral: true });
                }

                // Ensure the user exists in the roster
                const rosterRows = await executeQuery(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);

                if (!rosterRows.length) {
                    return interaction.reply({ content: `This user is not in the roster.`, ephemeral: true });
                }

                // Update the field in the database
                await executeQuery(`
                    UPDATE roster SET ${field} = ? WHERE discord_id = ? AND guild_id = ?
                `, [newValue, user.id, guildId]);

                // Update the roster embed with the new value
                await this.updateRosterEmbed(interaction);

                // log
                await sendLogEmbed(
                    guildId, 
                    `**Roster Player Adjustment**\n\nA player on the roster has been edited\n\n**Player:** ${user.username}\n**Field:** ${field}\n**New Value:** ${newValue}\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.ADD
                );

                // Log the edit
                return interaction.reply({ 
                    content: `Updated **${field}** for **${user.username}** to \`${newValue}\`.`, 
                    ephemeral: true 
                });
                } catch (error) {
                console.error(`Failed to edit roster for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while editing the roster.", ephemeral: true });
            }
        },

        async setRosterChannel(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;
            const rosterChannel = interaction.options.getChannel("channel");

            try {
                
                if(!rosterChannel) {
                    return interaction.reply({ content: "Please provide a valid roster channel!", flags: MessageFlags.Ephemeral });
                }

                const channelRows = await executeQuery(`
                    SELECT * FROM channels WHERE guild_id = ? AND type = "roster"
                `, [guildId]);

                if(channelRows.length === 0) {
                    // Initialize roster settings if not present
                    await executeQuery(`
                        INSERT INTO channels (guild_id, type) VALUES (?, "roster")
                    `, [guildId]);
                    console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
                }

                await executeQuery(`
                    INSERT INTO channels (guild_id, roster_channel_id, type)
                    VALUES (?, ?, "roster")
                    ON DUPLICATE KEY UPDATE roster_channel_id = VALUES(roster_channel_id), type = "roster";
                `, [guildId, rosterChannel.id]);

                const rosterSettings = await executeQuery(`
                    SELECT * FROM roster_settings WHERE guild_id = ?;
                `, [guildId]);

                // Get the embed title from the settings or use a default title
                const rosterTitle = rosterSettings[0]?.embed_title || "Team Roster";

                // Default roster description if no players are added yet
                let rosterDescription =
                '**No players have been added yet!**\n\n'
                + 'Use `/roster add` to add a player to the roster.\n'
                + 'Use `/roster remove` to remove a player from the roster.\n'
                + 'Use `/roster edit` to update a player’s role, name, or flag.\n'
                + 'Use `/roster title` to change the roster embed title.\n\n'
                + 'Your roster will update here as changes are made.';

                // Send Default Roster Embed
                const rosterEmbed = new EmbedBuilder()
                    .setTitle(rosterTitle)
                    .setColor(0xFFFFFF)
                    .setDescription(rosterDescription)
                    .setFooter({ text: `Setup by ${interaction.user.username}` });

                // Send the embed to the specified roster channel
                const rosterMessage = await rosterChannel.send({ embeds: [rosterEmbed] });

                // Store Embed Message ID in Database
                await executeQuery(`
                    INSERT INTO channels (guild_id, roster_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE roster_message_id = VALUES(roster_message_id);
                `, [guildId, rosterMessage.id]);

                // Log the setup
                await sendLogEmbed(
                    guildId, 
                    `**Roster Settings Updated**\n\nThe Roster channel has been updated\n**Channel:** ${rosterChannel}\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.ADD
                );
                return interaction.reply({ content: `Roster channel successfully set! The roster embed has been sent to <#${rosterChannel.id}>`, ephemeral: true });
            } catch (error) {
                console.error(`Failed to set roster channel for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting up the roster channel.", ephemeral: true });
            }
        },

        async setRosterEmojis(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            const ownerEmoji = interaction.options.getString('owner');
            const leaderEmoji = interaction.options.getString('leader');
            const eliteEmoji = interaction.options.getString('elite');
            const memberEmoji = interaction.options.getString('member');
            
            try {

                if(!ownerEmoji) {
                    return interaction.reply({ content: "Please provide a valid emoji for the owner role.", ephemeral: true });
                }

                if(!leaderEmoji) {
                    return interaction.reply({ content: "Please provide a valid emoji for the leader role.", ephemeral: true });
                }

                if(!eliteEmoji) {
                    return interaction.reply({ content: "Please provide a valid emoji for the elite role.", ephemeral: true });
                }

                if(!memberEmoji) {
                    return interaction.reply({ content: "Please provide a valid emoji for the member role.", ephemeral: true });
                }

                // Check if roster settings exist
                const rosterRows = await executeQuery(`
                    SELECT * FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                if(rosterRows.length === 0) {
                    // Initialize roster settings if not present
                    await executeQuery(`
                        INSERT INTO roster_settings (guild_id) VALUES (?)
                    `, [guildId]);
                    console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
                }

                // Insert or update the emojis in the roster_settings table
                await executeQuery(`
                    INSERT INTO roster_settings (guild_id, owner_emoji, leader_emoji, elite_emoji, member_emoji) 
                    VALUES (?, ?, ?, ?, ?) 
                    ON DUPLICATE KEY UPDATE 
                    owner_emoji = IF(VALUES(owner_emoji) IS NOT NULL, VALUES(owner_emoji), owner_emoji),
                    leader_emoji = IF(VALUES(leader_emoji) IS NOT NULL, VALUES(leader_emoji), leader_emoji),
                    elite_emoji = IF(VALUES(elite_emoji) IS NOT NULL, VALUES(elite_emoji), elite_emoji),
                    member_emoji = IF(VALUES(member_emoji) IS NOT NULL, VALUES(member_emoji), member_emoji);
                `, [guildId, ownerEmoji, leaderEmoji, eliteEmoji, memberEmoji]);

                // Send logs
                await sendLogEmbed(
                    guildId, 
                    `**Roster Settings Updated**\n\nThe Roster Emojis have been updated\n\n**Owner Emoji:** ${ownerEmoji}\n**Leader Emoji:** ${leaderEmoji}\n**Elite Emoji:** ${eliteEmoji}\n**Member Emoji:** ${memberEmoji}\n**By:** ${interaction.user.username}`, 
                    COLOUR_VALUES.EDIT);
                return interaction.reply({
                    content: `Roster emojis updated:\nOwner: ${ownerEmoji}\nLeader: ${leaderEmoji}\nElite: ${eliteEmoji}\nMember: ${memberEmoji}`,
                    ephemeral: true
            });
            } catch (error) {
                console.error(`Failed to set roster emojis for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting the roster emojis.", ephemeral: true });
            }
        },

        devlopment: false,
};