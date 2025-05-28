const {
    SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
    TextInputBuilder, TextInputStyle, ModalBuilder,
    MessageFlags,
    EmbedBuilder,
    ComponentType,
    Collection,
    PermissionFlagsBits,
    ChannelType

} = require("discord.js");

const {poolConnection} = require("../kayle-db.js");
const { hasCooldown } = require("../utility_methods.js");

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
    .setPlaceholder("Clan name...")
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
    .setLabel("Hexcolor code")
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
    .setPlaceholder("Channel name...")
    .setLabel("Numele canalului")
    .setMinLength(1)
    .setMaxLength(50)
    .setStyle(TextInputStyle.Short)

const channelNameRow = new ActionRowBuilder()
    .addComponents(channelNameInput);

const channelNameModal = new ModalBuilder()
    .setCustomId("channel-name-modal")
    .setTitle("Channel Name")
    .addComponents(channelNameRow);



const clanEmbedBuilder = (clanObj) => {
    return new EmbedBuilder()
        .setColor("Aqua")
        .setAuthor({
            name: `${clanObj.owner.user.username}'s clan profile`,
            iconURL: clanObj.owner.displayAvatarURL({extension: "png"})
        })
        .setTitle(`${clanObj.clanname} clan`)
            .setThumbnail(clanObj.ownerRole.iconURL({extension: "png"}))
            .addFields(
                {
                    name: "Clan Members Count",
                    value: `${clanObj.clanRole.members.size + 1}`
                },
                {
                    name: "Owner role",
                    value: `${clanObj.ownerRole}`
                },
                {
                    name: "Clan role",
                    value: `${clanObj.clanRole}`
                },
                {
                    name: "Hexcolor",
                    value: `${clanObj.ownerRole.hexColor}`
                },
                {
                    name: "Voice",
                    value:`${clanObj.voice ? clanObj.voice : "None"}`
                },
                {
                    name: "Text Channel",
                    value: `${clanObj.textChannel ? clanObj.textChannel : "None"}`
                }
            );
}

const clanObjBuilder = async (guild, member) => {
    const {rows: clanData} = await poolConnection.query(`SELECT * FROM clan WHERE guild=$1 AND owner=$2`,
        [guild.id, member.id]
    );

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
    const {rows: supporterData} = await poolConnection.query(`SELECT role FROM clansystem WHERE guild=$1`,
        [interaction.guild.id]
    );

    let supporterRole = null;
    try{
        supporterRole = await interaction.guild.roles.fetch(supporterData[0].role);
    } catch (err) {
        console.error(`Supporter role is faulty ${supporterData[0].role}\n${err}`);
        return await interaction.reply({flags: MessageFlags.Ephemeral, content: "The supporter role is faulty, notify an admin!"});
    }
    
    await interaction.showModal(clanNameModal);
    try{
        const submit = await interaction.awaitModalSubmit({
            filter: (i) => i.user.id === interaction.user.id,
            time: 120_000
        });

        await submit.deferReply({flags: MessageFlags.Ephemeral});

        // initializing the object for the embed update
        const clanObj = {
            owner: interaction.member,
            clanname: submit.fields.getTextInputValue("clan-name-input"),
        }

        // creating the roles
        clanObj.clanRole = await interaction.guild.roles.create({
            name: clanObj.clanname,
            position: 0 // placing above supporter role
        });
        
        clanObj.ownerRole = await interaction.guild.roles.create({
            name: clanObj.clanname,
            position: supporterRole.position + 7 // placing the role above the clan role
        });

        try{
            await interaction.member.roles.add(clanObj.ownerRole); // assigning the owner role
        } catch(err) {
            console.error(`Error occured when trying to assign owner role to a member\n${err}`);
            return await submit.editReply({
                content: "The role was created, but it seems like my role is too low.\nMisconfig."
            });
        }

        // registering the new clan
        await poolConnection.query(`INSERT INTO clan(guild, owner, clanname, ownerrole, clanrole)
            VALUES($1, $2, $3, $4, $5)`,
            [interaction.guild.id, interaction.user.id, clanObj.clanname, clanObj.ownerRole.id, clanObj.clanRole.id]
        );

        createClan.setDisabled(true);
        modifyClan.setDisabled(false);
        deleteClan.setDisabled(false);

        await message.edit({
            embeds: [clanEmbedBuilder(clanObj)],
            components: [mainMenuRow]
        });

        await submit.editReply({
            content: `Your clan **${clanObj.clanname}** has been created!`
        });
        
    } catch(err) {
        await interaction.followUp({
            flags: MessageFlags.Ephemeral,
            content: "Time ran out, try again."
        });
    }
}

