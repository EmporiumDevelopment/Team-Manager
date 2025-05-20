import { EmbedBuilder } from "discord.js";
import db from "../database.js";

class AnnouncementHandler {
    constructor(client) {
        this.client = client;
    }

    async setAnnouncementChannel(interaction) {
        const type = interaction.options.getString("type");
        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("role");

        await db.execute(`
            INSERT INTO announcement_settings (guild_id, type, channel_id, role_id)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE channel_id = ?, role_id = ?;
        `, [interaction.guild.id, type, channel.id, role?.id || null, channel.id, role?.id || null]);

        return interaction.reply({
            content: `Set ${type} announcements to ${channel} with role mention: ${role || "None"}`,
            ephemeral: true
        });
    }

    async sendAnnouncement(interaction, type, title, description, emoji) {
        const [rows] = await db.execute(`
            SELECT channel_id, role_id FROM announcement_settings WHERE guild_id = ? AND type = ?;
        `, [interaction.guild.id, type]);

        if (!rows.length) {
            return interaction.reply({ content: `No channel set for ${type} announcements. Use \`/announcement channel\` first.`, ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(rows[0].channel_id);
        if (!channel) {
            return interaction.reply({ content: `Invalid channel stored for ${type} announcements. Reset it using \`/announcement channel\`.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x00AAFF);

        const sentMessage = await channel.send({ embeds: [embed] });

        // 🔹 Send role mention separately
        if (rows[0].role_id) {
            await channel.send(`<@&${rows[0].role_id}>`);
        }

        // 🔹 Add emoji reaction if provided
        if (emoji) {
            try {
                await sentMessage.react(emoji);
            } catch (error) {
                console.warn(`Invalid emoji in server: ${interaction.guild.name} ID: ${interaction.guild.id} Emoji: ${emoji} Error: ${error}`);
            }
        }

        return interaction.reply({ content: "Announcement sent!", ephemeral: true });
    }
}

export default AnnouncementHandler;