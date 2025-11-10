/* eslint-disable import/no-unresolved */
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { INVALID_USERNAME_ERROR, INVALID_USER_ID_ERROR } from "../constants";
import { JWT_EXPIRATION, JWT_REFRESH_EXPIRATION } from "../../constants";
import { ITokenClaims, ITokenService, ITokenPayload } from "../ITokenService";
/**
 * TokenServiceBase is a jwt bearer implementation of ITokenService
 */
@Injectable()
export class TokenServiceBase implements ITokenService {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    protected readonly jwtService: JwtService,
    protected readonly configService: ConfigService
  ) {
    this.accessExpiresIn =
      this.configService.get<string>(JWT_EXPIRATION) ?? "15m";
    this.refreshExpiresIn =
      this.configService.get<string>(JWT_REFRESH_EXPIRATION) ?? "7d";
  }

  private signPayload(
    payload: ITokenPayload,
    tokenType: ITokenClaims["tokenType"],
    expiresIn: string
  ): Promise<string> {
    if (!payload.username) {
      return Promise.reject(new Error(INVALID_USERNAME_ERROR));
    }
    if (!payload.id) {
      return Promise.reject(new Error(INVALID_USER_ID_ERROR));
    }
    return this.jwtService.signAsync(
      {
        sub: payload.id,
        username: payload.username,
        tokenType,
      },
      { expiresIn }
    );
  }

  createAccessToken(payload: ITokenPayload): Promise<string> {
    return this.signPayload(payload, "access", this.accessExpiresIn);
  }

  createRefreshToken(payload: ITokenPayload): Promise<string> {
    return this.signPayload(payload, "refresh", this.refreshExpiresIn);
  }

  /**
   *
   * @object { id: String, username: String}
   * @returns a jwt token sign with the username and user id
   */
  createToken(payload: ITokenPayload): Promise<string> {
    return this.createAccessToken(payload);
  }

  async verifyRefreshToken(token: string): Promise<ITokenClaims> {
    try {
      const decoded = await this.jwtService.verifyAsync<ITokenClaims>(token);
      if (decoded.tokenType !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }
      return decoded;
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }
}
