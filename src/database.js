import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });

async function initializeDatabase() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log("Database connected successfully!");

        // Create `channels` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS channels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) DEFAULT '',
                scrim_message_id VARCHAR(255) DEFAULT NULL,
                roster_channel_id VARCHAR(255) DEFAULT NULL,
                roster_message_id VARCHAR(255) DEFAULT NULL,
                type ENUM('scrim', 'log', 'roster') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (guild_id),
                UNIQUE (roster_channel_id),
                UNIQUE (roster_message_id)
            );
        `);

        // Create `roster` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS roster (
            id INT AUTO_INCREMENT PRIMARY KEY,
            guild_id VARCHAR(255) NOT NULL,
            discord_id VARCHAR(30) NOT NULL,
            player_name VARCHAR(255) NOT NULL,
            member_level ENUM('owner', 'leader', 'elite', 'member') DEFAULT 'member',
            flag_emoji VARCHAR(50) DEFAULT '',
            UNIQUE KEY unique_roster_entry (discord_id, guild_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create `roster_settings` table
        await db.execute(`CREATE TABLE IF NOT EXISTS roster_settings (
            guild_id VARCHAR(255) PRIMARY KEY,
            owner_emoji VARCHAR(50) DEFAULT '',
            leader_emoji VARCHAR(50) DEFAULT '',
            elite_emoji VARCHAR(50) DEFAULT '',
            member_emoji VARCHAR(50) DEFAULT '',
            embed_title VARCHAR(255) DEFAULT 'Team Roster'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create `scrim_emojis` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS scrim_emojis (
                guild_id VARCHAR(255) PRIMARY KEY,
                emoji_16 VARCHAR(50) NOT NULL,
                emoji_20 VARCHAR(50) NOT NULL,
                emoji_23 VARCHAR(50) NOT NULL,
                UNIQUE (emoji_16),
                UNIQUE (emoji_20),
                UNIQUE (emoji_23)
            );
        `);

        // Create `scrim_settings` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS scrim_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Scrim Availability',
                channel_id VARCHAR(255) DEFAULT NULL,
                UNIQUE (role_id),
                UNIQUE (embed_title),
                UNIQUE (channel_id)
            );
        `);

        // Create `log_settings` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS log_settings (
            guild_id VARCHAR(255) PRIMARY KEY,
            channel_id VARCHAR(255) DEFAULT NULL,
            embed_title VARCHAR(255) DEFAULT 'Team Manager Logs',
            UNIQUE (channel_id),
            UNIQUE (embed_title)
            );
        `);

        return db;
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
}

const db = await initializeDatabase();
export default db;