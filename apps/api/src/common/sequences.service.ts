import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

// I-6: gapless per year per type. The claim is a single upsert inside the
// caller's transaction — concurrent claims serialize on the row lock, and a
// rollback releases the number together with the document it was meant for.
@Injectable()
export class SequencesService {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async claim(docType: string, year: number, transaction: Transaction): Promise<number> {
    const rows = await this.sequelize.query<{ last_no: number }>(
      `INSERT INTO sequences (doc_type, year, last_no) VALUES (:docType, :year, 1)
       ON CONFLICT (doc_type, year) DO UPDATE SET last_no = sequences.last_no + 1
       RETURNING last_no`,
      { replacements: { docType, year }, type: QueryTypes.SELECT, transaction },
    );
    return rows[0].last_no;
  }
}

export function formatDocNumber(docType: string, year: number, sequence: number): string {
  return `${docType}-${year}-${String(sequence).padStart(4, '0')}`;
}
