// Configurações › Integrações (proposta aprovada em 2026-11-04, Parte 6): os sistemas de fora num lugar só, da empresa.
// A Meta saiu dos Indicadores do Marketing e de TI › Alertas. Google, Kommo, Bling e Conecta mostram a situação real:
// quando cada um for ligado, o cartão ganha o botão dele.
import { type ReactNode } from 'react';
import { PlugZap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BuscarAgoraDaMeta } from '@/components/configuracoes/BuscarAgoraDaMeta';
import { LerAgora } from '@/components/configuracoes/LerAgora';
import { LigacoesComSistemasDeFora } from '@/components/configuracoes/LigacoesComSistemasDeFora';
import { MetaConnectButton } from '@/components/mkt/MetaConnectButton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAICredentialStatus } from '@/hooks/useTenantAICredentials';
import { unwrap } from '@/lib/supabase-result';
import { metaParada, useLigacaoMeta } from '@/hooks/useLigacaoMeta';

const NOME_DO_TIPO = { instagram: 'Instagram', pagina: 'Página', anuncios: 'Anúncios' } as const;

const FALTA_LIGAR = [
  { nome: 'Bling (vendas)', situacao: 'Esperando a chave', texto: 'Faturado pelas notas fiscais.' },
  { nome: 'Conecta Venda (Portal do Distribuidor)', situacao: 'Esperando a chave', texto: 'As chaves das contas INBRAS e MF entram nos segredos do sistema.' },
];

