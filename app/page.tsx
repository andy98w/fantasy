import { loadLeague } from "@/lib/data";
import Dashboard from "@/components/dashboard";
import { AutoRefresh } from "@/components/auto-refresh";
import { loadToday } from "@/lib/nba-data";
export const dynamic = "force-dynamic";
export default async function Page() {
  const result = await loadLeague();
  if (!result.snapshot)
    return (
      <main className="setup-screen">
        <AutoRefresh />
        <h1>League unavailable</h1>
        <p>{result.error}</p>
        <ol>
          <li>
            Configure ESPN access in the server’s private environment file.
          </li>
          <li>Run the league sync and verify its imported counts.</li>
          <li>The league appears automatically once the sync completes.</li>
        </ol>
        <a href="https://fantasy.espn.com/basketball/league?leagueId=1834203755&seasonId=2027">
          Open ESPN
        </a>
      </main>
    );
  const today = result.snapshot.mode === "live" ? await loadToday() : undefined;
  return (
    <>
      {result.snapshot.mode === "live" && <AutoRefresh />}
      <Dashboard data={result.snapshot} syncFailure={result.syncFailure} today={today} />
    </>
  );
}
