/**
 * Parses one entry of the `config` field's flattened 422 messages
 * (`AvatarTemplateController.php:234-239`: `ValidationException::withMessages
 * (['config' => ["{$key}: {$code}", ...]])`) — a SINGLE `config` key holding N
 * strings, not per-knob server keys, because `ConfigValidator::validate`
 * returns a `list<array{key, code}>` and the controller flattens it.
 *
 * The API's own comment names this file (and this file names the API's) so
 * a reformat on either side is not a silent drift.
 *
 * Splits at the FIRST `": "` only, matching every code the validator emits
 * today (`required`/`type`/`range`/`enum`/`unknown` — none contain a colon),
 * so a key or code that later did contain `": "` still splits the way the
 * server intended (key, then the rest).
 */
export interface ParsedConfigError {
  key: string
  code: string
}

export function parseConfigError(message: string): ParsedConfigError | null {
  const separatorIndex = message.indexOf(': ')
  if (separatorIndex === -1) return null

  return {
    key: message.slice(0, separatorIndex),
    code: message.slice(separatorIndex + 2),
  }
}
