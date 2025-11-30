import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../database.js";

export async function handleReactionAdd(reaction, user) {
    
    if (user.bot) return;

    const { message, emoji } = reaction;

    if (!message || !emoji) {
        console.log(`Error: Reaction or emoji is undefined`);
        return;
    }

    const embed = message.embeds[0];
    const guildId = message.guild?.id;

    if (!embed || !guildId) return;

    // Fetch scrim message IDs for both mixed & female scrims
    const scrimMessages = await executeQuery(`
        SELECT 
            mixed.message_id AS mixed_id,
            female.message_id AS female_id,
            clan.message_id AS clan_id
            FROM mixed_scrim_settings AS mixed
            LEFT JOIN female_scrim_settings AS female ON mixed.guild_id = female.guild_id
            LEFT JOIN clan_scrim_settings AS clan ON mixed.guild_id = clan.guild_id
            WHERE mixed.guild_id = ? OR female.guild_id = ? OR clan.guild_id = ?;
    `, [guildId, guildId, guildId]);

    if (!scrimMessages.length) {
        console.log(`No scrim messages found for guild ID: ${guildId}`);
        return;
    }

    const { mixed_id, female_id, clan_id } = scrimMessages[0];

    // Safely check message ID
    const scrimType = message.id === mixed_id ? "mixed" : message.id === female_id ? "female" : message.id === clan_id ? "clan" : null;
    if (!scrimType) {
        console.log(`Error: Reaction message does not match mixed or female scrim message`);
        return;
    }

    // Fetch emoji settings dynamically
    const emojiData = await executeQuery(`
        SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?;
    `, [guildId]);

    if (!emojiData.length) {
        console.log(`Error: Emoji settings missing for guild ID: ${guildId}`);
        return;
    }

    // Ensure emoji is properly extracted
    const emojiKey = emoji.id ? emoji.id : emoji.toString();

    if (!emojiKey) return;

    const emojiMap = {
        [emojiData[0].emoji_16.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_16]: "16 Players",
        [emojiData[0].emoji_20.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_20]: "20 Players",
        [emojiData[0].emoji_23.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_23]: "23 Players"
    };

    if (!emojiMap[emojiKey]) {
        console.log(`Error: Reaction emoji not found in emoji settings`);
        return;
    }

    // Update the correct scrim embed dynamically
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

    const { message, emoji } = reaction;

    if (!message || !emoji) {
        console.log(`Error: Reaction or emoji is undefined`);
        return;
    }

    const embed = message.embeds[0];
    const guildId = message.guild?.id;
    
    if (!embed || !guildId) return;

    // Fetch scrim message IDs for both mixed & female scrims
    const scrimMessages = await executeQuery(`
        SELECT 
            mixed.message_id AS mixed_id,
            female.message_id AS female_id,
            clan.message_id AS clan_id
            FROM mixed_scrim_settings AS mixed
            LEFT JOIN female_scrim_settings AS female ON mixed.guild_id = female.guild_id
            LEFT JOIN clan_scrim_settings AS clan ON mixed.guild_id = clan.guild_id
            WHERE mixed.guild_id = ? OR female.guild_id = ? OR clan.guild_id = ?;
    `, [guildId, guildId, guildId]);

    if (!scrimMessages.length) {
        console.log(`No scrim messages found for guild ID: ${guildId}`);
        return;
    }

    const { mixed_id, female_id, clan_id } = scrimMessages[0];

    // Safely determine scrim type
    const scrimType = message.id === mixed_id ? "mixed" : message.id === female_id ? "female" : clan_id ? "clan" : null;
    if (!scrimType) {
        console.log(`Error: Reaction message does not match mixed, female or clan scrim message`);
        return;
    }

    // Fetch emoji settings dynamically
    const emojiData = await executeQuery(`
        SELECT emoji_16, emoji_20, emoji_23 FROM scrim_emojis WHERE guild_id = ?;
    `, [guildId]);

    if (!emojiData.length) {
        console.log(`Error: Emoji settings missing for guild ID: ${guildId}`);
        return;
    }

    // Extract emoji safely
    const emojiKey = emoji.id ? emoji.id : emoji.toString();
    if (!emojiKey) {
        console.log(`Error: Unable to determine emoji key`);
        return;
    }

    const emojiMap = {
        [emojiData[0].emoji_16.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_16]: "16 Players",
        [emojiData[0].emoji_20.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_20]: "20 Players",
        [emojiData[0].emoji_23.match(/^<:\w+:(\d+)>$/)?.[1] || emojiData[0].emoji_23]: "23 Players"
    };

    if (!emojiMap[emojiKey]) {
        console.log(`Error: Reaction emoji not found in emoji settings`);
        return;
    }

    // Remove the user's display name from the correct scrim embed dynamically
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

    // Ensure field does not become empty—reset to "No players"
    updatedFields.forEach(field => {
        if (!field.value.trim()) field.value = "No players";
    });

    // Update the embed with the modified fields
    const updatedEmbed = new EmbedBuilder(embed).setFields(updatedFields);
    await message.edit({ embeds: [updatedEmbed] });
}