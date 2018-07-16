const Observable = require('rxjs').Observable;

const ModuleService = require('../services/module-service');
const CommandService = require('../services/command-service');
const DataService = require('../services/data-service');
const ConfigActionService = require('../services/config-action-service');
const PermissionsService = require('../services/permissions-service');
const UserService = require('../services/user-service');

class ServicesManager {
  constructor(nix) {
    this._nix = nix;
    this._services = {};

    //Bind methods for aliasing to NixCore
    this.addService = this.addService.bind(this);
    this.getService = this.getService.bind(this);
  }

  loadServices() {
    this.addService('core', DataService);
    this.addService('core', ModuleService);
    this.addService('core', CommandService);
    this.addService('core', ConfigActionService);
    this.addService('core', PermissionsService);
    this.addService('core', UserService);

    Object.entries(this._nix.config.services).forEach(([moduleName, services]) => {
      services.forEach((service) => this.addService(moduleName, service));
    });
  }

  get services() {
    return Object.values(this._services);
  }

  addService(moduleName, Service) {
    let serviceKey = `${moduleName}.${Service.name}`;

    if (this._services[serviceKey.toLowerCase()]) {
      let error = new Error(`The service '${serviceKey}' has already been added.`);
      error.name = "ServiceAlreadyExistsError";
      throw error;
    }

    let service = new Service(this._nix);

    this._nix.logger.verbose(`added Service: ${serviceKey}`);
    this._services[serviceKey.toLowerCase()] = service;
  }

  getService(moduleName, serviceName) {
    let serviceKey = `${moduleName}.${serviceName}`;
    let service = this._services[serviceKey.toLowerCase()];

    if (!service) {
      let error = new Error(`The service '${serviceKey}' could not be found`);
      error.name = "ServiceNotFoundError";
      throw error;
    }

    return service;
  }

  configureServices() {
    return Observable.from(this.services)
      .filter((service) => service.configureService)
      .map((service) => service.configureService(this._nix.config))
      .last();
  }
}

module.exports = ServicesManager;
