const {
    SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
    TextInputBuilder, TextInputStyle, ModalBuilder,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits,
    ComponentType

} = require("discord.js");

const {poolConnection} = require("../../utility_modules/kayle-db.js");
const {main_menu, send_invite, clanObjBuilder, clanEmbedBuilder} = require("../../utility_modules/subcommands/clan_handler.js");

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName("clan")
        .setDescription("Comenzi legate de clan")
        .addSubcommand(subcommand =>
            subcommand.setName("menu")
                .setDescription("Deschide meniul clanului ca supporter")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("invite")
                .setDescription("Invită un alt membru în clanul tău")
                .addUserOption(option =>
                    option.setName("member")
                        .setDescription("Membrul care să fie invitat")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("kick")
                .setDescription("Scoate un membru din clan")
                .addUserOption(option =>
                    option.setName("member")
                        .setDescription("Membrul care să fie scos")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("leave")
                .setDescription("Ieși din unul dintre clanurile tale actuale")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("details")
                .setDescription("Informatii despre un clan")
                .addStringOption(option =>
                    option.setName("clan-name")
                        .setDescription("Numele clanului despre care vrei detalii.")
                        .setRequired(true)
                        .setMaxLength(100)
                        .setMinLength(1)
                )
        ),
    botPermissions: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks
    ],

    async execute(interaction, client) {
        const cmd = interaction.options.getSubcommand();
        const user = interaction.options.getUser("member") || null;
        let member = null;
        let isClanMember = false;

        const {rows: clanSystemData} = await poolConnection.query(`SELECT * FROM clansystem WHERE guild=$1`,
            [interaction.guild.id]
        );

        const {rows: clanData} = await poolConnection.query(`SELECT * FROM clan WHERE guild=$1 AND owner=$2`,
            [interaction.guild.id, interaction.user.id]
        );

        if(clanSystemData.length == 0) {
            // these commands require clan-admin set first
            return await interaction.reply({
                flags: MessageFlags.Ephemeral,
                content: "Nu poți folosi astfel de comenzi încă, un administrator trebuie să ruleze mai întâi comanda `/clan-admin` set!"
            });
        }

        // checking if the role and category are valid
        let supporterRole = null;
        let categoryChannel = null;
        try{
            supporterRole = await interaction.guild.roles.fetch(clanSystemData[0].role);
            categoryChannel = await interaction.guild.channels.fetch(clanSystemData[0].category);
        } catch(err) {
            return await interaction.reply({
                flags: MessageFlags.Ephemeral,
                content: "Rolul de susținător și/sau canalul categoriei sunt defecte sau nu mai există. Roagă un administrator să le configureze din nou!"
            });
        }

        if(cmd != "leave" && cmd != "details") {
            // checking perms for supporter specific commands
            if(!interaction.member.roles.cache.has(supporterRole.id)) {
                return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("Nu ai permisiunile necesare!")
                            .setDescription(`Aceste comenzi sunt doar pentru ${supporterRole}!`)
                    ]
                });
            }

            if(cmd != "menu") {
                // kick and invite can not be ran if the user does not own a clan yet

                if(clanData.length == 0) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("You don't own a clan! Nu ai un clan!")
                                .setDescription("These commands require you to own a clan.")
                        ]
                    });
                }

                // check if the user provided for kick/invite is a valid member of this server
                try{
                    member = await interaction.guild.members.fetch(user.id);
                } catch(err) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Invalid target")
                                .setDescription("The target must be a member of this server!")
                        ]
                    });
                }

                // no bots allowed
                if(member.user.bot) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not use such commands on bots!"
                    });
                }

                if(member.id === interaction.member.id) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not target yourself with such commands!"
                    });
                }

                // if the user is a valid member, check if the member is or isn't a member of the clan
                try{
                    isClanMember = member.roles.cache.has(clanData[0].clanrole)
                } catch(err) {};
            }
        }

        switch(cmd) {
            case "menu":
                await main_menu(interaction, interaction.member);
            break;
            case "invite":
                if(isClanMember) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not invite someone that is already in your clan!"
                    });
                }
                await send_invite(interaction, interaction.member, member);
            break;
            case "kick":
                if(!isClanMember) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not kick someone that is not in your clan!"
                    });
                }

                await member.roles.remove(clanData[0].clanrole);
                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: `You kicked ${member} out of your clan!`
                });

            break;
            case "leave":
                const leaveReply = await interaction.deferReply({flags: MessageFlags.Ephemeral});
                const leaveFetchedReply = await interaction.fetchReply();

                const roleIds = interaction.member.roles.cache.map(role => role.id);

                // fetching all rows that match member roles with clan roles
                // this is how the bot will know which roles are clan roles
                const {rows: matchingClansData} = await poolConnection.query(`SELECT clanname, clanrole FROM clan
                    WHERE guild=$1
                        AND clanrole = ANY($2::bigint[])`,
                    [interaction.guild.id, roleIds]    
                );

                if(matchingClansData.length == 0) {
                    return await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("You are not a clan member!")
                                .setDescription("You have no clan to leave from!")
                        ]
                    });
                }

                // preparing select menu options
                const selectOptions = [];

                for(const row of matchingClansData) {
                    selectOptions.push(
                        {
                            label: row.clanname,
                            value: `${row.clanrole}`,
                            description: `Leave from ${row.clanname}`
                        }
                    );
                }

                const selectClanMenu = new StringSelectMenuBuilder()
                    .setCustomId("select-clan")
                    .setPlaceholder("Select the clan you want to leave")
                    .setMinValues(1)
                    .setMaxValues(selectOptions.length)
                    .addOptions(selectOptions)

                const selectActionRow = new ActionRowBuilder()
                    .addComponents(selectClanMenu);

                await interaction.editReply({
                    components: [selectActionRow]
                });

                const selectCollector = leaveFetchedReply.createMessageComponentCollector({
                    ComponentType: ComponentType.StringSelect,
                    time: 120_000,
                    filter: (i) => i.user.id === interaction.user.id
                });

                selectCollector.on("collect", async (selectInteraction) => {
                    if(!selectInteraction.isStringSelectMenu) return;
                    for(const roleid of selectInteraction.values) {
                        try{
                            await interaction.member.roles.remove(roleid);
                        } catch(err) {};
                    }

                    await selectInteraction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You left the selected clans!"
                    });
                });

                selectCollector.on("end", async () => {
                    try{
                        await leaveReply.delete()
                    } catch(err) {};
                });
                
            break;
            case "details":
                const clanName = interaction.options.getString("clan-name");
                const {rows: clanData} = await poolConnection.query(`SELECT owner FROM clan WHERE guild=$1 AND clanname=$2`,
                    [interaction.guild.id, clanName]
                );

                if(clanData.length == 0) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Invalid clan name!")
                                .setDescription("The clan name provided does not exist!")
                        ]
                    });
                }

                let ownerMember = null;

                try{
                    ownerMember = await interaction.guild.members.fetch(clanData[0].owner);
                } catch(err) {
                    console.error(`Owner is no longer a member: ${clanData[0].owner}\n${err}`);
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Error, the clan owner is no longer a member of this server!"
                    });
                }

                const clanObj = await clanObjBuilder(interaction.guild, ownerMember);
                let embedClan = null;
                if(clanObj)
                    embedClan = clanEmbedBuilder(clanObj)
                else
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "There was something wrong with fetching the clan object..."
                    });

                await interaction.reply({
                    embeds: [
                        embedClan
                    ]
                });

            break;
        }

    }
}