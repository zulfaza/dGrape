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
import type * as artifacts from "../artifacts.js";
import type * as http from "../http.js";
import type * as lib_agentAuthConfig from "../lib/agentAuthConfig.js";
import type * as lib_agentAuthCrypto from "../lib/agentAuthCrypto.js";
import type * as lib_agentAuthDiscovery from "../lib/agentAuthDiscovery.js";
import type * as lib_agentGrant from "../lib/agentGrant.js";
import type * as lib_agentRegistration from "../lib/agentRegistration.js";
import type * as lib_agentRequests from "../lib/agentRequests.js";
import type * as lib_agentScope from "../lib/agentScope.js";
import type * as lib_artifactDomain from "../lib/artifactDomain.js";
import type * as lib_artifactPreview from "../lib/artifactPreview.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collectionDomain from "../lib/collectionDomain.js";
import type * as lib_identityAssertion from "../lib/identityAssertion.js";
import type * as lib_pageDomain from "../lib/pageDomain.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_recipeDomain from "../lib/recipeDomain.js";
import type * as lib_recipeSchedule from "../lib/recipeSchedule.js";
import type * as lib_recipeState from "../lib/recipeState.js";
import type * as lib_recordPublication from "../lib/recordPublication.js";
import type * as lib_recordQuery from "../lib/recordQuery.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_savedQueries from "../lib/savedQueries.js";
import type * as pages from "../pages.js";
import type * as recipes from "../recipes.js";
import type * as savedQueries from "../savedQueries.js";
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
  artifacts: typeof artifacts;
  http: typeof http;
  "lib/agentAuthConfig": typeof lib_agentAuthConfig;
  "lib/agentAuthCrypto": typeof lib_agentAuthCrypto;
  "lib/agentAuthDiscovery": typeof lib_agentAuthDiscovery;
  "lib/agentGrant": typeof lib_agentGrant;
  "lib/agentRegistration": typeof lib_agentRegistration;
  "lib/agentRequests": typeof lib_agentRequests;
  "lib/agentScope": typeof lib_agentScope;
  "lib/artifactDomain": typeof lib_artifactDomain;
  "lib/artifactPreview": typeof lib_artifactPreview;
  "lib/auth": typeof lib_auth;
  "lib/collectionDomain": typeof lib_collectionDomain;
  "lib/identityAssertion": typeof lib_identityAssertion;
  "lib/pageDomain": typeof lib_pageDomain;
  "lib/r2": typeof lib_r2;
  "lib/recipeDomain": typeof lib_recipeDomain;
  "lib/recipeSchedule": typeof lib_recipeSchedule;
  "lib/recipeState": typeof lib_recipeState;
  "lib/recordPublication": typeof lib_recordPublication;
  "lib/recordQuery": typeof lib_recordQuery;
  "lib/records": typeof lib_records;
  "lib/savedQueries": typeof lib_savedQueries;
  pages: typeof pages;
  recipes: typeof recipes;
  savedQueries: typeof savedQueries;
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

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
