interface StepperProps {
  steps: string[];
  activeStep: number;
}

export function Stepper({ steps, activeStep }: StepperProps) {
  return (
    <div className="stepper" aria-label="Submission steps">
      {steps.map((step, index) => (
        <span
          key={step}
          className={`step-chip ${index === activeStep ? 'step-chip-active' : ''}`.trim()}
        >
          {index + 1}. {step}
        </span>
      ))}
    </div>
  );
}
