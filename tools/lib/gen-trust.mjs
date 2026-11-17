// The app types of registries/trust-facts.json. The rules run in bipe-core (trust_facts, compiled by gen-rust.mjs,
// bipe-chat/bipe#1478); these wrappers keep the app API.
export function generateTrust(registry, language, header) {
  const swift = language === 'swift';
  const fieldType = (type) => ({ string: 'String?', boolean: swift ? 'Bool?' : 'Boolean?', time: 'Double?' })[type];
  const fields = Object.entries(registry.inputFields);
  const results = Object.keys(registry.outputs);
  const outputType = (name) => ['verifiedName', 'warningKind'].includes(name) ? 'String?' : 'String';
  if (swift) return `${header}
import BipeCore
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
        let facts = trustFacts(input: TrustInput(
${fields.map(([name]) => `            ${name}: input.${name}`).join(',\n')}
        ))
        return BipeTrustFacts(
${results.map((name) => `            ${name}: facts.${name}`).join(',\n')}
        )
    }
}
`;
  return `${header}
package chat.bipe.shared.generated

import chat.bipe.core.TrustInput
import chat.bipe.core.trustFacts
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
            val facts = trustFacts(TrustInput(
${fields.map(([name]) => `                ${name} = input.${name},`).join('\n')}
            ))
            return BipeTrustFacts(
${results.map((name) => `                ${name} = facts.${name},`).join('\n')}
            )
        }
    }
}
`;
}
