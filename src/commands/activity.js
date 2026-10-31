import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery, withTransaction } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { formatPlayerList, getPlayerNames } from "../utils/playerNames.js";
import { pageButtonId, paginateEntries, registerPaginator, showPagedView } from "../utils/pagination.js";

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
        )
        // reset (end the season)
        .addSubcommand(subcommand =>
            subcommand
            .setName("reset")
            .setDescription("End the current season: archive the leaderboard and start fresh.")
            .addStringOption(option =>
                option
                .setName("name")
                .setDescription("Name for the season being archived (default: Season N)")
                .setRequired(false)
                .setMaxLength(100)
            )
        )
        // seasons (view archives)
        .addSubcommand(subcommand =>
            subcommand
            .setName("seasons")
            .setDescription("List past seasons, or view one season's full leaderboard.")
            .addIntegerOption(option =>
                option
                .setName("season")
                .setDescription("Season number to view (from the list)")
                .setRequired(false)
                .setMinValue(1)
            )
        ),

    async execute(interaction) {

        // Ensure command runs in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }

        // Check user permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use this command!", flags: MessageFlags.Ephemeral });
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

        if(subcommand === "reset") {
            await this.resetSeason(interaction);
        }

        if(subcommand === "seasons") {
            await this.showSeasons(interaction);
        }
    },

    async setChannel(interaction) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (!channel) {
                return interaction.editReply({ content: "Error: Could not find the specified channel." });
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
            const sentEmbed = await channel.send(await this.generateStatsMessage(interaction.guild));

            // Store the message ID for future updates
            await executeQuery(`
                UPDATE player_activity_settings SET message_id = ? WHERE guild_id = ?;
            `, [sentEmbed.id, guildId]);

            await interaction.editReply({ content: `Player activity channel set to ${channel}.` });

        } catch (error) {
            console.error(`Failed to set player activity channel:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the player activity channel." });
        }
    },

    async addActivity(interaction) {

        const guildId = interaction.guild.id;
        const players = [];
        const result = interaction.options.getString("game-result");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 4 = max amount of player inputs
            for (let i = 1; i <= 4; i++) {
                const player = interaction.options.getUser(`player${i}`);
                // ignore the same player picked twice (it used to count them twice)
                if (player && !players.some(p => p.id === player.id)) {
                    players.push(player);
                }
            }

            if(players.length === 0) {
                return interaction.editReply({ content: "At least one player must be specified." });
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
            await interaction.editReply({ content: `**${players.length} player(s)** activity recorded!\nMatch Result: **${result}**` });

            // send log
            const playerMentions = await formatPlayerList(interaction.guild, players.map(p => p.id));
            await sendLogEmbed(
                guildId,
                `**Scrim Activity**\n\nScrim activity has been recorded\n\n**Players:** ${playerMentions}\n**Game Result:** ${result}\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.ADD
            );

            // update activity embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.error(`Error updating player activity:`, error);
            return interaction.editReply({ content: "An error occurred while updating player activity." });
        }
    },

    async removeActivity(interaction) {

        const guildId = interaction.guild.id;
        const user = interaction.options.getUser("player");
        const result = interaction.options.getString("game-result");

        if (!user) {
            return interaction.reply({ content: "Error: No player specified!", flags: MessageFlags.Ephemeral });
        }

        if(!result) {
            return interaction.reply({ content: `You must specify the outcome of the game, (win/loss).`, flags: MessageFlags.Ephemeral });
        }

        // check if user has data stored already
        const playerData = await executeQuery(`
            SELECT wins, games_played FROM player_activity WHERE user_id = ? AND guild_id = ?;
        `, [user.id, guildId]);
        
        // player data isnt stored
        if(!playerData || playerData.length === 0) {
            return interaction.reply({ content: `There is no data stored for the user: ${user}, you can not remove points from them.`, flags: MessageFlags.Ephemeral});
        }

        // stored player data
        const playerWins = playerData[0]?.wins ?? 0;
        const playerGames = playerData[0]?.games_played ?? 0;

        // check if player has wins
        if(result === "win" && playerWins <= 0) {
            return interaction.reply({ content: `Player ${user} has no wins, you can not remove a win from this player.`, flags: MessageFlags.Ephemeral });
        }

        if(result === "loss" && playerGames <= 0) {
            return interaction.reply({ content: `Player ${user} has no games, you can not remove a game from this player.`, flags: MessageFlags.Ephemeral });
        }

        // check if the user has valid games (removing a win check if they have a win)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {

            await executeQuery(`
                UPDATE player_activity 
                SET games_played = GREATEST(games_played - 1, 0),
                    wins = GREATEST(wins - CASE WHEN ? = 'win' THEN 1 ELSE 0 END, 0),
                    total_points = GREATEST(total_points - CASE WHEN ? = 'win' THEN 3 ELSE 1 END, 0)
                WHERE guild_id = ? AND user_id = ?;
            `, [result, result, guildId, user.id]);

            // send confirmation 
            await interaction.editReply({ content: `**${user.username}**'s activity has been removed!\nMatch Result: **${result}**` });

            // send log
            await sendLogEmbed(
                guildId,
                `**Scrim Activity**\n\nScrim activity has been removed\n\n**Player:** ${await formatPlayerList(interaction.guild, [user.id])}\n**Game Result:** ${result}\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.REMOVE
            );

            // update activity embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.error(`Error updating player activity:`, error);
            return interaction.editReply({ content: "An error occurred while updating player activity." });
        }

    },

    async deleteUser(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const user = interaction.options.getUser("user");

        if (!user) {
            return interaction.reply({ content: "Error: No player specified!", flags: MessageFlags.Ephemeral });
        }

        const playerData = await executeQuery(`
            SELECT * FROM player_activity WHERE guild_id = ? AND user_id = ?
            `, [guildId, user.id]);

        if(!playerData || playerData.length === 0) {
            return interaction.reply({ content: `There is no data stored for the user: ${user}, you can not remove them from scrim activity.`, flags: MessageFlags.Ephemeral});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {

            // remove user from database
            await executeQuery(`
                DELETE FROM player_activity WHERE guild_id = ? AND user_id = ?
                `, [guildId, user.id]);

            // send confirmation
            await interaction.editReply({ content: `Successfully removed <@${user.id}> from Scrim Activity.` });

            // send logs
            await sendLogEmbed(
                guildId, 
                `**Scrim Activity**\n\nA user has been removed from Scrim Activity\n\n**Player:** ${await formatPlayerList(interaction.guild, [user.id])}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.REMOVE
            );

            // update scrim acitivty embed
            await this.updateEmbed(interaction);
        } catch (error) {
            console.log(`An error occured while trying to remove user ${user.id} in guild: ${guild.id}.`, error);
            await interaction.editReply(`An error occured while trying to remove user: <@${user.id}> from Scrim Activity, please report this.`);
        }
    },

    // Archives the current leaderboard as a named season and clears it, after the
    // admin confirms with a button.
    async resetSeason(interaction) {
        const guild = interaction.guild;
        const guildId = guild.id;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [{ players }] = await executeQuery(
            `SELECT COUNT(*) AS players FROM player_activity WHERE guild_id = ? AND games_played > 0`,
            [guildId]
        );
        if (!Number(players)) {
            return interaction.editReply({ content: "There's no activity recorded yet, so there's nothing to archive." });
        }

        const [{ seasonCount }] = await executeQuery(
            `SELECT COUNT(*) AS seasonCount FROM player_activity_seasons WHERE guild_id = ?`,
            [guildId]
        );
        const name = interaction.options.getString("name")?.trim() || `Season ${Number(seasonCount) + 1}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("activity_reset_confirm").setLabel("Archive & reset").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("activity_reset_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        );

        const prompt = await interaction.editReply({
            content: `This archives the current leaderboard (**${players}** player(s)) as **${name}** and resets everyone to zero.\nPast seasons stay viewable with \`/activity seasons\`.`,
            components: [row],
        });

        let click;
        try {
            click = await prompt.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000,
            });
        } catch {
            return interaction.editReply({ content: "Reset timed out — nothing was changed.", components: [] });
        }

        if (click.customId !== "activity_reset_confirm") {
            return click.update({ content: "Reset cancelled — nothing was changed.", components: [] });
        }
        await click.update({ content: "Archiving...", components: [] });

        // All-or-nothing: the leaderboard is only cleared if the archive was written.
        const seasonId = await withTransaction(async (conn) => {
            const [[previous]] = await conn.execute(
                `SELECT MAX(ended_at) AS lastEnded FROM player_activity_seasons WHERE guild_id = ?`,
                [guildId]
            );
            const [season] = await conn.execute(
                `INSERT INTO player_activity_seasons (guild_id, name, started_at, ended_by) VALUES (?, ?, ?, ?)`,
                [guildId, name, previous?.lastEnded || null, interaction.user.id]
            );
            await conn.execute(`
                INSERT INTO player_activity_archive (season_id, guild_id, user_id, games_played, wins, total_points)
                SELECT ?, guild_id, user_id, games_played, wins, total_points
                FROM player_activity WHERE guild_id = ? AND games_played > 0
            `, [season.insertId, guildId]);
            await conn.execute(`DELETE FROM player_activity WHERE guild_id = ?`, [guildId]);
            return season.insertId;
        });

        await this.updateEmbed(interaction);
        await interaction.editReply({ content: `Archived as **${name}** (season #${seasonId}) and reset the leaderboard. View it any time with \`/activity seasons season:${seasonId}\`.` });

        await sendLogEmbed(
            guildId,
            `**Activity Season Ended**\n\nThe leaderboard was archived as **${name}** (${players} player(s)) and reset.\n**By:** <@${interaction.user.id}>`,
            COLOUR_VALUES.WARNING
        );
    },

    // Without a season: list past seasons with their winners. With one: open that
    // season's full leaderboard as a private, paged view.
    async showSeasons(interaction) {
        const guild = interaction.guild;
        const seasonId = interaction.options.getInteger("season");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (seasonId) {
            const [season] = await executeQuery(
                `SELECT id FROM player_activity_seasons WHERE id = ? AND guild_id = ?`,
                [seasonId, guild.id]
            );
            if (!season) {
                return interaction.editReply({ content: `There's no season #${seasonId} in this server. Run \`/activity seasons\` to see the list.` });
            }
            return showPagedView(interaction, `season-${seasonId}`);
        }

        const seasons = await executeQuery(`
            SELECT s.id, s.name, s.ended_at,
                (SELECT COUNT(*) FROM player_activity_archive a WHERE a.season_id = s.id) AS players,
                (SELECT CAST(a.user_id AS CHAR) FROM player_activity_archive a WHERE a.season_id = s.id
                    ORDER BY a.total_points DESC, a.wins DESC LIMIT 1) AS winner_id,
                (SELECT MAX(a.total_points) FROM player_activity_archive a WHERE a.season_id = s.id) AS winner_points
            FROM player_activity_seasons s
            WHERE s.guild_id = ?
            ORDER BY s.id DESC
        `, [guild.id]);

        if (!seasons.length) {
            return interaction.editReply({ content: "No past seasons yet. End the current one with `/activity reset`." });
        }

        const names = await getPlayerNames(guild, seasons.map(s => s.winner_id).filter(Boolean));
        const lines = seasons.map(s => {
            const ended = Math.floor(new Date(s.ended_at).getTime() / 1000);
            const winner = s.winner_id ? ` · 🥇 ${names.get(s.winner_id) || `<@${s.winner_id}>`} (${s.winner_points} pts)` : "";
            return `**#${s.id} ${s.name}** — ended <t:${ended}:D> · ${s.players} player(s)${winner}`;
        });

        const embed = new EmbedBuilder()
            .setTitle("Past seasons")
            .setColor(ACTIVITY_COLOUR)
            .setDescription(lines.join("\n").slice(0, 4096))
            .setFooter({ text: "View one with /activity seasons season:<number>" });

        return interaction.editReply({ embeds: [embed] });
    },

    // Public leaderboard message: the first page of rankings, plus a button that
    // opens the full leaderboard as a private, paged view when there's more.
    async generateStatsMessage(guild) {
        const pages = await leaderboardPages(guild);
        const embed = pages[0].setTimestamp();

        const components = pages.length > 1
            ? [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(pageButtonId("activity", 1))
                    .setLabel(`Full leaderboard (${pages.length} pages)`)
                    .setEmoji("📜")
                    .setStyle(ButtonStyle.Secondary)
            )]
            : [];

        return { embeds: [embed], components };
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
            const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return interaction.followUp({ content: "The activity channel no longer exists. Set it again with `/activity channel`.", flags: MessageFlags.Ephemeral });
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            const view = await this.generateStatsMessage(guild);

            if (!message) {
                const me = interaction.guild.members.me;
                if (me && !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
                    return interaction.followUp({ content: "I do not have permission to send messages in the activity channel.", flags: MessageFlags.Ephemeral });
                }

                const sentMessage = await channel.send(view);

                // Store the new message ID
                await executeQuery(`
                    UPDATE player_activity_settings SET message_id = ? WHERE guild_id = ?;
                `, [sentMessage.id, guildId]);

            } else {
                await message.edit(view).catch(console.error);
            }
        }
    },

    development: false
};

