import { loadLeague } from "@/lib/data";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const result = await loadLeague();
  if (!result.snapshot)
    return (
      <main className="setup-screen">
        <div className="brand-mark">9</div>
        <h1>Your league starts here.</h1>
        <p>{result.error}</p>
        <ol>
          <li>
            Configure ESPN access in the server’s private environment file.
          </li>
          <li>Run the league sync and verify its imported counts.</li>
          <li>Reload this page to see your league.</li>
        </ol>
        <a href="https://fantasy.espn.com/basketball/team?leagueId=1834203755&teamId=3&seasonId=2027">
          Open ESPN
        </a>
      </main>
    );
  return <Dashboard data={result.snapshot} syncFailure={result.syncFailure} />;
}
