import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { sendScrimEmbed } from "../Utils/scrimScheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Map();
    }

    async loadCommands() {
        const commandFiles = fs.readdirSync(path.join(__dirname))
            .filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const commandPath = path.join(__dirname, file);
            const command = await import(`file://${commandPath}`);

            if (command.default && command.default.data) {
                this.commands.set(command.default.data.name, command.default);
            } else {
                console.warn(`Skipping ${file}, missing data or name`);
            }
        }

        // 🔥 Manually register the scrim-related commands
        this.commands.set("sendscrimembed", { execute: sendScrimEmbed });
    }

    async handleInteraction(interaction) {
        
        if (!interaction.isCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) {
            console.warn(`Command not found: ${interaction.commandName}`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
        }
    }
}

export default CommandHandler;