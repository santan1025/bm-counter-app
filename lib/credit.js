// ============================================================================
// Credit / Customer Accounts — mirrors v15's phone-based ledger exactly.
// A customer's balance = everything they've been given on credit, minus
// everything settled — whether settled via the old per-sale "Mark Paid"
// flag OR a separate lump-sum payment (e.g. a month-end settlement that
// doesn't map to any single sale). Both paths net into the same balance.
// ============================================================================

function accountKey(phone, name) {
  return phone ? 'p:' + phone : 'n:' + (name || '').toLowerCase();
}

// Builds one row per customer (grouped by phone, falling back to lowercased
// name if no phone was recorded), with a running balance.
export async function getCustomerAccounts(supabase, shopId) {
  const { data: credits } = await supabase.from('credits').select('*').eq('shop_id', shopId);
  const { data: payments } = await supabase.from('credit_payments').select('*').eq('shop_id', shopId);

  const map = {};
  (credits || []).forEach(c => {
    const key = accountKey(c.phone, c.name);
    if (!map[key]) map[key] = { key, name: c.name, phone: c.phone || '', given: 0, settled: 0, items: 0, lastDate: c.date };
    map[key].given += Number(c.amt || 0);
    if (c.paid) map[key].settled += Number(c.amt || 0);
    map[key].items++;
    if (c.date > map[key].lastDate) map[key].lastDate = c.date;
    if (c.name && c.name.length > map[key].name.length) map[key].name = c.name;
  });
  (payments || []).forEach(p => {
    const key = accountKey(p.phone, p.name);
    if (!map[key]) map[key] = { key, name: p.name, phone: p.phone || '', given: 0, settled: 0, items: 0, lastDate: p.date };
    map[key].settled += Number(p.amt || 0);
    if (p.date > map[key].lastDate) map[key].lastDate = p.date;
  });

  return Object.values(map)
    .map(a => ({ ...a, balance: Math.max(0, a.given - a.settled) }))
    .sort((a, b) => b.balance - a.balance);
}

// Used at point-of-sale: as staff types a phone number into the credit form,
// this tells them if that customer already has an outstanding balance.
export async function lookupCreditHint(supabase, shopId, phone) {
  if (!phone || phone.length < 6) return null;
  const accounts = await getCustomerAccounts(supabase, shopId);
  return accounts.find(a => a.phone === phone) || null;
}

export async function getCreditLedger(supabase, shopId) {
  const { data } = await supabase.from('credits').select('*').eq('shop_id', shopId).order('date', { ascending: false });
  return data || [];
}

export async function getPaymentHistory(supabase, shopId) {
  const { data } = await supabase.from('credit_payments').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
  return data || [];
}

export async function recordPayment(supabase, shopId, { phone, name, amt, note }) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('credit_payments').insert({
    shop_id: shopId, phone: phone || null, name, amt, date: today, note: note || null,
  });
  if (error) { console.error('recordPayment error:', error.message); return false; }
  return true;
}

export async function markCreditPaid(supabase, shopId, creditId) {
  const { error } = await supabase.from('credits').update({ paid: true }).eq('id', creditId).eq('shop_id', shopId);
  return !error;
}

export async function editCreditAmount(supabase, shopId, creditId, newAmt) {
  const { error } = await supabase.from('credits').update({ amt: newAmt }).eq('id', creditId).eq('shop_id', shopId);
  return !error;
}

export async function deleteCredit(supabase, shopId, creditId) {
  const { error } = await supabase.from('credits').delete().eq('id', creditId).eq('shop_id', shopId);
  return !error;
}

export async function deletePayment(supabase, shopId, paymentId) {
  const { error } = await supabase.from('credit_payments').delete().eq('id', paymentId).eq('shop_id', shopId);
  return !error;
}

// Records a NEW credit sale — called from the Sales screen when payment
// mode = credit. Kept here so both Sales and Credit pages share one path.
export async function addCreditSale(supabase, shopId, { name, phone, amt, items, date }) {
  const { error } = await supabase.from('credits').insert({
    shop_id: shopId, name, phone: phone || null, amt, items, date, paid: false,
  });
  return !error;
}
