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
  RelationshipChange,
} from './types';
import type { RelationshipMatrix } from '../RelationshipMatrix';

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
   * Sync regions state from GameSession after each turn.
   * This ensures NPC decisions are based on current (not initial) region stats.
   */
  syncRegions(regions: Map<string, RegionState>): void {
    this.regions = new Map(regions);
  }

  /**
   * Apply a validated action and calculate consequences
   */
  applyAction(action: ValidatedAction, jumpDays: number, relationships?: RelationshipMatrix): SimulationDelta {
    const delta: SimulationDelta = {
      regionChanges: [],
      gdpChanges: {},
      populationChanges: {},
      militaryChanges: {},
      newObjects: [],
      events: [],
      narrativeFacts: [],
      relationshipChanges: [],
    };

    switch (action.type) {
      case 'attack':
        this.resolveAttack(action, jumpDays, delta, relationships);
        break;
      case 'develop':
        this.applyDevelopment(action, jumpDays, delta);
        break;
      case 'trade':
        this.applyTrade(action, jumpDays, delta, relationships);
        break;
      case 'build':
        this.applyBuild(action, jumpDays, delta);
        break;
    }

    return delta;
  }

  /**
   * Apply natural growth/decline once per turn.
   * Called from GameSession.applyTurn() after all actions are processed.
   */
  applyTurnNaturalChanges(jumpDays: number): SimulationDelta {
    const delta: SimulationDelta = {
      regionChanges: [],
      gdpChanges: {},
      populationChanges: {},
      militaryChanges: {},
      newObjects: [],
      events: [],
      narrativeFacts: [],
      relationshipChanges: [],
    };

    this.applyNaturalChanges(jumpDays, delta);
    return delta;
  }

  /**
   * Resolve combat between two regions
   */
  private resolveAttack(
    action: ValidatedAction,
    jumpDays: number,
    delta: SimulationDelta,
    relationships?: RelationshipMatrix
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

    // Relationship degradation: attack worsens relations
    if (relationships && source.owner !== target.owner) {
      const prevRel = relationships.get(source.owner, target.owner);
      relationships.degrade(source.owner, target.owner);
      const nextRel = relationships.get(source.owner, target.owner);
      if (nextRel !== prevRel) {
        delta.relationshipChanges!.push({
          from: source.owner,
          to: target.owner,
          newRelationship: nextRel,
          reason: `Attack on ${target.name}`,
        });
      }
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
    delta: SimulationDelta,
    relationships?: RelationshipMatrix
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

    // Trading with another country improves relationships
    if (relationships && action.targetRegionId) {
      const target = this.regions.get(action.targetRegionId);
      if (target && target.owner !== source.owner && !target.owner.startsWith('player')) {
        const prevRel = relationships.get(source.owner, target.owner);
        relationships.improve(source.owner, target.owner);
        const nextRel = relationships.get(source.owner, target.owner);
        if (nextRel !== prevRel) {
          delta.relationshipChanges!.push({
            from: source.owner,
            to: target.owner,
            newRelationship: nextRel,
            reason: `Trade with ${target.name}`,
          });
        }
      }
    }
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
   * @param playerId - player's region ID (not used anymore, kept for API compatibility)
   */
  validateAction(
    action: ValidatedAction,
    _playerId: string
  ): { valid: boolean; reason?: string } {
    const source = this.regions.get(action.sourceRegionId);
    if (!source) {
      return { valid: false, reason: 'Source region not found' };
    }

    // Check ownership - player owns regions with owner='player', NPCs own 'ai-*'
    if (source.owner !== 'player' && !source.owner.startsWith('ai-')) {
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
  processNPCTurn(npcId: string, jumpDays: number, relationships?: RelationshipMatrix): SimulationDelta {
    const delta: SimulationDelta = {
      regionChanges: [],
      gdpChanges: {},
      populationChanges: {},
      militaryChanges: {},
      newObjects: [],
      events: [],
      narrativeFacts: [],
      relationshipChanges: [],
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

    // Find potential targets: adjacent regions owned by other countries
    const potentialTargets: RegionState[] = [];
    for (const region of this.regions.values()) {
      if (region.owner === npcId) continue;
      if (region.owner === 'neutral') continue;

      // Check if any NPC region borders this one
      for (const npcRegion of npcRegions) {
        if (npcRegion.borders.includes(region.id) || region.borders.includes(npcRegion.id)) {
          // Skip allies
          if (relationships && relationships.get(npcId, region.owner) === 'ally') continue;
          potentialTargets.push(region);
          break;
        }
      }
    }

    // Attack hostile neighbors first, then neutral if aggressive
    const hostileTargets = potentialTargets.filter(
      r => relationships && relationships.get(npcId, r.owner) === 'hostile'
    );
    const attackPool = hostileTargets.length > 0 ? hostileTargets : potentialTargets;

    // NPC attacks if aggressive and has a target
    if (
      attackPool.length > 0 &&
      Math.random() < 0.25 * this.config.aggressionMultiplier &&
      totalPower > 150
    ) {
      const target = attackPool[Math.floor(Math.random() * attackPool.length)];
      const source = npcRegions.find(r => r.borders.includes(target.id) || target.borders.includes(r.id)) || npcRegions[0];

      const sourcePower = source.militaryPower;
      const targetPower = target.militaryPower * this.config.defenderAdvantage;
      const powerRatio = sourcePower / Math.max(targetPower, 1);
      const successChance = Math.min(0.85, Math.max(0.15, powerRatio * 0.5 + 0.2));

      const roll = Math.random();
      const success = roll < successChance;

      const sourceLosses = Math.floor(targetPower * 0.08 * jumpDays / 30 * (success ? 0.4 : 0.9));
      const targetLosses = Math.floor(sourcePower * 0.1 * jumpDays / 30 * (success ? 0.6 : 1.3));

      delta.militaryChanges[source.id] = -(sourceLosses);
      delta.militaryChanges[target.id] = -(targetLosses);
      delta.populationChanges[source.id] = -(sourceLosses * 10);
      delta.populationChanges[target.id] = -(targetLosses * 10);
      delta.gdpChanges[source.id] = -(this.config.warGdpCost * jumpDays * 0.5);
      delta.gdpChanges[target.id] = -(this.config.warGdpCost * jumpDays * 0.3);

      if (success) {
        delta.regionChanges.push({
          regionId: target.id,
          newOwner: npcId,
          newColor: source.color,
        });
        delta.events.push({
          type: 'battle',
          headline: `${source.name} захватил(а) ${target.name}`,
          involvedRegions: [source.id, target.id],
          outcome: `Победа: потери ${sourceLosses}VS${targetLosses}`,
        });
        delta.narrativeFacts.push(
          `BATTLE:${npcId} captured ${target.name} from ${target.owner}.`
        );
      } else {
        delta.events.push({
          type: 'battle',
          headline: `Атака на ${target.name} отражена`,
          involvedRegions: [source.id, target.id],
          outcome: `Неудача: потери ${sourceLosses}VS${targetLosses}`,
        });
        delta.narrativeFacts.push(
          `BATTLE:${npcId} attacked ${target.name}, repelled.`
        );
      }

      // Relationship degradation
      if (relationships) {
        const prevRel = relationships.get(npcId, target.owner);
        relationships.degrade(npcId, target.owner);
        const nextRel = relationships.get(npcId, target.owner);
        if (nextRel !== prevRel) {
          delta.relationshipChanges!.push({
            from: npcId,
            to: target.owner,
            newRelationship: nextRel,
            reason: `Attack on ${target.name}`,
          });
        }
      }
    }

    // Trade (only if not attacking)
    if (
      Math.random() < 0.3 &&
      avgGdp > 50 &&
      delta.regionChanges.length === 0
    ) {
      const source = npcRegions[Math.floor(Math.random() * npcRegions.length)];
      const tradeIncome = Math.floor(
        source.population / 1_000_000 * 5 * (jumpDays / 30)
      );
      delta.gdpChanges[source.id] = (delta.gdpChanges[source.id] || 0) + tradeIncome;
      delta.narrativeFacts.push(
        `TRADE:${npcId} conducted trade in ${source.name}, GDP +${tradeIncome}.`
      );
    }

    // Military buildup
    if (Math.random() < 0.2 * this.config.aggressionMultiplier) {
      const source = npcRegions[Math.floor(Math.random() * npcRegions.length)];
      const buildAmount = Math.floor(source.gdp * 0.1);
      delta.militaryChanges[source.id] = (delta.militaryChanges[source.id] || 0) + Math.floor(buildAmount * 0.5);
      delta.gdpChanges[source.id] = (delta.gdpChanges[source.id] || 0) - buildAmount;
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
