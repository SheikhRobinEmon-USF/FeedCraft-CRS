import "@fontsource-variable/manrope";
import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: { default: "FeedCraft", template: "%s · FeedCraft" },
  description: "Watch original demo clips and inspect the decisions behind your recommendations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
