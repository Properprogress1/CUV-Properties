import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthRequest, readSessionToken, SessionGuard } from "./auth.guard";
import {
  AuthService,
  productionSessionCookie,
  sessionCookie,
} from "./auth.service";

const credentialsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
const registrationSchema = credentialsSchema.extend({
  password: z.string().min(12).max(128),
});
const documentation = {
  type: "object" as const,
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", format: "password", maxLength: 128 },
  },
  required: ["email", "password"],
  additionalProperties: false,
};

function cookie(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production";
  const name = secure ? productionSessionCookie : sessionCookie;
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

interface CookieResponse {
  setHeader(name: string, value: string): void;
}

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiBody({ schema: documentation })
  register(@Body() input: unknown) {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Invalid registration details",
        fields: parsed.error.flatten().fieldErrors,
      });
    return this.auth.register(parsed.data.email, parsed.data.password);
  }

  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiBody({ schema: documentation })
  async login(
    @Body() input: unknown,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Invalid login details",
        fields: parsed.error.flatten().fieldErrors,
      });
    const { token, expiresAt, sessionId } = await this.auth.login(
      parsed.data.email,
      parsed.data.password,
    );
    response.setHeader(
      "Set-Cookie",
      cookie(token, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
    return { sessionId, expiresAt };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(readSessionToken(request));
    response.setHeader("Set-Cookie", cookie("", 0));
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest) {
    return request.principal;
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @ApiCookieAuth()
  @UseGuards(SessionGuard)
  async revoke(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    if (!(await this.auth.revokeOwnedSession(request.principal.id, id)))
      throw new NotFoundException("Session not found");
  }
}
