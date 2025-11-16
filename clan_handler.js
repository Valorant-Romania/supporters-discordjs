
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    TextInputBuilder, TextInputStyle, ModalBuilder,
    EmbedBuilder,
    ComponentType,
    Collection,
    PermissionFlagsBits,
    ChannelType,
    StringSelectMenuBuilder,
    MessageFlags,
    RESTJSONErrorCodes
} = require("discord.js");

async function safeMessageEdit(target, payload) {
    if (!target || typeof target.edit !== 'function') return false;
    try {
        await target.edit(payload);
        return true;
    } catch (err) {
        if (err?.code === RESTJSONErrorCodes.UnknownMessage) {
            return false;
        }
        throw err;
    }
}

async function safeMessageDelete(target) {
    if (!target || typeof target.delete !== 'function') return false;
    try {
        await target.delete();
        return true;
    } catch (err) {
        if (err?.code === RESTJSONErrorCodes.UnknownMessage) {
            return false;
        }
        throw err;
    }
}

const { 
    getClanSystem, 
    getClanByOwner, 
    createClan: dbCreateClan, 
    deleteClan: dbDeleteClan,
    updateClanName,
    updateClanTextChannel,
    updateClanVoiceChannel,
    updateClanOwner
} = require("./database.js");
const { hasCooldown } = require("./utility_methods.js");

function buildStaffPermissionSets(guild = null) {
    const envValue = process.env.CLAN_VIEWER_ROLE_IDS || '';

    const rawRoleIds = envValue
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

    const numericRoleIds = rawRoleIds.filter((id) => /^\d{17,20}$/.test(id));
    const malformedIds = rawRoleIds.filter((id) => id.length > 0 && !/^\d{17,20}$/.test(id));

    if (malformedIds.length) {
        console.warn('[ClanStaff] Skipping malformed CLAN_VIEWER_ROLE_IDS entries:', malformedIds);
    }

    const roleIds = guild
        ? numericRoleIds.filter((roleId) => {
            const exists = guild.roles.cache.has(roleId);
            if (!exists) {
                console.warn(`[ClanStaff] Skipping unknown staff role ID ${roleId} in guild ${guild.id}`);
            }
            return exists;
        })
        : numericRoleIds;

    return {
        ids: roleIds,
        text: roleIds.map((roleId) => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
        })),
        voice: roleIds.map((roleId) => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
        }))
    };
}

async function ensureStaffAccess(channel, roleIds, permissions, contextLabel) {
    if (!channel || !roleIds.length) return;

    await Promise.all(roleIds.map(async (roleId) => {
        try {
            await channel.permissionOverwrites.edit(roleId, permissions);
        } catch (err) {
            console.error(`Failed to ensure staff access for ${contextLabel} (role ${roleId}):`, err);
        }
    }));
}

// buttons
const createClan = new ButtonBuilder()
    .setCustomId("create-clan")
    .setLabel("Creeaza Clan")
    .setStyle(ButtonStyle.Success)

const modifyClan = new ButtonBuilder()
    .setCustomId("modify-clan")
    .setLabel("Modifica Clan")
    .setStyle(ButtonStyle.Primary)

const deleteClan = new ButtonBuilder()
    .setLabel("Sterge Clan")
    .setCustomId("delete-clan")
    .setStyle(ButtonStyle.Danger)

const mainMenuRow = new ActionRowBuilder()
    .addComponents(createClan, modifyClan, deleteClan);

// modal
const clanNameInput = new TextInputBuilder()
    .setCustomId("clan-name-input")
    .setRequired(true)
    .setPlaceholder("Nume clan...")
    .setLabel("Numele clanului")
    .setMinLength(1)
    .setMaxLength(100)
    .setStyle(TextInputStyle.Short)

const clanNameInputRow = new ActionRowBuilder()
    .addComponents(clanNameInput)

const clanNameModal = new ModalBuilder()
    .setCustomId("clan-name-modal")
    .setTitle("Numele Clanului")
    .addComponents(clanNameInputRow)

const hexColorInput = new TextInputBuilder()
    .setCustomId("hex-color-input")
    .setRequired(true)
    .setPlaceholder("2596be")
    .setLabel("Cod hexcolor")
    .setMinLength(6)
    .setMaxLength(6)
    .setStyle(TextInputStyle.Short)

const hexColorRow = new ActionRowBuilder()
    .addComponents(hexColorInput);

const hexColorModal = new ModalBuilder()
    .setCustomId("hex-color-modal")
    .setTitle("Culoarea rolului")
    .addComponents(hexColorRow);

const channelNameInput = new TextInputBuilder()
    .setCustomId("channel-name-input")
    .setRequired(true)
    .setPlaceholder("Nume canal...")
    .setLabel("Numele canalului")
    .setMinLength(1)
    .setMaxLength(50)
    .setStyle(TextInputStyle.Short)

const channelNameRow = new ActionRowBuilder()
    .addComponents(channelNameInput);

const channelNameModal = new ModalBuilder()
    .setCustomId("channel-name-modal")
    .setTitle("Numele canalului")
    .addComponents(channelNameRow);



