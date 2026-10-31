import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { executeQuery } from "../../database.js";

const BUTTON_PREFIX = "sched_avail";
const TEAMS = ["mixed", "female", "clan"];

// Parse a stored emoji for use on a button. Custom emojis (`<:name:id>`) become the
// object form a ButtonBuilder expects; unicode emojis (e.g. ✅) pass through as-is.
function parseEmoji(stored) {
    if (!stored) return null;
    const m = String(stored).match(/^<(a?):(\w+):(\d+)>$/);
    if (m) return { animated: m[1] === "a", name: m[2], id: m[3] };
    return stored;
}

// True if a button customId is one of ours.
export function isScheduleButton(customId) {
    return typeof customId === "string" && customId.startsWith(`${BUTTON_PREFIX}:`);
}

// Build the Available / Can't-make-it buttons for a team's event announcement. The
// team is baked into the customId so the click handler needs no extra lookup.
export function buildScheduleComponents(team, emojis = {}) {
    const confirm = new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:confirm:${team}`)
        .setLabel("Available")
        .setStyle(ButtonStyle.Success);
    const decline = new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:decline:${team}`)
        .setLabel("Can't make it")
        .setStyle(ButtonStyle.Danger);

    const confirmEmoji = parseEmoji(emojis.confirmation_emoji);
    const declineEmoji = parseEmoji(emojis.decline_emoji);
    if (confirmEmoji) confirm.setEmoji(confirmEmoji);
    if (declineEmoji) decline.setEmoji(declineEmoji);

    return [new ActionRowBuilder().addComponents(confirm, decline)];
}

function renderPlayers(ids) {
    return ids.length ? ids.map(id => `<@${id}>`).join("\n") : "No players";
}

// Handle an event availability button click: toggle the user in/out of the event's
// participant list and re-render the "Available Players" field.
export async function handleScheduleButton(interaction) {
    const [, action, team] = interaction.customId.split(":");
    if (!["confirm", "decline"].includes(action) || !TEAMS.includes(team)) return;

    const messageId = interaction.message.id;
    const userId = interaction.user.id;

    const rows = await executeQuery(
        `SELECT participants FROM ${team}_schedule WHERE announcement_message_id = ?`,
        [messageId]
    );

    if (!rows.length) {
        return interaction.reply({
            content: "This event is no longer tracked.",
            flags: MessageFlags.Ephemeral,
        });
    }

    let players = rows[0].participants ? rows[0].participants.split(",").filter(Boolean) : [];

    if (action === "confirm") {
        if (!players.includes(userId)) players.push(userId);
    } else {
        players = players.filter(id => id !== userId);
    }

    await executeQuery(
        `UPDATE ${team}_schedule SET participants = ? WHERE announcement_message_id = ?`,
        [players.length ? players.join(",") : null, messageId]
    );

    const settings = await executeQuery(
        `SELECT confirmation_emoji, decline_emoji FROM ${team}_schedule_settings WHERE guild_id = ?`,
        [interaction.guildId]
    );

    // Keep the rest of the announcement embed, just refresh the players field.
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFields({
        name: "Available Players",
        value: renderPlayers(players),
        inline: false,
    });

    await interaction.update({
        embeds: [updatedEmbed],
        components: buildScheduleComponents(team, settings[0] || {}),
    });
}
