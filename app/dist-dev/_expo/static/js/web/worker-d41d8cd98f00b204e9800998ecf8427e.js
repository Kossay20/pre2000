var __BUNDLE_START_TIME__=globalThis.nativePerformanceNow?nativePerformanceNow():Date.now(),__DEV__=true,process=globalThis.process||{},__METRO_GLOBAL_PREFIX__='',__requireCycleIgnorePatterns=[/(^|\/|\\)node_modules($|\/|\\)/];process.env=process.env||{};process.env.NODE_ENV=process.env.NODE_ENV||"development";
(function (global) {
  'use strict';

  if (__DEV__ || !global[`${__METRO_GLOBAL_PREFIX__}__d`]) {
    global.__r = metroRequire;
    global[`${__METRO_GLOBAL_PREFIX__}__d`] = define;
    global.__c = clear;
    global.__registerSegment = registerSegment;
  }
  var modules = clear();
  const EMPTY = {};
  const CYCLE_DETECTED = {};
  const {
    hasOwnProperty
  } = {};
  if (__DEV__) {
    global.$RefreshReg$ = global.$RefreshReg$ ?? (() => {});
    global.$RefreshSig$ = global.$RefreshSig$ ?? (() => type => type);
  }
  function clear() {
    modules = new Map();
    return modules;
  }
  if (__DEV__) {
    var initializingModuleIds = [];
  }
  function define(factory, moduleId, dependencyMap) {
    if (modules.has(moduleId)) {
      if (__DEV__) {
        const inverseDependencies = arguments[4];
        if (inverseDependencies) {
          global.__accept(moduleId, factory, dependencyMap, inverseDependencies);
        }
      }
      return;
    }
    const mod = {
      dependencyMap,
      factory,
      hasError: false,
      importedAll: EMPTY,
      importedDefault: EMPTY,
      isInitialized: false,
      publicModule: {
        exports: {}
      }
    };
    modules.set(moduleId, mod);
    if (__DEV__) {
      mod.hot = createHotReloadingObject();
      const verboseName = arguments[3];
      if (verboseName) {
        mod.verboseName = verboseName;
      }
    }
  }
  function metroRequire(moduleId, moduleIdHint) {
    if (moduleId === null) {
      if (__DEV__ && typeof moduleIdHint === 'string') {
        throw new Error("Cannot find module '" + moduleIdHint + "'");
      }
      throw new Error('Cannot find module');
    }
    if (__DEV__) {
      const initializingIndex = initializingModuleIds.indexOf(moduleId);
      if (initializingIndex !== -1) {
        const cycle = initializingModuleIds.slice(initializingIndex).map(id => {
          var _modules_get;
          return ((_modules_get = modules.get(id)) == null ? void 0 : _modules_get.verboseName) ?? '[unknown]';
        });
        if (shouldPrintRequireCycle(cycle)) {
          cycle.push(cycle[0]);
          console.warn(`Require cycle: ${cycle.join(' -> ')}\n\n` + 'Require cycles are allowed, but can result in uninitialized values. ' + 'Consider refactoring to remove the need for a cycle.');
        }
      }
    }
    const module = modules.get(moduleId);
    return module && module.isInitialized ? module.publicModule.exports : guardedLoadModule(moduleId, module, moduleIdHint);
  }
  function shouldPrintRequireCycle(modules) {
    const rcip = __METRO_GLOBAL_PREFIX__ + '__requireCycleIgnorePatterns';
    const regExps = globalThis[rcip] ?? global[rcip] ?? [/(^|\/|\\)node_modules($|\/|\\)/];
    if (!Array.isArray(regExps)) {
      return true;
    }
    const isIgnored = module => module != null && regExps.some(regExp => regExp.test(module));
    return modules.every(module => !isIgnored(module));
  }
  function metroImportDefault(moduleId) {
    var _modules_get;
    if (modules.has(moduleId) && ((_modules_get = modules.get(moduleId)) == null ? void 0 : _modules_get.importedDefault) !== EMPTY) {
      return modules.get(moduleId).importedDefault;
    }
    const exports = metroRequire(moduleId);
    const importedDefault = exports && exports.__esModule ? exports.default : exports;
    return modules.get(moduleId).importedDefault = importedDefault;
  }
  metroRequire.importDefault = metroImportDefault;
  function metroImportAll(moduleId) {
    var _modules_get;
    if (modules.has(moduleId) && ((_modules_get = modules.get(moduleId)) == null ? void 0 : _modules_get.importedAll) !== EMPTY) {
      return modules.get(moduleId).importedAll;
    }
    const exports = metroRequire(moduleId);
    let importedAll;
    if (exports && exports.__esModule) {
      importedAll = exports;
    } else {
      importedAll = {};
      if (exports) {
        for (const key in exports) {
          if (hasOwnProperty.call(exports, key)) {
            importedAll[key] = exports[key];
          }
        }
      }
      importedAll.default = exports;
    }
    return modules.get(moduleId).importedAll = importedAll;
  }
  metroRequire[Symbol.for('expo.require')] = true;
  metroRequire.importAll = metroImportAll;
  metroRequire.context = function fallbackRequireContext() {
    if (__DEV__) {
      throw new Error('The experimental Metro feature `require.context` is not enabled in your project.\nThis can be enabled by setting the `transformer.unstable_allowRequireContext` property to `true` in your Metro configuration.');
    }
    throw new Error('The experimental Metro feature `require.context` is not enabled in your project.');
  };
  metroRequire.resolveWeak = function fallbackRequireResolveWeak() {
    if (__DEV__) {
      throw new Error('require.resolveWeak cannot be called dynamically. Ensure you are using the same version of `metro` and `metro-runtime`.');
    }
    throw new Error('require.resolveWeak cannot be called dynamically.');
  };
  metroRequire.unguarded = function requireUnguarded(moduleId, moduleIdHint) {
    if (__DEV__) {
      const initializingIndex = initializingModuleIds.indexOf(moduleId);
      if (initializingIndex !== -1) {
        const cycle = initializingModuleIds.slice(initializingIndex).map(id => {
          var _modules_get;
          return ((_modules_get = modules.get(id)) == null ? void 0 : _modules_get.verboseName) ?? '[unknown]';
        });
        if (shouldPrintRequireCycle(cycle)) {
          cycle.push(cycle[0]);
          console.warn(`Require cycle: ${cycle.join(' -> ')}\n\n` + 'Require cycles are allowed, but can result in uninitialized values. ' + 'Consider refactoring to remove the need for a cycle.');
        }
      }
    }
    const module = modules.get(moduleId);
    return module && module.isInitialized ? module.publicModule.exports : loadModuleImplementation(moduleId, module, moduleIdHint);
  };
  let inGuard = false;
  function guardedLoadModule(moduleId, module, moduleIdHint) {
    if (!inGuard && global.ErrorUtils) {
      inGuard = true;
      let returnValue;
      try {
        returnValue = loadModuleImplementation(moduleId, module, moduleIdHint);
      } catch (e) {
        global.ErrorUtils.reportFatalError(e);
      }
      inGuard = false;
      return returnValue;
    } else {
      return loadModuleImplementation(moduleId, module, moduleIdHint);
    }
  }
  const ID_MASK_SHIFT = 16;
  const LOCAL_ID_MASK = ~0 >>> ID_MASK_SHIFT;
  function unpackModuleId(moduleId) {
    if (typeof moduleId !== 'number') {
      throw new Error('Module ID must be a number in unpackModuleId.');
    }
    const segmentId = moduleId >>> ID_MASK_SHIFT;
    const localId = moduleId & LOCAL_ID_MASK;
    return {
      segmentId,
      localId
    };
  }
  metroRequire.unpackModuleId = unpackModuleId;
  function packModuleId(value) {
    return (value.segmentId << ID_MASK_SHIFT) + value.localId;
  }
  metroRequire.packModuleId = packModuleId;
  const moduleDefinersBySegmentID = [];
  const definingSegmentByModuleID = new Map();
  function registerSegment(segmentId, moduleDefiner, moduleIds) {
    moduleDefinersBySegmentID[segmentId] = moduleDefiner;
    if (__DEV__) {
      if (segmentId === 0 && moduleIds) {
        throw new Error('registerSegment: Expected moduleIds to be null for main segment');
      }
      if (segmentId !== 0 && !moduleIds) {
        throw new Error('registerSegment: Expected moduleIds to be passed for segment #' + segmentId);
      }
    }
    if (moduleIds) {
      moduleIds.forEach(moduleId => {
        if (!modules.has(moduleId) && !definingSegmentByModuleID.has(moduleId)) {
          definingSegmentByModuleID.set(moduleId, segmentId);
        }
      });
    }
  }
  function loadModuleImplementation(moduleId, module, moduleIdHint) {
    if (!module && moduleDefinersBySegmentID.length > 0) {
      const segmentId = definingSegmentByModuleID.get(moduleId) ?? 0;
      const definer = moduleDefinersBySegmentID[segmentId];
      if (definer != null) {
        definer(moduleId);
        module = modules.get(moduleId);
        definingSegmentByModuleID.delete(moduleId);
      }
    }
    if (!module) {
      throw unknownModuleError(moduleId, moduleIdHint);
    }
    if (module.hasError) {
      throw module.error;
    }
    if (__DEV__) {
      var Systrace = requireSystrace();
      var Refresh = requireRefresh();
    }
    module.isInitialized = true;
    const {
      factory,
      dependencyMap
    } = module;
    if (__DEV__) {
      initializingModuleIds.push(moduleId);
    }
    try {
      if (__DEV__) {
        Systrace.beginEvent('JS_require_' + (module.verboseName || moduleId));
      }
      const moduleObject = module.publicModule;
      if (__DEV__) {
        moduleObject.hot = module.hot;
        var prevRefreshReg = global.$RefreshReg$;
        var prevRefreshSig = global.$RefreshSig$;
        if (Refresh != null) {
          const RefreshRuntime = Refresh;
          global.$RefreshReg$ = (type, id) => {
            const prefixedModuleId = __METRO_GLOBAL_PREFIX__ + ' ' + moduleId + ' ' + id;
            RefreshRuntime.register(type, prefixedModuleId);
          };
          global.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
        }
      }
      moduleObject.id = moduleId;
      factory == null ? void 0 : factory(global, metroRequire, metroImportDefault, metroImportAll, moduleObject, moduleObject.exports, dependencyMap);
      if (!__DEV__) {
        module.factory = undefined;
        module.dependencyMap = undefined;
      }
      if (__DEV__) {
        Systrace.endEvent();
        if (Refresh != null) {
          const prefixedModuleId = __METRO_GLOBAL_PREFIX__ + ' ' + moduleId;
          registerExportsForReactRefresh(Refresh, moduleObject.exports, prefixedModuleId);
        }
      }
      return moduleObject.exports;
    } catch (e) {
      module.hasError = true;
      module.error = e;
      module.isInitialized = false;
      module.publicModule.exports = undefined;
      throw e;
    } finally {
      if (__DEV__) {
        if (initializingModuleIds.pop() !== moduleId) {
          throw new Error('initializingModuleIds is corrupt; something is terribly wrong');
        }
        global.$RefreshReg$ = prevRefreshReg;
        global.$RefreshSig$ = prevRefreshSig;
      }
    }
  }
  function unknownModuleError(id, moduleIdHint) {
    let message = 'Requiring unknown module "' + (id ?? moduleIdHint ?? `[unknown optional import]`) + '".';
    if (__DEV__) {
      message += ' If you are sure the module exists, try restarting Metro. ' + 'You may also want to run `yarn` or `npm install`.';
    }
    return Error(message);
  }
  if (__DEV__) {
    metroRequire.Systrace = {
      beginEvent: () => {},
      endEvent: () => {}
    };
    metroRequire.getModules = () => {
      return modules;
    };
    var createHotReloadingObject = function () {
      const hot = {
        _acceptCallback: null,
        _disposeCallback: null,
        _didAccept: false,
        accept: callback => {
          hot._didAccept = true;
          hot._acceptCallback = callback;
        },
        dispose: callback => {
          hot._disposeCallback = callback;
        }
      };
      return hot;
    };
    let reactRefreshTimeout = null;
    const metroHotUpdateModule = function (id, factory, dependencyMap, inverseDependencies) {
      const mod = modules.get(id);
      if (!mod) {
        if (factory) {
          return;
        }
        throw unknownModuleError(id);
      }
      if (!mod.hasError && !mod.isInitialized) {
        mod.factory = factory;
        mod.dependencyMap = dependencyMap;
        return;
      }
      const Refresh = requireRefresh();
      const refreshBoundaryIDs = new Set();
      let didBailOut = false;
      let updatedModuleIDs;
      try {
        updatedModuleIDs = topologicalSort([id], pendingID => {
          const pendingModule = modules.get(pendingID);
          if (pendingModule == null) {
            return [];
          }
          const pendingHot = pendingModule.hot;
          if (pendingHot == null) {
            throw new Error('[Refresh] Expected module.hot to always exist in DEV.');
          }
          let canAccept = pendingHot._didAccept;
          if (!canAccept && Refresh != null) {
            const isBoundary = isReactRefreshBoundary(Refresh, pendingModule.publicModule.exports);
            if (isBoundary) {
              canAccept = true;
              refreshBoundaryIDs.add(pendingID);
            }
          }
          if (canAccept) {
            return [];
          }
          const parentIDs = inverseDependencies[pendingID];
          if (parentIDs.length === 0) {
            performFullRefresh('No root boundary', {
              source: mod,
              failed: pendingModule
            });
            didBailOut = true;
            return [];
          }
          return parentIDs;
        }, () => didBailOut).reverse();
      } catch (e) {
        if (e === CYCLE_DETECTED) {
          performFullRefresh('Dependency cycle', {
            source: mod
          });
          return;
        }
        throw e;
      }
      if (didBailOut) {
        return;
      }
      const seenModuleIDs = new Set();
      for (let i = 0; i < updatedModuleIDs.length; i++) {
        const updatedID = updatedModuleIDs[i];
        if (seenModuleIDs.has(updatedID)) {
          continue;
        }
        seenModuleIDs.add(updatedID);
        const updatedMod = modules.get(updatedID);
        if (updatedMod == null) {
          throw new Error('[Refresh] Expected to find the updated module.');
        }
        const prevExports = updatedMod.publicModule.exports;
        const didError = runUpdatedModule(updatedID, updatedID === id ? factory : undefined, updatedID === id ? dependencyMap : undefined);
        const nextExports = updatedMod.publicModule.exports;
        if (didError) {
          return;
        }
        if (refreshBoundaryIDs.has(updatedID)) {
          const isNoLongerABoundary = !isReactRefreshBoundary(Refresh, nextExports);
          const didInvalidate = shouldInvalidateReactRefreshBoundary(Refresh, prevExports, nextExports);
          if (isNoLongerABoundary || didInvalidate) {
            const parentIDs = inverseDependencies[updatedID];
            if (parentIDs.length === 0) {
              performFullRefresh(isNoLongerABoundary ? 'No longer a boundary' : 'Invalidated boundary', {
                source: mod,
                failed: updatedMod
              });
              return;
            }
            for (let j = 0; j < parentIDs.length; j++) {
              const parentID = parentIDs[j];
              const parentMod = modules.get(parentID);
              if (parentMod == null) {
                throw new Error('[Refresh] Expected to find parent module.');
              }
              const canAcceptParent = isReactRefreshBoundary(Refresh, parentMod.publicModule.exports);
              if (canAcceptParent) {
                refreshBoundaryIDs.add(parentID);
                updatedModuleIDs.push(parentID);
              } else {
                performFullRefresh('Invalidated boundary', {
                  source: mod,
                  failed: parentMod
                });
                return;
              }
            }
          }
        }
      }
      if (Refresh != null) {
        if (reactRefreshTimeout == null) {
          reactRefreshTimeout = setTimeout(() => {
            reactRefreshTimeout = null;
            Refresh.performReactRefresh();
          }, 30);
        }
      }
    };
    const topologicalSort = function (roots, getEdges, earlyStop) {
      const result = [];
      const visited = new Set();
      const stack = new Set();
      function traverseDependentNodes(node) {
        if (stack.has(node)) {
          throw CYCLE_DETECTED;
        }
        if (visited.has(node)) {
          return;
        }
        visited.add(node);
        stack.add(node);
        const dependentNodes = getEdges(node);
        if (earlyStop(node)) {
          stack.delete(node);
          return;
        }
        dependentNodes.forEach(dependent => {
          traverseDependentNodes(dependent);
        });
        stack.delete(node);
        result.push(node);
      }
      roots.forEach(root => {
        traverseDependentNodes(root);
      });
      return result;
    };
    const runUpdatedModule = function (id, factory, dependencyMap) {
      const mod = modules.get(id);
      if (mod == null) {
        throw new Error('[Refresh] Expected to find the module.');
      }
      const {
        hot
      } = mod;
      if (!hot) {
        throw new Error('[Refresh] Expected module.hot to always exist in DEV.');
      }
      if (hot._disposeCallback) {
        try {
          hot._disposeCallback();
        } catch (error) {
          console.error(`Error while calling dispose handler for module ${id}: `, error);
        }
      }
      if (factory) {
        mod.factory = factory;
      }
      if (dependencyMap) {
        mod.dependencyMap = dependencyMap;
      }
      mod.hasError = false;
      mod.error = undefined;
      mod.importedAll = EMPTY;
      mod.importedDefault = EMPTY;
      mod.isInitialized = false;
      const prevExports = mod.publicModule.exports;
      mod.publicModule.exports = {};
      hot._didAccept = false;
      hot._acceptCallback = null;
      hot._disposeCallback = null;
      metroRequire(id);
      if (mod.hasError) {
        mod.hasError = false;
        mod.isInitialized = true;
        mod.error = null;
        mod.publicModule.exports = prevExports;
        return true;
      }
      if (hot._acceptCallback) {
        try {
          hot._acceptCallback();
        } catch (error) {
          console.error(`Error while calling accept handler for module ${id}: `, error);
        }
      }
      return false;
    };
    const performFullRefresh = (reason, modules) => {
      if (typeof window !== 'undefined' && window.location != null && typeof window.location.reload === 'function') {
        window.location.reload();
      } else {
        const Refresh = requireRefresh();
        if (Refresh != null) {
          var _modules_source, _modules_failed;
          const sourceName = ((_modules_source = modules.source) == null ? void 0 : _modules_source.verboseName) ?? 'unknown';
          const failedName = ((_modules_failed = modules.failed) == null ? void 0 : _modules_failed.verboseName) ?? 'unknown';
          Refresh.performFullRefresh(`Fast Refresh - ${reason} <${sourceName}> <${failedName}>`);
        } else {
          console.warn('Could not reload the application after an edit.');
        }
      }
    };
    var isSpecifierSafeToCheck = (moduleExports, key) => {
      if (moduleExports && moduleExports.__esModule) {
        return true;
      } else {
        const desc = Object.getOwnPropertyDescriptor(moduleExports, key);
        return !desc || !desc.get;
      }
    };
    var isReactRefreshBoundary = function (Refresh, moduleExports) {
      if (Refresh.isLikelyComponentType(moduleExports)) {
        return true;
      }
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return false;
      }
      let hasExports = false;
      let areAllExportsComponents = true;
      for (const key in moduleExports) {
        hasExports = true;
        if (key === '__esModule') {
          continue;
        } else if (!isSpecifierSafeToCheck(moduleExports, key)) {
          return false;
        }
        const exportValue = moduleExports[key];
        if (!Refresh.isLikelyComponentType(exportValue)) {
          areAllExportsComponents = false;
        }
      }
      return hasExports && areAllExportsComponents;
    };
    var shouldInvalidateReactRefreshBoundary = (Refresh, prevExports, nextExports) => {
      const prevSignature = getRefreshBoundarySignature(Refresh, prevExports);
      const nextSignature = getRefreshBoundarySignature(Refresh, nextExports);
      if (prevSignature.length !== nextSignature.length) {
        return true;
      }
      for (let i = 0; i < nextSignature.length; i++) {
        if (prevSignature[i] !== nextSignature[i]) {
          return true;
        }
      }
      return false;
    };
    var getRefreshBoundarySignature = (Refresh, moduleExports) => {
      const signature = [];
      signature.push(Refresh.getFamilyByType(moduleExports));
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return signature;
      }
      for (const key in moduleExports) {
        if (key === '__esModule') {
          continue;
        } else if (!isSpecifierSafeToCheck(moduleExports, key)) {
          continue;
        }
        const exportValue = moduleExports[key];
        signature.push(key);
        signature.push(Refresh.getFamilyByType(exportValue));
      }
      return signature;
    };
    var registerExportsForReactRefresh = (Refresh, moduleExports, moduleID) => {
      Refresh.register(moduleExports, moduleID + ' %exports%');
      if (moduleExports == null || typeof moduleExports !== 'object') {
        return;
      }
      for (const key in moduleExports) {
        if (!isSpecifierSafeToCheck(moduleExports, key)) {
          continue;
        }
        const exportValue = moduleExports[key];
        const typeID = moduleID + ' %exports% ' + key;
        Refresh.register(exportValue, typeID);
      }
    };
    global.__accept = metroHotUpdateModule;
  }
  if (__DEV__) {
    var requireSystrace = function requireSystrace() {
      return global[__METRO_GLOBAL_PREFIX__ + '__SYSTRACE'] || metroRequire.Systrace;
    };
    var requireRefresh = function requireRefresh() {
      return global[__METRO_GLOBAL_PREFIX__ + '__ReactRefresh'] || global[global.__METRO_GLOBAL_PREFIX__ + '__ReactRefresh'] || metroRequire.Refresh;
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
(function (global) {
  global.$$require_external = typeof require !== "undefined" ? m => require(m) : () => null;
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
/* HMR env vars from Expo CLI (dev-only) */ process.env=Object.defineProperties(process.env, {"EXPO_PUBLIC_FIREBASE_API_KEY": { enumerable: true, value: "AIzaSyBC7HcOFJqICM1JOXUa8pUtdCBF0IUm4aU" },"EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN": { enumerable: true, value: "pregnancy-app-1f939.firebaseapp.com" },"EXPO_PUBLIC_FIREBASE_PROJECT_ID": { enumerable: true, value: "pregnancy-app-1f939" },"EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET": { enumerable: true, value: "pregnancy-app-1f939.firebasestorage.app" },"EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": { enumerable: true, value: "990840531114" },"EXPO_PUBLIC_FIREBASE_APP_ID": { enumerable: true, value: "1:990840531114:web:cfc23b9320bfd4481a08d3" },"EXPO_PUBLIC_PROJECT_ROOT": { enumerable: true, value: "/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app" }});
(function (global) {
  let _inGuard = 0;
  let _globalHandler = global.RN$useAlwaysAvailableJSErrorHandling === true ? global.RN$handleException : (e, isFatal) => {
    throw e;
  };
  const ErrorUtils = {
    setGlobalHandler(fun) {
      _globalHandler = fun;
    },
    getGlobalHandler() {
      return _globalHandler;
    },
    reportError(error) {
      _globalHandler && _globalHandler(error, false);
    },
    reportFatalError(error) {
      _globalHandler && _globalHandler(error, true);
    },
    applyWithGuard(fun, context, args, unused_onError, unused_name) {
      try {
        _inGuard++;
        return fun.apply(context, args);
      } catch (e) {
        ErrorUtils.reportError(e);
      } finally {
        _inGuard--;
      }
      return null;
    },
    applyWithGuardIfNeeded(fun, context, args) {
      if (ErrorUtils.inGuard()) {
        return fun.apply(context, args);
      } else {
        ErrorUtils.applyWithGuard(fun, context, args);
      }
      return null;
    },
    inGuard() {
      return !!_inGuard;
    },
    guard(fun, name, context) {
      if (typeof fun !== 'function') {
        console.warn('A function must be passed to ErrorUtils.guard, got ', fun);
        return null;
      }
      const guardName = name ?? fun.name ?? '<generated guard>';
      function guarded(...args) {
        return ErrorUtils.applyWithGuard(fun, context ?? this, args, null, guardName);
      }
      return guarded;
    }
  };
  global.ErrorUtils = ErrorUtils;
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.sendWorkerResult = sendWorkerResult;
  exports.workerMessageHandler = workerMessageHandler;
  exports.invokeWorkerAsync = invokeWorkerAsync;
  exports.invokeWorkerSync = invokeWorkerSync;
  var _Deferred = require(_dependencyMap[0], "./Deferred");
  var _SyncSerializer = require(_dependencyMap[1], "./SyncSerializer");
  // Copyright 2015-present 650 Industries. All rights reserved.

  let messageId = 0;
  const deferredMap = new Map();
  const PENDING = 1;
  const RESOLVED = 2;
  let hasWarnedSync = false;

  /**
   * For worker to send result to the main thread.
   */
  function sendWorkerResult({
    id,
    result,
    error,
    syncTrait
  }) {
    if (syncTrait) {
      const {
        lockBuffer,
        resultBuffer
      } = syncTrait;
      const lock = new Int32Array(lockBuffer);
      const resultArray = new Uint8Array(resultBuffer);
      const resultJson = error != null ? (0, _SyncSerializer.serialize)({
        error
      }) : (0, _SyncSerializer.serialize)({
        result
      });
      const resultBytes = new TextEncoder().encode(resultJson);
      const length = resultBytes.length;
      resultArray.set(new Uint32Array([length]), 0);
      resultArray.set(resultBytes, 4);
      Atomics.store(lock, 0, RESOLVED);
    } else {
      if (result) {
        self.postMessage({
          id,
          result
        });
      } else {
        self.postMessage({
          id,
          error
        });
      }
    }
  }

  /**
   * For main thread to handle worker messages.
   */
  function workerMessageHandler(event) {
    const {
      id,
      result,
      error,
      isSync
    } = event.data;
    if (!isSync) {
      const deferred = deferredMap.get(id);
      if (deferred) {
        if (error) {
          deferred.reject(new Error(error));
        } else {
          deferred.resolve(result);
        }
        deferredMap.delete(id);
      }
    }
  }

  /**
   * For main thread to invoke worker function asynchronously.
   */
  async function invokeWorkerAsync(worker, type, data) {
    const id = messageId++;
    const deferred = new _Deferred.Deferred();
    deferredMap.set(id, deferred);
    worker.postMessage({
      type,
      id,
      data,
      isSync: false
    });
    return deferred.getPromise();
  }

  /**
   * For main thread to invoke worker function synchronously.
   */
  function invokeWorkerSync(worker, type, data) {
    if (__DEV__ && !hasWarnedSync) {
      console.warn('Using synchronous SQLite operations can cause significant performance impact. Consider using async operations instead.');
      hasWarnedSync = true;
    }
    const id = messageId++;
    const lockBuffer = new SharedArrayBuffer(4);
    const lock = new Int32Array(lockBuffer);
    const resultBuffer = new SharedArrayBuffer(1024 * 1024);
    const resultArray = new Uint8Array(resultBuffer);
    Atomics.store(lock, 0, PENDING);
    worker.postMessage({
      type,
      id,
      data,
      isSync: true,
      lockBuffer,
      resultBuffer
    });
    let i = 0;
    // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
    const useAtomicsPause = typeof Atomics.pause === 'function';
    while (Atomics.load(lock, 0) === PENDING) {
      ++i;
      if (useAtomicsPause) {
        if (i > 1_000_000) {
          throw new Error('Sync operation timeout');
        }
        // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
        Atomics.pause();
      } else {
        // NOTE(kudo): Unfortunate for the busy loop,
        // because we don't have a way for main thread to yield its execution to other callbacks.
        if (i > 1000_000_000) {
          throw new Error('Sync operation timeout');
        }
      }
    }
    const length = new Uint32Array(resultArray.buffer, 0, 1)[0];
    const resultCopy = new Uint8Array(length);
    resultCopy.set(new Uint8Array(resultArray.buffer, 4, length));
    const resultJson = new TextDecoder().decode(resultCopy);
    const {
      result,
      error
    } = (0, _SyncSerializer.deserialize)(resultJson);
    if (error) throw new Error(error);
    return result;
  }
},2865,[2866,2867],"node_modules/expo-sqlite/web/WorkerChannel.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "Deferred", {
    enumerable: true,
    get: function () {
      return Deferred;
    }
  });
  // Copyright 2015-present 650 Industries. All rights reserved.

  class Deferred {
    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this.resolveCallback = resolve;
        this.rejectCallback = reject;
      });
    }
    resolve(value) {
      this.resolveCallback(value);
    }
    reject(reason) {
      this.rejectCallback(reason);
    }
    getPromise() {
      return this.promise;
    }
  }
},2866,[],"node_modules/expo-sqlite/web/Deferred.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.serialize = serialize;
  exports.deserialize = deserialize;
  // Copyright 2015-present 650 Industries. All rights reserved.

  const UINT8ARRAY_TYPE = '__uint8array__';
  function isUint8ArrayMarker(value) {
    return value !== null && typeof value === 'object' && UINT8ARRAY_TYPE in value && Array.isArray(value.data);
  }

  /**
   * Serializes a value to a string that supports Uint8Arrays.
   */
  function serialize(value) {
    return JSON.stringify(value, (_, v) => {
      if (v instanceof Uint8Array) {
        return {
          [UINT8ARRAY_TYPE]: true,
          data: Array.from(v)
        };
      }
      return v;
    });
  }

  /**
   * Deserializes a string to value that supports Uint8Arrays.
   */
  function deserialize(json) {
    return JSON.parse(json, (_, value) => {
      if (isUint8ArrayMarker(value)) {
        return new Uint8Array(value.data);
      }
      return value;
    });
  }
},2867,[],"node_modules/expo-sqlite/web/SyncSerializer.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  var _SQLAction = require(_dependencyMap[0], "./SQLAction");
  var _SQLiteOptions = require(_dependencyMap[1], "./SQLiteOptions");
  var _WorkerChannel = require(_dependencyMap[2], "./WorkerChannel");
  var _waSqliteAccessHandlePoolVFS = require(_dependencyMap[3], "./wa-sqlite/AccessHandlePoolVFS");
  var _waSqliteMemoryVFS = require(_dependencyMap[4], "./wa-sqlite/MemoryVFS");
  var _waSqliteSqliteApi = require(_dependencyMap[5], "./wa-sqlite/sqlite-api");
  var SQLite = _interopNamespace(_waSqliteSqliteApi);
  var _waSqliteSqliteConstants = require(_dependencyMap[6], "./wa-sqlite/sqlite-constants");
  var _waSqliteWaSqlite = require(_dependencyMap[7], "./wa-sqlite/wa-sqlite");
  var WaSQLiteFactory = _interopDefault(_waSqliteWaSqlite);
  var _waSqliteWaSqliteWasm = require(_dependencyMap[8], "./wa-sqlite/wa-sqlite.wasm");
  var wasmModule = _interopDefault(_waSqliteWaSqliteWasm);
  // Copyright 2015-present 650 Industries. All rights reserved.

  /// <reference types="./wa-sqlite/types" />

  // @ts-expect-error wasm module is not typed

  const VFS_NAME_PERSISTENT = 'expo-sqlite';
  const VFS_NAME_MEMORY = 'expo-sqlite-memfs';
  const MAX_INT32 = 0x7fffffff;
  const MIN_INT32 = -0x80000000;
  let _sqlite3 = null;
  let _vfs = null;
  let _vfsMemory = null;
  const databaseIdMap = new Map();
  const statementIdMap = new Map();
  const sessionIdMap = new Map();
  class SQLiteErrorException extends Error {}
  self.onmessage = async event => {
    let result = null;
    let error = null;
    try {
      const message = event.data;
      result = await handleMessageImpl(message);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
    const syncTrait = event.data.isSync ? {
      lockBuffer: event.data.lockBuffer,
      resultBuffer: event.data.resultBuffer
    } : undefined;
    (0, _WorkerChannel.sendWorkerResult)({
      id: event.data.id,
      result,
      error,
      syncTrait
    });
  };
  async function handleMessageImpl({
    type,
    data
  }) {
    let result;
    switch (type) {
      case 'backupDatabase':
        {
          await backupDatabase(data.destNativeDatabaseId, data.destDatabaseName, data.sourceNativeDatabaseId, data.sourceDatabaseName);
          break;
        }
      case 'close':
        {
          await closeDatabase(data.nativeDatabaseId);
          break;
        }
      case 'deleteDatabase':
        {
          await deleteDatabase(data.databasePath);
          break;
        }
      case 'exec':
        {
          await exec(data.nativeDatabaseId, data.source);
          break;
        }
      case 'finalize':
        {
          await finalize(data.nativeDatabaseId, data.nativeStatementId);
          break;
        }
      case 'getAll':
        {
          result = await getAllRows(data.nativeDatabaseId, data.nativeStatementId);
          break;
        }
      case 'getColumnNames':
        {
          result = await getColumnNames(data.nativeStatementId);
          break;
        }
      case 'importAssetDatabase':
        {
          await importAssetDatabase(data.databasePath, data.assetDatabasePath, data.forceOverwrite);
          break;
        }
      case 'isInTransaction':
        {
          result = await isInTransaction(data.nativeDatabaseId);
          break;
        }
      case 'open':
        {
          await openDatabase(data.nativeDatabaseId, data.databasePath, new _SQLiteOptions.SQLiteOptions(data.options), data.serializedData);
          break;
        }
      case 'prepare':
        {
          result = await prepare(data.nativeDatabaseId, data.nativeStatementId, data.source);
          break;
        }
      case 'reset':
        {
          await reset(data.nativeDatabaseId, data.nativeStatementId);
          break;
        }
      case 'run':
        {
          result = await run(data.nativeDatabaseId, data.nativeStatementId, data.bindParams, data.bindBlobParams, data.shouldPassAsArray);
          break;
        }
      case 'serialize':
        {
          result = await serializeDatabase(data.nativeDatabaseId, data.schemaName);
          break;
        }
      case 'step':
        {
          result = await step(data.nativeDatabaseId, data.nativeStatementId);
          break;
        }
      case 'sessionCreate':
        {
          await sessionCreate(data.nativeDatabaseId, data.nativeSessionId, data.dbName);
          break;
        }
      case 'sessionAttach':
        {
          await sessionAttach(data.nativeDatabaseId, data.nativeSessionId, data.table);
          break;
        }
      case 'sessionEnable':
        {
          await sessionEnable(data.nativeDatabaseId, data.nativeSessionId, data.enabled);
          break;
        }
      case 'sessionClose':
        {
          await sessionClose(data.nativeDatabaseId, data.nativeSessionId);
          break;
        }
      case 'sessionCreateChangeset':
        {
          result = await sessionCreateChangeset(data.nativeDatabaseId, data.nativeSessionId);
          break;
        }
      case 'sessionCreateInvertedChangeset':
        {
          result = await sessionCreateInvertedChangeset(data.nativeDatabaseId, data.nativeSessionId);
          break;
        }
      case 'sessionApplyChangeset':
        {
          await sessionApplyChangeset(data.nativeDatabaseId, data.nativeSessionId, data.changeset);
          break;
        }
      case 'sessionInvertChangeset':
        {
          result = await sessionInvertChangeset(data.nativeDatabaseId, data.nativeSessionId, data.changeset);
          break;
        }
      default:
        {
          throw new Error(`Unknown message type: ${type}`);
        }
    }
    return result;
  }

  //#region Request handlers

  async function backupDatabase(destNativeDatabaseId, destDatabaseName, sourceNativeDatabaseId, sourceDatabaseName) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const destDb = databaseIdMap.get(destNativeDatabaseId);
    if (!destDb) throw new Error(`Database not found - nativeDatabaseId[${destNativeDatabaseId}]`);
    const sourceDb = databaseIdMap.get(sourceNativeDatabaseId);
    if (!sourceDb) throw new Error(`Database not found - nativeDatabaseId[${sourceNativeDatabaseId}]`);
    await sqlite3.backup(destDb.pointer, destDatabaseName, sourceDb.pointer, sourceDatabaseName);
  }
  async function closeDatabase(nativeDatabaseId) {
    maybeFinalizeAllStatements(nativeDatabaseId);
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (dbEntity) {
      databaseIdMap.delete(nativeDatabaseId);
      await sqlite3.close(dbEntity.pointer);
    }
  }
  async function deleteDatabase(databasePath) {
    const {
      vfs
    } = await maybeInitAsync();
    if (databasePath !== ':memory:') {
      vfs.jDelete(databasePath, 0 /* unused arg for AccessHandlePoolVFS */);
    }
  }
  async function deserializeDatabase(sqlite3, serializedData) {
    const pointer = await sqlite3.open_v2(':memory:', _waSqliteSqliteConstants.SQLITE_OPEN_READWRITE | _waSqliteSqliteConstants.SQLITE_OPEN_CREATE, VFS_NAME_MEMORY);
    await sqlite3.deserialize(pointer, 'main', serializedData);
    return pointer;
  }
  async function exec(nativeDatabaseId, source) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    await sqlite3.exec(dbEntity.pointer, source);
  }
  async function finalize(nativeDatabaseId, nativeStatementId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    statementIdMap.delete(nativeStatementId);
    if ((await sqlite3.finalize(stmt.pointer)) !== _waSqliteSqliteConstants.SQLITE_OK) {
      throw new Error('Error finalizing statement');
    }
  }
  async function getAllRows(nativeDatabaseId, nativeStatementId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const rows = [];
    while (true) {
      const ret = await sqlite3.step(stmt.pointer);
      if (ret === _waSqliteSqliteConstants.SQLITE_ROW) {
        rows.push(getColumnValues(sqlite3, stmt.pointer));
        continue;
      } else if (ret === _waSqliteSqliteConstants.SQLITE_DONE) {
        break;
      }
      throw new Error('Error executing statement');
    }
    return rows;
  }
  async function getColumnNames(nativeStatementId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const columnCount = sqlite3.column_count(stmt.pointer);
    const columnNames = [];
    for (let i = 0; i < columnCount; i++) {
      columnNames.push(sqlite3.column_name(stmt.pointer, i));
    }
    return columnNames;
  }
  async function importAssetDatabase(databasePath, assetDatabasePath, forceOverwrite) {
    const {
      sqlite3,
      vfs
    } = await maybeInitAsync();
    if (!forceOverwrite) {
      const buffer = new DataView(new ArrayBuffer(4));
      await vfs.jAccess(databasePath, 0 /* unused arg for AccessHandlePoolVFS */, buffer);
      if (buffer.getUint8(0) === 1) {
        return;
      }
    }
    const response = await fetch(assetDatabasePath);
    if (!response.ok) {
      throw new Error(`[importAssetDatabaseAsync] Failed to fetch asset database: ${response.statusText}`);
    }
    const serializedData = new Uint8Array(await response.arrayBuffer());
    const srcDb = await sqlite3.open_v2(databasePath, _waSqliteSqliteConstants.SQLITE_OPEN_READWRITE | _waSqliteSqliteConstants.SQLITE_OPEN_CREATE, VFS_NAME_PERSISTENT);
    await sqlite3.deserialize(srcDb, 'main', serializedData);
    const destDb = await sqlite3.open_v2(databasePath);
    await sqlite3.backup(destDb, 'main', srcDb, 'main');
    await sqlite3.close(srcDb);
    await sqlite3.close(destDb);
  }
  async function isInTransaction(nativeDatabaseId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    return sqlite3.get_autocommit(dbEntity.pointer) === 0;
  }
  async function openDatabase(nativeDatabaseId, databasePath, options, serializedData) {
    const {
      sqlite3
    } = await maybeInitAsync();
    let pointer;
    if (serializedData) {
      pointer = await deserializeDatabase(sqlite3, serializedData);
    } else {
      const dbEntity = findCachedDatabase(entity => entity.databasePath === databasePath && entity.openOptions.equals(options) && !options.useNewConnection);
      if (dbEntity) {
        databaseIdMap.set(nativeDatabaseId, dbEntity);
        await initDb(sqlite3, dbEntity);
        return;
      }
      const flags = _waSqliteSqliteConstants.SQLITE_OPEN_READWRITE | _waSqliteSqliteConstants.SQLITE_OPEN_CREATE;
      const vfsName = databasePath === ':memory:' ? VFS_NAME_MEMORY : VFS_NAME_PERSISTENT;
      pointer = await sqlite3.open_v2(databasePath, flags, vfsName);
    }
    const dbEntity = {
      pointer,
      databasePath,
      openOptions: options
    };
    databaseIdMap.set(nativeDatabaseId, dbEntity);
    await initDb(sqlite3, dbEntity);
  }
  async function prepare(nativeDatabaseId, nativeStatementId, source) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const asyncIterable = sqlite3.statements(dbEntity.pointer, source, {
      unscoped: true
    });
    const asyncIterator = asyncIterable[Symbol.asyncIterator]();
    const {
      value: statementPointer
    } = await asyncIterator.next();
    asyncIterator.return?.();
    if (!statementPointer) throw new Error('Failed to prepare statement');
    statementIdMap.set(nativeStatementId, {
      pointer: statementPointer
    });
  }
  async function run(nativeDatabaseId, nativeStatementId, bindParams, bindBlobParams, shouldPassAsArray) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    sqlite3.reset(stmt.pointer);
    sqlite3.clear_bindings(stmt.pointer);
    for (const [key, param] of Object.entries(bindParams)) {
      const index = getBindParamIndex(sqlite3, stmt.pointer, key, shouldPassAsArray);
      if (index > 0) {
        bindStatementParam(sqlite3, stmt.pointer, param, index);
      }
    }
    for (const [key, param] of Object.entries(bindBlobParams)) {
      const index = getBindParamIndex(sqlite3, stmt.pointer, key, shouldPassAsArray);
      if (index > 0) {
        bindStatementParam(sqlite3, stmt.pointer, param, index);
      }
    }
    const ret = await sqlite3.step(stmt.pointer);
    if (ret !== _waSqliteSqliteConstants.SQLITE_ROW && ret !== _waSqliteSqliteConstants.SQLITE_DONE) {
      throw new SQLiteErrorException('Error executing statement');
    }
    const firstRowValues = ret === _waSqliteSqliteConstants.SQLITE_ROW ? getColumnValues(sqlite3, stmt.pointer) : [];
    return {
      lastInsertRowId: Number(sqlite3.last_insert_rowid(dbEntity.pointer)),
      changes: sqlite3.changes(dbEntity.pointer),
      firstRowValues
    };
  }
  async function reset(nativeDatabaseId, nativeStatementId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    if ((await sqlite3.reset(stmt.pointer)) !== _waSqliteSqliteConstants.SQLITE_OK) {
      throw new Error('Error resetting statement');
    }
  }
  async function serializeDatabase(nativeDatabaseId, schemaName) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    return sqlite3.serialize(dbEntity.pointer, schemaName);
  }
  async function step(nativeDatabaseId, nativeStatementId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const stmt = statementIdMap.get(nativeStatementId);
    if (!stmt) throw new Error(`Statement not found - nativeStatementId[${nativeStatementId}]`);
    const ret = await sqlite3.step(stmt.pointer);
    if (ret === _waSqliteSqliteConstants.SQLITE_ROW) {
      return getColumnValues(sqlite3, stmt.pointer);
    }
    if (ret !== _waSqliteSqliteConstants.SQLITE_DONE) {
      throw new Error('Error executing statement');
    }
    return null;
  }
  async function sessionCreate(nativeDatabaseId, nativeSessionId, dbName) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sqlite3.session_create(dbEntity.pointer, dbName);
    sessionIdMap.set(nativeSessionId, {
      pointer: session
    });
  }
  async function sessionAttach(nativeDatabaseId, nativeSessionId, table) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sessionIdMap.get(nativeSessionId);
    if (!session) throw new Error(`Session not found - nativeSessionId[${nativeSessionId}]`);
    sqlite3.session_attach(session.pointer, table);
  }
  async function sessionEnable(nativeDatabaseId, nativeSessionId, enabled) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sessionIdMap.get(nativeSessionId);
    if (!session) throw new Error(`Session not found - nativeSessionId[${nativeSessionId}]`);
    sqlite3.session_enable(session.pointer, enabled);
  }
  async function sessionClose(nativeDatabaseId, nativeSessionId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sessionIdMap.get(nativeSessionId);
    if (!session) throw new Error(`Session not found - nativeSessionId[${nativeSessionId}]`);
    sessionIdMap.delete(nativeSessionId);
    sqlite3.session_delete(session.pointer);
  }
  async function sessionCreateChangeset(nativeDatabaseId, nativeSessionId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sessionIdMap.get(nativeSessionId);
    if (!session) throw new Error(`Session not found - nativeSessionId[${nativeSessionId}]`);
    return sqlite3.session_changeset(session.pointer);
  }
  async function sessionCreateInvertedChangeset(nativeDatabaseId, nativeSessionId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    const session = sessionIdMap.get(nativeSessionId);
    if (!session) throw new Error(`Session not found - nativeSessionId[${nativeSessionId}]`);
    return sqlite3.session_changeset_inverted(session.pointer);
  }
  async function sessionApplyChangeset(nativeDatabaseId, nativeSessionId, changeset) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    sqlite3.changeset_apply(dbEntity.pointer, changeset);
  }
  async function sessionInvertChangeset(nativeDatabaseId, nativeSessionId, changeset) {
    const {
      sqlite3
    } = await maybeInitAsync();
    return sqlite3.changeset_invert(changeset);
  }

  //#endregion Request handlers

  //#region Internal helpers

  function addUpdateHook(sqlite3, dbEntity) {
    sqlite3.update_hook(dbEntity.pointer, (updateType, dbName, tblName, rowId) => {
      const message = {
        type: 'onDatabaseChange',
        data: {
          databaseName: dbName,
          databaseFilePath: sqlite3.db_filename(dbEntity.pointer, dbName ?? 'main'),
          tableName: tblName,
          rowId: Number.isSafeInteger(rowId) ? rowId : Number(rowId),
          typeId: (0, _SQLAction.createSQLAction)(updateType)
        }
      };
      self.postMessage(message);
    });
  }
  function bindStatementParam(sqlite3, stmt, param, index) {
    if (param == null) {
      sqlite3.bind_null(stmt, index);
    } else if (typeof param === 'number') {
      if (Number.isInteger(param)) {
        if (param > MAX_INT32 || param < MIN_INT32) {
          sqlite3.bind_int64(stmt, index, BigInt(param));
        } else {
          sqlite3.bind_int(stmt, index, param);
        }
      } else {
        sqlite3.bind_double(stmt, index, param);
      }
    } else if (typeof param === 'string') {
      sqlite3.bind_text(stmt, index, param);
    } else if (param instanceof Uint8Array) {
      sqlite3.bind_blob(stmt, index, param);
    } else if (typeof param === 'boolean') {
      sqlite3.bind_int(stmt, index, param ? 1 : 0);
    } else {
      throw new Error(`Unsupported parameter type: ${typeof param}`);
    }
  }
  function findCachedDatabase(predicate) {
    for (const entity of databaseIdMap.values()) {
      if (predicate(entity)) {
        return entity;
      }
    }
    return null;
  }
  function getBindParamIndex(sqlite3, stmt, key, shouldPassAsArray) {
    let index;
    if (shouldPassAsArray) {
      const intKey = parseInt(key, 10);
      if (isNaN(intKey)) {
        throw new Error('Invalid bind parameter');
      }
      index = intKey + 1;
    } else {
      index = sqlite3.bind_parameter_index(stmt, key);
    }
    return index;
  }
  function getColumnValue(sqlite3, stmt, index) {
    const type = sqlite3.column_type(stmt, index);
    let value;
    switch (type) {
      case SQLite.SQLITE_INTEGER:
        {
          value = sqlite3.column_int_safe(stmt, index);
          break;
        }
      case SQLite.SQLITE_FLOAT:
        {
          value = sqlite3.column_double(stmt, index);
          break;
        }
      case SQLite.SQLITE_TEXT:
        {
          value = sqlite3.column_text(stmt, index);
          break;
        }
      case SQLite.SQLITE_BLOB:
        {
          value = sqlite3.column_blob(stmt, index);
          break;
        }
      case SQLite.SQLITE_NULL:
        {
          value = null;
          break;
        }
      default:
        {
          throw new Error(`Unsupported column type: ${type}`);
        }
    }
    return value;
  }
  function getColumnValues(sqlite3, stmt) {
    const columnCount = sqlite3.column_count(stmt);
    const columnValues = [];
    for (let i = 0; i < columnCount; i++) {
      columnValues[i] = getColumnValue(sqlite3, stmt, i);
    }
    return columnValues;
  }
  async function initDb(sqlite3, dbEntity) {
    if (dbEntity.openOptions.enableChangeListener) {
      addUpdateHook(sqlite3, dbEntity);
    }
  }
  async function maybeFinalizeAllStatements(nativeDatabaseId) {
    const {
      sqlite3
    } = await maybeInitAsync();
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    if (!dbEntity) throw new Error(`Database not found - nativeDatabaseId[${nativeDatabaseId}]`);
    if (!dbEntity.openOptions.finalizeUnusedStatementsBeforeClosing) {
      return;
    }
    let error = null;
    const finalizedStatements = [];
    let stmt = sqlite3.next_stmt(dbEntity.pointer, null);
    while (stmt != null && stmt !== 0) {
      const nextStmt = sqlite3.next_stmt(dbEntity.pointer, stmt);
      try {
        sqlite3.finalize(stmt);
        finalizedStatements.push(stmt);
      } catch (e) {
        error = e;
      }
      stmt = nextStmt;
    }

    // Delete finalized statements from the map
    const statementsToDelete = [];
    for (const [nativeStatementId, stmtEntity] of statementIdMap.entries()) {
      if (finalizedStatements.includes(stmtEntity.pointer)) {
        statementsToDelete.push(nativeStatementId);
      }
    }
    for (const nativeStatementId of statementsToDelete) {
      statementIdMap.delete(nativeStatementId);
    }
    if (error) throw error;
  }
  async function maybeInitAsync() {
    if (!_sqlite3) {
      const module = await (0, WaSQLiteFactory.default)({
        locateFile: () => wasmModule.default
      });
      _sqlite3 = SQLite.Factory(module);
      if (!_sqlite3) {
        throw new Error('Failed to initialize wa-sqlite');
      }
      if (_vfs == null) {
        _vfs = await _waSqliteAccessHandlePoolVFS.AccessHandlePoolVFS.create(VFS_NAME_PERSISTENT, module);
        if (_vfs == null) {
          throw new Error('Failed to initialize AccessHandlePoolVFS');
        }
      }
      _sqlite3.vfs_register(_vfs, true);
      if (_vfsMemory == null) {
        _vfsMemory = await _waSqliteMemoryVFS.MemoryVFS.create(VFS_NAME_MEMORY, module);
        if (_vfsMemory == null) {
          throw new Error('Failed to initialize MemoryVFS');
        }
      }
      _sqlite3.vfs_register(_vfsMemory, false);
    }
    if (_vfs == null || _vfsMemory == null) {
      throw new Error('Invalid VFS state');
    }
    return {
      sqlite3: _sqlite3,
      vfs: _vfs,
      vfsMemory: _vfsMemory
    };
  }

  //#endregion Internal helpers
},2876,[2877,2878,2865,2879,2885,2886,2884,2887,2888],"node_modules/expo-sqlite/web/worker.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.createSQLAction = createSQLAction;
  // Copyright 2015-present 650 Industries. All rights reserved.

  function createSQLAction(value) {
    switch (value) {
      case 9:
        return 'delete';
      case 18:
        return 'insert';
      case 23:
        return 'update';
      default:
        return 'unknown';
    }
  }
},2877,[],"node_modules/expo-sqlite/web/SQLAction.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "SQLiteOptions", {
    enumerable: true,
    get: function () {
      return SQLiteOptions;
    }
  });
  // Copyright 2015-present 650 Industries. All rights reserved.

  class SQLiteOptions {
    enableChangeListener = false;
    useNewConnection = false;
    finalizeUnusedStatementsBeforeClosing = true;
    constructor(optionsObject) {
      this.enableChangeListener = optionsObject.enableChangeListener ?? false;
      this.useNewConnection = optionsObject.useNewConnection ?? false;
      this.finalizeUnusedStatementsBeforeClosing = optionsObject.finalizeUnusedStatementsBeforeClosing ?? true;
    }
    equals(other) {
      return this.enableChangeListener === other.enableChangeListener && this.finalizeUnusedStatementsBeforeClosing === other.finalizeUnusedStatementsBeforeClosing && this.useNewConnection === other.useNewConnection;
    }
    toString() {
      return JSON.stringify({
        enableChangeListener: this.enableChangeListener,
        finalizeUnusedStatementsBeforeClosing: this.finalizeUnusedStatementsBeforeClosing,
        useNewConnection: this.useNewConnection
      });
    }
  }
},2878,[],"node_modules/expo-sqlite/web/SQLiteOptions.ts");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "AccessHandlePoolVFS", {
    enumerable: true,
    get: function () {
      return AccessHandlePoolVFS;
    }
  });
  var _babelRuntimeHelpersClassPrivateFieldLooseBase = require(_dependencyMap[0], "@babel/runtime/helpers/classPrivateFieldLooseBase");
  var _classPrivateFieldLooseBase = _interopDefault(_babelRuntimeHelpersClassPrivateFieldLooseBase);
  var _babelRuntimeHelpersClassPrivateFieldLooseKey = require(_dependencyMap[1], "@babel/runtime/helpers/classPrivateFieldLooseKey");
  var _classPrivateFieldLooseKey = _interopDefault(_babelRuntimeHelpersClassPrivateFieldLooseKey);
  var _FacadeVFSJs = require(_dependencyMap[2], "./FacadeVFS.js");
  var _VFSJs = require(_dependencyMap[3], "./VFS.js");
  var VFS = _interopNamespace(_VFSJs);
  // Copyright 2023 Roy T. Hashimoto. All Rights Reserved.

  const SECTOR_SIZE = 4096;

  // Each OPFS file begins with a fixed-size header with metadata. The
  // contents of the file follow immediately after the header.
  const HEADER_MAX_PATH_SIZE = 512;
  const HEADER_FLAGS_SIZE = 4;
  const HEADER_DIGEST_SIZE = 8;
  const HEADER_CORPUS_SIZE = HEADER_MAX_PATH_SIZE + HEADER_FLAGS_SIZE;
  const HEADER_OFFSET_FLAGS = HEADER_MAX_PATH_SIZE;
  const HEADER_OFFSET_DIGEST = HEADER_CORPUS_SIZE;
  const HEADER_OFFSET_DATA = SECTOR_SIZE;

  // These file types are expected to persist in the file system outside
  // a session. Other files will be removed on VFS start.
  const PERSISTENT_FILE_TYPES = VFS.SQLITE_OPEN_MAIN_DB | VFS.SQLITE_OPEN_MAIN_JOURNAL | VFS.SQLITE_OPEN_SUPER_JOURNAL | VFS.SQLITE_OPEN_WAL;
  const DEFAULT_CAPACITY = 6;

  /**
   * This VFS uses the updated Access Handle API with all synchronous methods
   * on FileSystemSyncAccessHandle (instead of just read and write). It will
   * work with the regular SQLite WebAssembly build, i.e. the one without
   * Asyncify.
   */
  var _directoryPath = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("directoryPath");
  var _directoryHandle = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("directoryHandle");
  var _mapAccessHandleToName = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("mapAccessHandleToName");
  var _mapPathToAccessHandle = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("mapPathToAccessHandle");
  var _availableAccessHandles = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("availableAccessHandles");
  var _mapIdToFile = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("mapIdToFile");
  var _acquireAccessHandles = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("acquireAccessHandles");
  var _releaseAccessHandles = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("releaseAccessHandles");
  var _getAssociatedPath = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("getAssociatedPath");
  var _setAssociatedPath = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("setAssociatedPath");
  var _computeDigest = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("computeDigest");
  var _getPath = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("getPath");
  var _deletePath = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("deletePath");
  class AccessHandlePoolVFS extends _FacadeVFSJs.FacadeVFS {
    static async create(name, module) {
      const vfs = new AccessHandlePoolVFS(name, module);
      await vfs.isReady();
      return vfs;
    }
    constructor(_name, module) {
      super(_name, module);
      /**
       * Remove the association between a path and an OPFS file.
       * @param {string} path
       */
      Object.defineProperty(this, _deletePath, {
        value: _deletePath2
      });
      /**
       * Convert a bare filename, path, or URL to a UNIX-style path.
       * @param {string|URL} nameOrURL
       * @returns {string} path
       */
      Object.defineProperty(this, _getPath, {
        value: _getPath2
      });
      /**
       * We need a synchronous digest function so can't use WebCrypto.
       * Adapted from https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
       * @param {Uint8Array} corpus
       * @returns {ArrayBuffer} 64-bit digest
       */
      Object.defineProperty(this, _computeDigest, {
        value: _computeDigest2
      });
      /**
       * Set the path on an OPFS file header.
       * @param accessHandle FileSystemSyncAccessHandle
       * @param {string} path
       * @param {number} flags
       */
      Object.defineProperty(this, _setAssociatedPath, {
        value: _setAssociatedPath2
      });
      /**
       * Read and return the associated path from an OPFS file header.
       * Empty string is returned for an unassociated OPFS file.
       * @param accessHandle FileSystemSyncAccessHandle
       * @returns {string} path or empty string
       */
      Object.defineProperty(this, _getAssociatedPath, {
        value: _getAssociatedPath2
      });
      Object.defineProperty(this, _releaseAccessHandles, {
        value: _releaseAccessHandles2
      });
      Object.defineProperty(this, _acquireAccessHandles, {
        value: _acquireAccessHandles2
      });
      this.log = null;
      //function(...args) { console.log(`[${contextName}]`, ...args) };
      // All the OPFS files the VFS uses are contained in one flat directory
      // specified in the constructor. No other files should be written here.
      Object.defineProperty(this, _directoryPath, {
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, _directoryHandle, {
        writable: true,
        value: void 0
      });
      // The OPFS files all have randomly-generated names that do not match
      // the SQLite files whose data they contain. This map links those names
      // with their respective OPFS access handles.
      Object.defineProperty(this, _mapAccessHandleToName, {
        writable: true,
        value: new Map()
      });
      // When a SQLite file is associated with an OPFS file, that association
      // is kept in #mapPathToAccessHandle. Each access handle is in exactly
      // one of #mapPathToAccessHandle or #availableAccessHandles.
      Object.defineProperty(this, _mapPathToAccessHandle, {
        writable: true,
        value: new Map()
      });
      Object.defineProperty(this, _availableAccessHandles, {
        writable: true,
        value: new Set()
      });
      Object.defineProperty(this, _mapIdToFile, {
        writable: true,
        value: new Map()
      });
      (0, _classPrivateFieldLooseBase.default)(this, _directoryPath)[_directoryPath] = _name;
    }

    /**
     * @param {string?} zName
     * @param {number} fileId
     * @param {number} flags
     * @param {DataView} pOutFlags
     * @returns {number}
     */
    jOpen(zName, fileId, flags, pOutFlags) {
      try {
        // First try to open a path that already exists in the file system.
        const path = zName ? (0, _classPrivateFieldLooseBase.default)(this, _getPath)[_getPath](zName) : Math.random().toString(36);
        let accessHandle = (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].get(path);
        if (!accessHandle && flags & VFS.SQLITE_OPEN_CREATE) {
          // File not found so try to create it.
          if (this.getSize() < this.getCapacity()) {
            // Choose an unassociated OPFS file from the pool.
            [accessHandle] = (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].keys();
            (0, _classPrivateFieldLooseBase.default)(this, _setAssociatedPath)[_setAssociatedPath](accessHandle, path, flags);
          } else {
            // Out of unassociated files. This can be fixed by calling
            // addCapacity() from the application.
            throw new Error('cannot create file');
          }
        }
        if (!accessHandle) {
          throw new Error('file not found');
        }
        // Subsequent methods are only passed the fileId, so make sure we have
        // a way to get the file resources.
        const file = {
          path,
          flags,
          accessHandle
        };
        (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].set(fileId, file);
        pOutFlags.setInt32(0, flags, true);
        return VFS.SQLITE_OK;
      } catch (e) {
        console.error(e.message);
        return VFS.SQLITE_CANTOPEN;
      }
    }

    /**
     * @param {number} fileId
     * @returns {number}
     */
    jClose(fileId) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      if (file) {
        file.accessHandle.flush();
        (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].delete(fileId);
        if (file.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
          (0, _classPrivateFieldLooseBase.default)(this, _deletePath)[_deletePath](file.path);
        }
      }
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {Uint8Array} pData
     * @param {number} iOffset
     * @returns {number}
     */
    jRead(fileId, pData, iOffset) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      const nBytes = file.accessHandle.read(pData.subarray(), {
        at: HEADER_OFFSET_DATA + iOffset
      });
      if (nBytes < pData.byteLength) {
        pData.fill(0, nBytes, pData.byteLength);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {Uint8Array} pData
     * @param {number} iOffset
     * @returns {number}
     */
    jWrite(fileId, pData, iOffset) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      const nBytes = file.accessHandle.write(pData.subarray(), {
        at: HEADER_OFFSET_DATA + iOffset
      });
      return nBytes === pData.byteLength ? VFS.SQLITE_OK : VFS.SQLITE_IOERR;
    }

    /**
     * @param {number} fileId
     * @param {number} iSize
     * @returns {number}
     */
    jTruncate(fileId, iSize) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      file.accessHandle.truncate(HEADER_OFFSET_DATA + iSize);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {number} flags
     * @returns {number}
     */
    jSync(fileId, flags) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      file.accessHandle.flush();
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {DataView} pSize64
     * @returns {number}
     */
    jFileSize(fileId, pSize64) {
      const file = (0, _classPrivateFieldLooseBase.default)(this, _mapIdToFile)[_mapIdToFile].get(fileId);
      const size = file.accessHandle.getSize() - HEADER_OFFSET_DATA;
      pSize64.setBigInt64(0, BigInt(size), true);
      return VFS.SQLITE_OK;
    }
    jSectorSize(fileId) {
      return SECTOR_SIZE;
    }
    jDeviceCharacteristics(fileId) {
      return VFS.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
    }

    /**
     * @param {string} zName
     * @param {number} flags
     * @param {DataView} pResOut
     * @returns {number}
     */
    jAccess(zName, flags, pResOut) {
      const path = (0, _classPrivateFieldLooseBase.default)(this, _getPath)[_getPath](zName);
      pResOut.setInt32(0, (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].has(path) ? 1 : 0, true);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {string} zName
     * @param {number} syncDir
     * @returns {number}
     */
    jDelete(zName, syncDir) {
      const path = (0, _classPrivateFieldLooseBase.default)(this, _getPath)[_getPath](zName);
      (0, _classPrivateFieldLooseBase.default)(this, _deletePath)[_deletePath](path);
      return VFS.SQLITE_OK;
    }
    async close() {
      await (0, _classPrivateFieldLooseBase.default)(this, _releaseAccessHandles)[_releaseAccessHandles]();
    }
    async isReady() {
      if (!(0, _classPrivateFieldLooseBase.default)(this, _directoryHandle)[_directoryHandle]) {
        // All files are stored in a single directory.
        let handle = await navigator.storage.getDirectory();
        for (const d of (0, _classPrivateFieldLooseBase.default)(this, _directoryPath)[_directoryPath].split('/')) {
          if (d) {
            handle = await handle.getDirectoryHandle(d, {
              create: true
            });
          }
        }
        (0, _classPrivateFieldLooseBase.default)(this, _directoryHandle)[_directoryHandle] = handle;
        await (0, _classPrivateFieldLooseBase.default)(this, _acquireAccessHandles)[_acquireAccessHandles]();
        if (this.getCapacity() === 0) {
          await this.addCapacity(DEFAULT_CAPACITY);
        }
      }
      return true;
    }

    /**
     * Returns the number of SQLite files in the file system.
     * @returns {number}
     */
    getSize() {
      return (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].size;
    }

    /**
     * Returns the maximum number of SQLite files the file system can hold.
     * @returns {number}
     */
    getCapacity() {
      return (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].size;
    }

    /**
     * Increase the capacity of the file system by n.
     * @param {number} n
     * @returns {Promise<number>}
     */
    async addCapacity(n) {
      for (let i = 0; i < n; ++i) {
        const name = Math.random().toString(36).replace('0.', '');
        const handle = await (0, _classPrivateFieldLooseBase.default)(this, _directoryHandle)[_directoryHandle].getFileHandle(name, {
          create: true
        });
        const accessHandle = await handle.createSyncAccessHandle();
        (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].set(accessHandle, name);
        (0, _classPrivateFieldLooseBase.default)(this, _setAssociatedPath)[_setAssociatedPath](accessHandle, '', 0);
      }
      return n;
    }

    /**
     * Decrease the capacity of the file system by n. The capacity cannot be
     * decreased to fewer than the current number of SQLite files in the
     * file system.
     * @param {number} n
     * @returns {Promise<number>}
     */
    async removeCapacity(n) {
      let nRemoved = 0;
      for (const accessHandle of Array.from((0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles])) {
        if (nRemoved == n || this.getSize() === this.getCapacity()) return nRemoved;
        const name = (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].get(accessHandle);
        await accessHandle.close();
        await (0, _classPrivateFieldLooseBase.default)(this, _directoryHandle)[_directoryHandle].removeEntry(name);
        (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].delete(accessHandle);
        (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].delete(accessHandle);
        ++nRemoved;
      }
      return nRemoved;
    }
  }
  async function _acquireAccessHandles2() {
    // Enumerate all the files in the directory.
    const files = [];
    for await (const [name, handle] of (0, _classPrivateFieldLooseBase.default)(this, _directoryHandle)[_directoryHandle]) {
      if (handle.kind === 'file') {
        files.push([name, handle]);
      }
    }

    // Open access handles in parallel, separating associated and unassociated.
    await Promise.all(files.map(async ([name, handle]) => {
      const accessHandle = await handle.createSyncAccessHandle();
      (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].set(accessHandle, name);
      const path = (0, _classPrivateFieldLooseBase.default)(this, _getAssociatedPath)[_getAssociatedPath](accessHandle);
      if (path) {
        (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].set(path, accessHandle);
      } else {
        (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].add(accessHandle);
      }
    }));
  }
  function _releaseAccessHandles2() {
    for (const accessHandle of (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].keys()) {
      accessHandle.close();
    }
    (0, _classPrivateFieldLooseBase.default)(this, _mapAccessHandleToName)[_mapAccessHandleToName].clear();
    (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].clear();
    (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].clear();
  }
  function _getAssociatedPath2(accessHandle) {
    // Read the path and digest of the path from the file.
    const corpus = new Uint8Array(HEADER_CORPUS_SIZE);
    accessHandle.read(corpus, {
      at: 0
    });

    // Delete files not expected to be present.
    const dataView = new DataView(corpus.buffer, corpus.byteOffset);
    const flags = dataView.getUint32(HEADER_OFFSET_FLAGS);
    if (corpus[0] && (flags & VFS.SQLITE_OPEN_DELETEONCLOSE || (flags & PERSISTENT_FILE_TYPES) === 0)) {
      console.warn(`Remove file with unexpected flags ${flags.toString(16)}`);
      (0, _classPrivateFieldLooseBase.default)(this, _setAssociatedPath)[_setAssociatedPath](accessHandle, '', 0);
      return '';
    }
    const fileDigest = new Uint32Array(HEADER_DIGEST_SIZE / 4);
    accessHandle.read(fileDigest, {
      at: HEADER_OFFSET_DIGEST
    });

    // Verify the digest.
    const computedDigest = (0, _classPrivateFieldLooseBase.default)(this, _computeDigest)[_computeDigest](corpus);
    if (fileDigest.every((value, i) => value === computedDigest[i])) {
      // Good digest. Decode the null-terminated path string.
      const pathBytes = corpus.findIndex(value => value === 0);
      if (pathBytes === 0) {
        // Ensure that unassociated files are empty. Unassociated files are
        // truncated in #setAssociatedPath after the header is written. If
        // an interruption occurs right before the truncation then garbage
        // may remain in the file.
        accessHandle.truncate(HEADER_OFFSET_DATA);
      }
      return new TextDecoder().decode(corpus.subarray(0, pathBytes));
    } else {
      // Bad digest. Repair this header.
      console.warn('Disassociating file with bad digest.');
      (0, _classPrivateFieldLooseBase.default)(this, _setAssociatedPath)[_setAssociatedPath](accessHandle, '', 0);
      return '';
    }
  }
  function _setAssociatedPath2(accessHandle, path, flags) {
    // Convert the path string to UTF-8.
    const corpus = new Uint8Array(HEADER_CORPUS_SIZE);
    const encodedResult = new TextEncoder().encodeInto(path, corpus);
    if (encodedResult.written >= HEADER_MAX_PATH_SIZE) {
      throw new Error('path too long');
    }

    // Add the creation flags.
    const dataView = new DataView(corpus.buffer, corpus.byteOffset);
    dataView.setUint32(HEADER_OFFSET_FLAGS, flags);

    // Write the OPFS file header, including the digest.
    const digest = (0, _classPrivateFieldLooseBase.default)(this, _computeDigest)[_computeDigest](corpus);
    accessHandle.write(corpus, {
      at: 0
    });
    accessHandle.write(digest, {
      at: HEADER_OFFSET_DIGEST
    });
    accessHandle.flush();
    if (path) {
      (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].set(path, accessHandle);
      (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].delete(accessHandle);
    } else {
      // This OPFS file doesn't represent any SQLite file so it doesn't
      // need to keep any data.
      accessHandle.truncate(HEADER_OFFSET_DATA);
      (0, _classPrivateFieldLooseBase.default)(this, _availableAccessHandles)[_availableAccessHandles].add(accessHandle);
    }
  }
  function _computeDigest2(corpus) {
    if (!corpus[0]) {
      // Optimization for deleted file.
      return new Uint32Array([0xfecc5f80, 0xaccec037]);
    }
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (const value of corpus) {
      h1 = Math.imul(h1 ^ value, 2654435761);
      h2 = Math.imul(h2 ^ value, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return new Uint32Array([h1 >>> 0, h2 >>> 0]);
  }
  function _getPath2(nameOrURL) {
    const url = typeof nameOrURL === 'string' ? new URL(nameOrURL, 'file://localhost/') : nameOrURL;
    return url.pathname;
  }
  function _deletePath2(path) {
    const accessHandle = (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].get(path);
    if (accessHandle) {
      // Un-associate the SQLite path from the OPFS file.
      (0, _classPrivateFieldLooseBase.default)(this, _mapPathToAccessHandle)[_mapPathToAccessHandle].delete(path);
      (0, _classPrivateFieldLooseBase.default)(this, _setAssociatedPath)[_setAssociatedPath](accessHandle, '', 0);
    }
  }
},2879,[2880,2881,2882,2883],"node_modules/expo-sqlite/web/wa-sqlite/AccessHandlePoolVFS.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  function _classPrivateFieldBase(e, t) {
    if (!{}.hasOwnProperty.call(e, t)) throw new TypeError("attempted to use private field on non-instance");
    return e;
  }
  module.exports = _classPrivateFieldBase, module.exports.__esModule = true, module.exports["default"] = module.exports;
},2880,[],"node_modules/@babel/runtime/helpers/classPrivateFieldLooseBase.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var id = 0;
  function _classPrivateFieldKey(e) {
    return "__private_" + id++ + "_" + e;
  }
  module.exports = _classPrivateFieldKey, module.exports.__esModule = true, module.exports["default"] = module.exports;
},2881,[],"node_modules/@babel/runtime/helpers/classPrivateFieldLooseKey.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "FacadeVFS", {
    enumerable: true,
    get: function () {
      return FacadeVFS;
    }
  });
  var _babelRuntimeHelpersClassPrivateFieldLooseBase = require(_dependencyMap[0], "@babel/runtime/helpers/classPrivateFieldLooseBase");
  var _classPrivateFieldLooseBase = _interopDefault(_babelRuntimeHelpersClassPrivateFieldLooseBase);
  var _babelRuntimeHelpersClassPrivateFieldLooseKey = require(_dependencyMap[1], "@babel/runtime/helpers/classPrivateFieldLooseKey");
  var _classPrivateFieldLooseKey = _interopDefault(_babelRuntimeHelpersClassPrivateFieldLooseKey);
  var _VFSJs = require(_dependencyMap[2], "./VFS.js");
  var VFS = _interopNamespace(_VFSJs);
  // Copyright 2024 Roy T. Hashimoto. All Rights Reserved.

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  // Convenience base class for a JavaScript VFS.
  // The raw xOpen, xRead, etc. function signatures receive only C primitives
  // which aren't easy to work with. This class provides corresponding calls
  // like jOpen, jRead, etc., which receive JavaScript-friendlier arguments
  // such as string, Uint8Array, and DataView.
  var _makeTypedDataView = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("makeTypedDataView");
  var _makeDataArray = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("makeDataArray");
  var _decodeFilename = /*#__PURE__*/(0, _classPrivateFieldLooseKey.default)("decodeFilename");
  class FacadeVFS extends VFS.Base {
    /**
     * @param {string} name 
     * @param {object} module 
     */
    constructor(name, module) {
      super(name, module);
      Object.defineProperty(this, _decodeFilename, {
        value: _decodeFilename2
      });
      /**
       * @param {number} byteOffset 
       * @param {number} byteLength 
       */
      Object.defineProperty(this, _makeDataArray, {
        value: _makeDataArray2
      });
      /**
       * Wrapped DataView for pointer arguments.
       * Pointers to a single value are passed using DataView. A Proxy
       * wrapper prevents use of incorrect type or endianness.
       * @param {'Int32'|'BigInt64'} type 
       * @param {number} byteOffset 
       * @returns {DataView}
       */
      Object.defineProperty(this, _makeTypedDataView, {
        value: _makeTypedDataView2
      });
    }

    /**
     * Override to indicate which methods are asynchronous.
     * @param {string} methodName 
     * @returns {boolean}
     */
    hasAsyncMethod(methodName) {
      // The input argument is a string like "xOpen", so convert to "jOpen".
      // Then check if the method exists and is async.
      const jMethodName = `j${methodName.slice(1)}`;
      return this[jMethodName] instanceof AsyncFunction;
    }

    /**
     * Return the filename for a file id for use by mixins.
     * @param {number} pFile 
     * @returns {string}
     */
    getFilename(pFile) {
      throw new Error('unimplemented');
    }

    /**
     * @param {string?} filename 
     * @param {number} pFile 
     * @param {number} flags 
     * @param {DataView} pOutFlags 
     * @returns {number|Promise<number>}
     */
    jOpen(filename, pFile, flags, pOutFlags) {
      return VFS.SQLITE_CANTOPEN;
    }

    /**
     * @param {string} filename 
     * @param {number} syncDir 
     * @returns {number|Promise<number>}
     */
    jDelete(filename, syncDir) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {string} filename 
     * @param {number} flags 
     * @param {DataView} pResOut 
     * @returns {number|Promise<number>}
     */
    jAccess(filename, flags, pResOut) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {string} filename 
     * @param {Uint8Array} zOut 
     * @returns {number|Promise<number>}
     */
    jFullPathname(filename, zOut) {
      // Copy the filename to the output buffer.
      const {
        read,
        written
      } = new TextEncoder().encodeInto(filename, zOut);
      if (read < filename.length) return VFS.SQLITE_IOERR;
      if (written >= zOut.length) return VFS.SQLITE_IOERR;
      zOut[written] = 0;
      return VFS.SQLITE_OK;
    }

    /**
     * @param {Uint8Array} zBuf 
     * @returns {number|Promise<number>}
     */
    jGetLastError(zBuf) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    jClose(pFile) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {Uint8Array} pData 
     * @param {number} iOffset 
     * @returns {number|Promise<number>}
     */
    jRead(pFile, pData, iOffset) {
      pData.fill(0);
      return VFS.SQLITE_IOERR_SHORT_READ;
    }

    /**
     * @param {number} pFile 
     * @param {Uint8Array} pData 
     * @param {number} iOffset 
     * @returns {number|Promise<number>}
     */
    jWrite(pFile, pData, iOffset) {
      return VFS.SQLITE_IOERR_WRITE;
    }

    /**
     * @param {number} pFile 
     * @param {number} size 
     * @returns {number|Promise<number>}
     */
    jTruncate(pFile, size) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} flags 
     * @returns {number|Promise<number>}
     */
    jSync(pFile, flags) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {DataView} pSize
     * @returns {number|Promise<number>}
     */
    jFileSize(pFile, pSize) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    jLock(pFile, lockType) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    jUnlock(pFile, lockType) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {DataView} pResOut 
     * @returns {number|Promise<number>}
     */
    jCheckReservedLock(pFile, pResOut) {
      pResOut.setInt32(0, 0, true);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile
     * @param {number} op
     * @param {DataView} pArg
     * @returns {number|Promise<number>}
     */
    jFileControl(pFile, op, pArg) {
      return VFS.SQLITE_NOTFOUND;
    }

    /**
     * @param {number} pFile
     * @returns {number|Promise<number>}
     */
    jSectorSize(pFile) {
      return super.xSectorSize(pFile);
    }

    /**
     * @param {number} pFile
     * @returns {number|Promise<number>}
     */
    jDeviceCharacteristics(pFile) {
      return 0;
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} pFile 
     * @param {number} flags 
     * @param {number} pOutFlags 
     * @returns {number|Promise<number>}
     */
    xOpen(pVfs, zName, pFile, flags, pOutFlags) {
      const filename = (0, _classPrivateFieldLooseBase.default)(this, _decodeFilename)[_decodeFilename](zName, flags);
      const pOutFlagsView = (0, _classPrivateFieldLooseBase.default)(this, _makeTypedDataView)[_makeTypedDataView]('Int32', pOutFlags);
      this['log']?.('jOpen', filename, pFile, '0x' + flags.toString(16));
      return this.jOpen(filename, pFile, flags, pOutFlagsView);
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} syncDir 
     * @returns {number|Promise<number>}
     */
    xDelete(pVfs, zName, syncDir) {
      const filename = this._module.UTF8ToString(zName);
      this['log']?.('jDelete', filename, syncDir);
      return this.jDelete(filename, syncDir);
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} flags 
     * @param {number} pResOut 
     * @returns {number|Promise<number>}
     */
    xAccess(pVfs, zName, flags, pResOut) {
      const filename = this._module.UTF8ToString(zName);
      const pResOutView = (0, _classPrivateFieldLooseBase.default)(this, _makeTypedDataView)[_makeTypedDataView]('Int32', pResOut);
      this['log']?.('jAccess', filename, flags);
      return this.jAccess(filename, flags, pResOutView);
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} nOut 
     * @param {number} zOut 
     * @returns {number|Promise<number>}
     */
    xFullPathname(pVfs, zName, nOut, zOut) {
      const filename = this._module.UTF8ToString(zName);
      const zOutArray = this._module.HEAPU8.subarray(zOut, zOut + nOut);
      this['log']?.('jFullPathname', filename, nOut);
      return this.jFullPathname(filename, zOutArray);
    }

    /**
     * @param {number} pVfs 
     * @param {number} nBuf 
     * @param {number} zBuf 
     * @returns {number|Promise<number>}
     */
    xGetLastError(pVfs, nBuf, zBuf) {
      const zBufArray = this._module.HEAPU8.subarray(zBuf, zBuf + nBuf);
      this['log']?.('jGetLastError', nBuf);
      return this.jGetLastError(zBufArray);
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xClose(pFile) {
      this['log']?.('jClose', pFile);
      return this.jClose(pFile);
    }

    /**
     * @param {number} pFile 
     * @param {number} pData 
     * @param {number} iAmt 
     * @param {number} iOffsetLo 
     * @param {number} iOffsetHi 
     * @returns {number|Promise<number>}
     */
    xRead(pFile, pData, iAmt, iOffsetLo, iOffsetHi) {
      const pDataArray = (0, _classPrivateFieldLooseBase.default)(this, _makeDataArray)[_makeDataArray](pData, iAmt);
      const iOffset = delegalize(iOffsetLo, iOffsetHi);
      this['log']?.('jRead', pFile, iAmt, iOffset);
      return this.jRead(pFile, pDataArray, iOffset);
    }

    /**
     * @param {number} pFile 
     * @param {number} pData 
     * @param {number} iAmt 
     * @param {number} iOffsetLo 
     * @param {number} iOffsetHi 
     * @returns {number|Promise<number>}
     */
    xWrite(pFile, pData, iAmt, iOffsetLo, iOffsetHi) {
      const pDataArray = (0, _classPrivateFieldLooseBase.default)(this, _makeDataArray)[_makeDataArray](pData, iAmt);
      const iOffset = delegalize(iOffsetLo, iOffsetHi);
      this['log']?.('jWrite', pFile, pDataArray, iOffset);
      return this.jWrite(pFile, pDataArray, iOffset);
    }

    /**
     * @param {number} pFile 
     * @param {number} sizeLo 
     * @param {number} sizeHi 
     * @returns {number|Promise<number>}
     */
    xTruncate(pFile, sizeLo, sizeHi) {
      const size = delegalize(sizeLo, sizeHi);
      this['log']?.('jTruncate', pFile, size);
      return this.jTruncate(pFile, size);
    }

    /**
     * @param {number} pFile 
     * @param {number} flags 
     * @returns {number|Promise<number>}
     */
    xSync(pFile, flags) {
      this['log']?.('jSync', pFile, flags);
      return this.jSync(pFile, flags);
    }

    /**
     * 
     * @param {number} pFile 
     * @param {number} pSize 
     * @returns {number|Promise<number>}
     */
    xFileSize(pFile, pSize) {
      const pSizeView = (0, _classPrivateFieldLooseBase.default)(this, _makeTypedDataView)[_makeTypedDataView]('BigInt64', pSize);
      this['log']?.('jFileSize', pFile);
      return this.jFileSize(pFile, pSizeView);
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    xLock(pFile, lockType) {
      this['log']?.('jLock', pFile, lockType);
      return this.jLock(pFile, lockType);
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    xUnlock(pFile, lockType) {
      this['log']?.('jUnlock', pFile, lockType);
      return this.jUnlock(pFile, lockType);
    }

    /**
     * @param {number} pFile 
     * @param {number} pResOut 
     * @returns {number|Promise<number>}
     */
    xCheckReservedLock(pFile, pResOut) {
      const pResOutView = (0, _classPrivateFieldLooseBase.default)(this, _makeTypedDataView)[_makeTypedDataView]('Int32', pResOut);
      this['log']?.('jCheckReservedLock', pFile);
      return this.jCheckReservedLock(pFile, pResOutView);
    }

    /**
     * @param {number} pFile 
     * @param {number} op 
     * @param {number} pArg 
     * @returns {number|Promise<number>}
     */
    xFileControl(pFile, op, pArg) {
      const pArgView = new DataView(this._module.HEAPU8.buffer, this._module.HEAPU8.byteOffset + pArg);
      this['log']?.('jFileControl', pFile, op, pArgView);
      return this.jFileControl(pFile, op, pArgView);
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xSectorSize(pFile) {
      this['log']?.('jSectorSize', pFile);
      return this.jSectorSize(pFile);
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xDeviceCharacteristics(pFile) {
      this['log']?.('jDeviceCharacteristics', pFile);
      return this.jDeviceCharacteristics(pFile);
    }
  }

  // Emscripten "legalizes" 64-bit integer arguments by passing them as
  // two 32-bit signed integers.
  function _makeTypedDataView2(type, byteOffset) {
    const byteLength = type === 'Int32' ? 4 : 8;
    const getter = `get${type}`;
    const setter = `set${type}`;
    const makeDataView = () => new DataView(this._module.HEAPU8.buffer, this._module.HEAPU8.byteOffset + byteOffset, byteLength);
    let dataView = makeDataView();
    return new Proxy(dataView, {
      get(_, prop) {
        if (dataView.buffer.byteLength === 0) {
          // WebAssembly memory resize detached the buffer.
          dataView = makeDataView();
        }
        if (prop === getter) {
          return function (byteOffset, littleEndian) {
            if (!littleEndian) throw new Error('must be little endian');
            return dataView[prop](byteOffset, littleEndian);
          };
        }
        if (prop === setter) {
          return function (byteOffset, value, littleEndian) {
            if (!littleEndian) throw new Error('must be little endian');
            return dataView[prop](byteOffset, value, littleEndian);
          };
        }
        if (typeof prop === 'string' && prop.match(/^(get)|(set)/)) {
          throw new Error('invalid type');
        }
        const result = dataView[prop];
        return typeof result === 'function' ? result.bind(dataView) : result;
      }
    });
  }
  function _makeDataArray2(byteOffset, byteLength) {
    let target = this._module.HEAPU8.subarray(byteOffset, byteOffset + byteLength);
    return new Proxy(target, {
      get: (_, prop, receiver) => {
        if (target.buffer.byteLength === 0) {
          // WebAssembly memory resize detached the buffer.
          target = this._module.HEAPU8.subarray(byteOffset, byteOffset + byteLength);
        }
        const result = target[prop];
        return typeof result === 'function' ? result.bind(target) : result;
      }
    });
  }
  function _decodeFilename2(zName, flags) {
    if (flags & VFS.SQLITE_OPEN_URI) {
      // The first null-terminated string is the URI path. Subsequent
      // strings are query parameter keys and values.
      // https://www.sqlite.org/c3ref/open.html#urifilenamesinsqlite3open
      let pName = zName;
      let state = 1;
      const charCodes = [];
      while (state) {
        const charCode = this._module.HEAPU8[pName++];
        if (charCode) {
          charCodes.push(charCode);
        } else {
          if (!this._module.HEAPU8[pName]) state = null;
          switch (state) {
            case 1:
              // path
              charCodes.push('?'.charCodeAt(0));
              state = 2;
              break;
            case 2:
              // key
              charCodes.push('='.charCodeAt(0));
              state = 3;
              break;
            case 3:
              // value
              charCodes.push('&'.charCodeAt(0));
              state = 2;
              break;
          }
        }
      }
      return new TextDecoder().decode(new Uint8Array(charCodes));
    }
    return zName ? this._module.UTF8ToString(zName) : null;
  }
  function delegalize(lo32, hi32) {
    return hi32 * 0x100000000 + lo32 + (lo32 < 0 ? 2 ** 32 : 0);
  }
},2882,[2880,2881,2883],"node_modules/expo-sqlite/web/wa-sqlite/FacadeVFS.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "Base", {
    enumerable: true,
    get: function () {
      return Base;
    }
  });
  Object.defineProperty(exports, "FILE_TYPE_MASK", {
    enumerable: true,
    get: function () {
      return FILE_TYPE_MASK;
    }
  });
  var _sqliteConstantsJs = require(_dependencyMap[0], "./sqlite-constants.js");
  Object.keys(_sqliteConstantsJs).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _sqliteConstantsJs[k];
        }
      });
    }
  });
  var VFS = _interopNamespace(_sqliteConstantsJs);
  // Copyright 2024 Roy T. Hashimoto. All Rights Reserved.

  const DEFAULT_SECTOR_SIZE = 512;

  // Base class for a VFS.
  class Base {
    mxPathname = 64;
    /**
     * @param {string} name 
     * @param {object} module 
     */
    constructor(name, module) {
      this.name = name;
      this._module = module;
    }

    /**
     * @returns {void|Promise<void>} 
     */
    close() {}

    /**
     * @returns {boolean|Promise<boolean>}
     */
    isReady() {
      return true;
    }

    /**
     * Overload in subclasses to indicate which methods are asynchronous.
     * @param {string} methodName 
     * @returns {boolean}
     */
    hasAsyncMethod(methodName) {
      return false;
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} pFile 
     * @param {number} flags 
     * @param {number} pOutFlags 
     * @returns {number|Promise<number>}
     */
    xOpen(pVfs, zName, pFile, flags, pOutFlags) {
      return VFS.SQLITE_CANTOPEN;
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} syncDir 
     * @returns {number|Promise<number>}
     */
    xDelete(pVfs, zName, syncDir) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} flags 
     * @param {number} pResOut 
     * @returns {number|Promise<number>}
     */
    xAccess(pVfs, zName, flags, pResOut) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pVfs 
     * @param {number} zName 
     * @param {number} nOut 
     * @param {number} zOut 
     * @returns {number|Promise<number>}
     */
    xFullPathname(pVfs, zName, nOut, zOut) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pVfs 
     * @param {number} nBuf 
     * @param {number} zBuf 
     * @returns {number|Promise<number>}
     */
    xGetLastError(pVfs, nBuf, zBuf) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xClose(pFile) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} pData 
     * @param {number} iAmt 
     * @param {number} iOffsetLo 
     * @param {number} iOffsetHi 
     * @returns {number|Promise<number>}
     */
    xRead(pFile, pData, iAmt, iOffsetLo, iOffsetHi) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} pData 
     * @param {number} iAmt 
     * @param {number} iOffsetLo 
     * @param {number} iOffsetHi 
     * @returns {number|Promise<number>}
     */
    xWrite(pFile, pData, iAmt, iOffsetLo, iOffsetHi) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} sizeLo 
     * @param {number} sizeHi 
     * @returns {number|Promise<number>}
     */
    xTruncate(pFile, sizeLo, sizeHi) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} flags 
     * @returns {number|Promise<number>}
     */
    xSync(pFile, flags) {
      return VFS.SQLITE_OK;
    }

    /**
     * 
     * @param {number} pFile 
     * @param {number} pSize 
     * @returns {number|Promise<number>}
     */
    xFileSize(pFile, pSize) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    xLock(pFile, lockType) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} lockType 
     * @returns {number|Promise<number>}
     */
    xUnlock(pFile, lockType) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} pResOut 
     * @returns {number|Promise<number>}
     */
    xCheckReservedLock(pFile, pResOut) {
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} pFile 
     * @param {number} op 
     * @param {number} pArg 
     * @returns {number|Promise<number>}
     */
    xFileControl(pFile, op, pArg) {
      return VFS.SQLITE_NOTFOUND;
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xSectorSize(pFile) {
      return DEFAULT_SECTOR_SIZE;
    }

    /**
     * @param {number} pFile 
     * @returns {number|Promise<number>}
     */
    xDeviceCharacteristics(pFile) {
      return 0;
    }
  }
  const FILE_TYPE_MASK = [VFS.SQLITE_OPEN_MAIN_DB, VFS.SQLITE_OPEN_MAIN_JOURNAL, VFS.SQLITE_OPEN_TEMP_DB, VFS.SQLITE_OPEN_TEMP_JOURNAL, VFS.SQLITE_OPEN_TRANSIENT_DB, VFS.SQLITE_OPEN_SUBJOURNAL, VFS.SQLITE_OPEN_SUPER_JOURNAL, VFS.SQLITE_OPEN_WAL].reduce((mask, element) => mask | element);
},2883,[2884],"node_modules/expo-sqlite/web/wa-sqlite/VFS.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "SQLITE_OK", {
    enumerable: true,
    get: function () {
      return SQLITE_OK;
    }
  });
  Object.defineProperty(exports, "SQLITE_ERROR", {
    enumerable: true,
    get: function () {
      return SQLITE_ERROR;
    }
  });
  Object.defineProperty(exports, "SQLITE_INTERNAL", {
    enumerable: true,
    get: function () {
      return SQLITE_INTERNAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_PERM", {
    enumerable: true,
    get: function () {
      return SQLITE_PERM;
    }
  });
  Object.defineProperty(exports, "SQLITE_ABORT", {
    enumerable: true,
    get: function () {
      return SQLITE_ABORT;
    }
  });
  Object.defineProperty(exports, "SQLITE_BUSY", {
    enumerable: true,
    get: function () {
      return SQLITE_BUSY;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCKED", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCKED;
    }
  });
  Object.defineProperty(exports, "SQLITE_NOMEM", {
    enumerable: true,
    get: function () {
      return SQLITE_NOMEM;
    }
  });
  Object.defineProperty(exports, "SQLITE_READONLY", {
    enumerable: true,
    get: function () {
      return SQLITE_READONLY;
    }
  });
  Object.defineProperty(exports, "SQLITE_INTERRUPT", {
    enumerable: true,
    get: function () {
      return SQLITE_INTERRUPT;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR;
    }
  });
  Object.defineProperty(exports, "SQLITE_CORRUPT", {
    enumerable: true,
    get: function () {
      return SQLITE_CORRUPT;
    }
  });
  Object.defineProperty(exports, "SQLITE_NOTFOUND", {
    enumerable: true,
    get: function () {
      return SQLITE_NOTFOUND;
    }
  });
  Object.defineProperty(exports, "SQLITE_FULL", {
    enumerable: true,
    get: function () {
      return SQLITE_FULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_CANTOPEN", {
    enumerable: true,
    get: function () {
      return SQLITE_CANTOPEN;
    }
  });
  Object.defineProperty(exports, "SQLITE_PROTOCOL", {
    enumerable: true,
    get: function () {
      return SQLITE_PROTOCOL;
    }
  });
  Object.defineProperty(exports, "SQLITE_EMPTY", {
    enumerable: true,
    get: function () {
      return SQLITE_EMPTY;
    }
  });
  Object.defineProperty(exports, "SQLITE_SCHEMA", {
    enumerable: true,
    get: function () {
      return SQLITE_SCHEMA;
    }
  });
  Object.defineProperty(exports, "SQLITE_TOOBIG", {
    enumerable: true,
    get: function () {
      return SQLITE_TOOBIG;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT;
    }
  });
  Object.defineProperty(exports, "SQLITE_MISMATCH", {
    enumerable: true,
    get: function () {
      return SQLITE_MISMATCH;
    }
  });
  Object.defineProperty(exports, "SQLITE_MISUSE", {
    enumerable: true,
    get: function () {
      return SQLITE_MISUSE;
    }
  });
  Object.defineProperty(exports, "SQLITE_NOLFS", {
    enumerable: true,
    get: function () {
      return SQLITE_NOLFS;
    }
  });
  Object.defineProperty(exports, "SQLITE_AUTH", {
    enumerable: true,
    get: function () {
      return SQLITE_AUTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_FORMAT", {
    enumerable: true,
    get: function () {
      return SQLITE_FORMAT;
    }
  });
  Object.defineProperty(exports, "SQLITE_RANGE", {
    enumerable: true,
    get: function () {
      return SQLITE_RANGE;
    }
  });
  Object.defineProperty(exports, "SQLITE_NOTADB", {
    enumerable: true,
    get: function () {
      return SQLITE_NOTADB;
    }
  });
  Object.defineProperty(exports, "SQLITE_NOTICE", {
    enumerable: true,
    get: function () {
      return SQLITE_NOTICE;
    }
  });
  Object.defineProperty(exports, "SQLITE_WARNING", {
    enumerable: true,
    get: function () {
      return SQLITE_WARNING;
    }
  });
  Object.defineProperty(exports, "SQLITE_ROW", {
    enumerable: true,
    get: function () {
      return SQLITE_ROW;
    }
  });
  Object.defineProperty(exports, "SQLITE_DONE", {
    enumerable: true,
    get: function () {
      return SQLITE_DONE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_ACCESS", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_ACCESS;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_CHECKRESERVEDLOCK", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_CHECKRESERVEDLOCK;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_CLOSE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_CLOSE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_DATA", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_DATA;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_DELETE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_DELETE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_DELETE_NOENT", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_DELETE_NOENT;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_DIR_FSYNC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_DIR_FSYNC;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_FSTAT", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_FSTAT;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_FSYNC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_FSYNC;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_GETTEMPPATH", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_GETTEMPPATH;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_LOCK", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_LOCK;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_NOMEM", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_NOMEM;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_READ", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_READ;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_RDLOCK", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_RDLOCK;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_SEEK", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_SEEK;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_SHORT_READ", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_SHORT_READ;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_TRUNCATE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_TRUNCATE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_UNLOCK", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_UNLOCK;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_VNODE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_VNODE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_WRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_WRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_BEGIN_ATOMIC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_BEGIN_ATOMIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_COMMIT_ATOMIC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_COMMIT_ATOMIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOERR_ROLLBACK_ATOMIC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOERR_ROLLBACK_ATOMIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_CHECK", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_CHECK;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_COMMITHOOK", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_COMMITHOOK;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_FOREIGNKEY", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_FOREIGNKEY;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_FUNCTION", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_FUNCTION;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_NOTNULL", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_NOTNULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_PINNED", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_PINNED;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_PRIMARYKEY", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_PRIMARYKEY;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_ROWID", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_ROWID;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_TRIGGER", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_TRIGGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_UNIQUE", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_UNIQUE;
    }
  });
  Object.defineProperty(exports, "SQLITE_CONSTRAINT_VTAB", {
    enumerable: true,
    get: function () {
      return SQLITE_CONSTRAINT_VTAB;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_READONLY", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_READONLY;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_READWRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_READWRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_CREATE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_CREATE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_DELETEONCLOSE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_DELETEONCLOSE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_EXCLUSIVE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_EXCLUSIVE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_AUTOPROXY", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_AUTOPROXY;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_URI", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_URI;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_MEMORY", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_MEMORY;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_MAIN_DB", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_MAIN_DB;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_TEMP_DB", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_TEMP_DB;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_TRANSIENT_DB", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_TRANSIENT_DB;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_MAIN_JOURNAL", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_MAIN_JOURNAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_TEMP_JOURNAL", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_TEMP_JOURNAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_SUBJOURNAL", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_SUBJOURNAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_SUPER_JOURNAL", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_SUPER_JOURNAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_NOMUTEX", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_NOMUTEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_FULLMUTEX", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_FULLMUTEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_SHAREDCACHE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_SHAREDCACHE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_PRIVATECACHE", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_PRIVATECACHE;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_WAL", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_WAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_OPEN_NOFOLLOW", {
    enumerable: true,
    get: function () {
      return SQLITE_OPEN_NOFOLLOW;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCK_NONE", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCK_NONE;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCK_SHARED", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCK_SHARED;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCK_RESERVED", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCK_RESERVED;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCK_PENDING", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCK_PENDING;
    }
  });
  Object.defineProperty(exports, "SQLITE_LOCK_EXCLUSIVE", {
    enumerable: true,
    get: function () {
      return SQLITE_LOCK_EXCLUSIVE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC512", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC512;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC1K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC1K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC2K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC2K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC4K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC4K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC8K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC8K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC16K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC16K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC32K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC32K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_ATOMIC64K", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_ATOMIC64K;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_SAFE_APPEND", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_SAFE_APPEND;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_SEQUENTIAL", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_SEQUENTIAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_POWERSAFE_OVERWRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_POWERSAFE_OVERWRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_IMMUTABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_IMMUTABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_IOCAP_BATCH_ATOMIC", {
    enumerable: true,
    get: function () {
      return SQLITE_IOCAP_BATCH_ATOMIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_ACCESS_EXISTS", {
    enumerable: true,
    get: function () {
      return SQLITE_ACCESS_EXISTS;
    }
  });
  Object.defineProperty(exports, "SQLITE_ACCESS_READWRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_ACCESS_READWRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_ACCESS_READ", {
    enumerable: true,
    get: function () {
      return SQLITE_ACCESS_READ;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_LOCKSTATE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_LOCKSTATE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_GET_LOCKPROXYFILE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_GET_LOCKPROXYFILE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_SET_LOCKPROXYFILE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_SET_LOCKPROXYFILE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_LAST_ERRNO", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_LAST_ERRNO;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_SIZE_HINT", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_SIZE_HINT;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_CHUNK_SIZE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_CHUNK_SIZE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_FILE_POINTER", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_FILE_POINTER;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_SYNC_OMITTED", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_SYNC_OMITTED;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_WIN32_AV_RETRY", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_WIN32_AV_RETRY;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_PERSIST_WAL", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_PERSIST_WAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_OVERWRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_OVERWRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_VFSNAME", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_VFSNAME;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_POWERSAFE_OVERWRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_POWERSAFE_OVERWRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_PRAGMA", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_PRAGMA;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_BUSYHANDLER", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_BUSYHANDLER;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_TEMPFILENAME", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_TEMPFILENAME;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_MMAP_SIZE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_MMAP_SIZE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_TRACE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_TRACE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_HAS_MOVED", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_HAS_MOVED;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_SYNC", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_SYNC;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_COMMIT_PHASETWO", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_COMMIT_PHASETWO;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_WIN32_SET_HANDLE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_WIN32_SET_HANDLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_WAL_BLOCK", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_WAL_BLOCK;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_ZIPVFS", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_ZIPVFS;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_RBU", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_RBU;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_VFS_POINTER", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_VFS_POINTER;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_JOURNAL_POINTER", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_JOURNAL_POINTER;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_WIN32_GET_HANDLE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_WIN32_GET_HANDLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_PDB", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_PDB;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_BEGIN_ATOMIC_WRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_BEGIN_ATOMIC_WRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_COMMIT_ATOMIC_WRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_COMMIT_ATOMIC_WRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_LOCK_TIMEOUT", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_LOCK_TIMEOUT;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_DATA_VERSION", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_DATA_VERSION;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_SIZE_LIMIT", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_SIZE_LIMIT;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_CKPT_DONE", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_CKPT_DONE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_RESERVE_BYTES", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_RESERVE_BYTES;
    }
  });
  Object.defineProperty(exports, "SQLITE_FCNTL_CKPT_START", {
    enumerable: true,
    get: function () {
      return SQLITE_FCNTL_CKPT_START;
    }
  });
  Object.defineProperty(exports, "SQLITE_INTEGER", {
    enumerable: true,
    get: function () {
      return SQLITE_INTEGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_FLOAT", {
    enumerable: true,
    get: function () {
      return SQLITE_FLOAT;
    }
  });
  Object.defineProperty(exports, "SQLITE_TEXT", {
    enumerable: true,
    get: function () {
      return SQLITE_TEXT;
    }
  });
  Object.defineProperty(exports, "SQLITE_BLOB", {
    enumerable: true,
    get: function () {
      return SQLITE_BLOB;
    }
  });
  Object.defineProperty(exports, "SQLITE_NULL", {
    enumerable: true,
    get: function () {
      return SQLITE_NULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_STATIC", {
    enumerable: true,
    get: function () {
      return SQLITE_STATIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_TRANSIENT", {
    enumerable: true,
    get: function () {
      return SQLITE_TRANSIENT;
    }
  });
  Object.defineProperty(exports, "SQLITE_UTF8", {
    enumerable: true,
    get: function () {
      return SQLITE_UTF8;
    }
  });
  Object.defineProperty(exports, "SQLITE_UTF16LE", {
    enumerable: true,
    get: function () {
      return SQLITE_UTF16LE;
    }
  });
  Object.defineProperty(exports, "SQLITE_UTF16BE", {
    enumerable: true,
    get: function () {
      return SQLITE_UTF16BE;
    }
  });
  Object.defineProperty(exports, "SQLITE_UTF16", {
    enumerable: true,
    get: function () {
      return SQLITE_UTF16;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_EQ", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_EQ;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_GT", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_GT;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_LE", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_LE;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_LT", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_LT;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_GE", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_GE;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_MATCH", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_MATCH;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_LIKE", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_LIKE;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_GLOB", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_GLOB;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_REGEXP", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_REGEXP;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_NE", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_NE;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_ISNOT", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_ISNOT;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_ISNOTNULL", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_ISNOTNULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_ISNULL", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_ISNULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_IS", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_IS;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_CONSTRAINT_FUNCTION", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_CONSTRAINT_FUNCTION;
    }
  });
  Object.defineProperty(exports, "SQLITE_INDEX_SCAN_UNIQUE", {
    enumerable: true,
    get: function () {
      return SQLITE_INDEX_SCAN_UNIQUE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DETERMINISTIC", {
    enumerable: true,
    get: function () {
      return SQLITE_DETERMINISTIC;
    }
  });
  Object.defineProperty(exports, "SQLITE_DIRECTONLY", {
    enumerable: true,
    get: function () {
      return SQLITE_DIRECTONLY;
    }
  });
  Object.defineProperty(exports, "SQLITE_SUBTYPE", {
    enumerable: true,
    get: function () {
      return SQLITE_SUBTYPE;
    }
  });
  Object.defineProperty(exports, "SQLITE_INNOCUOUS", {
    enumerable: true,
    get: function () {
      return SQLITE_INNOCUOUS;
    }
  });
  Object.defineProperty(exports, "SQLITE_SYNC_NORMAL", {
    enumerable: true,
    get: function () {
      return SQLITE_SYNC_NORMAL;
    }
  });
  Object.defineProperty(exports, "SQLITE_SYNC_FULL", {
    enumerable: true,
    get: function () {
      return SQLITE_SYNC_FULL;
    }
  });
  Object.defineProperty(exports, "SQLITE_SYNC_DATAONLY", {
    enumerable: true,
    get: function () {
      return SQLITE_SYNC_DATAONLY;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_INDEX", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_INDEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TEMP_INDEX", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TEMP_INDEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TEMP_TABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TEMP_TABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TEMP_TRIGGER", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TEMP_TRIGGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TEMP_VIEW", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TEMP_VIEW;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_TRIGGER", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_TRIGGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_VIEW", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_VIEW;
    }
  });
  Object.defineProperty(exports, "SQLITE_DELETE", {
    enumerable: true,
    get: function () {
      return SQLITE_DELETE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_INDEX", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_INDEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TEMP_INDEX", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TEMP_INDEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TEMP_TABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TEMP_TABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TEMP_TRIGGER", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TEMP_TRIGGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TEMP_VIEW", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TEMP_VIEW;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_TRIGGER", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_TRIGGER;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_VIEW", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_VIEW;
    }
  });
  Object.defineProperty(exports, "SQLITE_INSERT", {
    enumerable: true,
    get: function () {
      return SQLITE_INSERT;
    }
  });
  Object.defineProperty(exports, "SQLITE_PRAGMA", {
    enumerable: true,
    get: function () {
      return SQLITE_PRAGMA;
    }
  });
  Object.defineProperty(exports, "SQLITE_READ", {
    enumerable: true,
    get: function () {
      return SQLITE_READ;
    }
  });
  Object.defineProperty(exports, "SQLITE_SELECT", {
    enumerable: true,
    get: function () {
      return SQLITE_SELECT;
    }
  });
  Object.defineProperty(exports, "SQLITE_TRANSACTION", {
    enumerable: true,
    get: function () {
      return SQLITE_TRANSACTION;
    }
  });
  Object.defineProperty(exports, "SQLITE_UPDATE", {
    enumerable: true,
    get: function () {
      return SQLITE_UPDATE;
    }
  });
  Object.defineProperty(exports, "SQLITE_ATTACH", {
    enumerable: true,
    get: function () {
      return SQLITE_ATTACH;
    }
  });
  Object.defineProperty(exports, "SQLITE_DETACH", {
    enumerable: true,
    get: function () {
      return SQLITE_DETACH;
    }
  });
  Object.defineProperty(exports, "SQLITE_ALTER_TABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_ALTER_TABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_REINDEX", {
    enumerable: true,
    get: function () {
      return SQLITE_REINDEX;
    }
  });
  Object.defineProperty(exports, "SQLITE_ANALYZE", {
    enumerable: true,
    get: function () {
      return SQLITE_ANALYZE;
    }
  });
  Object.defineProperty(exports, "SQLITE_CREATE_VTABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_CREATE_VTABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DROP_VTABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_DROP_VTABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_FUNCTION", {
    enumerable: true,
    get: function () {
      return SQLITE_FUNCTION;
    }
  });
  Object.defineProperty(exports, "SQLITE_SAVEPOINT", {
    enumerable: true,
    get: function () {
      return SQLITE_SAVEPOINT;
    }
  });
  Object.defineProperty(exports, "SQLITE_COPY", {
    enumerable: true,
    get: function () {
      return SQLITE_COPY;
    }
  });
  Object.defineProperty(exports, "SQLITE_RECURSIVE", {
    enumerable: true,
    get: function () {
      return SQLITE_RECURSIVE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DENY", {
    enumerable: true,
    get: function () {
      return SQLITE_DENY;
    }
  });
  Object.defineProperty(exports, "SQLITE_IGNORE", {
    enumerable: true,
    get: function () {
      return SQLITE_IGNORE;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_LENGTH", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_LENGTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_SQL_LENGTH", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_SQL_LENGTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_COLUMN", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_COLUMN;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_EXPR_DEPTH", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_EXPR_DEPTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_COMPOUND_SELECT", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_COMPOUND_SELECT;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_VDBE_OP", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_VDBE_OP;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_FUNCTION_ARG", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_FUNCTION_ARG;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_ATTACHED", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_ATTACHED;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_LIKE_PATTERN_LENGTH", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_LIKE_PATTERN_LENGTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_VARIABLE_NUMBER", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_VARIABLE_NUMBER;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_TRIGGER_DEPTH", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_TRIGGER_DEPTH;
    }
  });
  Object.defineProperty(exports, "SQLITE_LIMIT_WORKER_THREADS", {
    enumerable: true,
    get: function () {
      return SQLITE_LIMIT_WORKER_THREADS;
    }
  });
  Object.defineProperty(exports, "SQLITE_PREPARE_PERSISTENT", {
    enumerable: true,
    get: function () {
      return SQLITE_PREPARE_PERSISTENT;
    }
  });
  Object.defineProperty(exports, "SQLITE_PREPARE_NORMALIZED", {
    enumerable: true,
    get: function () {
      return SQLITE_PREPARE_NORMALIZED;
    }
  });
  Object.defineProperty(exports, "SQLITE_PREPARE_NO_VTAB", {
    enumerable: true,
    get: function () {
      return SQLITE_PREPARE_NO_VTAB;
    }
  });
  Object.defineProperty(exports, "SQLITE_DESERIALIZE_FREEONCLOSE", {
    enumerable: true,
    get: function () {
      return SQLITE_DESERIALIZE_FREEONCLOSE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DESERIALIZE_RESIZEABLE", {
    enumerable: true,
    get: function () {
      return SQLITE_DESERIALIZE_RESIZEABLE;
    }
  });
  Object.defineProperty(exports, "SQLITE_DESERIALIZE_READONLY", {
    enumerable: true,
    get: function () {
      return SQLITE_DESERIALIZE_READONLY;
    }
  });
  Object.defineProperty(exports, "SQLITE_SERIALIZE_NOCOPY", {
    enumerable: true,
    get: function () {
      return SQLITE_SERIALIZE_NOCOPY;
    }
  });
  Object.defineProperty(exports, "SQLITE_CHANGESET_OMIT", {
    enumerable: true,
    get: function () {
      return SQLITE_CHANGESET_OMIT;
    }
  });
  Object.defineProperty(exports, "SQLITE_CHANGESET_REPLACE", {
    enumerable: true,
    get: function () {
      return SQLITE_CHANGESET_REPLACE;
    }
  });
  Object.defineProperty(exports, "SQLITE_CHANGESET_ABORT", {
    enumerable: true,
    get: function () {
      return SQLITE_CHANGESET_ABORT;
    }
  });
  // Primary result codes.
  // https://www.sqlite.org/rescode.html
  const SQLITE_OK = 0;
  const SQLITE_ERROR = 1;
  const SQLITE_INTERNAL = 2;
  const SQLITE_PERM = 3;
  const SQLITE_ABORT = 4;
  const SQLITE_BUSY = 5;
  const SQLITE_LOCKED = 6;
  const SQLITE_NOMEM = 7;
  const SQLITE_READONLY = 8;
  const SQLITE_INTERRUPT = 9;
  const SQLITE_IOERR = 10;
  const SQLITE_CORRUPT = 11;
  const SQLITE_NOTFOUND = 12;
  const SQLITE_FULL = 13;
  const SQLITE_CANTOPEN = 14;
  const SQLITE_PROTOCOL = 15;
  const SQLITE_EMPTY = 16;
  const SQLITE_SCHEMA = 17;
  const SQLITE_TOOBIG = 18;
  const SQLITE_CONSTRAINT = 19;
  const SQLITE_MISMATCH = 20;
  const SQLITE_MISUSE = 21;
  const SQLITE_NOLFS = 22;
  const SQLITE_AUTH = 23;
  const SQLITE_FORMAT = 24;
  const SQLITE_RANGE = 25;
  const SQLITE_NOTADB = 26;
  const SQLITE_NOTICE = 27;
  const SQLITE_WARNING = 28;
  const SQLITE_ROW = 100;
  const SQLITE_DONE = 101;

  // Extended error codes.
  const SQLITE_IOERR_ACCESS = 3338;
  const SQLITE_IOERR_CHECKRESERVEDLOCK = 3594;
  const SQLITE_IOERR_CLOSE = 4106;
  const SQLITE_IOERR_DATA = 8202;
  const SQLITE_IOERR_DELETE = 2570;
  const SQLITE_IOERR_DELETE_NOENT = 5898;
  const SQLITE_IOERR_DIR_FSYNC = 1290;
  const SQLITE_IOERR_FSTAT = 1802;
  const SQLITE_IOERR_FSYNC = 1034;
  const SQLITE_IOERR_GETTEMPPATH = 6410;
  const SQLITE_IOERR_LOCK = 3850;
  const SQLITE_IOERR_NOMEM = 3082;
  const SQLITE_IOERR_READ = 266;
  const SQLITE_IOERR_RDLOCK = 2314;
  const SQLITE_IOERR_SEEK = 5642;
  const SQLITE_IOERR_SHORT_READ = 522;
  const SQLITE_IOERR_TRUNCATE = 1546;
  const SQLITE_IOERR_UNLOCK = 2058;
  const SQLITE_IOERR_VNODE = 6922;
  const SQLITE_IOERR_WRITE = 778;
  const SQLITE_IOERR_BEGIN_ATOMIC = 7434;
  const SQLITE_IOERR_COMMIT_ATOMIC = 7690;
  const SQLITE_IOERR_ROLLBACK_ATOMIC = 7946;

  // Other extended result codes.
  const SQLITE_CONSTRAINT_CHECK = 275;
  const SQLITE_CONSTRAINT_COMMITHOOK = 531;
  const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
  const SQLITE_CONSTRAINT_FUNCTION = 1043;
  const SQLITE_CONSTRAINT_NOTNULL = 1299;
  const SQLITE_CONSTRAINT_PINNED = 2835;
  const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;
  const SQLITE_CONSTRAINT_ROWID = 2579;
  const SQLITE_CONSTRAINT_TRIGGER = 1811;
  const SQLITE_CONSTRAINT_UNIQUE = 2067;
  const SQLITE_CONSTRAINT_VTAB = 2323;

  // Open flags.
  // https://www.sqlite.org/c3ref/c_open_autoproxy.html
  const SQLITE_OPEN_READONLY = 0x00000001;
  const SQLITE_OPEN_READWRITE = 0x00000002;
  const SQLITE_OPEN_CREATE = 0x00000004;
  const SQLITE_OPEN_DELETEONCLOSE = 0x00000008;
  const SQLITE_OPEN_EXCLUSIVE = 0x00000010;
  const SQLITE_OPEN_AUTOPROXY = 0x00000020;
  const SQLITE_OPEN_URI = 0x00000040;
  const SQLITE_OPEN_MEMORY = 0x00000080;
  const SQLITE_OPEN_MAIN_DB = 0x00000100;
  const SQLITE_OPEN_TEMP_DB = 0x00000200;
  const SQLITE_OPEN_TRANSIENT_DB = 0x00000400;
  const SQLITE_OPEN_MAIN_JOURNAL = 0x00000800;
  const SQLITE_OPEN_TEMP_JOURNAL = 0x00001000;
  const SQLITE_OPEN_SUBJOURNAL = 0x00002000;
  const SQLITE_OPEN_SUPER_JOURNAL = 0x00004000;
  const SQLITE_OPEN_NOMUTEX = 0x00008000;
  const SQLITE_OPEN_FULLMUTEX = 0x00010000;
  const SQLITE_OPEN_SHAREDCACHE = 0x00020000;
  const SQLITE_OPEN_PRIVATECACHE = 0x00040000;
  const SQLITE_OPEN_WAL = 0x00080000;
  const SQLITE_OPEN_NOFOLLOW = 0x01000000;

  // Locking levels.
  // https://www.sqlite.org/c3ref/c_lock_exclusive.html
  const SQLITE_LOCK_NONE = 0;
  const SQLITE_LOCK_SHARED = 1;
  const SQLITE_LOCK_RESERVED = 2;
  const SQLITE_LOCK_PENDING = 3;
  const SQLITE_LOCK_EXCLUSIVE = 4;

  // Device characteristics.
  // https://www.sqlite.org/c3ref/c_iocap_atomic.html
  const SQLITE_IOCAP_ATOMIC = 0x00000001;
  const SQLITE_IOCAP_ATOMIC512 = 0x00000002;
  const SQLITE_IOCAP_ATOMIC1K = 0x00000004;
  const SQLITE_IOCAP_ATOMIC2K = 0x00000008;
  const SQLITE_IOCAP_ATOMIC4K = 0x00000010;
  const SQLITE_IOCAP_ATOMIC8K = 0x00000020;
  const SQLITE_IOCAP_ATOMIC16K = 0x00000040;
  const SQLITE_IOCAP_ATOMIC32K = 0x00000080;
  const SQLITE_IOCAP_ATOMIC64K = 0x00000100;
  const SQLITE_IOCAP_SAFE_APPEND = 0x00000200;
  const SQLITE_IOCAP_SEQUENTIAL = 0x00000400;
  const SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN = 0x00000800;
  const SQLITE_IOCAP_POWERSAFE_OVERWRITE = 0x00001000;
  const SQLITE_IOCAP_IMMUTABLE = 0x00002000;
  const SQLITE_IOCAP_BATCH_ATOMIC = 0x00004000;

  // xAccess flags.
  // https://www.sqlite.org/c3ref/c_access_exists.html
  const SQLITE_ACCESS_EXISTS = 0;
  const SQLITE_ACCESS_READWRITE = 1;
  const SQLITE_ACCESS_READ = 2;

  // File control opcodes
  // https://www.sqlite.org/c3ref/c_fcntl_begin_atomic_write.html#sqlitefcntlbeginatomicwrite
  const SQLITE_FCNTL_LOCKSTATE = 1;
  const SQLITE_FCNTL_GET_LOCKPROXYFILE = 2;
  const SQLITE_FCNTL_SET_LOCKPROXYFILE = 3;
  const SQLITE_FCNTL_LAST_ERRNO = 4;
  const SQLITE_FCNTL_SIZE_HINT = 5;
  const SQLITE_FCNTL_CHUNK_SIZE = 6;
  const SQLITE_FCNTL_FILE_POINTER = 7;
  const SQLITE_FCNTL_SYNC_OMITTED = 8;
  const SQLITE_FCNTL_WIN32_AV_RETRY = 9;
  const SQLITE_FCNTL_PERSIST_WAL = 10;
  const SQLITE_FCNTL_OVERWRITE = 11;
  const SQLITE_FCNTL_VFSNAME = 12;
  const SQLITE_FCNTL_POWERSAFE_OVERWRITE = 13;
  const SQLITE_FCNTL_PRAGMA = 14;
  const SQLITE_FCNTL_BUSYHANDLER = 15;
  const SQLITE_FCNTL_TEMPFILENAME = 16;
  const SQLITE_FCNTL_MMAP_SIZE = 18;
  const SQLITE_FCNTL_TRACE = 19;
  const SQLITE_FCNTL_HAS_MOVED = 20;
  const SQLITE_FCNTL_SYNC = 21;
  const SQLITE_FCNTL_COMMIT_PHASETWO = 22;
  const SQLITE_FCNTL_WIN32_SET_HANDLE = 23;
  const SQLITE_FCNTL_WAL_BLOCK = 24;
  const SQLITE_FCNTL_ZIPVFS = 25;
  const SQLITE_FCNTL_RBU = 26;
  const SQLITE_FCNTL_VFS_POINTER = 27;
  const SQLITE_FCNTL_JOURNAL_POINTER = 28;
  const SQLITE_FCNTL_WIN32_GET_HANDLE = 29;
  const SQLITE_FCNTL_PDB = 30;
  const SQLITE_FCNTL_BEGIN_ATOMIC_WRITE = 31;
  const SQLITE_FCNTL_COMMIT_ATOMIC_WRITE = 32;
  const SQLITE_FCNTL_ROLLBACK_ATOMIC_WRITE = 33;
  const SQLITE_FCNTL_LOCK_TIMEOUT = 34;
  const SQLITE_FCNTL_DATA_VERSION = 35;
  const SQLITE_FCNTL_SIZE_LIMIT = 36;
  const SQLITE_FCNTL_CKPT_DONE = 37;
  const SQLITE_FCNTL_RESERVE_BYTES = 38;
  const SQLITE_FCNTL_CKPT_START = 39;

  // Fundamental datatypes.
  // https://www.sqlite.org/c3ref/c_blob.html
  const SQLITE_INTEGER = 1;
  const SQLITE_FLOAT = 2;
  const SQLITE_TEXT = 3;
  const SQLITE_BLOB = 4;
  const SQLITE_NULL = 5;

  // Special destructor behavior.
  // https://www.sqlite.org/c3ref/c_static.html
  const SQLITE_STATIC = 0;
  const SQLITE_TRANSIENT = -1;

  // Text encodings.
  // https://sqlite.org/c3ref/c_any.html
  const SQLITE_UTF8 = 1; /* IMP: R-37514-35566 */
  const SQLITE_UTF16LE = 2; /* IMP: R-03371-37637 */
  const SQLITE_UTF16BE = 3; /* IMP: R-51971-34154 */
  const SQLITE_UTF16 = 4; /* Use native byte order */

  // Module constraint ops.
  const SQLITE_INDEX_CONSTRAINT_EQ = 2;
  const SQLITE_INDEX_CONSTRAINT_GT = 4;
  const SQLITE_INDEX_CONSTRAINT_LE = 8;
  const SQLITE_INDEX_CONSTRAINT_LT = 16;
  const SQLITE_INDEX_CONSTRAINT_GE = 32;
  const SQLITE_INDEX_CONSTRAINT_MATCH = 64;
  const SQLITE_INDEX_CONSTRAINT_LIKE = 65;
  const SQLITE_INDEX_CONSTRAINT_GLOB = 66;
  const SQLITE_INDEX_CONSTRAINT_REGEXP = 67;
  const SQLITE_INDEX_CONSTRAINT_NE = 68;
  const SQLITE_INDEX_CONSTRAINT_ISNOT = 69;
  const SQLITE_INDEX_CONSTRAINT_ISNOTNULL = 70;
  const SQLITE_INDEX_CONSTRAINT_ISNULL = 71;
  const SQLITE_INDEX_CONSTRAINT_IS = 72;
  const SQLITE_INDEX_CONSTRAINT_FUNCTION = 150;
  const SQLITE_INDEX_SCAN_UNIQUE = 1; /* Scan visits at most = 1 row */

  // Function flags
  const SQLITE_DETERMINISTIC = 0x000000800;
  const SQLITE_DIRECTONLY = 0x000080000;
  const SQLITE_SUBTYPE = 0x000100000;
  const SQLITE_INNOCUOUS = 0x000200000;

  // Sync flags
  const SQLITE_SYNC_NORMAL = 0x00002;
  const SQLITE_SYNC_FULL = 0x00003;
  const SQLITE_SYNC_DATAONLY = 0x00010;

  // Authorizer action codes
  const SQLITE_CREATE_INDEX = 1;
  const SQLITE_CREATE_TABLE = 2;
  const SQLITE_CREATE_TEMP_INDEX = 3;
  const SQLITE_CREATE_TEMP_TABLE = 4;
  const SQLITE_CREATE_TEMP_TRIGGER = 5;
  const SQLITE_CREATE_TEMP_VIEW = 6;
  const SQLITE_CREATE_TRIGGER = 7;
  const SQLITE_CREATE_VIEW = 8;
  const SQLITE_DELETE = 9;
  const SQLITE_DROP_INDEX = 10;
  const SQLITE_DROP_TABLE = 11;
  const SQLITE_DROP_TEMP_INDEX = 12;
  const SQLITE_DROP_TEMP_TABLE = 13;
  const SQLITE_DROP_TEMP_TRIGGER = 14;
  const SQLITE_DROP_TEMP_VIEW = 15;
  const SQLITE_DROP_TRIGGER = 16;
  const SQLITE_DROP_VIEW = 17;
  const SQLITE_INSERT = 18;
  const SQLITE_PRAGMA = 19;
  const SQLITE_READ = 20;
  const SQLITE_SELECT = 21;
  const SQLITE_TRANSACTION = 22;
  const SQLITE_UPDATE = 23;
  const SQLITE_ATTACH = 24;
  const SQLITE_DETACH = 25;
  const SQLITE_ALTER_TABLE = 26;
  const SQLITE_REINDEX = 27;
  const SQLITE_ANALYZE = 28;
  const SQLITE_CREATE_VTABLE = 29;
  const SQLITE_DROP_VTABLE = 30;
  const SQLITE_FUNCTION = 31;
  const SQLITE_SAVEPOINT = 32;
  const SQLITE_COPY = 0;
  const SQLITE_RECURSIVE = 33;

  // Authorizer return codes
  const SQLITE_DENY = 1;
  const SQLITE_IGNORE = 2;

  // Limit categories
  const SQLITE_LIMIT_LENGTH = 0;
  const SQLITE_LIMIT_SQL_LENGTH = 1;
  const SQLITE_LIMIT_COLUMN = 2;
  const SQLITE_LIMIT_EXPR_DEPTH = 3;
  const SQLITE_LIMIT_COMPOUND_SELECT = 4;
  const SQLITE_LIMIT_VDBE_OP = 5;
  const SQLITE_LIMIT_FUNCTION_ARG = 6;
  const SQLITE_LIMIT_ATTACHED = 7;
  const SQLITE_LIMIT_LIKE_PATTERN_LENGTH = 8;
  const SQLITE_LIMIT_VARIABLE_NUMBER = 9;
  const SQLITE_LIMIT_TRIGGER_DEPTH = 10;
  const SQLITE_LIMIT_WORKER_THREADS = 11;
  const SQLITE_PREPARE_PERSISTENT = 0x01;
  const SQLITE_PREPARE_NORMALIZED = 0x02;
  const SQLITE_PREPARE_NO_VTAB = 0x04;

  // Serialization flags
  const SQLITE_DESERIALIZE_FREEONCLOSE = 1;
  const SQLITE_DESERIALIZE_RESIZEABLE = 2;
  const SQLITE_DESERIALIZE_READONLY = 4;
  const SQLITE_SERIALIZE_NOCOPY = 0x001;

  // Changeset flags
  const SQLITE_CHANGESET_OMIT = 0;
  const SQLITE_CHANGESET_REPLACE = 1;
  const SQLITE_CHANGESET_ABORT = 2;
},2884,[],"node_modules/expo-sqlite/web/wa-sqlite/sqlite-constants.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "MemoryVFS", {
    enumerable: true,
    get: function () {
      return MemoryVFS;
    }
  });
  var _FacadeVFSJs = require(_dependencyMap[0], "./FacadeVFS.js");
  var _VFSJs = require(_dependencyMap[1], "./VFS.js");
  var VFS = _interopNamespace(_VFSJs);
  // Copyright 2024 Roy T. Hashimoto. All Rights Reserved.

  // Sample in-memory filesystem.
  class MemoryVFS extends _FacadeVFSJs.FacadeVFS {
    // Map of existing files, keyed by filename.
    mapNameToFile = new Map();

    // Map of open files, keyed by id (sqlite3_file pointer).
    mapIdToFile = new Map();
    static async create(name, module) {
      const vfs = new MemoryVFS(name, module);
      await vfs.isReady();
      return vfs;
    }
    constructor(name, module) {
      super(name, module);
    }
    close() {
      for (const fileId of this.mapIdToFile.keys()) {
        this.jClose(fileId);
      }
    }

    /**
     * @param {string?} filename
     * @param {number} fileId
     * @param {number} flags
     * @param {DataView} pOutFlags
     * @returns {number|Promise<number>}
     */
    jOpen(filename, fileId, flags, pOutFlags) {
      const url = new URL(filename || Math.random().toString(36).slice(2), 'file://');
      const pathname = url.pathname;
      let file = this.mapNameToFile.get(pathname);
      if (!file) {
        if (flags & VFS.SQLITE_OPEN_CREATE) {
          // Create a new file object.
          file = {
            pathname,
            flags,
            size: 0,
            data: new ArrayBuffer(0)
          };
          this.mapNameToFile.set(pathname, file);
        } else {
          return VFS.SQLITE_CANTOPEN;
        }
      }

      // Put the file in the opened files map.
      this.mapIdToFile.set(fileId, file);
      pOutFlags.setInt32(0, flags, true);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @returns {number|Promise<number>}
     */
    jClose(fileId) {
      const file = this.mapIdToFile.get(fileId);
      this.mapIdToFile.delete(fileId);
      if (file.flags & VFS.SQLITE_OPEN_DELETEONCLOSE) {
        this.mapNameToFile.delete(file.pathname);
      }
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {Uint8Array} pData
     * @param {number} iOffset
     * @returns {number|Promise<number>}
     */
    jRead(fileId, pData, iOffset) {
      const file = this.mapIdToFile.get(fileId);

      // Clip the requested read to the file boundary.
      const bgn = Math.min(iOffset, file.size);
      const end = Math.min(iOffset + pData.byteLength, file.size);
      const nBytes = end - bgn;
      if (nBytes) {
        pData.set(new Uint8Array(file.data, bgn, nBytes));
      }
      if (nBytes < pData.byteLength) {
        // Zero unused area of read buffer.
        pData.fill(0, nBytes);
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {Uint8Array} pData
     * @param {number} iOffset
     * @returns {number|Promise<number>}
     */
    jWrite(fileId, pData, iOffset) {
      const file = this.mapIdToFile.get(fileId);
      if (iOffset + pData.byteLength > file.data.byteLength) {
        // Resize the ArrayBuffer to hold more data.
        const newSize = Math.max(iOffset + pData.byteLength, 2 * file.data.byteLength);
        const data = new ArrayBuffer(newSize);
        new Uint8Array(data).set(new Uint8Array(file.data, 0, file.size));
        file.data = data;
      }

      // Copy data.
      new Uint8Array(file.data, iOffset, pData.byteLength).set(pData);
      file.size = Math.max(file.size, iOffset + pData.byteLength);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {number} iSize
     * @returns {number|Promise<number>}
     */
    jTruncate(fileId, iSize) {
      const file = this.mapIdToFile.get(fileId);

      // For simplicity we don't make the ArrayBuffer smaller.
      file.size = Math.min(file.size, iSize);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {number} fileId
     * @param {DataView} pSize64
     * @returns {number|Promise<number>}
     */
    jFileSize(fileId, pSize64) {
      const file = this.mapIdToFile.get(fileId);
      pSize64.setBigInt64(0, BigInt(file.size), true);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {string} name
     * @param {number} syncDir
     * @returns {number|Promise<number>}
     */
    jDelete(name, syncDir) {
      const url = new URL(name, 'file://');
      const pathname = url.pathname;
      this.mapNameToFile.delete(pathname);
      return VFS.SQLITE_OK;
    }

    /**
     * @param {string} name
     * @param {number} flags
     * @param {DataView} pResOut
     * @returns {number|Promise<number>}
     */
    jAccess(name, flags, pResOut) {
      const url = new URL(name, 'file://');
      const pathname = url.pathname;
      const file = this.mapNameToFile.get(pathname);
      pResOut.setInt32(0, file ? 1 : 0, true);
      return VFS.SQLITE_OK;
    }
  }
},2885,[2882,2883],"node_modules/expo-sqlite/web/wa-sqlite/MemoryVFS.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "SQLiteError", {
    enumerable: true,
    get: function () {
      return SQLiteError;
    }
  });
  exports.Factory = Factory;
  var _sqliteConstantsJs = require(_dependencyMap[0], "./sqlite-constants.js");
  Object.keys(_sqliteConstantsJs).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) {
      Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () {
          return _sqliteConstantsJs[k];
        }
      });
    }
  });
  var SQLite = _interopNamespace(_sqliteConstantsJs);
  // Copyright 2021 Roy T. Hashimoto. All Rights Reserved.

  const MAX_INT64 = 0x7fffffffffffffffn;
  const MIN_INT64 = -0x8000000000000000n;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  class SQLiteError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  const async = true;

  /**
   * Builds a Javascript API from the Emscripten module. This API is still
   * low-level and closely corresponds to the C API exported by the module,
   * but differs in some specifics like throwing exceptions on errors.
   * @param {*} Module SQLite Emscripten module
   * @returns {SQLiteAPI}
   */
  function Factory(Module) {
    /** @type {SQLiteAPI} */const sqlite3 = {};
    Module.retryOps = [];
    const sqliteFreeAddress = Module._getSqliteFree();

    // Allocate some space for 32-bit returned values.
    const tmp = Module._malloc(8);
    const tmpPtr = [tmp, tmp + 4];
    const textEncoder = new TextEncoder();
    // Convert a JS string to a C string. sqlite3_malloc is used to allocate
    // memory (use sqlite3_free to deallocate).
    function createUTF8(s) {
      if (typeof s !== 'string') return 0;
      const utf8 = textEncoder.encode(s);
      const zts = Module._sqlite3_malloc(utf8.byteLength + 1);
      Module.HEAPU8.set(utf8, zts);
      Module.HEAPU8[zts + utf8.byteLength] = 0;
      return zts;
    }

    /**
     * Concatenate 32-bit numbers into a 64-bit (signed) BigInt.
     * @param {number} lo32
     * @param {number} hi32
     * @returns {bigint}
     */
    function cvt32x2ToBigInt(lo32, hi32) {
      return BigInt(hi32) << 32n | BigInt(lo32) & 0xffffffffn;
    }

    /**
     * Concatenate 32-bit numbers and return as number or BigInt, depending
     * on the value.
     * @param {number} lo32
     * @param {number} hi32
     * @returns {number|bigint}
     */
    const cvt32x2AsSafe = function () {
      const hiMax = BigInt(Number.MAX_SAFE_INTEGER) >> 32n;
      const hiMin = BigInt(Number.MIN_SAFE_INTEGER) >> 32n;
      return function (lo32, hi32) {
        if (hi32 > hiMax || hi32 < hiMin) {
          // Can't be expressed as a Number so use BigInt.
          return cvt32x2ToBigInt(lo32, hi32);
        } else {
          // Combine the upper and lower 32-bit numbers. The complication is
          // that lo32 is a signed integer which makes manipulating its bits
          // a little tricky - the sign bit gets handled separately.
          return hi32 * 0x100000000 + (lo32 & 0x7fffffff) - (lo32 & 0x80000000);
        }
      };
    }();
    const databases = new Set();
    function verifyDatabase(db) {
      if (!databases.has(db)) {
        throw new SQLiteError('not a database', SQLite.SQLITE_MISUSE);
      }
    }
    const mapStmtToDB = new Map();
    function verifyStatement(stmt) {
      if (!mapStmtToDB.has(stmt)) {
        throw new SQLiteError('not a statement', SQLite.SQLITE_MISUSE);
      }
    }
    sqlite3.backup = function () {
      const init = Module.cwrap('sqlite3_backup_init', ...decl('nsns:n'));
      const step = Module.cwrap('sqlite3_backup_step', ...decl('nn:n'));
      const finish = Module.cwrap('sqlite3_backup_finish', ...decl('n:n'));
      return async function (destDb, destName, srcDb, srcName) {
        verifyDatabase(destDb);
        verifyDatabase(srcDb);
        const backup = init(destDb, destName, srcDb, srcName);
        if (!backup) {
          check('sqlite3_backup_init', SQLite.SQLITE_ERROR, destDb);
          return;
        }
        step(backup, -1);
        const result = finish(backup);
        return check('sqlite3_backup_finish', result, destDb);
      };
    }();
    sqlite3.bind_collection = function (stmt, bindings) {
      verifyStatement(stmt);
      const isArray = Array.isArray(bindings);
      const nBindings = sqlite3.bind_parameter_count(stmt);
      for (let i = 1; i <= nBindings; ++i) {
        const key = isArray ? i - 1 : sqlite3.bind_parameter_name(stmt, i);
        const value = bindings[key];
        if (value !== undefined) {
          sqlite3.bind(stmt, i, value);
        }
      }
      return SQLite.SQLITE_OK;
    };
    sqlite3.bind = function (stmt, i, value) {
      verifyStatement(stmt);
      switch (typeof value) {
        case 'number':
          if (value === (value | 0)) {
            return sqlite3.bind_int(stmt, i, value);
          } else {
            return sqlite3.bind_double(stmt, i, value);
          }
        case 'string':
          return sqlite3.bind_text(stmt, i, value);
        case "boolean":
          return sqlite3.bind_int(stmt, i, value ? 1 : 0);
        default:
          if (value instanceof Uint8Array || Array.isArray(value)) {
            return sqlite3.bind_blob(stmt, i, value);
          } else if (value === null) {
            return sqlite3.bind_null(stmt, i);
          } else if (typeof value === 'bigint') {
            return sqlite3.bind_int64(stmt, i, value);
          } else if (value === undefined) {
            // Existing binding (or NULL) will be used.
            return SQLite.SQLITE_NOTICE;
          } else {
            console.warn('unknown binding converted to null', value);
            return sqlite3.bind_null(stmt, i);
          }
      }
    };
    sqlite3.bind_blob = function () {
      const fname = 'sqlite3_bind_blob';
      const f = Module.cwrap(fname, ...decl('nnnnn:n'));
      return function (stmt, i, value) {
        verifyStatement(stmt);
        // @ts-ignore
        const byteLength = value.byteLength ?? value.length;
        const ptr = Module._sqlite3_malloc(byteLength);
        Module.HEAPU8.subarray(ptr).set(value);
        const result = f(stmt, i, ptr, byteLength, sqliteFreeAddress);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.bind_parameter_count = function () {
      const fname = 'sqlite3_bind_parameter_count';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (stmt) {
        verifyStatement(stmt);
        const result = f(stmt);
        return result;
      };
    }();
    sqlite3.bind_double = function () {
      const fname = 'sqlite3_bind_double';
      const f = Module.cwrap(fname, ...decl('nnn:n'));
      return function (stmt, i, value) {
        verifyStatement(stmt);
        const result = f(stmt, i, value);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.bind_int = function () {
      const fname = 'sqlite3_bind_int';
      const f = Module.cwrap(fname, ...decl('nnn:n'));
      return function (stmt, i, value) {
        verifyStatement(stmt);
        if (value > 0x7fffffff || value < -0x80000000) return SQLite.SQLITE_RANGE;
        const result = f(stmt, i, value);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.bind_int64 = function () {
      const fname = 'sqlite3_bind_int64';
      const f = Module.cwrap(fname, ...decl('nnnn:n'));
      return function (stmt, i, value) {
        verifyStatement(stmt);
        if (value > MAX_INT64 || value < MIN_INT64) return SQLite.SQLITE_RANGE;
        const lo32 = value & 0xffffffffn;
        const hi32 = value >> 32n;
        const result = f(stmt, i, Number(lo32), Number(hi32));
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.bind_null = function () {
      const fname = 'sqlite3_bind_null';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, i) {
        verifyStatement(stmt);
        const result = f(stmt, i);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.bind_parameter_index = function () {
      const fname = "sqlite3_bind_parameter_index";
      const f = Module.cwrap(fname, ...decl("ns:n"));
      return function (stmt, name) {
        verifyStatement(stmt);
        const result = f(stmt, name);
        return result;
      };
    }();
    sqlite3.bind_parameter_name = function () {
      const fname = 'sqlite3_bind_parameter_name';
      const f = Module.cwrap(fname, ...decl('n:s'));
      return function (stmt, i) {
        verifyStatement(stmt);
        const result = f(stmt, i);
        return result;
      };
    }();
    sqlite3.bind_text = function () {
      const fname = 'sqlite3_bind_text';
      const f = Module.cwrap(fname, ...decl('nnnnn:n'));
      return function (stmt, i, value) {
        verifyStatement(stmt);
        const ptr = createUTF8(value);
        const result = f(stmt, i, ptr, -1, sqliteFreeAddress);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.changes = function () {
      const fname = 'sqlite3_changes';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (db) {
        verifyDatabase(db);
        const result = f(db);
        return result;
      };
    }();
    sqlite3.clear_bindings = function () {
      const fname = 'sqlite3_clear_bindings';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (stmt) {
        verifyStatement(stmt);
        const result = f(stmt);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.close = function () {
      const fname = 'sqlite3_close';
      const f = Module.cwrap(fname, ...decl('n:n'), {
        async
      });
      return async function (db) {
        verifyDatabase(db);
        const result = await f(db);
        databases.delete(db);
        return check(fname, result, db);
      };
    }();
    sqlite3.column = function (stmt, iCol) {
      verifyStatement(stmt);
      const type = sqlite3.column_type(stmt, iCol);
      switch (type) {
        case SQLite.SQLITE_BLOB:
          return sqlite3.column_blob(stmt, iCol);
        case SQLite.SQLITE_FLOAT:
          return sqlite3.column_double(stmt, iCol);
        case SQLite.SQLITE_INTEGER:
          const lo32 = sqlite3.column_int(stmt, iCol);
          const hi32 = Module.getTempRet0();
          return cvt32x2AsSafe(lo32, hi32);
        case SQLite.SQLITE_NULL:
          return null;
        case SQLite.SQLITE_TEXT:
          return sqlite3.column_text(stmt, iCol);
        default:
          throw new SQLiteError('unknown type', type);
      }
    };
    sqlite3.column_blob = function () {
      const fname = 'sqlite3_column_blob';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const nBytes = sqlite3.column_bytes(stmt, iCol);
        const address = f(stmt, iCol);
        const result = Module.HEAPU8.subarray(address, address + nBytes);
        return result;
      };
    }();
    sqlite3.column_bytes = function () {
      const fname = 'sqlite3_column_bytes';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.column_count = function () {
      const fname = 'sqlite3_column_count';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (stmt) {
        verifyStatement(stmt);
        const result = f(stmt);
        return result;
      };
    }();
    sqlite3.column_double = function () {
      const fname = 'sqlite3_column_double';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.column_int = function () {
      // Retrieve int64 but use only the lower 32 bits. The upper 32-bits are
      // accessible with Module.getTempRet0().
      const fname = 'sqlite3_column_int64';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.column_int64 = function () {
      const fname = 'sqlite3_column_int64';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const lo32 = f(stmt, iCol);
        const hi32 = Module.getTempRet0();
        const result = cvt32x2ToBigInt(lo32, hi32);
        return result;
      };
    }();
    sqlite3.column_int_safe = function () {
      const fname = 'sqlite3_column_int64';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const lo32 = f(stmt, iCol);
        const hi32 = Module.getTempRet0();
        return cvt32x2AsSafe(lo32, hi32);
      };
    }();
    sqlite3.column_name = function () {
      const fname = 'sqlite3_column_name';
      const f = Module.cwrap(fname, ...decl('nn:s'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.column_names = function (stmt) {
      const columns = [];
      const nColumns = sqlite3.column_count(stmt);
      for (let i = 0; i < nColumns; ++i) {
        columns.push(sqlite3.column_name(stmt, i));
      }
      return columns;
    };
    sqlite3.column_text = function () {
      const fname = 'sqlite3_column_text';
      const f = Module.cwrap(fname, ...decl('nn:s'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.column_type = function () {
      const fname = 'sqlite3_column_type';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (stmt, iCol) {
        verifyStatement(stmt);
        const result = f(stmt, iCol);
        return result;
      };
    }();
    sqlite3.create_function = function (db, zFunctionName, nArg, eTextRep, pApp, xFunc, xStep, xFinal) {
      verifyDatabase(db);

      // Convert SQLite callback arguments to JavaScript-friendly arguments.
      function adapt(f) {
        return f instanceof AsyncFunction ? async (ctx, n, values) => f(ctx, Module.HEAP32.subarray(values / 4, values / 4 + n)) : (ctx, n, values) => f(ctx, Module.HEAP32.subarray(values / 4, values / 4 + n));
      }
      const result = Module.create_function(db, zFunctionName, nArg, eTextRep, pApp, xFunc && adapt(xFunc), xStep && adapt(xStep), xFinal);
      return check('sqlite3_create_function', result, db);
    };
    sqlite3.data_count = function () {
      const fname = 'sqlite3_data_count';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (stmt) {
        verifyStatement(stmt);
        const result = f(stmt);
        return result;
      };
    }();
    sqlite3.db_filename = function () {
      const fname = 'sqlite3_db_filename';
      const f = Module.cwrap(fname, ...decl('ns:s'));
      return function (db, schema) {
        verifyDatabase(db);
        const result = f(db, schema);
        return result;
      };
    }();
    sqlite3.deserialize = function () {
      const fname = 'sqlite3_deserialize';
      const f = Module.cwrap(fname, ...decl('nsnnnn:n'));
      return function (db, schema, data) {
        const flags = SQLite.SQLITE_DESERIALIZE_RESIZEABLE | SQLite.SQLITE_DESERIALIZE_FREEONCLOSE;
        verifyDatabase(db);
        const size = data.byteLength;
        const ptr = Module._sqlite3_malloc(size);
        Module.HEAPU8.subarray(ptr).set(data);
        const result = f(db, schema, ptr, size, size, flags);
        return check(fname, result, db);
      };
    }();
    sqlite3.exec = async function (db, sql, callback) {
      for await (const stmt of sqlite3.statements(db, sql)) {
        let columns;
        while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          if (callback) {
            columns = columns ?? sqlite3.column_names(stmt);
            const row = sqlite3.row(stmt);
            await callback(row, columns);
          }
        }
      }
      return SQLite.SQLITE_OK;
    };
    sqlite3.finalize = function () {
      const fname = 'sqlite3_finalize';
      const f = Module.cwrap(fname, ...decl('n:n'), {
        async
      });
      return async function (stmt) {
        const result = await f(stmt);
        mapStmtToDB.delete(stmt);

        // Don't throw on error here. Typically the error has already been
        // thrown and finalize() is part of the cleanup.
        return result;
      };
    }();
    sqlite3.get_autocommit = function () {
      const fname = 'sqlite3_get_autocommit';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (db) {
        const result = f(db);
        return result;
      };
    }();
    sqlite3.last_insert_rowid = function () {
      const fname = 'sqlite3_last_insert_rowid';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (db) {
        const lo32 = f(db);
        const hi32 = Module.getTempRet0();
        return cvt32x2AsSafe(lo32, hi32);
      };
    }();
    sqlite3.libversion = function () {
      const fname = 'sqlite3_libversion';
      const f = Module.cwrap(fname, ...decl(':s'));
      return function () {
        const result = f();
        return result;
      };
    }();
    sqlite3.libversion_number = function () {
      const fname = 'sqlite3_libversion_number';
      const f = Module.cwrap(fname, ...decl(':n'));
      return function () {
        const result = f();
        return result;
      };
    }();
    sqlite3.limit = function () {
      const fname = 'sqlite3_limit';
      const f = Module.cwrap(fname, ...decl('nnn:n'));
      return function (db, id, newVal) {
        const result = f(db, id, newVal);
        return result;
      };
    }();
    sqlite3.next_stmt = function () {
      const fname = 'sqlite3_next_stmt';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (db, stmt) {
        verifyDatabase(db);
        const result = f(db, stmt || 0);
        return result;
      };
    }();
    sqlite3.open_v2 = function () {
      const fname = 'sqlite3_open_v2';
      const f = Module.cwrap(fname, ...decl('snnn:n'), {
        async
      });
      return async function (zFilename, flags, zVfs) {
        flags = flags || SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE;
        zVfs = createUTF8(zVfs);
        try {
          // Allow retry operations.
          const rc = await retry(() => f(zFilename, tmpPtr[0], flags, zVfs));
          const db = Module.getValue(tmpPtr[0], '*');
          databases.add(db);
          Module.ccall('RegisterExtensionFunctions', 'void', ['number'], [db]);
          check(fname, rc);
          return db;
        } finally {
          Module._sqlite3_free(zVfs);
        }
      };
    }();
    sqlite3.progress_handler = function (db, nProgressOps, handler, userData) {
      verifyDatabase(db);
      Module.progress_handler(db, nProgressOps, handler, userData);
    };
    ;
    sqlite3.reset = function () {
      const fname = 'sqlite3_reset';
      const f = Module.cwrap(fname, ...decl('n:n'), {
        async
      });
      return async function (stmt) {
        verifyStatement(stmt);
        const result = await f(stmt);
        return check(fname, result, mapStmtToDB.get(stmt));
      };
    }();
    sqlite3.result = function (context, value) {
      switch (typeof value) {
        case 'number':
          if (value === (value | 0)) {
            sqlite3.result_int(context, value);
          } else {
            sqlite3.result_double(context, value);
          }
          break;
        case 'string':
          sqlite3.result_text(context, value);
          break;
        default:
          if (value instanceof Uint8Array || Array.isArray(value)) {
            sqlite3.result_blob(context, value);
          } else if (value === null) {
            sqlite3.result_null(context);
          } else if (typeof value === 'bigint') {
            return sqlite3.result_int64(context, value);
          } else {
            console.warn('unknown result converted to null', value);
            sqlite3.result_null(context);
          }
          break;
      }
    };
    sqlite3.result_blob = function () {
      const fname = 'sqlite3_result_blob';
      const f = Module.cwrap(fname, ...decl('nnnn:n'));
      return function (context, value) {
        // @ts-ignore
        const byteLength = value.byteLength ?? value.length;
        const ptr = Module._sqlite3_malloc(byteLength);
        Module.HEAPU8.subarray(ptr).set(value);
        f(context, ptr, byteLength, sqliteFreeAddress); // void return
      };
    }();
    sqlite3.result_double = function () {
      const fname = 'sqlite3_result_double';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (context, value) {
        f(context, value); // void return
      };
    }();
    sqlite3.result_int = function () {
      const fname = 'sqlite3_result_int';
      const f = Module.cwrap(fname, ...decl('nn:n'));
      return function (context, value) {
        f(context, value); // void return
      };
    }();
    sqlite3.result_int64 = function () {
      const fname = 'sqlite3_result_int64';
      const f = Module.cwrap(fname, ...decl('nnn:n'));
      return function (context, value) {
        if (value > MAX_INT64 || value < MIN_INT64) return SQLite.SQLITE_RANGE;
        const lo32 = value & 0xffffffffn;
        const hi32 = value >> 32n;
        f(context, Number(lo32), Number(hi32)); // void return
      };
    }();
    sqlite3.result_null = function () {
      const fname = 'sqlite3_result_null';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (context) {
        f(context); // void return
      };
    }();
    sqlite3.result_text = function () {
      const fname = 'sqlite3_result_text';
      const f = Module.cwrap(fname, ...decl('nnnn:n'));
      return function (context, value) {
        const ptr = createUTF8(value);
        f(context, ptr, -1, sqliteFreeAddress); // void return
      };
    }();
    sqlite3.row = function (stmt) {
      const row = [];
      const nColumns = sqlite3.data_count(stmt);
      for (let i = 0; i < nColumns; ++i) {
        const value = sqlite3.column(stmt, i);

        // Copy blob if aliasing volatile WebAssembly memory. This avoids an
        // unnecessary copy if users monkey patch column_blob to copy.
        // @ts-ignore
        row.push(value?.buffer === Module.HEAPU8.buffer ? value.slice() : value);
      }
      return row;
    };
    sqlite3.serialize = function () {
      const fname = 'sqlite3_serialize';
      const f = Module.cwrap(fname, ...decl('nsnn:n'));
      return function (db, schema) {
        verifyDatabase(db);
        const size = tmpPtr[0];
        const flags = 0;
        const ptr = f(db, schema, size, flags);
        if (!ptr) {
          check(fname, SQLite.SQLITE_ERROR, db);
          return null;
        }
        const bufferSize = Module.getValue(size, '*');
        const buffer = Module.HEAPU8.subarray(ptr, ptr + bufferSize);
        const result = new Uint8Array(buffer);
        Module._sqlite3_free(ptr);
        return result;
      };
    }();
    sqlite3.set_authorizer = function (db, xAuth, pApp) {
      verifyDatabase(db);

      // Convert SQLite callback arguments to JavaScript-friendly arguments.
      function cvtArgs(_, iAction, p3, p4, p5, p6) {
        return [_, iAction, Module.UTF8ToString(p3), Module.UTF8ToString(p4), Module.UTF8ToString(p5), Module.UTF8ToString(p6)];
      }
      ;
      function adapt(f) {
        return f instanceof AsyncFunction ? async (_, iAction, p3, p4, p5, p6) => f(...cvtArgs(_, iAction, p3, p4, p5, p6)) : (_, iAction, p3, p4, p5, p6) => f(...cvtArgs(_, iAction, p3, p4, p5, p6));
      }
      const result = Module.set_authorizer(db, adapt(xAuth), pApp);
      return check('sqlite3_set_authorizer', result, db);
    };
    ;
    sqlite3.sql = function () {
      const fname = 'sqlite3_sql';
      const f = Module.cwrap(fname, ...decl('n:s'));
      return function (stmt) {
        verifyStatement(stmt);
        const result = f(stmt);
        return result;
      };
    }();
    sqlite3.statements = function (db, sql, options = {}) {
      const prepare = Module.cwrap('sqlite3_prepare_v3', 'number', ['number', 'number', 'number', 'number', 'number', 'number'], {
        async: true
      });
      return async function* () {
        const onFinally = [];
        try {
          // Encode SQL string to UTF-8.
          const utf8 = textEncoder.encode(sql);

          // Copy encoded string to WebAssembly memory. The SQLite docs say
          // zero-termination is a minor optimization so add room for that.
          // Also add space for the statement handle and SQL tail pointer.
          const allocSize = utf8.byteLength - utf8.byteLength % 4 + 12;
          const pzHead = Module._sqlite3_malloc(allocSize);
          const pzEnd = pzHead + utf8.byteLength + 1;
          onFinally.push(() => Module._sqlite3_free(pzHead));
          Module.HEAPU8.set(utf8, pzHead);
          Module.HEAPU8[pzEnd - 1] = 0;

          // Use extra space for the statement handle and SQL tail pointer.
          const pStmt = pzHead + allocSize - 8;
          const pzTail = pzHead + allocSize - 4;

          // Ensure that statement handles are not leaked.
          let stmt;
          function maybeFinalize() {
            if (stmt && !options.unscoped) {
              sqlite3.finalize(stmt);
            }
            stmt = 0;
          }
          onFinally.push(maybeFinalize);

          // Loop over statements.
          Module.setValue(pzTail, pzHead, '*');
          do {
            // Reclaim resources for the previous iteration.
            maybeFinalize();

            // Call sqlite3_prepare_v3() for the next statement.
            // Allow retry operations.
            const zTail = Module.getValue(pzTail, '*');
            const rc = await retry(() => {
              return prepare(db, zTail, pzEnd - pzTail, options.flags || 0, pStmt, pzTail);
            });
            if (rc !== SQLite.SQLITE_OK) {
              check('sqlite3_prepare_v3', rc, db);
            }
            stmt = Module.getValue(pStmt, '*');
            if (stmt) {
              mapStmtToDB.set(stmt, db);
              yield stmt;
            }
          } while (stmt);
        } finally {
          while (onFinally.length) {
            onFinally.pop()();
          }
        }
      }();
    };
    sqlite3.step = function () {
      const fname = 'sqlite3_step';
      const f = Module.cwrap(fname, ...decl('n:n'), {
        async
      });
      return async function (stmt) {
        verifyStatement(stmt);

        // Allow retry operations.
        const rc = await retry(() => f(stmt));
        return check(fname, rc, mapStmtToDB.get(stmt), [SQLite.SQLITE_ROW, SQLite.SQLITE_DONE]);
      };
    }();
    sqlite3.commit_hook = function (db, xCommitHook) {
      verifyDatabase(db);
      Module.commit_hook(db, xCommitHook);
    };
    sqlite3.update_hook = function (db, xUpdateHook) {
      verifyDatabase(db);

      // Convert SQLite callback arguments to JavaScript-friendly arguments.
      function cvtArgs(iUpdateType, dbName, tblName, lo32, hi32) {
        return [iUpdateType, Module.UTF8ToString(dbName), Module.UTF8ToString(tblName), cvt32x2ToBigInt(lo32, hi32)];
      }
      ;
      function adapt(f) {
        return f instanceof AsyncFunction ? async (iUpdateType, dbName, tblName, lo32, hi32) => f(...cvtArgs(iUpdateType, dbName, tblName, lo32, hi32)) : (iUpdateType, dbName, tblName, lo32, hi32) => f(...cvtArgs(iUpdateType, dbName, tblName, lo32, hi32));
      }
      Module.update_hook(db, adapt(xUpdateHook));
    };
    ;
    sqlite3.value = function (pValue) {
      const type = sqlite3.value_type(pValue);
      switch (type) {
        case SQLite.SQLITE_BLOB:
          return sqlite3.value_blob(pValue);
        case SQLite.SQLITE_FLOAT:
          return sqlite3.value_double(pValue);
        case SQLite.SQLITE_INTEGER:
          const lo32 = sqlite3.value_int(pValue);
          const hi32 = Module.getTempRet0();
          return cvt32x2AsSafe(lo32, hi32);
        case SQLite.SQLITE_NULL:
          return null;
        case SQLite.SQLITE_TEXT:
          return sqlite3.value_text(pValue);
        default:
          throw new SQLiteError('unknown type', type);
      }
    };
    sqlite3.value_blob = function () {
      const fname = 'sqlite3_value_blob';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const nBytes = sqlite3.value_bytes(pValue);
        const address = f(pValue);
        const result = Module.HEAPU8.subarray(address, address + nBytes);
        return result;
      };
    }();
    sqlite3.value_bytes = function () {
      const fname = 'sqlite3_value_bytes';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const result = f(pValue);
        return result;
      };
    }();
    sqlite3.value_double = function () {
      const fname = 'sqlite3_value_double';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const result = f(pValue);
        return result;
      };
    }();
    sqlite3.value_int = function () {
      const fname = 'sqlite3_value_int64';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const result = f(pValue);
        return result;
      };
    }();
    sqlite3.value_int64 = function () {
      const fname = 'sqlite3_value_int64';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const lo32 = f(pValue);
        const hi32 = Module.getTempRet0();
        const result = cvt32x2ToBigInt(lo32, hi32);
        return result;
      };
    }();
    sqlite3.value_text = function () {
      const fname = 'sqlite3_value_text';
      const f = Module.cwrap(fname, ...decl('n:s'));
      return function (pValue) {
        const result = f(pValue);
        return result;
      };
    }();
    sqlite3.value_type = function () {
      const fname = 'sqlite3_value_type';
      const f = Module.cwrap(fname, ...decl('n:n'));
      return function (pValue) {
        const result = f(pValue);
        return result;
      };
    }();
    sqlite3.vfs_register = function (vfs, makeDefault) {
      const result = Module.vfs_register(vfs, makeDefault);
      return check('sqlite3_vfs_register', result);
    };
    sqlite3.changeset_apply = function () {
      const fname = 'sqlite3changeset_apply';
      const f = Module.cwrap(fname, ...decl('nnnnnn:n'));
      return function (db, changeset) {
        verifyDatabase(db);
        const size = changeset.byteLength;
        const buffer = Module._sqlite3_malloc(size);
        Module.HEAPU8.subarray(buffer).set(changeset);
        const onConflict = () => {
          return SQLite.SQLITE_CHANGESET_REPLACE;
        };
        const result = f(db, size, buffer, null, onConflict, null);
        Module._sqlite3_free(buffer);
        return check(fname, result, db);
      };
    }();
    sqlite3.changeset_invert = function () {
      const fname = 'sqlite3changeset_invert';
      const f = Module.cwrap(fname, ...decl('nnnn:n'));
      return function (changeset) {
        const inSize = changeset.byteLength;
        const inBuffer = Module._sqlite3_malloc(inSize);
        Module.HEAPU8.subarray(inBuffer).set(changeset);
        const outSize = tmpPtr[0];
        const outBuffer = tmpPtr[1];
        const result = f(inSize, inBuffer, outSize, outBuffer);
        Module._sqlite3_free(inBuffer);
        check(fname, result);
        const bufferSize = Module.getValue(outSize, '*');
        const bufferPtr = Module.getValue(outBuffer, '*');
        const buffer = Module.HEAPU8.subarray(bufferPtr, bufferPtr + bufferSize);
        const inverted = new Uint8Array(buffer);
        Module._sqlite3_free(outBuffer);
        return inverted;
      };
    }();
    sqlite3.session_create = function () {
      const fname = 'sqlite3session_create';
      const f = Module.cwrap(fname, ...decl('nsn:n'));
      return function (db, dbName) {
        verifyDatabase(db);
        const ptrSession = tmpPtr[0];
        const result = f(db, dbName, ptrSession);
        check(fname, result, db);
        const session = Module.getValue(ptrSession, '*');
        return session;
      };
    }();
    sqlite3.session_delete = function () {
      const fname = 'sqlite3session_delete';
      const f = Module.cwrap(fname, ...decl('n:v'));
      return function (session) {
        f(session);
      };
    }();
    sqlite3.session_enable = function () {
      const fname = 'sqlite3session_enable';
      const f = Module.cwrap(fname, ...decl('nn:v'));
      return function (session, enabled) {
        f(session, enabled ? 1 : 0);
      };
    }();
    sqlite3.session_attach = function () {
      const fname = 'sqlite3session_attach';
      const f = Module.cwrap(fname, ...decl('ns:n'));
      return function (session, tableName) {
        const result = f(session, tableName);
        return check(fname, result);
      };
    }();
    sqlite3.session_changeset = function () {
      const fname = 'sqlite3session_changeset';
      const f = Module.cwrap(fname, ...decl('nnn:n'));
      return function (session) {
        const bufferSize = tmpPtr[0];
        const ptr = tmpPtr[1];
        const result = f(session, bufferSize, ptr);
        check(fname, result);
        const size = Module.getValue(bufferSize, '*');
        const bufferPtr = Module.getValue(ptr, '*');
        const buffer = Module.HEAPU8.subarray(bufferPtr, bufferPtr + size);
        const changeset = new Uint8Array(buffer);
        Module._sqlite3_free(ptr);
        return changeset;
      };
    }();

    /**
     * Shorthand for `session_changeset` and `changeset_invert` but
     * in a single call without additional memory allocations.
     */
    sqlite3.session_changeset_inverted = function () {
      const fNameChangeset = 'sqlite3session_changeset';
      const fNameInvert = 'sqlite3changeset_invert';
      const fChangeset = Module.cwrap(fNameChangeset, ...decl('nnn:n'));
      const fInvert = Module.cwrap(fNameInvert, ...decl('nnnn:n'));
      return function (session) {
        const bufferSize = tmpPtr[0];
        const ptr = tmpPtr[1];
        const changesetResult = fChangeset(session, bufferSize, ptr);
        check(fNameChangeset, changesetResult);
        const size = Module.getValue(bufferSize, '*');
        const buffer = Module.getValue(ptr, '*');
        const outSize = tmpPtr[0];
        const outBuffer = tmpPtr[1];
        const invertResult = fInvert(size, buffer, outSize, outBuffer);
        Module._sqlite3_free(buffer);
        check(fNameInvert, invertResult);
        const outSizeValue = Module.getValue(outSize, '*');
        const outBufferPtr = Module.getValue(outBuffer, '*');
        const inverted = Module.HEAPU8.subarray(outBufferPtr, outBufferPtr + outSizeValue);
        const invertedArray = new Uint8Array(inverted);
        Module._sqlite3_free(outBuffer);
        return invertedArray;
      };
    }();
    function check(fname, result, db = null, allowed = [SQLite.SQLITE_OK]) {
      if (allowed.includes(result)) return result;
      let message;
      if (db) {
        const errcode = Module.ccall('sqlite3_errcode', 'number', ['number'], [db]);
        const errmsg = Module.ccall('sqlite3_errmsg', 'string', ['number'], [db]);
        message = 'Error code ' + errcode + ': ' + errmsg;
      } else {
        message = fname;
      }
      throw new SQLiteError(message, result);
    }

    // This function is used to automatically retry failed calls that
    // have pending retry operations that should allow the retry to
    // succeed.
    async function retry(f) {
      let rc;
      do {
        // Wait for all pending retry operations to complete. This is
        // normally empty on the first loop iteration.
        if (Module.retryOps.length) {
          await Promise.all(Module.retryOps);
          Module.retryOps = [];
        }
        rc = await f();

        // Retry on failure with new pending retry operations.
      } while (rc && Module.retryOps.length);
      return rc;
    }
    return sqlite3;
  }

  // Helper function to use a more compact signature specification.
  function decl(s) {
    const result = [];
    const m = s.match(/([ns@]*):([nsv@])/);
    switch (m[2]) {
      case 'n':
        result.push('number');
        break;
      case 's':
        result.push('string');
        break;
      case 'v':
        result.push(null);
        break;
    }
    const args = [];
    for (let c of m[1]) {
      switch (c) {
        case 'n':
          args.push('number');
          break;
        case 's':
          args.push('string');
          break;
      }
    }
    result.push(args);
    return result;
  }
},2886,[2884],"node_modules/expo-sqlite/web/wa-sqlite/sqlite-api.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var Module = (() => {
    var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
    return async function (moduleArg = {}) {
      var moduleRtn;
      var Module = moduleArg;
      var ENVIRONMENT_IS_WEB = typeof window == "object";
      var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
      var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
      var arguments_ = [];
      var thisProgram = "./this.program";
      var quit_ = (status, toThrow) => {
        throw toThrow;
      };
      if (ENVIRONMENT_IS_WORKER) {
        _scriptName = self.location.href;
      }
      var scriptDirectory = "";
      function locateFile(path) {
        if (Module["locateFile"]) {
          return Module["locateFile"](path, scriptDirectory);
        }
        return scriptDirectory + path;
      }
      var readAsync, readBinary;
      if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
        try {
          scriptDirectory = new URL(".", _scriptName).href;
        } catch {}
        {
          if (ENVIRONMENT_IS_WORKER) {
            readBinary = url => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, false);
              xhr.responseType = "arraybuffer";
              xhr.send(null);
              return new Uint8Array(xhr.response);
            };
          }
          readAsync = async url => {
            var response = await fetch(url, {
              credentials: "same-origin"
            });
            if (response.ok) {
              return response.arrayBuffer();
            }
            throw new Error(response.status + " : " + response.url);
          };
        }
      } else {}
      var out = console.log.bind(console);
      var err = console.error.bind(console);
      var wasmBinary;
      var ABORT = false;
      var EXITSTATUS;
      var readyPromiseResolve, readyPromiseReject;
      var wasmMemory;
      var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
      var runtimeInitialized = false;
      function updateMemoryViews() {
        var b = wasmMemory.buffer;
        HEAP8 = new Int8Array(b);
        HEAP16 = new Int16Array(b);
        Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
        HEAPU16 = new Uint16Array(b);
        Module["HEAP32"] = HEAP32 = new Int32Array(b);
        HEAPU32 = new Uint32Array(b);
        HEAPF32 = new Float32Array(b);
        HEAPF64 = new Float64Array(b);
      }
      function preRun() {
        if (Module["preRun"]) {
          if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
          while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift());
          }
        }
        callRuntimeCallbacks(onPreRuns);
      }
      function initRuntime() {
        runtimeInitialized = true;
        if (!Module["noFSInit"] && !FS.initialized) FS.init();
        TTY.init();
        wasmExports["qa"]();
        FS.ignorePermissions = false;
      }
      function preMain() {}
      function postRun() {
        if (Module["postRun"]) {
          if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
          while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift());
          }
        }
        callRuntimeCallbacks(onPostRuns);
      }
      var runDependencies = 0;
      var dependenciesFulfilled = null;
      function addRunDependency(id) {
        runDependencies++;
        Module["monitorRunDependencies"]?.(runDependencies);
      }
      function removeRunDependency(id) {
        runDependencies--;
        Module["monitorRunDependencies"]?.(runDependencies);
        if (runDependencies == 0) {
          if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback();
          }
        }
      }
      function abort(what) {
        Module["onAbort"]?.(what);
        what = "Aborted(" + what + ")";
        err(what);
        ABORT = true;
        what += ". Build with -sASSERTIONS for more info.";
        var e = new WebAssembly.RuntimeError(what);
        readyPromiseReject?.(e);
        throw e;
      }
      var wasmBinaryFile;
      function findWasmBinary() {
        return locateFile("wa-sqlite.wasm");
      }
      function getBinarySync(file) {
        if (file == wasmBinaryFile && wasmBinary) {
          return new Uint8Array(wasmBinary);
        }
        if (readBinary) {
          return readBinary(file);
        }
        throw "both async and sync fetching of the wasm failed";
      }
      async function getWasmBinary(binaryFile) {
        if (!wasmBinary) {
          try {
            var response = await readAsync(binaryFile);
            return new Uint8Array(response);
          } catch {}
        }
        return getBinarySync(binaryFile);
      }
      async function instantiateArrayBuffer(binaryFile, imports) {
        try {
          var binary = await getWasmBinary(binaryFile);
          var instance = await WebAssembly.instantiate(binary, imports);
          return instance;
        } catch (reason) {
          err(`failed to asynchronously prepare wasm: ${reason}`);
          abort(reason);
        }
      }
      async function instantiateAsync(binary, binaryFile, imports) {
        if (!binary && typeof WebAssembly.instantiateStreaming == "function") {
          try {
            var response = fetch(binaryFile, {
              credentials: "same-origin"
            });
            var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
            return instantiationResult;
          } catch (reason) {
            err(`wasm streaming compile failed: ${reason}`);
            err("falling back to ArrayBuffer instantiation");
          }
        }
        return instantiateArrayBuffer(binaryFile, imports);
      }
      function getWasmImports() {
        return {
          a: wasmImports
        };
      }
      async function createWasm() {
        function receiveInstance(instance, module) {
          wasmExports = instance.exports;
          wasmMemory = wasmExports["pa"];
          updateMemoryViews();
          wasmTable = wasmExports["qf"];
          assignWasmExports(wasmExports);
          removeRunDependency("wasm-instantiate");
          return wasmExports;
        }
        addRunDependency("wasm-instantiate");
        function receiveInstantiationResult(result) {
          return receiveInstance(result["instance"]);
        }
        var info = getWasmImports();
        if (Module["instantiateWasm"]) {
          return new Promise((resolve, reject) => {
            Module["instantiateWasm"](info, (mod, inst) => {
              resolve(receiveInstance(mod, inst));
            });
          });
        }
        wasmBinaryFile ??= findWasmBinary();
        var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
        var exports = receiveInstantiationResult(result);
        return exports;
      }
      var tempDouble;
      var tempI64;
      class ExitStatus {
        name = "ExitStatus";
        constructor(status) {
          this.message = `Program terminated with exit(${status})`;
          this.status = status;
        }
      }
      var callRuntimeCallbacks = callbacks => {
        while (callbacks.length > 0) {
          callbacks.shift()(Module);
        }
      };
      var onPostRuns = [];
      var addOnPostRun = cb => onPostRuns.push(cb);
      var onPreRuns = [];
      var addOnPreRun = cb => onPreRuns.push(cb);
      function getValue(ptr, type = "i8") {
        if (type.endsWith("*")) type = "*";
        switch (type) {
          case "i1":
            return HEAP8[ptr];
          case "i8":
            return HEAP8[ptr];
          case "i16":
            return HEAP16[ptr >> 1];
          case "i32":
            return HEAP32[ptr >> 2];
          case "i64":
            abort("to do getValue(i64) use WASM_BIGINT");
          case "float":
            return HEAPF32[ptr >> 2];
          case "double":
            return HEAPF64[ptr >> 3];
          case "*":
            return HEAPU32[ptr >> 2];
          default:
            abort(`invalid type for getValue: ${type}`);
        }
      }
      var noExitRuntime = true;
      function setValue(ptr, value, type = "i8") {
        if (type.endsWith("*")) type = "*";
        switch (type) {
          case "i1":
            HEAP8[ptr] = value;
            break;
          case "i8":
            HEAP8[ptr] = value;
            break;
          case "i16":
            HEAP16[ptr >> 1] = value;
            break;
          case "i32":
            HEAP32[ptr >> 2] = value;
            break;
          case "i64":
            abort("to do setValue(i64) use WASM_BIGINT");
          case "float":
            HEAPF32[ptr >> 2] = value;
            break;
          case "double":
            HEAPF64[ptr >> 3] = value;
            break;
          case "*":
            HEAPU32[ptr >> 2] = value;
            break;
          default:
            abort(`invalid type for setValue: ${type}`);
        }
      }
      var stackRestore = val => __emscripten_stack_restore(val);
      var stackSave = () => _emscripten_stack_get_current();
      var UTF8Decoder = new TextDecoder();
      var UTF8ToString = (ptr, maxBytesToRead) => {
        if (!ptr) return "";
        var maxPtr = ptr + maxBytesToRead;
        for (var end = ptr; !(end >= maxPtr) && HEAPU8[end];) ++end;
        return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
      };
      var ___assert_fail = (condition, filename, line, func) => abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]);
      var PATH = {
        isAbs: path => path.charAt(0) === "/",
        splitPath: filename => {
          var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
          return splitPathRe.exec(filename).slice(1);
        },
        normalizeArray: (parts, allowAboveRoot) => {
          var up = 0;
          for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
              parts.splice(i, 1);
            } else if (last === "..") {
              parts.splice(i, 1);
              up++;
            } else if (up) {
              parts.splice(i, 1);
              up--;
            }
          }
          if (allowAboveRoot) {
            for (; up; up--) {
              parts.unshift("..");
            }
          }
          return parts;
        },
        normalize: path => {
          var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === "/";
          path = PATH.normalizeArray(path.split("/").filter(p => !!p), !isAbsolute).join("/");
          if (!path && !isAbsolute) {
            path = ".";
          }
          if (path && trailingSlash) {
            path += "/";
          }
          return (isAbsolute ? "/" : "") + path;
        },
        dirname: path => {
          var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
          if (!root && !dir) {
            return ".";
          }
          if (dir) {
            dir = dir.slice(0, -1);
          }
          return root + dir;
        },
        basename: path => path && path.match(/([^\/]+|\/)\/*$/)[1],
        join: (...paths) => PATH.normalize(paths.join("/")),
        join2: (l, r) => PATH.normalize(l + "/" + r)
      };
      var initRandomFill = () => view => crypto.getRandomValues(view);
      var randomFill = view => {
        (randomFill = initRandomFill())(view);
      };
      var PATH_FS = {
        resolve: (...args) => {
          var resolvedPath = "",
            resolvedAbsolute = false;
          for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? args[i] : FS.cwd();
            if (typeof path != "string") {
              throw new TypeError("Arguments to path.resolve must be strings");
            } else if (!path) {
              return "";
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = PATH.isAbs(path);
          }
          resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(p => !!p), !resolvedAbsolute).join("/");
          return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
        },
        relative: (from, to) => {
          from = PATH_FS.resolve(from).slice(1);
          to = PATH_FS.resolve(to).slice(1);
          function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
              if (arr[start] !== "") break;
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
              if (arr[end] !== "") break;
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1);
          }
          var fromParts = trim(from.split("/"));
          var toParts = trim(to.split("/"));
          var length = Math.min(fromParts.length, toParts.length);
          var samePartsLength = length;
          for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
              samePartsLength = i;
              break;
            }
          }
          var outputParts = [];
          for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..");
          }
          outputParts = outputParts.concat(toParts.slice(samePartsLength));
          return outputParts.join("/");
        }
      };
      var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
        var endIdx = idx + maxBytesToRead;
        var endPtr = idx;
        while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
        return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)));
      };
      var FS_stdin_getChar_buffer = [];
      var lengthBytesUTF8 = str => {
        var len = 0;
        for (var i = 0; i < str.length; ++i) {
          var c = str.charCodeAt(i);
          if (c <= 127) {
            len++;
          } else if (c <= 2047) {
            len += 2;
          } else if (c >= 55296 && c <= 57343) {
            len += 4;
            ++i;
          } else {
            len += 3;
          }
        }
        return len;
      };
      var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
        if (!(maxBytesToWrite > 0)) return 0;
        var startIdx = outIdx;
        var endIdx = outIdx + maxBytesToWrite - 1;
        for (var i = 0; i < str.length; ++i) {
          var u = str.codePointAt(i);
          if (u <= 127) {
            if (outIdx >= endIdx) break;
            heap[outIdx++] = u;
          } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            heap[outIdx++] = 192 | u >> 6;
            heap[outIdx++] = 128 | u & 63;
          } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            heap[outIdx++] = 224 | u >> 12;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63;
          } else {
            if (outIdx + 3 >= endIdx) break;
            heap[outIdx++] = 240 | u >> 18;
            heap[outIdx++] = 128 | u >> 12 & 63;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63;
            i++;
          }
        }
        heap[outIdx] = 0;
        return outIdx - startIdx;
      };
      var intArrayFromString = (stringy, dontAddNull, length) => {
        var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
        var u8array = new Array(len);
        var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
        if (dontAddNull) u8array.length = numBytesWritten;
        return u8array;
      };
      var FS_stdin_getChar = () => {
        if (!FS_stdin_getChar_buffer.length) {
          var result = null;
          if (typeof window != "undefined" && typeof window.prompt == "function") {
            result = window.prompt("Input: ");
            if (result !== null) {
              result += "\n";
            }
          } else {}
          if (!result) {
            return null;
          }
          FS_stdin_getChar_buffer = intArrayFromString(result, true);
        }
        return FS_stdin_getChar_buffer.shift();
      };
      var TTY = {
        ttys: [],
        init() {},
        shutdown() {},
        register(dev, ops) {
          TTY.ttys[dev] = {
            input: [],
            output: [],
            ops
          };
          FS.registerDevice(dev, TTY.stream_ops);
        },
        stream_ops: {
          open(stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
              throw new FS.ErrnoError(43);
            }
            stream.tty = tty;
            stream.seekable = false;
          },
          close(stream) {
            stream.tty.ops.fsync(stream.tty);
          },
          fsync(stream) {
            stream.tty.ops.fsync(stream.tty);
          },
          read(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
              throw new FS.ErrnoError(60);
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = stream.tty.ops.get_char(stream.tty);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset + i] = result;
            }
            if (bytesRead) {
              stream.node.atime = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
              throw new FS.ErrnoError(60);
            }
            try {
              for (var i = 0; i < length; i++) {
                stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
              }
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (length) {
              stream.node.mtime = stream.node.ctime = Date.now();
            }
            return i;
          }
        },
        default_tty_ops: {
          get_char(tty) {
            return FS_stdin_getChar();
          },
          put_char(tty, val) {
            if (val === null || val === 10) {
              out(UTF8ArrayToString(tty.output));
              tty.output = [];
            } else {
              if (val != 0) tty.output.push(val);
            }
          },
          fsync(tty) {
            if (tty.output?.length > 0) {
              out(UTF8ArrayToString(tty.output));
              tty.output = [];
            }
          },
          ioctl_tcgets(tty) {
            return {
              c_iflag: 25856,
              c_oflag: 5,
              c_cflag: 191,
              c_lflag: 35387,
              c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            };
          },
          ioctl_tcsets(tty, optional_actions, data) {
            return 0;
          },
          ioctl_tiocgwinsz(tty) {
            return [24, 80];
          }
        },
        default_tty1_ops: {
          put_char(tty, val) {
            if (val === null || val === 10) {
              err(UTF8ArrayToString(tty.output));
              tty.output = [];
            } else {
              if (val != 0) tty.output.push(val);
            }
          },
          fsync(tty) {
            if (tty.output?.length > 0) {
              err(UTF8ArrayToString(tty.output));
              tty.output = [];
            }
          }
        }
      };
      var zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);
      var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
      var mmapAlloc = size => {
        size = alignMemory(size, 65536);
        var ptr = _emscripten_builtin_memalign(65536, size);
        if (ptr) zeroMemory(ptr, size);
        return ptr;
      };
      var MEMFS = {
        ops_table: null,
        mount(mount) {
          return MEMFS.createNode(null, "/", 16895, 0);
        },
        createNode(parent, name, mode, dev) {
          if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(63);
          }
          MEMFS.ops_table ||= {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
          var node = FS.createNode(parent, name, mode, dev);
          if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {};
          } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null;
          } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream;
          } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream;
          }
          node.atime = node.mtime = node.ctime = Date.now();
          if (parent) {
            parent.contents[name] = node;
            parent.atime = parent.mtime = parent.ctime = node.atime;
          }
          return node;
        },
        getFileDataAsTypedArray(node) {
          if (!node.contents) return new Uint8Array(0);
          if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
          return new Uint8Array(node.contents);
        },
        expandFileStorage(node, newCapacity) {
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return;
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity);
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
        },
        resizeFileStorage(node, newSize) {
          if (node.usedBytes == newSize) return;
          if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
          } else {
            var oldContents = node.contents;
            node.contents = new Uint8Array(newSize);
            if (oldContents) {
              node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
            }
            node.usedBytes = newSize;
          }
        },
        node_ops: {
          getattr(node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
              attr.size = 4096;
            } else if (FS.isFile(node.mode)) {
              attr.size = node.usedBytes;
            } else if (FS.isLink(node.mode)) {
              attr.size = node.link.length;
            } else {
              attr.size = 0;
            }
            attr.atime = new Date(node.atime);
            attr.mtime = new Date(node.mtime);
            attr.ctime = new Date(node.ctime);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr;
          },
          setattr(node, attr) {
            for (const key of ["mode", "atime", "mtime", "ctime"]) {
              if (attr[key] != null) {
                node[key] = attr[key];
              }
            }
            if (attr.size !== undefined) {
              MEMFS.resizeFileStorage(node, attr.size);
            }
          },
          lookup(parent, name) {
            throw MEMFS.doesNotExistError;
          },
          mknod(parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev);
          },
          rename(old_node, new_dir, new_name) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {}
            if (new_node) {
              if (FS.isDir(old_node.mode)) {
                for (var i in new_node.contents) {
                  throw new FS.ErrnoError(55);
                }
              }
              FS.hashRemoveNode(new_node);
            }
            delete old_node.parent.contents[old_node.name];
            new_dir.contents[new_name] = old_node;
            old_node.name = new_name;
            new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
          },
          unlink(parent, name) {
            delete parent.contents[name];
            parent.ctime = parent.mtime = Date.now();
          },
          rmdir(parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
              throw new FS.ErrnoError(55);
            }
            delete parent.contents[name];
            parent.ctime = parent.mtime = Date.now();
          },
          readdir(node) {
            return [".", "..", ...Object.keys(node.contents)];
          },
          symlink(parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node;
          },
          readlink(node) {
            if (!FS.isLink(node.mode)) {
              throw new FS.ErrnoError(28);
            }
            return node.link;
          }
        },
        stream_ops: {
          read(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            if (size > 8 && contents.subarray) {
              buffer.set(contents.subarray(position, position + size), offset);
            } else {
              for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
            }
            return size;
          },
          write(stream, buffer, offset, length, position, canOwn) {
            if (buffer.buffer === HEAP8.buffer) {
              canOwn = false;
            }
            if (!length) return 0;
            var node = stream.node;
            node.mtime = node.ctime = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
              if (canOwn) {
                node.contents = buffer.subarray(offset, offset + length);
                node.usedBytes = length;
                return length;
              } else if (node.usedBytes === 0 && position === 0) {
                node.contents = buffer.slice(offset, offset + length);
                node.usedBytes = length;
                return length;
              } else if (position + length <= node.usedBytes) {
                node.contents.set(buffer.subarray(offset, offset + length), position);
                return length;
              }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) {
              node.contents.set(buffer.subarray(offset, offset + length), position);
            } else {
              for (var i = 0; i < length; i++) {
                node.contents[position + i] = buffer[offset + i];
              }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length;
          },
          llseek(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
              position += stream.position;
            } else if (whence === 2) {
              if (FS.isFile(stream.node.mode)) {
                position += stream.node.usedBytes;
              }
            }
            if (position < 0) {
              throw new FS.ErrnoError(28);
            }
            return position;
          },
          mmap(stream, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
              throw new FS.ErrnoError(43);
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
              allocated = false;
              ptr = contents.byteOffset;
            } else {
              allocated = true;
              ptr = mmapAlloc(length);
              if (!ptr) {
                throw new FS.ErrnoError(48);
              }
              if (contents) {
                if (position > 0 || position + length < contents.length) {
                  if (contents.subarray) {
                    contents = contents.subarray(position, position + length);
                  } else {
                    contents = Array.prototype.slice.call(contents, position, position + length);
                  }
                }
                HEAP8.set(contents, ptr);
              }
            }
            return {
              ptr,
              allocated
            };
          },
          msync(stream, buffer, offset, length, mmapFlags) {
            MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0;
          }
        }
      };
      var asyncLoad = async url => {
        var arrayBuffer = await readAsync(url);
        return new Uint8Array(arrayBuffer);
      };
      var FS_createDataFile = (...args) => FS.createDataFile(...args);
      var getUniqueRunDependency = id => id;
      var preloadPlugins = [];
      var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
        if (typeof Browser != "undefined") Browser.init();
        var handled = false;
        preloadPlugins.forEach(plugin => {
          if (handled) return;
          if (plugin["canHandle"](fullname)) {
            plugin["handle"](byteArray, fullname, finish, onerror);
            handled = true;
          }
        });
        return handled;
      };
      var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
        var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency(`cp ${fullname}`);
        function processData(byteArray) {
          function finish(byteArray) {
            preFinish?.();
            if (!dontCreateFile) {
              FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            onload?.();
            removeRunDependency(dep);
          }
          if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
            onerror?.();
            removeRunDependency(dep);
          })) {
            return;
          }
          finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == "string") {
          asyncLoad(url).then(processData, onerror);
        } else {
          processData(url);
        }
      };
      var FS_modeStringToFlags = str => {
        var flagModes = {
          r: 0,
          "r+": 2,
          w: 512 | 64 | 1,
          "w+": 512 | 64 | 2,
          a: 1024 | 64 | 1,
          "a+": 1024 | 64 | 2
        };
        var flags = flagModes[str];
        if (typeof flags == "undefined") {
          throw new Error(`Unknown file open mode: ${str}`);
        }
        return flags;
      };
      var FS_getMode = (canRead, canWrite) => {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      };
      var FS = {
        root: null,
        mounts: [],
        devices: {},
        streams: [],
        nextInode: 1,
        nameTable: null,
        currentPath: "/",
        initialized: false,
        ignorePermissions: true,
        filesystems: null,
        syncFSRequests: 0,
        readFiles: {},
        ErrnoError: class {
          name = "ErrnoError";
          constructor(errno) {
            this.errno = errno;
          }
        },
        FSStream: class {
          shared = {};
          get object() {
            return this.node;
          }
          set object(val) {
            this.node = val;
          }
          get isRead() {
            return (this.flags & 2097155) !== 1;
          }
          get isWrite() {
            return (this.flags & 2097155) !== 0;
          }
          get isAppend() {
            return this.flags & 1024;
          }
          get flags() {
            return this.shared.flags;
          }
          set flags(val) {
            this.shared.flags = val;
          }
          get position() {
            return this.shared.position;
          }
          set position(val) {
            this.shared.position = val;
          }
        },
        FSNode: class {
          node_ops = {};
          stream_ops = {};
          readMode = 292 | 73;
          writeMode = 146;
          mounted = null;
          constructor(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.rdev = rdev;
            this.atime = this.mtime = this.ctime = Date.now();
          }
          get read() {
            return (this.mode & this.readMode) === this.readMode;
          }
          set read(val) {
            val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
          }
          get write() {
            return (this.mode & this.writeMode) === this.writeMode;
          }
          set write(val) {
            val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
          }
          get isFolder() {
            return FS.isDir(this.mode);
          }
          get isDevice() {
            return FS.isChrdev(this.mode);
          }
        },
        lookupPath(path, opts = {}) {
          if (!path) {
            throw new FS.ErrnoError(44);
          }
          opts.follow_mount ??= true;
          if (!PATH.isAbs(path)) {
            path = FS.cwd() + "/" + path;
          }
          linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
            var parts = path.split("/").filter(p => !!p);
            var current = FS.root;
            var current_path = "/";
            for (var i = 0; i < parts.length; i++) {
              var islast = i === parts.length - 1;
              if (islast && opts.parent) {
                break;
              }
              if (parts[i] === ".") {
                continue;
              }
              if (parts[i] === "..") {
                current_path = PATH.dirname(current_path);
                if (FS.isRoot(current)) {
                  path = current_path + "/" + parts.slice(i + 1).join("/");
                  continue linkloop;
                } else {
                  current = current.parent;
                }
                continue;
              }
              current_path = PATH.join2(current_path, parts[i]);
              try {
                current = FS.lookupNode(current, parts[i]);
              } catch (e) {
                if (e?.errno === 44 && islast && opts.noent_okay) {
                  return {
                    path: current_path
                  };
                }
                throw e;
              }
              if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
                current = current.mounted.root;
              }
              if (FS.isLink(current.mode) && (!islast || opts.follow)) {
                if (!current.node_ops.readlink) {
                  throw new FS.ErrnoError(52);
                }
                var link = current.node_ops.readlink(current);
                if (!PATH.isAbs(link)) {
                  link = PATH.dirname(current_path) + "/" + link;
                }
                path = link + "/" + parts.slice(i + 1).join("/");
                continue linkloop;
              }
            }
            return {
              path: current_path,
              node: current
            };
          }
          throw new FS.ErrnoError(32);
        },
        getPath(node) {
          var path;
          while (true) {
            if (FS.isRoot(node)) {
              var mount = node.mount.mountpoint;
              if (!path) return mount;
              return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path;
            }
            path = path ? `${node.name}/${path}` : node.name;
            node = node.parent;
          }
        },
        hashName(parentid, name) {
          var hash = 0;
          for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i) | 0;
          }
          return (parentid + hash >>> 0) % FS.nameTable.length;
        },
        hashAddNode(node) {
          var hash = FS.hashName(node.parent.id, node.name);
          node.name_next = FS.nameTable[hash];
          FS.nameTable[hash] = node;
        },
        hashRemoveNode(node) {
          var hash = FS.hashName(node.parent.id, node.name);
          if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next;
          } else {
            var current = FS.nameTable[hash];
            while (current) {
              if (current.name_next === node) {
                current.name_next = node.name_next;
                break;
              }
              current = current.name_next;
            }
          }
        },
        lookupNode(parent, name) {
          var errCode = FS.mayLookup(parent);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          var hash = FS.hashName(parent.id, name);
          for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
              return node;
            }
          }
          return FS.lookup(parent, name);
        },
        createNode(parent, name, mode, rdev) {
          var node = new FS.FSNode(parent, name, mode, rdev);
          FS.hashAddNode(node);
          return node;
        },
        destroyNode(node) {
          FS.hashRemoveNode(node);
        },
        isRoot(node) {
          return node === node.parent;
        },
        isMountpoint(node) {
          return !!node.mounted;
        },
        isFile(mode) {
          return (mode & 61440) === 32768;
        },
        isDir(mode) {
          return (mode & 61440) === 16384;
        },
        isLink(mode) {
          return (mode & 61440) === 40960;
        },
        isChrdev(mode) {
          return (mode & 61440) === 8192;
        },
        isBlkdev(mode) {
          return (mode & 61440) === 24576;
        },
        isFIFO(mode) {
          return (mode & 61440) === 4096;
        },
        isSocket(mode) {
          return (mode & 49152) === 49152;
        },
        flagsToPermissionString(flag) {
          var perms = ["r", "w", "rw"][flag & 3];
          if (flag & 512) {
            perms += "w";
          }
          return perms;
        },
        nodePermissions(node, perms) {
          if (FS.ignorePermissions) {
            return 0;
          }
          if (perms.includes("r") && !(node.mode & 292)) {
            return 2;
          } else if (perms.includes("w") && !(node.mode & 146)) {
            return 2;
          } else if (perms.includes("x") && !(node.mode & 73)) {
            return 2;
          }
          return 0;
        },
        mayLookup(dir) {
          if (!FS.isDir(dir.mode)) return 54;
          var errCode = FS.nodePermissions(dir, "x");
          if (errCode) return errCode;
          if (!dir.node_ops.lookup) return 2;
          return 0;
        },
        mayCreate(dir, name) {
          if (!FS.isDir(dir.mode)) {
            return 54;
          }
          try {
            var node = FS.lookupNode(dir, name);
            return 20;
          } catch (e) {}
          return FS.nodePermissions(dir, "wx");
        },
        mayDelete(dir, name, isdir) {
          var node;
          try {
            node = FS.lookupNode(dir, name);
          } catch (e) {
            return e.errno;
          }
          var errCode = FS.nodePermissions(dir, "wx");
          if (errCode) {
            return errCode;
          }
          if (isdir) {
            if (!FS.isDir(node.mode)) {
              return 54;
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
              return 10;
            }
          } else {
            if (FS.isDir(node.mode)) {
              return 31;
            }
          }
          return 0;
        },
        mayOpen(node, flags) {
          if (!node) {
            return 44;
          }
          if (FS.isLink(node.mode)) {
            return 32;
          } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & (512 | 64)) {
              return 31;
            }
          }
          return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
        },
        checkOpExists(op, err) {
          if (!op) {
            throw new FS.ErrnoError(err);
          }
          return op;
        },
        MAX_OPEN_FDS: 4096,
        nextfd() {
          for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
            if (!FS.streams[fd]) {
              return fd;
            }
          }
          throw new FS.ErrnoError(33);
        },
        getStreamChecked(fd) {
          var stream = FS.getStream(fd);
          if (!stream) {
            throw new FS.ErrnoError(8);
          }
          return stream;
        },
        getStream: fd => FS.streams[fd],
        createStream(stream, fd = -1) {
          stream = Object.assign(new FS.FSStream(), stream);
          if (fd == -1) {
            fd = FS.nextfd();
          }
          stream.fd = fd;
          FS.streams[fd] = stream;
          return stream;
        },
        closeStream(fd) {
          FS.streams[fd] = null;
        },
        dupStream(origStream, fd = -1) {
          var stream = FS.createStream(origStream, fd);
          stream.stream_ops?.dup?.(stream);
          return stream;
        },
        doSetAttr(stream, node, attr) {
          var setattr = stream?.stream_ops.setattr;
          var arg = setattr ? stream : node;
          setattr ??= node.node_ops.setattr;
          FS.checkOpExists(setattr, 63);
          setattr(arg, attr);
        },
        chrdev_stream_ops: {
          open(stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            stream.stream_ops.open?.(stream);
          },
          llseek() {
            throw new FS.ErrnoError(70);
          }
        },
        major: dev => dev >> 8,
        minor: dev => dev & 255,
        makedev: (ma, mi) => ma << 8 | mi,
        registerDevice(dev, ops) {
          FS.devices[dev] = {
            stream_ops: ops
          };
        },
        getDevice: dev => FS.devices[dev],
        getMounts(mount) {
          var mounts = [];
          var check = [mount];
          while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push(...m.mounts);
          }
          return mounts;
        },
        syncfs(populate, callback) {
          if (typeof populate == "function") {
            callback = populate;
            populate = false;
          }
          FS.syncFSRequests++;
          if (FS.syncFSRequests > 1) {
            err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
          }
          var mounts = FS.getMounts(FS.root.mount);
          var completed = 0;
          function doCallback(errCode) {
            FS.syncFSRequests--;
            return callback(errCode);
          }
          function done(errCode) {
            if (errCode) {
              if (!done.errored) {
                done.errored = true;
                return doCallback(errCode);
              }
              return;
            }
            if (++completed >= mounts.length) {
              doCallback(null);
            }
          }
          mounts.forEach(mount => {
            if (!mount.type.syncfs) {
              return done(null);
            }
            mount.type.syncfs(mount, populate, done);
          });
        },
        mount(type, opts, mountpoint) {
          var root = mountpoint === "/";
          var pseudo = !mountpoint;
          var node;
          if (root && FS.root) {
            throw new FS.ErrnoError(10);
          } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, {
              follow_mount: false
            });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
              throw new FS.ErrnoError(10);
            }
            if (!FS.isDir(node.mode)) {
              throw new FS.ErrnoError(54);
            }
          }
          var mount = {
            type,
            opts,
            mountpoint,
            mounts: []
          };
          var mountRoot = type.mount(mount);
          mountRoot.mount = mount;
          mount.root = mountRoot;
          if (root) {
            FS.root = mountRoot;
          } else if (node) {
            node.mounted = mount;
            if (node.mount) {
              node.mount.mounts.push(mount);
            }
          }
          return mountRoot;
        },
        unmount(mountpoint) {
          var lookup = FS.lookupPath(mountpoint, {
            follow_mount: false
          });
          if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(28);
          }
          var node = lookup.node;
          var mount = node.mounted;
          var mounts = FS.getMounts(mount);
          Object.keys(FS.nameTable).forEach(hash => {
            var current = FS.nameTable[hash];
            while (current) {
              var next = current.name_next;
              if (mounts.includes(current.mount)) {
                FS.destroyNode(current);
              }
              current = next;
            }
          });
          node.mounted = null;
          var idx = node.mount.mounts.indexOf(mount);
          node.mount.mounts.splice(idx, 1);
        },
        lookup(parent, name) {
          return parent.node_ops.lookup(parent, name);
        },
        mknod(path, mode, dev) {
          var lookup = FS.lookupPath(path, {
            parent: true
          });
          var parent = lookup.node;
          var name = PATH.basename(path);
          if (!name) {
            throw new FS.ErrnoError(28);
          }
          if (name === "." || name === "..") {
            throw new FS.ErrnoError(20);
          }
          var errCode = FS.mayCreate(parent, name);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(63);
          }
          return parent.node_ops.mknod(parent, name, mode, dev);
        },
        statfs(path) {
          return FS.statfsNode(FS.lookupPath(path, {
            follow: true
          }).node);
        },
        statfsStream(stream) {
          return FS.statfsNode(stream.node);
        },
        statfsNode(node) {
          var rtn = {
            bsize: 4096,
            frsize: 4096,
            blocks: 1e6,
            bfree: 5e5,
            bavail: 5e5,
            files: FS.nextInode,
            ffree: FS.nextInode - 1,
            fsid: 42,
            flags: 2,
            namelen: 255
          };
          if (node.node_ops.statfs) {
            Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
          }
          return rtn;
        },
        create(path, mode = 438) {
          mode &= 4095;
          mode |= 32768;
          return FS.mknod(path, mode, 0);
        },
        mkdir(path, mode = 511) {
          mode &= 511 | 512;
          mode |= 16384;
          return FS.mknod(path, mode, 0);
        },
        mkdirTree(path, mode) {
          var dirs = path.split("/");
          var d = "";
          for (var dir of dirs) {
            if (!dir) continue;
            if (d || PATH.isAbs(path)) d += "/";
            d += dir;
            try {
              FS.mkdir(d, mode);
            } catch (e) {
              if (e.errno != 20) throw e;
            }
          }
        },
        mkdev(path, mode, dev) {
          if (typeof dev == "undefined") {
            dev = mode;
            mode = 438;
          }
          mode |= 8192;
          return FS.mknod(path, mode, dev);
        },
        symlink(oldpath, newpath) {
          if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(44);
          }
          var lookup = FS.lookupPath(newpath, {
            parent: true
          });
          var parent = lookup.node;
          if (!parent) {
            throw new FS.ErrnoError(44);
          }
          var newname = PATH.basename(newpath);
          var errCode = FS.mayCreate(parent, newname);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(63);
          }
          return parent.node_ops.symlink(parent, newname, oldpath);
        },
        rename(old_path, new_path) {
          var old_dirname = PATH.dirname(old_path);
          var new_dirname = PATH.dirname(new_path);
          var old_name = PATH.basename(old_path);
          var new_name = PATH.basename(new_path);
          var lookup, old_dir, new_dir;
          lookup = FS.lookupPath(old_path, {
            parent: true
          });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, {
            parent: true
          });
          new_dir = lookup.node;
          if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
          if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(75);
          }
          var old_node = FS.lookupNode(old_dir, old_name);
          var relative = PATH_FS.relative(old_path, new_dirname);
          if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(28);
          }
          relative = PATH_FS.relative(new_path, old_dirname);
          if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(55);
          }
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (old_node === new_node) {
            return;
          }
          var isdir = FS.isDir(old_node.mode);
          var errCode = FS.mayDelete(old_dir, old_name, isdir);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(10);
          }
          if (new_dir !== old_dir) {
            errCode = FS.nodePermissions(old_dir, "w");
            if (errCode) {
              throw new FS.ErrnoError(errCode);
            }
          }
          FS.hashRemoveNode(old_node);
          try {
            old_dir.node_ops.rename(old_node, new_dir, new_name);
            old_node.parent = new_dir;
          } catch (e) {
            throw e;
          } finally {
            FS.hashAddNode(old_node);
          }
        },
        rmdir(path) {
          var lookup = FS.lookupPath(path, {
            parent: true
          });
          var parent = lookup.node;
          var name = PATH.basename(path);
          var node = FS.lookupNode(parent, name);
          var errCode = FS.mayDelete(parent, name, true);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          parent.node_ops.rmdir(parent, name);
          FS.destroyNode(node);
        },
        readdir(path) {
          var lookup = FS.lookupPath(path, {
            follow: true
          });
          var node = lookup.node;
          var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
          return readdir(node);
        },
        unlink(path) {
          var lookup = FS.lookupPath(path, {
            parent: true
          });
          var parent = lookup.node;
          if (!parent) {
            throw new FS.ErrnoError(44);
          }
          var name = PATH.basename(path);
          var node = FS.lookupNode(parent, name);
          var errCode = FS.mayDelete(parent, name, false);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          parent.node_ops.unlink(parent, name);
          FS.destroyNode(node);
        },
        readlink(path) {
          var lookup = FS.lookupPath(path);
          var link = lookup.node;
          if (!link) {
            throw new FS.ErrnoError(44);
          }
          if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(28);
          }
          return link.node_ops.readlink(link);
        },
        stat(path, dontFollow) {
          var lookup = FS.lookupPath(path, {
            follow: !dontFollow
          });
          var node = lookup.node;
          var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
          return getattr(node);
        },
        fstat(fd) {
          var stream = FS.getStreamChecked(fd);
          var node = stream.node;
          var getattr = stream.stream_ops.getattr;
          var arg = getattr ? stream : node;
          getattr ??= node.node_ops.getattr;
          FS.checkOpExists(getattr, 63);
          return getattr(arg);
        },
        lstat(path) {
          return FS.stat(path, true);
        },
        doChmod(stream, node, mode, dontFollow) {
          FS.doSetAttr(stream, node, {
            mode: mode & 4095 | node.mode & ~4095,
            ctime: Date.now(),
            dontFollow
          });
        },
        chmod(path, mode, dontFollow) {
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
              follow: !dontFollow
            });
            node = lookup.node;
          } else {
            node = path;
          }
          FS.doChmod(null, node, mode, dontFollow);
        },
        lchmod(path, mode) {
          FS.chmod(path, mode, true);
        },
        fchmod(fd, mode) {
          var stream = FS.getStreamChecked(fd);
          FS.doChmod(stream, stream.node, mode, false);
        },
        doChown(stream, node, dontFollow) {
          FS.doSetAttr(stream, node, {
            timestamp: Date.now(),
            dontFollow
          });
        },
        chown(path, uid, gid, dontFollow) {
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
              follow: !dontFollow
            });
            node = lookup.node;
          } else {
            node = path;
          }
          FS.doChown(null, node, dontFollow);
        },
        lchown(path, uid, gid) {
          FS.chown(path, uid, gid, true);
        },
        fchown(fd, uid, gid) {
          var stream = FS.getStreamChecked(fd);
          FS.doChown(stream, stream.node, false);
        },
        doTruncate(stream, node, len) {
          if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          var errCode = FS.nodePermissions(node, "w");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          FS.doSetAttr(stream, node, {
            size: len,
            timestamp: Date.now()
          });
        },
        truncate(path, len) {
          if (len < 0) {
            throw new FS.ErrnoError(28);
          }
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, {
              follow: true
            });
            node = lookup.node;
          } else {
            node = path;
          }
          FS.doTruncate(null, node, len);
        },
        ftruncate(fd, len) {
          var stream = FS.getStreamChecked(fd);
          if (len < 0 || (stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(28);
          }
          FS.doTruncate(stream, stream.node, len);
        },
        utime(path, atime, mtime) {
          var lookup = FS.lookupPath(path, {
            follow: true
          });
          var node = lookup.node;
          var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
          setattr(node, {
            atime,
            mtime
          });
        },
        open(path, flags, mode = 438) {
          if (path === "") {
            throw new FS.ErrnoError(44);
          }
          flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
          if (flags & 64) {
            mode = mode & 4095 | 32768;
          } else {
            mode = 0;
          }
          var node;
          var isDirPath;
          if (typeof path == "object") {
            node = path;
          } else {
            isDirPath = path.endsWith("/");
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072),
              noent_okay: true
            });
            node = lookup.node;
            path = lookup.path;
          }
          var created = false;
          if (flags & 64) {
            if (node) {
              if (flags & 128) {
                throw new FS.ErrnoError(20);
              }
            } else if (isDirPath) {
              throw new FS.ErrnoError(31);
            } else {
              node = FS.mknod(path, mode | 511, 0);
              created = true;
            }
          }
          if (!node) {
            throw new FS.ErrnoError(44);
          }
          if (FS.isChrdev(node.mode)) {
            flags &= ~512;
          }
          if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
          if (!created) {
            var errCode = FS.mayOpen(node, flags);
            if (errCode) {
              throw new FS.ErrnoError(errCode);
            }
          }
          if (flags & 512 && !created) {
            FS.truncate(node, 0);
          }
          flags &= ~(128 | 512 | 131072);
          var stream = FS.createStream({
            node,
            path: FS.getPath(node),
            flags,
            seekable: true,
            position: 0,
            stream_ops: node.stream_ops,
            ungotten: [],
            error: false
          });
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
          if (created) {
            FS.chmod(node, mode & 511);
          }
          if (Module["logReadFiles"] && !(flags & 1)) {
            if (!(path in FS.readFiles)) {
              FS.readFiles[path] = 1;
            }
          }
          return stream;
        },
        close(stream) {
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if (stream.getdents) stream.getdents = null;
          try {
            if (stream.stream_ops.close) {
              stream.stream_ops.close(stream);
            }
          } catch (e) {
            throw e;
          } finally {
            FS.closeStream(stream.fd);
          }
          stream.fd = null;
        },
        isClosed(stream) {
          return stream.fd === null;
        },
        llseek(stream, offset, whence) {
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(70);
          }
          if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(28);
          }
          stream.position = stream.stream_ops.llseek(stream, offset, whence);
          stream.ungotten = [];
          return stream.position;
        },
        read(stream, buffer, offset, length, position) {
          if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28);
          }
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(8);
          }
          if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(28);
          }
          var seeking = typeof position != "undefined";
          if (!seeking) {
            position = stream.position;
          } else if (!stream.seekable) {
            throw new FS.ErrnoError(70);
          }
          var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
          if (!seeking) stream.position += bytesRead;
          return bytesRead;
        },
        write(stream, buffer, offset, length, position, canOwn) {
          if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28);
          }
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8);
          }
          if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(28);
          }
          if (stream.seekable && stream.flags & 1024) {
            FS.llseek(stream, 0, 2);
          }
          var seeking = typeof position != "undefined";
          if (!seeking) {
            position = stream.position;
          } else if (!stream.seekable) {
            throw new FS.ErrnoError(70);
          }
          var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
          if (!seeking) stream.position += bytesWritten;
          return bytesWritten;
        },
        mmap(stream, length, position, prot, flags) {
          if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(2);
          }
          if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(2);
          }
          if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(43);
          }
          if (!length) {
            throw new FS.ErrnoError(28);
          }
          return stream.stream_ops.mmap(stream, length, position, prot, flags);
        },
        msync(stream, buffer, offset, length, mmapFlags) {
          if (!stream.stream_ops.msync) {
            return 0;
          }
          return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
        },
        ioctl(stream, cmd, arg) {
          if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(59);
          }
          return stream.stream_ops.ioctl(stream, cmd, arg);
        },
        readFile(path, opts = {}) {
          opts.flags = opts.flags || 0;
          opts.encoding = opts.encoding || "binary";
          if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error(`Invalid encoding type "${opts.encoding}"`);
          }
          var stream = FS.open(path, opts.flags);
          var stat = FS.stat(path);
          var length = stat.size;
          var buf = new Uint8Array(length);
          FS.read(stream, buf, 0, length, 0);
          if (opts.encoding === "utf8") {
            buf = UTF8ArrayToString(buf);
          }
          FS.close(stream);
          return buf;
        },
        writeFile(path, data, opts = {}) {
          opts.flags = opts.flags || 577;
          var stream = FS.open(path, opts.flags, opts.mode);
          if (typeof data == "string") {
            data = new Uint8Array(intArrayFromString(data, true));
          }
          if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
          } else {
            throw new Error("Unsupported data type");
          }
          FS.close(stream);
        },
        cwd: () => FS.currentPath,
        chdir(path) {
          var lookup = FS.lookupPath(path, {
            follow: true
          });
          if (lookup.node === null) {
            throw new FS.ErrnoError(44);
          }
          if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(54);
          }
          var errCode = FS.nodePermissions(lookup.node, "x");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          FS.currentPath = lookup.path;
        },
        createDefaultDirectories() {
          FS.mkdir("/tmp");
          FS.mkdir("/home");
          FS.mkdir("/home/web_user");
        },
        createDefaultDevices() {
          FS.mkdir("/dev");
          FS.registerDevice(FS.makedev(1, 3), {
            read: () => 0,
            write: (stream, buffer, offset, length, pos) => length,
            llseek: () => 0
          });
          FS.mkdev("/dev/null", FS.makedev(1, 3));
          TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
          TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
          FS.mkdev("/dev/tty", FS.makedev(5, 0));
          FS.mkdev("/dev/tty1", FS.makedev(6, 0));
          var randomBuffer = new Uint8Array(1024),
            randomLeft = 0;
          var randomByte = () => {
            if (randomLeft === 0) {
              randomFill(randomBuffer);
              randomLeft = randomBuffer.byteLength;
            }
            return randomBuffer[--randomLeft];
          };
          FS.createDevice("/dev", "random", randomByte);
          FS.createDevice("/dev", "urandom", randomByte);
          FS.mkdir("/dev/shm");
          FS.mkdir("/dev/shm/tmp");
        },
        createSpecialDirectories() {
          FS.mkdir("/proc");
          var proc_self = FS.mkdir("/proc/self");
          FS.mkdir("/proc/self/fd");
          FS.mount({
            mount() {
              var node = FS.createNode(proc_self, "fd", 16895, 73);
              node.stream_ops = {
                llseek: MEMFS.stream_ops.llseek
              };
              node.node_ops = {
                lookup(parent, name) {
                  var fd = +name;
                  var stream = FS.getStreamChecked(fd);
                  var ret = {
                    parent: null,
                    mount: {
                      mountpoint: "fake"
                    },
                    node_ops: {
                      readlink: () => stream.path
                    },
                    id: fd + 1
                  };
                  ret.parent = ret;
                  return ret;
                },
                readdir() {
                  return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString());
                }
              };
              return node;
            }
          }, {}, "/proc/self/fd");
        },
        createStandardStreams(input, output, error) {
          if (input) {
            FS.createDevice("/dev", "stdin", input);
          } else {
            FS.symlink("/dev/tty", "/dev/stdin");
          }
          if (output) {
            FS.createDevice("/dev", "stdout", null, output);
          } else {
            FS.symlink("/dev/tty", "/dev/stdout");
          }
          if (error) {
            FS.createDevice("/dev", "stderr", null, error);
          } else {
            FS.symlink("/dev/tty1", "/dev/stderr");
          }
          var stdin = FS.open("/dev/stdin", 0);
          var stdout = FS.open("/dev/stdout", 1);
          var stderr = FS.open("/dev/stderr", 1);
        },
        staticInit() {
          FS.nameTable = new Array(4096);
          FS.mount(MEMFS, {}, "/");
          FS.createDefaultDirectories();
          FS.createDefaultDevices();
          FS.createSpecialDirectories();
          FS.filesystems = {
            MEMFS
          };
        },
        init(input, output, error) {
          FS.initialized = true;
          input ??= Module["stdin"];
          output ??= Module["stdout"];
          error ??= Module["stderr"];
          FS.createStandardStreams(input, output, error);
        },
        quit() {
          FS.initialized = false;
          for (var stream of FS.streams) {
            if (stream) {
              FS.close(stream);
            }
          }
        },
        findObject(path, dontResolveLastLink) {
          var ret = FS.analyzePath(path, dontResolveLastLink);
          if (!ret.exists) {
            return null;
          }
          return ret.object;
        },
        analyzePath(path, dontResolveLastLink) {
          try {
            var lookup = FS.lookupPath(path, {
              follow: !dontResolveLastLink
            });
            path = lookup.path;
          } catch (e) {}
          var ret = {
            isRoot: false,
            exists: false,
            error: 0,
            name: null,
            path: null,
            object: null,
            parentExists: false,
            parentPath: null,
            parentObject: null
          };
          try {
            var lookup = FS.lookupPath(path, {
              parent: true
            });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, {
              follow: !dontResolveLastLink
            });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/";
          } catch (e) {
            ret.error = e.errno;
          }
          return ret;
        },
        createPath(parent, path, canRead, canWrite) {
          parent = typeof parent == "string" ? parent : FS.getPath(parent);
          var parts = path.split("/").reverse();
          while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
              FS.mkdir(current);
            } catch (e) {
              if (e.errno != 20) throw e;
            }
            parent = current;
          }
          return current;
        },
        createFile(parent, name, properties, canRead, canWrite) {
          var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
          var mode = FS_getMode(canRead, canWrite);
          return FS.create(path, mode);
        },
        createDataFile(parent, name, data, canRead, canWrite, canOwn) {
          var path = name;
          if (parent) {
            parent = typeof parent == "string" ? parent : FS.getPath(parent);
            path = name ? PATH.join2(parent, name) : parent;
          }
          var mode = FS_getMode(canRead, canWrite);
          var node = FS.create(path, mode);
          if (data) {
            if (typeof data == "string") {
              var arr = new Array(data.length);
              for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
              data = arr;
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, 577);
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode);
          }
        },
        createDevice(parent, name, input, output) {
          var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
          var mode = FS_getMode(!!input, !!output);
          FS.createDevice.major ??= 64;
          var dev = FS.makedev(FS.createDevice.major++, 0);
          FS.registerDevice(dev, {
            open(stream) {
              stream.seekable = false;
            },
            close(stream) {
              if (output?.buffer?.length) {
                output(10);
              }
            },
            read(stream, buffer, offset, length, pos) {
              var bytesRead = 0;
              for (var i = 0; i < length; i++) {
                var result;
                try {
                  result = input();
                } catch (e) {
                  throw new FS.ErrnoError(29);
                }
                if (result === undefined && bytesRead === 0) {
                  throw new FS.ErrnoError(6);
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result;
              }
              if (bytesRead) {
                stream.node.atime = Date.now();
              }
              return bytesRead;
            },
            write(stream, buffer, offset, length, pos) {
              for (var i = 0; i < length; i++) {
                try {
                  output(buffer[offset + i]);
                } catch (e) {
                  throw new FS.ErrnoError(29);
                }
              }
              if (length) {
                stream.node.mtime = stream.node.ctime = Date.now();
              }
              return i;
            }
          });
          return FS.mkdev(path, mode, dev);
        },
        forceLoadFile(obj) {
          if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
          if (typeof XMLHttpRequest != "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
          } else {
            try {
              obj.contents = readBinary(obj.url);
              obj.usedBytes = obj.contents.length;
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
          }
        },
        createLazyFile(parent, name, url, canRead, canWrite) {
          class LazyUint8Array {
            lengthKnown = false;
            chunks = [];
            get(idx) {
              if (idx > this.length - 1 || idx < 0) {
                return undefined;
              }
              var chunkOffset = idx % this.chunkSize;
              var chunkNum = idx / this.chunkSize | 0;
              return this.getter(chunkNum)[chunkOffset];
            }
            setDataGetter(getter) {
              this.getter = getter;
            }
            cacheLength() {
              var xhr = new XMLHttpRequest();
              xhr.open("HEAD", url, false);
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
              var datalength = Number(xhr.getResponseHeader("Content-length"));
              var header;
              var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
              var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
              var chunkSize = 1024 * 1024;
              if (!hasByteServing) chunkSize = datalength;
              var doXHR = (from, to) => {
                if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, false);
                if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                  xhr.overrideMimeType("text/plain; charset=x-user-defined");
                }
                xhr.send(null);
                if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                  return new Uint8Array(xhr.response || []);
                }
                return intArrayFromString(xhr.responseText || "", true);
              };
              var lazyArray = this;
              lazyArray.setDataGetter(chunkNum => {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] == "undefined") {
                  lazyArray.chunks[chunkNum] = doXHR(start, end);
                }
                if (typeof lazyArray.chunks[chunkNum] == "undefined") throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum];
              });
              if (usesGzip || !datalength) {
                chunkSize = datalength = 1;
                datalength = this.getter(0).length;
                chunkSize = datalength;
                out("LazyFiles on gzip forces download of the whole file when length is accessed");
              }
              this._length = datalength;
              this._chunkSize = chunkSize;
              this.lengthKnown = true;
            }
            get length() {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._length;
            }
            get chunkSize() {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._chunkSize;
            }
          }
          if (typeof XMLHttpRequest != "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array();
            var properties = {
              isDevice: false,
              contents: lazyArray
            };
          } else {
            var properties = {
              isDevice: false,
              url
            };
          }
          var node = FS.createFile(parent, name, properties, canRead, canWrite);
          if (properties.contents) {
            node.contents = properties.contents;
          } else if (properties.url) {
            node.contents = null;
            node.url = properties.url;
          }
          Object.defineProperties(node, {
            usedBytes: {
              get: function () {
                return this.contents.length;
              }
            }
          });
          var stream_ops = {};
          var keys = Object.keys(node.stream_ops);
          keys.forEach(key => {
            var fn = node.stream_ops[key];
            stream_ops[key] = (...args) => {
              FS.forceLoadFile(node);
              return fn(...args);
            };
          });
          function writeChunks(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
              for (var i = 0; i < size; i++) {
                buffer[offset + i] = contents[position + i];
              }
            } else {
              for (var i = 0; i < size; i++) {
                buffer[offset + i] = contents.get(position + i);
              }
            }
            return size;
          }
          stream_ops.read = (stream, buffer, offset, length, position) => {
            FS.forceLoadFile(node);
            return writeChunks(stream, buffer, offset, length, position);
          };
          stream_ops.mmap = (stream, length, position, prot, flags) => {
            FS.forceLoadFile(node);
            var ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            writeChunks(stream, HEAP8, ptr, length, position);
            return {
              ptr,
              allocated: true
            };
          };
          node.stream_ops = stream_ops;
          return node;
        }
      };
      var SYSCALLS = {
        DEFAULT_POLLMASK: 5,
        calculateAt(dirfd, path, allowEmpty) {
          if (PATH.isAbs(path)) {
            return path;
          }
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = SYSCALLS.getStreamFromFD(dirfd);
            dir = dirstream.path;
          }
          if (path.length == 0) {
            if (!allowEmpty) {
              throw new FS.ErrnoError(44);
            }
            return dir;
          }
          return dir + "/" + path;
        },
        writeStat(buf, stat) {
          HEAP32[buf >> 2] = stat.dev;
          HEAP32[buf + 4 >> 2] = stat.mode;
          HEAPU32[buf + 8 >> 2] = stat.nlink;
          HEAP32[buf + 12 >> 2] = stat.uid;
          HEAP32[buf + 16 >> 2] = stat.gid;
          HEAP32[buf + 20 >> 2] = stat.rdev;
          tempI64 = [stat.size >>> 0, (tempDouble = stat.size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 24 >> 2] = tempI64[0], HEAP32[buf + 28 >> 2] = tempI64[1];
          HEAP32[buf + 32 >> 2] = 4096;
          HEAP32[buf + 36 >> 2] = stat.blocks;
          var atime = stat.atime.getTime();
          var mtime = stat.mtime.getTime();
          var ctime = stat.ctime.getTime();
          tempI64 = [Math.floor(atime / 1e3) >>> 0, (tempDouble = Math.floor(atime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 40 >> 2] = tempI64[0], HEAP32[buf + 44 >> 2] = tempI64[1];
          HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
          tempI64 = [Math.floor(mtime / 1e3) >>> 0, (tempDouble = Math.floor(mtime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 56 >> 2] = tempI64[0], HEAP32[buf + 60 >> 2] = tempI64[1];
          HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
          tempI64 = [Math.floor(ctime / 1e3) >>> 0, (tempDouble = Math.floor(ctime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 72 >> 2] = tempI64[0], HEAP32[buf + 76 >> 2] = tempI64[1];
          HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
          tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 88 >> 2] = tempI64[0], HEAP32[buf + 92 >> 2] = tempI64[1];
          return 0;
        },
        writeStatFs(buf, stats) {
          HEAP32[buf + 4 >> 2] = stats.bsize;
          HEAP32[buf + 40 >> 2] = stats.bsize;
          HEAP32[buf + 8 >> 2] = stats.blocks;
          HEAP32[buf + 12 >> 2] = stats.bfree;
          HEAP32[buf + 16 >> 2] = stats.bavail;
          HEAP32[buf + 20 >> 2] = stats.files;
          HEAP32[buf + 24 >> 2] = stats.ffree;
          HEAP32[buf + 28 >> 2] = stats.fsid;
          HEAP32[buf + 44 >> 2] = stats.flags;
          HEAP32[buf + 36 >> 2] = stats.namelen;
        },
        doMsync(addr, stream, len, flags, offset) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          if (flags & 2) {
            return 0;
          }
          var buffer = HEAPU8.slice(addr, addr + len);
          FS.msync(stream, buffer, offset, len, flags);
        },
        getStreamFromFD(fd) {
          var stream = FS.getStreamChecked(fd);
          return stream;
        },
        varargs: undefined,
        getStr(ptr) {
          var ret = UTF8ToString(ptr);
          return ret;
        }
      };
      function ___syscall_chmod(path, mode) {
        try {
          path = SYSCALLS.getStr(path);
          FS.chmod(path, mode);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_faccessat(dirfd, path, amode, flags) {
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path);
          if (amode & ~7) {
            return -28;
          }
          var lookup = FS.lookupPath(path, {
            follow: true
          });
          var node = lookup.node;
          if (!node) {
            return -44;
          }
          var perms = "";
          if (amode & 4) perms += "r";
          if (amode & 2) perms += "w";
          if (amode & 1) perms += "x";
          if (perms && FS.nodePermissions(node, perms)) {
            return -2;
          }
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_fchmod(fd, mode) {
        try {
          FS.fchmod(fd, mode);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_fchown32(fd, owner, group) {
        try {
          FS.fchown(fd, owner, group);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var syscallGetVarargI = () => {
        var ret = HEAP32[+SYSCALLS.varargs >> 2];
        SYSCALLS.varargs += 4;
        return ret;
      };
      var syscallGetVarargP = syscallGetVarargI;
      function ___syscall_fcntl64(fd, cmd, varargs) {
        SYSCALLS.varargs = varargs;
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          switch (cmd) {
            case 0:
              {
                var arg = syscallGetVarargI();
                if (arg < 0) {
                  return -28;
                }
                while (FS.streams[arg]) {
                  arg++;
                }
                var newStream;
                newStream = FS.dupStream(stream, arg);
                return newStream.fd;
              }
            case 1:
            case 2:
              return 0;
            case 3:
              return stream.flags;
            case 4:
              {
                var arg = syscallGetVarargI();
                stream.flags |= arg;
                return 0;
              }
            case 12:
              {
                var arg = syscallGetVarargP();
                var offset = 0;
                HEAP16[arg + offset >> 1] = 2;
                return 0;
              }
            case 13:
            case 14:
              return 0;
          }
          return -28;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_fstat64(fd, buf) {
        try {
          return SYSCALLS.writeStat(buf, FS.fstat(fd));
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var convertI32PairToI53Checked = (lo, hi) => hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
      function ___syscall_ftruncate64(fd, length_low, length_high) {
        var length = convertI32PairToI53Checked(length_low, length_high);
        try {
          if (isNaN(length)) return -61;
          FS.ftruncate(fd, length);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
      function ___syscall_getcwd(buf, size) {
        try {
          if (size === 0) return -28;
          var cwd = FS.cwd();
          var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
          if (size < cwdLengthInBytes) return -68;
          stringToUTF8(cwd, buf, size);
          return cwdLengthInBytes;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_lstat64(path, buf) {
        try {
          path = SYSCALLS.getStr(path);
          return SYSCALLS.writeStat(buf, FS.lstat(path));
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_mkdirat(dirfd, path, mode) {
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path);
          FS.mkdir(path, mode, 0);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_newfstatat(dirfd, path, buf, flags) {
        try {
          path = SYSCALLS.getStr(path);
          var nofollow = flags & 256;
          var allowEmpty = flags & 4096;
          flags = flags & ~6400;
          path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
          return SYSCALLS.writeStat(buf, nofollow ? FS.lstat(path) : FS.stat(path));
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_openat(dirfd, path, flags, varargs) {
        SYSCALLS.varargs = varargs;
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path);
          var mode = varargs ? syscallGetVarargI() : 0;
          return FS.open(path, flags, mode).fd;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path);
          if (bufsize <= 0) return -28;
          var ret = FS.readlink(path);
          var len = Math.min(bufsize, lengthBytesUTF8(ret));
          var endChar = HEAP8[buf + len];
          stringToUTF8(ret, buf, bufsize + 1);
          HEAP8[buf + len] = endChar;
          return len;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_rmdir(path) {
        try {
          path = SYSCALLS.getStr(path);
          FS.rmdir(path);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_stat64(path, buf) {
        try {
          path = SYSCALLS.getStr(path);
          return SYSCALLS.writeStat(buf, FS.stat(path));
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function ___syscall_unlinkat(dirfd, path, flags) {
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path);
          if (!flags) {
            FS.unlink(path);
          } else if (flags === 512) {
            FS.rmdir(path);
          } else {
            return -28;
          }
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var readI53FromI64 = ptr => HEAPU32[ptr >> 2] + HEAP32[ptr + 4 >> 2] * 4294967296;
      function ___syscall_utimensat(dirfd, path, times, flags) {
        try {
          path = SYSCALLS.getStr(path);
          path = SYSCALLS.calculateAt(dirfd, path, true);
          var now = Date.now(),
            atime,
            mtime;
          if (!times) {
            atime = now;
            mtime = now;
          } else {
            var seconds = readI53FromI64(times);
            var nanoseconds = HEAP32[times + 8 >> 2];
            if (nanoseconds == 1073741823) {
              atime = now;
            } else if (nanoseconds == 1073741822) {
              atime = null;
            } else {
              atime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
            }
            times += 16;
            seconds = readI53FromI64(times);
            nanoseconds = HEAP32[times + 8 >> 2];
            if (nanoseconds == 1073741823) {
              mtime = now;
            } else if (nanoseconds == 1073741822) {
              mtime = null;
            } else {
              mtime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
            }
          }
          if ((mtime ?? atime) !== null) {
            FS.utime(path, atime, mtime);
          }
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var __abort_js = () => abort("");
      var runtimeKeepaliveCounter = 0;
      var __emscripten_runtime_keepalive_clear = () => {
        noExitRuntime = false;
        runtimeKeepaliveCounter = 0;
      };
      var isLeapYear = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
      var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      var ydayFromDate = date => {
        var leap = isLeapYear(date.getFullYear());
        var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
        var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
        return yday;
      };
      function __localtime_js(time_low, time_high, tmPtr) {
        var time = convertI32PairToI53Checked(time_low, time_high);
        var date = new Date(time * 1e3);
        HEAP32[tmPtr >> 2] = date.getSeconds();
        HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
        HEAP32[tmPtr + 8 >> 2] = date.getHours();
        HEAP32[tmPtr + 12 >> 2] = date.getDate();
        HEAP32[tmPtr + 16 >> 2] = date.getMonth();
        HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
        HEAP32[tmPtr + 24 >> 2] = date.getDay();
        var yday = ydayFromDate(date) | 0;
        HEAP32[tmPtr + 28 >> 2] = yday;
        HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
        var start = new Date(date.getFullYear(), 0, 1);
        var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        var winterOffset = start.getTimezoneOffset();
        var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
        HEAP32[tmPtr + 32 >> 2] = dst;
      }
      function __mmap_js(len, prot, flags, fd, offset_low, offset_high, allocated, addr) {
        var offset = convertI32PairToI53Checked(offset_low, offset_high);
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          var res = FS.mmap(stream, len, offset, prot, flags);
          var ptr = res.ptr;
          HEAP32[allocated >> 2] = res.allocated;
          HEAPU32[addr >> 2] = ptr;
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      function __munmap_js(addr, len, prot, flags, fd, offset_low, offset_high) {
        var offset = convertI32PairToI53Checked(offset_low, offset_high);
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          if (prot & 2) {
            SYSCALLS.doMsync(addr, stream, len, flags, offset);
          }
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return -e.errno;
        }
      }
      var timers = {};
      var handleException = e => {
        if (e instanceof ExitStatus || e == "unwind") {
          return EXITSTATUS;
        }
        quit_(1, e);
      };
      var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
      var _proc_exit = code => {
        EXITSTATUS = code;
        if (!keepRuntimeAlive()) {
          Module["onExit"]?.(code);
          ABORT = true;
        }
        quit_(code, new ExitStatus(code));
      };
      var exitJS = (status, implicit) => {
        EXITSTATUS = status;
        _proc_exit(status);
      };
      var _exit = exitJS;
      var maybeExit = () => {
        if (!keepRuntimeAlive()) {
          try {
            _exit(EXITSTATUS);
          } catch (e) {
            handleException(e);
          }
        }
      };
      var callUserCallback = func => {
        if (ABORT) {
          return;
        }
        try {
          func();
          maybeExit();
        } catch (e) {
          handleException(e);
        }
      };
      var _emscripten_get_now = () => performance.now();
      var __setitimer_js = (which, timeout_ms) => {
        if (timers[which]) {
          clearTimeout(timers[which].id);
          delete timers[which];
        }
        if (!timeout_ms) return 0;
        var id = setTimeout(() => {
          delete timers[which];
          callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
        }, timeout_ms);
        timers[which] = {
          id,
          timeout_ms
        };
        return 0;
      };
      var __tzset_js = (timezone, daylight, std_name, dst_name) => {
        var currentYear = new Date().getFullYear();
        var winter = new Date(currentYear, 0, 1);
        var summer = new Date(currentYear, 6, 1);
        var winterOffset = winter.getTimezoneOffset();
        var summerOffset = summer.getTimezoneOffset();
        var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
        HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
        HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
        var extractZone = timezoneOffset => {
          var sign = timezoneOffset >= 0 ? "-" : "+";
          var absOffset = Math.abs(timezoneOffset);
          var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
          var minutes = String(absOffset % 60).padStart(2, "0");
          return `UTC${sign}${hours}${minutes}`;
        };
        var winterName = extractZone(winterOffset);
        var summerName = extractZone(summerOffset);
        if (summerOffset < winterOffset) {
          stringToUTF8(winterName, std_name, 17);
          stringToUTF8(summerName, dst_name, 17);
        } else {
          stringToUTF8(winterName, dst_name, 17);
          stringToUTF8(summerName, std_name, 17);
        }
      };
      var _emscripten_date_now = () => Date.now();
      var getHeapMax = () => 2147483648;
      var growMemory = size => {
        var b = wasmMemory.buffer;
        var pages = (size - b.byteLength + 65535) / 65536 | 0;
        try {
          wasmMemory.grow(pages);
          updateMemoryViews();
          return 1;
        } catch (e) {}
      };
      var _emscripten_resize_heap = requestedSize => {
        var oldSize = HEAPU8.length;
        requestedSize >>>= 0;
        var maxHeapSize = getHeapMax();
        if (requestedSize > maxHeapSize) {
          return false;
        }
        for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
          var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
          overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
          var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
          var replacement = growMemory(newSize);
          if (replacement) {
            return true;
          }
        }
        return false;
      };
      var ENV = {};
      var getExecutableName = () => thisProgram || "./this.program";
      var getEnvStrings = () => {
        if (!getEnvStrings.strings) {
          var lang = (typeof navigator == "object" && navigator.language || "C").replace("-", "_") + ".UTF-8";
          var env = {
            USER: "web_user",
            LOGNAME: "web_user",
            PATH: "/",
            PWD: "/",
            HOME: "/home/web_user",
            LANG: lang,
            _: getExecutableName()
          };
          for (var x in ENV) {
            if (ENV[x] === undefined) delete env[x];else env[x] = ENV[x];
          }
          var strings = [];
          for (var x in env) {
            strings.push(`${x}=${env[x]}`);
          }
          getEnvStrings.strings = strings;
        }
        return getEnvStrings.strings;
      };
      var _environ_get = (__environ, environ_buf) => {
        var bufSize = 0;
        var envp = 0;
        for (var string of getEnvStrings()) {
          var ptr = environ_buf + bufSize;
          HEAPU32[__environ + envp >> 2] = ptr;
          bufSize += stringToUTF8(string, ptr, Infinity) + 1;
          envp += 4;
        }
        return 0;
      };
      var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
        var strings = getEnvStrings();
        HEAPU32[penviron_count >> 2] = strings.length;
        var bufSize = 0;
        for (var string of strings) {
          bufSize += lengthBytesUTF8(string) + 1;
        }
        HEAPU32[penviron_buf_size >> 2] = bufSize;
        return 0;
      };
      function _fd_close(fd) {
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          FS.close(stream);
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      function _fd_fdstat_get(fd, pbuf) {
        try {
          var rightsBase = 0;
          var rightsInheriting = 0;
          var flags = 0;
          {
            var stream = SYSCALLS.getStreamFromFD(fd);
            var type = stream.tty ? 2 : FS.isDir(stream.mode) ? 3 : FS.isLink(stream.mode) ? 7 : 4;
          }
          HEAP8[pbuf] = type;
          HEAP16[pbuf + 2 >> 1] = flags;
          tempI64 = [rightsBase >>> 0, (tempDouble = rightsBase, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[pbuf + 8 >> 2] = tempI64[0], HEAP32[pbuf + 12 >> 2] = tempI64[1];
          tempI64 = [rightsInheriting >>> 0, (tempDouble = rightsInheriting, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[pbuf + 16 >> 2] = tempI64[0], HEAP32[pbuf + 20 >> 2] = tempI64[1];
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      var doReadv = (stream, iov, iovcnt, offset) => {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAPU32[iov >> 2];
          var len = HEAPU32[iov + 4 >> 2];
          iov += 8;
          var curr = FS.read(stream, HEAP8, ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break;
          if (typeof offset != "undefined") {
            offset += curr;
          }
        }
        return ret;
      };
      function _fd_read(fd, iov, iovcnt, pnum) {
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          var num = doReadv(stream, iov, iovcnt);
          HEAPU32[pnum >> 2] = num;
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
        var offset = convertI32PairToI53Checked(offset_low, offset_high);
        try {
          if (isNaN(offset)) return 61;
          var stream = SYSCALLS.getStreamFromFD(fd);
          FS.llseek(stream, offset, whence);
          tempI64 = [stream.position >>> 0, (tempDouble = stream.position, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[newOffset >> 2] = tempI64[0], HEAP32[newOffset + 4 >> 2] = tempI64[1];
          if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      function _fd_sync(fd) {
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          if (stream.stream_ops?.fsync) {
            return stream.stream_ops.fsync(stream);
          }
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      var doWritev = (stream, iov, iovcnt, offset) => {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAPU32[iov >> 2];
          var len = HEAPU32[iov + 4 >> 2];
          iov += 8;
          var curr = FS.write(stream, HEAP8, ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) {
            break;
          }
          if (typeof offset != "undefined") {
            offset += curr;
          }
        }
        return ret;
      };
      function _fd_write(fd, iov, iovcnt, pnum) {
        try {
          var stream = SYSCALLS.getStreamFromFD(fd);
          var num = doWritev(stream, iov, iovcnt);
          HEAPU32[pnum >> 2] = num;
          return 0;
        } catch (e) {
          if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
          return e.errno;
        }
      }
      var adapters_support = function () {
        const handleAsync = typeof Asyncify === "object" ? Asyncify.handleAsync.bind(Asyncify) : null;
        Module["handleAsync"] = handleAsync;
        const targets = new Map();
        Module["setCallback"] = (key, target) => targets.set(key, target);
        Module["getCallback"] = key => targets.get(key);
        Module["deleteCallback"] = key => targets.delete(key);
        adapters_support = function (isAsync, key, ...args) {
          const receiver = targets.get(key);
          let methodName = null;
          const f = typeof receiver === "function" ? receiver : receiver[methodName = UTF8ToString(args.shift())];
          if (isAsync) {
            if (handleAsync) {
              return handleAsync(() => f.apply(receiver, args));
            }
            throw new Error("Synchronous WebAssembly cannot call async function");
          }
          const result = f.apply(receiver, args);
          if (typeof result?.then == "function") {
            console.error("unexpected Promise", f);
            throw new Error(`${methodName} unexpectedly returned a Promise`);
          }
          return result;
        };
      };
      function _ipp(...args) {
        return adapters_support(false, ...args);
      }
      function _ipp_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ippipppp(...args) {
        return adapters_support(false, ...args);
      }
      function _ippipppp_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ippp(...args) {
        return adapters_support(false, ...args);
      }
      function _ippp_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppi(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppi_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppiii(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppiii_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppiiip(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppiiip_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppip(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppip_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppj(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppj_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppp(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppp_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ippppi(...args) {
        return adapters_support(false, ...args);
      }
      function _ippppi_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ippppij(...args) {
        return adapters_support(false, ...args);
      }
      function _ippppij_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ippppip(...args) {
        return adapters_support(false, ...args);
      }
      function _ippppip_async(...args) {
        return adapters_support(true, ...args);
      }
      function _ipppppip(...args) {
        return adapters_support(false, ...args);
      }
      function _ipppppip_async(...args) {
        return adapters_support(true, ...args);
      }
      function _vppippii(...args) {
        return adapters_support(false, ...args);
      }
      function _vppippii_async(...args) {
        return adapters_support(true, ...args);
      }
      function _vppp(...args) {
        return adapters_support(false, ...args);
      }
      function _vppp_async(...args) {
        return adapters_support(true, ...args);
      }
      function _vpppip(...args) {
        return adapters_support(false, ...args);
      }
      function _vpppip_async(...args) {
        return adapters_support(true, ...args);
      }
      var uleb128Encode = (n, target) => {
        if (n < 128) {
          target.push(n);
        } else {
          target.push(n % 128 | 128, n >> 7);
        }
      };
      var sigToWasmTypes = sig => {
        var typeNames = {
          i: "i32",
          j: "i64",
          f: "f32",
          d: "f64",
          e: "externref",
          p: "i32"
        };
        var type = {
          parameters: [],
          results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
        };
        for (var i = 1; i < sig.length; ++i) {
          type.parameters.push(typeNames[sig[i]]);
        }
        return type;
      };
      var generateFuncType = (sig, target) => {
        var sigRet = sig.slice(0, 1);
        var sigParam = sig.slice(1);
        var typeCodes = {
          i: 127,
          p: 127,
          j: 126,
          f: 125,
          d: 124,
          e: 111
        };
        target.push(96);
        uleb128Encode(sigParam.length, target);
        for (var paramType of sigParam) {
          target.push(typeCodes[paramType]);
        }
        if (sigRet == "v") {
          target.push(0);
        } else {
          target.push(1, typeCodes[sigRet]);
        }
      };
      var convertJsFunctionToWasm = (func, sig) => {
        if (typeof WebAssembly.Function == "function") {
          return new WebAssembly.Function(sigToWasmTypes(sig), func);
        }
        var typeSectionBody = [1];
        generateFuncType(sig, typeSectionBody);
        var bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1];
        uleb128Encode(typeSectionBody.length, bytes);
        bytes.push(...typeSectionBody);
        bytes.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
        var module = new WebAssembly.Module(new Uint8Array(bytes));
        var instance = new WebAssembly.Instance(module, {
          e: {
            f: func
          }
        });
        var wrappedFunc = instance.exports["f"];
        return wrappedFunc;
      };
      var wasmTable;
      var getWasmTableEntry = funcPtr => wasmTable.get(funcPtr);
      var updateTableMap = (offset, count) => {
        if (functionsInTableMap) {
          for (var i = offset; i < offset + count; i++) {
            var item = getWasmTableEntry(i);
            if (item) {
              functionsInTableMap.set(item, i);
            }
          }
        }
      };
      var functionsInTableMap;
      var getFunctionAddress = func => {
        if (!functionsInTableMap) {
          functionsInTableMap = new WeakMap();
          updateTableMap(0, wasmTable.length);
        }
        return functionsInTableMap.get(func) || 0;
      };
      var freeTableIndexes = [];
      var getEmptyTableSlot = () => {
        if (freeTableIndexes.length) {
          return freeTableIndexes.pop();
        }
        try {
          wasmTable.grow(1);
        } catch (err) {
          if (!(err instanceof RangeError)) {
            throw err;
          }
          throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
        }
        return wasmTable.length - 1;
      };
      var setWasmTableEntry = (idx, func) => wasmTable.set(idx, func);
      var addFunction = (func, sig) => {
        var rtn = getFunctionAddress(func);
        if (rtn) {
          return rtn;
        }
        var ret = getEmptyTableSlot();
        try {
          setWasmTableEntry(ret, func);
        } catch (err) {
          if (!(err instanceof TypeError)) {
            throw err;
          }
          var wrapped = convertJsFunctionToWasm(func, sig);
          setWasmTableEntry(ret, wrapped);
        }
        functionsInTableMap.set(func, ret);
        return ret;
      };
      var getCFunc = ident => {
        var func = Module["_" + ident];
        return func;
      };
      var writeArrayToMemory = (array, buffer) => {
        HEAP8.set(array, buffer);
      };
      var stackAlloc = sz => __emscripten_stack_alloc(sz);
      var stringToUTF8OnStack = str => {
        var size = lengthBytesUTF8(str) + 1;
        var ret = stackAlloc(size);
        stringToUTF8(str, ret, size);
        return ret;
      };
      var ccall = (ident, returnType, argTypes, args, opts) => {
        var toC = {
          string: str => {
            var ret = 0;
            if (str !== null && str !== undefined && str !== 0) {
              ret = stringToUTF8OnStack(str);
            }
            return ret;
          },
          array: arr => {
            var ret = stackAlloc(arr.length);
            writeArrayToMemory(arr, ret);
            return ret;
          }
        };
        function convertReturnValue(ret) {
          if (returnType === "string") {
            return UTF8ToString(ret);
          }
          if (returnType === "boolean") return Boolean(ret);
          return ret;
        }
        var func = getCFunc(ident);
        var cArgs = [];
        var stack = 0;
        if (args) {
          for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
              if (stack === 0) stack = stackSave();
              cArgs[i] = converter(args[i]);
            } else {
              cArgs[i] = args[i];
            }
          }
        }
        var ret = func(...cArgs);
        function onDone(ret) {
          if (stack !== 0) stackRestore(stack);
          return convertReturnValue(ret);
        }
        ret = onDone(ret);
        return ret;
      };
      var cwrap = (ident, returnType, argTypes, opts) => {
        var numericArgs = !argTypes || argTypes.every(type => type === "number" || type === "boolean");
        var numericRet = returnType !== "string";
        if (numericRet && numericArgs && !opts) {
          return getCFunc(ident);
        }
        return (...args) => ccall(ident, returnType, argTypes, args, opts);
      };
      var getTempRet0 = val => __emscripten_tempret_get();
      var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
        maxBytesToWrite ??= 2147483647;
        if (maxBytesToWrite < 2) return 0;
        maxBytesToWrite -= 2;
        var startPtr = outPtr;
        var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
        for (var i = 0; i < numCharsToWrite; ++i) {
          var codeUnit = str.charCodeAt(i);
          HEAP16[outPtr >> 1] = codeUnit;
          outPtr += 2;
        }
        HEAP16[outPtr >> 1] = 0;
        return outPtr - startPtr;
      };
      var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
        maxBytesToWrite ??= 2147483647;
        if (maxBytesToWrite < 4) return 0;
        var startPtr = outPtr;
        var endPtr = startPtr + maxBytesToWrite - 4;
        for (var i = 0; i < str.length; ++i) {
          var codePoint = str.codePointAt(i);
          if (codePoint > 65535) {
            i++;
          }
          HEAP32[outPtr >> 2] = codePoint;
          outPtr += 4;
          if (outPtr + 4 > endPtr) break;
        }
        HEAP32[outPtr >> 2] = 0;
        return outPtr - startPtr;
      };
      var AsciiToString = ptr => {
        var str = "";
        while (1) {
          var ch = HEAPU8[ptr++];
          if (!ch) return str;
          str += String.fromCharCode(ch);
        }
      };
      var UTF16Decoder = new TextDecoder("utf-16le");
      var UTF16ToString = (ptr, maxBytesToRead) => {
        var idx = ptr >> 1;
        var maxIdx = idx + maxBytesToRead / 2;
        var endIdx = idx;
        while (!(endIdx >= maxIdx) && HEAPU16[endIdx]) ++endIdx;
        return UTF16Decoder.decode(HEAPU16.subarray(idx, endIdx));
      };
      var UTF32ToString = (ptr, maxBytesToRead) => {
        var str = "";
        for (var i = 0; !(i >= maxBytesToRead / 4); i++) {
          var utf32 = HEAP32[ptr + i * 4 >> 2];
          if (!utf32) break;
          str += String.fromCodePoint(utf32);
        }
        return str;
      };
      var intArrayToString = array => {
        var ret = [];
        for (var i = 0; i < array.length; i++) {
          var chr = array[i];
          if (chr > 255) {
            chr &= 255;
          }
          ret.push(String.fromCharCode(chr));
        }
        return ret.join("");
      };
      FS.createPreloadedFile = FS_createPreloadedFile;
      FS.staticInit();
      MEMFS.doesNotExistError = new FS.ErrnoError(44);
      MEMFS.doesNotExistError.stack = "<generic error, no stack>";
      adapters_support();
      {
        if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
        if (Module["preloadPlugins"]) preloadPlugins = Module["preloadPlugins"];
        if (Module["print"]) out = Module["print"];
        if (Module["printErr"]) err = Module["printErr"];
        if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
        if (Module["arguments"]) arguments_ = Module["arguments"];
        if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
      }
      Module["getTempRet0"] = getTempRet0;
      Module["ccall"] = ccall;
      Module["cwrap"] = cwrap;
      Module["addFunction"] = addFunction;
      Module["setValue"] = setValue;
      Module["getValue"] = getValue;
      Module["UTF8ToString"] = UTF8ToString;
      Module["stringToUTF8"] = stringToUTF8;
      Module["lengthBytesUTF8"] = lengthBytesUTF8;
      Module["intArrayFromString"] = intArrayFromString;
      Module["intArrayToString"] = intArrayToString;
      Module["AsciiToString"] = AsciiToString;
      Module["UTF16ToString"] = UTF16ToString;
      Module["stringToUTF16"] = stringToUTF16;
      Module["UTF32ToString"] = UTF32ToString;
      Module["stringToUTF32"] = stringToUTF32;
      Module["writeArrayToMemory"] = writeArrayToMemory;
      var _sqlite3_status64, _sqlite3_status, _sqlite3_db_status, _sqlite3_msize, _sqlite3_vfs_find, _sqlite3_vfs_register, _sqlite3_vfs_unregister, _sqlite3_release_memory, _sqlite3_soft_heap_limit64, _sqlite3_memory_used, _sqlite3_hard_heap_limit64, _sqlite3_memory_highwater, _sqlite3_malloc, _sqlite3_malloc64, _sqlite3_free, _sqlite3_realloc, _sqlite3_realloc64, _sqlite3_str_vappendf, _sqlite3_str_append, _sqlite3_str_appendchar, _sqlite3_str_appendall, _sqlite3_str_appendf, _sqlite3_str_finish, _sqlite3_str_errcode, _sqlite3_str_length, _sqlite3_str_value, _sqlite3_str_reset, _sqlite3_str_new, _sqlite3_vmprintf, _sqlite3_mprintf, _sqlite3_vsnprintf, _sqlite3_snprintf, _sqlite3_log, _sqlite3_randomness, _sqlite3_stricmp, _sqlite3_strnicmp, _sqlite3_os_init, _sqlite3_os_end, _sqlite3_serialize, _sqlite3_prepare_v2, _sqlite3_step, _sqlite3_column_int64, _sqlite3_reset, _sqlite3_exec, _sqlite3_column_int, _sqlite3_finalize, _sqlite3_deserialize, _sqlite3_database_file_object, _sqlite3_backup_init, _sqlite3_backup_step, _sqlite3_backup_finish, _sqlite3_backup_remaining, _sqlite3_backup_pagecount, _sqlite3_clear_bindings, _sqlite3_value_blob, _sqlite3_value_text, _sqlite3_value_bytes, _sqlite3_value_bytes16, _sqlite3_value_double, _sqlite3_value_int, _sqlite3_value_int64, _sqlite3_value_subtype, _sqlite3_value_pointer, _sqlite3_value_text16, _sqlite3_value_text16be, _sqlite3_value_text16le, _sqlite3_value_type, _sqlite3_value_encoding, _sqlite3_value_nochange, _sqlite3_value_frombind, _sqlite3_value_dup, _sqlite3_value_free, _sqlite3_result_blob, _sqlite3_result_blob64, _sqlite3_result_double, _sqlite3_result_error, _sqlite3_result_error16, _sqlite3_result_int, _sqlite3_result_int64, _sqlite3_result_null, _sqlite3_result_pointer, _sqlite3_result_subtype, _sqlite3_result_text, _sqlite3_result_text64, _sqlite3_result_text16, _sqlite3_result_text16be, _sqlite3_result_text16le, _sqlite3_result_value, _sqlite3_result_error_toobig, _sqlite3_result_zeroblob, _sqlite3_result_zeroblob64, _sqlite3_result_error_code, _sqlite3_result_error_nomem, _sqlite3_user_data, _sqlite3_context_db_handle, _sqlite3_vtab_nochange, _sqlite3_vtab_in_first, _sqlite3_vtab_in_next, _sqlite3_aggregate_context, _sqlite3_get_auxdata, _sqlite3_set_auxdata, _sqlite3_column_count, _sqlite3_data_count, _sqlite3_column_blob, _sqlite3_column_bytes, _sqlite3_column_bytes16, _sqlite3_column_double, _sqlite3_column_text, _sqlite3_column_value, _sqlite3_column_text16, _sqlite3_column_type, _sqlite3_column_name, _sqlite3_column_name16, _sqlite3_bind_blob, _sqlite3_bind_blob64, _sqlite3_bind_double, _sqlite3_bind_int, _sqlite3_bind_int64, _sqlite3_bind_null, _sqlite3_bind_pointer, _sqlite3_bind_text, _sqlite3_bind_text64, _sqlite3_bind_text16, _sqlite3_bind_value, _sqlite3_bind_zeroblob, _sqlite3_bind_zeroblob64, _sqlite3_bind_parameter_count, _sqlite3_bind_parameter_name, _sqlite3_bind_parameter_index, _sqlite3_db_handle, _sqlite3_stmt_readonly, _sqlite3_stmt_isexplain, _sqlite3_stmt_explain, _sqlite3_stmt_busy, _sqlite3_next_stmt, _sqlite3_stmt_status, _sqlite3_sql, _sqlite3_expanded_sql, _sqlite3_value_numeric_type, _sqlite3_blob_open, _sqlite3_blob_close, _sqlite3_blob_read, _sqlite3_blob_write, _sqlite3_blob_bytes, _sqlite3_blob_reopen, _sqlite3_set_authorizer, _sqlite3_strglob, _sqlite3_strlike, _sqlite3_errmsg, _sqlite3_auto_extension, _sqlite3_cancel_auto_extension, _sqlite3_reset_auto_extension, _sqlite3_prepare, _sqlite3_prepare_v3, _sqlite3_prepare16, _sqlite3_prepare16_v2, _sqlite3_prepare16_v3, _sqlite3_get_table, _sqlite3_free_table, _sqlite3_create_module, _sqlite3_create_module_v2, _sqlite3_drop_modules, _sqlite3_declare_vtab, _sqlite3_vtab_on_conflict, _sqlite3_vtab_config, _sqlite3_vtab_collation, _sqlite3_vtab_in, _sqlite3_vtab_rhs_value, _sqlite3_vtab_distinct, _sqlite3_keyword_name, _sqlite3_keyword_count, _sqlite3_keyword_check, _sqlite3_complete, _sqlite3_complete16, _sqlite3_libversion, _sqlite3_libversion_number, _sqlite3_threadsafe, _sqlite3_initialize, _sqlite3_shutdown, _sqlite3_config, _sqlite3_db_mutex, _sqlite3_db_release_memory, _sqlite3_db_cacheflush, _sqlite3_db_config, _sqlite3_last_insert_rowid, _sqlite3_set_last_insert_rowid, _sqlite3_changes64, _sqlite3_changes, _sqlite3_total_changes64, _sqlite3_total_changes, _sqlite3_txn_state, _sqlite3_close, _sqlite3_close_v2, _sqlite3_busy_handler, _sqlite3_progress_handler, _sqlite3_busy_timeout, _sqlite3_interrupt, _sqlite3_is_interrupted, _sqlite3_create_function, _sqlite3_create_function_v2, _sqlite3_create_window_function, _sqlite3_create_function16, _sqlite3_overload_function, _sqlite3_trace_v2, _sqlite3_commit_hook, _sqlite3_update_hook, _sqlite3_rollback_hook, _sqlite3_autovacuum_pages, _sqlite3_wal_autocheckpoint, _sqlite3_wal_hook, _sqlite3_wal_checkpoint_v2, _sqlite3_wal_checkpoint, _sqlite3_error_offset, _sqlite3_errmsg16, _sqlite3_errcode, _sqlite3_extended_errcode, _sqlite3_system_errno, _sqlite3_errstr, _sqlite3_limit, _sqlite3_open, _sqlite3_open_v2, _sqlite3_open16, _sqlite3_create_collation, _sqlite3_create_collation_v2, _sqlite3_create_collation16, _sqlite3_collation_needed, _sqlite3_collation_needed16, _sqlite3_get_clientdata, _sqlite3_set_clientdata, _sqlite3_get_autocommit, _sqlite3_table_column_metadata, _sqlite3_sleep, _sqlite3_extended_result_codes, _sqlite3_file_control, _sqlite3_test_control, _sqlite3_create_filename, _sqlite3_free_filename, _sqlite3_uri_parameter, _sqlite3_uri_key, _sqlite3_uri_boolean, _sqlite3_uri_int64, _sqlite3_filename_database, _sqlite3_filename_journal, _sqlite3_filename_wal, _sqlite3_db_name, _sqlite3_db_filename, _sqlite3_db_readonly, _sqlite3_compileoption_used, _sqlite3_compileoption_get, _sqlite3session_create, _sqlite3session_delete, _sqlite3session_attach, _sqlite3session_changeset, _sqlite3session_enable, _sqlite3changeset_invert, _sqlite3changeset_apply, _sqlite3_sourceid, _malloc, _free, _RegisterExtensionFunctions, _getSqliteFree, _main, _libauthorizer_set_authorizer, _libfunction_create_function, _libhook_commit_hook, _libhook_update_hook, _libprogress_progress_handler, _libvfs_vfs_register, _emscripten_builtin_memalign, __emscripten_timeout, __emscripten_tempret_get, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, dynCall_viiiiijj, dynCall_viji, dynCall_viiiij, dynCall_iij, dynCall_iiiij, dynCall_iijii, dynCall_iiji, dynCall_iiiiiij;
      function assignWasmExports(wasmExports) {
        Module["_sqlite3_status64"] = _sqlite3_status64 = wasmExports["ra"];
        Module["_sqlite3_status"] = _sqlite3_status = wasmExports["sa"];
        Module["_sqlite3_db_status"] = _sqlite3_db_status = wasmExports["ta"];
        Module["_sqlite3_msize"] = _sqlite3_msize = wasmExports["ua"];
        Module["_sqlite3_vfs_find"] = _sqlite3_vfs_find = wasmExports["va"];
        Module["_sqlite3_vfs_register"] = _sqlite3_vfs_register = wasmExports["wa"];
        Module["_sqlite3_vfs_unregister"] = _sqlite3_vfs_unregister = wasmExports["xa"];
        Module["_sqlite3_release_memory"] = _sqlite3_release_memory = wasmExports["ya"];
        Module["_sqlite3_soft_heap_limit64"] = _sqlite3_soft_heap_limit64 = wasmExports["za"];
        Module["_sqlite3_memory_used"] = _sqlite3_memory_used = wasmExports["Aa"];
        Module["_sqlite3_hard_heap_limit64"] = _sqlite3_hard_heap_limit64 = wasmExports["Ba"];
        Module["_sqlite3_memory_highwater"] = _sqlite3_memory_highwater = wasmExports["Ca"];
        Module["_sqlite3_malloc"] = _sqlite3_malloc = wasmExports["Da"];
        Module["_sqlite3_malloc64"] = _sqlite3_malloc64 = wasmExports["Ea"];
        Module["_sqlite3_free"] = _sqlite3_free = wasmExports["Fa"];
        Module["_sqlite3_realloc"] = _sqlite3_realloc = wasmExports["Ga"];
        Module["_sqlite3_realloc64"] = _sqlite3_realloc64 = wasmExports["Ha"];
        Module["_sqlite3_str_vappendf"] = _sqlite3_str_vappendf = wasmExports["Ia"];
        Module["_sqlite3_str_append"] = _sqlite3_str_append = wasmExports["Ja"];
        Module["_sqlite3_str_appendchar"] = _sqlite3_str_appendchar = wasmExports["Ka"];
        Module["_sqlite3_str_appendall"] = _sqlite3_str_appendall = wasmExports["La"];
        Module["_sqlite3_str_appendf"] = _sqlite3_str_appendf = wasmExports["Ma"];
        Module["_sqlite3_str_finish"] = _sqlite3_str_finish = wasmExports["Na"];
        Module["_sqlite3_str_errcode"] = _sqlite3_str_errcode = wasmExports["Oa"];
        Module["_sqlite3_str_length"] = _sqlite3_str_length = wasmExports["Pa"];
        Module["_sqlite3_str_value"] = _sqlite3_str_value = wasmExports["Qa"];
        Module["_sqlite3_str_reset"] = _sqlite3_str_reset = wasmExports["Ra"];
        Module["_sqlite3_str_new"] = _sqlite3_str_new = wasmExports["Sa"];
        Module["_sqlite3_vmprintf"] = _sqlite3_vmprintf = wasmExports["Ta"];
        Module["_sqlite3_mprintf"] = _sqlite3_mprintf = wasmExports["Ua"];
        Module["_sqlite3_vsnprintf"] = _sqlite3_vsnprintf = wasmExports["Va"];
        Module["_sqlite3_snprintf"] = _sqlite3_snprintf = wasmExports["Wa"];
        Module["_sqlite3_log"] = _sqlite3_log = wasmExports["Xa"];
        Module["_sqlite3_randomness"] = _sqlite3_randomness = wasmExports["Ya"];
        Module["_sqlite3_stricmp"] = _sqlite3_stricmp = wasmExports["Za"];
        Module["_sqlite3_strnicmp"] = _sqlite3_strnicmp = wasmExports["_a"];
        Module["_sqlite3_os_init"] = _sqlite3_os_init = wasmExports["$a"];
        Module["_sqlite3_os_end"] = _sqlite3_os_end = wasmExports["ab"];
        Module["_sqlite3_serialize"] = _sqlite3_serialize = wasmExports["bb"];
        Module["_sqlite3_prepare_v2"] = _sqlite3_prepare_v2 = wasmExports["cb"];
        Module["_sqlite3_step"] = _sqlite3_step = wasmExports["db"];
        Module["_sqlite3_column_int64"] = _sqlite3_column_int64 = wasmExports["eb"];
        Module["_sqlite3_reset"] = _sqlite3_reset = wasmExports["fb"];
        Module["_sqlite3_exec"] = _sqlite3_exec = wasmExports["gb"];
        Module["_sqlite3_column_int"] = _sqlite3_column_int = wasmExports["hb"];
        Module["_sqlite3_finalize"] = _sqlite3_finalize = wasmExports["ib"];
        Module["_sqlite3_deserialize"] = _sqlite3_deserialize = wasmExports["jb"];
        Module["_sqlite3_database_file_object"] = _sqlite3_database_file_object = wasmExports["kb"];
        Module["_sqlite3_backup_init"] = _sqlite3_backup_init = wasmExports["lb"];
        Module["_sqlite3_backup_step"] = _sqlite3_backup_step = wasmExports["mb"];
        Module["_sqlite3_backup_finish"] = _sqlite3_backup_finish = wasmExports["nb"];
        Module["_sqlite3_backup_remaining"] = _sqlite3_backup_remaining = wasmExports["ob"];
        Module["_sqlite3_backup_pagecount"] = _sqlite3_backup_pagecount = wasmExports["pb"];
        Module["_sqlite3_clear_bindings"] = _sqlite3_clear_bindings = wasmExports["qb"];
        Module["_sqlite3_value_blob"] = _sqlite3_value_blob = wasmExports["rb"];
        Module["_sqlite3_value_text"] = _sqlite3_value_text = wasmExports["sb"];
        Module["_sqlite3_value_bytes"] = _sqlite3_value_bytes = wasmExports["tb"];
        Module["_sqlite3_value_bytes16"] = _sqlite3_value_bytes16 = wasmExports["ub"];
        Module["_sqlite3_value_double"] = _sqlite3_value_double = wasmExports["vb"];
        Module["_sqlite3_value_int"] = _sqlite3_value_int = wasmExports["wb"];
        Module["_sqlite3_value_int64"] = _sqlite3_value_int64 = wasmExports["xb"];
        Module["_sqlite3_value_subtype"] = _sqlite3_value_subtype = wasmExports["yb"];
        Module["_sqlite3_value_pointer"] = _sqlite3_value_pointer = wasmExports["zb"];
        Module["_sqlite3_value_text16"] = _sqlite3_value_text16 = wasmExports["Ab"];
        Module["_sqlite3_value_text16be"] = _sqlite3_value_text16be = wasmExports["Bb"];
        Module["_sqlite3_value_text16le"] = _sqlite3_value_text16le = wasmExports["Cb"];
        Module["_sqlite3_value_type"] = _sqlite3_value_type = wasmExports["Db"];
        Module["_sqlite3_value_encoding"] = _sqlite3_value_encoding = wasmExports["Eb"];
        Module["_sqlite3_value_nochange"] = _sqlite3_value_nochange = wasmExports["Fb"];
        Module["_sqlite3_value_frombind"] = _sqlite3_value_frombind = wasmExports["Gb"];
        Module["_sqlite3_value_dup"] = _sqlite3_value_dup = wasmExports["Hb"];
        Module["_sqlite3_value_free"] = _sqlite3_value_free = wasmExports["Ib"];
        Module["_sqlite3_result_blob"] = _sqlite3_result_blob = wasmExports["Jb"];
        Module["_sqlite3_result_blob64"] = _sqlite3_result_blob64 = wasmExports["Kb"];
        Module["_sqlite3_result_double"] = _sqlite3_result_double = wasmExports["Lb"];
        Module["_sqlite3_result_error"] = _sqlite3_result_error = wasmExports["Mb"];
        Module["_sqlite3_result_error16"] = _sqlite3_result_error16 = wasmExports["Nb"];
        Module["_sqlite3_result_int"] = _sqlite3_result_int = wasmExports["Ob"];
        Module["_sqlite3_result_int64"] = _sqlite3_result_int64 = wasmExports["Pb"];
        Module["_sqlite3_result_null"] = _sqlite3_result_null = wasmExports["Qb"];
        Module["_sqlite3_result_pointer"] = _sqlite3_result_pointer = wasmExports["Rb"];
        Module["_sqlite3_result_subtype"] = _sqlite3_result_subtype = wasmExports["Sb"];
        Module["_sqlite3_result_text"] = _sqlite3_result_text = wasmExports["Tb"];
        Module["_sqlite3_result_text64"] = _sqlite3_result_text64 = wasmExports["Ub"];
        Module["_sqlite3_result_text16"] = _sqlite3_result_text16 = wasmExports["Vb"];
        Module["_sqlite3_result_text16be"] = _sqlite3_result_text16be = wasmExports["Wb"];
        Module["_sqlite3_result_text16le"] = _sqlite3_result_text16le = wasmExports["Xb"];
        Module["_sqlite3_result_value"] = _sqlite3_result_value = wasmExports["Yb"];
        Module["_sqlite3_result_error_toobig"] = _sqlite3_result_error_toobig = wasmExports["Zb"];
        Module["_sqlite3_result_zeroblob"] = _sqlite3_result_zeroblob = wasmExports["_b"];
        Module["_sqlite3_result_zeroblob64"] = _sqlite3_result_zeroblob64 = wasmExports["$b"];
        Module["_sqlite3_result_error_code"] = _sqlite3_result_error_code = wasmExports["ac"];
        Module["_sqlite3_result_error_nomem"] = _sqlite3_result_error_nomem = wasmExports["bc"];
        Module["_sqlite3_user_data"] = _sqlite3_user_data = wasmExports["cc"];
        Module["_sqlite3_context_db_handle"] = _sqlite3_context_db_handle = wasmExports["dc"];
        Module["_sqlite3_vtab_nochange"] = _sqlite3_vtab_nochange = wasmExports["ec"];
        Module["_sqlite3_vtab_in_first"] = _sqlite3_vtab_in_first = wasmExports["fc"];
        Module["_sqlite3_vtab_in_next"] = _sqlite3_vtab_in_next = wasmExports["gc"];
        Module["_sqlite3_aggregate_context"] = _sqlite3_aggregate_context = wasmExports["hc"];
        Module["_sqlite3_get_auxdata"] = _sqlite3_get_auxdata = wasmExports["ic"];
        Module["_sqlite3_set_auxdata"] = _sqlite3_set_auxdata = wasmExports["jc"];
        Module["_sqlite3_column_count"] = _sqlite3_column_count = wasmExports["kc"];
        Module["_sqlite3_data_count"] = _sqlite3_data_count = wasmExports["lc"];
        Module["_sqlite3_column_blob"] = _sqlite3_column_blob = wasmExports["mc"];
        Module["_sqlite3_column_bytes"] = _sqlite3_column_bytes = wasmExports["nc"];
        Module["_sqlite3_column_bytes16"] = _sqlite3_column_bytes16 = wasmExports["oc"];
        Module["_sqlite3_column_double"] = _sqlite3_column_double = wasmExports["pc"];
        Module["_sqlite3_column_text"] = _sqlite3_column_text = wasmExports["qc"];
        Module["_sqlite3_column_value"] = _sqlite3_column_value = wasmExports["rc"];
        Module["_sqlite3_column_text16"] = _sqlite3_column_text16 = wasmExports["sc"];
        Module["_sqlite3_column_type"] = _sqlite3_column_type = wasmExports["tc"];
        Module["_sqlite3_column_name"] = _sqlite3_column_name = wasmExports["uc"];
        Module["_sqlite3_column_name16"] = _sqlite3_column_name16 = wasmExports["vc"];
        Module["_sqlite3_bind_blob"] = _sqlite3_bind_blob = wasmExports["wc"];
        Module["_sqlite3_bind_blob64"] = _sqlite3_bind_blob64 = wasmExports["xc"];
        Module["_sqlite3_bind_double"] = _sqlite3_bind_double = wasmExports["yc"];
        Module["_sqlite3_bind_int"] = _sqlite3_bind_int = wasmExports["zc"];
        Module["_sqlite3_bind_int64"] = _sqlite3_bind_int64 = wasmExports["Ac"];
        Module["_sqlite3_bind_null"] = _sqlite3_bind_null = wasmExports["Bc"];
        Module["_sqlite3_bind_pointer"] = _sqlite3_bind_pointer = wasmExports["Cc"];
        Module["_sqlite3_bind_text"] = _sqlite3_bind_text = wasmExports["Dc"];
        Module["_sqlite3_bind_text64"] = _sqlite3_bind_text64 = wasmExports["Ec"];
        Module["_sqlite3_bind_text16"] = _sqlite3_bind_text16 = wasmExports["Fc"];
        Module["_sqlite3_bind_value"] = _sqlite3_bind_value = wasmExports["Gc"];
        Module["_sqlite3_bind_zeroblob"] = _sqlite3_bind_zeroblob = wasmExports["Hc"];
        Module["_sqlite3_bind_zeroblob64"] = _sqlite3_bind_zeroblob64 = wasmExports["Ic"];
        Module["_sqlite3_bind_parameter_count"] = _sqlite3_bind_parameter_count = wasmExports["Jc"];
        Module["_sqlite3_bind_parameter_name"] = _sqlite3_bind_parameter_name = wasmExports["Kc"];
        Module["_sqlite3_bind_parameter_index"] = _sqlite3_bind_parameter_index = wasmExports["Lc"];
        Module["_sqlite3_db_handle"] = _sqlite3_db_handle = wasmExports["Mc"];
        Module["_sqlite3_stmt_readonly"] = _sqlite3_stmt_readonly = wasmExports["Nc"];
        Module["_sqlite3_stmt_isexplain"] = _sqlite3_stmt_isexplain = wasmExports["Oc"];
        Module["_sqlite3_stmt_explain"] = _sqlite3_stmt_explain = wasmExports["Pc"];
        Module["_sqlite3_stmt_busy"] = _sqlite3_stmt_busy = wasmExports["Qc"];
        Module["_sqlite3_next_stmt"] = _sqlite3_next_stmt = wasmExports["Rc"];
        Module["_sqlite3_stmt_status"] = _sqlite3_stmt_status = wasmExports["Sc"];
        Module["_sqlite3_sql"] = _sqlite3_sql = wasmExports["Tc"];
        Module["_sqlite3_expanded_sql"] = _sqlite3_expanded_sql = wasmExports["Uc"];
        Module["_sqlite3_value_numeric_type"] = _sqlite3_value_numeric_type = wasmExports["Vc"];
        Module["_sqlite3_blob_open"] = _sqlite3_blob_open = wasmExports["Wc"];
        Module["_sqlite3_blob_close"] = _sqlite3_blob_close = wasmExports["Xc"];
        Module["_sqlite3_blob_read"] = _sqlite3_blob_read = wasmExports["Yc"];
        Module["_sqlite3_blob_write"] = _sqlite3_blob_write = wasmExports["Zc"];
        Module["_sqlite3_blob_bytes"] = _sqlite3_blob_bytes = wasmExports["_c"];
        Module["_sqlite3_blob_reopen"] = _sqlite3_blob_reopen = wasmExports["$c"];
        Module["_sqlite3_set_authorizer"] = _sqlite3_set_authorizer = wasmExports["ad"];
        Module["_sqlite3_strglob"] = _sqlite3_strglob = wasmExports["bd"];
        Module["_sqlite3_strlike"] = _sqlite3_strlike = wasmExports["cd"];
        Module["_sqlite3_errmsg"] = _sqlite3_errmsg = wasmExports["dd"];
        Module["_sqlite3_auto_extension"] = _sqlite3_auto_extension = wasmExports["ed"];
        Module["_sqlite3_cancel_auto_extension"] = _sqlite3_cancel_auto_extension = wasmExports["fd"];
        Module["_sqlite3_reset_auto_extension"] = _sqlite3_reset_auto_extension = wasmExports["gd"];
        Module["_sqlite3_prepare"] = _sqlite3_prepare = wasmExports["hd"];
        Module["_sqlite3_prepare_v3"] = _sqlite3_prepare_v3 = wasmExports["id"];
        Module["_sqlite3_prepare16"] = _sqlite3_prepare16 = wasmExports["jd"];
        Module["_sqlite3_prepare16_v2"] = _sqlite3_prepare16_v2 = wasmExports["kd"];
        Module["_sqlite3_prepare16_v3"] = _sqlite3_prepare16_v3 = wasmExports["ld"];
        Module["_sqlite3_get_table"] = _sqlite3_get_table = wasmExports["md"];
        Module["_sqlite3_free_table"] = _sqlite3_free_table = wasmExports["nd"];
        Module["_sqlite3_create_module"] = _sqlite3_create_module = wasmExports["od"];
        Module["_sqlite3_create_module_v2"] = _sqlite3_create_module_v2 = wasmExports["pd"];
        Module["_sqlite3_drop_modules"] = _sqlite3_drop_modules = wasmExports["qd"];
        Module["_sqlite3_declare_vtab"] = _sqlite3_declare_vtab = wasmExports["rd"];
        Module["_sqlite3_vtab_on_conflict"] = _sqlite3_vtab_on_conflict = wasmExports["sd"];
        Module["_sqlite3_vtab_config"] = _sqlite3_vtab_config = wasmExports["td"];
        Module["_sqlite3_vtab_collation"] = _sqlite3_vtab_collation = wasmExports["ud"];
        Module["_sqlite3_vtab_in"] = _sqlite3_vtab_in = wasmExports["vd"];
        Module["_sqlite3_vtab_rhs_value"] = _sqlite3_vtab_rhs_value = wasmExports["wd"];
        Module["_sqlite3_vtab_distinct"] = _sqlite3_vtab_distinct = wasmExports["xd"];
        Module["_sqlite3_keyword_name"] = _sqlite3_keyword_name = wasmExports["yd"];
        Module["_sqlite3_keyword_count"] = _sqlite3_keyword_count = wasmExports["zd"];
        Module["_sqlite3_keyword_check"] = _sqlite3_keyword_check = wasmExports["Ad"];
        Module["_sqlite3_complete"] = _sqlite3_complete = wasmExports["Bd"];
        Module["_sqlite3_complete16"] = _sqlite3_complete16 = wasmExports["Cd"];
        Module["_sqlite3_libversion"] = _sqlite3_libversion = wasmExports["Dd"];
        Module["_sqlite3_libversion_number"] = _sqlite3_libversion_number = wasmExports["Ed"];
        Module["_sqlite3_threadsafe"] = _sqlite3_threadsafe = wasmExports["Fd"];
        Module["_sqlite3_initialize"] = _sqlite3_initialize = wasmExports["Gd"];
        Module["_sqlite3_shutdown"] = _sqlite3_shutdown = wasmExports["Hd"];
        Module["_sqlite3_config"] = _sqlite3_config = wasmExports["Id"];
        Module["_sqlite3_db_mutex"] = _sqlite3_db_mutex = wasmExports["Jd"];
        Module["_sqlite3_db_release_memory"] = _sqlite3_db_release_memory = wasmExports["Kd"];
        Module["_sqlite3_db_cacheflush"] = _sqlite3_db_cacheflush = wasmExports["Ld"];
        Module["_sqlite3_db_config"] = _sqlite3_db_config = wasmExports["Md"];
        Module["_sqlite3_last_insert_rowid"] = _sqlite3_last_insert_rowid = wasmExports["Nd"];
        Module["_sqlite3_set_last_insert_rowid"] = _sqlite3_set_last_insert_rowid = wasmExports["Od"];
        Module["_sqlite3_changes64"] = _sqlite3_changes64 = wasmExports["Pd"];
        Module["_sqlite3_changes"] = _sqlite3_changes = wasmExports["Qd"];
        Module["_sqlite3_total_changes64"] = _sqlite3_total_changes64 = wasmExports["Rd"];
        Module["_sqlite3_total_changes"] = _sqlite3_total_changes = wasmExports["Sd"];
        Module["_sqlite3_txn_state"] = _sqlite3_txn_state = wasmExports["Td"];
        Module["_sqlite3_close"] = _sqlite3_close = wasmExports["Ud"];
        Module["_sqlite3_close_v2"] = _sqlite3_close_v2 = wasmExports["Vd"];
        Module["_sqlite3_busy_handler"] = _sqlite3_busy_handler = wasmExports["Wd"];
        Module["_sqlite3_progress_handler"] = _sqlite3_progress_handler = wasmExports["Xd"];
        Module["_sqlite3_busy_timeout"] = _sqlite3_busy_timeout = wasmExports["Yd"];
        Module["_sqlite3_interrupt"] = _sqlite3_interrupt = wasmExports["Zd"];
        Module["_sqlite3_is_interrupted"] = _sqlite3_is_interrupted = wasmExports["_d"];
        Module["_sqlite3_create_function"] = _sqlite3_create_function = wasmExports["$d"];
        Module["_sqlite3_create_function_v2"] = _sqlite3_create_function_v2 = wasmExports["ae"];
        Module["_sqlite3_create_window_function"] = _sqlite3_create_window_function = wasmExports["be"];
        Module["_sqlite3_create_function16"] = _sqlite3_create_function16 = wasmExports["ce"];
        Module["_sqlite3_overload_function"] = _sqlite3_overload_function = wasmExports["de"];
        Module["_sqlite3_trace_v2"] = _sqlite3_trace_v2 = wasmExports["ee"];
        Module["_sqlite3_commit_hook"] = _sqlite3_commit_hook = wasmExports["fe"];
        Module["_sqlite3_update_hook"] = _sqlite3_update_hook = wasmExports["ge"];
        Module["_sqlite3_rollback_hook"] = _sqlite3_rollback_hook = wasmExports["he"];
        Module["_sqlite3_autovacuum_pages"] = _sqlite3_autovacuum_pages = wasmExports["ie"];
        Module["_sqlite3_wal_autocheckpoint"] = _sqlite3_wal_autocheckpoint = wasmExports["je"];
        Module["_sqlite3_wal_hook"] = _sqlite3_wal_hook = wasmExports["ke"];
        Module["_sqlite3_wal_checkpoint_v2"] = _sqlite3_wal_checkpoint_v2 = wasmExports["le"];
        Module["_sqlite3_wal_checkpoint"] = _sqlite3_wal_checkpoint = wasmExports["me"];
        Module["_sqlite3_error_offset"] = _sqlite3_error_offset = wasmExports["ne"];
        Module["_sqlite3_errmsg16"] = _sqlite3_errmsg16 = wasmExports["oe"];
        Module["_sqlite3_errcode"] = _sqlite3_errcode = wasmExports["pe"];
        Module["_sqlite3_extended_errcode"] = _sqlite3_extended_errcode = wasmExports["qe"];
        Module["_sqlite3_system_errno"] = _sqlite3_system_errno = wasmExports["re"];
        Module["_sqlite3_errstr"] = _sqlite3_errstr = wasmExports["se"];
        Module["_sqlite3_limit"] = _sqlite3_limit = wasmExports["te"];
        Module["_sqlite3_open"] = _sqlite3_open = wasmExports["ue"];
        Module["_sqlite3_open_v2"] = _sqlite3_open_v2 = wasmExports["ve"];
        Module["_sqlite3_open16"] = _sqlite3_open16 = wasmExports["we"];
        Module["_sqlite3_create_collation"] = _sqlite3_create_collation = wasmExports["xe"];
        Module["_sqlite3_create_collation_v2"] = _sqlite3_create_collation_v2 = wasmExports["ye"];
        Module["_sqlite3_create_collation16"] = _sqlite3_create_collation16 = wasmExports["ze"];
        Module["_sqlite3_collation_needed"] = _sqlite3_collation_needed = wasmExports["Ae"];
        Module["_sqlite3_collation_needed16"] = _sqlite3_collation_needed16 = wasmExports["Be"];
        Module["_sqlite3_get_clientdata"] = _sqlite3_get_clientdata = wasmExports["Ce"];
        Module["_sqlite3_set_clientdata"] = _sqlite3_set_clientdata = wasmExports["De"];
        Module["_sqlite3_get_autocommit"] = _sqlite3_get_autocommit = wasmExports["Ee"];
        Module["_sqlite3_table_column_metadata"] = _sqlite3_table_column_metadata = wasmExports["Fe"];
        Module["_sqlite3_sleep"] = _sqlite3_sleep = wasmExports["Ge"];
        Module["_sqlite3_extended_result_codes"] = _sqlite3_extended_result_codes = wasmExports["He"];
        Module["_sqlite3_file_control"] = _sqlite3_file_control = wasmExports["Ie"];
        Module["_sqlite3_test_control"] = _sqlite3_test_control = wasmExports["Je"];
        Module["_sqlite3_create_filename"] = _sqlite3_create_filename = wasmExports["Ke"];
        Module["_sqlite3_free_filename"] = _sqlite3_free_filename = wasmExports["Le"];
        Module["_sqlite3_uri_parameter"] = _sqlite3_uri_parameter = wasmExports["Me"];
        Module["_sqlite3_uri_key"] = _sqlite3_uri_key = wasmExports["Ne"];
        Module["_sqlite3_uri_boolean"] = _sqlite3_uri_boolean = wasmExports["Oe"];
        Module["_sqlite3_uri_int64"] = _sqlite3_uri_int64 = wasmExports["Pe"];
        Module["_sqlite3_filename_database"] = _sqlite3_filename_database = wasmExports["Qe"];
        Module["_sqlite3_filename_journal"] = _sqlite3_filename_journal = wasmExports["Re"];
        Module["_sqlite3_filename_wal"] = _sqlite3_filename_wal = wasmExports["Se"];
        Module["_sqlite3_db_name"] = _sqlite3_db_name = wasmExports["Te"];
        Module["_sqlite3_db_filename"] = _sqlite3_db_filename = wasmExports["Ue"];
        Module["_sqlite3_db_readonly"] = _sqlite3_db_readonly = wasmExports["Ve"];
        Module["_sqlite3_compileoption_used"] = _sqlite3_compileoption_used = wasmExports["We"];
        Module["_sqlite3_compileoption_get"] = _sqlite3_compileoption_get = wasmExports["Xe"];
        Module["_sqlite3session_create"] = _sqlite3session_create = wasmExports["Ye"];
        Module["_sqlite3session_delete"] = _sqlite3session_delete = wasmExports["Ze"];
        Module["_sqlite3session_attach"] = _sqlite3session_attach = wasmExports["_e"];
        Module["_sqlite3session_changeset"] = _sqlite3session_changeset = wasmExports["$e"];
        Module["_sqlite3session_enable"] = _sqlite3session_enable = wasmExports["af"];
        Module["_sqlite3changeset_invert"] = _sqlite3changeset_invert = wasmExports["bf"];
        Module["_sqlite3changeset_apply"] = _sqlite3changeset_apply = wasmExports["cf"];
        Module["_sqlite3_sourceid"] = _sqlite3_sourceid = wasmExports["df"];
        Module["_malloc"] = _malloc = wasmExports["ef"];
        Module["_free"] = _free = wasmExports["ff"];
        Module["_RegisterExtensionFunctions"] = _RegisterExtensionFunctions = wasmExports["gf"];
        Module["_getSqliteFree"] = _getSqliteFree = wasmExports["hf"];
        Module["_main"] = _main = wasmExports["jf"];
        Module["_libauthorizer_set_authorizer"] = _libauthorizer_set_authorizer = wasmExports["kf"];
        Module["_libfunction_create_function"] = _libfunction_create_function = wasmExports["lf"];
        Module["_libhook_commit_hook"] = _libhook_commit_hook = wasmExports["mf"];
        Module["_libhook_update_hook"] = _libhook_update_hook = wasmExports["nf"];
        Module["_libprogress_progress_handler"] = _libprogress_progress_handler = wasmExports["of"];
        Module["_libvfs_vfs_register"] = _libvfs_vfs_register = wasmExports["pf"];
        _emscripten_builtin_memalign = wasmExports["rf"];
        __emscripten_timeout = wasmExports["sf"];
        __emscripten_tempret_get = wasmExports["tf"];
        __emscripten_stack_restore = wasmExports["uf"];
        __emscripten_stack_alloc = wasmExports["vf"];
        _emscripten_stack_get_current = wasmExports["wf"];
        dynCall_viiiiijj = wasmExports["dynCall_viiiiijj"];
        dynCall_viji = wasmExports["dynCall_viji"];
        dynCall_viiiij = wasmExports["dynCall_viiiij"];
        dynCall_iij = wasmExports["dynCall_iij"];
        dynCall_iiiij = wasmExports["dynCall_iiiij"];
        dynCall_iijii = wasmExports["dynCall_iijii"];
        dynCall_iiji = wasmExports["dynCall_iiji"];
        dynCall_iiiiiij = wasmExports["dynCall_iiiiiij"];
      }
      var _sqlite3_version = Module["_sqlite3_version"] = 5472;
      var wasmImports = {
        a: ___assert_fail,
        aa: ___syscall_chmod,
        da: ___syscall_faccessat,
        ba: ___syscall_fchmod,
        $: ___syscall_fchown32,
        b: ___syscall_fcntl64,
        _: ___syscall_fstat64,
        y: ___syscall_ftruncate64,
        U: ___syscall_getcwd,
        Y: ___syscall_lstat64,
        R: ___syscall_mkdirat,
        X: ___syscall_newfstatat,
        P: ___syscall_openat,
        N: ___syscall_readlinkat,
        M: ___syscall_rmdir,
        Z: ___syscall_stat64,
        K: ___syscall_unlinkat,
        J: ___syscall_utimensat,
        F: __abort_js,
        E: __emscripten_runtime_keepalive_clear,
        w: __localtime_js,
        u: __mmap_js,
        v: __munmap_js,
        G: __setitimer_js,
        Q: __tzset_js,
        n: _emscripten_date_now,
        g: _emscripten_get_now,
        H: _emscripten_resize_heap,
        S: _environ_get,
        T: _environ_sizes_get,
        o: _fd_close,
        I: _fd_fdstat_get,
        O: _fd_read,
        x: _fd_seek,
        V: _fd_sync,
        L: _fd_write,
        s: _ipp,
        t: _ipp_async,
        ka: _ippipppp,
        oa: _ippipppp_async,
        j: _ippp,
        k: _ippp_async,
        c: _ipppi,
        d: _ipppi_async,
        ga: _ipppiii,
        ha: _ipppiii_async,
        ia: _ipppiiip,
        ja: _ipppiiip_async,
        h: _ipppip,
        i: _ipppip_async,
        z: _ipppj,
        A: _ipppj_async,
        e: _ipppp,
        f: _ipppp_async,
        ea: _ippppi,
        fa: _ippppi_async,
        B: _ippppij,
        C: _ippppij_async,
        p: _ippppip,
        q: _ippppip_async,
        la: _ipppppip,
        ma: _ipppppip_async,
        D: _proc_exit,
        na: _vppippii,
        r: _vppippii_async,
        l: _vppp,
        m: _vppp_async,
        W: _vpppip,
        ca: _vpppip_async
      };
      var wasmExports = await createWasm();
      function callMain() {
        var entryFunction = _main;
        var argc = 0;
        var argv = 0;
        try {
          var ret = entryFunction(argc, argv);
          exitJS(ret, true);
          return ret;
        } catch (e) {
          return handleException(e);
        }
      }
      function run() {
        if (runDependencies > 0) {
          dependenciesFulfilled = run;
          return;
        }
        preRun();
        if (runDependencies > 0) {
          dependenciesFulfilled = run;
          return;
        }
        function doRun() {
          Module["calledRun"] = true;
          if (ABORT) return;
          initRuntime();
          preMain();
          readyPromiseResolve?.(Module);
          Module["onRuntimeInitialized"]?.();
          var noInitialRun = Module["noInitialRun"] || false;
          if (!noInitialRun) callMain();
          postRun();
        }
        if (Module["setStatus"]) {
          Module["setStatus"]("Running...");
          setTimeout(() => {
            setTimeout(() => Module["setStatus"](""), 1);
            doRun();
          }, 1);
        } else {
          doRun();
        }
      }
      function preInit() {
        if (Module["preInit"]) {
          if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
          while (Module["preInit"].length > 0) {
            Module["preInit"].shift()();
          }
        }
      }
      preInit();
      run();
      (function () {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        let pAsyncFlags = 0;
        Module["set_authorizer"] = function (db, xAuthorizer, pApp) {
          if (pAsyncFlags) {
            Module["deleteCallback"](pAsyncFlags);
            Module["_sqlite3_free"](pAsyncFlags);
            pAsyncFlags = 0;
          }
          pAsyncFlags = Module["_sqlite3_malloc"](4);
          setValue(pAsyncFlags, xAuthorizer instanceof AsyncFunction ? 1 : 0, "i32");
          const result = ccall("libauthorizer_set_authorizer", "number", ["number", "number", "number"], [db, xAuthorizer ? 1 : 0, pAsyncFlags]);
          if (!result && xAuthorizer) {
            Module["setCallback"](pAsyncFlags, (_, iAction, p3, p4, p5, p6) => xAuthorizer(pApp, iAction, p3, p4, p5, p6));
          }
          return result;
        };
      })();
      (function () {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const FUNC_METHODS = ["xFunc", "xStep", "xFinal"];
        const mapFunctionNameToKey = new Map();
        Module["create_function"] = function (db, zFunctionName, nArg, eTextRep, pApp, xFunc, xStep, xFinal) {
          const pAsyncFlags = Module["_sqlite3_malloc"](4);
          const target = {
            xFunc,
            xStep,
            xFinal
          };
          setValue(pAsyncFlags, FUNC_METHODS.reduce((mask, method, i) => {
            if (target[method] instanceof AsyncFunction) {
              return mask | 1 << i;
            }
            return mask;
          }, 0), "i32");
          const result = ccall("libfunction_create_function", "number", ["number", "string", "number", "number", "number", "number", "number", "number"], [db, zFunctionName, nArg, eTextRep, pAsyncFlags, xFunc ? 1 : 0, xStep ? 1 : 0, xFinal ? 1 : 0]);
          if (!result) {
            if (mapFunctionNameToKey.has(zFunctionName)) {
              const oldKey = mapFunctionNameToKey.get(zFunctionName);
              Module["deleteCallback"](oldKey);
            }
            mapFunctionNameToKey.set(zFunctionName, pAsyncFlags);
            Module["setCallback"](pAsyncFlags, {
              xFunc,
              xStep,
              xFinal
            });
          }
          return result;
        };
      })();
      (function () {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        let pAsyncFlags = 0;
        Module["update_hook"] = function (db, xUpdateHook) {
          if (pAsyncFlags) {
            Module["deleteCallback"](pAsyncFlags);
            Module["_sqlite3_free"](pAsyncFlags);
            pAsyncFlags = 0;
          }
          pAsyncFlags = Module["_sqlite3_malloc"](4);
          setValue(pAsyncFlags, xUpdateHook instanceof AsyncFunction ? 1 : 0, "i32");
          ccall("libhook_update_hook", "void", ["number", "number", "number"], [db, xUpdateHook ? 1 : 0, pAsyncFlags]);
          if (xUpdateHook) {
            Module["setCallback"](pAsyncFlags, (_, iUpdateType, dbName, tblName, lo32, hi32) => xUpdateHook(iUpdateType, dbName, tblName, lo32, hi32));
          }
        };
      })();
      (function () {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        let pAsyncFlags = 0;
        Module["commit_hook"] = function (db, xCommitHook) {
          if (pAsyncFlags) {
            Module["deleteCallback"](pAsyncFlags);
            Module["_sqlite3_free"](pAsyncFlags);
            pAsyncFlags = 0;
          }
          pAsyncFlags = Module["_sqlite3_malloc"](4);
          setValue(pAsyncFlags, xCommitHook instanceof AsyncFunction ? 1 : 0, "i32");
          ccall("libhook_commit_hook", "void", ["number", "number", "number"], [db, xCommitHook ? 1 : 0, pAsyncFlags]);
          if (xCommitHook) {
            Module["setCallback"](pAsyncFlags, _ => xCommitHook());
          }
        };
      })();
      (function () {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        let pAsyncFlags = 0;
        Module["progress_handler"] = function (db, nOps, xProgress, pApp) {
          if (pAsyncFlags) {
            Module["deleteCallback"](pAsyncFlags);
            Module["_sqlite3_free"](pAsyncFlags);
            pAsyncFlags = 0;
          }
          pAsyncFlags = Module["_sqlite3_malloc"](4);
          setValue(pAsyncFlags, xProgress instanceof AsyncFunction ? 1 : 0, "i32");
          ccall("libprogress_progress_handler", "number", ["number", "number", "number", "number"], [db, nOps, xProgress ? 1 : 0, pAsyncFlags]);
          if (xProgress) {
            Module["setCallback"](pAsyncFlags, _ => xProgress(pApp));
          }
        };
      })();
      (function () {
        const VFS_METHODS = ["xOpen", "xDelete", "xAccess", "xFullPathname", "xRandomness", "xSleep", "xCurrentTime", "xGetLastError", "xCurrentTimeInt64", "xClose", "xRead", "xWrite", "xTruncate", "xSync", "xFileSize", "xLock", "xUnlock", "xCheckReservedLock", "xFileControl", "xSectorSize", "xDeviceCharacteristics", "xShmMap", "xShmLock", "xShmBarrier", "xShmUnmap"];
        const mapVFSNameToKey = new Map();
        Module["vfs_register"] = function (vfs, makeDefault) {
          let methodMask = 0;
          let asyncMask = 0;
          VFS_METHODS.forEach((method, i) => {
            if (vfs[method]) {
              methodMask |= 1 << i;
              if (vfs["hasAsyncMethod"](method)) {
                asyncMask |= 1 << i;
              }
            }
          });
          const vfsReturn = Module["_sqlite3_malloc"](4);
          try {
            const result = ccall("libvfs_vfs_register", "number", ["string", "number", "number", "number", "number", "number"], [vfs.name, vfs.mxPathname, methodMask, asyncMask, makeDefault ? 1 : 0, vfsReturn]);
            if (!result) {
              if (mapVFSNameToKey.has(vfs.name)) {
                const oldKey = mapVFSNameToKey.get(vfs.name);
                Module["deleteCallback"](oldKey);
              }
              const key = getValue(vfsReturn, "*");
              mapVFSNameToKey.set(vfs.name, key);
              Module["setCallback"](key, vfs);
            }
            return result;
          } finally {
            Module["_sqlite3_free"](vfsReturn);
          }
        };
      })();
      if (runtimeInitialized) {
        moduleRtn = Module;
      } else {
        moduleRtn = new Promise((resolve, reject) => {
          readyPromiseResolve = resolve;
          readyPromiseReject = reject;
        });
      }
      return moduleRtn;
    };
  })();
  if (typeof exports === 'object' && typeof module === 'object') {
    module.exports = Module;
    // This default export looks redundant, but it allows TS to import this
    // commonjs style module.
    module.exports.default = Module;
  } else if (typeof define === 'function' && define['amd']) define([], () => Module);
},2887,[],"node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.js");
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  // Used by metro.config.js as a stub for assets/modules unsupported on web
  // (e.g., expo-sqlite/web/worker.ts which imports a .wasm file Metro can't resolve).
  module.exports = {};
  module.exports.default = {};
},2888,[],"__mocks__/empty-module.js");
__r(2876);