const clanEmbedBuilder = (clanObj) => {
	const embed = new EmbedBuilder()
		.setColor("Aqua")
		.setAuthor({
			name: `Profilul clanului lui ${clanObj.owner.user.username}`,
			iconURL: clanObj.owner.displayAvatarURL({extension: "png"})
		})
        .setDescription (`―――――――――――――――――――――――――――――――――――――――`)
		.setTitle(`Clanul ${clanObj.clanname}`)
		.addFields(
			{
				name: "<:members:1418383834776469777> Numar membri clan",
				value: `${clanObj.clanRole.members.size + 1}`
			},
			{
				name: "<:roleIcon:1418383854716190791> Rol proprietar",
				value: `${clanObj.ownerRole}`
			},
			{
				name: "<:Crown:1418384417990119495> Rol clan",
				value: `${clanObj.clanRole}`
			},
			{
				name: "<:colors:1418383828380029029> Hexcolor",
				value: `${clanObj.ownerRole.hexColor}`
			},
			{
				name: "<:voice:1418383831245000724> Voce",
				value:`${clanObj.voice ? clanObj.voice : "Nimic"}`
			},
			{
				name: "<:Textchannel:1418383849469116546> Canal text",
				value: `${clanObj.textChannel ? clanObj.textChannel : "Nimic"}`
			}
		);

	const iconUrl = clanObj.ownerRole?.iconURL?.({ extension: "png" });
	if (iconUrl) embed.setThumbnail(iconUrl);
	return embed;
}

const clanObjBuilder = async (guild, member) => {
    const clanData = await getClanByOwner(guild.id, member.id);

    if (clanData.length === 0) return false;
    // creating the clan object
    const clanObj = {
        owner: member,
        clanname: clanData[0].clanname,
        ownerRole: null,
        clanRole: null,
        voice: null,
        textChannel: null
    }

    try{
        clanObj.ownerRole = await guild.roles.fetch(clanData[0].ownerrole);
    } catch(err) {
        return false;
    }

    try{
        clanObj.clanRole = await guild.roles.fetch(clanData[0].clanrole);
    } catch(err) {
        return false;
    }

    if(clanData[0].voicechannel) {
        try{
            clanObj.voice = await guild.channels.fetch(clanData[0].voicechannel)
        } catch(err) {}
    }


    if(clanData[0].textchannel) {
        try{
            clanObj.textChannel = await guild.channels.fetch(clanData[0].textchannel)
        } catch(err) {};
    }

    return clanObj;
}

async function create_clan_button(interaction, message) {
    const supporterData = await getClanSystem(interaction.guild.id);

    let supporterRole = null;
    try{
        supporterRole = await interaction.guild.roles.fetch(supporterData[0].role);
    } catch (err) {
    console.error(`Supporter role is invalid ${supporterData[0].role}\n${err}`);
        return await interaction.reply({flags: MessageFlags.Ephemeral, content: "Rolul de sustinator este defect, anunta un administrator!"});
    }
    
    await interaction.showModal(clanNameModal);
    try{
        const submit = await interaction.awaitModalSubmit({
            filter: (i) => i.user.id === interaction.user.id,
            time: 120_000
        });

        await submit.deferReply({flags: MessageFlags.Ephemeral});

        const botMember = await interaction.guild.members.fetchMe();
        if (!botMember.roles.highest) {
            return await submit.editReply({
                content: "Eroare critica: Bot-ul nu are niciun rol si nu poate gestiona roluri. Contacteaza un administrator."
            });
        }
        const botRolePosition = botMember.roles.highest.position;

        // initializing the object for the embed update
        const clanObj = {
            owner: interaction.member,
            clanname: submit.fields.getTextInputValue("clan-name-input"),
        }

        // creating the roles
        clanObj.ownerRole = await interaction.guild.roles.create({
            name: clanObj.clanname,
        });

        clanObj.clanRole = await interaction.guild.roles.create({
            name: clanObj.clanname,
        });
        
        try {
            // position owner role just below the bot's role.
            await clanObj.ownerRole.setPosition(botRolePosition - 1);
            // position clan role just below the newly positioned owner role.
            await clanObj.clanRole.setPosition(botRolePosition - 2);
        } catch (e) {
            console.error("Failed to set role positions during clan creation:", e);
            // attempt to clean up the created roles if positioning fails
            await clanObj.ownerRole.delete().catch(() => {});
            await clanObj.clanRole.delete().catch(() => {});
            return await submit.editReply({
                content: "A aparut o eroare la setarea pozitiei rolurilor. Acest lucru se intampla de obicei daca rolul bot-ului este prea jos in ierarhie. Te rog contacteaza un administrator."
            });
        }


        try{
            await interaction.member.roles.add(clanObj.ownerRole); // assigning the owner role
        } catch(err) {
            console.error(`An error occurred while assigning owner role to a member\n${err}`);
            return await submit.editReply({
                content: "Rolul a fost creat, dar se pare ca rolul meu este prea jos.\nConfiguratie gresita."
            });
        }

        const categoryData = await getClanSystem(interaction.guild.id);
        let category = null;
        try {
            category = await interaction.guild.channels.fetch(categoryData[0].category);
        } catch(err) {
            console.error(`Supporter category data is invalid\n${err}`);
            return await submit.editReply({
                content: "Exista o problema cu datele categoriei..."
            });
        }

        const staffPermissionSets = buildStaffPermissionSets(interaction.guild);

        // create Canal text
        clanObj.textChannel = await category.children.create({
            name: `${clanObj.clanname}-text`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: clanObj.clanRole.id,
                    allow: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: clanObj.ownerRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                },
                ...staffPermissionSets.text
            ]
        });
        await ensureStaffAccess(clanObj.textChannel, staffPermissionSets.ids, { ViewChannel: true, ReadMessageHistory: true }, 'clan text channel creation');

        // create Canal voce
        clanObj.voice = await category.children.create({
            name: `${clanObj.clanname}-voice`,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: clanObj.clanRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
                },
                {
                    id: clanObj.ownerRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect]
                },
                ...staffPermissionSets.voice
            ]
        });
        await ensureStaffAccess(clanObj.voice, staffPermissionSets.ids, { ViewChannel: true, Connect: true }, 'clan voice channel creation');

        // registering the new clan
        await dbCreateClan(interaction.guild.id, interaction.user.id, clanObj.clanname, clanObj.ownerRole.id, clanObj.clanRole.id, clanObj.textChannel.id, clanObj.voice.id);
        await safeMessageEdit(message, {
            embeds: [clanEmbedBuilder(clanObj)],
            components: [mainMenuRow]
        });

        const successEmbed = new EmbedBuilder()
            .setColor("Green")
            .setDescription(`<:Correct:1418383811422457887> Clanul tau ${clanObj.clanname} a fost creat cu succes, alaturi de un canal de text si unul vocal dedicate!`)
        await submit.editReply({
            embeds: [successEmbed]
        });
        
    } catch(err) {
        console.error("Error during clan creation process:", err);
        if (err.code === 'InteractionCollectorError') {
             await interaction.followUp({
                flags: MessageFlags.Ephemeral,
                content: "Timpul pentru a introduce numele clanului a expirat, te rog incearca din nou."
            });
        } else {
            await interaction.followUp({
                flags: MessageFlags.Ephemeral,
                content: "A aparut o eroare neasteptata in timpul crearii clanului. Te rugam sa incerci din nou."
            });
        }
    }
}

