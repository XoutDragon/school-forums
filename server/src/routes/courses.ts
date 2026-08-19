import { Router } from 'express';
import { z } from 'zod';
import { courseReviewSchema, createResourceSchema, qaPostSchema } from '@campusconnect/shared';
import { prisma } from '../lib/prisma.js';
import { ah } from '../lib/async.js';
import { ApiError } from '../lib/errors.js';
import { currentTerm } from '../lib/env.js';
import { authed, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parseSettings, publicUserSelect, toPublicUser } from '../services/serialize.js';
import { KARMA, grantKarma, reevaluateBadges } from '../services/karma.service.js';
import { onlineIds } from '../sockets/presence.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

coursesRouter.get(
  '/',
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const majorId = req.query.majorId ? String(req.query.majorId) : undefined;
    const courses = await prisma.course.findMany({
      where: {
        ...(majorId ? { majorId } : {}),
        ...(q ? { OR: [{ code: { contains: q } }, { title: { contains: q } }] } : {}),
      },
      orderBy: [{ code: 'asc' }],
      take: 60,
      select: courseCard,
    });
    res.json(courses.map(toCourseDto));
  }),
);

const courseCard = {
  id: true,
  code: true,
  title: true,
  description: true,
  level: true,
  avgDifficulty: true,
  avgWorkload: true,
  avgRating: true,
  major: { select: { id: true, name: true } },
  _count: { select: { reviews: true } },
} as const;

function toCourseDto(c: {
  id: string;
  code: string;
  title: string;
  description: string | null;
  level: number;
  avgDifficulty: number | null;
  avgWorkload: number | null;
  avgRating: number | null;
  major: { id: string; name: string } | null;
  _count: { reviews: number };
}) {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    level: c.level,
    major: c.major,
    avgDifficulty: c.avgDifficulty,
    avgWorkload: c.avgWorkload,
    avgRating: c.avgRating,
    reviewCount: c._count.reviews,
    takingThisTerm: 0,
  };
}

coursesRouter.get(
  '/:code',
  ah(async (req, res) => {
    const term = currentTerm();
    const code = decodeURIComponent(req.params.code!);
    const course = await prisma.course.findUnique({ where: { code }, select: courseCard });
    if (!course) throw ApiError.notFound('No course with that code');

    const [takingThisTerm, space, listings] = await Promise.all([
      prisma.userCourse.count({ where: { courseId: course.id, term, status: 'TAKING' } }),
      prisma.space.findFirst({
        where: { linkedCourseId: course.id },
        select: { id: true, name: true, slug: true },
      }),
      prisma.marketplaceListing.count({
        where: { courseId: course.id, status: 'ACTIVE', category: 'TEXTBOOK' },
      }),
    ]);

    res.json({ ...toCourseDto(course), takingThisTerm, space, textbookListings: listings });
  }),
);

// ── Reviews ────────────────────────────────────────────────────────────────

coursesRouter.get(
  '/:courseId/reviews',
  ah(async (req, res) => {
    const reviews = await prisma.courseReview.findMany({
      where: { courseId: req.params.courseId! },
      orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        term: true,
        profName: true,
        difficulty: true,
        workload: true,
        rating: true,
        tips: true,
        wouldRecommend: true,
        showName: true,
        helpfulCount: true,
        createdAt: true,
        author: { select: publicUserSelect },
      },
    });
    // Anonymous unless the author opted in (§4, CourseReview).
    res.json(
      reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        author: r.showName ? toPublicUser(r.author) : null,
      })),
    );
  }),
);

