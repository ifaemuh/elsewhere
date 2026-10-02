import { FACTS, type FactName } from '@elsewhere/rules/core';

export interface FactEntry {
  name: FactName;
  type: string;
  values?: string[];
  description: string;
}

export function factsVocabulary(): FactEntry[] {
  return (Object.keys(FACTS) as FactName[]).sort().map((name) => {
    const def = FACTS[name];
    return {
      name,
      type: def.type,
      ...('values' in def && def.values ? { values: [...def.values] } : {}),
      description: def.description,
    };
  });
}