function Cartao({ nome, situacao, tom, descricao, children }: {
  nome: string; situacao: string; tom: 'ok' | 'perigo' | 'neutro'; descricao?: string; children?: ReactNode;
}) {
  const classe = tom === 'ok' ? 'badge-success' : tom === 'perigo' ? 'badge-danger' : 'badge-neutral';
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{nome}</CardTitle>
          <Badge variant="outline" className={`${classe} border-0`}>{situacao}</Badge>
        </div>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      {children && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

interface SituacaoDaIA { usos: number; custo_usd: number; teto_mes: number; limite_dia: number }

const dolar = (v: number) => `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Robo { ok_em: string | null; caiu_em: string | null; ultimo_erro: string | null; falhas: number; voltou_em: string | null }

/**
 * Os sistemas lidos por robô (Google, Kommo): a situação vem da tabela que o robô atualiza a cada leitura. Uma falha só
 * não é "parou" (o robô tenta de novo e só avisa na 2ª seguida, 20270212690000); quando volta, o cartão diz quando.
 */
function CartaoDeRobo({ tabela, funcao, nome, sistema, descricao }: {
  tabela: 'reuniao_robo' | 'mkt_kommo_robo'; funcao: 'google-reunioes' | 'mkt-kommo-coletar'; nome: string; sistema: string; descricao: string;
}) {
  const { tenantId } = useAuth();
  const { data: robo, isError } = useQuery({
    queryKey: [tabela, tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from(tabela as never).select('ok_em, caiu_em, ultimo_erro, falhas, voltou_em').maybeSingle()) as unknown as Robo | null,
  });
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const parado = !!robo?.caiu_em;
  const voltouHoje = !parado && !!robo?.voltou_em && Date.now() - Date.parse(robo.voltou_em) < 24 * 3600_000;
  return (
    <Cartao nome={nome} tom={parado || isError ? 'perigo' : robo?.ok_em ? 'ok' : 'neutro'}
      situacao={isError ? 'Sem informação' : parado ? `Parou desde ${quando(robo!.caiu_em!)}` : voltouHoje ? `Voltou em ${quando(robo!.voltou_em!)}` : robo?.ok_em ? 'Funcionando' : 'Aguardando a primeira leitura'}
      descricao={descricao}>
      {robo?.ok_em && <p className="text-sm text-muted-foreground">Última leitura que deu certo: {quando(robo.ok_em)}.</p>}
      {!parado && !!robo?.falhas && (
        <p className="text-sm text-muted-foreground">A última tentativa falhou ({robo.ultimo_erro}). O robô tenta de novo no próximo horário e só avisa se falhar outra vez.</p>
      )}
      {parado && robo?.ultimo_erro && <p className="text-sm font-medium text-aviso">Motivo: {robo.ultimo_erro}.</p>}
      {!parado && !robo?.falhas && robo?.ultimo_erro && <p className="text-sm font-medium text-aviso">Atenção: {robo.ultimo_erro}.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <LerAgora funcao={funcao} tabela={tabela} nome={sistema} />
        <span className="text-xs text-muted-foreground">A chave do {sistema} é trocada pelo dono no painel do {sistema}; aqui não há o que reconectar.</span>
      </div>
    </Cartao>
  );
}

function CartaoDaIA() {
  const { tenantId } = useAuth();
  const { data: credencial } = useAICredentialStatus();
  const { data: situacao } = useQuery({
    queryKey: ['ia-situacao', tenantId],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.rpc('ia_situacao' as never)) as unknown as SituacaoDaIA[])?.[0] ?? null,
  });
  const ligada = credencial?.configured;
  return (
    <Cartao nome="IA da empresa" tom={ligada ? 'ok' : 'neutro'} situacao={ligada ? 'Funcionando' : 'Esperando a chave'}
      descricao={ligada ? `Modelo ${credencial?.model ?? ''}. Só usa IA quando a pessoa clica.` : 'A chave entra em Configurações › IA.'}>
      {situacao && (
        <>
          <Progress value={Math.min(100, (Number(situacao.custo_usd) / Number(situacao.teto_mes)) * 100)} className="h-2" />
          <p className="text-sm text-muted-foreground">
            {dolar(situacao.custo_usd)} de {dolar(situacao.teto_mes)} neste mês · {situacao.usos} usos · limite de {situacao.limite_dia} por pessoa ao dia
          </p>
        </>
      )}
    </Cartao>
  );
}

export default function ConfiguracoesIntegracoes() {
  const { data: meta, isLoading, refetch } = useLigacaoMeta();
  const parada = metaParada(meta);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader icon={PlugZap} title="Integrações" description="Os sistemas de fora ligados ao Helpoint. Cada um mostra se está funcionando." />
      <div className="px-4 lg:px-8 pb-6 w-full space-y-4">
        {!isLoading && (
          <Cartao nome="Meta (Instagram e anúncios)" tom={!meta ? 'neutro' : parada ? 'perigo' : 'ok'}
            situacao={!meta ? 'Não conectada' : parada ? 'Com problema' : 'Funcionando'}
            descricao={meta ? meta.contas.map((c) => `${c.nome} (${NOME_DO_TIPO[c.tipo]})`).join(' · ') : 'Redes sociais e tráfego pago nos Indicadores do Marketing.'}>
            {meta && (
              <p className="text-sm text-muted-foreground">
                {meta.coletado_em
                  ? `Última busca: ${new Date(meta.coletado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. O robô busca a cada 3 horas.`
                  : 'Os números ainda não foram buscados. O robô busca a cada 3 horas.'}
                {meta.ultimo_erro && <span className="block font-medium text-aviso">Atenção: {meta.ultimo_erro}.</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {meta && <BuscarAgoraDaMeta />}
              <MetaConnectButton platform="indicadores" onSuccess={() => refetch()} />
            </div>
            {meta && <LigacoesComSistemasDeFora />}
          </Cartao>
        )}
        <CartaoDeRobo tabela="reuniao_robo" funcao="google-reunioes" sistema="Google" nome="Google Workspace (Agenda, Meet e Drive)"
          descricao="As reuniões da conta ti@minasflor.com entram sozinhas em Meu trabalho › Reuniões, a cada 30 minutos." />
        <CartaoDeRobo tabela="mkt_kommo_robo" funcao="mkt-kommo-coletar" sistema="Kommo" nome="Kommo (leads por funil)"
          descricao="Os leads de Consumidor final, Salão, Distribuidor e Sem triagem entram sozinhos nos Indicadores do Marketing, de hora em hora." />
        <CartaoDaIA />
        {FALTA_LIGAR.map((i) => <Cartao key={i.nome} nome={i.nome} situacao={i.situacao} tom="neutro" descricao={i.texto} />)}
      </div>
    </div>
  );
}
