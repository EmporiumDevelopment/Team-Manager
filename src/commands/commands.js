import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });

const testServerId = process.env.TEST_SERVER_ID;

export default {
    data: new SlashCommandBuilder()
        .setName("commands")
        .setDescription("Lists all available bot commands."),

    async execute(interaction, commandHandler) {
        const isTestServer = interaction.guild.id === testServerId;
        const availableCommands = [...commandHandler.commands.values()]
            .filter(cmd => cmd.data?.name && (isTestServer || !cmd.development));

        const embed = new EmbedBuilder()
            .setTitle(`Available Commands ${isTestServer ? "(Test Server)" : ""}`)
            .setColor(isTestServer ? 0xFFAA00 : 0x00AAFF)
            .setDescription(isTestServer
                ? "This server includes development commands."
                : "Only public commands are shown.");

        availableCommands.forEach(cmd => {
            if (!cmd.data?.name) {
                console.warn(`Skipping command due to missing name:`, cmd);
                return; // 🔹 Skip processing commands without `data.name`
            }

            // Ensure `cmd.data.options` exists before calling `.map()`
            const subcommands = cmd.data.options && Array.isArray(cmd.data.options)
                ? cmd.data.options.map(opt => `- **${opt.name}**: ${opt.description}`).join("\n")
                : "No subcommands";

            const commandName = cmd.development
            ? `🔧 (DEV) **/${cmd.data.name}**`
            : `**/${cmd.data.name}**`

            embed.addFields({ name: `${commandName}`, value: `${cmd.data.description}\n${subcommands}` });
        });

        await interaction.reply({ embeds: [embed] });
    },

    development: true
};