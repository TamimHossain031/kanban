import { Injectable } from '@nestjs/common';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * The single tested implementation of fractional (lexicographic) ordering,
 * shared by tasks and columns. The server owns all position generation — the
 * client only ever sends an integer index.
 *
 * Why fractional indexing (vs. dense/sparse integers):
 *   - dense integers rewrite every row after the insert point → O(n) writes
 *   - sparse integers run out of gaps and need periodic rebalancing
 *   - fractional keys touch exactly ONE row per move, forever
 *
 * See docs/architecture.md for the full rationale.
 */
@Injectable()
export class OrderingService {
  /**
   * Generate a key strictly between two neighbours. `null` on either side
   * means "the edge" (start or end of the list).
   */
  keyBetween(prev: string | null, next: string | null): string {
    return generateKeyBetween(prev, next);
  }

  /**
   * The key to append an item to the end of a list whose current last
   * position is `lastPosition` (or `null`/empty for an empty list).
   */
  keyForAppend(lastPosition: string | null): string {
    return generateKeyBetween(lastPosition, null);
  }

  /**
   * The key to prepend to the front of a list whose current first position is
   * `firstPosition`.
   */
  keyForPrepend(firstPosition: string | null): string {
    return generateKeyBetween(null, firstPosition);
  }

  /**
   * Resolve a target integer index against an ordered list of existing
   * sibling positions (which must NOT include the item being moved) into a
   * fresh fractional key. The index is clamped to [0, siblings.length] so a
   * hostile or stale index lands at an edge instead of crashing.
   */
  keyForIndex(siblingPositions: string[], targetIndex: number): string {
    const clamped = Math.min(Math.max(targetIndex, 0), siblingPositions.length);
    const prev = siblingPositions[clamped - 1] ?? null;
    const next = siblingPositions[clamped] ?? null;
    return generateKeyBetween(prev, next);
  }

  /**
   * Generate `n` evenly spaced keys between two bounds. Used by the seed
   * script and any future rebalance job.
   */
  keysBetween(prev: string | null, next: string | null, n: number): string[] {
    return generateNKeysBetween(prev, next, n);
  }
}
