type AuthContext = {
  auth: {
    getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>;
  };
};

export async function requireUserId(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.tokenIdentifier;
}
