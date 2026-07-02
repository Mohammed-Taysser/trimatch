import { InvoiceStatus } from '@trimatch/shared';
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
} from 'sequelize-typescript';
import { User } from '../identity/user.model';
import { PoLine, PurchaseOrder } from '../purchasing/purchase-order.model';
import { Vendor } from '../vendors/vendor.model';

@Table({ tableName: 'invoices', underscored: true, timestamps: true })
export class Invoice extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  declare invoiceNumber: string;

  @ForeignKey(() => Vendor)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare vendorId: string;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @ForeignKey(() => PurchaseOrder)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poId: string;

  @BelongsTo(() => PurchaseOrder)
  declare po?: PurchaseOrder;

  @AllowNull(false)
  @Default('entered')
  @Column(DataType.STRING(32))
  declare status: InvoiceStatus;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare invoiceDate: string;

  @Column(DataType.DATEONLY)
  declare dueDate: string | null;

  @AllowNull(false)
  @Column(DataType.CHAR(3))
  declare currency: string;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare subtotalMinor: string | number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare taxMinor: string | number;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare totalMinor: string | number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare enteredBy: string;

  @HasMany(() => InvoiceLine)
  declare lines?: InvoiceLine[];
}

@Table({ tableName: 'invoice_lines', underscored: true, timestamps: true })
export class InvoiceLine extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Invoice)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare invoiceId: string;

  @ForeignKey(() => PoLine)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poLineId: string;

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
