/**
 * Open-Pax — Simulation Engine
 * ==============================
 * Deterministic game simulation - NO LLM CALLS.
 *
 * This engine calculates all game mechanics:
 * - Combat outcomes
 * - Economic growth
 * - Population changes
 * - Action validation
 *
 * LLM is only used for NARRATION after simulation.
 */

import type {
  RegionState,
  ValidatedAction,
  SimulationDelta,
  DeterministicEvent,
  ActionCost,
  ActionOutcome,
  SimulationConfig,
} from './types';

export class SimulationEngine {
  private regions: Map<string, RegionState>;
  private config: SimulationConfig;

  // Default config
  private static DEFAULT_CONFIG: SimulationConfig = {
    aggressionMultiplier: 0.5,
    baseGrowthRate: 0.001,      // 0.1% per month
    warGdpCost: 10,             // GDP per day of war
    warPopulationCost: 1000,    // People per day of war
    defenderAdvantage: 1.2,      // 20% bonus for defender
    terrainPenalty: 0.8,       // 20% penalty for attacking across borders
  };

  constructor(regions: Map<string, RegionState>, config?: Partial<SimulationConfig>) {
    this.regions = new Map(regions);
    this.config = { ...SimulationEngine.DEFAULT_CONFIG, ...config };
  }

  /**
   * Apply a validated action and calculate consequences
   */
  applyAction(action: ValidatedAction, jumpDays: number): SimulationDelta {
    const delta: SimulationDelta = {
      regionChanges: [],
      gdpChanges: {},
      populationChanges: {},
      militaryChanges: {},
      newObjects: [],
      events: [],
      narrativeFacts: [],
    };

    switch (action.type) {
      case 'attack':
        this.resolveAttack(action, jumpDays, delta);
        break;
      case 'develop':
        this.applyDevelopment(action, jumpDays, delta);
        break;
      case 'trade':
        this.applyTrade(action, jumpDays, delta);
        break;
      case 'build':
        this.applyBuild(action, jumpDays, delta);
        break;
    }

    // Apply natural growth/decline
    this.applyNaturalChanges(jumpDays, delta);

    return delta;
  }

  /**
   * Resolve combat between two regions
   */
  private resolveAttack(
    action: ValidatedAction,
    jumpDays: number,
    delta: SimulationDelta
  ): void {
    const source = this.regions.get(action.sourceRegionId);
    const target = this.regions.get(action.targetRegionId!);

    if (!source || !target) return;

    const sourcePower = source.militaryPower * (action.cost.militaryPower / 100);
    const targetPower = target.militaryPower * this.config.defenderAdvantage;

    // Calculate outcome
    const powerRatio = sourcePower / Math.max(targetPower, 1);
    const successChance = Math.min(0.95, Math.max(0.05, powerRatio * 0.6 + 0.2));

    // Roll for success
    const roll = Math.random();
    const success = roll < successChance && action.expectedOutcome.successProbability > 0.3;

    // Calculate losses
    const sourceLosses = Math.floor(
      (targetPower * 0.1 * jumpDays / 30) * (success ? 0.3 : 0.8)
    );
    const targetLosses = Math.floor(
      (sourcePower * 0.15 * jumpDays / 30) * (success ? 0.5 : 1.2)
    );

    // Apply losses
    delta.militaryChanges[source.id] = -(sourceLosses);
    delta.militaryChanges[target.id] = -(targetLosses);
    delta.populationChanges[source.id] = -(sourceLosses * 10);
    delta.populationChanges[target.id] = -(targetLosses * 10);
    delta.gdpChanges[source.id] = -(this.config.warGdpCost * jumpDays);
    delta.gdpChanges[target.id] = -(this.config.warGdpCost * jumpDays * 0.5);

    if (success) {
      // Transfer ownership
      delta.regionChanges.push({
        regionId: target.id,
        newOwner: source.owner,
        newColor: source.color,
      });

      delta.events.push({
        type: 'battle',
        headline: `${source.name} захватил(а) ${target.name}`,
        involvedRegions: [source.id, target.id],
        outcome: `Победа: потери ${sourceLosses}VS${targetLosses}`,
      });

      delta.narrativeFacts.push(
        `BATTLE:${source.owner} attacked ${target.owner}, victory. Losses: ${sourceLosses}/${targetLosses}.`
      );
    } else {
      delta.events.push({
        type: 'battle',
        headline: `Атака на ${target.name} отражена`,
        involvedRegions: [source.id, target.id],
        outcome: `Неудача: потери ${sourceLosses}VS${targetLosses}`,
      });

      delta.narrativeFacts.push(
        `BATTLE:${source.owner} attacked ${target.owner}, repelled. Losses: ${sourceLosses}/${targetLosses}.`
      );
    }
  }

