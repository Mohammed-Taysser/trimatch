import { literal } from 'sequelize';
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { User } from '../identity/user.model';

@Table({ tableName: 'delegations', underscored: true, timestamps: true })
export class Delegation extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare delegatorId: string;

  @BelongsTo(() => User, 'delegatorId')
  declare delegator?: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare delegateId: string;

  @BelongsTo(() => User, 'delegateId')
  declare delegate?: User;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare startsOn: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare endsOn: string;
}
