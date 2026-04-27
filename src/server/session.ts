// BFF session cookie name + attribute factories.
// Pure string/object helpers with no framework coupling — TanStack Start route
// handlers (callback / logout / graphql proxy) import these and pass the result
// to h3's setCookie / getCookie themselves.
// Attributes: HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age=14d, matching
// rumors-api's COOKIE_MAXAGE default (1209600 seconds).

export const SESSION_COOKIE_NAME = 'cofacts_session';

// Short-lived cookie that binds the OAuth state nonce to the browser session
// that initiated /api/auth/login. Callback must see this cookie AND a matching
// nonce in the state parameter, otherwise the request is treated as a CSRF /
// session-fixation attempt and rejected.
export const OAUTH_STATE_COOKIE_NAME = 'cofacts_oauth_state';

export interface CookieAttrs {
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

/** 14 days in seconds, matching rumors-api COOKIE_MAXAGE default. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/** 5 minutes — long enough for any realistic OAuth round-trip, short enough
 *  that a leaked nonce cookie has minimal replay window. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 5 * 60;

export function buildSessionCookieAttrs(): CookieAttrs {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Used to clear the cookie on logout — same attrs but maxAge: 0. */
export function buildClearSessionCookieAttrs(): CookieAttrs {
  return { ...buildSessionCookieAttrs(), maxAge: 0 };
}

export function buildOAuthStateCookieAttrs(): CookieAttrs {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  };
}

export function buildClearOAuthStateCookieAttrs(): CookieAttrs {
  return { ...buildOAuthStateCookieAttrs(), maxAge: 0 };
}
