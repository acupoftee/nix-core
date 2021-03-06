const Rx = require('rx');

module.exports = {
  name: 'rmUser',
  description: 'remove a user from a permission level',

  inputs: [
    {
      name: 'user',
      description: 'the user to remove',
      required: true,
    },
    {
      name: 'level',
      description: 'the permission level to remove',
      required: true,
    },
  ],

  configureAction() {
    this.permissionsService = this.nix.getService('core', 'permissionsService');
    this.userService = this.nix.getService('core', 'userService');
  },

  run(context) {
    let guild = context.guild;
    let userString = context.inputs.user;
    let level = context.inputs.level;

    if (!userString) {
      return Rx.Observable.of({
        status: 400,
        content: `the user to remove is required`,
      });
    }

    if (!level) {
      return Rx.Observable.of({
        status: 400,
        content: `the permission level to add is required`,
      });
    }

    return this.userService
      .findMember(guild, userString)
      .map((member) => {
        if (!member) {
          let error = new Error(`User '${userString}' could not be found`);
          error.name = "UserNotFoundError";
          throw error;
        }
        return member;
      })
      .map((member) => member.user)
      .flatMap((user) => this.permissionsService.removeUser(guild, level, user).map(() => user))
      .map((user) => ({
        status: 200,
        content: `Removed ${user.username} from ${level}`,
      }))
      .catch((error) => {
        switch (error.name) {
          case "UserNotFoundError":
          case "PermLevelError":
            return Rx.Observable.of({status: 400, content: error.message});
          default:
            return Rx.Observable.throw(error);
        }
      });
  },
};
