"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until the loading state is false to ensure user and role data are settled.
    if (!loading) {
      if (user && role) {
        // If we have a user and a role, we can redirect.
        if (role === 'admin') {
          router.replace('/admin/dashboard');
        } else {
          router.replace('/dashboard');
        }
      } else if (!user) {
        // If there's no user, they should go to the login page.
        router.replace('/login');
      }
      // If there is a user but no role yet, the effect will re-run when the role is updated.
    }
  }, [user, loading, role, router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Loading CodeContest Arena...</p>
    </div>
  );
}
