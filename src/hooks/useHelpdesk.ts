import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import type { Ticket, Asset, TicketWithDetails, TicketPriority } from '@/types/helpdesk';
import { unwrap } from '@/lib/supabase-result';

// Maps profile.department to ticket module
function departmentToModule(department: string | null | undefined): string | null {
  if (!department) return null;
  const map: Record<string, string> = {
    ti: 'tickets',
    marketing: 'marketing',
  };
  return map[department.toLowerCase()] || null;
}

export function useMyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email, department),
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email),
          asset:assets(*)
        `)
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets((data as unknown as TicketWithDetails[]) || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  return { tickets, isLoading, refetch: fetchTickets };
}

export function useTicketQueue(moduleFilter?: string) {
  const { user, role, profile } = useAuth();
  const { data: tenantSettings } = useTenantSettings();
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    if (!user) return;
    
    try {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email, department),
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email),
          asset:assets(*)
        `)
        .in('status', ['open', 'in_progress', 'waiting_user', 'waiting_parts'])
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      // Module isolation: each panel (TI, MKT, RH, Qualidade) only shows its own module — applies to all roles including admin.
      if (moduleFilter) {
        query = query.eq('module', moduleFilter);
      }

      // Department isolation (legacy): non-privileged users without explicit moduleFilter still get their own dept's module.
      const isolationEnabled = tenantSettings?.helpdesk?.departmentIsolation ?? true;
      const isPrivileged = role === 'owner' || role === 'admin' || role === 'manager';

      if (!moduleFilter && isolationEnabled && !isPrivileged) {
        const myModule = departmentToModule(profile?.department);
        if (myModule) {
          const mentions = unwrap(await supabase
            .from('ticket_mentions')
            .select('ticket_id')
            .eq('mentioned_user_id', user.id));

          const mentionedTicketIds = (mentions || []).map(m => (m as any).ticket_id as string);

          if (mentionedTicketIds.length > 0) {
            query = query.or(`module.eq.${myModule},id.in.(${mentionedTicketIds.join(',')})`);
          } else {
            query = query.eq('module', myModule);
          }
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets((data as unknown as TicketWithDetails[]) || []);
    } catch (error) {
      console.error('Error fetching ticket queue:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, role, profile, tenantSettings, moduleFilter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return { tickets, isLoading, refetch: fetchQueue };
}

export function useTicketHistory(moduleFilter?: string) {
  const { user, role, profile } = useAuth();
  const { data: tenantSettings } = useTenantSettings();
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    
    try {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          requester:profiles!tickets_requester_id_fkey(id, full_name, email, department),
          assignee:profiles!tickets_assigned_to_fkey(id, full_name, email),
          asset:assets(*)
        `)
        .in('status', ['resolved', 'closed', 'cancelled'])
        .order('resolved_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false });

      if (moduleFilter) {
        query = query.eq('module', moduleFilter);
      }

      const isolationEnabled = tenantSettings?.helpdesk?.departmentIsolation ?? true;
      const isPrivileged = role === 'owner' || role === 'admin' || role === 'manager';

      if (!moduleFilter && isolationEnabled && !isPrivileged) {
        const myModule = departmentToModule(profile?.department);
        if (myModule) {
          const mentions = unwrap(await supabase
            .from('ticket_mentions')
            .select('ticket_id')
            .eq('mentioned_user_id', user.id));

          const mentionedTicketIds = (mentions || []).map(m => (m as any).ticket_id as string);

          if (mentionedTicketIds.length > 0) {
            query = query.or(`module.eq.${myModule},id.in.(${mentionedTicketIds.join(',')})`);
          } else {
            query = query.eq('module', myModule);
          }
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets((data as unknown as TicketWithDetails[]) || []);
    } catch (error) {
      console.error('Error fetching ticket history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, role, profile, tenantSettings, moduleFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { tickets, isLoading, refetch: fetchHistory };
}


export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;
      setAssets((data as Asset[]) || []);
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return { assets, isLoading, refetch: fetchAssets };
}

export function useMyAssets() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('assigned_to', user.id)
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (error) throw error;
      setAssets((data as Asset[]) || []);
    } catch (error) {
      console.error('Error fetching my assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return { assets, isLoading, refetch: fetchAssets };
}

interface CreateTicketData {
  title: string;
  description: string;
  category_id?: string;
  category?: string;
  subcategory?: string;
  priority?: TicketPriority;
  asset_id?: string;
  due_date?: string;
  assigned_to?: string;
  module?: string;
}

export function useCreateTicket() {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const createTicket = async (data: CreateTicketData) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsCreating(true);
    try {
      const insertData: any = {
        title: data.title,
        description: data.description,
        category_id: data.category_id,
        category: data.category,
        subcategory: data.subcategory,
        asset_id: data.asset_id,
        requester_id: user.id,
        created_by: user.id,
        priority: data.priority || 'medium',
        module: data.module || 'tickets',
      };


      if (data.due_date) {
        insertData.due_date = data.due_date;
      }

      if (data.assigned_to) {
        insertData.assigned_to = data.assigned_to;
        insertData.status = 'in_progress';
        insertData.first_response_at = new Date().toISOString();
      }

      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return ticket as Ticket;
    } finally {
      setIsCreating(false);
    }
  };

  return { createTicket, isCreating };
}

export function useUpdateTicket() {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateTicket = async (ticketId: string, data: Partial<Ticket>) => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update(data)
        .eq('id', ticketId);

      if (error) throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const assignToMe = async (ticketId: string, userId: string) => {
    await updateTicket(ticketId, { 
      assigned_to: userId, 
      status: 'in_progress',
      first_response_at: new Date().toISOString()
    });
  };

  const resolveTicket = async (ticketId: string, resolutionNotes: string) => {
    await updateTicket(ticketId, { 
      status: 'resolved',
      resolution_notes: resolutionNotes,
      resolved_at: new Date().toISOString()
    });
  };

  return { updateTicket, assignToMe, resolveTicket, isUpdating };
}