coursesRouter.post(
  '/:courseId/reviews',
  validateBody(courseReviewSchema),
  ah(async (req, res) => {
    const me = authed(req).id;
    const courseId = req.params.courseId!;

    const existing = await prisma.courseReview.findUnique({
      where: { courseId_authorId_term: { courseId, authorId: me, term: req.body.term } },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict(`You already reviewed this course for ${req.body.term}`);

    const review = await prisma.courseReview.create({
      data: { ...req.body, courseId, authorId: me },
    });
    await recomputeCourseAggregates(courseId);
    await grantKarma(me, KARMA.REVIEW_POSTED);
    void reevaluateBadges(me);
    res.status(201).json(review);
  }),
);

/** Aggregates are stored on Course so the Overview gauges are one read, not a scan. */
async function recomputeCourseAggregates(courseId: string) {
  const agg = await prisma.courseReview.aggregate({
    where: { courseId },
    _avg: { difficulty: true, workload: true, rating: true },
  });
  await prisma.course.update({
    where: { id: courseId },
    data: {
      avgDifficulty: agg._avg.difficulty,
      avgWorkload: agg._avg.workload,
      avgRating: agg._avg.rating,
    },
  });
}

// ── Resources ──────────────────────────────────────────────────────────────

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

resourcesRouter.get(
  '/',
  ah(async (req, res) => {
    const me = authed(req).id;
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    const resources = await prisma.resource.findMany({
      where: {
        ...(req.query.courseId ? { courseId: String(req.query.courseId) } : {}),
        ...(req.query.spaceId ? { spaceId: String(req.query.spaceId) } : {}),
      },
      orderBy: sort === 'top' ? [{ score: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        fileUrl: true,
        linkUrl: true,
        term: true,
        score: true,
        downloadCount: true,
        createdAt: true,
        uploader: { select: publicUserSelect },
        votes: { where: { userId: me }, select: { value: true } },
        course: { select: { id: true, code: true } },
      },
    });
    res.json(
      resources.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        uploader: toPublicUser(r.uploader),
        myVote: r.votes[0]?.value ?? 0,
        votes: undefined,
      })),
    );
  }),
);

resourcesRouter.post(
  '/',
  validateBody(createResourceSchema),
  ah(async (req, res) => {
    const resource = await prisma.resource.create({
      data: { ...req.body, uploaderId: authed(req).id },
    });
    res.status(201).json(resource);
  }),
);

resourcesRouter.post(
  '/:id/vote',
  validateBody(z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })),
  ah(async (req, res) => {
    const me = authed(req).id;
    const id = req.params.id!;
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { uploaderId: true },
    });
    if (!resource) throw ApiError.notFound('No resource there');

    const previous = await prisma.resourceVote.findUnique({
      where: { resourceId_userId: { resourceId: id, userId: me } },
      select: { value: true },
    });

    if (req.body.value === 0) {
      await prisma.resourceVote.deleteMany({ where: { resourceId: id, userId: me } });
    } else {
      await prisma.resourceVote.upsert({
        where: { resourceId_userId: { resourceId: id, userId: me } },
        create: { resourceId: id, userId: me, value: req.body.value },
        update: { value: req.body.value },
      });
    }

    const delta = req.body.value - (previous?.value ?? 0);
    const updated = await prisma.resource.update({
      where: { id },
      data: { score: { increment: delta } },
      select: { score: true },
    });

    // Karma follows the upvote, not the vote count, so flipping a vote can't farm it.
    if (delta > 0 && resource.uploaderId !== me) {
      await grantKarma(resource.uploaderId, KARMA.RESOURCE_UPVOTE * delta);
      void reevaluateBadges(resource.uploaderId);
    }
    res.json({ score: updated.score, myVote: req.body.value });
  }),
);

resourcesRouter.post(
  '/:id/download',
  ah(async (req, res) => {
    const resource = await prisma.resource.update({
      where: { id: req.params.id! },
      data: { downloadCount: { increment: 1 } },
      select: { uploaderId: true, fileUrl: true, linkUrl: true, downloadCount: true },
    });
    if (resource.uploaderId !== authed(req).id) {
      await grantKarma(resource.uploaderId, KARMA.RESOURCE_DOWNLOAD);
    }
    res.json({ url: resource.fileUrl ?? resource.linkUrl, downloadCount: resource.downloadCount });
  }),
);

// ── Q&A ────────────────────────────────────────────────────────────────────

export const qaRouter = Router();
qaRouter.use(requireAuth);

