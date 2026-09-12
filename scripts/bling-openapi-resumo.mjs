// Resume o OpenAPI público do Bling v3 (o arquivo que a página /referencia carrega —
// o nome muda a cada build; descobrir com `curl -sL https://developer.bling.com.br/referencia`
// e procurar `reference-*.js`, e dentro dele `openapi-*.json`) para planejar a CRM-2b:
// só os caminhos de contatos, pedidos de venda e NF-e, com os campos obrigatórios (*).
// Uso: node scripts/bling-openapi-resumo.mjs [filtro-regex] [url-do-openapi]
const filtro = process.argv[2] ?? 'pedidos/vendas|/nfe|/contatos';
const re = new RegExp(filtro);
const url = process.argv[3] ?? 'https://developer.bling.com.br/build/assets/openapi-DKXp8d1e.json';
const res = await fetch(url);
const d = await res.json();
console.log('servers:', JSON.stringify(d.servers));
console.log('security:', JSON.stringify(d.components?.securitySchemes ?? {}).slice(0, 800));

const deref = (s, depth = 0) => {
  if (!s || depth > 6) return s;
  if (s.$ref) {
    const parts = s.$ref.replace(/^#\//, '').split('/');
    let cur = d;
    for (const p of parts) cur = cur?.[p];
    return deref(cur, depth + 1);
  }
  return s;
};
const shape = (s, depth = 0) => {
  s = deref(s, depth);
  if (!s || depth > 4) return '?';
  if (s.allOf) return s.allOf.map((x) => shape(x, depth + 1)).join(' & ');
  if (s.type === 'object' || s.properties) {
    const req = new Set(s.required ?? []);
    return '{' + Object.entries(s.properties ?? {}).map(([k, v]) => `${k}${req.has(k) ? '*' : ''}: ${shape(v, depth + 1)}`).join(', ') + '}';
  }
  if (s.type === 'array') return `[${shape(s.items, depth + 1)}]`;
  return (s.type ?? '?') + (s.enum ? `(${s.enum.join('|')})` : '') + (s.description ? ` /*${String(s.description).slice(0, 60)}*/` : '');
};

for (const p of Object.keys(d.paths).sort()) {
  if (!re.test(p)) continue;
  for (const [m, op] of Object.entries(d.paths[p])) {
    console.log(`\n${m.toUpperCase()} ${p} — ${op.summary ?? ''}`);
    const body = op.requestBody?.content?.['application/json']?.schema;
    if (body) console.log('  body:', shape(body).slice(0, 1800));
    const params = (op.parameters ?? []).map((q) => `${q.name}${q.required ? '*' : ''}`).join(', ');
    if (params) console.log('  params:', params);
  }
}
