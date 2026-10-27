import test from "node:test";
import assert from "node:assert/strict";
import { siteAccessResponse, resetSiteAccessCacheForTests } from "../worker/site-access-gate.js";

async function signature(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(payload))))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function envFor(record, {throwRead=false}={}) { return { SUPER_API_SECRET:"test-secret", DB:{ prepare(sql){ return { async first(){ if(throwRead) throw new Error("db offline"); return {value:JSON.stringify(record)}; } }; } } }; }
async function record(state, issuedAt=Date.now(), generation=1) { const payload={state,issuedAt,generation,siteId:"site-test"}; return {payload,signature:await signature("test-secret",payload)}; }

test("suspended site returns neutral unavailable page", async()=>{resetSiteAccessCacheForTests();const r=await siteAccessResponse(new Request("https://site.test/"),envFor(await record("suspended")));assert.equal(r.status,503);assert.match(await r.text(),/Temporarily unavailable/);assert.equal(r.headers.get("cache-control"),"no-store");});
test("serving state does not gate the tenant", async()=>{resetSiteAccessCacheForTests();assert.equal(await siteAccessResponse(new Request("https://site.test/"),envFor(await record("serving"))),null);});
test("missing state fails open", async()=>{resetSiteAccessCacheForTests();const env={SUPER_API_SECRET:"test-secret",DB:{prepare(){return {async first(){return null}}}}};assert.equal(await siteAccessResponse(new Request("https://site.test/"),env),null);});
test("stale signed state fails open", async()=>{resetSiteAccessCacheForTests();assert.equal(await siteAccessResponse(new Request("https://site.test/"),envFor(await record("closed",Date.now()-601000))),null);});
test("database outage fails open", async()=>{resetSiteAccessCacheForTests();assert.equal(await siteAccessResponse(new Request("https://site.test/"),envFor(null,{throwRead:true})),null);});
test("Super API is not intercepted by the public serve gate", async()=>{resetSiteAccessCacheForTests();const r=await siteAccessResponse(new Request("https://site.test/en/api/super/health"),envFor(await record("suspended")));assert.equal(r,null);});

import { handleSetSiteAccessState } from "../worker/super/handlers/site-access.js";
test("invalid state signature is refused without changing tenant state", async()=>{let writes=0;const payload={state:"suspended",issuedAt:Date.now(),generation:1,siteId:"site-test"};const env={SUPER_API_SECRET:"test-secret",DB:{prepare(sql){return {bind(){return this},async first(){return null},async run(){writes++;return {success:true}}}}}};const response=await handleSetSiteAccessState(new Request("https://site.test/en/api/super/site-access-state",{method:"PUT",body:JSON.stringify({payload,signature:"00"})}),env,null,JSON.stringify({payload,signature:"00"}));assert.equal(response.status,401);assert.equal(writes,0);});

test("public API routes are gated too, while the HMAC Super API remains reachable", async()=>{resetSiteAccessCacheForTests();const r=await siteAccessResponse(new Request("https://site.test/api/public/content"),envFor(await record("suspended")));assert.equal(r.status,503);});
