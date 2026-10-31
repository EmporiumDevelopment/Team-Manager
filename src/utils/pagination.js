import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";

// Paginated views for long embeds (Piggy Bank history, full activity leaderboard).
// The public channel message keeps showing the latest summary; its buttons open a
// private (ephemeral) copy that only the clicker can page through, so browsing
// never changes what everyone else sees.

const PREFIX = "page";
const paginators = new Map();

// buildPages(guild, arg) -> Promise<EmbedBuilder[]> (one embed per page, page 1 first).
// A kind like "season-12" uses the "season" paginator with arg "12".
export function registerPaginator(kind, buildPages) {
    paginators.set(kind, buildPages);
}

export function pageButtonId(kind, page) {
    return `${PREFIX}:${kind}:${page}`;
}

export function isPageButton(customId) {
    return typeof customId === "string" && customId.startsWith(`${PREFIX}:`);
}

// Splits entries into page texts of at most maxLength characters and maxPerPage
// entries (Discord caps embed descriptions at 4096 characters).
export function paginateEntries(entries, { maxLength = 3900, maxPerPage = Infinity } = {}) {
    const pages = [];
    let current = "";
    let count = 0;
    for (const entry of entries) {
        const piece = entry.length > maxLength ? entry.slice(0, maxLength) : entry;
        if (current && (current.length + piece.length > maxLength || count >= maxPerPage)) {
            pages.push(current);
            current = "";
            count = 0;
        }
        current += piece;
        count++;
    }
    if (current) pages.push(current);
    return pages;
}

function navigationRow(kind, page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(pageButtonId(kind, page - 1))
            .setEmoji("◀️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`${PREFIX}:${kind}:info`)
            .setLabel(`Page ${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(pageButtonId(kind, page + 1))
            .setEmoji("▶️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
    );
}

async function renderPage(kind, guild, requested) {
    const [base, arg] = kind.split("-", 2);
    const buildPages = paginators.get(kind) || paginators.get(base);
    if (!buildPages) return null;

    const pages = await buildPages(guild, arg);
    const totalPages = Math.max(pages.length, 1);
    const page = Math.min(Math.max(requested, 1), totalPages);
    const embed = pages[page - 1] || new EmbedBuilder().setDescription("Nothing to show yet.");

    return {
        embeds: [embed],
        components: totalPages > 1 ? [navigationRow(kind, page, totalPages)] : [],
    };
}

// Opens page 1 of a paged view from a slash command (the reply must already be
// deferred as ephemeral).
export async function showPagedView(interaction, kind) {
    const view = await renderPage(kind, interaction.guild, 1);
    return interaction.editReply(view || { content: "Nothing to show yet." });
}

export async function handlePageButton(interaction) {
    const [, kind, rawPage] = interaction.customId.split(":");
    const requested = Number(rawPage);
    if (!Number.isInteger(requested) || !interaction.guild) return;

    const view = await renderPage(kind, interaction.guild, requested);
    if (!view) return;

    // Buttons on the private copy flip its page; buttons on the public message open
    // a new private copy.
    if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
        return interaction.update(view);
    }
    return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}
