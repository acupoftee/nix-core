const Rx = require('rx');

const ServicesManager = require('../../../lib/managers/services-manager');
const Service = require("../../../lib/models/service");

const ModuleService = require('../../../lib/services/module-service');
const CommandService = require('../../../lib/services/command-service');
const PermissionsService = require('../../../lib/services/permissions-service');
const UserService = require('../../../lib/services/user-service');

describe('ServicesManager', function () {
  beforeEach(function () {
    this.nix = createNixStub();

    this.nix.services = {
      core: {
        serviceOne: { name: "serviceOne" },
        serviceTwo: { name: "serviceTwo" },
      },
    };

    this.servicesManager = new ServicesManager(this.nix);
  });

  describe('constructor', function () {
    it('initializes .services to an empty object', function () {
      expect(this.servicesManager.services).to.be.empty;
    });
  });

  describe('.services', function () {
    context('when no services have been added to the manager', function () {
      it('returns an empty list', function () {
        expect(this.servicesManager.services).to.be.empty;
      });
    });

    context('when services have been added to the manager', function () {
      class ServiceOne extends Service {}

      class ServiceTwo extends Service {}

      class ServiceThree extends Service {}

      beforeEach(function () {
        this.servicesManager.addService('test', ServiceOne);
        this.servicesManager.addService('test', ServiceTwo);
        this.servicesManager.addService('test', ServiceThree);
      });

      it("returns a list of all added services", function () {
        expect(this.servicesManager.services).to.have.lengthOf(3);
        let services = this.servicesManager.services.map((service) => service.name);
        expect(services).to.have.members([
          "ServiceOne",
          "ServiceTwo",
          "ServiceThree",
        ]);
      });
    });
  });

  describe('#addService', function () {
    class TestService extends Service {
    }

    it('makes the service retrievable via #getService', function () {
      this.servicesManager.addService('test', TestService);
      expect(this.servicesManager.getService('test', 'TestService')).to.be.an.instanceof(TestService);
    });

    it('initializes the service with a reference to nix', function () {
      this.servicesManager.addService('test', TestService);
      let testService = this.servicesManager.getService('test', 'TestService');
      expect(testService.nix).to.eq(this.nix);
    });

    context('when the service has already been added', function () {
      beforeEach(function () {
        this.servicesManager.addService('test', TestService);
      });

      it('raises an error', function () {
        expect(() => this.servicesManager.addService('test', TestService)).to.throw(
          Error, "The service 'test.TestService' has already been added.",
        );
      });
    });
  });

  describe('#getService', function () {
    class TestService extends Service {
    }

    context('when the service has been added to the manager', function () {
      beforeEach(function () {
        this.servicesManager.addService('test', TestService);
      });

      it('returns the requested service', function () {
        expect(this.servicesManager.getService('test', 'TestService')).to.be.an.instanceof(TestService);
      });
    });

    context('when the service has not been added to the manager', function () {
      it('raises an error', function () {
        expect(() => this.servicesManager.getService('test', 'TestService')).to.throw(
          Error, "The service 'test.TestService' could not be found",
        );
      });
    });
  });

  describe('#loadServices', function () {
    beforeEach(function () {
      sinon.spy(this.servicesManager, 'addService');
    });

    it('loads all core services', function () {
      this.servicesManager.loadServices();

      expect(this.servicesManager.addService).to.have.been.calledWith('core', ModuleService);
      expect(this.servicesManager.addService).to.have.been.calledWith('core', CommandService);
      expect(this.servicesManager.addService).to.have.been.calledWith('core', PermissionsService);
      expect(this.servicesManager.addService).to.have.been.calledWith('core', UserService);
    });

    context('when there are services in the nix config', function () {
      class ConfigService1 extends Service {}

      class ConfigService2 extends Service {}

      class ConfigService3 extends Service {}

      beforeEach(function () {
        this.nix.config.services = {
          test: [
            ConfigService1,
            ConfigService2,
            ConfigService3,
          ],
        };
      });

      it('loads services from the config', function () {
        this.servicesManager.loadServices();

        expect(this.servicesManager.addService).to.have.been.calledWith('test', ConfigService1);
        expect(this.servicesManager.addService).to.have.been.calledWith('test', ConfigService2);
        expect(this.servicesManager.addService).to.have.been.calledWith('test', ConfigService3);
      });
    });
  });

  describe('#configureServices', function () {
    context('when services have been added to the manager', function () {
      class ConfigurableService extends Service {
        configureService() {
          this.configured = true;

          return Rx.Observable.of(true);
        }
      }

      class ServiceOne extends ConfigurableService {}

      class ServiceTwo extends ConfigurableService {}

      class ServiceThree extends ConfigurableService {}

      beforeEach(function () {
        this.servicesManager.addService('test', ServiceOne);
        this.servicesManager.addService('test', ServiceTwo);
        this.servicesManager.addService('test', ServiceThree);
      });

      it('configures all services', function (done) {
        this.servicesManager
          .configureServices()
          .subscribe(
            () => {
              let services = [
                this.servicesManager.getService('test', 'ServiceOne'),
                this.servicesManager.getService('test', 'ServiceTwo'),
                this.servicesManager.getService('test', 'ServiceThree'),
              ];

              expect(services.every((service) => service.configured)).to.eq(true);

              done();
            },
            (error) => {
              done(error);
            },
          );
      });
    });
  });
});
