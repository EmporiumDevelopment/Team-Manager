import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { canAnnounce, openComposer } from "../utils/announcementComposer.js";
import { safeReply } from "../utils/interactionReply.js";

// /announcement -> opens the private announcement composer (see utils/announcementComposer.js).
export default {
    data: new SlashCommandBuilder()
        .setName("announcement")
        .setDescription("Write and send a styled announcement to a channel.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }
        if (!canAnnounce(interaction.member)) {
            return interaction.reply({ content: "You need the **Manage Server** permission to send announcements.", flags: MessageFlags.Ephemeral });
        }
        try {
            await openComposer(interaction);
        } catch (error) {
            console.error(`Error opening announcement composer in guild ${interaction.guild.id}:`, error);
            await safeReply(interaction, "An error occurred while opening the announcement composer.");
        }
    },

    development: false,
};
