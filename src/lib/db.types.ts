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
      area_catalogue: {
        Row: {
          created_at: string
          description: string
          id: number
          is_active: boolean
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: never
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: never
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      habit_check_in: {
        Row: {
          completed: boolean
          completed_at: string
          day_index: number
          id: number
          note: string | null
          programme_habit_id: number
          programme_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string
          day_index: number
          id?: never
          note?: string | null
          programme_habit_id: number
          programme_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string
          day_index?: number
          id?: never
          note?: string | null
          programme_habit_id?: number
          programme_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_check_in_programme_habit_id_fkey"
            columns: ["programme_habit_id"]
            isOneToOne: false
            referencedRelation: "programme_habit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_check_in_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programme"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_template: {
        Row: {
          area_key: string
          created_at: string
          detail: string | null
          effort: number
          id: number
          is_default: boolean
          key: string
          sort_order: number
          title: string
        }
        Insert: {
          area_key: string
          created_at?: string
          detail?: string | null
          effort?: number
          id?: never
          is_default?: boolean
          key: string
          sort_order?: number
          title: string
        }
        Update: {
          area_key?: string
          created_at?: string
          detail?: string | null
          effort?: number
          id?: never
          is_default?: boolean
          key?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_template_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "area_catalogue"
            referencedColumns: ["key"]
          },
        ]
      }
      programme: {
        Row: {
          created_at: string
          duration_days: number
          ended_at: string | null
          id: number
          start_date: string | null
          started_at: string | null
          status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_days?: number
          ended_at?: string | null
          id?: never
          start_date?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_days?: number
          ended_at?: string | null
          id?: never
          start_date?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programme_habit: {
        Row: {
          active_from_day: number
          active_to_day: number | null
          area_label: string
          created_at: string
          detail: string | null
          id: number
          programme_id: number
          sort_order: number
          source_template_key: string | null
          title: string
          updated_at: string
          user_area_id: number | null
          user_id: string
        }
        Insert: {
          active_from_day?: number
          active_to_day?: number | null
          area_label: string
          created_at?: string
          detail?: string | null
          id?: never
          programme_id: number
          sort_order?: number
          source_template_key?: string | null
          title: string
          updated_at?: string
          user_area_id?: number | null
          user_id: string
        }
        Update: {
          active_from_day?: number
          active_to_day?: number | null
          area_label?: string
          created_at?: string
          detail?: string | null
          id?: never
          programme_id?: number
          sort_order?: number
          source_template_key?: string | null
          title?: string
          updated_at?: string
          user_area_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_habit_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programme"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_habit_user_area_id_fkey"
            columns: ["user_area_id"]
            isOneToOne: false
            referencedRelation: "user_area"
            referencedColumns: ["id"]
          },
        ]
      }
      progress: {
        Row: {
          active_programme_id: number | null
          last_counted_day: number
          last_settled_day: number
          level: number
          points_balance: number
          points_earned_total: number
          shield_count: number
          streak_current: number
          streak_longest: number
          updated_at: string
          user_id: string
          xp_total: number
        }
        Insert: {
          active_programme_id?: number | null
          last_counted_day?: number
          last_settled_day?: number
          level?: number
          points_balance?: number
          points_earned_total?: number
          shield_count?: number
          streak_current?: number
          streak_longest?: number
          updated_at?: string
          user_id: string
          xp_total?: number
        }
        Update: {
          active_programme_id?: number | null
          last_counted_day?: number
          last_settled_day?: number
          level?: number
          points_balance?: number
          points_earned_total?: number
          shield_count?: number
          streak_current?: number
          streak_longest?: number
          updated_at?: string
          user_id?: string
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "progress_active_programme_id_fkey"
            columns: ["active_programme_id"]
            isOneToOne: false
            referencedRelation: "programme"
            referencedColumns: ["id"]
          },
        ]
      }
      reflection: {
        Row: {
          body: string
          created_at: string
          day_index: number
          id: number
          programme_id: number
          prompt_key: string | null
          prompt_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          day_index: number
          id?: never
          programme_id: number
          prompt_key?: string | null
          prompt_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          day_index?: number
          id?: never
          programme_id?: number
          prompt_key?: string | null
          prompt_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reflection_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programme"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_catalogue: {
        Row: {
          cost_points: number
          description: string
          id: number
          is_active: boolean
          key: string
          name: string
          payload: Json
          reward_type: string
          sort_order: number
        }
        Insert: {
          cost_points: number
          description: string
          id?: never
          is_active?: boolean
          key: string
          name: string
          payload?: Json
          reward_type: string
          sort_order?: number
        }
        Update: {
          cost_points?: number
          description?: string
          id?: never
          is_active?: boolean
          key?: string
          name?: string
          payload?: Json
          reward_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      unlock: {
        Row: {
          cost_points: number
          id: number
          reward_key: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          cost_points: number
          id?: never
          reward_key: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          cost_points?: number
          id?: never
          reward_key?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unlock_reward_key_fkey"
            columns: ["reward_key"]
            isOneToOne: false
            referencedRelation: "reward_catalogue"
            referencedColumns: ["key"]
          },
        ]
      }
      user_area: {
        Row: {
          area_key: string | null
          created_at: string
          id: number
          is_active: boolean
          is_custom: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          area_key?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_custom?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          area_key?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          is_custom?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_area_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "area_catalogue"
            referencedColumns: ["key"]
          },
        ]
      }
      weekly_prompt: {
        Row: {
          day_index: number
          id: number
          key: string
          prompt: string
          sort_order: number
        }
        Insert: {
          day_index: number
          id?: never
          key: string
          prompt: string
          sort_order?: number
        }
        Update: {
          day_index?: number
          id?: never
          key?: string
          prompt?: string
          sort_order?: number
        }
        Relationships: []
      }
      xp_event: {
        Row: {
          created_at: string
          day_index: number
          id: number
          kind: string
          points: number
          programme_habit_id: number | null
          programme_id: number
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          day_index: number
          id?: never
          kind: string
          points: number
          programme_habit_id?: number | null
          programme_id: number
          user_id: string
          xp: number
        }
        Update: {
          created_at?: string
          day_index?: number
          id?: never
          kind?: string
          points?: number
          programme_habit_id?: number | null
          programme_id?: number
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_event_programme_habit_id_fkey"
            columns: ["programme_habit_id"]
            isOneToOne: false
            referencedRelation: "programme_habit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_event_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "programme"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      redeem_reward: {
        Args: { p_reward_key: string }
        Returns: Database["public"]["Tables"]["progress"]["Row"]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
