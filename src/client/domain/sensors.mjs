const SENSOR_TEMP_PROMOTE_TYPES = new Set(["humidity", "illuminance"]);
const SENSOR_FILTER_TYPE_KEYS = new Set([
  "temp", "motion", "shock", "contact", "leak", "smoke", "humidity",
  "illuminance", "presence", "valve", "generic",
]);
const SENSOR_EX_KEY_TO_FILTER_TYPE = {
  temperature: "temp",
  humidity: "humidity",
  illuminance: "illuminance",
  motion: "motion",
  contact: "contact",
  water: "leak",
  smoke: "smoke",
  presence: "presence",
  acceleration: "shock",
  shock: "shock",
  vibration: "shock",
};
const SENSOR_CARDWORTHY_EX_ATTRS = new Set([
  "battery", "temperature", "humidity", "illuminance", "pressure", "co2", "carbonmonoxide",
]);
const SENSOR_SKIP_ATTRS = new Set([
  "lastupdate", "lastevent", "epevent", "devicewatch-devicestatus", "checkinterval", "status", "name",
  "switch", "power", "energy", "rssi", "lqi", "lastactivity", "lastopened", "lastclosed", "datatype",
  "level", "healthstatus", "tamper", "enrollment", "encap", "destinationendpoint", "cluster", "fccdeviceclass", "firmware",
  "hardware", "software", "supportedthermostatmodes", "supportedfanmodes",
]);
const SENSOR_PRIMARY_ATTRS = {
  motion: new Set(["motion", "motionstatus"]),
  shock: new Set(["acceleration", "shock", "vibration", "moving"]),
  contact: new Set(["contact"]),
  leak: new Set(["water"]),
  presence: new Set(["presence"]),
  humidity: new Set(["humidity", "relativehumidity"]),
  illuminance: new Set(["illuminance"]),
  smoke: new Set(["smoke", "carbonmonoxide"]),
  valve: new Set(["valve"]),
};
const SENSOR_LAST_EVENT_TYPES = new Set(["smoke", "leak", "contact", "motion", "presence", "shock"]);
const SENSOR_EX_MAX = 6;

function normalizeRoomId(roomId) {
  if (roomId == null || roomId === "null" || roomId === "" || roomId === -1 || roomId === "-1") return -1;
  const number = Number(roomId);
  return Number.isFinite(number) ? number : -1;
}

function sensorExFooterExcludeForType(type) {
  if (type === "temp") return ["temperature"];
  if (type === "humidity") return ["humidity"];
  if (type === "illuminance") return ["illuminance"];
  return [];
}

function mergeSensorExEntries(parts, excludeKeys) {
  const exclude = new Set((excludeKeys || []).map((key) => String(key).toLowerCase()));
  const seen = new Set();
  const output = [];
  for (const list of parts) {
    for (const entry of list || []) {
      const key = String(entry?.k || "").toLowerCase();
      if (!key || exclude.has(key) || seen.has(key)) continue;
      seen.add(key);
      output.push({ k: entry.k, v: entry.v, u: entry.u ?? null });
    }
  }
  return output;
}

function resolveMergedSensorBattery(tempRecord, sensorRecord, extras) {
  const batteryExtra = (extras || []).find((entry) => entry.k === "battery");
  const battery = tempRecord?.bat ?? sensorRecord?.bat ?? (batteryExtra ? batteryExtra.v : null);
  return battery != null && battery !== "" ? battery : null;
}

function tempPrimaryCardFromRecord(tempRecord) {
  return {
    i: tempRecord.i,
    n: tempRecord.n,
    r: tempRecord.r,
    t: "temp",
    v: tempRecord.temp,
    u: tempRecord.u,
    a: 0,
    ex: tempRecord.ex || [],
    bat: tempRecord.bat ?? null,
    _ref: tempRecord,
  };
}

