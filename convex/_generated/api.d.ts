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
import type * as agentIdentityHttp from "../agentIdentityHttp.js";
import type * as agentRegistrations from "../agentRegistrations.js";
import type * as agentWrites from "../agentWrites.js";
import type * as http from "../http.js";
import type * as lib_agentAuthConfig from "../lib/agentAuthConfig.js";
import type * as lib_agentAuthCrypto from "../lib/agentAuthCrypto.js";
import type * as lib_agentAuthDiscovery from "../lib/agentAuthDiscovery.js";
import type * as lib_agentGrant from "../lib/agentGrant.js";
import type * as lib_agentRegistration from "../lib/agentRegistration.js";
import type * as lib_agentRequests from "../lib/agentRequests.js";
import type * as lib_agentScope from "../lib/agentScope.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collectionDomain from "../lib/collectionDomain.js";
import type * as lib_identityAssertion from "../lib/identityAssertion.js";
import type * as lib_recordQuery from "../lib/recordQuery.js";
import type * as lib_records from "../lib/records.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentAccess: typeof agentAccess;
  agentGrants: typeof agentGrants;
  agentIdentityHttp: typeof agentIdentityHttp;
  agentRegistrations: typeof agentRegistrations;
  agentWrites: typeof agentWrites;
  http: typeof http;
  "lib/agentAuthConfig": typeof lib_agentAuthConfig;
  "lib/agentAuthCrypto": typeof lib_agentAuthCrypto;
  "lib/agentAuthDiscovery": typeof lib_agentAuthDiscovery;
  "lib/agentGrant": typeof lib_agentGrant;
  "lib/agentRegistration": typeof lib_agentRegistration;
  "lib/agentRequests": typeof lib_agentRequests;
  "lib/agentScope": typeof lib_agentScope;
  "lib/auth": typeof lib_auth;
  "lib/collectionDomain": typeof lib_collectionDomain;
  "lib/identityAssertion": typeof lib_identityAssertion;
  "lib/recordQuery": typeof lib_recordQuery;
  "lib/records": typeof lib_records;
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
