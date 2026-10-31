import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js"
import { announceTodaysEvents, eventUnix, parseEventDate, parseEventTime, refreshScheduleEmbed, resolveEventByPosition } from "../utils/schedule/scheduleUtils.js";

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
                    option.setName("team-type")
                        .setDescription("Which team's announcements to change (leave empty for all teams).")
                        .setRequired(false)
                        .addChoices(
                            { name: "Mixed", value: "mixed" },
                            { name: "Female", value: "female" },
                            { name: "Clan", value: "clan" }
                    )
                )
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
                .setDescription("Date: today, tomorrow, friday, 05/11 or 05/11/26")
                .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("event-time")
                .setDescription("Time in CET/CEST, 24-hour: 20:00, 2000 or 9:30")
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
            return interaction.reply({ content: 'You do not have permission to manage the guild settings.', flags: MessageFlags.Ephemeral });
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

            const team = interaction.options.getString("team-type");
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const announced = await announceTodaysEvents(guild, guild.client, team);
            await interaction.editReply({
                content: announced > 0
                    ? `Announced ${announced} ${team} event(s) for today.`
                    : `Nothing to announce for ${team}: no un-announced events today, or no announcements channel set (\`/schedule channel\`).`,
            });
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
            return interaction.reply({ content: 'You must specify a type for the channel.', flags: MessageFlags.Ephemeral });
        }

        // valid types
        const validTypes = ['schedule', 'announcements'];
        if(!validTypes.includes(type)) {
            return interaction.reply({ content: 'Invalid type specified. Valid types are: schedule, announcements.', flags: MessageFlags.Ephemeral });
        }

        if(!team) {
            return interaction.reply({ content: 'You must specify a team type.', flags: MessageFlags.Ephemeral });
        }

        if(!channel) {
            return interaction.reply({ content: 'You must specify a channel to set.', flags: MessageFlags.Ephemeral });
        }

        // Check if the channel exists in the guild
        const fetchedChannel = await interaction.guild.channels.fetch(channel.id).catch(() => null);
        if(!fetchedChannel) {
            return interaction.reply({ content: 'The specified channel does not exist in this guild.', flags: MessageFlags.Ephemeral });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

                const scheduleMessage = await fetchedChannel.send({ embeds: [scheduleEmbed] });

                // Save the ID of the message we just sent (the channel's lastMessageId
                // is wrong if anyone else posts in between).
                await executeQuery(`
                    INSERT INTO ${team}_schedule_settings (guild_id, schedule_message_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE schedule_message_id = VALUES(schedule_message_id);
                `, [guildId, scheduleMessage.id]);

                // Fill it with any events that already exist.
                await refreshScheduleEmbed(guild, team);
            }

            // Send confirmation message
            console.log(`Updated schedule channel for guild: ${guildId}, type: ${type}, channel: ${channel.id}`);
            interaction.editReply({ content: `Successfully updated the ${type} channel to <#${channel.id}>.` });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings update**\n\nThe schedule channel has been updated for ${team}\n\n**New Channel:** <#${channel.id}>\n**By:** <@${interaction.user.id}>
                `, COLOUR_VALUES.EDIT
            );
                
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule channel.` });
        }
    },

    async setRole(interaction) {

        const role = interaction.options.getRole('role');
        const team = interaction.options.getString("team-type");

        const guild = interaction.guild;
        const guildId = guild.id;

        // Validate user input
        if(!role) {
            return interaction.reply({ content: 'You must specify a role to set.', flags: MessageFlags.Ephemeral });
        }

        if(!team) {
            return interaction.reply({ content: 'You must specify a team type.', flags: MessageFlags.Ephemeral });
        }

        // Check if the role exists in the guild
        if(!interaction.guild.roles.cache.has(role.id)) {
            return interaction.reply({ content: 'The specified role does not exist in this guild.', flags: MessageFlags.Ephemeral });
        }

        // Defer the reply to allow time for processing
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Update the role in the database
        try {
            await executeQuery(`
                INSERT INTO ${team}_schedule_settings (guild_id, role_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
            `, [guildId, role.id]);

            // Send confirmation message
            console.log(`Updated Schedule Announcements mention role for guild: ${guildId}, role: ${role.id}`);
            interaction.editReply({ content: `Successfully updated the Schedule Announcements mention role to ${role}.` });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings update**\n\nThe mention Role for schedule announcements has been changed for ${team}\n\n**New Role:** ${role}\n**By:** <@${interaction.user.id}>`
                , COLOUR_VALUES.EDIT
            );
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule role for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule role.` });
        }
    },

    async setEmojis(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        const confirmationEmoji = interaction.options.getString('confirmation');
        const declineEmoji = interaction.options.getString('decline');

        // Validate user input
        if(!confirmationEmoji && !declineEmoji) {
            return interaction.reply({ content: `No emojis specified, using default emojis`, flags: MessageFlags.Ephemeral });
        }

        // Accept a custom emoji (static or animated, e.g. <:name:id> / <a:name:id>) or a
        // single standard emoji like ✅. The old check rejected both ✅ (the default!)
        // and animated emojis.
        const isValidEmoji = (value) =>
            /^<a?:\w+:\d+>$/.test(value) || /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u.test(value);

        if(confirmationEmoji && !isValidEmoji(confirmationEmoji)) {
            return interaction.reply({ content: `Invalid confirmation emoji. Use a standard emoji (✅) or a server emoji.`, flags: MessageFlags.Ephemeral });
        }

        if(declineEmoji && !isValidEmoji(declineEmoji)) {
            return interaction.reply({ content: `Invalid decline emoji. Use a standard emoji (❌) or a server emoji.`, flags: MessageFlags.Ephemeral });
        }

        const selectedTeam = interaction.options.getString("team-type");
        const teams = selectedTeam ? [selectedTeam] : ["mixed", "female", "clan"];

        // Defer the reply to allow time for processing
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Emojis live per team. Only overwrite a column when a new value was actually
        // provided (keep the existing value otherwise).
        try {
            for (const team of teams) {
                await executeQuery(`
                    INSERT INTO ${team}_schedule_settings (guild_id, confirmation_emoji, decline_emoji)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        confirmation_emoji = IF(VALUES(confirmation_emoji) IS NOT NULL, VALUES(confirmation_emoji), confirmation_emoji),
                        decline_emoji = IF(VALUES(decline_emoji) IS NOT NULL, VALUES(decline_emoji), decline_emoji);
                `, [guildId, confirmationEmoji, declineEmoji]);
            }

            // Send confirmation message
            console.log(`Updated Schedule Emojis for guild: ${guildId}, confirmation: ${confirmationEmoji}, decline: ${declineEmoji}`);
            interaction.editReply({ content: `Successfully updated the Schedule Emojis. Confirmation: ${confirmationEmoji}, Decline: ${declineEmoji}.` });

            // Send discord log message
            await sendLogEmbed(
                guildId, 
                `**Schedule settings updated**\n\nReaction emojis for schedule announcements have been updated.\n\n**Confirmation Emoji:** ${confirmationEmoji}\n**Decline Emoji:** ${declineEmoji}\n**By:** ${interaction.user.username}`, 
                COLOUR_VALUES.EDIT
            );
            return;
        } catch (error) {
            console.error(`There was an error updating the schedule emojis for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the schedule emojis.` });
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
            return interaction.reply({ content: "You must specify a team type.", flags: MessageFlags.Ephemeral });
        }

        if (!eventName) {
            return interaction.reply({ content: "You need to enter an event name.", flags: MessageFlags.Ephemeral });
        }

        // Dates accept today/tomorrow/weekday/DD/MM[/YY[YY]]; times accept 20:00/2000/9:30.
        const parsedDate = parseEventDate(eventDate);
        if (!parsedDate) {
            return interaction.reply({ content: "Couldn't read that date. Try `today`, `tomorrow`, `friday`, `05/11` or `05/11/26`.", flags: MessageFlags.Ephemeral });
        }

        const storedTime = parseEventTime(eventTime);
        if (!storedTime) {
            return interaction.reply({ content: "Couldn't read that time. Use 24-hour CET/CEST time like `20:00`, `2000` or `9:30`.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const storedDate = parsedDate.toISODate();
        const unix = eventUnix({ event_date: storedDate, event_time: storedTime });

        await executeQuery(`
            INSERT INTO ${team}_schedule (guild_id, event_name, event_date, event_time, created_by)
            VALUES (?, ?, ?, ?, ?);
        `, [guildId, eventName, storedDate, storedTime, creator]);

        // update schedule
        await this.updateScheduleEmbed(interaction, team);

        // send confirmation and logs (timestamps show in each viewer's timezone)
        await interaction.editReply({ content: `Event **${eventName}** added for **<t:${unix}:F>** (<t:${unix}:R>). Schedule updated.` });
        await sendLogEmbed(
            guildId,
            `**Schedule Event Added**\n\nAn event has been added to the ${team} schedule.\n\n**Event Name:** ${eventName}\n**When:** <t:${unix}:F>\n**By:** <@${creator}>`,
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
            return interaction.reply({ content: "You must specify a team type.", flags: MessageFlags.Ephemeral });
        }

        if(!eventId) {
            return interaction.reply({ content: "You must provide a valid event ID, they are on the left side of each event in the schedule list.", flags: MessageFlags.Ephemeral});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // The number shown in the schedule is the event's position, not its row ID.
        const event = await resolveEventByPosition(guildId, team, eventId);

        if(!event) {
            return interaction.editReply({ content: `No event found with the ID: **${eventId}**.` });
        }

        try {

            // remove event from database
            await executeQuery(`
                DELETE FROM ${team}_schedule WHERE guild_id = ? AND id = ?;
                `, [guildId, event.id]);

            // update schedule embed
            await this.updateScheduleEmbed(interaction, team);

            await interaction.editReply({ content: `Event **${eventId}** (${event.event_name}) has been removed. Schedule updated!` });
            await sendLogEmbed(
                guildId,
                `**Schedule Event Removed**\n\nAn event has been removed from the ${team} schedule.\n\n**Event ID:** ${eventId}\n**Event name:** ${event.event_name}\n**By:** <@${interaction.user.id}>`,
                COLOUR_VALUES.REMOVE
            );
        } catch(error) {
            console.error(`Error removing event ${eventId} from schedule for guild: ${guildId}`, error);
            await interaction.followUp({ content: "An error occurred while removing the event. Please report this issue.", flags: MessageFlags.Ephemeral });
        }
    },

    async editEvent(interaction) {

        const guild = interaction.guild;
        const guildId = guild.id;

        if (!guildId) {
            console.log("Invalid Guild ID, aborting event edit");
            return interaction.reply({ content: "An error occurred while editing the event. Please report this.", flags: MessageFlags.Ephemeral });
        }

        const team = interaction.options.getString("team-type");
        const eventId = interaction.options.getInteger("id");
        let type = interaction.options.getString("type");
        const input = interaction.options.getString("input");

        // 🔹 Validate user input
        if(!team) {
            return interaction.reply({ content: "You must specify a team type.", flags: MessageFlags.Ephemeral });
        }

        if (!eventId) {
            return interaction.reply({ content: "You must provide the ID of the event you want to edit. (Displayed on the left side of each event in the schedule)", flags: MessageFlags.Ephemeral });
        }

        if (!type) {
            return interaction.reply({ content: "You must select which element of the event you want to edit. Options: `name`, `date`, `time`.", flags: MessageFlags.Ephemeral });
        }

        if (!input) {
            return interaction.reply({ content: "You must enter a new value to replace the current value.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 🔹 Normalize type input to prevent validation issues
        type = type.trim().toLowerCase();

        if (!["name", "date", "time"].includes(type)) {
            return interaction.editReply({ content: "Invalid edit type. Use `name`, `date`, or `time`." });
        }

        // 🔹 Fetch the current event (the number shown in the schedule is its position)
        const event = await resolveEventByPosition(guildId, team, eventId);

        if (!event) {
            return interaction.editReply({ content: `No event found with the ID **${eventId}**.` });
        }
        const eventDetails = [event];
        const rowId = event.id;

        try {
            let updateQuery = "";
            let updateParams = [];

            // 🔹 Determine which field to update
            if (type === "name") {
                updateQuery = `UPDATE ${team}_schedule SET event_name = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [input, guildId, rowId];

            } else if (type === "date") {
                const parsedDate = parseEventDate(input);
                if (!parsedDate) {
                    return interaction.editReply({ content: "Couldn't read that date. Try `today`, `tomorrow`, `friday`, `05/11` or `05/11/26`." });
                }

                updateQuery = `UPDATE ${team}_schedule SET event_date = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [parsedDate.toISODate(), guildId, rowId];

            } else if (type === "time") {
                const storedTime = parseEventTime(input);
                if (!storedTime) {
                    return interaction.editReply({ content: "Couldn't read that time. Use 24-hour CET/CEST time like `20:00`, `2000` or `9:30`." });
                }

                updateQuery = `UPDATE ${team}_schedule SET event_time = ? WHERE guild_id = ? AND id = ?;`;
                updateParams = [storedTime, guildId, rowId];
            }

            // 🔹 Save changes to the database
            await executeQuery(updateQuery, updateParams);

            // 🔹 Update the schedule embed
            await this.updateScheduleEmbed(interaction, team);

            // 🔹 Send log message
            sendLogEmbed(
                guildId, 
                `**Schedule Event Edited**\n\nAn event has been edited in the ${team} schedule.\n\n**Event ID:** ${eventId}\n**Event name:** ${eventDetails[0].event_name}\n**New Value:** ${input}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );

            // 🔹 Send confirmation message
            await interaction.editReply({ content: `Event **${eventDetails[0].event_name}** updated: **${type}** changed to **${input}**!` });
        } catch (error) {
            console.error(`Error editing event ${eventId} from schedule for guild: ${guildId}`, error);
            await interaction.followUp({ content: "An error occurred while editing the event. Please report this issue.", flags: MessageFlags.Ephemeral });
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

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
            await interaction.editReply({ content: `Successfully updated the ${team} schedule title to ${title}.` });
            return sendLogEmbed(
                guildId, 
                `**Schedule settings updated**\n\nThe Title of the ${team} schedule has been updated.\n\n**New Title:** ${title}\n**By:** <@${interaction.user.id}>`, 
                COLOUR_VALUES.EDIT
            );
        } catch (error) {
            console.error(`There was an error updating the schedule channel for guild: ${guildId}`, error);
            return interaction.editReply({ content: `There was an error updating the ${team} schedule channel.` });
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
            return interaction.reply({ content: "You must specify a team type for the schedule status.", flags: MessageFlags.Ephemeral });
        }

        if(!id) {
            return interaction.reply({ content: "You need to specify the ID of the event you would like to change the status of. (ID of each event is displayed in the schedule)", flags: MessageFlags.Ephemeral });
        }

        const status = interaction.options.getString("status");

        if(!status) {
            return interaction.reply({ content: "You need to set the new status of the event. (active, completed or cancelled).", flags: MessageFlags.Ephemeral });
        }

        // check status is a valid choice
        const allowedStatuses = ["active", "completed", "cancelled"];
        if(!allowedStatuses.includes(status)) {
            return interaction.reply({ content: `Invalid status: ${status}, please choose an option from the list. (active, completed or cancelled)`, flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {

            // The number shown in the schedule is the event's position, not its row ID.
            const event = await resolveEventByPosition(guildId, team, id);

            // check if the event exists
            if(!event) {
                return interaction.editReply({ content: `No event with the ID: ${id} exists, please check the ${team} schedule for valid event IDs` });
            }
            const eventExists = [event];

            // update the database (scoped to this guild)
            await executeQuery(`
                UPDATE ${team}_schedule SET status = ? WHERE id = ? AND guild_id = ?;
            `, [status, event.id, guildId]);

            // send confirmation and logs
            await interaction.editReply({ content: `Event **${event.event_name}** is now marked as **${status}**.` });

            // if new status is complete remove it completely
            if (status === "completed") {

                // remove from database
                await executeQuery(`
                    DELETE FROM ${team}_schedule WHERE id = ? AND guild_id = ?
                    `, [event.id, guildId]);

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
            interaction.editReply({ content: `Something went wrong while setting the status of Event ID: ${id} with new status: ${status}, please report this` });
            console.log(`Error occured while setting new status for event id: ${id} with new status ${status} in guild: ${guildId}`, error);
        }
    },

    // Re-renders the team schedule embed; tells the user if it is not set up.
    async updateScheduleEmbed(interaction, team) {
        if(!team) return;
        const updated = await refreshScheduleEmbed(interaction.guild, team);
        if (!updated) {
            await interaction.followUp({ content: `⚠ No ${team} schedule embed found. Set it up using \`/schedule channel\`.`, flags: MessageFlags.Ephemeral });
        }
    },

    development: false
}