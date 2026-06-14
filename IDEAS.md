# Ideas — @vllnt/convex-helpers

Harvested capability backlog for this library — pure-function / host-`ctx` candidates spotted in
real backends, awaiting sequencing. The **sequenced** work lives in `ROADMAP.md`; this file keeps
the source spec + rationale a candidate came from. Stateful concerns (own table/cron) are NOT
candidates here — they defer to a `@convex-dev/*` or `@vllnt/convex-*` component (see ROADMAP
Non-goals).

---

## Webhook ingestion glue (`./http`)

**Status:** Proposed — sequenced as ROADMAP `table-stakes.7`/`.8`.
**Source:** harvested from the retired `convex-webhook` (`vllnt/convex-webhook#1`). Built twice
independently before extraction:

- **SongTrivia** (Adapty) — `event_id` idempotency, out-of-order rejection, OCC versioning,
  `processed_events` table with 7-day TTL.
  Ref: `songtrivia/packages/backend/convex/subscription/process_webhook.ts`
- **bntvllnt** (Typefully) — HMAC-SHA256 verify, 5-min timestamp replay guard, per-platform
  routing, delivery-status logging.
  Ref: `bntvllnt/convex/webhooks/handler.ts`

**Why here, split two ways.** A helper may hold only pure functions or host-`ctx` glue — the
instant a capability needs sandboxed state it is a component, not a helper. So the `convex-webhook`
spec splits by home:

| Lives in `@vllnt/convex-helpers` `./http` (pure / host-`ctx`) | Defers to `@vllnt/convex-idempotency` (needs table + cron) |
|---|---|
| HMAC-SHA256 signature verification (configurable header + secret) | Event-ID deduplication table |
| Raw body extraction for signature computation | TTL cleanup cron for processed events |
| Timestamp replay protection (configurable tolerance) — pure time compare | Out-of-order event rejection (stored last-seen) |
| Event type → handler routing | OCC version tracking |
| Per-handler error isolation (one failure doesn't block others) | Delivery-status tracking per event (stored) |
| Structured error responses (transient vs permanent for retry logic) | |
| Logging hooks (via `@vllnt/logger`) | |
| Convex HTTP-action compatible (`Request` → `Response`) | |
| Provider adapters (pre-built verify configs) | |

**Provider adapters (pre-built verify configs — pure, no state):** Polar (HMAC), GitHub
(HMAC-SHA256), Stripe (HMAC-SHA256 + timestamp), Typefully (HMAC-SHA256 + timestamp), Adapty
(custom, `event_id` based), Generic (bring-your-own verify fn). Minimum for platform needs:
Polar + GitHub.

**Target ergonomic** (the verify/replay/route half is the helper; dedup is delegated to the
component, not a helper table):

```typescript
import { createWebhookHandler, hmacSha256 } from "@vllnt/convex-helpers/http";

export const handleStripe = createWebhookHandler({
  // signature verification (helper)
  verify: hmacSha256({ header: "stripe-signature", secret: process.env.STRIPE_SECRET }),
  // replay protection — pure timestamp window (helper)
  replay: { timestampField: "created", tolerance: "5m" },
  // event routing (helper)
  routes: {
    "checkout.session.completed": handlers.onCheckoutComplete,
    "customer.subscription.updated": handlers.onSubscriptionUpdate,
  },
  // exactly-once dedup is delegated to the @vllnt/convex-idempotency component
  // (event-ID ledger + TTL cron) — never a table in this library.
});
```

**Blocked-on (Rule of Three):** the two source consumers above migrate off `convex-webhook` onto
`convex-helpers/./http` + `convex-idempotency` (hub `retire-webhook-mcp.3`), confirming the seam on
≥2 real backends.
