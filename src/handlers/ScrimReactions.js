import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../database.js"; // Ensure `db` is correctly imported

async function getScrimEmojiMap(guildId) {
    const emojiRows = await executeQuery(`
        SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?
    `, [guildId]);

    if (!emojiRows.length) return null;

    return {
        [emojiRows[0].emoji_16.match(/^<:\w+:(\d+)>$/)?.[1] || emojiRows[0].emoji_16]: "16 Players",
        [emojiRows[0].emoji_20.match(/^<:\w+:(\d+)>$/)?.[1] || emojiRows[0].emoji_20]: "20 Players",
        [emojiRows[0].emoji_23.match(/^<:\w+:(\d+)>$/)?.[1] || emojiRows[0].emoji_23]: "23 Players"
    };
}

export async function handleReactionAdd(reaction, user) {

    if (user.bot) return;

    const message = reaction.message;
    const embed = message.embeds[0];
    const serverName = message.guild.name;
    const guildId = message.guild.id;

    if (!embed) return;

    const scrimRows = await executeQuery(`
        SELECT scrim_message_id FROM channels WHERE guild_id = ?
    `, [reaction.message.guild.id]);

    if (!scrimRows.length || !scrimRows[0]?.scrim_message_id) {
        console.log(`No valid scrim message ID found for server: ${serverName} ID: ${guildId}`);
        return;
    }

    const emojiMap = await getScrimEmojiMap(message.guild.id);
    if (!emojiMap) {
        console.log(`Emoji Map missing for server: ${serverName} ID: ${guildId}`);
        return;
    }

    const emojiKey = reaction.emoji.id ? reaction.emoji.id : reaction.emoji.toString();

    if (!emojiMap[emojiKey]) {
        console.log(`❌ Emoji ${emojiKey} not found in emojiMap for server: ${serverName} ID: ${guildId}`);
        console.log(`🔍 Expected emoji IDs:`, Object.keys(emojiMap)); // Debugging step
        return;
    }

    const updatedFields = embed.fields.map(field =>
    field.name.includes(reaction.emoji.toString())
        ? { 
            name: field.name, 
            value: field.value === "No players" ? `${user.displayName}` : `${field.value}\n${user.displayName}`,
            inline: true 
        }
        : field
);

    const updatedEmbed = new EmbedBuilder(embed).setFields(updatedFields);

    await message.edit({ embeds: [updatedEmbed] });
}

export async function handleReactionRemove(reaction, user) {

    if (user.bot) return;

    const message = reaction.message;
    const embed = message.embeds[0];
    const serverName = message.guild.name;
    const guildId = message.guild.id;

    if (!embed) return;

    const scrimRows = await executeQuery(`
        SELECT scrim_message_id FROM channels WHERE guild_id = ?
    `, [reaction.message.guild.id]);

    if (!scrimRows.length || !scrimRows[0]?.scrim_message_id) {
        console.log(`Reaction is not on the stored scrim message.`);
        return;
    }

    // Fetch the emoji map from the database
    const emojiMap = await getScrimEmojiMap(message.guild.id);
    if (!emojiMap) {
        console.log(`Emoji Map missing for server: ${serverName} ID: ${guildId}`);
        return;
    }

    // Check if the emoji is in the map
    const emojiKey = reaction.emoji.id ? reaction.emoji.id : reaction.emoji.toString();
    if (!emojiMap[emojiKey]) return;

    // Remove the user's display name from the list
    const updatedFields = embed.fields.map(field =>
        field.name.includes(reaction.emoji.toString())
            ? { 
                name: field.name, 
                value: field.value
                    .split("\n")
                    .filter(name => name.trim() !== user.displayName)
                    .join("\n")
                    .trim(),
                inline: true 
            }
            : field
    );

    // Ensure field does not become empty—if it's empty, reset to "None yet"
    updatedFields.forEach(field => {
        if (!field.value.trim()) field.value = "No players";
    });

    // Update the embed with the new fields
    const updatedEmbed = new EmbedBuilder(embed).setFields(updatedFields);

    await message.edit({ embeds: [updatedEmbed] });
}