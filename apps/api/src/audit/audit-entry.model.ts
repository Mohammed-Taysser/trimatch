import { literal } from 'sequelize';
import {
  AllowNull,
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

// Append-only (I-7): rows are inserted inside the owning transaction and never
// updated or deleted (updatedAt disabled to match the table).
@Table({ tableName: 'audit_log', underscored: true, timestamps: true, updatedAt: false })
export class AuditEntry extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  declare entityType: string;

  @AllowNull(false)
  @Column(DataType.UUID)
  declare entityId: string;

  @AllowNull(false)
  @Column(DataType.UUID)
  declare actorId: string;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  declare action: string;

  @Column(DataType.STRING(32))
  declare fromState: string | null;

  @Column(DataType.STRING(32))
  declare toState: string | null;

  @Column(DataType.TEXT)
  declare comment: string | null;

  @CreatedAt
  declare createdAt: Date;
}
