# Desktop Auth

The desktop build (`beamlynx-desktop`, a static export loaded via `file://`) requires
Clerk sign-in just like the hosted build, but can't use the same mechanism to enforce it.

## Why desktop needs its own gating

The hosted build enforces sign-in via `middleware.ts`'s `authMiddleware` — a server-side
redirect before the page ever renders. A static export has no server to run middleware on
at all; Next errors outright if `middleware.ts` is present alongside `output: 'export'`,
it doesn't just no-op it.

So desktop gates client-side instead (`pages/index.tsx`): `SignedIn`/`SignedOut` swap
between the real app and a `<SignIn routing="hash">`. `routing="hash"` matters — it's the
mode that needs no dedicated route or middleware, unlike the default `"path"` mode Next.js
frameworks normally use.

## What the publishable key actually does — and doesn't

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is not a secret. It's baked into the client bundle
(inlined at `next build` time, same as any `NEXT_PUBLIC_` var) and is visible to anyone who
opens devtools — same as it already is in the hosted build today. It doesn't authenticate
anything by itself; it just tells the Clerk SDK which Clerk application to talk to,
conceptually like a Stripe publishable key or a Firebase project config.

The actual proof of identity is the **session token** Clerk issues after a real sign-in.
Whatever needs to trust that identity is supposed to verify that token itself.

**On desktop specifically, nothing does.** `pine-lang`'s API has no concept of Clerk at
all — it's unauthenticated by design, trusting whatever connects to `localhost:33333`. So
today, `SignedIn`/`SignedOut` is a **client-side UI gate only** — "show the sign-in screen
until someone signs in" — not a security boundary protecting any data or API. It satisfies
identity/telemetry (Clerk's dashboard records who signed in) but doesn't restrict what the
app can do once past it.

This matters for the planned org-shared-state/collaboration feature: that feature needs a
real backend verifying the session token before serving or accepting shared data. This
client-side gate doesn't provide that, and shouldn't be assumed to when that feature gets
designed.
