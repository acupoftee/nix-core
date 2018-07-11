const Observable = require('rxjs').Observable;

const Discord = require('discord.js');

module.exports = {
  name: 'config',
  description: 'Edit or view settings for this guild',
  permissions: ['admin'],

  services: {
    core: [
      'commandService',
      'configActionService',
      'moduleService',
    ],
  },

  flags: [
    {
      name: 'list',
      shortAlias: 'l',
      description: "List all available modules and actions",
      type: 'boolean',
      default: false,
      ignoreArgReqs: true,
    },
  ],

  args: [
    {
      name: 'module',
      description: 'the module to configure',
      required: true,
    },
    {
      name: 'action',
      description: 'the config action to perform',
      required: true,
    },
    {
      name: 'input1',
      description: 'input value',
      showInHelp: false,
      required: false,
    },
    {
      name: 'input2',
      description: 'input value',
      showInHelp: false,
      required: false,
    },
    {
      name: 'input3',
      description: 'input value',
      showInHelp: false,
      required: false,
    },
    {
      name: 'input4',
      description: 'input value',
      showInHelp: false,
      required: false,
    },
    {
      name: 'input5',
      description: 'input value',
      showInHelp: false,
      required: false,
    },
  ],

  run(context, response) {
    let moduleName = context.args.module;
    let actionName = context.args.action;

    if (context.flags.list) {
      response.type = 'embed';

      if (!moduleName) {
        response.content = context.nix.responseStrings.config.moduleList({});
        response.embed = this.moduleListEmbed(context);
      }
      else {
        response.content = context.nix.responseStrings.config.actionList({moduleName});
        try {
          response.embed = this.actionListEmbed(context, moduleName);
        }
        catch(error) {
          switch (error.name) {
            case "ModuleNotFoundError":
              return response.send({
                type: 'message',
                content: `Module ${moduleName} could not be found.`
              });
            default:
              throw error;
          }
        }
      }

      return response.send();
    }

    let action = this.configActionService.getAction(moduleName, actionName);
    if (!action) {
      response.content = context.nix.responseStrings.config.actionNotFound({
        action: actionName,
        module: moduleName,
        prefix: this.commandService.getPrefix(context.guild.id),
      });
      return response.send();
    }

    context.inputs = {};
    action.inputs.forEach((input, index) => {
      context.inputs[input.name] = context.args[`input${index + 1}`];
    });

    return Observable.of('')
      .flatMap(() => action.run(context))
      .flatMap((result) => {
        response.content = result.content;

        if (result.embed) {
          response.type = 'embed';
          response.embed = result.embed;
        }

        return response.send();
      });
  },

  moduleListEmbed(context) {
    let prefix = this.commandService.getPrefixForChannel(context.channel);
    let embed = new Discord.RichEmbed();
    embed.setDescription(`For more info: ${prefix}config \`module\` --list`);

    let moduleList = this.moduleService.modules;
    Object.values(moduleList).forEach((module) => {
      let actionList = module.configActions.map((action) => action.name);
      if (actionList.length >= 1) {
        embed.addField(module.name, actionList.join(', '));
      }
    });

    return embed;
  },

  actionListEmbed(context, moduleName) {
    let prefix = this.commandService.getPrefixForChannel(context.channel);
    let embed = new Discord.RichEmbed();

    let module = this.moduleService.getModule(moduleName);

    Object.values(module.configActions).forEach((action) => {
      let usage = `${prefix}config ${module.name} ${action.name}`;
      let description = action.description;
      let inputs = [];

      if (typeof action.inputs !== 'undefined' && action.inputs.length >= 1) {
        action.inputs.forEach((input) => {
          usage += input.required ? ` \`${input.name}\`` : ` \`(${input.name})\``;

          let inputLine = `\`${input.name}\``;
          if (!input.required) {
            inputLine += ' (optional)';
          }
          if (input.description) {
            inputLine += `: ${input.description}`;
          }
          inputs.push(inputLine);
        });
      }

      let fieldValues = [];
      if (description) {
        fieldValues.push(`*Description*:\n\t${description}`);
      }

      fieldValues.push(`*Usage*:\n\t${usage}`);

      if (inputs.length >= 1) {
        fieldValues.push(`*Inputs*:\n\t${inputs.join('\n\t')}`);
      }

      embed.addField(action.name, fieldValues.join('\n'));
    });

    return embed;
  },
};
