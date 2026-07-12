export async function getD1(): Promise<D1Database | null> {
  try {
    const specifier = "cloudflare:workers";
    const runtime = await import(/* webpackIgnore: true */ specifier) as { env?: { DB?: D1Database } };
    return runtime.env?.DB ?? null;
  } catch {
    return null;
  }
}

