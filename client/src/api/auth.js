export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

export function jsonHeaders() {
  return { ...authHeaders(), 'Content-Type': 'application/json' };
}

export async function refreshToken() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      return true;
    }
  } catch (err) {
    console.error('Token refresh failed:', err);
  }
  return false;
}

export async function openCertificate(id, mode = 'member') {
  let url;
  if (mode === 'application') {
    url = `/api/uploads/pending-certificate/${id}`;
  } else if (mode === 'pending') {
    url = `/api/uploads/certificate/${id}?pending=1`;
  } else {
    url = `/api/uploads/certificate/${id}`;
  }

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Ne mogu otvoriti potvrdu.');
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

