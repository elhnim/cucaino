export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      families: {
        Row: {
          created_at: string;
          family_points_balance: number;
          id: string;
          name: string;
          owner_user_id: string;
        };
        Insert: {
          created_at?: string;
          family_points_balance?: number;
          id?: string;
          name: string;
          owner_user_id: string;
        };
        Update: {
          created_at?: string;
          family_points_balance?: number;
          id?: string;
          name?: string;
          owner_user_id?: string;
        };
        Relationships: [];
      };
      kids: {
        Row: {
          age: number | null;
          avatar: string;
          created_at: string;
          current_streak: number;
          date_of_birth: string | null;
          family_id: string;
          id: string;
          last_active_date: string | null;
          longest_streak: number;
          name: string;
          pin_hash: string | null;
          points_balance: number;
          theme_id: string;
        };
        Insert: {
          age?: number | null;
          avatar?: string;
          created_at?: string;
          current_streak?: number;
          date_of_birth?: string | null;
          family_id: string;
          id?: string;
          last_active_date?: string | null;
          longest_streak?: number;
          name: string;
          pin_hash?: string | null;
          points_balance?: number;
          theme_id?: string;
        };
        Update: {
          age?: number | null;
          avatar?: string;
          created_at?: string;
          current_streak?: number;
          date_of_birth?: string | null;
          family_id?: string;
          id?: string;
          last_active_date?: string | null;
          longest_streak?: number;
          name?: string;
          pin_hash?: string | null;
          points_balance?: number;
          theme_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          days_of_week: number[];
          default_bpm: number | null;
          default_time_signature: string | null;
          duration_minutes: number | null;
          family_id: string;
          family_points_contribution: number;
          icon: string;
          id: string;
          kid_id: string | null;
          location: string | null;
          name: string;
          packing_list: string[] | null;
          points: number;
          requires_completion: boolean;
          requires_timer: boolean;
          schedule_type: string;
          start_time: string | null;
          time_block: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & {
          family_id: string;
          name: string;
          category: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      task_completions: {
        Row: {
          completed_at: string;
          date: string;
          duration_actual_seconds: number | null;
          family_id: string;
          family_points_awarded: number;
          id: string;
          kid_id: string;
          points_awarded: number;
          task_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["task_completions"]["Row"]> & {
          family_id: string;
          kid_id: string;
          task_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_completions"]["Row"]>;
        Relationships: [];
      };
      school_items: {
        Row: {
          active: boolean;
          created_at: string;
          days_of_week: number[];
          family_id: string;
          icon: string;
          id: string;
          kid_id: string;
          name: string;
        };
        Insert: Partial<Database["public"]["Tables"]["school_items"]["Row"]> & {
          family_id: string;
          kid_id: string;
          name: string;
          days_of_week: number[];
        };
        Update: Partial<Database["public"]["Tables"]["school_items"]["Row"]>;
        Relationships: [];
      };
      school_classes: {
        Row: {
          created_at: string;
          custom_label: string | null;
          day_of_week: number;
          end_time: string;
          family_id: string;
          id: string;
          kid_id: string;
          room: string | null;
          start_time: string;
          subject: string;
          teacher: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["school_classes"]["Row"]> & {
          family_id: string;
          kid_id: string;
          day_of_week: number;
          subject: string;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["school_classes"]["Row"]>;
        Relationships: [];
      };
      rewards: {
        Row: {
          active: boolean;
          cost_points: number;
          created_at: string;
          description: string | null;
          family_id: string;
          icon: string;
          id: string;
          kid_id: string | null;
          name: string;
          type: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rewards"]["Row"]> & {
          family_id: string;
          name: string;
          cost_points: number;
          type: string;
        };
        Update: Partial<Database["public"]["Tables"]["rewards"]["Row"]>;
        Relationships: [];
      };
      reward_requests: {
        Row: {
          family_id: string;
          id: string;
          kid_id: string;
          parent_note: string | null;
          points_deducted_at: string | null;
          requested_at: string;
          resolved_at: string | null;
          reward_id: string;
          status: string;
        };
        Insert: Partial<Database["public"]["Tables"]["reward_requests"]["Row"]> & {
          family_id: string;
          kid_id: string;
          reward_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["reward_requests"]["Row"]>;
        Relationships: [];
      };
      themes: {
        Row: {
          accent: string;
          accent_soft: string;
          decoration: string;
          description: string | null;
          flavor: string;
          header_gradient: string;
          heading_text: string;
          id: string;
          name: string;
          page_gradient: string;
        };
        Insert: Database["public"]["Tables"]["themes"]["Row"];
        Update: Partial<Database["public"]["Tables"]["themes"]["Row"]>;
        Relationships: [];
      };
      badges: {
        Row: {
          criteria: Json;
          description: string | null;
          icon: string;
          id: string;
          name: string;
        };
        Insert: Database["public"]["Tables"]["badges"]["Row"];
        Update: Partial<Database["public"]["Tables"]["badges"]["Row"]>;
        Relationships: [];
      };
      kid_badges: {
        Row: { badge_id: string; earned_at: string; kid_id: string };
        Insert: { badge_id: string; earned_at?: string; kid_id: string };
        Update: Partial<Database["public"]["Tables"]["kid_badges"]["Row"]>;
        Relationships: [];
      };
      quiz_banks: {
        Row: {
          category: string;
          family_id: string | null;
          id: string;
          is_builtin: boolean;
          max_age: number;
          min_age: number;
          name: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_banks"]["Row"]> & {
          name: string;
          category: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_banks"]["Row"]>;
        Relationships: [];
      };
      quiz_questions: {
        Row: {
          bank_id: string;
          choices: Json;
          explanation: string | null;
          id: string;
          prompt: string;
          time_limit_seconds: number;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]> & {
          bank_id: string;
          prompt: string;
          choices: Json;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]>;
        Relationships: [];
      };
      feature_requests: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          family_id: string;
          id: string;
          status: string;
          title: string;
        };
        Insert: Partial<Database["public"]["Tables"]["feature_requests"]["Row"]> & {
          family_id: string;
          title: string;
          category: string;
        };
        Update: Partial<Database["public"]["Tables"]["feature_requests"]["Row"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { current_family_id: { Args: never; Returns: string } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