async function delete_clan_button(interaction, message) {
    const clanData = await getClanByOwner(interaction.guild.id, interaction.user.id);

    if(clanData.length == 0) {
        return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Aceasta este o eroare, nu ar fi trebuit sa poti apasa acest buton fara un clan!"
        });
    }

    let ownerRole = null;
    try{
        ownerRole = await interaction.guild.roles.fetch(clanData[0].ownerrole);
    } catch(err) {};
    
    let clanRole = null;
    try{
        clanRole = await interaction.guild.roles.fetch(clanData[0].clanrole)
    } catch(err){};

    let voice = null;
    if(clanData[0].voicechannel) {
        try{
            voice = await interaction.guild.channels.fetch(clanData[0].voicechannel);
        } catch(err) {};
    }

    let textChannel = null;
    if(clanData[0].textchannel) {
        try{
            textChannel = await interaction.guild.channels.fetch(clanData[0].textchannel);
        } catch(err) {}
    }

    let deletionMessage = `Continuand stergerea clanului vor fi eliminate si ${ownerRole}, ${clanRole}`;
    if(voice) {
        deletionMessage += `, ${voice}`;
    }

    if(textChannel) {
        deletionMessage += `, ${textChannel}`;
    }

    // confirm button
    const confirmDelete = new ButtonBuilder()
        .setLabel("Confirma")
        .setStyle(ButtonStyle.Danger)
        .setCustomId("confirm-delete-button")

    const confirmRow = new ActionRowBuilder()
        .addComponents(confirmDelete);

    const reply = await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [
            new EmbedBuilder()
                .setColor("#ff0100")
                .setTitle("<:warning:1418383824143777922> Stergerea clanului este permanenta!")
                .setDescription(deletionMessage)
        ],
        components: [confirmRow]
    });

    const fetchedReply = await interaction.fetchReply();

    const collector = fetchedReply.createMessageComponentCollector({
        ComponentType: ComponentType.Button,
        filter: (i) => i.user.id == interaction.user.id,
        time: 120_000
    });

    collector.on("collect", async (buttonInteraction) => {
        if(!buttonInteraction.isButton()) return;
        
        if(buttonInteraction.customId == "confirm-delete-button") {
            await buttonInteraction.deferReply({flags: MessageFlags.Ephemeral});

            try{
                await ownerRole.delete();
                await clanRole.delete();
                if(voice) await voice.delete();
                if(textChannel) await textChannel.delete();
            } catch(err) {};

            // removing from clan table
            await dbDeleteClan(interaction.guild.id, interaction.user.id);

            createClan.setDisabled(false);
            modifyClan.setDisabled(true);
            deleteClan.setDisabled(true);

            const emptyClanEmbed = new EmbedBuilder()
                .setColor("Aqua")
                .setAuthor({
                    name: `Profilul clanului lui ${interaction.user.username}`,
                    iconURL: interaction.member.displayAvatarURL({extension: "png"})
                })
                .setTitle(`Nu ai inca un clan creat!`)
                .setDescription("Foloseste butonul `Creeaza Clan` si urmeaza pasii pentru a avea unul.");

            try{
                await safeMessageEdit(message, {
                    embeds: [emptyClanEmbed],
                    components: [mainMenuRow]
                })
            } catch (err) {
                console.error('Failed to update the clan menu after deletion:', err);
            }

            const successEmbed = new EmbedBuilder()
                .setColor("Green")
                .setDescription("<:Correct:1418383811422457887> V-ati sters clanul cu succes. Puteti crea unul nou prin comanda /clan menu.")
            await buttonInteraction.editReply({
                embeds: [successEmbed]
            });
            collector.stop();
        }
    });

    collector.on("end", async () => {
        try{
            await safeMessageDelete(reply);
        } catch(err) {};
    });
}

