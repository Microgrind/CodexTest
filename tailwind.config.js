/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    "bg-amber-400",
    "bg-emerald-400",
    "bg-blue-400",
    "bg-rose-400",
    "ring-emerald-200",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Press Start 2P"', '"Orbitron"', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        neon: "0 0 20px rgba(34,211,238,0.45)",
      },
    },
  },
  plugins: [],
};
