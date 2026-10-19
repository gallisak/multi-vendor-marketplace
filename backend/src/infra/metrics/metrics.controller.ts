import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';

@ApiExcludeController()
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  override index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}
