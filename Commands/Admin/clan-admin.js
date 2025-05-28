const {SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType} = require("discord.js");
const {poolConnection} = require("../../utility_modules/kayle-db.js");

module.exports = {
    cooldown: 5,
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
        ),

    async execute(interaction, client) {
        const cmd = interaction.options.getSubcommand();

        switch(cmd) {
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