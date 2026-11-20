import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  AuthService,
  Principal,
  productionSessionCookie,
  sessionCookie,
  staffAccess,
} from "./auth.service";

export interface AuthRequest {
  headers: { cookie?: string };
  principal: Principal;
}

export function readSessionToken(request: AuthRequest) {
  const name =
    process.env.NODE_ENV === "production"
      ? productionSessionCookie
      : sessionCookie;
  return request.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.principal = await this.auth.authenticate(readSessionToken(request));
    return true;
  }
}

@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { principal } = context.switchToHttp().getRequest<AuthRequest>();
    if (!principal.permissions.includes(staffAccess))
      throw new ForbiddenException();
    return true;
  }
}
