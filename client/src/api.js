const TOKEN_KEY = 'stocksense_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Cannot reach the server');
  }

  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_err) {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      setToken(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    const error = new Error(data?.error || response.statusText || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function download(path) {
  const token = getToken();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = 'Export failed';
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch (_err) {
      // The body was not JSON.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  link.href = url;
  link.download = match ? match[1] : 'export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
