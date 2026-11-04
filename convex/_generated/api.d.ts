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
import type * as agentActivity from "../agentActivity.js";
import type * as agentDiscoveryHttp from "../agentDiscoveryHttp.js";
import type * as agentGrants from "../agentGrants.js";
import type * as agentIdentityHttp from "../agentIdentityHttp.js";
import type * as agentPages from "../agentPages.js";
import type * as agentQueries from "../agentQueries.js";
import type * as agentRecipeHttp from "../agentRecipeHttp.js";
import type * as agentRecipes from "../agentRecipes.js";
import type * as agentRegistrations from "../agentRegistrations.js";
import type * as agentWrites from "../agentWrites.js";
import type * as artifactBindings from "../artifactBindings.js";
import type * as artifactUsage from "../artifactUsage.js";
import type * as artifacts from "../artifacts.js";
import type * as auditEvents from "../auditEvents.js";
import type * as collectionSchemas from "../collectionSchemas.js";
import type * as connectors from "../connectors.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_agentActivityTransport from "../lib/agentActivityTransport.js";
import type * as lib_agentAuthConfig from "../lib/agentAuthConfig.js";
import type * as lib_agentAuthCrypto from "../lib/agentAuthCrypto.js";
import type * as lib_agentAuthDiscovery from "../lib/agentAuthDiscovery.js";
import type * as lib_agentCapabilities from "../lib/agentCapabilities.js";
import type * as lib_agentCollectionTransport from "../lib/agentCollectionTransport.js";
import type * as lib_agentGrant from "../lib/agentGrant.js";
import type * as lib_agentPageTransport from "../lib/agentPageTransport.js";
import type * as lib_agentQueryTransport from "../lib/agentQueryTransport.js";
import type * as lib_agentRecipeTransport from "../lib/agentRecipeTransport.js";
import type * as lib_agentRegistration from "../lib/agentRegistration.js";
import type * as lib_agentRequests from "../lib/agentRequests.js";
import type * as lib_agentRoute from "../lib/agentRoute.js";
import type * as lib_agentScope from "../lib/agentScope.js";
import type * as lib_artifactBindingDomain from "../lib/artifactBindingDomain.js";
import type * as lib_artifactDomain from "../lib/artifactDomain.js";
import type * as lib_artifactPreview from "../lib/artifactPreview.js";
import type * as lib_artifactUsage from "../lib/artifactUsage.js";
import type * as lib_auditEvents from "../lib/auditEvents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_budgets from "../lib/budgets.js";
import type * as lib_collectionDomain from "../lib/collectionDomain.js";
import type * as lib_collectionSchemas from "../lib/collectionSchemas.js";
import type * as lib_collectionTemplates from "../lib/collectionTemplates.js";
import type * as lib_connectorFetch from "../lib/connectorFetch.js";
import type * as lib_githubConnector from "../lib/githubConnector.js";
import type * as lib_identityAssertion from "../lib/identityAssertion.js";
import type * as lib_pageDomain from "../lib/pageDomain.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_recipeDomain from "../lib/recipeDomain.js";
import type * as lib_recipeSchedule from "../lib/recipeSchedule.js";
import type * as lib_recipeState from "../lib/recipeState.js";
import type * as lib_recipeTransport from "../lib/recipeTransport.js";
import type * as lib_recordCounts from "../lib/recordCounts.js";
import type * as lib_recordPublication from "../lib/recordPublication.js";
import type * as lib_recordQuery from "../lib/recordQuery.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_references from "../lib/references.js";
import type * as lib_savedQueries from "../lib/savedQueries.js";
import type * as lib_secretDomain from "../lib/secretDomain.js";
import type * as lib_secretService from "../lib/secretService.js";
import type * as lib_sourceSync from "../lib/sourceSync.js";
import type * as pages from "../pages.js";
import type * as recipeExecution from "../recipeExecution.js";
import type * as recipeHttp from "../recipeHttp.js";
import type * as recipeRunner from "../recipeRunner.js";
import type * as recipes from "../recipes.js";
import type * as recordCounts from "../recordCounts.js";
import type * as reportCounts from "../reportCounts.js";
import type * as runRetention from "../runRetention.js";
import type * as savedQueries from "../savedQueries.js";
import type * as secretSettings from "../secretSettings.js";
import type * as secretSettingsLookup from "../secretSettingsLookup.js";
import type * as secrets from "../secrets.js";
import type * as sourceSyncs from "../sourceSyncs.js";
import type * as workspaceBudgets from "../workspaceBudgets.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentAccess: typeof agentAccess;
  agentActivity: typeof agentActivity;
  agentDiscoveryHttp: typeof agentDiscoveryHttp;
  agentGrants: typeof agentGrants;
  agentIdentityHttp: typeof agentIdentityHttp;
  agentPages: typeof agentPages;
  agentQueries: typeof agentQueries;
  agentRecipeHttp: typeof agentRecipeHttp;
  agentRecipes: typeof agentRecipes;
  agentRegistrations: typeof agentRegistrations;
  agentWrites: typeof agentWrites;
  artifactBindings: typeof artifactBindings;
  artifactUsage: typeof artifactUsage;
  artifacts: typeof artifacts;
  auditEvents: typeof auditEvents;
  collectionSchemas: typeof collectionSchemas;
  connectors: typeof connectors;
  crons: typeof crons;
  http: typeof http;
  "lib/agentActivityTransport": typeof lib_agentActivityTransport;
  "lib/agentAuthConfig": typeof lib_agentAuthConfig;
  "lib/agentAuthCrypto": typeof lib_agentAuthCrypto;
  "lib/agentAuthDiscovery": typeof lib_agentAuthDiscovery;
  "lib/agentCapabilities": typeof lib_agentCapabilities;
  "lib/agentCollectionTransport": typeof lib_agentCollectionTransport;
  "lib/agentGrant": typeof lib_agentGrant;
  "lib/agentPageTransport": typeof lib_agentPageTransport;
  "lib/agentQueryTransport": typeof lib_agentQueryTransport;
  "lib/agentRecipeTransport": typeof lib_agentRecipeTransport;
  "lib/agentRegistration": typeof lib_agentRegistration;
  "lib/agentRequests": typeof lib_agentRequests;
  "lib/agentRoute": typeof lib_agentRoute;
  "lib/agentScope": typeof lib_agentScope;
  "lib/artifactBindingDomain": typeof lib_artifactBindingDomain;
  "lib/artifactDomain": typeof lib_artifactDomain;
  "lib/artifactPreview": typeof lib_artifactPreview;
  "lib/artifactUsage": typeof lib_artifactUsage;
  "lib/auditEvents": typeof lib_auditEvents;
  "lib/auth": typeof lib_auth;
  "lib/budgets": typeof lib_budgets;
  "lib/collectionDomain": typeof lib_collectionDomain;
  "lib/collectionSchemas": typeof lib_collectionSchemas;
  "lib/collectionTemplates": typeof lib_collectionTemplates;
  "lib/connectorFetch": typeof lib_connectorFetch;
  "lib/githubConnector": typeof lib_githubConnector;
  "lib/identityAssertion": typeof lib_identityAssertion;
  "lib/pageDomain": typeof lib_pageDomain;
  "lib/r2": typeof lib_r2;
  "lib/recipeDomain": typeof lib_recipeDomain;
  "lib/recipeSchedule": typeof lib_recipeSchedule;
  "lib/recipeState": typeof lib_recipeState;
  "lib/recipeTransport": typeof lib_recipeTransport;
  "lib/recordCounts": typeof lib_recordCounts;
  "lib/recordPublication": typeof lib_recordPublication;
  "lib/recordQuery": typeof lib_recordQuery;
  "lib/records": typeof lib_records;
  "lib/references": typeof lib_references;
  "lib/savedQueries": typeof lib_savedQueries;
  "lib/secretDomain": typeof lib_secretDomain;
  "lib/secretService": typeof lib_secretService;
  "lib/sourceSync": typeof lib_sourceSync;
  pages: typeof pages;
  recipeExecution: typeof recipeExecution;
  recipeHttp: typeof recipeHttp;
  recipeRunner: typeof recipeRunner;
  recipes: typeof recipes;
  recordCounts: typeof recordCounts;
  reportCounts: typeof reportCounts;
  runRetention: typeof runRetention;
  savedQueries: typeof savedQueries;
  secretSettings: typeof secretSettings;
  secretSettingsLookup: typeof secretSettingsLookup;
  secrets: typeof secrets;
  sourceSyncs: typeof sourceSyncs;
  workspaceBudgets: typeof workspaceBudgets;
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