async function modify_clan_button(interaction, message) {
    
    const clanData = await getClanByOwner(interaction.guild.id, interaction.user.id);

    if(clanData.length == 0) {
        return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Aceasta este o eroare, nu ar fi trebuit sa poti face asta fara un clan!"
        });
    }

    const reply = await interaction.deferReply({flags: MessageFlags.Ephemeral});
    const fetchedReply = await interaction.fetchReply();

    // creating the clan object
    const clanObj = {
        owner: interaction.member,
        clanname: clanData[0].clanname,
        ownerRole: null,
        clanRole: null,
        voiceChannel: null,
        textChannel: null
    }

    try{
        clanObj.ownerRole = await interaction.guild.roles.fetch(clanData[0].ownerrole);
    } catch(err) {
    console.error(`Something went wrong with the owner role ${clanData[0].ownerrole}\n${err}`)
        return await interaction.editReply({
            flags: MessageFlags.Ephemeral,
            content: "Datele rolului de proprietar sunt defecte"
        });
    }

    try{
        clanObj.clanRole = await interaction.guild.roles.fetch(clanData[0].clanrole);
    } catch(err) {
    console.error(`Something went wrong with the clan role ${clanData[0].clanrole}\n${err}`)
        return await interaction.editReply({
            flags: MessageFlags.Ephemeral,
            content: "Datele rolului de clan sunt defecte"
        });
    }

    if(clanData[0].voicechannel) {
        try{
            clanObj.voiceChannel = await interaction.guild.channels.fetch(clanData[0].voicechannel)
        } catch(err) {}
    }

    if(clanData[0].textchannel) {
        try{
            clanObj.textChannel = await interaction.guild.channels.fetch(clanData[0].textchannel)
        } catch(err) {
          console.error('Failed to fetch the clan text channel:', err)
        };
    }

    // opening the modify menu where members can change or create new aspects about their roles and channels

    // fetching the category
    const categoryData = await getClanSystem(interaction.guild.id);

    let category = null;

    try{
        category = await interaction.guild.channels.fetch(categoryData[0].category);
    } catch(err) {
    console.error(`Supporter category data is invalid\n${err}`); // si senior
        return await interaction.editReply({
            content: "Exista o problema cu datele categoriei..."
        });
    }

    const staffPermissionSets = buildStaffPermissionSets(interaction.guild);

    // buttons

    const clanName = new ButtonBuilder()
        .setCustomId("clan-name-button")
        .setLabel("Numele clanului")
        .setStyle(ButtonStyle.Primary)

    const roleColor = new ButtonBuilder()
        .setCustomId("role-color-button")
        .setLabel("Culoare rol")
        .setStyle(ButtonStyle.Primary)

    const roleIcon = new ButtonBuilder()
        .setCustomId("role-icon-button")
        .setLabel("Iconita rol")
        .setStyle(ButtonStyle.Primary)

    const textChannelName = new ButtonBuilder()
        .setLabel("Canal text")
        .setCustomId("text-channel-button")
        .setStyle(ButtonStyle.Primary)

    const voiceChannelName = new ButtonBuilder()
        .setLabel("Canal voce")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("voice-channel-button")

    const transferOwnership = new ButtonBuilder()
        .setLabel("Transfera proprietatea")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("transfer-ownership-button");

    const firstRow = new ActionRowBuilder()
        .addComponents(clanName, roleColor, roleIcon);

    const secondRow = new ActionRowBuilder()
        .addComponents(textChannelName, voiceChannelName, transferOwnership);

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor("Purple")
                .setTitle("<:manager:1418383860537757766> Manager clan")
                .setDescription("―――――――――――――――――――――――――――――――――――――――")
                .setFields(
                    {
                        name: "<:name:1418383857639620750> Numele clanului",
                        value: "Schimba numele clanului si implicit al rolurilor."
                    },
                    {
                        name: "<:colors:1418383828380029029> Culoare rol",
                        value: "Seteaza noua culoare a rolurilor."
                    },
                    {
                        name: "<:roleIcon:1418383854716190791> Iconita rol",
                        value: "Incarca o imagine pentru iconita rolului (maxim 256KB)."
                    },
                    {
                        name: "<:Textchannel:1418383849469116546> Canal text",
                        value: "Creeaza/modifica numele canalului text"
                    },
                    {
                        name: "<:voice:1418383831245000724> Canal voce",
                        value: "Creeaza/modifica numele canalului de voce."
                    },
                    {
                        name: "<:transfer:1418383852526899415> Transfera proprietatea",
                        value: "Numeste un nou proprietar pentru clanul tau. Tu vei deveni un membru obisnuit."
                    }
                )
        ],
        components: [firstRow, secondRow]
    });

    const collector = fetchedReply.createMessageComponentCollector({
        ComponentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 600_000
    });

    const cooldowns = new Collection();

    collector.on("collect", async (buttonInteraction) => {
        if(!buttonInteraction.isButton()) return;
        
        const userCooldown = hasCooldown(buttonInteraction.user.id, cooldowns, 10_000);
        if(userCooldown) {
            return await buttonInteraction.reply({
                flags: MessageFlags.Ephemeral,
                content: `Butoanele sunt in cooldown! <t:${parseInt(userCooldown / 1000)}:R>`
            });
        }

        cooldowns.set(buttonInteraction.user.id, Date.now());
        setTimeout(() => cooldowns.delete(buttonInteraction.user.id), 10_000);

        switch(buttonInteraction.customId) {
            case "clan-name-button":
                await buttonInteraction.showModal(clanNameModal);
                try{
                    const submit = await buttonInteraction.awaitModalSubmit({
                        filter: (i) => i.user.id === buttonInteraction.user.id,
                        time: 120_000
                    });

                    clanObj.clanname = submit.fields.getTextInputValue("clan-name-input");

                    await updateClanName(interaction.guild.id, interaction.user.id, clanObj.clanname); // updating the clan name in database


                    // updating the roles
                    await clanObj.ownerRole.edit({
                        name: clanObj.clanname
                    });

                    await clanObj.clanRole.edit({
                        name: clanObj.clanname
                    });

                    // updating the message
                    try{
                        await safeMessageEdit(message, {
                            embeds: [clanEmbedBuilder(clanObj)]
                        });
                    } catch(err) {};

                    await submit.reply({
                        flags: MessageFlags.Ephemeral,
                        content: `Numele clanului a fost schimbat in **${clanObj.clanname}**.`
                    });
                } catch(err) {
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Timpul a expirat, incearca din nou."
                    });
                }
            break;
            case "role-color-button":
                await buttonInteraction.showModal(hexColorModal);
                try{
                    const submit = await buttonInteraction.awaitModalSubmit({
                        filter: (i) => i.user.id === interaction.user.id,
                        time: 120_000
                    });

                    const hexcolor = "0x" + submit.fields.getTextInputValue("hex-color-input");
                    const hexcolorRegex = /^0x([A-Fa-f0-9]{6})$/;
                    if(!hexcolorRegex.test(hexcolor)) {
                        return await submit.reply({
                            flags: MessageFlags.Ephemeral,
                            content: "Input invalid, un cod hexcolor ar trebui sa arate asa `2596be`."
                        });
                    }

                    // edit roles
                    await clanObj.ownerRole.edit({
                        color: Number(hexcolor)
                    });

                    await clanObj.clanRole.edit({
                        color: Number(hexcolor)
                    });

                    try{
                        await safeMessageEdit(message, {
                            embeds: [
                                clanEmbedBuilder(clanObj)
                            ]
                        });
                    } catch(err) {};

                    await submit.reply({
                        flags: MessageFlags.Ephemeral,
                        content: `Color code changed to \`${hexcolor}\``
                    });
                } catch(err) {
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Timpul a expirat, incearca din nou."
                    });
                }
            break;
            case "role-icon-button": { // Scoped with brackets for clarity
                let dmChannel;

                try {
                    dmChannel = await buttonInteraction.user.createDM();
                    await dmChannel.send({
                        content: "Te rog trimite imaginea dorita pentru iconita in acest chat.\nFisierul trebuie sa fie mai mic de `256KB`!"
                    });

                    await buttonInteraction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "<:Correct:1418383811422457887> Ti-am trimis un mesaj privat. Te rog continua procesul acolo."
                    });

                } catch (error) {
                    console.error("Could not send DM to user:", error);
                    await buttonInteraction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "<:wrong:1418383815696449680> Nu ti-am putut trimite un mesaj privat. Te rog asigura-te ca ai mesajele private deschise de la membrii serverului si incearca din nou."
                    });
                    return; // Stop the process.
                }

                const filterMessage = (msg) => msg.author.id === interaction.user.id;

                const messageCollector = dmChannel.createMessageCollector({
                    filter: filterMessage,
                    max: 1,
                    time: 60_000 // 60 seconds to reply
                });

                messageCollector.on("collect", async (msg) => {
                    if (msg.attachments.size === 0) {
                        return await dmChannel.send({ content: "Nu a fost trimisa nicio imagine. Te rog reincearca apasand din nou butonul din meniu." });
                    }

                    const imageAttachment = msg.attachments.first();

                    if (!imageAttachment.contentType.includes("image")) {
                        return await dmChannel.send({ content: "Format de fisier invalid! Te rog reincearca." });
                    }

                    if (imageAttachment.size > 262144) { // 256KB in bytes
                        return await dmChannel.send({ content: "Imaginea este prea mare! Incarca una sub `256KB`!" });
                    }

                    try {
                        await clanObj.ownerRole.edit({
                            icon: imageAttachment.url
                        });
                    } catch (err) {
                        console.error("Failed to set role icon, likely boost level issue:", err);
                        return await dmChannel.send({ content: "<:wrong:1418383815696449680> Nu am putut seta iconita. Se pare ca acest server nu are nivelul de boost necesar (Nivel 2) pentru aceasta actiune!" });
                    }
                    
                    try {
                        await safeMessageEdit(message, { embeds: [clanEmbedBuilder(clanObj)] });
                    } catch (err) {
                         console.warn("Could not edit the main menu message after role icon update:", err);
                    };

                    try {
                        await msg.delete();
                    } catch (err) {
                         console.warn("Could not delete user's DM message:", err);
                    };

                    await dmChannel.send({ content: "<:Correct:1418383811422457887> Iconita rolului a fost schimbata cu succes." });
                });

                messageCollector.on("end", async (collected) => {
                    if (collected.size === 0) {
                        await dmChannel.send({ content: "Timpul a expirat. Nu a fost trimisa nicio imagine in intervalul acordat." });
                    }
                });
                break;
            }
            case "text-channel-button":
                await buttonInteraction.showModal(channelNameModal);
                try {
                    const submit = await buttonInteraction.awaitModalSubmit({
                        filter: (i) => i.user.id === interaction.user.id,
                        time: 120_000
                    });

                    await submit.deferReply({flags: MessageFlags.Ephemeral});

                    const textName = submit.fields.getTextInputValue("channel-name-input");

                    // if the channel exists, rename it, if not, create one
                    if(clanObj.textChannel) {
                        await clanObj.textChannel.edit({
                            name: textName
                        });
                        await ensureStaffAccess(clanObj.textChannel, staffPermissionSets.ids, { ViewChannel: true, ReadMessageHistory: true }, 'updated clan text channel');

                        await submit.editReply({
                            flags: MessageFlags.Ephemeral,
                            content: `Numele canalului a fost schimbat ${clanObj.textChannel}`
                        });
                    } else {
                        clanObj.textChannel = await category.children.create({
                            name: textName,
                            type: ChannelType.GuildText,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.roles.everyone.id,
                                    deny: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages
                                    ]
                                },
                                {
                                    id: clanObj.ownerRole.id,
                                    allow: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages
                                    ]
                                },
                                {
                                    id: clanObj.clanRole.id,
                                    allow: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages
                                    ]
                                },
                                ...staffPermissionSets.text
                            ]
                        });
                        await ensureStaffAccess(clanObj.textChannel, staffPermissionSets.ids, { ViewChannel: true, ReadMessageHistory: true }, 'new clan text channel');

                        // register the channel in the database
                        await updateClanTextChannel(interaction.guild.id, interaction.user.id, clanObj.textChannel.id);

                        await submit.editReply({
                            content: `Canalul a fost creat ${clanObj.textChannel}`
                        });

                    }
                } catch(err) {
                    console.error('Failed to create or update the clan text channel:', err);
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Timpul a expirat, incearca din nou!"
                    });
                }

                try{
                    await safeMessageEdit(message, {
                        embeds: [
                            clanEmbedBuilder(clanObj)
                        ]
                    });
                } catch(err) {};
            break;
            case "voice-channel-button":
                await buttonInteraction.showModal(channelNameModal);
                try {
                    const submit = await buttonInteraction.awaitModalSubmit({
                        filter: (i) => i.user.id === interaction.user.id,
                        time: 120_000
                    });

                    await submit.deferReply({flags: MessageFlags.Ephemeral});

                    const textName = submit.fields.getTextInputValue("channel-name-input");

                    // if the channel exists, rename it, if not, create one
                    if(clanObj.voiceChannel) {
                        await clanObj.voiceChannel.edit({
                            name: textName
                        });

                        await submit.editReply({
                            flags: MessageFlags.Ephemeral,
                            content: `Numele canalului a fost schimbat ${clanObj.voiceChannel}`
                        });
                    } else {
                        // creating the channel
                        				clanObj.voiceChannel = await category.children.create({
					name: textName,
					type: ChannelType.GuildVoice,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.roles.everyone.id,
                                    deny: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages,
                                        PermissionFlagsBits.Connect
                                    ]
                                },
                                {
                                    id: clanObj.ownerRole.id,
                                    allow: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages,
                                        PermissionFlagsBits.Connect
                                    ]
                                },
                                {
                                    id: clanObj.clanRole.id,
                                    allow: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages,
                                        PermissionFlagsBits.Connect
                                    ]
                                },
                                ...staffPermissionSets.voice
                            ]
                        });

                        // register the channel in the database
                        await updateClanVoiceChannel(interaction.guild.id, interaction.user.id, clanObj.voiceChannel.id);

                        await submit.editReply({
                            content: `Canalul a fost creat ${clanObj.voiceChannel}`
                        });

                    }
                } catch(err) {
                    console.error('Failed to create or update the clan voice channel:', err);
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Timpul a expirat, incearca din nou!"
                    });
                }

                try{
                    await safeMessageEdit(message, {
                        embeds: [
                            clanEmbedBuilder(clanObj)
                        ]
                    });
                } catch(err) {};
            break;
            case "transfer-ownership-button":
                if (clanObj.clanRole.members.size === 0) {
                    return await buttonInteraction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Nu exista alti membri in clan carora sa transferi proprietatea."
                    });
                }

                // Fetch clan members and create options for the StringSelectMenu
                const clanMembers = clanObj.clanRole.members;
                const memberOptions = clanMembers.map(member => ({
                    label: member.user.username,
                    description: `ID: ${member.id}`,
                    value: member.id,
                })).slice(0, 25);

                if (memberOptions.length === 0) {
                     return await buttonInteraction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "Nu s-au gasit membri valizi in clan pentru transfer."
                    });
                }

                const memberSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select-new-owner-string')
                    .setPlaceholder('Selecteaza noul proprietar al clanului')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(memberOptions);

                const selectRow = new ActionRowBuilder().addComponents(memberSelectMenu);

                const transferEmbed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("<:question:1418383820360777758> Selecteaza membrul de clan pe care vrei sa il faci noul proprietar.");

                await buttonInteraction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [transferEmbed],
                    components: [selectRow]
                });
                
                const transferMessage = await buttonInteraction.fetchReply();
                
                try {
                    const selectInteraction = await transferMessage.awaitMessageComponent({
                        filter: i => i.user.id === buttonInteraction.user.id && i.customId === 'select-new-owner-string',
                        time: 60_000,
                        componentType: ComponentType.StringSelect
                    });
                    await selectInteraction.deferUpdate();

                    const newOwnerId = selectInteraction.values[0];
                    const newOwnerMember = await interaction.guild.members.fetch(newOwnerId);
                    
                    const newOwnerHasClan = await getClanByOwner(interaction.guild.id, newOwnerMember.id);
                    if (newOwnerHasClan.length > 0) {
                        return await buttonInteraction.editReply({
                            content: `⚠️ ${newOwnerMember.user.username} detine deja un alt clan si nu poate fi proprietarul acestuia. Transfer anulat.`,
                            components: []
                        });
                    }

                    if (!newOwnerMember.roles.cache.has(clanObj.clanRole.id)) {
                        return await buttonInteraction.editReply({
                            content: `⚠️ ${newOwnerMember.user.username} nu este membru al clanului tau. Transfer anulat.`,
                            components: []
                        });
                    }

                    // Perform the transfer
                    await newOwnerMember.roles.add(clanObj.ownerRole);
                    await newOwnerMember.roles.remove(clanObj.clanRole);
                    await interaction.member.roles.remove(clanObj.ownerRole);
                    await interaction.member.roles.add(clanObj.clanRole);

                    await updateClanOwner(interaction.guild.id, interaction.user.id, newOwnerMember.id);

                    const finalEmbed = new EmbedBuilder()
                        .setColor("Green")
                        .setDescription("Transferul a fost procesat.");

                    await buttonInteraction.editReply({
                        embeds: [finalEmbed],
                        components: []
                    });
                    
                    await buttonInteraction.followUp({
                        content: `<:Correct:1418383811422457887> Transferul proprietatii a reusit catre ${newOwnerMember}. Acum esti membru al clanului.`,
                        flags: MessageFlags.Ephemeral
                    });


                    // Stop the main collector as the user is no longer the owner.
                    collector.stop();

                } catch (err) {
                    console.error("Error during ownership transfer:", err);
                    await buttonInteraction.editReply({
                        content: "Timpul a expirat sau a aparut o eroare. Transferul a fost anulat.",
                        components: []
                    }).catch(() => {}); 
                }
            break;
        }
    });

}

