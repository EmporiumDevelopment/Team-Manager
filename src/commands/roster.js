import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags, AttachmentBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";

import path from "path";
import { safeReply } from "../utils/interactionReply.js";
import { cleanPlayerName } from "../utils/playerNames.js";

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
            // cleanup
            .addSubcommand(subcommand =>
                subcommand.setName('cleanup')
                    .setDescription('Remove roster entries for users who are no longer in the server')
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
        )
        // role
        .addSubcommand(subcommand =>
            subcommand.setName('role')
                .setDescription('Set the role to be given for each role')
                .addRoleOption(option =>
                    option.setName('owner')
                        .setDescription('Set the role for the owner')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('leader')
                        .setDescription('Set the role for the leader')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('elite')
                        .setDescription('Set the role for the elite')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('member')
                        .setDescription('Set the role for the member')
                        .setRequired(true)
                )
        ),

        async execute(interaction) {

            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();

            // Admin Permission Check for sub commands
            // Every subcommand changes the roster or posts to it ("role" and "embed" were
            // previously missing here, letting any member change the auto-assigned roles).
            if (["add", "remove", "title", "fix", "edit", "channel", "emojis", "cleanup", "role", "embed"].includes(subcommand)) {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", ephemeral: true });
                }
            }

            const rosterSettings = await executeQuery(`
                SELECT * FROM roster_settings WHERE guild_id = ?
            `, [guildId]);

            // check if roster settings exist
            if(rosterSettings.length === 0) {
                // Initialize roster settings if not present
                await executeQuery(`
                    INSERT INTO roster_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
            }

            if (subcommand === 'channel') {
                await this.setRosterChannel(interaction);
                return;
            }

            // Check if roster channel is set
            if (!rosterSettings[0]?.channel_id) {
                return interaction.reply({ content: "The roster channel has not been set up! Use `/roster channel` first.", ephemeral: true });
            }
        
            const rosterChannelId = rosterSettings[0].channel_id;
            const rosterChannel = await interaction.guild.channels.fetch(rosterChannelId).catch(() => null);
        
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
                } else if (subcommand === 'cleanup') {
                    await this.cleanupRoster(interaction);
            } else if (subcommand === 'role') {
                await this.setRole(interaction);
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
            const userRole = interaction.options.getString('role');
        
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


                // Check if the user is already in the roster
                const roster = await executeQuery(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                // If the user is already in the roster, return an error message
                if (roster.length > 0) {
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
                    `**Roster Addition**\n\nA new player has been added to the roster\n\n**Player:** ${cleanPlayerName(playerName)}\n\n**Role:** ${userRole}\n**By:** <@${interaction.user.id}>.`
                    , COLOUR_VALUES.ADD
                );
                await interaction.reply({ content: `<@${user.id}> has been added to the roster as ${level}!`, ephemeral: true });

                // give player role
                const roleError = await this.syncLevelRole(interaction.guild, user.id, null, level);
                if (roleError) await safeReply(interaction, roleError);

                // Update the roster embed
                await this.updateRosterEmbed(interaction);
            } catch (error) {
                console.error("Error adding player:", error);
                await safeReply(interaction, "An error occurred while adding this player.");
            }
        },

        // Swaps the Discord role tied to a roster level (owner/leader/elite/member).
        // Pass oldLevel = null when adding, newLevel = null when removing. Returns a
        // user-facing warning string if the role change failed, otherwise null.
        async syncLevelRole(guild, userId, oldLevel, newLevel) {
            const rosterSettings = await executeQuery(`
                SELECT owner_role_id, leader_role_id, elite_role_id, member_role_id
                FROM roster_settings
                WHERE guild_id = ?;
            `, [guild.id]);

            const settings = rosterSettings[0] || {};
            const roleIdFor = level => level ? settings[`${level}_role_id`] : null;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return null; // user left the server — nothing to change

            try {
                const oldRoleId = roleIdFor(oldLevel);
                const newRoleId = roleIdFor(newLevel);
                if (oldRoleId && oldRoleId !== newRoleId && member.roles.cache.has(oldRoleId)) {
                    await member.roles.remove(oldRoleId);
                }
                if (newRoleId && guild.roles.cache.has(newRoleId)) {
                    await member.roles.add(newRoleId);
                }
                return null;
            } catch (error) {
                console.error(`Failed to update roster role for ${userId} in guild ${guild.id}:`, error);
                return "The roster was updated, but I couldn't change their Discord role. Make sure my role is above the roster roles and I have **Manage Roles**.";
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

                // Remove the role from the user (skipped if they already left the server,
                // which used to throw and leave them stuck on the roster)
                const roleError = await this.syncLevelRole(interaction.guild, user.id, rosterRows[0].member_level, null);

                // Remove the player from the roster
                await executeQuery(`
                    DELETE FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                // Log the removal
                await sendLogEmbed(
                    guildId, 
                    `**Roster Removal**\n\nA Player has been removed from the roster\n\n**Player:** ${cleanPlayerName(rosterRows[0].player_name) || user.username}\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.REMOVE
                );
                await interaction.reply({ content: `<@${user.id}> has been removed from the roster.`, ephemeral: true });
                if (roleError) await safeReply(interaction, roleError);

                // Update the roster embed
                await this.updateRosterEmbed(interaction);
            } catch (error) {
                console.error("Error removing player:", error);
                await safeReply(interaction, "An error occurred while removing this player.");
            }
        },
        
        // Builds the roster embed from the database.
        async buildRosterEmbed(guildId) {

            const [settings] = await executeQuery(`
                SELECT embed_title, owner_emoji, leader_emoji, elite_emoji, member_emoji
                FROM roster_settings WHERE guild_id = ?
            `, [guildId]);

            const rosterPlayers = await executeQuery(`
                SELECT player_name, member_level, flag_emoji FROM roster
                WHERE guild_id = ? ORDER BY FIELD(member_level, "owner", "leader", "elite", "member")
            `, [guildId]);

            const roleEmojis = {
                owner: settings?.owner_emoji || '',
                leader: settings?.leader_emoji || '',
                elite: settings?.elite_emoji || '',
                member: settings?.member_emoji || ''
            };

            let description = rosterPlayers.length === 0
                ? '**No players have been added yet!**\n\nUse `/roster add` to add a player.\nUse `/roster remove` to remove a player.\nUse `/roster title` to change the roster title.\n\nYour roster will update here as changes are made.'
                : '';

            const roles = { owner: '**OWNER**', leader: '**LEADER**', elite: '**ELITE MEMBER**', member: '**MEMBER**' };
            for (const role of Object.keys(roles)) {
                const rolePlayers = rosterPlayers.filter(p => p.member_level === role);
                if (rolePlayers.length > 0) {
                    description += `\n\n${roles[role]}\n`;
                    description += rolePlayers.map(player => ` ${roleEmojis[role]} | ${player.flag_emoji} | ${player.player_name}`).join('\n') + '\n';
                }
            }

            return new EmbedBuilder()
                .setTitle(settings?.embed_title || "Team Roster")
                .setColor(0xFFFFFF)
                .setDescription(description.slice(0, 4096))
                .setFooter({ text: `Last updated: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}` });
        },

        // Edits the stored roster message, or sends a new one if it is missing/deleted.
        // Never replies to the interaction (refreshRosterEmbed passes a stub). Returns
        // a problem description string, or null on success.
        async updateRosterEmbed(interaction) {

            const guild = interaction.guild;
            const guildId = guild.id;

            try {
                const [settings] = await executeQuery(`
                    SELECT message_id, channel_id FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                if (!settings?.channel_id) return "No roster channel set. Use `/roster channel` first.";

                const rosterChannel = await guild.channels.fetch(settings.channel_id).catch(() => null);
                if (!rosterChannel) return "The roster channel no longer exists. Use `/roster channel` again.";

                const rosterEmbed = await this.buildRosterEmbed(guildId);

                const rosterMessage = settings.message_id
                    ? await rosterChannel.messages.fetch(settings.message_id).catch(() => null)
                    : null;

                if (rosterMessage) {
                    await rosterMessage.edit({ embeds: [rosterEmbed] });
                    return null;
                }

                const me = guild.members.me;
                if (me && !rosterChannel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
                    return "I do not have permission to send messages in the roster channel.";
                }

                const newMessage = await rosterChannel.send({ embeds: [rosterEmbed] });
                await executeQuery(`
                    UPDATE roster_settings SET message_id = ? WHERE guild_id = ?
                `, [newMessage.id, guildId]);
                return null;
            } catch (error) {
                console.error(`Error updating roster for server: ${guild.name} ID: ${guildId}`, error);
                return "Failed to update the roster embed.";
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
                    SELECT channel_id FROM roster_settings WHERE guild_id = ?
                `, [guildId]);
            
                if (channelRows.length > 0) {
                    await this.updateRosterEmbed(interaction);
                }
            } catch (error) {
                console.error(`Failed to set roster title for server: ${serverName} ID: ${guildId}:`, error);
                return safeReply(interaction, "An error occurred while setting the roster title.");
            }
        },

        // Deletes the current roster message (if any) and posts a fresh one.
        async fixRosterEmbed(interaction) {

            const guild = interaction.guild;
            const guildId = guild.id;

            await interaction.deferReply({ ephemeral: true });

            const [settings] = await executeQuery(`
                SELECT channel_id, message_id FROM roster_settings WHERE guild_id = ?
            `, [guildId]);

            if (settings?.channel_id && settings?.message_id) {
                const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
                const oldMessage = channel ? await channel.messages.fetch(settings.message_id).catch(() => null) : null;
                await oldMessage?.delete().catch(error =>
                    console.error(`Failed to delete previous roster embed for server: ${guild.name} ID: ${guildId}`, error)
                );
                await executeQuery(`UPDATE roster_settings SET message_id = NULL WHERE guild_id = ?`, [guildId]);
            }

            const problem = await this.updateRosterEmbed(interaction);
            if (problem) {
                return interaction.editReply({ content: problem });
            }

            sendLogEmbed(
                guildId,
                `**Roster restoration**\n\nThe roster has been restored\n\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.ADD
            );
            return interaction.editReply({ content: "Roster has been restored" });
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

                const storedValue = field === 'member_level' ? newValue.toLowerCase() : newValue;

                // Update the field in the database
                await executeQuery(`
                    UPDATE roster SET ${field} = ? WHERE discord_id = ? AND guild_id = ?
                `, [storedValue, user.id, guildId]);

                // A level change also swaps their Discord role (previously only the
                // roster text changed, leaving the old role in place).
                const roleError = field === 'member_level'
                    ? await this.syncLevelRole(interaction.guild, user.id, rosterRows[0].member_level, storedValue)
                    : null;

                // Update the roster embed with the new value
                await this.updateRosterEmbed(interaction);

                // log
                await sendLogEmbed(
                    guildId, 
                    `**Roster Player Adjustment**\n\nA player on the roster has been edited\n\n**Player:** ${cleanPlayerName(rosterRows[0].player_name) || user.username}\n**Field:** ${field}\n**New Value:** ${newValue}\n**By:** <@${interaction.user.id}>.`, 
                    COLOUR_VALUES.ADD
                );

                // Log the edit
                return interaction.reply({
                    content: `Updated **${field}** for **${user.username}** to \`${storedValue}\`.${roleError ? `\n${roleError}` : ""}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error(`Failed to edit roster for server: ${serverName} ID: ${guildId}:`, error);
                return safeReply(interaction, "An error occurred while editing the roster.");
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
                    SELECT * FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                if(channelRows.length === 0) {
                    // Initialize roster settings if not present
                    await executeQuery(`
                        INSERT INTO roster_settings (guild_id) VALUES (?)
                    `, [guildId]);
                    console.log(`No roster settings found for guild: ${guildId}. Initialized default settings.`);
                }

                await executeQuery(`
                    INSERT INTO roster_settings (guild_id, channel_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id);
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
                    INSERT INTO roster_settings (guild_id, message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE message_id = VALUES(message_id);
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

        async setRole(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            const ownerEmoji = interaction.options.getRole('owner');
            const leaderEmoji = interaction.options.getRole('leader');
            const eliteEmoji = interaction.options.getRole('elite');
            const memberEmoji = interaction.options.getRole('member');

            try {

                if(!ownerEmoji) {
                    return interaction.reply({ content: "Please provide a valid role for the owner.", ephemeral: true });
                }

                if(!leaderEmoji) {
                    return interaction.reply({ content: "Please provide a valid role for the leader.", ephemeral: true });
                }

                if(!eliteEmoji) {
                    return interaction.reply({ content: "Please provide a valid role for elite member.", ephemeral: true });
                }

                if(!memberEmoji) {
                    return interaction.reply({ content: "Please provide a valid role for member.", ephemeral: true });
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

                // Insert or update the roles in the roster_settings table
                await executeQuery(`
                    INSERT INTO roster_settings (guild_id, owner_role_id, leader_role_id, elite_role_id, member_role_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    owner_role_id = IF(VALUES(owner_role_id) IS NOT NULL, VALUES(owner_role_id), owner_role_id),
                    leader_role_id = IF(VALUES(leader_role_id) IS NOT NULL, VALUES(leader_role_id), leader_role_id),
                    elite_role_id = IF(VALUES(elite_role_id) IS NOT NULL, VALUES(elite_role_id), elite_role_id),
                    member_role_id = IF(VALUES(member_role_id) IS NOT NULL, VALUES(member_role_id), member_role_id);
                `, [guildId, ownerEmoji.id, leaderEmoji.id, eliteEmoji.id, memberEmoji.id]);

                // Send logs
                await sendLogEmbed(
                    guildId, 
                    `**Roster Settings Updated**\n\nThe Roster Roles have been updated\n\n**Owner Role:** ${ownerEmoji}\n**Leader Role:** ${leaderEmoji}\n**Elite Role:** ${eliteEmoji}\n**Member Role:** ${memberEmoji}\n**By:** ${interaction.user.username}`, 
                    COLOUR_VALUES.EDIT
                );

                return interaction.reply({
                    content: `Roster roles updated:\nOwner: ${ownerEmoji}\nLeader: ${leaderEmoji}\nElite: ${eliteEmoji}\nMember: ${memberEmoji}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error(`Failed to set roster roles for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting the roster roles.", ephemeral: true });

            }
        },

        async refreshRosterEmbed(guild, client) {

            if (!guild) return;

            const rosterData = await executeQuery(`
                SELECT channel_id FROM roster_settings WHERE guild_id = ?
            `, [guild.id]);

            const channelId = rosterData[0]?.channel_id;

            const channel = channelId ? await guild.channels.fetch(channelId).catch(console.error) : null;

            if (!channel) {
                console.error(`No roster channel found for guild: ${guild.name} ID: ${guild.id}`);
                return;
            }

            const interaction = {
                guild,
                channel,
                client,
                user: { tag: 'System', id: '0' }, // optional, for logging
                reply: () => {}, // stub if needed
                deferReply: () => {}, // stub if needed
            };

            await this.updateRosterEmbed(interaction);
        },

        async cleanupRoster(interaction) {
            const guild = interaction.guild;
            const guildId = guild.id;

            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ ephemeral: true });
                }

                const rosterRows = await executeQuery(
                    `SELECT discord_id, player_name FROM roster WHERE guild_id = ?`,
                    [guildId]
                );

                if (!rosterRows.length) {
                    return interaction.editReply({ content: "No players found in the roster." });
                }

                // Fetch every member. If this THROWS, abort — do not delete on partial data.
                let allMembers;
                try {
                    allMembers = await guild.members.fetch();
                } catch (err) {
                    console.error("Bulk member fetch failed — is the GuildMembers intent enabled?", err);
                    return interaction.editReply({
                        content: "Couldn't fetch the member list, so cleanup was cancelled to avoid removing active players. Make sure the **Server Members Intent** is enabled.",
                    });
                }

                // Sanity check: if we fetched fewer members than the guild claims to have,
                // the list is incomplete — bail rather than risk a mass deletion.
                if (allMembers.size < guild.memberCount) {
                    console.error(`Fetched ${allMembers.size} members but guild has ${guild.memberCount}. Aborting cleanup.`);
                    return interaction.editReply({
                        content: `Member list looks incomplete (${allMembers.size}/${guild.memberCount} fetched), so cleanup was cancelled to be safe. Check the GuildMembers intent and try again.`,
                    });
                }

                const removed = [];
                let skippedNoId = 0;
                for (const row of rosterRows) {
                    // Rows without a stored discord_id can't be checked against the
                    // member list — skip them rather than delete on missing data.
                    if (!row.discord_id) {
                        skippedNoId++;
                        continue;
                    }
                    const id = String(row.discord_id); // guard against snowflake precision loss
                    if (!allMembers.has(id)) {
                        removed.push({ id, name: row.player_name });
                    }
                }
                if (skippedNoId > 0) {
                    console.warn(`Skipped ${skippedNoId} roster row(s) with no discord_id during cleanup.`);
                }

                if (removed.length === 0) {
                    return interaction.editReply({ content: "No absent members were found in the roster." });
                }

                const ids = removed.map(r => r.id);
                const placeholders = ids.map(() => '?').join(', ');
                await executeQuery(
                    `DELETE FROM roster WHERE guild_id = ? AND discord_id IN (${placeholders})`,
                    [guildId, ...ids]
                );

                const removedList = removed.map(r => cleanPlayerName(r.name) || r.id).join('\n');
                await sendLogEmbed(
                    guildId,
                    `**Roster Cleanup**\n\nRemoved ${removed.length} absent player(s):\n${removedList}\n\n**By:** <@${interaction.user.id}>.`,
                    COLOUR_VALUES.REMOVE
                );

                try {
                    await this.updateRosterEmbed(interaction);
                } catch (err) {
                    console.error('Failed to update roster embed after cleanup:', err);
                }

                return interaction.editReply({ content: `Removed ${removed.length} absent player(s) from the roster.` });
            } catch (error) {
                console.error(`Error cleaning up roster for guild ID: ${guildId}`, error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: "An error occurred while cleaning up the roster." }).catch(() => {});
                }
            }
        },

        development: false,
};