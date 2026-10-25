// O robô do Conecta Venda (Portal do Distribuidor, etapa 6; migration 20270204030000). A cada 10 minutos (pg_cron),
// em cada conta de `conecta_contas` (MF e INBRAS): os produtos com estoque e preço por tabela, os catálogos (uma vez
// por hora: têm a tabela de preço e o link), os pedidos e os carrinhos abandonados. Só o cron chama:
// `requireServiceRole` + `verify_jwt = true` em config.toml.
//
// A chave de cada conta é um segredo da função (o nome está em `conecta_contas.segredo`); sem ela, a conta é pulada e
// a sincronização registra "sem chave". API lida em 2026-10-25 (https://api.conectavenda.com.br/docs): tudo é POST
// em /{tabela}/{ação}, com a `chave` no corpo. Limite: 30.000 chamadas por mês por conta — aqui, ~4 por rodada.
//
// Não se guarda e-mail, telefone nem CPF do comprador: o pedido de distribuidor se liga pelo CNPJ.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/require-service-role.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const API = 'https://api.conectavenda.com.br'

type Json = Record<string, unknown>
const txt = (v: unknown) => (v == null || v === '' ? null : String(v))
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const digitos = (v: unknown) => (txt(v) ?? '').replace(/\D/g, '') || null
// O Conecta manda "AAAA-MM-DD HH:MM:SS" sem fuso; é a hora do Brasil.
const quando = (v: unknown) => {
  const s = txt(v)
  if (!s) return null
  const d = new Date(`${s.replace(' ', 'T')}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
// O filtro `data` da API, na hora do Brasil.
const dataDaApi = (diasAtras: number) => {
  const d = new Date(Date.now() - diasAtras * 86400000 - 3 * 3600000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

async function chamar(caminho: string, chave: string, corpo: Json = {}): Promise<unknown> {
  const r = await fetch(`${API}/${caminho}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, chave }),
  })
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const itens = (lista: unknown) => (Array.isArray(lista) ? lista : []).map((p: Json) => ({
  referencia: txt(p.referencia), produto: txt(p.produto_nome), variacao: txt(p.variacao),
  quantidade: num(p.qtde), valor_unitario: num(p.valor_unitario),
}))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const negado = requireServiceRole(req, corsHeaders)
  if (negado) return negado

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: contas, error } = await db.from('conecta_contas').select('tenant_id, conta, segredo').eq('ativo', true)
  if (error) return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: corsHeaders })

  const resumo: Json[] = []
  const deHora = new Date().getUTCMinutes() < 10
  for (const c of contas ?? []) {
    const chave = Deno.env.get(c.segredo)
    const registrar = (ok: boolean, detalhe: string) =>
      db.from('conecta_sincronizacoes').insert({ tenant_id: c.tenant_id, conta: c.conta, ok, detalhe })
    if (!chave) {
      // Sem chave, uma linha por hora basta para a TI ver o motivo.
      if (deHora) await registrar(false, `sem chave: cadastre o segredo ${c.segredo} nas funções`)
      resumo.push({ conta: c.conta, ok: false, motivo: 'sem chave' })
      continue
    }
    try {
      const base = { tenant_id: c.tenant_id, conta: c.conta, atualizado_em: new Date().toISOString() }
      const produtos = (await chamar('produtos/listar', chave)) as Json[]
      const linhasP = (Array.isArray(produtos) ? produtos : []).map((p) => {
        const variacoes = (Array.isArray(p.variacoes) ? p.variacoes : []) as Json[]
        const estoques = variacoes.map((v) => num(v.estoque))
        return {
          ...base, produto_id: String(p.id), referencia: txt(p.referencia), ean: txt(p.ean), nome: txt(p.nome) ?? String(p.id),
          grupo: txt(p.grupo), foto: Array.isArray(p.fotos) ? txt(p.fotos[0]) : null,
          // Sem estoque informado = sob encomenda (a API diz isso): fica nulo, não zero.
          estoque: estoques.length && estoques.every((e) => e != null) ? estoques.reduce((t, e) => t + (e ?? 0), 0) : null,
          precos: ((variacoes[0]?.precos ?? []) as Json[]).map((x) => ({ tabela: txt(x.tabela), valor: num(x.valor) })),
        }
      })
      for (let i = 0; i < linhasP.length; i += 500) {
        const { error: e } = await db.from('conecta_produtos').upsert(linhasP.slice(i, i + 500), { onConflict: 'tenant_id,conta,produto_id' })
        if (e) throw new Error(`produtos: ${e.message}`)
      }

      let catalogos = 0
      if (deHora) {
        for (let pagina = 1, total = 1; pagina <= total && pagina <= 20; pagina++) {
          const r = (await chamar('catalogos/listar', chave, { limite: 100, pagina })) as Json
          total = Number(r.total_paginas ?? 1)
          const linhas = ((r.catalogos ?? []) as Json[]).filter((k) => txt(k.link)).map((k) => ({
            ...base, identificacao: String(k.identificacao), descricao: txt(k.descricao), tabela_preco: txt(k.tabela_preco),
            link: String(k.link), vence_em: quando(k.data_vencimento),
          }))
          catalogos += linhas.length
          if (linhas.length) {
            const { error: e } = await db.from('conecta_catalogos').upsert(linhas, { onConflict: 'tenant_id,conta,identificacao' })
            if (e) throw new Error(`catálogos: ${e.message}`)
          }
        }
      }

      // 45 dias para trás em toda rodada: o filtro é pela data do pedido, e a situação de um pedido antigo muda.
      const pedidos = (((await chamar('pedidos/listar', chave, { data: dataDaApi(45) })) as Json).dados ?? []) as Json[]
      const linhasPed = pedidos.map((p) => ({
        ...base, id: Number(p.id), situacao: txt(p.situacao), cnpj: digitos(p.cnpj), razao_social: txt(p.razao_social),
        catalogo: txt(p.catalogo), tabela: txt(p.tabela), valor_pedido: num(p.valor_pedido), valor_frete: num(p.valor_frete),
        valor_pagamento: num(p.valor_pagamento), link: txt(p.link), criado_em: quando(p.data_criacao),
        situacao_em: quando(p.data_atualizacao_status), produtos: itens(p.produtos),
      }))
      if (linhasPed.length) {
        const { error: e } = await db.from('conecta_pedidos').upsert(linhasPed, { onConflict: 'tenant_id,conta,id' })
        if (e) throw new Error(`pedidos: ${e.message}`)
      }

      const sacolas = (((await chamar('sacolas-abandonadas/listar', chave, { data: dataDaApi(30), somente_identificados: true })) as Json).dados ?? []) as Json[]
      const linhasS = sacolas.map((s) => ({
        ...base, id: Number(s.id), situacao: txt(s.situacao), cnpj: digitos(s.cnpj), razao_social: txt(s.razao_social),
        catalogo: txt(s.catalogo), tabela: txt(s.tabela), valor_total: num(s.valor_total), link: txt(s.link),
        sacola_em: quando(s.data_atualizacao), produtos: itens(s.produtos),
      }))
      if (linhasS.length) {
        const { error: e } = await db.from('conecta_sacolas').upsert(linhasS, { onConflict: 'tenant_id,conta,id' })
        if (e) throw new Error(`sacolas: ${e.message}`)
      }

      const detalhe = `${linhasP.length} produtos, ${linhasPed.length} pedidos, ${linhasS.length} carrinhos${deHora ? `, ${catalogos} catálogos` : ''}`
      await registrar(true, detalhe)
      resumo.push({ conta: c.conta, ok: true, detalhe })
    } catch (e) {
      await registrar(false, String(e).slice(0, 500))
      resumo.push({ conta: c.conta, ok: false, erro: String(e).slice(0, 200) })
    }
  }
  // O registro guarda uma semana.
  await db.from('conecta_sincronizacoes').delete().lt('em', new Date(Date.now() - 7 * 86400000).toISOString())
  return new Response(JSON.stringify({ ok: true, contas: resumo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
