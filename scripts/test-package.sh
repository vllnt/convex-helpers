#!/usr/bin/env bash
#
# test-package.sh — install the packed tarball into a clean ESM project and
# prove every package.json "exports" entry works for a consumer:
#   1. each entry imports at runtime and exposes every value export its .d.ts
#      declares;
#   2. a strict NodeNext consumer that uses every code entry type-checks with
#      skipLibCheck off, under each TypeScript compiler this repo installs
#      (`typescript` and `@typescript/native`).
#
# Peers and tools are installed at the exact versions this repo resolved, read
# from node_modules/*/package.json. The caller builds dist/ first.
#
# Usage: pnpm build && pnpm test:package
# Exit codes: 0 pass, 1 failure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "FAIL  package test: $*" >&2
  exit 1
}

[[ -d dist ]] || fail "dist/ is missing; run pnpm build first"

# `pnpm run` exports the repo's config as npm_config_*/pnpm_config_* variables;
# drop them so the temp project installs with defaults only.
while IFS= read -r name; do
  unset "$name"
done < <(compgen -e | grep -iE '^p?npm_config_')

# Transitive dependencies resolve fresh in the temp project; keep the repo's
# release-age gate on them. pnpm 10 reads it from pnpm-workspace.yaml only.
[[ -f pnpm-workspace.yaml ]] ||
  fail "pnpm-workspace.yaml is missing; it must set minimumReleaseAge"
release_age="$(sed -nE 's/^minimumReleaseAge: ([0-9]+)$/\1/p' pnpm-workspace.yaml)"
[[ "$release_age" =~ ^[0-9]+$ ]] ||
  fail "pnpm-workspace.yaml has no single 'minimumReleaseAge: <minutes>' line"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The exact version this repo resolved, as an install spec (keeps npm: aliases).
resolved() {
  node -e '
    const dir = process.argv[1];
    const { name, version } = require(`./node_modules/${dir}/package.json`);
    console.log(name === dir ? `${dir}@${version}` : `${dir}@npm:${name}@${version}`);
  ' "$1"
}

deps=()
compilers=(typescript @typescript/native)
for dep in convex @modelcontextprotocol/sdk zod @types/node "${compilers[@]}"; do
  deps+=("$(resolved "$dep")") || fail "$dep is not installed; run pnpm install"
done

mkdir "$tmp/pack" "$tmp/app"
pnpm pack --pack-destination "$tmp/pack" > /dev/null || fail "pnpm pack failed"
tarball="$(find "$tmp/pack" -maxdepth 1 -name '*.tgz' -print -quit)"
[[ -n "$tarball" ]] || fail "pnpm pack produced no tarball"

cd "$tmp/app"
printf '{ "name": "package-test", "private": true, "type": "module" }\n' > package.json
pnpm add --prefer-offline --config.strict-peer-dependencies=true \
  --config.minimum-release-age="$release_age" \
  "$tarball" "${deps[@]}" > install.log 2>&1 || {
  cat install.log >&2
  fail "installing the tarball and peers failed"
}
echo "  installed $(basename "$tarball") with ${deps[*]}"

PKG="$(node -p 'require(process.argv[1]).name' "$ROOT/package.json")"
export PKG

# 1. Runtime: import every entry and compare its exports with its .d.ts.
cat > runtime.mjs <<'EOF'
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import ts from "typescript";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve(`${process.env.PKG}/package.json`));
const { exports } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const errors = [];
const checked = [];

const code = Object.entries(exports).filter(([, target]) => typeof target === "object");
const program = ts.createProgram(
  code.map(([, target]) => join(pkgDir, target.types)),
  { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
);
const checker = program.getTypeChecker();

// Value (runtime) export names a .d.ts declares, or undefined if it is missing.
function declaredValues(file) {
  const source = program.getSourceFile(file);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) return undefined;
  return checker
    .getExportsOfModule(symbol)
    .filter((item) => {
      const target = item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
      return target.flags & ts.SymbolFlags.Value;
    })
    .map((item) => item.name)
    .sort();
}

