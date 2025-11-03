import { PrismaService } from "../prisma/prisma.service";

export type AuthUserLike = { id: string; roles: string[] } | undefined;

export function isAdminUser(user: AuthUserLike): boolean {
  return Array.isArray(user?.roles) && user!.roles.includes("admin");
}

export async function applyEntityScope<TWhere extends Record<string, any> | undefined>(
  prisma: PrismaService,
  authUser: AuthUserLike,
  where: TWhere
): Promise<TWhere> {
  if (isAdminUser(authUser) || !authUser?.id) {
    return where;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { cityHallId: true },
  });
  if (!dbUser?.cityHallId) {
    return where;
  }
  return ({
    ...(where || {}),
    cityHallId: (where as any)?.cityHallId ?? dbUser.cityHallId,
  } as unknown) as TWhere;
}

export async function applyHazardEntityScope<TWhere extends Record<string, any> | undefined>(
  prisma: PrismaService,
  authUser: AuthUserLike,
  where: TWhere
): Promise<TWhere> {
  if (isAdminUser(authUser) || !authUser?.id) {
    return where;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { cityHallId: true },
  });
  if (!dbUser?.cityHallId) {
    return where;
  }
  const existingProject = (where as any)?.project || {};
  return ({
    ...(where || {}),
    project: { ...existingProject, cityHallId: dbUser.cityHallId },
  } as unknown) as TWhere;
}


