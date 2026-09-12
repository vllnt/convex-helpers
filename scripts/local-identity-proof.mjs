// Run with an isolated HOME and CONVEX_AGENT_MODE=anonymous. Local only.
import {
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(".");
const directory = mkdtempSync(join(tmpdir(), "helpers-identity-local-"));
mkdirSync(join(directory, "convex"));
symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
writeFileSync(
  join(directory, "package.json"),
  '{"type":"module","dependencies":{"convex":"1.45.0"}}',
);
writeFileSync(join(directory, "convex.json"), '{"functions":"convex/"}');
copyFileSync(
  join(root, "src/identity.ts"),
  join(directory, "convex/identity.ts"),
);
writeFileSync(
  join(directory, "convex/schema.ts"),
  `import {defineSchema,defineTable} from 'convex/server'; import {v} from 'convex/values'; export default defineSchema({users:defineTable({subject:v.string()}).index('by_subject',['subject'])});`,
);
writeFileSync(
  join(directory, "convex/proof.ts"),
  `import {mutation,query} from './_generated/server.js'; import {v} from 'convex/values'; import {getOrCreateFromAuth} from './identity.js';
export const bootstrap=mutation({args:{},returns:v.id('users'),handler:async(ctx)=>{
 const row=await getOrCreateFromAuth({auth:{getUserIdentity:async()=>({subject:'local-concurrency-proof',issuer:'local-proof'})},trustedIssuer:'local-proof'},{lookup:subject=>ctx.db.query('users').withIndex('by_subject',q=>q.eq('subject',subject)).unique(),insert:async(subject)=>{const id=await ctx.db.insert('users',{subject});return (await ctx.db.get(id))!;}});return row._id;}});
export const count=query({args:{},returns:v.number(),handler:async(ctx)=>(await ctx.db.query('users').collect()).length});`,
);
writeFileSync(
  join(directory, "verify.mjs"),
  `import assert from 'node:assert/strict'; import {ConvexHttpClient} from 'convex/browser'; const clients=Array.from({length:16},()=>new ConvexHttpClient('http://127.0.0.1:3340')); const ids=await Promise.all(clients.map(c=>c.mutation('proof:bootstrap',{}))); assert.equal(new Set(ids).size,1); assert.equal(await clients[0].query('proof:count',{}),1); console.log('PASS: 16 concurrent real-backend indexed bootstrap mutations, one row. Identity injection is synthetic; not Better Auth login proof.');`,
);
console.log(`Local fixture: ${directory}`);
const result = spawnSync(
  process.execPath,
  [
    join(root, "node_modules/convex/bin/main.js"),
    "dev",
    "--once",
    "--typecheck",
    "disable",
    "--local-cloud-port",
    "3340",
    "--local-site-port",
    "3341",
    "--start",
    `${process.execPath} verify.mjs`,
  ],
  {
    cwd: directory,
    stdio: "inherit",
    env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
  },
);
process.exitCode = result.status ?? 1;
