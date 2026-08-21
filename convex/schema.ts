import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * CampusConnect on Convex — ported from server/prisma/schema.prisma.
 *
 * Three things change shape in the move from Prisma/SQLite:
 *
 *  1. Enums become literal unions. SQLite had no enum type, so the Prisma schema
 *     stored them as String and leaned on Zod at the edge. Convex validates on
 *     write, so the constraint moves back into the database layer.
 *
 *  2. JSON-string columns become real arrays and objects. `attachments`, `tags`,
 *     the 35-slot availability grid and `settings` were all JSON.parse'd in a
 *     service; Convex stores them natively.
 *
 *  3. Unique constraints become indexes plus a check in the mutation. Convex has
 *     no UNIQUE, so anywhere Prisma had @@unique the write path must look the row
 *     up first. Those spots are marked "UNIQUE:" below.
 *
 * `_id` and `_creationTime` are supplied by Convex, so `id` and `createdAt` are
 * dropped throughout. `updatedAt` is kept only where the app actually reads it.
 */

// ── Enums ──────────────────────────────────────────────────────────────────

const year = v.union(
  v.literal('FRESHMAN'),
  v.literal('SOPHOMORE'),
  v.literal('JUNIOR'),
  v.literal('SENIOR'),
  v.literal('GRAD'),
  v.literal('ALUM'),
);

const interestCategory = v.union(
  v.literal('ACADEMIC'),
  v.literal('HOBBY'),
  v.literal('SPORT'),
  v.literal('CREATIVE'),
  v.literal('SOCIAL'),
  v.literal('CAREER'),
);

const spaceType = v.union(
  v.literal('MAJOR'),
  v.literal('CLUB'),
  v.literal('COURSE'),
  v.literal('RESIDENCE'),
  v.literal('GENERAL'),
  v.literal('STUDY_GROUP'),
  // Student-created. A club Space is chartered by the institution; an interest
  // Space is three people who like bouldering, and the app should not pretend
  // those are the same thing.
  v.literal('INTEREST'),
);

const visibility = v.union(v.literal('PUBLIC'), v.literal('PRIVATE'));

const spaceRole = v.union(
  v.literal('OWNER'),
  v.literal('ADMIN'),
  v.literal('MOD'),
  v.literal('MEMBER'),
);

const channelType = v.union(
  v.literal('TEXT'),
  v.literal('ANNOUNCEMENT'),
  v.literal('RESOURCES'),
  v.literal('QA'),
  v.literal('ANONYMOUS'),
  v.literal('VOICE_STUB'),
);

const clubCategory = v.union(
  v.literal('ACADEMIC'),
  v.literal('CULTURAL'),
  v.literal('SPORTS'),
  v.literal('ARTS'),
  v.literal('VOLUNTEER'),
  v.literal('PROFESSIONAL'),
  v.literal('GAMING'),
  v.literal('RELIGIOUS'),
  v.literal('OTHER'),
);

const clubRole = v.union(
  v.literal('PRESIDENT'),
  v.literal('EXEC'),
  v.literal('MEMBER'),
  v.literal('FOLLOWER'),
);

const courseStatus = v.union(v.literal('TAKING'), v.literal('COMPLETED'), v.literal('PLANNED'));

const resourceType = v.union(
  v.literal('NOTES'),
  v.literal('PRACTICE_EXAM'),
  v.literal('CHEAT_SHEET'),
  v.literal('LINK'),
  v.literal('GUIDE'),
  v.literal('OTHER'),
);

const meetingType = v.union(v.literal('IN_PERSON'), v.literal('ONLINE'), v.literal('HYBRID'));

const studyGroupStatus = v.union(v.literal('OPEN'), v.literal('FULL'), v.literal('ARCHIVED'));

const lookingFor = v.union(
  v.literal('STUDY_PARTNER'),
  v.literal('FRIENDS'),
  v.literal('CLUB_BUDDY'),
  v.literal('GYM_PARTNER'),
  v.literal('LANGUAGE_EXCHANGE'),
);

const rsvpStatus = v.union(v.literal('GOING'), v.literal('INTERESTED'), v.literal('DECLINED'));

const hostType = v.union(
  v.literal('CLUB'),
  v.literal('SPACE'),
  v.literal('USER'),
  v.literal('CAMPUS'),
);

