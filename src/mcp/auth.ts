import type { AuthConfig } from "./types.js";

export function extractApiKey(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return undefined;

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return undefined;
}

export async function validateRequest(
  request: Request,
  auth: AuthConfig,
): Promise<
  | { apiKey: string; convexToken?: string; valid: true }
  | { response: Response; valid: false }
> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return {
      response: new Response(
        JSON.stringify({
          error:
            "Missing or malformed API key. Use Authorization: Bearer <key>.",
        }),
        { headers: { "Content-Type": "application/json" }, status: 401 },
      ),
      valid: false,
    };
  }

  const isValid = await auth.validate(apiKey);
  if (!isValid) {
    return {
      response: new Response(JSON.stringify({ error: "Invalid API key." }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      }),
      valid: false,
    };
  }

  let convexToken: string | undefined;
  if (auth.convexToken) {
    convexToken = await auth.convexToken(apiKey);
  }

  return { apiKey, convexToken, valid: true };
}
