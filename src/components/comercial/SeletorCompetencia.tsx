// O seletor de competência do manual de Gestão Comercial §2: "Mês atual" ou um mês explícito,
// e o MÊS EXIBIDO por extenso ao lado.
//
// O manual manda conferir o mês exibido antes de ler qualquer número — um lançamento com data
// fora dele não aparece no recorte, mesmo estando certo. Por isso o mês vai por extenso e em
// destaque, e não só dentro do campo.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  competenciaAtual, competenciaPorExtenso, deslocarCompetencia,
} from '@/lib/competencia-comercial';

interface Props {
  competencia: string;
  onChange: (competencia: string) => void;
}

export function SeletorCompetencia({ competencia, onChange }: Props) {
  const atual = competenciaAtual();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mês anterior"
        onClick={() => onChange(deslocarCompetencia(competencia, -1))}>
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </Button>
      {/* `type="month"` é o seletor de mês do próprio navegador: o degrau "a plataforma
          resolve". Ele devolve AAAA-MM, que vira o primeiro dia do mês. */}
      <Input
        type="month"
        className="h-8 w-40"
        aria-label="Competência"
        value={competencia.slice(0, 7)}
        onChange={(e) => { if (e.target.value) onChange(`${e.target.value}-01`); }}
      />
      <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mês seguinte"
        onClick={() => onChange(deslocarCompetencia(competencia, 1))}>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </Button>
      {competencia !== atual && (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange(atual)}>
          Mês atual
        </Button>
      )}
      <span className="text-[12px] text-muted-foreground">
        Mês exibido: <strong className="text-foreground">{competenciaPorExtenso(competencia)}</strong>
      </span>
    </div>
  );
}
