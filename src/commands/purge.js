import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Deletes a specified number of messages')
        // amount
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
    
    async execute(interaction) {
        // Get the amount from the interaction
        const amount = interaction.options.getInteger('amount');

        // Admin permission check
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: "You need **Manage Server** permission to use /purge!", ephemeral: true });
        }

        // Attempt bulk deletion
        try {
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ 
                content: `Deleted **${amount}** messages!`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error purging messages:', error);
            await interaction.reply({ 
                content: "Failed to purge messages. Make sure they are less than 14 days old.", 
                ephemeral: true 
            });
        }
    },
    development: false
};