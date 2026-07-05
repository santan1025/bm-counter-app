// ============================================================================
// Owner Dashboard v2 — cross-shop aggregation. The owner's RLS policies
// bypass shop_id filtering entirely (see is_owner() in schema.sql), so every
// query here naturally returns rows from ALL shops in one go.
// ============================================================================

export function periodDates(period) {
  const end = new Date();
  const start = new Date();
  if (period === 'today') {
    // start = end = today
  } else if (period === 'week') {
    start.setDate(start.getDate() - 6);
  } else if (period === 'month') {
    start.setDate(start.getDate() - 29);
  }
  const toStr = d => d.toISOString().split('T')[0];
  return { start: toStr(start), end: toStr(end) };
}

// Per-shop sales rollup for a date range — total, txn count, payment split.
export async function getShopRollup(supabase, period) {
  const { start, end } = periodDates(period);
  const { data: shops } = await supabase.from('shops').select('*').order('name');
  const { data: sales } = await supabase
    .from('sales').select('shop_id, total, pay, sp_u, sp_c, date')
    .gte('date', start).lte('date', end);

  const rows = (shops || []).map(shop => {
    const s = (sales || []).filter(x => x.shop_id === shop.id);
    const byp = (mode) => s.filter(x => x.pay === mode).reduce((a, x) => a + Number(x.total || 0), 0);
    const upi = byp('upi') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_u || 0), 0);
    const cash = byp('cash') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_c || 0), 0);
    return {
      shop, total: s.reduce((a, x) => a + Number(x.total || 0), 0), txnCount: s.length,
      upi, cash, card: byp('card'), credit: byp('credit'),
    };
  }).sort((a, b) => b.total - a.total);

  return rows;
}

// Top-selling products across ALL shops for a date range, by revenue.
export async function getTopSellers(supabase, period, limit = 10) {
  const { start, end } = periodDates(period);
  const { data: sales } = await supabase
    .from('sales').select('items, date').gte('date', start).lte('date', end);

  const tally = {};
  (sales || []).forEach(s => {
    (s.items || []).forEach(i => {
      if (!tally[i.name]) tally[i.name] = { name: i.name, qty: 0, rev: 0 };
      tally[i.name].qty += i.qty || 0;
      tally[i.name].rev += (i.price || 0) * (i.qty || 0);
    });
  });
  return Object.values(tally).sort((a, b) => b.rev - a.rev).slice(0, limit);
}

// Credit due, grouped by shop — reuses the same account-balance logic as
// the per-shop Credit page, just without a shop_id filter.
export async function getCreditSummaryAllShops(supabase) {
  const { data: shops } = await supabase.from('shops').select('id, name').order('name');
  const { data: credits } = await supabase.from('credits').select('*');
  const { data: payments } = await supabase.from('credit_payments').select('*');

  return (shops || []).map(shop => {
    const key = (phone, name) => phone ? 'p:' + phone : 'n:' + (name || '').toLowerCase();
    const map = {};
    (credits || []).filter(c => c.shop_id === shop.id).forEach(c => {
      const k = key(c.phone, c.name);
      if (!map[k]) map[k] = { name: c.name, phone: c.phone || '', given: 0, settled: 0 };
      map[k].given += Number(c.amt || 0);
      if (c.paid) map[k].settled += Number(c.amt || 0);
    });
    (payments || []).filter(p => p.shop_id === shop.id).forEach(p => {
      const k = key(p.phone, p.name);
      if (!map[k]) map[k] = { name: p.name, phone: p.phone || '', given: 0, settled: 0 };
      map[k].settled += Number(p.amt || 0);
    });
    const accounts = Object.values(map).map(a => ({ ...a, balance: Math.max(0, a.given - a.settled) })).filter(a => a.balance > 0.5);
    return { shop, totalDue: accounts.reduce((a, x) => a + x.balance, 0), accounts: accounts.sort((a, b) => b.balance - a.balance) };
  }).sort((a, b) => b.totalDue - a.totalDue);
}

// Low-stock + aging alerts across all shops.
export async function getStockAlerts(supabase, agingDays = 3) {
  const { data: shops } = await supabase.from('shops').select('id, name').order('name');
  const { data: products } = await supabase.from('products').select('*');
  const today = new Date().toISOString().split('T')[0];

  return (shops || []).map(shop => {
    const prods = (products || []).filter(p => p.shop_id === shop.id);
    const low = prods.filter(p => p.stock <= (p.reorder_level || 3));
    const aging = prods.filter(p => p.stock > 0 && p.arrived_date &&
      Math.floor((new Date(today) - new Date(p.arrived_date)) / 86400000) >= agingDays);
    return { shop, low, aging };
  }).filter(r => r.low.length > 0 || r.aging.length > 0);
}

// Full history lookup for one specific date, across all shops — sales,
// cash boxes, credit, and stock closing, for reviewing any past day.
export async function getHistoryForDate(supabase, dateStr) {
  const { data: shops } = await supabase.from('shops').select('id, name').order('name');
  const { data: sales } = await supabase.from('sales').select('*').eq('date', dateStr);
  const { data: dailyRows } = await supabase.from('daily').select('*').eq('date', dateStr);
  const { data: damage } = await supabase.from('damage').select('shop_id, value').eq('date', dateStr);

  return (shops || []).map(shop => {
    const s = (sales || []).filter(x => x.shop_id === shop.id);
    const daily = (dailyRows || []).find(d => d.shop_id === shop.id) || {};
    const dmgTotal = (damage || []).filter(d => d.shop_id === shop.id).reduce((a, d) => a + Number(d.value || 0), 0);
    const byp = (mode) => s.filter(x => x.pay === mode).reduce((a, x) => a + Number(x.total || 0), 0);
    const upi = byp('upi') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_u || 0), 0);
    const cash = byp('cash') + s.filter(x => x.pay === 'split').reduce((a, x) => a + Number(x.sp_c || 0), 0);
    return {
      shop, txnCount: s.length, total: s.reduce((a, x) => a + Number(x.total || 0), 0),
      upi, cash, card: byp('card'), credit: byp('credit'),
      opening: daily.opening || 0, newStock: daily.new_stock || 0, closingValue: daily.closing_value,
      dayBox: daily.day_box, counterBox: daily.counter_box, damage: dmgTotal,
    };
  });
}

export function exportRollupCSV(rows, period) {
  const header = ['Shop', 'Total Sales', 'Transactions', 'UPI', 'Cash', 'Card', 'Credit'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    lines.push([r.shop.name, r.total, r.txnCount, r.upi, r.cash, r.card, r.credit].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `owner-rollup-${period}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}
