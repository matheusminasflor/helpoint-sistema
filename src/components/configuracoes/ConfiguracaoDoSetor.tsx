// O MOLDE DA CONFIGURAÇÃO DE UM SETOR (LEVA P, 2026-09-28).
//
// O dono: "as configurações … está muito redundante, muito bagunçado, muito confuso". Medido:
// sete setores, sete formatos. Agora todo setor que recebe chamado abre igual: a primeira aba é
// **Chamados** — categorias (com o formulário de cada uma), prazos do setor e automações, nesta
// ordem, porque é a ordem em que um chamado acontece. Depois vêm as abas que só aquele setor tem.
// Setor sem fila (Expedição) não tem a aba Chamados.
//
// ABA POR ABA (parte 7, "Jeito 1" do dono em 2026-09-29): cada aba se libera no perfil de acesso
// com ABRIR e ALTERAR (`config_<aba>`, lista em `@/config/abas-de-configuracao`).
//   * aba sem nenhuma das duas marcadas não aparece;
//   * aba só com "Abrir" aparece travada: o conteúdo vai dentro de um `<fieldset disabled>`, que
//     desliga de uma vez todo botão, campo e chave dela — a plataforma resolve, sem cada aba ter de
//     saber de permissão —, com um aviso no topo. Abas com navegação interna recebem `podeAlterar`
//     e se travam sozinhas (ver `AbaDoSetor.conteudo`). Quem garante é o banco (`pode_alterar_aba`).
//
// A aba vive em `?aba=`. Endereços velhos (`?aba=categorias`, `sla`, `automacoes`, `acesso`)
// caem em Chamados — link salvo não quebra.
import type { ReactNode } from 'react';
import { BookMarked, Eye, ListChecks, type LucideIcon } from 'lucide-react';
import { GestaoDeDiretrizes } from '@/components/diretrizes/GestaoDeDiretrizes';
import { temDiretriz } from '@/config/diretrizes';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { PrazosDeAtendimento } from '@/components/configuracoes/PrazosDeAtendimento';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { setorDoModulo } from '@/lib/permissoes';
import { useQueryState } from '@/hooks/useQueryState';
import type { TIModule } from '@/hooks/useTICategories';
import type { AutomationModule } from '@/lib/automation-flow';

export interface AbaDoSetor {
  valor: string;
  rotulo: string;
  icone: LucideIcon;
  /**
   * O conteúdo. Como elemento, a aba que a pessoa só pode ver vai inteira para dentro do
   * `<fieldset disabled>`. Como FUNÇÃO, a aba recebe `podeAlterar` e esconde ela mesma os botões
   * de alterar — para abas com navegação interna (sub-abas, expandir lista, copiar link), que o
   * fieldset também desligaria, e aí quem só pode ver não conseguiria nem olhar.
   */
  conteudo: ReactNode | ((podeAlterar: boolean) => ReactNode);
  /** A aba no perfil de acesso (`config_<permissao>`). Setor sem perfil (Expedição) não usa. */
  permissao?: string;
}

interface Props {
  label: string;
  icon: LucideIcon;
  /** A fila de chamados do setor (`tickets.module`). Sem ela, o setor não tem aba Chamados. */
  modulo?: TIModule;
  /** Artigo + nome para as frases: "o RH", "a Qualidade". */
  nomeNaFrase?: string;
  /** As abas próprias do setor, depois de Chamados. */
  abas?: AbaDoSetor[];
  /** Endereços velhos de abas que viraram outra: `{ vendedores: 'carteiras-vendedoras' }`. */
  apelidos?: Record<string, string>;
}

const APELIDOS_DE_CHAMADOS = new Set(['categorias', 'categories', 'internal', 'sla', 'automacoes', 'acesso', 'team']);

const MODULOS_COM_AUTOMACAO: ReadonlySet<string> = new Set<AutomationModule>(
  ['tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'expedicao', 'producao'],
);
const temAutomacao = (m: string): m is AutomationModule => MODULOS_COM_AUTOMACAO.has(m);

/** O conteúdo de uma aba que a pessoa só pode ver: travado, com o motivo em cima. */
function Travada({ pode, children }: { pode: boolean; children: ReactNode }) {
  if (pode) return <>{children}</>;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-[14px] rounded-md badge-info px-3 py-2">
        <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
        Você pode ver esta aba, mas não alterar. Quem libera é o perfil de acesso (Configurações › Pessoas e acessos).
      </p>
      <fieldset disabled className="min-w-0">{children}</fieldset>
    </div>
  );
}

export function ConfiguracaoDoSetor({
  label, icon: Icon, modulo, nomeNaFrase, abas = [], apelidos = {},
}: Props) {
  const { abreAba, alteraAba, pode } = useConfiguracaoDosSetores();
  const setor = modulo ? setorDoModulo(modulo) : null;
  // Setor sem perfil (Expedição): quem chegou aqui passou pela tranca do módulo, e vê tudo.
  const abre = (perm?: string) => !setor || !perm || abreAba(setor, perm);
  const altera = (perm?: string) => !setor || !perm || alteraAba(setor, perm);
  const frase = nomeNaFrase ?? `o ${label}`;

  // "Diretrizes do <setor>" (decisão do dono, 2026-10-04): aba de todo setor menos o Comercial, para
  // quem escreve ou publica — a seção `diretrizes` do perfil, não uma aba `config_*`. Os botões de
  // dentro obedecem cada caixinha.
  const abaDeDiretrizes: AbaDoSetor[] = temDiretriz(setor)
    && (pode(setor, 'diretrizes', 'edit') || pode(setor, 'diretrizes', 'publish'))
    ? [{ valor: 'diretrizes', rotulo: 'Diretrizes', icone: BookMarked, conteudo: () => <GestaoDeDiretrizes setor={setor} /> }]
    : [];

  const temChamados = !!modulo && abre('chamados');
  const podeAlterarChamados = altera('chamados');
  const visiveis = [...abas.filter((a) => abre(a.permissao)), ...abaDeDiretrizes];
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
        description={modulo
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

        {temChamados && modulo && (
          <TabsContent value="chamados" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categorias</CardTitle>
                <CardDescription>
                  Os tipos de pedido que qualquer pessoa pode abrir para {frase}, e o formulário de cada um.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryManager module={modulo} allowForms comResponsaveis readOnly={!podeAlterarChamados} emptyLabel={frase} />
              </CardContent>
            </Card>
            <PrazosDeAtendimento module={modulo} label={frase} podeEditar={podeAlterarChamados} />
            {/* O motor de automações conhece os módulos do CHECK de `automation_workflows` —
                Compras não está lá. Mostrar a seção seria um botão que responde com erro. */}
            {temAutomacao(modulo) && <AutomationsTab module={modulo} />}
          </TabsContent>
        )}

        {visiveis.map((a) => (
          <TabsContent key={a.valor} value={a.valor}>
            {typeof a.conteudo === 'function'
              ? a.conteudo(altera(a.permissao))
              : <Travada pode={altera(a.permissao)}>{a.conteudo}</Travada>}
          </TabsContent>
        ))}
      </Tabs>

      {!temChamados && visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma aba deste setor está liberada no seu perfil de acesso.</p>
      )}
    </div>
  );
}