const ACTIVITY_COLOUR = "#FFD700";
const PLAYERS_PER_PAGE = 15;

// Ranked leaderboard split into embeds of PLAYERS_PER_PAGE players. Players are
// shown by roster name (6pm prefix removed) instead of mentions, which show as raw
// IDs for viewers whose client hasn't cached that user.
async function leaderboardPages(guild) {
    const [settings] = await executeQuery(`
        SELECT title FROM player_activity_settings WHERE guild_id = ?
    `, [guild.id]);

    const title = settings?.title ?? "Team Activity";

    const players = await executeQuery(`
        SELECT CAST(user_id as CHAR) AS user_id, games_played, wins, total_points
        FROM player_activity
        WHERE guild_id = ? AND games_played > 0
        ORDER BY total_points DESC, wins DESC;
    `, [guild.id]);

    if (!players.length) {
        return [new EmbedBuilder()
            .setTitle(title)
            .setColor(ACTIVITY_COLOUR)
            .setDescription("No player activity recorded yet.\n\nYou can add a player using `/activity add`.")];
    }

    return buildLeaderboardPages(guild, title, players);
}

// Ranked pages for any list of players (current leaderboard or an archived season).
async function buildLeaderboardPages(guild, title, players, footerPrefix = "") {
    const names = await getPlayerNames(guild, players.map(p => p.user_id));

    const entries = players.map((player, index) =>
        `**#${index + 1}** ${names.get(player.user_id) || `<@${player.user_id}>`}\n-# Games Played: ${player.games_played}\n-# Wins: ${player.wins}\n**Total Points:** ${player.total_points}\n\n`
    );

    const pages = paginateEntries(entries, { maxPerPage: PLAYERS_PER_PAGE });
    return pages.map((text, index) =>
        new EmbedBuilder()
            .setTitle(title)
            .setColor(ACTIVITY_COLOUR)
            .setDescription(text)
            .setFooter({ text: `${footerPrefix}${players.length} player(s) · Page ${index + 1}/${pages.length}` })
    );
}

// Archived season leaderboard, for /activity seasons season:<id>.
async function seasonPages(guild, seasonId) {
    const [season] = await executeQuery(
        `SELECT name, ended_at FROM player_activity_seasons WHERE id = ? AND guild_id = ?`,
        [seasonId, guild.id]
    );
    if (!season) return [];

    const players = await executeQuery(`
        SELECT CAST(user_id AS CHAR) AS user_id, games_played, wins, total_points
        FROM player_activity_archive
        WHERE season_id = ? AND guild_id = ?
        ORDER BY total_points DESC, wins DESC
    `, [seasonId, guild.id]);

    const ended = new Date(season.ended_at).toLocaleDateString("en-GB");
    return buildLeaderboardPages(guild, `${season.name} (archived)`, players, `Ended ${ended} · `);
}

registerPaginator("activity", leaderboardPages);
registerPaginator("season", seasonPages);
