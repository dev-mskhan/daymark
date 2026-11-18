/**
 * Task 8.69-8.76: Onboarding flow (3-5 steps) with overlay tooltips
 */

import { useState, useEffect } from 'react';
import { X, ArrowRight, Check, Sparkle, MapPin, CalendarCheck, ListChecks } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';

const ONBOARDING_COMPLETE_KEY = 'daymark:onboardingComplete';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  targetId?: string;
}

const steps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Daymark',
    description: 'Create perfect day trips powered by AI. Let\'s show you around in 30 seconds.',
    icon: <Sparkle size={32} weight="duotone" />,
  },
  {
    id: 'planning',
    title: 'Smart Planning',
    description: 'Describe your ideal day and we\'ll discover places, verify opening hours, and optimize routes automatically.',
    icon: <MapPin size={32} weight="duotone" />,
    targetId: 'trip-form',
  },
  {
    id: 'verification',
    title: 'Verified Details',
    description: 'We check opening hours, accessibility, and travel times so you can trust your itinerary.',
    icon: <Check size={32} weight="duotone" />,
  },
  {
    id: 'multiday',
    title: 'Multi-Day Trips',
    description: 'Plan up to 7 days with overnight locations. Each day adapts to your pace and preferences.',
    icon: <CalendarCheck size={32} weight="duotone" />,
  },
  {
    id: 'editing',
    title: 'Full Control',
    description: 'Drag to reorder, adjust durations, or remove activities. Your itinerary, your way.',
    icon: <ListChecks size={32} weight="duotone" />,
  },
];

interface OnboardingProps {
  onComplete?: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useFocusTrap(isVisible);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_COMPLETE_KEY);
      if (completed !== 'true') {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } catch {
      // Silent fail
    }
    onComplete?.();
  };

  if (!isVisible) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <>
      <div className="onboarding-overlay" onClick={handleSkip} />
      <div className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" ref={modalRef as any}>
        <button
          type="button"
          className="onboarding-close"
          onClick={handleSkip}
          aria-label="Skip tutorial"
        >
          <X size={20} weight="bold" />
        </button>

        <div className="onboarding-content">
          <div className="onboarding-icon">{step.icon}</div>
          <h2 id="onboarding-title" className="onboarding-title">{step.title}</h2>
          <p className="onboarding-description">{step.description}</p>

          <div className="onboarding-progress">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`onboarding-dot ${index === currentStep ? 'onboarding-dot--active' : ''} ${index < currentStep ? 'onboarding-dot--completed' : ''}`}
                aria-label={`Step ${index + 1} of ${steps.length}`}
              />
            ))}
          </div>

          <div className="onboarding-actions">
            <button
              type="button"
              className="onboarding-button onboarding-button--secondary"
              onClick={handleSkip}
            >
              Skip tutorial
            </button>
            <button
              type="button"
              className="onboarding-button onboarding-button--primary"
              onClick={handleNext}
            >
              {isLastStep ? (
                <>
                  Get Started
                  <Check size={18} weight="bold" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
