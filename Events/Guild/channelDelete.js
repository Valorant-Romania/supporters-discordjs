// handling the event of a channel being deleted
const {poolConnection} = require('../../utility_modules/kayle-db.js');
const {ChannelType} = require('discord.js');


module.exports = {
    name: 'channelDelete',

    async execute(channel) {
        if(!channel.guildId) return;
        if(!channel.id) return;

        // if someone deletes a channel that is either a clan channel or part of the clan system, it is critical to update the database

        // checking if the channel is the category channel
        const {rows: categoryBool} = await poolConnection.query(`SELECT EXISTS
            (SELECT 1 FROM clansystem WHERE category=$1 AND guild=$2)`,
            [channel.id, channel.guild.id]
        );

        if(categoryBool[0].exists) {
            // the system can not work without the category, therefore it will be shut down
            await poolConnection.query(`DELETE FROM clansystem WHERE guild=$1 AND category=$2`,
                [channel.guild.id, channel.id]
            );

            return; // no need to check anything else
        }

        // checking if the channel is a clan channel
        const {rows: clanChannelBool} = await poolConnection.query(`SELECT EXISTS
            (SELECT 1 FROM clan WHERE guild=$1 AND (textchannel=$2 OR voicechannel=$2))`,
            [channel.guild.id, channel.id]
        );

        if(clanChannelBool[0].exists) {
            let type = ""
            if(channel.type == ChannelType.GuildVoice)
                type = "voicechannel"
            else
                type = "textchannel"

            await poolConnection.query(`UPDATE clan SET ${type}=$1 WHERE guild=$2 AND ${type}=$3`,
                [null, channel.guild.id, channel.id]
            ); // setting channel type (either voice or text) to null
        }



    }
};