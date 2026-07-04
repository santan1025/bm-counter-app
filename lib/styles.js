// Small shared style tokens — kept as plain JS objects (no CSS framework needed
// for a functional internal tool at this stage). Matches the Navy/Gold identity
// already established for Yatharthaya Enterprises branding.
export const colors = {
  navy: '#1C3D5E',
  gold: '#E8A020',
  bg: '#0f1115',
  card: '#171a21',
  border: '#2a2e38',
  text: '#eee',
  sub: '#9aa0ab',
  green: '#2e9e5b',
  red: '#d9534f',
  blue: '#3b82c4',
};

export const card = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
};

export const btnPrimary = {
  background: colors.gold,
  color: '#2a1d00',
  border: 'none',
  borderRadius: 10,
  padding: '12px 18px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
};

export const btnOutline = {
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: '12px 18px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 14,
};

export const input = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0d0f13',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: colors.text,
  fontSize: 15,
  marginBottom: 10,
};
