const Observable = require('rxjs').Observable;
const Discord = require('discord.js');

const Service = require('../models/service');

const Command = require('../models/command');
const Response = require('../models/response');
const Context = require('../models/context');
const CommandParser = require('../utility/command-parser');

const REQUIRED_COMMANDS = ['help', 'config'];

class CommandService extends Service {
  constructor (nix) {
    super(nix);

    this.commands = {};
    this.defaultPrefix = '!';
    this.prefixes = {};
  }

  configureService(config) {
    this.dataService = this.nix.getService('core', 'dataService');
    this.permissionsService = this.nix.getService('core', 'permissionsService');
    this.moduleService = this.nix.getService('core', 'moduleService');

    this.defaultPrefix = config.defaultPrefix;

    config.commands.forEach((command) => {
      this.addCommand(command);
    });

    this._injectServices();
  }

  _injectServices() {
    Object.values(this.commands).forEach((command) => {
      Object.entries(command.services).forEach(([moduleName, services]) => {
        services.forEach((serviceName) => {
          this.nix.logger.silly(`injecting service '${moduleName + '.' + serviceName}' into command '${command.name}'`);
          command[serviceName] = this.nix.getService(moduleName, serviceName);
        });
      });
    });
  }

  onNixJoinGuild(guild) {
    return this.dataService
      .getGuildData(guild.id, 'core.commandPrefix')
      .do((prefix) => this.prefixes[guild.id] = prefix)
      .do(() => this.nix.logger.info(`Loaded prefix ${this.prefixes[guild.id]} for guild ${guild.id}`));
  }

  /**
   * Registers a new command
   *
   * @param command {Object} options for command
   */
  addCommand(command) {
    command = new Command(this.nix, command);
    this.nix.logger.verbose(`adding command: ${command.name}`);
    this.commands[command.name.toLowerCase()] = command;
  }

  getCommand(commandName) {
    let command = this.commands[commandName.toLowerCase()];

    if (!command) {
      let error = new Error(`Command ${commandName} does not exist`);
      error.name = "CommandNotFoundError";
      throw(error);
    }

    return command;
  }

