'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { answerQuestion } from './actions';

export function AnswerButtons({ tripId, incidentId, fact, options }: { tripId: string; incidentId: string; fact: string; options: { value: string; label: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError((await answerQuestion(tripId, incidentId, fact, option.value)).error);
              })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#b4532a]">
          {error}
        </p>
      ) : null}
    </>
  );
}
