// ADR 0018. The source adapter must supply an authenticated verified name, never a profile display name.
export function generateRelationshipNames(registry, language, header, packageName) {
  const minimum = registry.fullNameMinimumWords;
  if (language === "swift") return `${header}
import Foundation

public nonisolated enum BipeRelationshipNames {
    /// nil: no known discrepancy; mismatch: differing full name; confirm: an unconfirmed family label or nickname.
    public static func warning(savedName: String?, verifiedName: String?, nicknameConfirmed: Bool = false) -> String? {
        guard let savedName, let verifiedName else { return nil }
        let saved = NameNormalizer.normalize(savedName)
        let verified = NameNormalizer.normalize(verifiedName)
        guard !saved.isEmpty, !verified.isEmpty, saved != verified else { return nil }
        let words = saved.split(separator: " ").filter { $0.unicodeScalars.contains { CharacterSet.letters.contains($0) } }
        let padded = " " + saved.replacingOccurrences(of: "[^0-9a-z]+", with: " ", options: .regularExpression) + " "
        let family = BipeRegistries.familyTerms.contains { padded.contains(" " + $0 + " ") }
        if words.count >= ${minimum} && !family { return "mismatch" }
        return nicknameConfirmed ? nil : "confirm"
    }
}
`;
  if (language !== "kotlin") throw new Error("unsupported relationship-names language");
  const parent = packageName.slice(0, -".generated".length);
  return `${header}
package ${packageName}

import ${parent}.NameNormalizer

object BipeRelationshipNames {
    /** null: no known discrepancy; mismatch: differing full name; confirm: unconfirmed family label or nickname. */
    fun warning(savedName: String?, verifiedName: String?, nicknameConfirmed: Boolean = false): String? {
        if (savedName == null || verifiedName == null) return null
        val saved = NameNormalizer.normalize(savedName)
        val verified = NameNormalizer.normalize(verifiedName)
        if (saved.isEmpty() || verified.isEmpty() || saved == verified) return null
        val words = saved.split(' ').filter { word -> word.codePoints().anyMatch { Character.isLetter(it) } }
        val padded = " " + saved.replace(Regex("[^0-9a-z]+"), " ") + " "
        val family = BipeRegistries.familyTerms.any { padded.contains(" $it ") }
        if (words.size >= ${minimum} && !family) return "mismatch"
        return if (nicknameConfirmed) null else "confirm"
    }
}
`;
}
