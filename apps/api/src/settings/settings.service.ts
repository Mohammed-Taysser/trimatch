import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuditService } from '../audit/audit.service';
import { Setting } from './setting.model';
import {
  ALL_SETTINGS,
  isSettingKey,
  SettingDefinition,
  settingDefinition,
} from './settings.registry';

export interface SettingView {
  key: string;
  value: unknown;
  default: unknown;
  description: string;
}

// Resolves and writes settings (869e01dmv). Defaults come from the code registry;
// the DB only stores overrides. Resolution: user override -> company override ->
// code default (the user layer applies only to user-settable keys).
@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting) private readonly model: typeof Setting,
    private readonly audit: AuditService,
  ) {}

  async getCompany<T = unknown>(key: string): Promise<T> {
    const def = settingDefinition(key);
    const row = await this.model.findOne({ where: { scope: 'company', scopeId: '', key } });
    return (row ? def.schema.parse(row.value) : def.default) as T;
  }

  async getForUser<T = unknown>(key: string, userId: string): Promise<T> {
    const def = settingDefinition(key);
    if (def.userSettable) {
      const row = await this.model.findOne({ where: { scope: 'user', scopeId: userId, key } });
      if (row) return def.schema.parse(row.value) as T;
    }
    return this.getCompany<T>(key);
  }

  async setCompany(key: string, value: unknown, actorId: string): Promise<SettingView> {
    const def = this.writableDefinition(key, 'company');
    const parsed = this.parseValue(def, value);
    await this.upsert('company', '', key, parsed);
    await this.audit.record({
      entityType: 'setting',
      entityId: actorId, // settings have no per-key id; the actor anchors the row
      actorId,
      action: 'setting.company_changed',
      comment: `${key} = ${JSON.stringify(parsed)}`,
    });
    return this.view(def, parsed);
  }

  async setForUser(key: string, value: unknown, userId: string): Promise<SettingView> {
    const def = this.writableDefinition(key, 'user');
    const parsed = this.parseValue(def, value);
    await this.upsert('user', userId, key, parsed);
    return this.view(def, parsed);
  }

  // Company-settable keys with their currently-effective company value.
  async companyView(): Promise<SettingView[]> {
    return Promise.all(
      ALL_SETTINGS.filter((def) => def.companySettable).map(async (def) =>
        this.view(def, await this.getCompany(def.key)),
      ),
    );
  }

  // User-settable keys with the value effective for this user (their override,
  // else the company value, else the default).
  async userView(userId: string): Promise<SettingView[]> {
    return Promise.all(
      ALL_SETTINGS.filter((def) => def.userSettable).map(async (def) =>
        this.view(def, await this.getForUser(def.key, userId)),
      ),
    );
  }

  private writableDefinition(key: string, scope: 'company' | 'user'): SettingDefinition {
    if (!isSettingKey(key)) {
      throw new NotFoundException({
        code: 'SETTING_NOT_FOUND',
        message: `Unknown setting '${key}'`,
      });
    }
    const def = settingDefinition(key);
    const allowed = scope === 'company' ? def.companySettable : def.userSettable;
    if (!allowed) {
      throw new BadRequestException({
        code: 'SETTING_NOT_WRITABLE',
        message: `'${key}' cannot be set at ${scope} scope`,
      });
    }
    return def;
  }

  private parseValue(def: SettingDefinition, value: unknown): unknown {
    const result = def.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_SETTING_VALUE',
        message: `Invalid value for '${def.key}'`,
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.') || '(value)',
          message: issue.message,
        })),
      });
    }
    return result.data;
  }

  private view(def: SettingDefinition, value: unknown): SettingView {
    return { key: def.key, value, default: def.default, description: def.description };
  }

  private async upsert(
    scope: 'company' | 'user',
    scopeId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const [row, created] = await this.model.findOrCreate({
      where: { scope, scopeId, key },
      defaults: { scope, scopeId, key, value },
    });
    if (!created) await row.update({ value });
  }
}
