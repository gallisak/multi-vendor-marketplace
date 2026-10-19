import { InjectQueue } from '@nestjs/bullmq';
import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { Public, Roles } from '../../common/auth/decorators.js';
import { queueName } from '../../common/events/subscriptions.js';
import { TimeoutError, withTimeout } from '../../common/with-timeout.js';
import { Role } from '../../generated/prisma/enums.js';
import { REINDEX_JOB } from './search-sync.processor.js';
import { SearchQueryDto, SearchResultDto } from './search.dto.js';
import { SearchService } from './search.service.js';

export const ENQUEUE_TIMEOUT_MS = 2000;

@ApiTags('catalog')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: SearchResultDto })
  query(@Query() query: SearchQueryDto) {
    return this.search.search(query);
  }
}

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/search')
export class AdminSearchController {
  constructor(@InjectQueue(queueName('search-sync')) private readonly queue: Queue) {}

  @Post('reindex')
  @HttpCode(202)
  @ApiAcceptedResponse({ description: 'Full reindex scheduled on the worker' })
  @ApiServiceUnavailableResponse({ description: 'Job queue is unavailable' })
  async reindex() {
    try {
      const job = await withTimeout(
        this.queue.add(REINDEX_JOB, {}, { jobId: `reindex-${Date.now()}`, attempts: 3 }),
        ENQUEUE_TIMEOUT_MS,
      );
      return { jobId: job.id };
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new ServiceUnavailableException('Job queue is unavailable, try again later');
      }
      throw error;
    }
  }
}
