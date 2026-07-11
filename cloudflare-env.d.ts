declare module "cloudflare:workers" {
  export const env: { DB?: D1Database };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
}

interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; }
interface D1PreparedStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Result<T = unknown> { results: T[]; success: boolean; }
interface D1ExecResult { count: number; duration: number; }
