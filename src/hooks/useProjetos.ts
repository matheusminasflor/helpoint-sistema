import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { todayISO } from '@/lib/dates';
import { faseAtual, farolDaAtividade, percentualMedio, seloDoConjunto } from '@/lib/projetos';
import { enviarAnexo, tirarDoBalde } from '@/lib/anexos-no-storage';
import type { Database } from '@/integrations/supabase/types';

/**
 * Projetos por setor (docs/plano-projetos.md, decisões do dono de 2026-10-07). O projeto nasce do
 * briefing (`description`) e dos setores; cada setor planeja as suas atividades — que são linhas de
 * `tasks` com `project_id`, por isso aparecem também na Home e na Lyra. Quem pode o quê, o banco decide
 * (`pode_planejar_setor`, `pode_editar_projeto`); a tela só pergunta a ele.
 */

export type ProjetoRow = Database['public']['Tables']['projects']['Row'];
export type AtividadeRow = Database['public']['Tables']['tasks']['Row'];
export type SetorDoProjeto = Database['public']['Tables']['project_setores']['Row'];
export type FaseRow = Database['public']['Tables']['project_fases']['Row'];
export type ComentarioRow = Database['public']['Tables']['task_comentarios']['Row'];
export type AnexoRow = Database['public']['Tables']['project_anexos']['Row'];

export const BALDE_DOS_PROJETOS = 'projetos';

export interface Projeto extends ProjetoRow {
  responsavel: string | null;
  percentual: number;
  atrasadas: number;
  total: number;
  equipe: number;
  /** Os nomes da equipe, para os avatares do cartão (desenho aprovado). */
  nomesDaEquipe: string[];
  /** "fase 2 de 6": a primeira fase com atividade aberta. */
  fase: { numero: number; total: number } | null;
  /** O selo do projeto: "2 atrasadas", "Em andamento", "Não iniciado"… */
  selo: ReturnType<typeof seloDoConjunto>;
}

const nomeDe = (p: { full_name: string | null; email: string }) => p.full_name || p.email;

async function nomesDasPessoas(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return {};
  const perfis = unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', unicos));
  return Object.fromEntries(perfis.map((p) => [p.id, nomeDe(p)]));
}

export function useProjetos() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projetos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Projeto[]> => {
      const linhas = unwrap(
        await supabase.from('projects').select('*').eq('e_modelo', false).order('created_at', { ascending: false }),
      );
      if (linhas.length === 0) return [];
      const ids = linhas.map((p) => p.id);
      const [atividadesR, membrosR, fasesR] = await Promise.all([
        supabase.from('tasks').select('project_id, fase_id, status, percentual, termino').in('project_id', ids),
        supabase.from('project_members').select('project_id, user_id').in('project_id', ids),
        supabase.from('project_fases').select('id, project_id, ordem').in('project_id', ids),
      ]);
      const atividades = unwrap(atividadesR);
      const membros = unwrap(membrosR);
      const fases = unwrap(fasesR);
      const nomes = await nomesDasPessoas([...linhas.map((p) => p.owner_id), ...membros.map((m) => m.user_id)]);
      const hoje = todayISO();
      return linhas.map((p): Projeto => {
        const doProjeto = atividades.filter((a) => a.project_id === p.id);
        const equipe = membros.filter((m) => m.project_id === p.id).map((m) => nomes[m.user_id]).filter(Boolean);
        return {
          ...p,
          responsavel: p.owner_id ? nomes[p.owner_id] ?? null : null,
          percentual: percentualMedio(doProjeto),
          atrasadas: doProjeto.filter((a) => farolDaAtividade(a, hoje) === 'atrasado').length,
          total: doProjeto.length,
          equipe: equipe.length,
          nomesDaEquipe: equipe,
          fase: faseAtual(fases.filter((f) => f.project_id === p.id), doProjeto),
          selo: seloDoConjunto(doProjeto, hoje, false),
        };
      });
    },
  });
}

