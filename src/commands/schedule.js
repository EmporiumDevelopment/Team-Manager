import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import { DateTime } from "luxon";
import COLOUR_VALUES from "../utils/colourMap.js"

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
                .setDescription("Event time (HH/MM)")
                .setRequired(true)
            )
        )
        // remove
        .addSubcommand(subcommand => 
            subcommand
            .setName("remove")
            .setDescription("Remove an event from the schedule")
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

        ),

    async execute(interaction) {

        const guild = interaction.guild;
        const subcommand = interaction.options.getSubcommand();

        // Permission check
        if (!interaction.member.permissions.has('ManageGuild')) {
            return interaction.reply({ content: 'You do not have permission to manage the guild settings.', ephemeral: true });
        }

        // Check if schedule settings exist for the guild
        const scheduleSettings = await executeQuery(`
            SELECT * FROM schedule_settings WHERE guild_id = ?
        `, [guild.id]);

        // If no settings exist, create a new entry
        if(scheduleSettings.length === 0) {
            console.log(`No schedule settings found for guild: ${guild.id}, creating new entry.`);
            // Insert a new entry for the guild
            await executeQuery(`
                INSERT INTO schedule_settings (guild_id)
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
    },

    async setChannel(interaction) {

        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');

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

        if(!channel) {
            return interaction.reply({ content: 'You must specify a channel to set.', ephemeral: true });
        }

        // Check if the channel exists in the guild
        const fetchedChannel = await interaction.guild.channels.fetch(channel.id).catch(() => null);
        if(!fetchedChannel) {
            return interaction.reply({ content: 'The specified channel does not exist in this guild.', ephemeral: true });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply();

        // Update the channel in the database
        try {
            // Insert or update the channel id in the schedule_settings table
            await executeQuery(`
                INSERT INTO schedule_settings (guild_id, ${type}_channel_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE ${type}_channel_id = VALUES(${type}_channel_id);
            `, [guildId, channel.id]);

            // Send the default schedule message if the type is schedule
            if(type === 'schedule') {

                const scheduleSettings = await executeQuery(`
                    SELECT * FROM schedule_settings WHERE guild_id = ?
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
                    INSERT INTO schedule_settings (guild_id, schedule_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE schedule_message_id = VALUES(schedule_message_id);
                `, [guildId, fetchedChannel.lastMessageId]);
            }

            // Send confirmation message
            console.log(`Updated schedule channel for guild: ${guildId}, type: ${type}, channel: ${channel.id}`);
            interaction.editReply({ content: `Successfully updated the ${type} channel to <#${channel.id}>.`, ephemeral: true });

            // Send discord log message
            await sendLogEmbed(guildId, `
                **Schedule settings update**

                The schedule channel has been updated

                **Channel:** <#${channel.id}>
                **By:** <@${interaction.user.id}>
            `, COLOUR_VALUES.EDIT);
                
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule channel.`, ephemeral: true });
        }
    },

    async setRole(interaction) {

        const role = interaction.options.getRole('role');

        const guild = interaction.guild;
        const guildId = guild.id;

        // Validate user input
        if(!role) {
            return interaction.reply({ content: 'You must specify a role to set.', ephemeral: true });
        }

        // Check if the role exists in the guild
        if(!interaction.guild.roles.cache.has(role.id)) {
            return interaction.reply({ content: 'The specified role does not exist in this guild.', ephemeral: true });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply();

        // Update the role in the database
        try {
            await executeQuery(`
                INSERT INTO schedule_settings (guild_id, role_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
            `, [guildId, role.id]);

            // Send confirmation message
            console.log(`Updated Schedule Announcements mention role for guild: ${guildId}, role: ${role.id}`);
            interaction.editReply({ content: `Successfully updated the Schedule Announcements mention role to ${role}.`, ephemeral: true });

            // Send discord log message
            await sendLogEmbed(guildId, `
                **Schedule settings update**
                
                The mention Role for schedule announcements has been change
                
                **New Role:** ${role} 
                **By:** <@${interaction.user.id}>`, COLOUR_VALUES.EDIT);
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
        await interaction.deferReply();

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
            await sendLogEmbed(guildId, `
                **Schedule settings updated**
                
                Reaction emojis for schedule announcements have been updated.

                **Confirmation Emoji:** ${confirmationEmoji}
                **Decline Emoji:** ${declineEmoji}
                **By:** ${interaction.user.username}
                `, COLOUR_VALUES.EDIT);
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule emojis for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule emojis.`, ephemeral: true });
        }
    },

    async addEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const eventName = interaction.options.getString("event-name");
        const eventDate = interaction.options.getString("event-date");
        const eventTime = interaction.options.getString("event-time");
        const creator = interaction.user.id;

        // 🔹 Validate user input
        if (!eventName) {
            return interaction.reply({ content: "You need to enter an event name.", ephemeral: true });
        }

        if (!eventDate || !/^(\d{2})\/(\d{2})\/(\d{2})$/.test(eventDate)) {
            return interaction.reply({ content: "Invalid date format. Use DD/MM/YY (Example: 01/01/25)", ephemeral: true });
        }

        if (!eventTime || !/^(\d{2}):(\d{2})$/.test(eventTime)) {
            return interaction.reply({ content: "Invalid time format. Use HH:mm (Example: 20:00)", ephemeral: true });
        }

        await interaction.deferReply();

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
            INSERT INTO schedule (guild_id, event_name, event_date, event_time, created_by)
            VALUES (?, ?, ?, ?, ?);
        `, [guildId, eventName, cetEventTime.toISODate(), mysqlFormattedTime, creator]);

        // reindex IDs before sending updated embed
        await this.reindexEvents(interaction);

        // update schedule
        await this.updateScheduleEmbed(interaction);

        // send confirmation and logs
        await interaction.editReply({ content: `Event **${eventName}** added for **${eventDate} at ${eventTime}**. Schedule updated.`, ephemeral: true });
        await sendLogEmbed(guildId, `
            **Schedule Event Added**

            An event has been added to the schedule.

            **Event Name:** ${eventName}
            **Date:** ${eventDate}
            **Time:** ${eventTime}
            **Added By:** <@${creator}>
            `, COLOUR_VALUES.ADD);
    },

    async removeEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const eventId = interaction.options.getInteger("id");

        // validate user input
        if(!eventId) {
            return interaction.reply({ content: "You must provide a valid event ID, they are on the left side of each event in the schedule list.", ephemeral: true});
        }

        await interaction.deferReply();

        const eventExists = await executeQuery(`
            SELECT id FROM schedule WHERE guild_id = ? AND id = ?;
            `, [guildId, eventId]);

        if(!eventExists.length) {
            return interaction.editReply({ content: `No event found with the ID: **${eventId}**.`, ephemeral: true });
        }

        // event is already verified and every event needs a name so no need to verify eventName
        const eventName = await executeQuery(`
            SELECT event_name FROM schedule WHERE guild_id = ? AND id = ?;
            `, [guildId, eventId]);

        try {

            // remove event from database
            await executeQuery(`
                DELETE FROM schedule WHERE guild_id = ? AND id = ?;
                `, [guildId, eventId]);

            // reindex IDs before sending updated embed
            await this.reindexEvents(interaction);

            // update schedule embed
            await this.updateScheduleEmbed(interaction);

            await interaction.editReply({ content: `Event **${eventId}** has been removed. Schedule updated!`, ephemeral: true });
            await sendLogEmbed(guildId, `
                **Schedule Event Removed**

                An event has been removed from the schedule.

                **Event ID:** ${eventId}
                **Event:** ${eventName[0].event_name}\n
                **Removed By:** <@${interaction.user.id}>
                `, COLOUR_VALUES.REMOVE);
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

        const eventId = interaction.options.getInteger("id");
        let type = interaction.options.getString("type");
        const input = interaction.options.getString("input");

        // 🔹 Validate user input
        if (!eventId) {
            return interaction.reply({ content: "You must provide the ID of the event you want to edit. (Displayed on the left side of each event in the schedule)", ephemeral: true });
        }

        if (!type) {
            return interaction.reply({ content: "You must select which element of the event you want to edit. Options: `name`, `date`, `time`.", ephemeral: true });
        }

        if (!input) {
            return interaction.reply({ content: "You must enter a new value to replace the current value.", ephemeral: true });
        }

        await interaction.deferReply();

        // 🔹 Normalize type input to prevent validation issues
        type = type.trim().toLowerCase();

        if (!["name", "date", "time"].includes(type)) {
            return interaction.editReply({ content: "Invalid edit type. Use `name`, `date`, or `time`.", ephemeral: true });
        }

        // 🔹 Fetch the current event
        const eventDetails = await executeQuery(`
            SELECT event_name, event_date, event_time FROM schedule WHERE guild_id = ? AND id = ?;
        `, [guildId, eventId]);

        if (!eventDetails.length) {
            return interaction.editReply({ content: `No event found with the ID **${eventId}**.`, ephemeral: true });
        }

        try {
            let updateQuery = "";
            let updateParams = [];

            // 🔹 Determine which field to update
            if (type === "name") {
                updateQuery = `UPDATE schedule SET event_name = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [input, guildId, eventId];

            } else if (type === "date") {
                if (!/^(\d{2})\/(\d{2})\/(\d{2})$/.test(input)) {
                    return interaction.editReply({ content: "Invalid date format. Use DD/MM/YY (Example: 01/01/25)", ephemeral: true });
                }

                const [day, month, year] = input.split("/");
                const formattedDate = `20${year}-${month}-${day}`;
                updateQuery = `UPDATE schedule SET event_date = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [formattedDate, guildId, eventId];

            } else if (type === "time") {
                if (!/^(\d{2}):(\d{2})$/.test(input)) {
                    return interaction.editReply({ content: "Invalid time format. Use HH:mm (Example: 20:00)", ephemeral: true });
                }

                const formattedTime = `${input}:00`;
                updateQuery = `UPDATE schedule SET event_time = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [formattedTime, guildId, eventId];
            }

            // 🔹 Save changes to the database
            await executeQuery(updateQuery, updateParams);

            // reindex IDs before sending updated embed
            await this.reindexEvents(interaction);

            // 🔹 Update the schedule embed
            await this.updateScheduleEmbed(interaction);

            // 🔹 Send log message
            sendLogEmbed(guildId, `
                **Schedule Event Edited**

                An event has been edited in the schedule.

                **Event ID:** ${eventId}
                **Event:** ${eventDetails[0].event_name}
                **Updated Field:** ${type}
                **New Value:** ${input}
                **Edited By:** <@${interaction.user.id}>
                `, COLOUR_VALUES.EDIT);

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

        const title = interaction.options.getString("title");

        // validate user input
        if(!title) {
            return interaction.reply("The title for the schedule can not be empty.")
        }

        await interaction.deferReply();

        try {

            // update in database
            await executeQuery(`
                INSERT INTO schedule_settings (guild_id, embed_title)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE embed_title = VALUES(embed_title)
                `, [guildId, title]);

            // update schedule
            await this.updateScheduleEmbed(interaction);

            // Send confirmation and log message
            console.log(`Updated schedule title to: ${title} in guild: ${guildId}`);
            await interaction.editReply({ content: `Successfully updated the schedule title to ${title}.`, ephemeral: true });
            return sendLogEmbed(guildId, `
                **Schedule Title Updated**

                The title of the schedule has been updated.
                
                **New Title:** ${title}
                **By:** <@${interaction.user.id}>
                `, COLOUR_VALUES.EDIT);
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule channel.`, ephemeral: true });
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

        const id = interaction.options.getInteger("id");

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

        await interaction.deferReply();

        try {

            const eventExists = await executeQuery(`
                SELECT event_name FROM schedule WHERE id = ? AND guild_id = ?
                `, [id, guildId]);

            // check if the event exists
            if(!eventExists.length) {
                return interaction.editReply({ content: `No event with the ID: ${id} exists, please check the schedule for valid event IDs`, ephemeral: true });
            }

            // update the database
            await executeQuery(`
                UPDATE schedule SET status = ? WHERE id = ?;
            `, [status, id]);

            // send confirmation and logs
            interaction.editReply({ content: `Event **${eventExists[0].event_name}** is now marked as **${status}**.`, ephemeral: true });

            // if new status is complete remove it completely
            if (status === "completed") {

                // remove from database
                await executeQuery(`
                    DELETE FROM schedule WHERE id = ? AND guild_id = ?
                    `, [id, guildId]);

                // reindex stored events
                await this.reindexEvents(interaction);

                // send log
                sendLogEmbed(guildId, `
                    **Schedule Event Completed**

                    An event has been marked as completed and removed from the schedule.

                    **ID:** ${id}
                    **Event Name:** ${eventExists[0].event_name}
                    **By:** <@${interaction.user.id}>
                    `, COLOUR_VALUES.REMOVE)
            } else {
                sendLogEmbed(guildId, `
                    **Schedule Event Status Updated**

                    The status of an event has been updated.

                    **ID:** ${id}
                    **Event Name:** ${eventExists[0].event_name}
                    **Status:** ${status}
                    **By:** <@${interaction.user.id}>
                    `, COLOUR_VALUES.EDIT)
            }

            // update schedule embed
            await this.updateScheduleEmbed(interaction);

        } catch (error) {
            interaction.editReply({ content: `Something went wrong while setting the status of event: ${id} with new status: ${status}, please report this`, ephemeral: true });
            console.log(`Error occured while setting new status for event id: ${id} with new status ${status} in guild: ${guildId}`, error);
        }
    },

    async updateScheduleEmbed(interaction) {

        const guildId = interaction.guild.id;

        const scheduleSettings = await executeQuery(`
            SELECT schedule_channel_id, schedule_message_id, embed_title
            FROM schedule_settings
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
            FROM schedule
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

            return `**[${event.id}]**\n**Event:** ${event.event_name}\n**Date:** ${formattedDate}\n**Time:** ${formattedTime}\n`;
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

    async reindexEvents(interaction) {

        const guildId = interaction.guild.id;

        try {
            if (!guildId) {
                console.log("Invalid Guild ID when reindexing schedule events.");
                return;
            }

            // Fetch all events ordered correctly
            const events = await executeQuery(`
                SELECT id FROM schedule WHERE guild_id = ? ORDER BY event_date, event_time;
            `, [guildId]);

            if (!events.length) {
                console.warn(`No events found for guild: ${guildId}, skipping reindexing.`);
                return;
            }

            // Use a transaction to safely update IDs
            await executeQuery(`START TRANSACTION;`);

            // Step 1: Create a new temporary table to hold reordered events
            await executeQuery(`CREATE TEMPORARY TABLE schedule_reindexed LIKE schedule;`);

            // Step 2: Reset AUTO_INCREMENT for proper sequential IDs
            await executeQuery(`ALTER TABLE schedule_reindexed AUTO_INCREMENT = 1;`);

            // Step 3: Insert events with correct ordering into temporary table
            await executeQuery(`
                INSERT INTO schedule_reindexed (guild_id, event_name, event_date, event_time, announcement_message_id, participants, created_by, status)
                SELECT guild_id, event_name, event_date, event_time, announcement_message_id, 
                IFNULL(participants, '') AS participants, created_by, status
                FROM schedule WHERE guild_id = ? ORDER BY event_date, event_time;
            `, [guildId]);

            // Step 4: Replace old table with the reordered version
            await executeQuery(`DELETE FROM schedule WHERE guild_id = ?;`, [guildId]);

            await executeQuery(`INSERT INTO schedule SELECT * FROM schedule_reindexed;`);

            // Step 5: Cleanup temporary table
            await executeQuery(`DROP TEMPORARY TABLE schedule_reindexed;`);

            await executeQuery(`COMMIT;`);
        } catch (error) {
            console.error(`Failed to reindex schedule events for guild ${guildId}:`, error);
            await executeQuery(`ROLLBACK;`);
        }
    },

    development: true
}