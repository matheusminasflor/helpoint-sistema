// Quais módulos cada pessoa alcança. Três leituras e uma escrita.
//
// ── Leva F (2026-09-26): três das cinco regras estavam quebradas aqui ───────
//
// Este arquivo é pequeno e ficou pequeno-e-errado por tempo demais. O que havia:
//
// 1. **REGRA 1 — erro do banco engolido.** As três leituras faziam
//    `console.error(...)` e `return []`. Falha de RLS, de rede ou de coluna
//    virava "esta pessoa não tem módulo nenhum".
//
//    Isso ficou GRAVE nesta mesma leva, e é o motivo de a correção vir junto:
//    `useVisibleModules` lê `useMyModules`, e desde a leva B `RequireComercial` e
//    `RequireDiretoria` decidem **redirecionar** com base nele. Com o erro
//    engolido, uma falha de leitura tira a pessoa do módulo dela e a joga em
//    `/inicio` — sem aviso, sem erro, parecendo perda de acesso. O guarda que eu
//    acabei de escrever dependia de um hook que mentia quando falhava.
//
//    Agora `unwrap` lança, o `useQuery` guarda o estado de erro, e o aviso global
//    da leva C (`QueryCache.onError`) mostra o toast. E os guardas de rota, que
//    já não redirecionam enquanto `isLoading`, também não redirecionam em erro.
//
// 2. **REGRA 3 — `queryKey` sem a empresa.** Eram `['my-modules', user?.id]` e
//    `['user-modules', userId]`. Dois logins seguidos na mesma aba, em empresas
//    diferentes, liam o cache do anterior até o refetch — e aqui o cache decide
//    o que aparece no menu e quais rotas abrem.
//
// 3. **REGRA 2 — escrita que não prova que gravou.** `useUpdateUserModules`
//    apagava e inseria sem `.select()`. O `delete` sem policy que casa afeta zero
//    linhas e responde 200: o toast dizia "Módulos atualizados" e nada mudava.
//    Ver o comentário da mutação para o que é zero linha legítima ali.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { ModuleId } from '@/types/database';

interface UserModuleAccess {
  id: string;
  tenant_id: string;
  user_id: string;
  module: string;
  granted_by: string | null;
  granted_at: string;
}

export function useMyModules() {
  const { user, tenantId } = useAuth();

  return useQuery({
    // `tenantId` na chave (regra 3): é esta consulta que decide o menu e as
    // rotas que abrem, então cache trocado aqui é a pessoa vendo o módulo da
    // outra empresa por um instante.
    queryKey: ['my-modules', tenantId, user?.id],
    queryFn: async (): Promise<ModuleId[]> => {
      const rows = unwrap(await supabase
        .from('user_module_access')
        .select('module')
        .eq('user_id', user!.id));
      return rows.map((d) => d.module as ModuleId);
    },
    enabled: !!user?.id && !!tenantId,
  });
}

export function useUserModules(userId: string | null) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['user-modules', tenantId, userId],
    queryFn: async (): Promise<ModuleId[]> => {
      const rows = unwrap(await supabase
        .from('user_module_access')
        .select('module')
        .eq('user_id', userId!));
      return rows.map((d) => d.module as ModuleId);
    },
    enabled: !!userId && !!tenantId,
  });
}

export function useAllUserModules() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['all-user-modules', tenantId],
    queryFn: async (): Promise<UserModuleAccess[]> =>
      unwrap(await supabase.from('user_module_access').select('*')),
    enabled: !!tenantId,
  });
}

export function useUpdateUserModules() {
  const queryClient = useQueryClient();
  const { user, tenantId } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, modules }: { userId: string; modules: ModuleId[] }) => {
      // O `delete` leva `.select('id')` mas **não** passa por `expectRows`, e a
      // diferença é de propósito: zero linha aqui é legítima — a pessoa pode não
      // ter módulo nenhum ainda, e tirar de quem não tem não é falha. O que o
      // `.select()` garante é que um erro de policy vira erro, em vez de 200 com
      // corpo vazio. Quem prova a escrita é o `insert` abaixo.
      unwrap(await supabase
        .from('user_module_access')
        .delete()
        .eq('user_id', userId)
        .select('id'));

      if (modules.length === 0) return;
      if (!tenantId) throw new Error('Sem empresa no contexto — não gravei módulo nenhum.');

      // Aqui zero linha É falha: pedi para gravar N módulos. `expectRows` troca o
      // silêncio do PostgREST por um erro com nome (regra 2).
      expectRows(
        await supabase
          .from('user_module_access')
          .insert(modules.map((module) => ({
            user_id: userId,
            module,
            granted_by: user?.id,
            tenant_id: tenantId,
          })))
          .select('id'),
        'a concessão de módulos',
      );
    },
    onSuccess: () => {
      // As chaves ganharam `tenantId` nas leituras, então a invalidação tem de
      // usar o PREFIXO — `['user-modules', userId]` não casaria mais com
      // `['user-modules', tenantId, userId]`, e a tela ficaria mostrando o valor
      // antigo depois de salvar. Prefixo casa com qualquer sufixo, e é por isso
      // que o `userId` deixou de ser usado aqui.
      queryClient.invalidateQueries({ queryKey: ['user-modules'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-modules'] });
      // `my-modules` também: quem edita os próprios módulos precisa ver o menu
      // mudar sem recarregar a página.
      queryClient.invalidateQueries({ queryKey: ['my-modules'] });
      toast.success('Módulos atualizados com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Não consegui atualizar os módulos: ${error.message}`);
    },
  });
}
