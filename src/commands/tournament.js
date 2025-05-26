import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";

export default {
    data: new SlashCommandBuilder()
        .setName("tournament")
        .setDescription("Manage tournament settings.")
        // Set roles for each team
        .addSubcommand(subcommand =>
            subcommand
                .setName("role")
                .setDescription("Set role for each team.")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Which team you are setting the mention role for.")
                        .addChoices(
                            { name: "Female", value: "female" },
                            { name: "Mixed", value: "mixed" }
                        )
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Role to set for the team.")
                        .setRequired(true)
                )
        )
        // Send availability message
        .addSubcommand(subcommand =>
            subcommand
                .setName("sendavailability")
                .setDescription("Send availability message.")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Which team you are setting the mention role for.")
                        .addChoices(
                            { name: "Female", value: "female" },
                            { name: "Mixed", value: "mixed" }
                        )
                        .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("title")
                                .setDescription("Set the title for the message.")
                                .setRequired(true)
                        )
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
            if(subcommand === "sendavailability") {
                await this.sendAvailability(interaction);
            } else if(subcommand === "role") {
                await this.setRole(interaction);
            }
        },

        async sendAvailability(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild?.id;

            const type = interaction.options.getString("type");
            const title = interaction.options.getString("title");

            if(!type) {
                return interaction.reply({ content: "You need to specify a type!", ephemeral: true });
            }

            if(!title) {
                return interaction.reply({ content: "You need to specify a title!", ephemeral: true });
            }

            // logic to send the availability message
            const channel = interaction.channel;

            if (!channel) {
                interaction.reply({ content: "A problem went wrong when trying to send tournament embed, please report this", ephemeral: true });
                console.error(`Channel not found for server: ${serverName} ID: ${guildId} Channel: ${channel}`);
                return;
            }

            // Check if the tournament settings exist for the guild
            const tournamentSettings = await executeQuery(`
                SELECT * FROM tournament_settings WHERE guild_id = ?
            `, [guildId]);

            if(tournamentSettings.length === 0) {
                // Initialize tournament settings if not present
                await executeQuery(`
                    INSERT INTO tournament_settings (guild_id) VALUES (?)
                `, [guildId]);
                console.log(`🔍 No tournament settings found for guild: ${guildId}. Initialized default settings.`);
            }

            // Check if role is set for type
            const roleId = tournamentSettings[0]?.[`${type}_role_id`];

            if (!roleId) {
                return interaction.reply({ content: `No role is set for ${type} tournament! Use \`/tournament role\` to set it.`, ephemeral: true });
            }

            // Send embed based on type
            const embed = new EmbedBuilder()
                .setColor("#0099ff")
                .setTitle(title)
                .setDescription(`React with ✅ if you can play and ❌ if you can't play.`)
                .addFields(
                    { name: "\nAvailable", value: "No players", inline: true },
                    { name: "\nNot Available", value: "No players", inline: true }
                )

            // send the embed message to the channel
            const embedMessage = await channel.send({ embeds: [embed] })

            // Check if the role is set and mention it
            if(roleId) {
                channel.send({ content: `<@&${roleId}>` });
            }

            // Add reactions to the message
            await embedMessage.react("✅");
            await embedMessage.react("❌");

            // Store the message ID in the database
            try {
                await executeQuery(`
                    INSERT INTO tournament_settings (guild_id, ${type}_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE ${type}_message_id = VALUES(${type}_message_id)
                `, [guildId, embedMessage.id]);

                await interaction.reply({ content: `Tournament availability sent for ${type}!`, ephemeral: true });
            } catch (error) {
                console.error(`Error saving ${type}_message_id to database for: ${serverName} ID: ${guildId}`, error);
                return interaction.reply({ content: `An error occurred while sending the message, please report this.`, ephemeral: true });
            }
        },

        async setRole(interaction) {

            const serverName = interaction.guild.name;
            const guildId = interaction.guild?.id;

            const type = interaction.options.getString("type");
            const role = interaction.options.getRole("role");

            // Validate inputs
            if(!type) {
                return interaction.reply({ content: "You need to specify a type!", ephemeral: true });
            }

            if(!role) {
                return interaction.reply({ content: "You need to specify a role!", ephemeral: true });
            }   

            // Check if the role is already set as what user is trying to change it to
            const tournamentSettings = await executeQuery(`
                SELECT * FROM tournament_settings WHERE guild_id = ? AND ${type}_role_id = ?
            `, [guildId, role.id]);

            if (tournamentSettings.length > 0) {
                if(tournamentSettings[0]?.[`${type}_role_id`] === role.id) {
                    return interaction.reply({ content: `Role is already set as ${role} for ${type}!`, ephemeral: true });
                }
            }

            // Save the role to the database
            try {
                await executeQuery(`
                INSERT INTO tournament_settings (guild_id, ${type}_role_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE ${type}_role_id = VALUES(${type}_role_id)
            `, [guildId, role.id])

                return interaction.reply({ content: `Role set as ${role} for ${type}!`, ephemeral: true });
            } catch(error) {
                console.error(`Error saving ${type}_role_id to database for: ${serverName} ID: ${guildId}`, error);
                return interaction.reply({ content: `An error occurred while setting the role for ${type} tournament, please report this.`, ephemeral: true });
            }
        },

    development: true
}