'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline } from '@/lib/styles';

export default function ShopPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // [{id, name, price, qty}]
  const [payMode, setPayMode] = useState('cash');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'staff' || !p.shop_id) { router.replace('/'); return; }
      setProfile(p);

      const { data: shopRow } = await supabase.from('shops').select('*').eq('id', p.shop_id).single();
      setShop(shopRow);

      await loadProducts(p.shop_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts(shopId) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('shop_id', shopId)
      .order('category').order('name');
    if (error) { setMsg('Could not load products: ' + error.message); return; }
    setProducts(data || []);
  }

  function addToCart(p) {
    setCart(prev => {
      const i = prev.findIndex(c => c.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { id: p.id, name: p.name, price: p.price, cat: p.category, qty: 1 }];
    });
  }

  function changeQty(id, delta) {
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0));
  }

  const cartTotal = cart.reduce((a, c) => a + c.price * c.qty, 0);

  async function confirmSale() {
    if (!cart.length) { setMsg('Cart is empty'); return; }
    setSaving(true);
    setMsg('');

    const { error: saleErr } = await supabase.from('sales').insert({
      shop_id: profile.shop_id,
      staff_id: profile.id,
      date: todayStr(),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, cat: c.cat })),
      sub: cartTotal,
      disc: 0,
      total: cartTotal,
      pay: payMode,
    });

    if (saleErr) {
      setSaving(false);
      setMsg('Could not save sale: ' + saleErr.message);
      return;
    }

    // Deduct stock for each item sold. Done as separate updates (not a single
    // bulk query) so a failure on one item doesn't silently corrupt another.
    for (const c of cart) {
      const current = products.find(p => p.id === c.id);
      if (!current) continue;
      await supabase.from('products')
        .update({ stock: Math.max(0, current.stock - c.qty) })
        .eq('id', c.id);
    }

    await loadProducts(profile.shop_id);
    setCart([]);
    setSaving(false);
    setMsg('✅ Sale saved — ' + fmt(cartTotal));
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Centered>Loading…</Centered>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{shop?.name || 'Shop'}</div>
          <div style={{ fontSize: 12, color: colors.sub }}>{profile?.full_name}</div>
        </div>
        <button style={{ ...btnOutline, padding: '8px 12px', fontSize: 12 }} onClick={handleLogout}>Logout</button>
      </div>

      {msg && (
        <div style={{ ...card, padding: 10, fontSize: 13, background: msg.startsWith('✅') ? 'rgba(46,158,91,.12)' : 'rgba(217,83,79,.12)' }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            style={{ ...card, marginBottom: 0, textAlign: 'left', cursor: 'pointer', border: `1px solid ${colors.border}` }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: colors.sub }}>{p.category}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontWeight: 800, color: colors.gold }}>{fmt(p.price)}</span>
              <span style={{ fontSize: 12, color: p.stock <= 0 ? colors.red : colors.sub }}>
                {p.stock} left
              </span>
            </div>
          </button>
        ))}
        {!products.length && (
          <div style={{ gridColumn: '1 / -1', color: colors.sub, textAlign: 'center', padding: 20 }}>
            No products yet for this shop. Add some in Supabase → Table Editor → products.
          </div>
        )}
      </div>

      {/* Fixed cart bar at bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: colors.card, borderTop: `1px solid ${colors.border}`,
        padding: 12, maxWidth: 480, margin: '0 auto',
      }}>
        {cart.length > 0 && (
          <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
            {cart.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <div style={{ fontSize: 13 }}>{c.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button style={{ ...btnOutline, padding: '2px 8px' }} onClick={() => changeQty(c.id, -1)}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center' }}>{c.qty}</span>
                  <button style={{ ...btnOutline, padding: '2px 8px' }} onClick={() => changeQty(c.id, 1)}>+</button>
                  <span style={{ minWidth: 60, textAlign: 'right', fontWeight: 700 }}>{fmt(c.price * c.qty)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {['cash', 'upi', 'card', 'credit'].map(m => (
            <button
              key={m}
              onClick={() => setPayMode(m)}
              style={{
                ...btnOutline, flex: 1, padding: '8px 4px', fontSize: 12, textTransform: 'uppercase',
                background: payMode === m ? colors.gold : 'transparent',
                color: payMode === m ? '#2a1d00' : colors.text,
                borderColor: payMode === m ? colors.gold : colors.border,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <button
          style={{ ...btnPrimary, width: '100%' }}
          disabled={!cart.length || saving}
          onClick={confirmSale}
        >
          {saving ? 'Saving…' : `Confirm Sale — ${fmt(cartTotal)}`}
        </button>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
