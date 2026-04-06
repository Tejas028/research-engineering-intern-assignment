export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 500: "#378ADD", 700: "#2A6EB5" },
        surface: "#0d0d0d",
        elevated: "#111111",
        "accent-red": "#E24B4A",
        "accent-blue": "#378ADD",
      },
      fontFamily: {
        sans:  ["DM Sans", "sans-serif"],
        mono:  ["DM Mono", "monospace"],
        serif: ["Playfair Display", "serif"],
      },
      animation: {
        "slide-up":  "slide-up 200ms ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        shimmer:     "shimmer 1.8s ease-in-out infinite",
      },
      keyframes: {
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%":      { opacity: "0.5", transform: "scale(1.4)" },
        },
        shimmer: {
          "0%":   { opacity: "0.4" },
          "50%":  { opacity: "0.7" },
          "100%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};
