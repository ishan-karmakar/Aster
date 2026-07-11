import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aster-homework-planner.yashman9012.chatgpt.site"),
  title: "Aster — Homework, calmly planned",
  description: "An intelligent homework planner that balances assignments, deadlines, and study time.",
  openGraph: { title: "Aster — Homework, calmly planned", description: "Your private, intelligent study planner.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Aster — Homework, calmly planned", description: "Your private, intelligent study planner.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
