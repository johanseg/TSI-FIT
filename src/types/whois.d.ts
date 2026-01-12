declare module 'whois' {
  export function lookup(
    domain: string,
    callback: (err: Error | null, data: string) => void
  ): void;

  export function lookup(domain: string, options: any, callback: (err: Error | null, data: string) => void): void;
}