async function delete_clan_button(interaction, message) {
    const {rows: clanData} = await poolConnection.query(`SELECT * FROM clan WHERE guild=$1 AND owner=$2`,
        [interaction.guild.id, interaction.user.id]
    );

    if(clanData.length == 0) {
        return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "This is a bug, you were not supposted to be able to click this button without a clan!"
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

    let deletionMessage = `Proceeding with deletion of the clan will also result into the removal of ${ownerRole}, ${clanRole}`;
    if(voice) {
        deletionMessage += `, ${voice}`;
    }

    if(textChannel) {
        deletionMessage += `, ${textChannel}`;
    }

    // confirm button
    const confirmDelete = new ButtonBuilder()
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Danger)
        .setCustomId("confirm-delete-button")

    const confirmRow = new ActionRowBuilder()
        .addComponents(confirmDelete);

    const reply = await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [
            new EmbedBuilder()
                .setColor("Red")
                .setTitle("Deleting the clan is permanent!")
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
            await poolConnection.query(`DELETE FROM clan WHERE guild=$1 AND owner=$2`,
                [interaction.guild.id, interaction.user.id]
            );

            createClan.setDisabled(false);
            modifyClan.setDisabled(true);
            deleteClan.setDisabled(true);

            const emptyClanEmbed = new EmbedBuilder()
                .setColor("Aqua")
                .setAuthor({
                    name: `${interaction.user.username}'s clan profile`,
                    iconURL: interaction.member.displayAvatarURL({extension: "png"})
                })
                .setTitle(`Nu ai inca un clan creat!`)
                .setDescription("Foloseste butonul `Creeaza Clan` si urmeaza pasii pentru a avea unul.");

            try{
                await message.edit({
                    embeds: [emptyClanEmbed],
                    components: [mainMenuRow]
                })
            } catch(err) {console.error(err);};

            await buttonInteraction.editReply({
                flags: MessageFlags.Ephemeral,
                content: "You no longer have a clan."
            });

            collector.stop();

        }
    });

    collector.on("end", async () => {
        try{
            await reply.delete();
        } catch(err) {};
    });
}

