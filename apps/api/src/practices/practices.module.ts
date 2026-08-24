import { Global, Module } from "@nestjs/common";
import { ApplicationsService } from "./applications.service.js";
import { DecisionProcessor } from "./decision.processor.js";
import { DecisionScheduler } from "./decision.scheduler.js";
import { PracticesController } from "./practices.controller.js";
import { PracticesService } from "./practices.service.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Global()
@Module({
  controllers: [PracticesController, TeamsController],
  providers: [PracticesService, ApplicationsService, DecisionProcessor, DecisionScheduler, TeamsService],
  exports: [PracticesService, ApplicationsService, DecisionProcessor, TeamsService],
})
export class PracticesModule {}
