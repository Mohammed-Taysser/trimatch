import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Vendor as VendorView, VendorCreate, VendorSchema, VendorUpdate } from '@trimatch/shared';
import { UniqueConstraintError } from 'sequelize';
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

  async findAll(activeOnly: boolean): Promise<VendorView[]> {
    const rows = await this.vendors.findAll({
      where: activeOnly ? { active: true } : undefined,
      order: [['name', 'ASC']],
    });
    return rows.map((row) => this.toView(row));
  }

  async update(id: string, input: VendorUpdate): Promise<VendorView> {
    const row = await this.vendors.findByPk(id);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Vendor not found' });
    }
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
    const row = await this.vendors.findByPk(id);
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Vendor not found' });
    }
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
