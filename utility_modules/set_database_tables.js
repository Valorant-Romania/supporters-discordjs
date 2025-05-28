require('colors');
const {poolConnection} = require('./kayle-db.js');
const fs = require('graceful-fs');

const ascii = require('ascii-table');
const table = new ascii().setHeading('Tables', 'Status');

async function database_tables_setup() {
    // making sure that on ready event, the bot has its database tables ready.
    let table_nameListed = new Array(); // list of tables created through this command

    // will be used to compare to the expected tables from ./objects/database-default-tables.json

    // the following lines will be about opening and reading the JSON file mentioned above

    // upon object modifications, the bot will need to be restarted
    const dbTablesObject = JSON.parse(fs.readFileSync('./objects/database-default-tables.json'));
    let expectedTableNames = dbTablesObject["table_names"];
    let arrayOfTables = new Array(); 
    const existingTables = new Promise((resolve, reject) => {
        poolConnection.query(`SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema='public' 
            AND table_type = 'BASE TABLE'`,
            (err, result) => {
                if(err){
                    console.error(err);
                    reject(err);
                }
                else {
                    
                    arrayOfTables.push(result.rows.map(row => row.table_name));
                    resolve(result);
                }
                
            });
    });
    await existingTables;
    arrayOfTables = JSON.stringify(arrayOfTables.slice().sort());
    // checking if tables already exist

    // database tables will be defined
    // from here

    const clansystem = new Promise((resolve, reject) => {
        poolConnection.query(`CREATE TABLE IF NOT EXISTS clansystem(
            id SERIAL PRIMARY KEY,
            guild BIGINT NOT NULL,
            role BIGINT NOT NULL UNIQUE,
            category BIGINT NOT NULL UNIQUE
            )`, (err, result) => {
              if(err) {
                  console.error(err);
                  reject(err);
              }
              else {
                  table_nameListed.push("clansystem");
                  resolve(result);
              }
            }
        )
    });
    await clansystem;

    const clan = new Promise((resolve, reject) => {
        poolConnection.query(`CREATE TABLE IF NOT EXISTS clan(
            id SERIAL PRIMARY KEY,
            guild BIGINT NOT NULL,
            owner BIGINT NOT NULL,
            clanname TEXT NOT NULL,
            ownerrole BIGINT NOT NULL,
            clanrole BIGINT NOT NULL,
            voicechannel BIGINT,
            textchannel BIGINT
            )`, (err, result) => {
                if(err) {
                    console.error(err);
                    reject(err);
                } else {
                    table_nameListed.push("clan");
                    resolve(result);
                }
            });
    });
    await clan;

    //to here

    for(tableName of table_nameListed){
          table.addRow(tableName, 'Ready');
    }
    console.log(table.toString(), '\nDatabase tables');
}

module.exports = {
    database_tables_setup
}