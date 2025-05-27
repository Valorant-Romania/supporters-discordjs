/*
    Just methods to help me write less or prettier code.
*/

const {executeQuery} = require('./kayle-db.js');

// This function takes a hexadecimal number and converts it to a string to the corresponding format
// Might be bad practice, but it's used to translate color hexcodes between embeds and database
// since colore codes in database are declared as strings (varchar) and in this code as numbers.
function hexToString(num){
    let str = '0x' + num.toString(16).padStart(6,'0');
    return str;
}

// Rather than chaining all of these methods, I chose to use one that returns the result
function getBotMember(client, interaction) {
    return interaction.guild.members.cache.get(client.user.id);
}

// I thought of it as being easier to understand when checking for permissions
function getPermsInChannel(channel, member){
    return channel.permissionsFor(member);
}

// The method above checks the perms in the same channel as where the interaction was sent, 
// the method below can check perms in any channel, useful when you send the command in one channel and it requires
// the bot to do something in another channel.
function botPermsCheckInChannel(client, channel, permsToCheck) {
    if (!Array.isArray(permsToCheck)) {
        console.error("An array must be given when botPermsCheck is called!");
        return -1;
    }
    const permsInChannel = getPermsInChannel(channel, channel.guild.members.cache.get(client.user.id));
    if (permsInChannel.has(permsToCheck)) {
        return 1;
    } else {
        return 0;
    }
}

function memberPermsCheckInChannel(interaction, channel, permsToCheck) {
    if (!Array.isArray(permsToCheck)) {
        console.error("An array must be given when memberPermsCheck is called!");
        return -1;
    }
    const {member} = interaction;
    const permsInChannel = getPermsInChannel(channel, member);
    if (permsInChannel.has(permsToCheck)) {
        return 1;
    } else {
        return 0;
    }
}

// Some commands require specific tables to exist in the database, the method below is used to check for that.
async function doesTableExists(tableName) {
    try {
        const rows = await executeQuery(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema='public' AND table_type = 'BASE TABLE'
        `);

        const existingTableNames = rows.map(row => row.table_name);
        
        return existingTableNames.includes(tableName);
    } catch (error) {
        console.error("Error checking table existence:", error);
        return false;
    }
    
}

// Fetches the json data. Used for attachment options.
async function handleFetchFile(attachment) {
    const response = await fetch(attachment.url);
    const data = await response.json();
    return data;
}

function isAlphanumeric(str) { // check if a string is alphanumeric
    const regex = /^[a-zA-Z0-9]+$/;
    return regex.test(str);
}

function formatDate(date) {
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatTime(date) {
    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

//returns if the file exists or not
async function isFileOk(path) {
    let fileExists = true;

    try{
        await fs.promises.access(path, fs.constants.R_OK);
    } catch(err) {
        fileExists = false;

    }

    return fileExists
}

// takes durationString as input something like 3d, matches the value and the time unit, converts the time unit to seconds and then returns
// the timestamp of when the key will expire.
// Example: 3d will be converted to the current timestamp + 3 * 864000.
const durationRegex = /^(\d+)([m,h,d,w,y])$/;
function duration_timestamp(durationString) {
    const match = durationString.match(durationRegex);
    if(match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const Unit = {
            "m": 60,
            "h": 3600,
            "d": 86400,
            "w": 604800,
            "y": 31556926
        }
        return parseInt(Date.now() / 1000) + value * Unit[unit]; // for some reason, timestamps are in milliseconds, but discord interprets as seconds
        // hence why Date.now() is divided by 1000
    } else {
        return null;
    }
}

function convert_seconds_to_units(seconds) {
    const units = [
        { unit: 'year', value: 60 * 60 * 24 * 365 }, // 1 year in seconds
        { unit: 'week', value: 60 * 60 * 24 * 7 },   // 1 week in seconds
        { unit: 'day', value: 60 * 60 * 24 },        // 1 day in seconds
        { unit: 'hour', value: 60 * 60 },            // 1 hour in seconds
        { unit: 'minute', value: 60 },               // 1 minute in seconds
        { unit: 'second', value: 1 },                // 1 second
    ];

    for(const {unit, value} of units) {
        if(seconds >= value) {
            const result = seconds / value;
            return `${result.toFixed(1)} ${unit}${result !== 1 ? 's' : ''}`;
        }
    }

    return '0 seconds';
}

function hasCooldown(userId, cooldowns, cd) {
    // returns true if the user has a cooldown, false otherwise
    const now = Date.now();
    if(cooldowns.has(userId)) {
        const expires = cooldowns.get(userId) + cd;
        if(now < expires)
            return expires
    }
    return false;
}

function timestamp_seconds(time = null) {
    if(time == null) time = Date.now();

    return parseInt(Date.now() / 1000);
}


module.exports = {
    timestamp_seconds,
    hasCooldown,
    convert_seconds_to_units,
    duration_timestamp,
    isFileOk,
    getBotMember,
    getPermsInChannel,
    botPermsCheckInChannel,
    memberPermsCheckInChannel,
    doesTableExists,
    hexToString,
    handleFetchFile,
    isAlphanumeric,
    formatDate,
    formatTime
};