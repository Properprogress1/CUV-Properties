import {
  Controller,
  Get,
  Header,
  Module,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AuthRequest, SessionGuard, StaffGuard } from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";

@ApiTags("Customers")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("users")
class UsersController {
  @Get("me")
  @Header("Cache-Control", "no-store")
  me(@Req() request: AuthRequest) {
    const { id, email } = request.principal;
    return { id, email };
  }
}

@ApiTags("Staff")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin")
class StaffController {
  @Get("access")
  @Header("Cache-Control", "no-store")
  access(@Req() request: AuthRequest) {
    return request.principal;
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UsersController, StaffController],
})
export class UsersModule {}
