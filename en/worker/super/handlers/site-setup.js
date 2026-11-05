// =====================================================
// SUPER API: site setup (Phase 9)
// How the control plane gives a NEW site its first configuration: a chosen preset, or a copy of another site's
// configuration. The work is done by worker/site-profile/setup.js (draft -> publish, audited); this file only checks the
// request and maps the outcome to a status code.
//   GET  /en/api/super/site-setup          setup state and the presets this site knows
//   POST /en/api/super/site-setup          { preset } | { envelope, sections? }   (only while the setup is pending)
//   GET  /en/api/super/site-config-export  the configuration of THIS site, as a transfer envelope (for copying it)
// =====================================================
import { fail, ok, readJsonBody } from "./helpers.js";
import { getSetup, presetChoices, provisionSite, exportForClone } from "../../site-profile/setup.js";
import { loadProfile } from "../../site-profile/store.js";

const hostOf = (request) => new URL(request.url).hostname;

export async function handleGetSiteSetup(request, env) {
  const profile = await loadProfile(env, hostOf(request));
  return ok({ setup: await getSetup(env), preset: profile.preset, presets: presetChoices() });
}

export async function handleProvisionSiteSetup(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const r = await provisionSite(env, hostOf(request), body);
  if (!r.ok) {
    const { ok: _ok, status, error, ...rest } = r;
    return new Response(JSON.stringify({ success: false, error: r.code || "setup_failed", message: error, ...rest }), { status: status || 422, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const { ok: _ok, ...rest } = r;
  return ok(rest);
}

export async function handleExportSiteConfig(request, env) {
  const raw = new URL(request.url).searchParams.get("sections");
  const sections = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40) : undefined;
  try {
    return ok(await exportForClone(env, hostOf(request), sections));
  } catch (_) {
    return fail("export_failed", 500);
  }
}
