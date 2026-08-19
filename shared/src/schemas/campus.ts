import { z } from 'zod';
import {
  ClubCategoryEnum,
  CourseStatusEnum,
  HostTypeEnum,
  ListingCategoryEnum,
  LookingForEnum,
  MeetingTypeEnum,
  ReportTargetEnum,
  ResourceTypeEnum,
  RsvpStatusEnum,
  termSchema,
} from './common.js';

export const courseReviewSchema = z.object({
  term: termSchema,
  profName: z.string().min(1).max(60),
  difficulty: z.number().int().min(1).max(5),
  workload: z.number().int().min(1).max(5),
  rating: z.number().int().min(1).max(5),
  tips: z
    .string()
    .min(20, 'Give future students something useful — 20 characters minimum')
    .max(2000),
  wouldRecommend: z.boolean(),
  showName: z.boolean().default(false),
});
export type CourseReviewInput = z.infer<typeof courseReviewSchema>;

export const enrolCourseSchema = z.object({
  courseId: z.string().min(1),
  term: termSchema,
  status: CourseStatusEnum.default('TAKING'),
});
export type EnrolCourseInput = z.infer<typeof enrolCourseSchema>;

export const createResourceSchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().max(500).optional(),
    type: ResourceTypeEnum,
    courseId: z.string().nullish(),
    spaceId: z.string().nullish(),
    fileUrl: z.string().nullish(),
    linkUrl: z.string().url('Enter a valid URL').nullish(),
    term: termSchema.optional(),
  })
  .refine((v) => Boolean(v.fileUrl ?? v.linkUrl), {
    message: 'Attach a file or paste a link',
    path: ['fileUrl'],
  })
  .refine((v) => Boolean(v.courseId ?? v.spaceId), {
    message: 'A resource has to live on a course or a space',
    path: ['courseId'],
  });
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const qaPostSchema = z.object({
  title: z.string().min(8).max(160),
  body: z.string().min(10).max(4000),
  courseId: z.string().nullish(),
  spaceId: z.string().nullish(),
});
export type QaPostInput = z.infer<typeof qaPostSchema>;

export const createClubSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().min(10).max(600),
  category: ClubCategoryEnum,
  meetingInfo: z.string().max(200).optional(),
  isRecruiting: z.boolean().default(true),
});
export type CreateClubInput = z.infer<typeof createClubSchema>;

/** 7 days x 5 blocks. Stored as a flat 35-slot boolean array so overlap is a bitwise-ish
 *  intersection rather than a nested loop everywhere it's needed. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_BLOCKS = ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night'] as const;
export const AVAILABILITY_SLOTS = WEEKDAYS.length * DAY_BLOCKS.length;

export const availabilitySchema = z.array(z.boolean()).length(AVAILABILITY_SLOTS);
export type Availability = z.infer<typeof availabilitySchema>;

export const slotIndex = (day: number, block: number) => day * DAY_BLOCKS.length + block;

export const buddyProfileSchema = z.object({
  isActive: z.boolean().default(true),
  lookingFor: z.array(LookingForEnum).min(1, 'Pick at least one'),
  availability: availabilitySchema,
  note: z.string().max(240).optional(),
});
export type BuddyProfileInput = z.infer<typeof buddyProfileSchema>;

export const createStudyGroupSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(500).optional(),
  courseId: z.string().nullish(),
  maxSize: z.number().int().min(2).max(20).default(6),
  meetingType: MeetingTypeEnum.default('IN_PERSON'),
  schedule: availabilitySchema.optional(),
  locationHint: z.string().max(120).optional(),
});
export type CreateStudyGroupInput = z.infer<typeof createStudyGroupSchema>;

export const createEventSchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().max(2000).optional(),
    hostType: HostTypeEnum,
    hostId: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    location: z.string().min(1).max(120),
    locationDetail: z.string().max(200).optional(),
    capacity: z.number().int().positive().nullish(),
    tags: z.array(z.string().max(24)).max(6).default([]),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'The event has to end after it starts',
    path: ['endsAt'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const rsvpSchema = z.object({ status: RsvpStatusEnum });

export const createListingSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  priceCents: z.number().int().min(0).max(500_000),
  category: ListingCategoryEnum,
  courseId: z.string().nullish(),
  photos: z.array(z.string()).max(6).default([]),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const createReportSchema = z.object({
  targetType: ReportTargetEnum,
  targetId: z.string().min(1),
  reason: z.string().min(10, 'Tell the mods what happened').max(1000),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  scope: z
    .enum(['all', 'courses', 'clubs', 'people', 'spaces', 'resources', 'events'])
    .default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
