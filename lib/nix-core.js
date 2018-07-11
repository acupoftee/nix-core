const Observable = require('rxjs').Observable;
const ReplaySubject = require('rxjs').ReplaySubject;
const Discord = require('discord.js');
const fs = require('fs');

const NixConfig = require("./models/nix-config");
const NixLogger = require("./utility/nix-logger");
const ServicesManager = require('./managers/services-manager');
const ModuleManager = require('./managers/module-manager');

const ModuleService = require('./services/module-service');
const CommandService = require('./services/command-service');
const DataService = require('./services/data-service');
const ConfigActionService = require('./services/config-action-service');
const PermissionsService = require('./services/permissions-service');
const UserService = require('./services/user-service');

const defaultResponseStrings = require('./utility/reponse-strings');

class NixCore {
  /**
   * Create a new instance of Nix
   * @param config {NixConfig} configuration settings for this Nix bot
   */
  constructor(config) {
    if (!(config instanceof NixConfig)) { config = new NixConfig(config); }
    this.config = config;
    this.config.verifyConfig(); // Confirm the config is valid

    this.logger = NixLogger.createLogger(this.config.logger);

    this.responseStrings = Object.assign(defaultResponseStrings, this.config.responseStrings);

    this._shutdownSubject = null;
    this.shutdown$ = null;
    this.main$ = null;

    this.streams = {};

    this.discord = new Discord.Client(this.config.discord);
    this._owner = null;

    this.servicesManager = new ServicesManager(this);
    this.addService = this.servicesManager.addService;
    this.getService = this.servicesManager.getService;

    this.moduleManager = new ModuleManager(this);
    this.addModule = this.moduleManager.addModule;
    this.getModule = this.moduleManager.getModule;

    // Bootstrapping complete, load the core services and modules
    this._loadCoreServices();
    this._loadConfigServices();

    this.moduleManager.loadServices();
    this._loadCoreModules();
    this._loadConfigModules();
  }

  /**
   * Loads the core services provided by Nix
   * @private
   */
  _loadCoreServices() {
    this.addService('core', DataService);
    this.addService('core', ModuleService);
    this.addService('core', CommandService);
    this.addService('core', ConfigActionService);
    this.addService('core', PermissionsService);
    this.addService('core', UserService);
  }

  /**
   * Loads all services that have been added via the config file
   * @private
   */
  _loadConfigServices() {
    Object.entries(this.config.services).forEach(([moduleName, services]) => {
      services.forEach((service) => this.addService(moduleName, service));
    });
  }

  /**
   * Loads all core modules provided by Nix
   * @private
   */
  _loadCoreModules() {
    fs.readdirSync(__dirname + '/modules')
      .map((file) => require(__dirname + '/modules/' + file))
      .map((module) => this.addModule(module));
  }

  /**
   * Loads all modules that have been added via the config file
   * @private
   */
  _loadConfigModules() {
    this.config.modules.forEach((module) => this.addModule(module));
  }

  /**
   * alias the addConfigActions function to the Nix object for easier use.
   *
   * @param configActions {Object} The config module to add to Nix
   */
  addConfigActions(configActions) {
    this.getService('core', 'configActionService').addConfigActions(configActions);
  }

  /**
   * Start the discord bot
   *
   * @param ready {function} (optional) A callback function for when Nix is ready
   * @param error {function} (optional) A callback function for when an unhandled error occurs
   * @param complete {function} (optional) A callback function for when Nix shuts down
   * @return {Observable<string>} an observable stream to subscribe to
   */
  listen(ready, error, complete) {
    if (!this.listening) {
      //use replay subjects to let future subscribers know that Nix has already started listening.
      this._shutdownSubject = new ReplaySubject();
      this._listenSubject = new ReplaySubject();

      this.shutdown$ = this._shutdownSubject
        .do(() => this.logger.info('Shutdown signal received.'))
        .share();

      this.main$ =
        Observable.of('')
          .do(() => this.logger.info(`Beginning to listen`))
          .do(() => this._logStats())
          .do(() => this.logger.info(`Configuring Services`))
          .flatMap(() => this.servicesManager.configureServices())
          .do(() => this.logger.info(`Logging into Discord`))
          .flatMap(() => this.discord.login(this.config.loginToken))
          .do(() => this.logger.info(`Logged into Discord. In ${this.discord.guilds.size} guilds`))
          .flatMap(() => this.findOwner())
          .do((owner) => this.logger.info(`Found owner ${owner.tag}`))
          .flatMap(() => this._startEventStreams())
          .flatMap(() => this._doOnNixListenHooks())
          .flatMap(() =>
            Observable.from(this.discord.guilds.array())
              .flatMap((guild) => this._doOnNixJoinGuildHooks(guild))
              .last()
          )
          .do(() => {
            if (this.config.messageOwnerOnBoot) {
              this.messageOwner("I'm now online.");
            }
          })
          .share();

      this.main$.subscribe(
        () => {
          this.logger.info(`Ready!`);
          this._listenSubject.next('Ready');
        },
        (error) => {
          this._listenSubject.error(error);
          throw error;
        }
      );

      this.shutdown$
        .subscribe(
          () => {
            this.logger.info(`Shutting down...`);
          },
          (error) => {
            this._closeDiscordConnection();
            throw(error);
          },
          () => {
            this._closeDiscordConnection();
          }
        );
    }

    this._listenSubject.subscribe(ready, error, complete);
    return this._listenSubject;
  }

