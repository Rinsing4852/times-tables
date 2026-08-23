import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recall Forge",
  description: "Adaptive times tables practice",
  applicationName: "Recall Forge",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/assets/creatures/blob-champion.svg",
    apple: "/assets/creatures/blob-champion.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Recall Forge",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
