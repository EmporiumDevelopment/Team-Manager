import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder,
    PermissionsBitField, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { executeQuery } from "../database.js";
import { sendLogEmbed } from "./logger.js";
import COLOUR_VALUES from "./colourMap.js";
import { cleanPlayerName } from "./playerNames.js";
import { getProfile, getProfileStats, buildProfileEmbed } from "./playerProfiles.js";
import roster from "../commands/roster.js";

// Interactive profile editor (buttons, a rank menu and pop-up forms), shown as a
// private message to the editor.
//
// Who can do what (checked again on EVERY click, never trusted from the message):
//   admins (Manage Server)   -> name, flag, rank, joined date of any profile
//   the profile's owner      -> their own name only
//   everyone else            -> view only (and only if they are on the roster)
//
// Custom IDs: "profile:<action>:<targetId>" for buttons/menus and
// "profilemodal:<field>:<targetId>" for the pop-up forms.

const PREFIX = "profile";
const MODAL_PREFIX = "profilemodal";
const NAME_MAX = 32;
const RANKS = [
    { value: "owner", label: "Owner" },
    { value: "leader", label: "Leader" },
    { value: "elite", label: "Elite Member" },
    { value: "member", label: "Member" },
];
const FIELD_LABELS = { player_name: "Name", flag_emoji: "Flag", member_level: "Rank", joined_at: "Joined date" };
const MODAL_FIELDS = { name: "player_name", flag: "flag_emoji", joined: "joined_at" };

export function isProfileInteraction(customId) {
    return typeof customId === "string" && (customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`));
}

export function isAdmin(member) {
    return Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild));
}

// Which fields this user may edit on the target's profile ([] = none).
export function editableFields(member, userId, targetId) {
    if (isAdmin(member)) return ["player_name", "flag_emoji", "member_level", "joined_at"];
    if (String(userId) === String(targetId)) return ["player_name"];
    return [];
}

// Viewing someone else's profile: admins, or players on the roster.
export async function canViewOthers(guildId, member, userId) {
    if (isAdmin(member)) return true;
    const rows = await executeQuery(
        `SELECT 1 FROM roster WHERE guild_id = ? AND discord_id = ? LIMIT 1`,
        [guildId, String(userId)]
    );
    return rows.length > 0;
}

// "Edit profile" button for the public profile card (only added when the viewer can edit).
export function editButtonRow(targetId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${PREFIX}:open:${targetId}`)
            .setLabel("Edit profile")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary)
    );
}

// ---------- validation (exported for tests) ----------

export function validateName(raw) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) return { error: "The name can't be empty." };
    if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
    if (/[<>@`\\]/.test(name)) return { error: "The name can't contain `<`, `>`, `@`, `\\` or backticks." };
    return { value: name };
}

export function validateFlag(raw) {
    const flag = String(raw ?? "").trim();
    if (!flag) return { error: "The flag can't be empty." };
    if (flag.length > 50 || /\s/.test(flag)) return { error: "Enter a single flag emoji, e.g. 🇬🇧." };
    return { value: flag };
}

// Accepts DD/MM/YYYY (UK style, as used across the bot) or YYYY-MM-DD.
export function validateJoinedDate(raw, now = new Date()) {
    const text = String(raw ?? "").trim();
    let y, m, d;
    let match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (match) [, d, m, y] = match.map(Number);
    else if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = match.map(Number);
    else return { error: "Use the format DD/MM/YYYY, e.g. 05/01/2026." };

    const date = new Date(Date.UTC(y, m - 1, d, 12));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        return { error: "That date doesn't exist." };
    }
    if (date > now) return { error: "The joined date can't be in the future." };
    if (y < 2000) return { error: "That date is too far in the past." };
    return { value: date };
}

export function formatDateInput(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ---------- editor rendering ----------

export async function renderEditor(guild, member, userId, targetId, { notice, view = "main" } = {}) {
    const profile = await getProfile(guild.id, targetId);
    if (!profile) return { content: "This profile no longer exists.", embeds: [], components: [] };

    const fields = editableFields(member, userId, targetId);
    const stats = await getProfileStats(guild.id, targetId);
    const user = await guild.client.users.fetch(String(targetId)).catch(() => null);
    const embed = buildProfileEmbed(profile, stats, user)
        .setFooter({ text: fields.length > 1 ? "Profile editor · Admin" : "Profile editor · You can change your name" });

    const components = [];
    if (view === "rank" && fields.includes("member_level")) {
        components.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${PREFIX}:rankset:${targetId}`)
                .setPlaceholder("Choose a new rank")
                .addOptions(RANKS.map(r => ({ ...r, default: r.value === profile.member_level })))
        ));
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${PREFIX}:back:${targetId}`).setLabel("Back").setStyle(ButtonStyle.Secondary)
        ));
    } else {
        const buttons = [];
        const add = (field, action, label, emoji) => {
            if (fields.includes(field)) {
                buttons.push(new ButtonBuilder().setCustomId(`${PREFIX}:${action}:${targetId}`).setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Primary));
            }
        };
        add("player_name", "name", "Name", "✏️");
        add("flag_emoji", "flag", "Flag", "🏳️");
        add("member_level", "rank", "Rank", "🎖️");
        add("joined_at", "joined", "Joined date", "📅");
        buttons.push(new ButtonBuilder().setCustomId(`${PREFIX}:done:${targetId}`).setLabel("Done").setStyle(ButtonStyle.Success));
        components.push(new ActionRowBuilder().addComponents(buttons));
    }

    const header = profile.status === "former"
        ? "-# This is a former player, so changes only affect their profile."
        : "-# Changes also update the roster, logs and scrim availability.";
    return { content: [notice, header].filter(Boolean).join("\n"), embeds: [embed], components };
}

function buildModal(field, targetId, profile) {
    const configs = {
        player_name: { title: "Change name", label: "Name", value: profile.player_name, max: NAME_MAX, placeholder: "e.g. 6pmFestina" },
        flag_emoji: { title: "Change flag", label: "Flag emoji", value: profile.flag_emoji, max: 50, placeholder: "e.g. 🇬🇧" },
        joined_at: { title: "Change joined date", label: "Joined date (DD/MM/YYYY)", value: formatDateInput(profile.joined_at), max: 10, placeholder: "05/01/2026" },
    };
    const c = configs[field];
    const input = new TextInputBuilder()
        .setCustomId("value")
        .setLabel(c.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(c.max)
        .setPlaceholder(c.placeholder);
    if (c.value) input.setValue(String(c.value).slice(0, c.max));
    return new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}:${field}:${targetId}`)
        .setTitle(c.title)
        .addComponents(new ActionRowBuilder().addComponents(input));
}

