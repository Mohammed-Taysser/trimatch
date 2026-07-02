import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthLiveness, HealthReadiness } from '@trimatch/shared';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('liveness')
  liveness(): HealthLiveness {
    return this.health.liveness();
  }

  @Get('readiness')
  async readiness(): Promise<HealthReadiness> {
    const result = await this.health.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