for (const [subpath, target] of Object.entries(exports)) {
  const specifier = process.env.PKG + subpath.slice(1);
  let mod;
  try {
    mod = specifier.endsWith(".json")
      ? await import(specifier, { with: { type: "json" } })
      : await import(specifier);
  } catch (error) {
    errors.push(`${specifier}: import failed: ${error.message}`);
    continue;
  }
  if (typeof target !== "object") {
    checked.push(subpath);
    continue;
  }
  const expected = declaredValues(join(pkgDir, target.types));
  if (expected === undefined) {
    errors.push(`${specifier}: types file ${target.types} is not in the tarball`);
    continue;
  }
  if (expected.length === 0) errors.push(`${specifier}: declares no runtime exports`);
  const missing = expected.filter((name) => !(name in mod));
  if (missing.length > 0) errors.push(`${specifier}: missing export(s) ${missing.join(", ")}`);
  checked.push(`${subpath} (${expected.length - missing.length}/${expected.length} values)`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log(`  imported ${checked.length} entries: ${checked.join(", ")}`);
EOF
node runtime.mjs || fail "runtime import check failed"

# 2. Types: a strict consumer that uses a value or type from every code entry.
cat > consumer.ts <<EOF
import { pruneNull } from "${PKG}";
import { cookieSettingsForSite, type CookieSettings } from "${PKG}/better-auth";
import { customCtx, customQuery } from "${PKG}/builders";
import { isAnonymousIdentity, type AuthIdentity } from "${PKG}/identity";
import { convexArgsToZod, type ToolSummary } from "${PKG}/mcp";
import { parse, ValidationError } from "${PKG}/validators";
import { queryGeneric } from "convex/server";
import { v } from "convex/values";

const kept: number[] = pruneNull([1, null, 2, undefined]);
const cookies: CookieSettings | undefined = cookieSettingsForSite("https://app.example.com");
const userQuery = customQuery(
  queryGeneric,
  customCtx(async () => ({ user: "u1" })),
);
const identity: AuthIdentity = { subject: "s1" };
const anonymous: boolean = isAnonymousIdentity(identity);
const schema = convexArgsToZod(v.object({ name: v.string() }));
const summary: ToolSummary | undefined = undefined;
const name: string = parse(v.string(), "x");
const failure: Error = new ValidationError("string", "number");

export { anonymous, cookies, failure, kept, name, schema, summary, userQuery };
EOF

# Every code entry must be imported by the consumer, so a new entry fails here
# until the consumer above covers it.
uncovered="$(node -e '
  const { exports } = require(process.argv[1]);
  const source = require("node:fs").readFileSync("consumer.ts", "utf8");
  for (const [subpath, target] of Object.entries(exports)) {
    const specifier = process.env.PKG + subpath.slice(1);
    if (typeof target === "object" && !source.includes(`from "${specifier}";`)) console.log(specifier);
  }
' "$ROOT/package.json")"
[[ -z "$uncovered" ]] || fail "consumer.ts does not import: ${uncovered//$'\n'/, }"

for compiler in "${compilers[@]}"; do
  tsc="$(node -e '
    const dir = process.argv[1];
    const { bin } = require(`./node_modules/${dir}/package.json`);
    console.log(`./node_modules/${dir}/${typeof bin === "string" ? bin : Object.values(bin)[0]}`);
  ' "$compiler")"
  echo "  type-check with $compiler $("$tsc" --version)"
  "$tsc" --noEmit --strict --skipLibCheck false \
    --module NodeNext --moduleResolution NodeNext --target ES2022 --types node \
    consumer.ts || fail "strict consumer type-check failed with $compiler"
done

echo "OK    package test: $(basename "$tarball") imports and type-checks for a strict NodeNext consumer"