// ---------- applying changes ----------

function displayValue(field, value) {
    if (field === "joined_at") return formatDateInput(value);
    if (field === "member_level") return RANKS.find(r => r.value === value)?.label;
    return value;
}

// Writes one field to the profile and, for current roster players, to the roster
// too, so the new value shows everywhere. Returns a notice string for the editor.
async function applyChange(interaction, targetId, field, value, profile) {
    const guild = interaction.guild;
    const guildId = guild.id;
    const id = String(targetId);

    await executeQuery(`UPDATE player_profiles SET ${field} = ? WHERE guild_id = ? AND discord_id = ?`, [value, guildId, id]);

    let warning = null;
    if (field !== "joined_at") {
        const rosterRows = await executeQuery(`SELECT member_level FROM roster WHERE guild_id = ? AND discord_id = ?`, [guildId, id]);
        if (rosterRows.length) {
            await executeQuery(`UPDATE roster SET ${field} = ? WHERE guild_id = ? AND discord_id = ?`, [value, guildId, id]);
            if (field === "member_level") {
                warning = await roster.syncLevelRole(guild, id, rosterRows[0].member_level, value);
            }
            await roster.refreshRosterEmbed(guild, interaction.client)
                .catch(error => console.error("Failed to refresh roster after profile edit:", error));
        }
    }

    // Names already listed on scrim boards update the next time each board is redrawn.
    if (field === "player_name") {
        await executeQuery(
            `UPDATE scrim_availability SET display_name = ? WHERE guild_id = ? AND user_id = ?`,
            [cleanPlayerName(value), guildId, id]
        );
    }

    const shown = displayValue(field, value);
    await sendLogEmbed(
        guildId,
        `**Player Profile Edited**\n\n**Player:** ${cleanPlayerName(profile.player_name) || id}\n**Field:** ${FIELD_LABELS[field]}\n**From:** ${displayValue(field, profile[field]) || "—"}\n**To:** ${shown}\n**By:** <@${interaction.user.id}>.`,
        COLOUR_VALUES.EDIT
    ).catch(error => console.error("Failed to log profile edit:", error));

    return `✅ ${FIELD_LABELS[field]} updated to **${shown}**.${warning ? `\n⚠️ ${warning}` : ""}`;
}

// ---------- interaction entry point ----------

export async function handleProfileInteraction(interaction) {
    const [prefix, action, targetId] = interaction.customId.split(":");
    if (!interaction.guild || !targetId) return;

    const { guild, member } = interaction;
    const userId = interaction.user.id;
    const fields = editableFields(member, userId, targetId);
    const deny = () => interaction.reply({ content: "You don't have permission to edit this profile.", flags: MessageFlags.Ephemeral });

    if (fields.length === 0) return deny();

    const profile = await getProfile(guild.id, targetId);
    if (!profile) {
        return interaction.reply({ content: "This profile no longer exists.", flags: MessageFlags.Ephemeral });
    }

    // Pop-up form submitted: validate, save, then redraw the editor in place.
    if (prefix === MODAL_PREFIX) {
        const field = action;
        if (!fields.includes(field) || !Object.values(MODAL_FIELDS).includes(field)) return deny();

        if (interaction.isFromMessage()) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const validators = { player_name: validateName, flag_emoji: validateFlag, joined_at: validateJoinedDate };
        const result = validators[field](interaction.fields.getTextInputValue("value"));

        const notice = result.error
            ? `❌ ${result.error}`
            : await applyChange(interaction, targetId, field, result.value, profile);
        return interaction.editReply(await renderEditor(guild, member, userId, targetId, { notice }));
    }

    switch (action) {
        case "open":
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            return interaction.editReply(await renderEditor(guild, member, userId, targetId));
        case "name":
        case "flag":
        case "joined": {
            const field = MODAL_FIELDS[action];
            if (!fields.includes(field)) return deny();
            return interaction.showModal(buildModal(field, targetId, profile));
        }
        case "rank":
            if (!fields.includes("member_level")) return deny();
            await interaction.deferUpdate();
            return interaction.editReply(await renderEditor(guild, member, userId, targetId, { view: "rank" }));
        case "rankset": {
            if (!fields.includes("member_level")) return deny();
            const value = interaction.values?.[0];
            if (!RANKS.some(r => r.value === value)) return deny();
            await interaction.deferUpdate();
            const notice = value === profile.member_level
                ? "Rank unchanged."
                : await applyChange(interaction, targetId, "member_level", value, profile);
            return interaction.editReply(await renderEditor(guild, member, userId, targetId, { notice }));
        }
        case "back":
            await interaction.deferUpdate();
            return interaction.editReply(await renderEditor(guild, member, userId, targetId));
        case "done":
            return interaction.update({ content: "✅ Profile editor closed.", embeds: [], components: [] });
        default:
            return undefined;
    }
}
