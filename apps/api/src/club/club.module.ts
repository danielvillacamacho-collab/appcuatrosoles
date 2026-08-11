import { Global, Module } from "@nestjs/common";
import { ClubController } from "./club.controller.js";
import { ClubService } from "./club.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";
import { MembershipCategoryController } from "./membership-category.controller.js";
import { MembershipCategoryService } from "./membership-category.service.js";
import { SeasonController } from "./season.controller.js";
import { SeasonService } from "./season.service.js";
import { UrlDelClub } from "./url-del-club.js";

/**
 * Global por `UrlDelClub`: la usan identidad, autenticación y perfil para armar los enlaces de sus
 * correos. Que sea global evita que cada módulo la importe —y, sobre todo, que alguien la vuelva a
 * escribir por su cuenta, que es como los tres controladores terminaron con la misma copia y el
 * mismo error.
 */
@Global()
@Module({
  controllers: [ClubController, OrganizationController, SeasonController, MembershipCategoryController],
  providers: [ClubService, OrganizationService, SeasonService, MembershipCategoryService, UrlDelClub],
  exports: [UrlDelClub],
})
export class ClubModule {}
