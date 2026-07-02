import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { SequencesModule } from '../common/sequences.module';
import { VendorsModule } from '../vendors/vendors.module';
import { PoAmendment, PoLine, PurchaseOrder } from './purchase-order.model';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  imports: [
    SequelizeModule.forFeature([PurchaseOrder, PoLine, PoAmendment]),
    VendorsModule,
    AuditModule,
    SequencesModule,
  ],
  controllers: [PurchasingController],
  providers: [PurchasingService],
})
export class PurchasingModule {}
