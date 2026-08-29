/**
 * The connectors this fork ships.
 *
 * A connector is DATA. An entry is a name, how the provider states its
 * endpoints, and the access to ask for — and the flow that runs it does not
 * change, which is the whole reason the descriptor exists.
 *
 * TWO KINDS, AND THE DIFFERENCE MATTERS TO WHOEVER INSTALLS THIS. A provider
 * named by ISSUER publishes its own metadata (RFC 8414), and every one below
 * also advertises a registration endpoint — so the app registers itself at
 * connect time and needs no client id from anybody. A provider written out as
 * URLs needs an application registered with that vendor, and its entry says so
 * by having no `issuer`: it is listed, and refuses to connect until a client
 * id is configured, naming what is missing.
 *
 * @module @unieai/uad-connector/catalogue
 */

import { GOOGLE_AUTH, GOOGLE_SCOPES, MICROSOFT_AUTH, MICROSOFT_SCOPES } from './providers.ts'
import type { ConnectorProvider } from './types.ts'

/**
 * Connectors that work on a fresh install, because the server issues clients
 * on demand.
 *
 * The endpoints are not written down: each issuer publishes them, and the
 * server is the authority on its own addresses. Reading them also answers
 * whether that server still offers registration, which a copied URL cannot.
 */
export const SELF_REGISTERING: readonly ConnectorProvider[] = [
  {
    id: 'notion',
    label: 'Notion',
    auth: { kind: 'discovered', issuer: 'https://mcp.notion.com' },
    scopes: [],
  },
  {
    id: 'linear',
    label: 'Linear',
    auth: { kind: 'discovered', issuer: 'https://mcp.linear.app', scopes: ['read', 'write'] },
    scopes: ['read', 'write'],
  },
  {
    id: 'sanity',
    label: 'Sanity',
    auth: { kind: 'discovered', issuer: 'https://mcp.sanity.io', scopes: ['global'] },
    scopes: ['global'],
  },
]

/**
 * Connectors that need an application registered with the vendor first.
 *
 * Both are public clients using PKCE and a loopback redirect, so neither needs
 * a client SECRET — only the id that names the application on the consent
 * screen, which is a deployment's own and cannot be shipped here.
 */
export const REGISTERED: readonly ConnectorProvider[] = [
  { id: 'google', label: 'Google', auth: GOOGLE_AUTH, scopes: GOOGLE_SCOPES },
  { id: 'microsoft', label: 'Microsoft', auth: MICROSOFT_AUTH, scopes: MICROSOFT_SCOPES },
]

/** Every connector this fork ships, self-registering ones first. */
export const SHIPPED: readonly ConnectorProvider[] = [...SELF_REGISTERING, ...REGISTERED]
