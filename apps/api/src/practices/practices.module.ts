import { Global, Module } from "@nestjs/common";
import { ApplicationsService } from "./applications.service.js";
import { DecisionProcessor } from "./decision.processor.js";
import { PracticesController } from "./practices.controller.js";
import { PracticesService } from "./practices.service.js";

@Global()
@Module({
  controllers: [PracticesController],
  providers: [PracticesService, ApplicationsService, DecisionProcessor],
  exports: [PracticesService, ApplicationsService, DecisionProcessor],
})
export class PracticesModule {}
