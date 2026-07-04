// ============================================================================
// Cash Handling — denominations, calculations, and Supabase read/writes.
// Mirrors counter-manager-v15.html's dual cash-box system exactly:
//   Day Box     = today's cash only, resets to 0 each day (stored on `daily`)
//   Counter Box = the shop's real running till balance, survives day
//                 rollover forever (stored on `shops`, NOT `daily`)
// ============================================================================

// Same denomination set as v15, including the coin versions of ₹20/₹10
// (India has both note and coin forms in circulation for these).
export const NOTES = ['2000', '500', '200', '100', '50', '20', '20c', '10', '10c', '5', '2', '1'];
export const NOTE_BILLS = ['2000', '500', '200', '100', '50', '20', '10'];
export const NOTE_COINS = ['20c', '10c', '5', '2', '1'];

const NOTE_VAL = { '2000': 2000, '500': 500, '200': 200, '100': 100, '50': 50, '20': 20, '20c': 20, '10': 10, '10c': 10, '5': 5, '2': 2, '1': 1 };

export function nval(n) { return NOTE_VAL[n] !== undefined ? NOTE_VAL[n] : parseInt(n); }

// Marks the coin versions of ₹20/₹10 with a coin icon so they're never
// confused with the note versions in the UI.
export function nlabel(n) { return (n === '20c' || n === '10c') ? nval(n) + '🪙' : n; }

// Total value of a denomination-count object, e.g. {'500':2,'10':3} -> 1030
export function calcTotal(det) {
  if (!det) return 0;
  return NOTES.reduce((a, n) => a + (det[n] || 0) * nval(n), 0);
}

// Suggests the smallest-count note/coin breakdown for change, largest
// denomination first. Suggestion only — staff hands back whatever's in the till.
export function suggestChange(amt) {
  const vals = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  let left = Math.round(amt || 0);
  const parts = [];
  vals.forEach(v => {
    const c = Math.floor(left / v);
    if (c > 0) { parts.push('₹' + v + '×' + c); left -= c * v; }
  });
  return parts.join('  +  ');
}

// ── Expected cash for a day (from actual sales — the "should be in the till" figure) ──
export async function getExpectedCash(supabase, shopId, dateStr) {
  const { data: sales } = await supabase
    .from('sales').select('total, pay, sp_c').eq('shop_id', shopId).eq('date', dateStr);
  if (!sales) return 0;
  return sales.reduce((a, s) => {
    if (s.pay === 'cash') return a + Number(s.total || 0);
    if (s.pay === 'split') return a + Number(s.sp_c || 0);
    return a;
  }, 0);
}

// ── DAY BOX (per-date, resets every day) ──────────────────────────────────
export async function saveDayBox(supabase, shopId, dateStr, det) {
  const total = calcTotal(det);
  const { error } = await supabase
    .from('daily')
    .update({ day_box: total, day_box_det: det })
    .eq('shop_id', shopId).eq('date', dateStr);
  if (error) { console.error('saveDayBox error:', error.message); return null; }
  return total;
}

// ── COUNTER BOX (global per shop, lives on `shops`, survives day rollover) ──
export async function getShopCounterBox(supabase, shopId) {
  const { data, error } = await supabase
    .from('shops').select('counter_box, counter_box_det').eq('id', shopId).single();
  if (error) { console.error('getShopCounterBox error:', error.message); return { counter_box: 0, counter_box_det: {} }; }
  return { counter_box: data.counter_box || 0, counter_box_det: data.counter_box_det || {} };
}

export async function saveCounterBox(supabase, shopId, det) {
  const total = calcTotal(det);
  const { error } = await supabase
    .from('shops').update({ counter_box: total, counter_box_det: det }).eq('id', shopId);
  if (error) { console.error('saveCounterBox error:', error.message); return null; }
  return total;
}