async function modify_clan_button(interaction, message) {
    
    const {rows: clanData} = await poolConnection.query(`SELECT * FROM clan WHERE guild=$1 AND owner=$2`,
        [interaction.guild.id, interaction.user.id]
    );

    if(clanData.length == 0) {
        return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "This is a bug, you shouldn't be able to do this without a clan!"
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
        voice: null,
        textChannel: null
    }

    try{
        clanObj.ownerRole = await interaction.guild.roles.fetch(clanData[0].ownerrole);
    } catch(err) {
        console.error(`Something went wrong with the owner role ${clanData[0].ownerrole}\n${err}`)
        return await interaction.editReply({
            flags: MessageFlags.Ephemeral,
            content: "The owner role data is faulty"
        });
    }

    try{
        clanObj.clanRole = await interaction.guild.roles.fetch(clanData[0].clanrole);
    } catch(err) {
        console.error(`Something went wrong with the clan role ${clanData[0].clanrole}\n${err}`)
        return await interaction.editReply({
            flags: MessageFlags.Ephemeral,
            content: "The clan role data is faulty"
        });
    }

    if(clanData[0].voicechannel) {
        try{
            clanObj.voice = await interaction.guild.channels.fetch(clanData[0].voicechannel)
        } catch(err) {}
    }

    if(clanData[0].textchannel) {
        try{
            clanObj[0].textchannel = await interaction.guild.channels.fetch(clanData[0].textchannel)
        } catch(err) {};
    }

    // opening the modify menu where members can change or create new aspects about their roles and channels

    // fetching the category
    const {rows: categoryData} = await poolConnection.query(`SELECT category FROM clansystem WHERE guild=$1`,
        [interaction.guild.id]
    );

    let category = null;

    try{
        category = await interaction.guild.channels.fetch(categoryData[0].category);
    } catch(err) {
        console.error(`The category supporter data si faulty\n${err}`);
        return await interaction.editReply({
            content: "There is something wrong with the category data...."
        });
    }

    // buttons

    const clanName = new ButtonBuilder()
        .setCustomId("clan-name-button")
        .setLabel("Clan Name")
        .setStyle(ButtonStyle.Primary)

    const roleColor = new ButtonBuilder()
        .setCustomId("role-color-button")
        .setLabel("Role Color")
        .setStyle(ButtonStyle.Primary)

    const roleIcon = new ButtonBuilder()
        .setCustomId("role-icon-button")
        .setLabel("Role Icon")
        .setStyle(ButtonStyle.Primary)

    const textChannelName = new ButtonBuilder()
        .setLabel("Text Channel")
        .setCustomId("text-channel-button")
        .setStyle(ButtonStyle.Primary)

    const voiceChannelName = new ButtonBuilder()
        .setLabel("Voice Channel")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("voice-channel-button")

    const firstRow = new ActionRowBuilder()
        .addComponents(clanName, roleColor, roleIcon);

    const secondRow = new ActionRowBuilder()
        .addComponents(textChannelName, voiceChannelName);

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor("Purple")
                .setTitle("Clan Manager")
                .setFields(
                    {
                        name: "Clan Name",
                        value: "Schimba numele clanului si implicit al rolurilor."
                    },
                    {
                        name: "Role Color",
                        value: "Seteaza noua culoare a rolurilor."
                    },
                    {
                        name: "Role Icon",
                        value: "Incarca o imagine pentru iconita rolului (maxim 256KB)."
                    },
                    {
                        name: "Text Channel",
                        value: "Creeaza/modifica numele canalului text"
                    },
                    {
                        name: "Voice Channel",
                        value: "Creeaza/modifica numele canalului de voce."
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
                content: `The buttons are on cooldown! <t:${parseInt(userCooldown / 1000)}:R>`
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

                    await poolConnection.query(`UPDATE clan SET clanname=$1
                        WHERE guild=$2 AND owner=$3`,
                        [clanObj.clanname, interaction.guild.id, interaction.user.id]
                    ); // updating the clan name in database


                    // updating the roles
                    await clanObj.ownerRole.edit({
                        name: clanObj.clanname
                    });

                    await clanObj.clanRole.edit({
                        name: clanObj.clanname
                    });

                    // updating the message
                    try{
                        await message.edit({
                            embeds: [clanEmbedBuilder(clanObj)]
                        });
                    } catch(err) {};

                    await submit.reply({
                        flags: MessageFlags.Ephemeral,
                        content: `Clan name changed to **${clanObj.clanname}**.`
                    });
                } catch(err) {
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Time ran out, try again."
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
                            content: "Invalid input, a hexcolor should look like this `2596be`."
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
                        await message.edit({
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
                        content: "Time ran out, try again."
                    });
                }
            break;
            case "role-icon-button":
                await buttonInteraction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: "Send the desired image icon in the current channel.\nFile size must be less than `256KB`!"
                });

                const filterMessage = (msg) => msg.author.id === interaction.user.id // accept only the user input

                const messageCollector = interaction.channel.createMessageCollector({
                    filter: filterMessage,
                    max: 1,
                    time: 60_000
                });

                messageCollector.on("collect", async (msg) => {
                    // message must have the image icon attached
                    if(msg.attachments.size == 0) {
                        return await buttonInteraction.followUp({
                            flags: MessageFlags.Ephemeral,
                            content: "No image was provided, try again!"
                        });
                    }

                    const imageAttachment = await msg.attachments.first();

                    if(!imageAttachment.contentType.includes("image")) {
                        return await buttonInteraction.followUp({
                            flags: MessageFlags.Ephemeral,
                            content: "Invalid file format!"
                        });
                    }

                    if(imageAttachment.size > 262_100) {
                        return await buttonInteraction.followUp({
                            flags: MessageFlags.Ephemeral,
                            content: "The image is too large! Upload an image below `256KB`!"
                        });
                    }

                    try{
                        await clanObj.ownerRole.edit({
                            icon: imageAttachment.url
                        });
                    } catch (err) {
                        return await buttonInteraction.followUp({
                            flags: MessageFlags.Ephemeral,
                            content: "Sorry, it seems like this server lacks the level of boost needed for this action!"
                        });
                    }
                    

                    try{
                        await message.edit({
                            embeds: [clanEmbedBuilder(clanObj)]
                        });
                    } catch(err) {};

                    try{
                        await msg.delete();
                    } catch(err) {};

                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Role icon changed."
                    });
                });

                messageCollector.on("end", async (collected) => {
                    if(collected.size === 0) {
                        await buttonInteraction.followUp({
                            flags: MessageFlags.Ephemeral,
                            content: "No image was provided in the timeframe given!"
                        });
                    }
                });
            break;
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

                        await submit.editReply({
                            flags: MessageFlags.Ephemeral,
                            content: `Channel name changed ${clanObj.textChannel}`
                        });
                    } else {
                        // creating the channel
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
                                }
                            ]
                        });

                        // register the channel in the database
                        await poolConnection.query(`UPDATE clan SET textchannel=$1 WHERE guild=$2 AND owner=$3`,
                            [clanObj.textChannel.id, interaction.guild.id, interaction.user.id]
                        );

                        await submit.editReply({
                            content: `Channel created ${clanObj.textChannel}`
                        });

                    }
                } catch(err) {
                    console.error(err); // to be removed
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Time ran out, try again!"
                    });
                }

                try{
                    await message.edit({
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
                    if(clanObj.voice) {
                        await clanObj.voicechannel.edit({
                            name: textName
                        });

                        await submit.editReply({
                            flags: MessageFlags.Ephemeral,
                            content: `Channel name changed ${clanObj.voicechannel}`
                        });
                    } else {
                        // creating the channel
                        clanObj.voice = await category.children.create({
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
                                }
                            ]
                        });

                        // register the channel in the database
                        await poolConnection.query(`UPDATE clan SET voicechannel=$1 WHERE guild=$2 AND owner=$3`,
                            [clanObj.voice.id, interaction.guild.id, interaction.user.id]
                        );

                        await submit.editReply({
                            content: `Channel created ${clanObj.voice}`
                        });

                    }
                } catch(err) {
                    console.error(err); // to be removed
                    await buttonInteraction.followUp({
                        flags: MessageFlags.Ephemeral,
                        content: "Time ran out, try again!"
                    });
                }

                try{
                    await message.edit({
                        embeds: [
                            clanEmbedBuilder(clanObj)
                        ]
                    });
                } catch(err) {};
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
                content: `The buttons are on cooldown! <t:${parseInt(userCooldown / 1000)}:R>`
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
            await message.delete();
        } catch(err){};
    });
}

