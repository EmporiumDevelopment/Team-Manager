import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } from "discord.js";
import AnnouncementHandler from "../handlers/announcementHandler.js";

export default {
    data: new SlashCommandBuilder()
        .setName("announcement")
        .setDescription("Manage announcements")
        .addSubcommand(subcommand =>
            subcommand.setName("channel")
                .setDescription("Set the announcement channel and role for a specific type.")
                .addStringOption(option =>
                    option.setName("type")
                        .setDescription("Announcement type (public, team, clan)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Public", value: "public" },
                            { name: "Team", value: "team" },
                            { name: "Clan", value: "clan" }
                        ))
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("The channel to use for this announcement type.")
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("The role to mention in announcements.")
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand.setName("send")
                .setDescription("Send an announcement to the predefined type.")
                .addStringOption(option =>
                    option.setName("type")
                        .setDescription("Announcement type (public, team, clan)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Public", value: "public" },
                            { name: "Team", value: "team" },
                            { name: "Clan", value: "clan" }
                        ))),

    async execute(interaction) {
        const announcementHandler = new AnnouncementHandler(interaction.client);

        if (interaction.options.getSubcommand() === "channel") {
            return announcementHandler.setAnnouncementChannel(interaction);
        }

        // 🔹 Handle announcement sending (open modal)
        const type = interaction.options.getString("type");
        const modal = new ModalBuilder()
            .setCustomId(`announcementModal-${type}`)
            .setTitle(`Send ${type.charAt(0).toUpperCase() + type.slice(1)} Announcement`);

        const titleInput = new TextInputBuilder()
            .setCustomId("title")
            .setLabel("Title")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Announcement Message")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const emojiInput = new TextInputBuilder()
            .setCustomId("emoji")
            .setLabel("Reaction Emoji (Optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(emojiInput)
        );

        await interaction.showModal(modal);
    }
};