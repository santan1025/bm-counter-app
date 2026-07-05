'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';
import {
  getShopRollup, getTopSellers, getCreditSummaryAllShops,
  getStockAlerts, getHistoryForDate, exportRollupCSV,
} from '@/lib/ownerDashboard';

const TABS = ['overview', 'top sellers', 'credit', 'stock alerts', 'history'];

export default function OwnerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('today');

  const [rollup, setRollup] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [creditSummary, setCreditSummary] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);

  const [historyDate, setHistoryDate] = useState(todayStr());
  const [historyRows, setHistoryRows] = useState(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'owner') { router.replace('/'); return; }
      setProfile(p);
      await loadOverview(period);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile) loadOverview(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function loadOverview(p) {
    setRollup(await getShopRollup(supabase, p));
  }

  async function loadTab(t) {
    setTab(t);
    if (t === 'top sellers' && !topSellers.length) setTopSellers(await getTopSellers(supabase, period));
    if (t === 'credit' && !creditSummary.length) setCreditSummary(await getCreditSummaryAllShops(supabase));
    if (t === 'stock alerts' && !stockAlerts.length) setStockAlerts(await getStockAlerts(supabase));
  }

  async function handleLookupHistory() {
    setHistoryRows(await getHistoryForDate(supabase, historyDate));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Centered>Loading…</Centered>;

  const grandTotal = rollup.reduce((a, r) => a + r.total, 0);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16, paddingBottom: 40 }}>
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => loadTab(t)}
            style={{
              flex: '1 1 auto', padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`,
              background: tab === t ? colors.gold : 'transparent', color: tab === t ? '#2a1d00' : colors.text,
              fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
            }}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['today', 'week', 'month'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${colors.border}`,
                  background: period === p ? colors.blue : 'transparent', color: '#fff',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                }}>{p}</button>
            ))}
          </div>

          <div style={{ ...card, border: `2px solid ${colors.gold}` }}>
            <div style={{ fontSize: 12, color: colors.sub }}>TOTAL ACROSS ALL SHOPS — {period.toUpperCase()}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: colors.green }}>{fmt(grandTotal)}</div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, textTransform: 'uppercase' }}>Shop-by-Shop</div>
              <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} onClick={() => exportRollupCSV(rollup, period)}>⬇ Export CSV</button>
            </div>
            {rollup.length === 0 && <div style={{ color: colors.sub, textAlign: 'center', padding: 16 }}>No shops yet.</div>}
            {rollup.map(r => (
              <div key={r.shop.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.shop.name}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: r.total > 0 ? colors.green : colors.sub }}>{fmt(r.total)}</div>
                </div>
                <div style={{ fontSize: 11, color: colors.sub }}>
                  {r.txnCount} txn · UPI {fmt(r.upi)} · Cash {fmt(r.cash)} · Card {fmt(r.card)} · Credit {fmt(r.credit)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'top sellers' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, marginBottom: 8, textTransform: 'uppercase' }}>
            Top Sellers — {period} — all shops
          </div>
          {topSellers.length === 0 ? <Empty text="No sales in this period" /> : topSellers.map((t, i) => (
            <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{i + 1}. {t.name}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: colors.gold }}>{fmt(t.rev)}</div>
                <div style={{ fontSize: 11, color: colors.sub }}>{t.qty} sold</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'credit' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, marginBottom: 8, textTransform: 'uppercase' }}>Credit Due — by Shop</div>
          {creditSummary.filter(c => c.totalDue > 0).length === 0 ? <Empty text="No outstanding credit anywhere" /> : creditSummary.filter(c => c.totalDue > 0).map(c => (
            <div key={c.shop.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.shop.name}</div>
                <div style={{ fontWeight: 800, color: colors.red }}>{fmt(c.totalDue)}</div>
              </div>
              <div style={{ fontSize: 11, color: colors.sub }}>
                {c.accounts.slice(0, 3).map(a => `${a.name} (${fmt(a.balance)})`).join(', ')}
                {c.accounts.length > 3 ? ` +${c.accounts.length - 3} more` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'stock alerts' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, marginBottom: 8, textTransform: 'uppercase' }}>Stock Alerts — by Shop</div>
          {stockAlerts.length === 0 ? <Empty text="No low-stock or aging items" /> : stockAlerts.map(r => (
            <div key={r.shop.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{r.shop.name}</div>
              {r.low.length > 0 && (
                <div style={{ fontSize: 12, color: colors.red, marginBottom: 2 }}>
                  🔻 Low stock: {r.low.map(p => `${p.name} (${p.stock})`).join(', ')}
                </div>
              )}
              {r.aging.length > 0 && (
                <div style={{ fontSize: 12, color: colors.gold }}>
                  ⏳ Aging: {r.aging.map(p => `${p.name} (${p.stock})`).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.sub, marginBottom: 8, textTransform: 'uppercase' }}>Look up any past day</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input style={{ ...input, marginBottom: 0, flex: 1 }} type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} />
            <button style={btnPrimary} onClick={handleLookupHistory}>Look up</button>
          </div>
          {historyRows && (historyRows.length === 0 ? <Empty text="No shops found" /> : historyRows.map(r => (
            <div key={r.shop.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.shop.name}</div>
                <div style={{ fontWeight: 800, color: colors.green }}>{fmt(r.total)}</div>
              </div>
              <div style={{ fontSize: 11, color: colors.sub }}>
                {r.txnCount} txn · UPI {fmt(r.upi)} · Cash {fmt(r.cash)} · Card {fmt(r.card)} · Credit {fmt(r.credit)}
              </div>
              <div style={{ fontSize: 11, color: colors.sub, marginTop: 2 }}>
                Opening {fmt(r.opening)} · +New {fmt(r.newStock)} · Damage {fmt(r.damage)}
                {r.closingValue !== undefined && r.closingValue !== null ? ` · Closing ${fmt(r.closingValue)}` : ' · Closing: day not closed yet'}
              </div>
              <div style={{ fontSize: 11, color: colors.sub }}>
                Day Box {r.dayBox !== undefined ? fmt(r.dayBox) : '—'} · Counter Box {r.counterBox !== undefined ? fmt(r.counterBox) : '—'}
              </div>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: 'center', padding: 16, fontSize: 13, color: colors.sub }}>{text}</div>;
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
