import "../styles/globals.css";
import type { Metadata } from "next";
import React from "react";
import { Space_Grotesk } from "next/font/google";

const font = Space_Grotesk({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "48×11 LED Badge Studio",
  description: "Client-only tool to create and send sprites to a 48×11 badge."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={font.className}>{children}</body>
    </html>
  );
}
