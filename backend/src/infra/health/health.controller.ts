import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators.js';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DependenciesHealthIndicator } from './dependencies.health.js';

@SkipThrottle()
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly deps: DependenciesHealthIndicator,
  ) {}

  @Get()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.deps.database(),
      () => this.deps.redis(),
      () => this.deps.search(),
    ]);
  }
}
