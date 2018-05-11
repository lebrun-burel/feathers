'use strict';

var _require = require('@feathersjs/commons'),
    hooks = _require.hooks;

var Proto = require('uberproto');
var Application = require('./application');
var version = require('./version');

function createApplication() {
  var app = {};

  // Mix in the base application
  Proto.mixin(Application, app);

  app.init();

  return app;
}

createApplication.version = version;
createApplication.SKIP = hooks.SKIP;

module.exports = createApplication;

// For better ES module (TypeScript) compatibility
module.exports.default = createApplication;