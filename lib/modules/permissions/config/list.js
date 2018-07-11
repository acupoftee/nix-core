const Observable = require('rxjs').Observable;
const Discord = require('discord.js');

module.exports = {
  name: 'list',
  description: 'list available permission levels',

  services: {
    core: [
      'permissionsService',
    ],
  },


  run(context) {
    let embed = new Discord.RichEmbed();
    embed.addField("Bot Owner\* - *bypasses permissions*", context.nix.owner.tag);
    embed.addField("Guild Owner\* - *bypasses permissions*", context.guild.owner.user.tag);
    embed.setFooter('* Unassignable');

    return Observable
      .from(this.permissionsService.levels)
      .flatMap((level) =>
        this.permissionsService
          .getPermissionsData(context.guild.id, level)
          .do((savedData) => savedData.name = level) // The level name isn't saved in the datasource, add it here
      )
      .map((level) => {
        let userList = level.users
          .map((id) => context.guild.members.get(id))
          .map((member) => member.user.tag)
          .join(', ');
        let roleList = level.roles
          .map((id) => context.guild.roles.get(id))
          .map((role) => role.name)
          .join(', ');

        embed.addField(level.name, `**Users**: ${userList}\n**Roles**: ${roleList}`);
      })
      .last()
      .map(() => {
        return {
          status: 200,
          content: 'Here are the available permission levels:',
          embed: embed,
        };
      });
  },
};
