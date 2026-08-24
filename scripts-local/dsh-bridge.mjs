// TCP bridge: 172.17.0.1:3080 (docker0 gateway) -> 127.0.0.1:3080 (rabi web).
//
// dsh's webserver accepts only 127.0.0.1 or 0.0.0.0 as its bind host, and the
// CLI hard-blocks 0.0.0.0 ("it would expose remote code execution to the
// network"). Caddy runs in a container and dials host.docker.internal
// (= 172.17.0.1), which a loopback-bound listener refuses. Binding this bridge
// to the docker gateway alone keeps dsh off ens5/the VPC: only this host and
// containers on docker0 can reach it, and the public path stays Caddy's
// basicauth on 443.
//
// Raw socket piping, so the /api WebSocket downlinks upgrade untouched.

import net from 'node:net'

const LISTEN_HOST = process.env.DSH_BRIDGE_HOST ?? '172.17.0.1'
const LISTEN_PORT = Number(process.env.DSH_BRIDGE_PORT ?? 3080)
const TARGET_HOST = '127.0.0.1'
const TARGET_PORT = Number(process.env.DSH_TARGET_PORT ?? 3080)

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST)
  // Either half failing tears down both; a half-open pair would leak sockets.
  const drop = (err) => {
    if (err) console.warn(`[dsh-bridge] ${err.code ?? err.message}`)
    client.destroy()
    upstream.destroy()
  }
  client.on('error', drop)
  upstream.on('error', drop)
  client.pipe(upstream)
  upstream.pipe(client)
})

server.on('error', (err) => {
  console.error(`[dsh-bridge] listen failed: ${err.message}`)
  process.exit(1)
})

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[dsh-bridge] ${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`)
})
