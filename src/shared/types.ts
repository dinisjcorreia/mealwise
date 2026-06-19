export type MealStatus = "pending" | "saved";
export type Gender = "female" | "male";
export type WeightGoal = "lose" | "maintain" | "gain";

export type Nutrients = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
};

export type MealItem = Nutrients & {
  id?: string;
  meal_id?: string;
  food_name: string;
  portion: string;
  confidence: number;
  notes?: string | null;
};

export type MealAnalysis = {
  status: MealStatus | "needs_clarification";
  meal_name: string | null;
  clarification_question: string | null;
  items: MealItem[];
  notes: string | null;
};

export type Meal = {
  id: string;
  description: string | null;
  status: MealStatus;
  meal_date: string;
  photo_path: string | null;
  photo_url?: string | null;
  clarification_question: string | null;
  ai_notes: string | null;
  created_at: string;
  updated_at: string;
  meal_items: MealItem[];
};

export type DailySummary = Nutrients & {
  date: string;
  meal_count: number;
  water_ml: number;
  creatine_taken: boolean;
};

export type UserProfile = {
  user_id: string;
  gender: Gender;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: WeightGoal;
  daily_calorie_target: number;
  daily_protein_target_g: number;
  daily_water_target_ml: number;
  created_at?: string;
  updated_at?: string;
};

export type DailyWater = {
  user_id: string;
  intake_date: string;
  amount_ml: number;
  created_at?: string;
  updated_at?: string;
};

export type DailyCreatine = {
  user_id: string;
  intake_date: string;
  taken: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AdminUserDetails = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  profile: UserProfile | null;
  total_saved_meals: number;
  day_calories: number;
  day_protein_g: number;
  day_water_ml: number;
  day_creatine_taken: boolean;
  day_meals: Meal[];
};
