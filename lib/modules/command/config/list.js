const Observable = require('rxjs').Observable;

module.exports = {
  name: 'list',
  description: 'list all commands from all modules',
  inputs: [],

  services: {
    core: [
      'commandService',
      'moduleService',
    ],
  },

  run (context) {
    let commands = Object.values(this.commandService.commands);

    return Observable
      .from(commands)
      .flatMap((command) =>
        Observable.zip(
          Observable.of(command),
          this.commandService.isCommandEnabled(context.guild.id, command.name),
          this.moduleService.isModuleEnabled(context.guild.id, command.moduleName)
        )
      )
      .toArray()
      .map((commandData) => {
        let enabledCmds = {};
        let disabledCmds = {};

        commandData.forEach(([command, cmdEnabled, modEnabled]) => {
          if(cmdEnabled) {
            if (!enabledCmds[command.moduleName]) { enabledCmds[command.moduleName] = []; }
            enabledCmds[command.moduleName].push(`*${command.name}*\n\t\t${command.description}`);
          }
          else {
            if (!disabledCmds[command.moduleName]) { disabledCmds[command.moduleName] = []; }

            let reasons = [];
            if (!modEnabled) { reasons.push(`module '${command.moduleName}' disabled`); }
            else if (!cmdEnabled) { reasons.push(`explicitly disabled`); }

            disabledCmds[command.moduleName].push(`*${command.name}* - ${reasons.join(' | ')}\n\t\t${command.description}`);
          }
        });

        let embed = {
          fields: [],
        };

        if (Object.keys(enabledCmds).length > 0) {
          let enabledCmdList = [];
          Object.entries(enabledCmds).forEach(([moduleName, commands]) => {
            enabledCmdList.push(`**${moduleName}**\n\t${commands.join('\n\t')}`);
          });

          embed.fields.push({
            name: "Enabled Commands:",
            value: enabledCmdList.join('\n'),
          });
        }
        if (Object.keys(disabledCmds).length > 0) {
          let disabledCmdList = [];
          Object.entries(disabledCmds).forEach(([moduleName, commands]) => {
            disabledCmdList.push(`**${moduleName}**\n\t${commands.join('\n\t')}`);
          });

          embed.fields.push({
            name: "Disabled Commands:",
            value: disabledCmdList.join('\n'),
          });
        }

        return {
          status: 200,
          content: 'Here are all my available commands:',
          embed: embed,
        };
      });
  },
};
