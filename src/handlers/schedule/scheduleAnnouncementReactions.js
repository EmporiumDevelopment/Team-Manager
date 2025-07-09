import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../../database.js";

async function handleScheduleReactionAdd(reaction, user, team) {

    if (user.bot) return;

    const { message, emoji } = reaction;

    // Fetch the correct emoji from `schedule_settings`
    const emojiData = await executeQuery(`
        SELECT confirmation_emoji FROM ${team}_schedule_settings WHERE guild_id = ?;
    `, [message.guild.id]);

    if (!emojiData.length) {
        console.log(`Error: No emoji found in ${team}_schedule_settings for guild ${message.guild.id}`);
        return;
    }

    const confirmationEmoji = emojiData[0].confirmation_emoji;

    // Ensure user reacted with the correct emoji
    if (emoji.name !== confirmationEmoji) return;

    const eventData = await executeQuery(`
        SELECT event_name FROM ${team}_schedule WHERE announcement_message_id = ?;
    `, [message.id]);

    if (!eventData.length) return;

    const eventName = eventData[0].event_name;

    // Get existing players
    const participantsQuery = await executeQuery(`
        SELECT participants FROM ${team}_schedule WHERE event_name = ?;
    `, [eventName]);

    const rawParticipants = participantsQuery[0]?.participants;
    const currentPlayers = rawParticipants ? rawParticipants.split(",").filter(id => id) : [];

    if (!currentPlayers.includes(user.id)) {
        currentPlayers.push(user.id);
    }

    await executeQuery(`
        UPDATE ${team}_schedule SET participants = ? WHERE event_name = ?;
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

async function handleScheduleReactionRemove(reaction, user, team) {

    if (user.bot) return;

    const { message, emoji } = reaction;

    // Fetch the correct emoji from `schedule_settings`
    const emojiData = await executeQuery(`
        SELECT confirmation_emoji FROM ${team}_schedule_settings WHERE guild_id = ?;
    `, [message.guild.id]);

    if (!emojiData.length) {
        console.log(`Error: No emoji found in ${team}_schedule_settings for guild ${message.guild.id}`);
        return;
    }

    const confirmationEmoji = emojiData[0].confirmation_emoji;

    // Ensure user reacted with the correct emoji
    if (emoji.name !== confirmationEmoji) return;

    const eventData = await executeQuery(`
        SELECT event_name FROM ${team}_schedule WHERE announcement_message_id = ?;
    `, [message.id]);

    if (!eventData.length) return;

    const eventName = eventData[0].event_name;

    const participantsQuery = await executeQuery(`
        SELECT participants FROM ${team}_schedule WHERE event_name = ?;
    `, [eventName]);

    let currentPlayers = participantsQuery[0]?.participants?.split(",") || [];
    currentPlayers = currentPlayers.filter(id => id !== user.id);

    await executeQuery(`
        UPDATE ${team}_schedule SET participants = ? WHERE event_name = ?;
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