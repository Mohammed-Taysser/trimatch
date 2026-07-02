import { literal } from 'sequelize';
import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({ tableName: 'vendors', underscored: true, timestamps: true })
export class Vendor extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(200))
  declare name: string;

  @AllowNull(false)
  @Column(DataType.STRING(200))
  declare contactEmail: string;

  @AllowNull(false)
  @Column(DataType.CHAR(3))
  declare currency: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  declare paymentTerms: string;

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare active: boolean;
}
