import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { executeQuery } from "../database.js";

export default {
    data: new SlashCommandBuilder()
        .setName("announcement")
        .setDescription("Configure announcements for your server.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Setup announcement channels.")
                .addStringOption(option =>
                    option.setName("type")
                        .setDescription("Select the type of announcement channel.")
                        .addChoices(
                            { name: "Public", value: "public" },
                            { name: "Team", value: "team" },
                            { name: "Clan", value: "clan" }
                        )
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel to send announcements to.")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("The role to mention in the announcement.")
                        .setRequired(false)
                )
    ),

    async execute(interaction) {

        // Admin permission check
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: "You need **Administrator** permission to use /announcement setup!", 
                ephemeral: true 
            });
        }

        const type = interaction.options.getString("type");
        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("role");
        const roleId = role ? role.id : 0;

        if(!type) {
            return interaction.reply({ 
                content: "Please select a valid type for the announcement channel.", 
                ephemeral: true 
            });
        }

        if (!channel) {
            return interaction.reply({ 
                content: "Please select a valid text channel.", 
                ephemeral: true 
            });
        }

        if (!interaction.guild.channels.cache.has(channel.id)) {
            return interaction.reply({ 
                content: "The selected channel does not exist in this server.", 
                ephemeral: true 
            });
        }

        const serverName = interaction.guild.name;
        const guildId = interaction.guild.id;

        if(!guildId) {
            return interaction.reply({ 
                content: "Error: guildId is undefined.", 
                ephemeral: true 
            });
        }

        // Save everything to the database
        try {
            await executeQuery(`
                INSERT INTO announcement_settings (guild_id, ${type}_channel_id, ${type}_channel_role_id)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE ${type}_channel_id = VALUES(${type}_channel_id), ${type}_channel_role_id = VALUES(${type}_channel_role_id)
            `, [guildId, channel.id, roleId]);

            let confirmationMessage = `Announcement channel setup successfully for ${serverName} in ${channel}.`;
            if(roleId) {
                confirmationMessage += ` Role ${role} will be mentioned.`;
            }

            await interaction.reply({ 
                content: confirmationMessage, 
                ephemeral: true 
            });
        } catch (error) {
            console.error("Error saving announcement channel to database:", error);
            return interaction.reply({ 
                content: "Failed to save announcement channel to the database.", 
                ephemeral: true 
            });
        }
    },

    development: true
};