'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';
import {
  getCustomerAccounts, getCreditLedger, getPaymentHistory,
  recordPayment, markCreditPaid, editCreditAmount, deleteCredit, deletePayment,
} from '@/lib/credit';

export default function CreditPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tab, setTab] = useState('accounts'); // accounts | ledger | history

  const [payTarget, setPayTarget] = useState(null); // account being paid
  const [payAmt, setPayAmt] = useState('');
  const [payNote, setPayNote] = useState('');

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
    setAccounts(await getCustomerAccounts(supabase, shopId));
    setLedger(await getCreditLedger(supabase, shopId));
    setPayments(await getPaymentHistory(supabase, shopId));
  }

  function openPayModal(acc) {
    setPayTarget(acc);
    setPayAmt(String(acc.balance));
    setPayNote('');
  }

  async function submitPayment() {
    const amt = parseFloat(payAmt) || 0;
    if (amt <= 0) { setMsg('Enter a valid amount'); return; }
    const ok = await recordPayment(supabase, profile.shop_id, {
      phone: payTarget.phone, name: payTarget.name, amt, note: payNote.trim(),
    });
    if (!ok) { setMsg('❌ Could not record payment'); return; }
    setPayTarget(null);
    await refresh(profile.shop_id);
    setMsg(`✅ Recorded ${fmt(amt)} payment from ${payTarget.name}`);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleMarkPaid(id) {
    const ok = await markCreditPaid(supabase, profile.shop_id, id);
    if (ok) { await refresh(profile.shop_id); setMsg('✅ Marked paid'); setTimeout(() => setMsg(''), 2000); }
  }

  async function handleEditAmt(entry) {
    const n = parseFloat(prompt(`Edit amount for ${entry.name}:`, entry.amt));
    if (isNaN(n) || n < 0) return;
    const ok = await editCreditAmount(supabase, profile.shop_id, entry.id, n);
    if (ok) { await refresh(profile.shop_id); setMsg('✅ Updated'); setTimeout(() => setMsg(''), 2000); }
  }

  async function handleDeleteCredit(entry) {
    if (!confirm('Delete this credit entry?')) return;
    const ok = await deleteCredit(supabase, profile.shop_id, entry.id);
    if (ok) { await refresh(profile.shop_id); setMsg('Deleted'); setTimeout(() => setMsg(''), 2000); }
  }

  async function handleDeletePayment(id) {
    if (!confirm('Delete this payment record?')) return;
    const ok = await deletePayment(supabase, profile.shop_id, id);
    if (ok) { await refresh(profile.shop_id); setMsg('Deleted'); setTimeout(() => setMsg(''), 2000); }
  }

  if (loading) return <Centered>Loading…</Centered>;

  const totalDue = accounts.reduce((a, acc) => a + acc.balance, 0);
  const unpaidCount = ledger.filter(c => !c.paid).length;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>📒 Credit — {profile?.full_name}</div>
        <button style={btnOutline} onClick={() => router.push('/shop')}>← Sales</button>
      </div>

      {msg && <div style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      <div style={card}>
        <div style={{ fontSize: 12, color: colors.sub }}>Total Credit Due</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: colors.red }}>{fmt(totalDue)}</div>
        <div style={{ fontSize: 12, color: colors.sub, marginTop: 2 }}>{unpaidCount} unpaid sale entries · {accounts.length} customers</div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['accounts', 'ledger', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${colors.border}`,
              background: tab === t ? colors.gold : 'transparent', color: tab === t ? '#2a1d00' : colors.text,
              fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
            }}>{t}</button>
        ))}
      </div>

      {tab === 'accounts' && (
        <div style={card}>
          {accounts.filter(a => a.balance > 0.5).length === 0 ? (
            <Empty text="No outstanding customer balances" />
          ) : accounts.filter(a => a.balance > 0.5).map(a => (
            <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: colors.sub }}>{a.phone || 'no phone on file'} · {a.items} purchase(s) · last {a.lastDate}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: colors.red, fontSize: 16 }}>{fmt(a.balance)}</div>
                <button onClick={() => openPayModal(a)} style={{ marginTop: 4, fontSize: 12, background: colors.green, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>
                  💰 Record Payment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ledger' && (
        <div style={card}>
          {ledger.length === 0 ? <Empty text="No credit entries" /> : ledger.map(c => (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: colors.sub }}>{c.date} · {c.phone || '—'}</div>
                  {c.items && <div style={{ fontSize: 11, color: colors.sub }}>{c.items.map(x => x.name + '×' + (x.qty || 1)).join(', ')}</div>}
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: c.paid ? colors.green : colors.red }}>{fmt(c.amt)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {c.paid ? (
                  <span style={{ fontSize: 12, color: colors.green, fontWeight: 700 }}>✓ Paid</span>
                ) : (
                  <>
                    <SmallBtn color={colors.green} onClick={() => handleMarkPaid(c.id)}>Mark Paid</SmallBtn>
                    <SmallBtn color={colors.blue} onClick={() => handleEditAmt(c)}>Edit</SmallBtn>
                    <SmallBtn color={colors.red} onClick={() => handleDeleteCredit(c)}>Delete</SmallBtn>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div style={card}>
          {payments.length === 0 ? <Empty text="No payments recorded yet" /> : payments.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: colors.sub }}>{p.date}{p.note ? ' · ' + p.note : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: colors.green, fontSize: 15 }}>{fmt(p.amt)}</div>
                <SmallBtn color={colors.red} onClick={() => handleDeletePayment(p.id)}>Delete</SmallBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {payTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
          <div style={{ ...card, width: '100%', maxWidth: 360, marginBottom: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Record Payment</div>
            <div style={{ fontSize: 13, color: colors.sub, marginBottom: 10 }}>
              {payTarget.name} — outstanding {fmt(payTarget.balance)}
            </div>
            <input style={input} type="number" placeholder="Amount" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
            <input style={input} placeholder='Note (e.g. "June settlement")' value={payNote} onChange={e => setPayNote(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnOutline, flex: 1 }} onClick={() => setPayTarget(null)}>Cancel</button>
              <button style={{ ...btnPrimary, flex: 1 }} onClick={submitPayment}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 9px', fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: 'center', padding: 16, fontSize: 13, color: colors.sub }}>{text}</div>;
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
