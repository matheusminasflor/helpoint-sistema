// Configurações › Integrações (proposta aprovada em 2026-11-04, Parte 6): os sistemas de fora num lugar só, da empresa.
// A Meta saiu dos Indicadores do Marketing e de TI › Alertas. Google, Kommo, Bling e Conecta mostram a situação real:
// quando cada um for ligado, o cartão ganha o botão dele.
import { type ReactNode } from 'react';
import { PlugZap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BuscarAgoraDaMeta } from '@/components/configuracoes/BuscarAgoraDaMeta';
import { LigacoesComSistemasDeFora } from '@/components/configuracoes/LigacoesComSistemasDeFora';
import { MetaConnectButton } from '@/components/mkt/MetaConnectButton';
import { metaParada, useLigacaoMeta } from '@/hooks/useLigacaoMeta';

const NOME_DO_TIPO = { instagram: 'Instagram', pagina: 'Página', anuncios: 'Anúncios' } as const;

const FALTA_LIGAR = [
  { nome: 'Google Workspace (Agenda e Meet)', situacao: 'Não conectado', texto: 'O administrador do Workspace autoriza uma vez.' },
  { nome: 'Kommo (leads por funil)', situacao: 'Esperando a chave', texto: 'Consumidor final, Salão, Distribuidor e Sem triagem. Até lá, os leads são lançados à mão nos Indicadores.' },
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
        {FALTA_LIGAR.map((i) => <Cartao key={i.nome} nome={i.nome} situacao={i.situacao} tom="neutro" descricao={i.texto} />)}
      </div>
    </div>
  );
}
