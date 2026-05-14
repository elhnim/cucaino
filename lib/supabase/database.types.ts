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
      badge_progress: {
        Row: {
          bronze_earned_at: string | null
          category: string
          completion_count: number
          gold_earned_at: string | null
          id: string
          kid_id: string
          silver_earned_at: string | null
        }
        Insert: {
          bronze_earned_at?: string | null
          category: string
          completion_count?: number
          gold_earned_at?: string | null
          id?: string
          kid_id: string
          silver_earned_at?: string | null
        }
        Update: {
          bronze_earned_at?: string | null
          category?: string
          completion_count?: number
          gold_earned_at?: string | null
          id?: string
          kid_id?: string
          silver_earned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_progress_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          criteria: Json
          description: string | null
          icon: string
          id: string
          name: string
        }
        Insert: {
          criteria: Json
          description?: string | null
          icon: string
          id: string
          name: string
        }
        Update: {
          criteria?: Json
          description?: string | null
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          created_at: string
          family_points_balance: number
          id: string
          name: string
          owner_user_id: string
          parent_avatar: string | null
          parent_display_name: string | null
          parent_pin: string | null
          weather_city: string | null
          weather_lat: number | null
          weather_lon: number | null
        }
        Insert: {
          created_at?: string
          family_points_balance?: number
          id?: string
          name: string
          owner_user_id: string
          parent_avatar?: string | null
          parent_display_name?: string | null
          parent_pin?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Update: {
          created_at?: string
          family_points_balance?: number
          id?: string
          name?: string
          owner_user_id?: string
          parent_avatar?: string | null
          parent_display_name?: string | null
          parent_pin?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          category: string
          created_at: string
          description: string | null
          family_id: string
          id: string
          kid_id: string | null
          status: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          family_id: string
          id?: string
          kid_id?: string | null
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          family_id?: string
          id?: string
          kid_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_badges: {
        Row: {
          badge_id: string
          earned_at: string
          kid_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          kid_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          kid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_badges_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_daily_task_additions: {
        Row: {
          created_at: string | null
          date: string
          family_id: string
          id: string
          kid_id: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          family_id: string
          id?: string
          kid_id: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          family_id?: string
          id?: string
          kid_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_daily_task_additions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_daily_task_additions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_daily_task_additions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_timetable: {
        Row: {
          day_of_week: number
          id: string
          is_override: boolean
          kid_id: string
          override_date: string | null
          section: string
          slot_index: number
          subject_id: string
        }
        Insert: {
          day_of_week: number
          id?: string
          is_override?: boolean
          kid_id: string
          override_date?: string | null
          section: string
          slot_index: number
          subject_id: string
        }
        Update: {
          day_of_week?: number
          id?: string
          is_override?: boolean
          kid_id?: string
          override_date?: string | null
          section?: string
          slot_index?: number
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_timetable_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          age: number | null
          avatar: string
          created_at: string
          current_streak: number
          date_of_birth: string | null
          family_id: string
          id: string
          last_active_date: string | null
          longest_streak: number
          name: string
          pin_hash: string | null
          points_balance: number
          selected_avatar_emoji: string | null
          selected_frame: string | null
          theme_id: string
          total_completions: number
          total_stars_earned: number
        }
        Insert: {
          age?: number | null
          avatar?: string
          created_at?: string
          current_streak?: number
          date_of_birth?: string | null
          family_id: string
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          name: string
          pin_hash?: string | null
          points_balance?: number
          selected_avatar_emoji?: string | null
          selected_frame?: string | null
          theme_id?: string
          total_completions?: number
          total_stars_earned?: number
        }
        Update: {
          age?: number | null
          avatar?: string
          created_at?: string
          current_streak?: number
          date_of_birth?: string | null
          family_id?: string
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          name?: string
          pin_hash?: string | null
          points_balance?: number
          selected_avatar_emoji?: string | null
          selected_frame?: string | null
          theme_id?: string
          total_completions?: number
          total_stars_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "kids_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      perf_metrics: {
        Row: {
          app_version: string | null
          created_at: string
          device_type: string | null
          id: string
          kid_id: string | null
          metric_name: string
          page: string | null
          query_name: string | null
          rating: string | null
          value: number
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          kid_id?: string | null
          metric_name: string
          page?: string | null
          query_name?: string | null
          rating?: string | null
          value: number
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          kid_id?: string | null
          metric_name?: string
          page?: string | null
          query_name?: string | null
          rating?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "perf_metrics_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          chosen_index: number | null
          id: string
          is_correct: boolean
          kid_id: string
          question_id: string
          session_id: string
          time_taken_ms: number | null
        }
        Insert: {
          chosen_index?: number | null
          id?: string
          is_correct: boolean
          kid_id: string
          question_id: string
          session_id: string
          time_taken_ms?: number | null
        }
        Update: {
          chosen_index?: number | null
          id?: string
          is_correct?: boolean
          kid_id?: string
          question_id?: string
          session_id?: string
          time_taken_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_banks: {
        Row: {
          category: string
          description: string | null
          family_id: string | null
          id: string
          is_builtin: boolean
          max_age: number
          min_age: number
          name: string
        }
        Insert: {
          category: string
          description?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          max_age?: number
          min_age?: number
          name: string
        }
        Update: {
          category?: string
          description?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          max_age?: number
          min_age?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_banks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          bank_id: string
          choices: Json
          explanation: string | null
          id: string
          prompt: string
          time_limit_seconds: number
        }
        Insert: {
          bank_id: string
          choices: Json
          explanation?: string | null
          id?: string
          prompt: string
          time_limit_seconds?: number
        }
        Update: {
          bank_id?: string
          choices?: Json
          explanation?: string | null
          id?: string
          prompt?: string
          time_limit_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "quiz_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions2: {
        Row: {
          accepted_answers: string[] | null
          age_band: string
          choices: Json | null
          created_at: string
          difficulty: string
          explanation: string | null
          family_id: string | null
          id: string
          is_builtin: boolean
          question_text: string
          sentence_template: string | null
          tags: string[]
          theme: string
          type: string
        }
        Insert: {
          accepted_answers?: string[] | null
          age_band: string
          choices?: Json | null
          created_at?: string
          difficulty: string
          explanation?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          question_text: string
          sentence_template?: string | null
          tags?: string[]
          theme: string
          type: string
        }
        Update: {
          accepted_answers?: string[] | null
          age_band?: string
          choices?: Json | null
          created_at?: string
          difficulty?: string
          explanation?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          question_text?: string
          sentence_template?: string | null
          tags?: string[]
          theme?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions2_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          bank_id: string
          family_id: string
          final_scores: Json | null
          finished_at: string | null
          id: string
          mode: string
          started_at: string
          winner_kid_id: string | null
        }
        Insert: {
          bank_id: string
          family_id: string
          final_scores?: Json | null
          finished_at?: string | null
          id?: string
          mode: string
          started_at?: string
          winner_kid_id?: string | null
        }
        Update: {
          bank_id?: string
          family_id?: string
          final_scores?: Json | null
          finished_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          winner_kid_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "quiz_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_winner_kid_id_fkey"
            columns: ["winner_kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sets: {
        Row: {
          age_band_filter: string | null
          created_at: string
          description: string | null
          emoji: string
          family_id: string | null
          id: string
          max_difficulty: string
          name: string
          question_type_filter: string[] | null
          questions_per_session: number
          themes: string[]
        }
        Insert: {
          age_band_filter?: string | null
          created_at?: string
          description?: string | null
          emoji?: string
          family_id?: string | null
          id?: string
          max_difficulty?: string
          name: string
          question_type_filter?: string[] | null
          questions_per_session?: number
          themes?: string[]
        }
        Update: {
          age_band_filter?: string | null
          created_at?: string
          description?: string | null
          emoji?: string
          family_id?: string | null
          id?: string
          max_difficulty?: string
          name?: string
          question_type_filter?: string[] | null
          questions_per_session?: number
          themes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_requests: {
        Row: {
          family_id: string
          id: string
          kid_id: string
          parent_note: string | null
          points_deducted_at: string | null
          requested_at: string
          resolved_at: string | null
          reward_id: string
          status: string
        }
        Insert: {
          family_id: string
          id?: string
          kid_id: string
          parent_note?: string | null
          points_deducted_at?: string | null
          requested_at?: string
          resolved_at?: string | null
          reward_id: string
          status?: string
        }
        Update: {
          family_id?: string
          id?: string
          kid_id?: string
          parent_note?: string | null
          points_deducted_at?: string | null
          requested_at?: string
          resolved_at?: string | null
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_requests_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_requests_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          available_to: string[]
          cost_points: number
          created_at: string
          description: string | null
          family_id: string
          icon: string
          id: string
          kid_id: string | null
          name: string
          recurrence: string
          redemption_limit: number | null
          redemption_period: string
          requires_approval: boolean
          reward_type: string
          type: string
          who: string
        }
        Insert: {
          active?: boolean
          available_to?: string[]
          cost_points: number
          created_at?: string
          description?: string | null
          family_id: string
          icon?: string
          id?: string
          kid_id?: string | null
          name: string
          recurrence?: string
          redemption_limit?: number | null
          redemption_period?: string
          requires_approval?: boolean
          reward_type?: string
          type: string
          who?: string
        }
        Update: {
          active?: boolean
          available_to?: string[]
          cost_points?: number
          created_at?: string
          description?: string | null
          family_id?: string
          icon?: string
          id?: string
          kid_id?: string | null
          name?: string
          recurrence?: string
          redemption_limit?: number | null
          redemption_period?: string
          requires_approval?: boolean
          reward_type?: string
          type?: string
          who?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_classes: {
        Row: {
          created_at: string
          custom_label: string | null
          day_of_week: number
          end_time: string
          family_id: string
          id: string
          kid_id: string
          room: string | null
          start_time: string
          subject: string
          teacher: string | null
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          day_of_week: number
          end_time: string
          family_id: string
          id?: string
          kid_id: string
          room?: string | null
          start_time: string
          subject: string
          teacher?: string | null
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          day_of_week?: number
          end_time?: string
          family_id?: string
          id?: string
          kid_id?: string
          room?: string | null
          start_time?: string
          subject?: string
          teacher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_classes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_classes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_items: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: number[]
          family_id: string
          icon: string
          id: string
          kid_id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week: number[]
          family_id: string
          icon?: string
          id?: string
          kid_id: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          family_id?: string
          icon?: string
          id?: string
          kid_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_items_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      strikes: {
        Row: {
          cleared_at: string | null
          created_at: string
          deduct_at: string | null
          deducted_at: string | null
          id: string
          issued_by_parent_name: string
          kid_id: string
          penalty_stars: number
          reason: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          deduct_at?: string | null
          deducted_at?: string | null
          id?: string
          issued_by_parent_name: string
          kid_id: string
          penalty_stars?: number
          reason: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          deduct_at?: string | null
          deducted_at?: string | null
          id?: string
          issued_by_parent_name?: string
          kid_id?: string
          penalty_stars?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "strikes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          completed_at: string
          date: string
          duration_actual_seconds: number | null
          family_id: string
          family_points_awarded: number
          id: string
          kid_id: string
          points_awarded: number
          task_id: string
        }
        Insert: {
          completed_at?: string
          date?: string
          duration_actual_seconds?: number | null
          family_id: string
          family_points_awarded?: number
          id?: string
          kid_id: string
          points_awarded?: number
          task_id: string
        }
        Update: {
          completed_at?: string
          date?: string
          duration_actual_seconds?: number | null
          family_id?: string
          family_points_awarded?: number
          id?: string
          kid_id?: string
          points_awarded?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active: boolean
          category: string
          checklist_items: string[] | null
          created_at: string
          custom_label: string | null
          days_of_week: number[]
          default_bpm: number | null
          default_time_signature: string | null
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          family_id: string
          family_points_contribution: number
          flexible_min_per_week: number | null
          frequency_per_day: number
          icon: string
          id: string
          kid_can_add: boolean
          kid_ids: string[] | null
          location: string | null
          music_enabled: boolean
          name: string
          packing_list: string[] | null
          points: number
          requires_completion: boolean
          requires_timer: boolean
          room: string | null
          rule: string
          schedule_type: string
          start_time: string | null
          subject: string | null
          target: string
          target_duration_minutes: number | null
          target_rep_label: string | null
          target_reps: number | null
          teacher: string | null
          time_block: string
          time_slots: string[]
        }
        Insert: {
          active?: boolean
          category: string
          checklist_items?: string[] | null
          created_at?: string
          custom_label?: string | null
          days_of_week?: number[]
          default_bpm?: number | null
          default_time_signature?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          family_id: string
          family_points_contribution?: number
          flexible_min_per_week?: number | null
          frequency_per_day?: number
          icon?: string
          id?: string
          kid_can_add?: boolean
          kid_ids?: string[] | null
          location?: string | null
          music_enabled?: boolean
          name: string
          packing_list?: string[] | null
          points?: number
          requires_completion?: boolean
          requires_timer?: boolean
          room?: string | null
          rule?: string
          schedule_type?: string
          start_time?: string | null
          subject?: string | null
          target?: string
          target_duration_minutes?: number | null
          target_rep_label?: string | null
          target_reps?: number | null
          teacher?: string | null
          time_block?: string
          time_slots?: string[]
        }
        Update: {
          active?: boolean
          category?: string
          checklist_items?: string[] | null
          created_at?: string
          custom_label?: string | null
          days_of_week?: number[]
          default_bpm?: number | null
          default_time_signature?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          family_id?: string
          family_points_contribution?: number
          flexible_min_per_week?: number | null
          frequency_per_day?: number
          icon?: string
          id?: string
          kid_can_add?: boolean
          kid_ids?: string[] | null
          location?: string | null
          music_enabled?: boolean
          name?: string
          packing_list?: string[] | null
          points?: number
          requires_completion?: boolean
          requires_timer?: boolean
          room?: string | null
          rule?: string
          schedule_type?: string
          start_time?: string | null
          subject?: string | null
          target?: string
          target_duration_minutes?: number | null
          target_rep_label?: string | null
          target_reps?: number | null
          teacher?: string | null
          time_block?: string
          time_slots?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          accent: string
          accent_soft: string
          decoration: string
          description: string | null
          flavor: string
          header_gradient: string
          heading_text: string
          id: string
          name: string
          page_gradient: string
        }
        Insert: {
          accent: string
          accent_soft: string
          decoration: string
          description?: string | null
          flavor: string
          header_gradient: string
          heading_text: string
          id: string
          name: string
          page_gradient: string
        }
        Update: {
          accent?: string
          accent_soft?: string
          decoration?: string
          description?: string | null
          flavor?: string
          header_gradient?: string
          heading_text?: string
          id?: string
          name?: string
          page_gradient?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          added_at: string
          id: string
          kid_id: string
          position: number
          reward_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          kid_id: string
          position: number
          reward_id: string
        }
        Update: {
          added_at?: string
          id?: string
          kid_id?: string
          position?: number
          reward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_family_id: { Args: never; Returns: string }
      decrement_kid_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      decrement_kid_stars: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      increment_badge_progress: {
        Args: { p_category: string; p_kid_id: string }
        Returns: string
      }
      increment_family_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      increment_kid_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      increment_kid_total_completions: {
        Args: { p_kid_id: string }
        Returns: undefined
      }
      update_kid_gamification: {
        Args: { p_kid_id: string; p_points: number }
        Returns: undefined
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