export function useModelosDeProjeto() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projetos-modelos', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const modelos = unwrap(
        await supabase.from('projects').select('id, name, description').eq('e_modelo', true).order('name'),
      );
      if (modelos.length === 0) return [];
      const ativ = unwrap(await supabase.from('tasks').select('project_id, setor').in('project_id', modelos.map((m) => m.id)));
      return modelos.map((m) => {
        const doModelo = ativ.filter((a) => a.project_id === m.id);
        return { ...m, atividades: doModelo.length, setores: [...new Set(doModelo.map((a) => a.setor).filter((s): s is string => !!s))] };
      });
    },
  });
}

export function useProjeto(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<ProjetoRow | null> =>
      unwrap(await supabase.from('projects').select('*').eq('id', id!))[0] ?? null,
  });
}

export interface EstruturaDoProjeto {
  setores: SetorDoProjeto[];
  fases: FaseRow[];
  atividades: AtividadeRow[];
  /** Nome de toda pessoa que aparece no projeto (responsáveis, referências, equipe). */
  nomes: Record<string, string>;
  equipe: string[];
}

export function useEstruturaDoProjeto(projectId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto-estrutura', tenantId, projectId],
    enabled: !!tenantId && !!projectId,
    queryFn: async (): Promise<EstruturaDoProjeto> => {
      const [setores, fases, atividades, membros] = await Promise.all([
        supabase.from('project_setores').select('*').eq('project_id', projectId!).order('setor'),
        supabase.from('project_fases').select('*').eq('project_id', projectId!).order('ordem'),
        supabase.from('tasks').select('*').eq('project_id', projectId!).order('position'),
        supabase.from('project_members').select('user_id').eq('project_id', projectId!),
      ]);
      const s = unwrap(setores);
      const a = unwrap(atividades);
      const equipe = unwrap(membros).map((m) => m.user_id);
      const nomes = await nomesDasPessoas([...a.map((x) => x.user_id), ...s.map((x) => x.referencia_id), ...equipe]);
      return { setores: s, fases: unwrap(fases), atividades: a, nomes, equipe };
    },
  });
}

/** O que a pessoa pode neste projeto — perguntado ao banco, setor por setor. */
export function usePodeNoProjeto(projectId: string | undefined, setores: string[]) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['projeto-pode', tenantId, user?.id, projectId, setores.join(',')],
    enabled: !!tenantId && !!projectId,
    queryFn: async () => {
      const edita = unwrap(await supabase.rpc('pode_editar_projeto', { p_project: projectId! }));
      const planeja: Record<string, boolean> = {};
      await Promise.all(setores.map(async (setor) => {
        planeja[setor] = !!unwrap(await supabase.rpc('pode_planejar_setor', { p_project: projectId!, p_setor: setor }));
      }));
      return { editaProjeto: !!edita, planeja };
    },
  });
}

function useInvalidarProjeto(projectId?: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
    qc.invalidateQueries({ queryKey: ['projeto', tenantId, projectId] });
    qc.invalidateQueries({ queryKey: ['projeto-estrutura', tenantId, projectId] });
    qc.invalidateQueries({ queryKey: ['projeto-pode', tenantId] });
    qc.invalidateQueries({ queryKey: ['minhas-atividades', tenantId] });
  };
}

/** Uma atividade ainda no rascunho do "Novo projeto" (nada é gravado antes de Criar). */
export interface AtividadeRascunho { chave: string; titulo: string; setor: string; descricao: string }
export interface FaseRascunho { chave: string; nome: string; atividades: AtividadeRascunho[] }

export interface NovoProjetoInput {
  nome: string;
  objetivo: string;
  entrega: string | null;
  setores: { setor: string; referencia_id: string }[];
  fases: FaseRascunho[];
}

