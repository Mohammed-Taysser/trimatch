import { UnprocessableEntityException } from '@nestjs/common';
import { LoginRequestSchema } from '@trimatch/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

const pipe = new ZodValidationPipe(LoginRequestSchema);

describe('request bodies are validated with 422 VALIDATION_ERROR', () => {
  it('passes through a valid payload', () => {
    const value = { email: 'requester@demo', password: 'Demo123!' };
    expect(pipe.transform(value)).toEqual(value);
  });

  it('throws 422 with machine-readable code and issue details', () => {
    try {
      pipe.transform({ email: 'requester@demo' });
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
});
