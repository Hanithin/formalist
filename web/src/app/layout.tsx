import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Les polices sont servies depuis le projet, pas depuis un CDN : la politique de
 * sécurité de contenu interdit les origines externes, et une police qui n'arrive
 * pas fait basculer toute la page sur une substitution.
 */
const calSans = localFont({
  src: "./fonts/CalSans-SemiBold.otf",
  variable: "--police-titre",
  weight: "600",
  display: "swap",
});

const matter = localFont({
  src: "./fonts/Matter-Regular.ttf",
  variable: "--police-texte",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Formalist",
  description: "Création et modification de sociétés, accompagnées par des avocats.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${calSans.variable} ${matter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
