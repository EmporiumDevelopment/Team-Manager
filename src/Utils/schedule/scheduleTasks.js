import cron from "node-cron";
import { announceTodaysEvents } from "./scheduleUtils.js";
import client from "../../index.js";
import { executeQuery } from "../../database.js";
import { cleanupCompletedEvents } from "./scheduleCleanup.js";

const TIMEZONE = "Europe/London";

const teams = ["mixed", "female", "clan"];

cron.schedule("00 07 * * *", async () => {

    console.log("Running scheduled event announcements...");

    const guilds = Array.from(client.guilds.cache.values());

    if (!guilds.length) {
        console.log("No guilds available in cache, skipping announcements.");
        return;
    }

    for (const guild of guilds) {

        for(const team of teams) {

            const scheduleSettings = await executeQuery(`
                SELECT announcements_channel_id FROM ${team}_schedule_settings WHERE guild_id = ?;
            `, [guild.id]);

            const channelId = scheduleSettings[0]?.announcements_channel_id;
            if (!channelId) {
                console.log(`Skipping guild ${guild.id}: No announcement channel set.`);
                continue;
            }

            try {
                await announceTodaysEvents(guild, client, team);
            } catch (error) {
                console.error(`Error sending announcements for guild ${guild.id}:`, error);
            }
        }

    }
    console.log("Scheduled event announcements sent.");
}, {
    timezone: TIMEZONE
});

cron.schedule("0 0 * * *", async () => {

    console.log("Running cleanup for completed events...");

    const guilds = Array.from(client.guilds.cache.values());

    if(!guilds.length) {
        return console.log("No guilds available in cache, skipping announcements.");;
    }

    for (const guild of guilds) {
        for(const team of teams) {
            try {
            await cleanupCompletedEvents(client, guild, team);
        } catch(error) {
            console.error(`Error cleaning complete events for guild ${guild.id}:`, error);
        }
        }
    }
});


export default cron;