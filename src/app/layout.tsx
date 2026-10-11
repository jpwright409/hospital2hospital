import type { Metadata } from "next";
import { Shell } from "@/components/marketplace";
import "./globals.css";
import { getAppMode } from "@/lib/app-mode";
export const metadata: Metadata = { title: "Hospital2Hospital | A better connection", description: getAppMode() === "demo" ? "A free facility-to-facility surgical supply marketplace. Local prototype with fictional inventory." : "A free marketplace for approved healthcare facilities with surgical inventory and private facility conversations." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><Shell>{children}</Shell></body></html>; }
