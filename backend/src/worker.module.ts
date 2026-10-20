import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { MaintenanceService } from './infra/outbox/maintenance.service.js';
import { OutboxRelayService } from './infra/outbox/outbox-relay.service.js';
import { AnalyticsWorkerModule } from './modules/analytics/analytics.module.js';
import { AuctionsWorkerModule } from './modules/auctions/auctions.module.js';
import { LedgerWorkerModule } from './modules/ledger/ledger.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications.module.js';
import { PaymentsWorkerModule } from './modules/payments/payments.module.js';
import { RealtimeWorkerModule } from './modules/realtime/realtime.module.js';
import { SearchSyncModule } from './modules/search/search.module.js';

@Module({
  imports: [
    CoreModule,
    HealthModule,
    SearchSyncModule,
    NotificationsWorkerModule,
    PaymentsWorkerModule,
    LedgerWorkerModule,
    AuctionsWorkerModule,
    RealtimeWorkerModule,
    AnalyticsWorkerModule,
  ],
  providers: [OutboxRelayService, MaintenanceService],
})
export class WorkerModule {}
