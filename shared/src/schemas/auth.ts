import { z } from 'zod';
import { DmPrivacyEnum, YearEnum } from './common.js';

export const usernameSchema = z
  .string()
  .min(3, 'At least 3 characters')
  .max(24, 'At most 24 characters')
  .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only');

export const passwordSchema = z.string().min(8, 'At least 8 characters').max(128);

export const registerSchema = z.object({
  email: z.string().email('Enter a valid email'),
  username: usernameSchema,
  displayName: z.string().min(1).max(40),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']).default('dark'),
  dmPrivacy: DmPrivacyEnum.default('EVERYONE'),
  discoverable: z.boolean().default(true),
  showCourses: z.boolean().default(true),
  showRealName: z.boolean().default(true),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  bio: z.string().max(280).nullish(),
  pronouns: z.string().max(24).nullish(),
  year: YearEnum.optional(),
  majorId: z.string().nullish(),
  minorId: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  settings: userSettingsSchema.partial().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const onboardingSchema = z.object({
  majorId: z.string().min(1, 'Pick a major'),
  year: YearEnum,
  interestIds: z.array(z.string()).min(3, 'Pick at least 3 interests'),
  courses: z
    .array(z.object({ courseId: z.string(), term: z.string() }))
    .max(8)
    .default([]),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
