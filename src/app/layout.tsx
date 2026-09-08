import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Life Reset',
  description: 'A 21-day guided reset for the parts of your life that have drifted.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${sourceSerif.variable}`}>
      <body className="bg-paper text-ink antialiased">
        <div className="first-light" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
