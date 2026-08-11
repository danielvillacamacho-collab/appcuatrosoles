import { Global, Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { BookingsService } from "./bookings.service.js";
import { FieldBookingsController, FieldsController } from "./fields.controller.js";
import { FieldsService } from "./fields.service.js";

/**
 * Global por `BookingsService`: es el único lugar que escribe `field_booking` (R-040-01), y lo van
 * a consumir prácticas, copas y clases. Que sea global evita que cada módulo futuro lo importe — y,
 * sobre todo, que alguien inserte por su cuenta para no tener que importarlo.
 *
 * Es el mismo criterio que `WaiversService` en `specs/010` T-075.
 */
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [FieldsController, FieldBookingsController],
  providers: [BookingsService, FieldsService],
  exports: [BookingsService],
})
export class FieldsModule {}
