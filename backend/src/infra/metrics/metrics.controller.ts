import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators.js';

@SkipThrottle()
@Public()
@ApiExcludeController()
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  override index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}
