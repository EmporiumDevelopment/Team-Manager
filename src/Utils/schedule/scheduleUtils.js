import { EmbedBuilder } from "@discordjs/builders";
import { executeQuery } from "../../database.js";
import { DateTime } from "luxon";

async function getTodaysEvents(guild) {

    const guildId = guild.id;

    const events = await executeQuery(`
        SELECT event_name, event_date, event_time, created_by
        FROM schedule WHERE guild_id = ? AND event_date = CURRENT_DATE AND announcement_message_id IS NULL;
    `, [guildId]);

    return events || [];
}

async function announceTodaysEvents(guild, client) {

    // get todays scheduled events
    const events = await getTodaysEvents(guild);

    // no events scheduled for today
    if(events.length === 0) return;

    const guildId = guild.id;

    // fetch schedule settings
    const scheduleSettings = await executeQuery(`
        SELECT * FROM schedule_settings WHERE guild_id = ?
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

    for (const event of events) {

        const formattedTime = DateTime.fromFormat(event.event_time, "HH:mm:ss").toFormat("HH:mm");

        const embed = new EmbedBuilder()
            .setTitle(`Today's Schedule`)
            .setColor(0x007FFF)
            .setDescription(`
                **Event:** ${event.event_name}
                **Time:** ${formattedTime}\n
                React if you are available for this event.
            `)
            .addFields({ name: "Available Players", value: "No players", inline: false });

        const message = await channel.send({ embeds: [embed] });

        // store message in database 
        // TODO: 
        await executeQuery(`
            UPDATE schedule SET announcement_message_id = ? WHERE event_name = ?
            `, [message.id, event.event_name]);

        if (!confirm || !decline) {
            console.log(`Skipping reactions for guild ${guild.id}: No emojis found.`);
            return;
        }

        await message.react(confirm);
        await message.react(decline);
    }

}

export { getTodaysEvents, announceTodaysEvents }