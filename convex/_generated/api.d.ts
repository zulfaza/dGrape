/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applicationAgent from "../applicationAgent.js";
import type * as applications from "../applications.js";
import type * as companies from "../companies.js";
import type * as memory from "../memory.js";
import type * as lib_applicationAgentDomain from "../lib/applicationAgentDomain.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_profileDomain from "../lib/profileDomain.js";
import type * as lib_services from "../lib/services.js";
import type * as lib_workflowDomain from "../lib/workflowDomain.js";
import type * as profile from "../profile.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applicationAgent: typeof applicationAgent;
  applications: typeof applications;
  companies: typeof companies;
  memory: typeof memory;
  "lib/applicationAgentDomain": typeof lib_applicationAgentDomain;
  "lib/auth": typeof lib_auth;
  "lib/domain": typeof lib_domain;
  "lib/profileDomain": typeof lib_profileDomain;
  "lib/services": typeof lib_services;
  "lib/workflowDomain": typeof lib_workflowDomain;
  profile: typeof profile;
  workflow: typeof workflow;
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
