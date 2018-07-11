const Observable = require('rxjs').Observable;

module.exports = {
  name: 'help',
  description: 'See all commands that I can do',

  services: {
    core: [
      'commandService',
      'permissionsService',
    ],
  },

  run (context, response) {
    response.type = 'embed';
    response.content = "Here's everything that I can do for you. If you want more help on a specific command, add '--help' to the command ";

    return Observable.from(Object.values(this.commandService.commands))
      .flatMap((command) => this.commandService.filterCommandEnabled(context.guild.id, command.name).map(() => command))
      .flatMap((command) => this.permissionsService.filterHasPermission(context, command.name).map(() => command))
      .toArray()
      .flatMap((allowedCommands) => {
        let commandsByModule = {};

        allowedCommands.forEach((command) => {
          if (!commandsByModule[command.moduleName]) { commandsByModule[command.moduleName] = []; }
          commandsByModule[command.moduleName].push(command);
        });

        Object.entries(commandsByModule).forEach(([moduleName, commands]) => {
          let prefix = this.commandService.getPrefix(context.guild.id);
          let commandList = [];
          commands.forEach((command) => commandList.push(`*${prefix}${command.name}*\n\t${command.description}`));
          response.embed.addField(moduleName, commandList.join('\n'));
        });

        return response.send();
      });
  },
};
