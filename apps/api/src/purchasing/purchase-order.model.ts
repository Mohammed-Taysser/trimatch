import { PoStatus } from '@trimatch/shared';
import { literal } from 'sequelize';
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { User } from '../identity/user.model';
import { Requisition } from '../requisitions/requisition.model';
import { Vendor } from '../vendors/vendor.model';

@Table({ tableName: 'purchase_orders', underscored: true, timestamps: true })
export class PurchaseOrder extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @Column(DataType.STRING(20))
  declare poNumber: string | null;

  @AllowNull(false)
  @Default('draft')
  @Column(DataType.STRING(32))
  declare status: PoStatus;

  @ForeignKey(() => Vendor)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare vendorId: string;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @ForeignKey(() => Requisition)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare requisitionId: string;

  @AllowNull(false)
  @Column(DataType.CHAR(3))
  declare currency: string;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare totalMinor: string | number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare createdBy: string;

  @AllowNull(false)
  @Default(1)
  @Column(DataType.INTEGER)
  declare version: number;

  @HasMany(() => PoLine)
  declare lines?: PoLine[];
}

// FR-604: what a superseded version looked like — append-only (DB trigger).
export interface PoVersionSnapshot {
  totalMinor: number;
  lines: {
    poLineId: string;
    lineNo: number;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }[];
}

@Table({ tableName: 'po_amendments', underscored: true, timestamps: true })
export class PoAmendment extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => PurchaseOrder)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poId: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare version: number;

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare snapshot: PoVersionSnapshot;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  declare reason: string;

  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  declare requiresReapproval: boolean;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare amendedBy: string;
}

@Table({ tableName: 'po_lines', underscored: true, timestamps: true })
export class PoLine extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => PurchaseOrder)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poId: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare lineNo: number;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  declare description: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare category: string;

  @Column(DataType.STRING(100))
  declare vendorSku: string | null;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare quantity: number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare unitPriceMinor: string | number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare lineTotalMinor: string | number;
}
