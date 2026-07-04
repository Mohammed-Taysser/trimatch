import { useMutation } from '@tanstack/react-query';
import {
  TwoFactorEnableResponseSchema,
  TwoFactorSetupResponse,
  TwoFactorSetupResponseSchema,
} from '@trimatch/shared';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, ConfirmButton, Field } from '../../components/ui';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function SecurityPage() {
  const { token, user, setTwoFactorEnabled } = useAuth();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const enabled = user?.twoFactorEnabled ?? false;

  const startSetup = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/auth/2fa/setup', {
        method: 'POST',
        token,
        schema: TwoFactorSetupResponseSchema,
      }),
    onSuccess: (data) => {
      setSetup(data);
      setError(null);
    },
    onError: (err) => setError(message(err, 'Could not start setup')),
  });

  const enable = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/auth/2fa/enable', {
        method: 'POST',
        body: { code: code.trim() },
        token,
        schema: TwoFactorEnableResponseSchema,
      }),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setCode('');
      setError(null);
      setTwoFactorEnabled(true);
    },
    onError: (err) => setError(message(err, 'Invalid code — try the current one')),
  });

  const disable = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/auth/2fa/disable', {
        method: 'POST',
        body: { code: code.trim() },
        token,
      }),
    onSuccess: () => {
      setCode('');
      setError(null);
      setTwoFactorEnabled(false);
    },
    onError: (err) => setError(message(err, 'Could not disable two-factor auth')),
  });

  return (
    <AppShell title="Security" subtitle="Two-factor authentication for your account">
      {recoveryCodes ? (
        <Card>
          <h2>Save your recovery codes</h2>
          <Alert kind="success">
            Two-factor authentication is on. Store these codes somewhere safe — each one works once
            if you lose your authenticator. They won&apos;t be shown again.
          </Alert>
          <pre className="recovery-codes">{recoveryCodes.join('\n')}</pre>
          <div className="form-row">
            <Button onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n'))}>
              Copy codes
            </Button>
            <Button variant="primary" onClick={() => setRecoveryCodes(null)}>
              Done
            </Button>
          </div>
        </Card>
      ) : enabled ? (
        <Card>
          <h2>
            Two-factor authentication is <span className="badge badge-ok">on</span>
          </h2>
          <p className="card-meta">
            You&apos;ll be asked for a code from your authenticator (or a recovery code) each time
            you sign in.
          </p>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              disable.mutate();
            }}
          >
            <Field label="Current code to turn it off">
              <input
                aria-label="Current code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <ConfirmButton
              type="submit"
              variant="danger"
              confirmLabel="Disable 2FA"
              disabled={disable.isPending || code.trim().length < 6}
              onConfirm={() => disable.mutate()}
            >
              Disable two-factor auth
            </ConfirmButton>
          </form>
        </Card>
      ) : setup ? (
        <Card>
          <h2>Scan and confirm</h2>
          <p className="card-meta">
            Scan this with an authenticator app (Google Authenticator, 1Password, …), or enter the
            key manually, then confirm a code to finish.
          </p>
          <div className="qr-box">
            <QRCodeSVG value={setup.otpauthUri} size={176} includeMargin />
          </div>
          <p className="card-meta">
            Setup key: <code>{setup.secret}</code>
          </p>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              enable.mutate();
            }}
          >
            <Field label="6-digit code">
              <input
                aria-label="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
              />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <div className="form-row">
              <Button
                type="submit"
                variant="primary"
                disabled={enable.isPending || code.trim().length !== 6}
              >
                {enable.isPending ? 'Confirming…' : 'Confirm & enable'}
              </Button>
              <Button
                onClick={() => {
                  setSetup(null);
                  setCode('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <h2>
            Two-factor authentication is <span className="badge badge-neutral">off</span>
          </h2>
          <p className="card-meta">
            Add a second step at sign-in using an authenticator app. You&apos;ll get one-time
            recovery codes for when your device isn&apos;t available.
          </p>
          {error && <Alert kind="error">{error}</Alert>}
          <Button
            variant="primary"
            disabled={startSetup.isPending}
            onClick={() => startSetup.mutate()}
          >
            {startSetup.isPending ? 'Starting…' : 'Set up two-factor auth'}
          </Button>
        </Card>
      )}
    </AppShell>
  );
}
