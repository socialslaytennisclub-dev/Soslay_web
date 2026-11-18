/** Peran crew member di activity (session_hosts.role): host (akses Panel Host) atau fotografer. */
export type CrewRole = "host" | "photographer";

export const CREW_ROLE_LABEL: Record<CrewRole, string> = { host: "Host", photographer: "Fotografer" };

export const CREW_ROLES = Object.keys(CREW_ROLE_LABEL) as CrewRole[];

/** Kunci pembanding daftar crew (urutan tidak berpengaruh) — dipakai editor trip & pemuat host trip. */
export const crewSignature = (crew: { memberId: string; role: CrewRole }[]) =>
  crew
    .map((c) => `${c.memberId}:${c.role}`)
    .sort()
    .join(",");
