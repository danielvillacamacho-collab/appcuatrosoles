import { Module } from "@nestjs/common";
import { AuthApiModule } from "../auth/auth.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { InvitationController, UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [AuthApiModule, SettingsModule],
  controllers: [UsersController, InvitationController],
  providers: [UsersService],
})
export class UsersModule {}
