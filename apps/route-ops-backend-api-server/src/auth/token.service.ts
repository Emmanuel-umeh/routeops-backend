import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ITokenService } from "./ITokenService";
import { TokenServiceBase } from "./base/token.service.base";

@Injectable()
export class TokenService
  extends TokenServiceBase
  implements ITokenService
{
  constructor(jwtService: JwtService, configService: ConfigService) {
    super(jwtService, configService);
  }
}
