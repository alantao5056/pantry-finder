import { LRUCache } from "lru-cache";
import { UserService, UserProfile } from "./user.service";

export class CachedUserService {
  private readonly inner: UserService;
  private readonly profileCache: LRUCache<string, UserProfile>;
  private readonly ttlMs: number = 60 * 60 * 1000; // 1 hour
  private readonly maxSize: number = 1000;

  constructor(inner: UserService) {
    this.inner = inner;

    this.profileCache = new LRUCache<string, UserProfile>({
      max: this.maxSize,
      ttl: this.ttlMs,
    });
  }

  public async getUserProfile(email: string): Promise<UserProfile | null> {
    const cached = this.profileCache.get(email);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.inner.getUserProfile(email);
    if (result !== null) {
      this.profileCache.set(email, result);
    }
    return result;
  }

  public verifyUser(email: string, password: string) {
    return this.inner.verifyUser(email, password);
  }

  public createUser(email: string, firstName: string, lastName: string, password: string) {
    return this.inner.createUser(email, firstName, lastName, password);
  }
}
