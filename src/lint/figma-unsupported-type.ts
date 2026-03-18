import type { LintRule } from '@terrazzo/parser';
import { SUPPORTED_TYPES, UNSUPPORTED_TYPES } from '../constants.js';

/**
 * Lint rule that warns when tokens have $type values that are not supported by Figma.
 *
 * Unsupported types (transition, strokeStyle, cubicBezier) will be dropped
 * during transformation. Unknown types (not in either supported or known-unsupported
 * lists) will also be flagged.
 *
 * Users opt in via config:
 * ```ts
 * lint: { rules: { 'figma/unsupported-type': 'warn' } }
 * ```
 */
const figmaUnsupportedType: LintRule<'unsupported' | 'unknown'> = {
  meta: {
    messages: {
      unsupported:
        'Token "{{id}}" has $type "{{type}}" which is not supported by Figma and will be skipped. Consider excluding it or using a supported type.',
      unknown:
        'Token "{{id}}" has $type "{{type}}" which is not recognized. It will be skipped during Figma JSON generation.',
    },
  },
  defaultOptions: {},
  create(context) {
    for (const [id, token] of Object.entries(context.tokens)) {
      const type = token.$type;
      if (!type) {
        continue;
      }

      if (SUPPORTED_TYPES.includes(type as (typeof SUPPORTED_TYPES)[number])) {
        continue;
      }

      const isKnownUnsupported = UNSUPPORTED_TYPES.includes(type as (typeof UNSUPPORTED_TYPES)[number]);

      context.report({
        messageId: isKnownUnsupported ? 'unsupported' : 'unknown',
        node: token.source?.node,
        data: { id, type },
      });
    }
  },
};

export default figmaUnsupportedType;
