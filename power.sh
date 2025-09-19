#!/bin/bash

# ==============================================================================
#          Valorant Romania Clan Bot - Start/Stop Management Script
# ==============================================================================
# This script serves as the central hub for controlling the bot.
# It's responsible for:
#   - Handling the initial setup and installing all the necessary dependencies.
#   - Starting the bot's process using pm2.
#   - Stopping the bot's process.
#   - Displaying live logs and the current status, which is crucial for debugging,
#     especially if the bot crashes immediately without logging the error.
# ==============================================================================

# --- Configuration ---
BOT_PROCESS_NAME="Valorant-Romania-clanbot" 

# --- Color Definitions ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color


initial_setup() {
    echo -e "${BLUE}--- Setting up the bot.... ---${NC}"

    # Check if setup has already been run to avoid re-running it
    if [ -f ".env" ] && [ -d "node_modules" ]; then
        echo -e "${GREEN}✅ Setup appears to be complete already. Skipping installation.${NC}"
        echo ""
        return
    fi


    echo -e "${YELLOW}Checking for Node.js and npm...${NC}"
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        echo -e "${RED}ERROR: Node.js and/or npm could not be found.${NC}"
        echo "Please install Node.js (v16.9.0 or higher) and try again."
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js and npm found.${NC}"


    echo -e "${YELLOW}Installing required Node.js packages...${NC}"
    cat << EOF > package.json
{
  "name": "SupportersBot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@discordjs/rest": "^1.0.1", "ascii-table": "^0.0.9", "discord.js": "^14.11.0",
    "dotenv": "^16.0.3", "graceful-fs": "^4.2.10", "mysql2": "^3.2.0", "winston": "^3.8.2"
  }
}
EOF
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: npm install failed. Please check for errors.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js packages installed.${NC}"

    # 3. Install PM2
    echo -e "${YELLOW}Checking for PM2...${NC}"
    if ! command -v pm2 &> /dev/null; then
        echo "PM2 not found. Installing it globally..."
        sudo npm install pm2 -g
        if [ $? -ne 0 ]; then
            echo -e "${RED}ERROR: Failed to install PM2 globally.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}✅ PM2 is installed.${NC}"

    # 4. Create .env file
    echo -e "${YELLOW}Creating .env configuration file...${NC}"
    cat << EOF > .env
# Discord Bot Settings
BOT_TOKEN=discord_bot_token_here
CLIENT_ID=YOUR_BOT_CLIENT_ID_HERE
HOME_SERVER_ID=YOUR_DISCORD_SERVER_ID_HERE
# Logging
ERROR_LOG_CHANNEL_ID=error_log_channel_id_here
CLAN_VIEWER_ROLE_IDS=role_id_1,role_id_2 

# MySQL Database Connection
DBHOST=localhost
DBUSER=your_mysql_username
DBPASS=database_password_here
DBPORT=3306
DBNAME=ClanDatabase
EOF
    echo -e "${GREEN}✅ .env file created. Please open it and fill in your details BEFORE proceeding!!!${NC}"
    echo ""

    # 5. MySQL Instructions
    echo -e "=============================================================================="
    echo -e "${YELLOW}             Setting up MySQL Database Manually              ${NC}"
    echo -e "=============================================================================="
    echo "Manual configuration for the bot's MySQL database is required. "
    echo "Please execute the following code to complete the setup:"
    echo ""
    echo -e "   ${GREEN}1. Log into MYSQL:${NC}  \`mysql -u root -p\`"
    echo -e "   ${GREEN}2. Create Database:${NC} \`CREATE DATABASE ClanDatabase;\`"
    echo -e "   ${GREEN}3. Create User:${NC}     \`CREATE USER 'your_mysql_username'@'localhost' IDENTIFIED BY 'your_mysql_password';\`"
    echo -e "   ${GREEN}4. Grant Permissions:${NC}\`GRANT ALL PRIVILEGES ON ClanDatabase.* TO 'your_mysql_username'@'localhost';\`"
    echo -e "   ${GREEN}5. Apply Changes:${NC}   \`FLUSH PRIVILEGES;\`"
    echo -e "   ${GREEN}6. Exit:${NC}            \`EXIT;\`"
    echo -e "=============================================================================="
    echo ""
}

