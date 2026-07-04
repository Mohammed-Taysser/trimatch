import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

// Comma-separated allowed origins → a trimmed, non-empty list (869dzymvy).
export function parseWsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Backs the Socket.IO server with a Redis pub/sub adapter so room emits reach
// clients connected to any instance (reuses REDIS_URL — no new config). Wired in
// main.ts; tests fall back to the in-memory default, which is fine single-node.
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private corsOrigin: string[] = [];

  async connectToRedis(url: string): Promise<void> {
    const pubClient = new Redis(url);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  // Restricts the Socket.IO CORS origin to the configured allow-list (869dzymvy):
  // a browser handshake from any other origin is rejected. Set from
  // WS_CORS_ORIGIN in main.ts.
  setCorsOrigin(origins: string[]): void {
    this.corsOrigin = origins;
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
    }) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
