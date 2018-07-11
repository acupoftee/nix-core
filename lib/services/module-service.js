const Observable = require('rxjs').Observable;

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

  configureService() {
    this.dataService = this.nix.getService('core', 'dataService');
  }

  onNixJoinGuild(guild) {
    return Observable.from(this.modules)
      .flatMap((module) =>
        this.isModuleEnabled(guild.id, module.name)
          .filter(Boolean)
          .flatMap(() => {
            if (typeof module.onEnabled === 'undefined') { return Observable.of(true); }
            return module.onEnabled(guild.id);
          })
      )
      .toArray()
      .mapTo(true);
  }

  enableModule(guildId, moduleName) {
    let module = this.getModule(moduleName);

    return this.isModuleEnabled(guildId, module.name)
      .flatMap((isEnabled) => {
        if (isEnabled) {
          let error = new Error(`Module ${module.name} is already enabled.`);
          error.name = "ModuleError";
          return Observable.throw(error);
        }
        return this.dataService.getGuildData(guildId, DATAKEYS.ENABLED_MODULES);
      })
      .flatMap((savedData) => {
        if (typeof module.onEnabled === 'undefined') { return Observable.of(savedData); }
        return Observable.of('').flatMap(() => module.onEnabled(guildId)).map(savedData);
      })
      .do((savedData) => savedData[module.name] = true)
      .flatMap((savedData) => this.dataService.setGuildData(guildId, DATAKEYS.ENABLED_MODULES, savedData))
      .flatMap((savedData) => Observable.of(savedData[module.name]))
      .map(true);
  }

  disableModule(guildId, moduleName) {
    let module = this.getModule(moduleName);

    if (!module.canBeDisabled) {
      let error = new Error(`The module '${module.name}' can not be disabled`);
      error.name = "ModuleError";
      return Observable.throw(error);
    }

    return this.isModuleEnabled(guildId, module.name)
      .flatMap((isEnabled) => {
        if (!isEnabled) {
          let error = new Error(`Module ${module.name} is already disabled.`);
          error.name = "ModuleError";
          return Observable.throw(error);
        }
        return this.dataService.getGuildData(guildId, DATAKEYS.ENABLED_MODULES);
      })
      .flatMap((savedData) => {
        if (typeof module.onDisabled === 'undefined') { return Observable.of(savedData); }
        return Observable.of('').flatMap(() => module.onDisabled(guildId)).map(savedData);
      })
      .do((savedData) => savedData[module.name] = false)
      .flatMap((savedData) => this.dataService.setGuildData(guildId, DATAKEYS.ENABLED_MODULES, savedData))
      .flatMap((savedData) => Observable.of(savedData[module.name]))
      .map(true);
  }

  isModuleEnabled(guildId, moduleName) {
    let module = this.nix.getModule(moduleName);

    if (!module.canBeDisabled) {
      // Can't be disabled, so it's always enabled
      return Observable.of(true);
    }

    return this.dataService
      .getGuildData(guildId, DATAKEYS.ENABLED_MODULES)
      .map((savedData) => savedData[module.name])
      .map((isEnabled) => {
        if (typeof isEnabled === 'undefined') {
          return module.enabledByDefault;
        }
        return isEnabled;
      });
  }

  prepareDefaultData(nix, guildId) {
    return Observable
      .from(Object.values(this.modules))
      .flatMap((module) => Observable.from(module.defaultData))
      .flatMap((defaultData) => { //concatMap, so that each value is saved in sequence not in parallel
        return this.dataService
          .getGuildData(guildId, defaultData.keyword)
          .flatMap((savedData) => {
            if (typeof savedData === 'undefined') {
              return this.dataService.setGuildData(guildId, defaultData.keyword, defaultData.data);
            }
            else {
              return Observable.of(savedData);
            }
          });
      });
  }
}

ModuleService.DATAKEYS = DATAKEYS;

module.exports = ModuleService;