  /**
   * Apply development action (build factories, etc)
   */
  private applyDevelopment(
    action: ValidatedAction,
    jumpDays: number,
    delta: SimulationDelta
  ): void {
    const region = this.regions.get(action.sourceRegionId);
    if (!region) return;

    // Development costs GDP but increases production
    const developmentCost = action.cost.gdp;
    const growthBonus = (developmentCost / 100) * (jumpDays / 30);

    delta.gdpChanges[region.id] = -developmentCost;
    delta.gdpChanges[region.id] += Math.floor(region.gdp * growthBonus);

    delta.events.push({
      type: 'economy',
      headline: `Развитие в ${region.name}`,
      involvedRegions: [region.id],
      outcome: `+${Math.floor(growthBonus * 100)}% ВВП`,
    });

    delta.narrativeFacts.push(
      `DEVELOP:${region.owner} invested in ${region.name}, GDP +${Math.floor(growthBonus * 100)}%.`
    );
  }

  /**
   * Apply trade between regions
   */
  private applyTrade(
    action: ValidatedAction,
    jumpDays: number,
    delta: SimulationDelta
  ): void {
    const source = this.regions.get(action.sourceRegionId);
    if (!source) return;

    // Trade generates GDP based on region population
    const tradeIncome = Math.floor(
      source.population / 1_000_000 * 5 * (jumpDays / 30)
    );

    delta.gdpChanges[source.id] = tradeIncome;

    delta.events.push({
      type: 'economy',
      headline: `Торговля в ${source.name}`,
      involvedRegions: [source.id],
      outcome: `+${tradeIncome} ВВП`,
    });

    delta.narrativeFacts.push(
      `TRADE:${source.owner} conducted trade in ${source.name}, GDP +${tradeIncome}.`
    );
  }

  /**
   * Apply build action (create military units, buildings)
   */
  private applyBuild(
    action: ValidatedAction,
    jumpDays: number,
    delta: SimulationDelta
  ): void {
    const region = this.regions.get(action.sourceRegionId);
    if (!region) return;

    const buildCost = action.cost.gdp;
    const months = jumpDays / 30;

    delta.gdpChanges[region.id] = -buildCost;
    delta.militaryChanges[region.id] = Math.floor(buildCost * months * 0.5);

    delta.events.push({
      type: 'economy',
      headline: `Строительство в ${region.name}`,
      involvedRegions: [region.id],
      outcome: `+${Math.floor(buildCost * months * 0.5)} мощи`,
    });

    delta.narrativeFacts.push(
      `BUILD:${region.owner} constructed in ${region.name}, military +${Math.floor(buildCost * months * 0.5)}.`
    );
  }

  /**
   * Apply natural growth and decline over time
   */
  private applyNaturalChanges(jumpDays: number, delta: SimulationDelta): void {
    const months = jumpDays / 30;
    const growthRate = this.config.baseGrowthRate * months;

    for (const [regionId, region] of this.regions) {
      // Population natural growth (0.1% per month)
      const popGrowth = Math.floor(region.population * growthRate);
      delta.populationChanges[regionId] =
        (delta.populationChanges[regionId] || 0) + popGrowth;

      // GDP natural growth
      const gdpGrowth = Math.floor(region.gdp * growthRate * 0.5);
      delta.gdpChanges[regionId] =
        (delta.gdpChanges[regionId] || 0) + gdpGrowth;
    }
  }

  /**
   * Validate if an action can be performed
   */
  validateAction(
    action: ValidatedAction,
    playerId: string
  ): { valid: boolean; reason?: string } {
    const source = this.regions.get(action.sourceRegionId);
    if (!source) {
      return { valid: false, reason: 'Source region not found' };
    }

    // Check ownership
    if (!source.owner.includes(playerId) && !source.owner.startsWith('ai-')) {
      return { valid: false, reason: 'You do not own this region' };
    }

    // Check economic cost
    if (action.cost.gdp > source.gdp) {
      return { valid: false, reason: 'Not enough GDP' };
    }

    if (action.cost.militaryPower > source.militaryPower) {
      return { valid: false, reason: 'Not enough military power' };
    }

    // For attack actions, check borders
    if (action.type === 'attack' && action.targetRegionId) {
      const target = this.regions.get(action.targetRegionId);
      if (!target) {
        return { valid: false, reason: 'Target region not found' };
      }

      // Check if adjacent (simplified - should check actual borders)
      const isAdjacent =
        source.borders.includes(target.id) ||
        target.borders.includes(source.id);
      const isSameOwner = source.owner === target.owner;

      if (!isAdjacent && !isSameOwner) {
        return { valid: false, reason: 'Target not adjacent' };
      }
    }

    return { valid: true };
  }

