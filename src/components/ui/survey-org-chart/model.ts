export type SurveyRole = 'Survey Manager' | 'Survey Superintendent' | 'Party Chief' | 'Instrument Man';
export interface Person {
  id: string;
  name: string;
  role: SurveyRole;
  parentId: string | null;
  team?: string;
  area?: string;
}
export interface ProposedMove { personId: string; destinationId: string }

export function canMove(person: Person, destination: Person) {
  return person.parentId !== destination.id && (
    person.role === 'Instrument Man' && destination.role === 'Party Chief' ||
    person.role === 'Party Chief' && destination.role === 'Survey Superintendent'
  );
}

