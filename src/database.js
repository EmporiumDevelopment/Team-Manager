import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });

const db = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            connectTimeout: 10000,
            multipleStatements: true,
});

async function executeQuery(sql, params = []) {
    let attempts = 0;
    while (attempts < 3) { 
        try {
            const [result] = await db.execute(sql, params);
            // If the result is an array, return it directly; otherwise, wrap it in an array
            // This allows for both single-row and multi-row results to be handled uniformly
            return Array.isArray(result) ? result : [result]; 
        } catch (error) {
            console.error("Database error:", error);
            if (error.code === "ECONNRESET") {
                attempts++;
                console.log(`Retrying database connection (Attempt ${attempts})...`);
                await new Promise(res => setTimeout(res, 1000));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Database connection failed after multiple attempts.");
}

async function initializeDatabase() {
    try {
        console.log("Database connected successfully!");

        // Create `channels` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS channels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) DEFAULT '',
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
                discord_id VARCHAR(30) DEFAULT NULL,
                player_name VARCHAR(255) DEFAULT NULL,
                member_level ENUM('owner', 'leader', 'elite', 'member') DEFAULT 'member',
                flag_emoji VARCHAR(50) DEFAULT '',
                UNIQUE KEY unique_roster_entry (discord_id, guild_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create `roster_settings` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS roster_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                owner_emoji VARCHAR(50) DEFAULT '',
                leader_emoji VARCHAR(50) DEFAULT '',
                elite_emoji VARCHAR(50) DEFAULT '',
                member_emoji VARCHAR(50) DEFAULT '',
                owner_role_id VARCHAR(255) DEFAULT NULL,
                leader_role_id VARCHAR(255) DEFAULT NULL,
                elite_role_id VARCHAR(255) DEFAULT NULL,
                member_role_id VARCHAR(255) DEFAULT NULL,
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
            CREATE TABLE IF NOT EXISTS mixed_scrim_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Scrim Availability',
                channel_id VARCHAR(255) DEFAULT NULL,
                message_id VARCHAR(255) DEFAULT NULL,
                is_enabled BOOLEAN DEFAULT FALSE
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS female_scrim_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Scrim Availability',
                channel_id VARCHAR(255) DEFAULT NULL,
                message_id VARCHAR(255) DEFAULT NULL,
                is_enabled BOOLEAN DEFAULT FALSE
            )    
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS clan_scrim_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Scrim Availability',
                channel_id VARCHAR(255) DEFAULT NULL,
                message_id VARCHAR(255) DEFAULT NULL,
                is_enabled BOOLEAN DEFAULT FALSE
            )    
        `);

        // Create `log_settings` table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS log_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                channel_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Team Manager Logs'
            );
        `);

        // Create announcement_settings table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS announcement_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                public_channel_id VARCHAR(255) DEFAULT NULL,
                team_channel_id VARCHAR(255) DEFAULT NULL,
                clan_channel_id VARCHAR(255) DEFAULT NULL,
                public_channel_role_id VARCHAR(255) DEFAULT NULL,
                team_channel_role_id VARCHAR(255) DEFAULT NULL,
                clan_channel_role_id VARCHAR(255) DEFAULT NULL,
                UNIQUE (public_channel_id),
                UNIQUE (team_channel_id),
                UNIQUE (clan_channel_id),
                UNIQUE (public_channel_role_id),
                UNIQUE (team_channel_role_id),
                UNIQUE (clan_channel_role_id)
            );
        `);

        // Create tournament_settings table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS tournament_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                female_role_id VARCHAR(255) DEFAULT NULL,
                female_message_id VARCHAR(255) DEFAULT NULL,
                mixed_role_id VARCHAR(255) DEFAULT NULL,
                mixed_message_id VARCHAR(255) DEFAULT NULL,
                UNIQUE (female_role_id),
                UNIQUE (female_message_id),
                UNIQUE (mixed_role_id),
                UNIQUE (mixed_message_id)
            );
        `);

        // Create schedule tables
        await db.execute(`
            CREATE TABLE IF NOT EXISTS mixed_schedule_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                schedule_channel_id VARCHAR(255) DEFAULT NULL,
                schedule_message_id VARCHAR(255) DEFAULT NULL,
                announcements_channel_id VARCHAR(255) DEFAULT NULL,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Team Schedule',
                confirmation_emoji VARCHAR(50) DEFAULT '✅',
                decline_emoji VARCHAR(50) DEFAULT '❌'
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS female_schedule (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(255) NULL,
                event_date DATE NULL,
                event_time TIME NULL,
                announcement_message_id VARCHAR(255) NULL,
                participants TEXT DEFAULT NULL,
                created_by VARCHAR(30) NULL,
                status ENUM('active', 'completed', 'cancelled') DEFAULT 'active'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS female_schedule_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                schedule_channel_id VARCHAR(255) DEFAULT NULL,
                schedule_message_id VARCHAR(255) DEFAULT NULL,
                announcements_channel_id VARCHAR(255) DEFAULT NULL,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Team Schedule',
                confirmation_emoji VARCHAR(50) DEFAULT '✅',
                decline_emoji VARCHAR(50) DEFAULT '❌'
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS clan_schedule_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                schedule_channel_id VARCHAR(255) DEFAULT NULL,
                schedule_message_id VARCHAR(255) DEFAULT NULL,
                announcements_channel_id VARCHAR(255) DEFAULT NULL,
                role_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Team Schedule',
                confirmation_emoji VARCHAR(50) DEFAULT '✅',
                decline_emoji VARCHAR(50) DEFAULT '❌'
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS clan_schedule (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(255) NULL,
                event_date DATE NULL,
                event_time TIME NULL,
                announcement_message_id VARCHAR(255) NULL,
                participants TEXT DEFAULT NULL,
                created_by VARCHAR(30) NULL,
                status ENUM('active', 'completed', 'cancelled') DEFAULT 'active'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS mixed_schedule (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(255) NULL,
                event_date DATE NULL,
                event_time TIME NULL,
                announcement_message_id VARCHAR(255) NULL,
                participants TEXT DEFAULT NULL,
                created_by VARCHAR(30) NULL,
                status ENUM('active', 'completed', 'cancelled') DEFAULT 'active'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS player_activity (
                guild_id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(30) DEFAULT NULL,
                games_played INT DEFAULT 0,
                wins INT DEFAULT 0,
                total_points INT DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS player_activity_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                channel_id VARCHAR(255) DEFAULT NULL,
                message_id VARCHAR(255) DEFAULT NULL,
                title VARCHAR(255) DEFAULT 'Player Activity'
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS social_media_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                channel_id VARCHAR(255) DEFAULT NULL,
                message_id VARCHAR(255) DEFAULT NULL,
                embed_title VARCHAR(255) DEFAULT 'Social Media'
            );
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS social_media (
                guild_id VARCHAR(255) PRIMARY KEY,
                youtube_link VARCHAR(255) DEFAULT NULL,
                youtube_prefix VARCHAR(50) DEFAULT NULL,
                youtube_emoji VARCHAR(50) DEFAULT NULL,
                tiktok_link VARCHAR(255) DEFAULT NULL,
                tiktok_prefix VARCHAR(50) DEFAULT NULL,
                tiktok_emoji VARCHAR(50) DEFAULT NULL,
                instagram_link VARCHAR(255) DEFAULT NULL,
                instagram_prefix VARCHAR(50) DEFAULT NULL,
                instagram_emoji VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
}

(async () => {
    await initializeDatabase();
})();

export { db, executeQuery };