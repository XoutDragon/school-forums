import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1115",
        panel: "#161922",
        panel2: "#1c2029",
        border: "#262b36",
        accent: "#5865f2",
        text: "#e7e9ee",
        muted: "#9aa0ac",
      },
    },
  },
  plugins: [],
};
export default config;
