module.exports = {
  name: 'command',
  canBeDisabled: false,
  defaultData: [
    { keyword: 'core.enabledCommands', data: {} },
    { keyword: 'core.commandPrefix', data: '!' },
  ],
  configActions: [
    require('./config/enable'),
    require('./config/disable'),
    require('./config/enabled'),
    require('./config/list'),
    require('./config/setPrefix'),
  ],
  commands: [],
};
