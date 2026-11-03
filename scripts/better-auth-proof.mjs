// Real Better Auth login -> JWT -> Convex proof. Local only: no cloud account,
// no production access. Run: node scripts/better-auth-proof.mjs
//
// Builds a throwaway fixture with @convex-dev/better-auth + better-auth (anonymous
// and email/password), starts an anonymous local Convex backend, signs in through
// real Better Auth sessions, and sends the issued JWTs to Convex functions that
// use src/identity.ts and src/better-auth.ts. Exits 0 only if every assertion holds.
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const CLOUD_PORT = 3350;
const SITE_PORT = 3351;
// Exact pins; every non-@vllnt install is also bounded by `npm --before` (7 days).
const PINS = {
  "@convex-dev/better-auth": "0.12.6",
  "better-auth": "1.6.33",
  convex: "1.48.0",
  jose: "6.2.13",
};

// Local backend release, passed to `convex dev --local-backend-version` so the
// run does not follow the CLI's moving "latest". Published 2026-10-22.
const BACKEND_VERSION = "precompiled-2026-10-22-1447815";

// Child processes inherit the caller's environment (proxy and CA settings the
// Convex CLI and npm need) minus its CONVEX_* target and credential variables
// (CONVEX_DEPLOYMENT, CONVEX_URL, CONVEX_DEPLOY_KEY, ...).
const baseEnv = (extra) => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("CONVEX_")),
  ),
  CONVEX_AGENT_MODE: "anonymous",
  ...extra,
});

// Large installs go to /var/tmp (disk) when available; /tmp may be RAM-backed.
const base =
  process.env.BETTER_AUTH_PROOF_TMP ??
  (existsSync("/var/tmp") ? "/var/tmp" : tmpdir());
const scratch = mkdtempSync(join(base, "helpers-better-auth-proof-"));
const fixture = join(scratch, "app");
const home = join(scratch, "home");
mkdirSync(join(fixture, "convex"), { recursive: true });
mkdirSync(home);

