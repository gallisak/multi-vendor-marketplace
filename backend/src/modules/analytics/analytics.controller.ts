import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import { ChartQueryDto, ExportQueryDto, PeriodQueryDto } from './analytics.dto.js';
import { toCsv } from './analytics.rules.js';
import { AnalyticsService, EXPORT_COLUMNS } from './analytics.service.js';
import { SellerDashboardService } from './seller-dashboard.service.js';

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@Query() query: PeriodQueryDto) {
    return this.analytics.summary(this.analytics.period(query.from, query.to));
  }

  @Get('sales-chart')
  chart(@Query() query: ChartQueryDto) {
    return this.analytics.salesChart(query.days);
  }

  @Get('export')
  @ApiProduces('text/csv', 'application/json')
  @ApiOkResponse({ description: 'Daily sales per seller and product for the period' })
  async export(@Query() query: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    const period = this.analytics.period(query.from, query.to);
    const rows = await this.analytics.exportRows(period);
    const name = `sales-${query.from ?? 'last-30-days'}-${query.to ?? 'today'}`;

    if (query.format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      return { generatedAt: new Date().toISOString(), columns: EXPORT_COLUMNS, rows };
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return toCsv([...EXPORT_COLUMNS], rows);
  }
}

@ApiTags('seller')
@Roles(Role.SELLER)
@Controller('seller/dashboard')
export class SellerDashboardController {
  constructor(private readonly dashboard: SellerDashboardService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.dashboard.dashboard(user.id);
  }
}
