import * as React from 'react'

/**
 * The right-column host for live Viewer windows.
 *
 * UnieAI fork divergence. Upstream floats its Viewer windows over the
 * conversation; this fork docks them in the shell's right column, which is a
 * place to work rather than a thing to drag out of the way.
 *
 * The host is a plain container registered into the shell's `document` slot.
 * The dock — which already owns which files are open and why — portals its
 * window stack in here, so the state logic stays in one place and only the
 * destination changes.
 */

type HostElement = HTMLDivElement | null
type Subscriber = (element: HostElement) => void

let hostElement: HostElement = null
const subscribers = new Set<Subscriber>()

/** Publish the mounted host so the dock can portal into it. */
function setHost(element: HostElement): void {
  hostElement = element
  for (const subscriber of subscribers) subscriber(element)
}

/**
 * Subscribe to the right column's host element.
 * @param subscriber - called with the element, or null when the column is closed.
 * @returns the unsubscribe function.
 */
export function subscribeDocumentHost(subscriber: Subscriber): () => void {
  subscribers.add(subscriber)
  subscriber(hostElement)
  return () => { subscribers.delete(subscriber) }
}

/** React hook form of {@link subscribeDocumentHost}. */
export function useDocumentHost(): HostElement {
  const [element, setElement] = React.useState<HostElement>(hostElement)
  React.useEffect(() => subscribeDocumentHost(setElement), [])
  return element
}

/** The `document` slot occupant: an empty container the dock fills. */
export function UniverDocumentHost(): React.ReactElement {
  const ref = React.useCallback((element: HostElement) => { setHost(element) }, [])
  return <div className="uvf_documentHost" ref={ref} />
}
