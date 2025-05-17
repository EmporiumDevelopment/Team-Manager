import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags } from "discord.js";
import db from "../database.js";
import { sendLogEmbed } from "../Utils/logger.js";

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

            if (subcommand === 'channel') {
                await this.setRosterChannel(interaction);
                return;
            }

            // Check if roster channel is set
            const [channelRows] = await db.execute(`
                SELECT roster_channel_id FROM channels WHERE guild_id = ? AND type = "roster"
            `, [guildId]);
        
            if (channelRows.length === 0 || !channelRows[0].roster_channel_id) {
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
        },
        
        async addPlayer(interaction) {

            const guildId = interaction.guild.id;
            const user = interaction.options.getUser('player');
            const playerName = interaction.options.getString('name');
            const level = interaction.options.getString('role');
            const emoji = interaction.options.getString('emoji');
            const role = interaction.options.getString("role");
        
            try {
                const [existingRows] = await db.execute(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                if (existingRows.length > 0) {
                    return interaction.reply({ content: `<@${user.id}> is already in the roster!`, ephemeral: true });
                }
        
                await db.execute(`
                    INSERT INTO roster (discord_id, guild_id, player_name, member_level, flag_emoji) 
                    VALUES (?, ?, ?, ?, ?) 
                    ON DUPLICATE KEY UPDATE player_name = VALUES(player_name), member_level = VALUES(member_level), flag_emoji = VALUES(flag_emoji);
                `, [user.id, guildId, playerName, level, emoji]);
        
                await sendLogEmbed(guildId, `**${playerName}** was added to the roster as **${role}** by <@${interaction.user.id}>.`, "add");
                await interaction.reply({ content: `<@${user.id}> has been added to the roster as ${level}!`, ephemeral: true });
        
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
                const [existingRows] = await db.execute(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);
        
                if (existingRows.length === 0) {
                    return interaction.reply({ content: `<@${user.id}> is not in the roster!`, ephemeral: true });
                }
        
                await db.execute(`
                    DELETE FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);

                const playerName = existingRows[0].player_name;
        
                await sendLogEmbed(guildId, `**${playerName}** was removed from the roster by <@${interaction.user.id}>.`, "remove");
                await interaction.reply({ content: `<@${user.id}> has been removed from the roster.`, ephemeral: true });
        
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
                const [rosterRows] = await db.execute(`
                    SELECT roster_message_id, roster_channel_id FROM channels WHERE guild_id = ?
                `, [guildId]);
        
                const rosterChannelId = rosterRows.length > 0 ? rosterRows[0].roster_channel_id : null;
                if (!rosterChannelId) {
                    console.error(`No roster channel ID found in the database for server: ${serverName} ID: ${guildId}`);
                    return;
                }

                const rosterChannel = await client.channels.fetch(rosterChannelId).catch(error => {
                    console.error(`Error fetching roster channel for server: ${serverName} ID: ${guildId}`, error);
                    return null;
                });

                const rosterMessageId = rosterRows.length > 0 ? rosterRows[0].roster_message_id : null;
                let rosterMessage = rosterMessageId ? await rosterChannel.messages.fetch(rosterMessageId).catch(error => {
                    console.error(`Error fetching roster message for server: ${serverName} ID: ${guildId}`, error);
                    return null;
                }) : null;

                // 🔹 Fetch stored embed title
                const [titleRow] = await db.execute(`
                    SELECT embed_title FROM roster_settings WHERE guild_id = ?
                `, [guildId]);
                
                const embedTitle = titleRow.length > 0 ? titleRow[0].embed_title : "Team Roster";
                
                // 🔹 Retrieve and format player data
                const [players] = await db.execute(`
                    SELECT * FROM roster WHERE guild_id = ? ORDER BY FIELD(member_level, "owner", "leader", "elite", "member")
                `, [guildId]);
        
                const [emojiSettings] = await db.execute(`
                    SELECT owner_emoji, leader_emoji, elite_emoji, member_emoji FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                const roleEmojis = {
                    owner: emojiSettings[0]?.owner_emoji || '',
                    leader: emojiSettings[0]?.leader_emoji || '',
                    elite: emojiSettings[0]?.elite_emoji || '',
                    member: emojiSettings[0]?.member_emoji || ''
                };

                let description = players.length === 0 
                ? '**No players have been added yet!**\n\nUse `/roster add` to add a player.\nUse `/roster remove` to remove a player.\nUse `/roster title` to change the roster title.\n\nYour roster will update here as changes are made.'
                : '';
        
                if (players.length > 0) {
                    const roles = { owner: '**OWNER**', leader: '**LEADER**', elite: '**ELITE MEMBER**', member: '**MEMBER**' };
                    for (const role of Object.keys(roles)) {
                        const rolePlayers = players.filter(p => p.member_level === role);
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
                        await db.execute(`
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
                await db.execute(`
                    UPDATE roster_settings SET embed_title = ? WHERE guild_id = ?
                `, [newTitle, guildId]);
            
                await sendLogEmbed(guildId, `Roster title was changed to **${newTitle}** by <@${interaction.user.id}>.`);
                await interaction.reply({ content: `Roster title updated to **${newTitle}**!`, flag: MessageFlags.ephemeral });
            
                const [channelRows] = await db.execute(`
                    SELECT roster_channel_id FROM channels WHERE guild_id = ?
                `, [guildId]);
            
                if (channelRows.length > 0) {
                    await this.updateRosterEmbed(interaction);
                }
            } catch (error) {
                console.error(`Failed to set roster title for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting the roster title.", flag: MessageFlags.Ephemeral });
            }
        },

        async fixRosterEmbed(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            try {
                const [result] = await db.execute(`
                    SELECT roster_channel_id, roster_message_id FROM channels WHERE guild_id = ?
                `, [guildId]);

                if (!result.length || !result[0].roster_channel_id) {
                    return interaction.reply({ 
                        content: "No roster channel found! Use `/setrosterchannel` first.", 
                        ephemeral: true 
                    });
                }

                const channel = interaction.guild.channels.cache.get(result[0].roster_channel_id);
                if (!channel) {
                    return interaction.reply({ content: "Roster channel is invalid or missing.", ephemeral: true });
                }

                // Check if an existing roster message exists and delete it
                if (result[0].roster_message_id) {
                    try {
                        const oldMessage = await channel.messages.fetch(result[0].roster_message_id);
                        await oldMessage.delete();
                        console.log("Old roster embed deleted.");
                    } catch (error) {
                        console.error(`Failed to delete previous roster embed for server: ${serverName} ID: ${guildId}`, error);
                    }
                }

                // Fetch stored roster data sorted by hierarchy
                const [rosterData] = await db.execute(`
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

                const extraRosterData = await db.execute(`
                    SELECT embed_title FROM roster_settings WHERE guild_id = ?
                `, [guildId]);

                // Use stored embed title
                const embed = {
                    title: extraRosterData[0].embed_title || "Team Roster",
                    description,
                    color: 0xFFFFFF,
                };

                const message = await channel.send({ embeds: [embed] });

                // Store the new message ID
                await db.execute(`
                    UPDATE channels SET roster_message_id = ? WHERE guild_id = ?
                `, [message.id, guildId]);

                sendLogEmbed(guildId, `Roster has been restored by <@${interaction.user.id}>.`);
                return interaction.reply({ content: "Roster has been restored", ephemeral: true });
            } catch (error) {
                console.error(`Failed to fix roster for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while fixing the roster.", flag: MessageFlags.Ephemeral });
            }
        },

        async editRosterMember(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            try {
                const user = interaction.options.getUser('user');
                const field = interaction.options.getString('field');
                const newValue = interaction.options.getString('new_value');

                if (field === 'member_level' && !['owner', 'leader', 'elite', 'member'].includes(newValue.toLowerCase())) {
                    return interaction.reply({ content: "Invalid role! Please choose from Owner, Leader, Elite, or Member.", ephemeral: true });
                }

                // Ensure the user exists in the roster
                const [result] = await db.execute(`
                    SELECT * FROM roster WHERE discord_id = ? AND guild_id = ?
                `, [user.id, guildId]);

                if (!result.length) {
                    return interaction.reply({ content: `This user is not in the roster.`, ephemeral: true });
                }

                // Update the field in the database
                await db.execute(`
                    UPDATE roster SET ${field} = ? WHERE discord_id = ? AND guild_id = ?
                `, [newValue, user.id, guildId]);

                await this.updateRosterEmbed(interaction);

                return interaction.reply({ 
                    content: `Updated **${field}** for **${user.username}** to \`${newValue}\`.`, 
                    ephemeral: true 
                });
                } catch (error) {
                console.error(`Failed to edit roster for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while editing the roster.", flag: MessageFlags.Ephemeral });
            }
        },

        async setRosterChannel(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;

            try {
                const rosterChannel = interaction.options.getChannel("channel");
                
                await db.execute(`
                    INSERT INTO channels (guild_id, roster_channel_id, type)
                    VALUES (?, ?, "roster")
                    ON DUPLICATE KEY UPDATE roster_channel_id = VALUES(roster_channel_id), type = "roster";
                `, [guildId, rosterChannel.id]);

                const [rosterSettings] = await db.execute(`
                    SELECT * FROM roster_settings WHERE guild_id = ?;
                `, [guildId]);

                const rosterTitle = rosterSettings[0]?.embed_title || "Team Roster";
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

                const rosterMessage = await rosterChannel.send({ embeds: [rosterEmbed] });

                if (!rosterChannel) {
                    return interaction.reply({ content: "Please provide a valid roster channel!", flags: MessageFlags.Ephemeral });
                }

                // Store Embed Message ID in Database
                await db.execute(`
                    INSERT INTO channels (guild_id, roster_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE roster_message_id = VALUES(roster_message_id);
                `, [guildId, rosterMessage.id]);

                await sendLogEmbed(guildId, `Roster channel successfully setup by <@${interaction.user.id}>.`);
                return interaction.reply({ content: `Roster channel successfully set! The roster embed has been sent to <#${rosterChannel.id}>`, flag: MessageFlags.Ephemeral });

            } catch (error) {
                console.error(`Failed to set roster channel for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting up the roster channel.", flag: MessageFlags.Ephemeral });
            }
        },

        async setRosterEmojis(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild.id;
            
            try {
                const ownerEmoji = interaction.options.getString('owner');
                const leaderEmoji = interaction.options.getString('leader');
                const eliteEmoji = interaction.options.getString('elite');
                const memberEmoji = interaction.options.getString('member');

                await db.execute(`
                    INSERT INTO roster_settings (guild_id, owner_emoji, leader_emoji, elite_emoji, member_emoji) 
                    VALUES (?, ?, ?, ?, ?) 
                    ON DUPLICATE KEY UPDATE 
                    owner_emoji = IF(VALUES(owner_emoji) IS NOT NULL, VALUES(owner_emoji), owner_emoji),
                    leader_emoji = IF(VALUES(leader_emoji) IS NOT NULL, VALUES(leader_emoji), leader_emoji),
                    elite_emoji = IF(VALUES(elite_emoji) IS NOT NULL, VALUES(elite_emoji), elite_emoji),
                    member_emoji = IF(VALUES(member_emoji) IS NOT NULL, VALUES(member_emoji), member_emoji);
                `, [guildId, ownerEmoji, leaderEmoji, eliteEmoji, memberEmoji]);

                await sendLogEmbed(interaction.guild.id, `Roster emojis updated by ${interaction.user.username}:\nOwner: ${ownerEmoji}\nLeader: ${leaderEmoji}\nElite: ${eliteEmoji}\nMember: ${memberEmoji}`);
                return interaction.reply({
                    content: `Roster emojis updated:\nOwner: ${ownerEmoji}\nLeader: ${leaderEmoji}\nElite: ${eliteEmoji}\nMember: ${memberEmoji}`,
                    ephemeral: true
            });
            } catch (error) {
                console.error(`Failed to set roster emojis for server: ${serverName} ID: ${guildId}:`, error);
                return interaction.reply({ content: "An error occurred while setting the roster emojis.", flag: MessageFlags.Ephemeral });
            }
        }
};