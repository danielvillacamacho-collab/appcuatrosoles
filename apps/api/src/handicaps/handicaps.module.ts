import { Global, Module } from "@nestjs/common";
import { ClubHandicapsController, PersonHandicapsController } from "./handicaps.controller.js";
import { HandicapsService } from "./handicaps.service.js";

@Global()
@Module({
  controllers: [PersonHandicapsController, ClubHandicapsController],
  providers: [HandicapsService],
  exports: [HandicapsService],
})
export class HandicapsModule {}
