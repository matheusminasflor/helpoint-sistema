import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { soDigitos, extrairDocumentoDoNome } from '@/lib/documento';
import { buscarComTeto, type ConsultaComLimite } from '@/lib/listas';

/**
 * O cadastro de um cliente do Comercial (leva G, 2026-09-26).
 *
 * Dois lados, e cada um manda no que é dele: os cinco campos do Forteplus
 * (`codigo`, `razao_social`, `fantasia`, `tabela_preco`, `ativo`) voltam a cada
 * importação; `documento`, `telefone`, `email` e `endereco` nasceram aqui e a
 * importação não os toca — `com_importar_clientes` só sobrescreve os cinco.
 *
 * Por que o front lê `com_clientes` direto em vez de uma RPC: a policy de SELECT
 * já é "quem tem o Comercial ou a Diretoria", e o que a tela precisa é a linha
 * inteira. Uma RPC aqui seria uma camada sem regra nenhuma dentro.
 *
 * ── 2026-09-27: a LISTA de cadastro ────────────────────────────────────────────
 * O cadastro só existia dentro da ficha de um cliente, então completar o CNPJ de
 * 450 clientes exigia abrir 450 fichas — trabalho que ninguém termina, e era o que
 * travava o pedido do dono de o SAC puxar os dados do cliente automaticamente.
 * `useClientesCadastro` e `usePreencherDocumentosPeloNome` existem para isso.
 */

export interface ClienteCadastrado {
  id: string;
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  tabela_preco: string | null;
  tabela_base: string | null;
  ativo: boolean;
  em_condicao: boolean | null;
  origem: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  /**
   * A carteira (região) do cliente. É por ela que a nota que o Forteplus assinou
   * como "FINANCEIRO APROVADO" encontra quem de fato atende — o responsável da
   * carteira. Nulo = não atrelado, e a ficha pede para atrelar.
   */
  carteira: string | null;
}

export interface ClienteParaSalvar {
  codigo: string;
  razao_social: string;
  fantasia?: string | null;
  tabela_preco?: string | null;
  ativo: boolean;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  carteira?: string | null;
}

const CAMPOS = `id, codigo, razao_social, fantasia, tabela_preco, tabela_base, ativo,
                em_condicao, origem, documento, telefone, email, endereco, carteira`;

export function useCliente(codigo: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cliente', tenantId, codigo],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<ClienteCadastrado | null> => {
      const data = unwrap(await supabase
        .from('com_clientes')
        .select(CAMPOS)
        .eq('codigo', codigo!)
        .maybeSingle());
      return (data as unknown as ClienteCadastrado) ?? null;
    },
  });
}

/**
 * Cria ou corrige. `codigo` é a chave do Forteplus e é ele que decide qual é:
 * existe → corrige; não existe → cria com `origem = 'cadastro'`.
 *
 * `onConflict` NÃO é usado de propósito: upsert silencioso transformaria "criei
 * um cliente" em "sobrescrevi um cliente que eu não sabia que existia". Quem
 * chama diz o que quer, e o erro de código repetido volta como frase.
 */
/** O que a lista de cadastro pode filtrar. */
export type FiltroCadastro = 'todos' | 'sem_documento' | 'sem_contato' | 'sem_carteira';

/**
 * A lista de clientes para completar cadastro.
 *
 * Passa por `buscarComTeto`: são 450 hoje e a lista só cresce. Sem o teto, o corte
 * de 1000 linhas do PostgREST chegaria em silêncio e a tela diria "todos os clientes
 * estão completos" quando o que falta está depois do corte — o defeito que
 * `docs/nao-funciona.md` cataloga como "número errado, não página lenta".
 */
