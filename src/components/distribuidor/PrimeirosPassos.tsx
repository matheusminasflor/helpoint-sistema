// Primeiros passos do Portal (rodada 2, R5): depois dos termos, o que deixa o "Meu dia" útil — os salões, o estoque
// que ele já tinha e a equipe. Cada passo se marca sozinho pelo que já existe; o quadro some quando os três estão
// feitos, ou quando ele esconde (fica lembrado neste aparelho). O vendedor só tem o passo dos salões.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useEquipeDoDistribuidor } from '@/hooks/useDistribuidor';
import { useNoPortal } from '@/hooks/useNoPortal';
import { useJaInformouEstoque, useSaloes } from '@/hooks/usePortalDoDistribuidor';

const lembrar = (chave: string) => { try { localStorage.setItem(chave, '1'); } catch { /* sem armazenamento: volta a aparecer */ } };
const lembrado = (chave: string) => { try { return localStorage.getItem(chave) === '1'; } catch { return false; } };

export function PrimeirosPassos() {
  const { user } = useAuth();
  const { distribuidor, papel } = useNoPortal();
  const dono = papel === 'dono';
  const saloes = useSaloes();
  const estoque = useJaInformouEstoque();
  const equipe = useEquipeDoDistribuidor(dono ? distribuidor.id : undefined);
  const chave = `helpoint.distribuidor.primeirosPassos.${user?.id}`;
  const [escondido, setEscondido] = useState(() => lembrado(chave));
  if (escondido || saloes.isLoading || estoque.isLoading || (dono && equipe.isLoading)) return null;

  const passos = [
    { feito: (saloes.data ?? []).length > 0, to: '/distribuidor/saloes', titulo: dono ? 'Cadastre os seus salões' : 'Cadastre os salões que você atende',
      detalhe: 'Os que já compram de você e os que você quer conquistar. É deles que sai o "Meu dia".' },
    ...(dono ? [
      { feito: !!estoque.data, to: '/distribuidor/estoque?planilha=1', titulo: 'Informe o estoque que você já tem',
        detalhe: 'O que você comprar daqui em diante entra sozinho pela nota; o de antes, você informa uma vez — pela planilha é mais rápido.' },
      { feito: (equipe.data ?? []).length > 1, to: '/distribuidor/equipe', titulo: 'Convide a sua equipe',
        detalhe: 'Cada vendedor entra com o próprio login e vê os salões dele. Trabalha sozinho? Pule este passo.' },
    ] : []),
  ];
  if (passos.every((p) => p.feito)) return null;

  return (
    <Card className="p-4 space-y-3 border-primary/40">
      <div>
        <h2 className="text-[16px] font-semibold">Primeiros passos</h2>
        <p className="text-[14px] text-muted-foreground">{passos.filter((p) => p.feito).length} de {passos.length} feitos.</p>
      </div>
      <ol className="space-y-1">
        {passos.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="flex gap-3 py-2 min-h-11">
              {p.feito
                ? <CheckCircle2 className="w-5 h-5 shrink-0 text-status-success" aria-label="Feito" />
                : <Circle className="w-5 h-5 shrink-0 text-muted-foreground" aria-label="A fazer" />}
              <span className="min-w-0">
                <span className={p.feito ? 'block text-[15px] line-through text-muted-foreground' : 'block text-[15px] font-medium'}>{p.titulo}</span>
                {!p.feito && <span className="block text-[13px] text-muted-foreground">{p.detalhe}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="h-11" onClick={() => { lembrar(chave); setEscondido(true); }}>Esconder os primeiros passos</Button>
    </Card>
  );
}
