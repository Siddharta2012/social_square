export interface PrivateRoomSummary {
  roomId: string;
  code: string;
  name: string;
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function createPrivateRoom(token: string | null): Promise<PrivateRoomSummary | null> {
  if (!token) return null;
  const res = await fetch('/api/private-rooms/create', {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json() as { room?: PrivateRoomSummary };
  return data.room ?? null;
}

export async function joinPrivateRoom(token: string | null, code: string): Promise<PrivateRoomSummary | null> {
  if (!token) return null;
  const res = await fetch('/api/private-rooms/join', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { room?: PrivateRoomSummary };
  return data.room ?? null;
}