  _closeDiscordConnection() {
    return Observable.of('')
      .do(() => this.logger.info(`Closing Discord connection`))
      .flatMap(() => this.discord.destroy())
      .subscribe(() => this.logger.info(`Discord connection closed`));
  }

  _logStats() {
    let commandService = this.getService('core', 'commandService');

    let services = this.servicesManager.services;
    let modules = this.moduleManager.modules;
    let commands = Object.values(commandService.commands);

    this.logger.info(`${services.length} Services loaded`);
    this.logger.info(`${modules.length} Modules loaded`);
    this.logger.info(`${commands.length} Commands loaded`);
  }

  _doOnNixListenHooks() {
    let dataService = this.getService('core', 'dataService');

    return Observable.of('')
      .do(() => this.logger.info(`Preparing data source`))
      .flatMap(() => this._triggerHook(dataService, 'onNixListen')) // prepare dataService first
      .flatMap(() =>
        Observable
          .from(this.discord.guilds.values())
          .flatMap((guild) => this._readyDataSource(guild))
          .last()
      )
      .do(() => this.logger.info(`Data source prepared`))
      .do(() => this.logger.info(`Starting onNixListen hooks`))
      .flatMap(() =>
        Observable.concat(
          Observable.from(this.servicesManager.services)
            .filter((service) => service.name !== 'DataService'),
          Observable.from(this.moduleManager.modules)
        )
        .concatMap((hookListener) =>
          this._triggerHook(hookListener, 'onNixListen')
            .catch((error) =>
              this.handleError(error, [
                {name: "Hook", value: 'onNixListen'},
                {name: "Listener Type", value: hookListener.constructor.name},
                {name: "Listener Name", value: hookListener.name},
              ]).map(() => false)
            )
        )
        .last() //wait for all the onNixListen hooks to complete
      )
      .do(() => this.logger.info(`onNixListen hooks complete`));
  }

  _doOnNixJoinGuildHooks(guild) {
    let dataService = this.getService('core', 'dataService');

    this.logger.info(`Starting onNixJoinGuild hooks for guild '${guild.name}' (${guild.id})`);
    return Observable.of('')
      .flatMap(() => this._triggerHook(dataService, 'onNixJoinGuild', [guild]))
      .flatMap(() => this._readyDataSource(guild))
      .flatMap(() =>
        Observable.concat(
          Observable.from(this.servicesManager.services)
            .filter((service) => service.name !== 'DataService'),
          Observable.from(this.moduleManager.modules)
        )
        .concatMap((hookListener) =>
          this._triggerHook(hookListener, 'onNixJoinGuild', [guild])
            .catch((error) =>
              this.handleError(error, [
                {name: "Hook", value: 'onNixJoinGuild'},
                {name: "Guild", value: `${guild.name} (${guild.id})`},
                {name: "Listener Type", value: hookListener.constructor.name},
                {name: "Listener Name", value: hookListener.name},
              ]).map(() => false)
            )
        )
      )
      .toArray() //wait for all the onNixJoinGuild hooks to complete
      .do(() => this.logger.info(`Completed onNixJoinGuild hooks for guild ${guild.id} (${guild.name})`));
  }

  _triggerHook(hookListener, hookName, args=[]) {
    if (!hookListener[hookName]) {
      return Observable.of(true);
    }

    return Observable
      .of(hookListener[hookName])
      .map((hook) => hook.apply(hookListener, args))
      .flatMap((returnValue) => {
        if (typeof returnValue === 'undefined') {
          return Observable.of(true);
        }
        else if (returnValue instanceof Observable) {
          return returnValue;
        }
        else if (typeof returnValue.then === 'function') {
          return Observable.fromPromise(returnValue);
        }
        else {
          return Observable.of(true);
        }
      });
  }

