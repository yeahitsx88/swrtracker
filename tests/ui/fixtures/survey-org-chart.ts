import {canMove,type Person,type ProposedMove} from '../../../src/components/ui/survey-org-chart/model';
const chiefs = [
  ['chief-1', 'Noah Johnson', 'sup-1', 'Structures', 'North Process', 3],
  ['chief-2', 'Elena Martinez', 'sup-1', 'Utilities', 'North Process', 2],
  ['chief-3', 'Marcus Lee', 'sup-1', 'Foundations', 'North Process', 1],
  ['chief-4', 'Theo Brooks', 'sup-2', 'Pipe Rack', 'South Process', 4],
  ['chief-5', 'Sofia Patel', 'sup-2', 'Equipment', 'South Process', 2],
  ['chief-6', 'Owen Davis', 'sup-2', 'Civil', 'South Process', 1],
  ['chief-7', 'Isabel Torres', 'sup-3', 'Roads', 'Offsites', 2],
  ['chief-8', 'James Wilson', 'sup-3', 'Drainage', 'Offsites', 3],
] as const;
const names = ['Alex Smith', 'Maya Chen', 'Daniel Reed', 'Avery Scott', 'Sam Rivera', 'Eli Turner', 'Nina Park', 'Leo Morgan', 'Grace Allen', 'Ben Carter', 'Zoe Hughes', 'Ian Foster', 'Emma Ross', 'Luke Bell', 'Eva Cruz', 'Max Wright', 'Ruby Adams', 'Finn Moore'];

export function createFixture(): Person[] {
  let index = 0;
  return [
    { id: 'manager', name: 'Jordan Morgan', role: 'Survey Manager', parentId: null, area: 'Project-wide' },
    { id: 'sup-1', name: 'Amelia Carter', role: 'Survey Superintendent', parentId: 'manager', area: 'North Process' },
    { id: 'sup-2', name: 'David Williams', role: 'Survey Superintendent', parentId: 'manager', area: 'South Process' },
    { id: 'sup-3', name: 'Rachel Kim', role: 'Survey Superintendent', parentId: 'manager', area: 'Offsites' },
    ...chiefs.flatMap(([id, name, parentId, team, area, count]): Person[] => [
      { id, name, parentId, role: 'Party Chief', team: `${team} Team`, area },
      ...Array.from({ length: count }, () => ({ id: `im-${++index}`, name: names[index - 1]!, role: 'Instrument Man' as const, parentId: id })),
    ]),
    ...['Harper Ellis', 'Chris Nguyen', 'Taylor James'].map((name, i): Person => ({ id: `available-${i}`, name, role: 'Instrument Man', parentId: null })),
  ];
}

/** Fixture-only projection. Crew members keep their Chief and travel with that subtree. */
export function projectMove(people: Person[], move: ProposedMove): Person[] {
  const person = people.find(p => p.id === move.personId);
  const destination = people.find(p => p.id === move.destinationId);
  if (!person || !destination || !canMove(person, destination)) throw new Error('Invalid prototype move');
  return people.map(p => p.id === person.id ? {
    ...p, parentId: destination.id,
    ...(p.role === 'Party Chief' ? { area: destination.area } : {}),
  } : p);
}
