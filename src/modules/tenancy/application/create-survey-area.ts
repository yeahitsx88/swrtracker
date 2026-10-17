import { ValidationError } from '@/shared/errors';
import type { DbClient } from '@/shared/types';
import { authorizeTeamMutation, type SurveyTeamsRepository, type TeamActor, type TeamArea } from './survey-teams';

export interface NewSurveyArea { name: string; code: string }
export interface SurveyAreaRepository extends SurveyTeamsRepository {
  createArea(db: DbClient, actor: TeamActor, input: NewSurveyArea): Promise<TeamArea>;
}
export function parseNewSurveyArea(value: unknown): NewSurveyArea {
  const input = value as Partial<NewSurveyArea> | null;
  if (!input || typeof input.name !== 'string' || typeof input.code !== 'string') throw new ValidationError('Enter an Area name and short code.');
  const name = input.name.trim(), code = input.code.trim().toUpperCase();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name) || !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) {
    throw new ValidationError('Use a name up to 100 characters and a code up to 20 letters, numbers, hyphens or underscores.');
  }
  return { name, code };
}
/** Caller holds the lifecycle barrier and transaction; project lock serializes Area/team edits. */
export async function createSurveyArea(repo: SurveyAreaRepository, db: DbClient, actor: TeamActor, input: NewSurveyArea) {
  await authorizeTeamMutation(repo, db, actor);
  return repo.createArea(db, actor, parseNewSurveyArea(input));
}
