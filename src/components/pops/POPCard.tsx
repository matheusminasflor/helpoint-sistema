import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Eye, CheckCircle2, ExternalLink } from 'lucide-react';
import { POP } from '@/hooks/usePOPs';
import { cn } from '@/lib/utils';

interface POPCardProps {
  pop: POP & { avg_rating?: number | null };
  onSelect: (pop: POP) => void;
  compact?: boolean;
}

export function POPCard({ pop, onSelect, compact = false }: POPCardProps) {
  const previewText = pop.content.slice(0, 100).replace(/[#*_]/g, '') + (pop.content.length > 100 ? '...' : '');
  
  const rating = (pop as any).avg_rating;
  const hasRating = rating != null && rating > 0;

  if (compact) {
    return (
      <button
        onClick={() => onSelect(pop)}
        className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-colors group"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {pop.title}
            </h4>
            {pop.category && (
              <Badge variant="outline" className="mt-1 text-xs">
                {pop.category}
              </Badge>
            )}
          </div>
          {hasRating && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span>{rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {pop.title}
              </h4>
              {pop.category && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {pop.category}
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {previewText}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {hasRating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span>{rating.toFixed(1)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  <span>{pop.views_count || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{pop.solved_count || 0}</span>
                </div>
              </div>

              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => onSelect(pop)}
                className="gap-1.5 h-7"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
