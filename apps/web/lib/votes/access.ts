/** Who may start a vote about an incident, and so who gets the paid schedule suggestions: the planner or an affected traveler. */
export function canStartIncidentVote(isPlanner: boolean, affectedUserIds: string[] | null | undefined, userId: string): boolean {
  return isPlanner || (affectedUserIds ?? []).includes(userId);
}
