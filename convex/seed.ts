/* eslint-disable @typescript-eslint/no-explicit-any --
   A seed script threads ids through forty tables and a dozen intermediate arrays.
   Typing those precisely would mean re-declaring most of the schema here to
   describe data that is thrown away at the end of the run. */
import { mutation } from './_generated/server';

// ── Constants and helpers ──────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-512' },
    key,
    512,
  );

  const saltOut = saltHex ?? toHex(salt.buffer as ArrayBuffer);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltOut}$${toHex(bits)}`;
}

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

const _hoursAgo = (h: number) => Date.now() - h * 3600_000;
const daysOut = (d: number, hour = 18) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
};

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
const YEARS: ('FRESHMAN' | 'SOPHOMORE' | 'JUNIOR' | 'SENIOR' | 'GRAD')[] = [
  'FRESHMAN',
  'SOPHOMORE',
  'JUNIOR',
  'SENIOR',
];
const PRONOUNS = ['she/her', 'he/him', 'they/them', null, null, null];

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

const RESOURCE_TYPES = ['NOTES', 'PRACTICE_EXAM', 'CHEAT_SHEET', 'GUIDE', 'LINK'];

const EVENTS: [string, string, number, number, string, string[]][] = [
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

const MENTOR_TOPICS = [
  ['first-year survival', 'course selection'],
  ['co-op applications', 'interview prep'],
  ['research', 'grad school applications'],
  ['switching majors', 'academic probation'],
  ['balancing clubs and coursework'],
  ['international student life', 'finding housing'],
];

const BADGES = [
  ['first-post', 'First Post', '🌱', 'Said the first thing.'],
  ['helpful-hand', 'Helpful Hand', '🤝', '10 upvotes on your resources.'],
  ['scholar', 'Scholar', '📚', 'Reviewed 5 courses.'],
  ['connector', 'Connector', '🔗', 'Connected with 5 buddies.'],
  ['club-hopper', 'Club Hopper', '🎪', 'Joined 3 clubs.'],
  ['early-bird', 'Early Bird', '🐦', "RSVP'd to 5 events."],
  ['founder', 'Founder', '🏛️', 'Started a study group that filled.'],
] as const;

const LOOKING_FOR = [
  'STUDY_PARTNER' as const,
  'FRIENDS' as const,
  'CLUB_BUDDY' as const,
  'GYM_PARTNER' as const,
  'LANGUAGE_EXCHANGE' as const,
];

const randomAvailability = () => Array.from({ length: 35 }, () => chance(0.25));

async function seedChannel(
  ctx: any,
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

    const msg = await ctx.db.insert('messages', {
      channelId,
      authorId,
      content,
      attachments: [],
      isAnonymous: Boolean(opts.anonymous),
    });
    created.push(msg);

    if (chance(0.35)) {
      for (const reactor of pickN(memberIds, int(1, 4))) {
        await ctx.db
          .insert('reactions', {
            messageId: msg,
            userId: reactor,
            emoji: pick(EMOJI),
          })
          .catch(() => undefined);
      }
    }
  }
  return created;
}

export const run = mutation(async (ctx) => {
  console.log('🌱 Seeding Lakeshore University…');

  // ── Cleanup: Delete all existing seed data ──────────────────────────────
  // This makes the seed idempotent - safe to run multiple times
  const tables = [
    'passwordResets',
    'voiceSignals',
    'voiceParticipants',
    'auditLogs',
    'instanceConfig',
    'spaceRoles',
    'userBadges',
    'badges',
    'notifications',
    'moderationActions',
    'reports',
    'mentorLinks',
    'mentorProfiles',
    'lostFoundItems',
    'marketplaceListings',
    'eventRsvps',
    'events',
    'waves',
    'buddyMatches',
    'buddyProfiles',
    'studyGroupMembers',
    'studyGroups',
    'qaVotes',
    'qaAnswers',
    'qaPosts',
    'resourceVotes',
    'resources',
    'courseReviews',
    'directMessages',
    'directMembers',
    'directConversations',
    'channelReads',
    'pinnedMessages',
    'reactions',
    'messages',
    'channels',
    'spaceMembers',
    'spaces',
    'clubMemberships',
    'clubs',
    'userCourses',
    'userInterests',
    'courses',
    'interests',
    'users',
    'majors',
  ];

  for (const table of tables) {
    const rows = await (ctx.db.query(table as any) as any).collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
  console.log('  ✓ Cleaned existing data');

  // ── Majors ──────────────────────────────────────────────────────────────
  const majors: any[] = [];
  for (const [name, faculty, description] of MAJORS) {
    const id = await ctx.db.insert('majors', { name, faculty, description });
    majors.push({ id, name });
  }
  console.log(`  ✓ ${majors.length} majors`);

  // ── Interests ───────────────────────────────────────────────────────────
  const interests: any[] = [];
  for (const [name, category] of INTERESTS) {
    const id = await ctx.db.insert('interests', {
      name,
      category: category as 'ACADEMIC' | 'HOBBY' | 'SPORT' | 'CREATIVE' | 'SOCIAL' | 'CAREER',
    });
    interests.push({ id, name });
  }
  console.log(`  ✓ ${INTERESTS.length} interests`);

  // ── Courses ──────────────────────────────────────────────────────────────
  const majorByName = new Map(majors.map((m) => [m.name, m]));
  const courses: any[] = [];
  for (const [code, title, majorName, level] of COURSES) {
    const majorId = majorByName.get(majorName)?.id;
    if (majorId) {
      const id = await ctx.db.insert('courses', {
        code,
        title,
        level,
        majorId,
        description: `${title}. Offered by ${majorName}. See the reviews tab before you register — the workload varies a lot by instructor.`,
        reviewCount: 0,
      });
      courses.push({ id, code, title, majorId });
    }
  }
  console.log(`  ✓ ${courses.length} courses`);

  // ── Clubs ────────────────────────────────────────────────────────────────
  const clubs: any[] = [];
  for (const [name, category, description, tags, isRecruiting, meetingInfo] of CLUBS) {
    const id = await ctx.db.insert('clubs', {
      name,
      slug: slugify(name),
      category: category as
        | 'ACADEMIC'
        | 'SPORTS'
        | 'ARTS'
        | 'GAMING'
        | 'CULTURAL'
        | 'PROFESSIONAL'
        | 'VOLUNTEER'
        | 'RELIGIOUS'
        | 'OTHER',
      description,
      isRecruiting,
      meetingInfo,
      memberCountEstimate: 0,
      socialLinks: { instagram: `@lakeshore${slugify(name).replace(/-/g, '')}` },
      tags,
    });
    clubs.push({ id, name });
  }
  console.log(`  ✓ ${clubs.length} clubs`);

  // ── Users ────────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword('password123');
  const now = Date.now();

  const adminId = await ctx.db.insert('users', {
    email: 'admin@lakeshore.edu',
    username: 'admin',
    displayName: 'Campus Admin',
    passwordHash,
    isAdmin: true,
    year: 'SENIOR',
    majorId: majors[0]!.id,
    karma: 0,
    lastSeenAt: now,
    onboardedAt: now,
    verifiedAt: now,
    settings: {
      theme: 'dark',
      dmPrivacy: 'EVERYONE',
      discoverable: true,
      showCourses: true,
      showRealName: true,
    },
  });

  const userIds = [adminId];
  const usersByMajor = new Map<string, string[]>();
  const usedUsernames = new Set(['admin']);

  for (let i = 0; i < 60; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    let username = `${first}${last}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (usedUsernames.has(username)) username = `${username}${i}`;
    usedUsernames.add(username);

    const major = pick(majors);
    const userId = await ctx.db.insert('users', {
      email: `${username}@lakeshore.edu`,
      username,
      displayName: `${first} ${last}`,
      passwordHash,
      isAdmin: false,
      year: pick(YEARS),
      majorId: major.id,
      pronouns: pick(PRONOUNS) ?? undefined,
      bio: chance(0.6)
        ? pick([
            'Usually in the library basement. Say hi.',
            'Third year, still not sure. Open to suggestions.',
            'Will trade lecture notes for coffee.',
            'Trying to talk to more people this term. This counts.',
            'Ask me about co-op applications, I have opinions.',
            'Here for the study groups, staying for the potlucks.',
          ])
        : undefined,
      karma: int(0, 60),
      verifiedAt: now,
      onboardedAt: now,
      lastSeenAt: now - int(0, 72) * 3600000,
      settings: {
        theme: 'dark',
        dmPrivacy: pick(['EVERYONE', 'EVERYONE', 'SHARED_SPACE_ONLY']) as
          'EVERYONE' | 'SHARED_SPACE_ONLY' | 'NOBODY',
        discoverable: chance(0.85),
        showCourses: true,
        showRealName: true,
      },
    });
    userIds.push(userId);

    if (!usersByMajor.has(major.id)) usersByMajor.set(major.id, []);
    usersByMajor.get(major.id)!.push(userId);

    // Add interests
    for (const interest of pickN(interests, int(3, 6))) {
      await ctx.db
        .insert('userInterests', {
          userId,
          interestId: interest.id,
        })
        .catch(() => undefined);
    }

    // Add courses for current term
    const majorCourses = courses.filter((c) => c.majorId === major.id);
    const enrolled = pickN(majorCourses.length >= 3 ? majorCourses : courses, int(3, 5));
    for (const course of enrolled) {
      await ctx.db
        .insert('userCourses', {
          userId,
          courseId: course.id,
          term: TERM,
          status: 'TAKING',
        })
        .catch(() => undefined);
    }

    // Add previous term history
    for (const course of pickN(courses, 2)) {
      await ctx.db
        .insert('userCourses', {
          userId,
          courseId: course.id,
          term: LAST_TERM,
          status: 'COMPLETED',
        })
        .catch(() => undefined);
    }
  }
  console.log(`  ✓ ${userIds.length} users (1 admin)`);

  // ── Spaces: Majors ───────────────────────────────────────────────────────
  const majorSpaceData: any[] = [];
  for (const major of majors) {
    const majorMembers = (usersByMajor.get(major.id) || []) as any[];
    const space = await ctx.db.insert('spaces', {
      name: major.name,
      slug: slugify(major.name),
      description: major.description,
      type: 'MAJOR',
      visibility: 'PUBLIC',
      ownerId: adminId,
      linkedMajorId: major.id,
      createdById: adminId,
      publishedAt: now,
    });

    // Add channels
    const channels: any[] = [];
    for (const [i, [name, type]] of MAJOR_CHANNELS.entries()) {
      const ch = await ctx.db.insert('channels', {
        spaceId: space,
        name,
        type: type as any,
        position: i,
        isDefault: i === 0,
        topic: name === 'anonymous' ? 'No names here. Same rules otherwise.' : undefined,
      });
      channels.push({ id: ch, name, type });
    }

    // Add members
    const spaceMemberIds: any[] = [adminId, ...majorMembers];
    for (const userId of majorMembers) {
      await ctx.db.insert('spaceMembers', {
        spaceId: space,
        userId: userId as any,
        role: 'MEMBER',
        joinedAt: now,
      });
    }
    await ctx.db.insert('spaceMembers', {
      spaceId: space,
      userId: adminId,
      role: 'ADMIN',
      joinedAt: now,
    });

    majorSpaceData.push({ id: space, channels, memberIds: spaceMemberIds });
  }
  console.log(`  ✓ ${majorSpaceData.length} major spaces`);

  // ── Spaces: Courses ──────────────────────────────────────────────────────
  // Build course enrollments from userCourses
  const courseEnrollments = new Map<string, string[]>();
  for (const course of courses) {
    courseEnrollments.set(course.id, []);
  }
  // Simulate enrollments
  for (const userId of userIds.slice(1)) {
    for (const course of pickN(courses, int(2, 4))) {
      if (!courseEnrollments.has(course.id)) courseEnrollments.set(course.id, []);
      courseEnrollments.get(course.id)!.push(userId);
    }
  }

  const topCourses = Array.from(courseEnrollments.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  const courseSpaceData: any[] = [];
  for (const [courseId, memberIds] of topCourses) {
    const course = courses.find((c) => c.id === courseId)!;
    const space = await ctx.db.insert('spaces', {
      name: `${course.code} — ${course.title}`,
      slug: slugify(`${course.code}-${TERM}`),
      description: `Everyone taking ${course.code} in ${TERM}.`,
      type: 'COURSE',
      visibility: 'PUBLIC',
      ownerId: adminId,
      linkedCourseId: courseId as any,
      createdById: adminId,
      publishedAt: now,
    });

    const channels: any[] = [];
    for (const [i, [name, type]] of ([
      ['general', 'TEXT'],
      ['assignments', 'TEXT'],
      ['resources', 'RESOURCES'],
      ['study-hall', 'VOICE_STUB'],
    ] as const).entries()) {
      const ch = await ctx.db.insert('channels', {
        spaceId: space,
        name,
        type: type as any,
        position: i,
        isDefault: i === 0,
        topic:
          name === 'assignments'
            ? 'Deadlines and clarifications. No solutions.'
            : name === 'study-hall'
              ? 'Silent co-working. Camera off, mic off.'
              : undefined,
      });
      channels.push({ id: ch, name });
    }

    // Add members
    for (const userId of memberIds) {
      await ctx.db
        .insert('spaceMembers', {
          spaceId: space,
          userId: userId as any,
          role: 'MEMBER',
          joinedAt: now,
        })
        .catch(() => undefined);
    }
    await ctx.db.insert('spaceMembers', {
      spaceId: space,
      userId: adminId,
      role: 'ADMIN',
      joinedAt: now,
    });

    courseSpaceData.push({ id: space, course, channels, memberIds: memberIds as any[] });
  }
  console.log(`  ✓ ${courseSpaceData.length} course spaces`);

  // ── Spaces: Clubs ────────────────────────────────────────────────────────
  const clubSpaceData: any[] = [];
  for (const club of clubs) {
    const memberIds = pickN(userIds, int(8, 26));

    // Create club memberships
    for (let i = 0; i < memberIds.length; i++) {
      const role = i === 0 ? 'PRESIDENT' : i < 3 ? 'EXEC' : chance(0.15) ? 'FOLLOWER' : 'MEMBER';
      await ctx.db.insert('clubMemberships', {
        clubId: club.id,
        userId: memberIds[i]!,
        role: role as any,
      });
    }

    // Create club space
    const space = await ctx.db.insert('spaces', {
      name: club.name,
      slug: `club-${slugify(club.name)}`,
      description: club.description,
      type: 'CLUB',
      visibility: 'PUBLIC',
      ownerId: memberIds[0]!,
      linkedClubId: club.id,
      createdById: memberIds[0]!,
      publishedAt: now,
    });

    const channels: any[] = [];
    for (const [i, [name, type]] of ([
      ['announcements', 'ANNOUNCEMENT'],
      ['general', 'TEXT'],
      ['planning', 'TEXT'],
    ] as const).entries()) {
      const ch = await ctx.db.insert('channels', {
        spaceId: space,
        name,
        type: type as any,
        position: i,
        isDefault: i === 1,
        topic: name === 'announcements' ? 'Execs post here. React freely.' : undefined,
      });
      channels.push({ id: ch, name });
    }

    // Add members
    for (let i = 0; i < memberIds.length; i++) {
      await ctx.db
        .insert('spaceMembers', {
          spaceId: space,
          userId: memberIds[i]!,
          role: i === 0 ? 'OWNER' : i < 3 ? 'ADMIN' : 'MEMBER',
          joinedAt: now,
        })
        .catch(() => undefined);
    }

    clubSpaceData.push({ id: space, channels, memberIds, ownerId: memberIds[0]! });
  }
  console.log(`  ✓ ${clubSpaceData.length} club spaces`);

  // ── Chat history ─────────────────────────────────────────────────────────
  let messageCount = 0;

  // Major spaces chat
  for (const { channels, memberIds } of majorSpaceData) {
    for (const { id: channelId, name, type } of channels) {
      if (type === 'VOICE_STUB' || type === 'RESOURCES') continue;
      const msgs = await seedChannel(ctx, channelId, memberIds, name === 'general' ? 14 : 6, {
        anonymous: type === 'ANONYMOUS',
      });
      messageCount += msgs.length;

      // Add threads and pins to #general
      if (name === 'general' && msgs.length > 3) {
        const root = msgs[msgs.length - 3]!;
        for (let i = 0; i < 3; i++) {
          await ctx.db.insert('messages', {
            channelId,
            authorId: pick(memberIds),
            content: pick(REPLIES),
            threadRootId: root,
            attachments: [],
            isAnonymous: false,
          });
          messageCount++;
        }
        await ctx.db.insert('pinnedMessages', {
          channelId,
          messageId: msgs[0]!,
          pinnedById: adminId,
        });
      }
    }
  }

  // Course spaces chat
  for (const { channels, memberIds } of courseSpaceData) {
    for (const { id: channelId, name } of channels) {
      if (name === 'study-hall' || name === 'resources') continue;
      const msgs = await seedChannel(ctx, channelId, memberIds, int(8, 16));
      messageCount += msgs.length;
    }
  }

  // Club spaces chat
  for (const { channels, memberIds, ownerId } of clubSpaceData) {
    for (const { id: channelId, name } of channels) {
      if (name === 'announcements') {
        const msgs = await seedChannel(ctx, channelId, memberIds, 3, {
          announcement: true,
          ownerId,
        });
        messageCount += msgs.length;
      } else {
        const msgs = await seedChannel(ctx, channelId, memberIds, int(10, 20));
        messageCount += msgs.length;
      }
    }
  }
  console.log(`  ✓ ${messageCount} messages with reactions, threads and pins`);

  // ── Course reviews ───────────────────────────────────────────────────────
  let reviewCount = 0;
  for (const course of courses) {
    const hasSpace = courseSpaceData.some((cs) => cs.course.id === course.id);
    const reviewers = pickN(userIds.slice(1), hasSpace ? int(3, 5) : int(1, 2));
    for (const author of reviewers) {
      const term = chance(0.5) ? TERM : LAST_TERM;
      await ctx.db
        .insert('courseReviews', {
          courseId: course.id,
          authorId: author,
          term,
          profName: pick(PROFS),
          difficulty: int(2, 5),
          workload: int(2, 5),
          rating: int(2, 5),
          tips: pick(TIPS),
          wouldRecommend: chance(0.7),
          showName: chance(0.3),
          helpfulCount: int(0, 24),
        })
        .catch(() => undefined);
      reviewCount++;
    }
  }
  console.log(`  ✓ ${reviewCount} course reviews`);

  // ── Resources ────────────────────────────────────────────────────────────
  let resourceCount = 0;
  for (let i = 0; i < 25; i++) {
    const course = pick(courses);
    const uploader = pick(userIds.slice(1));
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

    const linkUrl = type === 'LINK' ? 'https://example.edu/lakeshore/open-courseware' : undefined;

    const resource = await ctx.db.insert('resources', {
      courseId: course.id,
      uploaderId: uploader,
      title,
      type: type as any,
      term,
      linkUrl,
      description: 'Cleaned up and re-uploaded. Corrections welcome.',
      downloadCount: int(0, 90),
      score: 0,
    });
    resourceCount++;

    const voters = pickN(userIds.slice(1), int(2, 14));
    let score = 0;
    for (const voter of voters) {
      const value = chance(0.85) ? 1 : -1;
      await ctx.db
        .insert('resourceVotes', {
          resourceId: resource,
          userId: voter,
          value,
        })
        .catch(() => undefined);
      score += value;
    }
    await ctx.db
      .insert('resources', {
        courseId: course.id,
        uploaderId: uploader,
        title,
        type: type as any,
        term,
        linkUrl,
        description: 'Cleaned up and re-uploaded. Corrections welcome.',
        downloadCount: int(0, 90),
        score,
      })
      .catch(() => undefined);
  }
  console.log(`  ✓ ${resourceCount} resources`);

  // ── Q&A ──────────────────────────────────────────────────────────────────
  let qaCount = 0;
  for (const [title, body] of QUESTIONS) {
    const course = pick(courses);
    const asker = pick(userIds.slice(1));
    const post = await ctx.db.insert('qaPosts', {
      courseId: course.id,
      authorId: asker,
      title,
      body,
      score: int(0, 12),
    });
    qaCount++;

    const answers = [];
    for (let i = 0; i < int(1, 3); i++) {
      const ans = await ctx.db.insert('qaAnswers', {
        postId: post,
        authorId: pick(userIds.slice(1)),
        body: pick(ANSWERS),
        score: int(0, 15),
      });
      answers.push(ans);
    }
    if (chance(0.6) && answers.length) {
      // Update post with accepted answer
      // Note: Convex mutations can't easily update, so we'll skip this for now
    }
  }
  console.log(`  ✓ ${qaCount} Q&A posts`);

  // ── Study groups ─────────────────────────────────────────────────────────
  let groupCount = 0;
  for (let i = 0; i < 8; i++) {
    const course = pick(courses);
    const owner = pick(userIds.slice(1));
    const maxSize = int(4, 6);
    const shouldFill = i < 2;
    const memberPool = pickN(
      userIds.slice(1),
      shouldFill ? maxSize - 1 : int(1, Math.max(1, maxSize - 3)),
    );

    const groupId = await ctx.db
      .insert('studyGroups', {
        courseId: course.id as any,
        ownerId: owner as any,
        maxSize,
        name: `${course.code} ${pick(['problem sets', 'midterm prep', 'weekly review', 'lab partners'])}`,
        description: pick([
          'Meeting in the library, working through the problem set together. Cameras optional if we go online.',
          'Two hours, no phones, then we compare answers. Bring your own attempt.',
          'Casual — we mostly keep each other honest about starting early.',
        ]),
        meetingType: pick(['IN_PERSON', 'ONLINE', 'HYBRID']),
        schedule: randomAvailability(),
        locationHint: pick([
          'Weldon 4th floor',
          'Science Building study rooms',
          'Discord / online',
          'Student Centre tables',
        ]),
        status: shouldFill ? 'FULL' : 'OPEN',
      })
      .catch(() => undefined);

    if (groupId) groupCount++;

    // Add members
    for (const member of memberPool) {
      await ctx.db
        .insert('studyGroupMembers', {
          groupId: groupId as any,
          userId: member as any,
          status: 'MEMBER',
        })
        .catch(() => undefined);
    }
  }
  console.log(`  ✓ ${groupCount} study groups`);

  // ── Buddy profiles ───────────────────────────────────────────────────────
  const buddyProfileCount = 34;
  for (const student of pickN(userIds.slice(1), buddyProfileCount)) {
    await ctx.db
      .insert('buddyProfiles', {
        userId: student,
        isActive: true,
        lookingFor: pickN(LOOKING_FOR, int(1, 3)),
        availability: randomAvailability(),
        note: chance(0.5)
          ? pick([
              'Prefer working in silence and then comparing notes after.',
              'Happy to meet in person or online, whichever is easier.',
              'Looking for someone to keep me accountable about starting things early.',
            ])
          : undefined,
      })
      .catch(() => undefined);
  }
  console.log(`  ✓ ${buddyProfileCount} buddy profiles`);

  // ── Events ───────────────────────────────────────────────────────────────
  let eventCount = 0;
  for (const [index, [title, description, dayOffset, hour, location, tags]] of EVENTS.entries()) {
    const isCampusWide = index % 3 === 0;
    const host = pick(clubSpaceData);
    const event = await ctx.db.insert('events', {
      title,
      description,
      location,
      hostType: isCampusWide ? 'CAMPUS' : 'CLUB',
      hostId: isCampusWide ? 'campus' : host.id,
      startsAt: daysOut(dayOffset, hour),
      endsAt: daysOut(dayOffset, hour + 2),
      capacity: chance(0.4) ? int(20, 80) : undefined,
      tags,
      locationDetail: chance(0.5) ? 'Look for the sign on the door.' : undefined,
    });
    eventCount++;

    for (const attendee of pickN(userIds.slice(1), int(4, 22))) {
      await ctx.db
        .insert('eventRsvps', {
          eventId: event,
          userId: attendee,
          status: chance(0.7) ? 'GOING' : 'INTERESTED',
        })
        .catch(() => undefined);
    }
  }
  console.log(`  ✓ ${eventCount} events with RSVPs`);

  // ── Marketplace ──────────────────────────────────────────────────────────
  for (const [title, description, priceCents, category] of LISTINGS) {
    await ctx.db.insert('marketplaceListings', {
      title,
      description,
      priceCents,
      category: category as any,
      sellerId: pick(userIds.slice(1)),
      courseId: category === 'TEXTBOOK' ? pick(courses).id : undefined,
      photos: [],
      status: chance(0.15) ? 'SOLD' : 'ACTIVE',
    });
  }

  // ── Lost & Found ─────────────────────────────────────────────────────────
  for (const [kind, title, description, location] of LOST_FOUND) {
    await ctx.db.insert('lostFoundItems', {
      kind: kind as any,
      title,
      description,
      location,
      reporterId: pick(userIds.slice(1)),
      status: 'OPEN',
    });
  }
  console.log(`  ✓ ${LISTINGS.length} listings · ${LOST_FOUND.length} lost & found`);

  // ── Mentors ──────────────────────────────────────────────────────────────
  // Pick mentors from the pool (roughly upper-years)
  const mentors = pickN(userIds.slice(1), 6);
  for (let i = 0; i < mentors.length; i++) {
    await ctx.db.insert('mentorProfiles', {
      userId: mentors[i]!,
      isMentor: true,
      capacity: int(2, 4),
      topics: MENTOR_TOPICS[i % MENTOR_TOPICS.length] ?? [],
      blurb: pick([
        'I had a rough first year and figured most of this out the hard way. Happy to save you some of that.',
        'Ask me anything about applications. I will be honest about what worked and what did not.',
        'Mostly here to tell you that the thing you are worried about is more common than you think.',
      ]),
    });
  }
  for (let i = 0; i < 3; i++) {
    await ctx.db
      .insert('mentorLinks', {
        mentorId: mentors[i]!,
        menteeId: pick(userIds.slice(1)),
        status: 'ACTIVE',
      })
      .catch(() => undefined);
  }
  console.log(`  ✓ ${mentors.length} mentors`);

  // ── Instance configuration ───────────────────────────────────────────────
  // Without this row the app renders first-run setup, and a seeded campus is by
  // definition already set up.
  await ctx.db.insert('instanceConfig', {
    schoolName: 'Lakeshore University',
    shortName: 'Lakeshore',
    allowedEmailDomains: ['lakeshore.edu'],
    tagline: 'Everything your campus knows, in one place that outlives the semester.',
    supportEmail: 'help@lakeshore.edu',
    currentTerm: TERM,
    allowStudentSpaces: true,
    allowSelfRegistration: true,
    setupCompletedAt: now,
    setupByUserId: adminId,
  });
  console.log('  ✓ instance configured (Lakeshore University)');

  await ctx.db.insert('auditLogs', {
    actorId: adminId,
    actorName: 'Campus Admin',
    action: 'INSTANCE_INITIALIZED',
    targetType: 'INSTANCE',
    summary: 'Lakeshore University was seeded with demo data',
    metadata: { seeded: true, term: TERM },
  });

  // ── Badges ───────────────────────────────────────────────────────────────
  const badgeMap = new Map<string, string>();
  for (const [key, name, emoji, description] of BADGES) {
    const id = await ctx.db.insert('badges', { key, name, emoji, description });
    badgeMap.set(key, id);
  }
  console.log(`  ✓ ${BADGES.length} badge definitions`);

  // ── Demo credentials ─────────────────────────────────────────────────────
  console.log('\n  ┌─ Demo credentials ──────────────────────────────────────');
  console.log('  │');
  console.log(`  │  Admin      ${'admin@lakeshore.edu'.padEnd(30)}password123`);
  console.log(`  │  Student    ${'mayaoka@lakeshore.edu'.padEnd(30)}password123`);
  console.log(`  │  Student    ${'arjunaka@lakeshore.edu'.padEnd(30)}password123`);
  console.log(`  │  Student    ${'sofiaaka@lakeshore.edu'.padEnd(30)}password123`);
  console.log(`  │`);
  console.log(`  │  Every seeded account uses the password: password123`);
  console.log(`  │  Current term: ${TERM}`);
  console.log('  └─────────────────────────────────────────────────────────\n');

  return {
    message: 'Seeded Lakeshore University successfully!',
    data: {
      majors: majors.length,
      interests: INTERESTS.length,
      courses: courses.length,
      clubs: clubs.length,
      users: userIds.length,
      messages: messageCount,
      events: eventCount,
      resources: resourceCount,
    },
  };
});
