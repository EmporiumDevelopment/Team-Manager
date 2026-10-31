// Self-updating launcher for hosts without git support (e.g. PebbleHost, whose
// start file is main.js). On every start it:
//   1. asks GitHub for the newest commit on the branch,
//   2. if it's new, downloads it and copies the repo's files over this folder
//      (src/.env, node_modules and anything not in the repo are never touched;
//      files removed from the repo are deleted on later updates),
//   3. runs npm install when package.json / package-lock.json changed,
//   4. starts the bot.
// If any update step fails it logs why and starts the code already on disk.
//
// Settings (environment or src/.env): AUTO_UPDATE=false to disable,
// UPDATE_REPO=owner/name and UPDATE_BRANCH=branch to change the source.

import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(ROOT, ".deploy-state.json");
const PROTECTED_PATHS = new Set(["src/.env"]);

function log(message) {
    console.log(`[updater] ${message}`);
}

// Minimal reader for src/.env so the launcher works before dependencies exist.
function readSetting(name, fallback) {
    if (process.env[name] !== undefined) return process.env[name];
    try {
        const env = fs.readFileSync(path.join(ROOT, "src/.env"), "utf8");
        const match = env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`, "m"));
        if (match) return match[1].replace(/^["']|["']$/g, "").trim();
    } catch {
        // no .env yet
    }
    return fallback;
}

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return {};
    }
}

// Extracts a .tar.gz buffer into a Map of relative path -> file contents, dropping
// GitHub's top-level "<repo>-<sha>/" folder. Handles ustar prefixes and pax
// long-path headers, which is everything GitHub's tarballs use.
function extractTarball(gzipped) {
    const tar = zlib.gunzipSync(gzipped);
    const files = new Map();
    let offset = 0;
    let paxPath = null;

    const readString = (start, length) => {
        const raw = tar.subarray(start, start + length);
        const end = raw.indexOf(0);
        return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
    };

    while (offset + 512 <= tar.length) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;

        const name = readString(offset, 100);
        const size = parseInt(readString(offset + 124, 12).trim() || "0", 8);
        const type = String.fromCharCode(header[156] || 48);
        const prefix = readString(offset + 345, 155);
        const dataStart = offset + 512;
        const data = tar.subarray(dataStart, dataStart + size);
        offset = dataStart + Math.ceil(size / 512) * 512;

        if (type === "x") {
            const match = data.toString("utf8").match(/\d+ path=([^\n]*)\n/);
            paxPath = match ? match[1] : null;
            continue;
        }
        if (type === "g") continue; // global header (GitHub puts the commit id here)

        const fullName = paxPath ?? (prefix ? `${prefix}/${name}` : name);
        paxPath = null;
        if (type !== "0") continue; // only regular files; folders are created as needed

        const relative = fullName.split("/").slice(1).join("/");
        if (!relative || relative.split("/").includes("..")) continue;
        files.set(relative, Buffer.from(data));
    }

    return files;
}

// Commits between the previously running version and the new one, newest first,
// for the "Bot updated" change log the bot posts to each logs channel on startup.
async function buildUpdateNotice(repo, from, to, headers) {
    const notice = { repo, from: from || null, to, commits: [] };
    const url = from
        ? `https://api.github.com/repos/${repo}/compare/${from}...${to}`
        : `https://api.github.com/repos/${repo}/commits/${to}`;
    const response = await fetch(url, {
        headers: { ...headers, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const json = await response.json();
    const commits = from ? json.commits || [] : [json];
    notice.commits = commits.slice(-20).reverse().map(c => ({ sha: c.sha, message: c.commit.message }));
    return notice;
}

function hashDependencies(readFile) {
    const hash = crypto.createHash("sha256");
    for (const file of ["package.json", "package-lock.json"]) {
        hash.update(readFile(file) ?? "");
    }
    return hash.digest("hex");
}

async function update() {
    const autoUpdate = readSetting("AUTO_UPDATE", "true").toLowerCase();
    if (["false", "0", "no", "off"].includes(autoUpdate)) {
        log("AUTO_UPDATE is off, starting current version.");
        return;
    }

    const repo = readSetting("UPDATE_REPO", "EmporiumDevelopment/Team-Manager");
    const branch = readSetting("UPDATE_BRANCH", "main");
    const headers = { "User-Agent": "team-manager-updater" };
    const state = readState();

    const shaResponse = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, {
        headers: { ...headers, Accept: "application/vnd.github.sha" },
        signal: AbortSignal.timeout(15000),
    });
    if (!shaResponse.ok) throw new Error(`GitHub returned ${shaResponse.status} for ${repo}@${branch}`);
    const sha = (await shaResponse.text()).trim();

    if (sha === state.commit && fs.existsSync(path.join(ROOT, "node_modules"))) {
        log(`Up to date (${sha.slice(0, 7)}).`);
        return;
    }

    log(`Downloading ${repo}@${branch} (${sha.slice(0, 7)})...`);
    const archiveResponse = await fetch(`https://codeload.github.com/${repo}/tar.gz/${sha}`, {
        headers,
        signal: AbortSignal.timeout(60000),
    });
    if (!archiveResponse.ok) throw new Error(`Download failed with status ${archiveResponse.status}`);
    const files = extractTarball(Buffer.from(await archiveResponse.arrayBuffer()));
    if (!files.has("src/index.js")) throw new Error("Downloaded archive doesn't look like the bot (no src/index.js)");

    let written = 0;
    for (const [relative, contents] of files) {
        if (PROTECTED_PATHS.has(relative)) continue;
        const destination = path.join(ROOT, relative);
        if (!destination.startsWith(ROOT + path.sep)) continue;

        const existing = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
        if (existing && existing.equals(contents)) continue;

        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, contents);
        written++;
    }

    // Remove files that a previous update installed but the repo no longer has.
    let removed = 0;
    for (const relative of state.files || []) {
        if (files.has(relative) || PROTECTED_PATHS.has(relative)) continue;
        const destination = path.join(ROOT, relative);
        if (destination.startsWith(ROOT + path.sep) && fs.existsSync(destination)) {
            fs.unlinkSync(destination);
            removed++;
        }
    }

    const dependencyHash = hashDependencies(file => files.get(file));
    const needsInstall = dependencyHash !== state.dependencyHash || !fs.existsSync(path.join(ROOT, "node_modules"));
    if (needsInstall && !process.env.UPDATER_SKIP_NPM) {
        log("Dependencies changed, running npm install...");
        execSync("npm install --omit=dev --no-audit --no-fund", { cwd: ROOT, stdio: "inherit" });
    }

    // If an earlier change log was never posted (bot didn't reach Discord), cover
    // both updates in one.
    const noticeFrom = state.pendingNotice?.from ?? state.commit;
    const pendingNotice = await buildUpdateNotice(repo, noticeFrom, sha, headers).catch(error => {
        log(`Couldn't fetch the change list: ${error.message}`);
        return { repo, from: noticeFrom || null, to: sha, commits: [] };
    });

    fs.writeFileSync(STATE_FILE, JSON.stringify({
        commit: sha,
        pendingNotice,
        files: [...files.keys()].filter(f => !PROTECTED_PATHS.has(f)),
        dependencyHash,
        updatedAt: new Date().toISOString(),
    }, null, 2));

    log(`Updated to ${sha.slice(0, 7)} (${written} file(s) changed, ${removed} removed).`);
}

try {
    await update();
} catch (error) {
    log(`Update skipped: ${error.message}. Starting current version.`);
}

if (!process.env.UPDATER_DRY_RUN) {
    await import(pathToFileURL(path.join(ROOT, "src", "index.js")).href);
}