qaRouter.get(
  '/',
  ah(async (req, res) => {
    const posts = await prisma.qAPost.findMany({
      where: {
        ...(req.query.courseId ? { courseId: String(req.query.courseId) } : {}),
        ...(req.query.spaceId ? { spaceId: String(req.query.spaceId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        body: true,
        score: true,
        acceptedAnswerId: true,
        createdAt: true,
        author: { select: publicUserSelect },
        _count: { select: { answers: true } },
      },
    });
    res.json(
      posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        author: toPublicUser(p.author),
        answerCount: p._count.answers,
        isResolved: Boolean(p.acceptedAnswerId),
      })),
    );
  }),
);

qaRouter.post(
  '/',
  validateBody(qaPostSchema),
  ah(async (req, res) => {
    const post = await prisma.qAPost.create({ data: { ...req.body, authorId: authed(req).id } });
    res.status(201).json(post);
  }),
);

qaRouter.get(
  '/:id',
  ah(async (req, res) => {
    const post = await prisma.qAPost.findUnique({
      where: { id: req.params.id! },
      select: {
        id: true,
        title: true,
        body: true,
        score: true,
        acceptedAnswerId: true,
        createdAt: true,
        author: { select: publicUserSelect },
        answers: {
          orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            body: true,
            score: true,
            createdAt: true,
            author: { select: publicUserSelect },
          },
        },
      },
    });
    if (!post) throw ApiError.notFound('No question there');
    res.json({
      ...post,
      createdAt: post.createdAt.toISOString(),
      author: toPublicUser(post.author),
      answers: post.answers.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        author: toPublicUser(a.author),
        isAccepted: a.id === post.acceptedAnswerId,
      })),
    });
  }),
);

qaRouter.post(
  '/:id/answers',
  validateBody(z.object({ body: z.string().min(10).max(4000) })),
  ah(async (req, res) => {
    const answer = await prisma.qAAnswer.create({
      data: { postId: req.params.id!, authorId: authed(req).id, body: req.body.body },
    });
    res.status(201).json(answer);
  }),
);

qaRouter.post(
  '/:id/accept/:answerId',
  ah(async (req, res) => {
    const me = authed(req).id;
    const post = await prisma.qAPost.findUnique({
      where: { id: req.params.id! },
      select: { authorId: true },
    });
    if (!post) throw ApiError.notFound('No question there');
    if (post.authorId !== me) throw ApiError.forbidden('Only the asker can accept an answer');

    const answer = await prisma.qAAnswer.findUnique({
      where: { id: req.params.answerId! },
      select: { authorId: true, postId: true },
    });
    if (!answer || answer.postId !== req.params.id) throw ApiError.notFound('No answer there');

    await prisma.qAPost.update({
      where: { id: req.params.id! },
      data: { acceptedAnswerId: req.params.answerId! },
    });
    if (answer.authorId !== me) {
      await grantKarma(answer.authorId, KARMA.ACCEPTED_ANSWER);
      void reevaluateBadges(answer.authorId);
    }
    res.json({ acceptedAnswerId: req.params.answerId });
  }),
);

// ── Classmates ─────────────────────────────────────────────────────────────

coursesRouter.get(
  '/:courseId/classmates',
  ah(async (req, res) => {
    const me = authed(req).id;
    const term = currentTerm();
    const rows = await prisma.userCourse.findMany({
      where: {
        courseId: req.params.courseId!,
        term,
        status: 'TAKING',
        userId: { not: me },
        user: { deletedAt: null },
      },
      select: { user: { select: { ...publicUserSelect, settings: true } } },
      take: 60,
    });

    const online = onlineIds();
    const wavedAt = await prisma.wave.findMany({
      where: { fromId: me, toId: { in: rows.map((r) => r.user.id) } },
      select: { toId: true },
    });
    const waved = new Set(wavedAt.map((w) => w.toId));

    res.json(
      rows
        .filter((r) => parseSettings(r.user.settings).discoverable)
        .map((r) => ({
          ...toPublicUser(r.user, online.has(r.user.id)),
          alreadyWaved: waved.has(r.user.id),
        })),
    );
  }),
);
