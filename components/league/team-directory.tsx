import type { Team } from "@/lib/schema";
import { TeamAvatar } from "./avatars";
export function TeamDirectory({
  teams,
  onTeam,
}: {
  teams: Team[];
  onTeam: (id: number) => void;
}) {
  return (
    <div className="team-directory">
      {teams.map((team) => (
        <button
          className="team-card"
          key={team.id}
          onClick={() => onTeam(team.id)}
        >
          <TeamAvatar team={team} large />
          <h2>{team.name}</h2>
          <div>
            <span>
              Record
              <strong>
                {team.wins}–{team.losses}–{team.ties}
              </strong>
            </span>
            <span>
              Standing
              <strong>
                {team.standing === null ? "—" : `#${team.standing}`}
              </strong>
            </span>
            <span>
              Roster<strong>{team.rosterSize}</strong>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
