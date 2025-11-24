export class Random {
    public readonly seed: number;
    private current: number;

    constructor(seed: number) {
        this.seed = seed;
        this.current = seed % 4294967296;
    }

    // Linear Congruential Generator (LCG)
    // Parameters from Numerical Recipes
    public next(): number {
        this.current = (this.current * 1664525 + 1013904223) % 4294967296;
        return this.current / 4294967296;
    }

    public range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
}
