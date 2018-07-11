const Observable = require('rxjs').Observable;

module.exports = {
  name: 'enabled?',
  description: 'check if a command is enabled',

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
      description: 'The name of the command to check',
    },
  ],

  run (context) {
    let commandName = context.args.input1;

    return this.commandService
      .isCommandEnabled(context.guild.id, commandName)
      .map((isEnabled) => {
        return {
          status: 200,
          content: `command ${commandName} ${isEnabled ? 'is enabled' : 'is disabled'}.`,
        };
      })
      .catch((error) => {
        switch (error.name) {
          case "CommandNotFoundError":
            return Observable.of({ status: 400, content: error.message });
          default:
            return Observable.throw(error);
        }
      });
  },
};
