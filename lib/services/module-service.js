const Rx = require('rx');

const Service = require('../models/service');

const DATAKEYS = {
  ENABLED_MODULES: 'core.enabledModules',
};

class ModuleService extends Service {
  constructor(nix) {
    super(nix);

    this._moduleManager = this.nix.moduleManager;
    this.getModule = this._moduleManager.getModule;
  }

  get modules() {
    return this._moduleManager.modules;
  }

  onNixJoinGuild(guild) {
    return Rx.Observable.from(this.modules)
      .flatMap((module) =>
        this.isModuleEnabled(guild.id, module.name)
          .filter(Boolean)
          .flatMap(() => {
            if (typeof module.onEnabled === 'undefined') { return Rx.Observable.of(true); }
            return module.onEnabled(guild.id);
          }),
      )
      .toArray()
      .map(true);
  }

  enableModule(guildId, moduleName) {
    let module = this.getModule(moduleName);

    return this.isModuleEnabled(guildId, module.name)
      .flatMap((isEnabled) => {
        if (isEnabled) {
          let error = new Error(`Module ${module.name} is already enabled.`);
          error.name = "ModuleError";
          return Rx.Observable.throw(error);
        }
        return this.nix.getGuildData(guildId, DATAKEYS.ENABLED_MODULES);
      })
      .flatMap((savedData) => {
        if (typeof module.onEnabled === 'undefined') { return Rx.Observable.of(savedData); }
        return Rx.Observable.of().flatMap(() => module.onEnabled(guildId)).map(savedData);
      })
      .do((savedData) => savedData[module.name] = true)
      .flatMap((savedData) => this.nix.setGuildData(guildId, DATAKEYS.ENABLED_MODULES, savedData))
      .flatMap((savedData) => Rx.Observable.return(savedData[module.name]))
      .map(true);
  }

  disableModule(guildId, moduleName) {
    let module = this.getModule(moduleName);

    if (!module.canBeDisabled) {
      let error = new Error(`The module '${module.name}' can not be disabled`);
      error.name = "ModuleError";
      return Rx.Observable.throw(error);
    }

    return this.isModuleEnabled(guildId, module.name)
      .flatMap((isEnabled) => {
        if (!isEnabled) {
          let error = new Error(`Module ${module.name} is already disabled.`);
          error.name = "ModuleError";
          return Rx.Observable.throw(error);
        }
        return this.nix.getGuildData(guildId, DATAKEYS.ENABLED_MODULES);
      })
      .flatMap((savedData) => {
        if (typeof module.onDisabled === 'undefined') { return Rx.Observable.of(savedData); }
        return Rx.Observable.of().flatMap(() => module.onDisabled(guildId)).map(savedData);
      })
      .do((savedData) => savedData[module.name] = false)
      .flatMap((savedData) => this.nix.setGuildData(guildId, DATAKEYS.ENABLED_MODULES, savedData))
      .flatMap((savedData) => Rx.Observable.return(savedData[module.name]))
      .map(true);
  }

  isModuleEnabled(guildId, moduleName) {
    let module = this.nix.getModule(moduleName);

    if (!module.canBeDisabled) {
      // Can't be disabled, so it's always enabled
      return Rx.Observable.of(true);
    }

    return this.nix.getGuildData(guildId, DATAKEYS.ENABLED_MODULES)
      .map((savedData) => savedData[module.name])
      .map((isEnabled) => {
        if (typeof isEnabled === 'undefined') {
          return module.enabledByDefault;
        }
        return isEnabled;
      });
  }

  prepareDefaultData(nix, guildId) {
    return Rx.Observable
      .from(Object.values(this.modules))
      .flatMap((module) => Rx.Observable.from(module.defaultData))
      .flatMap((defaultData) => {
        return this.nix.getGuildData(guildId, defaultData.keyword)
          .flatMap((savedData) => {
            if (typeof savedData === 'undefined') {
              return this.nix.setGuildData(guildId, defaultData.keyword, defaultData.data);
            }
            else {
              return Rx.Observable.return(savedData);
            }
          });
      })
      .defaultIfEmpty('')
      .last();
  }

  filterModuleEnabled(guildId, moduleName) {
    return this.isModuleEnabled(guildId, moduleName)
      .filter(Boolean);
  }
}

ModuleService.DATAKEYS = DATAKEYS;

module.exports = ModuleService;
