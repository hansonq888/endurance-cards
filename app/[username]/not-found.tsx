import { ConnectWithStrava } from "@/components/StravaBrand";

export default function PlayerNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-card text-7xl font-extrabold text-strava">404</p>
      <h1 className="text-xl font-semibold">No card here</h1>
      <p className="text-sm text-muted">
        Cards are shared by private link, so this one doesn&apos;t exist, is private, or its link was reset. Ask for their
        latest link, or connect Strava to make your own.
      </p>
      <ConnectWithStrava />
    </main>
  );
}