async function main_menu(interaction, owner) {
    const reply = await interaction.deferReply({flags: MessageFlags.Ephemeral});
    let mainEmbed = new EmbedBuilder()
        .setColor("Aqua")
        .setAuthor({
            name: `${owner.user.username}'s clan profile`,
            iconURL: owner.displayAvatarURL({extension: "png"})
        })

    const {rows: clanOwnerData} = await poolConnection.query(`SELECT * FROM clan WHERE guild=$1 AND owner=$2`,
        [owner.guild.id, owner.id]
    );

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
            console.error(`Something went wrong fetching the clan role ${clanOwnerData[0].clanrole}\n${err}`);
            return await reply.edit("Something went wrong while fetching the clan role...");
        }

        clanObj.clanRole = clanRole;

        let ownerRole = null;

        try{
            ownerRole = await owner.guild.roles.fetch(clanOwnerData[0].ownerrole);
        } catch(err) {
            console.error(`Something went wrong fetching the owner role ${clanOwnerData[0].ownerrole}\n${err}`);
            return await reply.edit("Something went wrong while fetching the owner role...");
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
            } catch(err) {};

            clanObj.textChannel = textChannel
        }

        mainEmbed = clanEmbedBuilder(clanObj);
    }

    await reply.edit({
        embeds: [mainEmbed],
        components: [mainMenuRow]
    });

    await main_menu_collector(reply, owner);
}

