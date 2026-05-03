import { useMemo, useState } from 'react';
import * as Calendar from 'expo-calendar';

export interface CalendarSignal {
  id: string;
  label: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

function weekendSignals(): CalendarSignal[] {
  const signals: CalendarSignal[] = [];
  const today = new Date();

  for (let offset = 1; offset <= 90; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    if (date.getDay() === 5) {
      signals.push({
        id: `weekend-${date.toISOString().slice(0, 10)}`,
        label: 'Weekend window',
        detail: `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} could become a low-PTO getaway.`,
        priority: 'medium',
      });
    }
    if (signals.length >= 2) break;
  }

  return signals;
}

function eventToSignal(event: Calendar.Event): CalendarSignal | null {
  const title = event.title.toLowerCase();
  const startsAt = event.startDate ? new Date(event.startDate) : null;
  const dateLabel = startsAt?.toLocaleDateString([], { month: 'short', day: 'numeric' }) ?? 'Upcoming';

  if (title.includes('birthday')) {
    return {
      id: `birthday-${event.id}`,
      label: 'Birthday window',
      detail: `${dateLabel} looks like a celebration trip opportunity.`,
      priority: 'high',
    };
  }

  if (title.includes('anniversary')) {
    return {
      id: `anniversary-${event.id}`,
      label: 'Anniversary window',
      detail: `${dateLabel} could anchor a quieter, higher-intent trip.`,
      priority: 'high',
    };
  }

  if (title.includes('holiday') || title.includes('off') || title.includes('pto')) {
    return {
      id: `holiday-${event.id}`,
      label: 'Time-off window',
      detail: `${dateLabel} may reduce PTO needed for a trip.`,
      priority: 'medium',
    };
  }

  return null;
}

export function useCalendarSignals() {
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [signals, setSignals] = useState<CalendarSignal[]>(() => weekendSignals());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCalendarAccess = permissionStatus === 'granted';

  const rankedSignals = useMemo(
    () =>
      [...signals].sort((a, b) => {
        const weights = { high: 0, medium: 1, low: 2 };
        return weights[a.priority] - weights[b.priority];
      }),
    [signals],
  );

  const connectCalendar = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const permission = await Calendar.requestCalendarPermissionsAsync();
      setPermissionStatus(permission.status);

      if (permission.status !== 'granted') {
        setSignals(weekendSignals());
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = calendars.map((calendar) => calendar.id);
      const start = new Date();
      const end = new Date();
      end.setDate(start.getDate() + 120);
      const events = calendarIds.length
        ? await Calendar.getEventsAsync(calendarIds, start, end)
        : [];
      const eventSignals = events
        .map(eventToSignal)
        .filter((signal): signal is CalendarSignal => !!signal)
        .slice(0, 5);

      setSignals([...eventSignals, ...weekendSignals()].slice(0, 6));
    } catch (err) {
      setError((err as Error).message);
      setSignals(weekendSignals());
    } finally {
      setIsLoading(false);
    }
  };

  return {
    connectCalendar,
    error,
    hasCalendarAccess,
    isLoading,
    permissionStatus,
    signals: rankedSignals,
  };
}
