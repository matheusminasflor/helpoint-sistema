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
 * h1 de 20px, identificador, badge de status e ações à direita.
 * O breadcrumb é renderizado pelo AppLayout, logo acima deste componente.
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
        'flex flex-col gap-2 px-4 lg:px-6 py-3 border-b border-border bg-card',
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
            <span className="flex-shrink-0 mt-0.5 p-2 rounded-lg bg-primary/10">
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
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">{title}</h1>
            {description && (
              <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
