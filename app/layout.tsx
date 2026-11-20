import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://www.halalscout.uk'),
  title: "Halal Scout UK",
  description: "Find halal restaurants near you across the UK. HMC certified places, community reviews and photos.",
  openGraph: {
    title: "Halal Scout UK",
    description: "Find halal restaurants near you across the UK.",
    url: 'https://www.halalscout.uk',
    siteName: 'Halal Scout UK',
    type: 'website',
    images: [
      {
        url: 'https://www.halalscout.uk/HSUK.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: 'Halal Scout UK',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Halal Scout UK",
    description: "Find halal restaurants near you across the UK.",
    images: ['https://www.halalscout.uk/HSUK.jpg'],
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
