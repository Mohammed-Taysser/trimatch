import { useQuery } from '@tanstack/react-query';
import { HealthLivenessSchema, HealthReadinessSchema } from '@trimatch/shared';
import { webEnv } from './lib/env';

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${webEnv.VITE_API_BASE_URL}${path}`);
  return res.json();
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li>
      {ok ? '🟢' : '🔴'} {label}
    </li>
  );
}

export default function App() {
  const liveness = useQuery({
    queryKey: ['health', 'liveness'],
    queryFn: async () => HealthLivenessSchema.parse(await fetchJson('/api/v1/health/liveness')),
    refetchInterval: 5000,
  });
  const readiness = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: async () => HealthReadinessSchema.parse(await fetchJson('/api/v1/health/readiness')),
    refetchInterval: 5000,
    retry: false,
  });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto' }}>
      <h1>TriMatch</h1>
      <p>Procurement with 3-way matching — scaffold health check.</p>

      <h2>API</h2>
      {liveness.isPending && <p>Checking…</p>}
      {liveness.isError && <p>🔴 api unreachable — is `pnpm dev` running?</p>}
      {liveness.data && (
        <p>
          🟢 {liveness.data.service} up for {Math.round(liveness.data.uptimeSeconds)}s
        </p>
      )}

      <h2>Infrastructure</h2>
      {readiness.isPending && <p>Checking…</p>}
      {readiness.isError && <p>🔴 readiness degraded — is `docker compose up` running?</p>}
      {readiness.data && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <Check label="postgres" ok={readiness.data.checks.postgres} />
          <Check label="redis" ok={readiness.data.checks.redis} />
        </ul>
      )}
    </main>
  );
}
