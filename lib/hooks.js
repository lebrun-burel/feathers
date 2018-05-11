'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _require = require('@feathersjs/commons'),
    hooks = _require.hooks,
    validateArguments = _require.validateArguments,
    isPromise = _require.isPromise,
    _ = _require._;

var createHookObject = hooks.createHookObject,
    getHooks = hooks.getHooks,
    processHooks = hooks.processHooks,
    enableHooks = hooks.enableHooks,
    makeArguments = hooks.makeArguments;

// A service mixin that adds `service.hooks()` method and functionality

var hookMixin = exports.hookMixin = function hookMixin(service) {
  if (typeof service.hooks === 'function') {
    return;
  }

  var app = this;
  var methods = app.methods;
  var mixin = {};

  // Add .hooks method and properties to the service
  enableHooks(service, methods, app.hookTypes);

  // Assemble the mixin object that contains all "hooked" service methods
  methods.forEach(function (method) {
    if (typeof service[method] !== 'function') {
      return;
    }

    mixin[method] = function () {
      var service = this;
      var args = Array.from(arguments);
      // If the last argument is `true` we want to return
      // the actual hook object instead of the result
      var returnHook = args[args.length - 1] === true ? args.pop() : false;

      // A reference to the original method
      var _super = service._super.bind(service);
      // Create the hook object that gets passed through
      var hookObject = createHookObject(method, args, {
        type: 'before', // initial hook object type
        service: service,
        app: app
      });
      // A hook that validates the arguments and will always be the very first
      var validateHook = function validateHook(context) {
        validateArguments(method, args);

        return context;
      };
      // The `before` hook chain (including the validation hook)
      var beforeHooks = [validateHook].concat(_toConsumableArray(getHooks(app, service, 'before', method)));

      // Process all before hooks
      return processHooks.call(service, beforeHooks, hookObject)
      // Use the hook object to call the original method
      .then(function (hookObject) {
        // If `hookObject.result` is set, skip the original method
        if (typeof hookObject.result !== 'undefined') {
          return hookObject;
        }

        // Otherwise, call it with arguments created from the hook object
        var promise = _super.apply(undefined, _toConsumableArray(makeArguments(hookObject)));

        if (!isPromise(promise)) {
          throw new Error('Service method \'' + hookObject.method + '\' for \'' + hookObject.path + '\' service must return a promise');
        }

        return promise.then(function (result) {
          hookObject.result = result;

          return hookObject;
        });
      })
      // Make a (shallow) copy of hookObject from `before` hooks and update type
      .then(function (hookObject) {
        return Object.assign({}, hookObject, { type: 'after' });
      })
      // Run through all `after` hooks
      .then(function (hookObject) {
        // Combine all app and service `after` and `finally` hooks and process
        var afterHooks = getHooks(app, service, 'after', method, true);
        var finallyHooks = getHooks(app, service, 'finally', method, true);
        var hookChain = afterHooks.concat(finallyHooks);

        return processHooks.call(service, hookChain, hookObject);
      }).then(function (hookObject) {
        return (
          // Finally, return the result
          // Or the hook object if the `returnHook` flag is set
          returnHook ? hookObject : hookObject.result
        );
      })
      // Handle errors
      .catch(function (error) {
        // Combine all app and service `error` and `finally` hooks and process
        var errorHooks = getHooks(app, service, 'error', method, true);
        var finallyHooks = getHooks(app, service, 'finally', method, true);
        var hookChain = errorHooks.concat(finallyHooks);

        // A shallow copy of the hook object
        var errorHookObject = _.omit(Object.assign({}, error.hook, hookObject, {
          type: 'error',
          original: error.hook,
          error: error
        }), 'result');

        return processHooks.call(service, hookChain, errorHookObject).catch(function (error) {
          errorHookObject.error = error;

          return errorHookObject;
        }).then(function (hook) {
          if (returnHook) {
            // Either resolve or reject with the hook object
            return typeof hook.result !== 'undefined' ? hook : Promise.reject(hook);
          }

          // Otherwise return either the result if set (to swallow errors)
          // Or reject with the hook error
          return typeof hook.result !== 'undefined' ? hook.result : Promise.reject(hook.error);
        });
      });
    };
  });

  service.mixin(mixin);
};

module.exports = function () {
  return function (app) {
    // We store a reference of all supported hook types on the app
    // in case someone needs it
    Object.assign(app, {
      hookTypes: ['before', 'after', 'error', 'finally']
    });

    // Add functionality for hooks to be registered as app.hooks
    enableHooks(app, app.methods, app.hookTypes);

    app.mixins.push(hookMixin);
  };
};