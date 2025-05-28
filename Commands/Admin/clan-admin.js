const {SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType} = require("discord.js");
const {poolConnection} = require("../../utility_modules/kayle-db.js");

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName("clan-admin")
        .setDescription("Administrate the clan system")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand.setName("set")
                .setDescription("Set the clan supporter role and the category for clan channels")
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("The role to be defined as supporter role.")
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("The category")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName("clear")
                .setDescription("Clear the current setup.")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("info")
                .setDescription("Info about the clain setup")
        )
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup.setName("assign")
                .setDescription("Assign supporter features to a member or supporter")
                .addSubcommand(subcommand =>
                    subcommand.setName("roles")
                        .setDescription("Assign the associated clan roles to a member")
                        .addUserOption(option =>
                            option.setName("member")
                                .setDescription("The targeted member.")
                                .setRequired(true)
                        )
                        .addRoleOption(option =>
                            option.setName("ownerrole")
                                .setDescription("The custom role of the supporter.")
                                .setRequired(true)
                        )
                        .addRoleOption(option =>
                            option.setName("clanrole")
                                .setDescription("The clan role of the member")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand.setName("channels")
                        .setDescription("Assign channels to the targeted clan owner.")
                        .addUserOption(option =>
                            option.setName("member")
                                .setDescription("The clan owner.")
                                .setRequired(true)
                        )
                        .addChannelOption(option =>
                            option.setName("text-channel")
                                .setDescription("The text channel to be assigned")
                                .addChannelTypes(ChannelType.GuildText)
                        )
                        .addChannelOption(option =>
                            option.setName("voice-channel")
                                .setDescription("The voice channel to be assigned.")
                                .addChannelTypes(ChannelType.GuildVoice)
                        )
                )
        ),

    async execute(interaction, client) {
        const botMember = await interaction.guild.members.fetchMe();
        const cmd = interaction.options.getSubcommand();
        const user = interaction.options.getUser("member") || null;
        let member = null;

        if(user) {
            try{
                member = await interaction.guild.members.fetch(user.id);
            } catch(err) {
                return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: "The member provided is not a member of this server!"
                });
            }

            if(user.bot) {
                return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: "You can not target bots with this command!"
                });
            }
        }

        const {rows: clanSystemDataValue} = await poolConnection.query(`SELECT * FROM clansystem WHERE guild=$1`,
            [interaction.guild.id]
        );

        if(clanSystemDataValue.length == 0 && (cmd == "roles" || cmd == "channels")) {
            return await interaction.reply({
                flags: MessageFlags.Ephemeral,
                content: "You can not do that before using `/clan-admin set`!"
            });
        }

        switch(cmd) {
            case "roles":
                const ownerRole = interaction.options.getRole("ownerrole");
                const clanRole = interaction.options.getRole("clanrole");

                if(ownerRole.id == clanRole.id) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Faulty input")
                                .setDescription("You can not set the same role for both ownerrole and clanrole!")
                        ]
                    });
                }

                if(ownerRole.managed || clanRole.managed) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not target bot roles!"
                    });
                }
                // checking if the bot has perms to assign these roles
                if(ownerRole.position >= botMember.roles.highest.position
                    || clanRole.position >= botMember.roles.highest.position) {
                        return await interaction.reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                new EmbedBuilder()
                                    .setColor("Red")
                                    .setTitle("I lack permission!")
                                    .setDescription("The role provided is higher than mine!")
                            ]
                        });
                }
                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });
                // in case the member does not have supporter role, will be given
                const clanSupporterRole = await interaction.guild.roles.fetch(clanSystemDataValue[0].role);

                await member.roles.add(clanSupporterRole);
                await member.roles.add(ownerRole);

                // in case the member is already in the database, its row will be cleared before replacement
                await poolConnection.query(`DELETE FROM clan WHERE guild=$1 AND owner=$2`,
                    [interaction.guild.id, member.id]
                );

                await poolConnection.query(`INSERT INTO clan(guild, owner, clanname, ownerrole, clanrole)
                    VALUES($1, $2, $3, $4, $5)`,
                    [interaction.guild.id, member.id, ownerRole.name, ownerRole.id, clanRole.id]
                );

                await interaction.editReply({
                    content: `${member} has been assiged with clan owner role ${ownerRole} and clan role ${clanRole}.`
                });

            break;
            case "channels":
                const {rows: isSupporter} = await poolConnection.query(`SELECT EXISTS
                    (SELECT 1 FROM clan WHERE guild=$1 AND owner=$2)`,
                    [interaction.guild.id, member.id]
                );

                if(!isSupporter[0].exists) {
                    // only supporters registered can be assigned channels
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Invalid member")
                                .setDescription("The member provided is not registered as a clan owner, use `assign roles` first")
                        ]
                    });
                }

                const textchannel = interaction.options.getChannel("text-channel") || null;
                const voicechannel = interaction.options.getChannel("voice-channel") || null;

                if(textchannel == null && voicechannel == null) {
                    // either or both can be assigned, but not none
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Lack of input")
                                .setDescription("Either channel or both can be assigned, but no input is invalid!")
                        ]
                    });
                }

                const clanCategory = await interaction.guild.channels.fetch(clanSystemDataValue[0].category);

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                let replyString = `${member} has been assigned with `;

                if(textchannel) {
                    if(textchannel.parent.id != clanCategory.id) {
                        return await interaction.editReply({
                            content: `The text channel provided is not from ${clanCategory}`
                        });
                    }
                    replyString += `${textchannel}`
                    await poolConnection.query(`UPDATE clan SET textchannel=$1 WHERE guild=$2 AND owner=$3`,
                        [textchannel.id, interaction.guild.id, member.id]
                    );
                }

                if(voicechannel) {
                    if(voicechannel.parent.id != clanCategory.id) {
                        return await interaction.editReply({
                            content: `The voice channel provided is not from ${clanCategory}`
                        });
                    }
                    replyString += `${voicechannel}`
                    await poolConnection.query(`UPDATE clan SET voicechannel=$1 WHERE guild=$2 AND owner=$3`,
                        [voicechannel.id, interaction.guild.id, member.id]
                    );
                }

                await interaction.editReply({
                    content: replyString
                });
            break;
            case "set":
                // check if a pair role-category already exists for this server
                const {rows: clanSystemBool} = await poolConnection.query(`SELECT EXISTS
                    (SELECT 1 FROM clansystem WHERE guild=$1)`, [interaction.guild.id]);

                if(clanSystemBool[0].exists) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Error")
                                .setDescription("A setup already exists for this system run `/clan-admin clear` and try again.")
                        ]
                    });
                }

                // if it doesn't exist, register the input
                const role = interaction.options.getRole("role");
                if(role.position >= botMember.roles.highest.position) {
                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("I lack permission!")
                                .setDescription("The role provided is higher than mine!")
                        ]
                    });
                }
                if(role.managed) {
                    return interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: "You can not target bot roles!"
                    })
                }
                const category = interaction.options.getChannel("channel");
                await poolConnection.query(`INSERT INTO clansystem(guild, role, category)
                    VALUES($1, $2, $3)`,
                    [interaction.guild.id, role.id, category.id]
                );

                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Green")
                            .setTitle("Clan system set up successfully")
                            .addFields(
                                {
                                    name: "Supporter role",
                                    value: `${role}`,
                                    inline: true
                                },
                                {
                                    name: "Category",
                                    value: `${category}`,
                                    inline: true
                                }
                            )
                    ]
                });

            break;
            case "clear":
                await poolConnection.query(`DELETE FROM clansystem WHERE guild=$1`, [interaction.guild.id]);
                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Green")
                            .setTitle("Clan system cleared!")
                            .setDescription("The setup was cleared, you can set up another role-category pair.")
                    ]
                });
            break;
            case "info":
                await interaction.deferReply({flags: MessageFlags.Ephemeral});
                // fetching the data
                const {rows: clanSystemData} = await poolConnection.query(`SELECT * FROM clansystem WHERE guild=$1`, [interaction.guild.id]);
                if(clanSystemData.length == 0) {
                    return await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Purple")
                                .setTitle("No setup was found")
                                .setDescription("Nothing to be found here, use `/clan-admin set` first.")
                        ]
                    });
                }
                // counting how many clans exist
                const {rows: [{count}]} = await poolConnection.query(`SELECT COUNT(*) AS count FROM clan WHERE guild=$1`,
                    [interaction.guild.id]
                );

                let supporterRole = null;
                let categoryChannel = null;

                try{
                    supporterRole = await interaction.guild.roles.fetch(clanSystemData[0].role);
                    categoryChannel = await interaction.guild.channels.fetch(clanSystemData[0].category);
                } catch(err) {
                    console.error(err);
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("Faulty data")
                                .setDescription("The role and/or category might no longer exist, try clearing and setting it up again.")
                        ]
                    });
                }

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Purple")
                            .setAuthor({
                                name: `${interaction.guild.name}'s clan system`,
                                iconURL: interaction.guild.iconURL({extension: "png"})
                            })
                            .addFields(
                                {
                                    name: "Supporter Role",
                                    value: `${supporterRole}`,
                                    inline: true
                                },
                                {
                                    name: "Category",
                                    value: `${categoryChannel}`,
                                    inline: true
                                },
                                {
                                    name: "Clan Count",
                                    value: `\`${count}\``
                                }
                            )
                    ]
                });
            break;
        }
    }
}