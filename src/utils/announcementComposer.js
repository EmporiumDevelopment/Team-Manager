import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
    ContainerBuilder, MediaGalleryBuilder, MessageFlags, ModalBuilder, PermissionsBitField,
    RoleSelectMenuBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize,
    StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder,
} from "discord.js";
import { sendLogEmbed } from "./logger.js";
import COLOUR_VALUES from "./colourMap.js";

// Interactive announcement composer opened by /announcement.
//
// The admin builds the announcement in a private message that shows a live preview
// with the controls underneath, then sends it to the channel they picked. Announcements
// use Discord's Components V2 layout: a coloured container with an optional banner,
// a heading, an optional thumbnail, the message, an image gallery, a small footer and
// link buttons. Any pings go above the container as plain text, so they notify.
//
// Drafts live in memory per server + user, so an unsent draft is kept if the composer
// is closed by accident (running /announcement again restores it) but is lost when
// the bot restarts.
//
// Custom IDs: "announce:<action>" for buttons/menus and "announcemodal:<form>" for the
// pop-up forms. Permission is checked on every click, never trusted from the message.

const PREFIX = "announce";
const MODAL_PREFIX = "announcemodal";
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

// Discord caps the text across a whole Components V2 message at 4000 characters, and
// the composer adds its own header to the preview, so the announcement gets a bit less.
export const LIMITS = { title: 256, body: 3400, footer: 300, totalText: 3600, links: 5, linkLabel: 80, gallery: 10, url: 1000 };

export const COLOURS = [
    { value: "5865F2", label: "Blurple", emoji: "🟦" },
    { value: "ED4245", label: "Red", emoji: "🟥" },
    { value: "F57C00", label: "Orange", emoji: "🟧" },
    { value: "FEE75C", label: "Yellow", emoji: "🟨" },
    { value: "57F287", label: "Green", emoji: "🟩" },
    { value: "9B59B6", label: "Purple", emoji: "🟪" },
    { value: "EB459E", label: "Pink", emoji: "🌸" },
    { value: "F1C40F", label: "Gold", emoji: "🏆" },
    { value: "FFFFFF", label: "White", emoji: "⬜" },
    { value: "23272A", label: "Dark", emoji: "⬛" },
    { value: "none", label: "No colour bar", emoji: "🚫" },
];

const FORMATTING_HELP = [
    "**Formatting you can use in the title, message and footer**",
    "`**bold**` → **bold** · `*italic*` → *italic* · `__underline__` → __underline__",
    "`~~strike~~` → ~~strike~~ · `||spoiler||` → ||spoiler|| · `` `code` `` → `code`",
    "`# Big`, `## Medium`, `### Small` at the start of a line → headings",
    "`-# small text` → small grey text",
    "`- item` or `1. item` → lists · `> quote` → quote block",
    "`[text](https://link)` → a clickable link",
    "` ``` ` on its own line before and after a block → code block",
    "`<t:1767225600:F>` → a date shown in each reader's own time zone (`:R` shows \"in 2 days\")",
    "`<@&ROLE_ID>`, `<@USER_ID>`, `<#CHANNEL_ID>` → role, user and channel links (these don't ping, use 🔔 Ping for that)",
    "Custom emoji: `<:name:ID>` · Line breaks are kept as you type them.",
].join("\n");

// ---------- drafts ----------

const drafts = new Map();

function draftKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

export function newDraft() {
    return {
        channelId: null,
        title: "",
        body: "",
        footer: "",
        colour: "5865F2",
        banner: "",
        thumbnail: "",
        gallery: [],
        links: [],
        pingRoles: [],
        pingEveryone: false,
        pingHere: false,
        timestamp: false,
        touchedAt: Date.now(),
    };
}

function sweepDrafts(now = Date.now()) {
    for (const [key, draft] of drafts) {
        if (now - draft.touchedAt > DRAFT_TTL_MS) drafts.delete(key);
    }
}

export function getDraft(guildId, userId) {
    sweepDrafts();
    const draft = drafts.get(draftKey(guildId, userId));
    if (draft) draft.touchedAt = Date.now();
    return draft ?? null;
}

