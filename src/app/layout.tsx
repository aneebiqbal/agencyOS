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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://agencyos.app"),
  title: {
    default: "Agency OS",
    template: "%s | Agency OS",
  },
  description: "Operational command center for sales, delivery, people, payroll, and finance teams.",
  robots: {
    index: true,
    follow: true,
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
