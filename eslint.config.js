import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

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
);
