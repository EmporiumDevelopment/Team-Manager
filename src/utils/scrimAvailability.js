import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { executeQuery } from "../database.js";

// Scrim "slots" are the player-count modes (16 / 20 / 23-player scrims).
export const SCRIM_SLOTS = ["16", "20", "23"];
// Players needed for a full PUBG Mobile squad; a slot's button turns green at this count.
export const SQUAD_SIZE = 4;
const BUTTON_PREFIX = "scrim_avail";

// True if a button customId is one of ours.
export function isScrimButton(customId) {
    return typeof customId === "string" && customId.startsWith(`${BUTTON_PREFIX}:`);
}

// Resolve which team (mixed / female / clan) a scrim message belongs to.
export async function resolveScrimTeamByMessageId(guildId, messageId) {
    for (const team of ["mixed", "female", "clan"]) {
        const rows = await executeQuery(
            `SELECT 1 FROM ${team}_scrim_settings WHERE guild_id = ? AND message_id = ?`,
            [guildId, messageId]
        );
        if (rows.length) return team;
    }
    return null;
}

// Build the row of availability buttons. Labels show only the slot; player
// counts live in the embed.
export function buildScrimComponents(counts = {}) {
    const row = new ActionRowBuilder();
    for (const slot of SCRIM_SLOTS) {
        const count = counts[slot] || 0;
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`${BUTTON_PREFIX}:${slot}`)
                .setLabel(slot)
                .setStyle(count >= SQUAD_SIZE ? ButtonStyle.Success : ButtonStyle.Primary)
        );
    }
    return [row];
}

async function playersBySlot(messageId) {
    const bySlot = Object.fromEntries(SCRIM_SLOTS.map(slot => [slot, []]));
    if (!messageId) return bySlot;

    const rows = await executeQuery(
        `SELECT slot, display_name FROM scrim_availability WHERE message_id = ? ORDER BY created_at ASC`,
        [messageId]
    );
    for (const r of rows) {
        if (bySlot[r.slot]) bySlot[r.slot].push(r.display_name || "Unknown");
    }
    return bySlot;
}

// Render the availability message (embed + buttons with counts) straight from the
// database. Pass messageId = null for a fresh, empty message before it's sent.
export async function renderScrimMessage(guildId, messageId, { title } = {}) {
    const bySlot = await playersBySlot(messageId);

    const embed = new EmbedBuilder()
        .setTitle(title || "Scrim Availability")
        .setDescription("Click a button below for each scrim you're available for. Click it again to remove yourself.")
        .setColor(0x00AAFF)
        .addFields(SCRIM_SLOTS.map(slot => ({
            name: `${slot} Players (${bySlot[slot].length})`,
            value: bySlot[slot].length ? bySlot[slot].join("\n") : "No players",
            inline: true,
        })));

    const counts = Object.fromEntries(SCRIM_SLOTS.map(slot => [slot, bySlot[slot].length]));
    return { embeds: [embed], components: buildScrimComponents(counts) };
}

// Handle a scrim availability button click: toggle the user in/out of the slot,
// then re-render the message from the database (the source of truth).
export async function handleScrimButton(interaction) {
    const slot = interaction.customId.split(":")[1];
    if (!SCRIM_SLOTS.includes(slot)) return;

    const guildId = interaction.guildId;
    const messageId = interaction.message.id;
    const userId = interaction.user.id;
    // Server nickname if set, else global display name, else username.
    const displayName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;

    const team = await resolveScrimTeamByMessageId(guildId, messageId);
    if (!team) {
        return interaction.reply({
            content: "This scrim message is no longer tracked. Ask an admin to resend it with `/scrim sendavailability`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    // Toggle this user's availability for the slot.
    const existing = await executeQuery(
        `SELECT 1 FROM scrim_availability WHERE message_id = ? AND slot = ? AND user_id = ?`,
        [messageId, slot, userId]
    );

    if (existing.length) {
        await executeQuery(
            `DELETE FROM scrim_availability WHERE message_id = ? AND slot = ? AND user_id = ?`,
            [messageId, slot, userId]
        );
    } else {
        await executeQuery(
            `INSERT INTO scrim_availability (guild_id, message_id, slot, user_id, display_name)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
            [guildId, messageId, slot, userId, displayName]
        );
    }

    const titleRows = await executeQuery(
        `SELECT embed_title FROM ${team}_scrim_settings WHERE guild_id = ?`,
        [guildId]
    );

    await interaction.update(await renderScrimMessage(guildId, messageId, {
        title: titleRows[0]?.embed_title || "Scrim Availability",
    }));
}

// Remove stored availability for a message, used when a fresh embed replaces an
// old one so the table doesn't grow without bound.
export async function clearScrimAvailability(messageId) {
    if (!messageId) return;
    await executeQuery(`DELETE FROM scrim_availability WHERE message_id = ?`, [messageId]);
}
