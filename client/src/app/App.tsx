import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '@/lib/convexApi';
import { usePublicQ } from '@/lib/convexHooks';
import { useMe, usePresenceHeartbeat } from '@/hooks/useMe';
import { AppShell } from '@/app/AppShell';
import { AuthPage } from '@/features/auth/AuthPage';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { SetupPage } from '@/features/setup/SetupPage';
import { HomePage } from '@/features/home/HomePage';
import { SpacePage } from '@/features/chat/SpacePage';
import { SpaceSettingsPage } from '@/features/spaces/SpaceSettingsPage';
import { DmPage } from '@/features/chat/DmPage';
import { ExplorePage } from '@/features/explore/ExplorePage';
import { CoursePage } from '@/features/courses/CoursePage';
import { CourseListPage } from '@/features/courses/CourseListPage';
import { ClubDirectoryPage } from '@/features/clubs/ClubDirectoryPage';
import { ClubPage } from '@/features/clubs/ClubPage';
import { ClubQuizPage } from '@/features/clubs/ClubQuizPage';
import { CalendarPage } from '@/features/events/CalendarPage';
import { EventPage } from '@/features/events/EventPage';
import { MajorPage } from '@/features/majors/MajorPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { StudyPage } from '@/features/study/StudyPage';
import { MarketplacePage } from '@/features/campus/MarketplacePage';
import { LostFoundPage } from '@/features/campus/LostFoundPage';
import { MentorsPage } from '@/features/campus/MentorsPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminOverview } from '@/features/admin/AdminOverview';
import { AdminLogs } from '@/features/admin/AdminLogs';
import { AdminMembers } from '@/features/admin/AdminMembers';
import { AdminSpaces } from '@/features/admin/AdminSpaces';
import { AdminMajors } from '@/features/admin/AdminMajors';
import { AdminSettings } from '@/features/admin/AdminSettings';
import { TermsPage } from '@/features/legal/TermsPage';
import { PrivacyPage } from '@/features/legal/PrivacyPage';

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-accent" />
    </div>
  );
}

export function App() {
  const me = useMe();
  const location = useLocation();

  // Both gates run before anything else can render, and in this order: a
  // deployment with no campus configured has no student experience to fall back
  // to, so setup outranks even the sign-in screen.
  const initialized = usePublicQ<boolean>(api.config.isInitialized);

  usePresenceHeartbeat(Boolean(me));

  // The policy documents are readable at every stage, including before setup and
  // while signed out — the person deciding whether to make an account is exactly
  // who should be able to read them.
  const legalRoutes = (
    <>
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </>
  );

  if (initialized === undefined) return <Loading />;

  if (!initialized) {
    return (
      <Routes>
        {legalRoutes}
        <Route path="*" element={<SetupPage />} />
      </Routes>
    );
  }

  // undefined = the subscription has not resolved yet; null = signed out. Treating
  // them the same would flash the sign-in screen on every refresh.
  if (me === undefined) return <Loading />;

  if (me === null) {
    return (
      <Routes>
        {legalRoutes}
        <Route path="/welcome" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/welcome" replace state={{ from: location }} />} />
      </Routes>
    );
  }

  // Administrators skip onboarding — the wizard asks for a major and a course list,
  // which is not what an IT account is for.
  if (!me.onboardedAt && !me.isAdmin && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      {legalRoutes}
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/welcome" element={<Navigate to="/" replace />} />

      {/* ── Administration. A separate shell, not a page inside the student app:
             the two have different navigation and different audiences. */}
      <Route path="/admin" element={me.isAdmin ? <AdminLayout /> : <Navigate to="/" replace />}>
        <Route index element={<AdminOverview />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="members" element={<AdminMembers />} />
        <Route path="spaces" element={<AdminSpaces />} />
        <Route path="majors" element={<AdminMajors />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/spaces/:spaceId" element={<SpacePage />} />
        {/* Ahead of /:channelId so "settings" is not read as a channel id. */}
        <Route path="/spaces/:spaceId/settings" element={<SpaceSettingsPage />} />
        <Route path="/spaces/:spaceId/:channelId" element={<SpacePage />} />
        <Route path="/dms" element={<DmPage />} />
        <Route path="/dms/:conversationId" element={<DmPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/courses" element={<CourseListPage />} />
        <Route path="/courses/:code" element={<CoursePage />} />
        <Route path="/clubs" element={<ClubDirectoryPage />} />
        <Route path="/clubs/quiz" element={<ClubQuizPage />} />
        <Route path="/clubs/:slug" element={<ClubPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/majors/:id" element={<MajorPage />} />
        <Route path="/study" element={<StudyPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/lost-found" element={<LostFoundPage />} />
        <Route path="/mentors" element={<MentorsPage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
