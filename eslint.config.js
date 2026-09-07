import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const PALETA =
  /\b(bg|text|border|ring|from|via|to|fill|stroke)-(white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3})?\b/;
const HEX = /#[0-9a-fA-F]{6}\b/;

/** Regra local: string com cor de paleta fixa do Tailwind (e, com `hex`, `#RRGGBB`). */
const corFixa = {
  meta: {
    type: "suggestion",
    docs: { description: "Cor fixa não muda com o tema; use token semântico." },
    schema: [{ type: "object", properties: { hex: { type: "boolean" } }, additionalProperties: false }],
  },
  create(context) {
    const hex = context.options[0]?.hex === true;
    const check = (node, text) => {
      if (typeof text !== "string") return;
      if (PALETA.test(text)) {
        context.report({ node, message: "Cor de paleta fixa não muda com o tema: use um token semântico (bg-muted, text-primary, border-border). (L0b — freio do modo escuro)" });
      } else if (hex && HEX.test(text)) {
        context.report({ node, message: "Hex fixo não muda com o tema: use `hsl(var(--token))`. (L0b — freio do modo escuro)" });
      }
    };
    return {
      Literal: (n) => check(n, n.value),
      TemplateElement: (n) => check(n, n.value.raw),
    };
  },
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // As regras de escrita do CLAUDE.md ("Cinco regras de escrita"). Cada
    // uma existe porque o hábito contrário produziu defeito escondido na
    // revisão de 2026-09-04. São erro, não aviso: a catraca do lint
    // (scripts/lint-baseline.mjs) não deixa nenhuma ocorrência nova entrar.
    //
    // Valem para o FRONT (`src/`). As edge functions (`supabase/functions/`)
    // rodam em Deno, sem `@/lib/supabase-result`, e devolvem erro por HTTP —
    // têm 79 ocorrências da regra 1 e são uma leva própria, registrada em
    // docs/nao-funciona.md ("Dívidas de base").
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Regra 1 — `const { data } = await ...` sem ler o `error`.
          selector:
            'VariableDeclarator[init.type="AwaitExpression"] > ObjectPattern:has(Property[key.name="data"]):not(:has(Property[key.name="error"]))',
          message:
            "Erro do banco engolido: leia o `error` ou use `unwrap(await ...)` de '@/lib/supabase-result'. (CLAUDE.md, regra 1)",
        },
        {
          // Regra 4 — `toISOString()` para obter uma DATA: vira UTC, e à noite já é amanhã.
          selector:
            'MemberExpression[property.name=/^(slice|split|substring|substr)$/][object.callee.property.name="toISOString"]',
          message:
            "Data em UTC: use `todayISO()` / `toLocalISODate()` de '@/lib/dates'. (CLAUDE.md, regra 4)",
        },
        {
          // Regra 3 — queryKey de useQuery sem tenant nem usuário: dois tenants na
          // mesma aba, ou dois logins seguidos, veem dado trocado.
          selector:
            'CallExpression[callee.name=/^use(Query|InfiniteQuery|Queries)$/] Property[key.name="queryKey"] > ArrayExpression:not(:has(Identifier[name=/^(tenantId|userId)$/])):not(:has(MemberExpression[property.name="id"]))',
          message:
            "queryKey sem `tenantId` (ou `user?.id`): o cache mistura tenants e usuários. (CLAUDE.md, regra 3)",
        },
      ],
    },
  },
  {
    // Freio do modo escuro (L0b): cor de paleta fixa (`bg-emerald-100`,
    // `text-slate-700`, `#RRGGBB`) não muda de tema; só token semântico
    // (`bg-muted`, `text-primary`, `hsl(var(--…))`) muda. É AVISO, não erro:
    // há centenas herdadas e a catraca só impede que cresçam. O tema completo
    // (L12) zera a lista.
    //
    // Regra própria, e não mais um seletor em `no-restricted-syntax`: um
    // segundo bloco dessa regra com outra severidade SUBSTITUIRIA o de cima
    // para os mesmos arquivos, e as cinco regras deixariam de ser erro.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { helpoint: { rules: { "cor-fixa": corFixa } } },
    rules: { "helpoint/cor-fixa": "warn" },
  },
  {
    // Nos tipos e constantes (`STATUS_COLORS` etc.) também vale para hex.
    files: ["src/types/**/*.{ts,tsx}"],
    rules: { "helpoint/cor-fixa": ["warn", { hex: true }] },
  },
);
