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
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        badge: {
          primary: "#0f766e",
          "primary-content": "#f1f5f9",
          secondary: "#0b948f",
          accent: "#22d3ee",
          neutral: "#0f172a",
          "neutral-content": "#e2e8f0",
          "base-100": "#f8fafc",
          "base-200": "#eef2ff",
          "base-300": "#e2e8f0",
          info: "#0ea5e9",
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444"
        }
      }
    ],
    base: true,
    styled: true
  }
};
