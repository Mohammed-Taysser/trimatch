import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length

// Encrypts TOTP secrets at rest (869e01b1b). A TOTP secret must be recoverable to
// verify codes, so it can't be hashed — it is encrypted with AES-256-GCM under
// TOTP_ENCRYPTION_KEY. Output is `iv:authTag:ciphertext` (hex); the auth tag makes
// tampering detectable on decrypt.
@Injectable()
export class TotpCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('TOTP_ENCRYPTION_KEY'), 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decrypt(blob: string): string {
    const [ivHex, tagHex, dataHex] = blob.split(':');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
      'utf8',
    );
  }
}
