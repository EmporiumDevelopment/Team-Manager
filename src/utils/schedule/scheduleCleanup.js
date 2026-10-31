import { executeQuery } from "../../database.js";
import { EmbedBuilder } from "discord.js";
import { londonToday, refreshScheduleEmbed } from "./scheduleUtils.js";

// Removes completed events and any event whose date has passed (UK time), marks
// their announcement embeds as finished, then refreshes the schedule embed.
// Previously only status = 'completed' rows were removed, but /schedule setstatus
// already deletes those immediately — so past events piled up forever.
async function cleanupCompletedEvents(client, guild, team) {

    const guildId = guild.id;

    const finishedEvents = await executeQuery(`
        SELECT s.id, s.announcement_message_id, ss.announcements_channel_id
        FROM ${team}_schedule s
        LEFT JOIN ${team}_schedule_settings ss ON s.guild_id = ss.guild_id
        WHERE s.guild_id = ? AND (s.status = 'completed' OR s.event_date < ?);
    `, [guildId, londonToday()]);

    if (!finishedEvents.length) return;

    for (const event of finishedEvents) {
        if (!event.announcement_message_id || !event.announcements_channel_id) continue;
        try {
            const channel = await client.channels.fetch(event.announcements_channel_id).catch(() => null);
            const message = channel ? await channel.messages.fetch(event.announcement_message_id).catch(() => null) : null;

            if (message?.embeds[0]) {
                await message.edit({
                    embeds: [
                        EmbedBuilder.from(message.embeds[0])
                            .setFields({ name: "Event Status", value: "Event Completed & Removed", inline: false }),
                    ],
                    components: [],
                });
            }
        } catch (error) {
            console.log(`Failed to update embed for event ${event.announcement_message_id} in guild ${guildId}:`, error);
        }
    }

    const ids = finishedEvents.map(e => e.id);
    await executeQuery(
        `DELETE FROM ${team}_schedule WHERE guild_id = ? AND id IN (${ids.map(() => "?").join(", ")});`,
        [guildId, ...ids]
    );
    console.log(`Removed ${ids.length} finished ${team} events for guild ${guildId}`);

    await refreshScheduleEmbed(guild, team).catch(error =>
        console.error(`Failed to refresh ${team} schedule after cleanup for guild ${guildId}:`, error)
    );
}

export { cleanupCompletedEvents };
