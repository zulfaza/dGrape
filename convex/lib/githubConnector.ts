import type { FetchRoute } from "./connectorFetch"

/**
 * Trusted GitHub read-only connector. Code, not stored config, owns the origin,
 * the GET routes, their fixed queries and safe fields. The token is resolved by
 * the connector boundary and only sent as a Bearer header to this origin.
 *
 * Recipes name a read by its `id`. Each read pages with the Link header, so a
 * cursor is a GitHub `rel="next"` URL on the same route.
 */
export const githubOrigin = "https://api.github.com"
export const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "dGrape-connector",
} satisfies Record<string, string>
const issueFields = [
  "id",
  "number",
  "title",
  "state",
  "draft",
  "html_url",
  "repository_url",
  "comments",
  "created_at",
  "updated_at",
  "closed_at",
]
/**
 * `@me` makes GitHub resolve the token owner, so no user name is stored.
 * Pages stay small so a page fits the recipe byte budget (500 kB at most).
 */
function search(id: string, q: string, next: "link" | "none"): FetchRoute {
  return {
    id,
    path: "/search/issues",
    method: "GET",
    queryKeys: ["page"],
    query: { q, sort: "updated", order: "desc", per_page: "50" },
    fields: issueFields,
    response: { rows: ["items"], next: { kind: next } },
  }
}
export const githubRoutes: FetchRoute[] = [
  search("authored_pull_requests", "is:pr author:@me", "link"),
  /** One page: the 50 most recently updated. A recipe can sync it on a schedule. */
  search("recent_authored_pull_requests", "is:pr author:@me", "none"),
  search(
    "review_requested_pull_requests",
    "is:pr is:open review-requested:@me",
    "link"
  ),
  search("assigned_issues", "is:issue is:open assignee:@me", "link"),
  {
    id: "repositories",
    path: "/user/repos",
    method: "GET",
    queryKeys: ["page"],
    query: { sort: "updated", per_page: "30" },
    fields: [
      "id",
      "name",
      "full_name",
      "html_url",
      "private",
      "fork",
      "archived",
      "language",
      "stargazers_count",
      "forks_count",
      "open_issues_count",
      "pushed_at",
      "updated_at",
    ],
    response: { rows: [], next: { kind: "link" } },
  },
]
