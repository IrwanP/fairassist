import { getCurrentUserIdToken } from "../lib/firebase";

/**
 * Authenticated fetch helper for FairAssist API calls.
 * Automatically injects the Firebase ID Token in the Authorization header.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getCurrentUserIdToken();
  
  const headers = new Headers(init?.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  return fetch(input, {
    ...init,
    headers,
  });
}
