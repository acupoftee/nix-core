'use strict';
const Nix = require('../lib/nix-core');
const config = require('../config/config.js');

let nix = new Nix(config);
nix.listen();
