/**
 * Where the two halves of Loom meet.
 *
 * Both halves need the same three facts — which carrier channel, which endpoint
 * namespace, which endpoints — and DSH 0.2 changed the first one. Keeping them
 * in one module means the host and the client cannot disagree about a route:
 * a disagreement is a 404 on every call, which is exactly how the 0.2 transport
 * change presented itself (an empty 项目 section and `HTTP 405` on
 * `/dsh-loom/getManifest`).
 *
 * ## Why the shared `/api` channel instead of a private one
 *
 * Loom used to own the private channel `/dsh-loom`, registered with
 * `connection.rpc.handle(channel, handler)`. **That call cannot work from a
 * plugin context on DSH 0.2.** `HostConnectionRpc.handle` forwards to
 * `register(owner, …)`, and `owner` is the context that CONSTRUCTED the
 * Connection service — the Connection plugin's own fiber, a sibling of every
 * consumer. `register` then reads `owner.webServer`
 * (`packages/client/connection/src/rpc-host.ts:191-192`), and Cordis resolves a
 * property by walking up from THAT fiber, so the lookup never reaches the
 * plugin that provides `webServer` and throws
 * `cannot get property "webServer" without inject` — at load time, before a
 * single request is served. Loom has no `webServer` to inject on Connection's
 * behalf; only Connection can fix that lookup.
 *
 * A feature-owned **exact Fetch route** is the supported 0.2 shape for a
 * plugin's own endpoint, and it is a better fit than the private channel was:
 *
 *   - the carrier applies its Host/Origin fence and browser authentication
 *     BEFORE dispatch, so Loom inherits the same admission every other `/api`
 *     endpoint gets instead of declaring an authority of its own;
 *   - routes are carrier-neutral: the HTTP bridge, the worker host and the
 *     desktop direct lane all dispatch through `createSharedFetchHandler`;
 *   - no `webServer` injection is needed, so the host half keeps loading in
 *     compositions that have no HTTP server at all.
 *
 * The route is exact, so each endpoint owns its own path and an unknown path
 * stays a 404 rather than reaching Loom's handler.
 */

/** Carrier channel both halves speak on. */
const BRIDGE_CHANNEL = '/api';

/** Endpoint namespace on that channel; also the client's locale namespace. */
const BRIDGE_NAMESPACE = 'dsh-loom';

/**
 * Every endpoint the host serves, in one list.
 *
 * The host registers one exact Fetch route per entry and the client calls only
 * these names; `test/client-bridge.test.cjs` pins both directions, so an
 * endpoint added on one side alone fails the suite instead of 404ing at runtime.
 */
const BRIDGE_ENDPOINTS = Object.freeze(['getManifest', 'putManifest', 'preflight', 'report']);

/**
 * Absolute route path for one endpoint, as the carrier expects it.
 *
 * `path` on a Fetch route is absolute BELOW `/api` — the full pathname — so the
 * endpoint name appears twice: once as the namespace segment and once as the
 * endpoint segment.
 * @param endpoint - one of {@link BRIDGE_ENDPOINTS}.
 * @returns the route path, e.g. `/api/dsh-loom/getManifest`.
 */
function bridgePath(endpoint) {
  return `${BRIDGE_CHANNEL}/${BRIDGE_NAMESPACE}/${endpoint}`;
}

/**
 * The RPC endpoint name the client passes to `connection.rpc.call`.
 *
 * The client passes a channel and an endpoint separately and the carrier joins
 * them into the same path {@link bridgePath} produces, so the two functions are
 * the two halves of one contract.
 * @param endpoint - one of {@link BRIDGE_ENDPOINTS}.
 * @returns the endpoint name, e.g. `dsh-loom/getManifest`.
 */
function bridgeEndpoint(endpoint) {
  return `${BRIDGE_NAMESPACE}/${endpoint}`;
}

module.exports = {
  BRIDGE_CHANNEL,
  BRIDGE_ENDPOINTS,
  BRIDGE_NAMESPACE,
  bridgeEndpoint,
  bridgePath,
};
