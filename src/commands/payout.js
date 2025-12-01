import { PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import earnings from "./earnings.js";

export default {
    data: new SlashCommandBuilder()
        .setName("payout")
        .setDescription("Initiate a payout process."),

    async execute(interaction) {

        // Ensure command runs in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", ephemeral: true });
        }

        // Check user permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use this command!", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const earningsSettings = await executeQuery(`
            SELECT channel_id, message_id FROM earnings_settings WHERE guild_id = ?;
        `, [interaction.guild.id]);

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

        await interaction.editReply("Initiating payout process...");

        const unpaidEarnings = await executeQuery(`
            SELECT * FROM earnings WHERE guild_id = ? AND paid_out = 0
            `, [interaction.guild.id]);

        if (unpaidEarnings.length === 0) {
            return interaction.editReply("There are no unpaid earnings to process for payout.");
        }

        let payoutAmount = 0;
        let playerData = [];

        for (const earning of unpaidEarnings) {
            const netAmount = parseFloat(earning.amount) - parseFloat(earning.slot_cost);
            payoutAmount += netAmount;

            const earningsId = earning.id;

            const players = await executeQuery(`
                SELECT player_id FROM earnings_players WHERE earning_id = ? AND guild_id = ?;
            `, [earningsId, interaction.guild.id]);

            const earningAmount = netAmount / players.length;

            for (const player of players) {
                const playerId = player.player_id;

                let existing = playerData.find(p => p.playerId === playerId && p.earningId === earningsId);
                if (existing) {
                    existing.amount += earningAmount;
                } else {
                    playerData.push({
                        playerId,
                        amount: earningAmount,
                        earningId: earningsId,
                        totalAmount: netAmount
                    });
                }
            }
        }

        await executeQuery(
            "UPDATE earnings SET paid_out = 1 WHERE guild_id = ? AND paid_out = 0",
            [interaction.guild.id]
        );

        for (const player of playerData) {
            await executeQuery(
                `INSERT INTO earnings_payouts (guild_id, earning_id, total_amount, authorizer_id, player_id, player_split_amount)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [interaction.guild.id, player.earningId, player.totalAmount, interaction.user.id, player.playerId, player.amount]
            );
        }

        const updatedEmbed = await earnings.generateEmbed(interaction.guild.id);
        await message.edit({ embeds: [updatedEmbed] });
        return interaction.editReply(`Payout of €${payoutAmount} has been processed and earnings marked as paid out for ${playerData.length} player(s).`);
    },

    development: false
}