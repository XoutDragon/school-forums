import { z } from 'zod';

/** Enums mirrored from prisma/schema.prisma. Keep the two in sync by hand — Prisma
 *  enum codegen isn't importable from the client bundle. */

export const YearEnum = z.enum(['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'GRAD', 'ALUM']);
export const InterestCategoryEnum = z.enum([
  'ACADEMIC',
  'HOBBY',
  'SPORT',
  'CREATIVE',
  'SOCIAL',
  'CAREER',
]);
export const SpaceTypeEnum = z.enum([
  'MAJOR',
  'CLUB',
  'COURSE',
  'RESIDENCE',
  'GENERAL',
  'STUDY_GROUP',
]);
export const VisibilityEnum = z.enum(['PUBLIC', 'PRIVATE']);
export const SpaceRoleEnum = z.enum(['OWNER', 'ADMIN', 'MOD', 'MEMBER']);
export const ChannelTypeEnum = z.enum([
  'TEXT',
  'ANNOUNCEMENT',
  'RESOURCES',
  'QA',
  'ANONYMOUS',
  'VOICE_STUB',
]);
export const ClubCategoryEnum = z.enum([
  'ACADEMIC',
  'CULTURAL',
  'SPORTS',
  'ARTS',
  'VOLUNTEER',
  'PROFESSIONAL',
  'GAMING',
  'RELIGIOUS',
  'OTHER',
]);
export const ClubRoleEnum = z.enum(['PRESIDENT', 'EXEC', 'MEMBER', 'FOLLOWER']);
export const CourseStatusEnum = z.enum(['TAKING', 'COMPLETED', 'PLANNED']);
export const ResourceTypeEnum = z.enum([
  'NOTES',
  'PRACTICE_EXAM',
  'CHEAT_SHEET',
  'LINK',
  'GUIDE',
  'OTHER',
]);
export const MeetingTypeEnum = z.enum(['IN_PERSON', 'ONLINE', 'HYBRID']);
export const StudyGroupStatusEnum = z.enum(['OPEN', 'FULL', 'ARCHIVED']);
export const LookingForEnum = z.enum([
  'STUDY_PARTNER',
  'FRIENDS',
  'CLUB_BUDDY',
  'GYM_PARTNER',
  'LANGUAGE_EXCHANGE',
]);
export const RsvpStatusEnum = z.enum(['GOING', 'INTERESTED', 'DECLINED']);
export const HostTypeEnum = z.enum(['CLUB', 'SPACE', 'USER', 'CAMPUS']);
export const ListingCategoryEnum = z.enum([
  'TEXTBOOK',
  'ELECTRONICS',
  'FURNITURE',
  'TICKETS',
  'OTHER',
]);
export const ListingStatusEnum = z.enum(['ACTIVE', 'PENDING', 'SOLD']);
export const ReportTargetEnum = z.enum([
  'MESSAGE',
  'USER',
  'RESOURCE',
  'LISTING',
  'REVIEW',
  'EVENT',
]);
export const DmPrivacyEnum = z.enum(['EVERYONE', 'SHARED_SPACE_ONLY', 'NOBODY']);

export type Year = z.infer<typeof YearEnum>;
export type SpaceType = z.infer<typeof SpaceTypeEnum>;
export type SpaceRole = z.infer<typeof SpaceRoleEnum>;
export type ChannelType = z.infer<typeof ChannelTypeEnum>;
export type ClubCategory = z.infer<typeof ClubCategoryEnum>;
export type ResourceType = z.infer<typeof ResourceTypeEnum>;
export type RsvpStatus = z.infer<typeof RsvpStatusEnum>;
export type DmPrivacy = z.infer<typeof DmPrivacyEnum>;

/** `2026FA` — four digit year plus FA/WI/SP/SU. Used as a stable sort key too. */
export const termSchema = z.string().regex(/^\d{4}(FA|WI|SP|SU)$/, 'Term must look like 2026FA');

export const cuidSchema = z.string().min(1);

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