export function useClientesCadastro(filtro: FiltroCadastro, busca: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'clientes', 'cadastro', tenantId, filtro, busca],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('com_clientes').select(CAMPOS).order('razao_social');

      if (filtro === 'sem_documento') q = q.is('documento', null);
      if (filtro === 'sem_carteira') q = q.is('carteira', null);
      // "Sem contato" = sem telefone E sem e-mail: quem tem um dos dois é
      // alcançável, que é a pergunta que a tela faz.
      if (filtro === 'sem_contato') q = q.is('telefone', null).is('email', null);

      const termo = busca.trim();
      if (termo) q = q.or(`codigo.ilike.%${termo}%,razao_social.ilike.%${termo}%`);

      return buscarComTeto<ClienteCadastrado>(q as unknown as ConsultaComLimite<ClienteCadastrado>);
    },
  });
}

/**
 * Quantos clientes têm cada lacuna — os números que a tela mostra em cima.
 *
 * Conta no banco (`head: true`), sem trazer linha: é a pergunta "quantos faltam",
 * e trazer 450 linhas para contar no navegador seria a mesma resposta pelo caminho
 * caro. `unwrap` não serve aqui de propósito — ele devolve `data`, e numa consulta
 * de contagem o que interessa vem em `count`, fora do `data`. O `error` é tratado à
 * mão, que é a outra metade da regra 1 das cinco.
 */
export function useLacunasDoCadastro() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'clientes', 'lacunas', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const contar = async (filtro: FiltroCadastro): Promise<number> => {
        let q = supabase.from('com_clientes').select('id', { count: 'exact', head: true });
        if (filtro === 'sem_documento') q = q.is('documento', null);
        if (filtro === 'sem_carteira') q = q.is('carteira', null);
        if (filtro === 'sem_contato') q = q.is('telefone', null).is('email', null);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };

      const [total, semDocumento, semContato, semCarteira] = await Promise.all([
        contar('todos'), contar('sem_documento'), contar('sem_contato'), contar('sem_carteira'),
      ]);
      return { total, semDocumento, semContato, semCarteira };
    },
  });
}

/**
 * Preenche o documento de quem está sem, extraindo da própria razão social.
 *
 * POR QUE ISTO É UM BOTÃO E NÃO UMA MIGRATION. A regra de extração vive em
 * `extrairDocumentoDoNome` (`@/lib/documento`), em TypeScript, com o dígito
 * verificador conferido e 17 asserções de Vitest. Escrevê-la de novo em SQL só para
 * uma carga única criaria **duas verdades** sobre o que é um documento — e a versão
 * SQL envelheceria sozinha. Aqui a mesma função que o importador usa roda sobre o
 * que já está no banco.
 *
 * E é um botão, não automático: **grava documento em cima do cadastro do dono**.
 * Ele pede, vê quantos foram, e confere por amostra. Reversível — apagar o campo
 * devolve ao estado anterior, porque nada mais depende dele ainda.
 *
 * Nunca toca em quem já tem documento (`documento is null` no filtro de leitura), e
 * pula o que colidiria com outro cliente: dois códigos com o mesmo CPF é cadastro
 * duplicado no ERP, e quem resolve isso é gente.
 */
export function usePreencherDocumentosPeloNome() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const semDocumento = unwrap(await supabase
        .from('com_clientes')
        .select('codigo, razao_social, documento')
        .is('documento', null)) as { codigo: string; razao_social: string }[];

      // Quem já tem documento, para não propor um que colida.
      const ocupados = new Set(
        ((unwrap(await supabase
          .from('com_clientes')
          .select('documento')
          .not('documento', 'is', null)) ?? []) as { documento: string }[])
          .map((r) => r.documento),
      );

      const propostas: { codigo: string; documento: string }[] = [];
      let conflitos = 0;
      for (const c of semDocumento ?? []) {
        const doc = extrairDocumentoDoNome(c.razao_social);
        if (!doc) continue;
        if (ocupados.has(doc)) { conflitos++; continue; }
        ocupados.add(doc);
        propostas.push({ codigo: c.codigo, documento: doc });
      }

      let gravados = 0;
      for (const p of propostas) {
        // Um por um, e `is('documento', null)` no WHERE: se alguém preencheu aquele
        // cliente enquanto isto rodava, a gravação não passa por cima.
        const { data, error } = await supabase
          .from('com_clientes')
          .update({ documento: p.documento } as never)
          .eq('codigo', p.codigo)
          .is('documento', null)
          .select('id');
        if (error) throw error;
        if ((data?.length ?? 0) > 0) gravados++;
      }

      return { candidatos: propostas.length, gravados, conflitos, semDocumento: semDocumento?.length ?? 0 };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'cliente'] });
      toast.success(
        r.gravados === 0
          ? `Nenhum documento pôde ser extraído dos ${r.semDocumento} clientes sem CNPJ/CPF.`
          : `${r.gravados} documento(s) preenchido(s) a partir do nome.` +
            (r.conflitos > 0 ? ` ${r.conflitos} ficaram de fora por já pertencerem a outro cliente.` : ''),
      );
    },
    onError: (e: Error) => toast.error(`Não foi possível preencher: ${e.message}`),
  });
}

