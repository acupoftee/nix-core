const Observable = require('rxjs').Observable;

module.exports = {
  name: 'disable',
  description: 'explicitly disable a command',

  services: {
    core: [
      'commandService',
    ],
  },

  inputs: [
    {
      name: 'command',
      required: true,
      type: 'string',
      description: 'The name of the command to disable',
    },
  ],

  run (context) {
    let commandName = context.inputs.command;
    let guild = context.guild;

    return this.commandService.disableCommand(guild.id, commandName)
      .map((isEnabled) => {
        if (!isEnabled) {
          return {
            status: 200,
            content: `${commandName} has been disabled`,
          };
        }
        else {
          return {
            status: 500,
            content: `Unable to disable ${commandName}`,
          };
        }
      })
      .catch((error) => {
        switch (error.name) {
          case 'CommandNotFoundError':
          case 'ReqCommandError':
            return Observable.of({status: 400, content: error.message});
          default:
            return Observable.throw(error);
        }
      });
  },
};
