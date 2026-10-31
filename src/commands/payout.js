import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { executeQuery, withTransaction } from "../database.js";
import earnings from "./earnings.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { getPlayerNames } from "../utils/playerNames.js";

const CONFIRM_TIMEOUT_MS = 60_000;

export default {
    data: new SlashCommandBuilder()
        .setName("payout")
        .setDescription("Initiate a payout process."),

    async execute(interaction) {

        // Ensure command runs in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }

        // Check user permissions
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use this command!", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guild.id;
        const plan = await this.buildPayoutPlan(guildId);

        if (plan.earnings.length === 0 && plan.skipped.length === 0) {
            return interaction.editReply("There are no unpaid earnings to process for payout.");
        }

        const skippedNote = plan.skipped.length
            ? `\n\n⚠ Skipping ${plan.skipped.length} earning(s) with no players linked (IDs: ${plan.skipped.join(", ")}). Remove and re-add them with players to pay them out.`
            : "";

        if (plan.earnings.length === 0) {
            return interaction.editReply(`Nothing can be paid out.${skippedNote}`);
        }

        // Show exactly who gets what and require a confirmation click, so a stray
        // /payout can't mark everything as paid.
        const playerNames = await getPlayerNames(interaction.guild, [...plan.perPlayer.keys()]);
        const breakdown = [...plan.perPlayer.entries()]
            .map(([playerId, amount]) => `${playerNames.get(playerId)}: €${amount.toFixed(2)}`)
            .join("\n");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("payout_confirm").setLabel("Confirm payout").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("payout_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        );

        const prompt = await interaction.editReply({
            content: `**Payout of €${plan.total.toFixed(2)}** across ${plan.earnings.length} earning(s):\n${breakdown}${skippedNote}`.slice(0, 2000),
            components: [row],
        });

        let click;
        try {
            click = await prompt.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: CONFIRM_TIMEOUT_MS,
            });
        } catch {
            return interaction.editReply({ content: "Payout timed out — nothing was paid out.", components: [] });
        }

        if (click.customId !== "payout_confirm") {
            return click.update({ content: "Payout cancelled — nothing was paid out.", components: [] });
        }

        await click.update({ content: "Processing payout...", components: [] });

        try {
            // All-or-nothing: earnings are only marked paid if every payout row was
            // written, and only the earnings shown above are touched (an earning added
            // while the confirmation was open stays unpaid).
            await withTransaction(async (conn) => {
                for (const earning of plan.earnings) {
                    const [update] = await conn.execute(
                        "UPDATE earnings SET paid_out = 1 WHERE id = ? AND guild_id = ? AND paid_out = 0",
                        [earning.id, guildId]
                    );
                    if (update.affectedRows !== 1) {
                        throw new Error(`Earning ${earning.id} was changed or paid out by someone else`);
                    }

                    for (const playerId of earning.playerIds) {
                        await conn.execute(
                            `INSERT INTO earnings_payouts (guild_id, earning_id, total_amount, authorizer_id, player_id, player_split_amount)
                            VALUES (?, ?, ?, ?, ?, ?)`,
                            [guildId, earning.id, earning.netAmount, interaction.user.id, playerId, earning.share]
                        );
                    }
                }
            });
        } catch (error) {
            console.error(`Payout failed for guild ${guildId}:`, error);
            return interaction.editReply({ content: "The payout failed and nothing was marked as paid. Please try again." });
        }

        const problem = await earnings.refreshEarningsEmbed(interaction.guild);

        await interaction.editReply({
            content: `Payout of €${plan.total.toFixed(2)} has been processed for ${plan.perPlayer.size} player(s).${skippedNote}`
                + (problem ? `\n⚠ The earnings embed wasn't updated: ${problem}` : ""),
        });

        await sendLogEmbed(
            guildId,
            `**Payout Processed**\n\nA payout of €${plan.total.toFixed(2)} has been processed for ${plan.perPlayer.size} player(s).\n\n${breakdown}\n\n**By:** <@${interaction.user.id}>`.slice(0, 4096),
            COLOUR_VALUES.ADD
        );
    },

    // Works out what each unpaid earning pays to each player, without changing anything.
    async buildPayoutPlan(guildId) {
        const unpaid = await executeQuery(`
            SELECT e.id, e.amount, e.slot_cost,
                GROUP_CONCAT(CAST(ep.player_id AS CHAR)) AS player_ids
            FROM earnings e
            LEFT JOIN earnings_players ep ON ep.earning_id = e.id AND ep.guild_id = e.guild_id
            WHERE e.guild_id = ? AND e.paid_out = 0
            GROUP BY e.id
            ORDER BY e.id;
        `, [guildId]);

        const plan = { earnings: [], skipped: [], perPlayer: new Map(), total: 0 };

        for (const row of unpaid) {
            const playerIds = row.player_ids ? [...new Set(row.player_ids.split(","))] : [];
            if (playerIds.length === 0) {
                // Dividing by zero players used to write NaN payouts and fail halfway.
                plan.skipped.push(row.id);
                continue;
            }

            const netAmount = parseFloat(row.amount) - parseFloat(row.slot_cost);
            const share = netAmount / playerIds.length;

            plan.earnings.push({ id: row.id, netAmount, share, playerIds });
            plan.total += netAmount;
            for (const playerId of playerIds) {
                plan.perPlayer.set(playerId, (plan.perPlayer.get(playerId) || 0) + share);
            }
        }

        return plan;
    },

    development: false
}
