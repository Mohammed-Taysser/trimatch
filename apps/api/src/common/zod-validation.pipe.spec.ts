import { ArgumentMetadata, UnprocessableEntityException } from '@nestjs/common';
import { LoginRequestDto } from '../auth/dto';
import { AppZodValidationPipe } from './zod-validation.pipe';

const pipe = new AppZodValidationPipe();
const bodyMeta: ArgumentMetadata = { type: 'body', metatype: LoginRequestDto };

describe('request bodies are validated with 422 VALIDATION_ERROR (ADR-0003)', () => {
  it('passes through a valid payload', () => {
    const value = { email: 'requester@demo', password: 'Demo123!' };
    expect(pipe.transform(value, bodyMeta)).toEqual(value);
  });

  it('throws 422 with machine-readable code and issue details', () => {
    try {
      pipe.transform({ email: 'requester@demo' }, bodyMeta);
      fail('expected UnprocessableEntityException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const body = (error as UnprocessableEntityException).getResponse() as {
        code: string;
        details: { path: string }[];
      };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details.some((d) => d.path === 'password')).toBe(true);
    }
  });

  it('ignores params that are not zod dtos', () => {
    expect(pipe.transform('plain', { type: 'param' })).toBe('plain');
  });
});
