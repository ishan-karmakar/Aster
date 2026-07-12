declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; UPLOADS?: R2Bucket };
}
interface R2Bucket { put(key:string,value:ArrayBuffer|Uint8Array|ReadableStream,options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>; get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>}|null>; delete(key:string):Promise<void>; }

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
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Result<T = unknown> { results: T[]; success: boolean; meta?: { last_row_id?: number }; }
interface D1ExecResult { count: number; duration: number; }
