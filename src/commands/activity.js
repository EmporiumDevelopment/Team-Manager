import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";

export default {
    data: new SlashCommandBuilder()
        .setName("activity")
        .setDescription("Manage player activity")
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Set the channel to display player activity.")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel to display player activity in.")
                        .setRequired(true)
                )
        )
        // add
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add player activity points.")
                .addStringOption(option =>
                    option
                        .setName("game-result")
                        .setDescription("Select the game result.")
                        .setRequired(true)
                        .addChoices(
                            { name: "Win", value: "win" },
                            { name: "Loss", value: "loss" }
                        )
                )
                .addUserOption(option =>
                    option
                        .setName("player1")
                        .setDescription("Select the player to add points to.")
                        .setRequired(true)
                )
                .addUserOption(option =>
                    option
                        .setName("player2")
                        .setDescription("Select the player to add points to.")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player3")
                        .setDescription("Select the player to add points to.")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player4")
                        .setDescription("Select the player to add points to.")
                        .setRequired(false)
                )
        )
        // remove
        .addSubcommand(subcommand =>
            subcommand
            .setName("remove")
            .setDescription("Remove player activity points.")
            .addUserOption(option =>
                option
                .setName("player")
                .setDescription("Select the player to remove points from.")
                .setRequired(true)
            )
            .addStringOption(option =>
                option
                .setName("game-result")
                .setDescription("Select the game result")
                .setRequired(true)
                .addChoices(
                    { name: "Win", value: "win" },
                    { name: "Loss", value: "loss" }
                )
            )
        )
        // delete
        .addSubcommand(subcommand =>
            subcommand
            .setName("delete")
            .setDescription("Remove a user from Scrim Activity.")
            .addUserOption(option =>
                option
                .setName("user")
                .setDescription("Select a user to remove from Scrim Activity.")
                .setRequired(true)
            )
        ),

    async execute(interaction) {

        // Ensure command runs in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", ephemeral: true });
        }

        // Check user permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use this command!", ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "channel") {
            await this.setChannel(interaction);
        }
        
        if (subcommand === "add") {
            await this.addActivity(interaction);
        }

        if(subcommand === "remove") {
            await this.removeActivity(interaction);
        }

        if(subcommand === "delete") {
            await this.deleteUser(interaction);
        }
    },

    async setChannel(interaction) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        await interaction.deferReply({ ephemeral: true });

        try {
            if (!channel) {
                return interaction.editReply({ content: "Error: Could not find the specified channel.", ephemeral: true });
            }

            const activitySettings = await executeQuery(`
                SELECT * FROM player_activity_settings WHERE guild_id = ?;
            `, [guildId]);

            if (activitySettings.length === 0) {
                // Initialize default settings
                await executeQuery(`
                    INSERT INTO player_activity_settings (guild_id) VALUES (?);
                `, [guildId]);
            }

            // Update the channel setting in the database
            await executeQuery(`
                INSERT INTO player_activity_settings (guild_id, channel_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id);
            `, [guildId, channel.id]);

            // Generate and send the initial leaderboard embed
            const embed = await this.generateStatsEmbed(guildId);
            const sentEmbed = await channel.send({ embeds: [embed] });

            // Store the message ID for future updates
            await executeQuery(`
                UPDATE player_activity_settings SET message_id = ? WHERE guild_id = ?;
            `, [sentEmbed.id, guildId]);

            await interaction.editReply({ content: `Player activity channel set to ${channel}.`, ephemeral: true });

        } catch (error) {
            console.error(`Failed to set player activity channel:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the player activity channel.", ephemeral: true });
        }
    },

    async addActivity(interaction) {

        const guildId = interaction.guild.id;
        const players = [];
        const result = interaction.options.getString("game-result");

        await interaction.deferReply({ ephemeral: true });

        try {
            // 4 = max amount of player inputs
            for (let i = 1; i <= 4; i++) {
                const player = interaction.options.getUser(`player${i}`);
                if (player) {
                    players.push(player);
                }
            }

            if(players.length === 0) {
                return interaction.reply({ content: "At least one player must be specified.", ephemeral: true });
            }

            let points = result === "win" ? 3 : 1;
            let wins = result === "win" ? 1 : 0;

            for (const player of players) {
                // update each player's activity
                await executeQuery(`
                    INSERT INTO player_activity (guild_id, user_id, games_played, wins, total_points)
                    VALUES (?, ?, 1, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        games_played = games_played + 1,
                        wins = wins + ?,
                        total_points = total_points + ?;
                `, [guildId, player.id, wins, points, wins, points]);
            }

            // send confirmation
            await interaction.editReply({ content: `**${players.length} player(s)** activity recorded!\nMatch Result: **${result}**`, ephemeral: true });

            // send log
            let playerMentions = players.map(p => `<@${p.id}>`).join(", ");
            await sendLogEmbed(
                guildId,
                `**Scrim Activity**\n\nScrim activity has been recorded\n\n**Players:** ${playerMentions}\n**Game Result:** ${result}\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.ADD
            );

            // update activity embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.error(`Error updating player activity:`, error);
            return interaction.editReply({ content: "An error occurred while updating player activity.", ephemeral: true });
        }
    },

    async removeActivity(interaction) {

        const guildId = interaction.guild.id;
        const user = interaction.options.getUser("player");
        const result = interaction.options.getString("game-result");

        if (!user) {
            return interaction.reply({ content: "Error: No player specified!", ephemeral: true });
        }

        if(!result) {
            return interaction.reply({ content: `You must specify the outcome of the game, (win/loss).`, ephemeral: true });
        }

        // check if user has data stored already
        const playerData = await executeQuery(`
            SELECT wins, games_played FROM player_activity WHERE user_id = ? AND guild_id = ?;
        `, [user.id, guildId]);
        
        // player data isnt stored
        if(!playerData || playerData.length === 0) {
            return interaction.reply({ content: `There is no data stored for the user: ${user}, you can not remove points from them.`, ephemeral: true});
        }

        // stored player data
        const playerWins = playerData[0]?.wins ?? 0;
        const playerGames = playerData[0]?.games_played ?? 0;

        // check if player has wins
        if(result === "win" && playerWins <= 0) {
            return interaction.reply({ content: `Player ${user} has no wins, you can not remove a win from this player.`, ephemeral: true });
        }

        if(result === "loss" && playerGames <= 0) {
            return interaction.reply({ content: `Player ${user} has no games, you can not remove a game from this player.`, ephemeral: true });
        }

        // check if the user has valid games (removing a win check if they have a win)
        await interaction.deferReply({ ephemeral: true });

        try {

            await executeQuery(`
                UPDATE player_activity 
                SET games_played = GREATEST(games_played - 1, 0),
                    wins = GREATEST(wins - CASE WHEN ? = 'win' THEN 1 ELSE 0 END, 0),
                    total_points = GREATEST(total_points - CASE WHEN ? = 'win' THEN 3 ELSE 1 END, 0)
                WHERE guild_id = ? AND user_id = ?;
            `, [result, result, guildId, user.id]);

            // send confirmation 
            await interaction.editReply({ content: `**${user.username}**'s activity has been removed!\nMatch Result: **${result}**`, ephemeral: true });

            // send log
            await sendLogEmbed(
                guildId,
                `**Scrim Activity**\n\nScrim activity has been removed\n\n**Player:** <@${user.id}>\n**Game Result:** ${result}\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.REMOVE
            );

            // update activity embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.error(`Error updating player activity:`, error);
            return interaction.editReply({ content: "An error occurred while updating player activity.", ephemeral: true });
        }

    },

    async deleteUser(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const user = interaction.options.getUser("user");

        if (!user) {
            return interaction.reply({ content: "Error: No player specified!", ephemeral: true });
        }

        const playerData = await executeQuery(`
            SELECT * FROM player_activity WHERE guild_id = ? AND user_id = ?
            `, [guildId, user.id]);

        if(!playerData || playerData.length === 0) {
            return interaction.reply({ content: `There is no data stored for the user: ${user}, you can not remove them from scrim activity.`, ephemeral: true});
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // remove user from database
            await executeQuery(`
                DELETE FROM player_activity WHERE guild_id = ? AND user_id = ?
                `, [guildId, user.id]);

            // send confirmation
            await interaction.editReply({ content: `Successfully removed <@${user.id}> from Scrim Activity.`, ephemeral: true });

            // send logs
            await sendLogEmbed(
                guildId, 
                `**Scrim Activity**\n\nA user has been removed from Scrim Activity\n\n**Player:** <@${user.id}>\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.REMOVE
            );

            // update scrim acitivty embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.log(`An error occured while trying to remove user ${user.id} in guild: ${guild.id}.`, error);
            await interaction.editReply(`An error occured while trying to remove user: <@${user.id}> from Scrim Activity, please report this.`);
        }
    },

    async generateStatsEmbed(guildId) {

        const [settings] = await executeQuery(`
            SELECT title FROM player_activity_settings WHERE guild_id = ?
        `, [guildId]);

        const title = settings?.title ?? "Team Activity";

        const players = await executeQuery(`
            SELECT CAST(user_id as CHAR) AS user_id, games_played, wins, total_points 
            FROM player_activity 
            WHERE guild_id = ? AND games_played > 0 
            ORDER BY total_points DESC;
        `, [guildId]);

        // If no player data exists, return a default embed
        if (!players || players.length === 0) {
            return new EmbedBuilder()
                .setTitle(title)
                .setColor("#FFD700")
                .setDescription("No player activity recorded yet.\n\nYou can add a player using `/activity add`.");
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor("#FFD700");

        let leaderboardText = "";

        for (const player of players) {

            if (!player || !player.user_id) continue;

            const mention = `<@${player.user_id}>`;
            leaderboardText += `${mention}\n-# Games Played: ${player.games_played}\n-# Wins: ${player.wins}\n**Total Points:** ${player.total_points}\n\n`;
        }

        embed.setDescription(leaderboardText);

        return embed;
    },

    async updateEmbed(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        // Fetch activity channel and message ID
            const activitySettings = await executeQuery(`
                SELECT channel_id, message_id FROM player_activity_settings WHERE guild_id = ?;
            `, [guildId]);

            const channelId = activitySettings[0]?.channel_id;
            const messageId = activitySettings[0]?.message_id;

            if (channelId && messageId) {
                const channel = await interaction.client.channels.fetch(channelId);
                const message = await channel.messages.fetch(messageId).catch(() => null);

                if (!message) {
                    const newEmbed = await this.generateStatsEmbed(guildId);
                    const sentMessage = await channel.send({ embeds: [newEmbed] });

                    // Store the new message ID
                    await executeQuery(`
                        UPDATE player_activity_settings SET message_id = ? WHERE guild_id = ?;
                    `, [sentMessage.id, guildId]);

                } else {
                    const updatedEmbed = await this.generateStatsEmbed(guildId);
                    updatedEmbed.setTimestamp();

                    await message.edit({ embeds: [updatedEmbed] }).catch(console.error);
                }
            }
    },

    development: true
};