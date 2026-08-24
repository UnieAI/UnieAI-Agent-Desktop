/**
 * The one plugin entry this page states rather than reads: UnieAI Studio.
 *
 * WHY THIS ENTRY IS FIXED WHEN NO OTHER ROW IS. Every other row on this
 * surface comes off a wire — `DirectoryArea` renders what `/auth/plugins`
 * lists and `StudioMcpArea` renders what `/auth/mcp` lists — and neither
 * component names a plugin. Studio is not a catalogue row: it is this
 * product's own account link, the thing that supplies the Studio model
 * catalogue, the account's own runtime key, and the Studio MCP tools this page
 * already draws. An account either has that link or does not, and the page can
 * say which. A catalogue row for a plugin nobody published would be a claim
 * about the world; this one is a claim about this product, and it is true in
 * every deployment.
 *
 * EXISTENCE IS THE ONLY FIXED PART. Whether it reads as bound, what tools it
 * reports, and whether there is an account at all all come from
 * {@link StudioMcpState} — the same reading `StudioMcpArea` renders, through
 * the same source. Nothing here fetches, and nothing here invents a tool, a
 * status, or a count.
 *
 * HOW BOUND IS DECIDED. The gate's `/auth/mcp` forwards the product's
 * `GET /api/desktop/mcp`, which lists a server with id
 * {@link STUDIO_MCP_SERVER_ID} only for an account that holds a Studio link;
 * an account without one gets a list that does not contain it. So the presence
 * of that row IS the binding, and its absence from a settled list is an
 * unbound account rather than a failure — which is why `unbound` is derived
 * only from `ready`, and every other reading keeps its own name.
 */
import type { StudioMcpRow, StudioMcpState } from './studio-mcp-source.ts'

/**
 * The product's id for the Studio MCP server.
 *
 * Fixed by the product route (`lib/desktop/mcp.ts`) and matched verbatim,
 * not by a prefix or a label: the label is display text an account can be
 * shown in any language, and a prefix match would adopt an unrelated server
 * whose id happens to start the same way.
 */
export const STUDIO_MCP_SERVER_ID = 'unieai-studio'

/**
 * Where the account's Studio link is made.
 *
 * The binding itself is a device grant that runs entirely on the web product —
 * `components/settings/studio-link-card.tsx` in copilot-v2 — mounted on the
 * Profile tab of the product's own settings page, which deep-links by hash
 * (`settings-client.tsx` reads `#<tab>` on load and on `hashchange`).
 * There is no desktop-side binding route and no product route that performs
 * the link in one navigation, so the entry point above is what this action
 * opens.
 *
 * The origin is the `unieai-web-gate` `productUrl` default, which is also
 * what `packages/bundle/web-app/cordis.patch.yml` configures for the shipped
 * desktop. It is a CONSTANT here and not a read value because no route this
 * browser may call reports the configured product origin: `/auth/mcp`
 * publishes a server's origin only for servers an account already has, which
 * is by definition not the unbound account this action is drawn for. A
 * deployment that repoints `productUrl` at its own copilot-v2
 * (docs/unieai-development.md) therefore sends this one link to the public
 * product; correcting that needs the gate to publish its `productUrl` to the
 * browser, which is a gate change and not a page change.
 *
 * No locale segment. The product's `next-intl` routing runs
 * `localePrefix: 'always'`, so a prefix-less path is redirected to the
 * visitor's own negotiated locale — writing one here would override the
 * language they chose on the product.
 */
export const STUDIO_BINDING_URL = 'https://agent.unieai.com/settings#profile'

/**
 * The entry's mark: the Rabi pixel-art rabbit, 162x162, as a `data:` URI.
 *
 * Inlined rather than fetched for two reasons that both make a URL wrong here.
 * The client bundle purity gate forbids this package reaching outside itself
 * for a runtime asset, and the desktop runs offline against a local harness —
 * a remote image would render as a broken tile exactly when the network is the
 * thing that failed. 754 bytes decoded, which is smaller than the request that
 * would fetch it.
 *
 * Draw it at a tile size with `image-rendering: pixelated`: the source is
 * pixel art, and a smoothed downscale turns it into a grey smudge.
 */
export const STUDIO_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKIAAACiCAYAAADC8hYbAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAeGVYSWZNTQAqAAAACAAFARIAAwAAAAEAAQAAARoABQAAAAEAAABKARsABQAAAAEAAABSASgAAwAAAAEAAgAAh2kABAAAAAEAAABaAAAAAAAAAEgAAAABAAAASAAAAAEAAqACAAQAAAABAAAAoqADAAQAAAABAAAAogAAAAC14j+fAAACIElEQVR4nO3dQW7aUBRAUVplninynA2wGXbNLCPmiF20qjqNlToy9f34nGGEHCSuHnr6Tnw4AAAAAAAAAAAAAAAAAAAAPNePJ1+fL9zv91+f/Xyapl19Nj+3fgPwhxBJECIJQiRBiCS8bf0G9r4dv398LHr9q27TJiIJQiRBiCQIkQQhkiBEEoRIghBJECIJQiRBiCQ4a456X3gGPWeUs2kTkQQhkiBEEoRIghBJGGKjemVLt+C11LZpE5EEIZIgRBKESIIQSUhtTnu01tY8TdPc9ZdeZ5MmTEQShEiCEEkQIglCJMEd2v/J9Xp96pnyfeF2XGMikiBEEoRIghBJECIJzpo3voP68Xgsev3xeFzl97pDGz7hq5kEIZIgRBKESMLutuat/o742dv0nPP5PMRnbCKSIEQShEiCEEkQIgkve4f2KNvxs8+UR2EikiBEEoRIghBJECIJw2/No2/H/GUikiBEEoRIghBJECIJw2/NtTuo93ZGvBYTkQQhkiBEEoRIghBJsDV/09x2vNU2PcWev7yUiUiCEEkQIglCJEGIJNiaox47O8s2EUkQIglCJEGIJAiRhOG35rkz1toTo5aeBV9nnu+81v/WrjERSRAiCUIkQYgkCJGEoe/q/Y61tum57fV2u61x+cPpdFrl+pfLZYjP2EQkQYgkCJEEIZIgRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4PDvfgPvl1509QAoegAAAABJRU5ErkJggg=='

/** What this page knows about the account's Studio link right now. */
export type StudioBinding =
  /** The first read has not settled yet. */
  | { status: 'loading' }
  /** The host holds no session, so there is no account to hold a link. */
  | { status: 'signed-out' }
  /** This deployment serves no MCP route, so the link cannot be observed. */
  | { status: 'unsupported' }
  /** A session exists and the list could not be read. */
  | { status: 'failed' }
  /** A settled list that does not contain the Studio server. */
  | { status: 'unbound' }
  /** A settled list that does; the row carries the tools the link supplies. */
  | { status: 'bound'; server: StudioMcpRow }

/**
 * Project one MCP reading onto the Studio link it implies.
 *
 * @param state - the reading `StudioMcpSource` published.
 * @returns the binding this page may state. Only a settled list decides
 * between bound and unbound; the four readings that carry no list keep their
 * own names, because none of them says anything about whether a link exists.
 */
export function readStudioBinding(state: StudioMcpState): StudioBinding {
  if (state.status !== 'ready') return { status: state.status }
  const server = state.servers.find(row => row.id === STUDIO_MCP_SERVER_ID)
  return server === undefined ? { status: 'unbound' } : { status: 'bound', server }
}
