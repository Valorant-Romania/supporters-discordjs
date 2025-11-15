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

/**
 * Checks if the bot can manage a role for a target member.
 * Returns an object with success status and error message if applicable.
 * @param {GuildMember} botMember - The bot's guild member object
 * @param {GuildMember} targetMember - The member to check against
 * @param {Role} role - The role to be added/removed
 * @returns {{canManage: boolean, reason: string|null}}
 */
function canBotManageRole(botMember, targetMember, role) {
    // Check if bot's highest role is higher than the target member's highest role
    const botHighestRole = botMember.roles.highest;
    const targetHighestRole = targetMember.roles.highest;
    
    // Check if bot's highest role is higher than the role to be managed
    if (botHighestRole.position <= role.position) {
        return {
            canManage: false,
            reason: 'BOT_ROLE_TOO_LOW_FOR_ROLE'
        };
    }
    
    // Check if bot can manage the target member
    if (botHighestRole.position <= targetHighestRole.position) {
        return {
            canManage: false,
            reason: 'TARGET_ROLE_TOO_HIGH'
        };
    }
    
    return { canManage: true, reason: null };
}

/**
 * Safely adds a role to a member with proper error handling for hierarchy issues.
 * @param {GuildMember} member - The member to add the role to
 * @param {Role} role - The role to add
 * @param {GuildMember} botMember - The bot's guild member object
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function safeRoleAdd(member, role, botMember) {
    try {
        const check = canBotManageRole(botMember, member, role);
        if (!check.canManage) {
            return {
                success: false,
                error: check.reason
            };
        }
        
        await member.roles.add(role);
        return { success: true, error: null };
    } catch (err) {
        console.error(`Failed to add role ${role.id} to member ${member.id}:`, err);
        
        // Check for specific Discord API errors
        if (err.code === 50013) {
            return {
                success: false,
                error: 'MISSING_PERMISSIONS'
            };
        }
        
        return {
            success: false,
            error: 'UNKNOWN_ERROR'
        };
    }
}

/**
 * Safely removes a role from a member with proper error handling for hierarchy issues.
 * @param {GuildMember} member - The member to remove the role from
 * @param {Role|string} role - The role or role ID to remove
 * @param {GuildMember} botMember - The bot's guild member object
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function safeRoleRemove(member, role, botMember) {
    try {
        // If role is a string (ID), fetch the role object
        let roleObj = role;
        if (typeof role === 'string') {
            roleObj = await member.guild.roles.fetch(role);
            if (!roleObj) {
                return {
                    success: false,
                    error: 'ROLE_NOT_FOUND'
                };
            }
        }
        
        const check = canBotManageRole(botMember, member, roleObj);
        if (!check.canManage) {
            return {
                success: false,
                error: check.reason
            };
        }
        
        await member.roles.remove(role);
        return { success: true, error: null };
    } catch (err) {
        console.error(`Failed to remove role ${role} from member ${member.id}:`, err);
        
        // Check for specific Discord API errors
        if (err.code === 50013) {
            return {
                success: false,
                error: 'MISSING_PERMISSIONS'
            };
        }
        
        return {
            success: false,
            error: 'UNKNOWN_ERROR'
        };
    }
}

/**
 * Gets a user-friendly error message for role hierarchy issues.
 * @param {string} errorCode - The error code from safe role operations
 * @param {GuildMember} member - The member involved in the operation
 * @returns {string} User-friendly error message in Romanian
 */
function getRoleHierarchyErrorMessage(errorCode, member) {
    switch (errorCode) {
        case 'TARGET_ROLE_TOO_HIGH':
            return `<:wrong:1418383815696449680> Nu pot gestiona rolul pentru ${member} deoarece rolul lor este mai sus decât rolul meu în ierarhia serverului. Te rog cere unui administrator să mute rolul meu mai sus în ierarhie.`;
        case 'BOT_ROLE_TOO_LOW_FOR_ROLE':
            return `<:wrong:1418383815696449680> Nu pot gestiona acest rol deoarece rolul meu este prea jos în ierarhia serverului. Te rog cere unui administrator să mute rolul meu mai sus în ierarhie.`;
        case 'MISSING_PERMISSIONS':
            return `<:wrong:1418383815696449680> Nu am permisiunile necesare pentru a gestiona acest rol. Te rog verifică permisiunile mele.`;
        case 'ROLE_NOT_FOUND':
            return `<:wrong:1418383815696449680> Rolul nu a fost găsit.`;
        default:
            return `<:wrong:1418383815696449680> A apărut o eroare neașteptată la gestionarea rolului.`;
    }
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
    isAlphanumeric,
    canBotManageRole,
    safeRoleAdd,
    safeRoleRemove,
    getRoleHierarchyErrorMessage
};
