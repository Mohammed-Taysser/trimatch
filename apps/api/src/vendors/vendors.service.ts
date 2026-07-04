import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Vendor as VendorView, VendorCreate, VendorSchema, VendorUpdate } from '@trimatch/shared';
import { PaginationQuery } from '@trimatch/shared';
import { UniqueConstraintError } from 'sequelize';
import { PagedResult, pageMeta, pageOffset } from '../common/paged';
import { Vendor } from './vendor.model';

@Injectable()
export class VendorsService {
  constructor(@InjectModel(Vendor) private readonly vendors: typeof Vendor) {}

  async create(input: VendorCreate): Promise<VendorView> {
    try {
      const row = await this.vendors.create({ ...input });
      return this.toView(row);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException({
          code: 'DUPLICATE_VENDOR',
          message: 'A vendor with this name already exists',
        });
      }
      throw error;
    }
  }

  async findAll(activeOnly: boolean, query: PaginationQuery): Promise<PagedResult<VendorView>> {
    const { rows, count } = await this.vendors.findAndCountAll({
      where: activeOnly ? { active: true } : undefined,
      order: [['name', 'ASC']],
      ...pageOffset(query),
    });
    return new PagedResult(
      rows.map((row) => this.toView(row)),
      pageMeta(query, count),
    );
  }

  async update(id: string, input: VendorUpdate): Promise<VendorView> {
    // 869e01dmy: a missing vendor here IS an error — let the finder reject with a
    // specific NotFoundException instead of a manual null-check.
    const row = await this.vendors.findByPk(id, {
      rejectOnEmpty: new NotFoundException({ code: 'NOT_FOUND', message: 'Vendor not found' }),
    });
    try {
      await row.update({ ...input });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException({
          code: 'DUPLICATE_VENDOR',
          message: 'A vendor with this name already exists',
        });
      }
      throw error;
    }
    return this.toView(row);
  }

  // FR-202: inactive vendors cannot receive new POs — PO creation calls this.
  async assertActive(id: string): Promise<Vendor> {
    const row = await this.vendors.findByPk(id, {
      rejectOnEmpty: new NotFoundException({ code: 'NOT_FOUND', message: 'Vendor not found' }),
    });
    if (!row.active) {
      throw new ConflictException({
        code: 'VENDOR_INACTIVE',
        message: 'This vendor is inactive and cannot receive new purchase orders',
      });
    }
    return row;
  }

  private toView(row: Vendor): VendorView {
    return VendorSchema.parse({
      id: row.id,
      name: row.name,
      contactEmail: row.contactEmail,
      currency: row.currency,
      paymentTerms: row.paymentTerms,
      active: row.active,
      createdAt: (row.createdAt as Date).toISOString(),
      updatedAt: (row.updatedAt as Date).toISOString(),
    });
  }
}
