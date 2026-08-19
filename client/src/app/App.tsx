import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { AppShell } from '@/app/AppShell';
import { AuthPage } from '@/features/auth/AuthPage';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { HomePage } from '@/features/home/HomePage';
import { SpacePage } from '@/features/chat/SpacePage';
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

export function App() {
  const { status, user, restore } = useAuth();
  const location = useLocation();

  useEffect(() => {
    void restore();
  }, [restore]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        {/* Deliberately quiet: this is a cookie round-trip, not a real load. */}
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-accent" />
      </div>
    );
  }

  if (status === 'anon') {
    return (
      <Routes>
        <Route path="/welcome" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/welcome" replace state={{ from: location }} />} />
      </Routes>
    );
  }

  // Onboarding is skippable but insistent: everything redirects here until it's done or skipped.
  if (user && !user.onboardedAt && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/welcome" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/spaces/:spaceId" element={<SpacePage />} />
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
