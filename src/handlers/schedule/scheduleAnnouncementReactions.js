import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../../database.js";

async function handleScheduleReactionAdd(reaction, user) {
    if (user.bot) return;

    const { message } = reaction;
    const eventData = await executeQuery(`
        SELECT event_name FROM schedule WHERE announcement_message_id = ?;
    `, [message.id]);

    if (!eventData.length) return;

    const eventName = eventData[0].event_name;

    // Get existing players
    const participantsQuery = await executeQuery(`
        SELECT participants FROM schedule WHERE event_name = ?;
    `, [eventName]);

    const currentPlayers = participantsQuery[0]?.participants?.split(",") || [];

    if (!currentPlayers.includes(user.id)) {
        currentPlayers.push(user.id);
    }

    await executeQuery(`
        UPDATE schedule SET participants = ? WHERE event_name = ?;
    `, [currentPlayers.length ? currentPlayers.join(",") : null, eventName]);

    const updatedPlayers = currentPlayers.length 
    ? currentPlayers.map(id => `<@${id}>`).join("\n") 
    : "No players";

    const updatedEmbed = EmbedBuilder.from(message.embeds[0])
        .setFields({
            name: "Available Players",
            value: updatedPlayers,
            inline: false
        });

    await message.edit({ embeds: [updatedEmbed] });
}

async function handleScheduleReactionRemove(reaction, user) {
    if (user.bot) return;

    const { message } = reaction;
    const eventData = await executeQuery(`
        SELECT event_name FROM schedule WHERE announcement_message_id = ?;
    `, [message.id]);

    if (!eventData.length) return;

    const eventName = eventData[0].event_name;

    const participantsQuery = await executeQuery(`
        SELECT participants FROM schedule WHERE event_name = ?;
    `, [eventName]);

    let currentPlayers = participantsQuery[0]?.participants?.split(",") || [];
    currentPlayers = currentPlayers.filter(id => id !== user.id);

    await executeQuery(`
        UPDATE schedule SET participants = ? WHERE event_name = ?;
    `, [currentPlayers.length ? currentPlayers.join(",") : null, eventName]);

    const updatedEmbed = EmbedBuilder.from(message.embeds[0])
        .setFields({
            name: "Available Players",
            value: currentPlayers.length ? currentPlayers.map(id => `<@${id}>`).join("\n") : "No players",
            inline: false
        });

    await message.edit({ embeds: [updatedEmbed] });
}

export { handleScheduleReactionAdd, handleScheduleReactionRemove };