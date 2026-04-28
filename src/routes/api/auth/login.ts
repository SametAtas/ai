// BFF login initiator.
//
// The browser hits this route to start the OAuth flow with a chosen
// provider. The server constructs the upstream rumors-api URL (origin
// known only to the server under the BFF model) and 302-redirects.
//
// Two pieces of state are carried through OAuth:
//
//   1. A random nonce, generated here, set as the HttpOnly cookie
//      `cofacts_oauth_state` AND embedded into the OAuth `state` query
//      parameter. The callback handler requires both to be present and
//      equal — this is the CSRF / session-fixation defense, preventing
//      an attacker from feeding a victim's browser an authorization code
//      issued for the attacker's account.
//
//   2. The post-login `redirect_to` path. We sanitize it to a same-origin
//      path (rejecting protocol-relative `//evil.com`, cross-origin
//      absolute URLs, and anything else suspicious) and pack it into the
//      same `state` payload alongside the nonce. The callback re-validates
//      the path server-side before redirecting the browser, so a tampered
//      `state` cannot achieve an open redirect either.
//
// `provider` is taken from the query string but matched against a strict
// whitelist before being interpolated into the upstream path, so path
// injection is structurally impossible.

import { randomBytes } from 'node:crypto';

import { createFileRoute } from '@tanstack/react-router';
import { setCookie } from '@tanstack/react-start/server';

import { API_BASE } from '@/server/api-base';
import {
  OAUTH_STATE_COOKIE_NAME,
  buildOAuthStateCookieAttrs,
} from '@/server/session';

const ALLOWED_PROVIDERS = ['github', 'facebook', 'google'] as const;
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

function isAllowedProvider(value: string): value is AllowedProvider {
  return (ALLOWED_PROVIDERS as ReadonlyArray<string>).includes(value);
}

function sanitizeRedirectPath(redirectTo: string, origin: string): string {
  if (redirectTo.startsWith('//')) return '/';
  if (redirectTo.startsWith('/')) return redirectTo;
  try {
    const url = new URL(redirectTo, origin);
    if (url.origin === origin) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // fall through to default
  }
  return '/';
}

function encodeState(nonce: string, redirectPath: string): string {
  return Buffer.from(JSON.stringify({ n: nonce, r: redirectPath })).toString(
    'base64url',
  );
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const providerParam = reqUrl.searchParams.get('provider') ?? '';
        if (!isAllowedProvider(providerParam)) {
          return new Response('Invalid provider', { status: 400 });
        }
        const provider: AllowedProvider = providerParam;

        const redirectTo = reqUrl.searchParams.get('redirect_to') ?? '/';
        const safePath = sanitizeRedirectPath(redirectTo, reqUrl.origin);
        const nonce = randomBytes(32).toString('base64url');
        const state = encodeState(nonce, safePath);
        const callbackUrl = `${reqUrl.origin}/api/auth/callback`;

        const upstream = new URL(`${API_BASE}/login/${provider}`);
        upstream.searchParams.set('redirect_to', callbackUrl);
        upstream.searchParams.set('state', state);

        setCookie(OAUTH_STATE_COOKIE_NAME, nonce, buildOAuthStateCookieAttrs());

        return new Response(null, {
          status: 302,
          headers: { Location: upstream.toString() },
        });
      },
    },
  },
});
