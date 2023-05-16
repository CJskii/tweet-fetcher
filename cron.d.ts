declare module "cron" {
  export class CronJob {
    constructor(
      cronTime: string,
      onTick: () => void,
      onComplete?: () => void,
      start?: boolean,
      timeZone?: string,
      context?: any,
      runOnInit?: boolean,
      utcOffset?: string,
      unrefTimeout?: boolean
    );
    start(): this;
    stop(): void;
    setTime(time: Date): void;
    lastDate(): Date | null;
    nextDates(count: number): Date[];
    fireOnTick(): void;
    addCallback(callback: () => void): void;
  }
}
