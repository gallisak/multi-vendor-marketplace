import { Global, Module } from '@nestjs/common';
import { IdempotentConsumerService } from './idempotent-consumer.service.js';
import { OutboxService } from './outbox.service.js';

@Global()
@Module({
  providers: [OutboxService, IdempotentConsumerService],
  exports: [OutboxService, IdempotentConsumerService],
})
export class OutboxModule {}
