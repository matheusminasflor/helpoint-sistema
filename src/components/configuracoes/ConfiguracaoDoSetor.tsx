// O MOLDE DA CONFIGURAÇÃO DE UM SETOR (LEVA P, 2026-09-28).
//
// O dono: "as configurações … está muito redundante, muito bagunçado, muito confuso". Medido:
// sete setores, sete formatos. TI tinha a própria cópia do gerenciador de categorias; RH, TI e
// o molde de Comercial/Educacional tinham cada um uma aba de prazos editando a MESMA linha da
// empresa; Comercial, Educacional e RH tinham uma aba "Acesso" que dizia "próxima fase" com os
// perfis de acesso já existindo em Configurações › Pessoas e acessos; Qualidade tinha uma aba
// "Equipe" desligada.
//
// Agora todo setor que recebe chamado abre igual: a primeira aba é **Chamados** — categorias
// (com o formulário de cada uma), prazos do setor e automações, nesta ordem, porque é a ordem
// em que um chamado acontece. Depois vêm as abas que só aquele setor tem. Setor sem fila
// (Expedição) não tem a aba Chamados.
//
// A aba vive em `?aba=`. Endereços velhos (`?aba=categorias`, `sla`, `automacoes`, `acesso`)
// caem em Chamados — link salvo não quebra.
import type { ReactNode } from 'react';
import { ListChecks, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { PrazosDeAtendimento } from '@/components/configuracoes/PrazosDeAtendimento';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useQueryState } from '@/hooks/useQueryState';
import type { TIModule } from '@/hooks/useTICategories';
import type { AutomationModule } from '@/lib/automation-flow';
import type { Department } from '@/config/access-profile-schemas';

export interface AbaDoSetor {
  valor: string;
  rotulo: string;
  icone: LucideIcon;
  conteudo: ReactNode;
  /** Falso esconde a aba (permissão). Padrão: visível. */
  visivel?: boolean;
}

interface Props {
  label: string;
  icon: LucideIcon;
  /** A fila de chamados do setor (`tickets.module`). Sem ela, o setor não tem aba Chamados. */
  modulo?: TIModule;
  /** O departamento dos perfis de acesso, quando difere do módulo (`tickets` → `ti`). */
  departamento?: Department;
  /** Artigo + nome para as frases: "o RH", "a Qualidade". */
  nomeNaFrase?: string;
  /** As abas próprias do setor, depois de Chamados. */
  abas?: AbaDoSetor[];
  /** Algo a mais dentro de Chamados, depois das categorias. */
  extraEmChamados?: ReactNode;
  /** Endereços velhos de abas que viraram outra: `{ vendedores: 'carteiras-vendedoras' }`. */
  apelidos?: Record<string, string>;
}

const APELIDOS_DE_CHAMADOS = new Set(['categorias', 'categories', 'internal', 'sla', 'automacoes', 'acesso', 'team']);

const MODULOS_COM_AUTOMACAO: ReadonlySet<string> = new Set<AutomationModule>(
  ['tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional'],
);
const temAutomacao = (m: string): m is AutomationModule => MODULOS_COM_AUTOMACAO.has(m);

export function ConfiguracaoDoSetor({
  label, icon: Icon, modulo, departamento, nomeNaFrase, abas = [], extraEmChamados, apelidos = {},
}: Props) {
  const temChamados = !!modulo;
  const { can } = useDepartmentPermissions((departamento ?? modulo ?? 'ti') as Department);
  const podeEditarCategorias = can('categories', 'edit') || can('categories', 'create');
  const frase = nomeNaFrase ?? `o ${label}`;

  const visiveis = abas.filter((a) => a.visivel !== false);
  const padrao = temChamados ? 'chamados' : (visiveis[0]?.valor ?? '');
  const [bruta, setAba] = useQueryState('aba', padrao);
  const valores = new Set([...(temChamados ? ['chamados'] : []), ...visiveis.map((a) => a.valor)]);
  // Dono próprio, não `in`: `?aba=constructor` não pode achar nada herdado de Object.
  const apelido = Object.prototype.hasOwnProperty.call(apelidos, bruta) ? apelidos[bruta] : undefined;
  const aba = valores.has(bruta)
    ? bruta
    : apelido && valores.has(apelido)
      ? apelido
      : (temChamados && APELIDOS_DE_CHAMADOS.has(bruta) ? 'chamados' : padrao);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Icon}
        title={`Configurações — ${label}`}
        description={temChamados
          ? `Os chamados que ${frase} recebe e o que é só do setor.`
          : `O que é só do setor.`}
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap h-auto">
          {temChamados && (
            <TabsTrigger value="chamados"><ListChecks className="w-3.5 h-3.5 mr-1.5" />Chamados</TabsTrigger>
          )}
          {visiveis.map((a) => {
            const Icone = a.icone;
            return <TabsTrigger key={a.valor} value={a.valor}><Icone className="w-3.5 h-3.5 mr-1.5" />{a.rotulo}</TabsTrigger>;
          })}
        </TabsList>

        {temChamados && (
          <TabsContent value="chamados" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categorias</CardTitle>
                <CardDescription>
                  Os tipos de pedido que qualquer pessoa pode abrir para {frase}, e o formulário de cada um.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryManager module={modulo} allowForms readOnly={!podeEditarCategorias} emptyLabel={frase} />
              </CardContent>
            </Card>
            {extraEmChamados}
            <PrazosDeAtendimento module={modulo} label={frase} />
            {/* O motor de automações conhece os módulos do CHECK de `automation_workflows` —
                Compras não está lá. Mostrar a seção seria um botão que responde com erro. */}
            {temAutomacao(modulo) && <AutomationsTab module={modulo} />}
          </TabsContent>
        )}

        {visiveis.map((a) => (
          <TabsContent key={a.valor} value={a.valor}>{a.conteudo}</TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
