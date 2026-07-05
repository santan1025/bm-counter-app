// ============================================================================
// Expenses — shop costs (milk, electrician, packaging, etc.) paid straight
// out of the till. Mirrors v15's expense flow, with one bug fixed:
// v15 subtracted from a field called `cashBox` that nothing else in the app
// ever read — every other screen used `dayBox`. So in v15, logging a
// "paid from cash" expense recorded the expense correctly, but the Day Box
// total staff sees never actually went down. Here, the deduction always
// hits the real field the rest of the app reads (day_box on `daily`, or
// counter_box on `shops`) — no silent no-op deductions.
// ============================================================================

export const EXP_CATEGORIES = [
  'Shop Supplies', 'Electricity', 'Packaging', 'Transport / Auto',
  'Food / Tea', 'Repair', 'Salary / Wages', 'Cleaning', 'Miscellaneous',
];

// Where the cash physically came from. 'other' = not from the till at all
// (e.g. owner paid separately) — no deduction happens for that case.
export const EXP_SOURCES = [
  { key: 'daybox', label: "Day Box (today's till)" },
  { key: 'counterbox', label: 'Counter Box (running total)' },
  { key: 'other', label: 'Other (not from till)' },
];

export async function getExpensesForDate(supabase, shopId, dateStr) {
  const { data } = await supabase
    .from('expenses').select('*').eq('shop_id', shopId).eq('date', dateStr).order('created_at', { ascending: false });
  return data || [];
}

export async function addExpense(supabase, shopId, { category, description, amt, source, noteDet }) {
  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (source === 'daybox') {
    const { data: daily } = await supabase.from('daily').select('day_box, day_box_det').eq('shop_id', shopId).eq('date', today).maybeSingle();
    const cur = daily?.day_box || 0;
    if (amt > cur) return { ok: false, reason: `Expense ₹${amt} exceeds Day Box ₹${cur}` };
    const curDet = { ...(daily?.day_box_det || {}) };
    Object.entries(noteDet || {}).forEach(([n, v]) => { curDet[n] = Math.max(0, (curDet[n] || 0) - v); });
    await supabase.from('daily').update({ day_box: cur - amt, day_box_det: curDet }).eq('shop_id', shopId).eq('date', today);
  }

  if (source === 'counterbox') {
    const { data: shop } = await supabase.from('shops').select('counter_box, counter_box_det').eq('id', shopId).single();
    const cur = shop?.counter_box || 0;
    if (amt > cur) return { ok: false, reason: `Expense ₹${amt} exceeds Counter Box ₹${cur}` };
    const curDet = { ...(shop?.counter_box_det || {}) };
    Object.entries(noteDet || {}).forEach(([n, v]) => { curDet[n] = Math.max(0, (curDet[n] || 0) - v); });
    await supabase.from('shops').update({ counter_box: cur - amt, counter_box_det: curDet }).eq('id', shopId);
  }

  const { error } = await supabase.from('expenses').insert({
    shop_id: shopId, date: today, time, category, description, amt, source, note_det: noteDet || {},
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Reverses the deduction (adds cash back) before removing the expense record —
// so deleting a mistaken entry doesn't leave the till permanently short.
export async function deleteExpense(supabase, shopId, expense) {
  const today = new Date().toISOString().split('T')[0];

  if (expense.source === 'daybox') {
    const { data: daily } = await supabase.from('daily').select('day_box, day_box_det').eq('shop_id', shopId).eq('date', expense.date).maybeSingle();
    const curDet = { ...(daily?.day_box_det || {}) };
    Object.entries(expense.note_det || {}).forEach(([n, v]) => { curDet[n] = (curDet[n] || 0) + v; });
    await supabase.from('daily').update({ day_box: (daily?.day_box || 0) + expense.amt, day_box_det: curDet }).eq('shop_id', shopId).eq('date', expense.date);
  }

  if (expense.source === 'counterbox') {
    const { data: shop } = await supabase.from('shops').select('counter_box, counter_box_det').eq('id', shopId).single();
    const curDet = { ...(shop?.counter_box_det || {}) };
    Object.entries(expense.note_det || {}).forEach(([n, v]) => { curDet[n] = (curDet[n] || 0) + v; });
    await supabase.from('shops').update({ counter_box: (shop?.counter_box || 0) + expense.amt, counter_box_det: curDet }).eq('id', shopId);
  }

  const { error } = await supabase.from('expenses').delete().eq('id', expense.id).eq('shop_id', shopId);
  return !error;
}

export async function getExpenseSummary(supabase, shopId, dateStr) {
  const exps = await getExpensesForDate(supabase, shopId, dateStr);
  const total = exps.reduce((a, e) => a + Number(e.amt || 0), 0);
  const fromTill = exps.filter(e => e.source === 'daybox' || e.source === 'counterbox').reduce((a, e) => a + Number(e.amt || 0), 0);
  return { total, fromTill, count: exps.length };
}
