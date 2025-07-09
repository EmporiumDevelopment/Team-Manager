import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import { DateTime } from "luxon";
import COLOUR_VALUES from "../utils/colourMap.js"
import { announceTodaysEvents } from "../utils/schedule/scheduleUtils.js";

export default {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Manage the team schedule')
        // channel
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set the channels for schedule')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Which channel are you setting up for the schedule.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Schedule', value: 'schedule' },
                            { name: 'Announcements', value: 'announcements' }
                        )
                )
                .addStringOption(option =>
                    option.setName("team-type")
                        .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Mixed", value: "mixed" },
                            { name: "Female", value: "female" },
                            { name: "Clan", value: "clan" }
                    )
                )
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to be set.')
                        .setRequired(true)
                )
        )
        // role
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('Set the role for schedule announcements')
                .addStringOption(option =>
                    option.setName("team-type")
                        .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Mixed", value: "mixed" },
                            { name: "Female", value: "female" },
                            { name: "Clan", value: "clan" }
                    )
                )
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to be set.')
                        .setRequired(true)
                )
        )
        // emojis
        .addSubcommand(subcommand =>
            subcommand
                .setName('emojis')
                .setDescription('Set the emojis for schedule announcements')
                .addStringOption(option =>
                    option.setName('confirmation')
                        .setDescription('The emoji to use for confirmation.')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('decline')
                        .setDescription('The emoji to use for decline.')
                        .setRequired(false)
                )
        )
        // add
        .addSubcommand(subcommand => 
            subcommand
            .setName("add")
            .setDescription("Add an event to the schedule.")
            .addStringOption(option =>
                option.setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                )
            )
            .addStringOption(option =>
                option.setName("event-name")
                .setDescription("The name of the event being added to the schedule.")
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("event-date")
                .setDescription("Event date (DD/MM/YY)")
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("event-time")
                .setDescription("Event time (HH:mm)")
                .setRequired(true)
            )
        )
        // remove
        .addSubcommand(subcommand => 
            subcommand
            .setName("remove")
            .setDescription("Remove an event from the schedule")
            .addStringOption(option =>
                    option.setName("team-type")
                        .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                        .setRequired(true)
                        .addChoices(
                            { name: "Mixed", value: "mixed" },
                            { name: "Female", value: "female" },
                            { name: "Clan", value: "clan" }
                    )
                )
            .addIntegerOption(option =>
                option.setName("id")
                .setDescription("The ID of the event you would like to remove (left side of the event in the schedule).")
                .setRequired(true)
            )
        )
        // edit
        .addSubcommand(subcommand =>
            subcommand
            .setName("edit")
            .setDescription("Edit an event in the schedule.")
            .addStringOption(option =>
                option.setName("team-type")
                    .setDescription("The team you want to setup scrim availability for. (mixed/female)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                )
            )
            // event ID
            .addIntegerOption(option =>
                option.setName("id")
                .setDescription("ID of the event you want to edit.")
                .setRequired(true)
            )
            // event element type (name, date, time)
            .addStringOption(option =>
                option.setName("type")
                .setDescription("Which part of the event to change.")
                .addChoices(
                    { name: "Name", value: "name" },
                    { name: "Date", value: "date" },
                    { name: "Time", value: "time" }
                )
                .setRequired(true)
            )
            // elements new value
            .addStringOption(option =>
                option.setName("input")
                .setDescription("New value.")
                .setRequired(true)
            )
        )
        // title
        .addSubcommand(subcommand =>
            subcommand
            .setName("title")
            .setDescription("Change the title of the schedule.")
            .addStringOption(option =>
                option.setName("team-type")
                    .setDescription("The team you want to edit the schedule title for. (mixed/female/clan)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                )
            )
            .addStringOption(option =>
                option
                .setName("title")
                .setDescription("New value to replace the title of the current schedule.")
                .setRequired(true)
            )
        )
        // set status
        .addSubcommand(subcommand =>
            subcommand
            .setName("setstatus")
            .setDescription("change the status of an existing event.")
            .addStringOption(option =>
                option.setName("team-type")
                    .setDescription("The team you want to edit the schedule status for. (mixed/female/clan)")
                    .setRequired(true)
                    .addChoices(
                        { name: "Mixed", value: "mixed" },
                        { name: "Female", value: "female" },
                        { name: "Clan", value: "clan" }
                )
            )
            // event id
            .addIntegerOption(option => 
                option
                .setName("id")
                .setDescription("The ID of the event to update")
                .setRequired(true)
            )
            // new status 
            .addStringOption(option =>
                option.setName("status")
                    .setDescription("The new status of the event")
                    .setRequired(true)
                    .addChoices(
                        { name: "Active", value: "active" },
                        { name: "Completed", value: "completed" },
                        { name: "Cancelled", value: "cancelled" }
                    )
            )

        )
        // announce
        .addSubcommand(subcommand => 
            subcommand
            .setName("announce")
            .setDescription("Back up command for announcing scheduled events")
            .addStringOption(option =>
                option.setName("team-type")
                .setDescription("The team you want to announce the schedule for. (mixed/female/clan)")
                .addChoices(
                    { name: "Mixed", value: "mixed" },
                    { name: "Female", value: "female" },
                    { name: "Clan", value: "clan" }
                )
                .setRequired(true)
            )
        ),

    async execute(interaction) {

        const guild = interaction.guild;
        const subcommand = interaction.options.getSubcommand();

        // Permission check
        if (!interaction.member.permissions.has('ManageGuild')) {
            return interaction.reply({ content: 'You do not have permission to manage the guild settings.', ephemeral: true });
        }

        // Check if schedule settings exist for the guild
        const mixedScheduleSettings = await executeQuery(`
            SELECT * FROM mixed_schedule_settings WHERE guild_id = ?
        `, [guild.id]);

        // If no settings exist, create a new entry
        if(mixedScheduleSettings.length === 0) {
            console.log(`No schedule settings found for guild: ${guild.id}, creating new entry.`);
            // Insert a new entry for the guild
            await executeQuery(`
                INSERT INTO mixed_schedule_settings (guild_id)
                VALUES (?)
            `, [guild.id]);
        }

        // Check if schedule settings exist for the guild
        const femaleScheduleSettings = await executeQuery(`
            SELECT * FROM female_schedule_settings WHERE guild_id = ?
        `, [guild.id]);

        // If no settings exist, create a new entry
        if(femaleScheduleSettings.length === 0) {
            console.log(`No schedule settings found for guild: ${guild.id}, creating new entry.`);
            // Insert a new entry for the guild
            await executeQuery(`
                INSERT INTO female_schedule_settings (guild_id)
                VALUES (?)
            `, [guild.id]);
        }

        // Check if schedule settings exist for the guild
        const clanScheduleSettings = await executeQuery(`
            SELECT * FROM clan_schedule_settings WHERE guild_id = ?
        `, [guild.id]);

        // If no settings exist, create a new entry
        if(clanScheduleSettings.length === 0) {
            console.log(`No schedule settings found for guild: ${guild.id}, creating new entry.`);
            // Insert a new entry for the guild
            await executeQuery(`
                INSERT INTO clan_schedule_settings (guild_id)
                VALUES (?)
            `, [guild.id]);
        }

        if(subcommand === 'channel') {
            await this.setChannel(interaction);
        }

        if(subcommand === 'role') {
            await this.setRole(interaction);
        }

        if(subcommand === 'emojis') {
            await this.setEmojis(interaction);
        }

        if(subcommand === "add") {
            await this.addEvent(interaction);
        }

        if(subcommand === "remove") {
            await this.removeEvent(interaction);
        }

        if(subcommand === "edit") {
            await this.editEvent(interaction);
        }

        if(subcommand === "title") {
            await this.setTitle(interaction);
        }

        if(subcommand === "setstatus") {
            await this.setStatus(interaction);
        }

        if(subcommand === "announce") {

            // new to verify valid team type
            const team = interaction.options.getString("team-type");
            await announceTodaysEvents(guild, guild.client, team);
        }
    },

    async setChannel(interaction) {

        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');

        const team = interaction.options.getString("team-type");
        const guild = interaction.guild;
        const guildId = guild.id;

        // Validate user input
        if(!type) {
            return interaction.reply({ content: 'You must specify a type for the channel.', ephemeral: true });
        }

        // valid types
        const validTypes = ['schedule', 'announcements'];
        if(!validTypes.includes(type)) {
            return interaction.reply({ content: 'Invalid type specified. Valid types are: schedule, announcements.', ephemeral: true });
        }

        if(!team) {
            return interaction.reply({ content: 'You must specify a team type.', ephemeral: true });
        }

        if(!channel) {
            return interaction.reply({ content: 'You must specify a channel to set.', ephemeral: true });
        }

        // Check if the channel exists in the guild
        const fetchedChannel = await interaction.guild.channels.fetch(channel.id).catch(() => null);
        if(!fetchedChannel) {
            return interaction.reply({ content: 'The specified channel does not exist in this guild.', ephemeral: true });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply({ ephemeral: true });

        // Update the channel in the database
        try {
            // Insert or update the channel id in the schedule_settings table
            await executeQuery(`
                INSERT INTO ${team}_schedule_settings (guild_id, ${type}_channel_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE ${type}_channel_id = VALUES(${type}_channel_id);
            `, [guildId, channel.id]);

            // Send the default schedule message if the type is schedule
            if(type === 'schedule') {

                const scheduleSettings = await executeQuery(`
                    SELECT * FROM ${team}_schedule_settings WHERE guild_id = ?
                `, [guildId]);

                const title = scheduleSettings[0]?.embed_title || 'Team Schedule';

                // Check if events exist for the guild

                // If events exists add them to the description
                // For now, we will just set a default description

                let description = "No events scheduled.\n\n Use `/schedule add` to add a new event.\nUse `/schedule remove` to remove an event.\nUse `/schedule edit` to edit an event.\nUse `/schedule title` to change the title of the schedule.";

                const scheduleEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(title)
                    .setDescription(description)

                await fetchedChannel.send({ embeds: [scheduleEmbed] });

                // Save the schedule embed message ID to the database
                await executeQuery(`
                    INSERT INTO ${team}_schedule_settings (guild_id, schedule_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE schedule_message_id = VALUES(schedule_message_id);
                `, [guildId, fetchedChannel.lastMessageId]);
            }

            // Send confirmation message
            console.log(`Updated schedule channel for guild: ${guildId}, type: ${type}, channel: ${channel.id}`);
            interaction.editReply({ content: `Successfully updated the ${type} channel to <#${channel.id}>.`, ephemeral: true });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings update**\n\nThe schedule channel has been updated for ${team}\n\n**New Channel:** <#${channel.id}>\n**By:** <@${interaction.user.id}>
                `, COLOUR_VALUES.EDIT
            );
                
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule channel.`, ephemeral: true });
        }
    },

    async setRole(interaction) {

        const role = interaction.options.getRole('role');
        const team = interaction.options.getString("team-type");

        const guild = interaction.guild;
        const guildId = guild.id;

        // Validate user input
        if(!role) {
            return interaction.reply({ content: 'You must specify a role to set.', ephemeral: true });
        }

        if(!team) {
            return interaction.reply({ content: 'You must specify a team type.', ephemeral: true });
        }

        // Check if the role exists in the guild
        if(!interaction.guild.roles.cache.has(role.id)) {
            return interaction.reply({ content: 'The specified role does not exist in this guild.', ephemeral: true });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply({ ephemeral: true });

        // Update the role in the database
        try {
            await executeQuery(`
                INSERT INTO ${team}_schedule_settings (guild_id, role_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
            `, [guildId, role.id]);

            // Send confirmation message
            console.log(`Updated Schedule Announcements mention role for guild: ${guildId}, role: ${role.id}`);
            interaction.editReply({ content: `Successfully updated the Schedule Announcements mention role to ${role}.`, ephemeral: true });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings update**\n\nThe mention Role for schedule announcements has been changed for ${team}\n\n**New Role:** ${role}\n**By:** <@${interaction.user.id}>`
                , COLOUR_VALUES.EDIT
            );
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule role for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule role.`, ephemeral: true });
        }
    },

    async setEmojis(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const confirmationEmoji = interaction.options.getString('confirmation');
        const declineEmoji = interaction.options.getString('decline');

        // Validate user input
        if(!confirmationEmoji && !declineEmoji) {
            return interaction.reply({ content: `No emojis specified, using default emojis`, ephemeral: true });
        }

        // Validate emojis
        const emojiRegex = /^<:\w+:\d+>$/;
        if(confirmationEmoji) {
            if(!emojiRegex.test(confirmationEmoji)) {
                return interaction.reply({ content: `Invalid confirmation emoji format. Please use a custom emoji format like <emoji_name:emoji_id>.`, ephemeral: true });
            }
        }

        if(declineEmoji) {
            if(!emojiRegex.test(declineEmoji)) {
                return interaction.reply({ content: `Invalid decline emoji format. Please use a custom emoji format like <emoji_name:emoji_id>.`, ephemeral: true });
            }
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply({ ephemeral: true });

        // Update the emojis in the database
        try {
            await executeQuery(`
                INSERT INTO schedule_settings (guild_id, confirmation_emoji, decline_emoji)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE confirmation_emoji = VALUES(confirmation_emoji), decline_emoji = VALUES(decline_emoji);
            `, [guildId, confirmationEmoji, declineEmoji]);

            // Send confirmation message
            console.log(`Updated Schedule Emojis for guild: ${guildId}, confirmation: ${confirmationEmoji}, decline: ${declineEmoji}`);
            interaction.editReply({ content: `Successfully updated the Schedule Emojis. Confirmation: ${confirmationEmoji}, Decline: ${declineEmoji}.`, ephemeral: true });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings updated**\n\nReaction emojis for schedule announcements have been updated.\n\n**Confirmation Emoji:** ${confirmationEmoji}\n**Decline Emoji:** ${declineEmoji}\n**By:** ${interaction.user.username}`, 
                COLOUR_VALUES.EDIT
            );
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule emojis for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule emojis.`, ephemeral: true });
        }
    },

    async addEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const team = interaction.options.getString("team-type");
        const eventName = interaction.options.getString("event-name");
        const eventDate = interaction.options.getString("event-date");
        const eventTime = interaction.options.getString("event-time");
        const creator = interaction.user.id;

        // 🔹 Validate user input
        if(!team) {
            return interaction.reply({ content: "You must specify a team type.", ephemeral: true });
        }

        if (!eventName) {
            return interaction.reply({ content: "You need to enter an event name.", ephemeral: true });
        }

        if (!eventDate || !/^(\d{2})\/(\d{2})\/(\d{2})$/.test(eventDate)) {
            return interaction.reply({ content: "Invalid date format. Use DD/MM/YY (Example: 01/01/25)", ephemeral: true });
        }

        if (!eventTime || !/^(\d{2}):(\d{2})$/.test(eventTime)) {
            return interaction.reply({ content: "Invalid time format. Use HH:mm (Example: 20:00)", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // 🔹 Convert user input date to MySQL format (`YYYY-MM-DD`)
        const [day, month, year] = eventDate.split("/");
        const formattedDate = `20${year}-${month}-${day}`;

        // 🔹 Convert user input time to MySQL format (`HH:mm:00`)
        const formattedTime = `${eventTime}:00`;

        // Convert event time to CET before storing in MySQL
        const cetEventTime = DateTime.fromFormat(`${formattedDate} ${formattedTime}`, "yyyy-MM-dd HH:mm:ss", { zone: "Europe/Berlin" });

        // Convert to CET/CEST and format properly for MySQL insertion (HH:mm:ss)
        const mysqlFormattedTime = cetEventTime.toFormat("HH:mm:ss");

        await executeQuery(`
            INSERT INTO ${team}_schedule (guild_id, event_name, event_date, event_time, created_by)
            VALUES (?, ?, ?, ?, ?);
        `, [guildId, eventName, cetEventTime.toISODate(), mysqlFormattedTime, creator]);

        // reindex IDs before sending updated embed
        await this.reindexEvents(interaction, team);

        // update schedule
        await this.updateScheduleEmbed(interaction, team);

        // send confirmation and logs
        await interaction.editReply({ content: `Event **${eventName}** added for **${eventDate} at ${eventTime}**. Schedule updated.`, ephemeral: true });
        await sendLogEmbed(
            guildId, 
            `**Schedule Event Added**\n\nAn event has been added to the ${team} schedule.\n\n**Event Name:** ${eventName}\n**Date:** ${eventDate}\n**Time:** ${eventTime}\n**By:** <@${creator}>`, 
            COLOUR_VALUES.ADD
        );
    },

    async removeEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const team = interaction.options.getString("team-type");
        const eventId = interaction.options.getInteger("id");

        // validate user input
        if(!team) {
            return interaction.reply({ content: "You must specify a team type.", ephemeral: true });
        }

        if(!eventId) {
            return interaction.reply({ content: "You must provide a valid event ID, they are on the left side of each event in the schedule list.", ephemeral: true});
        }

        await interaction.deferReply({ ephemeral: true });

        const eventExists = await executeQuery(`
            SELECT id FROM ${team}_schedule WHERE guild_id = ? AND id = ?;
            `, [guildId, eventId]);

        if(!eventExists.length) {
            return interaction.editReply({ content: `No event found with the ID: **${eventId}**.`, ephemeral: true });
        }

        // event is already verified and every event needs a name so no need to verify eventName
        const eventName = await executeQuery(`
            SELECT event_name FROM ${team}_schedule WHERE guild_id = ? AND id = ?;
            `, [guildId, eventId]);

        try {

            // remove event from database
            await executeQuery(`
                DELETE FROM ${team}_schedule WHERE guild_id = ? AND id = ?;
                `, [guildId, eventId]);

            // reindex IDs before sending updated embed
            await this.reindexEvents(interaction, team);

            // update schedule embed
            await this.updateScheduleEmbed(interaction, team);

            await interaction.editReply({ content: `Event **${eventId}** has been removed. Schedule updated!`, ephemeral: true });
            await sendLogEmbed(
                guildId, 
                `**Schedule Event Removed**\n\nAn event has been removed from the ${team} schedule.\n\n**Event ID:** ${eventId}\n**Event name:** ${eventName[0].event_name}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.REMOVE
            );
        } catch(error) {
            console.error(`Error removing event ${eventId} from schedule for guild: ${guildId}`, error);
            await interaction.followUp({ content: "An error occurred while removing the event. Please report this issue.", ephemeral: true });
        }
    },

    async editEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        if (!guildId) {
            console.log("Invalid Guild ID, aborting event edit");
            return interaction.reply({ content: "An error occurred while editing the event. Please report this.", ephemeral: true });
        }

        const team = interaction.options.getString("team-type");
        const eventId = interaction.options.getInteger("id");
        let type = interaction.options.getString("type");
        const input = interaction.options.getString("input");

        // 🔹 Validate user input
        if(!team) {
            return interaction.reply({ content: "You must specify a team type.", ephemeral: true });
        }

        if (!eventId) {
            return interaction.reply({ content: "You must provide the ID of the event you want to edit. (Displayed on the left side of each event in the schedule)", ephemeral: true });
        }

        if (!type) {
            return interaction.reply({ content: "You must select which element of the event you want to edit. Options: `name`, `date`, `time`.", ephemeral: true });
        }

        if (!input) {
            return interaction.reply({ content: "You must enter a new value to replace the current value.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // 🔹 Normalize type input to prevent validation issues
        type = type.trim().toLowerCase();

        if (!["name", "date", "time"].includes(type)) {
            return interaction.editReply({ content: "Invalid edit type. Use `name`, `date`, or `time`.", ephemeral: true });
        }

        // 🔹 Fetch the current event
        const eventDetails = await executeQuery(`
            SELECT event_name, event_date, event_time FROM ${team}_schedule WHERE guild_id = ? AND id = ?;
        `, [guildId, eventId]);

        if (!eventDetails.length) {
            return interaction.editReply({ content: `No event found with the ID **${eventId}**.`, ephemeral: true });
        }

        try {
            let updateQuery = "";
            let updateParams = [];

            // 🔹 Determine which field to update
            if (type === "name") {
                updateQuery = `UPDATE ${team}_schedule SET event_name = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [input, guildId, eventId];

            } else if (type === "date") {
                if (!/^(\d{2})\/(\d{2})\/(\d{2})$/.test(input)) {
                    return interaction.editReply({ content: "Invalid date format. Use DD/MM/YY (Example: 01/01/25)", ephemeral: true });
                }

                const [day, month, year] = input.split("/");
                const formattedDate = `20${year}-${month}-${day}`;
                updateQuery = `UPDATE ${team}_schedule SET event_date = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [formattedDate, guildId, eventId];

            } else if (type === "time") {
                if (!/^(\d{2}):(\d{2})$/.test(input)) {
                    return interaction.editReply({ content: "Invalid time format. Use HH:mm (Example: 20:00)", ephemeral: true });
                }

                const formattedTime = `${input}:00`;
                updateQuery = `UPDATE ${team}_schedule SET event_time = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [formattedTime, guildId, eventId];
            }

            // 🔹 Save changes to the database
            await executeQuery(updateQuery, updateParams);

            // reindex IDs before sending updated embed
            await this.reindexEvents(interaction, team);

            // 🔹 Update the schedule embed
            await this.updateScheduleEmbed(interaction, team);

            // 🔹 Send log message
            sendLogEmbed(
                guildId, 
                `**Schedule Event Edited**\n\nAn event has been edited in the ${team} schedule.\n\n**Event ID:** ${eventId}\n**Event name:** ${eventDetails[0].event_name}\n**New Value:** ${input}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            // 🔹 Send confirmation message
            await interaction.editReply({ content: `Event **${eventDetails[0].event_name}** updated: **${type}** changed to **${input}**!`, ephemeral: true });
        } catch (error) {
            console.error(`Error editing event ${eventId} from schedule for guild: ${guildId}`, error);
            await interaction.followUp({ content: "An error occurred while editing the event. Please report this issue.", ephemeral: true });
        }
    },

    async setTitle(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        if(!guildId) {
            console.log(`Guild ID invalid while trying to edit schedule title for: ${guild}`);
            return interaction.reply("There was an error while trying to change the title of the schedule, please report this.");
        }

        const team = interaction.options.getString("team-type");
        const title = interaction.options.getString("title");

        // validate user input
        if(!team) {
            return interaction.reply("You must specify a team type for the schedule title.");
        }

        if(!title) {
            return interaction.reply("The title for the schedule can not be empty.")
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // update in database
            await executeQuery(`
                INSERT INTO ${team}_schedule_settings (guild_id, embed_title)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
                `, [guildId, title]);

            // update schedule
            await this.updateScheduleEmbed(interaction, team);

            // Send confirmation and log message
            console.log(`Updated schedule title to: ${title} in guild: ${guildId}`);
            await interaction.editReply({ content: `Successfully updated the ${team} schedule title to ${title}.`, ephemeral: true });
            return sendLogEmbed(
                guildId, 
                `**Schedule settings updated**\n\nThe Title of the ${team} schedule has been updated.\n\n**New Title:** ${title}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the ${team} schedule channel.`, ephemeral: true });
        }
    },

    async setStatus(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        // validate guild id
        if(!guildId) {
            console.log(`Guild ID invalid while trying to edit schedule title for: ${guild}`);
            return interaction.reply("There was an error while trying to change the status of the event, please report this.");
        }

        const team = interaction.options.getString("team-type");
        const id = interaction.options.getInteger("id");

        // validate user input
        if(!team) {
            return interaction.reply({ content: "You must specify a team type for the schedule status.", ephemeral: true });
        }

        if(!id) {
            return interaction.reply({ content: "You need to specify the ID of the event you would like to change the status of. (ID of each event is displayed in the schedule)", ephemeral: true });
        }

        const status = interaction.options.getString("status");

        if(!status) {
            return interaction.reply({ content: "You need to set the new status of the event. (active, completed or cancelled).", ephemeral: true });
        }

        // check status is a valid choice
        const allowedStatuses = ["active", "completed", "cancelled"];
        if(!allowedStatuses.includes(status)) {
            return interaction.reply({ content: `Invalid status: ${status}, please choose an option from the list. (active, completed or cancelled)`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            const eventExists = await executeQuery(`
                SELECT event_name FROM ${team}_schedule WHERE id = ? AND guild_id = ?
                `, [id, guildId]);

            // check if the event exists
            if(!eventExists.length) {
                return interaction.editReply({ content: `No event with the ID: ${id} exists, please check the ${team} schedule for valid event IDs`, ephemeral: true });
            }

            // update the database
            await executeQuery(`
                UPDATE ${team}_schedule SET status = ? WHERE id = ?;
            `, [status, id]);

            // send confirmation and logs
            interaction.editReply({ content: `Event **${eventExists[0].event_name}** is now marked as **${status}**.`, ephemeral: true });

            // if new status is complete remove it completely
            if (status === "completed") {

                // remove from database
                await executeQuery(`
                    DELETE FROM ${team}_schedule WHERE id = ? AND guild_id = ?
                    `, [id, guildId]);

                // reindex stored events
                await this.reindexEvents(interaction, team);

                // send log
                sendLogEmbed(
                    guildId, 
                    `**Schedule Event Completed**\n\nAn event has been marked as completed and removed from the ${team} schedule.\n\n**Event ID:** ${id}\n**Event Name:** ${eventExists[0].event_name}\n**By:** <@${interaction.user.id}>`, 
                    COLOUR_VALUES.REMOVE
                );
            } else {
                sendLogEmbed(
                    guildId, 
                    `**Schedule Event Status Updated**\n\nThe status of an event has been updated.\n\n**Event ID:** ${id}\n**Status:** ${status}\n**By:** <@${interaction.user.id}>`, 
                    COLOUR_VALUES.EDIT
                );
            }

            // update schedule embed
            await this.updateScheduleEmbed(interaction, team);

        } catch (error) {
            interaction.editReply({ content: `Something went wrong while setting the status of Event ID: ${id} with new status: ${status}, please report this`, ephemeral: true });
            console.log(`Error occured while setting new status for event id: ${id} with new status ${status} in guild: ${guildId}`, error);
        }
    },

    async updateScheduleEmbed(interaction, team) {

        const guildId = interaction.guild.id;
        if(!team) return;

        const scheduleSettings = await executeQuery(`
            SELECT schedule_channel_id, schedule_message_id, embed_title
            FROM ${team}_schedule_settings
            WHERE guild_id = ?;
        `, [guildId]);

        if (!scheduleSettings.length || !scheduleSettings[0].schedule_message_id) {
            return interaction.followUp({ content: "⚠ No schedule embed is set yet. Set it up using `/schedule channel`.", ephemeral: true });
        }

        const scheduleChannelId = scheduleSettings[0].schedule_channel_id;
        const scheduleMessageId = scheduleSettings[0].schedule_message_id;
        const title = scheduleSettings[0].embed_title || "Team Schedule";

        // 🔹 Fetch the schedule channel & message
        const scheduleChannel = await interaction.guild.channels.fetch(scheduleChannelId);
        const scheduleMessage = await scheduleChannel.messages.fetch(scheduleMessageId);

        // 🔹 Retrieve all scheduled events
        const events = await executeQuery(`
            SELECT id, event_name, 
                DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date, 
                DATE_FORMAT(event_time, '%H:%i:%s') AS event_time
            FROM ${team}_schedule
            WHERE guild_id = ?
            ORDER BY event_date, event_time;
        `, [guildId]);

        // 🔹 Format events correctly using Luxon for CET/CEST handling
        let eventList = events.map(event => {
            // Ensure stored event time is correctly interpreted as CET/CEST
            const eventDateTime = DateTime.fromSQL(`${event.event_date} ${event.event_time}`, { zone: "Europe/Berlin" });

            // Format date & time correctly
            const formattedDate = `${eventDateTime.day.toString().padStart(2, "0")}/${eventDateTime.month.toString().padStart(2, "0")}/${eventDateTime.year.toString().slice(-2)}`;
            const formattedTime = `${eventDateTime.hour.toString().padStart(2, "0")}:${eventDateTime.minute.toString().padStart(2, "0")}`;

            return `-# [${event.id}]\n## ${event.event_name}\n> **Date:** ${formattedDate}\n> **Time:** ${formattedTime}`;
        }).join("\n");

        if (!eventList) {
            eventList = "No events scheduled. Use `/schedule add` to create one!";
        }

        // Update the schedule embed
        const updatedEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(eventList)
            .setColor(0x00AAFF)

        await scheduleMessage.edit({ embeds: [updatedEmbed] });
    },

    async reindexEvents(interaction, team) {

        const guildId = interaction.guild.id;

        if (!guildId || !team) {
            console.log("Invalid guild ID or team when reindexing.");
            return;
        }

        try {
            // Use a transaction to safely update the event order
            await executeQuery(`START TRANSACTION;`);

            // Step 1: Drop any existing temporary reindex table
            await executeQuery(`DROP TEMPORARY TABLE IF EXISTS ${team}_schedule_reindexed;`);

            // Step 2: Create a new temp table without the AUTO_INCREMENT 'id' column
            await executeQuery(`
                CREATE TEMPORARY TABLE ${team}_schedule_reindexed (
                    guild_id VARCHAR(32),
                    event_name VARCHAR(255),
                    event_date DATE,
                    event_time TIME,
                    announcement_message_id VARCHAR(64),
                    participants TEXT,
                    created_by VARCHAR(32),
                    status VARCHAR(16)
                );
            `);

            // Step 3: Insert all events ordered by date and time into the temp table
            await executeQuery(`
                INSERT INTO ${team}_schedule_reindexed (
                    guild_id, event_name, event_date, event_time,
                    announcement_message_id, participants, created_by, status
                )
                SELECT
                    guild_id, event_name, event_date, event_time,
                    announcement_message_id, IFNULL(participants, ''),
                    created_by, status
                FROM ${team}_schedule
                WHERE guild_id = ?
                ORDER BY event_date, event_time;
            `, [guildId]);

            // Step 4: Clear the original events for this guild
            await executeQuery(`DELETE FROM ${team}_schedule WHERE guild_id = ?;`, [guildId]);

            // Step 5: Reset AUTO_INCREMENT to start fresh
            await executeQuery(`ALTER TABLE ${team}_schedule AUTO_INCREMENT = 1;`);

            // Step 6: Reinsert from temp table—MySQL will assign new sequential IDs
            await executeQuery(`
                INSERT INTO ${team}_schedule (
                    guild_id, event_name, event_date, event_time,
                    announcement_message_id, participants, created_by, status
                )
                SELECT
                    guild_id, event_name, event_date, event_time,
                    announcement_message_id, participants, created_by, status
                FROM ${team}_schedule_reindexed;
            `);

            // Step 7: Drop the temp table and commit the transaction
            await executeQuery(`DROP TEMPORARY TABLE ${team}_schedule_reindexed;`);
            await executeQuery(`COMMIT;`);
        } catch (error) {
            console.error(`Failed to reindex ${team} schedule events for guild ${guildId}:`, error);
            await executeQuery(`ROLLBACK;`);
        }
    },

    development: false
}