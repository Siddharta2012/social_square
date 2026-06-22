const counters = {
  connectedSockets: 0,
  economyEvents: 0,
};

export function socketConnected(): void {
  counters.connectedSockets += 1;
}

export function socketDisconnected(): void {
  counters.connectedSockets = Math.max(0, counters.connectedSockets - 1);
}

export function economyEvent(): void {
  counters.economyEvents += 1;
}

export function metricsSnapshot(): typeof counters {
  return { ...counters };
}
