/**
 * Route map. Every organ is code-split; heavy experiences (the WebGL atlas, hls.js) load
 * only when their route needs them. Errors inside a route are contained by a route-level
 * boundary so the spine, search and sound controls keep working.
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams, useRouteError, isRouteErrorResponse } from 'react-router';
import { CatalogueProvider } from '../state/catalogue.tsx';
import { EmptyState, Pulse } from '../ui/feedback.tsx';
import { ButtonLink, Button } from '../ui/controls.tsx';
import { Shell } from './Shell.tsx';
import NotFound from '../features/notfound/NotFound.tsx';

const page = (load: () => Promise<{ default: ComponentType }>, label: string) => {
  const C = lazy(load);
  return (
    <Suspense fallback={<Pulse label={`Waking ${label}`} />}>
      <C />
    </Suspense>
  );
};

function RouteError() {
  const err = useRouteError();
  const chunk = err instanceof Error && /dynamically imported module|Loading chunk|Failed to fetch/i.test(err.message);
  return (
    <div className="page wrap">
      <EmptyState
        icon="info"
        tone="haem"
        title={chunk ? 'This organ could not load' : isRouteErrorResponse(err) && err.status === 404 ? 'Nothing lives here' : 'Something misfired'}
        actions={
          <>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <ButtonLink to="/">Back to Stream</ButtonLink>
          </>
        }
      >
        <p>
          {chunk
            ? 'Part of the app failed to download — usually a dropped connection or a fresh deployment. Reloading fixes it.'
            : 'The rest of Monumental is still working. You can retry or head back to the Stream.'}
        </p>
      </EmptyState>
    </div>
  );
}

/** Permanent move of an old address: keeps the slug, query and hash (direct links keep working). */
function Moved({ to }: { to: string }) {
  const { slug } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={`${to}${slug ? `/${slug}` : ''}${search}${hash}`} />;
}

const category = () => page(() => import('../features/category/CategoryPage.tsx'), 'the collection');

function Boot({ children }: { children: ReactNode }) {
  return (
    <CatalogueProvider
      fallback={({ error, retry }) =>
        error ? (
          <div className="boot boot-error">
            <EmptyState
              icon="info"
              tone="haem"
              title="The organism could not wake"
              actions={
                <Button variant="primary" onClick={retry}>
                  Retry
                </Button>
              }
            >
              <p>{error} The catalogue server may be offline.</p>
            </EmptyState>
          </div>
        ) : (
          <div className="boot">
            <Pulse label="Finding a heartbeat" />
          </div>
        )
      }
    >
      {children}
    </CatalogueProvider>
  );
}

const router = createBrowserRouter([
  {
    element: (
      <Boot>
        <Shell />
      </Boot>
    ),
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: page(() => import('../features/home/HomePage.tsx'), 'the stream') },
          { path: 'catalogue', element: page(() => import('../features/catalogue/CataloguePage.tsx'), 'search') },
          { path: 'search', element: page(() => import('../features/catalogue/CataloguePage.tsx'), 'search') },
          { path: 'watch/:slug', element: page(() => import('../features/watch/WatchPage.tsx'), 'the player') },
          { path: 'programme/:slug', element: page(() => import('../features/programme/ProgrammePage.tsx'), 'the programme') },
          { path: 'collection/:slug', element: page(() => import('../features/programme/CollectionPage.tsx'), 'the collection') },
          { path: 'world/:slug?', element: page(() => import('../features/atlas/AtlasPage.tsx'), 'the world') },
          { path: 'atlas/:slug?', element: <Moved to="/world" /> },
          { path: 'time-machine/:slug?', element: page(() => import('../features/time/TimePage.tsx'), 'the time machine') },
          { path: 'time/:slug?', element: <Moved to="/time-machine" /> },
          { path: 'live', element: page(() => import('../features/live/LivePage.tsx'), 'live') },
          ...['movies', 'music', 'sports', 'gaming', 'news', 'fashion', 'culture', 'kids'].map((p) => ({ path: p, element: category() })),
          { path: 'synapse/:kind/:slug', element: page(() => import('../features/synapse/SynapsePage.tsx'), 'the synapse') },
          { path: 'somewhere', element: page(() => import('../features/somewhere/SomewherePage.tsx'), 'the instrument') },
          { path: 'passport', element: page(() => import('../features/passport/PassportPage.tsx'), 'the passport') },
          { path: 'my-world', element: page(() => import('../features/you/YouPage.tsx'), 'my world') },
          { path: 'you', element: <Moved to="/my-world" /> },
          { path: 'settings', element: <Navigate replace to="/my-world?tab=settings" /> },
          { path: 'membership', element: page(() => import('../features/membership/MembershipPage.tsx'), 'membership') },
          { path: 'account', element: page(() => import('../features/account/AccountPage.tsx'), 'your account') },
          { path: 'about', element: page(() => import('../features/about/AboutPage.tsx'), 'the about page') },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

