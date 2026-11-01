// An address that matches no page (spec 08). It shows inside the app shell, so the navigation stays.
import { Link } from '@tanstack/react-router';

export function PageNotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p>
        This address does not match a page in GitCRM.{' '}
        <Link to="/" className="underline">
          Go to Home
        </Link>
      </p>
    </>
  );
}
