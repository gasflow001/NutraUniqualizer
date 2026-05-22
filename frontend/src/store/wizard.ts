import { create } from "zustand";

export type StepNum = 1 | 2 | 3 | 4 | 5 | 6;

export type Segments = {
  headline?: { original: string; ru: string }[];
  subheadline?: { original: string; ru: string }[];
  benefits?: { original: string; ru: string }[];
  cta?: { original: string; ru: string }[];
  badges?: { original: string; ru: string }[];
};

export type Layout = {
  canvas: { aspect: string; width: number; height: number };
  palette: string[];
  style: string;
  mood: string;
  zones: { id: string; x: number; y: number; w: number; h: number; label: string }[];
  human_subject?: { present: boolean; role?: string; position?: string };
  visual_elements?: string[];
};

export type ProductMeta = {
  product_id?: string;
  brand_name?: string;
  package_type?: string;
  color_dominant?: string;
  preview_url?: string;
};

export type DesignAnalysis = {
  scene_description?: string;
  composition_style?: string;
  visual_metaphors?: string[];
  mood?: string;
  color_scheme?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
  };
  ui_elements?: string[];
  props?: string[];
  human_subjects?: { present?: boolean; description?: string };
  text_styling?: {
    headline_style?: string;
    body_style?: string;
    cta_style?: string;
  };
  unique_features?: string[];
};

export type Variant = {
  id: string;
  url: string;
  revision: number;
};

export type FinalVariant = {
  id: string;
  url: string;
};

type State = {
  projectId: string | null;
  currentStep: StepNum;
  step1: { segments: Segments | null; sourceLang: string | null };
  step2: { mode: "auto" | "manual"; layout: Layout | null };
  step3: { productMeta: ProductMeta | null };
  step4: { designAnalysis: DesignAnalysis | null; previewUrl: string | null; useCertificate: boolean; certPreviewUrl: string | null; useDoctor: boolean; docPreviewUrl: string | null };
  step5: {
    nVariants: number;
    model: "auto" | "GEM_PIX" | "GEM_PIX_2";
    aspectRatio: "1:1" | "4:5";
    variants: Variant[];
  };
  step6: { finals: FinalVariant[] };
};

type Actions = {
  setStep: (n: StepNum) => void;
  setProjectId: (id: string | null) => void;
  setStep1: (s: Partial<State["step1"]>) => void;
  setStep2: (s: Partial<State["step2"]>) => void;
  setStep3: (s: Partial<State["step3"]>) => void;
  setStep4: (s: Partial<State["step4"]>) => void;
  setStep5: (s: Partial<State["step5"]>) => void;
  setStep6: (s: Partial<State["step6"]>) => void;
  reset: () => void;
};

const initial: State = {
  projectId: null,
  currentStep: 1,
  step1: { segments: null, sourceLang: null },
  step2: { mode: "auto", layout: null },
  step3: { productMeta: null },
  step4: { designAnalysis: null, previewUrl: null, useCertificate: false, certPreviewUrl: null, useDoctor: false, docPreviewUrl: null },
  step5: { nVariants: 3, model: "auto", aspectRatio: "1:1", variants: [] },
  step6: { finals: [] },
};

export const useWizard = create<State & Actions>((set) => ({
  ...initial,
  setStep: (n) => set({ currentStep: n }),
  setProjectId: (id) => set({ projectId: id }),
  setStep1: (s) => set((st) => ({ step1: { ...st.step1, ...s } })),
  setStep2: (s) => set((st) => ({ step2: { ...st.step2, ...s } })),
  setStep3: (s) => set((st) => ({ step3: { ...st.step3, ...s } })),
  setStep4: (s) => set((st) => ({ step4: { ...st.step4, ...s } })),
  setStep5: (s) => set((st) => ({ step5: { ...st.step5, ...s } })),
  setStep6: (s) => set((st) => ({ step6: { ...st.step6, ...s } })),
  reset: () => set(initial),
}));
