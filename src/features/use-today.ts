// Today's local calendar date (spec 04). It moves on at local midnight while the page stays open,
// so a task turns overdue without a reload and without any background service.
import { useEffect, useState } from 'react';
import { localDate } from '@/core/local-time.ts';

export function useToday(): string {
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(() => setToday(localDate(new Date())), midnight.getTime() - now.getTime() + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}
