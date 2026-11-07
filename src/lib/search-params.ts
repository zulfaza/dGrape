import { Effect, Schema } from "effect"

/**
 * A search parameter that holds one text value. A link can omit it or
 * hold a value of a different kind (the router parses `?token=123` as a
 * number). In both cases it decodes to `""`, so a route reads a string
 * and treats `""` as "not given".
 */
export const SearchText = Schema.String.pipe(
  Schema.catchDecoding(() => Effect.succeedSome("")),
  Schema.withDecodingDefaultKey(Effect.succeed(""))
)