// Merges today's Day Box into the shop's persistent Counter Box, note-by-note,
// then zeroes out Day Box for today (it's been "banked" into the till total).
export async function mergeDayToCounter(supabase, shopId, dateStr) {
  const { data: daily } = await supabase
    .from('daily').select('day_box, day_box_det').eq('shop_id', shopId).eq('date', dateStr).maybeSingle();
  const dayBox = daily?.day_box || 0;
  if (dayBox <= 0) return { ok: false, reason: 'Day Box is empty — count cash first' };

  const { counter_box, counter_box_det } = await getShopCounterBox(supabase, shopId);
  const cbDet = { ...counter_box_det };
  const dbDet = daily?.day_box_det || {};
  Object.entries(dbDet).forEach(([n, v]) => { cbDet[n] = (cbDet[n] || 0) + v; });

  const newTotal = counter_box + dayBox;
  await supabase.from('shops').update({ counter_box: newTotal, counter_box_det: cbDet }).eq('id', shopId);
  await supabase.from('daily').update({ day_box: 0, day_box_det: {} }).eq('shop_id', shopId).eq('date', dateStr);

  return { ok: true, newTotal };
}

// ── HANDOVER (Counter Box → owner/manager, physically leaves the shop till) ──
export async function doHandover(supabase, shopId, { to, amt, note }) {
  const { counter_box } = await getShopCounterBox(supabase, shopId);
  if (amt > counter_box) return { ok: false, reason: `Amount exceeds Counter Box (₹${counter_box})` };

  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  await supabase.from('handovers').insert({ shop_id: shopId, date: today, time, handed_to: to, amt, note });
  await supabase.from('shops').update({ counter_box: counter_box - amt }).eq('id', shopId);

  return { ok: true, newTotal: counter_box - amt };
}

export async function getHandoverLog(supabase, shopId, dateStr) {
  const { data } = await supabase
    .from('handovers').select('*').eq('shop_id', shopId).eq('date', dateStr).order('created_at', { ascending: false });
  return data || [];
}

// ── CLOSING STOCK — the correct formula, used everywhere, always ─────────
// v15 had a bug: its final EOD step and closeDay() forgot to subtract
// damage, so tomorrow's opening stock was silently overstated on any day
// with damage/wastage logged. This is the ONE formula used everywhere here —
// no second, damage-less copy of it exists anywhere else in this codebase.
export function computeClosing(opening, newStock, salesTotal, damageTotal) {
  return Math.max(0, (opening || 0) + (newStock || 0) - (salesTotal || 0) - (damageTotal || 0));
}

export async function getDamageTotal(supabase, shopId, dateStr) {
  const { data } = await supabase.from('damage').select('value').eq('shop_id', shopId).eq('date', dateStr);
  return (data || []).reduce((a, d) => a + Number(d.value || 0), 0);
}

export async function getSalesTotal(supabase, shopId, dateStr) {
  const { data } = await supabase.from('sales').select('total').eq('shop_id', shopId).eq('date', dateStr);
  return (data || []).reduce((a, s) => a + Number(s.total || 0), 0);
}

// Closes the day: snapshots closing stock, writes closing_value using the
// CORRECT (damage-inclusive) formula, and carries that value forward as
// tomorrow's opening — same automatic-carry behavior as v15, bug fixed.
export async function closeDay(supabase, shopId, dateStr, products) {
  const { data: daily } = await supabase
    .from('daily').select('*').eq('shop_id', shopId).eq('date', dateStr).maybeSingle();
  const opening = daily?.opening || 0;
  const newStock = daily?.new_stock || 0;

  const salesTotal = await getSalesTotal(supabase, shopId, dateStr);
  const damageTotal = await getDamageTotal(supabase, shopId, dateStr);
  const closing = computeClosing(opening, newStock, salesTotal, damageTotal);

  const closingSnap = products.map(p => ({ id: p.id, n: p.name, c: p.category, p: p.price, stock: p.stock }));

  await supabase.from('daily').update({
    closing_snap: closingSnap,
    closing_value: closing,
  }).eq('shop_id', shopId).eq('date', dateStr);

  // Carry forward: tomorrow's opening = today's closing
  const tmr = new Date(dateStr + 'T00:00:00');
  tmr.setDate(tmr.getDate() + 1);
  const tmrStr = tmr.toISOString().split('T')[0];

  const { data: existingTmr } = await supabase
    .from('daily').select('shop_id').eq('shop_id', shopId).eq('date', tmrStr).maybeSingle();

  if (existingTmr) {
    await supabase.from('daily').update({ opening: closing, opening_snap: closingSnap }).eq('shop_id', shopId).eq('date', tmrStr);
  } else {
    await supabase.from('daily').insert({
      shop_id: shopId, date: tmrStr, opening: closing, opening_snap: closingSnap,
      new_stock: 0, day_box: 0,
    });
  }

  return { closing, salesTotal, damageTotal, opening, newStock };
}
