import { MessageFlags } from "discord.js";

// Sends an ephemeral message whether or not the interaction has already been
// replied to / deferred. Calling reply() twice throws, which used to turn a handled
// error into an unhandled one inside catch blocks.
export async function safeReply(interaction, content) {
    const options = typeof content === "string" ? { content } : content;
    try {
        if (interaction.deferred && !interaction.replied) {
            return await interaction.editReply(options);
        }
        if (interaction.replied) {
            return await interaction.followUp({ ...options, flags: MessageFlags.Ephemeral });
        }
        return await interaction.reply({ ...options, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("Failed to send interaction response:", error);
    }
}
