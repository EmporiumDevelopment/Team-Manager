import { EmbedBuilder } from "@discordjs/builders";
import { executeQuery } from "../../database.js";
import { DateTime } from "luxon";

async function getTodaysEvents(guild, team) {

    const guildId = guild.id;

    const events = await executeQuery(`
        SELECT event_name, event_date, event_time, created_by
        FROM ${team}_schedule WHERE guild_id = ? AND event_date = CURRENT_DATE AND announcement_message_id IS NULL;
    `, [guildId]);

    return events || [];
}

async function announceTodaysEvents(guild, client, team) {

    // get todays scheduled events
    const events = await getTodaysEvents(guild, team);

    // no events scheduled for today
    if(events.length === 0) return;

    const guildId = guild.id;

    // fetch schedule settings
    const scheduleSettings = await executeQuery(`
        SELECT * FROM ${team}_schedule_settings WHERE guild_id = ?
        `, [guildId]);

    // no schedule settings for that guild id found
    if(!scheduleSettings.length) {
        return console.log(`No schedule settings found for guild: ${guildId} skipping schedule announcements.`)
    }

    // cache announcements channel id if it exists
    const channelId = scheduleSettings[0]?.announcements_channel_id;

    if(!channelId) {
        return console.log(`Announcements channel ID not found for scheduled events in guild: ${guildId}`);
    }

    // get the reaction emojis
    const confirm = scheduleSettings[0]?.confirmation_emoji;
    const decline = scheduleSettings[0]?.decline_emoji;

    // fetch channel
    const channel = await client.channels.fetch(channelId);

    // fetch mention role
    const roleData = await executeQuery(`
        SELECT role_id FROM ${team}_schedule_settings WHERE guild_id = ?;
    `, [guild.id]);

    const mentionRole = roleData.length ? `<@&${roleData[0]?.role_id}>` : "";

    for (const event of events) {

        const formattedTime = DateTime.fromFormat(event.event_time, "HH:mm:ss").toFormat("HH:mm");

        const embed = new EmbedBuilder()
            .setTitle(`Today's Schedule`)
            .setColor(0x007FFF)
            .setDescription(`**Event:** ${event.event_name}\n**Time:** ${formattedTime}\n\nReact if you are available for this event.\n`)
            .addFields({ name: "Available Players", value: "No players", inline: false });

        const message = await channel.send({ embeds: [embed] });

        // store message in database 
        // TODO: 
        await executeQuery(`
            UPDATE ${team}_schedule SET announcement_message_id = ? WHERE event_name = ?
            `, [message.id, event.event_name]);

        if (!confirm || !decline) {
            console.log(`Skipping reactions for guild ${guild.id}: No emojis found.`);
            return;
        }

        await message.react(confirm);
        await message.react(decline);

        // mention role
        if(mentionRole) {
            await channel.send(mentionRole);
        }
    }

}

async function resolveScheduleTeamByMessageId(guildId, messageId) {
    
    const teams = ["mixed", "female", "clan"];

    for (const team of teams) {
        const result = await executeQuery(`
            SELECT event_name FROM ${team}_schedule
            WHERE guild_id = ? AND announcement_message_id = ?
        `, [guildId, messageId]);

        if (result.length > 0) {
            return { team, eventName: result[0].event_name };
        }
    }

    return null; // Not a schedule announcement
}

export { getTodaysEvents, announceTodaysEvents, resolveScheduleTeamByMessageId }