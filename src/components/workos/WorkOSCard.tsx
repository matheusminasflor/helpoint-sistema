import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WorkOSCardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function WorkOSCard({ children, className, noPadding }: WorkOSCardProps) {
  return (
    <div className={cn(
      "bg-surface-1 border border-border rounded-lg",
      !noPadding && "p-4",
      className
    )}>
      {children}
    </div>
  );
}

interface WorkOSCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function WorkOSCardHeader({ children, className }: WorkOSCardHeaderProps) {
  return (
    <div className={cn(
      "px-4 py-3 border-b border-border-subtle flex items-center justify-between",
      className
    )}>
      {children}
    </div>
  );
}

interface WorkOSCardTitleProps {
  children: ReactNode;
  className?: string;
}

export function WorkOSCardTitle({ children, className }: WorkOSCardTitleProps) {
  return (
    <h3 className={cn("text-[13px] font-medium text-foreground", className)}>
      {children}
    </h3>
  );
}

interface WorkOSCardContentProps {
  children: ReactNode;
  className?: string;
}

export function WorkOSCardContent({ children, className }: WorkOSCardContentProps) {
  return (
    <div className={cn("p-4", className)}>
      {children}
    </div>
  );
}
