import { EmbedBuilder } from "discord.js";
import { executeQuery } from "../../database.js";
import { DateTime } from "luxon";
import { buildScheduleComponents } from "./scheduleAvailability.js";
import { reportJobFailure } from "../logger.js";

// The cron jobs run on UK time, so "today" must be UK time too — MySQL's CURRENT_DATE
// follows the database server's timezone, which can be a different day around midnight.
export const SCHEDULE_TIMEZONE = "Europe/London";

function londonToday() {
    return DateTime.now().setZone(SCHEDULE_TIMEZONE).toISODate();
}

// Event dates/times are entered and stored as Central European time (CET/CEST).
export const EVENT_TIMEZONE = "Europe/Berlin";

// Unix seconds for an event row, for Discord timestamps (<t:…>), which show every
// viewer the time in their own timezone.
export function eventUnix(event) {
    return Math.floor(DateTime.fromSQL(`${event.event_date} ${event.event_time}`, { zone: EVENT_TIMEZONE }).toSeconds());
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// Accepts "today", "tomorrow", a weekday ("fri"/"friday" = the next one, today
// included), "DD/MM" (this year, or next year if already passed), "DD/MM/YY" or
// "DD/MM/YYYY" ("/", "." or "-" separators). Returns a Luxon date or null.
export function parseEventDate(input) {
    const text = String(input || "").trim().toLowerCase();
    const today = DateTime.now().setZone(EVENT_TIMEZONE).startOf("day");

    if (text === "today") return today;
    if (text === "tomorrow") return today.plus({ days: 1 });

    const weekday = WEEKDAYS.findIndex(day => day === text || day.slice(0, 3) === text);
    if (weekday !== -1) {
        return today.plus({ days: (weekday + 1 - today.weekday + 7) % 7 });
    }

    const match = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
    if (!match) return null;

    const [, day, month, rawYear] = match;
    const year = rawYear ? (rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)) : today.year;
    let date = DateTime.fromObject({ year, month: Number(month), day: Number(day) }, { zone: EVENT_TIMEZONE });
    if (!date.isValid) return null;
    if (!rawYear && date < today) date = date.plus({ years: 1 });
    return date;
}

