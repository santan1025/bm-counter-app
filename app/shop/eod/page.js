'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline } from '@/lib/styles';
import {
  NOTES, NOTE_BILLS, NOTE_COINS, nval, nlabel, calcTotal,
  getShopCounterBox, mergeDayToCounter, getSalesTotal, getDamageTotal,
  computeClosing, closeDay,
} from '@/lib/cash';

const STEPS = ['Sales', 'Stock', 'Cash', 'Checklist', 'Close Day'];
const CHECKLIST_ITEMS = [
  { key: 'daybox', label: 'Day Box counted & saved', sub: 'Physical cash matches sales' },
  { key: 'merged', label: 'Day Box merged into Counter Box', sub: 'Till total updated' },
  { key: 'stock', label: 'Stock verified / damage logged', sub: 'Any wastage recorded today' },
  { key: 'credit', label: 'Credit entries reviewed', sub: 'New credit sales noted' },
];

export default function EODPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = todayStr();

  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [msg, setMsg] = useState('');

  const [salesData, setSalesData] = useState({ total: 0, upi: 0, cash: 0, card: 0, credit: 0, count: 0 });
  const [daily, setDaily] = useState(null);
  const [damageTotal, setDamageTotal] = useState(0);
  const [counterBox, setCounterBox] = useState(0);
  const [checklist, setChecklist] = useState(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map(c => [c.key, false]))
  );
  const [closed, setClosed] = useState(false);
  const [closeResult, setCloseResult] = useState(null);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'staff' || !p.shop_id) { router.replace('/'); return; }
      setProfile(p);
      await loadAll(p.shop_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(shopId) {
    const { data: sales } = await supabase.from('sales').select('total, pay, sp_u, sp_c').eq('shop_id', shopId).eq('date', today);
    const s = sales || [];
    const byp = (mode) => s.filter(x => x.pay === mode).reduce((a, x) => a + Number(x.total || 0), 0);
    const upi = byp('upi') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_u || 0), 0);
    const cash = byp('cash') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_c || 0), 0);
    setSalesData({
      total: s.reduce((a, x) => a + Number(x.total || 0), 0),
      upi, cash, card: byp('card'), credit: byp('credit'), count: s.length,
    });

    const { data: dailyRow } = await supabase.from('daily').select('*').eq('shop_id', shopId).eq('date', today).maybeSingle();
    setDaily(dailyRow);

    setDamageTotal(await getDamageTotal(supabase, shopId, today));

    const { data: prods } = await supabase.from('products').select('*').eq('shop_id', shopId);
    setProducts(prods || []);

    const { counter_box } = await getShopCounterBox(supabase, shopId);
    setCounterBox(counter_box);
  }

  function toggleCheck(key) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleMergeNow() {
    setMsg('');
    const res = await mergeDayToCounter(supabase, profile.shop_id, today);
    if (!res.ok) { setMsg('⚠ ' + res.reason); return; }
    setCounterBox(res.newTotal);
    setChecklist(prev => ({ ...prev, merged: true }));
    setMsg('✅ Merged — Counter Box now ' + fmt(res.newTotal));
    await loadAll(profile.shop_id);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleCloseDay() {
    if (!confirm('Close the day? This locks today\'s stock snapshot and sets tomorrow\'s opening stock.')) return;
    const res = await closeDay(supabase, profile.shop_id, today, products);
    setCloseResult(res);
    setClosed(true);
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (!daily) return <Centered>No data for today yet.</Centered>;

  const opening = daily.opening || 0;
  const newStock = daily.new_stock || 0;
  const salesTotal = salesData.total;
  const calcClosing = computeClosing(opening, newStock, salesTotal, damageTotal);
  const sysValue = products.reduce((a, p) => a + (p.stock || 0) * (p.price || 0), 0);
  const stockDiff = Math.abs(calcClosing - sysValue);

  const dayBox = daily.day_box || 0;
  const dayBoxDet = daily.day_box_det || {};
  const cashExpected = salesData.cash;
  const cashDiff = calcTotal(dayBoxDet) - cashExpected;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>🌙 End of Day</div>
        <button style={btnOutline} onClick={() => router.push('/shop')}>← Sales</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i + 1 <= step ? colors.gold : colors.border,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: colors.sub, marginBottom: 8 }}>Step {step} of {STEPS.length}: {STEPS[step - 1]}</div>

      {msg && <div style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      {step === 1 && (
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: colors.gold }}>{fmt(salesTotal)}</div>
            <div style={{ fontSize: 12, color: colors.sub }}>Total Sales Today · {salesData.count} transactions</div>
          </div>
          <Row label="UPI" val={fmt(salesData.upi)} color={colors.blue} />
          <Row label="Cash" val={fmt(salesData.cash)} color={colors.green} />
          <Row label="Card" val={fmt(salesData.card)} />
          <Row label="Credit" val={fmt(salesData.credit)} color={colors.red} />
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📦 Stock Reconciliation</div>
          <Row label="Opening" val={fmt(opening)} />
          <Row label="+ New Stock" val={fmt(newStock)} />
          <Row label="− Sales" val={'-' + fmt(salesTotal)} color={colors.red} />
          {damageTotal > 0 && <Row label="− Damage" val={'-' + fmt(damageTotal)} color={colors.red} />}
          <div style={{ borderTop: `2px solid ${colors.border}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
            <span>Calculated Closing</span><span style={{ color: colors.green }}>{fmt(calcClosing)}</span>
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: stockDiff <= 200 ? 'rgba(46,158,91,.15)' : 'rgba(217,83,79,.15)', color: stockDiff <= 200 ? colors.green : colors.red }}>
            {stockDiff <= 200 ? '✓ Matches system stock value' : `⚠ Diff vs system: ${fmt(stockDiff)}`}
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>💵 Cash Verification</div>
          <div style={{ fontSize: 12, color: colors.sub, marginBottom: 8 }}>
            Uses whatever was saved on the Cash page. Go there first if not counted yet.
          </div>
          <Row label="Cash Sales (expected)" val={fmt(cashExpected)} />
          <Row label="Day Box (counted)" val={fmt(calcTotal(dayBoxDet))} />
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: Math.abs(cashDiff) <= 10 ? 'rgba(46,158,91,.15)' : 'rgba(217,83,79,.15)', color: Math.abs(cashDiff) <= 10 ? colors.green : colors.red }}>
            {Math.abs(cashDiff) <= 10 ? '✓ Cash matches' : (cashDiff > 0 ? 'Excess: ' + fmt(cashDiff) : 'Short: ' + fmt(Math.abs(cashDiff)))}
          </div>
          <Row label="Counter Box (till total)" val={fmt(counterBox)} />
          <button style={{ ...btnOutline, width: '100%', marginTop: 10 }} onClick={handleMergeNow}>
            Merge Day Box → Counter Box
          </button>
        </div>
      )}

      {step === 4 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>✅ Checklist</div>
          {CHECKLIST_ITEMS.map(c => (
            <div key={c.key} onClick={() => toggleCheck(c.key)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}`, cursor: 'pointer' }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, border: `2px solid ${checklist[c.key] ? colors.green : colors.border}`,
                background: checklist[c.key] ? colors.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13,
              }}>{checklist[c.key] ? '✓' : ''}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: colors.sub }}>{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 5 && (
        <div style={card}>
          {!closed ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Final Summary</div>
              <Row label="Total Sales" val={fmt(salesTotal)} color={colors.green} />
              <Row label="Transactions" val={salesData.count} />
              <Row label="Closing Stock Est." val={fmt(calcClosing)} />
              <Row label="Counter Box" val={fmt(counterBox)} />
              <div style={{ ...card, background: 'rgba(232,160,32,.08)', border: `1px solid ${colors.gold}`, marginTop: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{fmt(calcClosing)}</strong> will become tomorrow's opening stock value.
                </div>
              </div>
              <button style={{ ...btnPrimary, width: '100%', marginTop: 12 }} onClick={handleCloseDay}>
                Close Day & Carry Forward
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>Day Closed</div>
              <div style={{ fontSize: 13, color: colors.sub, marginTop: 4 }}>
                Tomorrow opens with {fmt(closeResult.closing)} in stock.
              </div>
              <button style={{ ...btnOutline, width: '100%', marginTop: 16 }} onClick={() => router.push('/shop')}>
                Back to Sales
              </button>
            </div>
          )}
        </div>
      )}

      {!closed && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {step > 1 && <button style={{ ...btnOutline, flex: 1 }} onClick={() => setStep(step - 1)}>← Back</button>}
          {step < STEPS.length && <button style={{ ...btnPrimary, flex: 1 }} onClick={() => setStep(step + 1)}>Next →</button>}
        </div>
      )}
    </div>
  );
}

function Row({ label, val, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: colors.sub }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || colors.text }}>{val}</span>
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