export function useSalvarCliente() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ cliente, criando }: { cliente: ClienteParaSalvar; criando: boolean }) => {
      const documento = soDigitos(cliente.documento) || null;
      const comum = {
        razao_social: cliente.razao_social.trim(),
        fantasia: cliente.fantasia?.trim() || null,
        tabela_preco: cliente.tabela_preco?.trim() || null,
        ativo: cliente.ativo,
        documento,
        telefone: cliente.telefone?.trim() || null,
        email: cliente.email?.trim() || null,
        endereco: cliente.endereco?.trim() || null,
        carteira: cliente.carteira?.trim() || null,
      };

      if (criando) {
        expectRows(
          await supabase
            .from('com_clientes')
            .insert({
              tenant_id: tenantId,
              codigo: cliente.codigo.trim(),
              origem: 'cadastro',
              ...comum,
            } as never)
            .select('id'),
          'o cadastro do cliente',
        );
      } else {
        expectRows(
          await supabase
            .from('com_clientes')
            .update(comum as never)
            .eq('codigo', cliente.codigo.trim())
            .select('id'),
          'a alteração do cliente',
        );
      }
      return cliente.codigo.trim();
    },
    onSuccess: (codigo, { criando }) => {
      qc.invalidateQueries({ queryKey: ['comercial', 'cliente'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'busca-clientes'] });
      toast.success(criando ? `Cliente ${codigo} cadastrado` : 'Cadastro atualizado');
    },
    onError: (e: Error) => {
      // As duas recusas do banco que a pessoa pode causar digitando, traduzidas.
      // Sem isto ela lê "duplicate key value violates unique constraint
      // com_clientes_documento_unico", que não diz o que fazer.
      const msg = e.message ?? '';
      if (/com_clientes_documento_unico/i.test(msg)) {
        toast.error('Já existe um cliente com esse CNPJ/CPF nesta empresa.');
      } else if (/com_clientes_documento_so_digitos/i.test(msg)) {
        toast.error('CNPJ precisa de 14 dígitos e CPF de 11.');
      } else if (/com_clientes_tenant_codigo|duplicate key/i.test(msg)) {
        toast.error('Já existe um cliente com esse código.');
      } else {
        toast.error(`Erro ao salvar: ${msg}`);
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Quem vendeu para este cliente
// ═══════════════════════════════════════════════════════════════════════════

export interface VendedorDoCliente {
  vendedor_codigo: string;
  vendedor_nome: string;
  valor: number;
  notas: number;
  ultima_venda: string | null;
  /**
   * `false` quando aquele código do Forteplus não está em `com_vendedores` — é o
   * caso de FINANCEIRO APROVADO e FINANCEIRO CONFERENCIA, que juntos assinam 56%
   * do faturamento do histórico e não são pessoas.
   */
  e_vendedor: boolean;
}

/**
 * Quem responde pelo cliente, com a regra que o dono pediu em 2026-09-26: se a
 * nota veio sem vendedor de verdade, vale o responsável da CARTEIRA do cliente.
 *
 * `situacao` é código e não frase: o texto mora na tela, porque texto de
 * interface em função SQL é tradução em dois lugares.
 *   'vendedor'                 → `responsavel_nome` é quem atende
 *   'sem_carteira'             → cliente não atrelado; a tela pede para atrelar
 *   'carteira_sem_responsavel' → está na carteira, e ninguém responde por ela
 */
export interface AtendimentoDoCliente {
  carteira: string | null;
  situacao: 'vendedor' | 'sem_carteira' | 'carteira_sem_responsavel';
  responsavel_id: string | null;
  responsavel_nome: string | null;
}

export function useAtendimentoDoCliente(codigo: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'atendimento-do-cliente', tenantId, codigo],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<AtendimentoDoCliente | null> => {
      const data = unwrap(await supabase.rpc('com_atendimento_do_cliente', { p_codigo: codigo! }));
      const linhas = (data || []) as unknown as AtendimentoDoCliente[];
      return linhas[0] ?? null;
    },
  });
}

