function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !(value instanceof Map) && !(value instanceof Set);
}

export function replaceCollection(target, next) {
  if (Array.isArray(target)) {
    target.length = 0;
    if (Array.isArray(next) && next.length) target.push(...next);
    return target;
  }
  if (target instanceof Map) {
    target.clear();
    if (next instanceof Map || Array.isArray(next)) {
      for (const [key, value] of next) target.set(key, value);
    } else if (isRecord(next)) {
      for (const [key, value] of Object.entries(next)) target.set(key, value);
    }
    return target;
  }
  if (target instanceof Set) {
    target.clear();
    if (next && typeof next[Symbol.iterator] === "function") {
      for (const value of next) target.add(value);
    }
    return target;
  }
  throw new TypeError("Collection target must be an Array, Map, or Set");
}

export function replaceRecord(target, next) {
  if (!isRecord(target)) throw new TypeError("Record target must be a plain object");
  for (const key of Object.keys(target)) delete target[key];
  if (isRecord(next)) Object.assign(target, next);
  return target;
}

export function createStore(initialState = {}) {
  if (!isRecord(initialState)) throw new TypeError("Initial state must be an object");
  const state = initialState;
  const listeners = new Set();

  const notify = (change) => {
    for (const listener of [...listeners]) listener(change, state);
  };

  return {
    state,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Store listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceCollection(key, next) {
      const target = state[key];
      replaceCollection(target, next);
      notify({ type: "replace", key, value: target });
      return target;
    },
    replaceRecord(key, next) {
      const target = state[key];
      replaceRecord(target, next);
      notify({ type: "replace", key, value: target });
      return target;
    },
    patchDevice(id, patch, { collection = "devices", idKey = "i" } = {}) {
      const list = state[collection];
      if (!Array.isArray(list) || !isRecord(patch)) return null;
      const device = list.find((candidate) => String(candidate?.[idKey]) === String(id));
      if (!device) return null;
      Object.assign(device, patch);
      notify({ type: "device-patch", collection, id, patch, value: device });
      return device;
    },
  };
}
