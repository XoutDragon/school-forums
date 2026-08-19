import type { Attachment } from './schemas/chat.js';
import type { ChannelType, SpaceRole, SpaceType, Year } from './schemas/common.js';
import type { UserSettings } from './schemas/auth.js';

/** Wire shapes. These are what the API actually returns — deliberately narrower than the
 *  Prisma models so nothing leaks by accident (see AnonymousAuthor). */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  pronouns: string | null;
  year: Year | null;
  karma: number;
  major: { id: string; name: string } | null;
  isOnline?: boolean;
}

export interface MeUser extends PublicUser {
  email: string;
  bio: string | null;
  settings: UserSettings;
  onboardedAt: string | null;
  isAdmin: boolean;
}

/** The only author shape sent for a message in an anonymous channel. There is no
 *  `id` field on purpose — see the regression test in server/src/routes/messages.test.ts. */
export interface AnonymousAuthor {
  alias: string;
  animal: string;
  colorSeed: number;
}

export type MessageAuthor =
  | { kind: 'user'; user: PublicUser }
  | { kind: 'anonymous'; anon: AnonymousAuthor }
  | { kind: 'deleted' };

export interface MessageDto {
  id: string;
  channelId: string;
  content: string;
  author: MessageAuthor;
  attachments: Attachment[];
  replyToId: string | null;
  replyTo: { id: string; excerpt: string; authorName: string } | null;
  threadRootId: string | null;
  threadReplyCount: number;
  reactions: { emoji: string; count: number; mine: boolean }[];
  isPinned: boolean;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ChannelDto {
  id: string;
  spaceId: string;
  name: string;
  topic: string | null;
  type: ChannelType;
  position: number;
  isDefault: boolean;
  unreadCount?: number;
}

export interface SpaceDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  type: SpaceType;
  memberCount: number;
  myRole?: SpaceRole | null;
  channels?: ChannelDto[];
}

export interface CourseDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  level: number;
  major: { id: string; name: string } | null;
  avgDifficulty: number | null;
  avgWorkload: number | null;
  avgRating: number | null;
  reviewCount: number;
  takingThisTerm: number;
}

export interface ClubDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  logoUrl: string | null;
  meetingInfo: string | null;
  memberCount: number;
  isRecruiting: boolean;
  spaceId: string | null;
  myRole?: string | null;
}

export interface EventDto {
  id: string;
  title: string;
  description: string | null;
  hostType: string;
  hostId: string;
  hostName: string;
  startsAt: string;
  endsAt: string;
  location: string;
  locationDetail: string | null;
  capacity: number | null;
  coverUrl: string | null;
  tags: string[];
  goingCount: number;
  interestedCount: number;
  myRsvp: string | null;
  /** "3 people from your major are going" — precomputed server-side, §5.7. */
  socialProof: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface BuddyMatchDto {
  id: string;
  user: PublicUser;
  score: number;
  /** Required by §5.6 — never render a match without saying why it matched. */
  explanation: string;
  status: string;
}
