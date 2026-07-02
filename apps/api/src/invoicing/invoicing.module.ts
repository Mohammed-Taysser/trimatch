import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { Invoice, InvoiceLine } from './invoice.model';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

@Module({
  imports: [SequelizeModule.forFeature([Invoice, InvoiceLine]), AuditModule],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
