import { z } from 'zod';
import { ChannelTypeEnum, SpaceTypeEnum, VisibilityEnum } from './common.js';

export const createSpaceSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(400).optional(),
  type: SpaceTypeEnum.default('GENERAL'),
  visibility: VisibilityEnum.default('PUBLIC'),
});
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  topic: z.string().max(200).optional(),
  type: ChannelTypeEnum.default('TEXT'),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
