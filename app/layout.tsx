import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SellSnap — Sell Anything in Seconds Using Just a Link',
  description:
    'Link-based commerce for Nigerian business owners and creators. Create a product, generate a unique payment link, and get paid instantly.',
  keywords: ['Nigeria commerce', 'payment link', 'Flutterwave', 'WhatsApp sales', 'SellSnap'],
  openGraph: {
    title: 'SellSnap — Instant Payment Links for Your Products',
    description: 'Sell anything in seconds using just a link. Direct payments in Naira via Flutterwave.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
