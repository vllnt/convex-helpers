import { describe, expect, it } from "vitest";

import {
  cookieSettingsForSite,
  parseTrustedOrigin,
  trustedOriginsFromCsv,
  trustedOriginsFromList,
} from "./better-auth.js";

const preview = "https://app-*-acme.vercel.app";

describe("parseTrustedOrigin", () => {
  it("rejects empty, control characters, http, wildcards, and junk", () => {
    expect(parseTrustedOrigin("")).toBeUndefined();
    expect(parseTrustedOrigin("   ")).toBeUndefined();
    expect(parseTrustedOrigin("https://ok.example\u0001")).toBeUndefined();
    expect(parseTrustedOrigin("http://ok.example")).toBeUndefined();
    expect(parseTrustedOrigin("https://*.example")).toBeUndefined();
    expect(parseTrustedOrigin("https://ok.example?x=1")).toBeUndefined();
    expect(parseTrustedOrigin("not a url")).toBeUndefined();
    expect(parseTrustedOrigin("https://[")).toBeUndefined();
    expect(parseTrustedOrigin("https://user:pass@ok.example")).toBeUndefined();
    expect(parseTrustedOrigin("https://ok.example/path")).toBeUndefined();
    expect(parseTrustedOrigin("https://ok.example#hash")).toBeUndefined();
  });

  it("accepts a clean https origin and a trailing slash", () => {
    expect(parseTrustedOrigin("https://ok.example")).toBe("https://ok.example");
    expect(parseTrustedOrigin(" https://ok.example/ ")).toBe(
      "https://ok.example",
    );
  });

  it("allows an exact preview pattern only", () => {
    expect(parseTrustedOrigin(preview, { previewPattern: preview })).toBe(
      preview,
    );
    expect(parseTrustedOrigin(preview)).toBeUndefined();
  });
});

describe("trustedOriginsFromList / csv", () => {
  it("returns undefined when nothing extra survives", () => {
    expect(trustedOriginsFromList("https://site.example", [])).toBeUndefined();
    expect(
      trustedOriginsFromCsv("https://site.example", " , http://x"),
    ).toBeUndefined();
  });

  it("prefixes siteUrl in front of parsed extras", () => {
    expect(
      trustedOriginsFromCsv(
        "https://site.example",
        "https://a.example, https://b.example",
      ),
    ).toEqual([
      "https://site.example",
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("cookieSettingsForSite", () => {
  it("is undefined on http and set on https", () => {
    expect(cookieSettingsForSite("http://localhost:3211")).toBeUndefined();
    expect(
      cookieSettingsForSite("https://site.example")?.advanced.useSecureCookies,
    ).toBe(true);
  });
});
