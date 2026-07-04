import { FormEvent, useState } from 'react';
import { Alert, Button, Card, Field } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export function LoginPage() {
  const { login, completeTwoFactor } = useAuth();
  const [email, setEmail] = useState('requester@demo');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      // 2FA on → move to the second-factor step instead of a session.
      if ('twoFactorRequired' in result) setChallenge(result.challenge);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await completeTwoFactor(challenge, code.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <h1>TriMatch</h1>
          <p>Requisition → approval → PO → receipt → invoice → 3-way match</p>
        </div>
        <Card>
          {challenge ? (
            <form onSubmit={(e) => void onVerify(e)} className="form-grid">
              <p className="card-meta">
                Enter the 6-digit code from your authenticator app, or a recovery code.
              </p>
              <Field label="Authentication code">
                <input
                  aria-label="Authentication code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  inputMode="text"
                  autoFocus
                />
              </Field>
              {error && <Alert kind="error">{error}</Alert>}
              <Button type="submit" variant="primary" disabled={busy || code.trim().length < 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
              <Button
                onClick={() => {
                  setChallenge(null);
                  setCode('');
                  setError(null);
                }}
              >
                ← Back
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="form-grid">
              <Field label="Email">
                <input
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              {error && <Alert kind="error">{error}</Alert>}
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
