export function schedIdList(raw) {
  if (raw == null || raw === "") return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  const seen = new Set();
  for (const id of arr) {
    if (id == null || id === "" || typeof id === "object") continue;
    const sid = String(id).trim();
    if (!sid || sid === "null" || sid === "undefined" || seen.has(sid)) continue;
    seen.add(sid);
    out.push(sid);
  }
  return out;
}

export function schedThermoThenBits(action = {}) {
  const mode = String(action.mode || "").trim();
  const modeKey = mode.toLowerCase();
  const bits = [];
  const heat = action.heat;
  const cool = action.cool;
  if (modeKey === "off") bits.push("Off");
  else if (modeKey === "cool") bits.push(cool != null && cool !== "" ? "Cool " + cool + "°" : "Cool");
  else if (modeKey === "heat") bits.push(heat != null && heat !== "" ? "Heat " + heat + "°" : "Heat");
  else {
    if (modeKey === "auto") bits.push("Auto");
    else if (mode) bits.push(mode.charAt(0).toUpperCase() + mode.slice(1));
    if (heat != null && heat !== "") bits.push("Heat " + heat + "°");
    if (cool != null && cool !== "") bits.push("Cool " + cool + "°");
  }
  const fan = String(action.fanMode || "").trim();
  if (fan && fan.toLowerCase() !== "auto") bits.push("Fan " + fan);
  return bits;
}
