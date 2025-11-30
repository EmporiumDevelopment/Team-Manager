import { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";

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
                return interaction.editReply({ content: "Error: Could not find the specified channel.", ephemeral: true });
            }

            const earningsSettings = await executeQuery(`
                SELECT * FROM earnings_settings WHERE guild_id = ?;
            `, [guildId]);

            if (earningsSettings.length === 0) {
                // Initialize default settings
                await executeQuery(`
                    INSERT INTO earnings_settings (guild_id) VALUES (?);
                `, [guildId]);
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

            await interaction.editReply({ content: `Piggy Bank channel set to ${channel}.`, ephemeral: true });

        } catch (error) {
            console.error(`Failed to set piggy bank channel:`, error);
            return interaction.editReply({ content: "An error occurred while setting up the piggy bank channel.", ephemeral: true });
        }
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

        if(!eventName || eventName.trim() === "") {
            return interaction.reply({ content: "Event name cannot be empty.", ephemeral: true });
        }

        if(!result || isNaN(result)) {
            return interaction.reply({ content: "Result must be a valid number.", ephemeral: true });
        }

        if(result <= 0) {
            return interaction.reply({ content: "Result must be a positive number.", ephemeral: true });
        }

        // 6 = max amount of player inputs
        for (let i = 1; i <= 6; i++) {
            const player = interaction.options.getUser(`player${i}`);
            if (player) {
                players.push(player);
            }
        }

        if(players.length === 0) {
            return interaction.reply({ content: "At least one player must be specified.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        try {

            // Insert the earnings record into the database
            const dbResultArray = await executeQuery(`
                INSERT INTO earnings (guild_id, amount, event_name, result, paid_out, slot_cost, date)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            `, [guildId, originalAmount, eventName, result, false, slotCost, new Date()]);

            const dbResult = dbResultArray[0];
            // Link players to the earnings record
            const earningId = dbResult.insertId;

            for (const player of players) {
                await executeQuery(`
                    INSERT INTO earnings_players (earning_id, guild_id, player_id)
                    VALUES (?, ?, ?);
                `, [earningId, guildId, player.id]);
            }

            // Update the earnings embed in the designated channel
            const earningsSettings = await executeQuery(`
                SELECT channel_id, message_id FROM earnings_settings WHERE guild_id = ?;
            `, [guildId]);

            if (earningsSettings.length === 0) {
                return interaction.editReply({ content: "Earnings channel is not set up. Please set it up first.", ephemeral: true });
            }

            const channelId = earningsSettings[0].channel_id;
            const messageId = earningsSettings[0].message_id;
            const channel = await interaction.guild.channels.fetch(channelId);

            if (!channel) {
                return interaction.editReply({ content: "Could not find the earnings channel. Please check the setup.", ephemeral: true });
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return interaction.editReply({ content: "Could not find the earnings message. Please check the setup.", ephemeral: true });
            }

            const updatedEmbed = await this.generateEmbed(guildId);
            await message.edit({ embeds: [updatedEmbed] });
            await interaction.editReply({ content: `Added $${originalAmount} for event "${eventName}" with ${players.length} player(s) and €${slotCost} slot cost`, ephemeral: true });

            await sendLogEmbed(
                guildId, 
                `**Team Earnings Added**\n\nEvent: **${eventName}**\nAmount: **€${originalAmount}**\nResult: **#${result}**\nPlayers: **${players.map(p => p.tag).join(", ")}**\nSlot Cost: **€${slotCost}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.ADD
            );
        } catch (error) {
            console.error(`Failed to add earnings:`, error);
            return interaction.editReply({ content: "An error occurred while adding earnings.", ephemeral: true });
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
            return interaction.editReply({ content: `No earning entry found with ID ${earningId}.`, ephemeral: true });
        }

        try {
            // Delete the earning entry
            await executeQuery(`
                DELETE FROM earnings WHERE id = ? AND guild_id = ?;
            `, [earningId, guildId]);

            // Also delete associated players
            await executeQuery(`
                DELETE FROM earnings_players WHERE earning_id = ?;
            `, [earningId]);

            // Update the earnings embed in the designated channel
            const earningsSettings = await executeQuery(`
                SELECT channel_id, message_id FROM earnings_settings WHERE guild_id = ?;
            `, [guildId]);

            if (earningsSettings.length === 0) {
                return interaction.editReply({ content: "Earnings channel is not set up. Please set it up first.", ephemeral: true });
            }

            const channelId = earningsSettings[0].channel_id;
            const messageId = earningsSettings[0].message_id;

            const channel = await interaction.guild.channels.fetch(channelId);
            if (!channel) {
                return interaction.editReply({ content: "Could not find the earnings channel. Please check the setup.", ephemeral: true });
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return interaction.editReply({ content: "Could not find the earnings message. Please check the setup.", ephemeral: true });
            }

            const updatedEmbed = await this.generateEmbed(guildId);

            await message.edit({ embeds: [updatedEmbed] });
            await interaction.editReply({ content: `Removed earning entry with ID ${earningId}.`, ephemeral: true });

            await sendLogEmbed(
                guildId, 
                `**Team Earning Removed**\n\nEarning ID: **${earningId}**\nEvent: **${targetEarning[0].event_name}**\nAmount: **€${targetEarning[0].amount}**\nResult: **#${targetEarning[0].result}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.REMOVE
            );
        } catch (error) {
            console.error(`Failed to remove earning entry:`, error);
            return interaction.editReply({ content: "An error occurred while removing the earning entry.", ephemeral: true });
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

        if(targetEarning.length === 0) return interaction.editReply({ content: `No earning entry found with ID ${earningId}.`, ephemeral: true });

        try {
            // Update the specified field in the database
            let query = "";
            let params = [];
            switch(field) {
                case "amount":
                    if(isNaN(parseFloat(newValue))) return interaction.editReply({ content: "Amount must be a valid number.", ephemeral: true });
                    if(newValue < 0) return interaction.editReply({ content: "Amount must not be less than zero.", ephemeral: true });

                    query = "UPDATE earnings SET amount = ? WHERE id = ? AND guild_id = ?;";
                    params = [parseFloat(newValue), earningId, guildId];
                    break;

                case "event_name":
                    if(newValue.trim() === "") return interaction.editReply({ content: "Event name cannot be empty.", ephemeral: true });

                    query = "UPDATE earnings SET event_name = ? WHERE id = ? AND guild_id = ?;";
                    params = [newValue, earningId, guildId];
                    break;

                case "result":
                    if(isNaN(parseInt(newValue))) return interaction.editReply({ content: "Result must be a valid number.", ephemeral: true });
                    if(parseInt(newValue) <= 0) return interaction.editReply({ content: "Result must be a positive number.", ephemeral: true });

                    query = "UPDATE earnings SET result = ? WHERE id = ? AND guild_id = ?;";
                    params = [parseInt(newValue), earningId, guildId];
                    break;

                case "slot_cost":
                    if(isNaN(parseFloat(newValue))) return interaction.editReply({ content: "Slot cost must be a valid number.", ephemeral: true });
                    if(newValue < 0) return interaction.editReply({ content: "Slot cost must not be less than zero.", ephemeral: true });

                    query = "UPDATE earnings SET slot_cost = ? WHERE id = ? AND guild_id = ?;";
                    params = [parseFloat(newValue), earningId, guildId];
                    break;
                    
                default:
                    return interaction.editReply({ content: `Invalid field: ${field}.`, ephemeral: true });
            }
            await executeQuery(query, params);

            // Update the earnings embed in the designated channel
            const earningsSettings = await executeQuery(`
                SELECT channel_id, message_id FROM earnings_settings WHERE guild_id = ?;
            `, [guildId]);

            if (earningsSettings.length === 0) {
                return interaction.editReply({ content: "Earnings channel is not set up. Please set it up first.", ephemeral: true });
            }

            const channelId = earningsSettings[0].channel_id;
            const messageId = earningsSettings[0].message_id;

            const channel = await interaction.guild.channels.fetch(channelId);
            if (!channel) {
                return interaction.editReply({ content: "Could not find the earnings channel. Please setup with /earnings channel.", ephemeral: true });
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return interaction.editReply({ content: "Could not find the earnings message. Please setup with /earnings channel.", ephemeral: true });
            }

            const updatedEmbed = await this.generateEmbed(guildId);

            await message.edit({ embeds: [updatedEmbed] });
            await interaction.editReply({ content: `Updated **${field}** for earning entry with ID ${earningId}.`, ephemeral: true });

            await sendLogEmbed(
                guildId, 
                `**Team Earning Edited**\n\nEarning ID: **${earningId}**\nField: **${field}**\nNew Value: **${newValue}**\n**By:** <@${interaction.user.id}>.`,
                COLOUR_VALUES.EDIT
            );
        } catch (error) {
            console.error(`Failed to edit earning entry:`, error);
            return interaction.editReply({ content: "An error occurred while editing the earning entry.", ephemeral: true });
        }
    },

    async generateEmbed(guildId) {
    
        // Fetch earnings settings for the guild
        const [settings] = await executeQuery(`
            SELECT embed_title FROM earnings_settings WHERE guild_id = ?
        `, [guildId]);

        /*
         * Fetch existing earnings from the database
         * and display them in the embed
        */
       const earnings = await executeQuery(`
            SELECT * FROM earnings WHERE guild_id = ? ORDER BY date DESC;
        `, [guildId]);

        let bodyText = "";
        let totalEarnings = 0;
        let currentBalance = 0;
        /*
        * Format each earning entry:
        *
        * Event Name - #Result
        * Amount €
        * Players
        * Slot Cost €
        * Date
        * 
        * Then calculate total earnings and current balance
        */
        for (const earning of earnings) {
            const id = earning.id;
            const date = new Date(earning.date);
            const formattedDate = date.toLocaleDateString();

            const players = await executeQuery(`
                SELECT player_id FROM earnings_players WHERE earning_id = ?;
            `, [id]);

            let playersText = "";
            for (const player of players) {
                playersText += `<@${player.player_id}> `; // mention format
            }

            bodyText += `**${earning.event_name} - #${earning.result}**\n€${earning.amount}\nPlayers: ${playersText}\nSlot Cost: €${earning.slot_cost}\n${formattedDate}\nID: ${earning.id}\n\n`;
            totalEarnings += parseFloat(earning.amount);

            // Calculate current balance from unpaid earnings
            if(earning.paid_out) continue;
            currentBalance += parseFloat(earning.amount - earning.slot_cost);
        }

        const payoutRows = await executeQuery(`
            SELECT ep.earning_id, ep.total_amount, ep.authorizer_id, ep.player_id,
                ep.player_split_amount, ep.date, e.event_name, e.result
            FROM earnings_payouts ep
            JOIN earnings e ON ep.earning_id = e.id
            WHERE ep.guild_id = ?
            ORDER BY ep.date DESC;
        `, [guildId]);

        let payoutsText = `**Payouts:**\n`;

        if (payoutRows.length === 0) {
            payoutsText += "No payouts have been made yet.\n\n";
        } else {
            const grouped = new Map();

            for (const row of payoutRows) {
                const key = row.earning_id;

                if (!grouped.has(key)) {
                    grouped.set(key, {
                        event_name: row.event_name,
                        result: row.result,
                        total_amount: parseFloat(row.total_amount),
                        authorizer_id: row.authorizer_id,
                        date: row.date,
                        players: []
                    });
                }

                grouped.get(key).players.push({
                    player_id: row.player_id,
                    amount: parseFloat(row.player_split_amount)
                });
            }

            for (const [, group] of grouped.entries()) {
                const formattedDate = new Date(group.date).toLocaleDateString();
                payoutsText += `\nTotal: €${group.total_amount.toFixed(2)}\n` +
                            `Authorized by <@${group.authorizer_id}> on ${formattedDate}\n` +
                            `Players:\n`;

                for (const player of group.players) {
                    payoutsText += `<@${player.player_id}>: €${player.amount.toFixed(2)}\n`;
                }
            }

        }

        bodyText += payoutsText;
        bodyText += `\n**Current Balance:** €${currentBalance}\n`;

        let title = settings?.embed_title ?? "Piggy Bank";
        title += ` - €${totalEarnings}`;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor("#08f7ff");
        embed.setDescription(bodyText);

        return embed;
    },

    development: true
};