function environmentalTempPrimaryCard(tempRecord, sensorRecord) {
  const extraParts = [];
  if (sensorRecord.v != null && sensorRecord.v !== "") {
    extraParts.push([{ k: sensorRecord.t, v: sensorRecord.v, u: sensorRecord.u ?? null }]);
  }
  extraParts.push(sensorRecord.ex || [], tempRecord.ex || []);
  const extras = mergeSensorExEntries(extraParts, ["temperature"]);
  return {
    i: tempRecord.i,
    n: tempRecord.n || sensorRecord.n,
    r: tempRecord.r ?? sensorRecord.r,
    t: "temp",
    v: tempRecord.temp,
    u: tempRecord.u,
    a: 0,
    ex: extras,
    bat: resolveMergedSensorBattery(tempRecord, sensorRecord, extras),
    le: sensorRecord.le ?? null,
    _ref: tempRecord,
    _senRef: sensorRecord,
  };
}

function sensorPrimaryCard(sensorRecord, tempRecord) {
  const extraParts = [sensorRecord.ex || []];
  if (tempRecord) {
    extraParts.push([{ k: "temperature", v: tempRecord.temp, u: tempRecord.u ?? null }]);
    extraParts.push(tempRecord.ex || []);
  }
  const extras = mergeSensorExEntries(extraParts, sensorExFooterExcludeForType(sensorRecord.t));
  return {
    i: sensorRecord.i,
    n: sensorRecord.n || tempRecord?.n,
    r: sensorRecord.r ?? tempRecord?.r,
    t: sensorRecord.t,
    v: sensorRecord.v,
    a: sensorRecord.a,
    ex: extras,
    bat: resolveMergedSensorBattery(tempRecord, sensorRecord, extras),
    le: sensorRecord.le ?? null,
    _ref: sensorRecord,
    _tempRef: tempRecord || null,
  };
}

export function buildMergedSensorCard(tempRecord, sensorRecord) {
  if (tempRecord && sensorRecord && SENSOR_TEMP_PROMOTE_TYPES.has(sensorRecord.t)) {
    return environmentalTempPrimaryCard(tempRecord, sensorRecord);
  }
  if (sensorRecord) return sensorPrimaryCard(sensorRecord, tempRecord);
  if (tempRecord) return tempPrimaryCardFromRecord(tempRecord);
  return null;
}

export function sensorCardFilterTypes(device) {
  const types = new Set();
  const add = (type) => {
    if (type && SENSOR_FILTER_TYPE_KEYS.has(type)) types.add(type);
  };
  add(device?.t);
  add(device?._senRef?.t);
  if (device?._tempRef) add("temp");
  for (const entry of device?.ex || []) {
    const key = String(entry.k || "").toLowerCase();
    add(SENSOR_EX_KEY_TO_FILTER_TYPE[key] || (SENSOR_FILTER_TYPE_KEYS.has(key) ? key : null));
  }
  return types;
}

export function sensorTemperatureReading(device) {
  if (device?.temp != null && device.temp !== "") {
    const temperature = Number(device.temp);
    if (!Number.isNaN(temperature)) return { temp: temperature, u: device.u ?? null };
  }
  const entry = (device?.ex || []).find((item) => String(item.k || "").toLowerCase() === "temperature");
  if (entry?.v == null || entry.v === "") return null;
  const temperature = Number(entry.v);
  return Number.isNaN(temperature) ? null : { temp: temperature, u: entry.u ?? device.u ?? null };
}

export function climateSensorsByRoom(tempSensors, sensors) {
  const byRoom = new Map();
  const dedicatedRooms = new Set();
  const seenIds = new Set();
  for (const sensor of tempSensors || []) {
    const roomId = normalizeRoomId(sensor.r);
    if (!byRoom.has(roomId)) byRoom.set(roomId, []);
    byRoom.get(roomId).push(sensor);
    dedicatedRooms.add(roomId);
    seenIds.add(Number(sensor.i));
  }
  for (const sensor of sensors || []) {
    if (seenIds.has(Number(sensor.i)) || !sensorTemperatureReading(sensor)) continue;
    const roomId = normalizeRoomId(sensor.r);
    if (dedicatedRooms.has(roomId)) continue;
    if (!byRoom.has(roomId)) byRoom.set(roomId, []);
    byRoom.get(roomId).push(sensor);
  }
  return byRoom;
}

