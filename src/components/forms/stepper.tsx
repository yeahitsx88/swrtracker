interface StepperProps {
  steps: string[];
  activeStep: number;
}

export function Stepper({ steps, activeStep }: StepperProps) {
  return (
    <ol className="stepper" aria-label="Submission steps">
      {steps.map((step, index) => {
        const state = index === activeStep ? 'step-chip-active' : index < activeStep ? 'step-chip-done' : '';
        return (
          <li
            key={step}
            className={`step-chip ${state}`.trim()}
            aria-current={index === activeStep ? 'step' : undefined}
          >
            <span className="step-number" aria-hidden="true">{index + 1}</span>
            <span>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
