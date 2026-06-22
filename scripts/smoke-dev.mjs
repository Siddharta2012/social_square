import { io } from 'socket.io-client';

const serverUrl = process.env.SMOKE_SERVER_URL ?? 'http://localhost:3000';
const username = process.env.SMOKE_USERNAME ?? `smoke-${Date.now()}`;
const password = process.env.SMOKE_PASSWORD ?? 'smoke-pass';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function tokenForSmokeUser() {
  if (process.env.SMOKE_AUTH_TOKEN) return process.env.SMOKE_AUTH_TOKEN;
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return login.token;
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

async function main() {
  const health = await request('/api/health');
  assert(health.status === 'ok' || health.status === 'degraded', 'healthcheck did not respond');

  const token = await tokenForSmokeUser();
  const profile = await request('/api/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(profile.userId, 'profile missing userId');

  await request('/api/auth/profile/daily', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  const socket = io(serverUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  await waitFor(socket, 'connect');

  const avatarConfig = profile.avatarConfig ?? {
    userId: profile.userId,
    username: profile.username ?? username,
    body: 0,
    outfit: 0,
    hair: 0,
    hairColor: '#4488ff',
    accessory: 0,
    expression: 0,
  };

  socket.emit('join-room', { roomId: 'bar', avatarConfig });
  await waitFor(socket, 'room-state');

  const petalPoints = [
    { x: 3, y: 35 },
    { x: 12, y: 30 },
    { x: 20, y: 42 },
    { x: 11, y: 43 },
    { x: 28, y: 33 },
    { x: 35, y: 42 },
    { x: 41, y: 30 },
    { x: 44, y: 14 },
  ];

  let petals = profile.petals ?? 0;
  for (const point of petalPoints) {
    socket.emit('move', { ...point, direction: 0, state: 'idle' });
    const collectedPromise = waitFor(
      socket,
      'petals-collected',
      (payload) => Math.round(payload.position?.x) === point.x && Math.round(payload.position?.y) === point.y,
      6000,
    ).catch(() => null);
    socket.emit('interact', { objectId: 'petal-bloom', action: 'petal-collect', payload: point });
    const collected = await collectedPromise;
    if (collected?.petals) petals = collected.petals;
    if (petals >= 200) break;
  }

  assert(petals >= 200, `not enough petals for jukebox smoke (${petals})`);

  socket.emit('move', { x: 16, y: 3, direction: 0, state: 'idle' });
  socket.emit('interact', { objectId: 'jukebox', action: 'jukebox-toggle' });
  await waitFor(socket, 'object-state-changed', (object) => object.objectId === 'jukebox' && object.state?.playing === true, 6000);

  socket.emit('leave-room', { roomId: 'bar' });
  socket.disconnect();
  console.log(JSON.stringify({ ok: true, userId: profile.userId, petalsAfterSmoke: petals - 200 }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
