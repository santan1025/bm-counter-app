'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyProfile } from '@/lib/helpers';
import { colors, card, btnPrimary, btnOutline, input } from '@/lib/styles';

export default function ManagePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getMyProfile(supabase);
      if (!p) { router.replace('/login'); return; }
      if (p.role !== 'owner') { router.replace('/'); return; }
      setProfile(p);
      await loadShops();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadShops() {
    const { data } = await supabase.from('shops').select('*').order('name');
    setShops(data || []);
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.sub }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: colors.gold }}>⚙️ Manage</div>
        <button style={btnOutline} onClick={() => router.push('/owner')}>← Back to Dashboard</button>
      </div>

      <AddShopForm supabase={supabase} onAdded={loadShops} />
      <AddProductForm supabase={supabase} shops={shops} />
      <AddStaffForm supabase={supabase} shops={shops} />
      <ShopList shops={shops} />
    </div>
  );
}

function AddShopForm({ supabase, onAdded }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setMsg('');
    const { error } = await supabase.from('shops').insert({ name, address, phone });
    setSaving(false);
    if (error) { setMsg('❌ ' + error.message); return; }
    setMsg('✅ Shop added');
    setName(''); setAddress(''); setPhone('');
    onAdded();
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <form onSubmit={submit} style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>🏪 Add a New Shop</div>
      <label style={{ fontSize: 12, color: colors.sub }}>Shop Name</label>
      <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BM Ventures - Ghansoli" required />
      <label style={{ fontSize: 12, color: colors.sub }}>Address (optional)</label>
      <input style={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Shop address" />
      <label style={{ fontSize: 12, color: colors.sub }}>Phone (optional)</label>
      <input style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contact number" />
      {msg && <div style={{ fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Add Shop'}</button>
    </form>
  );
}

function AddProductForm({ supabase, shops }) {
  const [shopId, setShopId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!shopId) { setMsg('❌ Pick a shop first'); return; }
    setSaving(true); setMsg('');
    const { error } = await supabase.from('products').insert({
      shop_id: shopId, name, category, price: parseFloat(price) || 0, stock: parseInt(stock) || 0,
      arrived_date: new Date().toISOString().split('T')[0],
    });
    setSaving(false);
    if (error) { setMsg('❌ ' + error.message); return; }
    setMsg('✅ Product added');
    setName(''); setCategory(''); setPrice(''); setStock('');
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <form onSubmit={submit} style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>🍰 Add a Product</div>
      <label style={{ fontSize: 12, color: colors.sub }}>Shop</label>
      <select style={input} value={shopId} onChange={e => setShopId(e.target.value)} required>
        <option value="">Select a shop…</option>
        {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label style={{ fontSize: 12, color: colors.sub }}>Product Name</label>
      <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chocolate Pastry" required />
      <label style={{ fontSize: 12, color: colors.sub }}>Category</label>
      <input style={input} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Pastry" />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: colors.sub }}>Price (₹)</label>
          <input style={input} type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="60" required />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: colors.sub }}>Starting Stock</label>
          <input style={input} type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="20" required />
        </div>
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Add Product'}</button>
    </form>
  );
}

function AddStaffForm({ supabase, shops }) {
  const [shopId, setShopId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!shopId) { setMsg('❌ Pick a shop first'); return; }
    setSaving(true); setMsg('');

    // Send the owner's own access token along, so the server can verify this
    // request really comes from a logged-in owner before creating anything.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/create-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ email, password, full_name: fullName, shop_id: shopId }),
    });
    const result = await res.json();
    setSaving(false);

    if (!res.ok) { setMsg('❌ ' + result.error); return; }
    setMsg(`✅ Staff account created for ${fullName}`);
    setFullName(''); setEmail(''); setPassword('');
    setTimeout(() => setMsg(''), 4000);
  }

  return (
    <form onSubmit={submit} style={{ ...card, border: `2px solid ${colors.gold}` }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>👤 Add a Staff Login</div>
      <div style={{ fontSize: 12, color: colors.sub, marginBottom: 10 }}>
        Creates a real login for this person, already assigned to one shop. Share the email + password with them directly — there's no email sent automatically yet.
      </div>
      <label style={{ fontSize: 12, color: colors.sub }}>Shop</label>
      <select style={input} value={shopId} onChange={e => setShopId(e.target.value)} required>
        <option value="">Select a shop…</option>
        {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label style={{ fontSize: 12, color: colors.sub }}>Staff Name</label>
      <input style={input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Salve Tanmay" required />
      <label style={{ fontSize: 12, color: colors.sub }}>Login Email</label>
      <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@example.com" required />
      <label style={{ fontSize: 12, color: colors.sub }}>Login Password</label>
      <input style={input} type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required />
      {msg && <div style={{ fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Creating…' : 'Create Staff Login'}</button>
    </form>
  );
}

function ShopList({ shops }) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Existing Shops</div>
      {shops.length === 0 && <div style={{ color: colors.sub, fontSize: 13 }}>No shops yet — add one above.</div>}
      {shops.map(s => (
        <div key={s.id} style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
          <div style={{ fontWeight: 700 }}>{s.name}</div>
          <div style={{ color: colors.sub, fontSize: 11 }}>{s.address || 'No address set'}</div>
        </div>
      ))}
    </div>
  );
}
