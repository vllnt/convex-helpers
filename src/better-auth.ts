/**
 * Fail-closed origin and cookie helpers for `@convex-dev/better-auth`.
 * Does not import better-auth — the host still constructs `betterAuth(...)`.
 */

export type CookieSettings = {
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true;
      sameSite: "none";
      secure: true;
    };
    useSecureCookies: true;
  };
};

function hasControlCharacter(value: string): boolean {
  // Control-character detection is the point of this helper.
  // eslint-disable-next-line no-control-regex -- C0 + DEL
  return /[\u0000-\u001F\u007F]/u.test(value);
}

function httpsOrigin(trimmed: string): string | undefined {
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (trimmed !== url.origin && trimmed !== `${url.origin}/`)
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Parse one origin. HTTPS, no credentials/path/query/hash, no wildcards
 * except an exact `previewPattern` (e.g. `https://app-*-org.vercel.app`).
 */
export function parseTrustedOrigin(
  origin: string,
  options: { previewPattern?: string } = {},
): string | undefined {
  const trimmed = origin.trim();
  if (trimmed === "") return undefined;
  if (hasControlCharacter(trimmed)) return undefined;
  if (
    options.previewPattern !== undefined &&
    trimmed === options.previewPattern
  ) {
    return trimmed;
  }
  if (
    !trimmed.startsWith("https://") ||
    trimmed.includes("*") ||
    trimmed.includes("?")
  ) {
    return undefined;
  }
  return httpsOrigin(trimmed);
}

/**
 * Merge `siteUrl` with a comma-separated extra list. Returns `undefined` when
 * nothing extra survived parsing — the host then omits `trustedOrigins` and
 * better-auth keeps its default trust.
 */
export function trustedOriginsFromList(
  siteUrl: string,
  extra: readonly string[],
  options: { previewPattern?: string } = {},
): string[] | undefined {
  const parsed = extra
    .map((origin) => parseTrustedOrigin(origin, options))
    .filter((origin): origin is string => origin !== undefined);
  if (parsed.length === 0) return undefined;
  return [siteUrl, ...parsed];
}

export function trustedOriginsFromCsv(
  siteUrl: string,
  csv: string,
  options: { previewPattern?: string } = {},
): string[] | undefined {
  return trustedOriginsFromList(siteUrl, csv.split(","), options);
}

/** Secure cross-site cookies when `siteUrl` is HTTPS; otherwise `undefined`. */
export function cookieSettingsForSite(
  siteUrl: string,
): CookieSettings | undefined {
  if (!siteUrl.startsWith("https://")) return undefined;
  return {
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      },
      useSecureCookies: true,
    },
  };
}
