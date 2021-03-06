const {
  Collection,
  Guild,
  TextChannel,
  Message,
} = require('discord.js');

const Command = require('../../../lib/models/command');
const CommandContext = require('../../../lib/models/command-context');
const CommandService = require('../../../lib/services/command-service');

describe('CommandService', function () {
  beforeEach(function () {
    this.nix = createNixStub();
    this.commandService = new CommandService(this.nix);
  });

  describe('#filterCanRunCommand', function () {
    beforeEach(function () {
      this.message = Mockery.create("Message");

      this.command = new Command(this.nix, {
        name: "testCommand",
        moduleName: "testModule",
        run: () => {},
      });
      this.context = new CommandContext(this.nix, this.message, this.command, {}, {});
    });

    context('when the bot can not send a message to the channel', function() {
      it('emits no elements', function (done) {
        expect(this.commandService.filterCanRunCommand(this.context))
          .to.emit([])
          .and.complete(done);
      });
    });
  });
});
