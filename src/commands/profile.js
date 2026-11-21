import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { safeReply } from "../utils/interactionReply.js";
import { getProfile, getProfileStats, buildProfileEmbed } from "../utils/playerProfiles.js";
import { canViewOthers, editableFields, editButtonRow, renderEditor } from "../utils/profileEditor.js";

// /profile                     -> your own profile
// /profile player:@x           -> someone else's (admins and roster players only)
// /profile edit:True           -> open the editor (admins: any profile, all fields;
//                                 players: their own profile, name only)
export default {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription("View a player profile (yours by default)")
        .addUserOption(option =>
            option.setName("player")
                .setDescription("The player whose profile you want to see")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("edit")
                .setDescription("Open the profile editor (admins: any profile; players: your own name)")
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server!", flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guild.id;
        const viewer = interaction.user;
        const target = interaction.options.getUser("player") || viewer;
        const wantsEdit = interaction.options.getBoolean("edit") === true;
        const isSelf = target.id === viewer.id;

        try {
            if (!isSelf && !(await canViewOthers(guildId, interaction.member, viewer.id))) {
                return interaction.reply({
                    content: "Only admins and players on the roster can view other players' profiles.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const profile = await getProfile(guildId, target.id);
            if (!profile) {
                return interaction.reply({
                    content: `${isSelf ? "You don't" : `<@${target.id}> doesn't`} have a player profile yet. Profiles are created when a player is added with \`/roster add\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const fields = editableFields(interaction.member, viewer.id, target.id);

            if (wantsEdit) {
                if (fields.length === 0) {
                    return interaction.reply({
                        content: "Only admins can edit other players' profiles. You can edit your own name with `/profile edit:True`.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                return interaction.editReply(await renderEditor(interaction.guild, interaction.member, viewer.id, target.id));
            }

            await interaction.deferReply();
            const stats = await getProfileStats(guildId, target.id);
            await interaction.editReply({
                embeds: [buildProfileEmbed(profile, stats, target)],
                components: fields.length ? [editButtonRow(target.id)] : [],
            });
        } catch (error) {
            console.error(`Error showing profile for ${target.id} in guild ${guildId}:`, error);
            await safeReply(interaction, "An error occurred while loading this profile.");
        }
    },

    development: false,
};