  /**
   * Checks if Nix is listening to Discord
   * @returns {boolean}
   */
  get listening() {
    return !!this.main$;
  }

  /**
   * Triggers a soft shutdown of the bot.
   */
  shutdown() {
    if (!this.listening) { throw new Error("Bot is not listening."); }
    this._shutdownSubject.onNext(true);
    this._shutdownSubject.onCompleted();
  }

  /**
   * Sends a message to the owner of the bot
   *
   * @param message
   * @param options
   *
   * @return {Observable<string>} an observable stream to subscribe to
   */
  messageOwner(message, options={}) {
    if (this.owner === null) {
      return Observable.throw(new Error('Owner was not found.'));
    }

    return Observable.fromPromise(this.owner.send(message, options));
  }

  /**
   * Returns the owner user, if they were found.
   *
   * @return {null|Discord.User}
   */
  get owner() {
    return this._owner;
  }

  /**
   * Finds the owner of this bot in Discord
   * @returns {Observable<User>}
   */
  findOwner() {
    return Observable
      .fromPromise(this.discord.fetchUser(this.config.ownerUserId))
      .do((user) => this._owner = user);
  }

  /**
   * Prepares the database
   * @private
   * @returns {Observable<any>}
   */
  _readyDataSource(guild) {
    let moduleService = this.getService('core', 'moduleService');

    this.logger.debug(`Preparing default data for guild ${guild.id}`);
    return moduleService.prepareDefaultData(this, guild.id);
  }

  /**
   * Creates the event processing streams from Discord
   *
   * @private
   */
  _startEventStreams() {
    this.logger.info(`Starting event streams`);

    let commandService = this.getService('core', 'commandService');

    // Create a stream for all the Discord events
    Object.values(Discord.Constants.Events).forEach((eventType) => {
      let streamName = eventType + '$';
      this.logger.silly(`adding stream nix.streams.${streamName}`);
      this.streams[streamName] =
        Observable
          .fromEvent(
            this.discord,
            eventType,
            function(...args) {
              if(args.length > 1) { return args; }
              return args[0];
            }
          );
    });

    // Create Nix specific event streams
    this.streams.command$ =
      this.streams.message$
        .filter((message) => message.channel.type === 'text')
        .filter((message) => commandService.msgIsCommand(message));

    // Apply takeUntil and share to all streams
    for(let streamName in this.streams) {
      this.streams[streamName] =
        this.streams[streamName]
          .takeUntil(this.shutdown$)
          .share();
    }

    // Listen to events
    this.streams.command$
      .flatMap((message) => commandService.runCommandForMsg(message) )
      .subscribe(
        () => { console.log("boop")},
        (error) => { throw error; }
      );

    this.streams.guildCreate$
      .flatMap((guild) => this._doOnNixJoinGuildHooks(guild))
      .subscribe(
        () => {},
        (error) => { throw error; }
      );

    let eventStreams$ =
      Observable.merge(Object.values(this.streams))
        .ignoreElements()
        .do(null, null, () => this.streams = {});

    return Observable.of('')
      .merge(eventStreams$)
      .do(() => this.logger.info(`Event streams started`));
  }

  handleError(error, extraFields) {
    this.logger.error(`Error in command:\n${error.stack}`);
    let embed = this.createEmbedForError(error,  extraFields);
    return this.messageOwner(this.responseStrings.commandRun.unhandledException.forOwner({}), { embed });
  }

  /**
   * Builds a embed for the error with additional fields if needed
   * @param error {Error} The error to build an embed for
   * @param extraFields {Array} List of additional fields to add to the embed
   * @returns {RichEmbed}
   */
  createEmbedForError(error, extraFields=[]) {
    let embed = new Discord.RichEmbed();

    embed.addField("Error:", `${error.name}: ${error.message}`);
    extraFields.forEach((field) => {
      embed.addField(field.name, field.value);
    });
    embed.addField('Stack:', this._getStackForEmbed(error));

    return embed;
  }

  _getStackForEmbed(error) {
    let stack = error.stack.split('\n');
    let stackString = '';
    let nextLine = stack.shift();

    while (nextLine && (`${stackString}\n${nextLine}\n...`).length < 1000) { // max length of 1000-ish characters
      stackString += '\n' + nextLine;
      nextLine = stack.shift();
    }

    if (stack.length >= 1) {
      stackString += '\n...';
    }

    return stackString;
  }
}

module.exports = NixCore;
