import { OrderingService } from './ordering.service';

/**
 * Covers the ordering edge cases called out in the build plan:
 * first, middle, end, empty column, single task, and monotonicity.
 */
describe('OrderingService', () => {
  let ordering: OrderingService;

  beforeEach(() => {
    ordering = new OrderingService();
  });

  const asc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  it('produces a first key for an empty list', () => {
    const key = ordering.keyForAppend(null);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('appends after the last position', () => {
    const first = ordering.keyForAppend(null);
    const second = ordering.keyForAppend(first);
    expect(second > first).toBe(true);
  });

  it('prepends before the first position', () => {
    const first = ordering.keyForAppend(null);
    const before = ordering.keyForPrepend(first);
    expect(before < first).toBe(true);
  });

  it('squeezes a key strictly between two neighbours', () => {
    const a = ordering.keyForAppend(null);
    const b = ordering.keyForAppend(a);
    const mid = ordering.keyBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
  });

  describe('keyForIndex', () => {
    // Build a stable 4-item list of positions.
    let positions: string[];
    beforeEach(() => {
      positions = [];
      let last: string | null = null;
      for (let i = 0; i < 4; i++) {
        last = ordering.keyForAppend(last);
        positions.push(last);
      }
    });

    it('inserts at the front (index 0)', () => {
      const key = ordering.keyForIndex(positions, 0);
      expect(key < positions[0]).toBe(true);
    });

    it('inserts in the middle (index 2)', () => {
      const key = ordering.keyForIndex(positions, 2);
      expect(key > positions[1]).toBe(true);
      expect(key < positions[2]).toBe(true);
    });

    it('inserts at the end (index === length)', () => {
      const key = ordering.keyForIndex(positions, positions.length);
      expect(key > positions[positions.length - 1]).toBe(true);
    });

    it('clamps a negative index to the front', () => {
      const key = ordering.keyForIndex(positions, -5);
      expect(key < positions[0]).toBe(true);
    });

    it('clamps an out-of-range index to the end', () => {
      const key = ordering.keyForIndex(positions, 9999);
      expect(key > positions[positions.length - 1]).toBe(true);
    });

    it('handles an empty sibling list (single task in a column)', () => {
      const key = ordering.keyForIndex([], 0);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  it('keeps 50 repeated middle-inserts strictly ordered and unique', () => {
    // Simulate always dropping into the same gap — the pathological case.
    let a = ordering.keyForAppend(null);
    let b = ordering.keyForAppend(a);
    const seen = new Set<string>([a, b]);
    for (let i = 0; i < 50; i++) {
      const mid = ordering.keyBetween(a, b);
      expect(mid > a).toBe(true);
      expect(mid < b).toBe(true);
      expect(seen.has(mid)).toBe(false);
      seen.add(mid);
      b = mid; // keep squeezing into the left half
    }
  });

  it('generates n evenly ordered keys for seeding', () => {
    const keys = ordering.keysBetween(null, null, 8);
    expect(keys).toHaveLength(8);
    const sorted = [...keys].sort(asc);
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(8);
  });
});
