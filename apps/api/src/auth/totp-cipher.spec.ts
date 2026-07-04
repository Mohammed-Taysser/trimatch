import { ConfigService } from '@nestjs/config';
import { TotpCipher } from './totp-cipher';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function cipherWith(key = KEY): TotpCipher {
  return new TotpCipher({ getOrThrow: () => key } as unknown as ConfigService);
}

describe('TotpCipher encrypts TOTP secrets at rest (869e01b1b)', () => {
  it('round-trips a secret back to plaintext', () => {
    const cipher = cipherWith();
    const secret = 'JBSWY3DPEHPK3PXP';
    const blob = cipher.encrypt(secret);
    expect(blob).not.toContain(secret); // not stored in the clear
    expect(cipher.decrypt(blob)).toBe(secret);
  });

  it('produces a fresh IV each time (same input → different ciphertext)', () => {
    const cipher = cipherWith();
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const cipher = cipherWith();
    const [iv, tag, data] = cipher.encrypt('secret').split(':');
    const flipped = data.startsWith('a') ? `b${data.slice(1)}` : `a${data.slice(1)}`;
    expect(() => cipher.decrypt([iv, tag, flipped].join(':'))).toThrow();
  });

  it('cannot decrypt under a different key', () => {
    const blob = cipherWith().encrypt('secret');
    const other = cipherWith('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    expect(() => other.decrypt(blob)).toThrow();
  });
});
