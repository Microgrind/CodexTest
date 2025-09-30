/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
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