function saveDraft(guildId, userId, draft) {
    draft.touchedAt = Date.now();
    drafts.set(draftKey(guildId, userId), draft);
    return draft;
}

function dropDraft(guildId, userId) {
    drafts.delete(draftKey(guildId, userId));
}

// ---------- permissions ----------

export function canAnnounce(member) {
    return Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild));
}

// ---------- parsing (exported for tests) ----------

export function isHttpUrl(raw) {
    const value = String(raw ?? "").trim();
    if (!value || value.length > LIMITS.url) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

export function parseColour(raw) {
    const value = String(raw ?? "").trim().replace(/^#/, "");
    if (!value || value.toLowerCase() === "none") return { value: "none" };
    if (!/^[0-9a-f]{6}$/i.test(value)) return { error: "The colour must be a hex code like `#5865F2`, or left empty for no colour bar." };
    return { value: value.toUpperCase() };
}

export function parseUrl(raw, label) {
    const value = String(raw ?? "").trim();
    if (!value) return { value: "" };
    if (!isHttpUrl(value)) return { error: `The ${label} must be a full link starting with https://.` };
    return { value };
}

export function parseGallery(raw) {
    const urls = String(raw ?? "").split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (urls.length > LIMITS.gallery) return { error: `The gallery can hold at most ${LIMITS.gallery} images.` };
    const bad = urls.find(u => !isHttpUrl(u));
    if (bad) return { error: `This gallery link isn't valid: ${bad.slice(0, 100)}` };
    return { value: urls };
}

// One button per line: "Label | https://link"
export function parseLinks(raw) {
    const lines = String(raw ?? "").split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > LIMITS.links) return { error: `You can add at most ${LIMITS.links} link buttons.` };
    const links = [];
    for (const line of lines) {
        const split = line.lastIndexOf("|");
        if (split === -1) return { error: `Write each button as \`Label | https://link\`. This line is missing the \`|\`: ${line.slice(0, 100)}` };
        const label = line.slice(0, split).trim();
        const url = line.slice(split + 1).trim();
        if (!label) return { error: `A button is missing its label: ${line.slice(0, 100)}` };
        if (label.length > LIMITS.linkLabel) return { error: `Button labels can be at most ${LIMITS.linkLabel} characters.` };
        if (!isHttpUrl(url)) return { error: `This button's link isn't valid: ${url.slice(0, 100) || "(empty)"}` };
        links.push({ label, url });
    }
    return { value: links };
}

export function pingText(draft) {
    const parts = [];
    if (draft.pingEveryone) parts.push("@everyone");
    if (draft.pingHere) parts.push("@here");
    for (const id of draft.pingRoles) parts.push(`<@&${id}>`);
    return parts.join(" ");
}

function footerText(draft, now) {
    const parts = [];
    if (draft.footer) parts.push(draft.footer);
    if (draft.timestamp) parts.push(`<t:${Math.floor(now.getTime() / 1000)}:f>`);
    return parts.join(" • ");
}

export function announcementTextLength(draft) {
    return (draft.title ? draft.title.length + 2 : 0)
        + draft.body.length
        + (draft.footer.length + (draft.timestamp ? 30 : 0) + 3)
        + pingText(draft).length;
}

export function hasContent(draft) {
    return Boolean(draft.title || draft.body || draft.banner || draft.gallery.length);
}

// ---------- building the announcement ----------

const text = content => new TextDisplayBuilder().setContent(content);

// Returns the top-level components of the announcement message.
export function buildAnnouncement(draft, { now = new Date() } = {}) {
    const components = [];
    const ping = pingText(draft);
    if (ping) components.push(text(ping));

    const container = new ContainerBuilder();
    if (draft.colour !== "none") container.setAccentColor(parseInt(draft.colour, 16));

    if (draft.banner) {
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item => item.setURL(draft.banner)));
    }

    const heading = draft.title ? `# ${draft.title}` : "";
    if (draft.thumbnail && (heading || draft.body)) {
        const section = new SectionBuilder().setThumbnailAccessory(new ThumbnailBuilder().setURL(draft.thumbnail));
        section.addTextDisplayComponents([heading, draft.body].filter(Boolean).map(text));
        container.addSectionComponents(section);
    } else {
        if (heading) container.addTextDisplayComponents(text(heading));
        if (draft.body) container.addTextDisplayComponents(text(draft.body));
    }

    if (draft.gallery.length) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(...draft.gallery.map(url => item => item.setURL(url)))
        );
    }

    const footer = footerText(draft, now);
    if (footer) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(text(`-# ${footer}`));
    }

    if (draft.links.length) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            draft.links.map(link => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(link.label).setURL(link.url))
        ));
    }

    components.push(container);
    return components;
}

