/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as campus from "../campus.js";
import type * as catalog from "../catalog.js";
import type * as clubs from "../clubs.js";
import type * as config from "../config.js";
import type * as courses from "../courses.js";
import type * as dms from "../dms.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as home from "../home.js";
import type * as lib_anon from "../lib/anon.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_karma from "../lib/karma.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_serialize from "../lib/serialize.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as qa from "../qa.js";
import type * as resources from "../resources.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as spaces from "../spaces.js";
import type * as study from "../study.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  campus: typeof campus;
  catalog: typeof catalog;
  clubs: typeof clubs;
  config: typeof config;
  courses: typeof courses;
  dms: typeof dms;
  events: typeof events;
  files: typeof files;
  home: typeof home;
  "lib/anon": typeof lib_anon;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/karma": typeof lib_karma;
  "lib/password": typeof lib_password;
  "lib/permissions": typeof lib_permissions;
  "lib/serialize": typeof lib_serialize;
  messages: typeof messages;
  notifications: typeof notifications;
  qa: typeof qa;
  resources: typeof resources;
  search: typeof search;
  seed: typeof seed;
  spaces: typeof spaces;
  study: typeof study;
  users: typeof users;
  voice: typeof voice;
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
