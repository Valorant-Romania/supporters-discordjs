const Sentry = require('@sentry/node');

/**
 * Logs an error to Sentry.
 * @param {Client} client The Discord client instance.
 * @param {Error} error The error object that was caught.
 * @param {Interaction} [interaction=null] The interaction that caused the error, if applicable.
 */
async function logError(client, error, interaction = null) {
    Sentry.withScope(scope => {
        if (interaction) {
            scope.setUser({
                id: interaction.user.id,
                username: interaction.user.tag,
            });
            scope.setTag("command", interaction.commandName);
            scope.setContext("Interaction", {
                commandName: interaction.commandName,
                channelId: interaction.channel.id,
                guildId: interaction.guild.id,
            });
        }
        Sentry.captureException(error);
    });

    console.error(`Encountered error:`, error);
}

module.exports = { logError };
