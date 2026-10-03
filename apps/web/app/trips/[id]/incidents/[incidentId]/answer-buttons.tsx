'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { answerQuestion } from './actions';

export function AnswerButtons({ tripId, incidentId, fact, options }: { tripId: string; incidentId: string; fact: string; options: { value: string; label: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            disabled={pending || done}
            onClick={() =>
              startTransition(async () => {
                const result = await answerQuestion(tripId, incidentId, fact, option.value);
                setError(result.error);
                setDone(result.error === null);
              })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>
      {done ? (
        <p role="status" className="mt-2 text-sm text-[#4b5745]">
          Thanks, we have your answer. We’re drafting the plan now.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#b4532a]">
          {error}
        </p>
      ) : null}
    </>
  );
}
