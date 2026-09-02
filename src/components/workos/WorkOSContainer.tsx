import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WorkOSContainerProps {
  children: ReactNode;
  className?: string;
}

export function WorkOSContainer({ children, className }: WorkOSContainerProps) {
  return (
    <div className={cn(
      "min-h-screen bg-background",
      className
    )}>
      {children}
    </div>
  );
}
