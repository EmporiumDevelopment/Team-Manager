import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import path from 'path';
import { fileURLToPath } from "url";

export default {
    data: new SlashCommandBuilder()
        .setName("tournament")
        .setDescription("Manage tournament information and settings.")
        // Set roles for each team
        .addSubcommand(subcommand =>
            subcommand
                .setName("information")
                .setDescription("Send the information Embed.")
        ),

        async execute(interaction) {

            // Check if the interaction is in a guild
            if (!interaction.guild) {
                return interaction.reply({ content: "This command can only be used in a server!", ephemeral: true });
            }

            // Check if the user has the required permissions
            if (!interaction.member.permissions.has("ManageGuild")) {
                return interaction.reply({ content: "You need **Manage Server** permission to use this command!", ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();

            // handle subcommands
            if(subcommand === "information") {
                await this.sendInformation(interaction);
            }
        },

        async sendInformation(interaction) {

            const description = "## SCHEDULE\n\n### ROSTER APPLICATION\n> Opens: 25.08, 12:00CEST\n> Closes: 31.08, 18:00CEST\n\n### GROUPSTAGE 20CEST\n> 1.09 – 7.09\n> 16+2 Teams\n> :6pmmapera: :6pmmapmira: :6pmmapera: :6pmmapsanhok:\n:FloraPurpleArrow: Top 9 advance to quarterfinals!\n\n### QUARTERFINAL 20CEST\n> 8.09 – 11.09\n> 16+2 Teams\n> :6pmmapera: :6pmmapmira: :6pmmapera: :6pmmapsanhok:\n:FloraPurpleArrow: Top 8 advance to semifinals!\n\n### SEMIFINAL 20CEST\n> 12.09 – 13.09\n> 16+2 Teams\n> :6pmmapera: :6pmmapmira: :6pmmapera: :6pmmapsanhok:\n:FloraPurpleArrow: Top 6 advance to finals!\n\n### FINAL 20CEST\n> 14.09\n> 12+4 Teams\n> Streamed by Festina\n> :6pmmapera: :6pmmapmira: :6pmmapera: :6pmmapmira: :6pmmapsanhok:";

            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);

            const imagePath = path.join(__dirname, '..', '..', 'src', 'assets', 'tournament', 'information', 'image.png');
            const thumbPath = path.join(__dirname, '..', '..', 'src', 'assets', 'tournament', 'information', 'thumbnail.png');

            const imageAttachment = new AttachmentBuilder(imagePath);
            const thumbnailAttachment = new AttachmentBuilder(thumbPath);

            // create an embed for the information
            const embed = new EmbedBuilder()

                .setColor("#9d00ff")
                .setImage('attachment://image.png')
                .setThumbnail('attachment://thumbnail.png')
                .setTitle("Tournament Information")
                .setDescription(description)
                .setFooter({ text: "By Festina" });

            // Send the embed to the channel
            await interaction.reply({ 
                embeds: [embed], 
                files: [imageAttachment, thumbnailAttachment]
            });

            return interaction.followUp({ content: "Tournament information has been sent!", ephemeral: true });
        },

    development: true
}