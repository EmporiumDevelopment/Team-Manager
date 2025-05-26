// Description: This file contains the tournament handler functions for handling tournament-related events.
// It includes functions to handle tournament settings, send availability messages, and manage reactions for tournament roles.

import { executeQuery } from "../../database.js";

export async function handleReactionAdd(reaction, user) {

    if(user.bot) return;

    const message = reaction.message;
    const embed = message.embeds[0];
    const serverName = message.guild.name;
    const guildId = message.guild.id;

    if (!embed) return;
    // determine if the reaction is on mixed or female tournament message
    const tournamentRows = await executeQuery(`
        SELECT female_message_id, mixed_message_id FROM tournament_settings WHERE guild_id = ?
    `, [reaction.message.guild.id]);
    
    if (!tournamentRows.length > 0) {
        console.log(`No valid tournament message ID found for server: ${serverName} ID: ${guildId}`);
        return;
    }

    // add the user to the list of players for that team
}