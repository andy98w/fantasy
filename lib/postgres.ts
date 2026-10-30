import { Pool, type PoolConfig } from "pg";

export function createPool(config: PoolConfig) {
  const pool = new Pool(config);
  // pg removes failed idle connections. Handling its error event keeps a
  // temporary DB disconnect from becoming an uncaught process exception.
  pool.on("error", () => console.error("Idle database connection lost; the pool will reconnect."));
  return pool;
}
