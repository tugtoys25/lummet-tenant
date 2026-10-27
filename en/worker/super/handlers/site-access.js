import { fail, ok, readJsonBody } from "./helpers.js";

export function hex(buffer) { return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function sign(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(payload))));
}
export function equal(a,b) { if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false; let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0; }
export async function handleSetSiteAccessState(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const p = body.payload;
  if (!p || !["serving","suspended","closed"].includes(p.state) || !Number.isFinite(p.issuedAt) || !Number.isFinite(p.generation) || p.generation < 1) return fail("invalid_site_access_state", 422);
  if (Date.now() - p.issuedAt > 24*60*60*1000 || p.issuedAt > Date.now()+5*60*1000) return fail("stale_site_access_state", 422);
  if (!env.SUPER_API_SECRET || !equal(await sign(env.SUPER_API_SECRET, p), body.signature)) return fail("invalid_site_access_signature", 401);
  const priorRaw = await env.DB.prepare("SELECT value FROM system_settings WHERE key='__lummet_site_access_state'").first();
  if (priorRaw?.value) { try { const prior=JSON.parse(priorRaw.value); if(Number(prior.payload?.generation||0) >= p.generation) return ok({accepted:false,reason:"stale_generation"}); } catch {} }
  await env.DB.prepare("INSERT INTO system_settings(key,value,updated_at) VALUES('__lummet_site_access_state',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({payload:p,signature:body.signature})).run();
  return ok({accepted:true,generation:p.generation});
}