export function syncTempSensorFromSensorEntry(tempRecord, sensorRecord) {
  if (!tempRecord || !sensorRecord) return false;
  const entry = (sensorRecord.ex || []).find((item) => item.k === "temperature");
  if (entry?.v == null || entry.v === "") return false;
  tempRecord.temp = Number(entry.v);
  return true;
}

export function sensorExKeyAllowed(key, sensorType) {
  const normalized = String(key || "").toLowerCase();
  if (!normalized) return false;
  return sensorType === "generic"
    ? !SENSOR_SKIP_ATTRS.has(normalized)
    : SENSOR_CARDWORTHY_EX_ATTRS.has(normalized);
}

export function filterSensorExForType(extras, sensorType) {
  return (extras || []).filter((entry) => entry && sensorExKeyAllowed(entry.k, sensorType));
}

export function applyTempSensorPayload(sensor, payload) {
  if (payload.temp != null) sensor.temp = payload.temp;
  if (payload.bat != null) sensor.bat = payload.bat;
  if (Array.isArray(payload.ex)) {
    sensor.ex = filterSensorExForType(payload.ex, "temp")
      .map((entry) => ({ k: entry.k, v: entry.v, u: entry.u ?? null }));
  }
}

export function applySensorPayload(sensor, payload) {
  if (payload.t != null) sensor.t = payload.t;
  if (payload.v !== undefined) sensor.v = payload.v;
  if (payload.a != null) sensor.a = payload.a ? 1 : 0;
  if (payload.le != null) sensor.le = Number(payload.le);
  if (Array.isArray(payload.ex)) {
    const type = payload.t ?? sensor.t ?? "generic";
    sensor.ex = filterSensorExForType(payload.ex, type)
      .map((entry) => ({ k: entry.k, v: entry.v, u: entry.u ?? null }));
  }
}

function sensorIsPrimaryAttr(type, attributeName) {
  return SENSOR_PRIMARY_ATTRS[type]?.has(String(attributeName || "").toLowerCase()) || false;
}

function normalizeSensorWsValue(type, attribute, value) {
  if (value == null) return value;
  const normalized = String(value).trim().toLowerCase();
  const attributeName = String(attribute || "").toLowerCase();
  if (type === "motion") {
    if (normalized === "on" || normalized === "true") return "active";
    if (normalized === "off" || normalized === "false") return "inactive";
  } else if (type === "shock") {
    if (["on", "true", "active"].includes(normalized)) return "active";
    if (["off", "false", "inactive"].includes(normalized)) return "inactive";
  } else if (type === "contact") {
    if (normalized === "on" || normalized === "true") return "open";
    if (normalized === "off" || normalized === "false") return "closed";
  } else if (type === "leak") {
    if (normalized === "true" || normalized === "wet") return "wet";
    if (normalized === "false" || normalized === "dry") return "dry";
  } else if (type === "presence") {
    if (["home", "true"].includes(normalized)) return "present";
    if (["away", "false", "not home", "not present"].includes(normalized)) return "not present";
  } else if (type === "smoke") {
    if (normalized === "tested" || normalized === "monitored") return "clear";
    if (attributeName === "carbonmonoxide" && ["detected", "co"].includes(normalized)) return "detected";
  }
  return normalized;
}

function sensorAlertFlag(type, value) {
  const alerts = {
    motion: ["active"], shock: ["active"], contact: ["open"], leak: ["wet"],
    smoke: ["detected"], presence: ["present"], valve: ["open"],
  };
  return (alerts[type] || []).includes(String(value || "").toLowerCase()) ? 1 : 0;
}

