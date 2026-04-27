// TanStack Start server function exposing the current logged-in user to the
// client. Reads the HttpOnly cofacts_session cookie via h3's getCookie and
// delegates to fetchMeWithToken. Always resolves — never throws — so loaders
// and effects can call it without try/catch boilerplate.

import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

import {  fetchMeWithToken } from './me';
import { SESSION_COOKIE_NAME } from './session';
import type {CofactsUser} from './me';

export const getCurrentUserServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CofactsUser | null> => {
    const token = getCookie(SESSION_COOKIE_NAME);
    if (!token) return null;
    return fetchMeWithToken(token);
  },
);
