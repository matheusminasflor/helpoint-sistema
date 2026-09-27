import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TEMAS, descricaoDoTema, temaEmUso, type Tema } from '@/lib/tema';
import { cn } from '@/lib/utils';

/**
 * Claro, escuro ou seguindo o computador (leva J, 2026-09-26).
 *
 * O ÍCONE MOSTRA O QUE ESTÁ VALENDO, não o que foi escolhido: com "sistema"
 * escolhido numa máquina no escuro, o ícone é a lua. Mostrar o sol ali seria o
 * botão mentindo sobre a tela — e a marca de "escolhido" na lista continua no
 * "Sistema", que é a resposta à outra pergunta.
 *
 * `montado` existe porque `next-themes` só sabe o tema depois de ler o
 * localStorage, no efeito. Desenhar antes disso pinta o ícone errado no primeiro
 * quadro e ele troca sozinho — o piscar que `suppressHydrationWarning` resolve no
 * Next e que aqui se resolve não desenhando. Até montar, o botão fica no lugar com
 * o tamanho certo, para o cabeçalho não pular.
 */
export function SeletorDeTema() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const emUso = temaEmUso(theme as Tema | undefined, systemTheme === 'dark');
  const descricao = descricaoDoTema(theme as Tema | undefined, systemTheme === 'dark');

  if (!montado) {
    return <div className="w-9 h-9" aria-hidden="true" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={descricao} aria-label={descricao}>
          {emUso === 'dark'
            ? <Moon className="w-4 h-4" aria-hidden="true" />
            : <Sun className="w-4 h-4" aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {TEMAS.map(({ valor, rotulo, descricao: oQueFaz }) => (
          <DropdownMenuItem
            key={valor}
            onClick={() => setTheme(valor)}
            className={cn('gap-2', theme === valor && 'bg-secondary')}
          >
            {valor === 'light' && <Sun className="w-4 h-4" aria-hidden="true" />}
            {valor === 'dark' && <Moon className="w-4 h-4" aria-hidden="true" />}
            {valor === 'system' && <Monitor className="w-4 h-4" aria-hidden="true" />}
            <span className="flex-1">{rotulo}</span>
            <span className="text-[11px] text-muted-foreground">{oQueFaz}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
