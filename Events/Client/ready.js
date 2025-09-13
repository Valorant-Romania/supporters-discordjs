const { Client, ActivityType, EmbedBuilder } = require("discord.js");
const botUtils = require('../../utility_modules/utility_methods.js');
const { config } = require('dotenv');
const fs = require("fs");
const path = require("path");

config();

function directoryCheck(dirPath) {
    fs.access(dirPath, fs.constants.F_OK, (err) => {
        if(err) { // in other words, if the directory doesn't exist
            fs.mkdir(dirPath, {recursive: true}, (err) => {
                if(err) {
                    console.error(err);
                }
            });
        }
    });
}

module.exports = {
    name: "ready",
    once: true,
    async execute(client) {
        // just a little greeting in our console
        const ascii = require('ascii-table');
        const table = new ascii().setHeading('Tables', 'Status');

        const {database_tables_setup} = require('../../utility_modules/set_database_tables.js');
        await database_tables_setup();

        // checking and creating the error dump directory if needed
        const errorDumpDir = path.join(__dirname, '../../error_dumps');
        directoryCheck(errorDumpDir);
        // creating a temporary files directory
        const tempDir = path.join(__dirname, '../../temp'); // temp directory will be used to archive data, dump it and quickly dispose of it
        // checking if the directory exists, if it doesn't then an error is thrown and the directory is created
        directoryCheck(tempDir);

        const backupDir = path.join(__dirname, '../../backup-db');
        directoryCheck(backupDir);


        // keep it on the last line as confirmation when ready event finishes execution
        console.log(
            `${client.user.username} is functional! - ${botUtils.formatDate(new Date())} | [${botUtils.formatTime(new Date())}]`
        );

        const errorFiles = fs.readdirSync("./error_dumps").map(file => file).filter((file) => file !== 'error.log');
        if(errorFiles.length > 0) {
            console.log(`FOUND ${errorFiles.length} ERROR FILES.`);
        }
    }
}
