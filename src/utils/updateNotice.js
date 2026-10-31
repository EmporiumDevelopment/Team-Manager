import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendLogEmbed } from "./logger.js";
import COLOUR_VALUES from "./colourMap.js";

// Written by the self-updating launcher (main.js) at the project root.
const STATE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.deploy-state.json");

// Turns a commit message into a title plus its "- " bullet points (continuation
// lines are joined onto their bullet); other body text and trailers are dropped.
function summariseCommit(message) {
    const [title, ...body] = message.split("\n");
    const bullets = [];
    for (const line of body) {
        if (/^\s*[-*] /.test(line)) {
            bullets.push(line.trim().replace(/^[-*] /, ""));
        } else if (bullets.length && /^\s+\S/.test(line)) {
            bullets[bullets.length - 1] += ` ${line.trim()}`;
        }
    }
    return { title: title.trim(), bullets };
}

function formatNotice(notice) {
    const lines = [`**🆕 Team Manager updated** to \`${notice.to.slice(0, 7)}\``, ""];

    if (!notice.commits.length) {
        lines.push("The change list couldn't be loaded for this update.");
    }
    for (const commit of notice.commits) {
        const { title, bullets } = summariseCommit(commit.message);
        lines.push(`**• ${title}**`);
        for (const bullet of bullets) lines.push(`  ◦ ${bullet}`);
    }

    if (notice.from && notice.repo) {
        lines.push("", `[View the full changes on GitHub](https://github.com/${notice.repo}/compare/${notice.from}...${notice.to})`);
    }

    const text = lines.join("\n");
    return text.length > 3900 ? `${text.slice(0, 3880)}\n…` : text;
}

// Posts the change log saved by the launcher to every guild's logs channel (guilds
// without one are skipped by sendLogEmbed), then clears it so it's posted once.
export async function announcePendingUpdate(client) {
    let state;
    try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return; // not started through the launcher, or nothing updated yet
    }

    const notice = state.pendingNotice;
    if (!notice?.to) return;

    // Clear first so a crash while posting can't repeat the announcement forever.
    delete state.pendingNotice;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    const message = formatNotice(notice);
    for (const guild of client.guilds.cache.values()) {
        await sendLogEmbed(guild.id, message, COLOUR_VALUES.ADD).catch(error =>
            console.error(`[updater] Failed to post update notice in guild ${guild.id}:`, error)
        );
    }
    console.log(`[updater] Posted update notice for ${notice.to.slice(0, 7)}.`);
}

export { formatNotice };
