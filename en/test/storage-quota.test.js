import test from "node:test";
import assert from "node:assert/strict";
import { checkStorageQuota } from "../worker/storage-quota.js";
function env({ mode="off", limit=100, used=80, fail=false }={}) { return { STORAGE_METERING_MODE:mode, DB:{ prepare(sql){ return { async first(){ if(fail) throw new Error("db unavailable"); return sql.includes("platform_storage_limits") ? (limit===null ? null : {max_bytes:limit}) : {bytes:used}; } }; } } }; }
test("storage metering is inert by default", async()=>{ const r=await checkStorageQuota(env({mode:"off",limit:10,used:10}),1); assert.equal(r.allowed,true); assert.equal(r.configured,false); });
test("shadow computes a limit breach without blocking", async()=>{ const r=await checkStorageQuota(env({mode:"shadow",limit:100,used:100}),1); assert.equal(r.allowed,true); assert.equal(r.wouldExceed,true); });
test("enforce refuses uploads over a configured limit", async()=>{ const r=await checkStorageQuota(env({mode:"enforce",limit:100,used:100}),1); assert.equal(r.allowed,false); assert.equal(r.reason,undefined); });
test("enforce fails closed when the limit cannot be verified", async()=>{ const r=await checkStorageQuota(env({mode:"enforce",fail:true}),1); assert.equal(r.allowed,false); assert.equal(r.reason,"storage_metering_unavailable"); });
