const mysql = require("mysql2/promise");
const { config } = require("dotenv");
const ascii = require('ascii-table');
config();

// The pool connection to the database
const poolConnection = mysql.createPool({
	host: process.env.DBHOST,
	user: process.env.DBUSER,
	port: process.env.DBPORT,
	password: process.env.DBPASS,
	database: process.env.DBNAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
	supportBigNumbers: true,
	bigNumberStrings: true
});

async function executeQuery(query, params = []) {
	let connection;
	try {
		connection = await poolConnection.getConnection();
		const [rows] = await connection.execute(query, params);
		return rows;
	} catch (error) {
		console.error("Error executing query:", error);
		throw error; 
	} finally {
		if (connection) connection.release();
	}
}

async function database_tables_setup() {
	const table = new ascii().setHeading('Tables', 'Status');



	try {
		await executeQuery(`CREATE TABLE IF NOT EXISTS clansystem(
			id INT AUTO_INCREMENT PRIMARY KEY,
			guild BIGINT NOT NULL,
			role BIGINT NOT NULL UNIQUE,
			category BIGINT NOT NULL UNIQUE
		)`);
		table.addRow('clansystem', 'Ready');
		} catch (err) {
		console.error("Error creating clansystem table:", err);
		table.addRow('clansystem', 'Error');
	}


	try {
		await executeQuery(`CREATE TABLE IF NOT EXISTS clan(
			id INT AUTO_INCREMENT PRIMARY KEY,
			guild BIGINT NOT NULL,
			owner BIGINT NOT NULL,
			clanname TEXT NOT NULL,
			ownerrole BIGINT NOT NULL,
			clanrole BIGINT NOT NULL,
			voicechannel BIGINT,
			textchannel BIGINT
		)`);
		table.addRow('clan', 'Ready');
		} catch (err) {
		console.error("Error creating clan table:", err);
		table.addRow('clan', 'Error');
	}

console.log(table.toString(),'\nDatabase tables');
}


async function doesTableExists(tableName) {
	try {
		const rows = await executeQuery(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name = ?
		`, [tableName]);
		return rows.length > 0;
	} catch (error) {
		console.error("Error checking table existence:", error);
		return false;
	}
}

async function getClanSystem(guildId) {
	return executeQuery('SELECT * FROM clansystem WHERE guild = ?', [guildId]);
}

async function getClanByOwner(guildId, ownerId) {
	return executeQuery('SELECT * FROM clan WHERE guild = ? AND owner = ?', [guildId, ownerId]);
}

async function createClan(guildId, ownerId, clanName, ownerRoleId, clanRoleId, textChannelId, voiceChannelId) {
	return executeQuery(
		'INSERT INTO clan(guild, owner, clanname, ownerrole, clanrole, textchannel, voicechannel) VALUES(?, ?, ?, ?, ?, ?, ?)',
		[guildId, ownerId, clanName, ownerRoleId, clanRoleId, textChannelId ?? null, voiceChannelId ?? null]
	);
}

async function deleteClan(guildId, ownerId) {
	return executeQuery('DELETE FROM clan WHERE guild = ? AND owner = ?', [guildId, ownerId]);
}

async function updateClanName(guildId, ownerId, newName) {
	return executeQuery('UPDATE clan SET clanname = ? WHERE guild = ? AND owner = ?', [newName, guildId, ownerId]);
}

async function updateClanTextChannel(guildId, ownerId, channelId) {
	return executeQuery('UPDATE clan SET textchannel = ? WHERE guild = ? AND owner = ?', [channelId, guildId, ownerId]);
}

async function updateClanVoiceChannel(guildId, ownerId, channelId) {
	return executeQuery('UPDATE clan SET voicechannel = ? WHERE guild = ? AND owner = ?', [channelId, guildId, ownerId]);
}

async function updateClanOwner(guildId, oldOwnerId, newOwnerId) {
	return executeQuery('UPDATE clan SET owner = ? WHERE guild = ? AND owner = ?', [newOwnerId, guildId, oldOwnerId]);
}
async function createClanSystem(guildId, roleId, categoryId) {
	return executeQuery('INSERT INTO clansystem(guild, role, category) VALUES(?, ?, ?)', [guildId, roleId, categoryId]);
}

async function clearClanSystem(guildId) {
	return executeQuery('DELETE FROM clansystem WHERE guild = ?', [guildId]);
}

async function isClanSystemCategory(guildId, categoryId) {
	const rows = await executeQuery('SELECT 1 FROM clansystem WHERE guild = ? AND category = ? LIMIT 1', [guildId, categoryId]);
	return rows.length > 0;
}

async function deleteClanSystemByCategory(guildId, categoryId) {
	return executeQuery('DELETE FROM clansystem WHERE guild = ? AND category = ?', [guildId, categoryId]);
}

async function deleteClanSystemByRole(guildId, roleId) {
	return executeQuery('DELETE FROM clansystem WHERE guild = ? AND role = ?', [guildId, roleId]);
}

async function isClanChannel(guildId, channelId) {
	const rows = await executeQuery('SELECT 1 FROM clan WHERE guild = ? AND (textchannel = ? OR voicechannel = ?) LIMIT 1', [guildId, channelId, channelId]);
	return rows.length > 0;
}

async function clearClanChannelReferenceByType(guildId, channelId, type) {
	if (type !== 'textchannel' && type !== 'voicechannel') throw new Error('Invalid channel type');
	const sql = `UPDATE clan SET ${type} = NULL WHERE guild = ? AND ${type} = ?`;
	return executeQuery(sql, [guildId, channelId]);
}

async function deleteClansByRole(guildId, roleId) {
	return executeQuery('DELETE FROM clan WHERE guild = ? AND (clanrole = ? OR ownerrole = ?)', [guildId, roleId, roleId]);
}

async function getClanRoleByOwner(guildId, ownerId) {
	return executeQuery('SELECT clanrole FROM clan WHERE guild = ? AND owner = ?', [guildId, ownerId]);
}

async function getClansByClanRoleIds(guildId, roleIds) {
	if (!Array.isArray(roleIds) || !roleIds.length) return [];
	let connection;
	try {
		connection = await poolConnection.getConnection();
		const sql = 'SELECT clanname, clanrole FROM clan WHERE guild = ? AND clanrole IN (?)';
		const [rows] = await connection.query(sql, [guildId, roleIds]);
		return rows;
	} catch (error) {
		console.error("Error in getClansByClanRoleIds:", error);
		throw error; 
	} finally {
		if (connection) connection.release();
	}
}

async function getOwnerByClanName(guildId, clanName) {
	return executeQuery('SELECT owner FROM clan WHERE guild = ? AND clanname = ?', [guildId, clanName]);
}

async function countClans(guildId) {
	const rows = await executeQuery('SELECT COUNT(*) AS count FROM clan WHERE guild = ?', [guildId]);
	return rows[0]?.count ?? 0;
}

module.exports = {
	executeQuery,
	database_tables_setup,
	doesTableExists,
	getClanSystem,
	getClanByOwner,
	createClan,
	deleteClan,
	updateClanName,
	updateClanTextChannel,
	updateClanVoiceChannel,
	createClanSystem,
	clearClanSystem,
	isClanSystemCategory,
	deleteClanSystemByCategory,
	deleteClanSystemByRole,
	isClanChannel,
	clearClanChannelReferenceByType,
	deleteClansByRole,
	getClanRoleByOwner,
	getClansByClanRoleIds,
	getOwnerByClanName,
	countClans,
	updateClanOwner
};