// Accepts "20:00", "20.00", "2000", "9:30" or "930". Returns "HH:mm:ss" or null.
export function parseEventTime(input) {
    const match = String(input || "").trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

// All events for a guild/team in display order. The number shown next to each event
// in the schedule embed is its 1-based position in this list, so it's always
// 1..n per guild without ever rewriting row IDs.
async function getOrderedEvents(guildId, team) {
    return executeQuery(`
        SELECT id, event_name,
            DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
            DATE_FORMAT(event_time, '%H:%i:%s') AS event_time,
            status, announcement_message_id
        FROM ${team}_schedule
        WHERE guild_id = ?
        ORDER BY event_date, event_time, id;
    `, [guildId]);
}

// Maps the number a user typed (as shown in the schedule) to the actual event row.
async function resolveEventByPosition(guildId, team, position) {
    if (!Number.isInteger(position) || position < 1) return null;
    const events = await getOrderedEvents(guildId, team);
    return events[position - 1] || null;
}

// Re-renders a team's schedule embed. Returns false if no schedule embed is set up
// (or it was deleted) so the caller can tell the user.
async function refreshScheduleEmbed(guild, team) {

    const scheduleSettings = await executeQuery(`
        SELECT schedule_channel_id, schedule_message_id, embed_title
        FROM ${team}_schedule_settings
        WHERE guild_id = ?;
    `, [guild.id]);

    const settings = scheduleSettings[0];
    if (!settings?.schedule_channel_id || !settings?.schedule_message_id) return false;

    const scheduleChannel = await guild.channels.fetch(settings.schedule_channel_id).catch(() => null);
    const scheduleMessage = scheduleChannel
        ? await scheduleChannel.messages.fetch(settings.schedule_message_id).catch(() => null)
        : null;
    if (!scheduleMessage) return false;

    const events = await getOrderedEvents(guild.id, team);

    // Discord timestamps show each viewer the event in their own timezone.
    let eventList = events.map((event, index) => {
        const unix = eventUnix(event);
        const statusTag = event.status === "cancelled" ? " ~~(Cancelled)~~" : "";
        return `-# [${index + 1}]\n## ${event.event_name}${statusTag}\n> **When:** <t:${unix}:F>\n> <t:${unix}:R>`;
    }).join("\n");

    if (!eventList) {
        eventList = "No events scheduled. Use `/schedule add` to create one!";
    }

    const updatedEmbed = new EmbedBuilder()
        .setTitle(settings.embed_title || "Team Schedule")
        .setDescription(eventList.slice(0, 4096))
        .setColor(0x00AAFF);

    await scheduleMessage.edit({ embeds: [updatedEmbed] });
    return true;
}

async function getTodaysEvents(guild, team) {

    const events = await executeQuery(`
        SELECT id, event_name, DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
            DATE_FORMAT(event_time, '%H:%i:%s') AS event_time, created_by
        FROM ${team}_schedule
        WHERE guild_id = ? AND event_date = ? AND status = 'active' AND announcement_message_id IS NULL;
    `, [guild.id, londonToday()]);

    return events || [];
}

// Posts an availability announcement for each of today's not-yet-announced events.
// Returns how many were announced.
async function announceTodaysEvents(guild, client, team) {

    const events = await getTodaysEvents(guild, team);
    if (events.length === 0) return 0;

    const guildId = guild.id;

    const scheduleSettings = await executeQuery(`
        SELECT * FROM ${team}_schedule_settings WHERE guild_id = ?
        `, [guildId]);

    const settings = scheduleSettings[0];
    if (!settings?.announcements_channel_id) {
        console.log(`Announcements channel ID not found for scheduled events in guild: ${guildId}`);
        return 0;
    }

    const channel = await client.channels.fetch(settings.announcements_channel_id).catch(() => null);
    if (!channel) {
        console.log(`Announcements channel ${settings.announcements_channel_id} no longer exists in guild: ${guildId}`);
        await reportJobFailure(guildId, `${team} schedule announcements`, "The announcements channel no longer exists, so today's events weren't announced. Set it again with `/schedule channel type:Announcements`.");
        return 0;
    }

    const mentionRole = settings.role_id ? `<@&${settings.role_id}>` : "";
    let announced = 0;

    for (const event of events) {

        const unix = eventUnix(event);

        const embed = new EmbedBuilder()
            .setTitle(`Today's Schedule`)
            .setColor(0x007FFF)
            .setDescription(`**Event:** ${event.event_name}\n**Time:** <t:${unix}:t> (<t:${unix}:R>)\n\nLet us know below if you are available for this event.\n`)
            .addFields({ name: "Available Players", value: "No players", inline: false });

        const message = await channel.send({
            embeds: [embed],
            components: buildScheduleComponents(team, settings),
        });

        // store message in database (scope by guild + event id, not event_name,
        // so identically-named events in other guilds aren't overwritten)
        await executeQuery(`
            UPDATE ${team}_schedule SET announcement_message_id = ? WHERE guild_id = ? AND id = ?
            `, [message.id, guildId, event.id]);

        if(mentionRole) {
            await channel.send(mentionRole);
        }
        announced++;
    }

    return announced;
}

async function resolveScheduleTeamByMessageId(guildId, messageId) {

    const teams = ["mixed", "female", "clan"];

    for (const team of teams) {
        const result = await executeQuery(`
            SELECT event_name FROM ${team}_schedule
            WHERE guild_id = ? AND announcement_message_id = ?
        `, [guildId, messageId]);

        if (result.length > 0) {
            return { team, eventName: result[0].event_name };
        }
    }

    return null; // Not a schedule announcement
}

export {
    londonToday,
    getOrderedEvents,
    resolveEventByPosition,
    refreshScheduleEmbed,
    getTodaysEvents,
    announceTodaysEvents,
    resolveScheduleTeamByMessageId,
}