/** As fases e atividades de um modelo, para revisar antes de criar (dono, 2026-10-09). */
export function useEstruturaDoModelo(modeloId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto-modelo-estrutura', tenantId, modeloId],
    enabled: !!tenantId && !!modeloId,
    queryFn: async (): Promise<FaseRascunho[]> => {
      const [fases, atividades] = await Promise.all([
        supabase.from('project_fases').select('id, nome').eq('project_id', modeloId!).order('ordem'),
        supabase.from('tasks').select('id, title, setor, description, fase_id').eq('project_id', modeloId!).order('position'),
      ]);
      const a = unwrap(atividades);
      return unwrap(fases).map((f) => ({
        chave: f.id, nome: f.nome,
        atividades: a.filter((x) => x.fase_id === f.id && x.setor)
          .map((x) => ({ chave: x.id, titulo: x.title, setor: x.setor!, descricao: x.description ?? '' })),
      }));
    },
  });
}

/**
 * Cria o projeto inteiro numa chamada (`criar_projeto`, 20261220010000): briefing, setores com a pessoa de
 * cada um, fases e as atividades já revisadas. Os avisos e e-mails saem pelos gatilhos do banco.
 */
export function useCriarProjeto() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoProjetoInput): Promise<string> =>
      unwrap(await supabase.rpc('criar_projeto' as never, {
        p_nome: input.nome.trim(), p_objetivo: input.objetivo.trim(), p_entrega: input.entrega,
        p_setores: input.setores,
        p_fases: input.fases.map((f) => ({
          nome: f.nome,
          atividades: f.atividades.map((a) => ({ titulo: a.titulo, setor: a.setor, descricao: a.descricao })),
        })),
      } as never)) as unknown as string,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
      toast.success('Projeto criado. As pessoas escolhidas recebem e-mail e aviso para planejar a parte do setor.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useSalvarBriefing(projectId: string) {
  const { tenantId } = useAuth();
  const invalidar = useInvalidarProjeto(projectId);
  return useMutation({
    mutationFn: async (input: { name: string; description: string | null; due_date: string | null; status?: string }) =>
      expectRows(await supabase.from('projects').update(input).eq('id', projectId).eq('tenant_id', tenantId!).select('id'), 'o briefing'),
    onSuccess: () => { invalidar(); toast.success('Briefing salvo.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useSetorDoProjeto(projectId: string) {
  const { tenantId } = useAuth();
  const invalidar = useInvalidarProjeto(projectId);
  const marcar = useMutation({
    mutationFn: async (input: { setor: string; referencia_id: string | null }) =>
      expectRows(await supabase.from('project_setores')
        .insert({ tenant_id: tenantId!, project_id: projectId, ...input }).select('id'), 'o setor'),
    onSuccess: () => { invalidar(); toast.success('Setor envolvido e avisado.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  const referencia = useMutation({
    mutationFn: async (input: { id: string; referencia_id: string | null }) =>
      expectRows(await supabase.from('project_setores').update({ referencia_id: input.referencia_id })
        .eq('id', input.id).select('id'), 'a referência do setor'),
    onSuccess: () => { invalidar(); toast.success('Referência do setor atualizada.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  const tirar = useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('project_setores').delete().eq('id', id).select('id'), 'o setor'),
    onSuccess: () => { invalidar(); toast.success('Setor tirado do projeto.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  return { marcar, referencia, tirar };
}

export function useFases(projectId: string) {
  const { tenantId } = useAuth();
  const invalidar = useInvalidarProjeto(projectId);
  const criar = useMutation({
    mutationFn: async (input: { nome: string; ordem: number }): Promise<string> =>
      expectRows(await supabase.from('project_fases')
        .insert({ tenant_id: tenantId!, project_id: projectId, nome: input.nome.trim(), ordem: input.ordem }).select('id'), 'a fase')[0].id,
    onSuccess: invalidar,
    onError: (e) => toast.error(traduzir(e)),
  });
  const salvar = useMutation({
    mutationFn: async (input: { id: string; nome?: string; ordem?: number }) =>
      expectRows(await supabase.from('project_fases').update({ ...(input.nome ? { nome: input.nome.trim() } : {}), ...(input.ordem != null ? { ordem: input.ordem } : {}) })
        .eq('id', input.id).select('id'), 'a fase'),
    onSuccess: invalidar,
    onError: (e) => toast.error(traduzir(e)),
  });
  const apagar = useMutation({
    mutationFn: async (id: string) => expectRows(await supabase.from('project_fases').delete().eq('id', id).select('id'), 'a fase'),
    onSuccess: () => { invalidar(); toast.success('Fase removida; as atividades dela ficaram em "Sem fase".'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  return { criar, salvar, apagar };
}

export interface AtividadeInput {
  id?: string;
  title: string;
  description: string | null;
  setor: string;
  fase_id: string | null;
  user_id: string | null;
  inicio: string | null;
  termino: string | null;
  depende_de: string | null;
  fator_externo: string | null;
  link: string | null;
}

export function useAtividades(projectId: string) {
  const { tenantId } = useAuth();
  const invalidar = useInvalidarProjeto(projectId);
  const salvar = useMutation({
    mutationFn: async (input: AtividadeInput) => {
      const { id, ...campos } = input;
      const payload = { ...campos, title: campos.title.trim() };
      if (id) {
        return expectRows(await supabase.from('tasks').update(payload).eq('id', id).eq('tenant_id', tenantId!).select('id'), 'a atividade');
      }
      return expectRows(await supabase.from('tasks').insert({
        ...payload, tenant_id: tenantId!, project_id: projectId, status: 'pending', priority: 3, position: Date.now(),
      }).select('id'), 'a atividade');
    },
    onSuccess: () => { invalidar(); toast.success('Atividade salva.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  // O responsável informa o andamento: % (o banco acende o farol e finaliza em 100%).
  const andamento = useMutation({
    mutationFn: async (input: { id: string; percentual: number }) =>
      expectRows(await supabase.from('tasks').update({ percentual: input.percentual }).eq('id', input.id).select('id'), 'o andamento'),
    onSuccess: invalidar,
    onError: (e) => toast.error(traduzir(e)),
  });
  const apagar = useMutation({
    mutationFn: async (id: string) => expectRows(await supabase.from('tasks').delete().eq('id', id).select('id'), 'a atividade'),
    onSuccess: () => { invalidar(); toast.success('Atividade removida.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  return { salvar, andamento, apagar };
}

export function useComentarios(taskId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const lista = useQuery({
    queryKey: ['atividade-comentarios', tenantId, taskId],
    enabled: !!tenantId && !!taskId,
    queryFn: async () => {
      const linhas = unwrap(await supabase.from('task_comentarios').select('*').eq('task_id', taskId!).order('created_at'));
      const nomes = await nomesDasPessoas(linhas.map((c) => c.autor_id));
      return linhas.map((c) => ({ ...c, autor: (c.autor_id && nomes[c.autor_id]) || 'Sistema' }));
    },
  });
  const comentar = useMutation({
    // `mencionados`: quem a tela achou como "@Nome" (extraiMencoes); o banco avisa só quem enxerga o projeto.
    mutationFn: async ({ texto, mencionados }: { texto: string; mencionados: string[] }) =>
      expectRows(await supabase.from('task_comentarios')
        .insert({ tenant_id: tenantId!, task_id: taskId!, texto: texto.trim(), mencionados }).select('id'), 'a atualização'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atividade-comentarios', tenantId, taskId] }),
    onError: (e) => toast.error(traduzir(e)),
  });
  return { lista, comentar };
}

/** Anexos do projeto (briefing: `taskId` nulo) ou de uma atividade. */
export function useAnexosDoProjeto(projectId: string, taskId: string | null) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const chave = ['projeto-anexos', tenantId, projectId, taskId];
  const lista = useQuery({
    queryKey: chave,
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('project_anexos').select('*').eq('project_id', projectId).order('created_at');
      q = taskId ? q.eq('task_id', taskId) : q.is('task_id', null);
      return unwrap(await q);
    },
  });
  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (arquivo.size > 10 * 1024 * 1024) throw new Error('O arquivo passa de 10 MB.');
      await enviarAnexo(BALDE_DOS_PROJETOS, `${tenantId}/${projectId}`, arquivo, (caminho) =>
        supabase.from('project_anexos').insert({
          tenant_id: tenantId!, project_id: projectId, task_id: taskId, nome: arquivo.name, caminho, tamanho: arquivo.size,
        }).select('id'));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: chave }); toast.success('Arquivo anexado.'); },
    onError: (e) => toast.error(traduzir(e)),
  });
  const remover = useMutation({
    mutationFn: async (anexo: AnexoRow) => {
      expectRows(await supabase.from('project_anexos').delete().eq('id', anexo.id).select('id'), 'o anexo');
      await tirarDoBalde(BALDE_DOS_PROJETOS, [anexo.caminho]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
    onError: (e) => toast.error(traduzir(e)),
  });
  return { lista, enviar, remover };
}

export function useSalvarComoModelo() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; nome: string }) =>
      unwrap(await supabase.rpc('salvar_como_modelo', { p_project: input.projectId, p_nome: input.nome.trim() })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projetos-modelos', tenantId] });
      toast.success('Modelo salvo. O próximo projeto já pode começar dele.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export interface MinhaAtividade extends AtividadeRow {
  projeto: string;
}

/** As atividades de projeto que são minhas, e as sem responsável dos setores que eu giro (o banco filtra o que vejo). */
export function useMinhasAtividades(setoresQueGiro: string[]) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['minhas-atividades', tenantId, user?.id, setoresQueGiro.join(',')],
    enabled: !!tenantId && !!user,
    queryFn: async (): Promise<MinhaAtividade[]> => {
      const projetos = unwrap(await supabase.from('projects').select('id, name').eq('e_modelo', false));
      if (projetos.length === 0) return [];
      const nome = Object.fromEntries(projetos.map((p) => [p.id, p.name]));
      const linhas = unwrap(await supabase.from('tasks').select('*')
        .in('project_id', projetos.map((p) => p.id))
        .in('status', ['pending', 'in_progress']));
      return linhas
        .filter((a) => a.user_id === user!.id || (!a.user_id && !!a.setor && setoresQueGiro.includes(a.setor)))
        .map((a) => ({ ...a, projeto: nome[a.project_id!] ?? '' }));
    },
  });
}

export interface PessoaDaEmpresa { id: string; nome: string; setores: string[] }

/**
 * As pessoas da empresa e os setores de cada uma — a mesma régua do banco (`pessoa_do_setor`: perfil,
 * módulo e perfil de acesso). No projeto, a pessoa do setor e o responsável são sempre do setor (dono,
 * 2026-10-09); a lista inteira só serve para a @menção.
 */
export function usePessoasDaEmpresa() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['projeto-pessoas', tenantId],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.rpc('pessoas_e_setores' as never)) ?? []) as unknown as PessoaDaEmpresa[],
  });
}

export function useApagarProjeto() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('projects').delete().eq('id', id).eq('tenant_id', tenantId!).select('id'), 'o projeto');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projetos', tenantId] });
      qc.invalidateQueries({ queryKey: ['projetos-modelos', tenantId] });
      toast.success('Projeto removido.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** O erro do banco em português de quem usa o sistema. */
export function traduzir(e: unknown): string {
  const msg = mensagemDeErro(e);
  if (msg.includes('project_setores_uma_vez')) return 'Esse setor já está no projeto.';
  if (msg.includes('tasks_periodo_check')) return 'A atividade não pode terminar antes de começar.';
  if (msg.includes('projects_prazo_check')) return 'O projeto não pode terminar antes de começar.';
  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Seu acesso não permite isso neste projeto: cada setor edita e exclui só as próprias atividades.';
  }
  return msg;
}
