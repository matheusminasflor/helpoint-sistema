import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';

interface WorkOSPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** @deprecated Use `PageHeader` diretamente — este componente apenas o encapsula. */
export function WorkOSPageHeader({ icon, title, description, action, className }: WorkOSPageHeaderProps) {
  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      actions={action}
      className={className}
    />
  );
}
