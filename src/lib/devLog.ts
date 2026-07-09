export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.info(...args);
  }
}
