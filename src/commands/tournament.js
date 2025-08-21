import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import path from 'path';
import { fileURLToPath } from "url";

export default {
    data: new SlashCommandBuilder()
        .setName("tournament")
        .setDescription("Manage tournament information and settings.")
        // Set roles for each team
        .addSubcommand(subcommand =>
            subcommand
                .setName("information")
                .setDescription("Send the information Embed.")
        ),

        async execute(interaction) {

            // Check if the interaction is in a guild
            if (!interaction.guild) {
                return interaction.reply({ content: "This command can only be used in a server!", ephemeral: true });
            }

            // Check if the user has the required permissions
            if (!interaction.member.permissions.has("ManageGuild")) {
                return interaction.reply({ content: "You need **Manage Server** permission to use this command!", ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();

            // handle subcommands
            if(subcommand === "information") {
                await this.sendInformation(interaction);
            }
        },

        async sendInformation(interaction) {

            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);

            const imagePath = path.join(__dirname, '..', '..', 'src', 'assets', 'tournament', '6pm_blue.png');
            const thumbPath = path.join(__dirname, '..', '..', 'src', 'assets', 'tournament', 'point_system.png');
            const informationPath = path.join(__dirname, '..', '..', 'src', 'assets', 'tournament', 'tournament_informations.png');

            const imageAttachment = new AttachmentBuilder(imagePath);
            const thumbnailAttachment = new AttachmentBuilder(thumbPath);

            // generate general embed
            const generalInfoEmbed = await this.generalEmbed();

            // generate roster application embed
            const rosterApplicationInfoEmbed = await this.rosterApplicationEmbed();

            // generate prize pool embed
            const prizePoolInfoEmbed = await this.prizepoolEmbed();

            // generate VIP embed
            const vipInfoEmbed = await this.vipEmbed();

            // send embeds
            await interaction.reply({
                embeds: [generalInfoEmbed, rosterApplicationInfoEmbed, prizePoolInfoEmbed, vipInfoEmbed],
                files: [imageAttachment, thumbnailAttachment, informationPath],
            });

            // send all embeds

            return interaction.followUp({ content: "Tournament information has been sent!", ephemeral: true });
        },

        async generalEmbed() {

            let description = "## GENERAL\n> <:FloraPurpleArrow:1306819764387053691> *Server: EU\n> <:FloraPurpleArrow:1306819764387053691> Mode: TPP Squad\n> <:FloraPurpleArrow:1306819764387053691> 126 Teams\n> <:FloraPurpleArrow:1306819764387053691> 1.1x Zone \n> <:FloraPurpleArrow:1306819764387053691> 2x Loot\n> <:FloraPurpleArrow:1306819764387053691> No sound visualisation*";

            const embed = new EmbedBuilder()
                .setColor("#9d00ff")
                .setThumbnail('attachment://6pm_blue.png')
                .setImage('attachment://point_system.png')
                .setTitle("GOLDEN SUMMER x 6PM ESPORTS")
                .setDescription(description);

            return embed;
        },

        async rosterApplicationEmbed() {

            let description = "## ROSTER APPLICATION\n25.08, 12:00CEST\nin <#1405509095493996615>\n> <:FloraPurpleArrow:1306819764387053691> 3 Players need to be tagged!\n```Format:\nTeam Name:\nTeam Tag:\nTeam Manager: @manager\n\nP1: IGN | ID | @discord tag\nP2: IGN | ID | @discord tag\nP3: IGN | ID | @discord tag\nP4: IGN | ID\nP5: IGN | ID\nP6: IGN | ID\n\n+LOGO PNG```\n\n## REGISTRATION\nEach game day at 12:00CEST\nin <#1405508747089940580> ```Format:\n %register\nTeam Name\nTeam Tag\n@Team Manager```\n> <:FloraPurpleArrow:1306819764387053691> First 16 Teams will receive slot\n> <:FloraPurpleArrow:1306819764387053691> Waitlist will open at 18:30CEST\nTeams are permitted to play more than one group stage, as long as they didn't qualify to a further stage yet.\n\n## CONFIRMATION\n13:00 – 18:00CEST\nin slot-channel\n> <:FloraPurpleArrow:1306819764387053691> If you fail to confirm until 18:00CEST, your slot will be removed";

            const embed = new EmbedBuilder()
                .setColor("#9d00ff")
                .setTitle("Roster Application")
                .setDescription(description)
                .setImage('attachment://tournament_informations.png');

                return embed;
        },

        async prizepoolEmbed() {

            let description = "## PRIZE POOL\nCashprize: 150€\nAdditional: 7 x 325 UC \n\n> <a:6pmfirst:1408180821071892561> 50€\n> <a:6pmsecond:1408180862796824587> 30€\n> <a:6pmthird:1408180952223580282> 20€\n> \n> *10€ for each map-winner in finals!*\n> *325 UC for overall MVP in each qualifier!*\n\n*Any and all cashprizes will be payed out __via PayPal only__ to the manager within two weeks of winning!*\n-# *Any prizes will cease to exist if you don't claim them within two weeks of winning. This includes cases like not providing us with a valid PayPal-Account, not contacting us, and other errors from the clients side. Errors from the organisers are excluded.*";

            const embed = new EmbedBuilder()
                .setColor("#9d00ff")
                .setTitle("Prize Pool")
                .setDescription(description);

            return embed;
        },

        async vipEmbed() {

            let description = "## VIP-SLOTS\nGet a secured slot! No roster needed!\n\n> Groupstage: 1.5€\n> Quarterfinal: 3€\n> Semifinal: 6€\n> Final: 9€\n\n*Open ticket in https://discord.com/channels/1248582433104724020/1248596212979077191 if you are interested!*\n-# *Payment will only be taken via PayPal!*";

            const embed = new EmbedBuilder()
                .setColor("#9d00ff")
                .setTitle("VIP Slots")
                .setDescription(description)
                .setFooter({ text: "by Festina x 6pm Esports" });

            return embed;
        },

    development: false
}