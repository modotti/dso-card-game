export type AchievementId =
  | 'first-light'
  | 'deep-sky-explorer'
  | 'cosmic-surveyor'
  | 'deep-sky-atlas'
  | 'first-victory'
  | 'seasoned-observer'
  | 'deep-sky-veteran'
  | 'against-the-odds'
  | 'unstoppable'
  | 'nebula-hunter'
  | 'galaxy-hunter'
  | 'cluster-hunter'
  | 'clear-skies'
  | 'stellar-winds'
  | 'cosmic-collision'
  | 'tidal-disruption'
  | 'perfect-observation'
  | 'comeback';

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly name: string;
  readonly descriptionKey: string;
  readonly progressKind?: 'discoveries' | 'wins' | 'streak' | 'nebula' | 'galaxy' | 'cluster';
  readonly target?: number | 'catalog';
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-light',
    name: 'First Light',
    descriptionKey: 'achievement.first-light',
    progressKind: 'discoveries',
    target: 1,
  },
  {
    id: 'deep-sky-explorer',
    name: 'Deep Sky Explorer',
    descriptionKey: 'achievement.deep-sky-explorer',
    progressKind: 'discoveries',
    target: 10,
  },
  {
    id: 'cosmic-surveyor',
    name: 'Cosmic Surveyor',
    descriptionKey: 'achievement.cosmic-surveyor',
    progressKind: 'discoveries',
    target: 25,
  },
  {
    id: 'deep-sky-atlas',
    name: 'Deep Sky Atlas',
    descriptionKey: 'achievement.deep-sky-atlas',
    progressKind: 'discoveries',
    target: 'catalog',
  },
  {
    id: 'first-victory',
    name: 'First Victory',
    descriptionKey: 'achievement.first-victory',
    progressKind: 'wins',
    target: 1,
  },
  {
    id: 'seasoned-observer',
    name: 'Seasoned Observer',
    descriptionKey: 'achievement.seasoned-observer',
    progressKind: 'wins',
    target: 10,
  },
  {
    id: 'deep-sky-veteran',
    name: 'Deep Sky Veteran',
    descriptionKey: 'achievement.deep-sky-veteran',
    progressKind: 'wins',
    target: 25,
  },
  { id: 'against-the-odds', name: 'Against the Odds', descriptionKey: 'achievement.against-the-odds' },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    descriptionKey: 'achievement.unstoppable',
    progressKind: 'streak',
    target: 3,
  },
  {
    id: 'nebula-hunter',
    name: 'Nebula Hunter',
    descriptionKey: 'achievement.nebula-hunter',
    progressKind: 'nebula',
    target: 5,
  },
  {
    id: 'galaxy-hunter',
    name: 'Galaxy Hunter',
    descriptionKey: 'achievement.galaxy-hunter',
    progressKind: 'galaxy',
    target: 5,
  },
  {
    id: 'cluster-hunter',
    name: 'Cluster Hunter',
    descriptionKey: 'achievement.cluster-hunter',
    progressKind: 'cluster',
    target: 5,
  },
  { id: 'clear-skies', name: 'Clear Skies', descriptionKey: 'achievement.clear-skies' },
  { id: 'stellar-winds', name: 'Stellar Winds', descriptionKey: 'achievement.stellar-winds' },
  { id: 'cosmic-collision', name: 'Cosmic Collision', descriptionKey: 'achievement.cosmic-collision' },
  { id: 'tidal-disruption', name: 'Tidal Disruption', descriptionKey: 'achievement.tidal-disruption' },
  { id: 'perfect-observation', name: 'Perfect Observation', descriptionKey: 'achievement.perfect-observation' },
  { id: 'comeback', name: 'Comeback', descriptionKey: 'achievement.comeback' },
];

export type ObjectMacroCategory = 'nebula' | 'galaxy' | 'cluster';

const OBJECT_TYPES: Readonly<Record<ObjectMacroCategory, ReadonlySet<string>>> = {
  nebula: new Set(['emission_nebula', 'reflection_nebula', 'dark_nebula', 'planetary_nebula']),
  galaxy: new Set(['spiral_galaxy', 'elliptical_galaxy', 'irregular_galaxy']),
  cluster: new Set(['open_cluster', 'globular_cluster']),
};

export function objectMacroCategory(objectType: string): ObjectMacroCategory | null {
  for (const category of ['nebula', 'galaxy', 'cluster'] as const) {
    if (OBJECT_TYPES[category].has(objectType)) return category;
  }
  return null;
}
