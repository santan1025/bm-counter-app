// Today's date as YYYY-MM-DD, matching the format used throughout the schema.
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Formats a number as Indian Rupees, e.g. fmt(1234.5) -> "₹1,234.50"
export function fmt(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Every shop has one `daily` row per date (opening/closing stock value, cash boxes,
// itemized snapshots). This fetches today's row for a shop, creating an empty one
// if it doesn't exist yet — so every other function can assume it's always there.
export async function getOrCreateDaily(supabase, shopId, dateStr) {
  const { data: existing } = await supabase
    .from('daily').select('*').eq('shop_id', shopId).eq('date', dateStr).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('daily')
    .insert({ shop_id: shopId, date: dateStr, opening: 0, new_stock: 0, day_box: 0, counter_box: 0 })
    .select().single();
  if (error) { console.error('getOrCreateDaily insert error:', error.message); return null; }
  return created;
}

// Mirrors the single-shop app's bug fix: capture an itemized opening-stock
// snapshot automatically the first time it's needed each day, using whatever
// the live stock actually is at that moment — never lazily re-derived later
// after sales have already reduced it (which would mislabel sold stock as
// "opening" and throw off every reconciliation for the day).
export async function ensureOpeningSnapshot(supabase, shopId, dateStr, products) {
  const daily = await getOrCreateDaily(supabase, shopId, dateStr);
  if (!daily) return null;
  if (daily.opening_snap) return daily; // already captured today

  const snap = products.map(p => ({ id: p.id, n: p.name, c: p.category, p: p.price, stock: p.stock }));
  const openingValue = snap.reduce((a, p) => a + p.p * p.stock, 0);

  const { data: updated, error } = await supabase
    .from('daily')
    .update({ opening_snap: snap, opening: openingValue })
    .eq('shop_id', shopId).eq('date', dateStr)
    .select().single();
  if (error) { console.error('ensureOpeningSnapshot error:', error.message); return daily; }
  return updated;
}
// Looks up the logged-in user's profile row (role + shop_id). Every page that
// needs to know "am I the owner, or which shop am I staff at" calls this once.
export async function getMyProfile(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('getMyProfile error:', error.message);
    return null;
  }
  return data;
}