# --- Function: Clear PM2 logs ---
clear_logs() {
    echo -e "${BLUE}--- Clearing PM2 logs... ---${NC}"
    # Try to clear logs for the specific process; fallback to flushing all PM2 logs
    if pm2 flush "$BOT_PROCESS_NAME" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Cleared logs for process: $BOT_PROCESS_NAME.${NC}"
    else
        pm2 flush > /dev/null 2>&1
        echo -e "${YELLOW}⚠️ Could not clear logs for '$BOT_PROCESS_NAME' specifically; flushed all PM2 logs instead.${NC}"
    fi
    echo ""
}

# --- Function: Start the bot with PM2 ---
start_bot() {
    echo -e "${BLUE}--- Starting the bot... ---${NC}"
    pm2 describe "$BOT_PROCESS_NAME" | grep -q "status.*online"
    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}Bot is already running.${NC}"
    else
        mkdir -p logs
        pm2 start index.js --name "$BOT_PROCESS_NAME" \
          --output "./logs/${BOT_PROCESS_NAME}-out.log" \
          --error "./logs/${BOT_PROCESS_NAME}-error.log"
          
        echo -e "${GREEN}✅ Bot has been started successfully.${NC}"
        echo "Logs are being saved to the 'logs' directory."
    fi
    echo ""
}
# --- Function: Restart the bot with PM2 ---
restart_bot() {
    echo -e "${BLUE}--- Restarting the bot... ---${NC}"
    pm2 describe "$BOT_PROCESS_NAME" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        clear_logs
        pm2 restart "$BOT_PROCESS_NAME"
        echo -e "${GREEN}✅ Bot has been restarted successfully.${NC}"
    else
        echo -e "${YELLOW}Bot is not running, starting it instead...${NC}"
        start_bot
    fi
    echo ""
}
# --- Function: Stop the bot with PM2 ---
stop_bot() {
    echo -e "${BLUE}--- Stopping the bot... ---${NC}"
    # Check if the process exists to be stopped
    pm2 describe $BOT_PROCESS_NAME > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        pm2 stop "$BOT_PROCESS_NAME"
        clear_logs
        echo -e "${GREEN}✅ Bot has been stopped successfully.${NC}"
    else
        echo -e "${YELLOW}Bot is not currently running.${NC}"
    fi
    echo ""
}

# --- Main Interactive Menu ---
echo -e "${GREEN}Stop/Start Menu${NC}"
echo "-------------------------------------------------"


if [ "$1" == "setup" ]; then
    initial_setup
fi

while true; do
    echo "Please choose an option:"
    echo "  1) Start Bot"
    echo "  2) Stop Bot"
    echo "  3) Restart Bot"
    echo "  4) Show Logs"
    echo "  5) Show Status"
    echo "  6) Run Initial Setup (if you haven't already)"
    echo "  7) Exit"
    read -p "Enter your choice [1-7]: " choice

    case $choice in
        1)
            start_bot
            ;;
        2)
            stop_bot
            ;;
        3)
            restart_bot
            ;;
        4)
            echo -e "${BLUE}--- Displaying live logs (Press CTRL+C to exit) ---${NC}"
            pm2 logs "$BOT_PROCESS_NAME"
            ;;
        5)
            echo -e "${BLUE}--- Bot Status ---${NC}"
            pm2 show "$BOT_PROCESS_NAME"
            ;;
        6)
            initial_setup
            ;;
        7)
            echo "Exiting."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option. Please try again.${NC}"
            echo ""
            ;;
    esac
done
