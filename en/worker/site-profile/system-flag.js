// ============================================================
// SITE PROFILE: master switch for the whole configurable-platform system (Phase 10)
//
// ON (the default, and today's behaviour): the stored configuration is enforced, the Configuration screen and the welcome panel
// are shown and configuration writes are accepted.
// OFF: the resolver returns the Full platform with no module gating, the Configuration entry and the welcome panel are hidden,
// and every configuration write is refused with the code "config_system_off". NOTHING stored is deleted or changed, so turning
// the system back on restores the stored configuration exactly.
//
// Two places can hold the switch; the environment variable wins:
//   env.CONFIGURABLE_PLATFORM   "off" | "on" (also 0/1, false/true, disabled/enabled, no/yes)
//   settings key configurable_platform   same values
// Missing, empty or unreadable means ON (the default; the same as before this switch existed).
// ============================================================

export const SYSTEM_ENV = "CONFIGURABLE_PLATFORM";
export const SYSTEM_KEY = "configurable_platform";
export const SYSTEM_OFF_CODE = "config_system_off";
export const SYSTEM_OFF_MESSAGE = "The configurable platform is switched off for this site. Stored configuration is kept. Switch it back on to change it.";

const OFF = new Set(["off", "0", "false", "disabled", "no"]);
const ON = new Set(["on", "1", "true", "enabled", "yes"]);

/** true (on) | false (off) | null (not a recognised value, i.e. no opinion). */
export function parseFlag(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (OFF.has(s)) return false;
  if (ON.has(s)) return true;
  return null;
}

/** The environment variable's opinion: true, false or null. Needs no I/O. */
export const envFlag = (env) => parseFlag(env ? env[SYSTEM_ENV] : null);

/** Combine the two sources. envValue and settingValue are raw values. -> { enabled, source: "env"|"setting"|"default" } */
export function resolveFlag(envValue, settingValue) {
  const e = parseFlag(envValue);
  if (e !== null) return { enabled: e, source: "env" };
  const s = parseFlag(settingValue);
  if (s !== null) return { enabled: s, source: "setting" };
  return { enabled: true, source: "default" };
}

/** Full state for the dashboard and the Super API. Never throws; an unreadable setting counts as "no opinion". */
export async function getSystemFlag(env) {
  const envRaw = env ? env[SYSTEM_ENV] : undefined;
  let setting = null;
  try {
    if (env?.DB) setting = (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(SYSTEM_KEY).first())?.value ?? null;
  } catch { setting = null; }
  const r = resolveFlag(envRaw, setting);
  return { enabled: r.enabled, source: r.source, envOverride: parseFlag(envRaw) !== null, env: parseFlag(envRaw) === null ? null : (parseFlag(envRaw) ? "on" : "off"), setting: parseFlag(setting) === null ? null : (parseFlag(setting) ? "on" : "off") };
}

/** Store the settings-key switch. Refused (not written) when the environment variable decides. */
export async function setSystemFlag(env, enabled) {
  if (envFlag(env) !== null) return { ok: false, status: 409, code: "flag_set_by_environment", error: `The switch is fixed by the ${SYSTEM_ENV} environment variable. Change or remove it there.` };
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)").bind(SYSTEM_KEY, enabled ? "on" : "off").run();
  return { ok: true, ...(await getSystemFlag(env)) };
}

// Profiles handed out while the switch is OFF are tagged here (a WeakSet keeps the profile's own shape unchanged).
const OFF_PROFILES = new WeakSet();
export const markSystemOff = (profile) => { if (profile && typeof profile === "object") OFF_PROFILES.add(profile); return profile; };
export const systemIsOff = (profile) => !!profile && typeof profile === "object" && OFF_PROFILES.has(profile);

/** Cheap check used on write paths. */
export async function systemEnabled(env) { return (await getSystemFlag(env)).enabled; }

/** A JSON 403 for a refused configuration write, or null when writes are allowed. */
export async function refuseWhenOff(env) {
  if (await systemEnabled(env)) return null;
  return new Response(JSON.stringify({ success: false, code: SYSTEM_OFF_CODE, error: SYSTEM_OFF_MESSAGE }), {
    status: 403, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
