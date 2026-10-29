import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** Título da página — renderiza o ÚNICO h1 da tela */
  title: string;
  description?: string;
  /** Ícone opcional exibido antes do título */
  icon?: LucideIcon;
  /** Identificador técnico (ex.: "#482", patrimônio) */
  identifier?: string;
  /** Badge de status (ex.: TicketStatusBadge) */
  status?: ReactNode;
  /** Ações alinhadas à direita */
  actions?: ReactNode;
  /** Ação de voltar */
  onBack?: () => void;
  sticky?: boolean;
  className?: string;
  /** Conteúdo extra abaixo do título (filtros, período) */
  children?: ReactNode;
}

/**
 * Cabeçalho único do sistema. Substitui WorkOSPageHeader e DashboardHeader:
 * h1 de 32px (24 no celular, como a DashStack), identificador, etiqueta de status e ações à direita.
 * Não há mais caminho ("Início › …") no topo (DashStack, 2026-10-28): este título é o que diz onde se está.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  identifier,
  status,
  actions,
  onBack,
  sticky = false,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // DashStack: o título grande direto sobre o fundo, sem faixa nem linha.
        'flex flex-col gap-3 px-4 lg:px-8 pt-6 pb-4 bg-background',
        sticky && 'sticky top-0 z-10',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Voltar"
              className="flex-shrink-0 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Button>
          )}
          {Icon && (
            <span className="flex-shrink-0 mt-0.5 w-11 h-11 rounded-[16px] bg-primary/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {identifier && (
                <span className="font-mono text-xs text-muted-foreground">{identifier}</span>
              )}
              {status}
            </div>
            {/* Rodada 3 (achados C7 e "cabeçalho gasta meia tela"): no celular o título mostra até 2 linhas (era cortado
                numa) e a explicação também 2 — o resto aparece no computador. */}
            <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight tracking-[-0.11px] text-foreground line-clamp-2 break-words sm:line-clamp-1">{title}</h1>
            {description && (
              <p className="text-[14px] font-semibold text-muted-foreground mt-1 max-[860px]:hidden" title={description}>{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
