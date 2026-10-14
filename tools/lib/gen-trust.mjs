// Compiles the same registry expressions for Swift and Kotlin. Platform files contain no hand-maintained policy.
export function generateTrust(registry, language, header) {
  const swift = language === 'swift';
  const fieldType = (type) => ({ string: 'String?', boolean: swift ? 'Bool?' : 'Boolean?', time: 'Double?' })[type];
  const literal = (value) => value === null ? (swift ? 'nil' : 'null') : JSON.stringify(value);
  const expression = (node) => {
    if (node === null || typeof node !== 'object') return literal(node);
    const [op, value] = Object.entries(node)[0];
    if (op === 'field') return `input.${value}`;
    if (op === 'rule') return value;
    if (op === 'all' || op === 'any') return '(' + value.map(expression).join(op === 'all' ? ' && ' : ' || ') + ')';
    if (op === 'not') return `!(${expression(value)})`;
    if (['eq', 'neq'].includes(op)) return `(${expression(value[0])} ${op === 'eq' ? '==' : '!='} ${expression(value[1])})`;
    if (['afterChange', 'atOrBefore'].includes(op)) return `${op}(${value.map(expression).join(', ')})`;
    return `${op}(${expression(value)})`;
  };
  const outputExpression = (output) => output.choose.reduceRight((next, branch) => swift
    ? `(${expression(branch.when)} ? ${expression(branch.value)} : ${next})`
    : `(if (${expression(branch.when)}) ${expression(branch.value)} else ${next})`, expression(output.else));
  const fields = Object.entries(registry.inputFields);
  const results = Object.keys(registry.outputs);
  const outputType = (name) => ['verifiedName', 'warningKind'].includes(name) ? 'String?' : 'String';
  const ruleIndent = swift ? '        ' : '            ';
  const outputIndent = swift ? '            ' : '                ';
  const rules = Object.entries(registry.rules).map(([name, expr]) => `${ruleIndent}${swift ? 'let' : 'val'} ${name} = ${expression(expr)}`).join('\n');
  const outputs = results.map((name) => `${outputIndent}${name}${swift ? ':' : ' ='} ${outputExpression(registry.outputs[name])}`).join(',\n');
  if (swift) return `${header}
import Foundation

public nonisolated struct BipeTrustInput: Codable, Equatable, Sendable {
${fields.map(([name, type]) => `    public var ${name}: ${fieldType(type)}`).join('\n')}

    public init(
${fields.map(([name, type]) => `        ${name}: ${fieldType(type)} = nil`).join(',\n')}
    ) {
${fields.map(([name]) => `        self.${name} = ${name}`).join('\n')}
    }
}

public nonisolated struct BipeTrustFacts: Codable, Equatable, Sendable {
${results.map((name) => `    public let ${name}: ${outputType(name)}`).join('\n')}

    public static func evaluate(_ input: BipeTrustInput) -> BipeTrustFacts {
${rules}
        return BipeTrustFacts(
${outputs}
        )
    }

    private static func nonempty(_ value: String?) -> Bool { value.map { !$0.isEmpty } ?? false }
    private static func validTime(_ value: Double?) -> Bool { value.map { $0.isFinite && $0 >= 0 } ?? false }
    private static func nullableTime(_ value: Double?) -> Bool { value == nil || validTime(value) }
    private static func afterChange(_ proof: Double?, _ change: Double?) -> Bool {
        guard let proof, validTime(proof) else { return false }
        guard let change else { return true }
        return validTime(change) && proof > change
    }
    private static func atOrBefore(_ first: Double?, _ second: Double?) -> Bool {
        guard let first, let second, validTime(first), validTime(second) else { return false }
        return first <= second
    }
}
`;
  return `/*
 * Copyright 2026 Bipe.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

${header}
package io.element.android.libraries.bipe.generated

import kotlinx.serialization.Serializable

@Serializable
data class BipeTrustInput(
${fields.map(([name, type]) => `    val ${name}: ${fieldType(type)} = null`).join(',\n')},
)

@Serializable
data class BipeTrustFacts(
${results.map((name) => `    val ${name}: ${outputType(name)}`).join(',\n')},
) {
    companion object {
        fun evaluate(input: BipeTrustInput): BipeTrustFacts {
${rules}
            return BipeTrustFacts(
${outputs}
            )
        }

        private fun nonempty(value: String?): Boolean = value?.isNotEmpty() == true
        private fun validTime(value: Double?): Boolean = value != null && value.isFinite() && value >= 0
        private fun nullableTime(value: Double?): Boolean = value == null || validTime(value)
        private fun afterChange(proof: Double?, change: Double?): Boolean =
            validTime(proof) && (change == null || (validTime(change) && proof!! > change))
        private fun atOrBefore(first: Double?, second: Double?): Boolean =
            validTime(first) && validTime(second) && first!! <= second!!
    }
}
`;
}
