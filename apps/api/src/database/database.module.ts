import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        uri: config.getOrThrow<string>('DATABASE_URL'),
        // Schema is owned by hand-written migrations (ADR-0001) — models never
        // mutate the DB.
        autoLoadModels: true,
        synchronize: false,
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
