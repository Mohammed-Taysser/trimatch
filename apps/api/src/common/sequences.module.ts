import { Module } from '@nestjs/common';
import { SequencesService } from './sequences.service';

@Module({
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}
