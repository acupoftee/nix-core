const util = require('util');
const Observable = require('rxjs').Observable;

const Service = require('../models/service');

class DataService extends Service {
  constructor(nix) {
    super(nix);

    this._dataSource = null;
    this._cache = {};
  }

  configureService(config) {
    let DataSource;
    let dataSourceType = config.dataSource.type || 'memory';
    let npmPackageName = `nix-data-${dataSourceType}`;

    try {
      DataSource = require(npmPackageName);
    }
    catch (error) {
      if (error.code == "MODULE_NOT_FOUND") {
        error = new Error(`Unable to load data source '${npmPackageName}'. Is the npm module '${npmPackageName}' installed?`);
        error.name = "DataSourceError";
        throw error;
      }
      else {
        throw error;
      }
    }

    this._dataSource = new DataSource(this.nix, config.dataSource);
    this.nix.logger.info(`Loaded data source ${npmPackageName}`);
  }

  get type() {
    return this._dataSource.type;
  }

  onNixJoinGuild(guild) {
    if (typeof this._dataSource.onNixJoinGuild === 'undefined') { return Observable.of(true); }
    return this._dataSource.onNixJoinGuild(guild);
  }

  onNixListen() {
    if (typeof this._dataSource.onNixListen === 'undefined') { return Observable.of(true); }
    return this._dataSource.onNixListen();
  }

  /**
   *
   * @param guildId
   * @param keyword
   * @param data
   *
   * @return {Rx.Observable}
   */
  setGuildData(guildId, keyword, data) {
    return this._setData('guild', guildId, keyword, data);
  }

  /**
   *
   * @param guildId
   *
   * @param keyword
   * @return {Rx.Observable}
   */
  getGuildData(guildId, keyword) {
    return this._getData('guild', guildId, keyword);
  }

  _getData(type, id, keyword) {
    let cacheKey = `${type}:${id}:${keyword}`;
    let cached = this._cache[cacheKey];

    if(cached && cached.expiresAt > Date.now()) {
      this.nix.logger.data(`[cache]\t${cacheKey} => ${util.inspect(cached.data)}`);
      return Observable.of(cached.data);
    }

    return this._dataSource.getData(type, id, keyword)
      .do((savedData) => this.nix.logger.data(`[read]\t${cacheKey} => ${util.inspect(savedData)}`))
      .do((savedData) => this._updateCache(cacheKey, savedData));
  }

  _setData(type, id, keyword, data) {
    let cacheKey = `${type}:${id}:${keyword}`;

    return Observable.of('')
      .do(() => this.nix.logger.data(`[write]\t${cacheKey} => ${util.inspect(data)}`))
      .flatMap(() => this._dataSource.setData(type, id, keyword, data))
      .do((savedData) => this.nix.logger.data(`[saved]\t${cacheKey} => ${util.inspect(savedData)}`))
      .do((savedData) => this._updateCache(cacheKey, savedData));
  }

  _updateCache(cacheKey, data) {
    this._cache[cacheKey] = {
      expiresAt: Date.now() + 300000, // 5 min in ms
      data,
    };
  }
}


module.exports = DataService;
