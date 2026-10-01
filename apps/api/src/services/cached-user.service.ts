import { createCache } from "../cache/createCache";
import { cacheTtl } from "./app-config.service";
import { UserService, UserProfile, GoogleProfile, MicrosoftProfile } from "./user.service";

export class CachedUserService {
  private readonly inner: UserService;
  private readonly profileCache = createCache<UserProfile>("pf:user:profile:", {
    ttlMs: cacheTtl.user,
    max: 1000,
  });

  constructor(inner: UserService) {
    this.inner = inner;
  }

  public async getUserProfile(email: string): Promise<UserProfile | null> {
    const cached = await this.profileCache.get(email);
    if (cached != null) {
      return cached;
    }

    const result = await this.inner.getUserProfile(email);
    if (result !== null) {
      await this.profileCache.set(email, result);
    }
    return result;
  }

  public verifyUser(email: string, password: string) {
    return this.inner.verifyUser(email, password);
  }

  public createUser(email: string, firstName: string, lastName: string, password: string) {
    return this.inner.createUser(email, firstName, lastName, password);
  }

  public async findOrCreateGoogleUser(profile: GoogleProfile) {
    const user = await this.inner.findOrCreateGoogleUser(profile);
    // The cached profile may now be stale (name/link backfill); drop it.
    await this.profileCache.delete(profile.email);
    return user;
  }

  public async findOrCreateMicrosoftUser(profile: MicrosoftProfile) {
    const user = await this.inner.findOrCreateMicrosoftUser(profile);
    // The cached profile may now be stale (name/link backfill); drop it.
    await this.profileCache.delete(profile.email);
    return user;
  }
}
