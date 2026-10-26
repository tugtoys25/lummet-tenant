// Fail-open serve gate: only a fresh, valid HMAC-signed state may block public serving.
const CACHE_MS = 5000;
let cached = { until: 0, state: null, signature: null, payload: null };
function hex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function sign(secret,payload){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(JSON.stringify(payload))));}
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export function resetSiteAccessCacheForTests(){cached={until:0,state:null,signature:null,payload:null};}
export async function siteAccessResponse(request,env,now=Date.now()){
  const path=new URL(request.url).pathname; if(path.startsWith("/en/api/super/")||path.startsWith("/en/admin")) return null;
  if(!env.DB||!env.SUPER_API_SECRET)return null;
  let record=null;
  try { if(now<cached.until) record=cached; else { const row=await env.DB.prepare("SELECT value FROM system_settings WHERE key='__lummet_site_access_state'").first(); if(!row?.value)return null; const parsed=JSON.parse(row.value); const p=parsed.payload; if(!p||!Number.isFinite(p.issuedAt)||!Number.isFinite(p.generation)||!['serving','suspended','closed'].includes(p.state))return null; if(now-p.issuedAt>600000||p.issuedAt>now+300000)return null; if(!equal(await sign(env.SUPER_API_SECRET,p),parsed.signature))return null; record={until:now+CACHE_MS,state:p.state,signature:parsed.signature,payload:p}; cached=record; } } catch(e) { console.error(JSON.stringify({msg:"site_access_gate_fail_open",reason:"state_unavailable"})); return null; }
  if(record?.payload && now-record.payload.issuedAt<=600000 && (record.state==='suspended'||record.state==='closed')) return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Temporarily unavailable</title><main><h1>Temporarily unavailable</h1><p>This site is temporarily unavailable. Please try again later.</p></main></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','retry-after':'60','x-robots-tag':'noindex, nofollow'}});
  return null;
}
