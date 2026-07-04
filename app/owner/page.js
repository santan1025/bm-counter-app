'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnOutline } from '@/lib/styles';

export default function OwnerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]); // one row per shop: {shop, todaySales, txnCount}
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'owner') { router.replace('/'); return; }
      setProfile(p);
      await loadRollup();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRollup() {
    const today = todayStr();
    const { data: shops, error: shopErr } = await supabase.from('shops').select('*').order('name');
    if (shopErr) { setMsg('Could not load shops: ' + shopErr.message); return; }

    const { data: sales, error: saleErr } = await supabase
      .from('sales').select('shop_id, total, pay').eq('date', today);
    if (saleErr) { setMsg('Could not load sales: ' + saleErr.message); return; }

    const perShop = (shops || []).map(shop => {
      const shopSales = (sales || []).filter(s => s.shop_id === shop.id);
      const total = shopSales.reduce((a, s) => a + Number(s.total), 0);
      return { shop, total, txnCount: shopSales.length };
    }).sort((a, b) => b.total - a.total);

    setRows(perShop);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>Loading…</div>;

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: colors.gold }}>👑 Owner Dashboard</div>
          <div style={{ fontSize: 12, color: colors.sub }}>{profile?.full_name} · {todayStr()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...btnOutline, padding: '8px 12px', fontSize: 12 }} onClick={() => router.push('/owner/manage')}>⚙️ Manage</button>
          <button style={{ ...btnOutline, padding: '8px 12px', fontSize: 12 }} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {msg && <div style={{ ...card, fontSize: 13, color: colors.red }}>{msg}</div>}

      <div style={{ ...card, border: `2px solid ${colors.gold}` }}>
        <div style={{ fontSize: 12, color: colors.sub }}>TOTAL ACROSS ALL SHOPS — TODAY</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: colors.green }}>{fmt(grandTotal)}</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, marginBottom: 8, textTransform: 'uppercase' }}>Shop-by-Shop — Today</div>
        {rows.length === 0 && <div style={{ color: colors.sub, textAlign: 'center', padding: 16 }}>No shops added yet. Add rows in Supabase → Table Editor → shops.</div>}
        {rows.map(r => (
          <div key={r.shop.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.shop.name}</div>
              <div style={{ fontSize: 11, color: colors.sub }}>{r.txnCount} transaction(s)</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: r.total > 0 ? colors.green : colors.sub }}>{fmt(r.total)}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: colors.sub, textAlign: 'center', marginTop: 8 }}>
        This is the first version of the dashboard — weekly/monthly views, top sellers,
        credit accounts, and stock alerts (like your single-shop version) come next.
      </div>
    </div>
  );
}
