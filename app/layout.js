export const metadata = {
  title: 'BM Counter Manager',
  description: 'Multi-shop cake counter management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#0f1115', color: '#eee' }}>
        {children}
      </body>
    </html>
  );
}
