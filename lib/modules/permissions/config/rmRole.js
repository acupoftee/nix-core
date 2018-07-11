const Observable = require('rxjs').Observable;

const {findRole} = require('../utility');

module.exports = {
  name: 'rmRole',
  description: 'removes a role from a permission level',

  services: {
    core: [
      'permissionsService',
    ],
  },

  inputs: [
    {
      name: 'role',
      description: 'the name or mention of the role to remove',
      required: true,
    },
    {
      name: 'level',
      description: 'the permission level to remove',
      required: true,
    },
  ],
  run(context) {
    let guild = context.guild;
    let roleString = context.args.input1;
    let level = context.args.input2;

    if (!roleString) {
      return Observable.of({
        status: 400,
        content: `The role to remove is required`,
      });
    }

    if (!level) {
      return Observable.of({
        status: 400,
        content: `The permission level to remove is required`,
      });
    }

    let role = findRole(roleString, context);
    if (!role) {
      return Observable.of({
        status: 400,
        content: `Role ${roleString} could not be found.`,
      });
    }

    return this.permissionsService
      .removeRole(guild, level, role)
      .map(() => ({
        status: 200,
        content: `Removed ${role.name} from ${level}`,
      }))
      .catch((error) => {
        switch (error.name) {
          case "PermLevelError":
            return Observable.of({status: 400, content: error.message});
          default:
            return Observable.throw(error);
        }
      });
  },
};