// ---------- composer rendering ----------

const button = (action, label, emoji, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`${PREFIX}:${action}`).setLabel(label).setEmoji(emoji).setStyle(style);

function mainRows(draft) {
    const channelMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`${PREFIX}:channel`)
        .setPlaceholder("Choose the channel to post in")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);
    if (draft.channelId) channelMenu.setDefaultChannels(draft.channelId);

    const isPreset = COLOURS.some(c => c.value === draft.colour);
    const colourOptions = COLOURS.map(c => ({ label: c.label, value: c.value, emoji: c.emoji, default: c.value === draft.colour }));
    if (!isPreset) colourOptions.unshift({ label: `Custom #${draft.colour}`, value: draft.colour, emoji: "🎨", default: true });
    const colourMenu = new StringSelectMenuBuilder()
        .setCustomId(`${PREFIX}:colour`)
        .setPlaceholder("Colour bar")
        .addOptions(colourOptions);

    const ready = Boolean(draft.channelId) && hasContent(draft);
    return [
        new ActionRowBuilder().addComponents(channelMenu),
        new ActionRowBuilder().addComponents(colourMenu),
        new ActionRowBuilder().addComponents(
            button("text", "Text", "✏️", ButtonStyle.Primary),
            button("style", "Images & colour", "🖼️", ButtonStyle.Primary),
            button("links", "Link buttons", "🔗", ButtonStyle.Primary),
            button("ping", "Ping", "🔔", ButtonStyle.Primary),
            button("help", "Formatting", "❓"),
        ),
        new ActionRowBuilder().addComponents(
            button("timestamp", draft.timestamp ? "Timestamp: on" : "Timestamp: off", "🕒"),
            button("send", "Send", "📤", ButtonStyle.Success).setDisabled(!ready),
            button("reset", "Start over", "🗑️", ButtonStyle.Danger),
            button("cancel", "Close", "✖️"),
        ),
    ];
}

function pingRows(draft) {
    const roleMenu = new RoleSelectMenuBuilder()
        .setCustomId(`${PREFIX}:pingroles`)
        .setPlaceholder("Roles to ping (up to 5)")
        .setMinValues(0)
        .setMaxValues(5);
    if (draft.pingRoles.length) roleMenu.setDefaultRoles(...draft.pingRoles);
    return [
        new ActionRowBuilder().addComponents(roleMenu),
        new ActionRowBuilder().addComponents(
            button("everyone", "@everyone", "📢", draft.pingEveryone ? ButtonStyle.Success : ButtonStyle.Secondary),
            button("here", "@here", "📍", draft.pingHere ? ButtonStyle.Success : ButtonStyle.Secondary),
            button("pingclear", "No ping", "🔕", ButtonStyle.Danger),
            button("back", "Back", "↩️"),
        ),
    ];
}