async function main_menu_collector(message, owner) {
    // inner button cooldowns
    const cooldowns = new Collection();
    // the collector is used to handle the interaction of the owner with the message buttons and menu
    const collector = message.createMessageComponentCollector({
        ComponentType: ComponentType.Button,
        time: 600_000, // the menu will auto delete in 10 minutes
        filter: (i) => i.user.id === owner.id
    });

    collector.on("collect", async (buttonInteraction) => {
        if(!buttonInteraction.isButton()) return;

        const userCooldown = hasCooldown(buttonInteraction.user.id, cooldowns, 10_000); // 10 seconds cooldown
        if(userCooldown) {
            return await buttonInteraction.reply({
                flags: MessageFlags.Ephemeral,
                content: `Butoanele sunt in cooldown! <t:${parseInt(userCooldown / 1000)}:R>`
            });
        }
        //if the user is not on cooldown, proceed and register the cooldown
        cooldowns.set(buttonInteraction.user.id, Date.now());
        setTimeout(() => cooldowns.delete(buttonInteraction.user.id), 10_000);

        switch(buttonInteraction.customId) {
            case "create-clan":
                await create_clan_button(buttonInteraction, message);
            break;
            case "modify-clan":
                await modify_clan_button(buttonInteraction, message);
            break;
            case "delete-clan":
                await delete_clan_button(buttonInteraction, message);
            break;
        }

    });

    collector.on("end", async () => {
        try{
            await safeMessageDelete(message);
        } catch(err){};
    });
}

