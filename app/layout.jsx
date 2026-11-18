import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AppProvider } from "@/lib/store";
import { ToastProvider } from "@/components/Toast";

export const metadata = {
  title: "Selah Live — scripture and songs in OBS",
  description: "Free, works offline, updates itself. Show Bible verses, song lyrics and text in OBS.",
  icons: { icon: "/icons/icon.svg" },
};
export const viewport = { themeColor: "#0B1020", colorScheme: "dark light" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta name="color-scheme" content="dark light" />
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <AuthProvider><AppProvider><ToastProvider>{children}</ToastProvider></AppProvider></AuthProvider>
      </body>
    </html>
  );
}
