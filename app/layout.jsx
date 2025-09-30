import "./globals.css";

export const metadata = {
  title: "Nut Invaders",
  description: "Retro multiplayer incremental strategy with nut-fueled fleets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-emerald-100">{children}</body>
    </html>
  );
}
