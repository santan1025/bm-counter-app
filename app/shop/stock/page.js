'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr, getOrCreateDaily, ensureOpeningSnapshot } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';

const AGING_DAYS = 3; // matches the single-shop app's DMG_DAYS convention

export default function StockPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [recvQty, setRecvQty] = useState({}); // {productId: qty}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'staff' || !p.shop_id) { router.replace('/'); return; }
      setProfile(p);
      await loadProducts(p.shop_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts(shopId) {
    const { data } = await supabase.from('products').select('*').eq('shop_id', shopId).order('category').order('name');
    setProducts(data || []);
  }

  async function applyReceived() {
    const items = Object.entries(recvQty).filter(([, v]) => parseInt(v) > 0);
    if (!items.length) { setMsg('Enter a quantity for at least one item'); return; }
    setSaving(true); setMsg('');

    const today = todayStr();
    // Guarantee an opening snapshot exists BEFORE we change any stock — same
    // safeguard as the single-shop app, so today's opening figure always
    // reflects true pre-change stock, never something already modified.
    await ensureOpeningSnapshot(supabase, profile.shop_id, today, products);
    const daily = await getOrCreateDaily(supabase, profile.shop_id, today);

    const log = { ...(daily?.new_stock_log || {}) };
    let addedValue = 0;

    for (const [productId, qtyStr] of items) {
      const qty = parseInt(qtyStr);
      const prod = products.find(pr => pr.id === productId);
      if (!prod) continue;
      await supabase.from('products').update({ stock: prod.stock + qty, arrived_date: today }).eq('id', productId);
      const key = productId;
      log[key] = log[key] || { id: prod.id, n: prod.name, c: prod.category, p: prod.price, qty: 0 };
      log[key].qty += qty;
      addedValue += prod.price * qty;
    }

    await supabase.from('daily')
      .update({ new_stock_log: log, new_stock: (daily?.new_stock || 0) + addedValue })
      .eq('shop_id', profile.shop_id).eq('date', today);

    await loadProducts(profile.shop_id);
    setRecvQty({});
    setSaving(false);
    setMsg('✅ Stock received and logged');
    setTimeout(() => setMsg(''), 3000);
  }

  async function reportDamage(product) {
    const qtyStr = prompt(`How many "${product.name}" were damaged/wasted?`, '1');
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr);
    if (isNaN(qty) || qty <= 0) return;
    const reason = prompt('Reason (optional):', '') || '';

    setSaving(true);
    const today = todayStr();
    await ensureOpeningSnapshot(supabase, profile.shop_id, today, products);

    await supabase.from('damage').insert({
      shop_id: profile.shop_id,
      date: today,
      product_name: product.name,
      category: product.category,
      qty,
      value: qty * product.price,
      arrived_date: product.arrived_date,
      reason,
    });
    await supabase.from('products').update({ stock: Math.max(0, product.stock - qty) }).eq('id', product.id);

    await loadProducts(profile.shop_id);
    setSaving(false);
    setMsg(`✅ Logged ${qty} damaged — ${fmt(qty * product.price)}`);
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading) return <Centered>Loading…</Centered>;

  const today = todayStr();
  const lowStock = products.filter(p => p.stock <= (p.reorder_level || 3));
  const aging = products.filter(p => p.stock > 0 && p.arrived_date &&
    Math.floor((new Date(today) - new Date(p.arrived_date)) / 86400000) >= (AGING_DAYS - 1));

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>📦 Stock — {profile?.full_name}</div>
        <button style={btnOutline} onClick={() => router.push('/shop')}>← Sales</button>
      </div>

      {msg && <div style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      {(lowStock.length > 0 || aging.length > 0) && (
        <div style={{ ...card, border: `1px solid ${colors.red}` }}>
          {lowStock.length > 0 && <div style={{ fontSize: 13, marginBottom: 4 }}>🔻 <b>{lowStock.length}</b> item(s) low on stock: {lowStock.map(p => p.name).join(', ')}</div>}
          {aging.length > 0 && <div style={{ fontSize: 13 }}>⏳ <b>{aging.length}</b> item(s) aging {AGING_DAYS}+ days: {aging.map(p => p.name).join(', ')}</div>}
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📥 Receive Stock</div>
        {products.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 13 }}>{p.name} <span style={{ color: colors.sub }}>({p.stock} now)</span></div>
            <input
              type="number" min="0" placeholder="0"
              style={{ ...input, width: 70, marginBottom: 0, textAlign: 'right' }}
              value={recvQty[p.id] || ''}
              onChange={e => setRecvQty(prev => ({ ...prev, [p.id]: e.target.value }))}
            />
          </div>
        ))}
        <button style={{ ...btnPrimary, width: '100%', marginTop: 10 }} onClick={applyReceived} disabled={saving}>
          {saving ? 'Saving…' : 'Apply Received Stock'}
        </button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠ Current Stock — tap to report damage</div>
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => reportDamage(p)}
            style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border}`, padding: '8px 0', cursor: 'pointer', color: colors.text, textAlign: 'left' }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: colors.sub }}>{p.category} · received {p.arrived_date || '—'}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: p.stock <= (p.reorder_level || 3) ? colors.red : colors.text }}>
              {p.stock}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
