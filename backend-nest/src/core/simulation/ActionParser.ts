/**
 * Open-Pax — Action Parser
 * =========================
 * Simple MVP parser for player actions.
 * Converts action text to ValidatedAction.
 *
 * For MVP: simple keyword matching.
 * Future: use converter.ts with LLM for complex actions.
 */

import type { ValidatedAction, ActionCost } from './types';

export class ActionParser {
  /**
   * Parse action text into ValidatedAction
   * @param validate Optional validation function to call on the parsed action
   */
  parse(
    text: string,
    regions: Map<string, { id: string; name: string; owner: string }>,
    validate?: (action: ValidatedAction) => { valid: boolean; reason?: string }
  ): ValidatedAction | null {
    const lower = text.toLowerCase();

    // Attack patterns
    if (this.matchesAttack(lower)) {
      const target = this.findTarget(lower, regions);
      const source = this.findSource(lower, regions);

      if (!target || !source) return null;

      const cost: ActionCost = {
        gdp: 20,
        population: 0,
        militaryPower: 50,
      };

      const action: ValidatedAction = {
        type: 'attack',
        sourceRegionId: source.id,
        targetRegionId: target.id,
        description: `Атака на ${target.name}`,
        cost,
        expectedOutcome: {
          successProbability: 0.5,
          expectedCaptures: [],
          expectedLosses: { gdp: 10, population: 5000, militaryPower: 30 },
          duration: 30,
        },
      };
      if (validate) action.validation = validate(action);
      return action;
    }

    // Development patterns
    if (this.matchesDevelop(lower)) {
      const source = this.findSource(lower, regions);
      if (!source) return null;

      const cost: ActionCost = {
        gdp: 30,
        population: 0,
        militaryPower: 0,
      };

      const action: ValidatedAction = {
        type: 'develop',
        sourceRegionId: source.id,
        description: `Развитие в ${source.name}`,
        cost,
        expectedOutcome: {
          successProbability: 0.9,
          expectedCaptures: [],
          expectedLosses: { gdp: 0, population: 0, militaryPower: 0 },
          duration: 30,
        },
      };
      if (validate) action.validation = validate(action);
      return action;
    }

    // Trade patterns
    if (this.matchesTrade(lower)) {
      const source = this.findSource(lower, regions);
      if (!source) return null;

      const cost: ActionCost = {
        gdp: 10,
        population: 0,
        militaryPower: 0,
      };

      const action: ValidatedAction = {
        type: 'trade',
        sourceRegionId: source.id,
        description: `Торговля в ${source.name}`,
        cost,
        expectedOutcome: {
          successProbability: 0.95,
          expectedCaptures: [],
          expectedLosses: { gdp: 0, population: 0, militaryPower: 0 },
          duration: 30,
        },
      };
      if (validate) action.validation = validate(action);
      return action;
    }

    // Build patterns
    if (this.matchesBuild(lower)) {
      const source = this.findSource(lower, regions);
      if (!source) return null;

      const cost: ActionCost = {
        gdp: 40,
        population: 0,
        militaryPower: 0,
      };

      const action: ValidatedAction = {
        type: 'build',
        sourceRegionId: source.id,
        description: `Строительство в ${source.name}`,
        cost,
        expectedOutcome: {
          successProbability: 0.85,
          expectedCaptures: [],
          expectedLosses: { gdp: 0, population: 0, militaryPower: 0 },
          duration: 30,
        },
      };
      if (validate) action.validation = validate(action);
      return action;
    }

    return null;
  }

  private matchesAttack(text: string): boolean {
    const patterns = [
      'attack', 'атака', 'напад', 'война', 'захват',
      'war', 'fight', 'conquer', 'invade'
    ];
    return patterns.some(p => text.includes(p));
  }

  private matchesDevelop(text: string): boolean {
    const patterns = [
      'develop', 'developing', 'развит', 'строит', 'создат',
      'build', 'construct', 'expand', 'grow'
    ];
    return patterns.some(p => text.includes(p));
  }

  private matchesTrade(text: string): boolean {
    const patterns = [
      'trade', 'торгов', 'exchange', 'сделка', 'экономик',
      'economic', 'market'
    ];
    return patterns.some(p => text.includes(p));
  }

  private matchesBuild(text: string): boolean {
    const patterns = [
      'build', 'строит', 'factory', 'завод', 'army', 'войска',
      'military', 'militar', 'fleet', 'флот'
    ];
    return patterns.some(p => text.includes(p));
  }

  private findTarget(
    text: string,
    regions: Map<string, { id: string; name: string; owner: string }>
  ): { id: string; name: string; owner: string } | null {
    // Try to find a region name in the text
    for (const [id, region] of regions) {
      const nameLower = region.name.toLowerCase();
      if (text.includes(nameLower)) {
        return region;
      }
    }

    // Default to first non-player region
    for (const [id, region] of regions) {
      if (!region.owner.includes('player')) {
        return region;
      }
    }

    return null;
  }

  private findSource(
    text: string,
    regions: Map<string, { id: string; name: string; owner: string }>
  ): { id: string; name: string; owner: string } | null {
    // Default to player's first region
    for (const [id, region] of regions) {
      if (region.owner.includes('player')) {
        return region;
      }
    }

    return null;
  }
}