const files = {
  "package.json": JSON.stringify({
    name: "better-auth-proof-fixture",
    private: true,
    type: "module",
    dependencies: PINS,
  }),
  "convex.json": '{"functions":"convex/"}',
  "convex/convex.config.ts": `import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";
const app = defineApp();
app.use(betterAuth);
export default app;
`,
  "convex/auth.config.ts": `import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";
export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;
`,
  "convex/auth.ts": `import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { anonymous } from "better-auth/plugins/anonymous";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { trustedOriginsFromCsv } from "./betterAuthHelpers";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  return betterAuth({
    baseURL: siteUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOriginsFromCsv(siteUrl, process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? ""),
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [
      anonymous(),
      convex({
        authConfig,
        jwt: { expirationSeconds: Number(process.env.PROOF_JWT_TTL_SECONDS ?? 900) },
      }),
    ],
  });
};
`,
  "convex/http.ts": `import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
export default http;
`,
  "convex/schema.ts": `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  users: defineTable({ subject: v.string() }).index("by_subject", ["subject"]),
});
`,
  // Host functions using this package's helpers. trustedIssuer is host config
  // (the deployment's own site URL), never a request argument.
  "convex/proof.ts": `import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { getFromAuth, getOrCreateFromAuth, requireIdentity } from "./identity.js";

const rawIdentity = (ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) => ctx.auth.getUserIdentity();
const good = () => ({ trustedIssuer: process.env.CONVEX_SITE_URL ?? "" });
const wrong = () => ({ trustedIssuer: "https://other-issuer.invalid" });

export const raw = query({ args: {}, returns: v.any(), handler: (ctx) => rawIdentity(ctx) });
export const whoami = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => requireIdentity({ auth: ctx.auth, ...good() }),
});
export const whoamiWrongIssuer = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => requireIdentity({ auth: ctx.auth, ...wrong() }),
});
export const lookup = query({
  args: {},
  returns: v.any(),
  handler: (ctx) =>
    getFromAuth({ auth: ctx.auth, ...good() }, (subject) =>
      ctx.db.query("users").withIndex("by_subject", (q) => q.eq("subject", subject)).unique(),
    ),
});
const handlers = (ctx: any) => ({
  lookup: (subject: string) =>
    ctx.db.query("users").withIndex("by_subject", (q: any) => q.eq("subject", subject)).unique(),
  insert: async (subject: string) => {
    const id = await ctx.db.insert("users", { subject });
    return await ctx.db.get(id);
  },
});
export const bootstrap = mutation({
  args: {},
  returns: v.any(),
  handler: (ctx) => getOrCreateFromAuth({ auth: ctx.auth, ...good() }, handlers(ctx)),
});
export const bootstrapWrongIssuer = mutation({
  args: {},
  returns: v.any(),
  handler: (ctx) => getOrCreateFromAuth({ auth: ctx.auth, ...wrong() }, handlers(ctx)),
});
export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query("users").collect()).length,
});
`,
  "verify.mjs": `import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const site = process.env.SITE_URL;
const cloud = process.env.CLOUD_URL;
const TTL = 4;
const results = [];
const check = (name, fn) =>
  Promise.resolve()
    .then(fn)
    .then(
      () => results.push(name),
      (error) => {
        console.error("FAIL: " + name);
        throw error;
      },
    );

const convexCli = (args, input) => {
  const r = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], {
    encoding: "utf8",
    input,
    env: process.env,
  });
  if (r.status !== 0) throw new Error("convex " + args[0] + " " + args[1] + " failed: " + r.stderr.slice(0, 300));
};
// Random per run, passed over stdin, never written to the repo or printed.
convexCli(["env", "set", "BETTER_AUTH_SECRET"], randomBytes(32).toString("hex"));

const jar = () => new Map();
const cookieHeader = (j) => [...j].map(([k, v]) => k + "=" + v).join("; ");
async function api(path, { method = "POST", body, j = jar(), origin = site } = {}) {
  const headers = { origin, "content-type": "application/json" };
  if (j.size) headers.cookie = cookieHeader(j);
  const res = await fetch(site + "/api/auth" + path, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    j.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  return { res, j, json: text ? JSON.parse(text) : null };
}
const getToken = async (j) => {
  const { res, json } = await api("/convex/token", { method: "GET", j });
  assert.equal(res.status, 200);
  assert.equal(typeof json.token, "string");
  return json.token;
};
const decode = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
const as = (token) => {
  const c = new ConvexHttpClient(cloud);
  if (token) c.setAuth(token);
  return c;
};
const rejects = async (fn, where) => {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail("expected rejection: " + where);
};

// 1. Real anonymous-plugin sign-in.
const anonSession = await api("/sign-in/anonymous");
const anonJar = anonSession.j;
assert.equal(anonSession.res.status, 200);
const anonUserId = (await api("/get-session", { method: "GET", j: anonJar })).json.user.id;
const anonToken = await getToken(anonJar);
const anonClaims = decode(anonToken);
let anonRowId;

await check("anonymous: JWT claims are issuer=site, aud=convex, sub=Better Auth user id, isAnonymous=true", () => {
  assert.equal(anonClaims.iss, site);
  assert.equal(anonClaims.aud, "convex");
  assert.equal(anonClaims.sub, anonUserId);
  assert.equal(anonClaims.isAnonymous, true);
});
await check("anonymous: Convex identity matches the token and helpers accept it", async () => {
  const raw = await as(anonToken).query("proof:raw", {});
  assert.equal(raw.issuer, site);
  assert.equal(raw.subject, anonUserId);
  assert.equal(raw.isAnonymous, true);
  const id = await as(anonToken).query("proof:whoami", {});
  assert.equal(id.subject, anonUserId);
  assert.equal(id.issuer, site);
});
await check("anonymous: getOrCreateFromAuth inserts once, is idempotent, flags isAnonymous", async () => {
  assert.equal(await as(anonToken).query("proof:lookup", {}), null);
  const first = await as(anonToken).mutation("proof:bootstrap", {});
  const second = await as(anonToken).mutation("proof:bootstrap", {});
  assert.equal(first.subject, anonUserId);
  assert.equal(first.isAnonymous, true);
  assert.equal(second._id, first._id);
  anonRowId = first._id;
  assert.equal((await as(anonToken).query("proof:lookup", {})).isAnonymous, true);
  assert.equal(await as(anonToken).query("proof:count", {}), 1);
});

// 2. Real email/password sign-up, then a separate sign-in with a fresh session.
const email = "proof-" + randomBytes(6).toString("hex") + "@example.invalid";
const password = randomBytes(16).toString("hex");
assert.equal((await api("/sign-up/email", { body: { email, password, name: "Proof User" } })).res.status, 200);
const emailSession = await api("/sign-in/email", { body: { email, password } });
assert.equal(emailSession.res.status, 200);
const emailJar = emailSession.j;
const emailUserId = (await api("/get-session", { method: "GET", j: emailJar })).json.user.id;
const emailToken = await getToken(emailJar);
const emailClaims = decode(emailToken);

await check("email: JWT claims are issuer=site, aud=convex, sub=Better Auth user id, not anonymous", () => {
  assert.equal(emailClaims.iss, site);
  assert.equal(emailClaims.aud, "convex");
  assert.equal(emailClaims.sub, emailUserId);
  assert.notEqual(emailUserId, anonUserId);
  assert.notEqual(emailClaims.isAnonymous, true);
  assert.equal(emailClaims.email, email);
});
await check("email: helpers accept it and report isAnonymous=false on a separate row", async () => {
  const raw = await as(emailToken).query("proof:raw", {});
  assert.equal(raw.issuer, site);
  assert.equal(raw.subject, emailUserId);
  const row = await as(emailToken).mutation("proof:bootstrap", {});
  assert.equal(row.subject, emailUserId);
  assert.equal(row.isAnonymous, false);
  assert.notEqual(row._id, anonRowId);
  assert.equal(await as(emailToken).query("proof:count", {}), 2);
});

// 3. Rejections.
await check("no token: requireIdentity throws UNAUTHENTICATED", async () => {
  const error = await rejects(() => as().query("proof:whoami", {}), "anonymous caller");
  assert.equal(error.data?.code, "UNAUTHENTICATED");
});
await check("trustedIssuer mismatch on a real token: helper rejects before any write", async () => {
  const q = await rejects(() => as(emailToken).query("proof:whoamiWrongIssuer", {}), "wrong issuer query");
  assert.equal(q.data?.code, "UNAUTHENTICATED");
  const m = await rejects(() => as(emailToken).mutation("proof:bootstrapWrongIssuer", {}), "wrong issuer mutation");
  assert.equal(m.data?.code, "UNAUTHENTICATED");
  assert.equal(await as(emailToken).query("proof:count", {}), 2);
});
await check("tampered claims (payload edited, signature kept) are rejected by Convex", async () => {
  const [h, , s] = emailToken.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...emailClaims, isAnonymous: true })).toString("base64url");
  await rejects(() => as(h + "." + forgedPayload + "." + s).query("proof:whoami", {}), "tampered token");
});
const foreign = await generateKeyPair("RS256");
const forge = (iss, key = foreign.privateKey) =>
  new SignJWT({ ...emailClaims, iss })
    .setProtectedHeader({ alg: "RS256", kid: "foreign" })
    .setSubject(emailUserId)
    .setAudience("convex")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
await check("foreign issuer + foreign key is rejected", async () => {
  await rejects(async () => as(await forge("https://other-issuer.invalid")).query("proof:whoami", {}), "foreign issuer");
});
await check("correct issuer claim signed with a foreign key is rejected", async () => {
  await rejects(async () => as(await forge(site)).query("proof:whoami", {}), "foreign key");
});
await check("expired Better Auth token is rejected after being valid", async () => {
  convexCli(["env", "set", "--force", "PROOF_JWT_TTL_SECONDS", String(TTL)]);
  const short = await getToken(emailJar);
  convexCli(["env", "remove", "PROOF_JWT_TTL_SECONDS"]);
  const shortClaims = decode(short);
  assert.equal(shortClaims.exp - shortClaims.iat, TTL);
  // Mutations: queries may be served from the backend's cache after expiry.
  assert.equal((await as(short).mutation("proof:bootstrap", {})).subject, emailUserId);
  // Convex tolerates a few seconds of clock skew (observed accepting 3s past exp,
  // rejecting "expired 8 seconds ago"), so wait well beyond that.
  await new Promise((r) => setTimeout(r, (TTL + 10) * 1000));
  const error = await rejects(() => as(short).mutation("proof:bootstrap", {}), "expired token");
  assert.match(String(error.data?.message ?? error.message), /expired/i);
});
await check("request from an untrusted Origin is refused by Better Auth", async () => {
  const { res } = await api("/sign-in/email", { body: { email, password }, j: emailJar, origin: "https://evil.invalid" });
  assert.equal(res.status, 403);
});
await check("after sign-out the session no longer yields a token", async () => {
  const out = await api("/sign-out", { j: emailJar });
  assert.equal(out.res.status, 200);
  const { res } = await api("/convex/token", { method: "GET", j: emailJar });
  assert.notEqual(res.status, 200);
});

writeFileSync("proof-result.json", JSON.stringify({ ok: true, assertions: results.length }));
console.log("PASS (" + results.length + " assertions):");
for (const name of results) console.log("  - " + name);
`,
};

