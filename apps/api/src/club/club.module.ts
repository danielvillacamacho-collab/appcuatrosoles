import { Module } from "@nestjs/common";
import { ClubController } from "./club.controller.js";
import { ClubService } from "./club.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";

@Module({
  controllers: [ClubController, OrganizationController],
  providers: [ClubService, OrganizationService],
})
export class ClubModule {}
