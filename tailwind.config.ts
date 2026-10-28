import type { Config } from "tailwindcss";

export default {
  // Freio do modo escuro (L0b): o tema escuro só entra com a classe `.dark`
  // no <html>, que ninguém aplica hoje. Sem isto, os `dark:` espalhados
  // disparavam pelo Windows escuro e o usuário via meio tema. O tema completo
  // vem com o visual (L12).
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  // Rodada 3: a cor do estado e a do setor são montadas por texto (`estado-${familia}`, `setor-${setor}`) e o Tailwind
  // não as acha no código — sem esta lista a compilação as descartava e a pílula saía sem cor.
  safelist: [
    { pattern: /^estado-(recebido|setor|espera|atraso|concluido)$/ },
    { pattern: /^setor-(ti|marketing|qualidade|comercial|educacional|expedicao|producao|rh|financeiro|compras)$/ },
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "0",
      screens: {
        "2xl": "100%",
      },
    },
    extend: {
      fontFamily: {
        // Nunito Sans, a letra da DashStack (2026-10-28), com algarismos de mesma largura onde houver número.
        sans: ['Nunito Sans', 'system-ui', 'sans-serif'],
        display: ['Nunito Sans', 'system-ui', 'sans-serif'],
        // A letra de máquina de escrever saiu (2026-10-25): `font-mono` é a do sistema, com algarismos de mesma largura
        // (index.css). A letra técnica fica só em `code`/`kbd`, pela variável --font-mono.
        mono: ['Nunito Sans', 'system-ui', 'sans-serif'],
      },
      // Um passo maior em todo o sistema (decisão do dono, 2026-10-06: a letra estava pequena demais).
      // O padrão do Tailwind era xs 12px / sm 14px / label 11px.
      fontSize: {
        "label": ["0.75rem", { lineHeight: "1rem" }],
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],
      },
      letterSpacing: {
        tighter: '-0.04em',
        micro: '0.04em',
      },
      colors: {
        border: "hsl(var(--border))",
        "border-subtle": "hsl(var(--border-subtle))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // A bolinha de aviso da DashStack.
        aviso: "hsl(var(--aviso))",
        background: "hsl(var(--background))",
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          bright: "hsl(var(--foreground-bright))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // O fundo claro da marca (rodada 3): sugestão em destaque, linha escolhida.
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--primary))",
          "accent-foreground": "hsl(var(--primary-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        stage: {
          slate: "hsl(var(--stage-slate))",
          blue: "hsl(var(--stage-blue))",
          teal: "hsl(var(--stage-teal))",
          green: "hsl(var(--stage-green))",
          amber: "hsl(var(--stage-amber))",
          red: "hsl(var(--stage-red))",
          violet: "hsl(var(--stage-violet))",
          pink: "hsl(var(--stage-pink))",
        },
        monday: {
          green: "hsl(var(--monday-green))",
          yellow: "hsl(var(--monday-yellow))",
          red: "hsl(var(--monday-red))",
          purple: "hsl(var(--monday-purple))",
          orange: "hsl(var(--monday-orange))",
        },
        status: {
          success: "hsl(var(--status-success))",
          warning: "hsl(var(--status-warning))",
          danger: "hsl(var(--status-danger))",
          info: "hsl(var(--status-info))",
          muted: "hsl(var(--status-muted))",
        },
        priority: {
          critical: "hsl(var(--priority-critical))",
          high: "hsl(var(--priority-high))",
          medium: "hsl(var(--priority-medium))",
          low: "hsl(var(--priority-low))",
          none: "hsl(var(--priority-none))",
        },
        surface: {
          0: "hsl(var(--surface-0))",
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
      },
      borderRadius: {
        // DashStack (2026-10-28): cartão 14, botão 8, etiqueta 4,5.
        lg: "14px",
        md: "8px",
        sm: "4.5px",
        DEFAULT: "8px",
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
      },
      // DashStack (2026-10-28): o cartão se separa do fundo pela sombra larga e leve, não pela borda. O que flutua
      // (menu aberto, janela, aviso) tem a sombra mais forte.
      boxShadow: {
        'xs': 'none',
        'sm': '6px 6px 54px rgba(0,0,0,0.05)',
        DEFAULT: '6px 6px 54px rgba(0,0,0,0.05)',
        'card': '6px 6px 54px rgba(0,0,0,0.05)',
        'card-hover': 'none',
        'elevated': '0 8px 24px rgba(0,0,0,0.12)',
        'panel': '6px 6px 54px rgba(0,0,0,0.05)',
        'monday': 'none',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "pulse-dot": {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1"
          },
          "50%": {
            transform: "scale(1.3)",
            opacity: "0.8"
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-left": "slide-in-left 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
