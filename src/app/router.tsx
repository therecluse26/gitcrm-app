// Routes with hash history, so any static host serves the app (ADR-010). URLs hold record IDs,
// never names or search text: browsers keep URLs in history, and some sync it.
import { createHashHistory, createRootRoute, createRoute, createRouter, type RouteComponent } from '@tanstack/react-router';
import { CompaniesPage } from '@/features/companies/CompaniesPage.tsx';
import { EditCompanyPage, NewCompanyPage } from '@/features/companies/CompanyEditor.tsx';
import { CompanyPage } from '@/features/companies/CompanyPage.tsx';
import { EditContactPage, NewContactPage } from '@/features/contacts/ContactEditor.tsx';
import { ContactPage } from '@/features/contacts/ContactPage.tsx';
import { ContactsPage } from '@/features/contacts/ContactsPage.tsx';
import { EditOpportunityPage, NewOpportunityPage } from '@/features/opportunities/OpportunityEditor.tsx';
import { OpportunityPage } from '@/features/opportunities/OpportunityPage.tsx';
import { PipelinePage } from '@/features/opportunities/PipelinePage.tsx';
import { EditActivityPage, NewActivityPage } from '@/features/activities/ActivityEditor.tsx';
import { DeleteActivityPage, DeleteCompanyPage, DeleteContactPage, DeleteOpportunityPage, DeleteTaskPage } from '@/features/DeletePage.tsx';
import { readNewRecordSearch } from '@/features/records.ts';
import { EditTaskPage, NewTaskPage } from '@/features/tasks/TaskEditor.tsx';
import { TaskPage } from '@/features/tasks/TaskPage.tsx';
import { TasksPage } from '@/features/tasks/TasksPage.tsx';
import { SearchPage } from '@/search/SearchPage.tsx';
import { HomePage } from '@/ui/HomePage.tsx';
import { PageNotFound } from '@/ui/PageNotFound.tsx';
import { Root } from '@/ui/Root.tsx';
import { SettingsPage } from '@/ui/SettingsPage.tsx';

const rootRoute = createRootRoute({ component: Root });
const page = <P extends string>(path: P, component: RouteComponent) => createRoute({ getParentRoute: () => rootRoute, path, component });
// A new-record page whose address can link the new record to another one.
const newRecordPage = <P extends string>(path: P, component: RouteComponent) =>
  createRoute({ getParentRoute: () => rootRoute, path, component, validateSearch: readNewRecordSearch });

const routeTree = rootRoute.addChildren([
  page('/', HomePage),
  page('/contacts', ContactsPage),
  newRecordPage('/contacts/new', NewContactPage),
  page('/contacts/$contactId', ContactPage),
  page('/contacts/$contactId/edit', EditContactPage),
  page('/contacts/$contactId/delete', DeleteContactPage),
  page('/companies', CompaniesPage),
  page('/companies/new', NewCompanyPage),
  page('/companies/$companyId', CompanyPage),
  page('/companies/$companyId/edit', EditCompanyPage),
  page('/companies/$companyId/delete', DeleteCompanyPage),
  page('/pipeline', PipelinePage),
  newRecordPage('/opportunities/new', NewOpportunityPage),
  page('/opportunities/$opportunityId', OpportunityPage),
  page('/opportunities/$opportunityId/edit', EditOpportunityPage),
  page('/opportunities/$opportunityId/delete', DeleteOpportunityPage),
  page('/tasks', TasksPage),
  newRecordPage('/tasks/new', NewTaskPage),
  page('/tasks/$taskId', TaskPage),
  page('/tasks/$taskId/edit', EditTaskPage),
  page('/tasks/$taskId/delete', DeleteTaskPage),
  newRecordPage('/activities/new', NewActivityPage),
  page('/activities/$activityId/edit', EditActivityPage),
  page('/activities/$activityId/delete', DeleteActivityPage),
  page('/search', SearchPage),
  page('/settings', SettingsPage),
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  // A page for another record starts fresh, with no form or message left from the last one.
  defaultRemountDeps: ({ params }) => params,
  defaultNotFoundComponent: PageNotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
