import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Halal Scout UK",
  description: "Find halal restaurants near you across the UK. HMC certified places, community reviews and photos.",
  openGraph: {
    title: "Halal Scout UK",
    description: "Find halal restaurants near you across the UK.",
    url: 'https://halalscout.uk',
    images: [{ url: 'https://halalscout.uk/HSUK.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://halalscout.uk/HSUK.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