const listingCategory = v.union(
  v.literal('TEXTBOOK'),
  v.literal('ELECTRONICS'),
  v.literal('FURNITURE'),
  v.literal('TICKETS'),
  v.literal('OTHER'),
);

const listingStatus = v.union(v.literal('ACTIVE'), v.literal('PENDING'), v.literal('SOLD'));

const reportTarget = v.union(
  v.literal('MESSAGE'),
  v.literal('USER'),
  v.literal('RESOURCE'),
  v.literal('LISTING'),
  v.literal('REVIEW'),
  v.literal('EVENT'),
);

const dmPrivacy = v.union(
  v.literal('EVERYONE'),
  v.literal('SHARED_SPACE_ONLY'),
  v.literal('NOBODY'),
);

// ── Shared object shapes ───────────────────────────────────────────────────

const attachment = v.object({
  storageId: v.optional(v.id('_storage')),
  url: v.string(),
  name: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

const userSettings = v.object({
  theme: v.union(v.literal('dark'), v.literal('light')),
  dmPrivacy,
  discoverable: v.boolean(),
  showCourses: v.boolean(),
  showRealName: v.boolean(),
});

export default defineSchema({
  // ── Identity ─────────────────────────────────────────────────────────────

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    username: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    year: v.optional(year),
    majorId: v.optional(v.id('majors')),
    minorId: v.optional(v.id('majors')),
    karma: v.number(),
    settings: userSettings,
    isAdmin: v.boolean(),
    lastSeenAt: v.number(),
    verifiedAt: v.optional(v.number()),
    onboardedAt: v.optional(v.number()),
    /** Set when the avatar came from Convex file storage, so deleting it can also
     *  free the blob. Seeded avatars are plain URLs and have no storage id. */
    avatarStorageId: v.optional(v.id('_storage')),
    /** An admin can suspend an account without destroying its content. */
    suspendedAt: v.optional(v.number()),
    suspendedReason: v.optional(v.string()),
    /** Set by "send a password reset". The account still works; the client nags. */
    mustChangePassword: v.optional(v.boolean()),
    // Users are anonymised, never hard-deleted (CLAUDE.md section 8).
    deletedAt: v.optional(v.number()),
  })
    // UNIQUE: email, username — check these indexes before every insert.
    .index('by_email', ['email'])
    .index('by_username', ['username'])
    .index('by_major', ['majorId'])
    .index('by_major_year', ['majorId', 'year'])
    .searchIndex('search_people', {
      searchField: 'displayName',
      filterFields: ['deletedAt'],
    }),

  majors: defineTable({
    name: v.string(),
    faculty: v.string(),
    description: v.string(),
  }).index('by_name', ['name']),

  interests: defineTable({
    name: v.string(),
    category: interestCategory,
  }).index('by_category', ['category']),

  userInterests: defineTable({
    userId: v.id('users'),
    interestId: v.id('interests'),
  })
    // UNIQUE: (userId, interestId)
    .index('by_user', ['userId'])
    .index('by_interest', ['interestId'])
    .index('by_user_interest', ['userId', 'interestId']),

  userCourses: defineTable({
    userId: v.id('users'),
    courseId: v.id('courses'),
    term: v.string(),
    status: courseStatus,
  })
    // UNIQUE: (userId, courseId, term)
    .index('by_user', ['userId'])
    .index('by_user_term', ['userId', 'term'])
    .index('by_course_term', ['courseId', 'term'])
    .index('by_user_course_term', ['userId', 'courseId', 'term']),

  // ── Spaces and chat ──────────────────────────────────────────────────────

  spaces: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    type: spaceType,
    visibility,
    ownerId: v.id('users'),
    linkedClubId: v.optional(v.id('clubs')),
    linkedCourseId: v.optional(v.id('courses')),
    linkedMajorId: v.optional(v.id('majors')),
    /** Who pressed create. Distinct from ownerId, which can be handed on. */
    createdById: v.optional(v.id('users')),
    /**
     * Admin-drafted Spaces are invisible until a student is made owner of them.
     * Undefined means "drafted, not yet claimed"; every other Space is published
     * at creation. Queries that list Spaces must filter on this.
     */
    publishedAt: v.optional(v.number()),
    /** Free-text interest tags, used by discovery and the club quiz. */
    tags: v.optional(v.array(v.string())),
    /**
     * True when `ownerId` points at a caretaker rather than at somebody who
     * actually runs this space — a club space created on demand for a club with no
     * president or exec on record. The space works normally; it just shows up in
     * the admin queue until a real owner is assigned.
     */
    ownerIsPlaceholder: v.optional(v.boolean()),
  })
    // UNIQUE: slug
    .index('by_slug', ['slug'])
    .index('by_type', ['type'])
    .index('by_course', ['linkedCourseId'])
    .index('by_major', ['linkedMajorId'])
    .index('by_club', ['linkedClubId'])
    .searchIndex('search_spaces', {
      searchField: 'name',
      filterFields: ['visibility', 'type'],
    }),

  spaceMembers: defineTable({
    spaceId: v.id('spaces'),
    userId: v.id('users'),
    role: spaceRole,
    nickname: v.optional(v.string()),
    joinedAt: v.number(),
    /**
     * Custom roles are cosmetic-plus-permissions labels on top of the four-rank
     * ladder, the way Discord's roles sit beside server ownership. The ladder
     * still decides moderation authority; these decide the rest.
     */
    roleIds: v.optional(v.array(v.id('spaceRoles'))),
  })
    // UNIQUE: (spaceId, userId)
    .index('by_space', ['spaceId'])
    .index('by_user', ['userId'])
    .index('by_space_user', ['spaceId', 'userId']),

  channels: defineTable({
    spaceId: v.id('spaces'),
    name: v.string(),
    topic: v.optional(v.string()),
    type: channelType,
    position: v.number(),
    isDefault: v.boolean(),
  })
    // UNIQUE: (spaceId, name)
    .index('by_space', ['spaceId'])
    .index('by_space_position', ['spaceId', 'position'])
    .index('by_space_name', ['spaceId', 'name'])
    .index('by_space_type', ['spaceId', 'type']),

  messages: defineTable({
    channelId: v.id('channels'),
    // Retained for moderation on anonymous posts. NEVER returned to clients when
    // isAnonymous is true — see toMessageDto in convex/lib/serialize.ts.
    authorId: v.optional(v.id('users')),
    content: v.string(),
    attachments: v.array(attachment),
    replyToId: v.optional(v.id('messages')),
    threadRootId: v.optional(v.id('messages')),
    isAnonymous: v.boolean(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index('by_channel', ['channelId'])
    // The main channel flow excludes thread replies, so that filter is in the index.
    .index('by_channel_thread', ['channelId', 'threadRootId'])
    .index('by_thread', ['threadRootId'])
    .index('by_author', ['authorId']),

  reactions: defineTable({
    messageId: v.id('messages'),
    userId: v.id('users'),
    emoji: v.string(),
  })
    // UNIQUE: (messageId, userId, emoji)
    .index('by_message', ['messageId'])
    .index('by_message_user_emoji', ['messageId', 'userId', 'emoji']),

  pinnedMessages: defineTable({
    channelId: v.id('channels'),
    messageId: v.id('messages'),
    pinnedById: v.id('users'),
  })
    // UNIQUE: messageId
    .index('by_channel', ['channelId'])
    .index('by_message', ['messageId']),

  /** Per-user read cursor; drives unread badges without scanning messages. */
  channelReads: defineTable({
    channelId: v.id('channels'),
    userId: v.id('users'),
    lastReadAt: v.number(),
  })
    // UNIQUE: (channelId, userId)
    .index('by_channel_user', ['channelId', 'userId'])
    .index('by_user', ['userId']),

  directConversations: defineTable({
    title: v.optional(v.string()),
    isGroup: v.boolean(),
    lastMessageAt: v.number(),
  }).index('by_last_message', ['lastMessageAt']),

  directMembers: defineTable({
    conversationId: v.id('directConversations'),
    userId: v.id('users'),
    lastReadAt: v.number(),
  })
    // UNIQUE: (conversationId, userId)
    .index('by_conversation', ['conversationId'])
    .index('by_user', ['userId'])
    .index('by_conversation_user', ['conversationId', 'userId']),

  directMessages: defineTable({
    conversationId: v.id('directConversations'),
    authorId: v.id('users'),
    content: v.string(),
    attachments: v.array(attachment),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }).index('by_conversation', ['conversationId']),

  // ── Clubs ────────────────────────────────────────────────────────────────

  clubs: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    category: clubCategory,
    logoUrl: v.optional(v.string()),
    meetingInfo: v.optional(v.string()),
    socialLinks: v.record(v.string(), v.string()),
    memberCountEstimate: v.number(),
    isRecruiting: v.boolean(),
    /** Powers the six-question quiz (section 5.4). */
    tags: v.array(v.string()),
  })
    // UNIQUE: slug
    .index('by_slug', ['slug'])
    .index('by_category', ['category'])
    .index('by_recruiting', ['isRecruiting'])
    .searchIndex('search_clubs', {
      searchField: 'name',
      filterFields: ['category', 'isRecruiting'],
    }),

  clubMemberships: defineTable({
    clubId: v.id('clubs'),
    userId: v.id('users'),
    role: clubRole,
  })
    // UNIQUE: (clubId, userId)
    .index('by_club', ['clubId'])
    .index('by_user', ['userId'])
    .index('by_club_user', ['clubId', 'userId']),

  // ── Courses and knowledge ────────────────────────────────────────────────

  courses: defineTable({
    code: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    majorId: v.optional(v.id('majors')),
    level: v.number(),
    // Denormalised from courseReviews so the Overview gauges are a single read.
    avgDifficulty: v.optional(v.number()),
    avgWorkload: v.optional(v.number()),
    avgRating: v.optional(v.number()),
    reviewCount: v.number(),
  })
    // UNIQUE: code
    .index('by_code', ['code'])
    .index('by_major', ['majorId'])
    .index('by_level', ['level'])
    // Replaces the FTS5 virtual tables. Convex search is prefix-aware, so "CS 22"
    // still finds "CS 2210".
    .searchIndex('search_courses', {
      searchField: 'title',
      filterFields: ['majorId', 'level'],
    })
    .searchIndex('search_course_codes', {
      searchField: 'code',
      filterFields: ['majorId'],
    }),

  courseReviews: defineTable({
    courseId: v.id('courses'),
    authorId: v.id('users'),
    term: v.string(),
    profName: v.string(),
    difficulty: v.number(),
    workload: v.number(),
    rating: v.number(),
    tips: v.string(),
    wouldRecommend: v.boolean(),
    showName: v.boolean(),
    helpfulCount: v.number(),
  })
    // UNIQUE: (courseId, authorId, term) — one review per user per course per term.
    .index('by_course', ['courseId'])
    .index('by_course_term', ['courseId', 'term'])
    .index('by_author', ['authorId'])
    .index('by_course_author_term', ['courseId', 'authorId', 'term']),

  resources: defineTable({
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
    uploaderId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    type: resourceType,
    // Convex file storage replaces server/uploads/.
    storageId: v.optional(v.id('_storage')),
    linkUrl: v.optional(v.string()),
    term: v.optional(v.string()),
    downloadCount: v.number(),
    score: v.number(),
  })
    .index('by_course', ['courseId'])
    .index('by_course_score', ['courseId', 'score'])
    .index('by_space', ['spaceId'])
    .index('by_uploader', ['uploaderId'])
    .searchIndex('search_resources', {
      searchField: 'title',
      filterFields: ['courseId', 'type', 'term'],
    }),

  resourceVotes: defineTable({
    resourceId: v.id('resources'),
    userId: v.id('users'),
    value: v.number(), // +1 or -1
  })
    // UNIQUE: (resourceId, userId)
    .index('by_resource', ['resourceId'])
    .index('by_resource_user', ['resourceId', 'userId'])
    .index('by_user', ['userId']),

  qaPosts: defineTable({
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
    authorId: v.id('users'),
    title: v.string(),
    body: v.string(),
    score: v.number(),
    acceptedAnswerId: v.optional(v.id('qaAnswers')),
  })
    .index('by_course', ['courseId'])
    .index('by_space', ['spaceId'])
    .index('by_author', ['authorId'])
    .searchIndex('search_qa', {
      searchField: 'title',
      filterFields: ['courseId'],
    }),

  qaAnswers: defineTable({
    postId: v.id('qaPosts'),
    authorId: v.id('users'),
    body: v.string(),
    score: v.number(),
  })
    .index('by_post', ['postId'])
    .index('by_author', ['authorId']),

  qaVotes: defineTable({
    answerId: v.id('qaAnswers'),
    userId: v.id('users'),
    value: v.number(),
  })
    // UNIQUE: (answerId, userId)
    .index('by_answer_user', ['answerId', 'userId']),

  // ── Study and matching ───────────────────────────────────────────────────

  studyGroups: defineTable({
    courseId: v.optional(v.id('courses')),
    spaceId: v.optional(v.id('spaces')),
    conversationId: v.optional(v.id('directConversations')),
    name: v.string(),
    description: v.optional(v.string()),
    maxSize: v.number(),
    meetingType,
    /** 7 days x 5 blocks, flattened. Was a JSON string in SQLite. */
    schedule: v.array(v.boolean()),
    locationHint: v.optional(v.string()),
    ownerId: v.id('users'),
    status: studyGroupStatus,
  })
    .index('by_course', ['courseId'])
    .index('by_course_status', ['courseId', 'status'])
    .index('by_owner', ['ownerId'])
    .index('by_status', ['status']),

  studyGroupMembers: defineTable({
    groupId: v.id('studyGroups'),
    userId: v.id('users'),
    status: v.union(v.literal('MEMBER'), v.literal('REQUESTED')),
  })
    // UNIQUE: (groupId, userId)
    .index('by_group', ['groupId'])
    .index('by_user', ['userId'])
    .index('by_group_user', ['groupId', 'userId']),

  buddyProfiles: defineTable({
    userId: v.id('users'),
    isActive: v.boolean(),
    lookingFor: v.array(lookingFor),
    availability: v.array(v.boolean()),
    note: v.optional(v.string()),
  })
    // UNIQUE: userId
    .index('by_user', ['userId'])
    .index('by_active', ['isActive']),

  buddyMatches: defineTable({
    userAId: v.id('users'),
    userBId: v.id('users'),
    score: v.number(),
    /** Section 5.6 makes this mandatory — a match with no reason is never rendered. */
    explanation: v.string(),
    status: v.union(v.literal('SUGGESTED'), v.literal('CONNECTED'), v.literal('DISMISSED')),
  })
    // UNIQUE: (userAId, userBId), stored with ids sorted so the pair is stable.
    .index('by_pair', ['userAId', 'userBId'])
    .index('by_user_a', ['userAId'])
    .index('by_user_b', ['userBId']),

  /** Low-pressure "I see you" ping. Mutual waves prompt both sides to open a DM. */
  waves: defineTable({
    fromId: v.id('users'),
    toId: v.id('users'),
    context: v.optional(v.string()),
  })
    // UNIQUE: (fromId, toId)
    .index('by_from_to', ['fromId', 'toId'])
    .index('by_to', ['toId']),

  // ── Events ───────────────────────────────────────────────────────────────

  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    hostType,
    // Not a v.id(): the host is a club, a space, a user, or the campus itself, and
    // Convex ids are per-table. CAMPUS events store the literal "campus".
    hostId: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    location: v.string(),
    locationDetail: v.optional(v.string()),
    capacity: v.optional(v.number()),
    coverUrl: v.optional(v.string()),
    tags: v.array(v.string()),
  })
    .index('by_start', ['startsAt'])
    .index('by_host', ['hostType', 'hostId'])
    .searchIndex('search_events', {
      searchField: 'title',
      filterFields: ['hostType'],
    }),

  eventRsvps: defineTable({
    eventId: v.id('events'),
    userId: v.id('users'),
    status: rsvpStatus,
  })
    // UNIQUE: (eventId, userId)
    .index('by_event', ['eventId'])
    .index('by_event_status', ['eventId', 'status'])
    .index('by_user', ['userId'])
    .index('by_event_user', ['eventId', 'userId']),

  // ── Campus utility ───────────────────────────────────────────────────────

  marketplaceListings: defineTable({
    sellerId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    category: listingCategory,
    courseId: v.optional(v.id('courses')),
    photos: v.array(v.string()),
    status: listingStatus,
  })
    .index('by_status', ['status'])
    .index('by_category_status', ['category', 'status'])
    .index('by_course_status', ['courseId', 'status'])
    .index('by_seller', ['sellerId']),

  lostFoundItems: defineTable({
    reporterId: v.id('users'),
    kind: v.union(v.literal('LOST'), v.literal('FOUND')),
    title: v.string(),
    description: v.string(),
    location: v.string(),
    photoUrl: v.optional(v.string()),
    status: v.union(v.literal('OPEN'), v.literal('RESOLVED')),
  })
    .index('by_status', ['status'])
    .index('by_reporter', ['reporterId']),

  mentorProfiles: defineTable({
    userId: v.id('users'),
    isMentor: v.boolean(),
    capacity: v.number(),
    topics: v.array(v.string()),
    blurb: v.string(),
  })
    // UNIQUE: userId
    .index('by_user', ['userId'])
    .index('by_is_mentor', ['isMentor']),

  mentorLinks: defineTable({
    mentorId: v.id('users'),
    menteeId: v.id('users'),
    status: v.union(v.literal('REQUESTED'), v.literal('ACTIVE'), v.literal('ENDED')),
    message: v.optional(v.string()),
  })
    // UNIQUE: (mentorId, menteeId)
    .index('by_mentor', ['mentorId'])
    .index('by_mentor_status', ['mentorId', 'status'])
    .index('by_mentee', ['menteeId'])
    .index('by_pair', ['mentorId', 'menteeId']),

  // ── Trust and safety ─────────────────────────────────────────────────────

  reports: defineTable({
    reporterId: v.id('users'),
    targetType: reportTarget,
    targetId: v.string(),
    reason: v.string(),
    status: v.union(v.literal('OPEN'), v.literal('ACTIONED'), v.literal('DISMISSED')),
    resolvedById: v.optional(v.id('users')),
  })
    .index('by_status', ['status'])
    .index('by_target', ['targetType', 'targetId'])
    .index('by_reporter', ['reporterId']),

  moderationActions: defineTable({
    moderatorId: v.id('users'),
    targetUserId: v.id('users'),
    type: v.union(
      v.literal('WARN'),
      v.literal('MUTE'),
      v.literal('KICK'),
      v.literal('BAN'),
      v.literal('CONTENT_REMOVED'),
    ),
    /** A space id, or undefined for campus-wide. */
    scope: v.optional(v.id('spaces')),
    reason: v.string(),
    expiresAt: v.optional(v.number()),
  })
    .index('by_target', ['targetUserId'])
    .index('by_target_scope', ['targetUserId', 'scope'])
    .index('by_scope', ['scope']),

  notifications: defineTable({
    userId: v.id('users'),
    type: v.string(),
    payload: v.any(),
    readAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_user_unread', ['userId', 'readAt']),

  // ── Karma and badges ─────────────────────────────────────────────────────

  badges: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.string(),
    emoji: v.string(),
  })
    // UNIQUE: key
    .index('by_key', ['key']),

  userBadges: defineTable({
    userId: v.id('users'),
    badgeId: v.id('badges'),
    awardedAt: v.number(),
  })
    // UNIQUE: (userId, badgeId)
    .index('by_user', ['userId'])
    .index('by_user_badge', ['userId', 'badgeId']),

  // ── Runtime state that used to live in process memory ────────────────────

  /** Replaces the in-memory Map behind Express rate limiting. Convex has no
   *  long-lived process to hold it, and section 5.10's limits must survive a cold start. */
  rateLimits: defineTable({
    key: v.string(), // "<bucket>:<userId>"
    count: v.number(),
    resetAt: v.number(),
  }).index('by_key', ['key']),

  /** Presence was a ref-count over socket connections. There are no sockets here, so
   *  it becomes a heartbeat row that reactive queries read directly. */
  presence: defineTable({
    userId: v.id('users'),
    lastSeenAt: v.number(),
    typingInChannel: v.optional(v.id('channels')),
    typingUpdatedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_channel', ['typingInChannel'])
    .index('by_last_seen', ['lastSeenAt']),

  /** Convex has no cookies. A session row is created on login and its id is held
   *  in localStorage by the client, then passed to every call that needs identity. */
  sessions: defineTable({
    userId: v.id('users'),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index('by_token', ['token'])
    .index('by_user', ['userId']),

  // ── Custom space roles (section 5.2 extension) ───────────────────────────

  /**
   * A named, coloured role a space owner can mint and hand out. Permissions are a
   * flat record rather than a bitfield: there are eight of them, this is not
   * Discord's scale, and a readable document beats four bytes.
   */
  spaceRoles: defineTable({
    spaceId: v.id('spaces'),
    name: v.string(),
    /** Hex, shown on the member list and beside names in chat. */
    color: v.string(),
    /** Higher sorts first in the member list. */
    position: v.number(),
    permissions: v.object({
      manageChannels: v.boolean(),
      manageRoles: v.boolean(),
      manageMembers: v.boolean(),
      moderateMessages: v.boolean(),
      pinMessages: v.boolean(),
      postAnnouncements: v.boolean(),
      inviteMembers: v.boolean(),
      useVoice: v.boolean(),
    }),
  })
    .index('by_space', ['spaceId'])
    .index('by_space_name', ['spaceId', 'name']),

  // ── Instance configuration (section 6 of the brief, first-run setup) ─────

  /**
   * One row, ever. Written by the IT administrator on first visit and read by
   * every unauthenticated page load, which is why it is its own table rather than
   * a field hung off some other document.
   */
  instanceConfig: defineTable({
    schoolName: v.string(),
    shortName: v.string(),
    /** Bare domains, lowercase, no @. An empty array means any email is accepted. */
    allowedEmailDomains: v.array(v.string()),
    tagline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    currentTerm: v.string(),
    /** When false, only admins create Spaces. */
    allowStudentSpaces: v.boolean(),
    /** When false, registration is closed and only admins can add accounts. */
    allowSelfRegistration: v.boolean(),
    setupCompletedAt: v.number(),
    setupByUserId: v.id('users'),
  }),

  // ── Audit log (section 5.10 extension, admin dashboard) ─────────────────

  /**
   * Append-only record of consequential actions. The dashboard reads it as a feed,
   * so the human-readable `summary` is stored rather than reconstructed — the
   * referenced rows may not exist by the time anyone reads the entry.
   */
  auditLogs: defineTable({
    actorId: v.optional(v.id('users')),
    actorName: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    summary: v.string(),
    metadata: v.optional(v.any()),
  })
    .index('by_action', ['action'])
    .index('by_actor', ['actorId'])
    .index('by_target', ['targetType', 'targetId']),

  // ── Voice (section 5.2, replacing the VOICE_STUB placeholder) ───────────

  /**
   * Who is in a voice room right now. `room` is a channel id or a conversation id
   * as a string, because Convex ids are per-table and one room key has to address
   * both. Rows are dropped on leave and expire by heartbeat.
   */
  voiceParticipants: defineTable({
    room: v.string(),
    scope: v.union(v.literal('CHANNEL'), v.literal('DM')),
    userId: v.id('users'),
    /** Stable per browser tab, so one person in two tabs is two peers. */
    peerId: v.string(),
    muted: v.boolean(),
    deafened: v.boolean(),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_room', ['room'])
    .index('by_room_peer', ['room', 'peerId'])
    .index('by_user', ['userId'])
    .index('by_last_seen', ['lastSeenAt']),

  /**
   * WebRTC signalling mailbox. Convex is the signalling channel only — offers,
   * answers and ICE candidates pass through here and the audio itself goes
   * peer-to-peer. Rows are deleted by the recipient once consumed.
   */
  voiceSignals: defineTable({
    room: v.string(),
    fromPeerId: v.string(),
    toPeerId: v.string(),
    kind: v.union(v.literal('OFFER'), v.literal('ANSWER'), v.literal('ICE')),
    /** Serialised SDP or ICE candidate. Opaque to the backend. */
    payload: v.string(),
  })
    .index('by_recipient', ['room', 'toPeerId'])
    .index('by_room', ['room']),

  // ── Password resets (admin-initiated; no mail service runs here) ────────

  /**
   * An admin cannot read or set a password, only mint one of these. The token is
   * surfaced in the dashboard for the admin to pass on out-of-band, which is what
   * an email would have carried.
   */
  passwordResets: defineTable({
    userId: v.id('users'),
    token: v.string(),
    issuedById: v.id('users'),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index('by_token', ['token'])
    .index('by_user', ['userId']),
});
