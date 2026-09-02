import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subDays, subMonths, startOfYear, endOfDay, isAfter, isBefore, startOfDay } from 'date-fns';

export interface ReportFilter {
  period: 'today' | '7d' | '30d' | '90d' | 'year';
  collaboratorId?: string;
}

export interface KanbanProductivityMetrics {
  total: number;
  completed: number;
  completedOnTime: number;
  completedLate: number;
  pending: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
  avgCompletionDays: number | null;
}

export interface ActiveCard {
  id: string;
  title: string;
  priority: string | null;
  dueDate: string | null;
  columnName: string;
  assigneeName: string | null;
  assigneeAvatar: string | null;
}

export interface CollaboratorProductivity {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  completed: number;
  onTime: number;
  late: number;
  onTimePercentage: number;
  pending: number;
}

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = endOfDay(now);
  switch (period) {
    case 'today': return { start: startOfDay(now), end };
    case '7d': return { start: subDays(now, 7), end };
    case '30d': return { start: subDays(now, 30), end };
    case '90d': return { start: subMonths(now, 3), end };
    case 'year': return { start: startOfYear(now), end };
    default: return { start: subDays(now, 30), end };
  }
}

export function useKanbanReportMetrics(_department: string, _filter: ReportFilter) {
  // Kanban removed — return empty results for backwards compat with TIRelatorios
  return {
    data: {
      metrics: emptyMetrics(),
      byCollaborator: [] as CollaboratorProductivity[],
      activeCards: [] as ActiveCard[],
    },
    isLoading: false,
    error: null,
  };
}

function emptyMetrics(): KanbanProductivityMetrics {
  return {
    total: 0, completed: 0, completedOnTime: 0, completedLate: 0,
    pending: 0, inProgress: 0, overdue: 0, completionRate: 0, avgCompletionDays: null,
  };
}
