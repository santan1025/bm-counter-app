'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { colors, card, btnPrimary, input } from '@/lib/styles';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      // Deliberately generic message — doesn't reveal whether the email exists,
      // just whether the email+password combination was valid.
      setErr('Incorrect email or password.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={handleLogin} style={{ ...card, width: 360, maxWidth: '100%', border: `2px solid ${colors.gold}` }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: colors.gold }}>BM Counter Manager</div>
        <div style={{ fontSize: 13, color: colors.sub, marginBottom: 20 }}>Sign in with the email and password your owner set up for you.</div>

        <label style={{ fontSize: 13, color: colors.sub }}>Email</label>
        <input
          style={input}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <label style={{ fontSize: 13, color: colors.sub }}>Password</label>
        <input
          style={input}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {err && <div style={{ color: colors.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}

        <button type="submit" style={{ ...btnPrimary, width: '100%' }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