export function renderComposer(draft, { notice, view = "main", now = new Date() } = {}) {
    const where = draft.channelId ? `<#${draft.channelId}>` : "**no channel chosen yet**";
    const ping = pingText(draft);
    const header = [
        "### 📣 Announcement composer",
        `-# Posting to ${where}${ping ? ` · pings ${ping}` : ""} · Preview below, only you can see this.`,
    ];
    if (view === "ping") header.push("-# Pick roles to ping and toggle @everyone / @here. Pings appear just above the announcement.");
    if (notice) header.push(notice);

    let preview;
    if (hasContent(draft)) {
        preview = buildAnnouncement(draft, { now });
    } else {
        const placeholder = new ContainerBuilder().addTextDisplayComponents(
            text("*Your announcement preview shows up here.*\nUse **✏️ Text** to write a title and message, then pick a channel and press **📤 Send**.")
        );
        if (draft.colour !== "none") placeholder.setAccentColor(parseInt(draft.colour, 16));
        preview = [placeholder];
    }

    return {
        components: [
            text(header.join("\n")),
            ...preview,
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
            ...(view === "ping" ? pingRows(draft) : mainRows(draft)),
        ],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}

// ---------- pop-up forms ----------

function input(id, label, style, { value, max, placeholder, required = false }) {
    const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if (placeholder) field.setPlaceholder(placeholder);
    if (value) field.setValue(String(value).slice(0, max));
    return new ActionRowBuilder().addComponents(field);
}

export function buildModal(form, draft) {
    const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}:${form}`);
    if (form === "text") {
        return modal.setTitle("Announcement text").addComponents(
            input("title", "Title (shown as a big heading)", TextInputStyle.Short, { value: draft.title, max: LIMITS.title, placeholder: "e.g. Tournament this Saturday!" }),
            input("body", "Message (supports bold, lists, links…)", TextInputStyle.Paragraph, { value: draft.body, max: LIMITS.body, placeholder: "Write your announcement. Press ❓ Formatting in the composer for all the options." }),
            input("footer", "Footer (small text at the bottom)", TextInputStyle.Short, { value: draft.footer, max: LIMITS.footer, placeholder: "e.g. Questions? Ask in #help" }),
        );
    }
    if (form === "style") {
        return modal.setTitle("Images & colour").addComponents(
            input("banner", "Banner image link (wide, at the top)", TextInputStyle.Short, { value: draft.banner, max: LIMITS.url, placeholder: "https://…/banner.png" }),
            input("thumbnail", "Thumbnail link (small, next to the title)", TextInputStyle.Short, { value: draft.thumbnail, max: LIMITS.url, placeholder: "https://…/logo.png" }),
            input("gallery", "Gallery image links (one per line, max 10)", TextInputStyle.Paragraph, { value: draft.gallery.join("\n"), max: 4000, placeholder: "https://…/one.png\nhttps://…/two.png" }),
            input("colour", "Colour bar hex code (empty = none)", TextInputStyle.Short, { value: draft.colour === "none" ? "" : `#${draft.colour}`, max: 7, placeholder: "#5865F2" }),
        );
    }
    return modal.setTitle("Link buttons").addComponents(
        input("links", "One per line: Label | https://link (max 5)", TextInputStyle.Paragraph, {
            value: draft.links.map(l => `${l.label} | ${l.url}`).join("\n"),
            max: 3000,
            placeholder: "Sign up | https://example.com/signup\nRules | https://example.com/rules",
        }),
    );
}

// Applies a submitted form to a copy of the draft. Returns { draft } or { error }.
export function applyForm(form, draft, values) {
    const next = { ...draft };
    if (form === "text") {
        next.title = values.title.replace(/\s+/g, " ").trim();
        next.body = values.body.replace(/\s+$/, "");
        next.footer = values.footer.trim();
        if (announcementTextLength(next) > LIMITS.totalText) {
            return { error: `That's too long. Discord allows about ${LIMITS.totalText} characters across the title, message, footer and pings combined.` };
        }
        return { draft: next };
    }
    if (form === "style") {
        const banner = parseUrl(values.banner, "banner link");
        const thumbnail = parseUrl(values.thumbnail, "thumbnail link");
        const gallery = parseGallery(values.gallery);
        const colour = parseColour(values.colour);
        const error = [banner, thumbnail, gallery, colour].find(r => r.error)?.error;
        if (error) return { error };
        Object.assign(next, { banner: banner.value, thumbnail: thumbnail.value, gallery: gallery.value, colour: colour.value });
        return { draft: next };
    }
    if (form === "links") {
        const links = parseLinks(values.links);
        if (links.error) return { error: links.error };
        next.links = links.value;
        return { draft: next };
    }
    return { error: "Unknown form." };
}

