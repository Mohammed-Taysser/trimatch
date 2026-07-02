import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditModule } from '../audit/audit.module';
import { SequencesModule } from '../common/sequences.module';
import { Grn, GrnLine } from './grn.model';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';

@Module({
  imports: [SequelizeModule.forFeature([Grn, GrnLine]), SequencesModule, AuditModule],
  controllers: [ReceivingController],
  providers: [ReceivingService],
  exports: [ReceivingService],
})
export class ReceivingModule {}