async function main_menu(interaction, owner) {
	await interaction.deferReply({flags: MessageFlags.Ephemeral});
    let mainEmbed = new EmbedBuilder()
        .setColor("Aqua")
        .setAuthor({
            name: `Profilul clanului lui ${owner.user.username}`,
            iconURL: owner.displayAvatarURL({extension: "png"})
        })

    const clanOwnerData = await getClanByOwner(owner.guild.id, owner.id);

    if(clanOwnerData.length == 0) {
        // if the user has no clan yet
        createClan.setDisabled(false);
        modifyClan.setDisabled(true);
        deleteClan.setDisabled(true);
        mainEmbed.setTitle(`Nu ai inca un clan creat!`)
            .setDescription("Foloseste butonul `Creeaza Clan` si urmeaza pasii pentru a avea unul.");
        
    } else {
        createClan.setDisabled(true); // can not create another one while having a clan
        modifyClan.setDisabled(false);
        deleteClan.setDisabled(false);
        // initializing the clan object in order to build the embed
        const clanObj = {
            owner: owner,
            clanname: clanOwnerData[0].clanname,
            ownerRole: null,
            clanRole: null,
            voice: null,
            textChannel: null
        }

        // fetching discord objects from database
        let clanRole = null;

        try{
            clanRole = await owner.guild.roles.fetch(clanOwnerData[0].clanrole);
        		} catch(err) {
			console.error(`There was a problem fetching clan role ${clanOwnerData[0].clanrole}\n${err}`);
			return await interaction.editReply({ content: "A aparut o problema la preluarea rolului de clan..." });
		}

        clanObj.clanRole = clanRole;

        let ownerRole = null;

        try{
            ownerRole = await owner.guild.roles.fetch(clanOwnerData[0].ownerrole);
        		} catch(err) {
			console.error(`There was a problem fetching owner role ${clanOwnerData[0].ownerrole}\n${err}`);
			return await interaction.editReply({ content: "A aparut o problema la preluarea rolului de proprietar..." });
		}

        clanObj.ownerRole = ownerRole;

        let voice = null;
        if(clanOwnerData[0].voicechannel) {
            try{
                voice = await owner.guild.channels.fetch(clanOwnerData[0].voicechannel);
            } catch(err) {};

            clanObj.voice = voice;
        }

        let textChannel = null;
        if(clanOwnerData[0].textchannel) {
            try{
                textChannel = await owner.guild.channels.fetch(clanOwnerData[0].textchannel);
            } catch(err) {
              console.error('Failed to fetch the clan text channel while building the menu:', err)
            };

            clanObj.textChannel = textChannel
        }

        mainEmbed = clanEmbedBuilder(clanObj);
    }

    	await interaction.editReply({
		embeds: [mainEmbed],
		components: [mainMenuRow]
	});

    	const fetched = await interaction.fetchReply();
	await main_menu_collector(fetched, owner);
}

