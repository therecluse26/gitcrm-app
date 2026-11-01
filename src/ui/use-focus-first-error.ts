// After a failed check, focus moves to the first field with an error (spec 08). Pass the form's
// errors; the returned ref goes on the <form>.
import { useEffect, useRef } from 'react';

export function useFocusFirstError(errors: object) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return form;
}
