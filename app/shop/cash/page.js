'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr, getOrCreateDaily } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';
import {
  NOTES, NOTE_BILLS, NOTE_COINS, nval, nlabel, calcTotal,
  getExpectedCash, saveDayBox, getShopCounterBox, mergeDayToCounter,
  doHandover, getHandoverLog,
} from '@/lib/cash';

export default function CashPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = todayStr();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [dayDet, setDayDet] = useState({});      // {denom: count} being entered
  const [expected, setExpected] = useState(0);
  const [autoDayBox, setAutoDayBox] = useState(0);

  const [counterBox, setCounterBox] = useState(0);
  const [hoTo, setHoTo] = useState('');
  const [hoAmt, setHoAmt] = useState('');
  const [hoNote, setHoNote] = useState('');
  const [hoLog, setHoLog] = useState([]);

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
    const daily = await getOrCreateDaily(supabase, shopId, today);
    setDayDet(daily?.day_box_det || {});
    setAutoDayBox(daily?.day_box || 0);
    setExpected(await getExpectedCash(supabase, shopId, today));
    const { counter_box } = await getShopCounterBox(supabase, shopId);
    setCounterBox(counter_box);
    setHoLog(await getHandoverLog(supabase, shopId, today));
  }

  const dayTotal = calcTotal(dayDet);
  const diff = dayTotal - expected;

  function setDenom(n, v) {
    setDayDet(prev => ({ ...prev, [n]: parseInt(v) || 0 }));
  }

  async function handleSaveDayBox() {
    setMsg('');
    const total = await saveDayBox(supabase, profile.shop_id, today, dayDet);
    if (total === null) { setMsg('❌ Could not save Day Box'); return; }
    setAutoDayBox(total);
    setMsg('✅ Day Box saved — ' + fmt(total));
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleMerge() {
    setMsg('');
    const res = await mergeDayToCounter(supabase, profile.shop_id, today);
    if (!res.ok) { setMsg('⚠ ' + res.reason); return; }
    setCounterBox(res.newTotal);
    setAutoDayBox(0);
    setDayDet({});
    setMsg('✅ Merged into Counter Box — now ' + fmt(res.newTotal));
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleHandover() {
    setMsg('');
    const amt = parseFloat(hoAmt) || 0;
    if (!hoTo.trim()) { setMsg('Enter who you\'re handing cash to'); return; }
    if (amt <= 0) { setMsg('Enter an amount'); return; }
    const res = await doHandover(supabase, profile.shop_id, { to: hoTo.trim(), amt, note: hoNote.trim() });
    if (!res.ok) { setMsg('⚠ ' + res.reason); return; }
    setCounterBox(res.newTotal);
    setHoTo(''); setHoAmt(''); setHoNote('');
    setHoLog(await getHandoverLog(supabase, profile.shop_id, today));
    setMsg('✅ Handover recorded — ' + fmt(amt));
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading) return <Centered>Loading…</Centered>;

  const matched = Math.abs(diff) <= 10;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>💵 Cash — {profile?.full_name}</div>
        <button style={btnOutline} onClick={() => router.push('/shop')}>← Sales</button>
      </div>

      {msg && <div style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      {/* DAY BOX */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📦 Day Box — today's cash</div>
        <div style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
          Count what's physically in the till right now.
        </div>

        <DenomGrid label="📄 Notes" list={NOTE_BILLS} det={dayDet} onChange={setDenom} />
        <DenomGrid label="🪙 Coins" list={NOTE_COINS} det={dayDet} onChange={setDenom} />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontWeight: 800, fontSize: 15 }}>
          <span>Counted Total</span><span>{fmt(dayTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: colors.sub }}>
          <span>Expected (from cash sales)</span><span>{fmt(expected)}</span>
        </div>
        {(expected > 0 || dayTotal > 0) && (
          <div style={{
            marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            display: 'inline-block',
            background: matched ? 'rgba(46,158,91,.15)' : 'rgba(217,83,79,.15)',
            color: matched ? colors.green : colors.red,
          }}>
            {matched ? '✓ Matched with sales' : (diff > 0 ? 'Excess: ' + fmt(Math.abs(diff)) : 'Short: ' + fmt(Math.abs(diff)))}
          </div>
        )}

        <button style={{ ...btnPrimary, width: '100%', marginTop: 12 }} onClick={handleSaveDayBox}>Save Day Box</button>
        <button style={{ ...btnOutline, width: '100%', marginTop: 8 }} onClick={handleMerge}>
          Merge {fmt(autoDayBox || dayTotal)} → Counter Box
        </button>
      </div>

      {/* COUNTER BOX */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🏦 Counter Box — running till balance</div>
        <div style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
          Persists across days. This is your real cash-in-hand.
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: colors.gold }}>{fmt(counterBox)}</div>
      </div>

      {/* HANDOVER */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🤝 Handover Counter Box cash</div>
        <input style={input} placeholder="Handed to (name)" value={hoTo} onChange={e => setHoTo(e.target.value)} />
        <input style={input} type="number" placeholder="Amount" value={hoAmt} onChange={e => setHoAmt(e.target.value)} />
        <input style={input} placeholder="Note (optional)" value={hoNote} onChange={e => setHoNote(e.target.value)} />
        <button style={{ ...btnPrimary, width: '100%' }} onClick={handleHandover}>Record Handover</button>

        {hoLog.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: colors.sub, textTransform: 'uppercase', marginBottom: 6 }}>Today's handovers</div>
            {hoLog.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{h.handed_to}</div>
                  <div style={{ fontSize: 11, color: colors.sub }}>{h.time}{h.note ? ' · ' + h.note : ''}</div>
                </div>
                <div style={{ fontWeight: 800, color: colors.red, fontSize: 14 }}>-{fmt(h.amt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DenomGrid({ label, list, det, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: colors.sub, textTransform: 'uppercase', marginBottom: 6, borderBottom: `1px solid ${colors.border}`, paddingBottom: 4 }}>
        {label}
      </div>
      {list.map(n => {
        const v = det[n] || 0;
        const amt = v * nval(n);
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ minWidth: 48, fontSize: 13 }}>₹{nlabel(n)}</span>
            <span style={{ fontSize: 11, color: colors.sub }}>×</span>
            <input
              type="number" min="0" placeholder="0"
              style={{ ...input, width: 64, marginBottom: 0, textAlign: 'right' }}
              value={v || ''}
              onChange={e => onChange(n, e.target.value)}
            />
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: amt > 0 ? 700 : 400, color: amt > 0 ? colors.green : colors.sub, minWidth: 80, textAlign: 'right' }}>
              {amt > 0 ? '₹' + amt : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
