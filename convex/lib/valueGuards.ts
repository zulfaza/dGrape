import { Schema } from "effect"

/**
 * Guards that tell apart the members of a value union, such as a record
 * value (text, number, boolean, list of options, or object) or a JSON value.
 * Each guard is an Effect Schema check, so it accepts exactly the values of
 * that schema. Parse external input at its boundary first; these guards only
 * branch on values whose union is already known.
 */

export const isText = Schema.is(Schema.String)
/** Any number, NaN and the infinities included. */
export const isNumber = Schema.is(Schema.Number)
export const isBoolean = Schema.is(Schema.Boolean)
/** Any object that is not an array or null. Its members are not checked. */
export const isPlainObject = Schema.is(
  Schema.Record(Schema.String, Schema.Unknown)
)

/** True for NaN and the infinities: values that JSON cannot keep. */
export function isNonFiniteNumber<I>(value: I): boolean {
  return isNumber(value) && !Number.isFinite(value)
}

type Scalar = string | number | boolean

/** True when two scalars have the same type, so they compare by value. */
export function sameScalarType(a: Scalar, b: Scalar): boolean {
  return (
    (isText(a) && isText(b)) ||
    (isNumber(a) && isNumber(b)) ||
    (isBoolean(a) && isBoolean(b))
  )
}
