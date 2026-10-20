import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { MaintenanceService } from './infra/outbox/maintenance.service.js';
import { OutboxRelayService } from './infra/outbox/outbox-relay.service.js';
import { LedgerWorkerModule } from './modules/ledger/ledger.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications.module.js';
import { PaymentsWorkerModule } from './modules/payments/payments.module.js';
import { SearchSyncModule } from './modules/search/search.module.js';

@Module({
  imports: [
    CoreModule,
    HealthModule,
    SearchSyncModule,
    NotificationsWorkerModule,
    PaymentsWorkerModule,
    LedgerWorkerModule,
  ],
  providers: [OutboxRelayService, MaintenanceService],
})
export class WorkerModule {}
