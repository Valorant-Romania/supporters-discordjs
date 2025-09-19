const { config } = require('dotenv');
const { Client, GatewayIntentBits, Routes, Partials, Collection, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { REST } = require('@discordjs/rest');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const ascii = require('ascii-table');
const { database_tables_setup, isClanSystemCategory, deleteClanSystemByCategory, isClanChannel, clearClanChannelReferenceByType, deleteClanSystemByRole, deleteClansByRole } = require('./database.js');
const { logError } = require('./error_handler.js');

config();

// Eroare Logger Setup
const error_logger = winston.createLogger({
	level: 'error',
	format: winston.format.combine(
	  winston.format.timestamp(),
	  winston.format.printf(({ timestamp, level, message, stack }) => {
		return `${timestamp} [${level}]: ${message}${stack ? `\n${stack}` : ''}`;
	  })
	),
	transports: [
	  new winston.transports.Console({
		format: winston.format.combine(
			winston.format.colorize(),
			winston.format.printf(({timestamp, level, message, stack}) => {
				return `${timestamp} [${level}]: ${message}${stack ? `\n${stack}` : ''}`;
			})
		),
	  }),
	],
});

const client = new Client({
	intents: [...Object.values(GatewayIntentBits)],
	partials: [...Object.values(Partials)]
});

client.cooldowns = new Collection();
client.commands = new Collection();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.HOME_SERVER_ID;

const rest = new REST({ version: '10' }).setToken(TOKEN);

const ensureDirectories = (...directories) => {
	directories.forEach(dir => fs.mkdirSync(path.join(__dirname, dir), { recursive: true }));
};

// Safer global error handlers (avoid TDZ by checking client.isReady inside try)
process.on('uncaughtException', (error) => {
	error_logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
	try {
		if (client && client.isReady()) {
			logError(client, error);
		}
	} catch (_) {}
	setTimeout(() => process.exit(1), 5000);
});

process.on('unhandledRejection', (reason) => {
	const error = reason instanceof Error ? reason : new Error(String(reason));
	error_logger.error(`Unhandled Rejection: ${error.message}`, { stack: error.stack });
	try {
		if (client && client.isReady()) {
			logError(client, error);
		}
	} catch (_) {}
});

// Load Commands
function loadCommands(client) {
	const table = new ascii().setHeading('Commands', 'Status');
	const commandsArray = [];
	if (!fs.existsSync('./Commands')) {
		console.warn('Commands directory missing. Skipping command load.');
		return;
	}
	const commandFiles = fs.readdirSync('./Commands').filter(file => file.endsWith('.js'));

	for (const file of commandFiles) {
		const command = require(`./Commands/${file}`);
		client.commands.set(command.data.name, command);
		commandsArray.push(command.data.toJSON());
		table.addRow(file, "loaded");
	}

	// Register commands per-guild via REST inside ready handler
	client.once('ready', async () => {
		try {
			console.log('Registering application commands for the guild...');
			await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
				body: commandsArray,
			});
			console.log('Guild commands registered.');
		} catch (e) {
			console.error('Failed to register guild commands:', e);
		}
	});

	console.log(table.toString(), "\nCommands loaded");
}

