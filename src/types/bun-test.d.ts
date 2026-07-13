declare module "bun:test" {
  export function describe(name: string, run: () => void): void;
  export function test(name: string, run: () => void | Promise<void>): void;

  export type Matchers<T> = {
    toBe(expected: T): void;
    toBeNull(): void;
  };

  export function expect<T>(actual: T): Matchers<T>;
}
