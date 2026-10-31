import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery, withTransaction } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { formatPlayerList, getPlayerNames } from "../utils/playerNames.js";
import { pageButtonId, paginateEntries, registerPaginator } from "../utils/pagination.js";

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
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }

        // Check user permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use this command!", flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral });
            }
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
            const sentEmbed = await channel.send(await this.generateMessage(interaction.guild));

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

        const view = await this.generateMessage(guild);

        const message = settings.message_id
            ? await channel.messages.fetch(settings.message_id).catch(() => null)
            : null;

        if (message) {
            await message.edit(view);
            return null;
        }

        const me = guild.members.me;
        if (me && !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
            return "I do not have permission to send messages in the earnings channel.";
        }

        const newMessage = await channel.send(view);
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
            return interaction.reply({ content: "Amount must not be less than zero.", flags: MessageFlags.Ephemeral });
        }

        if(slotCost < 0) {
            return interaction.reply({ content: "Slot cost must not be less than zero.", flags: MessageFlags.Ephemeral });
        }

        if(!eventName || eventName.trim() === "") {
            return interaction.reply({ content: "Event name cannot be empty.", flags: MessageFlags.Ephemeral });
        }

        if(!result || isNaN(result)) {
            return interaction.reply({ content: "Result must be a valid number.", flags: MessageFlags.Ephemeral });
        }

        if(result <= 0) {
            return interaction.reply({ content: "Result must be a positive number.", flags: MessageFlags.Ephemeral });
        }

        // 6 = max amount of player inputs; ignore the same player picked twice
        for (let i = 1; i <= 6; i++) {
            const player = interaction.options.getUser(`player${i}`);
            if (player && !players.some(p => p.id === player.id)) {
                players.push(player);
            }
        }

        if(players.length === 0) {
            return interaction.reply({ content: "At least one player must be specified.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
            return interaction.reply({ content: "Earning ID must be provided.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

        if(!earningId) return interaction.reply({ content: "Earning ID must be provided.", flags: MessageFlags.Ephemeral });
        if(!field) return interaction.reply({ content: "Field to edit must be provided.", flags: MessageFlags.Ephemeral });
        if(!newValue) return interaction.reply({ content: `A new value for ${field} must be provided.`, flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    // Public Piggy Bank message: the newest earnings and payouts that fit, plus
    // buttons that open the full history as private, paged views.
    async generateMessage(guild) {
        const data = await loadEarningsData(guild);

        // Discord rejects embed descriptions over 4096 characters, so show the newest
        // entries that fit; the history buttons below have everything.
        const balanceText = `\n**Current Balance:** ${formatEuro(data.currentBalance)}\n`;
        const payoutsHeader = `**Payouts:**\n`;
        const budget = 4096 - balanceText.length - payoutsHeader.length - 160;

        const shownEarnings = takeWhileFits(data.earningEntries, Math.floor(budget * 0.65));
        const shownPayouts = takeWhileFits(data.payoutEntries, budget - shownEarnings.text.length);

        let bodyText = shownEarnings.text;
        if (shownEarnings.hidden > 0) bodyText += `-# …and ${shownEarnings.hidden} older earning(s) — see **Earnings history** below\n\n`;

        bodyText += payoutsHeader;
        if (data.payoutEntries.length === 0) {
            bodyText += "No payouts have been made yet.\n";
        } else {
            bodyText += shownPayouts.text;
            if (shownPayouts.hidden > 0) bodyText += `-# …and ${shownPayouts.hidden} older payout(s) — see **Payout history** below\n`;
        }
        bodyText += balanceText;

        const embed = new EmbedBuilder()
            .setTitle(`${data.title} - ${formatEuro(data.totalEarnings)}`.slice(0, 256))
            .setColor(EARNINGS_COLOUR)
            .setDescription(bodyText.slice(0, 4096));

        const buttons = [];
        if (data.earningEntries.length) {
            buttons.push(new ButtonBuilder().setCustomId(pageButtonId("earnings", 1)).setLabel("Earnings history").setEmoji("📜").setStyle(ButtonStyle.Secondary));
        }
        if (data.payoutEntries.length) {
            buttons.push(new ButtonBuilder().setCustomId(pageButtonId("payouts", 1)).setLabel("Payout history").setEmoji("💸").setStyle(ButtonStyle.Secondary));
        }

        return {
            embeds: [embed],
            components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [],
        };
    },

    development: false
};

const EARNINGS_COLOUR = "#08f7ff";

// Everything the Piggy Bank views need, newest first. Player and authoriser names
// come from the roster (6pm prefix removed) rather than mentions, which show as raw
// IDs for viewers whose client hasn't cached that user.
async function loadEarningsData(guild) {
    const guildId = guild.id;

    const [settings] = await executeQuery(`
        SELECT embed_title FROM earnings_settings WHERE guild_id = ?
    `, [guildId]);

    // One query for every earning and its players.
    const earnings = await executeQuery(`
        SELECT e.id, e.event_name, e.result, e.amount, e.slot_cost, e.paid_out, e.date,
            GROUP_CONCAT(CAST(ep.player_id AS CHAR)) AS player_ids
        FROM earnings e
        LEFT JOIN earnings_players ep ON ep.earning_id = e.id AND ep.guild_id = e.guild_id
        WHERE e.guild_id = ?
        GROUP BY e.id
        ORDER BY e.date DESC, e.id DESC;
    `, [guildId]);

    const payoutRows = await executeQuery(`
        SELECT ep.earning_id, ep.total_amount,
            CAST(ep.authorizer_id AS CHAR) AS authorizer_id,
            CAST(ep.player_id AS CHAR) AS player_id,
            ep.player_split_amount, ep.date, e.event_name
        FROM earnings_payouts ep
        JOIN earnings e ON ep.earning_id = e.id
        WHERE ep.guild_id = ?
        ORDER BY ep.date DESC, ep.id DESC;
    `, [guildId]);

    const userIds = [
        ...earnings.flatMap(e => e.player_ids ? e.player_ids.split(",") : []),
        ...payoutRows.flatMap(r => [r.player_id, r.authorizer_id]),
    ];
    const names = await getPlayerNames(guild, userIds);
    const nameOf = id => names.get(String(id)) || `<@${id}>`;

    let totalEarnings = 0;
    let currentBalance = 0;

    const earningEntries = earnings.map(earning => {
        totalEarnings += parseFloat(earning.amount);
        if (!earning.paid_out) {
            currentBalance += parseFloat(earning.amount) - parseFloat(earning.slot_cost);
        }

        const playersText = earning.player_ids
            ? earning.player_ids.split(",").map(nameOf).join(", ")
            : "None";
        const paidTag = earning.paid_out ? " ✅" : "";

        return `**${earning.event_name} - #${earning.result}**${paidTag}\n${formatEuro(earning.amount)}\nPlayers: ${playersText}\nSlot Cost: ${formatEuro(earning.slot_cost)}\n${formatDate(earning.date)}\nID: ${earning.id}\n\n`;
    });

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
        grouped.get(row.earning_id).players.push(`${nameOf(row.player_id)}: ${formatEuro(row.player_split_amount)}`);
    }

    const payoutEntries = [...grouped.values()].map(group =>
        `\n**${group.event_name}** — Total: ${formatEuro(group.total_amount)}\n` +
        `Authorized by ${nameOf(group.authorizer_id)} on ${formatDate(group.date)}\n` +
        `Players:\n${group.players.join("\n")}\n`
    );

    return {
        title: settings?.embed_title ?? "Piggy Bank",
        earningEntries,
        payoutEntries,
        totalEarnings,
        currentBalance,
    };
}

// Private, paged views opened from the Piggy Bank's buttons.
function historyPages(entriesKey, heading) {
    return async (guild) => {
        const data = await loadEarningsData(guild);
        return paginateEntries(data[entriesKey]).map(text =>
            new EmbedBuilder()
                .setTitle(`${data.title} — ${heading}`.slice(0, 256))
                .setColor(EARNINGS_COLOUR)
                .setDescription(text)
                .setFooter({ text: `Total earned: ${formatEuro(data.totalEarnings)} · Current balance: ${formatEuro(data.currentBalance)}` })
        );
    };
}

registerPaginator("earnings", historyPages("earningEntries", "Earnings history"));
registerPaginator("payouts", historyPages("payoutEntries", "Payout history"));

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
