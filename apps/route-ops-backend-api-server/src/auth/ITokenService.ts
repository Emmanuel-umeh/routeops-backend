export interface ITokenPayload {
  id: string;
  username: string;
}

export interface ITokenClaims {
  sub: string;
  username: string;
  tokenType: "access" | "refresh";
  iat?: number;
  exp?: number;
}

export interface ITokenService {
  /**
   * @deprecated Use createAccessToken instead.
   */
  createToken: (payload: ITokenPayload) => Promise<string>;
  createAccessToken: (payload: ITokenPayload) => Promise<string>;
  createRefreshToken: (payload: ITokenPayload) => Promise<string>;
  verifyRefreshToken: (token: string) => Promise<ITokenClaims>;
}