let child;
const cleanup = () => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already exited */
    }
  }
  rmSync(scratch, { recursive: true, force: true });
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

let status = 1;
try {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(fixture, name), content);
  }
  copyFileSync(
    join(root, "src/identity.ts"),
    join(fixture, "convex/identity.ts"),
  );
  copyFileSync(
    join(root, "src/better-auth.ts"),
    join(fixture, "convex/betterAuthHelpers.ts"),
  );
  console.log(`Fixture: ${fixture}`);

  const before = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const install = spawnSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--before",
      before,
    ],
    { cwd: fixture, stdio: "inherit" },
  );
  if (install.status !== 0) throw new Error("fixture install failed");
  const list = spawnSync("npm", ["ls", ...Object.keys(PINS), "--depth=0"], {
    cwd: fixture,
    encoding: "utf8",
  });
  console.log(list.stdout);
  console.log(`Local backend: ${BACKEND_VERSION}`);

  const env = baseEnv({
    HOME: home,
    SITE_URL: `http://127.0.0.1:${SITE_PORT}`,
    CLOUD_URL: `http://127.0.0.1:${CLOUD_PORT}`,
  });
  child = spawn(
    process.execPath,
    [
      join(fixture, "node_modules/convex/bin/main.js"),
      "dev",
      "--once",
      "--typecheck",
      "disable",
      "--local-cloud-port",
      String(CLOUD_PORT),
      "--local-site-port",
      String(SITE_PORT),
      "--local-backend-version",
      BACKEND_VERSION,
      "--start",
      `${process.execPath} verify.mjs`,
    ],
    { cwd: fixture, env, stdio: "inherit", detached: true },
  );
  status = await new Promise((done) => {
    child.on("exit", (code) => done(code ?? 1));
    child.on("error", () => done(1));
  });
  // `convex dev --once --start` does not forward the command's exit status, so
  // success requires the marker verify.mjs writes only after every assertion.
  let marker;
  try {
    marker = JSON.parse(
      readFileSync(join(fixture, "proof-result.json"), "utf8"),
    );
  } catch {
    marker = undefined;
  }
  status = status === 0 && marker?.ok === true ? 0 : 1;
  console.log(status === 0 ? "RESULT: PASS" : "RESULT: FAIL");
} finally {
  cleanup();
}
process.exitCode = status;
