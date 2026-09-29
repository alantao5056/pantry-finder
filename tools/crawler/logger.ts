/**
 * Where a crawl's progress messages go: the console for CLI runs; the console
 * plus the run's Firestore log (shown in the admin) for worker runs.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};