/**
 * De onde sai "de quem é este cliente" sem campo novo: de quem vendeu
 * (decisão do dono — carteira é do atendente, não do cliente).
 *
 * RESSALVA MEDIDA (2026-09-26), e é por isso que a tela não chama isto de
 * "quem atende": o `vendedor` do Forteplus nem sempre é gente. O código 1638
 * é "FINANCEIRO APROVADO" e responde por R$ 5.017.738 de 168 clientes; 1637 é
 * "FINANCEIRO CONFERENCIA". Juntos, 56% do faturamento do histórico. Enquanto
 * isso não for decidido com o dono, o rótulo diz o que o dado é — vendedor da
 * nota — e não o que a gente queria que ele fosse.
 */
export function useVendedoresDoCliente(codigo: string | null, de: string, ate: string, filial: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'vendedores-do-cliente', tenantId, codigo, de, ate, filial],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<VendedorDoCliente[]> => {
      const data = unwrap(await supabase.rpc('com_quem_atende_cliente', {
        p_codigo: codigo!, p_de: de, p_ate: ate, p_filial: filial,
      }));
      return (data || []) as unknown as VendedorDoCliente[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Os chamados do SAC deste cliente
// ═══════════════════════════════════════════════════════════════════════════

export interface SacDoCliente {
  id: string;
  ticket_number: number | null;
  subject: string | null;
  status: string;
  created_at: string;
}

/**
 * Casa pelo DOCUMENTO, só dígitos dos dois lados. Sem documento no cadastro não
 * há o que casar — e a tela tem de dizer "CNPJ não informado", e não "nenhum
 * chamado": as duas frases são verdade em situações diferentes, e confundi-las
 * é o padrão "lista vazia por RLS é indistinguível de lista vazia por não
 * existir" que a L8 registrou.
 *
 * Lê pela RPC `com_sacs_do_cliente`, e não pela tabela. Por quê: `sac_tickets`
 * foi fechado por módulo em 2026-09-26 (pedido do dono, migration
 * `20261106010000`) — quem tem só o Comercial não lê mais a tabela, e este bloco
 * mostraria "nenhum chamado" com o chamado existindo, que é a mentira exata que
 * ele foi escrito para evitar.
 *
 * A RPC é `security definer` e devolve **só o resumo**: número, assunto, status e
 * data. Não devolve comentário, anexo nem laudo — para isso a pessoa precisa do
 * módulo Qualidade. É mais estreito do que o acesso à tabela que este bloco
 * tinha, e a normalização do documento (dígitos dos dois lados) passou a morar no
 * banco, onde ela não pode divergir da comparação.
 */
export function useSacsDoCliente(documento: string | null) {
  const { tenantId } = useAuth();
  const digitos = soDigitos(documento);
  return useQuery({
    queryKey: ['comercial', 'sacs-do-cliente', tenantId, digitos],
    enabled: !!tenantId && digitos.length > 0,
    queryFn: async (): Promise<SacDoCliente[]> => {
      const data = unwrap(await supabase.rpc('com_sacs_do_cliente', { p_documento: digitos }));
      return (data || []) as unknown as SacDoCliente[];
    },
  });
}