async function send_invite(interaction, owner, member) {
    const clanObj = await clanObjBuilder(owner.guild, owner);

    if(!clanObj) {
        return await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "Faulty database..."
        });
    }

    const inviteEmbed = clanEmbedBuilder(clanObj);

    inviteEmbed.setAuthor({
        name: `${owner.user.username} a trimis o invitatie de clan catre ${member.user.username}`,
        iconURL: owner.displayAvatarURL({extension: "png"})
    });

    // buttons
    const confirmInvite = new ButtonBuilder()
        .setCustomId("confirm-invite")
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Success)

    const denyInvite = new ButtonBuilder()
        .setCustomId("deny-invite")
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)

    const actionRow = new ActionRowBuilder()
        .addComponents(confirmInvite, denyInvite);

    const reply = await interaction.reply({
        embeds: [
            inviteEmbed
        ],
        content: `${member} ai primit o invitatie de la clanul **${clanObj.clanname}**`,
        components: [actionRow]
    });

    const collector = reply.createMessageComponentCollector({
        ComponentType: ComponentType.Button,
        time: 86_400_000, // 24h
        filter: (i) => i.user.id === member.id // only the invited member can use the buttons
    });

    collector.on("collect", async (buttonInteraction) => {
        if(!buttonInteraction.isButton()) return;
        if(buttonInteraction.customId == "confirm-invite") {
            try{
                await member.roles.add(clanObj.clanRole);
            } catch(err) {
                console.error(err);
            }

            try{
                await reply.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Aqua")
                            .setAuthor({
                                name: `${member.user.username} a acceptat invitatia in ${clanObj.clanname}`,
                                iconURL: member.displayAvatarURL({extension: "png"}) 
                            })
                            .setDescription(
                                `${member} este al ${clanObj.clanRole.members.size + 1}-lea membru din clanul **${clanObj.clanname}**`
                            )
                    ],
                    components: [],
                    content: "Invitatie acceptata"
                });
            } catch(err) {};

            await buttonInteraction.reply({
                flags: MessageFlags.Ephemeral,
                content: `You are now a clan member of **${clanObj.clanname}**!`
            });
        } else if(buttonInteraction.customId == "deny-invite") {
            await buttonInteraction.reply({
                flags: MessageFlags.Ephemeral,
                content: "You denied the clan invitation!"
            });

            collector.stop();
        }
    });

    collector.on("end", async () => {
        try{
            await reply.delete();
        } catch(err) {};
    });
}

module.exports = {
    main_menu,
    main_menu_collector,
    send_invite,
    clanObjBuilder,
    clanEmbedBuilder
}