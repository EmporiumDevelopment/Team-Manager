import { executeQuery } from "../../database.js";
import COLOUR_VALUES from "../../utils/colourMap.js";
import { sendLogEmbed } from "../../utils/logger.js";
import roster from "../../commands/roster.js";
import { cleanPlayerName } from "../../utils/playerNames.js";

export async function handleMemberLeave(member) {

    // check if the member is in the roster
    const rosterData = await executeQuery(`
        SELECT player_name FROM roster WHERE guild_id = ? AND discord_id = ?
        LIMIT 1
    `, [member.guild.id, member.id]);

    // if not, return
    const isMemberInRoster = rosterData.length > 0;

    if (!isMemberInRoster) return;

    // remove the member from the roster
    await executeQuery(`
        DELETE FROM roster WHERE guild_id = ? AND discord_id = ?
    `, [member.guild.id, member.id]);

    // log the member's departure
    await sendLogEmbed(
        member.guild.id,
        `Member ${cleanPlayerName(rosterData[0].player_name) || member.user.username} has left the server, and has been removed from the roster.`,
        COLOUR_VALUES.REMOVE
    );

    // update the roster
    await roster.refreshRosterEmbed(member.guild, member.client);
}