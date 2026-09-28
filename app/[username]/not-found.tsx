export default function PlayerNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-card text-7xl font-extrabold text-strava">404</p>
      <h1 className="text-xl font-semibold">No scouting report on file</h1>
      <p className="text-sm text-muted">
        Strava only shares data for athletes who connect their own account. If this is you, connect to generate your card.
      </p>
      {/* Full-page navigation: the route redirects off-site to Strava's OAuth screen. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/api/auth/strava" className="rounded-lg bg-strava px-5 py-2.5 text-sm font-semibold text-white">
        Connect with Strava
      </a>
    </main>
  );
}
