'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile } from '@/lib/helpers';
import { colors } from '@/lib/styles';

export default function HomePage() {
  const router = useRouter();
  const [status, setStatus] = useState('checking'); // checking | no-profile

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const profile = await getMyProfile(supabase);
      if (!profile) {
        // Logged in, but no matching row in `profiles` yet — this happens if an
        // owner created the auth user but hasn't added their profile row yet.
        setStatus('no-profile');
        return;
      }
      if (profile.role === 'owner') router.replace('/owner');
      else router.replace('/shop');
    })();
  }, [router]);

  if (status === 'no-profile') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
        <div style={{ color: colors.sub, maxWidth: 360 }}>
          Your login works, but no profile is set up for this account yet.
          Ask the owner to add a row for you in the <code>profiles</code> table
          (role + shop assignment), then reload this page.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>
      Loading…
    </div>
  );
}
