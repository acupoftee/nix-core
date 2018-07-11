const Observable = require('rxjs').Observable;

module.exports = {
  name: 'addUser',
  description: 'Add a user to a permission level',

  services: {
    core: [
      'permissionsService',
      'userService',
    ],
  },

  inputs: [
    {
      name: "user",
      description: "the user to add",
      required: true,
    },
    {
      name: "level",
      description: "the permission level to add",
      required: true,
    },
  ],

  run(context) {
    let guild = context.guild;
    let userString = context.args.input1;
    let level = context.args.input2;

    if (!userString) {
      return Observable.of({
        status: 400,
        content: `the user to add is required`,
      });
    }

    if (!level) {
      return Observable.of({
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
      .flatMap((user) => this.permissionsService.addUser(guild, level, user).map(() => user))
      .map((user) => ({
        status: 200,
        content: `Added ${user.username} to ${level}`,
      }))
      .catch((error) => {
        switch (error.name) {
          case "UserNotFoundError":
          case "PermLevelError":
            return Observable.of({ status: 400, content: error.message });
          default:
            return Observable.throw(error);
        }
      });
  },
};