async function send_invite(interaction, owner, member) {
    const clanObj = await clanObjBuilder(owner.guild, owner);

    if (!clanObj) {
        return interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Baza de date este defecta..."
        });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const inviteEmbed = new EmbedBuilder()
        .setColor("Aqua")
        .setAuthor({
            name: `${owner.user.username}`,
            iconURL: owner.displayAvatarURL({ extension: "png" })
        })
        .setTitle(`Ai primit o invitație în clanul **${clanObj.clanname}**`);

    // buttons
    const confirmInvite = new ButtonBuilder()
        .setCustomId("confirm-invite")
        .setLabel("Confirma")
        .setStyle(ButtonStyle.Success)

    const denyInvite = new ButtonBuilder()
        .setCustomId("deny-invite")
        .setLabel("Refuza")
        .setStyle(ButtonStyle.Danger)

    const actionRow = new ActionRowBuilder()
        .addComponents(confirmInvite, denyInvite);

    let dmChannel;
    let dmMessage;

    try {
        dmChannel = await member.createDM();

        dmMessage = await dmChannel.send({
            content: `Ai fost invitat sa te alaturi clanului **${clanObj.clanname}**.`,
            embeds: [inviteEmbed],
            components: [actionRow]
        });

        await interaction.editReply({
            content: `<:Correct:1418383811422457887> Invitația a fost trimisă cu succes către ${member}.`
        });

    } catch (error) {
        console.error("Could not send DM invite:", error);
        return await interaction.editReply({
            content: `<:wrong:1418383815696449680> Nu am putut trimite invitația prin DM către ${member}. Verifică dacă utilizatorul permite mesaje private de la membrii serverului.`
        });
    }

    const collector = dmMessage.createMessageComponentCollector({
        ComponentType: ComponentType.Button,
        time: 86_400_000, // 24h
        filter: (i) => i.user.id === member.id 
    });

    collector.on("collect", async (buttonInteraction) => {
        if (!buttonInteraction.isButton()) return;

        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId == "confirm-invite") {
            try {
                await member.roles.add(clanObj.clanRole);
            } catch (err) {
                console.error('Failed to assign the clan role to the new member:', err);
                const errorEmbed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("<:warning:1418383824143777922> A apărut o eroare la acordarea rolului de clan. Te rugăm contactează un developer.");
                 await safeMessageEdit(dmMessage, { embeds: [errorEmbed], components: [], content: null });
                 return;
            }

            const acceptedEmbed = new EmbedBuilder()
                .setColor("Green")
                .setDescription(`<:Correct:1418383811422457887> Ai acceptat invitația și acum faci parte din **${clanObj.clanname}**.`);

            await safeMessageEdit(dmMessage, {
                embeds: [acceptedEmbed],
                components: [],
                content: null
            });

            // Notify the owner
            try {
                const ownerDM = await owner.createDM();
                await ownerDM.send({
                    content: `<:Correct:1418383811422457887> ${member.user.username} a acceptat invitația ta în clan.`
                });
            } catch (err) {
                console.error("Could not notify owner of invite acceptance:", err);
            }


        } else if (buttonInteraction.customId == "deny-invite") {

            const deniedEmbed = new EmbedBuilder()
                .setColor("Green")
                .setDescription(`<:Correct:1418383811422457887> Ai refuzat invitația la clanul **${clanObj.clanname}**.`);

            await safeMessageEdit(dmMessage, {
                embeds: [deniedEmbed],
                components: [],
                content: null
            });

            // Notify the owner
            try {
                const ownerDM = await owner.createDM();
                await ownerDM.send({
                    content: `<:wrong:1418383815696449680> ${member.user.username} a refuzat invitația ta în clan.`
                });
            } catch (err) {
                console.error("Could not notify owner of invite denial:", err);
            }

        }
        collector.stop();
    });

    collector.on("end", async (collected, reason) => {
        if (reason === 'time') {
            const expiredEmbed = new EmbedBuilder()
                .setColor("Grey")
                .setDescription("Această invitație a expirat.");
            await safeMessageEdit(dmMessage, { embeds: [expiredEmbed], components: [], content: null });
        }
    });
}

module.exports = {
    main_menu,
    main_menu_collector,
    send_invite,
    clanObjBuilder,
    clanEmbedBuilder,
    buildStaffPermissionSets
}