function parseSensorEventTimeMs(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return number < 10000000000 ? number * 1000 : number;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function applyTempSensorWsAttr(sensor, attributeName, value, unit) {
  const normalizedName = String(attributeName || "").toLowerCase();
  if (normalizedName === "temperature") {
    const number = Number(value);
    if (!Number.isNaN(number)) sensor.temp = Math.round(number);
    return true;
  }
  const key = normalizedName === "relativehumidity" ? "humidity" : normalizedName;
  if (key === "battery") {
    const number = Number(value);
    if (!Number.isNaN(number)) sensor.bat = Math.round(number);
  }
  if (!sensorExKeyAllowed(key, "temp")) return false;
  const extras = sensor.ex || (sensor.ex = []);
  const stored = key === "battery" && !Number.isNaN(Number(value)) ? Math.round(Number(value)) : value;
  const entry = extras.find((item) => item.k === key);
  if (entry) {
    entry.v = stored;
    if (unit) entry.u = unit;
    return true;
  }
  if (extras.length >= SENSOR_EX_MAX) return false;
  extras.push({ k: key, v: stored, u: unit || null });
  return true;
}

export function applySensorWsAttr(sensor, attributeName, value, unit, now = Date.now) {
  const normalizedName = String(attributeName || "").toLowerCase();
  const key = normalizedName === "relativehumidity" ? "humidity" : normalizedName;
  const type = sensor.t || "generic";
  if (["lastactivity", "lastevent", "lastopened", "lastclosed"].includes(key)
      && SENSOR_LAST_EVENT_TYPES.has(type)) {
    const time = parseSensorEventTimeMs(value);
    if (time == null) return false;
    sensor.le = time;
    return true;
  }
  if (sensorExKeyAllowed(key, type) && (type === "generic" || !sensorIsPrimaryAttr(type, key))) {
    const extras = sensor.ex || (sensor.ex = []);
    const entry = extras.find((item) => item.k === key);
    if (entry) {
      entry.v = value;
      if (unit) entry.u = unit;
      return true;
    }
    if (extras.length >= SENSOR_EX_MAX) return false;
    extras.push({ k: key, v: value, u: unit || null });
    return true;
  }
  if (sensorIsPrimaryAttr(type, key) || type === "generic") {
    sensor.v = type === "generic" ? value : normalizeSensorWsValue(type, key, value);
    sensor.a = sensorAlertFlag(type, sensor.v);
    if (SENSOR_LAST_EVENT_TYPES.has(type)) sensor.le = now();
    return true;
  }
  return false;
}

export function applySensorLiveAttr(state, deviceId, attributeName, value, unit, now = Date.now) {
  const id = Number(deviceId);
  const tempSensor = state.tempSensors?.find((sensor) => sensor.i === id);
  const sensor = state.sensors?.find((item) => item.i === id);
  const normalizedName = String(attributeName || "");
  let changed = false;
  let climate = false;
  if (tempSensor) {
    if (normalizedName === "temperature") {
      const number = Number(value);
      if (!Number.isNaN(number)) {
        tempSensor.temp = Math.round(number);
        changed = true;
        climate = true;
      }
    } else if (normalizedName === "battery") {
      const number = Number(value);
      if (!Number.isNaN(number)) {
        tempSensor.bat = Math.round(number);
        changed = true;
      }
    } else if (applyTempSensorWsAttr(tempSensor, normalizedName, value, unit)) {
      changed = true;
    }
  }
  if (sensor && applySensorWsAttr(sensor, normalizedName, value, unit, now)) {
    changed = true;
    if (normalizedName === "temperature") climate = true;
  }
  if (tempSensor && sensor && normalizedName !== "temperature") {
    syncTempSensorFromSensorEntry(tempSensor, sensor);
  }
  return { changed, climate, tempSensor, sensor };
}
