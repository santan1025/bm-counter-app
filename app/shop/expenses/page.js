'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';
import { NOTES, NOTE_BILLS, NOTE_COINS, nval, nlabel, calcTotal, getShopCounterBox } from '@/lib/cash';
import { EXP_CATEGORIES, EXP_SOURCES, getExpensesForDate, addExpense, deleteExpense, getExpenseSummary } from '@/lib/expenses';

export default function ExpensesPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = todayStr();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [category, setCategory] = useState(EXP_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amt, setAmt] = useState('');
  const [source, setSource] = useState('daybox');
  const [noteDet, setNoteDet] = useState({});

  const [dayBox, setDayBox] = useState(0);
  const [counterBox, setCounterBox] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ total: 0, fromTill: 0, count: 0 });

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'staff' || !p.shop_id) { router.replace('/'); return; }
      setProfile(p);
      await refresh(p.shop_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(shopId) {
    const { data: daily } = await supabase.from('daily').select('day_box').eq('shop_id', shopId).eq('date', today).maybeSingle();
    setDayBox(daily?.day_box || 0);
    const { counter_box } = await getShopCounterBox(supabase, shopId);
    setCounterBox(counter_box);
    setExpenses(await getExpensesForDate(supabase, shopId, today));
    setSummary(await getExpenseSummary(supabase, shopId, today));
  }

  function setDenom(n, v) {
    setNoteDet(prev => ({ ...prev, [n]: parseInt(v) || 0 }));
  }

  const noteTotal = calcTotal(noteDet);

  async function handleAdd() {
    setMsg('');
    const amount = parseFloat(amt) || 0;
    if (!description.trim()) { setMsg('Enter a description'); return; }
    if (amount <= 0) { setMsg('Enter a valid amount'); return; }

    const res = await addExpense(supabase, profile.shop_id, {
      category, description: description.trim(), amt: amount, source,
      noteDet: source !== 'other' ? noteDet : {},
    });
    if (!res.ok) { setMsg('⚠ ' + res.reason); return; }

    setDescription(''); setAmt(''); setNoteDet({});
    await refresh(profile.shop_id);
    setMsg('✅ Expense saved — ' + fmt(amount));
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleDelete(exp) {
    if (!confirm('Delete this expense? Any till deduction will be added back.')) return;
    const ok = await deleteExpense(supabase, profile.shop_id, exp);
    if (ok) { await refresh(profile.shop_id); setMsg('Deleted — cash added back'); setTimeout(() => setMsg(''), 2500); }
  }

  if (loading) return <Centered>Loading…</Centered>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>🧾 Expenses — {profile?.full_name}</div>
        <button style={btnOutline} onClick={() => router.push('/shop')}>← Sales</button>
      </div>

      {msg && <div style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      <div style={{ ...card, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: colors.sub }}>Day Box</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{fmt(dayBox)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.sub }}>Counter Box</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: colors.gold }}>{fmt(counterBox)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.sub }}>Today's Expenses</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: colors.red }}>{fmt(summary.total)}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Log an Expense</div>

        <label style={{ fontSize: 12, color: colors.sub }}>Category</label>
        <select style={input} value={category} onChange={e => setCategory(e.target.value)}>
          {EXP_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <label style={{ fontSize: 12, color: colors.sub }}>Description</label>
        <input style={input} placeholder="e.g. Milk for the day" value={description} onChange={e => setDescription(e.target.value)} />

        <label style={{ fontSize: 12, color: colors.sub }}>Amount</label>
        <input style={input} type="number" placeholder="0" value={amt} onChange={e => setAmt(e.target.value)} />

        <label style={{ fontSize: 12, color: colors.sub }}>Paid From</label>
        <select style={input} value={source} onChange={e => setSource(e.target.value)}>
          {EXP_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {source !== 'other' && (
          <div style={{ marginTop: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: colors.sub, marginBottom: 4 }}>Which notes/coins did you take out? (optional, keeps denomination counts accurate)</div>
            <DenomGrid label="📄 Notes" list={NOTE_BILLS} det={noteDet} onChange={setDenom} />
            <DenomGrid label="🪙 Coins" list={NOTE_COINS} det={noteDet} onChange={setDenom} />
            {noteTotal > 0 && <div style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>Notes entered total: {fmt(noteTotal)}</div>}
          </div>
        )}

        <button style={{ ...btnPrimary, width: '100%', marginTop: 8 }} onClick={handleAdd}>Save Expense</button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Today's Expenses ({summary.count})</div>
        {expenses.length === 0 ? (
          <div style={{ textAlign: 'center', color: colors.sub, padding: 12, fontSize: 13 }}>No expenses logged today</div>
        ) : expenses.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{e.category} — {e.description}</div>
              <div style={{ fontSize: 11, color: colors.sub }}>{e.time} · {sourceLabel(e.source)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, color: colors.red, fontSize: 14 }}>{fmt(e.amt)}</div>
              <button onClick={() => handleDelete(e)} style={{ background: 'none', border: 'none', color: colors.sub, fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function sourceLabel(key) {
  return EXP_SOURCES.find(s => s.key === key)?.label || key;
}

function DenomGrid({ label, list, det, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: colors.sub, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {list.map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span style={{ minWidth: 48, fontSize: 12 }}>₹{nlabel(n)}</span>
          <span style={{ fontSize: 11, color: colors.sub }}>×</span>
          <input type="number" min="0" placeholder="0" style={{ ...input, width: 56, marginBottom: 0, textAlign: 'right', fontSize: 12 }} value={det[n] || ''} onChange={e => onChange(n, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
