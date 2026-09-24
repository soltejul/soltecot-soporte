import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SOLTECOT_ OS | Laboratorio & Taller de Reparación",
    template: "%s | SOLTECOT_ OS",
  },
  description: "Plataforma de gestión técnica, diagnóstico de hardware y seguimiento de órdenes para laboratorio SOLTECOT.",
  icons: {
    icon: "/logo-soltecot.png",
    shortcut: "/logo-soltecot.png",
    apple: "/logo-soltecot.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-black text-white selection:bg-emerald-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}