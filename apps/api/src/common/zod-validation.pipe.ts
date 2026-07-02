import { UnprocessableEntityException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

// Global pipe (APP_PIPE): validates any param typed with a createZodDto class.
// Uniform 422 body with machine-readable code (NFR-05, ADR-0003).
// nestjs-zod types the error as unknown to support both zod v3 and v4.
export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown) => {
    const issues = error instanceof ZodError ? error.issues : [];
    return new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  },
});
