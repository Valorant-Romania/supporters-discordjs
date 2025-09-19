const { EmbedBuilder } = require('discord.js');

/**
 * Logs an error to a specified Discord channel.
 * @param {Client} client The Discord client instance.
 * @param {Error} error The error object that was caught.
 * @param {Interaction} [interaction=null] The interaction that caused the error, if applicable.
 */
async function logError(client, error, interaction = null) {
    // Log the error to the console as a fallback
    console.error(`Encountered error:`, error);

    const logChannelId = process.env.ERROR_LOG_CHANNEL_ID;
    if (!logChannelId) {
    console.error("ERROR_LOG_CHANNEL_ID is not set in .env. Cannot log the error to Discord.");
        return;
    }

    try {
        const logChannel = await client.channels.fetch(logChannelId);
        if (!logChannel || !logChannel.isTextBased()) {
            console.error(`Error log channel with ID ${logChannelId} was not found or is not a text channel.`);
            return;
        }

        const errorEmbed = new EmbedBuilder()
            .setColor('Red')
            .setTimestamp()
            .setTitle('S-a produs o eroare');

        if (interaction) {
            // Error originated from a command
            errorEmbed.addFields(
                { name: 'Comanda', value: `\`/${interaction.commandName}\``, inline: true },
                { name: 'Utilizator', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                { name: 'Canal', value: `${interaction.channel.name} (\`${interaction.channel.id}\`)`, inline: true },
                { name: 'Mesaj eroare', value: `\`\`\`${error.message}\`\`\`` }
            );

            errorEmbed.setTitle('A aparut o exceptie negestionata');
            errorEmbed.addFields(
                { name: 'Tip eroare', value: `\`${error.name || 'N/A'}\`` },
                { name: 'Mesaj eroare', value: `\`\`\`${error.message}\`\`\`` }
            );
        }
        
        // The stack trace can be very long, so we put it in the description
        const stackTrace = error.stack || 'Nu exista un stack trace disponibil.';
        const description = `**Traseu stiva:**\n\`\`\`js\n${stackTrace.substring(0, 3900)}\n\`\`\``; 
        errorEmbed.setDescription(description);

        await logChannel.send({ embeds: [errorEmbed] });

    } catch (e) {
    console.error("CRITICAL: Failed to send error log to Discord channel.", e);
    console.error("Original error that could not be logged:", error);
    }
}

module.exports = { logError };
