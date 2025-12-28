/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        "ink-strong": "#020617",
        "ink-muted": "#1e293b",
        badge: "#0b948f",
        "badge-dark": "#0f766e"
      }
    }
  },
  plugins: []
};
