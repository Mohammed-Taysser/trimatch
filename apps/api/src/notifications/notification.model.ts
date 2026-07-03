import { NotificationEntityType, NotificationType } from '@trimatch/shared';
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

@Table({ tableName: 'notifications', underscored: true, timestamps: true })
export class Notification extends Model {
  @PrimaryKey
  @Default(literal('gen_random_uuid()'))
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  declare recipientId: string;

  @BelongsTo(() => User)
  declare recipient?: User;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  declare type: NotificationType;

  @AllowNull(true)
  @Column(DataType.STRING(32))
  declare entityType: NotificationEntityType | null;

  @AllowNull(true)
  @Column(DataType.UUID)
  declare entityId: string | null;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare message: string;

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare read: boolean;
}
