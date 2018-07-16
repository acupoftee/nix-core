const Module = require('../models/module');

const CoreModule = require('../modules/core');
const ModuleModule = require('../modules/module');
const CommandModule = require('../modules/command');
const PermissionsModule = require('../modules/permissions');

class ModuleManager {
  get nix() {
    return this._nix;
  }

  get modules() {
    // replace the keys with the case sensitive names
    return Object.values(this._modules);
  }

  constructor(nix) {
    this._nix = nix;
    this._modules = {};

    //Bind methods for aliasing to NixCore
    this.addModule = this.addModule.bind(this);
    this.getModule = this.getModule.bind(this);
  }

  loadModules() {
    this.addModule(CoreModule);
    this.addModule(ModuleModule);
    this.addModule(CommandModule);
    this.addModule(PermissionsModule);

    this.nix.config.modules.forEach((module) => this.addModule(module));
  }

  getModule(moduleName) {
    let module = this._modules[moduleName.toLowerCase()];
    if (!module) {
      let error = new Error(`Module '${moduleName}' could not be found. Has it been added to Nix?`);
      error.name = "ModuleNotFoundError";
      throw error;
    }
    return module;
  }

  addModule(module) {
    let configActionService = this.nix.getService('core', 'configActionService');
    let commandService = this.nix.getService('core', 'commandService');
    let permissionsService = this.nix.getService('core', 'permissionsService');

    module = new Module(module);
    this._modules[module.name.toLowerCase()] = module;

    module.services.forEach((Service) => {
      this.nix.addService(module.name, Service);
    });

    module.configActions.forEach((action) => {
      configActionService.addAction(module.name, action);
    });

    module.commands.forEach((command) => {
      command.moduleName = module.name;
      commandService.addCommand(command);
    });

    module.permissions.forEach((level) => {
      permissionsService.addPermissionLevel(level);
    });
  }
}

module.exports = ModuleManager;
