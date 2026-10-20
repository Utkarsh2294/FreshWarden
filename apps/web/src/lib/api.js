const base = import.meta.env.VITE_API_URL || '';
export async function api(path, { body, token, signal, ...options } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    signal,
    headers: {
      ...(body && !multipart && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...(body && { body: multipart ? body : JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw Object.assign(
      new Error(data?.error?.message || `Request failed (${response.status}).`),
      { status: response.status },
    );
  }
  if (
    response.headers.get('content-type')?.includes('application/pdf') ||
    response.headers.get('content-type')?.startsWith('image/')
  )
    return response.blob();
  return response.json();
}
