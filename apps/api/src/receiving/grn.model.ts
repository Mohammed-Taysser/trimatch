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
import { PoLine, PurchaseOrder } from '../purchasing/purchase-order.model';

@Table({ tableName: 'grns', underscored: true, timestamps: true })
export class Grn extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(20))
  declare grnNumber: string;

  @ForeignKey(() => PurchaseOrder)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poId: string;

  @BelongsTo(() => PurchaseOrder)
  declare po?: PurchaseOrder;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare receivedBy: string;

  @BelongsTo(() => User)
  declare receiver?: User;

  @Column(DataType.TEXT)
  declare note: string | null;

  @HasMany(() => GrnLine)
  declare lines?: GrnLine[];
}

@Table({ tableName: 'grn_lines', underscored: true, timestamps: true })
export class GrnLine extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Grn)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare grnId: string;

  @ForeignKey(() => PoLine)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare poLineId: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare quantity: number;
}
