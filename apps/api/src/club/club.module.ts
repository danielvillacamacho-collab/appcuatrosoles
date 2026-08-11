import { Module } from "@nestjs/common";
import { ClubController } from "./club.controller.js";
import { ClubService } from "./club.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";
import { SeasonController } from "./season.controller.js";
import { SeasonService } from "./season.service.js";

@Module({
  controllers: [ClubController, OrganizationController, SeasonController],
  providers: [ClubService, OrganizationService, SeasonService],
})
export class ClubModule {}
