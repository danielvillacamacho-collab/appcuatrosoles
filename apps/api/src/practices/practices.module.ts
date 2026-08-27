import { Global, Module } from "@nestjs/common";
import { ApplicationsService } from "./applications.service.js";
import { DecisionProcessor } from "./decision.processor.js";
import { DecisionScheduler } from "./decision.scheduler.js";
import { GridController } from "./grid.controller.js";
import { GridService } from "./grid.service.js";
import { PracticesController } from "./practices.controller.js";
import { PracticesService } from "./practices.service.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Global()
@Module({
  controllers: [PracticesController, TeamsController, GridController],
  providers: [PracticesService, ApplicationsService, DecisionProcessor, DecisionScheduler, TeamsService, GridService],
  exports: [PracticesService, ApplicationsService, DecisionProcessor, TeamsService, GridService],
})
export class PracticesModule {}
