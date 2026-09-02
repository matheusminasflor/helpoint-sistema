import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useAssistantName } from '@/hooks/useAssistantName';

interface LyraAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-16 h-16',
};

export function LyraAvatar({ size = 'md', animated = false, className }: LyraAvatarProps) {
  // Stable, collision-free ids (Math.random re-generated on every render before)
  const assistantName = useAssistantName();
  const uid = useId().replace(/:/g, '');
  const gradientId = `lyra-gradient-${uid}`;

  return (
    <div
      className={cn(sizeMap[size], 'flex-shrink-0 relative', animated && 'lyra-pulse', className)}
      role="img"
      aria-label={`${assistantName}, assistente de IA`}
    >
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>

        <circle cx="20" cy="20" r="17" fill={`url(#${gradientId})`} />

        {/* Spark mark */}
        <path
          d="M20 9 L21.5 16 L28 18 L21.5 20 L20 27 L18.5 20 L12 18 L18.5 16 Z"
          fill="white"
          opacity="0.95"
        />
      </svg>
    </div>
  );
}
