import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { rebuildFts } from './fts.js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const UPLOADS = join(here, '..', 'uploads');

// Deterministic PRNG — a seeded campus should look the same on every machine, so a
// screenshot in a bug report matches what the next person sees.
let rngState = 20260813;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const pickN = <T>(arr: readonly T[], n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length)
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
};
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

function currentTerm(now = new Date()): string {
  const m = now.getMonth();
  const y = now.getFullYear();
  if (m <= 3) return `${y}WI`;
  if (m <= 5) return `${y}SP`;
  if (m <= 7) return `${y}SU`;
  return `${y}FA`;
}
const TERM = currentTerm();
const LAST_TERM = `${Number(TERM.slice(0, 4)) - 1}${TERM.slice(4)}`;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const daysOut = (d: number, hour = 18) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, 0, 0, 0);
  return date;
};

/** Smallest thing a PDF reader will open. Enough for the inline preview to be real. */
function placeholderPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, '');
  const content = `BT /F1 16 Tf 60 720 Td (${text}) Tj 0 -28 Td /F1 11 Tf (Placeholder study material - Lakeshore University) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ── Reference data ─────────────────────────────────────────────────────────

const MAJORS = [
  [
    'Computer Science',
    'Faculty of Science',
    'Algorithms, systems, and the software that runs on them.',
  ],
  ['Biology', 'Faculty of Science', 'Molecules to ecosystems, with a lot of lab hours in between.'],
  [
    'Chemistry',
    'Faculty of Science',
    'Reactions, structures, and the fume hood you will come to know.',
  ],
  ['Mathematics', 'Faculty of Science', 'Proof-first. Bring patience and a lot of scrap paper.'],
  [
    'Mechanical Engineering',
    'Faculty of Engineering',
    'Statics, dynamics, thermo, and a capstone that eats your term.',
  ],
  [
    'Software Engineering',
    'Faculty of Engineering',
    'Building systems that other people have to maintain.',
  ],
  [
    'Civil Engineering',
    'Faculty of Engineering',
    'Structures, transport, and the built environment.',
  ],
  [
    'Psychology',
    'Faculty of Social Science',
    'Behaviour, cognition, and a statistics course you did not expect.',
  ],
  ['Economics', 'Faculty of Social Science', 'Models of choice under constraint, at every scale.'],
  [
    'Political Science',
    'Faculty of Social Science',
    'Power, institutions, and how they actually behave.',
  ],
  [
    'English Literature',
    'Faculty of Arts & Humanities',
    'Close reading, long reading, and arguing about both.',
  ],
  [
    'Visual Arts',
    'Faculty of Arts & Humanities',
    'Studio practice, critique, and building a body of work.',
  ],
] as const;

const COURSES: [string, string, string, number][] = [
  ['CS 1026', 'Computer Science Fundamentals I', 'Computer Science', 1000],
  ['CS 1027', 'Computer Science Fundamentals II', 'Computer Science', 1000],
  ['CS 2210', 'Data Structures and Algorithms', 'Computer Science', 2000],
  ['CS 2211', 'Software Tools and Systems Programming', 'Computer Science', 2000],
  ['CS 3305', 'Operating Systems', 'Computer Science', 3000],
  ['CS 3319', 'Databases I', 'Computer Science', 3000],
  ['CS 3350', 'Computer Architecture', 'Computer Science', 3000],
  ['CS 4442', 'Artificial Intelligence II', 'Computer Science', 4000],
  ['CS 4457', 'Computer Networks', 'Computer Science', 4000],
  ['BIO 1001', 'Principles of Biology I', 'Biology', 1000],
  ['BIO 1002', 'Principles of Biology II', 'Biology', 1000],
  ['BIO 2290', 'Cell Biology', 'Biology', 2000],
  ['BIO 2581', 'Genetics', 'Biology', 2000],
  ['BIO 3315', 'Ecology', 'Biology', 3000],
  ['CHEM 1301', 'Discovering Chemical Structure', 'Chemistry', 1000],
  ['CHEM 1302', 'Discovering Chemical Energetics', 'Chemistry', 1000],
  ['CHEM 2213', 'Organic Chemistry I', 'Chemistry', 2000],
  ['CHEM 3373', 'Analytical Chemistry', 'Chemistry', 3000],
  ['MATH 1225', 'Methods of Calculus', 'Mathematics', 1000],
  ['MATH 1600', 'Linear Algebra I', 'Mathematics', 1000],
  ['MATH 2155', 'Mathematical Structures', 'Mathematics', 2000],
  ['MATH 3120', 'Real Analysis I', 'Mathematics', 3000],
  ['STAT 2244', 'Statistics for Science', 'Mathematics', 2000],
  ['MME 2202', 'Mechanics of Materials', 'Mechanical Engineering', 2000],
  ['MME 2273', 'Thermodynamics I', 'Mechanical Engineering', 2000],
  ['MME 3307', 'Fluid Mechanics', 'Mechanical Engineering', 3000],
  ['MME 4499', 'Capstone Design Project', 'Mechanical Engineering', 4000],
  ['SE 2205', 'Algorithms and Data Structures for Engineers', 'Software Engineering', 2000],
  ['SE 3309', 'Database Management Systems', 'Software Engineering', 3000],
  ['SE 3350', 'Software Engineering Design', 'Software Engineering', 3000],
  ['SE 4452', 'Software Verification and Validation', 'Software Engineering', 4000],
  ['CEE 2219', 'Structural Analysis', 'Civil Engineering', 2000],
  ['CEE 3346', 'Geotechnical Engineering', 'Civil Engineering', 3000],
  ['PSY 1000', 'Introduction to Psychology', 'Psychology', 1000],
  ['PSY 2820', 'Research Methods in Psychology', 'Psychology', 2000],
  ['PSY 3229', 'Cognitive Psychology', 'Psychology', 3000],
  ['ECON 1021', 'Principles of Microeconomics', 'Economics', 1000],
  ['ECON 2150', 'Intermediate Macroeconomics', 'Economics', 2000],
  ['POLS 1020', 'Introduction to Political Science', 'Political Science', 1000],
  ['ENG 2033', 'Modern Literature', 'English Literature', 2000],
];

const INTERESTS: [string, string][] = [
  ['Machine Learning', 'ACADEMIC'],
  ['Research', 'ACADEMIC'],
  ['Debate', 'ACADEMIC'],
  ['Astronomy', 'ACADEMIC'],
  ['Languages', 'ACADEMIC'],
  ['Board Games', 'HOBBY'],
  ['Cooking', 'HOBBY'],
  ['Cycling', 'HOBBY'],
  ['Photography', 'HOBBY'],
  ['Hiking', 'HOBBY'],
  ['Gardening', 'HOBBY'],
  ['Badminton', 'SPORT'],
  ['Rock Climbing', 'SPORT'],
  ['Soccer', 'SPORT'],
  ['Running', 'SPORT'],
  ['Ultimate Frisbee', 'SPORT'],
  ['Swimming', 'SPORT'],
  ['Music Production', 'CREATIVE'],
  ['Painting', 'CREATIVE'],
  ['Creative Writing', 'CREATIVE'],
  ['Improv', 'CREATIVE'],
  ['Film', 'CREATIVE'],
  ['Choir', 'CREATIVE'],
  ['Volunteering', 'SOCIAL'],
  ['Coffee', 'SOCIAL'],
  ['Trivia', 'SOCIAL'],
  ['Potlucks', 'SOCIAL'],
  ['Startups', 'CAREER'],
  ['Co-op', 'CAREER'],
  ['Grad School', 'CAREER'],
  ['Consulting', 'CAREER'],
];

const CLUBS: [string, string, string, string[], boolean, string][] = [
  [
    'Lakeshore Robotics',
    'ACADEMIC',
    'We build competition robots and lose sleep over gearboxes. Beginners welcome — most of us started knowing nothing.',
    ['making', 'technical', 'competitive', 'weeknight'],
    true,
    'Tuesdays 7pm, Engineering Annex B12',
  ],
  [
    'Debate Union',
    'ACADEMIC',
    'British Parliamentary format, weekly practice rounds, and three tournaments a term.',
    ['discussion', 'academic', 'competitive', 'weeknight'],
    true,
    'Wednesdays 6:30pm, Social Science 2050',
  ],
  [
    'Lakeshore Outdoors Club',
    'SPORTS',
    'Day hikes, weekend camping, and one very ambitious canoe trip per year. Gear lending library included.',
    ['outdoors', 'weekend', 'casual', 'sport'],
    true,
    'Trips posted biweekly, Saturdays',
  ],
  [
    'Improv Collective',
    'ARTS',
    'Short-form games on Thursdays, a show at the end of every term. No experience, no auditions.',
    ['performance', 'creative', 'casual', 'weeknight'],
    true,
    'Thursdays 8pm, Arts Studio 1',
  ],
  [
    'Lakeshore Coding Society',
    'ACADEMIC',
    'Hack nights, interview prep, and a hosted project showcase in March.',
    ['making', 'technical', 'career', 'weeknight'],
    true,
    'Mondays 7pm, Science Building 3010',
  ],
  [
    'Badminton Club',
    'SPORTS',
    'Open courts twice a week plus a ladder for anyone who wants one.',
    ['sport', 'casual', 'weeknight'],
    false,
    'Mon/Thu 8pm, Athletic Centre Court 3',
  ],
  [
    'Film Society',
    'ARTS',
    'A screening a week, chosen by member vote, followed by arguing in the lobby.',
    ['creative', 'discussion', 'weeknight', 'social'],
    false,
    'Fridays 7pm, Lecture Hall A',
  ],
  [
    'Habitat Volunteers',
    'VOLUNTEER',
    'Monthly builds with the local chapter plus a spring fundraising drive.',
    ['volunteer', 'service', 'weekend', 'outdoors'],
    false,
    'One Saturday a month',
  ],
  [
    'Pre-Med Society',
    'PROFESSIONAL',
    'MCAT study groups, application workshops, and panels with students who got in.',
    ['academic', 'career', 'discussion'],
    false,
    'Biweekly Wednesdays, Health Sciences 240',
  ],
  [
    'Lakeshore Consulting Group',
    'PROFESSIONAL',
    'Pro-bono casework for campus organisations. Case prep every Sunday.',
    ['career', 'discussion', 'competitive'],
    true,
    'Sundays 2pm, Business 1220',
  ],
  [
    'Tabletop Guild',
    'GAMING',
    'Board games Fridays, three ongoing D&D tables, and a shelf that keeps growing.',
    ['casual', 'social', 'weeknight', 'small'],
    false,
    'Fridays 6pm, Student Centre Lounge',
  ],
  [
    'Esports Association',
    'GAMING',
    'Varsity rosters plus open play nights for everyone else.',
    ['competitive', 'social', 'weeknight'],
    false,
    'Open play Wednesdays, Gaming Lab',
  ],
  [
    'Interfaith Council',
    'RELIGIOUS',
    'Shared meals and conversation across traditions. Everyone welcome, including nobody in particular.',
    ['discussion', 'social', 'service'],
    false,
    'Alternate Tuesdays, Chapel Common Room',
  ],
  [
    'Lakeshore Choir',
    'ARTS',
    'Four-part repertoire, two concerts a year, no audition for the open ensemble.',
    ['performance', 'creative', 'weeknight', 'large'],
    true,
    'Tuesdays 7pm, Music Hall',
  ],
  [
    'International Students Association',
    'CULTURAL',
    'Orientation buddies, culture nights, and a very good potluck calendar.',
    ['social', 'large', 'service', 'weekend'],
    true,
    'Monthly culture nights',
  ],
];

const FIRST_NAMES = [
  'Maya',
  'Arjun',
  'Sofia',
  'Liam',
  'Priya',
  'Noah',
  'Chloe',
  'Omar',
  'Hana',
  'Ethan',
  'Zara',
  'Lucas',
  'Amara',
  'Felix',
  'Ingrid',
  'Tomas',
  'Yuki',
  'Daniel',
  'Nadia',
  'Isaac',
  'Leila',
  'Owen',
  'Mei',
  'Gabriel',
  'Farah',
  'Henrik',
  'Rosa',
  'Kwame',
  'Elena',
  'Jonas',
  'Aisha',
  'Marco',
  'Sana',
  'Theo',
  'Bianca',
  'Rahul',
  'Clara',
  'Diego',
  'Anika',
  'Simon',
  'Lucia',
  'Yusuf',
  'Ivy',
  'Mateo',
  'Nora',
  'Elias',
  'Tara',
  'Sebastian',
  'Jia',
  'Andre',
  'Fiona',
  'Kenji',
  'Camila',
  'Viktor',
  'Layla',
  'Anders',
  'Ruby',
  'Hassan',
  'Greta',
  'Milo',
];
const LAST_NAMES = [
  'Okafor',
  'Nakamura',
  'Silva',
  'Brennan',
  'Sharma',
  'Whitfield',
  'Dubois',
  'Haddad',
  'Kimura',
  'Vance',
  'Ahmadi',
  'Moreau',
  'Diallo',
  'Lindqvist',
  'Sorensen',
  'Novak',
  'Tanaka',
  'Freeman',
  'Petrov',
  'Grady',
  'Rahimi',
  'Callahan',
  'Zhou',
  'Ferreira',
  'Nasser',
  'Bergstrom',
  'Alvarez',
  'Mensah',
  'Papadakis',
  'Holm',
  'Osei',
  'Ricci',
  'Iqbal',
  'Weaver',
  'Costa',
  'Menon',
  'Novotny',
  'Reyes',
  'Bhatt',
  'Lindgren',
  'Marchetti',
  'Demir',
  'Fairbanks',
  'Ocampo',
  'Sullivan',
  'Kovac',
  'Sandhu',
  'Almeida',
  'Chen',
  'Barros',
  'Doyle',
  'Watanabe',
  'Rojas',
  'Marek',
  'Karim',
  'Eriksen',
  'Ashford',
  'Mahmoud',
  'Lindholm',
  'Fontaine',
];
const YEARS = ['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'GRAD'];
const PRONOUNS = ['she/her', 'he/him', 'they/them', null, null, null];

async function main() {
  console.log('\n  Seeding Lakeshore University…\n');
  if (!existsSync(UPLOADS)) mkdirSync(UPLOADS, { recursive: true });

  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.userBadge.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.moderationAction.deleteMany(),
    prisma.report.deleteMany(),
    prisma.mentorLink.deleteMany(),
    prisma.mentorProfile.deleteMany(),
    prisma.lostFoundItem.deleteMany(),
    prisma.marketplaceListing.deleteMany(),
    prisma.eventRSVP.deleteMany(),
    prisma.event.deleteMany(),
    prisma.wave.deleteMany(),
    prisma.buddyMatch.deleteMany(),
    prisma.buddyProfile.deleteMany(),
    prisma.studyGroupMember.deleteMany(),
    prisma.studyGroup.deleteMany(),
    prisma.qAVote.deleteMany(),
    prisma.qAPost.updateMany({ data: { acceptedAnswerId: null } }),
    prisma.qAAnswer.deleteMany(),
    prisma.qAPost.deleteMany(),
    prisma.resourceVote.deleteMany(),
    prisma.resource.deleteMany(),
    prisma.courseReview.deleteMany(),
    prisma.directMessage.deleteMany(),
    prisma.directMember.deleteMany(),
    prisma.directConversation.deleteMany(),
    prisma.channelRead.deleteMany(),
    prisma.pinnedMessage.deleteMany(),
    prisma.reaction.deleteMany(),
    prisma.message.deleteMany(),
    prisma.channel.deleteMany(),
    prisma.spaceMember.deleteMany(),
    prisma.space.deleteMany(),
    prisma.clubMembership.deleteMany(),
    prisma.club.deleteMany(),
    prisma.userCourse.deleteMany(),
    prisma.userInterest.deleteMany(),
    prisma.course.deleteMany(),
    prisma.interest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.major.deleteMany(),
  ]);

  // ── Majors, interests, courses ───────────────────────────────────────────
  const majors = await Promise.all(
    MAJORS.map(([name, faculty, description]) =>
      prisma.major.create({ data: { name, faculty, description } }),
    ),
  );
  const majorByName = new Map(majors.map((m) => [m.name, m]));

  const interests = await Promise.all(
    INTERESTS.map(([name, category]) => prisma.interest.create({ data: { name, category } })),
  );

  const courses = await Promise.all(
    COURSES.map(([code, title, majorName, level]) =>
      prisma.course.create({
        data: {
          code,
          title,
          level,
          majorId: majorByName.get(majorName)!.id,
          description: `${title}. Offered by ${majorName}. See the reviews tab before you register — the workload varies a lot by instructor.`,
        },
      }),
    ),
  );
  console.log(
    `  ${majors.length} majors · ${courses.length} courses · ${interests.length} interests`,
  );

  // ── Users ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@lakeshore.edu',
      username: 'admin',
      displayName: 'Campus Admin',
      passwordHash,
      isAdmin: true,
      year: 'GRAD',
      verifiedAt: new Date(),
      onboardedAt: new Date(),
      bio: 'Keeps the lights on. Message me about moderation or a broken space.',
      majorId: majorByName.get('Computer Science')!.id,
      settings: JSON.stringify({
        theme: 'dark',
        dmPrivacy: 'EVERYONE',
        discoverable: true,
        showCourses: true,
        showRealName: true,
      }),
      karma: 0,
    },
  });

  const users = [admin];
  const usedUsernames = new Set(['admin']);

  for (let i = 0; i < 60; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    let username = `${first}${last}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (usedUsernames.has(username)) username = `${username}${i}`;
    usedUsernames.add(username);

    const major = pick(majors);
    const user = await prisma.user.create({
      data: {
        email: `${username}@lakeshore.edu`,
        username,
        displayName: `${first} ${last}`,
        passwordHash,
        year: pick(YEARS),
        majorId: major.id,
        pronouns: pick(PRONOUNS),
        bio: chance(0.6)
          ? pick([
              'Usually in the library basement. Say hi.',
              'Third year, still not sure. Open to suggestions.',
              'Will trade lecture notes for coffee.',
              'Trying to talk to more people this term. This counts.',
              'Ask me about co-op applications, I have opinions.',
              'Here for the study groups, staying for the potlucks.',
            ])
          : null,
        karma: int(0, 60),
        verifiedAt: new Date(),
        onboardedAt: new Date(),
        lastSeenAt: hoursAgo(int(0, 72)),
        settings: JSON.stringify({
          theme: 'dark',
          dmPrivacy: pick(['EVERYONE', 'EVERYONE', 'SHARED_SPACE_ONLY']),
          discoverable: chance(0.85),
          showCourses: true,
          showRealName: true,
        }),
      },
    });
    users.push(user);

    await prisma.userInterest.createMany({
      data: pickN(interests, int(3, 6)).map((it) => ({ userId: user.id, interestId: it.id })),
    });

    const majorCourses = courses.filter((c) => c.majorId === major.id);
    const enrolled = pickN(majorCourses.length >= 3 ? majorCourses : courses, int(3, 5));
    for (const course of enrolled) {
      await prisma.userCourse.create({
        data: { userId: user.id, courseId: course.id, term: TERM, status: 'TAKING' },
      });
    }
    // A believable history, so term-over-term persistence is visible on day one.
    for (const course of pickN(courses, 2)) {
      await prisma.userCourse.upsert({
        where: { userId_courseId_term: { userId: user.id, courseId: course.id, term: LAST_TERM } },
        create: { userId: user.id, courseId: course.id, term: LAST_TERM, status: 'COMPLETED' },
        update: {},
      });
    }
  }
  const students = users.filter((u) => !u.isAdmin);
  console.log(`  ${users.length} users (1 admin)`);

  // ── Spaces ───────────────────────────────────────────────────────────────
  const MAJOR_CHANNELS: [string, string][] = [
    ['general', 'TEXT'],
    ['course-help', 'TEXT'],
    ['internships-careers', 'TEXT'],
    ['memes', 'TEXT'],
    ['anonymous', 'ANONYMOUS'],
    ['resources', 'RESOURCES'],
  ];

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const majorSpaces = [];
  for (const major of majors) {
    const members = students.filter((u) => u.majorId === major.id);
    const space = await prisma.space.create({
      data: {
        name: major.name,
        slug: slugify(major.name),
        description: major.description,
        type: 'MAJOR',
        visibility: 'PUBLIC',
        ownerId: admin.id,
        linkedMajorId: major.id,
        channels: {
          create: MAJOR_CHANNELS.map(([name, type], i) => ({
            name,
            type,
            position: i,
            isDefault: i === 0,
            topic: name === 'anonymous' ? 'No names here. Same rules otherwise.' : null,
          })),
        },
        members: {
          create: [
            { userId: admin.id, role: 'ADMIN' },
            ...members.map((m) => ({ userId: m.id, role: 'MEMBER' })),
          ],
        },
      },
      include: { channels: true },
    });
    majorSpaces.push({ space, members });
  }
  console.log(`  ${majorSpaces.length} major spaces`);

  // Course spaces for the 10 most-enrolled courses.
  const enrolCounts = await prisma.userCourse.groupBy({
    by: ['courseId'],
    where: { term: TERM },
    _count: { _all: true },
    orderBy: { _count: { courseId: 'desc' } },
    take: 10,
  });

  const courseSpaces = [];
  for (const row of enrolCounts) {
    const course = courses.find((c) => c.id === row.courseId)!;
    const enrolled = await prisma.userCourse.findMany({
      where: { courseId: course.id, term: TERM },
      select: { userId: true },
    });
    const space = await prisma.space.create({
      data: {
        name: `${course.code} — ${course.title}`,
        slug: slugify(`${course.code}-${TERM}`),
        description: `Everyone taking ${course.code} in ${TERM}.`,
        type: 'COURSE',
        visibility: 'PUBLIC',
        ownerId: admin.id,
        linkedCourseId: course.id,
        channels: {
          create: [
            { name: 'general', type: 'TEXT', position: 0, isDefault: true },
            {
              name: 'assignments',
              type: 'TEXT',
              position: 1,
              topic: 'Deadlines and clarifications. No solutions.',
            },
            { name: 'resources', type: 'RESOURCES', position: 2 },
            {
              name: 'study-hall',
              type: 'VOICE_STUB',
              position: 3,
              topic: 'Silent co-working. Camera off, mic off.',
            },
          ],
        },
        members: {
          create: [
            { userId: admin.id, role: 'ADMIN' },
            ...enrolled.map((e) => ({ userId: e.userId, role: 'MEMBER' })),
          ],
        },
      },
      include: { channels: true },
    });
    courseSpaces.push({ space, course, memberIds: enrolled.map((e) => e.userId) });
  }
  console.log(`  ${courseSpaces.length} course spaces`);

  // ── Clubs + their spaces ─────────────────────────────────────────────────
  const clubs = [];
  for (const [name, category, description, tags, isRecruiting, meetingInfo] of CLUBS) {
    const members = pickN(students, int(8, 26));
    const club = await prisma.club.create({
      data: {
        name,
        slug: slugify(name),
        description,
        category,
        meetingInfo,
        isRecruiting,
        tags: JSON.stringify(tags),
        memberCountEstimate: members.length,
        socialLinks: JSON.stringify({ instagram: `@lakeshore${slugify(name).replace(/-/g, '')}` }),
        memberships: {
          create: members.map((m, i) => ({
            userId: m.id,
            role: i === 0 ? 'PRESIDENT' : i < 3 ? 'EXEC' : chance(0.15) ? 'FOLLOWER' : 'MEMBER',
          })),
        },
      },
    });

    const space = await prisma.space.create({
      data: {
        name,
        slug: `club-${slugify(name)}`,
        description,
        type: 'CLUB',
        visibility: 'PUBLIC',
        ownerId: members[0]!.id,
        linkedClubId: club.id,
        channels: {
          create: [
            {
              name: 'announcements',
              type: 'ANNOUNCEMENT',
              position: 0,
              topic: 'Execs post here. React freely.',
            },
            { name: 'general', type: 'TEXT', position: 1, isDefault: true },
            { name: 'planning', type: 'TEXT', position: 2 },
          ],
        },
        members: {
          create: members.map((m, i) => ({
            userId: m.id,
            role: i === 0 ? 'OWNER' : i < 3 ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: { channels: true },
    });
    clubs.push({ club, space, members });
  }
  console.log(`  ${clubs.length} clubs with spaces`);

  // ── Chat history ─────────────────────────────────────────────────────────
  const GENERAL_LINES = [
    'does anyone know if the library basement is open past midnight during exams',
    'reminder that the shuttle schedule changed this week, it is now every 20 min',
    'is it just me or was that midterm average going to be brutal',
    'found a great study spot on the 4th floor of the science building, almost nobody up there',
    'anyone want to split a textbook? I only need it for the first half of the term',
    'the coffee place in the student centre now does a punch card, ten gets you one free',
    'if anyone is looking for a gym partner in the mornings I go around 7',
    'genuinely how does everyone have time for clubs AND readings',
    'posting this here because I keep forgetting: add/drop deadline is the 21st',
    'shoutout to whoever left the good whiteboard markers in room 2050',
    'has anyone taken a course with prof Almeida? trying to decide between sections',
    'the printers on the second floor are down again',
    'anyone else find the lecture recordings are a term behind on the portal',
    'first years — the free tutoring in the learning commons is genuinely good, use it',
    'anyone going to the thing on Thursday? I do not want to show up alone',
  ];
  const REPLIES = [
    'yes! open 24h during exam period',
    'can confirm, checked yesterday',
    'this is the most useful thing posted here all term',
    'seconding this',
    'oh good, I thought it was just me',
    'I will be there, come find me',
    'thank you, I was about to ask the same thing',
    'saving this',
    'wait really? that changes my whole week',
  ];
  const EMOJI = ['👍', '😂', '🙏', '💀', '🔥', '👀', '❤️', '🎯'];

  let messageCount = 0;
  async function seedChannel(
    channelId: string,
    memberIds: string[],
    count: number,
    opts: { anonymous?: boolean; announcement?: boolean; ownerId?: string } = {},
  ) {
    if (!memberIds.length) return [];
    const created = [];
    for (let i = 0; i < count; i++) {
      const authorId = opts.announcement ? (opts.ownerId ?? memberIds[0]!) : pick(memberIds);
      const content = opts.announcement
        ? pick([
            'Meeting moved to next Wednesday, same room. Sorry for the short notice.',
            'Sign-ups for this term close Friday — link is pinned.',
            'We have room for 4 more on the trip. First come, first served.',
            'Exec applications are open. You do not need experience, you need to show up.',
          ])
        : opts.anonymous
          ? pick([
              'does anyone else feel like they are the only one struggling in this program',
              'genuinely considering switching majors and I have told nobody',
              'I got my worst grade ever this term and I am trying not to spiral',
              'is it normal to have made zero friends by second year',
              'my parents think I am doing great and I do not know how to tell them otherwise',
              'to whoever posted about struggling — you are very much not the only one',
              'came here to say the responses on this channel got me through last week',
            ])
          : pick(GENERAL_LINES);

      const message = await prisma.message.create({
        data: {
          channelId,
          authorId,
          content,
          isAnonymous: Boolean(opts.anonymous),
          createdAt: hoursAgo(count - i + int(0, 3)),
        },
      });
      created.push(message);
      messageCount++;

      if (chance(0.35)) {
        for (const reactor of pickN(memberIds, int(1, 4))) {
          await prisma.reaction
            .create({ data: { messageId: message.id, userId: reactor, emoji: pick(EMOJI) } })
            .catch(() => undefined);
        }
      }
    }
    return created;
  }

  for (const { space, members } of majorSpaces) {
    const memberIds = members.map((m) => m.id);
    if (!memberIds.length) continue;
    for (const channel of space.channels) {
      if (channel.type === 'VOICE_STUB' || channel.type === 'RESOURCES') continue;
      const msgs = await seedChannel(channel.id, memberIds, channel.name === 'general' ? 14 : 6, {
        anonymous: channel.type === 'ANONYMOUS',
      });

      // One threaded exchange and one pin per major #general, so both features are
      // visible without hunting for them.
      if (channel.name === 'general' && msgs.length > 3) {
        const root = msgs[msgs.length - 3]!;
        for (let i = 0; i < 3; i++) {
          await prisma.message.create({
            data: {
              channelId: channel.id,
              authorId: pick(memberIds),
              content: pick(REPLIES),
              threadRootId: root.id,
              createdAt: new Date(root.createdAt.getTime() + (i + 1) * 600_000),
            },
          });
          messageCount++;
        }
        await prisma.pinnedMessage.create({
          data: { channelId: channel.id, messageId: msgs[0]!.id, pinnedById: admin.id },
        });
      }
    }
  }

  for (const { space, memberIds } of courseSpaces) {
    for (const channel of space.channels) {
      if (channel.type === 'VOICE_STUB' || channel.type === 'RESOURCES') continue;
      await seedChannel(channel.id, memberIds, int(8, 16));
    }
  }

  for (const { space, members } of clubs) {
    const memberIds = members.map((m) => m.id);
    for (const channel of space.channels) {
      if (channel.type === 'ANNOUNCEMENT') {
        await seedChannel(channel.id, memberIds, 3, {
          announcement: true,
          ownerId: members[0]!.id,
        });
      } else {
        await seedChannel(channel.id, memberIds, int(10, 20));
      }
    }
  }
  console.log(`  ${messageCount} messages with reactions, threads and pins`);

  // ── Reviews ──────────────────────────────────────────────────────────────
  const PROFS = [
    'Dr. Almeida',
    'Dr. Kaur',
    'Prof. Whitfield',
    'Dr. Osei',
    'Prof. Lindqvist',
    'Dr. Tanaka',
    'Dr. Moreau',
  ];
  const TIPS = [
    'Start the assignments the day they are posted. They look small and they are not. The midterm is fair if you did the problem sets by hand rather than reading solutions.',
    'Go to office hours in the first three weeks while they are empty. By midterms there is a queue out the door and you will not get a real conversation.',
    'The textbook is genuinely optional but the practice problems at the end of each chapter are the closest thing to the exam you will find.',
    'Lectures are recorded, tutorials are not, and the tutorials are where the exam material actually gets explained. Go to the tutorials.',
    'Heavy workload but it is evenly spread — no single week destroyed me. Do not take this alongside two other project courses.',
    'The group project is 30% and your group is assigned. Set expectations in week one and put everything in writing.',
    'Best course I have taken here. Demanding, but the feedback on assignments is detailed enough that you actually improve.',
  ];

  // §6 asks for 30 reviews. Sampling 30 courses out of 40 left whichever courses missed
  // out with dead gauges and an empty Reviews tab — including CS 2210, the code this
  // spec uses as its own example. Every course gets at least one instead; courses with
  // their own space get more, since those are the ones a demo actually opens.
  let reviewCount = 0;
  for (const course of courses) {
    const hasSpace = courseSpaces.some((cs) => cs.course.id === course.id);
    for (const author of pickN(students, hasSpace ? int(3, 5) : int(1, 2))) {
      const term = chance(0.5) ? TERM : LAST_TERM;
      await prisma.courseReview
        .create({
          data: {
            courseId: course.id,
            authorId: author.id,
            term,
            profName: pick(PROFS),
            difficulty: int(2, 5),
            workload: int(2, 5),
            rating: int(2, 5),
            tips: pick(TIPS),
            wouldRecommend: chance(0.7),
            showName: chance(0.3),
            helpfulCount: int(0, 24),
            createdAt: hoursAgo(int(24, 24 * 200)),
          },
        })
        .then(() => reviewCount++)
        .catch(() => undefined);
    }
  }

  for (const course of courses) {
    const agg = await prisma.courseReview.aggregate({
      where: { courseId: course.id },
      _avg: { difficulty: true, workload: true, rating: true },
    });
    if (agg._avg.rating !== null) {
      await prisma.course.update({
        where: { id: course.id },
        data: {
          avgDifficulty: agg._avg.difficulty,
          avgWorkload: agg._avg.workload,
          avgRating: agg._avg.rating,
        },
      });
    }
  }
  console.log(`  ${reviewCount} course reviews`);

  // ── Resources ────────────────────────────────────────────────────────────
  const RESOURCE_TYPES = ['NOTES', 'PRACTICE_EXAM', 'CHEAT_SHEET', 'GUIDE', 'LINK'];
  let resourceCount = 0;
  for (let i = 0; i < 25; i++) {
    const course = pick(courses);
    const uploader = pick(students);
    const type = pick(RESOURCE_TYPES);
    const term = chance(0.6) ? TERM : LAST_TERM;
    const title = `${course.code} ${
      {
        NOTES: 'lecture notes',
        PRACTICE_EXAM: 'practice midterm',
        CHEAT_SHEET: 'formula sheet',
        GUIDE: 'survival guide',
        LINK: 'reference playlist',
      }[type]
    } (${term})`;

    let fileUrl: string | null = null;
    let linkUrl: string | null = null;
    if (type === 'LINK') {
      linkUrl = 'https://example.edu/lakeshore/open-courseware';
    } else {
      const filename = `seed-${slugify(course.code)}-${i}.pdf`;
      writeFileSync(join(UPLOADS, filename), placeholderPdf(title));
      fileUrl = `/uploads/${filename}`;
    }

    const resource = await prisma.resource.create({
      data: {
        courseId: course.id,
        uploaderId: uploader.id,
        title,
        type,
        term,
        fileUrl,
        linkUrl,
        description: 'Cleaned up and re-uploaded. Corrections welcome.',
        downloadCount: int(0, 90),
        createdAt: hoursAgo(int(24, 24 * 120)),
      },
    });
    resourceCount++;

    const voters = pickN(students, int(2, 14));
    let score = 0;
    for (const voter of voters) {
      const value = chance(0.85) ? 1 : -1;
      await prisma.resourceVote
        .create({ data: { resourceId: resource.id, userId: voter.id, value } })
        .then(() => {
          score += value;
        })
        .catch(() => undefined);
    }
    await prisma.resource.update({ where: { id: resource.id }, data: { score } });
  }
  console.log(`  ${resourceCount} resources (placeholder PDFs written to uploads/)`);

  // ── Q&A ──────────────────────────────────────────────────────────────────
  const QUESTIONS: [string, string][] = [
    [
      'Is the final cumulative or only post-midterm?',
      'The syllabus says "comprehensive" but the practice final only covers weeks 7-12. Has anyone taken this recently and can confirm?',
    ],
    [
      'How much C do you actually need going in?',
      'I have only done Java. Trying to work out how much catching up to do before week one.',
    ],
    [
      'Are the tutorials worth attending if lectures are recorded?',
      'They are at 8:30am and I want an honest answer before I commit.',
    ],
    [
      'Best order to take the 3000-level courses?',
      'Planning next year and the prerequisites allow a few orderings. Any that made your life easier?',
    ],
    [
      'Does the group project let you pick your group?',
      'Asking because last term I got assigned and it went badly.',
    ],
    [
      'What calculator is allowed on the exam?',
      'The syllabus just says "non-programmable" which covers a lot of ground.',
    ],
    ['Is there a curve?', 'Nobody will give me a straight answer about this.'],
    [
      'How strict is the late policy?',
      'Weighing whether to submit something rough on time or good two days late.',
    ],
    [
      'Recommended textbook edition?',
      'The 6th is a third of the price of the 8th. Are the problem sets renumbered?',
    ],
    ['Anyone have the lab manual from last year?', 'Bookstore is out of stock until week three.'],
    ['Is attendance actually taken?', 'Not planning to skip, just planning my commute.'],
    [
      'How long are the weekly assignments really?',
      'The estimate says 4 hours. I would like to hear from someone who has done them.',
    ],
  ];
  const ANSWERS = [
    'Cumulative in name, but weighted heavily toward the second half. I would still review the early material for two evenings.',
    'You will be fine. The first two weeks are a syntax refresher and the TAs assume nobody has done it before.',
    'Go. The tutorials are where they work through the problem types that show up on the exams.',
    'Take the theory one first — the applied course assumes it and does not re-teach anything.',
    'You pick your own, but you have to register the group by week two or you get assigned.',
    'Any basic scientific calculator is fine. They check for graphing capability, not much else.',
  ];

  let qaCount = 0;
  for (const [title, body] of QUESTIONS) {
    const course = pick(courses);
    const asker = pick(students);
    const post = await prisma.qAPost.create({
      data: {
        courseId: course.id,
        authorId: asker.id,
        title,
        body,
        score: int(0, 12),
        createdAt: hoursAgo(int(2, 24 * 60)),
      },
    });
    qaCount++;

    const answers = [];
    for (let i = 0; i < int(1, 3); i++) {
      answers.push(
        await prisma.qAAnswer.create({
          data: {
            postId: post.id,
            authorId: pick(students).id,
            body: pick(ANSWERS),
            score: int(0, 15),
            createdAt: hoursAgo(int(1, 40)),
          },
        }),
      );
    }
    if (chance(0.6) && answers.length) {
      await prisma.qAPost.update({
        where: { id: post.id },
        data: { acceptedAnswerId: pick(answers).id },
      });
    }
  }
  console.log(`  ${qaCount} Q&A threads`);

  // ── Study groups + buddy profiles ────────────────────────────────────────
  const randomAvailability = () => Array.from({ length: 35 }, () => chance(0.25));

  let groupCount = 0;
  for (let i = 0; i < 8; i++) {
    const course = pick(courses);
    const owner = pick(students);
    const maxSize = int(4, 6);
    const shouldFill = i < 2; // §6 asks for 2 full groups
    const memberPool = pickN(
      students.filter((s) => s.id !== owner.id),
      shouldFill ? maxSize - 1 : int(1, Math.max(1, maxSize - 3)),
    );

    await prisma.studyGroup
      .create({
        data: {
          courseId: course.id,
          ownerId: owner.id,
          maxSize,
          name: `${course.code} ${pick(['problem sets', 'midterm prep', 'weekly review', 'lab partners'])}`,
          description: pick([
            'Meeting in the library, working through the problem set together. Cameras optional if we go online.',
            'Two hours, no phones, then we compare answers. Bring your own attempt.',
            'Casual — we mostly keep each other honest about starting early.',
          ]),
          meetingType: pick(['IN_PERSON', 'ONLINE', 'HYBRID']),
          schedule: JSON.stringify(randomAvailability()),
          locationHint: pick([
            'Weldon 4th floor',
            'Science Building study rooms',
            'Discord / online',
            'Student Centre tables',
          ]),
          status: shouldFill ? 'FULL' : 'OPEN',
          members: {
            create: [
              { userId: owner.id, status: 'MEMBER' },
              ...memberPool.map((m) => ({ userId: m.id, status: 'MEMBER' })),
              ...(shouldFill
                ? []
                : pickN(students, 1).map((m) => ({ userId: m.id, status: 'REQUESTED' }))),
            ],
          },
        },
      })
      .then(() => groupCount++)
      .catch(() => undefined);
  }

  const LOOKING_FOR = [
    'STUDY_PARTNER',
    'FRIENDS',
    'CLUB_BUDDY',
    'GYM_PARTNER',
    'LANGUAGE_EXCHANGE',
  ];
  for (const student of pickN(students, 34)) {
    await prisma.buddyProfile
      .create({
        data: {
          userId: student.id,
          isActive: true,
          lookingFor: JSON.stringify(pickN(LOOKING_FOR, int(1, 3))),
          availability: JSON.stringify(randomAvailability()),
          note: chance(0.5)
            ? pick([
                'Prefer working in silence and then comparing notes after.',
                'Happy to meet in person or online, whichever is easier.',
                'Looking for someone to keep me accountable about starting things early.',
              ])
            : null,
        },
      })
      .catch(() => undefined);
  }
  console.log(`  ${groupCount} study groups · 34 buddy profiles`);

  // ── Events ───────────────────────────────────────────────────────────────
  const EVENTS: [string, string, number, number, string, string[]][] = [
    // The first two are anchored to today and tomorrow so the home page's week strip has
    // something in it no matter which weekday the seed is run on.
    [
      'Coffee House Open Mic',
      'Sign up at the door. Five minutes each, any format.',
      0,
      19,
      'Student Centre Lounge',
      ['social', 'creative'],
    ],
    [
      'Drop-in Peer Tutoring',
      'First and second year courses. No appointment, just turn up.',
      1,
      14,
      'Learning Commons',
      ['academic', 'study'],
    ],
    [
      'Robotics Build Night',
      'Open shop. Bring a project or help with the competition bot.',
      1,
      19,
      'Engineering Annex B12',
      ['workshop', 'Computer Science'],
    ],
    [
      'Intro to Bouldering',
      'Free session for anyone who has never climbed. Shoes provided.',
      2,
      17,
      'Athletic Centre Wall',
      ['sport', 'beginner'],
    ],
    [
      'Improv Jam',
      'Short-form games. Watch or play, no pressure either way.',
      2,
      20,
      'Arts Studio 1',
      ['performance', 'social'],
    ],
    [
      'Co-op Application Workshop',
      'Resume review and a walkthrough of the portal. Bring a draft.',
      3,
      16,
      'Career Centre',
      ['career', 'Computer Science'],
    ],
    [
      'Trivia Night',
      'Teams of four, prizes are bragging rights and a pizza.',
      4,
      19,
      'Student Centre Lounge',
      ['social', 'casual'],
    ],
    [
      'Midterm Study Hall',
      'Quiet room, free coffee, snacks at 9pm. Runs until midnight.',
      5,
      18,
      'Weldon Library 4th Floor',
      ['academic', 'study'],
    ],
    [
      'Culture Night: Food Fair',
      'Dishes from twelve countries, cooked by the people who grew up eating them.',
      6,
      17,
      'Great Hall',
      ['cultural', 'social'],
    ],
    [
      'Habitat Build Day',
      'Transportation leaves at 8am sharp. Wear closed shoes.',
      8,
      8,
      'Meet at Main Gate',
      ['volunteer', 'service'],
    ],
    [
      'Choir Open Rehearsal',
      'Sit in on a rehearsal before deciding whether to join.',
      9,
      19,
      'Music Hall',
      ['performance', 'creative'],
    ],
    [
      'Grad School Panel',
      'Five students who applied last year on what they wish they had known.',
      11,
      16,
      'Social Science 2050',
      ['career', 'academic'],
    ],
    [
      'Film Society: Members Pick',
      'This month the vote went to a 1970s thriller. Discussion after.',
      12,
      19,
      'Lecture Hall A',
      ['creative', 'social'],
    ],
    [
      'Badminton Ladder Round 3',
      'Open to all skill levels, matches assigned on arrival.',
      14,
      20,
      'Athletic Centre Court 3',
      ['sport', 'competitive'],
    ],
    [
      'Startup Pitch Practice',
      'Five minutes each, honest feedback from a room of strangers.',
      16,
      18,
      'Business 1220',
      ['career', 'startups'],
    ],
    [
      'End of Term Potluck',
      'Bring something. Anything. We are not picky.',
      19,
      18,
      'International Centre',
      ['social', 'cultural'],
    ],
  ];

  let eventCount = 0;
  for (const [index, [title, description, dayOffset, hour, location, tags]] of EVENTS.entries()) {
    // Every third event is campus-wide. Without these, a student whose clubs happen not
    // to be hosting sees an empty week on the home page — which is the one screen that
    // has to look alive on a fresh seed.
    const isCampusWide = index % 3 === 0;
    const host = pick(clubs);
    const event = await prisma.event.create({
      data: {
        title,
        description,
        location,
        hostType: isCampusWide ? 'CAMPUS' : 'CLUB',
        hostId: isCampusWide ? 'campus' : host.club.id,
        startsAt: daysOut(dayOffset, hour),
        endsAt: daysOut(dayOffset, hour + 2),
        capacity: chance(0.4) ? int(20, 80) : null,
        tags: JSON.stringify(tags),
        locationDetail: chance(0.5) ? 'Look for the sign on the door.' : null,
      },
    });
    eventCount++;

    for (const attendee of pickN(students, int(4, 22))) {
      await prisma.eventRSVP
        .create({
          data: {
            eventId: event.id,
            userId: attendee.id,
            status: chance(0.7) ? 'GOING' : 'INTERESTED',
          },
        })
        .catch(() => undefined);
    }
  }
  console.log(`  ${eventCount} events with RSVPs`);

  // ── Marketplace, lost & found, mentors ───────────────────────────────────
  const LISTINGS: [string, string, number, string][] = [
    [
      'Calculus textbook, 8th edition',
      'Some highlighting in the first four chapters, spine intact.',
      4500,
      'TEXTBOOK',
    ],
    ['Organic Chemistry model kit', 'Used one term. All pieces accounted for.', 2000, 'TEXTBOOK'],
    ['Desk lamp, adjustable arm', 'Works fine, I am just moving out.', 1200, 'FURNITURE'],
    ['Mini fridge', 'Residence-legal size. Clean, works, heavy.', 6000, 'FURNITURE'],
    ['Mechanical keyboard', 'Brown switches. Typed two theses on it.', 5500, 'ELECTRONICS'],
    ['Second monitor, 24 inch', 'HDMI only, no stand — VESA mount works.', 7000, 'ELECTRONICS'],
    ['Concert ticket, Friday', 'Cannot go anymore, selling at face value.', 3500, 'TICKETS'],
    ['Linear Algebra textbook', 'The edition the course actually uses.', 3800, 'TEXTBOOK'],
    ['Bike, needs a tune-up', 'Rides fine, brakes could be better. Lock included.', 8000, 'OTHER'],
    [
      'Lab coat, size M',
      'Worn twice. Chemistry requires them and I switched programs.',
      1500,
      'OTHER',
    ],
  ];
  for (const [title, description, priceCents, category] of LISTINGS) {
    await prisma.marketplaceListing.create({
      data: {
        title,
        description,
        priceCents,
        category,
        sellerId: pick(students).id,
        courseId: category === 'TEXTBOOK' ? pick(courses).id : null,
        status: chance(0.15) ? 'SOLD' : 'ACTIVE',
        createdAt: hoursAgo(int(1, 24 * 20)),
      },
    });
  }

  const LOST_FOUND: [string, string, string, string][] = [
    [
      'LOST',
      'Blue water bottle with stickers',
      'Left it in a lecture hall Tuesday afternoon. Sentimental stickers.',
      'Social Science Building',
    ],
    [
      'FOUND',
      'Set of keys with a red lanyard',
      'Found on a table in the library. Handed in to the front desk.',
      'Weldon Library',
    ],
    [
      'LOST',
      'Prescription glasses, tortoiseshell',
      'Somewhere between the gym and the bus loop. I am extremely blind without them.',
      'Athletic Centre',
    ],
    [
      'FOUND',
      'Student card — initials A.M.',
      'Found near the coffee kiosk. Message me and describe the photo.',
      'Student Centre',
    ],
  ];
  for (const [kind, title, description, location] of LOST_FOUND) {
    await prisma.lostFoundItem.create({
      data: { kind, title, description, location, reporterId: pick(students).id },
    });
  }

  const MENTOR_TOPICS = [
    ['first-year survival', 'course selection'],
    ['co-op applications', 'interview prep'],
    ['research', 'grad school applications'],
    ['switching majors', 'academic probation'],
    ['balancing clubs and coursework'],
    ['international student life', 'finding housing'],
  ];
  const upperYears = students.filter((s) => ['JUNIOR', 'SENIOR', 'GRAD'].includes(s.year ?? ''));
  const mentors = pickN(upperYears, 6);
  for (let i = 0; i < mentors.length; i++) {
    await prisma.mentorProfile.create({
      data: {
        userId: mentors[i]!.id,
        capacity: int(2, 4),
        topics: JSON.stringify(MENTOR_TOPICS[i % MENTOR_TOPICS.length]),
        blurb: pick([
          'I had a rough first year and figured most of this out the hard way. Happy to save you some of that.',
          'Ask me anything about applications. I will be honest about what worked and what did not.',
          'Mostly here to tell you that the thing you are worried about is more common than you think.',
        ]),
      },
    });
  }
  const lowerYears = students.filter((s) => ['FRESHMAN', 'SOPHOMORE'].includes(s.year ?? ''));
  for (let i = 0; i < 3; i++) {
    await prisma.mentorLink
      .create({
        data: { mentorId: mentors[i]!.id, menteeId: pick(lowerYears).id, status: 'ACTIVE' },
      })
      .catch(() => undefined);
  }
  console.log(
    `  ${LISTINGS.length} listings · ${LOST_FOUND.length} lost & found · ${mentors.length} mentors`,
  );

  // ── Badges ───────────────────────────────────────────────────────────────
  const BADGES = [
    ['first-post', 'First Post', '🌱', 'Said the first thing.'],
    ['helpful-hand', 'Helpful Hand', '🤝', '10 upvotes on your resources.'],
    ['scholar', 'Scholar', '📚', 'Reviewed 5 courses.'],
    ['connector', 'Connector', '🔗', 'Connected with 5 buddies.'],
    ['club-hopper', 'Club Hopper', '🎪', 'Joined 3 clubs.'],
    ['early-bird', 'Early Bird', '🐦', "RSVP'd to 5 events."],
    ['founder', 'Founder', '🏛️', 'Started a study group that filled.'],
  ];
  const badges = await Promise.all(
    BADGES.map(([key, name, emoji, description]) =>
      prisma.badge.create({
        data: { key: key!, name: name!, emoji: emoji!, description: description! },
      }),
    ),
  );
  const badgeByKey = new Map(badges.map((b) => [b.key, b]));

  // Award from real data rather than at random, so a profile's badges match its activity.
  for (const student of students) {
    const earned: string[] = [];
    const [posts, upvotes, reviews, clubCount, rsvps, filled] = await Promise.all([
      prisma.message.count({ where: { authorId: student.id } }),
      prisma.resourceVote.count({ where: { value: 1, resource: { uploaderId: student.id } } }),
      prisma.courseReview.count({ where: { authorId: student.id } }),
      prisma.clubMembership.count({ where: { userId: student.id, role: { not: 'FOLLOWER' } } }),
      prisma.eventRSVP.count({ where: { userId: student.id, status: 'GOING' } }),
      prisma.studyGroup.count({ where: { ownerId: student.id, status: 'FULL' } }),
    ]);
    if (posts >= 1) earned.push('first-post');
    if (upvotes >= 10) earned.push('helpful-hand');
    if (reviews >= 5) earned.push('scholar');
    if (clubCount >= 3) earned.push('club-hopper');
    if (rsvps >= 5) earned.push('early-bird');
    if (filled >= 1) earned.push('founder');

    for (const key of earned) {
      await prisma.userBadge
        .create({ data: { userId: student.id, badgeId: badgeByKey.get(key)!.id } })
        .catch(() => undefined);
    }
  }

  // ── A few waves and notifications so the bell isn't empty ────────────────
  for (let i = 0; i < 12; i++) {
    const [from, to] = pickN(students, 2);
    if (!from || !to) continue;
    await prisma.wave
      .create({ data: { fromId: from.id, toId: to.id, context: pick(courses).code } })
      .catch(() => undefined);
  }

  const badgeCount = await prisma.userBadge.count();
  console.log(`  ${badges.length} badge definitions · ${badgeCount} awarded`);

  // Rebuild search last, once every row exists.
  await rebuildFts(prisma);
  console.log('  Search index built');

  // ── Done ─────────────────────────────────────────────────────────────────
  const sample = students.slice(0, 3);
  console.log('\n  ┌─ Demo credentials ──────────────────────────────────────');
  console.log('  │');
  console.log(`  │  Admin      ${'admin@lakeshore.edu'.padEnd(30)}password123`);
  for (const s of sample) {
    console.log(`  │  Student    ${s.email.padEnd(30)}password123`);
  }
  console.log(`  │`);
  console.log(`  │  Every seeded account uses the password: password123`);
  console.log(`  │  Current term: ${TERM}`);
  console.log('  └─────────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
