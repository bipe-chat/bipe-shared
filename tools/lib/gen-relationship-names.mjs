// ADR 0018. The source adapter must supply an authenticated verified name, never a profile display name.
// The rule runs in bipe-core (relationship_name_warning, bipe-chat/bipe#1450); this wrapper keeps the app API.
export function generateRelationshipNames(registry, language, header, packageName) {
  if (language === "swift") return `${header}
import BipeCore
import Foundation

public nonisolated enum BipeRelationshipNames {
    /// nil: no known discrepancy; mismatch: differing full name; confirm: an unconfirmed family label or nickname.
    public static func warning(savedName: String?, verifiedName: String?, nicknameConfirmed: Bool = false) -> String? {
        relationshipNameWarning(savedName: savedName, verifiedName: verifiedName, nicknameConfirmed: nicknameConfirmed).map { warning in
            switch warning {
            case .mismatch: "mismatch"
            case .confirm: "confirm"
            }
        }
    }
}
`;
  if (language !== "kotlin") throw new Error("unsupported relationship-names language");
  return `${header}
package ${packageName}

import chat.bipe.core.RelationshipNameWarning
import chat.bipe.core.relationshipNameWarning

object BipeRelationshipNames {
    /** null: no known discrepancy; mismatch: differing full name; confirm: unconfirmed family label or nickname. */
    fun warning(savedName: String?, verifiedName: String?, nicknameConfirmed: Boolean = false): String? =
        when (relationshipNameWarning(savedName, verifiedName, nicknameConfirmed)) {
            RelationshipNameWarning.MISMATCH -> "mismatch"
            RelationshipNameWarning.CONFIRM -> "confirm"
            null -> null
        }
}
`;
}
