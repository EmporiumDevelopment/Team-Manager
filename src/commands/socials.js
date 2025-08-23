import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { sendLogEmbed } from "../utils/logger.js";
import COLOUR_VALUES from "../utils/colourMap.js";
import { executeQuery } from "../database.js";

export default {
    data: new SlashCommandBuilder()
    .setName("socials")
    .setDescription("Manage socials information and settings.")
    // set channel
    .addSubcommand(subcommand =>
        subcommand
            .setName("channel")
            .setDescription("Set the channel where social media information will be posted.")
            .addChannelOption(option =>
                option.setName("channel")
                    .setDescription("The channel to set for social media posts.")
                    .setRequired(true)
        )
    )
    // add a social media platform 
    .addSubcommand(subcommand =>
        subcommand
            .setName("add")
            .setDescription("Add a social media platform.")
            .addStringOption(option => 
                option.setName("platform")
                    .setDescription("The social media platform to add (e.g., Twitter, Instagram, Facebook).")
                    .setRequired(true)
                    .addChoices(
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'TikTok', value: 'tiktok' }
                    )
            )
            .addStringOption(option => 
                option.setName("url")
                    .setDescription("The URL of the social media platform.")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("display_name")
                    .setDescription("The display name for the social media platform.")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("emoji")
                    .setDescription("An emoji to represent the social media platform.")
                    .setRequired(true)
            )
    )
    // remove a social media platform
    .addSubcommand(subcommand =>
        subcommand
            .setName("remove")
            .setDescription("Remove a social media platform.")
            .addStringOption(option =>
                option.setName("platform")
                    .setDescription("The social media platform to remove (e.g., YouTube, Instagram, TikTok).")
                    .setRequired(true)
                    .addChoices(
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'TikTok', value: 'tiktok' }
                    )
            )
    )
    // edit a social media platform
    .addSubcommand(subcommand =>
        subcommand
            .setName("edit")
            .setDescription("Edit a social media platform.")
            .addStringOption(option =>
                option.setName("platform")
                    .setDescription("The social media platform to edit (e.g., YouTube, Instagram, TikTok).")
                    .setRequired(true)
                    .addChoices(
                        { name: 'Instagram', value: 'instagram' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'TikTok', value: 'tiktok' }
                    )
            )
            .addStringOption(option => 
                option.setName("property")
                    .setDescription("The nproperty you want to edit (URL, display name, emoji).")
                    .setRequired(true)
                    .addChoices(
                        { name: 'URL', value: 'url' },
                        { name: 'Display Name', value: 'display_name' },
                        { name: 'Emoji', value: 'emoji' }
                    )
            )
            .addStringOption(option =>
                option.setName("value")
                    .setDescription("The new value for the selected property.")
                    .setRequired(true)
            )
    )
    // edit embed title
    .addSubcommand(subcommand =>
        subcommand
            .setName("title")
            .setDescription("Set the title of the social media embed.")
            .addStringOption(option =>
                option.setName("title")
                    .setDescription("The new title for the social media embed.")
                    .setRequired(true)
            )
    ),

    async execute(interaction) {

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // sub command permission check
        if(["channel", "add", "remove", "edit", "title"].includes(subcommand)){
            if(!interaction.member.permissions.has("ManageGuild")) {
                return interaction.reply({ content: "You need **Manage Server** permission to modify the roster!", ephemeral: true });
            }
        }

        // check if social media settings exist for the guild
        const socialMediaSettings = await executeQuery(`
            SELECT * FROM social_media_settings WHERE guild_id = ?
        `, [guildId]);

        if(socialMediaSettings.length === 0) {
            // if not, create a new entry with default values
            await executeQuery(`
                INSERT INTO social_media_settings (guild_id, embed_title)
                VALUES (?, ?)
            `, [guildId, "Social Media"]);
        }

        // set channel
        if(subcommand === "channel") {
            await this.setChannel(interaction);
            return;
        }

        // check if the channel is set
        if(!socialMediaSettings[0].channel_id || socialMediaSettings[0].channel_id === null) {
            return interaction.reply({ content: "Social media channel is not set. Please set it using `/socials channel` command.", ephemeral: true });
        }

        if(subcommand === "add") {
            await this.addPlatform(interaction);
            return;
        } else if(subcommand === "remove") {
            await this.removePlatform(interaction);
            return;
        } else if(subcommand === "edit") {
           await this.editPlatform(interaction);
           return;
        } else if(subcommand === "title") {
            await this.editTitle(interaction);
        }
    },

    async setChannel(interaction) {

        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel("channel");

        // check if user provided a valid channel
        if(!channel) {
            return await interaction.reply({ content: "Please provide a valid channel.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // update the channel in the database
            await executeQuery(`
                INSERT INTO social_media_settings (guild_id, channel_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `, [guildId, channel.id]);

            // log the action
            await sendLogEmbed(
                guildId, 
                `Social Media Settings Updated\n\nThe Social Media channel has been updated\nChannel: ${channel}\n**By:** ${interaction.user.tag}`,
                COLOUR_VALUES.ADD
            );

            // send the default social media embed
            const embed = await this.createSocialMediaEmbed(interaction);

            await channel.send({ embeds: [embed] });

            // update the message ID in the database
            const message = await channel.messages.fetch({ limit: 1 }).then(messages => messages.first());

            if(message) {
                await executeQuery(`
                    UPDATE social_media_settings SET message_id = ? WHERE guild_id = ?
                `, [message.id, guildId]);

            }

            // confirm to the user
            return await interaction.editReply({ content: `Social media channel has been set to ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Error setting social media channel:", error);
            return await interaction.editReply({ content: "There was an error setting the social media channel. Please try again later.", flags: MessageFlags.Ephemeral });
        }
    },

    async addPlatform(interaction) {

        const guildId = interaction.guild.id;

        const platform = interaction.options.getString("platform");
        const url = interaction.options.getString("url");
        const displayName = interaction.options.getString("display_name");
        const emoji = interaction.options.getString("emoji");

        if(!platform) {
            return await interaction.reply({ content: "Please provide a valid platform.", flags: MessageFlags.Ephemeral });
        }

        if(!url) {
            return await interaction.reply({ content: "Please provide a valid URL.", flags: MessageFlags.Ephemeral });
        }

        if(!displayName) {
            return await interaction.reply({ content: "Please provide a valid display name.", flags: MessageFlags.Ephemeral });
        }

        if(!emoji) {
            return await interaction.reply({ content: "Please provide a valid emoji.", flags: MessageFlags.Ephemeral });
        }

        // check custom emoji validity
        const emojiRegex = /^<a?:\w+:\d+>$/;

        if (!emojiRegex.test(emoji)) {
            return interaction.reply({ content: "That doesn't look like a valid custom emoji format.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // insert the new platform into the database
            await executeQuery(`
                INSERT INTO social_media (guild_id, ${platform}_link, ${platform}_prefix, ${platform}_emoji)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE ${platform}_link = VALUES(${platform}_link), ${platform}_prefix = VALUES(${platform}_prefix), ${platform}_emoji = VALUES(${platform}_emoji)
            `, [guildId, url, displayName, emoji]);

            // log the action
            await sendLogEmbed(
                guildId, 
                `Social Media Platform Added\n\nA new social media platform has been added.\nPlatform: ${platform}\nURL: ${url}\nDisplay Name: ${displayName}\nEmoji: ${emoji}\n**By:** ${interaction.user.tag}`,
                COLOUR_VALUES.ADD
            );

            // confirm to the user
            await interaction.editReply({ content: `The ${platform} platform has been added with URL: ${url}`, flags: MessageFlags.Ephemeral });

            // update the social media embed in the channel
            await this.updateEmbed(interaction);

        } catch (error) {
            console.error("Error adding social media platform:", error);
            return await interaction.editReply({ content: "There was an error adding the social media platform. Please try again later.", flags: MessageFlags.Ephemeral });
        }
    },

    async removePlatform(interaction) {

        const guildId = interaction.guild.id;

        const platform = interaction.options.getString("platform");

        if(!platform) {
            return await interaction.reply({ content: "Please provide a valid platform.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // check if the platform exists in the database
            const existingPlatform = await executeQuery(`
                SELECT * FROM social_media WHERE guild_id = ? AND ${platform}_link IS NOT NULL
            `, [guildId]);

            if(existingPlatform.length === 0) {
                return await interaction.editReply({ content: `The ${platform} platform does not exist or is not set.`, flags: MessageFlags.Ephemeral });
            }

            // remove the platform from the database by setting its fields to NULL
            await executeQuery(`
                UPDATE social_media 
                SET ${platform}_link = NULL, ${platform}_prefix = NULL, ${platform}_emoji = NULL
                WHERE guild_id = ?
            `, [guildId]);

            // log the action
            await sendLogEmbed(
                guildId, 
                `Social Media Platform Removed\n\nA social media platform has been removed.\nPlatform: ${platform}\n**By:** ${interaction.user.tag}`,
                COLOUR_VALUES.REMOVE
            );

            // confirm to the user
            await interaction.editReply({ content: `The ${platform} platform has been removed.`, flags: MessageFlags.Ephemeral });

            // update the social media embed in the channel
            await this.updateEmbed(interaction);

        } catch (error) {
            console.error("Error removing social media platform:", error);
            return await interaction.editReply({ content: "There was an error removing the social media platform. Please try again later.", flags: MessageFlags.Ephemeral });
        }
    },

    async editPlatform(interaction) {

        const guildId = interaction.guild.id;

        const platform = interaction.options.getString("platform");
        const property = interaction.options.getString("property");
        const value = interaction.options.getString("value");

        if(!platform) {
            return await interaction.reply({ content: "Please provide a valid platform.", flags: MessageFlags.Ephemeral });
        }

        if(!property) {
            return await interaction.reply({ content: "Please provide a valid property to edit.", flags: MessageFlags.Ephemeral });
        }

        if(!value) {
            return await interaction.reply({ content: "Please provide a valid value.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ ephemeral: true });

        try {

            // check if the platform exists in the database
            const existingPlatform = await executeQuery(`
                SELECT * FROM social_media WHERE guild_id = ? AND ${platform}_link IS NOT NULL
            `, [guildId]);

            if(existingPlatform.length === 0) {
                return await interaction.editReply({ content: `The ${platform} platform does not exist or is not set.`, flags: MessageFlags.Ephemeral });
            }

            // determine the column to update based on the property
            let column;
            if(property === "url") {
                column = `${platform}_link`;
            } else if(property === "display_name") {
                column = `${platform}_prefix`;
            } else if(property === "emoji") {
                column = `${platform}_emoji`;
            } else {
                return await interaction.editReply({ content: "Invalid property. Please choose from URL, display name, or emoji.", flags: MessageFlags.Ephemeral });
            }

            // update the platform in the database
            await executeQuery(`
                UPDATE social_media
                SET ${column} = ?
                WHERE guild_id = ?
            `, [value, guildId]);

            // log the action
            await sendLogEmbed(
                guildId,
                `Social Media Platform Edited\n\nA social media platform has been edited.\nPlatform: ${platform}\nProperty: ${property}\nNew Value: ${value}\n**By:** ${interaction.user.tag}`,
                COLOUR_VALUES.EDIT
            );

            // confirm to the user
            await interaction.editReply({ content: `The ${platform} platform has been updated.`, flags: MessageFlags.Ephemeral });

            // update the social media embed in the channel
            await this.updateEmbed(interaction);
        } catch (error) {
            console.error("Error editing social media platform:", error);
            return await interaction.editReply({ content: "There was an error editing the social media platform. Please try again later.", flags: MessageFlags.Ephemeral });
        }
    },

    async createSocialMediaEmbed(interaction) {

        const socialMediaSettings = await executeQuery(`
            SELECT * FROM social_media_settings WHERE guild_id = ?
        `, [interaction.guild.id]);

        const embedTitle = socialMediaSettings[0].embed_title || "Social Media";

        let description = '**No Social Medias have been added yet!**\n\nUse `/socials add` to add a Platform.\nUse `/socials remove` to remove a Platform.\nUse `/socials edit` to edit a Social Media \nUse `/socials title` to change the Social Media title.\n\nYour Social Media display will update here as changes are made.';

        return new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(description)
            .setColor("#BA55D3");
    },

    async updateEmbed(interaction) {

        const guildId = interaction.guild.id;

        // fetch the channel from the database
        const socialMediaSettings = await executeQuery(`
            SELECT * FROM social_media_settings WHERE guild_id = ?
        `, [guildId]);

        const socialMediaData = await executeQuery(`
            SELECT * FROM social_media WHERE guild_id = ?
        `, [guildId]);

        const channelId = socialMediaSettings[0].channel_id;

        if(!channelId) {
            console.error("Social media channel is not set.");
            return;
        }
        
        const messageId = socialMediaSettings[0].message_id;

        if(!messageId) {
            console.error("Social media message ID is not set.");
            return;
        }

        const platforms = ['instagram', 'youtube', 'tiktok'];

        const embedTitle = socialMediaSettings[0].embed_title || "Social Media";

        // update the embed with the new social media information
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setColor("#BA55D3");

            let description = '';

            platforms.forEach(platform => {

                const link = socialMediaData[0][`${platform}_link`];
                const prefix = socialMediaData[0][`${platform}_prefix`];
                const emoji = socialMediaData[0][`${platform}_emoji`];

                if(link) {
                    description += `# ${emoji} [${prefix}](${link})\n`;
                }
            }); 

            embed.setDescription(description);
            
        // update the message in the channel
        const channel = await interaction.client.channels.fetch(channelId);

        if(!channel) {
            console.error("Could not find the social media channel.");
            return;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);

        if(!message) {
            console.error("Could not find the social media message.");
            return;
        }

        await message.edit({ embeds: [embed] });
    },

    async editTitle(interaction) {

        const guildId = interaction.guild.id;

        const title = interaction.options.getString("title");

        if(!title) {
            return await interaction.reply({ content: "Please provide a valid title.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // update the title in the database
            await executeQuery(`
                UPDATE social_media_settings
                SET embed_title = ?
                WHERE guild_id = ?
            `, [title, guildId]);

            // log the action
            await sendLogEmbed(
                guildId,
                `Social Media Embed Title Edited\n\nThe social media embed title has been changed to: ${title}\n**By:** ${interaction.user.tag}`,
                COLOUR_VALUES.EDIT
            );

            // confirm to the user
            await interaction.editReply({ content: `The social media embed title has been updated to: ${title}`, flags: MessageFlags.Ephemeral });

            // update the social media embed in the channel
            await this.updateEmbed(interaction);

        } catch (error) {
            console.error("Error editing social media embed title:", error);
            return await interaction.editReply({ content: "There was an error editing the social media embed title. Please try again later.", flags: MessageFlags.Ephemeral });
        }

    },

    development: false,
}