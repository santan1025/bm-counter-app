'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile, fmt, todayStr } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';
import { addCreditSale, lookupCreditHint } from '@/lib/credit';

const PAY_MODES = ['cash', 'upi', 'card', 'credit', 'split'];

export default function ShopPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // [{id, name, price, qty}]
  const [payMode, setPayMode] = useState('cash');
  const [disc, setDisc] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Browse/filter state
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('All');

  // Credit fields
  const [crName, setCrName] = useState('');
  const [crPhone, setCrPhone] = useState('');
  const [crHint, setCrHint] = useState(null);

  // Split fields
  const [spU, setSpU] = useState('');
  const [spC, setSpC] = useState('');

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

  function addToCart(p, qtyDelta = 1) {
    setCart(prev => {
      const i = prev.findIndex(c => c.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        const newQty = next[i].qty + qtyDelta;
        if (newQty <= 0) return next.filter(c => c.id !== p.id);
        next[i] = { ...next[i], qty: newQty };
        return next;
      }
      if (qtyDelta <= 0) return prev;
      return [...prev, { id: p.id, name: p.name, price: p.price, cat: p.category, qty: qtyDelta }];
    });
  }

  function changeQty(id, delta) {
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0));
  }

  function qtyInCart(id) {
    return cart.find(c => c.id === id)?.qty || 0;
  }

  const sub = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const cartTotal = Math.max(0, sub - (parseInt(disc) || 0));

  const quickAddItems = useMemo(() => products.filter(p => p.is_quick_add).slice(0, 6), [products]);

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    return ['All', ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCat !== 'All') list = list.filter(p => p.category === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search]);

  // As staff types a phone number for a credit sale, warn if this customer
  // already has an outstanding balance — same as v15's lookupCreditCustomer.
  async function handlePhoneChange(val) {
    setCrPhone(val);
    if (val.length >= 6 && profile) {
      setCrHint(await lookupCreditHint(supabase, profile.shop_id, val));
    } else {
      setCrHint(null);
    }
  }

  function resetPaymentFields() {
    setCrName(''); setCrPhone(''); setCrHint(null);
    setSpU(''); setSpC('');
  }

  async function confirmSale() {
    if (!cart.length) { setMsg('Cart is empty'); return; }

    if (payMode === 'credit' && !crName.trim()) {
      setMsg('Enter customer name for credit sale');
      return;
    }
    if (payMode === 'split') {
      const u = parseInt(spU) || 0, c = parseInt(spC) || 0;
      if (u + c !== cartTotal && cartTotal > 0) {
        if (!confirm(`Split ₹${u + c} ≠ Total ₹${cartTotal}. Save anyway?`)) return;
      }
    }

    setSaving(true);
    setMsg('');

    const items = cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, cat: c.cat }));
    const salePayload = {
      shop_id: profile.shop_id,
      staff_id: profile.id,
      date: todayStr(),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items,
      sub,
      disc: parseInt(disc) || 0,
      total: cartTotal,
      pay: payMode,
    };
    if (payMode === 'split') {
      salePayload.sp_u = parseInt(spU) || 0;
      salePayload.sp_c = parseInt(spC) || 0;
    }

    const { error: saleErr } = await supabase.from('sales').insert(salePayload);
    if (saleErr) {
      setSaving(false);
      setMsg('Could not save sale: ' + saleErr.message);
      return;
    }

    // Credit sale: also write to the credits ledger so it shows up on the
    // Credit page's Accounts/Ledger tabs.
    if (payMode === 'credit') {
      const ok = await addCreditSale(supabase, profile.shop_id, {
        name: crName.trim(), phone: crPhone.trim(), amt: cartTotal, items, date: todayStr(),
      });
      if (!ok) setMsg('⚠ Sale saved, but credit ledger entry failed — check manually');
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
    setDisc(0);
    resetPaymentFields();
    setSaving(false);
    if (!msg) setMsg('✅ Sale saved — ' + fmt(cartTotal));
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Centered>Loading…</Centered>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, paddingBottom: 240 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{shop?.name || 'Shop'}</div>
          <div style={{ fontSize: 12, color: colors.sub }}>{profile?.full_name}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <NavBtn onClick={() => router.push('/shop/stock')}>📦 Stock</NavBtn>
        <NavBtn onClick={() => router.push('/shop/cash')}>💵 Cash</NavBtn>
        <NavBtn onClick={() => router.push('/shop/credit')}>📒 Credit</NavBtn>
        <NavBtn onClick={() => router.push('/shop/expenses')}>🧾 Expenses</NavBtn>
        <NavBtn onClick={() => router.push('/shop/eod')}>🌙 EOD</NavBtn>
        <NavBtn onClick={handleLogout}>Logout</NavBtn>
      </div>

      {msg && (
        <div style={{ ...card, padding: 10, fontSize: 13, background: msg.startsWith('✅') ? 'rgba(46,158,91,.12)' : 'rgba(217,83,79,.12)' }}>
          {msg}
        </div>
      )}

      {quickAddItems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: colors.sub, textTransform: 'uppercase', marginBottom: 6 }}>⚡ Quick Add</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {quickAddItems.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p, 1)}
                style={{ ...card, marginBottom: 0, textAlign: 'center', cursor: 'pointer', padding: '10px 6px' }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: colors.gold, fontWeight: 700 }}>{fmt(p.price)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        style={{ ...input, marginTop: 10 }}
        placeholder="🔍 Search product…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setActiveCat(c)}
            style={{
              padding: '6px 12px', borderRadius: 20, border: `1px solid ${colors.border}`,
              background: activeCat === c ? colors.gold : 'transparent',
              color: activeCat === c ? '#2a1d00' : colors.text,
              fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={card}>
        {filteredProducts.map(p => {
          const inCart = qtyInCart(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {p.name}{p.stock <= (p.reorder_level || 3) && <span style={{ marginLeft: 6, fontSize: 10, color: colors.red, fontWeight: 800 }}>LOW</span>}
                </div>
                <div style={{ fontSize: 11, color: colors.sub }}>{p.category} · {fmt(p.price)} · stk:{p.stock}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button style={{ ...btnOutline, padding: '4px 10px' }} onClick={() => addToCart(p, -1)}>−</button>
                <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{inCart}</span>
                <button style={{ ...btnOutline, padding: '4px 10px' }} onClick={() => addToCart(p, 1)}>+</button>
              </div>
            </div>
          );
        })}
        {!filteredProducts.length && (
          <div style={{ textAlign: 'center', color: colors.sub, padding: 20 }}>
            {products.length ? 'No products match your search/filter.' : 'No products yet for this shop. Add some in Manage → Add Product.'}
          </div>
        )}
      </div>

      {/* Fixed cart bar at bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: colors.card, borderTop: `1px solid ${colors.border}`,
        padding: 12, maxWidth: 480, margin: '0 auto', maxHeight: '70vh', overflowY: 'auto',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${colors.border}`, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: colors.sub }}>Discount</span>
              <input
                type="number" min="0" placeholder="0"
                style={{ ...input, width: 80, marginBottom: 0, textAlign: 'right' }}
                value={disc || ''}
                onChange={e => setDisc(e.target.value)}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {PAY_MODES.map(m => (
            <button
              key={m}
              onClick={() => setPayMode(m)}
              style={{
                ...btnOutline, flex: 1, padding: '8px 4px', fontSize: 11, textTransform: 'uppercase',
                background: payMode === m ? colors.gold : 'transparent',
                color: payMode === m ? '#2a1d00' : colors.text,
                borderColor: payMode === m ? colors.gold : colors.border,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {payMode === 'credit' && (
          <div style={{ marginBottom: 8 }}>
            <input style={{ ...input, marginBottom: 6 }} placeholder="Customer name *" value={crName} onChange={e => setCrName(e.target.value)} />
            <input style={{ ...input, marginBottom: 4 }} placeholder="Phone (recommended)" value={crPhone} onChange={e => handlePhoneChange(e.target.value)} />
            {crHint && (
              <div style={{ fontSize: 12, color: crHint.balance > 0 ? colors.red : colors.green, marginBottom: 4 }}>
                {crHint.balance > 0 ? `⚠️ Existing customer — already owes ${fmt(crHint.balance)}` : '✓ Existing customer — no balance due'}
              </div>
            )}
          </div>
        )}

        {payMode === 'split' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input style={{ ...input, marginBottom: 0 }} type="number" placeholder="UPI amount" value={spU} onChange={e => setSpU(e.target.value)} />
            <input style={{ ...input, marginBottom: 0 }} type="number" placeholder="Cash amount" value={spC} onChange={e => setSpC(e.target.value)} />
          </div>
        )}

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

function NavBtn({ onClick, children }) {
  return (
    <button style={{ ...btnOutline, padding: '8px 12px', fontSize: 12 }} onClick={onClick}>
      {children}
    </button>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>{children}</div>;
}
