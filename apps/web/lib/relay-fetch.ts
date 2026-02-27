/** Fetch wrapper that adds X-Session-Token header for relay requests */
export function relayFetch(
  url: string,
  sessionToken: string | undefined,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (sessionToken) {
    headers.set("X-Session-Token", sessionToken);
  }
  return fetch(url, { ...init, headers });
}
