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

export async function openCertificate(memberId, pending = false) {
  const url = `/api/uploads/certificate/${memberId}${pending ? '?pending=1' : ''}`;
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

export async function openPendingCertificate(pendingId) {
  const res = await fetch(`/api/uploads/pending-certificate/${pendingId}`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Ne mogu otvoriti potvrdu.');
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
