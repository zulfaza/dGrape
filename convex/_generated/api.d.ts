/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentAccess from "../agentAccess.js";
import type * as agentGrants from "../agentGrants.js";
import type * as agentWrites from "../agentWrites.js";
import type * as http from "../http.js";
import type * as lib_agentGrant from "../lib/agentGrant.js";
import type * as lib_agentRequests from "../lib/agentRequests.js";
import type * as lib_agentScope from "../lib/agentScope.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collectionDomain from "../lib/collectionDomain.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentAccess: typeof agentAccess;
  agentGrants: typeof agentGrants;
  agentWrites: typeof agentWrites;
  http: typeof http;
  "lib/agentGrant": typeof lib_agentGrant;
  "lib/agentRequests": typeof lib_agentRequests;
  "lib/agentScope": typeof lib_agentScope;
  "lib/auth": typeof lib_auth;
  "lib/collectionDomain": typeof lib_collectionDomain;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
