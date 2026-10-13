const FEATURE_HOOKS = ["init", "render", "handleHubEvent", "pause", "resume", "dispose"];
const FEATURE_NAME = /^[a-z][a-z0-9-]*$/;

function instantiateFeature(name, feature, context) {
  if (!FEATURE_NAME.test(name)) throw new TypeError("Invalid feature name");
  const instance = typeof feature === "function" ? feature(context) : feature;
  if (!instance || typeof instance !== "object") {
    throw new TypeError(`Feature ${name} must be an object or constructor`);
  }
  for (const hook of FEATURE_HOOKS) {
    if (instance[hook] != null && typeof instance[hook] !== "function") {
      throw new TypeError(`Feature ${name} hook ${hook} must be a function`);
    }
  }
  return instance;
}

export function createFeatureRegistry(context = { state: {}, services: {}, ui: {} }) {
  const registry = new Map();

  const invoke = async (hook, args, reverse = false) => {
    const features = [...registry.values()];
    if (reverse) features.reverse();
    const results = [];
    for (const feature of features) {
      if (typeof feature[hook] === "function") results.push(await feature[hook](...args));
    }
    return results;
  };

  const api = {
    context,
    registerFeature(name, feature) {
      if (registry.has(name)) throw new Error(`Feature ${name} is already registered`);
      const instance = instantiateFeature(name, feature, context);
      registry.set(name, instance);
      return instance;
    },
    get(name) { return registry.get(name); },
    names() { return [...registry.keys()]; },
    init(...args) { return invoke("init", args); },
    render(...args) { return invoke("render", args); },
    handleHubEvent(...args) { return invoke("handleHubEvent", args); },
    pause(...args) { return invoke("pause", args); },
    resume(...args) { return invoke("resume", args); },
    async dispose(...args) {
      const results = await invoke("dispose", args, true);
      registry.clear();
      return results;
    },
  };
  return api;
}

const defaultRegistry = createFeatureRegistry();

export function registerFeature(name, feature, registry = defaultRegistry) {
  return registry.registerFeature(name, feature);
}
