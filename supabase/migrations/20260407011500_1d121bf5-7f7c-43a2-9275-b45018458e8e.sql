
-- Goals table for personal and team objectives
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  created_by uuid NOT NULL,
  assigned_to uuid NOT NULL,
  department text,
  title text NOT NULL,
  description text,
  target_value numeric NOT NULL DEFAULT 1,
  current_value numeric NOT NULL DEFAULT 0,
  goal_type text NOT NULL DEFAULT 'individual',
  frequency text NOT NULL DEFAULT 'weekly',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own goals or supervisors see all" ON public.goals
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    is_supervisor_or_higher(auth.uid())
  ));

CREATE POLICY "Users or supervisors create goals" ON public.goals
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (
    assigned_to = auth.uid() OR
    is_supervisor_or_higher(auth.uid())
  ));

CREATE POLICY "Users or supervisors update goals" ON public.goals
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (
    assigned_to = auth.uid() OR
    created_by = auth.uid() OR
    is_supervisor_or_higher(auth.uid())
  ));

CREATE POLICY "Creators or supervisors delete goals" ON public.goals
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (
    created_by = auth.uid() OR
    is_supervisor_or_higher(auth.uid())
  ));

-- Calendar events table
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  event_type text NOT NULL DEFAULT 'event',
  source_type text,
  source_id uuid,
  color text DEFAULT '#7c3aed',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events" ON public.calendar_events
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

-- Indexes
CREATE INDEX idx_goals_assigned_to ON public.goals(assigned_to);
CREATE INDEX idx_goals_tenant_status ON public.goals(tenant_id, status);
CREATE INDEX idx_calendar_events_user ON public.calendar_events(user_id, start_at);
CREATE INDEX idx_calendar_events_source ON public.calendar_events(source_type, source_id);
