// Today's date as YYYY-MM-DD, matching the format used throughout the schema.
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Formats a number as Indian Rupees, e.g. fmt(1234.5) -> "₹1,234.50"
export function fmt(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
