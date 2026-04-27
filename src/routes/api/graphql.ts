// BFF GraphQL proxy.
//
// Forwards POST requests from the browser to rumors-api's /graphql endpoint,
// attaching the cofacts_session cookie's JWT as a Bearer token. The raw
// request body is forwarded byte-for-byte to preserve operationName, variables
// and any other fields exactly as sent by the client.
//
// The cookie is HttpOnly+Secure+SameSite=Lax, so we forward without verifying
// locally — rumors-api is the single source of truth for token validity.
//
// Public queries continue to work without a cookie: when no session cookie is
// present, the Authorization header is omitted entirely.
//
// Upstream response status is preserved verbatim. We do NOT forward upstream
// headers (e.g. Set-Cookie) to avoid leaking server-side state to the browser.

import { createFileRoute } from '@tanstack/react-router';
import { getCookie } from '@tanstack/react-start/server';

import { API_BASE } from '@/server/api-base';
import { SESSION_COOKIE_NAME } from '@/server/session';

export const Route = createFileRoute('/api/graphql')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = getCookie(SESSION_COOKIE_NAME);
        const body = await request.text();

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-app-id': 'RUMORS_SITE',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        let upstream: Response;
        try {
          upstream = await fetch(`${API_BASE}/graphql`, {
            method: 'POST',
            headers,
            body,
          });
        } catch {
          return new Response(
            JSON.stringify({ errors: [{ message: 'Upstream unavailable' }] }),
            {
              status: 502,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        const responseBody = await upstream.text();
        return new Response(responseBody, {
          status: upstream.status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});
