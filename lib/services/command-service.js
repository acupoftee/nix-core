const Rx = require('rx');
const Discord = require('discord.js');

const Service = require('../models/service');
const Response = require('../models/response');
const CommandParser = require('../utility/command-parser');

const REQUIRED_COMMANDS = ['help', 'config'];

class CommandService extends Service {
  constructor (nix) {
    super(nix);

    this.defaultPrefix = '!';
    this.prefixes = {};

    if (this.nix.config.defaultPrefix) {
      this.defaultPrefix = this.nix.config.defaultPrefix;
    }
  }

  configureService() {
    this.permissionsService = this.nix.getService('core', 'permissionsService');
    this.moduleService = this.nix.getService('core', 'moduleService');
  }

  onNixJoinGuild(guild) {
    return this.nix.getGuildData(guild.id, 'core.commandPrefix')
      .do((prefix) => this.prefixes[guild.id] = prefix)
      .do(() => this.nix.logger.debug(`Loaded prefix ${this.prefixes[guild.id]} for guild ${guild.id}`));
  }

  msgIsCommand(message) {
    let prefixes = this.getPrefixesForMessage(message);
    if (!CommandParser.isCommand(message, prefixes)) {
      return false;
    }

    let commandName = CommandParser.getCommandName(message, prefixes);

    try {
      this.nix.getCommand(commandName);
      return true;
    }
    catch (error) {
      switch (error.name) {
        case "CommandNotFoundError":
          return false;
        default:
          throw error;
      }
    }
  }

  runCommandForMsg(message) {
    this.nix.logger.debug(`=== parsing command: ${message.content}`);

    let prefixes = this.getPrefixesForMessage(message);
    let context = CommandParser.parse(this.nix, message, prefixes);
    let response = new Response(message);

    return Rx.Observable
      .of('')
      .flatMap(() => this.filterCanRunCommand(context))
      .map(() => context.command.execCommand(context, response))
      .flatMap((cmdExit) => this.nix.handleHook(cmdExit))
      .catch((error) => this.handleCmdError(error, context, response));
  }

  handleCmdError(error, context, response) {
    let userMsg$ = response.send({
      type: 'message',
      content: this.nix.responseStrings.commandRun.unhandledException.forUser({
        owner: this.nix.owner,
      }),
    });

    let ownerMsg$ = this.nix.handleError(error, [
      {name: "Guild", value: context.guild.name},
      {name: "Channel", value: context.channel.name},
      {name: "Author", value: context.author.tag},
    ]);

    return Rx.Observable
      .merge(userMsg$, ownerMsg$)
      .ignoreElements();
  }

  enableCommand(guildId, commandName) {
    let command = this.nix.getCommand(commandName);

    return this.nix.getGuildData(guildId, 'core.enabledCommands')
      .do((commands) => commands[command.name] = true)
      .flatMap((commands) => this.setGuildData(guildId, 'core.enabledCommands', commands))
      .map((commands) => commands[command.name]);
  }

  disableCommand(guildId, commandName) {
    let command = this.nix.getCommand(commandName);

    // required commands must always be enabled
    if (REQUIRED_COMMANDS.includes(commandName)) {
      let error = new Error(`Command ${commandName} is required and can not be disabled.`);
      error.name = "ReqCommandError";
      return Rx.Observable.throw(error);
    }

    return this.nix.getGuildData(guildId, 'core.enabledCommands')
      .do((commands) => commands[command.name] = false)
      .flatMap((commands) => this.setGuildData(guildId, 'core.enabledCommands', commands))
      .map((commands) => commands[command.name]);
  }

  /**
   * Determine the valid prefixes for the given message
   *
   * @param message
   *
   * @return {String[]}
   */
  getPrefixesForMessage(message) {
    let userId = this.nix.discord.user.id;

    return [
      this.getPrefixForChannel(message.channel),
      `<@${userId}> `,
      `<@!${userId}> `,
    ];
  }

  getPrefix(guildId) {
    let prefix = this.prefixes[guildId];
    if (typeof prefix === 'undefined') {
      prefix = this.defaultPrefix;
    }
    return prefix;
  }

  getPrefixForChannel(channel) {
    if (channel.type === 'text') {
      return this.getPrefix(channel.guild.id);
    }
    else {
      return this.defaultPrefix;
    }
  }

  setPrefix(context, prefix) {
    return this.nix.setGuildData(context.guild.id, 'core.commandPrefix', prefix)
      .do((newPrefix) => this.prefixes[context.guild.id] = newPrefix);
  }

  isCommandEnabled(guildId, commandName) {
    let command = this.nix.getCommand(commandName);

    if (command.moduleName === 'core') {
      // core commands are always enabled
      return Rx.Observable.return(true);
    }

    return Rx.Observable
      .if(
        () => command.moduleName,
        this.moduleService.isModuleEnabled(guildId, command.moduleName),
        Rx.Observable.return(true), //commands not part of a module are enabled, at least in the module sense
      )
      .filter(Boolean) //gate out commands from disabled modules
      .flatMap(() => this.nix.getGuildData(guildId, 'core.enabledCommands'))
      .map((enabledCommands) => enabledCommands[command.name])
      .map((isEnabled) => {
        if(typeof isEnabled === 'undefined') {
          return command.enabledByDefault;
        }
        return isEnabled;
      })
      .filter(Boolean) //gate out false values
      .defaultIfEmpty(false);
  }

  canSendMessage(channel) {
    let botUser = this.nix.discord.user;
    let permissions = channel.permissionsFor(botUser);
    return Rx.Observable.return(permissions.has(Discord.Permissions.FLAGS.SEND_MESSAGES));
  }

  filterCanRunCommand(context) {
    return Rx.Observable
      .of('')
      .flatMap(() => this.filterCanSendMessage(context.channel))
      .flatMap(() => this.filterCommandEnabled(context.guild.id, context.command.name))
      .flatMap(() => this.filterHasPermission(context, context.command.name));
  }

  filterCanSendMessage(channel) {
    return this.canSendMessage(channel)
      .do((allowed) => this.nix.logger.debug(`filterCanSendMessage to ${channel.name}: ${allowed}`))
      .filter(Boolean);
  }

  filterCommandEnabled(guildId, commandName) {
    return this.isCommandEnabled(guildId, commandName)
      .do((allowed) => this.nix.logger.debug(`filterCommandEnabled for ${commandName}: ${allowed}`))
      .catch((error) => {
        switch (error.name) {
          case "CommandNotFoundError":
            return Rx.Observable.of(false);
          default:
            return Rx.Observable.throw(error);
        }
      })
      .filter(Boolean);
  }

  filterHasPermission(context, commandName) {
    return this.permissionsService
      .filterHasPermission(context, commandName);
  }
}

module.exports = CommandService;
