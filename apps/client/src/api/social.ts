export interface FriendSummary {
  userId: string;
  username: string;
  status: 'pending_incoming' | 'pending_outgoing' | 'accepted';
  online: boolean;
  roomId: string | null;
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchFriends(token: string | null): Promise<FriendSummary[]> {
  if (!token) return [];
  const res = await fetch('/api/social/friends', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json() as { friends?: FriendSummary[] };
  return Array.isArray(data.friends) ? data.friends : [];
}

export async function requestFriend(token: string | null, userId: string): Promise<FriendSummary | null> {
  if (!token) return null;
  const res = await fetch('/api/social/friends/request', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { friend?: FriendSummary };
  return data.friend ?? null;
}

export async function acceptFriend(token: string | null, userId: string): Promise<boolean> {
  if (!token) return false;
  const res = await fetch('/api/social/friends/accept', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
  return res.ok;
}

export async function rejectFriend(token: string | null, userId: string): Promise<boolean> {
  if (!token) return false;
  const res = await fetch('/api/social/friends/reject', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
  return res.ok;
}