  msgIsCommand(message) {
    let prefixes = this.getPrefixesForMessage(message);
    if (!CommandParser.isCommand(message, prefixes)) {
      return false;
    }

    let commandName = CommandParser.getCommandName(message, prefixes);

    try {
      this.getCommand(commandName);
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
    let commandName = CommandParser.getCommandName(message, prefixes);
    let command = this.getCommand(commandName);

    let paramsString = CommandParser.getParamsString(message, prefixes);
    let params = CommandParser.processParams(command, paramsString);

    let context = new Context(message, this.nix, params);
    let response = new Response(message);

    return Observable.of('')
      .do(() => this.nix.logger.debug(`=== checking command: ${command.name}`))
      .flatMap(() => this.filterCanSendMessage(context.channel))
      .flatMap(() => this.filterCommandEnabled(context.guild.id, commandName))
      .flatMap(() => this.filterHasPermission(context, commandName))
      .flatMap(() => this._filterHelpFlag(command, context, response))
      .flatMap(() => this._filterMissingArgs(command, context, response))
      .do(() => this.nix.logger.debug(`=== running command: ${command.name}`))
      .map(() => command.run(context, response))
      .flatMap((cmdExit) => {
        if (typeof cmdExit === 'undefined') { return Observable.of(''); }
        if (cmdExit instanceof Observable) { return cmdExit; }
        if (typeof cmdExit.then === 'function') { return Observable.fromPromise(cmdExit); }
        return Observable.of('');
      })
      .do(() => this.nix.logger.debug(`=== command complete: ${command.name}`))
      .catch((error) => {
        let userMsg$ = response.send({
          type: 'message',
          content: this.nix.responseStrings.commandRun.unhandledException.forUser({
            owner: this.nix.owner,
          }),
        });

        let ownerMsg$ = this.nix.handleError(error, [
          {name: "Guild", value: context.guild.name},
          {name: "Channel", value: context.channel.name},
          {name: "User", value: context.user.tag},
        ]);

        return Observable
          .merge(userMsg$, ownerMsg$)
          .ignoreElements();
      });
  }

  enableCommand(guildId, commandName) {
    let command = this.getCommand(commandName);

    return this.dataService
      .getGuildData(guildId, 'core.enabledCommands')
      .do((commands) => commands[command.name] = true)
      .flatMap((commands) => this.dataService
        .setGuildData(guildId, 'core.enabledCommands', commands))
      .map((commands) => commands[command.name]);
  }

  disableCommand(guildId, commandName) {
    let command = this.getCommand(commandName);

    // required commands must always be enabled
    if (REQUIRED_COMMANDS.includes(commandName)) {
      let error = new Error(`Command ${commandName} is required and can not be disabled.`);
      error.name = "ReqCommandError";
      return Observable.throw(error);
    }

    return this.dataService
      .getGuildData(guildId, 'core.enabledCommands')
      .do((commands) => commands[command.name] = false)
      .flatMap((commands) =>
        this.dataService
          .setGuildData(guildId, 'core.enabledCommands', commands)
      )
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
    return [
      this.getPrefixForChannel(message.channel),
      this.nix.discord.user.toString() + ' ',
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
    return this.dataService
      .setGuildData(context.guild.id, 'core.commandPrefix', prefix)
      .do((newPrefix) => this.prefixes[context.guild.id] = newPrefix);
  }

  isCommandEnabled(guildId, commandName) {
    let command = this.getCommand(commandName);

    if (command.moduleName === 'core') {
      // core commands are always enabled
      return Observable.of(true);
    }

    return Observable
      .if(
        () => command.moduleName,
        this.moduleService.isModuleEnabled(guildId, command.moduleName),
        Observable.of(true) //commands not part of a module are enabled, at least in the module sense
      )
      .filter(Boolean) //gate out commands from disabled modules
      .flatMap(() => this.dataService.getGuildData(guildId, 'core.enabledCommands'))
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

  filterCommandEnabled(guildId, commandName) {
    return this.isCommandEnabled(guildId, commandName)
      .do((allowed) => this.nix.logger.debug(`filterCommandEnabled: ${allowed}`))
      .catch((error) => {
        switch (error.name) {
          case "CommandNotFoundError":
            return Observable.of(false);
          default:
            return Observable.throw(error);
        }
      })
      .filter(Boolean);
  }

  canSendMessage(channel) {
    let botUser = this.nix.discord.user;
    let permissions = channel.permissionsFor(botUser);
    return Observable.of(permissions.has(Discord.Permissions.FLAGS.SEND_MESSAGES));
  }

  filterCanSendMessage(channel) {
    return this.canSendMessage(channel)
      .do((allowed) => this.nix.logger.debug(`filterCanSendMessage: ${allowed}`))
      .filter(Boolean);
  }

  filterHasPermission(context, commandName) {
    return this.permissionsService
      .filterHasPermission(context, commandName);
  }

  _filterHelpFlag(command, context, response) {
    if (context.flags['help'] === true) {
      response.type = 'embed';
      response.content = this.nix.responseStrings.commandParsing.help({});
      response.embed = command.helpEmbed();
      response.send();
      this.nix.logger.debug(`filterHelpFlag: false`);
      return Observable.empty();
    }
    this.nix.logger.debug(`filterHelpFlag: true`);
    return Observable.of(true);
  }

  _filterMissingArgs(command, context, response) {
    let ignoreArgReqsFlags = command.flags.filter((f) => f.ignoreArgReqs);
    if (ignoreArgReqsFlags.find((f) => context.flags[f.name])) {
      this.nix.logger.debug(`filterMissingArgs: true`);
      return Observable.of(true);
    }

    if (command.requiredArgs.some((arg) => typeof context.args[arg.name] === 'undefined')) {
      response.type = 'embed';
      response.content = context.nix.responseStrings.commandParsing.error.missingArgument({});
      response.embed = command.helpEmbed();
      response.send();
      this.nix.logger.debug(`filterMissingArgs: false`);
      return Observable.empty();
    }
    this.nix.logger.debug(`filterMissingArgs: true`);
    return Observable.of(true);
  }
}

module.exports = CommandService;