  /**
   * Calculate expected outcome for an action (for UI preview)
   */
  calculateExpectedOutcome(action: ValidatedAction): ActionOutcome {
    if (action.type === 'attack' && action.targetRegionId) {
      const source = this.regions.get(action.sourceRegionId);
      const target = this.regions.get(action.targetRegionId);

      if (source && target) {
        const sourcePower = source.militaryPower * (action.cost.militaryPower / 100);
        const targetPower = target.militaryPower * this.config.defenderAdvantage;
        const powerRatio = sourcePower / Math.max(targetPower, 1);
        const successProbability = Math.min(0.95, Math.max(0.05, powerRatio * 0.6 + 0.2));

        const expectedLosses: ActionCost = {
          gdp: Math.floor(this.config.warGdpCost * 30),
          population: Math.floor(source.population * 0.01),
          militaryPower: Math.floor(sourcePower * 0.1),
        };

        return {
          successProbability,
          expectedCaptures: successProbability > 0.5 ? [target.id] : [],
          expectedLosses,
          duration: 30,
        };
      }
    }

    // Default outcome for non-attack actions
    return {
      successProbability: 0.9,
      expectedCaptures: [],
      expectedLosses: { gdp: 0, population: 0, militaryPower: 0 },
      duration: 30,
    };
  }

  /**
   * Process NPC decisions (simplified AI)
   */
  processNPCTurn(npcId: string, jumpDays: number): SimulationDelta {
    const delta: SimulationDelta = {
      regionChanges: [],
      gdpChanges: {},
      populationChanges: {},
      militaryChanges: {},
      newObjects: [],
      events: [],
      narrativeFacts: [],
    };

    // Find all regions owned by this NPC
    const npcRegions: RegionState[] = [];
    for (const region of this.regions.values()) {
      if (region.owner === npcId) {
        npcRegions.push(region);
      }
    }

    if (npcRegions.length === 0) return delta;

    // Calculate NPC's total power
    const totalPower = npcRegions.reduce(
      (sum, r) => sum + r.militaryPower,
      0
    );
    const avgGdp = npcRegions.reduce((sum, r) => sum + r.gdp, 0) / npcRegions.length;

    // Simple AI: develop economy if peaceful, build military if strong
    if (Math.random() < 0.3 && avgGdp > 50) {
      // Trade
      const source = npcRegions[Math.floor(Math.random() * npcRegions.length)];
      const tradeIncome = Math.floor(
        source.population / 1_000_000 * 5 * (jumpDays / 30)
      );
      delta.gdpChanges[source.id] = tradeIncome;
      delta.narrativeFacts.push(
        `TRADE:${npcId} conducted trade in ${source.name}, GDP +${tradeIncome}.`
      );
    }

    // Military buildup
    if (Math.random() < 0.2 * this.config.aggressionMultiplier) {
      const source = npcRegions[Math.floor(Math.random() * npcRegions.length)];
      const buildAmount = Math.floor(source.gdp * 0.1);
      delta.militaryChanges[source.id] = Math.floor(buildAmount * 0.5);
      delta.gdpChanges[source.id] = -buildAmount;
      delta.narrativeFacts.push(
        `BUILD:${npcId} built military in ${source.name}, +${Math.floor(buildAmount * 0.5)} power.`
      );
    }

    return delta;
  }

  /**
   * Get the current state of all regions
   */
  getRegions(): Map<string, RegionState> {
    return new Map(this.regions);
  }

  /**
   * Apply a delta to the regions (after simulation)
   */
  applyDelta(delta: SimulationDelta): void {
    for (const change of delta.regionChanges) {
      const region = this.regions.get(change.regionId);
      if (region) {
        if (change.newOwner) region.owner = change.newOwner;
        if (change.newColor) region.color = change.newColor;
        if (change.status) region.status = change.status;
      }
    }

    for (const [regionId, change] of Object.entries(delta.gdpChanges)) {
      const region = this.regions.get(regionId);
      if (region) {
        region.gdp = Math.max(1, region.gdp + change);
      }
    }

    for (const [regionId, change] of Object.entries(delta.populationChanges)) {
      const region = this.regions.get(regionId);
      if (region) {
        region.population = Math.max(1000, region.population + change);
      }
    }

    for (const [regionId, change] of Object.entries(delta.militaryChanges)) {
      const region = this.regions.get(regionId);
      if (region) {
        region.militaryPower = Math.max(0, region.militaryPower + change);
      }
    }

    // Add new objects
    for (const obj of delta.newObjects) {
      const region = this.regions.get(obj.owner || '');
      if (region) {
        region.objects.push(obj);
      }
    }
  }
}
