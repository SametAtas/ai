// BFF logout handler.
//
// Clears the cofacts_session HttpOnly cookie by issuing a Set-Cookie with
// Max-Age=0 and the same attributes (path/sameSite/secure/httpOnly) used at
// set time, so browsers reliably remove it. Returns 204 No Content.

import { createFileRoute } from '@tanstack/react-router';
import { deleteCookie } from '@tanstack/react-start/server';

import { SESSION_COOKIE_NAME, buildClearSessionCookieAttrs } from '@/server/session';

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async () => {
        deleteCookie(SESSION_COOKIE_NAME, buildClearSessionCookieAttrs());
        return new Response(null, { status: 204 });
      },
    },
  },
});
