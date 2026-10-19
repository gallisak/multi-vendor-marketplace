import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DependenciesHealthIndicator } from './dependencies.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DependenciesHealthIndicator],
})
export class HealthModule {}
