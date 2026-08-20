import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '@/hooks/useMe';

/**
 * Hook to redirect after auth state changes.
 * - Signed out → redirect to /welcome
 * - Signed in but not onboarded → redirect to /onboarding (handled by App.tsx)
 * - Signed in and onboarded → optionally redirect to a specific path
 */
export function useAuthRedirect(redirectTo?: string) {
  const navigate = useNavigate();
  const me = useMe();

  useEffect(() => {
    // If signed out, redirect to welcome
    if (me === null) {
      navigate('/welcome', { replace: true });
      return;
    }

    // If signed in and onboarded, optionally redirect
    if (me && me.onboardedAt && redirectTo) {
      navigate(redirectTo, { replace: true });
    }
  }, [me, redirectTo, navigate]);
}
