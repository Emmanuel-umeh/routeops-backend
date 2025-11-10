import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { Credentials } from "./Credentials";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { REFRESH_TOKEN, VALID_ID } from "../tests/auth/constants";
import { UserService } from "../user/user.service";

const VALID_CREDENTIALS: Credentials = {
  username: "Valid User",
  password: "Valid User Password",
};
const INVALID_CREDENTIALS: Credentials = {
  username: "Invalid User",
  password: "Invalid User Password",
};
const USER: any = {
  ...VALID_CREDENTIALS,
  createdAt: new Date(),
  firstName: "ofek",
  id: VALID_ID,
  lastName: "gabay",
  email: "user@example.com",
  isActive: true,
  role: "admin",
  roles: ["admin"],
  cityHall: null,
  updatedAt: new Date(),
};

const SIGN_TOKEN = "SIGN_TOKEN";

const authEntityService = {
  user(args: { where: { username?: string; id?: string } }): any | null {
    if (args.where.username === VALID_CREDENTIALS.username) {
      return USER;
    }
    if (args.where.id === USER.id) {
      return USER;
    }
    return null;
  },
};

const passwordService = {
  compare(password: string, encrypted: string) {
    return true;
  },
};

const tokenService = {
  createAccessToken: jest.fn().mockResolvedValue(SIGN_TOKEN),
  createRefreshToken: jest.fn().mockResolvedValue(REFRESH_TOKEN),
  verifyRefreshToken: jest.fn(),
};

describe("AuthService", () => {
  //ARRANGE
  let service: AuthService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: UserService,
          useValue: authEntityService,
        },
        {
          provide: PasswordService,
          useValue: passwordService,
        },
        {
          provide: TokenService,
          useValue: tokenService,
        },
        AuthService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  beforeEach(() => {
    tokenService.createAccessToken.mockClear();
    tokenService.createRefreshToken.mockClear();
    tokenService.verifyRefreshToken.mockClear();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("Testing the authService.validateUser()", () => {
    it("should validate a valid user", async () => {
      await expect(
        service.validateUser(
          VALID_CREDENTIALS.username,
          VALID_CREDENTIALS.password
        )
      ).resolves.toEqual({
        username: USER.username,
        roles: USER.roles,
        id: USER.id,
      });
    });

    it("should not validate a invalid user", async () => {
      await expect(
        service.validateUser(
          INVALID_CREDENTIALS.username,
          INVALID_CREDENTIALS.password
        )
      ).resolves.toBe(null);
    });
  });

  describe("Testing the authService.login()", () => {
    it("should return userInfo object for correct username and password", async () => {
      const loginResult = await service.login(VALID_CREDENTIALS);
      expect(loginResult).toEqual({
        username: USER.username,
        roles: USER.roles,
        accessToken: SIGN_TOKEN,
        refreshToken: REFRESH_TOKEN,
        id: USER.id,
      });
    });
  });

  describe("Testing the authService.refreshToken()", () => {
    it("should return userInfo with refreshed tokens for valid refresh token", async () => {
      tokenService.verifyRefreshToken.mockResolvedValue({
        sub: USER.id,
        username: USER.username,
        tokenType: "refresh",
      });

      const result = await service.refreshToken(REFRESH_TOKEN);

      expect(tokenService.verifyRefreshToken).toHaveBeenCalledWith(REFRESH_TOKEN);
      expect(tokenService.createAccessToken).toHaveBeenCalledWith({
        id: USER.id,
        username: USER.username,
      });
      expect(tokenService.createRefreshToken).toHaveBeenCalledWith({
        id: USER.id,
        username: USER.username,
      });
      expect(result).toEqual({
        username: USER.username,
        roles: USER.roles,
        accessToken: SIGN_TOKEN,
        refreshToken: REFRESH_TOKEN,
        id: USER.id,
      });
    });

    it("should throw when refresh token verification fails", async () => {
      tokenService.verifyRefreshToken.mockRejectedValue(
        new UnauthorizedException()
      );

      await expect(service.refreshToken("invalid")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });
  });

  describe("Testing the authService.getCurrentUser()", () => {
    it("should return current user details when user exists", async () => {
      const result = await service.getCurrentUser(USER.id);
      expect(result).toMatchObject({
        id: USER.id,
        username: USER.username,
        email: USER.email,
        firstName: USER.firstName,
        lastName: USER.lastName,
        roles: USER.roles,
        role: USER.role,
        isActive: USER.isActive,
        cityHall: USER.cityHall,
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("should throw when user not found", async () => {
      await expect(service.getCurrentUser("missing")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    });

    it("should throw when user is disabled", async () => {
      const original = authEntityService.user;
      authEntityService.user = (args: { where: { id?: string } }) => {
        if (args.where.id === USER.id) {
          return {
            ...USER,
            isActive: false,
          };
        }
        return original(args);
      };

      await expect(service.getCurrentUser(USER.id)).rejects.toBeInstanceOf(
        UnauthorizedException
      );

      authEntityService.user = original;
    });
  });
});
