const sinon = require('sinon');
const NixCore = require('../../nix-core');

const Factory = require('../support/factory');

Factory.define('NixCore', (options = {}) => {
  if(!options.owner) {
    options.owner = Factory.create('User');
  }

  let data = Object.assign({
    ownerUserId: options.owner.id,
  }, options);

  let nixCore = new NixCore(data);

  // Stub out networked methods
  sinon.stub(nixCore.discord, 'login').resolves();
  sinon.stub(nixCore.discord.users, 'fetch').withArgs(options.owner.id).resolves(options.owner);

  return nixCore;
});
