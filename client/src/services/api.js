const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export async function apiRequest(path, { signal, method = 'GET', body, accessToken } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      signal,
      method,
      headers: {
        Accept: 'application/json',
        ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the catalogue service. Check your connection and try again.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The catalogue service returned an unreadable response.');
  }

  if (!response.ok || !payload.success) {
    const error = new Error(payload.message || 'The catalogue request failed.');
    error.status = response.status;
    throw error;
  }

  return payload.data;
}
