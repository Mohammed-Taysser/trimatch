import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthLiveness, HealthReadiness } from '@trimatch/shared';
import { Public } from '../auth/decorators';
import { HealthService } from './health.service';

@Public()
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
