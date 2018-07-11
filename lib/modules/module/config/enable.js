const Observable = require('rxjs').Observable;

module.exports = {
  name: "enable",
  description: 'enable a module',

  services: {
    core: [
      'moduleService',
    ],
  },

  inputs: [
    {
      name: 'module',
      description: 'the name of the module to enable',
      required: true,
    },
  ],

  run (context) {
    let moduleName = context.args.input1;

    if (!moduleName) {
      return Observable.of({
        status: 400,
        content: "A module name is required",
      });
    }

    return Observable.of(moduleName)
      .map((moduleName) => this.moduleService.getModule(moduleName))
      .flatMap((module) => this.moduleService.enableModule(context.guild.id, module.name).map(module))
      .map((module) => {
        return {
          status: 200,
          content: `The module ${module.name} is now enabled.`,
        };
      })
      .catch((error) => {
        switch (error.name) {
          case 'ModuleNotFoundError':
          case 'ModuleError':
            return Observable.of({ status: 400, content: error.message });
          default:
            return Observable.throw(error);
        }
      });
  },
};
