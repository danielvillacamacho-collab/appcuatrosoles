import { Module } from "@nestjs/common";
import { PlatformClubsController } from "./platform-clubs.controller.js";
import { PlatformClubsService } from "./platform-clubs.service.js";

@Module({
  controllers: [PlatformClubsController],
  providers: [PlatformClubsService],
})
export class PlatformModule {}
