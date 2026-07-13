import { devLog } from "./devLog";

const loggedKeys = new Set<string>();
const lastLoggedState = new Map<string, string>();

export function logOnce(key: string, message: string): void {
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  devLog(message);
}

export function resetLogOnce(key: string): void {
  loggedKeys.delete(key);
}

export function logOnStateChange(
  integration: string,
  previousStatus: string,
  nextStatus: string,
  message: string,
): void {
  const stateKey = `${integration}:${nextStatus}`;
  if (previousStatus === nextStatus && lastLoggedState.get(integration) === stateKey) {
    return;
  }
  lastLoggedState.set(integration, stateKey);
  devLog(`[SUDA][${integration}] ${message}`);
}

export function resetIntegrationLog(integration: string): void {
  lastLoggedState.delete(integration);
}

export function __resetIntegrationLogForTests(): void {
  loggedKeys.clear();
  lastLoggedState.clear();
}
