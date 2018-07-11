const Observable = require('rxjs').Observable;

const Service = require('../models/service');

const {DATAKEYS} = require('../modules/permissions/utility');

class PermissionsService extends Service {
  constructor (nix) {
    super(nix);

    this.levels = [];
  }

  getDatakey(level) {
    return DATAKEYS.PERMISSIONS + '.' + level;
  }

  configureService() {
    this.dataService = this.nix.getService('core', 'dataService');
    this.commandService = this.nix.getService('core', 'commandService');
  }

  getPermissionsData(guildId, level) {
    if (this.levels.indexOf(level.toLowerCase()) === -1) {
      let error = new Error(`The level ${level} could not be found.`);
      error.name = "PermLevelNotFoundError";
      return Observable.throw(error);
    }

    return this.dataService.getGuildData(guildId, this.getDatakey(level))
      .flatMap((savedData) => {
        if (!savedData) {
          return this.setPermissionsData(guildId, level, {
            users: [],
            roles: [],
          });
        }

        return Observable.of(savedData);
      });
  }

  setPermissionsData(guildId, level, data) {
    if (this.levels.indexOf(level.toLowerCase()) === -1) {
      let error = new Error(`The level ${level} could not be found.`);
      error.name = "PermLevelNotFoundError";
      return Observable.throw(error);
    }

    return this.dataService.setGuildData(guildId, this.getDatakey(level), data);
  }

  addPermissionLevel(level) {
    if (this.levels.indexOf(level.toLowerCase()) === -1) {
      this.levels.push(level.toLowerCase());
    }
  }

  addUser(guild, level, user) {
    return this.getPermissionsData(guild.id, level)
      .flatMap((savedData) => {
        let users = savedData.users;
        if (users.indexOf(user.id) !== -1) {
          let error = new Error(`The user ${user.username} already has the permission level ${level}`);
          error.name = "PermLevelError";
          return Observable.throw(error);
        }

        users.push(user.id);

        return this.setPermissionsData(guild.id, level, savedData);
      })
      .map((savedData) => savedData.users.indexOf(user.id) !== -1);
  }

  removeUser(guild, level, user) {
    return this.getPermissionsData(guild.id, level)
      .flatMap((savedData) => {
        let users = savedData.users;
        let index = users.indexOf(user.id);
        if (index === -1) {
          let error = new Error(`The user ${user.username} does not have the permission level ${level}`);
          error.name = "PermLevelError";
          return Observable.throw(error);
        }

        users.splice(index, 1);

        return this.setPermissionsData(guild.id, level, savedData);
      })
      .map((savedData) => savedData.users.indexOf(user.id) === -1);
  }

  addRole(guild, level, role) {
    return this.getPermissionsData(guild.id, level)
      .flatMap((savedData) => {
        let roles = savedData.roles;
        if (roles.indexOf(role.id) !== -1) {
          let error = new Error(`The role ${role.name} already has the permission level ${level}`);
          error.name = "PermLevelError";
          return Observable.throw(error);
        }

        roles.push(role.id);

        return this.setPermissionsData(guild.id, level, savedData);
      })
      .map((savedData) => savedData.roles.indexOf(role.id) !== -1);
  }

  removeRole(guild, level, role) {
    return this.getPermissionsData(guild.id, level)
      .flatMap((savedData) => {
        let roles = savedData.roles;
        let index = roles.indexOf(role.id);
        if (index === -1) {
          let error = new Error(`The role ${role.name} does not have the permission level ${level}`);
          error.name = "PermLevelError";
          return Observable.throw(error);}

        roles.splice(index, 1);

        return this.setPermissionsData(guild.id, level, savedData);
      })
      .map((savedData) => savedData.roles.indexOf(role.id) === -1);
  }

  hasPermission(context, commandName) {
    let guildId = context.guild.id;
    let command = this.commandService.getCommand(commandName);

    if(command.ownerOnly && context.member.id !== this.nix.owner.id) {
      // command is for the owner only.
      return Observable.of(false);
    }

    if(context.member.id === this.nix.owner.id) {
      // Bot owner always has permission
      return Observable.of(true);
    }

    if (context.member.user.id === context.guild.ownerID) {
      // Guild owner always has permission
      return Observable.of(true);
    }

    if (command.permissions.length === 0) {
      // No specified levels, default to true
      return Observable.of(true);
    }

    return Observable.from(command.permissions)
      .flatMap((level) =>
        this.getPermissionsData(guildId, level)
          .catch((error) => {
            if (error.message === ERRORS.LEVEL_NOT_FOUND) {
              return Observable.empty(); // level does not exist in this guild
            }
          })
      )
      .toArray()
      .map((permLevels) => {
        return permLevels.find((level) => {
          if (level.users.indexOf(context.member.id) !== -1) {
            return true;
          }

          if (context.member.roles.some((r) => level.roles.indexOf(r.id) !== -1)) {
            return true;
          }

          return false;
        });
      })
      .map((level) => !!level); //convert to boolean
  }

  filterHasPermission(context, commandName) {
    return this.hasPermission(context, commandName)
      .do((allowed) => this.nix.logger.debug(`filterHasPermission: ${allowed}`))
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
}

module.exports = PermissionsService;
