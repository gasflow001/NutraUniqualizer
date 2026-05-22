import { useEffect } from "react";
import { useWizard, StepNum } from "../store/wizard";
import { api } from "../api/client";
import { useToasts } from "../components/Toast";
import Step1Text from "../components/steps/Step1Text";
import Step2Layout from "../components/steps/Step2Layout";
import Step3Product from "../components/steps/Step3Product";
import Step4Design from "../components/steps/Step4Design";
import Step5Generate from "../components/steps/Step5Generate";
import Step6Export from "../components/steps/Step6Export";

const STEPS = [
  { n: 1, label: "Text" },
  { n: 2, label: "Layout" },
  { n: 3, label: "Product" },
  { n: 4, label: "Design" },
  { n: 5, label: "Generate" },
  { n: 6, label: "Export" },
] as const;

export default function Wizard() {
  const { projectId, currentStep, setStep, setProjectId, reset } = useWizard();
  const push = useToasts((s) => s.push);

  useEffect(() => {
    if (projectId) return;
    api
      .post<{ project_id: number }>("/api/projects")
      .then((r) => setProjectId(String(r.project_id)))
      .catch((e) => push(`Не удалось создать проект: ${e}`, "error"));
  }, [projectId, setProjectId, push]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <ol className="flex flex-wrap gap-2 flex-1">
          {STEPS.map((s) => (
            <li key={s.n}>
              <button
                onClick={() => setStep(s.n as StepNum)}
                className={`btn px-3 py-2 ${
                  currentStep === s.n
                    ? "bg-primary text-primary-foreground"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <span className="font-semibold">{s.n}.</span> {s.label}
              </button>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2 text-xs">
          {projectId && <span className="text-zinc-500">#{projectId}</span>}
          <button
            className="btn-ghost"
            onClick={() => {
              reset();
              push("Начат новый проект", "info");
            }}
          >
            ✦ New
          </button>
        </div>
      </div>

      {!projectId ? (
        <section className="card text-zinc-500">Создаю проект...</section>
      ) : (
        <section>
          {currentStep === 1 && <Step1Text />}
          {currentStep === 2 && <Step2Layout />}
          {currentStep === 3 && <Step3Product />}
          {currentStep === 4 && <Step4Design />}
          {currentStep === 5 && <Step5Generate />}
          {currentStep === 6 && <Step6Export />}
        </section>
      )}
    </div>
  );
}
