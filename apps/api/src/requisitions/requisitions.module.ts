import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Requisition, RequisitionLine } from './requisition.model';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';

@Module({
  imports: [SequelizeModule.forFeature([Requisition, RequisitionLine])],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
})
export class RequisitionsModule {}
