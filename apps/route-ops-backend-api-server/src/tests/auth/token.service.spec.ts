import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { mock } from "jest-mock-extended";
import { TokenServiceBase } from "../../auth/base/token.service.base";
import { INVALID_USERNAME_ERROR } from "../../auth/constants";
import { SIGN_TOKEN, VALID_CREDENTIALS, VALID_ID } from "./constants";

describe("Testing the TokenServiceBase", () => {
  let tokenServiceBase: TokenServiceBase;
  const jwtService = mock<JwtService>();
  const configService = mock<ConfigService>();
  beforeEach(() => {
    jwtService.signAsync.mockReset();
    jwtService.verifyAsync.mockReset();
    configService.get.mockImplementation((key: string) => {
      if (key === "JWT_EXPIRATION") {
        return "15m";
      }
      if (key === "JWT_REFRESH_EXPIRATION") {
        return "7d";
      }
      return undefined;
    });
    tokenServiceBase = new TokenServiceBase(jwtService, configService);
    jwtService.signAsync.mockClear();
  });
  describe("Token creation", () => {
    it("should create a valid access token for valid payload", async () => {
      jwtService.signAsync.mockReturnValue(Promise.resolve(SIGN_TOKEN));
      expect(
        await tokenServiceBase.createAccessToken({
          id: VALID_ID,
          username: VALID_CREDENTIALS.username,
        })
      ).toBe(SIGN_TOKEN);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: VALID_ID,
          username: VALID_CREDENTIALS.username,
          tokenType: "access",
        }),
        expect.objectContaining({ expiresIn: "15m" })
      );
    });
    it("should reject when username missing", () => {
      const result = tokenServiceBase.createAccessToken({
        id: VALID_ID,
        //@ts-ignore
        username: null,
      });
      return expect(result).rejects.toThrow(INVALID_USERNAME_ERROR);
    });
    it("should create a valid refresh token for valid payload", async () => {
      jwtService.signAsync.mockReturnValue(Promise.resolve(SIGN_TOKEN));
      expect(
        await tokenServiceBase.createRefreshToken({
          id: VALID_ID,
          username: VALID_CREDENTIALS.username,
        })
      ).toBe(SIGN_TOKEN);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: VALID_ID,
          username: VALID_CREDENTIALS.username,
          tokenType: "refresh",
        }),
        expect.objectContaining({ expiresIn: "7d" })
      );
    });
  });

  describe("Refresh token verification", () => {
    it("should verify refresh token with correct token type", async () => {
      const decoded = {
        sub: VALID_ID,
        username: VALID_CREDENTIALS.username,
        tokenType: "refresh" as const,
      };
      jwtService.verifyAsync.mockResolvedValue(decoded);

      await expect(
        tokenServiceBase.verifyRefreshToken(SIGN_TOKEN)
      ).resolves.toEqual(decoded);
    });

    it("should reject when token type is not refresh", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: VALID_ID,
        username: VALID_CREDENTIALS.username,
        tokenType: "access",
      });

      await expect(
        tokenServiceBase.verifyRefreshToken(SIGN_TOKEN)
      ).rejects.toThrow("Invalid or expired refresh token");
    });

    it("should reject when verifyAsync throws", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("jwt expired"));

      await expect(
        tokenServiceBase.verifyRefreshToken(SIGN_TOKEN)
      ).rejects.toThrow("Invalid or expired refresh token");
    });
  });
});
