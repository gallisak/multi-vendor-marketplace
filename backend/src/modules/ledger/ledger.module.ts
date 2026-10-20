import { Module } from '@nestjs/common';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';

@Module({
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerService, LedgerRepository],
})
export class LedgerCoreModule {}