async function main() {
	try {
		// Inline merged events: ready, channelDelete, roleDelete

		client.once('ready', async () => {
			try {
				await database_tables_setup();

				ensureDirectories('temp', 'backup-db', 'error_dumps');

				const now = new Date();
				const dateString = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
				const timeString = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
				console.log(
					`${client.user.username} is online! - ${dateString} | [${timeString}]`
				);
			} catch (err) {
				console.error('Error during ready handler:', err);
			}
		});

		client.on('channelDelete', async (channel) => {
			try {
				if (!channel.guildId || !channel.id) return;

				const categoryExists = await isClanSystemCategory(channel.guild.id, channel.id);
				if (categoryExists) {
					await deleteClanSystemByCategory(channel.guild.id, channel.id);
					return;
				}

				const clanChan = await isClanChannel(channel.guild.id, channel.id);
				if (clanChan) {
					let type = '';
					if (channel.type == ChannelType.GuildVoice) type = 'voicechannel';
					else type = 'textchannel';

					await clearClanChannelReferenceByType(channel.guild.id, channel.id, type);
				}
			} catch (err) {
				console.error('Error handling channelDelete event:', err);
			}
		});

		client.on('roleDelete', async (role) => {
			try {
				await deleteClanSystemByRole(role.guild.id, role.id);
				await deleteClansByRole(role.guild.id, role.id);
			} catch (err) {
				console.error('Error handling roleDelete event:', err);
			}
		});

		client.on('interactionCreate', async (interaction) => {
			if (!interaction.isChatInputCommand()) return;

			const command = client.commands.get(interaction.commandName);
			if (!command) {
				await interaction.reply({ content: 'Aceasta comanda nu exista.', flags: MessageFlags.Ephemeral });
				return;
			}

			try {
				// --- Permission and cooldown checks ---
				const botMember = await interaction.guild.members.fetchMe();
				if (interaction.guild === null) {
					await interaction.reply({ content: 'Comenzile private nu sunt disponibile inca!', flags: MessageFlags.Ephemeral });
					return;
				}

				if (command.ownerOnly === true && interaction.user.id !== process.env.OWNER) {
					const rEmbed = new EmbedBuilder()
						.setColor('Red')
						.setTitle('Eroare')
						.setDescription('Aceasta comanda necesita privilegii de Master.');
					await interaction.reply({ embeds: [rEmbed], flags: MessageFlags.Ephemeral });
					return;
				}

				if (command.userPermissions?.length) {
					for (const permission of command.userPermissions) {
						if (interaction.member.permissions.has(permission)) continue;
						const rEmbed = new EmbedBuilder()
							.setColor('Red')
							.setTitle('Eroare')
							.setDescription(`Nu ai suficiente permisiuni!`);
						await interaction.reply({ embeds: [rEmbed], flags: MessageFlags.Ephemeral });
						return;
					}
				}

				if (command.botPermissions?.length) {
					for (const permission of command.botPermissions) {
						if (botMember.permissions.has(permission)) continue;
						const rEmbed = new EmbedBuilder()
							.setColor('Red')
							.setTitle('Eroare')
							.setDescription(`Nu am permisiunile necesare pentru asta!`);
						await interaction.reply({ embeds: [rEmbed], flags: MessageFlags.Ephemeral });
						return;
					}
				}

				if (command.testOnly && interaction.guild.id !== process.env.HOME_SERVER_ID) {
					const rEmbed = new EmbedBuilder()
						.setColor('Red')
						.setTitle('Eroare')
						.setDescription('Aceasta comanda nu poate fi rulata in afara serverului de test!');
					await interaction.reply({ embeds: [rEmbed], flags: MessageFlags.Ephemeral });
					return;
				}

				const { cooldowns } = interaction.client;
				if (!cooldowns.has(command.data.name)) cooldowns.set(command.data.name, new Collection());
				const now = Date.now();
				const timestamps = cooldowns.get(command.data.name);
				const defaultCooldownDuration = 0;
				const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;
				if (timestamps.has(interaction.user.id)) {
					const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
					if (now < expirationTime) {
						const expiredTimestamp = Math.round(expirationTime / 1000);
						await interaction.reply({ content: `Please wait, you are on a cooldown for \`${command.data.name}\`. O poti folosi din nou <t:${expiredTimestamp}:R>.`, flags: MessageFlags.Ephemeral });
						return;
					}
				}
				timestamps.set(interaction.user.id, now);
				setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
				// --- End of checks ---

				await command.execute(interaction, client);

			} catch (error) {
				await logError(client, error, interaction);

				const errorMessage = {
					content: 'A aparut o eroare la executia acestei comenzi. Dezvoltatorii au fost notificati.',
					flags: MessageFlags.Ephemeral
				};

				if (interaction.replied || interaction.deferred) {
					await interaction.followUp(errorMessage);
				} else {
					await interaction.reply(errorMessage);
				}
			}
		});

		await client.login(TOKEN);
		loadCommands(client);

	} catch (err) {
		console.log(err);
	}
}

main();

module.exports = { client };
