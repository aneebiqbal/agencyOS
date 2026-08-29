import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ClientOverlays } from "@/components/client-overlays";
import "./globals.css";

const appSans = Plus_Jakarta_Sans({
  variable: "--font-app-sans",
  subsets: ["latin"],
  display: "swap",
});

const appMono = IBM_Plex_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://agencyos.internal"),
  title: {
    default: "Agency OS",
    template: "%s | Agency OS",
  },
  description: "Operational command center for sales, delivery, people, payroll, and finance teams.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-image-preview": "none",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Agency OS",
    description: "Operational command center for software delivery organizations.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Agency OS",
    description: "Operational command center for software delivery organizations.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${appSans.variable} ${appMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
        <ClientOverlays />
      </body>
    </html>
  );
}
