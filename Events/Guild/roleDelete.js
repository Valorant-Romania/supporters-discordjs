const {poolConnection} = require('../../utility_modules/kayle-db.js');
const {EmbedBuilder} = require("discord.js");

// emits when a role is deleted


module.exports = {
    name: 'roleDelete',

    async execute(role) {
        // if supporter role is lost, shut down the system
        await poolConnection.query(`DELETE FROM clansystem WHERE guild=$1 AND role=$2`,
            [role.guild.id, role.id]
        );

        // if a clan or owner role is deleted, delete the whole clan (without clean up)
        await poolConnection.query(`DELETE FROM clan WHERE guild=$1 AND (clanrole=$2 OR ownerrole=$2)`,
            [role.guild.id, role.id]
        );
        
    }
}