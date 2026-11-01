// Authentication stays in HttpOnly cookies. Only a change notification crosses tabs.
let generation = 0;
const requests = new Set();
const cleanups = new Set();
export function registerAuthCleanup(cleanup) {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}
export function invalidateAuth(broadcast = true) {
  generation++;
  for (const controller of requests) controller.abort();
  requests.clear();
  for (const cleanup of [...cleanups]) {
    try {
      cleanup();
    } catch {
      /* Continue closing other resources. */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("medikiosk:auth-reset"));
    if (broadcast) {
      try {
        localStorage.setItem("medikiosk:auth-change", crypto.randomUUID());
      } catch {
        /* Storage can be disabled. */
      }
    }
  }
}
export async function authFetch(url, options = {}) {
  const { timeoutMs = 30000, signal, ...requestOptions } = options;
  const version = generation;
  const controller = new AbortController();
  const deadline = AbortSignal.timeout(timeoutMs);
  requests.add(controller);
  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.any([
        controller.signal,
        deadline,
        ...(signal ? [signal] : []),
      ]),
    });
    // Read the body before releasing the controller so logout also cancels body reads.
    const body = await response.arrayBuffer();
    if (version !== generation)
      throw new DOMException("Session changed", "AbortError");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    requests.delete(controller);
  }
}
