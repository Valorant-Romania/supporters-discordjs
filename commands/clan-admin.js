const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require("discord.js");
const {
  getClanSystem,
  deleteClan,
  createClan,
  updateClanTextChannel,
  updateClanVoiceChannel,
  createClanSystem,
  clearClanSystem,
  getClanByOwner,
  updateClanOwner,
  countClans
} = require("../database.js");

// Helper utilities
function buildEmbed(color, title, description, fields) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  if (description) embed.setDescription(description);
  if (fields && fields.length) embed.addFields(...fields);
  return embed;
}

function errReply(interaction, { title, desc }) {
  return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [buildEmbed("Red", title, desc)] });
}

module.exports = {
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName("clan-admin")
    .setDescription("Administreaza sistemul de clanuri")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("Seteaza rolul de sustinator al clanului si categoria pentru canalele clanului")
        .addRoleOption(o => o.setName("role").setDescription("Rolul care va fi definit ca rol de sustinator.").setRequired(true))
        .addChannelOption(o => o.setName("channel").setDescription("Categoria").setRequired(true).addChannelTypes(ChannelType.GuildCategory))
    )
    .addSubcommand(sub => sub.setName("clear").setDescription("Sterge configuratia curenta."))
    .addSubcommand(sub => sub.setName("info").setDescription("Informatii despre configuratia clanului"))
    .addSubcommandGroup(group =>
      group.setName("assign")
        .setDescription("Atribuie functiile de sustinator unui membru sau sustinator")
        .addSubcommand(sub =>
          sub.setName("roles")
            .setDescription("Atribuie rolurile asociate clanului unui membru")
            .addUserOption(o => o.setName("member").setDescription("Membrul vizat.").setRequired(true))
            .addRoleOption(o => o.setName("ownerrole").setDescription("Rolul personalizat al sustinatorului.").setRequired(true))
            .addRoleOption(o => o.setName("clanrole").setDescription("Rolul de clan al membrului").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("channels")
            .setDescription("Atribuie canale proprietarului de clan selectat.")
            .addUserOption(o => o.setName("member").setDescription("Proprietarul clanului.").setRequired(true))
            .addChannelOption(o => o.setName("text-channel").setDescription("Canalul text care va fi atribuit").addChannelTypes(ChannelType.GuildText))
            .addChannelOption(o => o.setName("voice-channel").setDescription("Canalul vocal care va fi atribuit.").addChannelTypes(ChannelType.GuildVoice))
        )
    )
    .addSubcommand(sub =>
      sub.setName("delete")
        .setDescription("Sterge un anumit clan.")
        .addUserOption(o => o.setName("owner").setDescription("Proprietarul clanului care va fi sters.").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("transfer-ownership")
        .setDescription("Transfera fortat proprietatea clanului de la un membru la altul.")
        .addUserOption(o => o.setName("current-owner").setDescription("Proprietarul actual al clanului.").setRequired(true))
        .addUserOption(o => o.setName("new-owner").setDescription("Membrul care va primi proprietatea.").setRequired(true))
    ),

  async execute(interaction, _client) {
    const botMember = await interaction.guild.members.fetchMe();
    const cmd = interaction.options.getSubcommand();
    const user = interaction.options.getUser("member") || null;
    let member = null;

    if (user) {
      try { member = await interaction.guild.members.fetch(user.id); }
      catch { return errReply(interaction, { title: "Membru invalid", desc: "Membrul furnizat nu este membru pe acest server!" }); }
      if (user.bot) return errReply(interaction, { title: "Input invalid", desc: "Nu poti viza boti cu aceasta comanda!" });
    }

    const clanSystemDataValue = await getClanSystem(interaction.guild.id);
    if (clanSystemDataValue.length === 0 && ["roles", "channels"].includes(cmd)) {
      return errReply(interaction, { title: "Configuratie lipsa", desc: "Nu poti face asta inainte sa folosesti `/clan-admin set`!" });
    }

    switch (cmd) {
      case "roles": {
        const ownerRole = interaction.options.getRole("ownerrole");
        const clanRole = interaction.options.getRole("clanrole");
        if (ownerRole.id === clanRole.id) return errReply(interaction, { title: "Input invalid", desc: "Nu poti seta acelasi rol pentru ownerrole si clanrole!" });
        if (ownerRole.managed || clanRole.managed) return errReply(interaction, { title: "Input invalid", desc: "Nu poti viza roluri de bot!" });
        if (ownerRole.position >= botMember.roles.highest.position || clanRole.position >= botMember.roles.highest.position)
          return errReply(interaction, { title: "Nu am permisiunea", desc: "Rolul furnizat este mai sus decat al meu!" });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const clanSupporterRole = await interaction.guild.roles.fetch(clanSystemDataValue[0].role);
        await member.roles.add(clanSupporterRole);
        await member.roles.add(ownerRole);
        await deleteClan(interaction.guild.id, member.id);
        await createClan(interaction.guild.id, member.id, ownerRole.name, ownerRole.id, clanRole.id);
        await interaction.editReply({ content: `${member} a primit rolul de proprietar ${ownerRole} si rolul de clan ${clanRole}.` });
        break; }

      case "channels": {
        const isOwner = (await getClanByOwner(interaction.guild.id, member.id)).length > 0;
        if (!isOwner) return errReply(interaction, { title: "Membru invalid", desc: "Membrul furnizat nu este inregistrat ca proprietar de clan, foloseste mai intai `assign roles`." });
        const textchannel = interaction.options.getChannel("text-channel") || null;
        const voicechannel = interaction.options.getChannel("voice-channel") || null;
        if (!textchannel && !voicechannel) return errReply(interaction, { title: "Lipsa de optiuni", desc: "Poti atribui unul sau ambele canale, dar trebuie ales cel putin unul!" });
        const clanCategory = await interaction.guild.channels.fetch(clanSystemDataValue[0].category);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const assigned = [];
        if (textchannel) {
          if (!textchannel.parent || textchannel.parent.id !== clanCategory.id) return interaction.editReply({ content: `Canalul text furnizat nu apartine categoriei ${clanCategory}` });
          if (textchannel.type !== ChannelType.GuildText) return interaction.editReply({ content: "Canalul selectat nu este un canal text valid." });
          assigned.push(`${textchannel}`);
          await updateClanTextChannel(interaction.guild.id, member.id, textchannel.id);
        }
        if (voicechannel) {
          if (!voicechannel.parent || voicechannel.parent.id !== clanCategory.id) return interaction.editReply({ content: `Canalul vocal furnizat nu apartine categoriei ${clanCategory}` });
          if (voicechannel.type === ChannelType.GuildStageVoice) return interaction.editReply({ content: "Canalele de tip Stage nu sunt acceptate. Alege un canal vocal standard." });
          if (voicechannel.type !== ChannelType.GuildVoice) return interaction.editReply({ content: "Canalul selectat nu este un canal vocal valid." });
          assigned.push(`${voicechannel}`);
          await updateClanVoiceChannel(interaction.guild.id, member.id, voicechannel.id);
        }
        await interaction.editReply({ content: `${member} a primit ${assigned.join(" si ")}.` });
        break; }

      case "set": {
        const role = interaction.options.getRole("role");
        const category = interaction.options.getChannel("channel");
        if (role.position >= botMember.roles.highest.position) return errReply(interaction, { title: "Nu am permisiunea", desc: "Rolul furnizat este mai sus decat al meu, nu il pot gestiona." });
        if (role.managed) return errReply(interaction, { title: "Input invalid", desc: "Nu poti folosi un rol administrat de un bot pentru sistemul de clanuri." });
        try {
          const fetchedChannel = await interaction.guild.channels.fetch(category.id);
          if (fetchedChannel.type !== ChannelType.GuildCategory) throw new Error("Canalul selectat nu este o categorie valida.");
        } catch (err) {
          console.error("Validation failed during /clan-admin set:", err);
          return errReply(interaction, { title: "Verificare esuata!", desc: `Nu am putut verifica existenta sau accesul la categoria selectata. Eroare: \`${err.message}\`` });
        }
        await clearClanSystem(interaction.guild.id);
        await createClanSystem(interaction.guild.id, role.id, category.id);
        await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [buildEmbed("Green", "Sistemul de clanuri a fost configurat cu succes", null, [
          { name: "Rolul de sustinator", value: `${role}`, inline: true },
          { name: "Categoria", value: `${category}`, inline: true }
        ])] });
        break; }

      case "clear": {
        await clearClanSystem(interaction.guild.id);
        await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [buildEmbed("Green", "Sistemul de clanuri a fost resetat!", "Configuratia a fost stearsa, poti seta un nou cuplu rol-categorie.")] });
        break; }

      case "info": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const clanSystemData = await getClanSystem(interaction.guild.id);
        if (clanSystemData.length === 0) return interaction.editReply({ embeds: [buildEmbed("Purple", "Nu a fost gasita nicio configuratie", "Nu exista nicio configuratie, foloseste mai intai `/clan-admin set`.")] });
        const count = await countClans(interaction.guild.id);
        let supporterRole, categoryChannel;
        try {
          supporterRole = await interaction.guild.roles.fetch(clanSystemData[0].role);
          categoryChannel = await interaction.guild.channels.fetch(clanSystemData[0].category);
        } catch (err) {
          console.error(err);
          return interaction.editReply({ embeds: [buildEmbed("Red", "Date invalide", "Rolul sau categoria s-ar putea sa nu mai existe, incearca sa stergi configuratia si sa o refaci.")] });
        }
        const embed = new EmbedBuilder()
          .setColor("Purple")
          .setAuthor({ name: `Sistemul de clanuri al ${interaction.guild.name}`, iconURL: interaction.guild.iconURL({ extension: "png" }) })
          .addFields(
            { name: "Rol de sustinator", value: `${supporterRole}`, inline: true },
            { name: "Categoria", value: `${categoryChannel}`, inline: true },
            { name: "Numar de clanuri", value: `\`${count}\`` }
          );
        await interaction.editReply({ embeds: [embed] });
        break; }

      case "delete": {
        const ownerToDelete = interaction.options.getUser("owner");
        const ownerMemberToDelete = await interaction.guild.members.fetch(ownerToDelete.id);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const clanToDelete = await getClanByOwner(interaction.guild.id, ownerMemberToDelete.id);
        if (!clanToDelete.length) return interaction.editReply({ content: `${ownerMemberToDelete} nu detine un clan.` });
        const clanData = clanToDelete[0];
        try { const ownerRole = await interaction.guild.roles.fetch(clanData.ownerrole); if (ownerRole) await ownerRole.delete("Clan sters de administrator."); } catch {/* ignore */}
        try { const clanRole = await interaction.guild.roles.fetch(clanData.clanrole); if (clanRole) await clanRole.delete("Clan sters de administrator."); } catch {/* ignore */}
        if (clanData.textchannel) { try { const tc = await interaction.guild.channels.fetch(clanData.textchannel); if (tc) await tc.delete("Clan sters de administrator."); } catch {/* ignore */} }
        if (clanData.voicechannel) { try { const vc = await interaction.guild.channels.fetch(clanData.voicechannel); if (vc) await vc.delete("Clan sters de administrator."); } catch {/* ignore */} }
        await deleteClan(interaction.guild.id, ownerMemberToDelete.id);
        await interaction.editReply({ content: `Clanul detinut de ${ownerMemberToDelete} a fost sters.` });
        break; }

      case "transfer-ownership": {
        const currentOwnerUser = interaction.options.getUser("current-owner");
        const newOwnerUser = interaction.options.getUser("new-owner");
        if (currentOwnerUser.id === newOwnerUser.id) return errReply(interaction, { title: "Input invalid", desc: "Proprietarul actual si noul proprietar nu pot fi aceeasi persoana." });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const newOwnerHasClan = await getClanByOwner(interaction.guild.id, newOwnerUser.id);
        if (newOwnerHasClan.length > 0) return interaction.editReply({ content: `${newOwnerUser.username} detine deja un clan si nu poate avea mai mult de unul.` });
        const currentOwnerMember = await interaction.guild.members.fetch(currentOwnerUser.id);
        const newOwnerMember = await interaction.guild.members.fetch(newOwnerUser.id);
        const clanToTransfer = await getClanByOwner(interaction.guild.id, currentOwnerMember.id);
        if (!clanToTransfer.length) return interaction.editReply({ content: `${currentOwnerMember} nu detine un clan.` });
        const clanTransferData = clanToTransfer[0];
        const ownerRole = await interaction.guild.roles.fetch(clanTransferData.ownerrole);
        const clanRole = await interaction.guild.roles.fetch(clanTransferData.clanrole);
        if (!ownerRole || !clanRole) return interaction.editReply({ content: "Rolul de proprietar sau de membru al clanului nu a putut fi gasit. Datele clanului ar putea fi corupte." });
        await currentOwnerMember.roles.remove(ownerRole);
        await currentOwnerMember.roles.add(clanRole);
        await newOwnerMember.roles.add(ownerRole);
        await newOwnerMember.roles.remove(clanRole);
        await updateClanOwner(interaction.guild.id, currentOwnerMember.id, newOwnerMember.id);
        await interaction.editReply({ content: `Proprietatea clanului a fost transferata de la ${currentOwnerMember} la ${newOwnerMember}.` });
        break; }
    }
  }
};