const FORM_FIELDS = { text: ["title", "body", "footer"], style: ["banner", "thumbnail", "gallery", "colour"], links: ["links"] };

// ---------- sending ----------

// Checks both the sender and the bot can post (and ping) in the chosen channel.
// Returns an error string, or null when everything is fine.
export function sendProblem(channel, member, botMember, draft) {
    if (!channel) return "That channel no longer exists. Pick another one.";
    if (!channel.isTextBased?.()) return "That channel can't hold messages. Pick a text or announcement channel.";

    const mine = channel.permissionsFor(member);
    const bots = channel.permissionsFor(botMember);
    const { ViewChannel, SendMessages, MentionEveryone } = PermissionsBitField.Flags;

    if (!mine?.has([ViewChannel, SendMessages])) return `You can't post in ${channel} yourself, so the bot won't post there for you.`;
    if (!bots?.has([ViewChannel, SendMessages])) return `I don't have permission to send messages in ${channel}.`;

    const needsEveryone = draft.pingEveryone || draft.pingHere;
    const unmentionable = draft.pingRoles
        .map(id => channel.guild.roles.cache.get(id))
        .filter(role => role && !role.mentionable);
    if ((needsEveryone || unmentionable.length) && !mine.has(MentionEveryone)) {
        return needsEveryone
            ? "You need the **Mention @everyone, @here and All Roles** permission in that channel to ping @everyone or @here."
            : `You need the **Mention @everyone, @here and All Roles** permission to ping ${unmentionable.join(", ")}.`;
    }
    if ((needsEveryone || unmentionable.length) && !bots.has(MentionEveryone)) {
        return `I need the **Mention @everyone, @here and All Roles** permission in ${channel} for those pings to work.`;
    }
    return null;
}

async function sendAnnouncement(interaction, draft) {
    const { guild } = interaction;
    const channel = await guild.channels.fetch(draft.channelId).catch(() => null);
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    const problem = sendProblem(channel, interaction.member, botMember, draft);
    if (problem) return { error: problem };

    let message;
    try {
        message = await channel.send({
            components: buildAnnouncement(draft),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: {
                parse: draft.pingEveryone || draft.pingHere ? ["everyone"] : [],
                roles: draft.pingRoles,
            },
        });
    } catch (error) {
        console.error(`Failed to send announcement in guild ${guild.id}:`, error);
        const hint = /media|url|image/i.test(error?.message ?? "")
            ? " One of the image links probably isn't a direct link to an image."
            : "";
        return { error: `Discord rejected the announcement: ${error?.message ?? "unknown error"}.${hint}` };
    }

    sendLogEmbed(
        guild.id,
        `**Announcement Sent**\n\n**Channel:** ${channel}\n**Title:** ${draft.title || "—"}\n**Pings:** ${pingText(draft) || "none"}\n**By:** <@${interaction.user.id}>\n[Jump to message](${message.url})`,
        COLOUR_VALUES.ADD
    ).catch(error => console.error("Failed to log announcement:", error));

    return { message, channel };
}

// ---------- entry points ----------

