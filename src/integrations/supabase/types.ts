export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          id: string
          is_default: boolean
          legacy_ti_profile_id: string | null
          name: string
          permissions: Json
          restrictions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: string
          description?: string | null
          id?: string
          is_default?: boolean
          legacy_ti_profile_id?: string | null
          name: string
          permissions?: Json
          restrictions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          is_default?: boolean
          legacy_ti_profile_id?: string | null
          name?: string
          permissions?: Json
          restrictions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenances: {
        Row: {
          asset_id: string
          auto_create_ticket: boolean
          completed_date: string | null
          cost: number | null
          created_at: string
          description: string | null
          external_provider: string | null
          id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          notes: string | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          technician_id: string | null
          tenant_id: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          auto_create_ticket?: boolean
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          external_provider?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_id?: string | null
          tenant_id: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          auto_create_ticket?: boolean
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          external_provider?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_id?: string | null
          tenant_id?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenances_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenances_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenances_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          category: Database["public"]["Enums"]["asset_category"]
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          serial_number: string | null
          specs: Json | null
          status: Database["public"]["Enums"]["asset_status"]
          subcategory: string | null
          tenant_id: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          specs?: Json | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          specs?: Json | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_fired: {
        Row: {
          fired_at: string
          subject_id: string
          workflow_id: string
        }
        Insert: {
          fired_at?: string
          subject_id: string
          workflow_id: string
        }
        Update: {
          fired_at?: string
          subject_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_fired_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          context: Json
          created_at: string
          current_step_ids: string[]
          ended_at: string | null
          error: string | null
          executed_steps: number
          flow: Json
          id: string
          pending_kind: string | null
          pending_step_id: string | null
          resume_at: string | null
          started_at: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          trigger_kind: string
          workflow_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          current_step_ids?: string[]
          ended_at?: string | null
          error?: string | null
          executed_steps?: number
          flow: Json
          id?: string
          pending_kind?: string | null
          pending_step_id?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          trigger_kind: string
          workflow_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          current_step_ids?: string[]
          ended_at?: string | null
          error?: string | null
          executed_steps?: number
          flow?: Json
          id?: string
          pending_kind?: string | null
          pending_step_id?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          trigger_kind?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_error: string | null
          last_run_at: string | null
          module: string
          name: string
          next_run_at: string | null
          run_count: number
          status: string
          steps: Json
          tenant_id: string
          trigger: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          module: string
          name: string
          next_run_at?: string | null
          run_count?: number
          status?: string
          steps?: Json
          tenant_id: string
          trigger?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          module?: string
          name?: string
          next_run_at?: string | null
          run_count?: number
          status?: string
          steps?: Json
          tenant_id?: string
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          created_at: string
          description: string | null
          end_at: string | null
          event_type: string
          google_event_id: string | null
          id: string
          is_exception: boolean
          is_recurring: boolean
          occurrence_index: number | null
          original_start_at: string | null
          recurrence_byweekday: number[] | null
          recurrence_count: number | null
          recurrence_end_date: string | null
          recurrence_end_type: string
          recurrence_freq: string
          recurrence_interval: number
          recurrence_rule: string | null
          recurrence_unit: string | null
          reminder_offsets: number[]
          reminders_sent: number[]
          series_id: string | null
          source_id: string | null
          source_type: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string
          google_event_id?: string | null
          id?: string
          is_exception?: boolean
          is_recurring?: boolean
          occurrence_index?: number | null
          original_start_at?: string | null
          recurrence_byweekday?: number[] | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string
          recurrence_freq?: string
          recurrence_interval?: number
          recurrence_rule?: string | null
          recurrence_unit?: string | null
          reminder_offsets?: number[]
          reminders_sent?: number[]
          series_id?: string | null
          source_id?: string | null
          source_type?: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string
          google_event_id?: string | null
          id?: string
          is_exception?: boolean
          is_recurring?: boolean
          occurrence_index?: number | null
          original_start_at?: string | null
          recurrence_byweekday?: number[] | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string
          recurrence_freq?: string
          recurrence_interval?: number
          recurrence_rule?: string | null
          recurrence_unit?: string | null
          reminder_offsets?: number[]
          reminders_sent?: number[]
          series_id?: string | null
          source_id?: string | null
          source_type?: string | null
          start_at?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_bindings: {
        Row: {
          created_at: string
          id: string
          priority: number
          target_id: string
          target_type: string
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number
          target_id: string
          target_type?: string
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number
          target_id?: string
          target_type?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_bindings_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_bindings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_required: boolean
          responsible_sector: string | null
          sort_order: number
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          module: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          bling_contact_id: string | null
          carrier: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string | null
          custom: Json
          customer_profile_id: string | null
          document: string | null
          email: string | null
          id: string
          import_id: string | null
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          price_table_id: string | null
          segment_id: string | null
          source: string
          state: string | null
          tenant_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          bling_contact_id?: string | null
          carrier?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_profile_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_id?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          price_table_id?: string | null
          segment_id?: string | null
          source?: string
          state?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          bling_contact_id?: string | null
          carrier?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_profile_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_id?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          price_table_id?: string | null
          segment_id?: string | null
          source?: string
          state?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "crm_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_custom_fields: {
        Row: {
          created_at: string
          entity: string
          id: string
          is_active: boolean
          key: string
          label: string
          options: Json
          position: number
          required: boolean
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deal_activities: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          deal_id: string
          id: string
          kind: string
          meta: Json
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          deal_id: string
          id?: string
          kind: string
          meta?: Json
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          kind?: string
          meta?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deal_activities_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          custom: Json
          expected_close_date: string | null
          id: string
          import_id: string | null
          lost_at: string | null
          lost_reason: string | null
          owner_id: string | null
          position: number
          source: string
          stage_id: string
          tenant_id: string
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          expected_close_date?: string | null
          id?: string
          import_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          position?: number
          source?: string
          stage_id: string
          tenant_id: string
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          expected_close_date?: string | null
          id?: string
          import_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          position?: number
          source?: string
          stage_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "crm_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_imports: {
        Row: {
          contacts_created: number
          contacts_reused: number
          created_at: string
          created_by: string | null
          deals_created: number
          errors: Json
          file_name: string
          finished_at: string | null
          id: string
          pipeline_id: string | null
          rows_total: number
          status: string
          tenant_id: string
        }
        Insert: {
          contacts_created?: number
          contacts_reused?: number
          created_at?: string
          created_by?: string | null
          deals_created?: number
          errors?: Json
          file_name?: string
          finished_at?: string | null
          id?: string
          pipeline_id?: string | null
          rows_total?: number
          status?: string
          tenant_id: string
        }
        Update: {
          contacts_created?: number
          contacts_reused?: number
          created_at?: string
          created_by?: string | null
          deals_created?: number
          errors?: Json
          file_name?: string
          finished_at?: string | null
          id?: string
          pipeline_id?: string | null
          rows_total?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_imports_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_order_items: {
        Row: {
          description: string
          id: string
          order_id: string
          position: number
          product_id: string | null
          quantity: number
          tenant_id: string
          total: number | null
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          order_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          tenant_id: string
          total?: number | null
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          order_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          tenant_id?: string
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_orders: {
        Row: {
          accepted_at: string | null
          bling_error: string | null
          bling_nfe_id: string | null
          bling_order_id: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          danfe_url: string | null
          deal_id: string | null
          discount: number
          id: string
          link_expires_at: string | null
          link_kind: string | null
          link_url: string | null
          nfe_key: string | null
          nfe_status: string | null
          notes: string | null
          number: number
          paid_at: string | null
          payment_provider: string | null
          price_table_id: string | null
          proposal_sent_at: string | null
          proposal_valid_until: string | null
          provider_coupon_id: string | null
          provider_link_id: string | null
          provider_order_id: string | null
          public_token: string
          shipping: number
          status: string
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          bling_error?: string | null
          bling_nfe_id?: string | null
          bling_order_id?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          link_expires_at?: string | null
          link_kind?: string | null
          link_url?: string | null
          nfe_key?: string | null
          nfe_status?: string | null
          notes?: string | null
          number: number
          paid_at?: string | null
          payment_provider?: string | null
          price_table_id?: string | null
          proposal_sent_at?: string | null
          proposal_valid_until?: string | null
          provider_coupon_id?: string | null
          provider_link_id?: string | null
          provider_order_id?: string | null
          public_token?: string
          shipping?: number
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          bling_error?: string | null
          bling_nfe_id?: string | null
          bling_order_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          link_expires_at?: string | null
          link_kind?: string | null
          link_url?: string | null
          nfe_key?: string | null
          nfe_status?: string | null
          notes?: string | null
          number?: number
          paid_at?: string | null
          payment_provider?: string | null
          price_table_id?: string | null
          proposal_sent_at?: string | null
          proposal_valid_until?: string | null
          provider_coupon_id?: string | null
          provider_link_id?: string | null
          provider_order_id?: string | null
          public_token?: string
          shipping?: number
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_payment_events: {
        Row: {
          event_id: string
          order_id: string | null
          provider: string
          received_at: string
          tenant_id: string | null
          type: string
        }
        Insert: {
          event_id: string
          order_id?: string | null
          provider: string
          received_at?: string
          tenant_id?: string | null
          type: string
        }
        Update: {
          event_id?: string
          order_id?: string | null
          provider?: string
          received_at?: string
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          pipeline_id: string
          position: number
          required_fields: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          pipeline_id: string
          position?: number
          required_fields?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          pipeline_id?: string
          position?: number
          required_fields?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_price_table_items: {
        Row: {
          id: string
          price: number
          price_table_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          price: number
          price_table_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          price?: number
          price_table_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_price_table_items_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_price_table_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_price_table_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_price_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          percent: number
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          percent?: number
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          percent?: number
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_price_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_products: {
        Row: {
          bling_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          sku: string | null
          tenant_id: string
          unit: string
          updated_at: string
          yampi_sku_id: string | null
        }
        Insert: {
          bling_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sku?: string | null
          tenant_id: string
          unit?: string
          updated_at?: string
          yampi_sku_id?: string | null
        }
        Update: {
          bling_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sku?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          yampi_sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          pipeline_id: string | null
          position: number
          price_table_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pipeline_id?: string | null
          position?: number
          price_table_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pipeline_id?: string | null
          position?: number
          price_table_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_segments_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_segments_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          blocked_at: string | null
          blocked_by: string | null
          cnpj: string | null
          created_at: string
          document: string | null
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          onboarded_at: string | null
          phone: string | null
          razao_social: string | null
          tenant_id: string
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj?: string | null
          created_at?: string
          document?: string | null
          email: string
          full_name: string
          id?: string
          is_blocked?: boolean
          onboarded_at?: string | null
          phone?: string | null
          razao_social?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj?: string | null
          created_at?: string
          document?: string | null
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          onboarded_at?: string | null
          phone?: string | null
          razao_social?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_email_otps: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      dashboard_preferences: {
        Row: {
          created_at: string
          default_period: string
          id: string
          module: string
          tenant_id: string
          updated_at: string
          user_id: string
          visible_widgets: string[]
          widget_order: string[]
        }
        Insert: {
          created_at?: string
          default_period?: string
          id?: string
          module?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          visible_widgets?: string[]
          widget_order?: string[]
        }
        Update: {
          created_at?: string
          default_period?: string
          id?: string
          module?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          visible_widgets?: string[]
          widget_order?: string[]
        }
        Relationships: []
      }
      dashboard_view_templates: {
        Row: {
          active_tab: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          selected_period: string
          technician_filter: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_tab?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          selected_period?: string
          technician_filter?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_tab?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          selected_period?: string
          technician_filter?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_view_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access_grants: {
        Row: {
          access_type: string
          created_at: string
          details: Json | null
          employee_id: string | null
          employee_name: string
          granted_at: string
          granted_by: string | null
          id: string
          name: string
          revoke_ticket_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          access_type: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          employee_name: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          name: string
          revoke_ticket_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          access_type?: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          employee_name?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          name?: string
          revoke_ticket_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_access_grants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_revoke_ticket_id_fkey"
            columns: ["revoke_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_maps: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_budget_settings: {
        Row: {
          created_at: string
          mode: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          mode?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          mode?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_department_budgets: {
        Row: {
          created_at: string
          department: string
          id: string
          monthly_limit: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          id?: string
          monthly_limit?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          monthly_limit?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_entries: {
        Row: {
          amount: number
          category: string | null
          competence: string
          cost_center: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          description: string
          document_number: string | null
          due_date: string
          external_id: string | null
          id: string
          import_id: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          notes: string | null
          payment_method: string | null
          settled_at: string | null
          source: string
          status: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          competence: string
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          document_number?: string | null
          due_date: string
          external_id?: string | null
          id?: string
          import_id?: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          notes?: string | null
          payment_method?: string | null
          settled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          competence?: string
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          document_number?: string | null
          due_date?: string
          external_id?: string | null
          id?: string
          import_id?: string | null
          kind?: Database["public"]["Enums"]["fin_entry_kind"]
          notes?: string | null
          payment_method?: string | null
          settled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "fin_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_imports: {
        Row: {
          competence: string | null
          created_at: string
          file_name: string
          format: string
          id: string
          imported_by: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          row_count: number
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          competence?: string | null
          created_at?: string
          file_name: string
          format?: string
          id?: string
          imported_by?: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          row_count?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          competence?: string | null
          created_at?: string
          file_name?: string
          format?: string
          id?: string
          imported_by?: string | null
          kind?: Database["public"]["Enums"]["fin_entry_kind"]
          row_count?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      fin_purchase_products: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_purchase_quotes: {
        Row: {
          amount: number
          created_at: string
          file_path: string | null
          id: string
          link: string | null
          notes: string | null
          position: number
          request_id: string
          supplier: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          file_path?: string | null
          id?: string
          link?: string | null
          notes?: string | null
          position?: number
          request_id: string
          supplier: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          file_path?: string | null
          id?: string
          link?: string | null
          notes?: string | null
          position?: number
          request_id?: string
          supplier?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_purchase_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fin_purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_purchase_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_quote_id: string | null
          created_at: string
          created_by: string | null
          department: string | null
          estimated_amount: number | null
          executed_at: string | null
          executed_by: string | null
          id: string
          product_id: string | null
          product_link: string | null
          product_name: string
          purchase_file_path: string | null
          purchase_report: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          estimated_amount?: number | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          product_id?: string | null
          product_link?: string | null
          product_name: string
          purchase_file_path?: string | null
          purchase_report?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          estimated_amount?: number | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          product_id?: string | null
          product_link?: string | null
          product_name?: string
          purchase_file_path?: string | null
          purchase_report?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_purchase_requests_approved_quote_fkey"
            columns: ["approved_quote_id"]
            isOneToOne: false
            referencedRelation: "fin_purchase_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fin_purchase_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_purchase_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          assigned_to: string
          completed_at: string | null
          created_at: string
          created_by: string
          current_value: number
          department: string | null
          description: string | null
          end_date: string
          frequency: string
          goal_type: string
          id: string
          start_date: string
          status: string
          target_value: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          current_value?: number
          department?: string | null
          description?: string | null
          end_date: string
          frequency?: string
          goal_type?: string
          id?: string
          start_date: string
          status?: string
          target_value?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          current_value?: number
          department?: string | null
          description?: string | null
          end_date?: string
          frequency?: string
          goal_type?: string
          id?: string
          start_date?: string
          status?: string
          target_value?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      license_assignments: {
        Row: {
          asset_id: string | null
          assigned_at: string
          assigned_by: string | null
          assigned_to: string | null
          id: string
          license_id: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          asset_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: string
          license_id: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          asset_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: string
          license_id?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      lyra_security_blocks: {
        Row: {
          blocked_until: string | null
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
          violation_count: number
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          violation_count?: number
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          violation_count?: number
        }
        Relationships: []
      }
      mkt_ai_generations: {
        Row: {
          accepted: boolean | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          model_used: string | null
          post_id: string | null
          prompt: string
          result: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          model_used?: string | null
          post_id?: string | null
          prompt: string
          result?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Update: {
          accepted?: boolean | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          model_used?: string | null
          post_id?: string | null
          prompt?: string
          result?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ai_generations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "mkt_social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_artist_contracts: {
        Row: {
          artist_id: string
          base_bonus: number
          contract_end: string | null
          contract_start: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          base_bonus?: number
          contract_end?: string | null
          contract_start: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          base_bonus?: number
          contract_end?: string | null
          contract_start?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_artist_contracts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "mkt_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_artist_contracts_influencer_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "mkt_influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_artist_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_artist_deliverables: {
        Row: {
          contract_id: string
          created_at: string
          deliverable_type: string
          frequency: Database["public"]["Enums"]["deliverable_frequency"]
          id: string
          target_quantity: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          deliverable_type: string
          frequency?: Database["public"]["Enums"]["deliverable_frequency"]
          id?: string
          target_quantity?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          deliverable_type?: string
          frequency?: Database["public"]["Enums"]["deliverable_frequency"]
          id?: string
          target_quantity?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_artist_deliverables_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "mkt_artist_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_artist_deliverables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_artist_deliveries: {
        Row: {
          created_at: string
          deliverable_id: string
          delivered_at: string
          id: string
          image_url: string | null
          notes: string | null
          post_url: string | null
          proof_url: string | null
          registered_by: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          deliverable_id: string
          delivered_at?: string
          id?: string
          image_url?: string | null
          notes?: string | null
          post_url?: string | null
          proof_url?: string | null
          registered_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          deliverable_id?: string
          delivered_at?: string
          id?: string
          image_url?: string | null
          notes?: string | null
          post_url?: string | null
          proof_url?: string | null
          registered_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_artist_deliveries_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "mkt_artist_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_artist_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_artists: {
        Row: {
          avatar_url: string | null
          cache_value: number | null
          contract_status: string
          created_at: string
          created_by: string | null
          email: string | null
          genre: string | null
          id: string
          monthly_goal: number | null
          name: string
          notes: string | null
          phone: string | null
          stage_name: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cache_value?: number | null
          contract_status?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          genre?: string | null
          id?: string
          monthly_goal?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          stage_name?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cache_value?: number | null
          contract_status?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          genre?: string | null
          id?: string
          monthly_goal?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          stage_name?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_artists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_artists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          subcategory: string | null
          tenant_id: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_event_participants: {
        Row: {
          created_at: string
          event_id: string
          fee: number | null
          id: string
          influencer_id: string | null
          notes: string | null
          participant_name: string | null
          role: Database["public"]["Enums"]["event_participant_role"]
          status: Database["public"]["Enums"]["event_participant_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          fee?: number | null
          id?: string
          influencer_id?: string | null
          notes?: string | null
          participant_name?: string | null
          role?: Database["public"]["Enums"]["event_participant_role"]
          status?: Database["public"]["Enums"]["event_participant_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          fee?: number | null
          id?: string
          influencer_id?: string | null
          notes?: string | null
          participant_name?: string | null
          role?: Database["public"]["Enums"]["event_participant_role"]
          status?: Database["public"]["Enums"]["event_participant_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_event_participants_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "mkt_influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_event_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_events: {
        Row: {
          actual_cost: number | null
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: Database["public"]["Enums"]["mkt_event_type"]
          id: string
          is_online: boolean
          location: string | null
          notes: string | null
          responsible_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["mkt_event_type"]
          id?: string
          is_online?: boolean
          location?: string | null
          notes?: string | null
          responsible_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["mkt_event_type"]
          id?: string
          is_online?: boolean
          location?: string | null
          notes?: string | null
          responsible_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_events_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_influencers: {
        Row: {
          avatar_url: string | null
          category: Database["public"]["Enums"]["influencer_category"]
          created_at: string
          created_by: string | null
          email: string | null
          engagement_rate: number | null
          followers_count: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          price_range: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          stage_name: string | null
          status: Database["public"]["Enums"]["influencer_status"]
          tags: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          category?: Database["public"]["Enums"]["influencer_category"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          engagement_rate?: number | null
          followers_count?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          price_range?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          stage_name?: string | null
          status?: Database["public"]["Enums"]["influencer_status"]
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          category?: Database["public"]["Enums"]["influencer_category"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          engagement_rate?: number | null
          followers_count?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          price_range?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          stage_name?: string | null
          status?: Database["public"]["Enums"]["influencer_status"]
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_influencers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_influencers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_payout_rules: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          min_percentage: number
          payout_percentage: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          min_percentage?: number
          payout_percentage?: number
          sort_order?: number
          tenant_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          min_percentage?: number
          payout_percentage?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_payout_rules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "mkt_artist_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_payout_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          items: Json | null
          notes: string | null
          purchase_order_ref: string | null
          status: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id: string
          tenant_id: string
          title: string
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_ref?: string | null
          status?: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id: string
          tenant_id: string
          title: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_ref?: string | null
          status?: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id?: string
          tenant_id?: string
          title?: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "mkt_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_account_secrets: {
        Row: {
          access_token: string | null
          account_id: string
          created_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id: string
          created_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string
          created_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_account_secrets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "mkt_social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string
          created_at: string
          id: string
          is_active: boolean
          is_connected: boolean
          last_sync_at: string | null
          page_id: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          page_id?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          page_id?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_posts: {
        Row: {
          account_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          external_link: string | null
          hashtags: string[] | null
          id: string
          influencer_id: string | null
          media_urls: string[] | null
          notes: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_type: Database["public"]["Enums"]["social_post_type"]
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["social_post_status"]
          strategy_notes: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_link?: string | null
          hashtags?: string[] | null
          id?: string
          influencer_id?: string | null
          media_urls?: string[] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_type?: Database["public"]["Enums"]["social_post_type"]
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          strategy_notes?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_link?: string | null
          hashtags?: string[] | null
          id?: string
          influencer_id?: string | null
          media_urls?: string[] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_type?: Database["public"]["Enums"]["social_post_type"]
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          strategy_notes?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "mkt_influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_suppliers: {
        Row: {
          category: Database["public"]["Enums"]["mkt_supplier_category"]
          cnpj: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          rating: number | null
          services: string[] | null
          status: Database["public"]["Enums"]["mkt_supplier_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["mkt_supplier_category"]
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          rating?: number | null
          services?: string[] | null
          status?: Database["public"]["Enums"]["mkt_supplier_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["mkt_supplier_category"]
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          rating?: number | null
          services?: string[] | null
          status?: Database["public"]["Enums"]["mkt_supplier_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      network_diagrams: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          payload: Json
          processed_at: string | null
          recipient_email: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          email_sent: boolean
          id: string
          is_read: boolean
          message: string
          reference_id: string
          reference_type: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message: string
          reference_id: string
          reference_type: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string
          reference_type?: string
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_attachments: {
        Row: {
          caption: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          pop_id: string
          sort_order: number | null
          tenant_id: string
          thumbnail_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          pop_id: string
          sort_order?: number | null
          tenant_id: string
          thumbnail_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          pop_id?: string
          sort_order?: number | null
          tenant_id?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pop_attachments_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_feedbacks: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          is_helpful: boolean | null
          pop_id: string
          rating: number
          suggestion: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful?: boolean | null
          pop_id: string
          rating: number
          suggestion?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful?: boolean | null
          pop_id?: string
          rating?: number
          suggestion?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_feedbacks_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_interactions: {
        Row: {
          action: string
          created_at: string | null
          id: string
          pop_id: string
          tenant_id: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          pop_id: string
          tenant_id: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          pop_id?: string
          tenant_id?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_interactions_pop_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_interactions_ticket_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_versions: {
        Row: {
          category: string | null
          change_summary: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          keywords: string[] | null
          pop_id: string
          subcategory: string | null
          tenant_id: string
          title: string
          version_number: number
        }
        Insert: {
          category?: string | null
          change_summary?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          keywords?: string[] | null
          pop_id: string
          subcategory?: string | null
          tenant_id: string
          title: string
          version_number?: number
        }
        Update: {
          category?: string | null
          change_summary?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          keywords?: string[] | null
          pop_id?: string
          subcategory?: string | null
          tenant_id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pop_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_versions_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pops: {
        Row: {
          audience: string
          avg_rating: number | null
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          related_pattern_id: string | null
          solved_count: number | null
          subcategory: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          views_count: number | null
          visibility_departments: string[] | null
          visibility_type: string
        }
        Insert: {
          audience?: string
          avg_rating?: number | null
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          related_pattern_id?: string | null
          solved_count?: number | null
          subcategory?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          views_count?: number | null
          visibility_departments?: string[] | null
          visibility_type?: string
        }
        Update: {
          audience?: string
          avg_rating?: number | null
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          related_pattern_id?: string | null
          solved_count?: number | null
          subcategory?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          views_count?: number | null
          visibility_departments?: string[] | null
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pops_related_pattern_fkey"
            columns: ["related_pattern_id"]
            isOneToOne: false
            referencedRelation: "ticket_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_history: {
        Row: {
          archived_at: string
          archived_by: string | null
          created_at: string
          id: string
          reason: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          tenant_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          tenant_id: string
          user_id: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          job_title?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualidade_access_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          permissions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          permissions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          permissions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualidade_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualidade_user_profiles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualidade_user_profiles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qualidade_access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_absences: {
        Row: {
          created_at: string
          date: string
          days: number
          employee_id: string
          hours: number
          id: string
          justified: boolean
          kind: string
          notes: string | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          days?: number
          employee_id: string
          hours?: number
          id?: string
          justified?: boolean
          kind?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          days?: number
          employee_id?: string
          hours?: number
          id?: string
          justified?: boolean
          kind?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_benefit_plans: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          monthly_value: number | null
          name: string
          provider: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_value?: number | null
          name: string
          provider?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_value?: number | null
          name?: string
          provider?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_companies: {
        Row: {
          cnpj: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_departments_catalog: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_documents: {
        Row: {
          created_at: string
          document_type: string
          expires_at: string | null
          file_path: string
          id: string
          issue_date: string | null
          notes: string | null
          tenant_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          document_type: string
          expires_at?: string | null
          file_path: string
          id?: string
          issue_date?: string | null
          notes?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_path?: string
          id?: string
          issue_date?: string | null
          notes?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_employee_benefits: {
        Row: {
          created_at: string
          created_by: string | null
          dependents: Json
          end_date: string | null
          id: string
          notes: string | null
          plan_id: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dependents?: Json
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          start_date?: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dependents?: Json
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_employee_benefits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rh_benefit_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_employee_benefits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_employee_profiles: {
        Row: {
          access_email: string | null
          admission_date: string | null
          base_salary: number | null
          birth_date: string | null
          company_id: string | null
          contract_type: string | null
          cost_center: string | null
          cpf: string | null
          created_at: string
          department: string | null
          full_name: string | null
          id: string
          job_title: string | null
          last_vacation_end: string | null
          manager_name: string | null
          manager_user_id: string | null
          matricula: string | null
          position: string | null
          probation_45: string | null
          probation_90: string | null
          status: string | null
          tenant_id: string
          termination_date: string | null
          updated_at: string
          user_id: string | null
          vacation_balance_days: number
        }
        Insert: {
          access_email?: string | null
          admission_date?: string | null
          base_salary?: number | null
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_vacation_end?: string | null
          manager_name?: string | null
          manager_user_id?: string | null
          matricula?: string | null
          position?: string | null
          probation_45?: string | null
          probation_90?: string | null
          status?: string | null
          tenant_id: string
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_balance_days?: number
        }
        Update: {
          access_email?: string | null
          admission_date?: string | null
          base_salary?: number | null
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_vacation_end?: string | null
          manager_name?: string | null
          manager_user_id?: string | null
          matricula?: string | null
          position?: string | null
          probation_45?: string | null
          probation_90?: string | null
          status?: string | null
          tenant_id?: string
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_balance_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_fuel_reimbursements: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          km_per_day: number
          price_per_km: number
          reference_month: string
          salary_discount: number
          tenant_id: string
          to_pay: number
          total: number
          updated_at: string
          value_per_day: number
          work_days: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          km_per_day?: number
          price_per_km?: number
          reference_month: string
          salary_discount?: number
          tenant_id: string
          to_pay?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          km_per_day?: number
          price_per_km?: number
          reference_month?: string
          salary_discount?: number
          tenant_id?: string
          to_pay?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_fuel_reimbursements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_meal_vouchers: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          employee_share_20: number
          id: string
          reference_month: string
          tenant_id: string
          total: number
          updated_at: string
          value_per_day: number
        }
        Insert: {
          created_at?: string
          days?: number
          employee_id: string
          employee_share_20?: number
          id?: string
          reference_month: string
          tenant_id: string
          total?: number
          updated_at?: string
          value_per_day?: number
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          employee_share_20?: number
          id?: string
          reference_month?: string
          tenant_id?: string
          total?: number
          updated_at?: string
          value_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_meal_vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_medical_certificates: {
        Row: {
          cid_code: string | null
          created_at: string
          days_off: number
          doctor_crm: string | null
          doctor_name: string | null
          file_path: string
          id: string
          issue_date: string
          status: string
          tenant_id: string
          ticket_id: string | null
          updated_at: string
          user_id: string
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          cid_code?: string | null
          created_at?: string
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          file_path: string
          id?: string
          issue_date: string
          status?: string
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
          user_id: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          cid_code?: string | null
          created_at?: string
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          file_path?: string
          id?: string
          issue_date?: string
          status?: string
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_medical_certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_monthly_deductions: {
        Row: {
          created_at: string
          employee_id: string
          family_allowance: number
          health_coparticipation: number
          health_plan: number
          id: string
          meal_voucher_discount: number
          mobility: number
          notes: string | null
          payroll_loan: number
          reference_month: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          family_allowance?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          meal_voucher_discount?: number
          mobility?: number
          notes?: string | null
          payroll_loan?: number
          reference_month: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          family_allowance?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          meal_voucher_discount?: number
          mobility?: number
          notes?: string | null
          payroll_loan?: number
          reference_month?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_monthly_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payroll_entries: {
        Row: {
          advance: number
          company_id: string | null
          created_at: string
          employee_id: string
          family_allowance: number
          gross_salary: number
          health_coparticipation: number
          health_plan: number
          id: string
          inss: number
          irpf: number
          irpf_thirteenth: number
          meal_voucher: number
          mobility: number
          net_salary: number
          notes: string | null
          other_deductions: number
          payroll_loan: number
          reference_month: string
          tenant_id: string
          thirteenth_vacation: number
          total_deductions: number
          transport_voucher: number
          updated_at: string
        }
        Insert: {
          advance?: number
          company_id?: string | null
          created_at?: string
          employee_id: string
          family_allowance?: number
          gross_salary?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          inss?: number
          irpf?: number
          irpf_thirteenth?: number
          meal_voucher?: number
          mobility?: number
          net_salary?: number
          notes?: string | null
          other_deductions?: number
          payroll_loan?: number
          reference_month: string
          tenant_id: string
          thirteenth_vacation?: number
          total_deductions?: number
          transport_voucher?: number
          updated_at?: string
        }
        Update: {
          advance?: number
          company_id?: string | null
          created_at?: string
          employee_id?: string
          family_allowance?: number
          gross_salary?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          inss?: number
          irpf?: number
          irpf_thirteenth?: number
          meal_voucher?: number
          mobility?: number
          net_salary?: number
          notes?: string | null
          other_deductions?: number
          payroll_loan?: number
          reference_month?: string
          tenant_id?: string
          thirteenth_vacation?: number
          total_deductions?: number
          transport_voucher?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "rh_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payroll_settings: {
        Row: {
          advance_pct: number
          company_id: string | null
          created_at: string
          fuel_pct: number
          fuel_price_per_km: number
          id: string
          inss_brackets: Json
          irpf_brackets: Json
          meal_voucher_default_value: number
          meal_voucher_pct: number
          tenant_id: string
          transport_voucher_cap: number
          transport_voucher_pct: number
          updated_at: string
        }
        Insert: {
          advance_pct?: number
          company_id?: string | null
          created_at?: string
          fuel_pct?: number
          fuel_price_per_km?: number
          id?: string
          inss_brackets?: Json
          irpf_brackets?: Json
          meal_voucher_default_value?: number
          meal_voucher_pct?: number
          tenant_id: string
          transport_voucher_cap?: number
          transport_voucher_pct?: number
          updated_at?: string
        }
        Update: {
          advance_pct?: number
          company_id?: string | null
          created_at?: string
          fuel_pct?: number
          fuel_price_per_km?: number
          id?: string
          inss_brackets?: Json
          irpf_brackets?: Json
          meal_voucher_default_value?: number
          meal_voucher_pct?: number
          tenant_id?: string
          transport_voucher_cap?: number
          transport_voucher_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_payroll_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "rh_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payslips: {
        Row: {
          created_at: string
          file_path: string
          id: string
          reference_month: string
          tenant_id: string
          type: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          reference_month: string
          tenant_id: string
          type?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          reference_month?: string
          tenant_id?: string
          type?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_payslips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_transport_vouchers: {
        Row: {
          bus_trips_per_day: number
          created_at: string
          employee_id: string
          id: string
          metro_trips_per_day: number
          previous_balance: number
          reference_month: string
          tenant_id: string
          to_deposit: number
          total: number
          updated_at: string
          value_per_day: number
          work_days: number
        }
        Insert: {
          bus_trips_per_day?: number
          created_at?: string
          employee_id: string
          id?: string
          metro_trips_per_day?: number
          previous_balance?: number
          reference_month: string
          tenant_id: string
          to_deposit?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Update: {
          bus_trips_per_day?: number
          created_at?: string
          employee_id?: string
          id?: string
          metro_trips_per_day?: number
          previous_balance?: number
          reference_month?: string
          tenant_id?: string
          to_deposit?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_transport_vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_vacation_requests: {
        Row: {
          created_at: string
          days_requested: number
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
          tenant_id: string
          ticket_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_requested: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          tenant_id: string
          ticket_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_requested?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          ticket_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_vacation_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_form_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          is_system: boolean | null
          label: string
          options: Json | null
          placeholder: string | null
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          label: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          label?: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          purpose: string
          tenant_id: string | null
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          purpose: string
          tenant_id?: string | null
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          purpose?: string
          tenant_id?: string | null
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sac_otp_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_product_batches: {
        Row: {
          batch_code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          manufactured_at: string | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          manufactured_at?: string | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          manufactured_at?: string | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_products: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sac_report_products: {
        Row: {
          appearance: string | null
          batch: string | null
          color: string | null
          created_at: string
          density: number | null
          evidence_files: Json | null
          found_values: string | null
          id: string
          odor: string | null
          ph: number | null
          product_name: string
          quantity: number | null
          report_id: string
          sort_order: number | null
          specification: string | null
          tenant_id: string
          viscosity: number | null
        }
        Insert: {
          appearance?: string | null
          batch?: string | null
          color?: string | null
          created_at?: string
          density?: number | null
          evidence_files?: Json | null
          found_values?: string | null
          id?: string
          odor?: string | null
          ph?: number | null
          product_name: string
          quantity?: number | null
          report_id: string
          sort_order?: number | null
          specification?: string | null
          tenant_id: string
          viscosity?: number | null
        }
        Update: {
          appearance?: string | null
          batch?: string | null
          color?: string | null
          created_at?: string
          density?: number | null
          evidence_files?: Json | null
          found_values?: string | null
          id?: string
          odor?: string | null
          ph?: number | null
          product_name?: string
          quantity?: number | null
          report_id?: string
          sort_order?: number | null
          specification?: string | null
          tenant_id?: string
          viscosity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sac_report_products_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "sac_technical_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_report_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_technical_reports: {
        Row: {
          complaint: string | null
          conclusion: string | null
          created_at: string
          created_by: string | null
          customer_contact: string | null
          customer_name: string | null
          id: string
          report_date: string
          report_number: string
          sac_ticket_product_id: string | null
          signed_by_name: string | null
          signed_by_role: string | null
          status: string
          tenant_id: string
          test_location: string | null
          ticket_id: string
          treatment: string | null
          updated_at: string
        }
        Insert: {
          complaint?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          report_date?: string
          report_number: string
          sac_ticket_product_id?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          status?: string
          tenant_id: string
          test_location?: string | null
          ticket_id: string
          treatment?: string | null
          updated_at?: string
        }
        Update: {
          complaint?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          report_date?: string
          report_number?: string
          sac_ticket_product_id?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          status?: string
          tenant_id?: string
          test_location?: string | null
          ticket_id?: string
          treatment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_technical_reports_sac_ticket_product_id_fkey"
            columns: ["sac_ticket_product_id"]
            isOneToOne: false
            referencedRelation: "sac_ticket_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_technical_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_technical_reports_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          tenant_id: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          tenant_id: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          tenant_id?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_comments: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          notify_status: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          notify_status?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          notify_status?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_products: {
        Row: {
          attachments: Json
          created_at: string
          description: string | null
          id: string
          product_batch: string | null
          product_batch_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          sort_order: number
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          description?: string | null
          id?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          sort_order?: number
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          description?: string | null
          id?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          sort_order?: number
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_products_product_batch_id_fkey"
            columns: ["product_batch_id"]
            isOneToOne: false
            referencedRelation: "sac_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_tickets: {
        Row: {
          assigned_to: string | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_last_seen_at: string | null
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          description: string
          due_date: string | null
          dynamic_fields: Json | null
          first_response_at: string | null
          id: string
          invoice_attachments: Json
          order_number: string | null
          priority: string
          product_batch: string | null
          product_batch_id: string | null
          product_id: string | null
          product_name: string | null
          purchase_date: string | null
          quantity: number | null
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_comment: string | null
          satisfaction_rated_at: string | null
          satisfaction_rating: number | null
          satisfaction_resolved: string | null
          sla_due_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email: string
          customer_last_seen_at?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          description: string
          due_date?: string | null
          dynamic_fields?: Json | null
          first_response_at?: string | null
          id?: string
          invoice_attachments?: Json
          order_number?: string | null
          priority?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_date?: string | null
          quantity?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rated_at?: string | null
          satisfaction_rating?: number | null
          satisfaction_resolved?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email?: string
          customer_last_seen_at?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string
          due_date?: string | null
          dynamic_fields?: Json | null
          first_response_at?: string | null
          id?: string
          invoice_attachments?: Json
          order_number?: string | null
          priority?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_date?: string | null
          quantity?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rated_at?: string | null
          satisfaction_rating?: number | null
          satisfaction_resolved?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sac_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_product_batch_id_fkey"
            columns: ["product_batch_id"]
            isOneToOne: false
            referencedRelation: "sac_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          created_at: string
          first_response_time: number
          id: string
          is_active: boolean | null
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_time: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_response_time: number
          id?: string
          is_active?: boolean | null
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_time: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_response_time?: number
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_time?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      software_contracts: {
        Row: {
          auto_create_ticket: boolean
          auto_renew: boolean
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_number: string | null
          created_at: string
          description: string | null
          document_url: string | null
          end_date: string
          id: string
          name: string
          notes: string | null
          payment_frequency:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at: string
          value: number | null
          vendor: string
        }
        Insert: {
          auto_create_ticket?: boolean
          auto_renew?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_date: string
          id?: string
          name: string
          notes?: string | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days?: number
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at?: string
          value?: number | null
          vendor: string
        }
        Update: {
          auto_create_ticket?: boolean
          auto_renew?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          updated_at?: string
          value?: number | null
          vendor?: string
        }
        Relationships: []
      }
      software_license_keys: {
        Row: {
          created_at: string
          license_id: string
          license_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          license_id: string
          license_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          license_id?: string
          license_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "software_license_keys_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: true
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      software_license_renewals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          license_id: string
          new_expiry_date: string | null
          new_purchase_date: string | null
          notes: string | null
          previous_expiry_date: string | null
          previous_purchase_date: string | null
          provider: string | null
          renewal_value: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          license_id: string
          new_expiry_date?: string | null
          new_purchase_date?: string | null
          notes?: string | null
          previous_expiry_date?: string | null
          previous_purchase_date?: string | null
          provider?: string | null
          renewal_value?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          license_id?: string
          new_expiry_date?: string | null
          new_purchase_date?: string | null
          notes?: string | null
          previous_expiry_date?: string | null
          previous_purchase_date?: string | null
          provider?: string | null
          renewal_value?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "software_license_renewals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      software_licenses: {
        Row: {
          admin_url: string | null
          auto_create_ticket: boolean
          created_at: string
          domain: string | null
          expiry_date: string | null
          id: string
          internal_owner: string | null
          is_active: boolean
          item_category: string
          license_key: string | null
          license_type: Database["public"]["Enums"]["license_type"]
          name: string
          notes: string | null
          public_url: string | null
          purchase_date: string | null
          purchase_value: number | null
          technical_notes: string | null
          tenant_id: string
          total_quantity: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          admin_url?: string | null
          auto_create_ticket?: boolean
          created_at?: string
          domain?: string | null
          expiry_date?: string | null
          id?: string
          internal_owner?: string | null
          is_active?: boolean
          item_category?: string
          license_key?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          name: string
          notes?: string | null
          public_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          technical_notes?: string | null
          tenant_id: string
          total_quantity?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          admin_url?: string | null
          auto_create_ticket?: boolean
          created_at?: string
          domain?: string | null
          expiry_date?: string | null
          id?: string
          internal_owner?: string | null
          is_active?: boolean
          item_category?: string
          license_key?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          name?: string
          notes?: string | null
          public_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          technical_notes?: string | null
          tenant_id?: string
          total_quantity?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_ai_suggested: boolean | null
          priority: number | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          priority?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          priority?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_credentials: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_last4: string | null
          model: string
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_last4?: string | null
          model: string
          provider: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_last4?: string | null
          model?: string
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_bling_connections: {
        Row: {
          access_token: string
          company_name: string | null
          connected_by: string | null
          created_at: string
          expires_at: string
          refresh_token: string
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at: string
          refresh_token: string
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at?: string
          refresh_token?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bling_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          last_check_at: string | null
          last_error: string | null
          tenant_id: string
          updated_at: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          tenant_id: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          tenant_id?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invites: {
        Row: {
          access_profile_id: string | null
          access_profile_overrides: Json | null
          created_at: string
          department: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_send_error: string | null
          last_sent_at: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          send_attempts: number
          send_status: string
          tenant_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          access_profile_id?: string | null
          access_profile_overrides?: Json | null
          created_at?: string
          department?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          send_attempts?: number
          send_status?: string
          tenant_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          access_profile_id?: string | null
          access_profile_overrides?: Json | null
          created_at?: string
          department?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          send_attempts?: number
          send_status?: string
          tenant_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_access_profile_id_fkey"
            columns: ["access_profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_credentials: {
        Row: {
          alias: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          key_last4: string | null
          provider: string
          secret_key: string
          secret_key_2: string | null
          tenant_id: string
          updated_at: string
          webhook_id: string | null
          webhook_secret: string | null
        }
        Insert: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          key_last4?: string | null
          provider: string
          secret_key: string
          secret_key_2?: string | null
          tenant_id: string
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
        }
        Update: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          key_last4?: string | null
          provider?: string
          secret_key?: string
          secret_key_2?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_signup_attempts: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          error_code: string | null
          id: string
          slug: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          error_code?: string | null
          id?: string
          slug?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          error_code?: string | null
          id?: string
          slug?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          plan_config: Json | null
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          plan_config?: Json | null
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          plan_config?: Json | null
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ti_access_profiles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          modules: Json
          name: string
          permissions: Json
          tenant_id: string
          ticket_restrictions: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          modules?: Json
          name: string
          permissions?: Json
          tenant_id: string
          ticket_restrictions?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          modules?: Json
          name?: string
          permissions?: Json
          tenant_id?: string
          ticket_restrictions?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ti_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          module: string
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          module: string
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_insight_reports: {
        Row: {
          created_at: string | null
          created_by: string
          frequency: string
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          name: string
          notify_email: boolean | null
          notify_inapp: boolean | null
          target_metrics: string[]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name: string
          notify_email?: boolean | null
          notify_inapp?: boolean | null
          target_metrics?: string[]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name?: string
          notify_email?: boolean | null
          notify_inapp?: boolean | null
          target_metrics?: string[]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ti_insight_snapshots: {
        Row: {
          generated_at: string | null
          id: string
          lyra_analysis: string | null
          metrics_data: Json
          report_id: string
          tenant_id: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          lyra_analysis?: string | null
          metrics_data?: Json
          report_id: string
          tenant_id: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          lyra_analysis?: string | null
          metrics_data?: Json
          report_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_insight_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ti_insight_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_user_profiles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_user_profiles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "ti_access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          comment_id: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          tenant_id: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          tenant_id: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string
          id: string
          is_completed: boolean
          is_required: boolean
          responsible_sector: string | null
          sort_order: number
          template_item_id: string | null
          tenant_id: string
          ticket_checklist_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description: string
          id?: string
          is_completed?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_item_id?: string | null
          tenant_id: string
          ticket_checklist_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          is_completed?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_item_id?: string | null
          tenant_id?: string
          ticket_checklist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklist_items_ticket_checklist_id_fkey"
            columns: ["ticket_checklist_id"]
            isOneToOne: false
            referencedRelation: "ticket_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklists: {
        Row: {
          created_at: string
          id: string
          status: string
          template_id: string | null
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          template_id?: string | null
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          template_id?: string | null
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklists_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_form_fields: {
        Row: {
          category_id: string
          created_at: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json | null
          placeholder: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_form_fields_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_form_responses: {
        Row: {
          created_at: string
          field_id: string
          id: string
          tenant_id: string
          ticket_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          tenant_id: string
          ticket_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_form_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "ticket_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_by: string
          mentioned_user_id: string
          message: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_by: string
          mentioned_user_id: string
          message?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_by?: string
          mentioned_user_id?: string
          message?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_mentions_mentioned_by_fkey"
            columns: ["mentioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_patterns: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_reviewed: boolean | null
          keywords: string[] | null
          last_occurrence: string | null
          occurrence_count: number | null
          pattern_name: string
          sample_ticket_ids: string[] | null
          suggested_pop_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_reviewed?: boolean | null
          keywords?: string[] | null
          last_occurrence?: string | null
          occurrence_count?: number | null
          pattern_name: string
          sample_ticket_ids?: string[] | null
          suggested_pop_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_reviewed?: boolean | null
          keywords?: string[] | null
          last_occurrence?: string | null
          occurrence_count?: number | null
          pattern_name?: string
          sample_ticket_ids?: string[] | null
          suggested_pop_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_patterns_suggested_pop_fkey"
            columns: ["suggested_pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          category: string | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          first_response_at: string | null
          id: string
          module: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_rating: number | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory: string | null
          tenant_id: string
          ticket_number: number
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          first_response_at?: string | null
          id?: string
          module?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          tenant_id: string
          ticket_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          first_response_at?: string | null
          id?: string
          module?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          tenant_id?: string
          ticket_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_profiles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          department: string
          id: string
          overrides: Json
          profile_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          department: string
          id?: string
          overrides?: Json
          profile_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          department?: string
          id?: string
          overrides?: Json
          profile_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          module: string
          permissions: Json
          tenant_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module: string
          permissions?: Json
          tenant_id: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module?: string
          permissions?: Json
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_profile: {
        Args: { _reason?: string; _user_id: string }
        Returns: string
      }
      automation_advance: { Args: { p_run: string }; Returns: undefined }
      automation_cancel_run: { Args: { p_run: string }; Returns: undefined }
      automation_claim_external: {
        Args: { p_limit?: number }
        Returns: {
          config: Json
          kind: string
          run_id: string
          step_id: string
          subject_id: string
          subject_type: string
          tenant_id: string
          workflow_name: string
        }[]
      }
      automation_complete_external: {
        Args: {
          p_error?: string
          p_result?: Json
          p_run: string
          p_step: string
        }
        Returns: undefined
      }
      automation_enqueue: {
        Args: {
          p_entity: string
          p_event: string
          p_module: string
          p_payload: Json
          p_subject: string
          p_tenant: string
        }
        Returns: number
      }
      automation_enrich_payload: {
        Args: { p_after: Json; p_entity: string }
        Returns: Json
      }
      automation_filter_matches: {
        Args: { p_ctx: Json; p_filter: Json }
        Returns: boolean
      }
      automation_manual_for: {
        Args: { p_entity: string }
        Returns: {
          id: string
          module: string
          name: string
        }[]
      }
      automation_mark_skipped: {
        Args: { p_chosen: Json; p_ctx: Json; p_flow: Json; p_step: Json }
        Returns: Json
      }
      automation_next_schedule: {
        Args: { p_after: string; p_trigger: Json }
        Returns: string
      }
      automation_render: {
        Args: { p_ctx: Json; p_text: string }
        Returns: string
      }
      automation_render_config: {
        Args: { p_cfg: Json; p_ctx: Json }
        Returns: Json
      }
      automation_retry_run: { Args: { p_run: string }; Returns: undefined }
      automation_run_manual: {
        Args: { p_subject_id: string; p_workflow: string }
        Returns: string
      }
      automation_run_step: {
        Args: {
          p_step: Json
          r: Database["public"]["Tables"]["automation_runs"]["Row"]
        }
        Returns: Json
      }
      automation_start_run: {
        Args: {
          p_ctx: Json
          p_kind: string
          p_subject_id: string
          p_subject_type: string
          w: Database["public"]["Tables"]["automation_workflows"]["Row"]
        }
        Returns: string
      }
      automation_step: { Args: { p_flow: Json; p_id: string }; Returns: Json }
      automation_subject_row: {
        Args: { p_id: string; p_type: string }
        Returns: Json
      }
      automation_target_user: {
        Args: { p_cfg: Json; p_ctx: Json }
        Returns: string
      }
      automation_tick: { Args: never; Returns: Json }
      automation_validate_flow: {
        Args: { p_steps: Json; p_trigger: Json }
        Returns: boolean
      }
      automation_webhook_fire: {
        Args: { p_body: Json; p_secret: string; p_workflow: string }
        Returns: string
      }
      automation_webhook_secret: {
        Args: { p_workflow: string }
        Returns: string
      }
      claim_new_tenant: {
        Args: {
          _cnpj: string
          _company_name: string
          _department: string
          _full_name: string
          _slug: string
        }
        Returns: string
      }
      create_ticket_checklists_for_ticket: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      crm_bling_status: {
        Args: never
        Returns: {
          company_name: string
          expires_at: string
          settings: Json
          updated_at: string
        }[]
      }
      crm_delete_stage: {
        Args: { p_move_to?: string; p_stage: string }
        Returns: undefined
      }
      crm_find_or_create_contact: {
        Args: {
          p_company?: string
          p_email?: string
          p_extra?: Json
          p_import?: string
          p_name: string
          p_owner?: string
          p_phone?: string
          p_source?: string
          p_tenant: string
        }
        Returns: {
          contact_id: string
          created: boolean
          owner_id: string
        }[]
      }
      crm_gate_keys_valid: { Args: { p_keys: string[] }; Returns: boolean }
      crm_gate_label: {
        Args: { p_key: string; p_tenant: string }
        Returns: string
      }
      crm_import_rows: {
        Args: { p_import: string; p_rows: Json }
        Returns: Json
      }
      crm_order_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      crm_payment_providers: {
        Args: never
        Returns: {
          alias: string
          is_default: boolean
          key_last4: string
          provider: string
          updated_at: string
        }[]
      }
      crm_product_price: {
        Args: { p_product: string; p_table: string }
        Returns: number
      }
      crm_products_with_price: {
        Args: { p_table?: string }
        Returns: {
          base_price: number
          id: string
          is_exception: boolean
          name: string
          price: number
          sku: string
          unit: string
        }[]
      }
      crm_public_proposal: { Args: { p_token: string }; Returns: Json }
      crm_resolve_price_table: { Args: { p_contact: string }; Returns: string }
      crm_sales_metrics: {
        Args: { p_from: string; p_pipeline?: string; p_to: string }
        Returns: Json
      }
      crm_seed_pipeline_stages: {
        Args: { p_pipeline: string; p_tenant_id: string }
        Returns: undefined
      }
      crm_setup: {
        Args: { p_price_tables?: Json; p_segments?: Json }
        Returns: Json
      }
      crm_undo_import: { Args: { p_import: string }; Returns: Json }
      fmt_brl: { Args: { p: number }; Returns: string }
      get_auth_user_status: {
        Args: { _email: string }
        Returns: {
          is_confirmed: boolean
          user_id: string
        }[]
      }
      get_customer_tenant_id: { Args: never; Returns: string }
      get_invite_public: {
        Args: { _invite_id: string }
        Returns: {
          department: string
          email: string
          expires_at: string
          id: string
          role: string
          tenant_name: string
          tenant_slug: string
          used_at: string
        }[]
      }
      get_sac_tenant_branding: {
        Args: { _slug: string }
        Returns: {
          id: string
          login_banner_url: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
          welcome_text: string
        }[]
      }
      get_tenant_by_hostname: {
        Args: { _hostname: string }
        Returns: {
          id: string
          login_banner_url: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
          welcome_text: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_comercial_access: { Args: { _user_id: string }; Returns: boolean }
      has_fin_access: { Args: { _user_id: string }; Returns: boolean }
      has_rh_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_allowed_upload_ext: {
        Args: { _bucket: string; _name: string }
        Returns: boolean
      }
      is_customer: { Args: { _user_id: string }; Returns: boolean }
      is_diretor: { Args: { _user_id: string }; Returns: boolean }
      is_email_verified_today: { Args: never; Returns: boolean }
      is_manager_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_member_or_higher_role: { Args: never; Returns: boolean }
      is_qualidade_tech: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_or_higher: { Args: { _user_id: string }; Returns: boolean }
      notification_team: {
        Args: { p_module: string; p_tenant: string }
        Returns: string[]
      }
      notify_users: {
        Args: {
          p_exclude?: string
          p_message: string
          p_ref_id: string
          p_ref_type: string
          p_tenant: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_users: string[]
        }
        Returns: undefined
      }
      restore_profile: { Args: { _user_id: string }; Returns: Json }
      rh_calc_inss: {
        Args: { _company?: string; _salary: number; _tenant: string }
        Returns: number
      }
      rh_calc_irpf: {
        Args: { _base: number; _company?: string; _tenant: string }
        Returns: number
      }
      rh_generate_payroll: {
        Args: { _company: string; _month: string; _tenant: string }
        Returns: number
      }
      rh_link_employee_user: {
        Args: { _email: string; _employee_id: string }
        Returns: Json
      }
      seed_categorias_comercial_educacional: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      seed_crm_stages: { Args: { p_tenant_id: string }; Returns: undefined }
      seed_default_access_profiles: {
        Args: { p_department: string; p_tenant_id: string }
        Returns: undefined
      }
      sync_ticket_checklist_status: {
        Args: { _ticket_checklist_id: string }
        Returns: undefined
      }
      user_mentioned_in_ticket: {
        Args: { _ticket_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "member" | "viewer" | "customer"
      asset_category:
        | "hardware"
        | "software"
        | "network"
        | "peripheral"
        | "mobile"
        | "other"
      asset_status:
        | "active"
        | "inactive"
        | "maintenance"
        | "decommissioned"
        | "in_use"
        | "in_stock"
      contract_status: "active" | "expiring" | "expired" | "cancelled"
      deliverable_frequency: "weekly" | "monthly"
      event_participant_role:
        | "palestrante"
        | "artista"
        | "convidado"
        | "patrocinador"
        | "staff"
        | "outro"
      event_participant_status: "invited" | "confirmed" | "declined" | "maybe"
      fin_entry_kind: "payable" | "receivable"
      fin_entry_status: "pending" | "paid" | "overdue" | "cancelled"
      form_field_type:
        | "text"
        | "textarea"
        | "email"
        | "phone"
        | "select"
        | "checkbox"
        | "radio"
        | "date"
        | "file"
        | "delivery_datetime"
        | "assignee_select"
      influencer_category:
        | "artista"
        | "influencer"
        | "criador"
        | "modelo"
        | "outro"
      influencer_status: "active" | "inactive" | "blocked"
      license_type: "perpetual" | "subscription" | "volume" | "oem"
      maintenance_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      maintenance_type: "preventive" | "corrective" | "upgrade" | "cleaning"
      mkt_ai_generation_type: "image" | "caption" | "idea" | "reminder"
      mkt_event_status:
        | "planning"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      mkt_event_type:
        | "show"
        | "feira"
        | "live"
        | "lancamento"
        | "workshop"
        | "reuniao"
        | "outro"
      mkt_quotation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      mkt_supplier_category:
        | "grafica"
        | "producao"
        | "midia"
        | "eventos"
        | "brindes"
        | "digital"
        | "audiovisual"
        | "outro"
      mkt_supplier_status: "active" | "inactive" | "blocked"
      mkt_ugc_media_type: "image" | "video" | "story" | "reel" | "carousel"
      mkt_ugc_status: "pending" | "approved" | "rejected"
      notification_type:
        | "sla_warning"
        | "sla_violation"
        | "contract_expiring"
        | "license_expiring"
        | "mention"
        | "ticket_reply"
        | "ticket_assigned"
        | "card_mention"
        | "card_member"
        | "reminder"
        | "deadline_expired"
        | "ticket_created"
        | "request_decided"
        | "purchase_decided"
        | "sac_customer_reply"
        | "purchase_requested"
        | "sac_customer_rated"
        | "bill_due"
        | "document_available"
        | "post_published"
        | "post_failed"
        | "automation"
        | "crm_new_lead"
        | "order_paid"
        | "order_accepted"
      payment_frequency: "monthly" | "quarterly" | "yearly" | "one_time"
      social_platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "linkedin"
        | "twitter"
        | "facebook"
        | "whatsapp"
        | "meta_ads"
      social_post_status: "draft" | "scheduled" | "published" | "failed"
      social_post_type:
        | "feed"
        | "story"
        | "reel"
        | "live"
        | "short"
        | "post"
        | "paid_ad"
        | "broadcast_list"
      ticket_priority: "critical" | "high" | "medium" | "low"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_user"
        | "waiting_parts"
        | "resolved"
        | "closed"
        | "cancelled"
        | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "manager", "member", "viewer", "customer"],
      asset_category: [
        "hardware",
        "software",
        "network",
        "peripheral",
        "mobile",
        "other",
      ],
      asset_status: [
        "active",
        "inactive",
        "maintenance",
        "decommissioned",
        "in_use",
        "in_stock",
      ],
      contract_status: ["active", "expiring", "expired", "cancelled"],
      deliverable_frequency: ["weekly", "monthly"],
      event_participant_role: [
        "palestrante",
        "artista",
        "convidado",
        "patrocinador",
        "staff",
        "outro",
      ],
      event_participant_status: ["invited", "confirmed", "declined", "maybe"],
      fin_entry_kind: ["payable", "receivable"],
      fin_entry_status: ["pending", "paid", "overdue", "cancelled"],
      form_field_type: [
        "text",
        "textarea",
        "email",
        "phone",
        "select",
        "checkbox",
        "radio",
        "date",
        "file",
        "delivery_datetime",
        "assignee_select",
      ],
      influencer_category: [
        "artista",
        "influencer",
        "criador",
        "modelo",
        "outro",
      ],
      influencer_status: ["active", "inactive", "blocked"],
      license_type: ["perpetual", "subscription", "volume", "oem"],
      maintenance_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      maintenance_type: ["preventive", "corrective", "upgrade", "cleaning"],
      mkt_ai_generation_type: ["image", "caption", "idea", "reminder"],
      mkt_event_status: [
        "planning",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      mkt_event_type: [
        "show",
        "feira",
        "live",
        "lancamento",
        "workshop",
        "reuniao",
        "outro",
      ],
      mkt_quotation_status: [
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
      ],
      mkt_supplier_category: [
        "grafica",
        "producao",
        "midia",
        "eventos",
        "brindes",
        "digital",
        "audiovisual",
        "outro",
      ],
      mkt_supplier_status: ["active", "inactive", "blocked"],
      mkt_ugc_media_type: ["image", "video", "story", "reel", "carousel"],
      mkt_ugc_status: ["pending", "approved", "rejected"],
      notification_type: [
        "sla_warning",
        "sla_violation",
        "contract_expiring",
        "license_expiring",
        "mention",
        "ticket_reply",
        "ticket_assigned",
        "card_mention",
        "card_member",
        "reminder",
        "deadline_expired",
        "ticket_created",
        "request_decided",
        "purchase_decided",
        "sac_customer_reply",
        "purchase_requested",
        "sac_customer_rated",
        "bill_due",
        "document_available",
        "post_published",
        "post_failed",
        "automation",
        "crm_new_lead",
        "order_paid",
        "order_accepted",
      ],
      payment_frequency: ["monthly", "quarterly", "yearly", "one_time"],
      social_platform: [
        "instagram",
        "tiktok",
        "youtube",
        "linkedin",
        "twitter",
        "facebook",
        "whatsapp",
        "meta_ads",
      ],
      social_post_status: ["draft", "scheduled", "published", "failed"],
      social_post_type: [
        "feed",
        "story",
        "reel",
        "live",
        "short",
        "post",
        "paid_ad",
        "broadcast_list",
      ],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_user",
        "waiting_parts",
        "resolved",
        "closed",
        "cancelled",
        "rejected",
      ],
    },
  },
} as const
