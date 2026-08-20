import { useAuth } from '@/stores/auth';

/**
 * Sign out and redirect to welcome page.
 * Call this function when you need to log a user out.
 */
export async function logout() {
  const signOut = useAuth.getState().signOut;
  await signOut();
  // Navigation happens automatically via App.tsx detecting me === null
}