export function isAnnouncementInteraction(customId) {
    return typeof customId === "string" && (customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`));
}

// Opens the composer (called by /announcement). Restores an unsent draft if there is one.
export async function openComposer(interaction) {
    const existing = getDraft(interaction.guild.id, interaction.user.id);
    const draft = existing ?? saveDraft(interaction.guild.id, interaction.user.id, newDraft());
    const notice = existing && hasContent(existing) ? "-# ↩️ Restored your unsent draft. Press **🗑️ Start over** for a blank one." : null;
    const payload = renderComposer(draft, { notice });
    return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

export async function handleAnnouncementInteraction(interaction) {
    if (!interaction.guild) return undefined;
    const [prefix, action] = interaction.customId.split(":");
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (!canAnnounce(interaction.member)) {
        return interaction.reply({ content: "You need the **Manage Server** permission to send announcements.", flags: MessageFlags.Ephemeral });
    }

    // "Write another" after sending: the old draft is gone, so start a fresh one.
    if (prefix === PREFIX && action === "new") {
        const fresh = saveDraft(guildId, userId, newDraft());
        return interaction.update(renderComposer(fresh));
    }

    const draft = getDraft(guildId, userId);
    if (!draft) {
        if (interaction.isMessageComponent()) {
            return interaction.update({
                components: [text("⌛ This draft expired or the bot restarted. Run `/announcement` to start a new one.")],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        return interaction.reply({ content: "⌛ This draft expired. Run `/announcement` to start a new one.", flags: MessageFlags.Ephemeral });
    }

    // Updates the draft and redraws the composer in place.
    const redraw = async (changes = {}, options = {}) => {
        saveDraft(guildId, userId, Object.assign(draft, changes));
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        return interaction.editReply(renderComposer(draft, options));
    };

    if (prefix === MODAL_PREFIX) {
        const fields = FORM_FIELDS[action];
        if (!fields) return undefined;
        if (interaction.isFromMessage()) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const values = Object.fromEntries(fields.map(id => [id, interaction.fields.getTextInputValue(id) ?? ""]));
        const result = applyForm(action, draft, values);
        if (result.error) return redraw({}, { notice: `❌ ${result.error}` });
        return redraw(result.draft, { notice: "✅ Updated." });
    }

    switch (action) {
        case "channel":
            return redraw({ channelId: interaction.values?.[0] ?? null });
        case "colour": {
            const value = interaction.values?.[0];
            const known = COLOURS.some(c => c.value === value) || value === draft.colour;
            return redraw(known ? { colour: value } : {});
        }
        case "text":
        case "style":
        case "links":
            return interaction.showModal(buildModal(action, draft));
        case "ping":
            return redraw({}, { view: "ping" });
        case "pingroles": {
            // Picking the @everyone role in the menu counts as an @everyone ping.
            const picked = interaction.values ?? [];
            const everyone = picked.includes(guildId);
            const pingRoles = picked.filter(id => id !== guildId);
            return redraw({ pingRoles, pingEveryone: draft.pingEveryone || everyone }, { view: "ping" });
        }
        case "everyone":
            return redraw({ pingEveryone: !draft.pingEveryone }, { view: "ping" });
        case "here":
            return redraw({ pingHere: !draft.pingHere }, { view: "ping" });
        case "pingclear":
            return redraw({ pingRoles: [], pingEveryone: false, pingHere: false }, { view: "ping" });
        case "back":
            return redraw();
        case "timestamp":
            return redraw({ timestamp: !draft.timestamp });
        case "help":
            return interaction.reply({ content: FORMATTING_HELP, flags: MessageFlags.Ephemeral });
        case "reset":
            return redraw({ ...newDraft(), channelId: draft.channelId }, { notice: "🗑️ Started over with a blank announcement." });
        case "cancel":
            return interaction.update({
                components: [text("✖️ Composer closed. Your draft is kept for 2 hours. Run `/announcement` to pick it up again.")],
                flags: MessageFlags.IsComponentsV2,
            });
        case "send": {
            if (!draft.channelId) return redraw({}, { notice: "❌ Pick a channel first." });
            if (!hasContent(draft)) return redraw({}, { notice: "❌ Add a title, message or image first." });
            await interaction.deferUpdate();
            const result = await sendAnnouncement(interaction, draft);
            if (result.error) return redraw({}, { notice: `❌ ${result.error}` });
            dropDraft(guildId, userId);
            return interaction.editReply({
                components: [
                    text(`✅ Announcement sent to ${result.channel}. [Jump to it](${result.message.url})`),
                    new ActionRowBuilder().addComponents(button("new", "Write another", "📝", ButtonStyle.Primary)),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        default:
            return undefined;
    }
}
