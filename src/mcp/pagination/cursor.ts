type CursorPayload = {
  m: string;
  o: number;
  v: 1;
};

const SEPARATOR = ".";

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== "object" || value === null) return false;
  const object = value as Record<string, unknown>;
  return (
    typeof object.v === "number" &&
    typeof object.m === "string" &&
    typeof object.o === "number"
  );
}

async function importKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages,
  );
}

async function hmacSign(payload: string, secret: string): Promise<ArrayBuffer> {
  const key = await importKey(secret, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
}

async function hmacVerify(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = new Uint8Array(
      Array.from(atob(signature), (c) => c.charCodeAt(0)),
    );
  } catch {
    return false;
  }
  const key = await importKey(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payload),
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(
    Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(""),
  );
}

export async function encodeCursor(
  method: string,
  offset: number,
  secret: string,
): Promise<string> {
  const payload: CursorPayload = { m: method, o: offset, v: 1 };
  const json = JSON.stringify(payload);
  const b64 = btoa(json);
  const sig = await hmacSign(b64, secret);
  return `${b64}${SEPARATOR}${arrayBufferToBase64(sig)}`;
}

export async function decodeCursor(
  cursor: string,
  expectedMethod: string,
  secret: string,
): Promise<{ error: string } | { offset: number }> {
  const separatorIndex = cursor.lastIndexOf(SEPARATOR);
  if (separatorIndex === -1) return { error: "invalid or expired cursor" };

  const b64 = cursor.slice(0, separatorIndex);
  const sig = cursor.slice(separatorIndex + 1);

  const valid = await hmacVerify(b64, sig, secret);
  if (!valid) return { error: "invalid or expired cursor" };

  // Safe to parse without try-catch: HMAC verification above guarantees b64 is
  // a payload we signed, so atob + JSON.parse will not throw.
  const raw: unknown = JSON.parse(atob(b64));
  if (!isCursorPayload(raw)) return { error: "invalid or expired cursor" };
  if (raw.v !== 1) return { error: "invalid or expired cursor" };
  if (raw.m !== expectedMethod) return { error: "invalid or expired cursor" };
  if (raw.o < 0) return { error: "invalid or expired cursor" };
  return { offset: raw.o };
}
