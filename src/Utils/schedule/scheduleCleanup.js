import { executeQuery } from "../../database.js";
import { EmbedBuilder } from "discord.js";

async function cleanupCompletedEvents(client, guild, team) {
    
    const guildId = guild.id;

    const completedEvents = await executeQuery(`
        SELECT s.announcement_message_id, ss.announcements_channel_id 
        FROM ${team}_schedule s
        JOIN ${team}_schedule_settings ss ON s.guild_id = ss.guild_id
        WHERE s.status = 'completed' AND s.guild_id = ?;
    `, [guildId]);

    // no complete events
    if (!completedEvents.length) return;

    for (const event of completedEvents) {
        try {
            const scheduleChannel = await client.channels.fetch(event.announcements_channel_id);
            const message = await scheduleChannel.messages.fetch(event.announcement_message_id).catch(() => null);

            if (message) {
                await message.edit({
                    embeds: [
                        EmbedBuilder.from(message.embeds[0])
                            .setFields({ name: "Event Status", value: "Event Completed & Removed", inline: false }),
                    ],
                });
            }
        } catch (error) {
            console.log(`Failed to update embed for event ${event.announcement_message_id} in guild ${guildId}:`, error);
        }
    }

    await executeQuery(`DELETE FROM ${team}_schedule WHERE status = 'completed' AND guild_id = ?;`, [guildId]);
    console.log(`Deleted ${completedEvents.length} completed events for guild ${guildId}`);
}

export { cleanupCompletedEvents };