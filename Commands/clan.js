const {
    SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits,
    ComponentType,
    ChannelType,
    ButtonBuilder,
    ButtonStyle

} = require("discord.js");

const {
    getClanSystem,
    getClanByOwner,
    getClanRoleByOwner,
    getClansByClanRoleIds,
    getOwnerByClanName,
    updateClanTextChannel,
    updateClanVoiceChannel
} = require("../database.js");
const { main_menu, send_invite, clanObjBuilder, clanEmbedBuilder, buildStaffPermissionSets } = require("../clan_handler.js");

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName("clan")
        .setDescription("Comenzi legate de clan")
        .addSubcommand(subcommand =>
            subcommand.setName("menu")
                .setDescription("Deschide meniul clanului ca sustinator")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("invite")
                .setDescription("Invita un alt membru in clanul tau")
                .addUserOption(option =>
                    option.setName("member")
                        .setDescription("Membrul care sa fie invitat")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("kick")
                .setDescription("Scoate un membru din clan")
                .addUserOption(option =>
                    option.setName("member")
                        .setDescription("Membrul care sa fie scos")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("leave")
                .setDescription("Iesi din unul dintre clanurile tale actuale")
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
        )
        .addSubcommand(subcommand =>
            subcommand.setName("channel")
                .setDescription("Re-creeaza canalele clanului tau, daca au fost sterse.")
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

        const clanSystemData = await getClanSystem(interaction.guild.id);

        const clanData = await getClanByOwner(interaction.guild.id, interaction.user.id);

        if (clanSystemData.length == 0) {
            // these commands require clan-admin set first
            return await interaction.reply({
                flags: MessageFlags.Ephemeral,
                content: "Nu poti folosi astfel de comenzi inca, un administrator trebuie sa ruleze mai intai comanda `/clan-admin` set!"
            });
        }

        // checking if the role and category are valid
        let supporterRole = null;
        let categoryChannel = null;
        try {
            supporterRole = await interaction.guild.roles.fetch(clanSystemData[0].role);
            categoryChannel = await interaction.guild.channels.fetch(clanSystemData[0].category);
        } catch (err) {
            console.error("DEBUG: Could not fetch clan system data.", err); 
            return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Rolul de sustinator si/sau canalul categoriei sunt defecte sau nu mai exista. Roaga un administrator sa le configureze din nou!"
        });
        }

        if (cmd != "leave" && cmd != "details" && cmd != "channel") {
            // checking perms for supporter specific commands
            if (!interaction.member.roles.cache.has(supporterRole.id)) {
                const kofiButton = new ButtonBuilder()
                    .setLabel("Aboneaza-te")
                    .setURL("https://ko-fi.com/valorantromaniaofficial")
                    .setStyle(ButtonStyle.Link);

                const row = new ActionRowBuilder()
                    .addComponents(kofiButton);

                return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("Accesul la bot este un beneficiu exclusiv pentru supporter noștri.")
                            .setDescription(`Pentru a obține rolul de ${supporterRole}, tot ce trebuie să faci este să te abonezi la oricare dintre planurile noastre de pe pagina noastră Ko-fi.`)
                            .addFields(
                                {
                                    name: "Beneficii Exclusive",
                                    value: `• Rolul ${supporterRole}\n• Permisiunea de a posta imagini și GIF-uri în chat\n• Posibilitatea de a-ți schimba nickname-ul\n• Acces la utilizarea soundboard-ului în canalele vocale\n• Permisiunea de a folosi emoji-uri și stickere externe\n• Posibilitatea de a crea sondaje în chat\n• Permisiuni vocale pentru a da mute, deafen și a muta membri\n• Un loc special în lista de membri, chiar sub Creatori de Conținut\n• Un bonus de 10% la XP\n• Un canal privat și personalizat\n• Un rol personalizat cu propriul său ico\n• Reduceri exclusive`
                                },
                                {
                                    name: "Notă",
                                    value: "Beneficiile pe care le primești depind de planul pe care îl alegi, așa că nu ezita să răsfoiești toate opțiunile apăsând butonul de mai jos."
                                }
                            )
                    ],
                    components: [row]
                });
            }

            if (cmd != "menu") {
                // kick and invite can not be ran if the user does not own a clan yet

                if (clanData.length == 0) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Nu detii un clan!")
                                .setDescription("Aceste comenzi necesita sa detii un clan.")
                        ]
                    });
                }

                // check if the user provided for kick/invite is a valid member of this server
                try {
                    member = await interaction.guild.members.fetch(user.id);
                } catch (err) {
                    return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("Tinta invalida")
                            .setDescription("Tinta trebuie sa fie un membru al acestui server!")
                    ]
                });
                }

                // no bots allowed
                if (member.user.bot) {
                    return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: "Nu poti folosi astfel de comenzi pe boti!"
                });
                }

                if (member.id === interaction.member.id) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Nu te poti viza pe tine insuti cu astfel de comenzi!"
                    });
                }

                // if the user is a valid member, check if the member is or isn't a member of the clan
                try {
                    isClanMember = member.roles.cache.has(clanData[0].clanrole)
                } catch (err) { };
            }
        }

        switch (cmd) {
            case "menu":
                await main_menu(interaction, interaction.member);
                break;
            case "invite":
                if (isClanMember) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Nu poti invita pe cineva care este deja in clanul tau!"
                    });
                }
                await send_invite(interaction, interaction.member, member);
                break;
            case "kick":
                if (!isClanMember) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor("Red")
                        .setDescription("<:wrong:1418383815696449680> Nu poti da afara pe cineva care nu este in clanul tau!");
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [errorEmbed]
                    });
                }

                const clanRoleRows = await getClanRoleByOwner(interaction.guild.id, interaction.user.id);
                await member.roles.remove(clanRoleRows[0].clanrole);

                const kickEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setDescription(`<:Correct:1418383811422457887> L-ai dat afara pe ${member} din clanul tau!`);

                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [kickEmbed]
                });

                break;
            case "leave": { 
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const roleIds = interaction.member.roles.cache.map(role => role.id);

                // Fetch all clans the user is a MEMBER of
                const matchingClansData = await getClansByClanRoleIds(interaction.guild.id, roleIds);

                if (matchingClansData.length > 0) {
                    const selectOptions = matchingClansData.map(row => ({
                        label: row.clanname,
                        value: `${row.clanrole}`,
                        description: `Paraseste clanul: ${row.clanname}`
                    }));

                    const selectClanMenu = new StringSelectMenuBuilder()
                        .setCustomId("select-clan-to-leave")
                        .setPlaceholder("Selecteaza clanul sau clanurile din care vrei sa iesi")
                        .setMinValues(1)
                        .setMaxValues(selectOptions.length)
                        .addOptions(selectOptions);

                    const selectActionRow = new ActionRowBuilder().addComponents(selectClanMenu);

                    const leaveSelectionEmbed = new EmbedBuilder()
                        .setColor("Red")
                        .setDescription("<:question:1418383820360777758> Esti membru in urmatoarele clanuri. Te rog selecteaza din care doresti sa iesi.");

                    await interaction.editReply({
                        embeds: [leaveSelectionEmbed],
                        components: [selectActionRow]
                    });

                    const leaveFetchedReply = await interaction.fetchReply();
                    const selectCollector = leaveFetchedReply.createMessageComponentCollector({
                        ComponentType: ComponentType.StringSelect,
                        time: 120_000,
                        filter: (i) => i.user.id === interaction.user.id
                    });

                    selectCollector.on("collect", async (selectInteraction) => {
                        if (!selectInteraction.isStringSelectMenu()) return;
                        await interaction.member.roles.remove(selectInteraction.values);

                        const successEmbed = new EmbedBuilder()
                            .setColor("Green")
                            .setDescription("<:Correct:1418383811422457887> Ai parasit cu succes clanurile selectate.");

                        await selectInteraction.update({ embeds: [successEmbed], components: [], content: null });
                        selectCollector.stop();
                    });

                    selectCollector.on("end", async (_collected, reason) => {
                        if (reason === 'time') {
                            try {
                                const timeoutEmbed = new EmbedBuilder()
                                    .setColor("Red")
                                    .setDescription("⏳ Cererea ta a expirat.");
                                await interaction.editReply({ embeds: [timeoutEmbed], components: [], content: null });
                            } catch (err) {}
                        }
                    });
                      // User attempting to leave his own clan
                } else {
                    const ownerClanData = await getClanByOwner(interaction.guild.id, interaction.user.id);
                    if (ownerClanData.length > 0) {
                        return await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor("Red")
                                    .setDescription("<:wrong:1418383815696449680> Pentru a parasi clanul, trebuie mai intai sa folosesti comanda `/clan menu` pentru a transfera proprietatea altui membru sau pentru a sterge clanul.")
                            ]
                        });
                    } else {
                        // User is neither a member nor an owner.
                        return await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor("Red")
                                    .setDescription("Nu esti membru in niciun clan, deci nu ai din ce sa iesi.")
                            ]
                        });
                    }
                }
                break;
            }
            case "details":
                const clanName = interaction.options.getString("clan-name");
                const ownerRows = await getOwnerByClanName(interaction.guild.id, clanName);

                if (ownerRows.length == 0) {
                    return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("Nume de clan invalid!")
                            .setDescription("Numele de clan furnizat nu exista!")
                    ]
                });
                }

                let ownerMember = null;

                try {
                    ownerMember = await interaction.guild.members.fetch(ownerRows[0].owner);
                } catch (err) {
                    console.error(`Owner is no longer a guild member: ${ownerRows[0].owner}\n${err}`);
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Eroare, proprietarul clanului nu mai este membru al acestui server!"
                    });
                }

                const clanObj = await clanObjBuilder(interaction.guild, ownerMember);
                let embedClan = null;
                if (clanObj)
                    embedClan = clanEmbedBuilder(clanObj)
                else
                    return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: "A aparut o problema la preluarea obiectului clanului..."
                });

                await interaction.reply({
                    embeds: [
                        embedClan
                    ]
                });

                break;
            case "channel": {
                if (clanData.length == 0) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Nu ai un clan!")
                                .setDescription("Aceasta comanda necesita sa detii un clan.")
                        ]
                    });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const clanObj = await clanObjBuilder(interaction.guild, interaction.member);
                if (!clanObj) {
                    return await interaction.editReply({ content: "A aparut o eroare la preluarea datelor clanului." });
                }

                // Build staff viewer permissions from env so staff can see recreated channels
                const staffPermissionSets = buildStaffPermissionSets(interaction.guild);

                const categoryData = await getClanSystem(interaction.guild.id);
                let category;
                try {
                    category = await interaction.guild.channels.fetch(categoryData[0].category);
                } catch(err) {
                    console.error(`Datele pentru categoria sustinatorilor sunt invalide\n${err}`);
                    return await interaction.editReply({ content: "Categoria setata pentru clanuri este invalida. Contacteaza un administrator." });
                }

                let replyMessages = [];

                if (!clanObj.textChannel) {
                    const newTextChannel = await category.children.create({
                        name: `${clanObj.clanname}-text`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: clanObj.clanRole.id, allow: [PermissionFlagsBits.ViewChannel] },
                            { id: clanObj.ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] },
                            ...staffPermissionSets.text
                        ]
                    });
                    await updateClanTextChannel(interaction.guild.id, interaction.user.id, newTextChannel.id);
                    replyMessages.push(`Canalul text a fost creat: ${newTextChannel}`);
                } else {
                    replyMessages.push(`Canalul text exista deja: ${clanObj.textChannel}`);
                }

                if (!clanObj.voice) {
                    const newVoiceChannel = await category.children.create({
                        name: `${clanObj.clanname}-voice`,
                        type: ChannelType.GuildVoice,
                        permissionOverwrites: [
                            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: clanObj.clanRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                            { id: clanObj.ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
                            ...staffPermissionSets.voice
                        ]
                    });
                    await updateClanVoiceChannel(interaction.guild.id, interaction.user.id, newVoiceChannel.id);
                    replyMessages.push(`Canalul de voce a fost creat: ${newVoiceChannel}`);
                } else {
                    replyMessages.push(`Canalul de voce exista deja: ${clanObj.voice}`);
                }

                await interaction.editReply({
                    content: replyMessages.join('\n')
                });
                break;
            }
        }
    }
}
