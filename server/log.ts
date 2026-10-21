/**
 * Minimal structured-ish logger. The server only needs three levels; tests inject a
 * silent or recording logger through createApp({ logger }).
 */
export interface Logger {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

const stamp = () => new Date().toISOString();

function write(stream: (line: string) => void, level: string, message: string, detail?: unknown) {
  const suffix = detail === undefined ? '' : ` ${detail instanceof Error ? (detail.stack ?? detail.message) : JSON.stringify(detail)}`;
  stream(`${stamp()} ${level} ${message}${suffix}`);
}

export const consoleLogger: Logger = {
  info: (m, d) => write(console.log, 'info ', m, d),
  warn: (m, d) => write(console.warn, 'warn ', m, d),
  error: (m, d) => write(console.error, 'error', m, d),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
