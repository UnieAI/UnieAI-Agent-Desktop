/**
 * The two providers this fork ships, written the way their documentation
 * writes them.
 *
 * A provider is DATA, not code: an entry here is an endpoint pair, the extra
 * parameters that provider insists on, and the access it asks for. Adding a
 * third is an entry, and the flow that runs it does not change — which is the
 * whole reason the descriptor exists.
 *
 * SCOPES ARE A PRODUCT DECISION, NOT A TECHNICAL ONE. Google sorts scopes into
 * non-sensitive, sensitive and restricted, and a restricted scope commits the
 * publisher to an annual third-party security assessment. The scopes below are
 * deliberately the ones that do not: `drive.file` sees only files the person
 * picks or Rabi created, and the identity scopes name the account so a person
 * can tell two connections apart. Widening this list is a decision with a
 * price, and it belongs to whoever owns the OAuth app.
 *
 * @module @unieai/uad-connector/providers
 */

import type { OAuth2Descriptor } from './types.ts'

/**
 * Google, as an installed app.
 *
 * `access_type=offline` and `prompt=consent` are both required: without the
 * first Google issues no refresh token at all, and without the second it omits
 * one on every approval after the first — so a person who reconnects would get
 * a connection that dies at the first expiry.
 */
export const GOOGLE_AUTH: OAuth2Descriptor = {
  kind: 'oauth2',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  authorizationParams: { access_type: 'offline', prompt: 'consent' },
}

/** The access Google is asked for; none of these is a restricted scope. */
export const GOOGLE_SCOPES: readonly string[] = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
]

/**
 * Microsoft identity platform, common endpoint.
 *
 * `common` admits both work/school and personal accounts; a deployment that
 * must admit one tenant only points these at that tenant instead.
 * `offline_access` is the scope that asks for a refresh token — Microsoft has
 * no `access_type` parameter, the scope is the request.
 */
export const MICROSOFT_AUTH: OAuth2Descriptor = {
  kind: 'oauth2',
  authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
}

/** The access Microsoft is asked for. */
export const MICROSOFT_SCOPES: readonly string[] = [
  'openid',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Files.ReadWrite',
]
