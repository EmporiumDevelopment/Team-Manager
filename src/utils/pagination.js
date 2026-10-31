import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";

// Paginated views for long embeds (Piggy Bank history, full activity leaderboard).
// The public channel message keeps showing the latest summary; its buttons open a
// private (ephemeral) copy that only the clicker can page through, so browsing
// never changes what everyone else sees.

const PREFIX = "page";
const paginators = new Map();

// buildPages(guild) -> Promise<EmbedBuilder[]> (one embed per page, page 1 first)
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

export async function handlePageButton(interaction) {
    const [, kind, rawPage] = interaction.customId.split(":");
    const buildPages = paginators.get(kind);
    const requested = Number(rawPage);
    if (!buildPages || !Number.isInteger(requested) || !interaction.guild) return;

    const pages = await buildPages(interaction.guild);
    const totalPages = Math.max(pages.length, 1);
    const page = Math.min(Math.max(requested, 1), totalPages);
    const embed = pages[page - 1] || new EmbedBuilder().setDescription("Nothing to show yet.");

    const view = {
        embeds: [embed],
        components: totalPages > 1 ? [navigationRow(kind, page, totalPages)] : [],
    };

    // Buttons on the private copy flip its page; buttons on the public message open
    // a new private copy.
    if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
        return interaction.update(view);
    }
    return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}
