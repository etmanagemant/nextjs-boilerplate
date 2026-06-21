import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", ".dark"],
  content: [
    "./app/*/.{ts,tsx}",
    "./components/*/.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hintergrund: weniger “hartes Schwarz”, mehr “Tiefe”
        bg: {
          base: "#3c4557",
          elevated: "#121317",
          surface: "#17181B",
          surface2: "#1C1F26",
          canvas: "#0F1013",
          canvas2: "#14161C",
        },

        // Linien: dezent
        line: {
          subtle: "#242730",
          strong: "#343842",
        },

        // “Luxury Gold”: soft, nicht neon
        gold: {
          primary: "#C9A86A",
          // für Text/Buttons: etwas matter
          text: "#D5BC86",
          // für Hintergründe/Glow: stark reduziert
          glow: "rgba(201,168,106,0.22)",
          // für aktive/hover Zustände
          deep: "#9C7A3D",
          soft: "#E2C48A",
        },

        // Schrift: helles Beige statt hartes Weiß
        text: {
          primary: "#F3F0EA",
          secondary: "#BDB3A6",
          muted: "#9A948B",
        },

        // Brand helper (optional, aber praktisch)
        brand: {
          border: "rgba(201,168,106,0.35)",
          buttonBg: "#C9A86A",
          buttonBgHover: "#B8955A",
          buttonText: "#0B0C0E",
        },

        success: "#4FAE78",
        warning: "#D6A85E",
        danger: "#C35D5D",
        info: "#6E8FBF",
      },

      borderRadius: {
        sm: "10px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        pill: "999px",
      },

      boxShadow: {
        // “Luxury” statt knallige Schatten
        card: "0 10px 30px rgba(0,0,0,0.32)",
        soft: "0 2px 10px rgba(0,0,0,0.22)",
        goldSoft: "0 0 0 1px rgba(201,168,106,0.10), 0 10px 30px rgba(201,168,106,0.10)",
        focusGold:
          "0 0 0 1px rgba(201,168,106,0.35), 0 0 0 4px rgba(201,168,106,0.10)",
      },

      // dezenter Brand-Glow (kein “protzig”)
      backgroundImage: {
        "brand-glow":
          "radial-gradient(700px circle at 10% -10%, rgba(201,168,106,0.18), transparent 55%), radial-gradient(600px circle at 90% 0%, rgba(201,168,106,0.12), transparent 50%), radial-gradient(500px circle at 50% 120%, rgba(201,168,106,0.10), transparent 55%)",
      },

      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
        20: "80px",
      },

      fontFamily: {
        sans: [
          "Inter",
          "Manrope",
          "Satoshi",
          "Plus Jakarta Sans",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;