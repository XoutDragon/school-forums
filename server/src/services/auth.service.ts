import bcrypt from 'bcryptjs';
import type { LoginInput, MeUser, RegisterInput, UpdateProfileInput } from '@campusconnect/shared';
import { userSettingsSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { parseSettings, publicUserSelect, toPublicUser } from './serialize.js';

const meSelect = {
  ...publicUserSelect,
  email: true,
  bio: true,
  settings: true,
  onboardedAt: true,
  isAdmin: true,
} as const;

export function toMe(row: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  pronouns: string | null;
  year: string | null;
  karma: number;
  deletedAt: Date | null;
  major: { id: string; name: string } | null;
  email: string;
  bio: string | null;
  settings: string;
  onboardedAt: Date | null;
  isAdmin: boolean;
}): MeUser {
  return {
    ...toPublicUser(row, true),
    email: row.email,
    bio: row.bio,
    settings: parseSettings(row.settings),
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    isAdmin: row.isAdmin,
  };
}

export async function register(input: RegisterInput): Promise<MeUser> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email.toLowerCase() }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (existing?.email === input.email.toLowerCase()) {
    throw ApiError.conflict('That email is already registered. Sign in instead.');
  }
  if (existing) throw ApiError.conflict('That username is taken. Pick another.');

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      username: input.username,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, 10),
      settings: JSON.stringify(userSettingsSchema.parse({})),
      // No mail service runs locally (§2), so verification is granted on creation. The
      // column stays so a real flow can replace this one line.
      verifiedAt: new Date(),
    },
    select: meSelect,
  });
  return toMe(user);
}

export async function login(input: LoginInput): Promise<MeUser> {
  const user = await prisma.user.findFirst({
    where: { email: input.email.toLowerCase(), deletedAt: null },
    select: { ...meSelect, passwordHash: true },
  });
  // Same message either way — don't leak which emails exist.
  const invalid = ApiError.badRequest("That email and password don't match");
  if (!user) {
    await bcrypt.compare(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }
  if (!(await bcrypt.compare(input.password, user.passwordHash))) throw invalid;

  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return toMe(user);
}

export async function getMe(userId: string): Promise<MeUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: meSelect,
  });
  if (!user) throw ApiError.unauthorized();
  return toMe(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<MeUser> {
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { settings: true },
  });

  const settings = input.settings
    ? JSON.stringify({ ...parseSettings(current.settings), ...input.settings })
    : undefined;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      bio: input.bio,
      pronouns: input.pronouns,
      year: input.year,
      majorId: input.majorId,
      minorId: input.minorId,
      avatarUrl: input.avatarUrl,
      ...(settings ? { settings } : {}),
    },
    select: meSelect,
  });
  return toMe(user);
}
