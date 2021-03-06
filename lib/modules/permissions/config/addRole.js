const Rx = require('rx');

const {findRole} = require('../utility');

module.exports = {
  name: 'addRole',
  description: 'Add a role to a permission level',

  inputs: [
    {
      name: 'role',
      description: 'the name or mention of the role to add',
      required: true,
    },
    {
      name: 'level',
      description: 'the permission level to add',
      required: true,
    },
  ],

  configureAction() {
    this.permissionsService = this.nix.getService('core', 'permissionsService');
  },

  run(context) {
    let guild = context.guild;

    let roleString = context.inputs.role;
    let level = context.inputs.level;

    if (!roleString) {
      return Rx.Observable.of({
        status: 400,
        content: `the role to add is required`,
      });
    }

    if (!level) {
      return Rx.Observable.of({
        status: 400,
        content: `the permission level to add is required`,
      });
    }

    let role = findRole(roleString, context);
    if (!role) {
      return Rx.Observable.of({
        status: 400,
        content: `Role ${roleString} could not be found.`,
      });
    }

    return this.permissionsService
      .addRole(guild, level, role)
      .map(() => ({
        status: 200,
        content: `Added ${role.name} to ${level}`,
      }))
      .catch((error) => {
        switch (error.name) {
          case "PermLevelError":
            return Rx.Observable.of({status: 400, content: error.message});
          default:
            return Rx.Observable.throw(error);
        }
      });
  },
};
