const { doesTableExists: checkTableExists } = require('./database.js');
const fs = require('fs');

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
    console.error("An array must be provided when calling botPermsCheck!");
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
    console.error("An array must be provided when calling memberPermsCheck!");
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
    return checkTableExists(tableName);
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
        { unit: 'an', plural: 'ani', value: 60 * 60 * 24 * 365 }, // 1 an in secunde
        { unit: 'saptamana', plural: 'saptamani', value: 60 * 60 * 24 * 7 },   // 1 saptamana in secunde
        { unit: 'zi', plural: 'zile', value: 60 * 60 * 24 },        // 1 zi in secunde
        { unit: 'ora', plural: 'ore', value: 60 * 60 },            // 1 ora in secunde
        { unit: 'minut', plural: 'minute', value: 60 },               // 1 minut in secunde
        { unit: 'secunda', plural: 'secunde', value: 1 },                // 1 secunda
    ];

    for (const { unit, plural, value } of units) {
        if (seconds >= value) {
            const result = seconds / value;
            const label = Math.abs(result - 1) < 0.0001 ? unit : plural;
            return `${result.toFixed(1)} ${label}`;
        }
    }

    return '0 secunde';
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
    // If a Date object is passed, convert to ms
    if (time instanceof Date) {
        time = time.getTime();
    }
    return Math.floor(time / 1000);
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
    handleFetchFile,
    isAlphanumeric
};
