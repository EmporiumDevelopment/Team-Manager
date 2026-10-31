import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery, withTransaction } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { formatPlayerList } from "../utils/playerNames.js";

export default {
    data: new SlashCommandBuilder()
        .setName("earnings")
        .setDescription("Manage team earnings")
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("set the earnings channel")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel to set as the earnings channel")
                        .setRequired(true)
                )
        )
        // add
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("add earnings")
                .addNumberOption(option =>
                    option
                        .setName("amount")
                        .setDescription("The amount to add")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("event_name")
                        .setDescription("The name of the event")
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option
                        .setName("result")
                        .setDescription("The result (e.g., 1 = 1st place, 2 = 2nd place, etc.)")
                        .setRequired(true)
                )
                // players
                .addUserOption(option =>
                    option
                        .setName("player1")
                        .setDescription("First player")
                        .setRequired(true) // at least one player
                )
                .addUserOption(option =>
                    option
                        .setName("player2")
                        .setDescription("Second player")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player3")
                        .setDescription("Third player")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player4")
                        .setDescription("Fourth player")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player5")
                        .setDescription("Fifth player")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("player6")
                        .setDescription("Sixth player")
                        .setRequired(false)
                )
                // slot cost
                .addNumberOption(option =>
                    option
                        .setName("slot_cost")
                        .setDescription("The cost of the slot for the event")
                        .setRequired(false)
                )
        )
        // remove
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove an earning entry")
                .addIntegerOption(option =>
                    option
                        .setName("earning_id")
                        .setDescription("The ID of the earning entry to remove")
                        .setRequired(true)
                )
        )
        // edit
        .addSubcommand(subcommand =>
            subcommand
                .setName("edit")
                .setDescription("Edit an existing earning entry")
                .addIntegerOption(option =>
                    option
                        .setName("earning_id")
                        .setDescription("The ID of the earning entry to edit")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("field")
                        .setDescription("The field to edit (amount, event_name, result, slot_cost)")
                        .setRequired(true)
                        .addChoices(
                            { name: "amount", value: "amount" },
                            { name: "event_name", value: "event_name" },
                            { name: "result", value: "result" },
                            { name: "slot_cost", value: "slot_cost" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("new_value")
                        .setDescription("The new value for the specified field")
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

        switch (subcommand) {
            case "channel": {
                await this.setChannel(interaction);
                break;
            }

            case "add": {
                await this.addEarning(interaction);
                break;
            }

            case "remove": {
                await this.removeEarning(interaction);
                break;
            }

            case "edit": {
                await this.editEarning(interaction);
                break;
            }

            default: {
                return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
            }
        }

    },

    async setChannel(interaction) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        await interaction.deferReply({ ephemeral: true });

        try {
            if (!channel) {
                return interaction.editReply({ content: "Error: Could not find the specified channel." });
            }

            const me = interaction.guild.members.me;
            if (me && !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
                return interaction.editReply({ content: "I do not have permission to send messages in that channel." });
            }

            // Update the channel setting in the database
            await executeQuery(`
                INSERT INTO earnings_settings (guild_id, channel_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id);
            `, [guildId, channel.id]);

            // Generate and send the initial earnings embed
            const embed = await this.generateEmbed(guildId);
            const sentEmbed = await channel.send({ embeds: [embed] });

            // Store the message ID for future updates
            await executeQuery(`
                UPDATE earnings_settings SET message_id = ? WHERE guild_id = ?;
            `, [sentEmbed.id, guildId]);

            await interaction.editReply({ content: `Piggy Bank channel set to ${channel}.` });

            await sendLogEmbed(
                guildId,
                `**Piggy Bank Channel Set**\n\nPiggy Bank channel has been set to <#${channel.id}>.\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.ADD
            );

        } catch (error) {
            console.error(`Failed to set piggy bank channel:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the piggy bank channel." });
        }
    },

    // Edits the stored earnings message, or re-sends it if it was deleted. Returns a
    // problem description string, or null on success. Shared by add/remove/edit and
    // /payout (previously four copies of the same lookup, each crashing with an
    // unhandled error if the message had been deleted).
    async refreshEarningsEmbed(guild) {
        const [settings] = await executeQuery(`
            SELECT channel_id, message_id FROM earnings_settings WHERE guild_id = ?;
        `, [guild.id]);

        if (!settings?.channel_id) {
            return "Earnings channel is not set up. Use `/earnings channel` to set it up.";
        }

        const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
        if (!channel) {
            return "Could not find the earnings channel. Set it again with `/earnings channel`.";
        }

        const embed = await this.generateEmbed(guild.id);

        const message = settings.message_id
            ? await channel.messages.fetch(settings.message_id).catch(() => null)
            : null;

        if (message) {
            await message.edit({ embeds: [embed] });
            return null;
        }

        const me = guild.members.me;
        if (me && !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
            return "I do not have permission to send messages in the earnings channel.";
        }

        const newMessage = await channel.send({ embeds: [embed] });
        await executeQuery(`UPDATE earnings_settings SET message_id = ? WHERE guild_id = ?;`, [newMessage.id, guild.id]);
        return null;
    },

    async addEarning(interaction) {

        const guildId = interaction.guild.id;
        const originalAmount = interaction.options.getNumber("amount");
        const eventName = interaction.options.getString("event_name");
        const result = interaction.options.getNumber("result");
        const players = [];
        const slotCost = interaction.options.getNumber("slot_cost") || 0;

        if(originalAmount < 0) {
            return interaction.reply({ content: "Amount must not be less than zero.", ephemeral: true });
        }

        if(slotCost < 0) {
            return interaction.reply({ content: "Slot cost must not be less than zero.", ephemeral: true });
        }

        if(!eventName || eventName.trim() === "") {
            return interaction.reply({ content: "Event name cannot be empty.", ephemeral: true });
        }

        if(!result || isNaN(result)) {
            return interaction.reply({ content: "Result must be a valid number.", ephemeral: true });
        }

        if(result <= 0) {
            return interaction.reply({ content: "Result must be a positive number.", ephemeral: true });
        }

        // 6 = max amount of player inputs; ignore the same player picked twice
        for (let i = 1; i <= 6; i++) {
            const player = interaction.options.getUser(`player${i}`);
            if (player && !players.some(p => p.id === player.id)) {
                players.push(player);
            }
        }

        if(players.length === 0) {
            return interaction.reply({ content: "At least one player must be specified.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {

            // Insert the earning and its players together, so a failure can't leave
            // an earning with no players (which /payout can't split).
            await withTransaction(async (conn) => {
                const [dbResult] = await conn.execute(`
                    INSERT INTO earnings (guild_id, amount, event_name, result, paid_out, slot_cost, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                `, [guildId, originalAmount, eventName, result, false, slotCost, new Date()]);

                for (const player of players) {
                    await conn.execute(`
                        INSERT INTO earnings_players (earning_id, guild_id, player_id)
                        VALUES (?, ?, ?);
                    `, [dbResult.insertId, guildId, player.id]);
                }
            });

            const problem = await this.refreshEarningsEmbed(interaction.guild);

            await interaction.editReply({
                content: `Added ${formatEuro(originalAmount)} for event "${eventName}" with ${players.length} player(s) and ${formatEuro(slotCost)} slot cost.`
                    + (problem ? `\n⚠ The earning was saved, but the embed wasn't updated: ${problem}` : ""),
            });

            await sendLogEmbed(
                guildId,
                `**Team Earnings Added**\n\nEvent: **${eventName}**\nAmount: **${formatEuro(originalAmount)}**\nResult: **#${result}**\nPlayers: **${await formatPlayerList(interaction.guild, players.map(p => p.id))}**\nSlot Cost: **${formatEuro(slotCost)}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.ADD
            );
        } catch (error) {
            console.error(`Failed to add earnings:`, error);
            return interaction.editReply({ content: "An error occurred while adding earnings." });
        }
    },

    async removeEarning(interaction) {
        const guildId = interaction.guild.id;
        const earningId = interaction.options.getInteger("earning_id");

        if(!earningId) {
            return interaction.reply({ content: "Earning ID must be provided.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetEarning = await executeQuery(`
            SELECT * FROM earnings WHERE id = ? AND guild_id = ?;
        `, [earningId, guildId]);

        if(targetEarning.length === 0) {
            return interaction.editReply({ content: `No earning entry found with ID ${earningId}.` });
        }

        try {
            await withTransaction(async (conn) => {
                await conn.execute(`DELETE FROM earnings WHERE id = ? AND guild_id = ?;`, [earningId, guildId]);
                await conn.execute(`DELETE FROM earnings_players WHERE earning_id = ? AND guild_id = ?;`, [earningId, guildId]);
            });

            const problem = await this.refreshEarningsEmbed(interaction.guild);
            await interaction.editReply({
                content: `Removed earning entry with ID ${earningId}.` + (problem ? `\n⚠ ${problem}` : ""),
            });

            await sendLogEmbed(
                guildId,
                `**Team Earning Removed**\n\nEarning ID: **${earningId}**\nEvent: **${targetEarning[0].event_name}**\nAmount: **${formatEuro(targetEarning[0].amount)}**\nResult: **#${targetEarning[0].result}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.REMOVE
            );
        } catch (error) {
            console.error(`Failed to remove earning entry:`, error);
            return interaction.editReply({ content: "An error occurred while removing the earning entry." });
        }
    },

    async editEarning(interaction) {
        const guildId = interaction.guild.id;
        const earningId = interaction.options.getInteger("earning_id");
        const field = interaction.options.getString("field");
        const newValue = interaction.options.getString("new_value");

        if(!earningId) return interaction.reply({ content: "Earning ID must be provided.", ephemeral: true });
        if(!field) return interaction.reply({ content: "Field to edit must be provided.", ephemeral: true });
        if(!newValue) return interaction.reply({ content: `A new value for ${field} must be provided.`, ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        const targetEarning = await executeQuery(`
            SELECT * FROM earnings WHERE id = ? AND guild_id = ?;
        `, [earningId, guildId]);

        if(targetEarning.length === 0) return interaction.editReply({ content: `No earning entry found with ID ${earningId}.` });

        try {
            // Update the specified field in the database
            let query = "";
            let params = [];
            const number = Number(newValue);
            switch(field) {
                case "amount":
                    if(newValue.trim() === "" || isNaN(number)) return interaction.editReply({ content: "Amount must be a valid number." });
                    if(number < 0) return interaction.editReply({ content: "Amount must not be less than zero." });

                    query = "UPDATE earnings SET amount = ? WHERE id = ? AND guild_id = ?;";
                    params = [number, earningId, guildId];
                    break;

                case "event_name":
                    if(newValue.trim() === "") return interaction.editReply({ content: "Event name cannot be empty." });

                    query = "UPDATE earnings SET event_name = ? WHERE id = ? AND guild_id = ?;";
                    params = [newValue, earningId, guildId];
                    break;

                case "result":
                    if(!Number.isInteger(number)) return interaction.editReply({ content: "Result must be a whole number." });
                    if(number <= 0) return interaction.editReply({ content: "Result must be a positive number." });

                    query = "UPDATE earnings SET result = ? WHERE id = ? AND guild_id = ?;";
                    params = [number, earningId, guildId];
                    break;

                case "slot_cost":
                    if(newValue.trim() === "" || isNaN(number)) return interaction.editReply({ content: "Slot cost must be a valid number." });
                    if(number < 0) return interaction.editReply({ content: "Slot cost must not be less than zero." });

                    query = "UPDATE earnings SET slot_cost = ? WHERE id = ? AND guild_id = ?;";
                    params = [number, earningId, guildId];
                    break;

                default:
                    return interaction.editReply({ content: `Invalid field: ${field}.` });
            }
            await executeQuery(query, params);

            const problem = await this.refreshEarningsEmbed(interaction.guild);
            await interaction.editReply({
                content: `Updated **${field}** for earning entry with ID ${earningId}.` + (problem ? `\n⚠ ${problem}` : ""),
            });

            await sendLogEmbed(
                guildId,
                `**Team Earning Edited**\n\nEarning ID: **${earningId}**\nField: **${field}**\nNew Value: **${newValue}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.EDIT
            );
        } catch (error) {
            console.error(`Failed to edit earning entry:`, error);
            return interaction.editReply({ content: "An error occurred while editing the earning entry." });
        }
    },

    async generateEmbed(guildId) {

        // Fetch earnings settings for the guild
        const [settings] = await executeQuery(`
            SELECT embed_title FROM earnings_settings WHERE guild_id = ?
        `, [guildId]);

        // One query for every earning and its players (previously one extra query
        // per earning).
        const earnings = await executeQuery(`
            SELECT e.id, e.event_name, e.result, e.amount, e.slot_cost, e.paid_out, e.date,
                GROUP_CONCAT(CAST(ep.player_id AS CHAR)) AS player_ids
            FROM earnings e
            LEFT JOIN earnings_players ep ON ep.earning_id = e.id AND ep.guild_id = e.guild_id
            WHERE e.guild_id = ?
            GROUP BY e.id
            ORDER BY e.date DESC, e.id DESC;
        `, [guildId]);

        let totalEarnings = 0;
        let currentBalance = 0;

        const earningEntries = earnings.map(earning => {
            totalEarnings += parseFloat(earning.amount);
            if (!earning.paid_out) {
                currentBalance += parseFloat(earning.amount) - parseFloat(earning.slot_cost);
            }

            const playersText = earning.player_ids
                ? earning.player_ids.split(",").map(id => `<@${id}>`).join(" ")
                : "None";
            const paidTag = earning.paid_out ? " ✅" : "";

            return `**${earning.event_name} - #${earning.result}**${paidTag}\n${formatEuro(earning.amount)}\nPlayers: ${playersText}\nSlot Cost: ${formatEuro(earning.slot_cost)}\n${formatDate(earning.date)}\nID: ${earning.id}\n\n`;
        });

        const payoutRows = await executeQuery(`
            SELECT ep.earning_id, ep.total_amount,
                CAST(ep.authorizer_id AS CHAR) AS authorizer_id,
                CAST(ep.player_id AS CHAR) AS player_id,
                ep.player_split_amount, ep.date, e.event_name, e.result
            FROM earnings_payouts ep
            JOIN earnings e ON ep.earning_id = e.id
            WHERE ep.guild_id = ?
            ORDER BY ep.date DESC, ep.id DESC;
        `, [guildId]);

        const grouped = new Map();
        for (const row of payoutRows) {
            if (!grouped.has(row.earning_id)) {
                grouped.set(row.earning_id, {
                    event_name: row.event_name,
                    total_amount: parseFloat(row.total_amount),
                    authorizer_id: row.authorizer_id,
                    date: row.date,
                    players: []
                });
            }
            grouped.get(row.earning_id).players.push(`<@${row.player_id}>: ${formatEuro(row.player_split_amount)}`);
        }

        const payoutEntries = [...grouped.values()].map(group =>
            `\n**${group.event_name}** — Total: ${formatEuro(group.total_amount)}\n` +
            `Authorized by <@${group.authorizer_id}> on ${formatDate(group.date)}\n` +
            `Players:\n${group.players.join("\n")}\n`
        );

        // Discord rejects embed descriptions over 4096 characters, which used to make
        // every earnings update fail once enough history built up. Show the newest
        // entries that fit and note how many older ones are hidden.
        const balanceText = `\n**Current Balance:** ${formatEuro(currentBalance)}\n`;
        const payoutsHeader = `**Payouts:**\n`;
        const budget = 4096 - balanceText.length - payoutsHeader.length - 120;

        const shownEarnings = takeWhileFits(earningEntries, Math.floor(budget * 0.65));
        const payoutBudget = budget - shownEarnings.text.length;
        const shownPayouts = takeWhileFits(payoutEntries, payoutBudget);

        let bodyText = shownEarnings.text;
        if (shownEarnings.hidden > 0) bodyText += `-# …and ${shownEarnings.hidden} older earning(s) not shown\n\n`;

        bodyText += payoutsHeader;
        if (payoutEntries.length === 0) {
            bodyText += "No payouts have been made yet.\n";
        } else {
            bodyText += shownPayouts.text;
            if (shownPayouts.hidden > 0) bodyText += `-# …and ${shownPayouts.hidden} older payout(s) not shown\n`;
        }
        bodyText += balanceText;

        const title = `${settings?.embed_title ?? "Piggy Bank"} - ${formatEuro(totalEarnings)}`;

        return new EmbedBuilder()
            .setTitle(title.slice(0, 256))
            .setColor("#08f7ff")
            .setDescription(bodyText.slice(0, 4096));
    },

    development: false
};

function formatEuro(value) {
    return `€${(Number(value) || 0).toFixed(2)}`;
}

function formatDate(value) {
    return new Date(value).toLocaleDateString("en-GB");
}

// Takes entries (newest first) until the combined length would exceed maxLength.
function takeWhileFits(entries, maxLength) {
    let text = "";
    let count = 0;
    for (const entry of entries) {
        if (text.length + entry.length > maxLength) break;
        text += entry;
        count++;
    }
    return { text, hidden: entries.length - count };
}
